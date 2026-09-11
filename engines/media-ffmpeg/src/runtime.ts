import type { MediaRuntimeCapabilities, MediaWorkerEncoderBenchmark } from "./worker.js";

export const CEVRA_MEDIA_RUNTIME_FORMAT = "cevra-media-runtime" as const;
export const CEVRA_MEDIA_RUNTIME_FORMAT_VERSION = 1 as const;

export type RuntimePlatform = MediaRuntimeCapabilities["platform"];
export type RuntimeVideoCodec = "h264" | "h265" | "av1";
export type EncoderSelectionMode = "preview" | "final";
export type EncoderBenchmarkResult = MediaWorkerEncoderBenchmark;

export interface MediaRuntimeManifestV1 {
  format: typeof CEVRA_MEDIA_RUNTIME_FORMAT;
  formatVersion: typeof CEVRA_MEDIA_RUNTIME_FORMAT_VERSION;
  runtimeVersion: string;
  workerVersion: string;
  upstream: {
    id: "ffmpeg-skill";
    version: string;
    contractVersion: string;
    commit: string;
  };
  ffmpeg: {
    version: string;
    license: "LGPL-2.1-or-later" | "LGPL-3.0-or-later";
    buildId: string;
    configureFlagsSha256: string;
  };
}

export interface VideoEncoderSelection {
  encoder: string;
  codec: RuntimeVideoCodec;
  hardware: boolean;
  family: "videotoolbox" | "mediafoundation" | "nvenc" | "qsv" | "amf" | "vaapi" | "software";
  reason: "benchmark" | "platform-priority";
}

const ENCODER_CANDIDATES: Record<RuntimeVideoCodec, Record<RuntimePlatform, readonly string[]>> = {
  h264: {
    darwin: ["h264_videotoolbox"],
    win32: ["h264_nvenc", "h264_qsv", "h264_amf", "h264_mf"],
    linux: ["h264_nvenc", "h264_qsv", "h264_vaapi", "h264_amf"],
    unknown: []
  },
  h265: {
    darwin: ["hevc_videotoolbox"],
    win32: ["hevc_nvenc", "hevc_qsv", "hevc_amf", "hevc_mf"],
    linux: ["hevc_nvenc", "hevc_qsv", "hevc_vaapi", "hevc_amf"],
    unknown: []
  },
  av1: {
    darwin: ["av1_videotoolbox"],
    win32: ["av1_nvenc", "av1_qsv", "av1_amf", "av1_mf"],
    linux: ["av1_nvenc", "av1_qsv", "av1_vaapi"],
    unknown: []
  }
};

export function selectVideoEncoder(
  capabilities: MediaRuntimeCapabilities,
  codec: RuntimeVideoCodec,
  _mode: EncoderSelectionMode,
  benchmarks: readonly EncoderBenchmarkResult[] = []
): VideoEncoderSelection | undefined {
  const available = new Set(capabilities.encoders);
  const candidates = ENCODER_CANDIDATES[codec][capabilities.platform].filter((encoder) => available.has(encoder));
  if (candidates.length === 0) return undefined;

  const benchmarked = benchmarks
    .filter((item) => item.codec === codec && item.success && candidates.includes(item.encoder) && Number.isFinite(item.fps))
    .sort((a, b) => (b.fps ?? 0) - (a.fps ?? 0));
  const encoder = benchmarked[0]?.encoder ?? candidates[0]!;
  return {
    encoder,
    codec,
    hardware: !encoder.startsWith("lib"),
    family: encoderFamily(encoder),
    reason: benchmarked.length > 0 ? "benchmark" : "platform-priority"
  };
}

export function selectDecodeAcceleration(capabilities: MediaRuntimeCapabilities): string | undefined {
  const available = new Set(capabilities.hwaccels);
  const priorities: Record<RuntimePlatform, readonly string[]> = {
    darwin: ["videotoolbox"],
    win32: ["d3d11va", "qsv", "cuda", "dxva2"],
    linux: ["vaapi", "qsv", "cuda", "vulkan"],
    unknown: []
  };
  return priorities[capabilities.platform].find((name) => available.has(name));
}

export function encoderFamily(encoder: string): VideoEncoderSelection["family"] {
  if (encoder.endsWith("_videotoolbox")) return "videotoolbox";
  if (encoder.endsWith("_mf")) return "mediafoundation";
  if (encoder.endsWith("_nvenc")) return "nvenc";
  if (encoder.endsWith("_qsv")) return "qsv";
  if (encoder.endsWith("_amf")) return "amf";
  if (encoder.endsWith("_vaapi")) return "vaapi";
  return "software";
}
