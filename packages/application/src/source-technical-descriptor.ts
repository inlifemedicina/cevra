import type { MediaProbeResult } from "@cevra/contracts";
import { translate, type CevraLocale, type TranslationKey } from "@cevra/i18n";
import {
  ProjectCommandError,
  type JournalActor,
  type ProjectHistory,
  type ProjectIR,
  type SourceAsset,
  type SourceTechnicalDescriptorV1,
  assertValidSourceTechnicalDescriptor
} from "@cevra/project-ir";
import { MediaApplicationError } from "./errors.js";
import { localSourceProbeInput } from "./local-source-uri.js";
import type { MediaApplicationService } from "./media-service.js";
import type { MediaExecutionProvenance, MediaExecutionRecord } from "./types.js";

export interface SourceFileOperationalStampV1 {
  version: 1;
  uri: string;
  canonicalPath: string;
  device: string;
  inode: string;
  sizeBytes: number;
  mtimeNs: string;
  ctimeNs: string;
}

export interface VerifiedSourceContentIdentityV1 {
  version: 1;
  content: {
    sha256: string;
    sizeBytes: number;
  };
  stamp: SourceFileOperationalStampV1;
  bytesRead: number;
}

export type SourceFileCheckResult = "match" | "missing" | "changed" | "unsupported";

export interface SourceContentIdentityPort {
  captureSource(uri: string, signal?: AbortSignal): Promise<SourceFileOperationalStampV1>;
  identifySource(
    uri: string,
    expected: SourceFileOperationalStampV1,
    signal?: AbortSignal
  ): Promise<VerifiedSourceContentIdentityV1>;
  checkSource(
    uri: string,
    expected: SourceFileOperationalStampV1,
    signal?: AbortSignal
  ): Promise<SourceFileCheckResult>;
}

export type SourceTechnicalDescriptorResolution =
  | { status: "absent" }
  | { status: "adopted-evidence"; descriptor: SourceTechnicalDescriptorV1 }
  | { status: "verified"; descriptor: SourceTechnicalDescriptorV1; verification: VerifiedSourceContentIdentityV1 }
  | { status: "offline"; descriptor: SourceTechnicalDescriptorV1 }
  | { status: "content-changed"; descriptor: SourceTechnicalDescriptorV1 }
  | { status: "method-incompatible"; descriptor: SourceTechnicalDescriptorV1 };

export interface SourceContentVerificationMemo {
  readonly maximumEntries: number;
  readonly entries: Map<string, VerifiedSourceContentIdentityV1>;
  hashCount: number;
  bytesRead: number;
}

export type SourceTechnicalDescriptorErrorCode =
  | "SOURCE_DESCRIPTOR_INVALID_REQUEST"
  | "SOURCE_DESCRIPTOR_SOURCE_UNKNOWN"
  | "SOURCE_DESCRIPTOR_SOURCE_INELIGIBLE"
  | "SOURCE_DESCRIPTOR_IDENTITY_UNAVAILABLE"
  | "SOURCE_DESCRIPTOR_SOURCE_OFFLINE"
  | "SOURCE_CONTENT_CHANGED"
  | "SOURCE_DESCRIPTOR_PROBE_FAILED"
  | "SOURCE_DESCRIPTOR_METADATA_CONFLICT"
  | "SOURCE_DESCRIPTOR_PROJECT_CONFLICT"
  | "SOURCE_DESCRIPTOR_NO_OP"
  | "SOURCE_DESCRIPTOR_COMMIT_FAILED";

const ERROR_KEYS: Readonly<Record<SourceTechnicalDescriptorErrorCode, TranslationKey>> = {
  SOURCE_DESCRIPTOR_INVALID_REQUEST: "sourceDescriptor.error.invalidRequest",
  SOURCE_DESCRIPTOR_SOURCE_UNKNOWN: "sourceDescriptor.error.sourceUnknown",
  SOURCE_DESCRIPTOR_SOURCE_INELIGIBLE: "sourceDescriptor.error.sourceIneligible",
  SOURCE_DESCRIPTOR_IDENTITY_UNAVAILABLE: "sourceDescriptor.error.identityUnavailable",
  SOURCE_DESCRIPTOR_SOURCE_OFFLINE: "sourceDescriptor.error.sourceOffline",
  SOURCE_CONTENT_CHANGED: "sourceDescriptor.error.contentChanged",
  SOURCE_DESCRIPTOR_PROBE_FAILED: "sourceDescriptor.error.probeFailed",
  SOURCE_DESCRIPTOR_METADATA_CONFLICT: "sourceDescriptor.error.metadataConflict",
  SOURCE_DESCRIPTOR_PROJECT_CONFLICT: "sourceDescriptor.error.projectConflict",
  SOURCE_DESCRIPTOR_NO_OP: "sourceDescriptor.error.noOp",
  SOURCE_DESCRIPTOR_COMMIT_FAILED: "sourceDescriptor.error.commitFailed"
};

export class SourceTechnicalDescriptorError extends Error {
  readonly cause: unknown;

  constructor(
    readonly code: SourceTechnicalDescriptorErrorCode,
    readonly locale: CevraLocale,
    readonly operationId: string,
    cause?: unknown
  ) {
    super(translate(locale, ERROR_KEYS[code]));
    this.name = "SourceTechnicalDescriptorError";
    this.cause = cause;
  }
}

export interface NormalizeSourceTechnicalDescriptorInput {
  basis: SourceTechnicalDescriptorV1["basis"];
  sourceKind: "video" | "audio";
  probe: MediaProbeResult;
  identity: VerifiedSourceContentIdentityV1;
  provenance: MediaExecutionProvenance;
}

export function normalizeSourceTechnicalDescriptor(
  input: NormalizeSourceTechnicalDescriptorInput
): SourceTechnicalDescriptorV1 {
  if (input.probe.sizeBytes !== undefined
    && (!Number.isSafeInteger(input.probe.sizeBytes) || input.probe.sizeBytes < 0
      || input.probe.sizeBytes !== input.identity.content.sizeBytes)) {
    throw new Error("Probe byte size does not match the verified content identity.");
  }
  const video = input.probe.hasVideo ? compact({
    ...(input.probe.videoCodec !== undefined ? { codec: technicalString(input.probe.videoCodec, "video codec") } : {}),
    ...(input.probe.pixelFormat !== undefined ? { pixelFormat: technicalString(input.probe.pixelFormat, "pixel format") } : {}),
    ...normalizedRational(input.probe.avgFrameRate, "average frame rate", "avgFrameRate"),
    ...normalizedRational(input.probe.rFrameRate, "nominal frame rate", "rFrameRate"),
    ...(input.probe.rotationDegrees !== undefined ? { rotationDegrees: normalizeRotation(input.probe.rotationDegrees) } : {}),
    ...(input.probe.colorPrimaries !== undefined ? { colorPrimaries: technicalString(input.probe.colorPrimaries, "color primaries") } : {}),
    ...(input.probe.colorTransfer !== undefined ? { colorTransfer: technicalString(input.probe.colorTransfer, "color transfer") } : {}),
    ...(input.probe.colorSpace !== undefined ? { colorSpace: technicalString(input.probe.colorSpace, "color space") } : {}),
    ...(input.probe.colorRange !== undefined ? { colorRange: technicalString(input.probe.colorRange, "color range") } : {})
  }) : undefined;
  const audio = input.probe.hasAudio && input.probe.audioCodec !== undefined
    ? { codec: technicalString(input.probe.audioCodec, "audio codec") }
    : undefined;
  const descriptor: SourceTechnicalDescriptorV1 = {
    version: 1,
    basis: input.basis,
    content: {
      sha256: input.identity.content.sha256,
      sizeBytes: input.identity.content.sizeBytes
    },
    method: {
      profile: "cevra.source-technical.v1",
      engineId: technicalString(input.provenance.engineId, "engine id"),
      engineVersion: technicalString(input.provenance.engineVersion, "engine version"),
      engineApiVersion: input.provenance.engineApiVersion
    },
    ...(video && Object.keys(video).length > 0 ? { video } : {}),
    ...(audio ? { audio } : {})
  };
  return clone(assertValidSourceTechnicalDescriptor(descriptor, input.sourceKind));
}

export function createSourceContentVerificationMemo(maximumEntries = 128): SourceContentVerificationMemo {
  if (!Number.isSafeInteger(maximumEntries) || maximumEntries <= 0 || maximumEntries > 128) {
    throw new Error("Source verification memo bound must be from 1 through 128.");
  }
  return { maximumEntries, entries: new Map(), hashCount: 0, bytesRead: 0 };
}

export class SourceTechnicalDescriptorResolver {
  constructor(private readonly identity?: SourceContentIdentityPort) {}

  adopted(source: SourceAsset): SourceTechnicalDescriptorResolution {
    return source.technicalDescriptor
      ? { status: "adopted-evidence", descriptor: clone(source.technicalDescriptor) }
      : { status: "absent" };
  }

  async verify(
    source: SourceAsset,
    memo: SourceContentVerificationMemo,
    signal?: AbortSignal
  ): Promise<SourceTechnicalDescriptorResolution> {
    const descriptor = source.technicalDescriptor;
    if (!descriptor) return { status: "absent" };
    if (descriptor.method.profile !== "cevra.source-technical.v1" || !this.identity) {
      return { status: "method-incompatible", descriptor: clone(descriptor) };
    }
    const key = verificationKey(source);
    const cached = memo.entries.get(key);
    if (cached) {
      const current = await this.identity.checkSource(source.uri, cached.stamp, signal);
      if (current === "match") return { status: "verified", descriptor: clone(descriptor), verification: clone(cached) };
      return current === "missing"
        ? { status: "offline", descriptor: clone(descriptor) }
        : current === "unsupported"
          ? { status: "method-incompatible", descriptor: clone(descriptor) }
          : { status: "content-changed", descriptor: clone(descriptor) };
    }
    if (memo.entries.size >= memo.maximumEntries) {
      return { status: "method-incompatible", descriptor: clone(descriptor) };
    }
    try {
      const initial = await this.identity.captureSource(source.uri, signal);
      const verified = await this.identity.identifySource(source.uri, initial, signal);
      if (verified.content.sha256 !== descriptor.content.sha256
        || verified.content.sizeBytes !== descriptor.content.sizeBytes) {
        return { status: "content-changed", descriptor: clone(descriptor) };
      }
      memo.entries.set(key, clone(verified));
      memo.hashCount += 1;
      memo.bytesRead += verified.bytesRead;
      return { status: "verified", descriptor: clone(descriptor), verification: clone(verified) };
    } catch (cause) {
      const code = identityErrorCode(cause);
      if (code === "SOURCE_IDENTITY_OFFLINE") return { status: "offline", descriptor: clone(descriptor) };
      if (code === "SOURCE_IDENTITY_CHANGED") return { status: "content-changed", descriptor: clone(descriptor) };
      if (code === "SOURCE_IDENTITY_UNSUPPORTED") return { status: "method-incompatible", descriptor: clone(descriptor) };
      throw cause;
    }
  }

  async revalidate(memo: SourceContentVerificationMemo, signal?: AbortSignal): Promise<SourceTechnicalDescriptorResolution["status"]> {
    if (!this.identity) return "method-incompatible";
    for (const verification of memo.entries.values()) {
      const current = await this.identity.checkSource(verification.stamp.uri, verification.stamp, signal);
      if (current !== "match") return current === "missing" ? "offline" : current === "unsupported" ? "method-incompatible" : "content-changed";
    }
    return "verified";
  }
}

export interface AdoptSourceTechnicalDescriptorRequest {
  id?: string;
  sourceId: string;
  locale?: CevraLocale;
  actor?: JournalActor;
}

export interface AdoptSourceTechnicalDescriptorOutcome {
  source: SourceAsset;
  project: ProjectIR;
  probeExecution: MediaExecutionRecord;
  bytesRead: number;
}

export class SourceTechnicalDescriptorApplicationService {
  private readonly idGenerator: () => string;

  constructor(private readonly options: {
    media: Pick<MediaApplicationService, "execute">;
    history: ProjectHistory;
    identity?: SourceContentIdentityPort;
    idGenerator?: () => string;
  }) {
    this.idGenerator = options.idGenerator ?? defaultId;
  }

  async adopt(
    request: AdoptSourceTechnicalDescriptorRequest,
    signal?: AbortSignal
  ): Promise<AdoptSourceTechnicalDescriptorOutcome> {
    let stable: AdoptSourceTechnicalDescriptorRequest;
    try {
      stable = clone(request);
    } catch (cause) {
      throw new SourceTechnicalDescriptorError("SOURCE_DESCRIPTOR_INVALID_REQUEST", this.options.history.current.project.defaultLocale, "invalid-source-descriptor", cause);
    }
    const before = this.options.history.current;
    const locale = stable.locale ?? before.project.defaultLocale;
    const operationId = stable.id ?? this.idGenerator();
    if (!isRecord(stable) || !hasOnlyKeys(stable, ["id", "sourceId", "locale", "actor"])
      || typeof stable.sourceId !== "string" || stable.sourceId.trim().length === 0
      || (stable.id !== undefined && (typeof stable.id !== "string" || stable.id.trim().length === 0))
      || (stable.locale !== undefined && stable.locale !== "pt-BR" && stable.locale !== "en-US")
      || !isActor(stable.actor ?? { type: "user" })) {
      throw new SourceTechnicalDescriptorError("SOURCE_DESCRIPTOR_INVALID_REQUEST", locale, operationId);
    }
    const source = before.sources.find((item) => item.id === stable.sourceId);
    if (!source) throw new SourceTechnicalDescriptorError("SOURCE_DESCRIPTOR_SOURCE_UNKNOWN", locale, operationId);
    if (source.kind !== "video" && source.kind !== "audio") {
      throw new SourceTechnicalDescriptorError("SOURCE_DESCRIPTOR_SOURCE_INELIGIBLE", locale, operationId);
    }
    if (!this.options.identity) {
      throw new SourceTechnicalDescriptorError("SOURCE_DESCRIPTOR_IDENTITY_UNAVAILABLE", locale, operationId);
    }

    const binding = captureBinding(this.options.history, source);
    let initial: SourceFileOperationalStampV1;
    try {
      initial = await this.options.identity.captureSource(source.uri, signal);
    } catch (cause) {
      throw mapIdentityFailure(cause, locale, operationId);
    }
    let probeRecord: MediaExecutionRecord;
    let probe: MediaProbeResult;
    try {
      const outcome = await this.options.media.execute({
        id: `${operationId}:probe`,
        locale,
        operation: { type: "probe", inputUri: localSourceProbeInput(source.uri) ?? source.uri },
        mutation: { type: "none" },
        actor: stable.actor ?? { type: "user" }
      }, signal);
      probeRecord = outcome.record;
      probe = completedProbe(probeRecord);
    } catch (cause) {
      if (cause instanceof MediaApplicationError && cause.code === "MEDIA_OPERATION_CANCELLED") throw cause;
      throw new SourceTechnicalDescriptorError("SOURCE_DESCRIPTOR_PROBE_FAILED", locale, operationId, cause);
    }
    let identity: VerifiedSourceContentIdentityV1;
    try {
      identity = await this.options.identity.identifySource(source.uri, initial, signal);
    } catch (cause) {
      throw mapIdentityFailure(cause, locale, operationId);
    }
    assertBasicMetadataMatches(source, probe, locale, operationId);
    if (source.technicalDescriptor
      && (source.technicalDescriptor.content.sha256 !== identity.content.sha256
        || source.technicalDescriptor.content.sizeBytes !== identity.content.sizeBytes)) {
      throw new SourceTechnicalDescriptorError("SOURCE_CONTENT_CHANGED", locale, operationId);
    }
    let descriptor: SourceTechnicalDescriptorV1;
    try {
      descriptor = normalizeSourceTechnicalDescriptor({
        basis: source.technicalDescriptor?.basis ?? "post-ingest",
        sourceKind: source.kind,
        probe,
        identity,
        provenance: completedProvenance(probeRecord)
      });
    } catch (cause) {
      throw new SourceTechnicalDescriptorError("SOURCE_DESCRIPTOR_PROBE_FAILED", locale, operationId, cause);
    }
    let currentCheck: SourceFileCheckResult;
    try {
      currentCheck = await this.options.identity.checkSource(source.uri, identity.stamp, signal);
    } catch (cause) {
      throw mapIdentityFailure(cause, locale, operationId);
    }
    if (currentCheck !== "match") throw resolutionError(currentCheck, locale, operationId);
    if (signal?.aborted) throw abortError();
    assertBinding(this.options.history, binding, locale, operationId);
    let project: ProjectIR;
    try {
      project = this.options.history.commit({
        type: "source.technicalDescriptor.set",
        sourceId: source.id,
        expectedSourceUri: source.uri,
        expectedTechnicalDescriptor: source.technicalDescriptor
          ? { state: "value", value: source.technicalDescriptor }
          : { state: "absent" },
        technicalDescriptor: descriptor
      }, stable.actor ?? { type: "user" });
    } catch (cause) {
      if (cause instanceof ProjectCommandError && cause.code === "PROJECT_SOURCE_DESCRIPTOR_NO_OP") {
        throw new SourceTechnicalDescriptorError("SOURCE_DESCRIPTOR_NO_OP", locale, operationId, cause);
      }
      throw new SourceTechnicalDescriptorError("SOURCE_DESCRIPTOR_COMMIT_FAILED", locale, operationId, cause);
    }
    const adopted = project.sources.find((item) => item.id === source.id);
    if (!adopted) throw new SourceTechnicalDescriptorError("SOURCE_DESCRIPTOR_COMMIT_FAILED", locale, operationId);
    return { source: adopted, project, probeExecution: probeRecord, bytesRead: identity.bytesRead };
  }
}

function completedProbe(record: MediaExecutionRecord): MediaProbeResult {
  const result = record.attempts.at(-1)?.result;
  if (record.status !== "succeeded" || result?.type !== "probe") throw new Error("Probe execution did not complete.");
  return result.probe;
}

function completedProvenance(record: MediaExecutionRecord): MediaExecutionProvenance {
  const provenance = record.attempts.at(-1)?.provenance;
  if (!provenance) throw new Error("Probe execution has no producer provenance.");
  return provenance;
}

function assertBasicMetadataMatches(source: SourceAsset, probe: MediaProbeResult, locale: CevraLocale, operationId: string): void {
  const expected: Array<keyof Pick<SourceAsset, "durationMs" | "width" | "height" | "frameRate" | "sampleRate" | "channels">> = [
    "durationMs", "width", "height", "frameRate", "sampleRate", "channels"
  ];
  for (const key of expected) {
    if (source[key] !== undefined && probe[key] !== source[key]) {
      throw new SourceTechnicalDescriptorError("SOURCE_DESCRIPTOR_METADATA_CONFLICT", locale, operationId);
    }
  }
  if ((source.kind === "video" && !probe.hasVideo) || (source.kind === "audio" && !probe.hasAudio)) {
    throw new SourceTechnicalDescriptorError("SOURCE_DESCRIPTOR_METADATA_CONFLICT", locale, operationId);
  }
}

function captureBinding(history: ProjectHistory, source: SourceAsset) {
  const project = history.current;
  return {
    projectId: project.project.id,
    revision: project.history.revision,
    snapshotId: project.history.headSnapshotId,
    journalEntryCount: history.entries.length,
    source: clone(source)
  };
}

function assertBinding(
  history: ProjectHistory,
  binding: ReturnType<typeof captureBinding>,
  locale: CevraLocale,
  operationId: string
): void {
  const project = history.current;
  const source = project.sources.find((item) => item.id === binding.source.id);
  if (project.project.id !== binding.projectId
    || project.history.revision !== binding.revision
    || project.history.headSnapshotId !== binding.snapshotId
    || history.entries.length !== binding.journalEntryCount
    || !source || !structurallyEqual(source, binding.source)) {
    throw new SourceTechnicalDescriptorError("SOURCE_DESCRIPTOR_PROJECT_CONFLICT", locale, operationId);
  }
}

function normalizedRational(value: string | undefined, label: string, key: "avgFrameRate" | "rFrameRate"): Partial<Record<typeof key, string>> {
  if (value === undefined || value === "0/0") return {};
  const match = /^(\d+)\/(\d+)$/u.exec(value);
  if (!match) throw new Error(`${label} is malformed.`);
  const numerator = BigInt(match[1]!);
  const denominator = BigInt(match[2]!);
  if (numerator === BigInt(0) || denominator === BigInt(0)) return {};
  const divisor = gcd(numerator, denominator);
  return { [key]: `${numerator / divisor}/${denominator / divisor}` };
}

function normalizeRotation(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error("Rotation is not an integer.");
  const normalized = value % 360;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function technicalString(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()
    || [...value].length > 64 || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  return a;
}

function verificationKey(source: SourceAsset): string {
  const descriptor = source.technicalDescriptor!;
  return JSON.stringify([source.id, source.uri, descriptor.content.sha256, descriptor.content.sizeBytes]);
}

function identityErrorCode(cause: unknown): string | undefined {
  return typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
    ? cause.code
    : undefined;
}

function mapIdentityFailure(cause: unknown, locale: CevraLocale, operationId: string): Error {
  const code = identityErrorCode(cause);
  if (code === "SOURCE_IDENTITY_CANCELLED" || (cause instanceof Error && cause.name === "AbortError")) {
    return new MediaApplicationError("MEDIA_OPERATION_CANCELLED", locale, operationId, {}, cause);
  }
  if (code === "SOURCE_IDENTITY_OFFLINE") return new SourceTechnicalDescriptorError("SOURCE_DESCRIPTOR_SOURCE_OFFLINE", locale, operationId, cause);
  if (code === "SOURCE_IDENTITY_CHANGED") return new SourceTechnicalDescriptorError("SOURCE_CONTENT_CHANGED", locale, operationId, cause);
  return new SourceTechnicalDescriptorError("SOURCE_DESCRIPTOR_IDENTITY_UNAVAILABLE", locale, operationId, cause);
}

function resolutionError(result: SourceFileCheckResult, locale: CevraLocale, operationId: string): SourceTechnicalDescriptorError {
  if (result === "missing") return new SourceTechnicalDescriptorError("SOURCE_DESCRIPTOR_SOURCE_OFFLINE", locale, operationId);
  if (result === "changed") return new SourceTechnicalDescriptorError("SOURCE_CONTENT_CHANGED", locale, operationId);
  return new SourceTechnicalDescriptorError("SOURCE_DESCRIPTOR_IDENTITY_UNAVAILABLE", locale, operationId);
}

function abortError(): Error {
  return Object.assign(new Error("Source identity operation was cancelled."), { name: "AbortError", code: "SOURCE_IDENTITY_CANCELLED" });
}

function isActor(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, ["type", "id"])
    || !["user", "agent", "system"].includes(String(value.type))) return false;
  return value.id === undefined || (typeof value.id === "string" && value.id.trim().length > 0);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const accepted = new Set(allowed);
  return Object.keys(value).every((key) => accepted.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((item, index) => structurallyEqual(item, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && structurallyEqual(left[key], right[key]));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function defaultId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `source_descriptor_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
