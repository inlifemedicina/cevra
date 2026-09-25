import type { MediaProbeResult } from "@cevra/contracts";
import { translate, type CevraLocale, type TranslationKey } from "@cevra/i18n";
import type { ExtensionMap, JournalActor, ProjectHistory, ProjectIR, SourceAsset } from "@cevra/project-ir";
import { MediaApplicationError } from "./errors.js";
import { localSourceProbeInput } from "./local-source-uri.js";
import type { MediaApplicationService } from "./media-service.js";
import {
  normalizeSourceTechnicalDescriptor,
  type SourceContentIdentityPort,
  type SourceFileOperationalStampV1,
  type VerifiedSourceContentIdentityV1
} from "./source-technical-descriptor.js";
import type { MediaExecutionOutcome, MediaExecutionRecord } from "./types.js";

export type LocalSourceIngestErrorCode =
  | "LOCAL_SOURCE_INVALID_REQUEST"
  | "LOCAL_SOURCE_UNSUPPORTED_MEDIA"
  | "LOCAL_SOURCE_KIND_MISMATCH"
  | "LOCAL_SOURCE_PROJECT_CONFLICT"
  | "LOCAL_SOURCE_PROBE_FAILED"
  | "LOCAL_SOURCE_IDENTITY_UNAVAILABLE"
  | "LOCAL_SOURCE_OFFLINE"
  | "LOCAL_SOURCE_CONTENT_CHANGED"
  | "LOCAL_SOURCE_COMMIT_FAILED";

// Local Source Ingest V1 supports video and audio. Still-image ingest requires a
// future capability with reliable media-kind detection.
export type LocalSourceKind = "video" | "audio";

const STILL_IMAGE_VIDEO_CODECS = new Set([
  "bmp",
  "dpx",
  "exr",
  "gif",
  "jpeg",
  "jpeg2000",
  "jpegls",
  "mjpeg",
  "png",
  "tiff",
  "webp"
]);

const ERROR_KEYS: Readonly<Record<LocalSourceIngestErrorCode, TranslationKey>> = {
  LOCAL_SOURCE_INVALID_REQUEST: "ingest.error.invalidRequest",
  LOCAL_SOURCE_UNSUPPORTED_MEDIA: "ingest.error.unsupportedMedia",
  LOCAL_SOURCE_KIND_MISMATCH: "ingest.error.kindMismatch",
  LOCAL_SOURCE_PROJECT_CONFLICT: "ingest.error.projectConflict",
  LOCAL_SOURCE_PROBE_FAILED: "ingest.error.probeFailed",
  LOCAL_SOURCE_IDENTITY_UNAVAILABLE: "ingest.error.identityUnavailable",
  LOCAL_SOURCE_OFFLINE: "ingest.error.sourceOffline",
  LOCAL_SOURCE_CONTENT_CHANGED: "ingest.error.contentChanged",
  LOCAL_SOURCE_COMMIT_FAILED: "ingest.error.commitFailed"
};

export class LocalSourceIngestError extends Error {
  readonly cause: unknown;

  constructor(
    readonly code: LocalSourceIngestErrorCode,
    readonly locale: CevraLocale,
    readonly probeExecutionId: string,
    cause?: unknown
  ) {
    super(translate(locale, ERROR_KEYS[code]));
    this.name = "LocalSourceIngestError";
    this.cause = cause;
  }
}

export interface LocalSourceIngestRequest {
  uri: string;
  displayName: string;
  sourceId?: string;
  expectedKind?: LocalSourceKind;
  checksum?: string;
  extensions?: ExtensionMap;
  locale?: CevraLocale;
  actor?: JournalActor;
}

export interface LocalSourceIngestResult {
  source: SourceAsset;
  project: ProjectIR;
  probeExecution: MediaExecutionRecord;
}

export interface LocalSourceIngestServiceOptions {
  media: Pick<MediaApplicationService, "execute">;
  history: ProjectHistory;
  identity?: SourceContentIdentityPort;
  idGenerator?: () => string;
}

export class LocalSourceIngestService {
  private readonly media: Pick<MediaApplicationService, "execute">;
  private readonly history: ProjectHistory;
  private readonly identity: SourceContentIdentityPort | undefined;
  private readonly idGenerator: () => string;

  constructor(options: LocalSourceIngestServiceOptions) {
    this.media = options.media;
    this.history = options.history;
    this.identity = options.identity;
    this.idGenerator = options.idGenerator ?? defaultId;
  }

  async ingest(request: LocalSourceIngestRequest, signal?: AbortSignal): Promise<LocalSourceIngestResult> {
    let stableRequest: LocalSourceIngestRequest;
    try {
      stableRequest = clone(request);
    } catch (cause) {
      throw new LocalSourceIngestError("LOCAL_SOURCE_INVALID_REQUEST", this.history.current.project.defaultLocale, "invalid-ingest", cause);
    }
    const before = this.history.current;
    const locale = stableRequest.locale ?? before.project.defaultLocale;
    const sourceId = stableRequest.sourceId ?? this.idGenerator();
    const probeExecutionId = this.idGenerator();
    const probeInputUri = validateRequest(stableRequest, sourceId, locale, probeExecutionId);
    if (before.sources.some((source) => source.id === sourceId)) {
      throw new LocalSourceIngestError("LOCAL_SOURCE_INVALID_REQUEST", locale, probeExecutionId);
    }
    const journalEntryCount = this.history.entries.length;
    let initialIdentity: SourceFileOperationalStampV1 | undefined;
    if (this.identity) {
      try {
        initialIdentity = await this.identity.captureSource(stableRequest.uri, signal);
      } catch (cause) {
        throw mapIdentityError(cause, locale, probeExecutionId);
      }
    }

    let probeOutcome: MediaExecutionOutcome;
    try {
      probeOutcome = await this.media.execute({
        id: probeExecutionId,
        locale,
        operation: { type: "probe", inputUri: probeInputUri },
        mutation: { type: "none" },
        actor: stableRequest.actor ?? { type: "user" }
      }, signal);
    } catch (cause) {
      if (cause instanceof MediaApplicationError && cause.code === "MEDIA_OPERATION_CANCELLED") throw cause;
      if (cause instanceof MediaApplicationError && cause.code === "MEDIA_INVALID_REQUEST") {
        throw new LocalSourceIngestError("LOCAL_SOURCE_INVALID_REQUEST", locale, probeExecutionId, cause);
      }
      if (signal?.aborted || (cause instanceof Error && cause.name === "AbortError")) {
        throw new MediaApplicationError("MEDIA_OPERATION_CANCELLED", locale, probeExecutionId, {}, cause);
      }
      throw new LocalSourceIngestError("LOCAL_SOURCE_PROBE_FAILED", locale, probeExecutionId, cause);
    }

    if (signal?.aborted) {
      throw new MediaApplicationError("MEDIA_OPERATION_CANCELLED", locale, probeExecutionId);
    }

    const probe = completedProbe(probeOutcome, locale, probeExecutionId);
    const kind = sourceKind(probe, locale, probeExecutionId);
    if (stableRequest.expectedKind !== undefined && stableRequest.expectedKind !== kind) {
      throw new LocalSourceIngestError("LOCAL_SOURCE_KIND_MISMATCH", locale, probeExecutionId);
    }

    let contentIdentity: VerifiedSourceContentIdentityV1 | undefined;
    if (this.identity && initialIdentity) {
      try {
        contentIdentity = await this.identity.identifySource(stableRequest.uri, initialIdentity, signal);
      } catch (cause) {
        throw mapIdentityError(cause, locale, probeExecutionId);
      }
    }
    if (signal?.aborted) {
      throw new MediaApplicationError("MEDIA_OPERATION_CANCELLED", locale, probeExecutionId);
    }

    const latest = this.history.current;
    if (
      latest.project.id !== before.project.id
      || latest.history.revision !== before.history.revision
      || latest.history.headSnapshotId !== before.history.headSnapshotId
      || this.history.entries.length !== journalEntryCount
    ) {
      throw new LocalSourceIngestError("LOCAL_SOURCE_PROJECT_CONFLICT", locale, probeExecutionId);
    }

    const source = sourceFromProbe(stableRequest, sourceId, kind, probeOutcome.record, probe, contentIdentity, locale, probeExecutionId);
    let project: ProjectIR;
    try {
      project = this.history.commit({ type: "source.add", source }, stableRequest.actor ?? { type: "user" });
    } catch (cause) {
      throw new LocalSourceIngestError("LOCAL_SOURCE_COMMIT_FAILED", locale, probeExecutionId, cause);
    }

    const registered = project.sources.find((item) => item.id === source.id);
    if (!registered) throw new LocalSourceIngestError("LOCAL_SOURCE_COMMIT_FAILED", locale, probeExecutionId);
    return { source: registered, project, probeExecution: probeOutcome.record };
  }
}

function validateRequest(
  request: LocalSourceIngestRequest,
  sourceId: string,
  locale: CevraLocale,
  probeExecutionId: string
): string {
  const expectedKinds: readonly LocalSourceKind[] = ["video", "audio"];
  const probeInputUri = typeof request.uri === "string" ? localSourceProbeInput(request.uri) : undefined;
  const valid = typeof request.uri === "string"
    && request.uri.trim().length > 0
    && probeInputUri !== undefined
    && typeof request.displayName === "string"
    && request.displayName.trim().length > 0
    && typeof sourceId === "string"
    && sourceId.trim().length > 0
    && (request.checksum === undefined || (typeof request.checksum === "string" && request.checksum.trim().length > 0))
    && (request.expectedKind === undefined || expectedKinds.includes(request.expectedKind))
    && (request.extensions === undefined || isRecord(request.extensions));
  if (!valid) throw new LocalSourceIngestError("LOCAL_SOURCE_INVALID_REQUEST", locale, probeExecutionId);
  return probeInputUri;
}

function completedProbe(
  outcome: MediaExecutionOutcome,
  locale: CevraLocale,
  probeExecutionId: string
): MediaProbeResult {
  const result = outcome.record.attempts.at(-1)?.result;
  if (outcome.record.status !== "succeeded" || result?.type !== "probe") {
    throw new LocalSourceIngestError("LOCAL_SOURCE_PROBE_FAILED", locale, probeExecutionId);
  }
  return result.probe;
}

function sourceKind(probe: MediaProbeResult, locale: CevraLocale, probeExecutionId: string): "video" | "audio" {
  if (probe.hasVideo === true) {
    const codec = probe.videoCodec?.trim().toLowerCase();
    // The managed probe exposes common still images as video streams (PNG as
    // `png`, JPEG as `mjpeg`) with zero/one nominal frame. V1 requires temporal
    // video evidence and rejects image codecs instead of persisting a still as
    // canonical video.
    const hasTemporalEvidence = probe.durationMs !== undefined
      && Number.isFinite(probe.durationMs)
      && probe.durationMs > 0
      && probe.frameRate !== undefined
      && Number.isFinite(probe.frameRate)
      && probe.frameRate > 0
      && probe.durationMs * probe.frameRate > 1000;
    if (!codec || STILL_IMAGE_VIDEO_CODECS.has(codec) || !hasTemporalEvidence) {
      throw new LocalSourceIngestError("LOCAL_SOURCE_UNSUPPORTED_MEDIA", locale, probeExecutionId);
    }
    return "video";
  }
  if (probe.hasAudio === true) return "audio";
  throw new LocalSourceIngestError("LOCAL_SOURCE_UNSUPPORTED_MEDIA", locale, probeExecutionId);
}

function sourceFromProbe(
  request: LocalSourceIngestRequest,
  sourceId: string,
  kind: "video" | "audio",
  record: MediaExecutionRecord,
  probe: MediaProbeResult,
  identity: VerifiedSourceContentIdentityV1 | undefined,
  locale: CevraLocale,
  probeExecutionId: string
): SourceAsset {
  const attempt = record.attempts.at(-1);
  if (!attempt) throw new LocalSourceIngestError("LOCAL_SOURCE_PROBE_FAILED", locale, probeExecutionId);
  const callerExtensions = clone(request.extensions ?? {});
  let technicalDescriptor: SourceAsset["technicalDescriptor"];
  if (identity) {
    try {
      technicalDescriptor = normalizeSourceTechnicalDescriptor({
        basis: "ingest",
        sourceKind: kind,
        probe,
        identity,
        provenance: attempt.provenance ?? (() => { throw invalidProbe(locale, probeExecutionId); })()
      });
    } catch (cause) {
      if (cause instanceof LocalSourceIngestError) throw cause;
      throw new LocalSourceIngestError("LOCAL_SOURCE_PROBE_FAILED", locale, probeExecutionId, cause);
    }
  }
  return {
    id: sourceId,
    kind,
    uri: request.uri,
    displayName: request.displayName,
    ...optionalMetadata(probe, locale, probeExecutionId),
    ...(request.checksum !== undefined ? { checksum: request.checksum } : {}),
    ...(technicalDescriptor ? { technicalDescriptor } : {}),
    extensions: {
      ...callerExtensions,
      "cevra.ingest": {
        method: "local",
        probeExecutionId: record.id,
        probeAttempt: attempt.number,
        ...(attempt.provenance ? {
          engineId: attempt.provenance.engineId,
          engineVersion: attempt.provenance.engineVersion,
          engineApiVersion: attempt.provenance.engineApiVersion
        } : {}),
        hasVideo: probe.hasVideo,
        hasAudio: probe.hasAudio,
        ...(probe.videoCodec !== undefined ? { videoCodec: probe.videoCodec } : {}),
        ...(probe.audioCodec !== undefined ? { audioCodec: probe.audioCodec } : {})
      }
    }
  };
}

function optionalMetadata(
  probe: MediaProbeResult,
  locale: CevraLocale,
  probeExecutionId: string
): Pick<SourceAsset, "durationMs" | "width" | "height" | "frameRate" | "sampleRate" | "channels"> {
  const output: Pick<SourceAsset, "durationMs" | "width" | "height" | "frameRate" | "sampleRate" | "channels"> = {};
  if (probe.durationMs !== undefined) {
    if (!Number.isFinite(probe.durationMs) || !Number.isInteger(probe.durationMs) || probe.durationMs < 0) throw invalidProbe(locale, probeExecutionId);
    output.durationMs = probe.durationMs;
  }
  for (const key of ["width", "height", "sampleRate", "channels"] as const) {
    const value = probe[key];
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value <= 0) throw invalidProbe(locale, probeExecutionId);
    output[key] = value;
  }
  if (probe.frameRate !== undefined) {
    if (!Number.isFinite(probe.frameRate) || probe.frameRate <= 0) throw invalidProbe(locale, probeExecutionId);
    output.frameRate = probe.frameRate;
  }
  return output;
}

function invalidProbe(locale: CevraLocale, probeExecutionId: string): LocalSourceIngestError {
  return new LocalSourceIngestError("LOCAL_SOURCE_PROBE_FAILED", locale, probeExecutionId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `ingest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mapIdentityError(cause: unknown, locale: CevraLocale, probeExecutionId: string): Error {
  const code = typeof cause === "object" && cause !== null && "code" in cause ? cause.code : undefined;
  if (code === "SOURCE_IDENTITY_CANCELLED" || (cause instanceof Error && cause.name === "AbortError")) {
    return new MediaApplicationError("MEDIA_OPERATION_CANCELLED", locale, probeExecutionId, {}, cause);
  }
  if (code === "SOURCE_IDENTITY_OFFLINE") return new LocalSourceIngestError("LOCAL_SOURCE_OFFLINE", locale, probeExecutionId, cause);
  if (code === "SOURCE_IDENTITY_CHANGED") return new LocalSourceIngestError("LOCAL_SOURCE_CONTENT_CHANGED", locale, probeExecutionId, cause);
  return new LocalSourceIngestError("LOCAL_SOURCE_IDENTITY_UNAVAILABLE", locale, probeExecutionId, cause);
}
