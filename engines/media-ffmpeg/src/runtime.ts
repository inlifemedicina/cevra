import type {
  MediaRuntimeCapabilities,
  MediaWorkerClient,
  MediaWorkerEncoderBenchmark,
  MediaWorkerRuntimeProfile
} from "./worker.js";

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
  platform: RuntimePlatform;
  arch: string;
  workerSha256: string;
  executionBundleSha256: string;
  python: {
    version: string;
    executableSha256: string;
  };
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
    sha256: string;
    ffprobeSha256: string;
    configureFlagsSha256: string;
    configureFlags: string[];
    source: string;
    sourceSignature: string;
    signingFingerprint: string;
  };
}

export interface VideoEncoderSelection {
  encoder: string;
  codec: RuntimeVideoCodec;
  hardware: boolean;
  family: "videotoolbox" | "mediafoundation" | "nvenc" | "qsv" | "amf" | "software";
  reason: "benchmark" | "platform-priority";
}

export interface MediaRuntimeOptimization {
  profile: MediaWorkerRuntimeProfile;
  selections: Partial<Record<RuntimeVideoCodec, VideoEncoderSelection>>;
  recommendedDecodeAcceleration?: string;
}

const ENCODER_CANDIDATES: Record<RuntimeVideoCodec, Record<RuntimePlatform, readonly string[]>> = {
  h264: {
    darwin: ["h264_videotoolbox"],
    win32: ["h264_nvenc", "h264_qsv", "h264_amf", "h264_mf"],
    linux: ["h264_nvenc", "h264_qsv", "h264_amf"],
    unknown: []
  },
  h265: {
    darwin: ["hevc_videotoolbox"],
    win32: ["hevc_nvenc", "hevc_qsv", "hevc_amf", "hevc_mf"],
    linux: ["hevc_nvenc", "hevc_qsv", "hevc_amf"],
    unknown: []
  },
  av1: {
    darwin: ["av1_videotoolbox"],
    win32: ["av1_nvenc", "av1_qsv", "av1_amf", "av1_mf"],
    linux: ["av1_nvenc", "av1_qsv"],
    unknown: []
  }
};

export function approvedEncoderCandidates(capabilities: MediaRuntimeCapabilities, codec: RuntimeVideoCodec): string[] {
  const available = new Set(capabilities.encoders);
  return ENCODER_CANDIDATES[codec][capabilities.platform].filter((encoder) => available.has(encoder));
}

export function selectVideoEncoder(
  capabilities: MediaRuntimeCapabilities,
  codec: RuntimeVideoCodec,
  _mode: EncoderSelectionMode,
  benchmarks: readonly EncoderBenchmarkResult[] = []
): VideoEncoderSelection | undefined {
  const candidates = approvedEncoderCandidates(capabilities, codec);
  if (candidates.length === 0) return undefined;

  const relevantBenchmarks = benchmarks.filter((item) => item.codec === codec && candidates.includes(item.encoder));
  const benchmarked = relevantBenchmarks
    .filter((item) => item.success && Number.isFinite(item.fps))
    .sort((a, b) => (b.fps ?? 0) - (a.fps ?? 0));
  if (relevantBenchmarks.length > 0 && benchmarked.length === 0) return undefined;
  const encoder = benchmarked[0]?.encoder ?? candidates[0]!;
  return {
    encoder,
    codec,
    hardware: true,
    family: encoderFamily(encoder),
    reason: benchmarked.length > 0 ? "benchmark" : "platform-priority"
  };
}

export async function optimizeMediaRuntime(worker: MediaWorkerClient, mode: EncoderSelectionMode = "final"): Promise<MediaRuntimeOptimization> {
  const info = await worker.info();
  const capabilities = info.runtime;
  if (!capabilities) throw new Error("CEVRA Media Runtime did not report hardware capabilities.");

  const selections: Partial<Record<RuntimeVideoCodec, VideoEncoderSelection>> = {};
  for (const codec of ["h264", "h265", "av1"] as const) {
    const candidates = approvedEncoderCandidates(capabilities, codec);
    if (candidates.length === 0) continue;
    const benchmarks = await worker.benchmarkVideoEncoders(codec, candidates);
    const selection = selectVideoEncoder(capabilities, codec, mode, benchmarks);
    if (selection) selections[codec] = selection;
  }

  const recommendedDecodeAcceleration = selectDecodeAcceleration(capabilities);
  const profile: MediaWorkerRuntimeProfile = {
    ...(selections.h264 ? { h264Encoder: selections.h264.encoder } : {}),
    ...(selections.h265 ? { hevcEncoder: selections.h265.encoder } : {}),
    ...(selections.av1 ? { av1Encoder: selections.av1.encoder } : {}),
    ...(recommendedDecodeAcceleration ? { decodeAcceleration: recommendedDecodeAcceleration } : {})
  };
  await worker.configureRuntime(profile);
  return {
    profile,
    selections,
    ...(recommendedDecodeAcceleration ? { recommendedDecodeAcceleration } : {})
  };
}

export function selectDecodeAcceleration(capabilities: MediaRuntimeCapabilities): string | undefined {
  const available = new Set(capabilities.hwaccels);
  const priorities: Record<RuntimePlatform, readonly string[]> = {
    darwin: ["videotoolbox"],
    win32: ["d3d11va", "cuda", "dxva2"],
    linux: ["vaapi", "cuda", "vulkan"],
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
  return "software";
}
