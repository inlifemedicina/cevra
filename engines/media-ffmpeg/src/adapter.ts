import {
  CEVRA_ENGINE_API_VERSION,
  MEDIA_DELIVERY_MATRIX,
  resolveAudioDelivery,
  resolveAudioMutationDelivery,
  resolveMediaContainer,
  resolveStandardAvDelivery,
  resolveTranscodeDelivery,
  validateCopyCompatibility,
  validateMediaOperation,
  type CapabilityDescriptor,
  type EngineHealth,
  type EngineIdentity,
  type ExecutionContext,
  type EffectiveMediaProfile,
  type MediaEngineAdapter,
  type MediaOperation,
  type MediaOperationResult,
  type MediaProbeResult,
  type ResolvedMediaDelivery
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
    const tools = Object.entries(health.tools).map(([id, tool]) => ({
      id: `media.${id}`,
      version: 1,
      available: tool.usable === "yes",
      ...(tool.detail ? { detail: tool.detail } : tool.missing?.length ? { detail: `Missing: ${tool.missing.join(", ")}` } : {})
    }));
    const deliveries = health.effectiveDeliveries.map((delivery) => ({
      id: `media.delivery.${delivery.container}.${delivery.videoCodec ?? "audio"}.${delivery.audioCodec}`,
      version: 1,
      available: true,
      detail: [delivery.videoEncoder, delivery.audioEncoder].filter(Boolean).join(" + ")
    }));
    return [...tools, ...deliveries];
  }

  async execute(operationInput: MediaOperation, context: ExecutionContext): Promise<MediaOperationResult> {
    const operation = validateMediaOperation(operationInput);
    const signal = context.signal;
    if (signal?.aborted) throw abortError();
    const plannedDelivery = operationDelivery(operation);
    if (plannedDelivery) await this.assertDeliveryAvailable(plannedDelivery);
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
        await this.validateAudioMutationInput(call, operation.inputUri, operation.outputUri);
        return fileResult(await call("audio", { input: operation.inputUri, output: operation.outputUri, gain: operation.gainDb }), operation.outputUri);
      case "loudness-normalize":
        await this.validateAudioMutationInput(call, operation.inputUri, operation.outputUri);
        return fileResult(await call("loudness", { input: operation.inputUri, output: operation.outputUri, lufs: operation.targetLufs, ...(operation.truePeakDb !== undefined ? { tp: operation.truePeakDb } : {}) }), operation.outputUri);
      case "audio-fade":
        await this.validateAudioMutationInput(call, operation.inputUri, operation.outputUri);
        return fileResult(await call("audio", { input: operation.inputUri, output: operation.outputUri, ...(operation.fadeInMs !== undefined ? { fade_in: seconds(operation.fadeInMs) } : {}), ...(operation.fadeOutMs !== undefined ? { fade_out: seconds(operation.fadeOutMs) } : {}) }), operation.outputUri);
      case "extract-audio": {
        const delivery = resolveAudioDelivery(operation.outputUri, operation.audioCodec);
        if (delivery.audioCodec === "copy") validateCopyCompatibility(delivery, await this.probeForDelivery(call, operation.inputUri));
        return fileResult(await call("cevra-transcode", {
          input: operation.inputUri,
          output: operation.outputUri,
          container: delivery.container,
          audio_codec: delivery.audioCodec,
          drop_video: true
        }), operation.outputUri);
      }
      case "extract-frame":
        return fileResult(await call("cevra-extract-frame", { input: operation.inputUri, output: operation.outputUri, at: seconds(operation.atMs) }), operation.outputUri);
      case "detect-silence": {
        const payload = await call("silence", { input: operation.inputUri, threshold: operation.thresholdDb, min_silence: seconds(operation.minDurationMs), list: true });
        const silences = payload.silences;
        if (!Array.isArray(silences)) throw new Error("Media worker silence result is missing silences.");
        return {
          type: "detect-silence",
          ranges: silences.filter(Array.isArray).map((range) => ({ startMs: milliseconds(range[0]), endMs: range[1] === null ? null : milliseconds(range[1]) }))
        };
      }
      case "overlay-media":
        return fileResult(await call("cevra-overlay-media", { base: operation.baseUri, overlay: operation.overlayUri, output: operation.outputUri, start: seconds(operation.startMs), end: seconds(operation.endMs), x: operation.x, y: operation.y, width: operation.width, height: operation.height, ...(operation.opacity !== undefined ? { opacity: operation.opacity } : {}) }), operation.outputUri);
      case "mux-audio": {
        const container = resolveMediaContainer(operation.outputUri);
        const rule = MEDIA_DELIVERY_MATRIX[container];
        const delivery = { container, audioOnly: false, videoCodec: "copy" as const, audioCodec: rule.defaultAudioCodec };
        validateCopyCompatibility(delivery, await this.probeForDelivery(call, operation.videoUri));
        return fileResult(await call("cevra-mux-audio", {
          video: operation.videoUri,
          audio: operation.audioUri,
          output: operation.outputUri,
          container,
          audio_codec: rule.defaultAudioCodec,
          replace_existing: operation.replaceExisting ?? true
        }), operation.outputUri);
      }
      case "speed":
        return fileResult(await call("cevra-speed", { input: operation.inputUri, output: operation.outputUri, factor: operation.factor }), operation.outputUri);
      case "transcode": {
        const delivery = resolveTranscodeDelivery({
          outputUri: operation.outputUri,
          ...(operation.container ? { container: operation.container } : {}),
          ...(operation.videoCodec ? { videoCodec: operation.videoCodec } : {}),
          ...(operation.audioCodec ? { audioCodec: operation.audioCodec } : {}),
          transformsVideo: operation.width !== undefined || operation.height !== undefined || operation.fps !== undefined
        });
        if (delivery.videoCodec === "copy" || delivery.audioCodec === "copy") {
          validateCopyCompatibility(delivery, await this.probeForDelivery(call, operation.inputUri));
        }
        return fileResult(await call("cevra-transcode", {
          input: operation.inputUri,
          output: operation.outputUri,
          container: delivery.container,
          ...(delivery.videoCodec ? { video_codec: delivery.videoCodec } : {}),
          audio_codec: delivery.audioCodec,
          ...(operation.width ? { width: operation.width } : {}),
          ...(operation.height ? { height: operation.height } : {}),
          ...(operation.fps ? { fps: operation.fps } : {}),
          ...(delivery.audioOnly ? { drop_video: true } : {})
        }), operation.outputUri);
      }
    }
  }

  private async probeForDelivery(
    call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>,
    inputUri: string
  ): Promise<MediaProbeResult> {
    return parseProbe(await call("probe", { inputs: [inputUri] }), inputUri);
  }

  private async validateAudioMutationInput(
    call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>,
    inputUri: string,
    outputUri: string
  ): Promise<void> {
    const delivery = resolveAudioMutationDelivery(outputUri);
    if (delivery.videoCodec !== "copy") return;
    const evidence = await this.probeForDelivery(call, inputUri);
    if (evidence.hasVideo) validateCopyCompatibility(delivery, evidence);
  }

  private async assertDeliveryAvailable(delivery: ResolvedMediaDelivery): Promise<void> {
    const health = await this.worker.health();
    const available = health.effectiveDeliveries.some((candidate) => candidate.container === delivery.container
      && candidate.audioOnly === delivery.audioOnly
      && candidate.audioCodec === delivery.audioCodec
      && candidate.videoCodec === delivery.videoCodec);
    if (!available) throw new Error(`CEVRA Media Runtime cannot execute ${delivery.container}/${delivery.videoCodec ?? "audio"}/${delivery.audioCodec} with its functional encoder profile.`);
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
    ...(video ? optionalRational(video, "avg_frame_rate", "avgFrameRate") : {}),
    ...(video ? optionalRational(video, "r_frame_rate", "rFrameRate") : {}),
    ...(video ? optionalBoolean(video, "variable_frame_rate_suspected", "variableFrameRateSuspected") : {}),
    ...(video ? optionalInteger(video, "rotation", "rotationDegrees", -360, 360) : {}),
    ...(video ? optionalString(video, "pix_fmt", "pixelFormat", 64) : {}),
    ...(video ? optionalInteger(video, "bit_depth", "bitDepth", 1, 64) : {}),
    ...(video ? optionalString(video, "color_space", "colorSpace", 64) : {}),
    ...(video ? optionalString(video, "color_primaries", "colorPrimaries", 64) : {}),
    ...(video ? optionalString(video, "color_transfer", "colorTransfer", 64) : {}),
    ...(video ? optionalString(video, "color_range", "colorRange", 64) : {}),
    ...(video ? optionalBoolean(video, "hdr", "hdr") : {}),
    ...(video ? optionalString(video, "hdr_format", "hdrFormat", 128) : {}),
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    ...(video && typeof video.codec === "string" ? { videoCodec: video.codec } : {}),
    ...(audio && typeof audio.codec === "string" ? { audioCodec: audio.codec } : {}),
    ...(audio && finite(audio.sample_rate) ? { sampleRate: audio.sample_rate } : {}),
    ...(audio && finite(audio.channels) ? { channels: audio.channels } : {})
  };
}

function optionalString(
  source: Record<string, unknown>,
  sourceKey: string,
  outputKey: string,
  maximumLength: number
): Record<string, string> {
  const value = source[sourceKey];
  if (value === undefined || value === null) return {};
  if (typeof value !== "string" || value.length === 0 || value.length > maximumLength || value !== value.trim() || /[\0\r\n]/u.test(value)) {
    throw new Error(`Media worker probe ${sourceKey} is invalid.`);
  }
  return { [outputKey]: value };
}

function optionalRational(
  source: Record<string, unknown>,
  sourceKey: string,
  outputKey: string
): Record<string, string> {
  const result = optionalString(source, sourceKey, outputKey, 64);
  const value = result[outputKey];
  if (value === undefined) return result;
  const match = /^(\d+)\/(\d+)$/u.exec(value);
  if (!match || (match[2] === "0" && match[1] !== "0")) throw new Error(`Media worker probe ${sourceKey} is invalid.`);
  return result;
}

function optionalBoolean(
  source: Record<string, unknown>,
  sourceKey: string,
  outputKey: string
): Record<string, boolean> {
  const value = source[sourceKey];
  if (value === undefined || value === null) return {};
  if (typeof value !== "boolean") throw new Error(`Media worker probe ${sourceKey} is invalid.`);
  return { [outputKey]: value };
}

function optionalInteger(
  source: Record<string, unknown>,
  sourceKey: string,
  outputKey: string,
  minimum: number,
  maximum: number
): Record<string, number> {
  const value = source[sourceKey];
  if (value === undefined || value === null) return {};
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Media worker probe ${sourceKey} is invalid.`);
  }
  return { [outputKey]: value };
}

function fileResult(payload: Record<string, unknown>, fallbackUri: string): MediaOperationResult {
  if (payload.status !== "completed" || typeof payload.output !== "string" || payload.output.trim().length === 0 || payload.output !== fallbackUri) {
    throw new Error("Media worker file result has no completed output evidence.");
  }
  const probe = isRecord(payload.probe) ? payload.probe : undefined;
  if (!probe || typeof probe.file !== "string" || probe.file.trim().length === 0 || probe.file !== payload.output) {
    throw new Error("Media worker file result has no verified output probe.");
  }
  const parsedProbe = parseProbe(probe, fallbackUri);
  if (!parsedProbe.hasVideo && !parsedProbe.hasAudio) throw new Error("Media worker output probe contains no audio or video stream.");
  const effectiveProfile = parseEffectiveProfile(payload.effectiveProfile);
  return {
    type: "file",
    outputUri: typeof payload.output === "string" ? payload.output : fallbackUri,
    ...(probe && finite(probe.duration) ? { durationMs: Math.round(probe.duration * 1000) } : {}),
    probe: parsedProbe,
    effectiveProfile
  };
}

function parseEffectiveProfile(value: unknown): EffectiveMediaProfile {
  if (!isRecord(value) || typeof value.container !== "string") throw new Error("Media worker result has no effective encoder profile.");
  const profile = value as Record<string, unknown>;
  for (const key of ["videoCodec", "audioCodec", "videoEncoder", "audioEncoder"]) {
    if (profile[key] !== undefined && (typeof profile[key] !== "string" || !profile[key])) throw new Error("Media worker effective profile is invalid.");
  }
  return profile as unknown as EffectiveMediaProfile;
}

function operationDelivery(operation: MediaOperation): ResolvedMediaDelivery | undefined {
  switch (operation.type) {
    case "probe": case "detect-silence": case "extract-frame": return undefined;
    case "transcode": return resolveTranscodeDelivery({ outputUri: operation.outputUri, ...(operation.container ? { container: operation.container } : {}), ...(operation.videoCodec ? { videoCodec: operation.videoCodec } : {}), ...(operation.audioCodec ? { audioCodec: operation.audioCodec } : {}), transformsVideo: operation.width !== undefined || operation.height !== undefined || operation.fps !== undefined });
    case "extract-audio": return resolveAudioDelivery(operation.outputUri, operation.audioCodec);
    case "volume": case "loudness-normalize": case "audio-fade": return resolveAudioMutationDelivery(operation.outputUri);
    case "mux-audio": { const container = resolveMediaContainer(operation.outputUri); const rule = MEDIA_DELIVERY_MATRIX[container]; return { container, audioOnly: false, videoCodec: "copy", audioCodec: rule.defaultAudioCodec }; }
    default: return resolveStandardAvDelivery(operation.outputUri, operation.type === "trim" || operation.type === "concat");
  }
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
