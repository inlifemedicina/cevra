import {
  CEVRA_ENGINE_API_VERSION,
  type AlignmentAudioLease,
  type AlignmentAudioWorkspace,
  type AlignmentEngineAdapter,
  type AlignmentLanguage,
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
  type SourceTranscript,
  type TranscriptProvenanceStage,
  type TranscriptState
} from "@cevra/project-ir";

export type AlignmentApplicationErrorCode =
  | "ALIGNMENT_APP_INVALID_REQUEST"
  | "ALIGNMENT_APP_SOURCE_UNKNOWN"
  | "ALIGNMENT_APP_SOURCE_INELIGIBLE"
  | "ALIGNMENT_APP_TRANSCRIPT_MISSING"
  | "ALIGNMENT_APP_TRANSCRIPT_NOT_ALIGNABLE"
  | "ALIGNMENT_APP_LANGUAGE_UNSUPPORTED"
  | "ALIGNMENT_APP_AUDIO_PREPARATION_FAILED"
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
}

export interface AlignSourceOutcome {
  executionId: string;
  sourceId: string;
  result: AlignmentResult;
  sourceTranscript: SourceTranscript;
  project: ProjectIR;
}

export interface AlignmentApplicationServiceOptions {
  engine: AlignmentEngineAdapter;
  media: MediaEngineAdapter;
  audioWorkspace: AlignmentAudioWorkspace;
  history: ProjectHistory;
  clock?: () => string;
  idGenerator?: () => string;
}

export class AlignmentApplicationService {
  private readonly engine: AlignmentEngineAdapter;
  private readonly media: MediaEngineAdapter;
  private readonly audioWorkspace: AlignmentAudioWorkspace;
  private readonly history: ProjectHistory;
  private readonly clock: () => string;
  private readonly idGenerator: () => string;

  constructor(options: AlignmentApplicationServiceOptions) {
    this.engine = options.engine;
    this.media = options.media;
    this.audioWorkspace = options.audioWorkspace;
    this.history = options.history;
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.idGenerator = options.idGenerator ?? defaultId;
  }

  async alignSource(request: AlignSourceRequest, signal?: AbortSignal): Promise<AlignSourceOutcome> {
    const before = this.history.current;
    const requestRecord = isRecord(request) ? request : undefined;
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

    let lease: AlignmentAudioLease | undefined;
    try {
      try {
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

      let rawResult: AlignmentResult;
      try {
        rawResult = await this.engine.align({
          inputUri: lease.outputUri,
          language,
          transcript: clone(current.transcript)
        }, { jobId: executionId, locale, ...(signal ? { signal } : {}) });
      } catch (cause) {
        if (isAbort(cause, signal)) throw appError("ALIGNMENT_APP_CANCELLED", locale, executionId, cause);
        throw appError("ALIGNMENT_APP_ENGINE_FAILED", locale, executionId, cause);
      }
      assertNotCancelled(signal, locale, executionId);

      let result: AlignmentResult;
      let candidate: SourceTranscript;
      try {
        result = validateAlignmentResult(rawResult, current.transcript, language, source.durationMs);
        const speakerState = deriveTranscriptSpeakerState(result.transcript);
        if (speakerState !== current.speakerState) throw new Error("Alignment changed speaker coverage.");
        const alignmentStage: TranscriptProvenanceStage = {
          kind: "alignment",
          executionId,
          engineId: identity.id,
          engineVersion: identity.version,
          engineApiVersion: String(identity.apiVersion),
          modelId: result.modelId,
          ...(result.modelRevision !== undefined ? { modelRevision: result.modelRevision } : {}),
          ...(result.modelDigest !== undefined ? { modelDigest: result.modelDigest } : {}),
          inputTranscriptDigest,
          createdAt: this.clock()
        };
        candidate = createSourceTranscript({
          sourceId: source.id,
          wordTiming: "aligned",
          speakerState,
          transcript: result.transcript,
          provenance: {
            ...(current.provenance.sourceChecksum !== undefined ? { sourceChecksum: current.provenance.sourceChecksum } : {}),
            stages: insertAlignmentStage(current.provenance.stages, alignmentStage, inputTranscriptDigest)
          },
          ...(current.extensions !== undefined ? { extensions: clone(current.extensions) } : {})
        });
      } catch (cause) {
        throw appError("ALIGNMENT_APP_RESULT_INVALID", locale, executionId, cause);
      }

      const latest = this.history.current;
      const latestSource = latest.sources.find((item) => item.id === source.id);
      const latestTranscript = latest.sourceTranscripts.find((item) => item.sourceId === source.id);
      if (latest.project.id !== projectIdBefore
        || latest.history.revision !== revisionBefore
        || latest.history.headSnapshotId !== snapshotBefore
        || latestSource?.kind !== source.kind
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
      return { executionId, sourceId: source.id, result: clone(result), sourceTranscript: clone(registered), project };
    } finally {
      if (lease) await lease.release().catch(() => undefined);
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

function validateRequest(request: Record<string, unknown> | undefined, locale: CevraLocale, executionId: string): { sourceId: string; actor: JournalActor } {
  try {
    if (!request) throw new Error("Alignment request must be an object.");
    rejectUnexpectedKeys(request, ["sourceId", "id", "locale", "actor"], "request");
    if (typeof request.sourceId !== "string" || request.sourceId.trim().length === 0) throw new Error("sourceId must be non-empty.");
    if (request.id !== undefined && request.id !== executionId) throw new Error("Execution ID is invalid.");
    if (request.locale !== undefined && !isLocale(request.locale)) throw new Error("locale is unsupported.");
    return { sourceId: request.sourceId, actor: validateActor(request.actor) };
  } catch (cause) {
    throw appError("ALIGNMENT_APP_INVALID_REQUEST", locale, executionId, cause);
  }
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
    return clone(raw) as unknown as TranscriptState["words"][number];
  });
  const wordById = new Map(words.map((word) => [word.id, word]));
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
    for (const id of raw.wordIds) {
      const word = typeof id === "string" ? wordById.get(id) : undefined;
      if (!word || word.startMs < raw.startMs || word.endMs > raw.endMs) throw new Error(`Segment ${index} does not contain its words.`);
    }
    return clone(raw) as unknown as TranscriptState["segments"][number];
  });
  const transcript = { language, words, segments };
  computeTranscriptDigest({ transcript, wordTiming: "aligned", speakerState: deriveTranscriptSpeakerState(transcript) });
  return { transcript, modelId: value.modelId as string, ...(value.modelRevision === undefined ? {} : { modelRevision: value.modelRevision as string }), ...(value.modelDigest === undefined ? {} : { modelDigest: value.modelDigest as string }), ...(value.durationMs === undefined ? {} : { durationMs: value.durationMs as number }) };
}

function insertAlignmentStage(stages: readonly TranscriptProvenanceStage[], alignment: TranscriptProvenanceStage, inputDigest: SourceTranscript["transcriptDigest"]): TranscriptProvenanceStage[] {
  const split = stages.findIndex((stage) => stage.kind === "speaker-attribution" || stage.kind === "manual-correction");
  const index = split < 0 ? stages.length : split;
  const before = stages.slice(0, index).map(clone);
  const after = stages.slice(index).map((stage) => stage.kind === "speaker-attribution" || stage.kind === "manual-correction"
    ? { ...clone(stage), inputTranscriptDigest: inputDigest }
    : clone(stage));
  return [...before, alignment, ...after];
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
