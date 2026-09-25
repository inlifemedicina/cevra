import {
  CEVRA_ENGINE_API_VERSION,
  type AlignmentAudioLease,
  type AlignmentAudioWorkspace,
  type AlignmentEngineAdapter,
  type AlignmentExecutionIdentity,
  type AlignmentExecutionIdentityProvider,
  type AlignmentLanguage,
  type AlignmentRequest,
  type AlignmentResult,
  type EngineIdentity,
  type MediaEngineAdapter
} from "@cevra/contracts";
import { translate, type CevraLocale, type TranslationKey } from "@cevra/i18n";
import {
  ProjectCommandError,
  computeTranscriptDigest,
  createSourceTranscript,
  deriveTranscriptSpeakerState,
  type JournalActor,
  type ProjectHistory,
  type ProjectIR,
  type SourceAsset,
  type SourceTranscript,
  type TranscriptProvenanceStage,
  type TranscriptState
} from "@cevra/project-ir";
import {
  isAlignmentIdentityProvider,
  mediaPreparationIdentity,
  verifyTranscriptSource,
  type AlignmentCacheKey,
  type AlignmentMediaPreparationIdentity,
  type TranscriptCachePolicy,
  type TranscriptCacheStatus,
  type TranscriptResultCache,
  type TranscriptSourceVerificationV1
} from "./transcript-cache.js";
import type { SourceContentIdentityPort } from "./source-technical-descriptor.js";

export type AlignmentApplicationErrorCode =
  | "ALIGNMENT_APP_INVALID_REQUEST"
  | "ALIGNMENT_APP_SOURCE_UNKNOWN"
  | "ALIGNMENT_APP_SOURCE_INELIGIBLE"
  | "ALIGNMENT_APP_TRANSCRIPT_MISSING"
  | "ALIGNMENT_APP_TRANSCRIPT_NOT_ALIGNABLE"
  | "ALIGNMENT_APP_LANGUAGE_UNSUPPORTED"
  | "ALIGNMENT_APP_AUDIO_PREPARATION_FAILED"
  | "ALIGNMENT_APP_AUDIO_CLEANUP_FAILED"
  | "ALIGNMENT_APP_ENGINE_FAILED"
  | "ALIGNMENT_APP_RESULT_INVALID"
  | "ALIGNMENT_APP_PROJECT_CONFLICT"
  | "ALIGNMENT_APP_COMMIT_FAILED"
  | "ALIGNMENT_APP_CANCELLED";

const ERROR_KEYS: Readonly<Record<AlignmentApplicationErrorCode, TranslationKey>> = {
  ALIGNMENT_APP_INVALID_REQUEST: "alignment.error.invalidRequest",
  ALIGNMENT_APP_SOURCE_UNKNOWN: "alignment.error.sourceUnknown",
  ALIGNMENT_APP_SOURCE_INELIGIBLE: "alignment.error.sourceIneligible",
  ALIGNMENT_APP_TRANSCRIPT_MISSING: "alignment.error.transcriptMissing",
  ALIGNMENT_APP_TRANSCRIPT_NOT_ALIGNABLE: "alignment.error.transcriptNotAlignable",
  ALIGNMENT_APP_LANGUAGE_UNSUPPORTED: "alignment.error.languageUnsupported",
  ALIGNMENT_APP_AUDIO_PREPARATION_FAILED: "alignment.error.audioPreparationFailed",
  ALIGNMENT_APP_AUDIO_CLEANUP_FAILED: "alignment.error.audioCleanupFailed",
  ALIGNMENT_APP_ENGINE_FAILED: "alignment.error.engineFailed",
  ALIGNMENT_APP_RESULT_INVALID: "alignment.error.resultInvalid",
  ALIGNMENT_APP_PROJECT_CONFLICT: "alignment.error.projectConflict",
  ALIGNMENT_APP_COMMIT_FAILED: "alignment.error.commitFailed",
  ALIGNMENT_APP_CANCELLED: "alignment.error.cancelled"
};

export class AlignmentApplicationError extends Error {
  readonly cause: unknown;

  constructor(
    readonly code: AlignmentApplicationErrorCode,
    readonly locale: CevraLocale,
    readonly executionId: string,
    cause?: unknown
  ) {
    super(translate(locale, ERROR_KEYS[code]));
    this.name = "AlignmentApplicationError";
    this.cause = cause;
  }
}

export interface AlignSourceRequest {
  sourceId: string;
  id?: string;
  locale?: CevraLocale;
  actor?: JournalActor;
  cachePolicy?: TranscriptCachePolicy;
}

export interface AlignSourceOutcome {
  executionId: string;
  sourceId: string;
  result: AlignmentResult;
  sourceTranscript: SourceTranscript;
  project: ProjectIR;
  cacheStatus: TranscriptCacheStatus;
  historyMutated: boolean;
}

export interface AlignmentApplicationServiceOptions {
  engine: AlignmentEngineAdapter;
  media: MediaEngineAdapter;
  audioWorkspace: AlignmentAudioWorkspace;
  history: ProjectHistory;
  cache?: TranscriptResultCache;
  sourceIdentity?: SourceContentIdentityPort;
  clock?: () => string;
  idGenerator?: () => string;
}

export class AlignmentApplicationService {
  private readonly engine: AlignmentEngineAdapter;
  private readonly media: MediaEngineAdapter;
  private readonly audioWorkspace: AlignmentAudioWorkspace;
  private readonly history: ProjectHistory;
  private readonly cache: TranscriptResultCache | undefined;
  private readonly sourceIdentity: SourceContentIdentityPort | undefined;
  private readonly clock: () => string;
  private readonly idGenerator: () => string;

  constructor(options: AlignmentApplicationServiceOptions) {
    this.engine = options.engine;
    this.media = options.media;
    this.audioWorkspace = options.audioWorkspace;
    this.history = options.history;
    this.cache = options.cache;
    this.sourceIdentity = options.sourceIdentity;
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.idGenerator = options.idGenerator ?? defaultId;
  }

  async alignSource(request: AlignSourceRequest, signal?: AbortSignal): Promise<AlignSourceOutcome> {
    const before = this.history.current;
    const requestRecord = snapshotRequest(request);
    const locale = isLocale(requestRecord?.locale) ? requestRecord.locale : before.project.defaultLocale;
    const executionId = this.executionId(requestRecord, locale);
    const normalized = validateRequest(requestRecord, locale, executionId);
    const source = before.sources.find((item) => item.id === normalized.sourceId);
    if (!source) throw appError("ALIGNMENT_APP_SOURCE_UNKNOWN", locale, executionId);
    if (source.kind !== "audio" && source.kind !== "video") {
      throw appError("ALIGNMENT_APP_SOURCE_INELIGIBLE", locale, executionId);
    }
    const current = before.sourceTranscripts.find((item) => item.sourceId === source.id);
    if (!current) throw appError("ALIGNMENT_APP_TRANSCRIPT_MISSING", locale, executionId);
    if (current.wordTiming === "aligned" || current.transcript.words.length === 0) {
      throw appError("ALIGNMENT_APP_TRANSCRIPT_NOT_ALIGNABLE", locale, executionId);
    }
    const language = normalizeLanguage(current.transcript.language, locale, executionId);
    const inputTranscriptDigest = current.transcriptDigest;
    const projectIdBefore = before.project.id;
    const revisionBefore = before.history.revision;
    const snapshotBefore = before.history.headSnapshotId;
    const journalEntryCountBefore = this.history.entries.length;
    const sourceUriBefore = source.uri;
    const descriptorBefore = source.technicalDescriptor ? clone(source.technicalDescriptor) : undefined;
    assertNotCancelled(signal, locale, executionId);

    let identity: EngineIdentity;
    try {
      identity = await this.engine.identity();
      assertAlignmentIdentity(identity);
    } catch (cause) {
      if (isAbort(cause, signal)) throw appError("ALIGNMENT_APP_CANCELLED", locale, executionId, cause);
      throw appError("ALIGNMENT_APP_ENGINE_FAILED", locale, executionId, cause);
    }
    assertNotCancelled(signal, locale, executionId);

    const identityProvider = isAlignmentIdentityProvider(this.engine)
      ? this.engine as AlignmentEngineAdapter & AlignmentExecutionIdentityProvider : undefined;
    const identityRequest: AlignmentRequest = { inputUri: source.uri, language, transcript: clone(current.transcript) };
    let mediaPreparation: AlignmentMediaPreparationIdentity | undefined;
    let cacheStatus: TranscriptCacheStatus = "bypass";
    let cacheKey: AlignmentCacheKey | undefined;
    let sourceBefore: TranscriptSourceVerificationV1 | undefined;
    let executionBefore: AlignmentExecutionIdentity | undefined;
    if (normalized.cachePolicy !== "bypass" && this.cache && this.sourceIdentity && identityProvider && typeof this.media.identity === "function") {
      const [sourceProof, executionProof, mediaProof] = await Promise.allSettled([
        verifyTranscriptSource(this.sourceIdentity, source.uri, signal),
        identityProvider.describeAlignmentExecution(identityRequest, signal),
        this.media.identity()
      ]);
      for (const proof of [sourceProof, executionProof, mediaProof]) {
        if (proof.status === "rejected" && isAbort(proof.reason, signal)) {
          throw appError("ALIGNMENT_APP_CANCELLED", locale, executionId, proof.reason);
        }
      }
      if (sourceProof.status === "fulfilled") sourceBefore = sourceProof.value;
      else if (source.technicalDescriptor) throw appError("ALIGNMENT_APP_PROJECT_CONFLICT", locale, executionId, sourceProof.reason);
      if (executionProof.status === "fulfilled") executionBefore = executionProof.value;
      if (mediaProof.status === "fulfilled" && mediaProof.value.kind === "media") {
        mediaPreparation = mediaPreparationIdentity(mediaProof.value);
      }
      if (sourceBefore) assertDescriptorMatches(source, sourceBefore, locale, executionId);
      if (sourceBefore && executionBefore && mediaPreparation && alignmentExecutionMatches(executionBefore, identity)) {
        cacheKey = { schemaVersion: 1, kind: "alignment", source: sourceBefore.cacheIdentity, inputTranscriptDigest, language, execution: executionBefore, mediaPreparation };
        cacheStatus = normalized.cachePolicy === "refresh" ? "refresh" : "miss";
      }
    }

    let result: AlignmentResult | undefined;
    let candidate: SourceTranscript | undefined;
    let producerExecutionId = executionId;
    let producedAt: string | undefined;
    if (normalized.cachePolicy === "prefer" && cacheKey && this.cache) {
      try {
        const cached = await this.cache.read(cacheKey, signal);
        if (cached) {
          try {
            result = validateAlignmentResult(cached.payload, current.transcript, language, source.durationMs);
            assertAlignmentResultIdentity(result, executionBefore);
            producerExecutionId = cached.producerExecutionId;
            producedAt = cached.producedAt;
            candidate = buildAlignedCandidate(source.id, current, result, identity, inputTranscriptDigest, producerExecutionId, producedAt);
            cacheStatus = "hit";
          } catch { result = undefined; candidate = undefined; await this.cache.invalidate(cacheKey); }
        }
      } catch (cause) {
        if (isAbort(cause, signal)) throw appError("ALIGNMENT_APP_CANCELLED", locale, executionId, cause);
      }
    }

    let lease: AlignmentAudioLease | undefined;
    try {
      if (!result) try {
        lease = await this.audioWorkspace.acquire(executionId);
        assertLease(lease);
        const mediaResult = await this.media.execute({
          type: "extract-audio",
          inputUri: source.uri,
          outputUri: lease.outputUri,
          audioCodec: "pcm"
        }, { jobId: `${executionId}:audio`, locale, ...(signal ? { signal } : {}) });
        if (mediaResult.type !== "file" || mediaResult.outputUri !== lease.outputUri) {
          throw new Error("Media Runtime did not return the authorized alignment audio artifact.");
        }
      } catch (cause) {
        if (isAbort(cause, signal)) throw appError("ALIGNMENT_APP_CANCELLED", locale, executionId, cause);
        throw appError("ALIGNMENT_APP_AUDIO_PREPARATION_FAILED", locale, executionId, cause);
      }
      assertNotCancelled(signal, locale, executionId);

      if (!result) {
        let rawResult: AlignmentResult;
        try {
          rawResult = await this.engine.align({
            inputUri: lease!.outputUri,
            language,
            transcript: clone(current.transcript)
          }, { jobId: executionId, locale, ...(signal ? { signal } : {}) });
        } catch (cause) {
          if (isAbort(cause, signal)) throw appError("ALIGNMENT_APP_CANCELLED", locale, executionId, cause);
          throw appError("ALIGNMENT_APP_ENGINE_FAILED", locale, executionId, cause);
        }
        assertNotCancelled(signal, locale, executionId);

        const completedLease = lease!;
        lease = undefined;
        try {
          await releaseAudioLease(completedLease);
        } catch (cause) {
          throw appError("ALIGNMENT_APP_AUDIO_CLEANUP_FAILED", locale, executionId, cause);
        }

        try {
          result = validateAlignmentResult(rawResult, current.transcript, language, source.durationMs);
          assertAlignmentResultIdentity(result, executionBefore);
          producedAt = this.clock();
          candidate = buildAlignedCandidate(source.id, current, result, identity, inputTranscriptDigest, executionId, producedAt);
        } catch (cause) {
          throw appError("ALIGNMENT_APP_RESULT_INVALID", locale, executionId, cause);
        }
        if (cacheKey && sourceBefore && executionBefore && this.cache && identityProvider) {
          if (!await alignmentIdentityStable(this.sourceIdentity!, source, identityProvider, identityRequest, sourceBefore, executionBefore, identity, this.media, mediaPreparation!, locale, executionId, signal)) {
            throw appError("ALIGNMENT_APP_PROJECT_CONFLICT", locale, executionId);
          }
          try { await this.cache.write(cacheKey, { producerExecutionId: executionId, producedAt, payload: result }, signal); }
          catch (cause) { if (isAbort(cause, signal)) throw appError("ALIGNMENT_APP_CANCELLED", locale, executionId, cause); }
        }
      } else if (cacheStatus === "hit" && sourceBefore && this.sourceIdentity) {
        let sourceState: Awaited<ReturnType<SourceContentIdentityPort["checkSource"]>>;
        try {
          sourceState = await this.sourceIdentity.checkSource(source.uri, sourceBefore.verified.stamp, signal);
        } catch (cause) {
          if (isAbort(cause, signal)) throw appError("ALIGNMENT_APP_CANCELLED", locale, executionId, cause);
          sourceState = "changed";
        }
        if (sourceState !== "match") throw appError("ALIGNMENT_APP_PROJECT_CONFLICT", locale, executionId);
      }

      if (!result) throw appError("ALIGNMENT_APP_ENGINE_FAILED", locale, executionId);
      if (!candidate || !producedAt) throw appError("ALIGNMENT_APP_RESULT_INVALID", locale, executionId);

      const latest = this.history.current;
      const latestSource = latest.sources.find((item) => item.id === source.id);
      const latestTranscript = latest.sourceTranscripts.find((item) => item.sourceId === source.id);
      if (latest.project.id !== projectIdBefore
        || latest.history.revision !== revisionBefore
        || latest.history.headSnapshotId !== snapshotBefore
        || this.history.entries.length !== journalEntryCountBefore
        || latestSource?.kind !== source.kind
        || latestSource.uri !== sourceUriBefore
        || JSON.stringify(latestSource.technicalDescriptor) !== JSON.stringify(descriptorBefore)
        || latestTranscript?.transcriptDigest !== inputTranscriptDigest) {
        throw appError("ALIGNMENT_APP_PROJECT_CONFLICT", locale, executionId);
      }
      assertNotCancelled(signal, locale, executionId);

      let project: ProjectIR;
      try {
        project = this.history.commit({
          type: "transcript.set",
          transcript: candidate,
          expectedCurrentTranscriptDigest: inputTranscriptDigest
        }, normalized.actor);
      } catch (cause) {
        throw mapCommitError(cause, locale, executionId);
      }
      const registered = project.sourceTranscripts.find((item) => item.sourceId === source.id);
      if (!registered) throw appError("ALIGNMENT_APP_COMMIT_FAILED", locale, executionId);
      return { executionId, sourceId: source.id, result: clone(result), sourceTranscript: clone(registered), project, cacheStatus, historyMutated: true };
    } catch (cause) {
      if (lease) {
        const failedLease = lease;
        lease = undefined;
        try {
          await releaseAudioLease(failedLease);
        } catch (cleanupCause) {
          throw appError("ALIGNMENT_APP_AUDIO_CLEANUP_FAILED", locale, executionId, { operation: cause, cleanup: cleanupCause });
        }
      }
      throw cause;
    }
  }

  private executionId(request: Record<string, unknown> | undefined, locale: CevraLocale): string {
    try {
      const value = request?.id === undefined ? this.idGenerator() : request.id;
      if (typeof value !== "string" || value.trim().length === 0) throw new Error("Alignment execution ID must be non-empty.");
      return value;
    } catch (cause) {
      throw appError("ALIGNMENT_APP_INVALID_REQUEST", locale, "alignment-unassigned", cause);
    }
  }
}

function validateRequest(request: Record<string, unknown> | undefined, locale: CevraLocale, executionId: string): { sourceId: string; actor: JournalActor; cachePolicy: TranscriptCachePolicy } {
  try {
    if (!request) throw new Error("Alignment request must be an object.");
    rejectUnexpectedKeys(request, ["sourceId", "id", "locale", "actor", "cachePolicy"], "request");
    if (typeof request.sourceId !== "string" || request.sourceId.trim().length === 0) throw new Error("sourceId must be non-empty.");
    if (request.id !== undefined && request.id !== executionId) throw new Error("Execution ID is invalid.");
    if (request.locale !== undefined && !isLocale(request.locale)) throw new Error("locale is unsupported.");
    return { sourceId: request.sourceId, actor: validateActor(request.actor), cachePolicy: normalizeCachePolicy(request.cachePolicy) };
  } catch (cause) {
    throw appError("ALIGNMENT_APP_INVALID_REQUEST", locale, executionId, cause);
  }
}

async function alignmentIdentityStable(
  sourceIdentity: SourceContentIdentityPort,
  source: SourceAsset,
  provider: AlignmentExecutionIdentityProvider,
  request: AlignmentRequest,
  sourceBefore: TranscriptSourceVerificationV1,
  executionBefore: AlignmentExecutionIdentity,
  engine: EngineIdentity,
  media: MediaEngineAdapter,
  mediaBefore: AlignmentMediaPreparationIdentity,
  locale: CevraLocale,
  executionId: string,
  signal?: AbortSignal
): Promise<boolean> {
  try {
    const [sourceAfter, executionAfter, mediaAfter] = await Promise.all([
      verifyTranscriptSource(sourceIdentity, source.uri, signal),
      provider.describeAlignmentExecution(request, signal),
      media.identity()
    ]);
    assertDescriptorMatches(source, sourceAfter, locale, executionId);
    return !!executionAfter && alignmentExecutionMatches(executionAfter, engine)
      && sourceBefore.cacheIdentity.sha256 === sourceAfter.cacheIdentity.sha256
      && sourceBefore.cacheIdentity.sizeBytes === sourceAfter.cacheIdentity.sizeBytes
      && JSON.stringify(executionBefore) === JSON.stringify(executionAfter)
      && JSON.stringify(mediaBefore) === JSON.stringify(mediaPreparationIdentity(mediaAfter));
  } catch (cause) {
    if (isAbort(cause, signal)) throw cause;
    return false;
  }
}

function assertDescriptorMatches(
  source: SourceAsset,
  verification: TranscriptSourceVerificationV1,
  locale: CevraLocale,
  executionId: string
): void {
  const expected = source.technicalDescriptor?.content;
  if (expected && (expected.sha256 !== verification.cacheIdentity.sha256
    || expected.sizeBytes !== verification.cacheIdentity.sizeBytes)) {
    throw appError("ALIGNMENT_APP_PROJECT_CONFLICT", locale, executionId);
  }
}

function snapshotRequest(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  try {
    const snapshot: Record<string, unknown> = {};
    for (const key of Object.keys(value)) snapshot[key] = clone(value[key]);
    return snapshot;
  } catch {
    return undefined;
  }
}

function alignmentExecutionMatches(value: AlignmentExecutionIdentity, engine: EngineIdentity): boolean {
  return value.engineId === engine.id && value.engineVersion === engine.version && value.engineApiVersion === engine.apiVersion;
}

function assertAlignmentResultIdentity(result: AlignmentResult, identity?: AlignmentExecutionIdentity): void {
  if (identity && (result.modelId !== identity.modelId || result.modelRevision !== identity.modelRevision || result.modelDigest !== identity.modelDigest)) {
    throw new Error("Alignment result model identity changed.");
  }
}

function normalizeCachePolicy(value: unknown): TranscriptCachePolicy {
  if (value === undefined) return "prefer";
  if (value === "prefer" || value === "refresh" || value === "bypass") return value;
  throw new Error("cachePolicy is unsupported.");
}

function normalizeLanguage(value: string | undefined, locale: CevraLocale, executionId: string): AlignmentLanguage {
  if (value === "pt" || value === "en") return value;
  throw appError("ALIGNMENT_APP_LANGUAGE_UNSUPPORTED", locale, executionId);
}

function validateAlignmentResult(value: unknown, current: TranscriptState, language: AlignmentLanguage, sourceDurationMs?: number): AlignmentResult {
  if (!isRecord(value)) throw new Error("Alignment result must be an object.");
  rejectUnexpectedKeys(value, ["transcript", "modelId", "modelRevision", "modelDigest", "durationMs"], "result");
  if (!isRecord(value.transcript)) throw new Error("Alignment transcript is malformed.");
  rejectUnexpectedKeys(value.transcript, ["language", "words", "segments"], "result.transcript");
  if (value.transcript.language !== language || !Array.isArray(value.transcript.words) || !Array.isArray(value.transcript.segments)) {
    throw new Error("Alignment transcript language or collections are invalid.");
  }
  for (const key of ["modelId", "modelRevision", "modelDigest"] as const) {
    if (key === "modelId" && (typeof value[key] !== "string" || !(value[key] as string).trim())) throw new Error("modelId is required.");
    if (value[key] !== undefined && (typeof value[key] !== "string" || !(value[key] as string).trim())) throw new Error(`${key} is invalid.`);
  }
  if (value.durationMs !== undefined && (!isCanonicalInteger(value.durationMs) || value.durationMs < 0)) throw new Error("durationMs is invalid.");
  if (value.transcript.words.length !== current.words.length || value.transcript.segments.length !== current.segments.length) {
    throw new Error("Alignment result is partial.");
  }
  let previousWordEnd = 0;
  const words = value.transcript.words.map((raw, index) => {
    if (!isRecord(raw)) throw new Error(`Word ${index} is malformed.`);
    rejectUnexpectedKeys(raw, ["id", "text", "startMs", "endMs", "confidence", "speakerId"], `word ${index}`);
    const prior = current.words[index]!;
    for (const field of ["id", "text", "confidence", "speakerId"] as const) {
      if (!sameOptional(raw[field], prior[field])) throw new Error(`Alignment changed word ${index} ${field}.`);
    }
    if (!isCanonicalInteger(raw.startMs) || !isCanonicalInteger(raw.endMs) || raw.startMs < 0 || raw.endMs <= raw.startMs) {
      throw new Error(`Word ${index} timing is invalid.`);
    }
    if (sourceDurationMs !== undefined && raw.endMs > sourceDurationMs) throw new Error(`Word ${index} exceeds source duration.`);
    if (index > 0 && raw.startMs < previousWordEnd) throw new Error(`Word ${index} crosses the prior canonical word.`);
    previousWordEnd = raw.endMs;
    return clone(raw) as unknown as TranscriptState["words"][number];
  });
  const wordById = new Map(words.map((word) => [word.id, word]));
  let previousSegmentEnd = 0;
  const segments = value.transcript.segments.map((raw, index) => {
    if (!isRecord(raw)) throw new Error(`Segment ${index} is malformed.`);
    rejectUnexpectedKeys(raw, ["id", "text", "startMs", "endMs", "wordIds", "speakerId"], `segment ${index}`);
    const prior = current.segments[index]!;
    for (const field of ["id", "text", "speakerId"] as const) {
      if (!sameOptional(raw[field], prior[field])) throw new Error(`Alignment changed segment ${index} ${field}.`);
    }
    if (!Array.isArray(raw.wordIds) || raw.wordIds.length !== prior.wordIds.length || raw.wordIds.some((id, i) => id !== prior.wordIds[i])) {
      throw new Error(`Alignment changed segment ${index} word mapping.`);
    }
    if (!isCanonicalInteger(raw.startMs) || !isCanonicalInteger(raw.endMs) || raw.startMs < 0 || raw.endMs <= raw.startMs) {
      throw new Error(`Segment ${index} timing is invalid.`);
    }
    if (sourceDurationMs !== undefined && raw.endMs > sourceDurationMs) throw new Error(`Segment ${index} exceeds source duration.`);
    if (index > 0 && raw.startMs < previousSegmentEnd) throw new Error(`Segment ${index} crosses the prior canonical segment.`);
    previousSegmentEnd = raw.endMs;
    const containedWords = raw.wordIds.map((id) => typeof id === "string" ? wordById.get(id) : undefined);
    if (containedWords.some((word) => word === undefined)) throw new Error(`Segment ${index} references an unknown word.`);
    for (const id of raw.wordIds) {
      const word = typeof id === "string" ? wordById.get(id) : undefined;
      if (!word || word.startMs < raw.startMs || word.endMs > raw.endMs) throw new Error(`Segment ${index} does not contain its words.`);
    }
    if (containedWords.length === 0
      || raw.startMs !== Math.min(...containedWords.map((word) => word!.startMs))
      || raw.endMs !== Math.max(...containedWords.map((word) => word!.endMs))) {
      throw new Error(`Segment ${index} timing is not derived from its canonical words.`);
    }
    return clone(raw) as unknown as TranscriptState["segments"][number];
  });
  const transcript = { language, words, segments };
  computeTranscriptDigest({ transcript, wordTiming: "aligned", speakerState: deriveTranscriptSpeakerState(transcript) });
  return { transcript, modelId: value.modelId as string, ...(value.modelRevision === undefined ? {} : { modelRevision: value.modelRevision as string }), ...(value.modelDigest === undefined ? {} : { modelDigest: value.modelDigest as string }), ...(value.durationMs === undefined ? {} : { durationMs: value.durationMs as number }) };
}

function appendAlignmentStage(stages: readonly TranscriptProvenanceStage[], alignment: TranscriptProvenanceStage): TranscriptProvenanceStage[] {
  return [...stages.map(clone), alignment];
}

function buildAlignedCandidate(
  sourceId: string,
  current: SourceTranscript,
  result: AlignmentResult,
  identity: EngineIdentity,
  inputTranscriptDigest: SourceTranscript["transcriptDigest"],
  producerExecutionId: string,
  producedAt: string
): SourceTranscript {
  const speakerState = deriveTranscriptSpeakerState(result.transcript);
  if (speakerState !== current.speakerState) throw new Error("Alignment changed speaker coverage.");
  const alignmentStage: TranscriptProvenanceStage = {
    kind: "alignment", executionId: producerExecutionId, engineId: identity.id, engineVersion: identity.version,
    engineApiVersion: String(identity.apiVersion), modelId: result.modelId,
    ...(result.modelRevision !== undefined ? { modelRevision: result.modelRevision } : {}),
    ...(result.modelDigest !== undefined ? { modelDigest: result.modelDigest } : {}),
    inputTranscriptDigest, createdAt: producedAt
  };
  return createSourceTranscript({
    sourceId, wordTiming: "aligned", speakerState, transcript: result.transcript,
    provenance: { ...(current.provenance.sourceChecksum !== undefined ? { sourceChecksum: current.provenance.sourceChecksum } : {}), stages: appendAlignmentStage(current.provenance.stages, alignmentStage) },
    ...(current.extensions !== undefined ? { extensions: clone(current.extensions) } : {})
  });
}

function assertAlignmentIdentity(value: unknown): asserts value is EngineIdentity {
  if (!isRecord(value) || value.kind !== "alignment" || typeof value.id !== "string" || !value.id.trim()
    || typeof value.version !== "string" || !value.version.trim() || value.apiVersion !== CEVRA_ENGINE_API_VERSION) {
    throw new Error("Alignment engine identity is invalid or incompatible.");
  }
}

function assertLease(value: unknown): asserts value is AlignmentAudioLease {
  if (!isRecord(value) || typeof value.outputUri !== "string" || !value.outputUri.endsWith(".wav") || typeof value.release !== "function") {
    throw new Error("Alignment audio workspace returned an invalid lease.");
  }
}

async function releaseAudioLease(lease: AlignmentAudioLease): Promise<void> {
  let firstFailure: unknown;
  try {
    await lease.release();
    return;
  } catch (cause) {
    firstFailure = cause;
  }
  try {
    await lease.release();
  } catch (retryFailure) {
    throw new AggregateError([firstFailure, retryFailure], "Alignment audio cleanup failed after a bounded retry.");
  }
  throw firstFailure;
}

function validateActor(value: unknown): JournalActor {
  if (value === undefined) return { type: "user" };
  if (!isRecord(value)) throw new Error("actor must be an object.");
  rejectUnexpectedKeys(value, ["type", "id"], "actor");
  if (value.type !== "user" && value.type !== "agent" && value.type !== "system") throw new Error("actor.type is unsupported.");
  if (value.id !== undefined && (typeof value.id !== "string" || !value.id.trim())) throw new Error("actor.id is invalid.");
  return clone(value) as unknown as JournalActor;
}

function mapCommitError(cause: unknown, locale: CevraLocale, executionId: string): AlignmentApplicationError {
  if (cause instanceof ProjectCommandError) {
    if (cause.code === "PROJECT_TRANSCRIPT_INVALID" || cause.code === "PROJECT_TRANSCRIPT_DIGEST_MISMATCH") return appError("ALIGNMENT_APP_RESULT_INVALID", locale, executionId, cause);
    if (["PROJECT_TRANSCRIPT_STALE", "PROJECT_TRANSCRIPT_SOURCE_UNKNOWN", "PROJECT_TRANSCRIPT_SOURCE_INELIGIBLE", "PROJECT_TRANSCRIPT_MISSING"].includes(cause.code)) return appError("ALIGNMENT_APP_PROJECT_CONFLICT", locale, executionId, cause);
  }
  return appError("ALIGNMENT_APP_COMMIT_FAILED", locale, executionId, cause);
}

function assertNotCancelled(signal: AbortSignal | undefined, locale: CevraLocale, executionId: string): void {
  if (signal?.aborted) throw appError("ALIGNMENT_APP_CANCELLED", locale, executionId, signal.reason);
}
function isAbort(cause: unknown, signal?: AbortSignal): boolean { return signal?.aborted === true || (cause instanceof Error && cause.name === "AbortError"); }
function isLocale(value: unknown): value is CevraLocale { return value === "pt-BR" || value === "en-US"; }
function isCanonicalInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0); }
function sameOptional(left: unknown, right: unknown): boolean { return left === right; }
function rejectUnexpectedKeys(value: Record<string, unknown>, allowed: readonly string[], field: string): void { const extras = Object.keys(value).filter((key) => !allowed.includes(key)); if (extras.length) throw new Error(`${field} contains unexpected fields: ${extras.join(", ")}.`); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function appError(code: AlignmentApplicationErrorCode, locale: CevraLocale, executionId: string, cause?: unknown): AlignmentApplicationError { return new AlignmentApplicationError(code, locale, executionId, cause); }
function defaultId(): string { return typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : `alignment_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
