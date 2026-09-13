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
export type EncoderBenchmarkResult = MediaWorkerEncoderBenchmark;

export interface MediaRuntimeManifestV1 {
  format: typeof CEVRA_MEDIA_RUNTIME_FORMAT;
  formatVersion: typeof CEVRA_MEDIA_RUNTIME_FORMAT_VERSION;
  runtimeVersion: string;
  workerVersion: string;
  platform: RuntimePlatform;
  arch: string;
  bundleTreeSha256: string;
  binFiles: [string, string];
  python: {
    version: string;
    root: "python";
    executable: string;
    executableSha256: string;
    treeSha256: string;
    provenance: "python/CEVRA_PYTHON_PROVENANCE.json";
    provenanceSha256: string;
    pruning: Record<string, unknown>;
    nativeComponents: Array<{ id: string; version: string; license: string; providedByPlatform?: "true" }>;
  };
  worker: {
    root: "worker";
    entrypoint: "worker/cevra_media_worker.py";
    treeSha256: string;
    files: Array<{ path: string; sha256: string }>;
  };
  upstream: {
    id: "ffmpeg-skill";
    version: string;
    contractVersion: string;
    commit: string;
    root: "vendor/ffmpeg-skill";
    treeSha256: string;
    package: "vendor/ffmpeg-skill/package.json";
    packageSha256: string;
    provenance: "vendor/ffmpeg-skill/CEVRA_PROVENANCE.json";
    provenanceSha256: string;
  };
  ffmpeg: {
    version: string;
    probeVersion: string;
    license: "LGPL-2.1-or-later" | "LGPL-3.0-or-later";
    buildId: string;
    executable: "bin/ffmpeg" | "bin/ffmpeg.exe";
    probeExecutable: "bin/ffprobe" | "bin/ffprobe.exe";
    sha256: string;
    ffprobeSha256: string;
    configureFlagsSha256: string;
    configureFlags: string[];
    source: string;
    sourceSignature: string;
    signingFingerprint: string;
    provenance: "provenance/ffmpeg.json";
    provenanceSha256: string;
    sourceArchiveSha256: string;
    sourceSignatureSha256: string;
    signingKeySha256: string;
    sourceArchive: string;
    sourceSignatureFile: string;
    signingKeyFile: string;
    buildInstructions: string;
    toolchain: { host: string; arch: string; compiler: string; python: string; sourceDateEpoch: "0" };
  };
  notices: Array<{ id: string; path: string; sha256: string; component?: string; version?: string }>;
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
    win32: [],
    linux: [],
    unknown: []
  },
  h265: {
    darwin: ["hevc_videotoolbox"],
    win32: [],
    linux: [],
    unknown: []
  },
  av1: {
    darwin: ["av1_videotoolbox"],
    win32: [],
    linux: [],
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
  benchmarks: readonly EncoderBenchmarkResult[] = []
): VideoEncoderSelection | undefined {
  const candidates = approvedEncoderCandidates(capabilities, codec);
  if (candidates.length === 0) return undefined;

  const relevantBenchmarks = benchmarks.filter((item) => item.codec === codec && candidates.includes(item.encoder));
  const successful = relevantBenchmarks.filter((item) => item.success && Number.isFinite(item.fps));
  const benchmarked = candidates.map((encoder) => successful.find((item) => item.encoder === encoder)).filter((item): item is EncoderBenchmarkResult => item !== undefined);
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

export async function optimizeMediaRuntime(worker: MediaWorkerClient): Promise<MediaRuntimeOptimization> {
  const info = await worker.info();
  const capabilities = info.runtime;
  if (!capabilities) throw new Error("CEVRA Media Runtime did not report hardware capabilities.");

  const selections: Partial<Record<RuntimeVideoCodec, VideoEncoderSelection>> = {};
  for (const codec of ["h264", "h265", "av1"] as const) {
    const candidates = approvedEncoderCandidates(capabilities, codec);
    if (candidates.length === 0) continue;
    const benchmarks = await worker.benchmarkVideoEncoders(codec, candidates);
    const selection = selectVideoEncoder(capabilities, codec, benchmarks);
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
    win32: [],
    linux: [],
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
