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
  type SourceTranscript,
  type TranscriptWordTiming
} from "@cevra/project-ir";
import {
  isTranscriptionIdentityProvider,
  type SourceContentIdentity,
  type SourceContentIdentityProvider,
  type TranscriptCachePolicy,
  type TranscriptCacheStatus,
  type TranscriptResultCache,
  type TranscriptionCacheKey
} from "./transcript-cache.js";

export type TranscriptionApplicationErrorCode =
  | "TRANSCRIPTION_APP_INVALID_REQUEST" | "TRANSCRIPTION_APP_SOURCE_UNKNOWN"
  | "TRANSCRIPTION_APP_SOURCE_INELIGIBLE" | "TRANSCRIPTION_APP_PROJECT_CONFLICT"
  | "TRANSCRIPTION_APP_ENGINE_FAILED" | "TRANSCRIPTION_APP_RESULT_INVALID"
  | "TRANSCRIPTION_APP_COMMIT_FAILED" | "TRANSCRIPTION_APP_CANCELLED";

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
  sourceId: string; id?: string; locale?: CevraLocale; language?: "auto" | "pt" | "en";
  wordTimestamps?: boolean; actor?: JournalActor; cachePolicy?: TranscriptCachePolicy;
}
export interface TranscribeSourceOutcome {
  executionId: string; sourceId: string; result: TranscriptionResult; sourceTranscript: SourceTranscript;
  project: ProjectIR; cacheStatus: TranscriptCacheStatus; historyMutated: boolean;
}
export interface TranscriptionApplicationServiceOptions {
  engine: TranscriptionEngineAdapter; history: ProjectHistory; cache?: TranscriptResultCache;
  sourceIdentity?: SourceContentIdentityProvider; clock?: () => string; idGenerator?: () => string;
}
interface NormalizedRequest {
  sourceId: string; locale: CevraLocale; language: "auto" | "pt" | "en"; wordTimestamps: boolean;
  actor: JournalActor; cachePolicy: TranscriptCachePolicy;
}

export class TranscriptionApplicationService {
  private readonly engine: TranscriptionEngineAdapter;
  private readonly history: ProjectHistory;
  private readonly cache: TranscriptResultCache | undefined;
  private readonly sourceIdentity: SourceContentIdentityProvider | undefined;
  private readonly clock: () => string;
  private readonly idGenerator: () => string;

  constructor(options: TranscriptionApplicationServiceOptions) {
    this.engine = options.engine; this.history = options.history; this.cache = options.cache;
    this.sourceIdentity = options.sourceIdentity; this.clock = options.clock ?? (() => new Date().toISOString());
    this.idGenerator = options.idGenerator ?? defaultId;
  }

  async transcribeSource(request: TranscribeSourceRequest, signal?: AbortSignal): Promise<TranscribeSourceOutcome> {
    const before = this.history.current;
    const record = isRecord(request) ? request : undefined;
    const locale = isLocale(record?.locale) ? record.locale : before.project.defaultLocale;
    const executionId = this.executionId(record, locale);
    const normalized = validateRequest(record, locale, executionId);
    const source = before.sources.find((item) => item.id === normalized.sourceId);
    if (!source) throw appError("TRANSCRIPTION_APP_SOURCE_UNKNOWN", locale, executionId);
    if (source.kind !== "audio" && source.kind !== "video") throw appError("TRANSCRIPTION_APP_SOURCE_INELIGIBLE", locale, executionId);
    const current = before.sourceTranscripts.find((item) => item.sourceId === source.id);
    const beforeMarker = { projectId: before.project.id, revision: before.history.revision, snapshot: before.history.headSnapshotId };
    assertNotCancelled(signal, locale, executionId);

    let identity: EngineIdentity;
    try { identity = await this.engine.identity(); assertIdentity(identity); }
    catch (cause) { if (isAbort(cause, signal)) throw appError("TRANSCRIPTION_APP_CANCELLED", locale, executionId, cause); throw appError("TRANSCRIPTION_APP_ENGINE_FAILED", locale, executionId, cause); }

    const engineRequest: TranscriptionRequest = { inputUri: source.uri, language: normalized.language, wordTimestamps: normalized.wordTimestamps };
    const identityProvider = isTranscriptionIdentityProvider(this.engine)
      ? this.engine as TranscriptionEngineAdapter & TranscriptionExecutionIdentityProvider : undefined;
    let cacheStatus: TranscriptCacheStatus = "bypass";
    let cacheKey: TranscriptionCacheKey | undefined;
    let sourceBefore: SourceContentIdentity | undefined;
    let executionBefore: TranscriptionExecutionIdentity | undefined;
    if (normalized.cachePolicy !== "bypass" && this.cache && this.sourceIdentity && identityProvider) {
      try {
        [sourceBefore, executionBefore] = await Promise.all([
          this.sourceIdentity.identify(source.uri, signal), identityProvider.describeTranscriptionExecution(engineRequest, signal)
        ]);
      } catch (cause) { if (isAbort(cause, signal)) throw appError("TRANSCRIPTION_APP_CANCELLED", locale, executionId, cause); }
      if (sourceBefore && executionBefore && executionMatches(executionBefore, identity)) {
        cacheKey = { schemaVersion: 1, kind: "transcription", source: sourceBefore, execution: executionBefore, requestedLanguage: normalized.language, wordTimestamps: normalized.wordTimestamps };
        cacheStatus = normalized.cachePolicy === "refresh" ? "refresh" : "miss";
      }
    }

    let result: TranscriptionResult | undefined;
    let candidate: SourceTranscript | undefined;
    let producerExecutionId = executionId;
    let producedAt = this.clock();
    if (normalized.cachePolicy === "prefer" && cacheKey && this.cache) {
      try {
        const cached = await this.cache.read(cacheKey, signal);
        if (cached) {
          try {
            result = validateTranscriptionResult(cached.payload, normalized.wordTimestamps);
            assertResultIdentity(result, executionBefore);
            producerExecutionId = cached.producerExecutionId; producedAt = cached.producedAt;
            candidate = buildCandidate(source.id, source.checksum, result, identity, executionBefore, producerExecutionId, producedAt);
            cacheStatus = "hit";
          } catch { result = undefined; candidate = undefined; await this.cache.invalidate(cacheKey); }
        }
      } catch (cause) { if (isAbort(cause, signal)) throw appError("TRANSCRIPTION_APP_CANCELLED", locale, executionId, cause); }
    }

    if (!result) {
      let rawResult: TranscriptionResult;
      try { rawResult = await this.engine.transcribe(engineRequest, { jobId: executionId, locale, ...(signal ? { signal } : {}) }); }
      catch (cause) { if (isAbort(cause, signal)) throw appError("TRANSCRIPTION_APP_CANCELLED", locale, executionId, cause); throw appError("TRANSCRIPTION_APP_ENGINE_FAILED", locale, executionId, cause); }
      try { result = validateTranscriptionResult(rawResult, normalized.wordTimestamps); assertResultIdentity(result, executionBefore); }
      catch (cause) { throw appError("TRANSCRIPTION_APP_RESULT_INVALID", locale, executionId, cause); }
      try { candidate = buildCandidate(source.id, source.checksum, result, identity, executionBefore, executionId, producedAt); }
      catch (cause) { throw appError("TRANSCRIPTION_APP_RESULT_INVALID", locale, executionId, cause); }
      assertNotCancelled(signal, locale, executionId);
      if (cacheKey && sourceBefore && executionBefore && this.cache && identityProvider) {
        if (!await this.identityStable(source.uri, engineRequest, sourceBefore, executionBefore, identity, identityProvider, signal)) throw appError("TRANSCRIPTION_APP_PROJECT_CONFLICT", locale, executionId);
        try { await this.cache.write(cacheKey, { producerExecutionId: executionId, producedAt, payload: result }, signal); }
        catch (cause) { if (isAbort(cause, signal)) throw appError("TRANSCRIPTION_APP_CANCELLED", locale, executionId, cause); }
      }
    }

    if (!candidate) throw appError("TRANSCRIPTION_APP_RESULT_INVALID", locale, executionId);

    const latest = this.history.current;
    if (latest.project.id !== beforeMarker.projectId || latest.history.revision !== beforeMarker.revision || latest.history.headSnapshotId !== beforeMarker.snapshot) throw appError("TRANSCRIPTION_APP_PROJECT_CONFLICT", locale, executionId);
    assertNotCancelled(signal, locale, executionId);
    if (cacheStatus === "hit" && current && current.transcriptDigest === candidate.transcriptDigest) {
      return { executionId, sourceId: source.id, result: clone(result), sourceTranscript: clone(current), project: latest, cacheStatus, historyMutated: false };
    }
    let project: ProjectIR;
    try { project = this.history.commit({ type: "transcript.set", transcript: candidate, ...(current ? { expectedCurrentTranscriptDigest: current.transcriptDigest } : {}) }, normalized.actor); }
    catch (cause) { throw mapCommitError(cause, locale, executionId); }
    const registered = project.sourceTranscripts.find((item) => item.sourceId === source.id);
    if (!registered) throw appError("TRANSCRIPTION_APP_COMMIT_FAILED", locale, executionId);
    return { executionId, sourceId: source.id, result: clone(result), sourceTranscript: clone(registered), project, cacheStatus, historyMutated: true };
  }

  private async identityStable(uri: string, request: TranscriptionRequest, sourceBefore: SourceContentIdentity, executionBefore: TranscriptionExecutionIdentity, engine: EngineIdentity, provider: TranscriptionExecutionIdentityProvider, signal?: AbortSignal): Promise<boolean> {
    try {
      const [sourceAfter, executionAfter] = await Promise.all([this.sourceIdentity!.identify(uri, signal), provider.describeTranscriptionExecution(request, signal)]);
      return !!sourceAfter && !!executionAfter && executionMatches(executionAfter, engine) && equalJson(sourceBefore, sourceAfter) && equalJson(executionBefore, executionAfter);
    } catch (cause) { if (isAbort(cause, signal)) throw cause; return false; }
  }

  private executionId(request: Record<string, unknown> | undefined, locale: CevraLocale): string {
    try { const value = request?.id === undefined ? this.idGenerator() : request.id; if (typeof value !== "string" || !value.trim()) throw new Error("Execution ID is invalid."); return value; }
    catch (cause) { throw appError("TRANSCRIPTION_APP_INVALID_REQUEST", locale, "transcription-unassigned", cause); }
  }
}

function validateRequest(request: Record<string, unknown> | undefined, locale: CevraLocale, executionId: string): NormalizedRequest {
  try {
    if (!request) throw new Error("Request must be an object.");
    rejectUnexpectedKeys(request, ["sourceId", "id", "locale", "language", "wordTimestamps", "actor", "cachePolicy"], "request");
    if (typeof request.sourceId !== "string" || !request.sourceId.trim()) throw new Error("sourceId is invalid.");
    if (request.id !== undefined && request.id !== executionId) throw new Error("Execution ID is invalid.");
    if (request.locale !== undefined && !isLocale(request.locale)) throw new Error("locale is unsupported.");
    if (request.wordTimestamps !== undefined && typeof request.wordTimestamps !== "boolean") throw new Error("wordTimestamps is invalid.");
    return { sourceId: request.sourceId, locale, language: normalizeLanguage(request.language), wordTimestamps: request.wordTimestamps ?? true, actor: validateActor(request.actor), cachePolicy: normalizeCachePolicy(request.cachePolicy) };
  } catch (cause) { throw appError("TRANSCRIPTION_APP_INVALID_REQUEST", locale, executionId, cause); }
}

export function validateTranscriptionResult(value: unknown, wordTimestamps: boolean): TranscriptionResult {
  if (!isRecord(value)) throw new Error("Result must be an object.");
  rejectUnexpectedKeys(value, ["transcript", "detectedLanguage", "modelId", "durationMs", "wordTiming"], "result");
  if (!isRecord(value.transcript) || !Array.isArray(value.transcript.words) || !Array.isArray(value.transcript.segments)) throw new Error("Transcript is malformed.");
  if (typeof value.modelId !== "string" || !value.modelId.trim()) throw new Error("modelId is invalid.");
  if (value.detectedLanguage !== undefined && (typeof value.detectedLanguage !== "string" || !value.detectedLanguage.trim())) throw new Error("detectedLanguage is invalid.");
  if (value.durationMs !== undefined && (!Number.isSafeInteger(value.durationMs) || (value.durationMs as number) < 0)) throw new Error("durationMs is invalid.");
  if (value.wordTiming !== undefined && value.wordTiming !== "none" && value.wordTiming !== "model") throw new Error("wordTiming is invalid.");
  if (!wordTimestamps && value.transcript.words.length) throw new Error("Unexpected words.");
  if (value.transcript.words.length && value.wordTiming !== "model") throw new Error("Words require model timing.");
  return value as unknown as TranscriptionResult;
}

function buildCandidate(sourceId: string, sourceChecksum: string | undefined, result: TranscriptionResult, engine: EngineIdentity, exact: TranscriptionExecutionIdentity | undefined, producerExecutionId: string, producedAt: string): SourceTranscript {
  const speakerState = deriveTranscriptSpeakerState(result.transcript);
  return createSourceTranscript({
    sourceId, wordTiming: normalizeWordTiming(result), speakerState, transcript: result.transcript,
    provenance: { ...(sourceChecksum !== undefined ? { sourceChecksum } : {}), stages: [{
      kind: "transcription", executionId: producerExecutionId, engineId: engine.id, engineVersion: engine.version,
      engineApiVersion: String(engine.apiVersion), modelId: exact?.modelId ?? result.modelId,
      ...(exact ? { modelRevision: exact.modelRevision, modelDigest: exact.modelArtifactDigest } : {}), createdAt: producedAt
    }] }
  });
}

function validateActor(value: unknown): JournalActor { if (value === undefined) return { type: "user" }; if (!isRecord(value)) throw new Error("actor invalid"); rejectUnexpectedKeys(value, ["type", "id"], "actor"); if (!['user','agent','system'].includes(String(value.type))) throw new Error("actor type invalid"); if (value.id !== undefined && (typeof value.id !== "string" || !value.id.trim())) throw new Error("actor id invalid"); return clone(value) as unknown as JournalActor; }
function assertIdentity(value: unknown): asserts value is EngineIdentity { if (!isRecord(value) || value.kind !== "transcription" || typeof value.id !== "string" || !value.id.trim() || typeof value.version !== "string" || !value.version.trim() || value.apiVersion !== CEVRA_ENGINE_API_VERSION) throw new Error("Engine identity invalid."); }
function mapCommitError(cause: unknown, locale: CevraLocale, id: string): TranscriptionApplicationError { if (cause instanceof ProjectCommandError) { if (["PROJECT_TRANSCRIPT_INVALID", "PROJECT_TRANSCRIPT_DIGEST_MISMATCH"].includes(cause.code)) return appError("TRANSCRIPTION_APP_RESULT_INVALID", locale, id, cause); if (["PROJECT_TRANSCRIPT_STALE", "PROJECT_TRANSCRIPT_ALREADY_EXISTS", "PROJECT_TRANSCRIPT_SOURCE_UNKNOWN", "PROJECT_TRANSCRIPT_SOURCE_INELIGIBLE", "PROJECT_TRANSCRIPT_MISSING"].includes(cause.code)) return appError("TRANSCRIPTION_APP_PROJECT_CONFLICT", locale, id, cause); } return appError("TRANSCRIPTION_APP_COMMIT_FAILED", locale, id, cause); }
function normalizeWordTiming(result: TranscriptionResult): TranscriptWordTiming { return result.transcript.words.length ? "model" : "none"; }
function normalizeLanguage(value: unknown): NormalizedRequest["language"] { if (value === undefined) return "auto"; if (value === "auto" || value === "pt" || value === "en") return value; throw new Error("language unsupported"); }
function normalizeCachePolicy(value: unknown): TranscriptCachePolicy { if (value === undefined) return "prefer"; if (value === "prefer" || value === "refresh" || value === "bypass") return value; throw new Error("cachePolicy unsupported"); }
function executionMatches(value: TranscriptionExecutionIdentity, engine: EngineIdentity): boolean { return value.engineId === engine.id && value.engineVersion === engine.version && value.engineApiVersion === engine.apiVersion; }
function assertResultIdentity(result: TranscriptionResult, identity?: TranscriptionExecutionIdentity): void { if (identity && result.modelId !== identity.resultModelId) throw new Error("Transcription result model identity changed."); }
function rejectUnexpectedKeys(value: Record<string, unknown>, allowed: readonly string[], field: string): void { const extras = Object.keys(value).filter((key) => !allowed.includes(key)); if (extras.length) throw new Error(`${field} has unexpected fields: ${extras.join(", ")}`); }
function equalJson(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function isLocale(value: unknown): value is CevraLocale { return value === "pt-BR" || value === "en-US"; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isAbort(cause: unknown, signal?: AbortSignal): boolean { return signal?.aborted === true || (cause instanceof Error && cause.name === "AbortError"); }
function assertNotCancelled(signal: AbortSignal | undefined, locale: CevraLocale, id: string): void { if (signal?.aborted) throw appError("TRANSCRIPTION_APP_CANCELLED", locale, id, signal.reason); }
function appError(code: TranscriptionApplicationErrorCode, locale: CevraLocale, id: string, cause?: unknown): TranscriptionApplicationError { return new TranscriptionApplicationError(code, locale, id, cause); }
function defaultId(): string { return typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : `transcription_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
