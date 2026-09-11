import type { EngineAdapter, ExecutionContext } from "./base.js";

export type FitMode = "contain" | "cover" | "stretch";
export type MediaContainer = "mp4" | "mov" | "webm" | "mkv" | "wav" | "mp3" | "m4a";
export type VideoCodec = "h264" | "h265" | "vp9" | "av1" | "copy";
export type AudioCodec = "aac" | "opus" | "mp3" | "pcm" | "copy";

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

export function validateMediaOperation(value: unknown): MediaOperation {
  if (!isRecord(value)) throw new Error("Media operation must be an object.");
  rejectForbiddenKeys(value);
  if (typeof value.type !== "string") throw new Error("Media operation type is required.");

  const requireUri = (key: string): void => {
    if (typeof value[key] !== "string" || (value[key] as string).trim().length === 0) throw new Error(`${key} is required.`);
  };
  const requireNonNegative = (key: string): void => {
    if (!isFiniteNumber(value[key]) || (value[key] as number) < 0) throw new Error(`${key} must be a non-negative number.`);
  };
  const requirePositive = (key: string): void => {
    if (!isFiniteNumber(value[key]) || (value[key] as number) <= 0) throw new Error(`${key} must be greater than 0.`);
  };

  switch (value.type) {
    case "probe": requireUri("inputUri"); break;
    case "trim": requireUri("inputUri"); requireUri("outputUri"); requireNonNegative("startMs"); requirePositive("endMs"); if ((value.endMs as number) <= (value.startMs as number)) throw new Error("endMs must be greater than startMs."); break;
    case "concat": if (!Array.isArray(value.inputUris) || value.inputUris.length < 1 || value.inputUris.some((uri) => typeof uri !== "string" || uri.length === 0)) throw new Error("inputUris must contain at least one URI."); requireUri("outputUri"); break;
    case "transcode": requireUri("inputUri"); requireUri("outputUri"); if (value.width !== undefined) requirePositive("width"); if (value.height !== undefined) requirePositive("height"); if (value.fps !== undefined) requirePositive("fps"); break;
    case "fit": requireUri("inputUri"); requireUri("outputUri"); requirePositive("width"); requirePositive("height"); if (!["contain", "cover", "stretch"].includes(String(value.mode))) throw new Error("Invalid fit mode."); break;
    case "crop": requireUri("inputUri"); requireUri("outputUri"); requireNonNegative("x"); requireNonNegative("y"); requirePositive("width"); requirePositive("height"); break;
    case "speed": requireUri("inputUri"); requireUri("outputUri"); requirePositive("factor"); if ((value.factor as number) > 16) throw new Error("factor exceeds supported safety limit."); break;
    case "volume": requireUri("inputUri"); requireUri("outputUri"); if (!isFiniteNumber(value.gainDb)) throw new Error("gainDb must be finite."); break;
    case "loudness-normalize": requireUri("inputUri"); requireUri("outputUri"); if (!isFiniteNumber(value.targetLufs)) throw new Error("targetLufs must be finite."); break;
    case "audio-fade": requireUri("inputUri"); requireUri("outputUri"); if (value.fadeInMs !== undefined) requireNonNegative("fadeInMs"); if (value.fadeOutMs !== undefined) requireNonNegative("fadeOutMs"); break;
    case "extract-audio": requireUri("inputUri"); requireUri("outputUri"); break;
    case "extract-frame": requireUri("inputUri"); requireUri("outputUri"); requireNonNegative("atMs"); break;
    case "detect-silence": requireUri("inputUri"); if (!isFiniteNumber(value.thresholdDb)) throw new Error("thresholdDb must be finite."); requirePositive("minDurationMs"); break;
    case "overlay-media": requireUri("baseUri"); requireUri("overlayUri"); requireUri("outputUri"); requireNonNegative("startMs"); requirePositive("endMs"); if ((value.endMs as number) <= (value.startMs as number)) throw new Error("endMs must be greater than startMs."); requireNonNegative("x"); requireNonNegative("y"); requirePositive("width"); requirePositive("height"); if (value.opacity !== undefined && (!isFiniteNumber(value.opacity) || value.opacity < 0 || value.opacity > 1)) throw new Error("opacity must be between 0 and 1."); break;
    case "mux-audio": requireUri("videoUri"); requireUri("audioUri"); requireUri("outputUri"); break;
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
