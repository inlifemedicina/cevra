import {
  CEVRA_ENGINE_API_VERSION,
  type EngineIdentity,
  type TranscriptionEngineAdapter,
  type TranscriptionExecutionIdentity,
  type TranscriptionExecutionIdentityProvider,
  type TranscriptionRequest,
  type TranscriptionResult
} from "@cevra/contracts";
import { translate, type CevraLocale, type TranslationKey } from "@cevra/i18n";
import {
  ProjectCommandError,
  createSourceTranscript,
  deriveTranscriptSpeakerState,
  type JournalActor,
  type ProjectHistory,
  type ProjectIR,
  type SourceAsset,
  type SourceTranscript,
  type TranscriptWordTiming
} from "@cevra/project-ir";
import {
  hasTranscriptSourceContinuity,
  isTranscriptionIdentityProvider,
  verifyTranscriptSource,
  type TranscriptCachePolicy,
  type TranscriptCacheStatus,
  type TranscriptResultCache,
  type TranscriptSourceVerificationV1,
  type TranscriptionCacheKey
} from "./transcript-cache.js";
import type { SourceContentIdentityPort } from "./source-technical-descriptor.js";

export type TranscriptionApplicationErrorCode =
  | "TRANSCRIPTION_APP_INVALID_REQUEST"
  | "TRANSCRIPTION_APP_SOURCE_UNKNOWN"
  | "TRANSCRIPTION_APP_SOURCE_INELIGIBLE"
  | "TRANSCRIPTION_APP_PROJECT_CONFLICT"
  | "TRANSCRIPTION_APP_ENGINE_FAILED"
  | "TRANSCRIPTION_APP_RESULT_INVALID"
  | "TRANSCRIPTION_APP_COMMIT_FAILED"
  | "TRANSCRIPTION_APP_CANCELLED";

const ERROR_KEYS: Readonly<Record<TranscriptionApplicationErrorCode, TranslationKey>> = {
  TRANSCRIPTION_APP_INVALID_REQUEST: "transcription.error.invalidRequest",
  TRANSCRIPTION_APP_SOURCE_UNKNOWN: "transcription.error.sourceUnknown",
  TRANSCRIPTION_APP_SOURCE_INELIGIBLE: "transcription.error.sourceIneligible",
  TRANSCRIPTION_APP_PROJECT_CONFLICT: "transcription.error.projectConflict",
  TRANSCRIPTION_APP_ENGINE_FAILED: "transcription.error.engineFailed",
  TRANSCRIPTION_APP_RESULT_INVALID: "transcription.error.resultInvalid",
  TRANSCRIPTION_APP_COMMIT_FAILED: "transcription.error.commitFailed",
  TRANSCRIPTION_APP_CANCELLED: "transcription.error.cancelled"
};

export class TranscriptionApplicationError extends Error {
  readonly cause: unknown;
  constructor(readonly code: TranscriptionApplicationErrorCode, readonly locale: CevraLocale, readonly executionId: string, cause?: unknown) {
    super(translate(locale, ERROR_KEYS[code]));
    this.name = "TranscriptionApplicationError";
    this.cause = cause;
  }
}

export interface TranscribeSourceRequest {
  sourceId: string;
  id?: string;
  locale?: CevraLocale;
  language?: "auto" | "pt" | "en";
  wordTimestamps?: boolean;
  actor?: JournalActor;
  cachePolicy?: TranscriptCachePolicy;
}

export interface TranscribeSourceOutcome {
  executionId: string;
  sourceId: string;
  result: TranscriptionResult;
  sourceTranscript: SourceTranscript;
  project: ProjectIR;
  cacheStatus: TranscriptCacheStatus;
  historyMutated: boolean;
}

export interface TranscriptionApplicationServiceOptions {
  engine: TranscriptionEngineAdapter;
  history: ProjectHistory;
  cache?: TranscriptResultCache;
  sourceIdentity?: SourceContentIdentityPort;
  clock?: () => string;
  idGenerator?: () => string;
}

interface NormalizedRequest {
  sourceId: string;
  locale: CevraLocale;
  language: "auto" | "pt" | "en";
  wordTimestamps: boolean;
  actor: JournalActor;
  cachePolicy: TranscriptCachePolicy;
}

export class TranscriptionApplicationService {
  private readonly engine: TranscriptionEngineAdapter;
  private readonly history: ProjectHistory;
  private readonly cache: TranscriptResultCache | undefined;
  private readonly sourceIdentity: SourceContentIdentityPort | undefined;
  private readonly clock: () => string;
  private readonly idGenerator: () => string;

  constructor(options: TranscriptionApplicationServiceOptions) {
    this.engine = options.engine;
    this.history = options.history;
    this.cache = options.cache;
    this.sourceIdentity = options.sourceIdentity;
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.idGenerator = options.idGenerator ?? defaultId;
  }

  async transcribeSource(request: TranscribeSourceRequest, signal?: AbortSignal): Promise<TranscribeSourceOutcome> {
    const before = this.history.current;
    const requestRecord = snapshotRequest(request);
    const locale = isLocale(requestRecord?.locale) ? requestRecord.locale : before.project.defaultLocale;
    const executionId = this.executionId(requestRecord, locale);
    const normalized = validateRequest(requestRecord, locale, executionId);
    const source = before.sources.find((item) => item.id === normalized.sourceId);
    if (!source) throw appError("TRANSCRIPTION_APP_SOURCE_UNKNOWN", locale, executionId);
    if (source.kind !== "audio" && source.kind !== "video") throw appError("TRANSCRIPTION_APP_SOURCE_INELIGIBLE", locale, executionId);
    const current = before.sourceTranscripts.find((item) => item.sourceId === source.id);
    const binding = {
      projectId: before.project.id,
      revision: before.history.revision,
      snapshotId: before.history.headSnapshotId,
      journalEntryCount: this.history.entries.length,
      sourceUri: source.uri,
      descriptor: source.technicalDescriptor ? clone(source.technicalDescriptor) : undefined
    };
    assertNotCancelled(signal, locale, executionId);

    let identity: EngineIdentity;
    try {
      identity = await this.engine.identity();
      assertIdentity(identity);
    } catch (cause) {
      if (isAbort(cause, signal)) throw appError("TRANSCRIPTION_APP_CANCELLED", locale, executionId, cause);
      throw appError("TRANSCRIPTION_APP_ENGINE_FAILED", locale, executionId, cause);
    }
    assertNotCancelled(signal, locale, executionId);

    const engineRequest: TranscriptionRequest = { inputUri: source.uri, language: normalized.language, wordTimestamps: normalized.wordTimestamps };
    const identityProvider = isTranscriptionIdentityProvider(this.engine)
      ? this.engine as TranscriptionEngineAdapter & TranscriptionExecutionIdentityProvider
      : undefined;
    let sourceBefore: TranscriptSourceVerificationV1 | undefined;
    let executionBefore: TranscriptionExecutionIdentity | undefined;
    let cacheKey: TranscriptionCacheKey | undefined;
    let cacheStatus: TranscriptCacheStatus = "bypass";
    const descriptorRequiresProof = source.technicalDescriptor !== undefined;
    const cacheIdentityRequested = normalized.cachePolicy !== "bypass"
      && this.cache !== undefined
      && this.sourceIdentity !== undefined
      && identityProvider !== undefined;
    if (descriptorRequiresProof && !this.sourceIdentity) {
      throw appError("TRANSCRIPTION_APP_PROJECT_CONFLICT", locale, executionId);
    }
    if (descriptorRequiresProof || cacheIdentityRequested) {
      const [sourceProof, executionProof] = await Promise.allSettled([
        verifyTranscriptSource(this.sourceIdentity!, source.uri, signal),
        cacheIdentityRequested
          ? identityProvider!.describeTranscriptionExecution(engineRequest, signal)
          : Promise.resolve(undefined)
      ]);
      for (const proof of [sourceProof, executionProof]) {
        if (proof.status === "rejected" && isAbort(proof.reason, signal)) {
          throw appError("TRANSCRIPTION_APP_CANCELLED", locale, executionId, proof.reason);
        }
      }
      if (sourceProof.status === "fulfilled") sourceBefore = sourceProof.value;
      else if (descriptorRequiresProof) throw appError("TRANSCRIPTION_APP_PROJECT_CONFLICT", locale, executionId, sourceProof.reason);
      if (executionProof.status === "fulfilled") executionBefore = executionProof.value;
      if (sourceBefore) assertDescriptorMatches(source, sourceBefore, locale, executionId);
      if (cacheIdentityRequested && sourceBefore && executionBefore && executionMatches(executionBefore, identity)) {
        cacheKey = {
          schemaVersion: 1,
          kind: "transcription",
          source: sourceBefore.cacheIdentity,
          execution: executionBefore,
          requestedLanguage: normalized.language,
          wordTimestamps: normalized.wordTimestamps
        };
        cacheStatus = normalized.cachePolicy === "refresh" ? "refresh" : "miss";
      }
    }

    let result: TranscriptionResult | undefined;
    let candidate: SourceTranscript | undefined;
    let producedAt: string | undefined;
    if (normalized.cachePolicy === "prefer" && cacheKey && this.cache) {
      try {
        const cached = await this.cache.read(cacheKey, signal);
        if (cached) {
          try {
            result = validateTranscriptionResult(cached.payload, normalized.wordTimestamps);
            assertResultIdentity(result, executionBefore);
            producedAt = cached.producedAt;
            candidate = buildCandidate(source, result, identity, executionBefore, cached.producerExecutionId, producedAt);
            cacheStatus = "hit";
          } catch {
            result = undefined;
            candidate = undefined;
            await this.cache.invalidate(cacheKey).catch(() => undefined);
          }
        }
      } catch (cause) {
        if (isAbort(cause, signal)) throw appError("TRANSCRIPTION_APP_CANCELLED", locale, executionId, cause);
      }
    }

    if (!result) {
      let rawResult: TranscriptionResult;
      try {
        rawResult = await this.engine.transcribe(engineRequest, { jobId: executionId, locale: normalized.locale, ...(signal ? { signal } : {}) });
      } catch (cause) {
        if (isAbort(cause, signal)) throw appError("TRANSCRIPTION_APP_CANCELLED", locale, executionId, cause);
        throw appError("TRANSCRIPTION_APP_ENGINE_FAILED", locale, executionId, cause);
      }
      assertNotCancelled(signal, locale, executionId);
      try {
        result = validateTranscriptionResult(rawResult, normalized.wordTimestamps);
        assertResultIdentity(result, executionBefore);
        producedAt = this.clock();
        candidate = buildCandidate(source, result, identity, executionBefore, executionId, producedAt);
      } catch (cause) {
        throw appError("TRANSCRIPTION_APP_RESULT_INVALID", locale, executionId, cause);
      }
      if (sourceBefore && this.sourceIdentity && (descriptorRequiresProof || cacheKey)) {
        let sourceAfter: TranscriptSourceVerificationV1 | undefined;
        let executionAfter: TranscriptionExecutionIdentity | undefined;
        try {
          [sourceAfter, executionAfter] = await Promise.all([
            verifyTranscriptSource(this.sourceIdentity, source.uri, signal),
            cacheKey && identityProvider
              ? identityProvider.describeTranscriptionExecution(engineRequest, signal)
              : Promise.resolve(undefined)
          ]);
        } catch (cause) {
          if (isAbort(cause, signal)) throw appError("TRANSCRIPTION_APP_CANCELLED", locale, executionId, cause);
        }
        if (!sourceAfter || !hasTranscriptSourceContinuity(sourceBefore, sourceAfter)) {
          throw appError("TRANSCRIPTION_APP_PROJECT_CONFLICT", locale, executionId);
        }
        assertDescriptorMatches(source, sourceAfter, locale, executionId);
        if (cacheKey) {
          if (!executionBefore || !executionAfter || !sameJson(executionBefore, executionAfter)
            || !executionMatches(executionAfter, identity)) {
            throw appError("TRANSCRIPTION_APP_PROJECT_CONFLICT", locale, executionId);
          }
          try {
            await this.cache!.write(cacheKey, { producerExecutionId: executionId, producedAt, payload: result }, signal);
          } catch (cause) {
            if (isAbort(cause, signal)) throw appError("TRANSCRIPTION_APP_CANCELLED", locale, executionId, cause);
          }
        }
      }
    } else if (cacheStatus === "hit" && sourceBefore && this.sourceIdentity) {
      let sourceState: Awaited<ReturnType<SourceContentIdentityPort["checkSource"]>>;
      try {
        sourceState = await this.sourceIdentity.checkSource(source.uri, sourceBefore.verified.stamp, signal);
      } catch (cause) {
        if (isAbort(cause, signal)) throw appError("TRANSCRIPTION_APP_CANCELLED", locale, executionId, cause);
        sourceState = "changed";
      }
      if (sourceState !== "match") throw appError("TRANSCRIPTION_APP_PROJECT_CONFLICT", locale, executionId);
    }

    if (!result || !candidate || !producedAt) throw appError("TRANSCRIPTION_APP_RESULT_INVALID", locale, executionId);
    const latest = this.history.current;
    const latestSource = latest.sources.find((item) => item.id === source.id);
    if (!sameProjectBinding(latest, latestSource, binding, this.history.entries.length)) {
      throw appError("TRANSCRIPTION_APP_PROJECT_CONFLICT", locale, executionId);
    }
    assertNotCancelled(signal, locale, executionId);
    if (cacheStatus === "hit" && current?.transcriptDigest === candidate.transcriptDigest) {
      return { executionId, sourceId: source.id, result: clone(result), sourceTranscript: clone(current), project: latest, cacheStatus, historyMutated: false };
    }
    let project: ProjectIR;
    try {
      project = this.history.commit({
        type: "transcript.set",
        transcript: candidate,
        ...(current ? { expectedCurrentTranscriptDigest: current.transcriptDigest } : {})
      }, normalized.actor);
    } catch (cause) {
      throw mapCommitError(cause, locale, executionId);
    }
    const registered = project.sourceTranscripts.find((item) => item.sourceId === source.id);
    if (!registered) throw appError("TRANSCRIPTION_APP_COMMIT_FAILED", locale, executionId);
    return { executionId, sourceId: source.id, result: clone(result), sourceTranscript: clone(registered), project, cacheStatus, historyMutated: true };
  }

  private executionId(request: Record<string, unknown> | undefined, locale: CevraLocale): string {
    try {
      const value = request?.id === undefined ? this.idGenerator() : request.id;
      if (typeof value !== "string" || !value.trim()) throw new Error("Transcription execution ID must be non-empty.");
      return value;
    } catch (cause) {
      throw appError("TRANSCRIPTION_APP_INVALID_REQUEST", locale, "transcription-unassigned", cause);
    }
  }
}

function snapshotRequest(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  try {
    const snapshot: Record<string, unknown> = {};
    const optional = new Set(["id", "locale", "language", "wordTimestamps", "actor", "cachePolicy"]);
    for (const key of Object.keys(value)) {
      const field = value[key];
      if (field === undefined && optional.has(key)) continue;
      snapshot[key] = field === undefined ? undefined : clone(field);
    }
    return snapshot;
  } catch {
    return undefined;
  }
}

function validateRequest(request: Record<string, unknown> | undefined, locale: CevraLocale, executionId: string): NormalizedRequest {
  try {
    if (!request) throw new Error("Transcription request must be an object.");
    rejectUnexpectedKeys(request, ["sourceId", "id", "locale", "language", "wordTimestamps", "actor", "cachePolicy"], "request");
    if (typeof request.sourceId !== "string" || !request.sourceId.trim()) throw new Error("sourceId must be non-empty.");
    if (request.id !== undefined && request.id !== executionId) throw new Error("Execution ID is invalid.");
    if (request.locale !== undefined && !isLocale(request.locale)) throw new Error("locale is unsupported.");
    if (request.wordTimestamps !== undefined && typeof request.wordTimestamps !== "boolean") throw new Error("wordTimestamps must be boolean.");
    return {
      sourceId: request.sourceId,
      locale,
      language: normalizeLanguage(request.language),
      wordTimestamps: request.wordTimestamps ?? true,
      actor: validateActor(request.actor),
      cachePolicy: normalizeCachePolicy(request.cachePolicy)
    };
  } catch (cause) {
    throw appError("TRANSCRIPTION_APP_INVALID_REQUEST", locale, executionId, cause);
  }
}

export function validateTranscriptionResult(value: unknown, wordTimestamps: boolean): TranscriptionResult {
  if (!isRecord(value)) throw new Error("Transcription result must be an object.");
  rejectUnexpectedKeys(value, ["transcript", "detectedLanguage", "modelId", "durationMs", "wordTiming"], "result");
  if (!isRecord(value.transcript) || !Array.isArray(value.transcript.words) || !Array.isArray(value.transcript.segments)) throw new Error("Transcript is malformed.");
  if (typeof value.modelId !== "string" || !value.modelId.trim()) throw new Error("modelId is invalid.");
  if (value.detectedLanguage !== undefined && (typeof value.detectedLanguage !== "string" || !value.detectedLanguage.trim())) throw new Error("detectedLanguage is invalid.");
  if (value.durationMs !== undefined && (!Number.isSafeInteger(value.durationMs) || (value.durationMs as number) < 0)) throw new Error("durationMs is invalid.");
  if (value.wordTiming !== undefined && value.wordTiming !== "none" && value.wordTiming !== "model") throw new Error("wordTiming is invalid.");
  if (!wordTimestamps && value.transcript.words.length > 0) throw new Error("Unexpected words.");
  if (value.transcript.words.length > 0 && value.wordTiming !== "model") throw new Error("Words require model timing.");
  return value as unknown as TranscriptionResult;
}

function buildCandidate(source: SourceAsset, result: TranscriptionResult, engine: EngineIdentity, exact: TranscriptionExecutionIdentity | undefined, producerExecutionId: string, producedAt: string): SourceTranscript {
  const speakerState = deriveTranscriptSpeakerState(result.transcript);
  return createSourceTranscript({
    sourceId: source.id,
    wordTiming: normalizeWordTiming(result),
    speakerState,
    transcript: result.transcript,
    provenance: {
      ...(source.checksum !== undefined ? { sourceChecksum: source.checksum } : {}),
      stages: [{
        kind: "transcription",
        executionId: producerExecutionId,
        engineId: engine.id,
        engineVersion: engine.version,
        engineApiVersion: String(engine.apiVersion),
        modelId: exact?.modelId ?? result.modelId,
        ...(exact ? { modelRevision: exact.modelRevision, modelDigest: exact.modelArtifactDigest } : {}),
        createdAt: producedAt
      }]
    }
  });
}

function assertDescriptorMatches(source: SourceAsset, verification: TranscriptSourceVerificationV1, locale: CevraLocale, executionId: string): void {
  const expected = source.technicalDescriptor?.content;
  if (expected && (expected.sha256 !== verification.cacheIdentity.sha256 || expected.sizeBytes !== verification.cacheIdentity.sizeBytes)) {
    throw appError("TRANSCRIPTION_APP_PROJECT_CONFLICT", locale, executionId);
  }
}

function sameProjectBinding(latest: ProjectIR, latestSource: SourceAsset | undefined, expected: {
  projectId: string;
  revision: number;
  snapshotId: string | undefined;
  journalEntryCount: number;
  sourceUri: string;
  descriptor: SourceAsset["technicalDescriptor"];
}, journalEntryCount: number): boolean {
  return latest.project.id === expected.projectId
    && latest.history.revision === expected.revision
    && latest.history.headSnapshotId === expected.snapshotId
    && journalEntryCount === expected.journalEntryCount
    && latestSource?.uri === expected.sourceUri
    && sameJson(latestSource.technicalDescriptor, expected.descriptor);
}

function validateActor(value: unknown): JournalActor {
  if (value === undefined) return { type: "user" };
  if (!isRecord(value)) throw new Error("actor must be an object.");
  rejectUnexpectedKeys(value, ["type", "id"], "actor");
  if (value.type !== "user" && value.type !== "agent" && value.type !== "system") throw new Error("actor.type is unsupported.");
  if (value.id !== undefined && (typeof value.id !== "string" || !value.id.trim())) throw new Error("actor.id is invalid.");
  return clone(value) as unknown as JournalActor;
}

function assertIdentity(value: unknown): asserts value is EngineIdentity {
  if (!isRecord(value) || value.kind !== "transcription" || typeof value.id !== "string" || !value.id.trim()
    || typeof value.version !== "string" || !value.version.trim() || value.apiVersion !== CEVRA_ENGINE_API_VERSION) {
    throw new Error("Transcription engine identity is invalid or incompatible.");
  }
}

function mapCommitError(cause: unknown, locale: CevraLocale, executionId: string): TranscriptionApplicationError {
  if (cause instanceof ProjectCommandError) {
    if (cause.code === "PROJECT_TRANSCRIPT_INVALID" || cause.code === "PROJECT_TRANSCRIPT_DIGEST_MISMATCH") return appError("TRANSCRIPTION_APP_RESULT_INVALID", locale, executionId, cause);
    if (["PROJECT_TRANSCRIPT_STALE", "PROJECT_TRANSCRIPT_ALREADY_EXISTS", "PROJECT_TRANSCRIPT_SOURCE_UNKNOWN", "PROJECT_TRANSCRIPT_SOURCE_INELIGIBLE", "PROJECT_TRANSCRIPT_MISSING"].includes(cause.code)) {
      return appError("TRANSCRIPTION_APP_PROJECT_CONFLICT", locale, executionId, cause);
    }
  }
  return appError("TRANSCRIPTION_APP_COMMIT_FAILED", locale, executionId, cause);
}

function normalizeWordTiming(result: TranscriptionResult): TranscriptWordTiming { return result.transcript.words.length > 0 ? "model" : "none"; }
function normalizeLanguage(value: unknown): NormalizedRequest["language"] {
  if (value === undefined) return "auto";
  if (value === "auto" || value === "pt" || value === "en") return value;
  throw new Error("language is unsupported.");
}
function normalizeCachePolicy(value: unknown): TranscriptCachePolicy {
  if (value === undefined) return "prefer";
  if (value === "prefer" || value === "refresh" || value === "bypass") return value;
  throw new Error("cachePolicy is unsupported.");
}
function executionMatches(value: TranscriptionExecutionIdentity, engine: EngineIdentity): boolean {
  return value.engineId === engine.id && value.engineVersion === engine.version && value.engineApiVersion === engine.apiVersion;
}
function assertResultIdentity(result: TranscriptionResult, identity?: TranscriptionExecutionIdentity): void {
  if (identity && result.modelId !== identity.resultModelId) throw new Error("Transcription result model identity changed.");
}
function rejectUnexpectedKeys(value: Record<string, unknown>, allowed: readonly string[], field: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length > 0) throw new Error(`${field} contains unexpected fields: ${extras.join(", ")}.`);
}
function sameJson(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function isLocale(value: unknown): value is CevraLocale { return value === "pt-BR" || value === "en-US"; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isAbort(cause: unknown, signal?: AbortSignal): boolean { return signal?.aborted === true || (cause instanceof Error && cause.name === "AbortError"); }
function assertNotCancelled(signal: AbortSignal | undefined, locale: CevraLocale, executionId: string): void {
  if (signal?.aborted) throw appError("TRANSCRIPTION_APP_CANCELLED", locale, executionId, signal.reason);
}
function appError(code: TranscriptionApplicationErrorCode, locale: CevraLocale, executionId: string, cause?: unknown): TranscriptionApplicationError {
  return new TranscriptionApplicationError(code, locale, executionId, cause);
}
function defaultId(): string {
  return typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : `transcription_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
