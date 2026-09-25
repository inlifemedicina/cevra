import type { EngineAdapter, ExecutionContext } from "./base.js";
import type { MeasureAudioOperationV1, AudioMeasurementReportV1 } from "./audio-measurement.js";

export type FitMode = "contain" | "cover" | "stretch";
export type MediaContainer = "mp4" | "mov" | "mkv" | "wav" | "m4a";
export type VideoCodec = "h264" | "h265" | "av1" | "copy";
export type AudioCodec = "aac" | "opus" | "pcm" | "copy";
export type EncodedVideoCodec = Exclude<VideoCodec, "copy">;
export type EncodedAudioCodec = Exclude<AudioCodec, "copy">;

export const MIN_MEDIA_SPEED = 1 / 16;
export const MAX_MEDIA_SPEED = 16;
export const MAX_MEDIA_WIDTH = 16_384;
export const MAX_MEDIA_HEIGHT = 16_384;
export const MAX_MEDIA_FPS = 240;
export const MAX_MEDIA_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_MEDIA_INPUTS = 128;
export const MAX_MEDIA_URI_LENGTH = 32_768;
export const AUDIO_SEQUENCE_VERSION = 1 as const;
export const AUDIO_SEQUENCE_SAMPLE_RATE = 48_000 as const;
export const AUDIO_SEQUENCE_SAMPLE_FORMAT = "pcm_f32le" as const;
export const MAX_AUDIO_SEQUENCE_ITEMS = 2_048;
export const MAX_AUDIO_SEQUENCE_GAIN_DB = 24;
export const MIN_AUDIO_SEQUENCE_GAIN_DB = -120;
export const MAX_AUDIO_SEQUENCE_GRAPH_BYTES = 2 * 1024 * 1024;
export const MAX_AUDIO_SEQUENCE_INPUT_ARGUMENT_BYTES = 24 * 1024;
export const MAX_AUDIO_SEQUENCE_WAV_DATA_BYTES = 0xffff_ffff - 256;

export type AudioSequenceChannelLayout = "mono" | "stereo";

export interface AudioSequenceSource {
  id: string;
  uri: string;
}

export interface AudioSequenceItem {
  sourceId: string;
  sourceStartMs: number;
  sourceEndMs: number;
  timelineStartMs: number;
  gainDb?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
}

export interface RenderAudioSequenceOperationV1 {
  type: "render-audio-sequence";
  version: typeof AUDIO_SEQUENCE_VERSION;
  sources: AudioSequenceSource[];
  items: AudioSequenceItem[];
  outputUri: string;
  outputDurationMs: number;
  outputChannelLayout: AudioSequenceChannelLayout;
}

export interface MediaDeliveryRule {
  readonly videoCodecs: readonly EncodedVideoCodec[];
  readonly audioCodecs: readonly EncodedAudioCodec[];
  readonly defaultVideoCodec?: EncodedVideoCodec;
  readonly defaultAudioCodec: EncodedAudioCodec;
  readonly audioOnly: boolean;
}

export const MEDIA_DELIVERY_MATRIX: Readonly<Record<MediaContainer, MediaDeliveryRule>> = {
  mp4: { videoCodecs: ["h264", "h265", "av1"], audioCodecs: ["aac"], defaultVideoCodec: "h264", defaultAudioCodec: "aac", audioOnly: false },
  mov: { videoCodecs: ["h264", "h265", "av1"], audioCodecs: ["aac", "pcm"], defaultVideoCodec: "h264", defaultAudioCodec: "aac", audioOnly: false },
  mkv: { videoCodecs: ["h264", "h265", "av1"], audioCodecs: ["aac", "opus", "pcm"], defaultVideoCodec: "h264", defaultAudioCodec: "aac", audioOnly: false },
  wav: { videoCodecs: [], audioCodecs: ["pcm"], defaultAudioCodec: "pcm", audioOnly: true },
  m4a: { videoCodecs: [], audioCodecs: ["aac"], defaultAudioCodec: "aac", audioOnly: true }
};

export interface ResolvedMediaDelivery {
  container: MediaContainer;
  audioOnly: boolean;
  audioCodec: AudioCodec;
  videoCodec?: VideoCodec;
}

export interface MediaInputCodecEvidence {
  hasVideo: boolean;
  hasAudio: boolean;
  videoCodec?: string;
  audioCodec?: string;
}

export function inferMediaContainer(outputUri: string): MediaContainer | undefined {
  const path = outputUri.split(/[?#]/, 1)[0] ?? outputUri;
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return Object.hasOwn(MEDIA_DELIVERY_MATRIX, extension) ? extension as MediaContainer : undefined;
}

export function resolveMediaContainer(outputUri: string, requested?: MediaContainer): MediaContainer {
  const inferred = inferMediaContainer(outputUri);
  if (requested && inferred && requested !== inferred) {
    throw new Error(`Media container ${requested} does not match output extension .${inferred}.`);
  }
  const container = requested ?? inferred;
  if (!container) throw new Error("Media container is required or must be inferable from outputUri.");
  return container;
}

export function resolveTranscodeDelivery(input: {
  outputUri: string;
  container?: MediaContainer;
  videoCodec?: VideoCodec;
  audioCodec?: AudioCodec;
  transformsVideo?: boolean;
}): ResolvedMediaDelivery {
  const container = resolveMediaContainer(input.outputUri, input.container);
  const rule = MEDIA_DELIVERY_MATRIX[container];
  if (rule.audioOnly) {
    if (input.videoCodec !== undefined || input.transformsVideo) {
      throw new Error(`${container.toUpperCase()} is audio-only and cannot contain or transform video.`);
    }
    const audioCodec = input.audioCodec ?? rule.defaultAudioCodec;
    validateRequestedAudioCodec(container, audioCodec);
    return { container, audioOnly: true, audioCodec };
  }
  const videoCodec = input.videoCodec ?? rule.defaultVideoCodec;
  const audioCodec = input.audioCodec ?? rule.defaultAudioCodec;
  if (!videoCodec) throw new Error(`${container.toUpperCase()} has no default video codec.`);
  validateRequestedVideoCodec(container, videoCodec);
  validateRequestedAudioCodec(container, audioCodec);
  return { container, audioOnly: false, videoCodec, audioCodec };
}

export function resolveAudioDelivery(outputUri: string, audioCodec?: AudioCodec): ResolvedMediaDelivery {
  const container = resolveMediaContainer(outputUri);
  const rule = MEDIA_DELIVERY_MATRIX[container];
  const resolvedAudioCodec = audioCodec ?? rule.defaultAudioCodec;
  validateRequestedAudioCodec(container, resolvedAudioCodec);
  return { container, audioOnly: true, audioCodec: resolvedAudioCodec };
}

export function resolveStandardAvDelivery(outputUri: string, allowAudioOnly = false): ResolvedMediaDelivery {
  const container = resolveMediaContainer(outputUri);
  if (MEDIA_DELIVERY_MATRIX[container].audioOnly) {
    if (!allowAudioOnly) throw new Error(`${container.toUpperCase()} is audio-only and cannot contain video.`);
    return resolveAudioDelivery(outputUri);
  }
  return resolveTranscodeDelivery({ outputUri, videoCodec: "h264", audioCodec: "aac" });
}

export function resolveAudioMutationDelivery(outputUri: string): ResolvedMediaDelivery {
  const container = resolveMediaContainer(outputUri);
  if (MEDIA_DELIVERY_MATRIX[container].audioOnly) {
    throw new Error(`${container.toUpperCase()} is audio-only; use extract-audio or transcode with explicit video removal.`);
  }
  return resolveTranscodeDelivery({ outputUri, videoCodec: "copy", audioCodec: "aac" });
}

export function validateCopyCompatibility(delivery: ResolvedMediaDelivery, input: MediaInputCodecEvidence): void {
  const rule = MEDIA_DELIVERY_MATRIX[delivery.container];
  if (delivery.videoCodec === "copy") {
    const actual = input.hasVideo ? normalizeVideoCodec(input.videoCodec) : undefined;
    if (!actual || !rule.videoCodecs.includes(actual)) {
      throw new Error(`Input video codec cannot be copied into ${delivery.container.toUpperCase()}.`);
    }
  }
  if (delivery.audioCodec === "copy") {
    const actual = input.hasAudio ? normalizeAudioCodec(input.audioCodec) : undefined;
    if (!actual || !rule.audioCodecs.includes(actual)) {
      throw new Error(`Input audio codec cannot be copied into ${delivery.container.toUpperCase()}.`);
    }
  }
}

export function normalizeVideoCodec(codec: string | undefined): EncodedVideoCodec | undefined {
  const value = codec?.trim().toLowerCase();
  if (value === "h264" || value === "avc" || value === "avc1") return "h264";
  if (value === "h265" || value === "hevc" || value === "hev1" || value === "hvc1") return "h265";
  if (value === "av1" || value === "av01") return "av1";
  return undefined;
}

export function normalizeAudioCodec(codec: string | undefined): EncodedAudioCodec | undefined {
  const value = codec?.trim().toLowerCase();
  if (value === "aac") return "aac";
  if (value === "opus") return "opus";
  if (value?.startsWith("pcm_")) return "pcm";
  return undefined;
}

function validateRequestedVideoCodec(container: MediaContainer, codec: VideoCodec): void {
  if (codec !== "copy" && !MEDIA_DELIVERY_MATRIX[container].videoCodecs.includes(codec)) {
    throw new Error(`${codec.toUpperCase()} video is incompatible with ${container.toUpperCase()}.`);
  }
}

function validateRequestedAudioCodec(container: MediaContainer, codec: AudioCodec): void {
  if (codec !== "copy" && !MEDIA_DELIVERY_MATRIX[container].audioCodecs.includes(codec)) {
    throw new Error(`${codec.toUpperCase()} audio is incompatible with ${container.toUpperCase()}.`);
  }
}

export interface MediaProbeResult {
  uri: string;
  sizeBytes?: number;
  durationMs?: number;
  width?: number;
  height?: number;
  frameRate?: number;
  avgFrameRate?: string;
  rFrameRate?: string;
  variableFrameRateSuspected?: boolean;
  rotationDegrees?: number;
  pixelFormat?: string;
  bitDepth?: number;
  colorSpace?: string;
  colorPrimaries?: string;
  colorTransfer?: string;
  colorRange?: string;
  hdr?: boolean;
  hdrFormat?: string;
  hasVideo: boolean;
  hasAudio: boolean;
  videoCodec?: string;
  audioCodec?: string;
  sampleRate?: number;
  channels?: number;
}

export interface AudioSequenceExecutionEvidence {
  version: typeof AUDIO_SEQUENCE_VERSION;
  sampleRate: typeof AUDIO_SEQUENCE_SAMPLE_RATE;
  sampleFormat: typeof AUDIO_SEQUENCE_SAMPLE_FORMAT;
  channelLayout: AudioSequenceChannelLayout;
  distinctSourceCount: number;
  itemCount: number;
  maximumSimultaneousItemCount: number;
  outputSampleCount: number;
  estimatedDataBytes: number;
  measuredDataBytes: number;
  graphBytes: number;
}

export interface MediaPublicationEvidenceV1 {
  version: 1;
  scheme: "posix-dev-inode";
  device: string;
  inode: string;
}

export interface MuxAudioDurationValidationV1 {
  version: 1;
  videoDurationMs: number;
  audioDurationMs: number;
  inputToleranceMs: number;
  outputAudioToleranceMs: number;
}

export interface MuxAudioDurationEvidenceV1 {
  version: 1;
  inputVideoDurationMs: number;
  inputAudioDurationMs: number;
  outputVideoDurationMs: number;
  outputAudioDurationMs: number;
}

export interface SilenceRange {
  startMs: number;
  endMs: number | null;
}

export interface EffectiveMediaProfile {
  container: MediaContainer | "png";
  videoCodec?: EncodedVideoCodec | "png";
  audioCodec?: EncodedAudioCodec;
  videoEncoder?: string;
  audioEncoder?: string;
}

export type MediaOperation =
  | MeasureAudioOperationV1
  | { type: "probe"; inputUri: string }
  | { type: "trim"; inputUri: string; outputUri: string; startMs: number; endMs: number }
  | { type: "concat"; inputUris: string[]; outputUri: string }
  | { type: "transcode"; inputUri: string; outputUri: string; container?: MediaContainer; videoCodec?: VideoCodec; audioCodec?: AudioCodec; width?: number; height?: number; fps?: number }
  | { type: "fit"; inputUri: string; outputUri: string; width: number; height: number; mode: FitMode; backgroundColor?: string }
  | { type: "crop"; inputUri: string; outputUri: string; x: number; y: number; width: number; height: number }
  | { type: "speed"; inputUri: string; outputUri: string; factor: number }
  | { type: "volume"; inputUri: string; outputUri: string; gainDb: number }
  | { type: "loudness-normalize"; inputUri: string; outputUri: string; targetLufs: number; truePeakDb?: number }
  | { type: "audio-fade"; inputUri: string; outputUri: string; fadeInMs?: number; fadeOutMs?: number }
  | { type: "extract-audio"; inputUri: string; outputUri: string; audioCodec?: AudioCodec }
  | { type: "extract-frame"; inputUri: string; outputUri: string; atMs: number }
  | { type: "detect-silence"; inputUri: string; thresholdDb: number; minDurationMs: number }
  | { type: "overlay-media"; baseUri: string; overlayUri: string; outputUri: string; startMs: number; endMs: number; x: number; y: number; width: number; height: number; opacity?: number }
  | { type: "mux-audio"; videoUri: string; audioUri: string; outputUri: string; replaceExisting?: boolean; durationValidation?: MuxAudioDurationValidationV1 }
  | RenderAudioSequenceOperationV1;

export type MediaOperationResult =
  | { type: "measure-audio"; report: AudioMeasurementReportV1 }
  | { type: "probe"; probe: MediaProbeResult }
  | { type: "detect-silence"; ranges: SilenceRange[] }
  | { type: "file"; outputUri: string; durationMs?: number; probe: MediaProbeResult; effectiveProfile: EffectiveMediaProfile; audioSequence?: AudioSequenceExecutionEvidence; publication?: MediaPublicationEvidenceV1; muxDuration?: MuxAudioDurationEvidenceV1 };

export interface MediaEngineAdapter extends EngineAdapter {
  execute(operation: MediaOperation, context: ExecutionContext): Promise<MediaOperationResult>;
}

const FORBIDDEN_KEYS = new Set(["shell", "command", "filtergraph", "filter_complex", "args", "argv", "exec"]);
const MEDIA_CONTAINERS = new Set(["mp4", "mov", "mkv", "wav", "m4a"]);
const VIDEO_CODECS = new Set(["h264", "h265", "av1", "copy"]);
const AUDIO_CODECS = new Set(["aac", "opus", "pcm", "copy"]);
const OPERATION_FIELDS: Readonly<Record<MediaOperation["type"], ReadonlySet<string>>> = {
  "measure-audio": new Set(["type", "version", "inputUri", "streamIndex", "startMs", "endMs"]),
  probe: new Set(["type", "inputUri"]),
  trim: new Set(["type", "inputUri", "outputUri", "startMs", "endMs"]),
  concat: new Set(["type", "inputUris", "outputUri"]),
  transcode: new Set(["type", "inputUri", "outputUri", "container", "videoCodec", "audioCodec", "width", "height", "fps"]),
  fit: new Set(["type", "inputUri", "outputUri", "width", "height", "mode", "backgroundColor"]),
  crop: new Set(["type", "inputUri", "outputUri", "x", "y", "width", "height"]),
  speed: new Set(["type", "inputUri", "outputUri", "factor"]),
  volume: new Set(["type", "inputUri", "outputUri", "gainDb"]),
  "loudness-normalize": new Set(["type", "inputUri", "outputUri", "targetLufs", "truePeakDb"]),
  "audio-fade": new Set(["type", "inputUri", "outputUri", "fadeInMs", "fadeOutMs"]),
  "extract-audio": new Set(["type", "inputUri", "outputUri", "audioCodec"]),
  "extract-frame": new Set(["type", "inputUri", "outputUri", "atMs"]),
  "detect-silence": new Set(["type", "inputUri", "thresholdDb", "minDurationMs"]),
  "overlay-media": new Set(["type", "baseUri", "overlayUri", "outputUri", "startMs", "endMs", "x", "y", "width", "height", "opacity"]),
  "mux-audio": new Set(["type", "videoUri", "audioUri", "outputUri", "replaceExisting", "durationValidation"]),
  "render-audio-sequence": new Set(["type", "version", "sources", "items", "outputUri", "outputDurationMs", "outputChannelLayout"])
};

export function validateMediaOperation(value: unknown): MediaOperation {
  if (!isRecord(value)) throw new Error("Media operation must be an object.");
  rejectForbiddenKeys(value);
  if (typeof value.type !== "string") throw new Error("Media operation type is required.");
  const allowedFields = OPERATION_FIELDS[value.type as MediaOperation["type"]];
  if (!allowedFields) throw new Error(`Unsupported media operation ${value.type}.`);
  const extras = Object.keys(value).filter((key) => !allowedFields.has(key));
  if (extras.length) throw new Error(`Media operation contains unexpected fields: ${extras.sort().join(", ")}.`);

  const requireUri = (key: string): void => {
    if (!isSafeMediaUri(value[key])) throw new Error(`${key} must be a safe media URI no longer than ${MAX_MEDIA_URI_LENGTH} characters.`);
  };
  const requirePositive = (key: string): void => {
    if (!isFiniteNumber(value[key]) || (value[key] as number) <= 0) throw new Error(`${key} must be greater than 0.`);
  };
  const requireNonNegativeInteger = (key: string): void => {
    if (!isFiniteNumber(value[key]) || !Number.isInteger(value[key]) || (value[key] as number) < 0) throw new Error(`${key} must be a non-negative integer.`);
  };
  const requirePositiveInteger = (key: string): void => {
    if (!isFiniteNumber(value[key]) || !Number.isInteger(value[key]) || (value[key] as number) <= 0) throw new Error(`${key} must be a positive integer.`);
  };
  const requireTimestamp = (key: string): void => {
    requireNonNegativeInteger(key);
    if ((value[key] as number) > MAX_MEDIA_DURATION_MS) throw new Error(`${key} exceeds the maximum media duration.`);
  };
  const requireDimension = (key: "width" | "height"): void => {
    requirePositiveInteger(key);
    const maximum = key === "width" ? MAX_MEDIA_WIDTH : MAX_MEDIA_HEIGHT;
    if ((value[key] as number) > maximum) throw new Error(`${key} exceeds ${maximum}.`);
  };
  const optionalEnum = (key: string, allowed: ReadonlySet<string>, label: string): void => {
    const candidate = value[key];
    if (candidate !== undefined && (typeof candidate !== "string" || !allowed.has(candidate))) throw new Error(`Invalid ${label}.`);
  };

  switch (value.type) {
    case "measure-audio":
      if (value.version !== 1 || !isAbsoluteLocalMediaPath(value.inputUri)) throw new Error("Invalid measure-audio version or local input path.");
      if (typeof value.streamIndex !== "number" || !Number.isSafeInteger(value.streamIndex) || value.streamIndex < 0 || value.streamIndex > 0x7fff_ffff) throw new Error("streamIndex must be an absolute non-negative FFprobe stream index.");
      requireSafeIntegerMs(value.startMs, "startMs"); requireSafeIntegerMs(value.endMs, "endMs", true);
      if ((value.endMs as number) <= (value.startMs as number)) throw new Error("endMs must be greater than startMs.");
      break;
    case "probe": requireUri("inputUri"); break;
    case "trim": requireUri("inputUri"); requireUri("outputUri"); requireTimestamp("startMs"); requireTimestamp("endMs"); if ((value.endMs as number) <= (value.startMs as number)) throw new Error("endMs must be greater than startMs."); resolveStandardAvDelivery(value.outputUri as string, true); break;
    case "concat": if (!Array.isArray(value.inputUris) || value.inputUris.length < 1 || value.inputUris.length > MAX_MEDIA_INPUTS || value.inputUris.some((uri) => !isSafeMediaUri(uri))) throw new Error(`inputUris must contain 1-${MAX_MEDIA_INPUTS} safe media URIs.`); requireUri("outputUri"); resolveStandardAvDelivery(value.outputUri as string, true); break;
    case "transcode": {
      requireUri("inputUri"); requireUri("outputUri");
      optionalEnum("container", MEDIA_CONTAINERS, "media container"); optionalEnum("videoCodec", VIDEO_CODECS, "video codec"); optionalEnum("audioCodec", AUDIO_CODECS, "audio codec");
      if (value.width !== undefined) requireDimension("width"); if (value.height !== undefined) requireDimension("height"); if (value.fps !== undefined) { requirePositive("fps"); if ((value.fps as number) > MAX_MEDIA_FPS) throw new Error(`fps exceeds ${MAX_MEDIA_FPS}.`); }
      resolveTranscodeDelivery({
        outputUri: value.outputUri as string,
        ...(value.container !== undefined ? { container: value.container as MediaContainer } : {}),
        ...(value.videoCodec !== undefined ? { videoCodec: value.videoCodec as VideoCodec } : {}),
        ...(value.audioCodec !== undefined ? { audioCodec: value.audioCodec as AudioCodec } : {}),
        transformsVideo: value.width !== undefined || value.height !== undefined || value.fps !== undefined
      });
      break;
    }
    case "fit": requireUri("inputUri"); requireUri("outputUri"); requireDimension("width"); requireDimension("height"); if (typeof value.mode !== "string" || !["contain", "cover", "stretch"].includes(value.mode)) throw new Error("Invalid fit mode."); resolveStandardAvDelivery(value.outputUri as string); break;
    case "crop": requireUri("inputUri"); requireUri("outputUri"); requireNonNegativeInteger("x"); requireNonNegativeInteger("y"); requireDimension("width"); requireDimension("height"); resolveStandardAvDelivery(value.outputUri as string); break;
    case "speed": requireUri("inputUri"); requireUri("outputUri"); requirePositive("factor"); if ((value.factor as number) < MIN_MEDIA_SPEED || (value.factor as number) > MAX_MEDIA_SPEED) throw new Error(`factor must be between ${MIN_MEDIA_SPEED} and ${MAX_MEDIA_SPEED}.`); resolveStandardAvDelivery(value.outputUri as string); break;
    case "volume": requireUri("inputUri"); requireUri("outputUri"); if (!isFiniteNumber(value.gainDb)) throw new Error("gainDb must be finite."); resolveAudioMutationDelivery(value.outputUri as string); break;
    case "loudness-normalize": requireUri("inputUri"); requireUri("outputUri"); if (!isFiniteNumber(value.targetLufs)) throw new Error("targetLufs must be finite."); if (value.truePeakDb !== undefined && !isFiniteNumber(value.truePeakDb)) throw new Error("truePeakDb must be finite."); resolveAudioMutationDelivery(value.outputUri as string); break;
    case "audio-fade": requireUri("inputUri"); requireUri("outputUri"); if (value.fadeInMs !== undefined) requireTimestamp("fadeInMs"); if (value.fadeOutMs !== undefined) requireTimestamp("fadeOutMs"); resolveAudioMutationDelivery(value.outputUri as string); break;
    case "extract-audio": requireUri("inputUri"); requireUri("outputUri"); optionalEnum("audioCodec", AUDIO_CODECS, "audio codec"); resolveAudioDelivery(value.outputUri as string, value.audioCodec as AudioCodec | undefined); break;
    case "extract-frame": requireUri("inputUri"); requireUri("outputUri"); requireTimestamp("atMs"); if (!/\.png(?:[?#]|$)/iu.test(value.outputUri as string)) throw new Error("extract-frame outputUri must use the PNG container."); break;
    case "detect-silence": requireUri("inputUri"); if (!isFiniteNumber(value.thresholdDb)) throw new Error("thresholdDb must be finite."); requireTimestamp("minDurationMs"); if (value.minDurationMs === 0) throw new Error("minDurationMs must be greater than 0."); break;
    case "overlay-media": requireUri("baseUri"); requireUri("overlayUri"); requireUri("outputUri"); requireTimestamp("startMs"); requireTimestamp("endMs"); if ((value.endMs as number) <= (value.startMs as number)) throw new Error("endMs must be greater than startMs."); requireNonNegativeInteger("x"); requireNonNegativeInteger("y"); requireDimension("width"); requireDimension("height"); if (value.opacity !== undefined && (!isFiniteNumber(value.opacity) || value.opacity < 0 || value.opacity > 1)) throw new Error("opacity must be between 0 and 1."); resolveStandardAvDelivery(value.outputUri as string); break;
    case "mux-audio": {
      requireUri("videoUri"); requireUri("audioUri"); requireUri("outputUri");
      if (value.replaceExisting !== undefined && typeof value.replaceExisting !== "boolean") throw new Error("replaceExisting must be boolean.");
      if (value.durationValidation !== undefined) validateMuxAudioDurationValidation(value.durationValidation);
      const container = resolveMediaContainer(value.outputUri as string);
      if (MEDIA_DELIVERY_MATRIX[container].audioOnly) throw new Error(`${container.toUpperCase()} is audio-only and cannot be used by mux-audio.`);
      break;
    }
    case "render-audio-sequence": validateAudioSequence(value); break;
    default: throw new Error(`Unsupported media operation ${String(value.type)}.`);
  }
  return value as unknown as MediaOperation;
}

function validateMuxAudioDurationValidation(value: unknown): void {
  if (!isRecord(value)) throw new Error("durationValidation must be an object.");
  const allowed = new Set(["version", "videoDurationMs", "audioDurationMs", "inputToleranceMs", "outputAudioToleranceMs"]);
  const extras = Object.keys(value).filter((key) => !allowed.has(key));
  if (extras.length) throw new Error(`durationValidation contains unexpected fields: ${extras.sort().join(", ")}.`);
  if (value.version !== 1) throw new Error("durationValidation version must be 1.");
  for (const key of ["videoDurationMs", "audioDurationMs"] as const) {
    if (!Number.isSafeInteger(value[key]) || (value[key] as number) <= 0 || (value[key] as number) > MAX_MEDIA_DURATION_MS) {
      throw new Error(`durationValidation.${key} must be a positive bounded integer.`);
    }
  }
  for (const key of ["inputToleranceMs", "outputAudioToleranceMs"] as const) {
    if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 0 || (value[key] as number) > 1000) {
      throw new Error(`durationValidation.${key} must be a bounded non-negative integer.`);
    }
  }
}

function validateAudioSequence(value: Record<string, unknown>): void {
  if (value.version !== AUDIO_SEQUENCE_VERSION) throw new Error(`render-audio-sequence version must be ${AUDIO_SEQUENCE_VERSION}.`);
  if (!Array.isArray(value.sources) || value.sources.length < 1 || value.sources.length > MAX_MEDIA_INPUTS) {
    throw new Error(`sources must contain 1-${MAX_MEDIA_INPUTS} entries.`);
  }
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > MAX_AUDIO_SEQUENCE_ITEMS) {
    throw new Error(`items must contain 1-${MAX_AUDIO_SEQUENCE_ITEMS} entries.`);
  }
  if (!isAbsoluteLocalMediaPath(value.outputUri) || !/\.wav$/iu.test(value.outputUri)) {
    throw new Error("outputUri must be an absolute local WAV path.");
  }
  if (value.outputChannelLayout !== "mono" && value.outputChannelLayout !== "stereo") {
    throw new Error("outputChannelLayout must be mono or stereo.");
  }
  requireSafeIntegerMs(value.outputDurationMs, "outputDurationMs", true);

  const sourceIds = new Set<string>();
  const sourceUris = new Set<string>();
  let inputArgumentBytes = 0;
  for (const [index, candidate] of value.sources.entries()) {
    if (!isRecord(candidate)) throw new Error(`sources[${index}] must be an object.`);
    rejectUnexpectedFields(candidate, new Set(["id", "uri"]), `sources[${index}]`);
    if (!isAudioSequenceId(candidate.id)) throw new Error(`sources[${index}].id is invalid.`);
    if (sourceIds.has(candidate.id)) throw new Error(`sources[${index}].id is duplicated.`);
    if (!isAbsoluteLocalMediaPath(candidate.uri)) throw new Error(`sources[${index}].uri must be an absolute local media path.`);
    if (sourceUris.has(candidate.uri)) throw new Error(`sources[${index}].uri is duplicated; reuse its source id instead.`);
    if (candidate.uri === value.outputUri) throw new Error(`sources[${index}].uri must not alias outputUri.`);
    sourceIds.add(candidate.id);
    sourceUris.add(candidate.uri);
    inputArgumentBytes = checkedAdd(inputArgumentBytes, new TextEncoder().encode(candidate.uri).byteLength + 3, "input argument bytes");
  }
  if (inputArgumentBytes > MAX_AUDIO_SEQUENCE_INPUT_ARGUMENT_BYTES) throw new Error("audio sequence input paths exceed the cross-platform command argument boundary.");

  const usedSourceIds = new Set<string>();
  for (const [index, candidate] of value.items.entries()) {
    if (!isRecord(candidate)) throw new Error(`items[${index}] must be an object.`);
    rejectUnexpectedFields(candidate, new Set(["sourceId", "sourceStartMs", "sourceEndMs", "timelineStartMs", "gainDb", "fadeInMs", "fadeOutMs"]), `items[${index}]`);
    if (!isAudioSequenceId(candidate.sourceId) || !sourceIds.has(candidate.sourceId)) throw new Error(`items[${index}].sourceId is unknown.`);
    usedSourceIds.add(candidate.sourceId);
    requireSafeIntegerMs(candidate.sourceStartMs, `items[${index}].sourceStartMs`);
    requireSafeIntegerMs(candidate.sourceEndMs, `items[${index}].sourceEndMs`, true);
    requireSafeIntegerMs(candidate.timelineStartMs, `items[${index}].timelineStartMs`);
    const sourceDurationMs = (candidate.sourceEndMs as number) - (candidate.sourceStartMs as number);
    if (sourceDurationMs <= 0) throw new Error(`items[${index}] source range must be positive.`);
    const timelineEndMs = checkedAdd(candidate.timelineStartMs as number, sourceDurationMs, `items[${index}] timeline end`);
    if (timelineEndMs > (value.outputDurationMs as number)) throw new Error(`items[${index}] extends beyond outputDurationMs.`);
    if (candidate.gainDb !== undefined && (!isFiniteNumber(candidate.gainDb) || candidate.gainDb < MIN_AUDIO_SEQUENCE_GAIN_DB || candidate.gainDb > MAX_AUDIO_SEQUENCE_GAIN_DB)) {
      throw new Error(`items[${index}].gainDb must be between ${MIN_AUDIO_SEQUENCE_GAIN_DB} and ${MAX_AUDIO_SEQUENCE_GAIN_DB}.`);
    }
    for (const key of ["fadeInMs", "fadeOutMs"] as const) {
      if (candidate[key] === undefined) continue;
      requireSafeIntegerMs(candidate[key], `items[${index}].${key}`);
      if ((candidate[key] as number) > sourceDurationMs) throw new Error(`items[${index}].${key} exceeds the item duration.`);
    }
    if ((candidate.fadeInMs as number | undefined ?? 0) + (candidate.fadeOutMs as number | undefined ?? 0) > sourceDurationMs) {
      throw new Error(`items[${index}] fades overlap beyond the item duration.`);
    }
  }
  const unusedSourceIds = [...sourceIds].filter((sourceId) => !usedSourceIds.has(sourceId));
  if (unusedSourceIds.length) throw new Error(`sources are declared but unused: ${unusedSourceIds.sort().join(", ")}.`);

  const channels = value.outputChannelLayout === "mono" ? 1 : 2;
  const samples = checkedMultiply(value.outputDurationMs as number, AUDIO_SEQUENCE_SAMPLE_RATE / 1000, "output samples");
  const dataBytes = checkedMultiply(samples, channels * 4, "WAV data bytes");
  if (dataBytes > MAX_AUDIO_SEQUENCE_WAV_DATA_BYTES) throw new Error("outputDurationMs exceeds the ordinary RIFF/WAV data-size boundary for the selected channel layout.");
  const estimatedGraphBytes = 256 + value.sources.length * 48 + value.items.length * 384;
  if (estimatedGraphBytes > MAX_AUDIO_SEQUENCE_GRAPH_BYTES) throw new Error("render-audio-sequence graph exceeds its bounded compiler size.");
}

function rejectUnexpectedFields(value: Record<string, unknown>, allowed: ReadonlySet<string>, location: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.has(key));
  if (extras.length) throw new Error(`${location} contains unexpected fields: ${extras.sort().join(", ")}.`);
}

function requireSafeIntegerMs(value: unknown, location: string, positive = false): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || (positive && value === 0) || value > MAX_MEDIA_DURATION_MS) {
    throw new Error(`${location} must be a ${positive ? "positive" : "non-negative"} safe integer within the media duration boundary.`);
  }
}

function checkedAdd(left: number, right: number, location: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new Error(`${location} exceeds safe integer arithmetic.`);
  return result;
}

function checkedMultiply(left: number, right: number, location: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) throw new Error(`${location} exceeds safe integer arithmetic.`);
  return result;
}

function isAudioSequenceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value);
}

function isAbsoluteLocalMediaPath(value: unknown): value is string {
  return isSafeMediaUri(value)
    && (value.startsWith("/") || /^[A-Za-z]:[\\/][^\\/]/u.test(value))
    && !value.startsWith("//")
    && !value.startsWith("\\\\");
}

function rejectForbiddenKeys(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(rejectForbiddenKeys);
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`Forbidden execution field: ${key}.`);
    rejectForbiddenKeys(child);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSafeMediaUri(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_MEDIA_URI_LENGTH && !value.startsWith("-") && !/[\0\r\n]/u.test(value);
}
