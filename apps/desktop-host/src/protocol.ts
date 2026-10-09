import type { ProjectIR, SourceNumberingV1 } from "@cevra/project-ir";
import type { ReviseEditorialDraftRequest } from "@cevra/application";
import type { LocalVideoPreviewRequest, SourceThumbnailRequest, CreateManualVideoClipRequest, TrimManualVideoClipRequest } from "@cevra/application";
import { validateManualVideoSequenceEdit, type ManualVideoSequenceEdit } from "@cevra/application";
import { validateManualExportPreparationRequest, type ManualExportPreparationRequest } from "@cevra/application";

export const DESKTOP_HOST_PROTOCOL_VERSION = 1 as const;
export const DESKTOP_HOST_IDENTITY = "cevra.desktop-host" as const;
export const DESKTOP_HOST_VERSION = "0.1.0" as const;
export const MAX_JSONL_MESSAGE_BYTES = 32 * 1024 * 1024;
export const MAX_REQUEST_ID_LENGTH = 128;
export const MAX_OPERATION_ID_LENGTH = 128;

export type HostMethod =
  | "host.hello"
  | "host.status"
  | "host.shutdown"
  | "host.prepareClose"
  | "host.cancelClose"
  | "project.snapshot"
  | "project.checkpoint"
  | "editorial.snapshot"
  | "editorial.revise"
  | "media.ingestLocal"
  | "video.previewLocal"
  | "video.thumbnailLocal"
  | "video.prepareManualExport"
  | "video.exportManualSequence"
  | "video.previewManualSequenceConform"
  | "video.trimManualClip"
  | "video.createManualClip"
  | "video.editManualSequence"
  | "transcription.transcribeSource"
  | "history.undo"
  | "history.redo"
  | "operation.cancel";

export type CapabilityReason =
  | "available"
  | "runtime-not-configured"
  | "runtime-invalid"
  | "archive-unavailable"
  | "archive-full"
  | "model-not-available"
  | "host-unavailable"
  | "review-session";

export interface CapabilityState {
  available: boolean;
  reason: CapabilityReason;
}

export interface DesktopHostState {
  project: ProjectIR;
  sourceNumbering: SourceNumberingV1;
  canUndo: boolean;
  canRedo: boolean;
  status: {
    hostAvailable: true;
    persistence: "local-unsaved" | "local-saved" | "local-recovered" | "persistence-error" | "checkpoint-pending" | "temporary-review";
  };
  checkpoint?: { token: string; pending: boolean };
  closePending?: boolean;
  capabilities: {
    mediaImport: CapabilityState;
    transcription: CapabilityState;
    manualExport?: CapabilityState;
  };
}

export interface HostRequest {
  protocolVersion: typeof DESKTOP_HOST_PROTOCOL_VERSION;
  id: string;
  method: HostMethod;
  params: Record<string, unknown>;
}

export interface HostErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type HostResponse =
  | { protocolVersion: typeof DESKTOP_HOST_PROTOCOL_VERSION; id: string; result: unknown }
  | { protocolVersion: typeof DESKTOP_HOST_PROTOCOL_VERSION; id: string; error: HostErrorPayload };

const METHODS = new Set<HostMethod>([
  "host.hello",
  "host.status",
  "host.shutdown",
  "host.prepareClose",
  "host.cancelClose",
  "project.snapshot",
  "project.checkpoint",
  "editorial.snapshot",
  "editorial.revise",
  "media.ingestLocal",
  "video.previewLocal",
  "video.thumbnailLocal",
  "video.prepareManualExport",
  "video.exportManualSequence",
  "video.previewManualSequenceConform",
  "video.createManualClip",
  "video.trimManualClip",
  "video.editManualSequence",
  "transcription.transcribeSource",
  "history.undo",
  "history.redo",
  "operation.cancel"
]);

export class ProtocolValidationError extends Error {
  constructor(readonly code: string, message: string, readonly requestId = "invalid") {
    super(message);
    this.name = "ProtocolValidationError";
  }
}

export function parseRequest(line: string): HostRequest {
  let value: unknown;
  try {
    value = JSON.parse(line) as unknown;
  } catch {
    throw new ProtocolValidationError("HOST_MALFORMED_REQUEST", "The desktop host request is malformed.");
  }
  if (!isRecord(value)) throw new ProtocolValidationError("HOST_MALFORMED_REQUEST", "The desktop host request must be an object.");
  const candidateId = validBoundedString(value.id, MAX_REQUEST_ID_LENGTH) ? value.id : "invalid";
  exactKeys(value, ["protocolVersion", "id", "method", "params"], candidateId);
  if (value.protocolVersion !== DESKTOP_HOST_PROTOCOL_VERSION) {
    throw new ProtocolValidationError("HOST_PROTOCOL_MISMATCH", "The desktop host protocol version is unsupported.", candidateId);
  }
  if (!validBoundedString(value.id, MAX_REQUEST_ID_LENGTH) || /[\u0000-\u001f\u007f]/u.test(value.id)) {
    throw new ProtocolValidationError("HOST_INVALID_REQUEST_ID", "The desktop host request ID is invalid.");
  }
  if (typeof value.method !== "string" || !METHODS.has(value.method as HostMethod)) {
    throw new ProtocolValidationError("HOST_UNKNOWN_METHOD", "The desktop host method is not allow-listed.", value.id);
  }
  if (!isRecord(value.params)) {
    throw new ProtocolValidationError("HOST_INVALID_PARAMS", "The desktop host params must be an object.", value.id);
  }
  return {
    protocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
    id: value.id,
    method: value.method as HostMethod,
    params: value.params
  };
}

export function validateNoParams(params: Record<string, unknown>, id: string): void {
  exactKeys(params, [], id);
}

export function validateCheckpointParams(params: Record<string, unknown>, id: string): string {
  exactKeys(params, ["expectedToken"], id);
  if (typeof params.expectedToken !== "string" || !/^checkpoint-v1:[0-9a-f]{64}$/u.test(params.expectedToken)) {
    throw new ProtocolValidationError("HOST_INVALID_PARAMS", "Checkpoint token is invalid.", id);
  }
  return params.expectedToken;
}

export function validateCloseParams(params: Record<string, unknown>, id: string): string {
  exactKeys(params, ["attemptId"], id);
  return operationId(params.attemptId, id);
}

export function validateEditorialRevisionParams(params: Record<string, unknown>, id: string): ReviseEditorialDraftRequest {
  exactKeys(params, ["expectedRevision", "title", "blockOrder", "blockEdits"], id);
  // The Application service validates the closed revision schema, sizes and IDs.
  // No analysis, draft object, source, command or admission field is accepted here.
  return params as unknown as ReviseEditorialDraftRequest;
}

export function validateIngestParams(params: Record<string, unknown>, id: string): {
  uri: string;
  displayName: string;
  operationId: string;
  locale: "pt-BR" | "en-US";
} {
  exactKeys(params, ["uri", "displayName", "operationId", "locale"], id);
  return {
    uri: boundedString(params.uri, 8192, "uri", id),
    displayName: boundedString(params.displayName, 1024, "displayName", id),
    operationId: operationId(params.operationId, id),
    locale: locale(params.locale, id)
  };
}

export function validateTranscriptionParams(params: Record<string, unknown>, id: string): {
  sourceId: string;
  operationId: string;
  locale: "pt-BR" | "en-US";
} {
  exactKeys(params, ["sourceId", "operationId", "locale"], id);
  return {
    sourceId: boundedString(params.sourceId, 1024, "sourceId", id),
    operationId: operationId(params.operationId, id),
    locale: locale(params.locale, id)
  };
}

export function validateCancelParams(params: Record<string, unknown>, id: string): { operationId: string } {
  exactKeys(params, ["operationId"], id);
  return { operationId: operationId(params.operationId, id) };
}

/** Trusted native route. No command takes a WebView-supplied destination. */
export function validateManualExportParams(params: Record<string, unknown>, id: string): { request: ManualExportPreparationRequest; destinationUri: string } {
  exactKeys(params, ["version", "expectedSnapshotId", "operationId", "locale", "destinationUri"], id);
  const { destinationUri, ...request } = params;
  const stable = validateManualExportPreparationRequest(request);
  return { request: stable, destinationUri: boundedString(destinationUri, 8192, "destinationUri", id) };
}

export function validateConformPreviewParams(params: Record<string, unknown>, id: string): { version: 1; expectedSnapshotId: string } {
  exactKeys(params, ["version", "expectedSnapshotId"], id);
  if (params.version !== 1) throw new ProtocolValidationError("HOST_INVALID_PARAMS", "Conform preview version is invalid.", id);
  return { version: 1, expectedSnapshotId: boundedString(params.expectedSnapshotId, 128, "expectedSnapshotId", id) };
}

export function validateVideoThumbnailParams(params: Record<string, unknown>, id: string): SourceThumbnailRequest {
  exactKeys(params, ["sourceId", "expectedSnapshotId", "operationId"], id);
  return { ...videoBinding(params, id), operationId: operationId(params.operationId, id) };
}

export function validateVideoPreviewParams(params: Record<string, unknown>, id: string): LocalVideoPreviewRequest {
  exactKeys(params, ["sourceId", "expectedSnapshotId", "clipId", "operationId", "sequence"], id);
  if (params.sequence !== undefined && (params.sequence !== true || params.clipId !== undefined || params.operationId === undefined)) throw new ProtocolValidationError("HOST_INVALID_PARAMS", "Sequence preview binding is invalid.", id);
  if (params.clipId === undefined && params.operationId === undefined) return videoBinding(params, id);
  return { ...videoBinding(params, id), ...(params.sequence === true ? { sequence: true as const } : {}), ...(params.clipId === undefined ? {} : { clipId: boundedString(params.clipId, 128, "clipId", id) }), operationId: operationId(params.operationId, id) };
}

export function validateManualClipParams(params: Record<string, unknown>, id: string): CreateManualVideoClipRequest {
  exactKeys(params, ["sourceId", "expectedSnapshotId", "sourceStartMs", "sourceEndMs"], id);
  if (!Number.isSafeInteger(params.sourceStartMs) || !Number.isSafeInteger(params.sourceEndMs)
    || (params.sourceStartMs as number) < 0 || (params.sourceEndMs as number) <= (params.sourceStartMs as number)) {
    throw new ProtocolValidationError("HOST_INVALID_PARAMS", "The manual video range is invalid.", id);
  }
  return { ...videoBinding(params, id), sourceStartMs: params.sourceStartMs as number, sourceEndMs: params.sourceEndMs as number };
}

export function validateManualTrimParams(params: Record<string, unknown>, id: string): TrimManualVideoClipRequest {
  exactKeys(params, ["clipId", "expectedSnapshotId", "sourceStartMs", "sourceEndMs"], id);
  if (!Number.isSafeInteger(params.sourceStartMs) || !Number.isSafeInteger(params.sourceEndMs)
    || (params.sourceStartMs as number) < 0 || (params.sourceEndMs as number) <= (params.sourceStartMs as number)) {
    throw new ProtocolValidationError("HOST_INVALID_PARAMS", "The manual video range is invalid.", id);
  }
  return { clipId: boundedString(params.clipId, 128, "clipId", id),
    expectedSnapshotId: boundedString(params.expectedSnapshotId, 128, "expectedSnapshotId", id),
    sourceStartMs: params.sourceStartMs as number, sourceEndMs: params.sourceEndMs as number };
}

export function validateManualSequenceParams(params: Record<string, unknown>, id: string): ManualVideoSequenceEdit {
  const stable = validateManualVideoSequenceEdit(params as unknown as ManualVideoSequenceEdit);
  // The Application owns intent/range validation; protocol IDs remain bounded.
  for (const [key, value] of Object.entries(stable)) {
    if (key.endsWith("Id")) boundedString(value, 128, key, id);
    if (key === "clipIds") for (const clipId of value as string[]) boundedString(clipId, 128, "clipId", id);
  }
  return stable;
}

function videoBinding(params: Record<string, unknown>, id: string): LocalVideoPreviewRequest {
  return { sourceId: boundedString(params.sourceId, 128, "sourceId", id), expectedSnapshotId: boundedString(params.expectedSnapshotId, 128, "expectedSnapshotId", id) };
}

function operationId(value: unknown, id: string): string {
  return boundedString(value, MAX_OPERATION_ID_LENGTH, "operationId", id);
}

function locale(value: unknown, id: string): "pt-BR" | "en-US" {
  if (value !== "pt-BR" && value !== "en-US") {
    throw new ProtocolValidationError("HOST_INVALID_PARAMS", "locale is unsupported.", id);
  }
  return value;
}

function boundedString(value: unknown, maximum: number, field: string, id: string): string {
  if (!validBoundedString(value, maximum) || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new ProtocolValidationError("HOST_INVALID_PARAMS", `${field} is invalid.`, id);
  }
  return value;
}

function validBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], id: string): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new ProtocolValidationError("HOST_INVALID_PARAMS", "The desktop host request contains unsupported fields.", id);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
