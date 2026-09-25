import {
  validateAudioMeasurementReport,
  validateMediaOperation,
  type MediaOperation,
  type MediaOperationResult,
  type MediaPublicationEvidenceV1
} from "@cevra/contracts";
import type { JournalActor } from "@cevra/project-ir";
import type {
  MediaExecutionAttempt,
  MediaExecutionIntentStatus,
  MediaExecutionIntentV1,
  MediaExecutionRecord,
  MediaExecutionStatus,
  MediaOutputExpectation,
  MediaProjectBinding,
  MediaProjectMutation
} from "./types.js";
import { mediaOperationOutputUris } from "./media-operation.js";

export const MAX_MEDIA_EXECUTION_RECORDS = 4_096;
export const MAX_MEDIA_EXECUTION_INTENTS = 1_024;
export const MAX_MEDIA_EXECUTION_ARCHIVE_BYTES = 8 * 1024 * 1024;

export interface PersistedMediaExecutionArchiveV1 {
  version: 1;
  projectId: string;
  records: MediaExecutionRecord[];
  intents: MediaExecutionIntentV1[];
}

const EXECUTION_STATUSES = new Set<MediaExecutionStatus>([
  "requested", "running", "committing", "succeeded", "failed", "cancelled", "interrupted"
]);
const INTENT_STATUSES = new Set<MediaExecutionIntentStatus>([
  "requested", "audio-running", "audio-succeeded", "mux-running", "application-committed",
  "durable-succeeded", "interrupted", "recovery-incomplete"
]);
const ERROR_CODES = new Set([
  "MEDIA_OPERATION_CANCELLED", "MEDIA_OPERATION_INTERRUPTED", "MEDIA_OPERATION_FAILED", "MEDIA_OUTPUT_EXISTS",
  "MEDIA_OUTPUT_MISSING", "MEDIA_OPERATION_NOT_FOUND", "MEDIA_OPERATION_NOT_RETRYABLE", "MEDIA_PROJECT_CONFLICT",
  "MEDIA_INVALID_REQUEST", "MEDIA_PROJECT_COMMIT_FAILED", "MEDIA_RECOVERY_FAILED",
  "SOURCE_CONTENT_CHANGED", "SOURCE_OFFLINE", "SOURCE_VERIFICATION_UNAVAILABLE"
]);

export function validatePersistedMediaExecutionArchive(value: unknown): PersistedMediaExecutionArchiveV1 {
  object(value, ["version", "projectId", "records", "intents"], "media execution archive");
  if (value.version !== 1 || !identifier(value.projectId) || !Array.isArray(value.records)
    || !Array.isArray(value.intents) || value.records.length > MAX_MEDIA_EXECUTION_RECORDS
    || value.intents.length > MAX_MEDIA_EXECUTION_INTENTS) {
    throw new Error("Invalid media execution archive.");
  }
  const records = value.records.map(validateRecord);
  const intents = value.intents.map(validateIntent);
  unique(records.map(({ id }) => id), "media execution record id");
  unique(intents.map(({ id }) => id), "media execution intent id");
  if (records.some((record) => record.projectId !== value.projectId)
    || intents.some((intent) => intent.projectId !== value.projectId)) {
    throw new Error("Media execution archive project binding is invalid.");
  }
  return clone({ version: 1, projectId: value.projectId, records, intents });
}

export function validateMediaExecutionRecord(value: unknown): MediaExecutionRecord {
  return clone(validateRecord(value));
}

export function validateMediaExecutionIntent(value: unknown): MediaExecutionIntentV1 {
  return clone(validateIntent(value));
}

function validateRecord(value: unknown): MediaExecutionRecord {
  object(value, ["id", "projectId", "locale", "operation", "mutation", "actor", "projectBinding", "expectedOutput", "status", "createdAt", "attempts"], "media execution record");
  if (!identifier(value.id) || !identifier(value.projectId) || (value.locale !== "pt-BR" && value.locale !== "en-US")
    || !EXECUTION_STATUSES.has(value.status as MediaExecutionStatus) || !timestamp(value.createdAt)
    || !Array.isArray(value.attempts) || value.attempts.length > 128) {
    throw new Error("Invalid media execution record.");
  }
  const operation = validateMediaOperation(value.operation);
  const mutation = validateMutation(value.mutation);
  const actor = validateActor(value.actor);
  const projectBinding = value.projectBinding === undefined ? undefined : validateBinding(value.projectBinding);
  const expectedOutput = value.expectedOutput === undefined ? undefined : validateExpectation(value.expectedOutput);
  const attempts = value.attempts.map((attempt) => validateAttempt(attempt, operation));
  return {
    id: value.id,
    projectId: value.projectId,
    locale: value.locale,
    operation: clone(operation),
    mutation,
    actor,
    ...(projectBinding ? { projectBinding } : {}),
    ...(expectedOutput ? { expectedOutput } : {}),
    status: value.status as MediaExecutionStatus,
    createdAt: value.createdAt,
    attempts
  };
}

function validateAttempt(value: unknown, operation: MediaOperation): MediaExecutionAttempt {
  object(value, [
    "number", "jobId", "status", "requestedAt", "startedAt", "completedAt", "outputUris",
    "preexistingOutputUris", "ownedOutputUris", "ownedOutputPublications", "removedPartialOutputUris",
    "cleanupFailedOutputUris", "projectRevisionBefore", "projectSnapshotBefore", "projectRevisionAfter",
    "projectSnapshotAfter", "projectJournalEntryId", "result", "provenance", "effectiveProfile",
    "errorCode", "technicalError"
  ], "media execution attempt");
  if (!positiveInteger(value.number) || !identifier(value.jobId) || !EXECUTION_STATUSES.has(value.status as MediaExecutionStatus)
    || !timestamp(value.requestedAt) || (value.startedAt !== undefined && !timestamp(value.startedAt))
    || (value.completedAt !== undefined && !timestamp(value.completedAt)) || !nonNegativeInteger(value.projectRevisionBefore)
    || (value.projectRevisionAfter !== undefined && !nonNegativeInteger(value.projectRevisionAfter))) {
    throw new Error("Invalid media execution attempt.");
  }
  const outputUris = stringArray(value.outputUris, 32, "output URIs");
  const preexistingOutputUris = stringArray(value.preexistingOutputUris, 32, "preexisting output URIs");
  const ownedOutputUris = stringArray(value.ownedOutputUris, 32, "owned output URIs");
  const removedPartialOutputUris = stringArray(value.removedPartialOutputUris, 32, "removed output URIs");
  const cleanupFailedOutputUris = stringArray(value.cleanupFailedOutputUris, 32, "cleanup-failed output URIs");
  const expectedOutputUris = mediaOperationOutputUris(operation);
  if (!sameStrings(outputUris, expectedOutputUris)) throw new Error("Media execution output URIs do not match the operation.");
  for (const [name, values] of [
    ["preexisting", preexistingOutputUris],
    ["owned", ownedOutputUris],
    ["removed", removedPartialOutputUris],
    ["cleanup-failed", cleanupFailedOutputUris]
  ] as const) {
    assertOutputSubset(values, expectedOutputUris, `${name} output URIs`);
  }
  let ownedOutputPublications: MediaExecutionAttempt["ownedOutputPublications"];
  if (value.ownedOutputPublications !== undefined) {
    if (!Array.isArray(value.ownedOutputPublications) || value.ownedOutputPublications.length > 32) throw new Error("Invalid publication evidence list.");
    ownedOutputPublications = value.ownedOutputPublications.map((item) => {
      object(item, ["uri", "evidence"], "owned publication");
      if (!boundedString(item.uri, 4096)) throw new Error("Invalid owned publication URI.");
      if (!expectedOutputUris.includes(item.uri)) throw new Error("Owned publication URI is not an operation output.");
      return { uri: item.uri, evidence: validatePublication(item.evidence) };
    });
    unique(ownedOutputPublications.map(({ uri }) => uri), "owned publication URI");
  }
  const result = value.result === undefined ? undefined : validateResult(value.result, operation, value.jobId);
  const provenance = value.provenance === undefined ? undefined : validateProvenance(value.provenance);
  const effectiveProfile = value.effectiveProfile === undefined ? undefined : validateEffectiveProfile(value.effectiveProfile);
  if (value.projectSnapshotBefore !== undefined && !identifier(value.projectSnapshotBefore)
    || value.projectSnapshotAfter !== undefined && !identifier(value.projectSnapshotAfter)
    || value.projectJournalEntryId !== undefined && !identifier(value.projectJournalEntryId)
    || value.errorCode !== undefined && !ERROR_CODES.has(String(value.errorCode))
    || value.technicalError !== undefined && !boundedString(value.technicalError, 16_384)) {
    throw new Error("Invalid media execution attempt metadata.");
  }
  return {
    number: value.number,
    jobId: value.jobId,
    status: value.status as MediaExecutionStatus,
    requestedAt: value.requestedAt,
    ...(value.startedAt !== undefined ? { startedAt: value.startedAt } : {}),
    ...(value.completedAt !== undefined ? { completedAt: value.completedAt } : {}),
    outputUris,
    preexistingOutputUris,
    ownedOutputUris,
    ...(ownedOutputPublications ? { ownedOutputPublications } : {}),
    removedPartialOutputUris,
    cleanupFailedOutputUris,
    projectRevisionBefore: value.projectRevisionBefore,
    ...(value.projectSnapshotBefore !== undefined ? { projectSnapshotBefore: value.projectSnapshotBefore } : {}),
    ...(value.projectRevisionAfter !== undefined ? { projectRevisionAfter: value.projectRevisionAfter } : {}),
    ...(value.projectSnapshotAfter !== undefined ? { projectSnapshotAfter: value.projectSnapshotAfter } : {}),
    ...(value.projectJournalEntryId !== undefined ? { projectJournalEntryId: value.projectJournalEntryId } : {}),
    ...(result ? { result } : {}),
    ...(provenance ? { provenance } : {}),
    ...(effectiveProfile ? { effectiveProfile } : {}),
    ...(value.errorCode !== undefined ? { errorCode: value.errorCode as NonNullable<MediaExecutionAttempt["errorCode"]> } : {}),
    ...(value.technicalError !== undefined ? { technicalError: value.technicalError } : {})
  };
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertOutputSubset(values: readonly string[], expected: readonly string[], label: string): void {
  unique(values, label);
  if (values.some((value) => !expected.includes(value))) throw new Error(`${label} contain a URI outside the operation outputs.`);
}

function validateIntent(value: unknown): MediaExecutionIntentV1 {
  object(value, ["version", "id", "kind", "projectId", "projectBinding", "status", "childExecutionIds", "exportIntent", "createdAt", "updatedAt", "reconciledAt", "cleanupUncertainUris"], "media execution intent");
  if (value.version !== 1 || value.kind !== "resolved-audio-plan" || !identifier(value.id) || !identifier(value.projectId)
    || !INTENT_STATUSES.has(value.status as MediaExecutionIntentStatus) || !timestamp(value.createdAt)
    || !timestamp(value.updatedAt) || (value.reconciledAt !== undefined && !timestamp(value.reconciledAt))) {
    throw new Error("Invalid media execution intent.");
  }
  object(value.childExecutionIds, ["audio", "mux"], "child execution ids");
  object(value.exportIntent, ["exportId", "presetId", "expectedOutputUri"], "export intent");
  if (!identifier(value.childExecutionIds.audio) || !identifier(value.childExecutionIds.mux)
    || !identifier(value.exportIntent.exportId) || !identifier(value.exportIntent.presetId)
    || !boundedString(value.exportIntent.expectedOutputUri, 4096)) {
    throw new Error("Invalid media execution intent references.");
  }
  return {
    version: 1,
    id: value.id,
    kind: "resolved-audio-plan",
    projectId: value.projectId,
    projectBinding: validateBinding(value.projectBinding),
    status: value.status as MediaExecutionIntentStatus,
    childExecutionIds: { audio: value.childExecutionIds.audio, mux: value.childExecutionIds.mux },
    exportIntent: {
      exportId: value.exportIntent.exportId,
      presetId: value.exportIntent.presetId,
      expectedOutputUri: value.exportIntent.expectedOutputUri
    },
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...(value.reconciledAt !== undefined ? { reconciledAt: value.reconciledAt } : {}),
    ...(value.cleanupUncertainUris !== undefined ? { cleanupUncertainUris: stringArray(value.cleanupUncertainUris, 64, "cleanup uncertainty URIs") } : {})
  };
}

function validateResult(value: unknown, operation: MediaOperation, jobId: string): MediaOperationResult {
  if (!isRecord(value) || typeof value.type !== "string") throw new Error("Invalid media result.");
  if (value.type === "measure-audio") {
    object(value, ["type", "report"], "audio measurement result");
    if (operation.type !== "measure-audio") throw new Error("Measurement result does not match operation.");
    validateAudioMeasurementReport(value.report, operation, jobId);
    return clone(value as unknown as MediaOperationResult);
  }
  if (value.type === "probe") {
    object(value, ["type", "probe"], "probe result");
    if (operation.type !== "probe") throw new Error("Probe result does not match operation.");
    return { type: "probe", probe: validateProbe(value.probe) };
  }
  if (value.type === "detect-silence") {
    object(value, ["type", "ranges"], "silence result");
    if (operation.type !== "detect-silence") throw new Error("Silence result does not match operation.");
    if (!Array.isArray(value.ranges) || value.ranges.length > 100_000) throw new Error("Invalid silence result.");
    return { type: "detect-silence", ranges: value.ranges.map((range) => {
      object(range, ["startMs", "endMs"], "silence range");
      if (!nonNegativeNumber(range.startMs) || (range.endMs !== null && !nonNegativeNumber(range.endMs))) throw new Error("Invalid silence range.");
      return { startMs: range.startMs, endMs: range.endMs };
    }) };
  }
  if (value.type !== "file") throw new Error("Unknown media result type.");
  if (operation.type === "probe" || operation.type === "measure-audio" || operation.type === "detect-silence") {
    throw new Error("File result does not match operation.");
  }
  object(value, ["type", "outputUri", "durationMs", "probe", "effectiveProfile", "audioSequence", "publication", "muxDuration"], "file result");
  if (!boundedString(value.outputUri, 4096) || (value.durationMs !== undefined && !nonNegativeNumber(value.durationMs))) throw new Error("Invalid file result.");
  const audioSequence = value.audioSequence === undefined ? undefined : validateAudioSequenceEvidence(value.audioSequence);
  const muxDuration = value.muxDuration === undefined ? undefined : validateMuxDurationEvidence(value.muxDuration);
  return {
    type: "file",
    outputUri: value.outputUri,
    ...(value.durationMs !== undefined ? { durationMs: value.durationMs } : {}),
    probe: validateProbe(value.probe),
    effectiveProfile: validateEffectiveProfile(value.effectiveProfile),
    ...(audioSequence ? { audioSequence: clone(audioSequence) as unknown as NonNullable<Extract<MediaOperationResult, { type: "file" }>["audioSequence"]> } : {}),
    ...(value.publication !== undefined ? { publication: validatePublication(value.publication) } : {}),
    ...(muxDuration ? { muxDuration: clone(muxDuration) as unknown as NonNullable<Extract<MediaOperationResult, { type: "file" }>["muxDuration"]> } : {})
  };
}

function validateProbe(value: unknown): Extract<MediaOperationResult, { type: "probe" }>["probe"] {
  const fields = ["uri", "sizeBytes", "durationMs", "width", "height", "frameRate", "avgFrameRate", "rFrameRate", "variableFrameRateSuspected", "rotationDegrees", "pixelFormat", "bitDepth", "colorSpace", "colorPrimaries", "colorTransfer", "colorRange", "hdr", "hdrFormat", "hasVideo", "hasAudio", "videoCodec", "audioCodec", "sampleRate", "channels"];
  object(value, fields, "media probe");
  if (!boundedString(value.uri, 4096) || typeof value.hasVideo !== "boolean" || typeof value.hasAudio !== "boolean") throw new Error("Invalid media probe.");
  for (const key of ["sizeBytes", "durationMs", "width", "height", "bitDepth", "sampleRate", "channels"] as const) {
    if (value[key] !== undefined && !nonNegativeNumber(value[key])) throw new Error(`Invalid media probe ${key}.`);
  }
  for (const key of ["frameRate", "rotationDegrees"] as const) {
    if (value[key] !== undefined && (typeof value[key] !== "number" || !Number.isFinite(value[key]))) throw new Error(`Invalid media probe ${key}.`);
  }
  for (const key of ["avgFrameRate", "rFrameRate", "pixelFormat", "colorSpace", "colorPrimaries", "colorTransfer", "colorRange", "hdrFormat", "videoCodec", "audioCodec"] as const) {
    if (value[key] !== undefined && !boundedString(value[key], 256)) throw new Error(`Invalid media probe ${key}.`);
  }
  for (const key of ["variableFrameRateSuspected", "hdr"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") throw new Error(`Invalid media probe ${key}.`);
  }
  return clone(value as unknown as Extract<MediaOperationResult, { type: "probe" }>["probe"]);
}

function validateEffectiveProfile(value: unknown): Extract<MediaOperationResult, { type: "file" }>["effectiveProfile"] {
  object(value, ["container", "videoCodec", "audioCodec", "videoEncoder", "audioEncoder"], "effective media profile");
  if (!new Set(["mp4", "mov", "mkv", "wav", "m4a", "png"]).has(String(value.container))) throw new Error("Invalid effective media profile.");
  for (const key of ["videoCodec", "audioCodec", "videoEncoder", "audioEncoder"] as const) {
    if (value[key] !== undefined && !boundedString(value[key], 256)) throw new Error(`Invalid effective media profile ${key}.`);
  }
  return clone(value as unknown as Extract<MediaOperationResult, { type: "file" }>["effectiveProfile"]);
}

function validateAudioSequenceEvidence(value: unknown): NonNullable<Extract<MediaOperationResult, { type: "file" }>["audioSequence"]> {
  object(value, ["version", "sampleRate", "sampleFormat", "channelLayout", "distinctSourceCount", "itemCount", "maximumSimultaneousItemCount", "outputSampleCount", "estimatedDataBytes", "measuredDataBytes", "graphBytes"], "audio sequence evidence");
  if (value.version !== 1 || value.sampleRate !== 48_000 || value.sampleFormat !== "pcm_f32le"
    || (value.channelLayout !== "mono" && value.channelLayout !== "stereo")) throw new Error("Invalid audio sequence evidence.");
  for (const key of ["distinctSourceCount", "itemCount", "maximumSimultaneousItemCount", "outputSampleCount", "estimatedDataBytes", "measuredDataBytes", "graphBytes"] as const) {
    if (!nonNegativeInteger(value[key])) throw new Error(`Invalid audio sequence evidence ${key}.`);
  }
  return clone(value as unknown as NonNullable<Extract<MediaOperationResult, { type: "file" }>["audioSequence"]>);
}

function validateMuxDurationEvidence(value: unknown): NonNullable<Extract<MediaOperationResult, { type: "file" }>["muxDuration"]> {
  object(value, ["version", "inputVideoDurationMs", "inputAudioDurationMs", "outputVideoDurationMs", "outputAudioDurationMs"], "mux duration evidence");
  if (value.version !== 1) throw new Error("Invalid mux duration evidence.");
  for (const key of ["inputVideoDurationMs", "inputAudioDurationMs", "outputVideoDurationMs", "outputAudioDurationMs"] as const) {
    if (!nonNegativeNumber(value[key])) throw new Error(`Invalid mux duration evidence ${key}.`);
  }
  return clone(value as unknown as NonNullable<Extract<MediaOperationResult, { type: "file" }>["muxDuration"]>);
}

function validatePublication(value: unknown): MediaPublicationEvidenceV1 {
  object(value, ["version", "scheme", "device", "inode"], "publication evidence");
  if (value.version !== 1 || value.scheme !== "posix-dev-inode" || !/^[0-9]+$/u.test(String(value.device)) || !/^[0-9]+$/u.test(String(value.inode))) {
    throw new Error("Invalid publication evidence.");
  }
  return { version: 1, scheme: "posix-dev-inode", device: value.device as string, inode: value.inode as string };
}

function validateMutation(value: unknown): MediaProjectMutation {
  if (!isRecord(value) || typeof value.type !== "string") throw new Error("Invalid media mutation.");
  if (value.type === "none") { object(value, ["type"], "media mutation"); return { type: "none" }; }
  if (value.type === "export.add") {
    object(value, ["type", "exportId", "presetId"], "export mutation");
    if (!identifier(value.exportId) || !identifier(value.presetId)) throw new Error("Invalid export mutation.");
    return { type: "export.add", exportId: value.exportId, presetId: value.presetId };
  }
  if (value.type !== "source.add") throw new Error("Unknown media mutation.");
  object(value, ["type", "source"], "source mutation");
  object(value.source, ["id", "kind", "displayName", "checksum", "extensions"], "source mutation value");
  if (!identifier(value.source.id) || !["video", "audio", "image"].includes(String(value.source.kind))
    || !boundedString(value.source.displayName, 4096) || (value.source.checksum !== undefined && !boundedString(value.source.checksum, 4096))) {
    throw new Error("Invalid source mutation.");
  }
  if (value.source.extensions !== undefined) jsonSafe(value.source.extensions);
  return clone(value as unknown as MediaProjectMutation);
}

function validateBinding(value: unknown): MediaProjectBinding {
  object(value, ["projectId", "projectRevision", "projectSnapshotId", "projectJournalEntryCount"], "project binding");
  if (!identifier(value.projectId) || !nonNegativeInteger(value.projectRevision) || !identifier(value.projectSnapshotId)
    || !nonNegativeInteger(value.projectJournalEntryCount)) throw new Error("Invalid project binding.");
  return value as unknown as MediaProjectBinding;
}

function validateExpectation(value: unknown): MediaOutputExpectation {
  object(value, ["durationMs", "durationToleranceMs"], "output expectation");
  if (!positiveInteger(value.durationMs) || !nonNegativeInteger(value.durationToleranceMs)) throw new Error("Invalid output expectation.");
  return value as unknown as MediaOutputExpectation;
}

function validateActor(value: unknown): JournalActor {
  object(value, ["type", "id"], "journal actor");
  if (!new Set(["user", "agent", "system"]).has(String(value.type)) || (value.id !== undefined && !identifier(value.id))) throw new Error("Invalid journal actor.");
  return clone(value as unknown as JournalActor);
}

function validateProvenance(value: unknown): MediaExecutionAttempt["provenance"] {
  object(value, ["engineId", "engineVersion", "engineApiVersion", "engineDisplayName"], "execution provenance");
  if (![value.engineId, value.engineVersion, value.engineDisplayName].every((item) => boundedString(item, 1024)) || !positiveInteger(value.engineApiVersion)) {
    throw new Error("Invalid execution provenance.");
  }
  return clone(value as unknown as NonNullable<MediaExecutionAttempt["provenance"]>);
}

function object(value: unknown, allowed: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const fields = new Set(allowed);
  const extras = Object.keys(value).filter((key) => !fields.has(key));
  if (extras.length) throw new Error(`${label} contains unexpected fields: ${extras.sort().join(", ")}.`);
}

function stringArray(value: unknown, maximum: number, label: string): string[] {
  if (!Array.isArray(value) || value.length > maximum || value.some((item) => !boundedString(item, 4096))) throw new Error(`Invalid ${label}.`);
  return [...value] as string[];
}

function identifier(value: unknown): value is string { return boundedString(value, 256) && !/[\0\r\n]/u.test(value); }
function boundedString(value: unknown, maximum: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= maximum; }
function timestamp(value: unknown): value is string { return boundedString(value, 64) && Number.isFinite(Date.parse(value)); }
function nonNegativeInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function positiveInteger(value: unknown): value is number { return nonNegativeInteger(value) && value > 0; }
function nonNegativeNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0; }

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}.`);
}

function jsonSafe(value: unknown): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("Archive contains a non-finite number."); return; }
  if (Array.isArray(value)) { for (const item of value) jsonSafe(item); return; }
  if (!isRecord(value)) throw new Error("Archive contains a non-JSON value.");
  for (const item of Object.values(value)) jsonSafe(item);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
