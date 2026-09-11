import {
  CEVRA_ENGINE_API_VERSION,
  validateMediaOperation,
  type CapabilityDescriptor,
  type EngineHealth,
  type EngineIdentity,
  type ExecutionContext,
  type MediaEngineAdapter,
  type MediaOperation,
  type MediaOperationResult,
  type MediaProbeResult
} from "@cevra/contracts";
import type { MediaWorkerClient, MediaWorkerToolResult } from "./worker.js";

export class FfmpegMediaEngine implements MediaEngineAdapter {
  constructor(private readonly worker: MediaWorkerClient) {}

  async identity(): Promise<EngineIdentity> {
    const info = await this.worker.info();
    return {
      id: "cevra.media.ffmpeg",
      kind: "media",
      displayName: "CEVRA Media Engine",
      version: info.version,
      apiVersion: CEVRA_ENGINE_API_VERSION
    };
  }

  async healthcheck(): Promise<EngineHealth> {
    const health = await this.worker.health();
    return {
      status: health.ok ? "ready" : health.checks.some((check) => check.status === "PASS") ? "degraded" : "unavailable",
      checkedAt: health.checkedAt,
      checks: health.checks
    };
  }

  async capabilities(): Promise<CapabilityDescriptor[]> {
    const health = await this.worker.health();
    return Object.entries(health.tools).map(([id, tool]) => ({
      id: `media.${id}`,
      version: 1,
      available: tool.usable === "yes",
      ...(tool.detail ? { detail: tool.detail } : tool.missing?.length ? { detail: `Missing: ${tool.missing.join(", ")}` } : {})
    }));
  }

  async execute(operationInput: MediaOperation, context: ExecutionContext): Promise<MediaOperationResult> {
    const operation = validateMediaOperation(operationInput);
    const signal = context.signal;
    if (signal?.aborted) throw abortError();
    const call = (name: string, args: Record<string, unknown>) => this.call(name, args, context.jobId, signal);
    switch (operation.type) {
      case "probe":
        return { type: "probe", probe: parseProbe(await call("probe", { inputs: [operation.inputUri] }), operation.inputUri) };
      case "trim":
        return fileResult(await call("cut", { input: operation.inputUri, output: operation.outputUri, start: seconds(operation.startMs), end: seconds(operation.endMs), accurate: true }), operation.outputUri);
      case "concat":
        return fileResult(await call("join", { inputs: operation.inputUris, output: operation.outputUri }), operation.outputUri);
      case "fit":
        if (operation.mode === "stretch") return fileResult(await call("cevra-scale", { input: operation.inputUri, output: operation.outputUri, width: operation.width, height: operation.height }), operation.outputUri);
        return fileResult(await call("fit", { input: operation.inputUri, output: operation.outputUri, width: operation.width, height: operation.height, fit: operation.mode === "cover" ? "crop" : "pad", ...(operation.backgroundColor ? { pad_color: operation.backgroundColor } : {}) }), operation.outputUri);
      case "crop":
        return fileResult(await call("crop", { input: operation.inputUri, output: operation.outputUri, x: operation.x, y: operation.y, width: operation.width, height: operation.height }), operation.outputUri);
      case "volume":
        return fileResult(await call("audio", { input: operation.inputUri, output: operation.outputUri, gain: operation.gainDb }), operation.outputUri);
      case "loudness-normalize":
        return fileResult(await call("loudness", { input: operation.inputUri, output: operation.outputUri, lufs: operation.targetLufs, ...(operation.truePeakDb !== undefined ? { tp: operation.truePeakDb } : {}) }), operation.outputUri);
      case "audio-fade":
        return fileResult(await call("audio", { input: operation.inputUri, output: operation.outputUri, ...(operation.fadeInMs !== undefined ? { fade_in: seconds(operation.fadeInMs) } : {}), ...(operation.fadeOutMs !== undefined ? { fade_out: seconds(operation.fadeOutMs) } : {}) }), operation.outputUri);
      case "extract-audio":
        return fileResult(await call("audio", { input: operation.inputUri, output: operation.outputUri }), operation.outputUri);
      case "extract-frame":
        return fileResult(await call("look", { input: operation.inputUri, output: operation.outputUri, at: seconds(operation.atMs), tiles: 1, no_timecode: true }), operation.outputUri);
      case "detect-silence": {
        const payload = await call("silence", { input: operation.inputUri, threshold: operation.thresholdDb, min_silence: seconds(operation.minDurationMs), list: true });
        const silences = payload.silences;
        if (!Array.isArray(silences)) throw new Error("Media worker silence result is missing silences.");
        return {
          type: "detect-silence",
          ranges: silences.filter(Array.isArray).map((range) => ({ startMs: milliseconds(range[0]), endMs: range[1] === null ? Number.MAX_SAFE_INTEGER : milliseconds(range[1]) }))
        };
      }
      case "overlay-media":
        return fileResult(await call("cevra-overlay-media", { base: operation.baseUri, overlay: operation.overlayUri, output: operation.outputUri, start: seconds(operation.startMs), end: seconds(operation.endMs), x: operation.x, y: operation.y, width: operation.width, height: operation.height, ...(operation.opacity !== undefined ? { opacity: operation.opacity } : {}) }), operation.outputUri);
      case "mux-audio":
        return fileResult(await call("audio", { input: operation.videoUri, replace: operation.audioUri, output: operation.outputUri }), operation.outputUri);
      case "speed":
        return fileResult(await call("cevra-speed", { input: operation.inputUri, output: operation.outputUri, factor: operation.factor }), operation.outputUri);
      case "transcode":
        validateTranscodeCompatibility(operation);
        return fileResult(await call("cevra-transcode", {
          input: operation.inputUri,
          output: operation.outputUri,
          ...(operation.container ? { container: operation.container } : {}),
          ...(operation.videoCodec ? { video_codec: operation.videoCodec } : {}),
          ...(operation.audioCodec ? { audio_codec: operation.audioCodec } : {}),
          ...(operation.width ? { width: operation.width } : {}),
          ...(operation.height ? { height: operation.height } : {}),
          ...(operation.fps ? { fps: operation.fps } : {})
        }), operation.outputUri);
    }
  }

  private async call(name: string, args: Record<string, unknown>, jobId: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (signal?.aborted) throw abortError();
    const result = await this.worker.callTool(name, args, jobId, signal);
    if (result.isError) throw new Error(readText(result) || `Media worker tool ${name} failed.`);
    const payload = result.structuredContent ?? parseTextJson(result);
    if (!isRecord(payload) || Object.keys(payload).length === 0) {
      throw new Error(`Media worker tool ${name} returned an invalid result.`);
    }
    return payload;
  }
}

function validateTranscodeCompatibility(operation: Extract<MediaOperation, { type: "transcode" }>): void {
  const container = operation.container;
  const video = operation.videoCodec;
  const audio = operation.audioCodec;
  if (!container) return;

  if (container === "webm") {
    if (video && !["vp9", "av1", "copy"].includes(video)) throw new Error("WebM supports VP9/AV1 in the CEVRA delivery profile; H.264/H.265 are rejected.");
    if (audio && !["opus", "copy"].includes(audio)) throw new Error("WebM audio must be Opus or stream copy in the CEVRA delivery profile.");
  }
  if (container === "mp4") {
    if (video === "vp9") throw new Error("VP9 in MP4 is not supported by the CEVRA compatibility profile; use AV1/H.264/H.265 or WebM.");
    if (audio && !["aac", "copy"].includes(audio)) throw new Error("MP4 audio must be AAC or stream copy in the CEVRA compatibility profile.");
  }
  if (container === "mov") {
    if (video === "vp9") throw new Error("VP9 in MOV is not supported by the CEVRA compatibility profile.");
    if (audio && !["aac", "pcm", "copy"].includes(audio)) throw new Error("MOV audio must be AAC, PCM or stream copy in the CEVRA compatibility profile.");
  }
  if (["wav", "mp3", "m4a"].includes(container)) {
    if (video || operation.width !== undefined || operation.height !== undefined || operation.fps !== undefined) {
      throw new Error(`${container.toUpperCase()} is an audio-only delivery container; use extract-audio instead of a video transcode.`);
    }
    const allowed = container === "wav" ? ["pcm", "copy"] : container === "mp3" ? ["mp3", "copy"] : ["aac", "copy"];
    if (audio && !allowed.includes(audio)) throw new Error(`${container.toUpperCase()} audio codec is incompatible with the CEVRA delivery profile.`);
  }
}

function parseProbe(payload: Record<string, unknown>, fallbackUri: string): MediaProbeResult {
  const video = isRecord(payload.video) ? payload.video : undefined;
  const audio = isRecord(payload.audio) ? payload.audio : undefined;
  if (typeof payload.file !== "string" || payload.file.trim().length === 0 || payload.file !== fallbackUri || (!video && !audio && !finite(payload.duration))) {
    throw new Error("Media worker probe result has no output evidence.");
  }
  return {
    uri: typeof payload.file === "string" ? payload.file : fallbackUri,
    ...(finite(payload.duration) ? { durationMs: Math.round(payload.duration * 1000) } : {}),
    ...(video && finite(video.width) ? { width: video.width } : {}),
    ...(video && finite(video.height) ? { height: video.height } : {}),
    ...(video && finite(video.fps) ? { frameRate: video.fps } : {}),
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    ...(video && typeof video.codec === "string" ? { videoCodec: video.codec } : {}),
    ...(audio && typeof audio.codec === "string" ? { audioCodec: audio.codec } : {}),
    ...(audio && finite(audio.sample_rate) ? { sampleRate: audio.sample_rate } : {}),
    ...(audio && finite(audio.channels) ? { channels: audio.channels } : {})
  };
}

function fileResult(payload: Record<string, unknown>, fallbackUri: string): MediaOperationResult {
  if (payload.status !== "completed" || typeof payload.output !== "string" || payload.output.trim().length === 0 || payload.output !== fallbackUri) {
    throw new Error("Media worker file result has no completed output evidence.");
  }
  const probe = isRecord(payload.probe) ? payload.probe : undefined;
  if (!probe || typeof probe.file !== "string" || probe.file.trim().length === 0 || probe.file !== payload.output) {
    throw new Error("Media worker file result has no verified output probe.");
  }
  return {
    type: "file",
    outputUri: typeof payload.output === "string" ? payload.output : fallbackUri,
    ...(probe && finite(probe.duration) ? { durationMs: Math.round(probe.duration * 1000) } : {})
  };
}

function abortError(): Error { const error = new Error("CEVRA media operation was cancelled."); error.name = "AbortError"; return error; }
function seconds(ms: number): number { return ms / 1000; }
function milliseconds(value: unknown): number { if (!finite(value)) throw new Error("Invalid worker time value."); return Math.round(value * 1000); }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function readText(result: MediaWorkerToolResult): string | undefined { return result.content?.map((item) => item.text).filter(Boolean).join("\n"); }
function parseTextJson(result: MediaWorkerToolResult): Record<string, unknown> | undefined {
  const text = readText(result);
  if (!text) return undefined;
  try { const value = JSON.parse(text) as unknown; return isRecord(value) ? value : undefined; } catch { return undefined; }
}
