import type { EngineAdapter, ExecutionContext } from "./base.js";

export type FitMode = "contain" | "cover" | "stretch";
export type MediaContainer = "mp4" | "mov" | "webm" | "mkv" | "wav" | "mp3" | "m4a";
export type VideoCodec = "h264" | "h265" | "vp9" | "av1" | "copy";
export type AudioCodec = "aac" | "opus" | "mp3" | "pcm" | "copy";
export type EncodedVideoCodec = Exclude<VideoCodec, "copy">;
export type EncodedAudioCodec = Exclude<AudioCodec, "copy">;

export const MIN_MEDIA_SPEED = 1 / 16;
export const MAX_MEDIA_SPEED = 16;

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
  webm: { videoCodecs: ["vp9", "av1"], audioCodecs: ["opus"], defaultVideoCodec: "vp9", defaultAudioCodec: "opus", audioOnly: false },
  mkv: { videoCodecs: ["h264", "h265", "vp9", "av1"], audioCodecs: ["aac", "opus", "mp3", "pcm"], defaultVideoCodec: "h264", defaultAudioCodec: "aac", audioOnly: false },
  wav: { videoCodecs: [], audioCodecs: ["pcm"], defaultAudioCodec: "pcm", audioOnly: true },
  mp3: { videoCodecs: [], audioCodecs: ["mp3"], defaultAudioCodec: "mp3", audioOnly: true },
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
  if (MEDIA_DELIVERY_MATRIX[container].audioOnly) return resolveAudioDelivery(outputUri);
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
  if (value === "vp9" || value === "vp09") return "vp9";
  if (value === "av1" || value === "av01") return "av1";
  return undefined;
}

export function normalizeAudioCodec(codec: string | undefined): EncodedAudioCodec | undefined {
  const value = codec?.trim().toLowerCase();
  if (value === "aac") return "aac";
  if (value === "opus") return "opus";
  if (value === "mp3" || value === "mp3float") return "mp3";
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
  durationMs?: number;
  width?: number;
  height?: number;
  frameRate?: number;
  hasVideo: boolean;
  hasAudio: boolean;
  videoCodec?: string;
  audioCodec?: string;
  sampleRate?: number;
  channels?: number;
}

export interface SilenceRange {
  startMs: number;
  endMs: number;
}

export type MediaOperation =
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
  | { type: "mux-audio"; videoUri: string; audioUri: string; outputUri: string; replaceExisting?: boolean };

export type MediaOperationResult =
  | { type: "probe"; probe: MediaProbeResult }
  | { type: "detect-silence"; ranges: SilenceRange[] }
  | { type: "file"; outputUri: string; durationMs?: number };

export interface MediaEngineAdapter extends EngineAdapter {
  execute(operation: MediaOperation, context: ExecutionContext): Promise<MediaOperationResult>;
}

const FORBIDDEN_KEYS = new Set(["shell", "command", "filtergraph", "filter_complex", "args", "argv", "exec"]);
const MEDIA_CONTAINERS = new Set(["mp4", "mov", "webm", "mkv", "wav", "mp3", "m4a"]);
const VIDEO_CODECS = new Set(["h264", "h265", "vp9", "av1", "copy"]);
const AUDIO_CODECS = new Set(["aac", "opus", "mp3", "pcm", "copy"]);

export function validateMediaOperation(value: unknown): MediaOperation {
  if (!isRecord(value)) throw new Error("Media operation must be an object.");
  rejectForbiddenKeys(value);
  if (typeof value.type !== "string") throw new Error("Media operation type is required.");

  const requireUri = (key: string): void => {
    if (!isSafeMediaUri(value[key])) throw new Error(`${key} must be a safe non-empty media URI.`);
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
  const optionalEnum = (key: string, allowed: ReadonlySet<string>, label: string): void => {
    const candidate = value[key];
    if (candidate !== undefined && (typeof candidate !== "string" || !allowed.has(candidate))) throw new Error(`Invalid ${label}.`);
  };

  switch (value.type) {
    case "probe": requireUri("inputUri"); break;
    case "trim": requireUri("inputUri"); requireUri("outputUri"); requireNonNegativeInteger("startMs"); requirePositiveInteger("endMs"); if ((value.endMs as number) <= (value.startMs as number)) throw new Error("endMs must be greater than startMs."); resolveStandardAvDelivery(value.outputUri as string, true); break;
    case "concat": if (!Array.isArray(value.inputUris) || value.inputUris.length < 1 || value.inputUris.some((uri) => !isSafeMediaUri(uri))) throw new Error("inputUris must contain at least one safe media URI."); requireUri("outputUri"); resolveStandardAvDelivery(value.outputUri as string, true); break;
    case "transcode": {
      requireUri("inputUri"); requireUri("outputUri");
      optionalEnum("container", MEDIA_CONTAINERS, "media container"); optionalEnum("videoCodec", VIDEO_CODECS, "video codec"); optionalEnum("audioCodec", AUDIO_CODECS, "audio codec");
      if (value.width !== undefined) requirePositiveInteger("width"); if (value.height !== undefined) requirePositiveInteger("height"); if (value.fps !== undefined) requirePositive("fps");
      resolveTranscodeDelivery({
        outputUri: value.outputUri as string,
        ...(value.container !== undefined ? { container: value.container as MediaContainer } : {}),
        ...(value.videoCodec !== undefined ? { videoCodec: value.videoCodec as VideoCodec } : {}),
        ...(value.audioCodec !== undefined ? { audioCodec: value.audioCodec as AudioCodec } : {}),
        transformsVideo: value.width !== undefined || value.height !== undefined || value.fps !== undefined
      });
      break;
    }
    case "fit": requireUri("inputUri"); requireUri("outputUri"); requirePositiveInteger("width"); requirePositiveInteger("height"); if (typeof value.mode !== "string" || !["contain", "cover", "stretch"].includes(value.mode)) throw new Error("Invalid fit mode."); resolveStandardAvDelivery(value.outputUri as string); break;
    case "crop": requireUri("inputUri"); requireUri("outputUri"); requireNonNegativeInteger("x"); requireNonNegativeInteger("y"); requirePositiveInteger("width"); requirePositiveInteger("height"); resolveStandardAvDelivery(value.outputUri as string); break;
    case "speed": requireUri("inputUri"); requireUri("outputUri"); requirePositive("factor"); if ((value.factor as number) < MIN_MEDIA_SPEED || (value.factor as number) > MAX_MEDIA_SPEED) throw new Error(`factor must be between ${MIN_MEDIA_SPEED} and ${MAX_MEDIA_SPEED}.`); resolveStandardAvDelivery(value.outputUri as string); break;
    case "volume": requireUri("inputUri"); requireUri("outputUri"); if (!isFiniteNumber(value.gainDb)) throw new Error("gainDb must be finite."); resolveAudioMutationDelivery(value.outputUri as string); break;
    case "loudness-normalize": requireUri("inputUri"); requireUri("outputUri"); if (!isFiniteNumber(value.targetLufs)) throw new Error("targetLufs must be finite."); if (value.truePeakDb !== undefined && !isFiniteNumber(value.truePeakDb)) throw new Error("truePeakDb must be finite."); resolveAudioMutationDelivery(value.outputUri as string); break;
    case "audio-fade": requireUri("inputUri"); requireUri("outputUri"); if (value.fadeInMs !== undefined) requireNonNegativeInteger("fadeInMs"); if (value.fadeOutMs !== undefined) requireNonNegativeInteger("fadeOutMs"); resolveAudioMutationDelivery(value.outputUri as string); break;
    case "extract-audio": requireUri("inputUri"); requireUri("outputUri"); optionalEnum("audioCodec", AUDIO_CODECS, "audio codec"); resolveAudioDelivery(value.outputUri as string, value.audioCodec as AudioCodec | undefined); break;
    case "extract-frame": requireUri("inputUri"); requireUri("outputUri"); requireNonNegativeInteger("atMs"); if (!/\.png(?:[?#]|$)/iu.test(value.outputUri as string)) throw new Error("extract-frame outputUri must use the PNG container."); break;
    case "detect-silence": requireUri("inputUri"); if (!isFiniteNumber(value.thresholdDb)) throw new Error("thresholdDb must be finite."); requirePositiveInteger("minDurationMs"); break;
    case "overlay-media": requireUri("baseUri"); requireUri("overlayUri"); requireUri("outputUri"); requireNonNegativeInteger("startMs"); requirePositiveInteger("endMs"); if ((value.endMs as number) <= (value.startMs as number)) throw new Error("endMs must be greater than startMs."); requireNonNegativeInteger("x"); requireNonNegativeInteger("y"); requirePositiveInteger("width"); requirePositiveInteger("height"); if (value.opacity !== undefined && (!isFiniteNumber(value.opacity) || value.opacity < 0 || value.opacity > 1)) throw new Error("opacity must be between 0 and 1."); resolveStandardAvDelivery(value.outputUri as string); break;
    case "mux-audio": {
      requireUri("videoUri"); requireUri("audioUri"); requireUri("outputUri");
      if (value.replaceExisting !== undefined && typeof value.replaceExisting !== "boolean") throw new Error("replaceExisting must be boolean.");
      const container = resolveMediaContainer(value.outputUri as string);
      if (MEDIA_DELIVERY_MATRIX[container].audioOnly) throw new Error(`${container.toUpperCase()} is audio-only and cannot be used by mux-audio.`);
      break;
    }
    default: throw new Error(`Unsupported media operation ${String(value.type)}.`);
  }
  return value as unknown as MediaOperation;
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
  return typeof value === "string" && value.trim().length > 0 && !value.startsWith("-") && !/[\0\r\n]/u.test(value);
}
