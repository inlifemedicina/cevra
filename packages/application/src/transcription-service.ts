import {
  CEVRA_ENGINE_API_VERSION,
  type EngineIdentity,
  type TranscriptionEngineAdapter,
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

  constructor(
    readonly code: TranscriptionApplicationErrorCode,
    readonly locale: CevraLocale,
    readonly executionId: string,
    cause?: unknown
  ) {
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
}

export interface TranscribeSourceOutcome {
  executionId: string;
  sourceId: string;
  result: TranscriptionResult;
  sourceTranscript: SourceTranscript;
  project: ProjectIR;
}

export interface TranscriptionApplicationServiceOptions {
  engine: TranscriptionEngineAdapter;
  history: ProjectHistory;
  clock?: () => string;
  idGenerator?: () => string;
}

interface NormalizedTranscribeSourceRequest {
  sourceId: string;
  locale: CevraLocale;
  language: "auto" | "pt" | "en";
  wordTimestamps: boolean;
  actor: JournalActor;
}

export class TranscriptionApplicationService {
  private readonly engine: TranscriptionEngineAdapter;
  private readonly history: ProjectHistory;
  private readonly clock: () => string;
  private readonly idGenerator: () => string;

  constructor(options: TranscriptionApplicationServiceOptions) {
    this.engine = options.engine;
    this.history = options.history;
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.idGenerator = options.idGenerator ?? defaultId;
  }

  async transcribeSource(request: TranscribeSourceRequest, signal?: AbortSignal): Promise<TranscribeSourceOutcome> {
    const before = this.history.current;
    const requestRecord = isRecord(request) ? request : undefined;
    const locale = isLocale(requestRecord?.locale) ? requestRecord.locale : before.project.defaultLocale;
    const executionId = this.executionId(requestRecord, locale);
    const normalized = validateRequest(requestRecord, locale, executionId);

    const source = before.sources.find((item) => item.id === normalized.sourceId);
    if (!source) throw appError("TRANSCRIPTION_APP_SOURCE_UNKNOWN", locale, executionId);
    if (source.kind !== "audio" && source.kind !== "video") {
      throw appError("TRANSCRIPTION_APP_SOURCE_INELIGIBLE", locale, executionId);
    }

    const current = before.sourceTranscripts.find((item) => item.sourceId === source.id);
    const currentDigest = current?.transcriptDigest;
    const projectIdBefore = before.project.id;
    const revisionBefore = before.history.revision;
    const snapshotBefore = before.history.headSnapshotId;

    if (signal?.aborted) throw appError("TRANSCRIPTION_APP_CANCELLED", locale, executionId, signal.reason);

    let identity: EngineIdentity;
    try {
      identity = await this.engine.identity();
      assertTranscriptionIdentity(identity);
    } catch (cause) {
      if (isAbort(cause, signal)) throw appError("TRANSCRIPTION_APP_CANCELLED", locale, executionId, cause);
      throw appError("TRANSCRIPTION_APP_ENGINE_FAILED", locale, executionId, cause);
    }
    if (signal?.aborted) throw appError("TRANSCRIPTION_APP_CANCELLED", locale, executionId, signal.reason);

    let result: TranscriptionResult;
    try {
      result = await this.engine.transcribe({
        inputUri: source.uri,
        language: normalized.language,
        wordTimestamps: normalized.wordTimestamps
      }, {
        jobId: executionId,
        locale: normalized.locale,
        ...(signal ? { signal } : {})
      });
    } catch (cause) {
      if (isAbort(cause, signal)) throw appError("TRANSCRIPTION_APP_CANCELLED", locale, executionId, cause);
      throw appError("TRANSCRIPTION_APP_ENGINE_FAILED", locale, executionId, cause);
    }
    if (signal?.aborted) throw appError("TRANSCRIPTION_APP_CANCELLED", locale, executionId, signal.reason);

    let validatedResult: TranscriptionResult;
    let outcomeResult: TranscriptionResult;
    let candidate: SourceTranscript;
    try {
      validatedResult = validateResult(result, normalized.wordTimestamps);
      const wordTiming = normalizeWordTiming(validatedResult);
      const speakerState = deriveTranscriptSpeakerState(validatedResult.transcript);
      candidate = createSourceTranscript({
        sourceId: source.id,
        wordTiming,
        speakerState,
        transcript: validatedResult.transcript,
        provenance: {
          ...(source.checksum !== undefined ? { sourceChecksum: source.checksum } : {}),
          stages: [{
            kind: "transcription",
            executionId,
            engineId: identity.id,
            engineVersion: identity.version,
            engineApiVersion: String(identity.apiVersion),
            modelId: validatedResult.modelId,
            createdAt: this.clock()
          }]
        }
      });
      outcomeResult = clone(validatedResult);
    } catch (cause) {
      throw appError("TRANSCRIPTION_APP_RESULT_INVALID", locale, executionId, cause);
    }

    const latest = this.history.current;
    if (latest.project.id !== projectIdBefore
      || latest.history.revision !== revisionBefore
      || latest.history.headSnapshotId !== snapshotBefore) {
      throw appError("TRANSCRIPTION_APP_PROJECT_CONFLICT", locale, executionId);
    }
    if (signal?.aborted) throw appError("TRANSCRIPTION_APP_CANCELLED", locale, executionId, signal.reason);

    let project: ProjectIR;
    try {
      project = this.history.commit({
        type: "transcript.set",
        transcript: candidate,
        ...(currentDigest !== undefined ? { expectedCurrentTranscriptDigest: currentDigest } : {})
      }, normalized.actor);
    } catch (cause) {
      throw mapCommitError(cause, locale, executionId);
    }

    const registered = project.sourceTranscripts.find((item) => item.sourceId === source.id);
    if (!registered) throw appError("TRANSCRIPTION_APP_COMMIT_FAILED", locale, executionId);
    return {
      executionId,
      sourceId: source.id,
      result: outcomeResult,
      sourceTranscript: clone(registered),
      project
    };
  }

  private executionId(request: Record<string, unknown> | undefined, locale: CevraLocale): string {
    try {
      const value = request?.id === undefined ? this.idGenerator() : request.id;
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("Transcription execution ID must be a non-empty string.");
      }
      return value;
    } catch (cause) {
      throw appError("TRANSCRIPTION_APP_INVALID_REQUEST", locale, "transcription-unassigned", cause);
    }
  }
}

function validateRequest(
  request: Record<string, unknown> | undefined,
  locale: CevraLocale,
  executionId: string
): NormalizedTranscribeSourceRequest {
  try {
    if (!request) throw new Error("Transcription request must be an object.");
    rejectUnexpectedKeys(request, ["sourceId", "id", "locale", "language", "wordTimestamps", "actor"], "request");
    if (typeof request.sourceId !== "string" || request.sourceId.trim().length === 0) {
      throw new Error("sourceId must be a non-empty string.");
    }
    if (request.id !== undefined && request.id !== executionId) throw new Error("Execution ID is invalid.");
    if (request.locale !== undefined && !isLocale(request.locale)) throw new Error("locale is unsupported.");
    const language = normalizeLanguage(request.language);
    if (request.wordTimestamps !== undefined && typeof request.wordTimestamps !== "boolean") {
      throw new Error("wordTimestamps must be a boolean.");
    }
    const actor = validateActor(request.actor);
    return {
      sourceId: request.sourceId,
      locale,
      language,
      wordTimestamps: request.wordTimestamps ?? true,
      actor
    };
  } catch (cause) {
    if (cause instanceof TranscriptionApplicationError) throw cause;
    throw appError("TRANSCRIPTION_APP_INVALID_REQUEST", locale, executionId, cause);
  }
}

function validateActor(value: unknown): JournalActor {
  if (value === undefined) return { type: "user" };
  if (!isRecord(value)) throw new Error("actor must be an object.");
  rejectUnexpectedKeys(value, ["type", "id"], "actor");
  if (value.type !== "user" && value.type !== "agent" && value.type !== "system") {
    throw new Error("actor.type is unsupported.");
  }
  if (value.id !== undefined && (typeof value.id !== "string" || value.id.trim().length === 0)) {
    throw new Error("actor.id must be a non-empty string.");
  }
  return clone(value) as unknown as JournalActor;
}

function assertTranscriptionIdentity(value: unknown): asserts value is EngineIdentity {
  if (!isRecord(value)
    || value.kind !== "transcription"
    || typeof value.id !== "string"
    || value.id.trim().length === 0
    || typeof value.version !== "string"
    || value.version.trim().length === 0
    || value.apiVersion !== CEVRA_ENGINE_API_VERSION) {
    throw new Error("Transcription engine identity is invalid or incompatible.");
  }
}

function validateResult(value: unknown, wordTimestampsRequested: boolean): TranscriptionResult {
  if (!isRecord(value)) throw new Error("Transcription result must be an object.");
  rejectUnexpectedKeys(value, ["transcript", "detectedLanguage", "modelId", "durationMs", "wordTiming"], "result");
  if (!isRecord(value.transcript) || !Array.isArray(value.transcript.words) || !Array.isArray(value.transcript.segments)) {
    throw new Error("Transcription result transcript is malformed.");
  }
  if (typeof value.modelId !== "string" || value.modelId.trim().length === 0) {
    throw new Error("Transcription result modelId must be a non-empty string.");
  }
  if (value.detectedLanguage !== undefined && (typeof value.detectedLanguage !== "string" || value.detectedLanguage.trim().length === 0)) {
    throw new Error("Transcription detectedLanguage must be a non-empty string.");
  }
  if (value.durationMs !== undefined && (!Number.isSafeInteger(value.durationMs) || (value.durationMs as number) < 0)) {
    throw new Error("Transcription durationMs must be a non-negative safe integer.");
  }
  if (value.wordTiming !== undefined && value.wordTiming !== "none" && value.wordTiming !== "model") {
    throw new Error("Transcription wordTiming is unsupported.");
  }
  if (!wordTimestampsRequested && value.transcript.words.length > 0) {
    throw new Error("Transcription returned words when word timestamps were disabled.");
  }
  if (value.transcript.words.length > 0 && value.wordTiming !== "model") {
    throw new Error("Transcription words require model timing metadata.");
  }
  return value as unknown as TranscriptionResult;
}

function normalizeWordTiming(result: TranscriptionResult): TranscriptWordTiming {
  return result.transcript.words.length === 0 ? "none" : "model";
}

function mapCommitError(cause: unknown, locale: CevraLocale, executionId: string): TranscriptionApplicationError {
  if (cause instanceof ProjectCommandError) {
    if (cause.code === "PROJECT_TRANSCRIPT_INVALID" || cause.code === "PROJECT_TRANSCRIPT_DIGEST_MISMATCH") {
      return appError("TRANSCRIPTION_APP_RESULT_INVALID", locale, executionId, cause);
    }
    if (cause.code === "PROJECT_TRANSCRIPT_STALE"
      || cause.code === "PROJECT_TRANSCRIPT_ALREADY_EXISTS"
      || cause.code === "PROJECT_TRANSCRIPT_SOURCE_UNKNOWN"
      || cause.code === "PROJECT_TRANSCRIPT_SOURCE_INELIGIBLE"
      || cause.code === "PROJECT_TRANSCRIPT_MISSING") {
      return appError("TRANSCRIPTION_APP_PROJECT_CONFLICT", locale, executionId, cause);
    }
  }
  return appError("TRANSCRIPTION_APP_COMMIT_FAILED", locale, executionId, cause);
}

function rejectUnexpectedKeys(value: Record<string, unknown>, allowed: readonly string[], field: string): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) throw new Error(`${field} contains unexpected fields: ${unexpected.join(", ")}.`);
}

function isLocale(value: unknown): value is CevraLocale {
  return value === "pt-BR" || value === "en-US";
}

function normalizeLanguage(value: unknown): NormalizedTranscribeSourceRequest["language"] {
  if (value === undefined) return "auto";
  if (value === "auto" || value === "pt" || value === "en") return value;
  throw new Error("language is unsupported.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbort(cause: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (cause instanceof Error && cause.name === "AbortError");
}

function appError(
  code: TranscriptionApplicationErrorCode,
  locale: CevraLocale,
  executionId: string,
  cause?: unknown
): TranscriptionApplicationError {
  return new TranscriptionApplicationError(code, locale, executionId, cause);
}

function defaultId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `transcription_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
