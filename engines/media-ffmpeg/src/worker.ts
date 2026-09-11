export interface WorkerCheck {
  id: string;
  status: "PASS" | "WARN" | "FAIL" | "UNKNOWN";
  message?: string;
  evidence?: Record<string, unknown>;
}

export type WorkerVideoCodec = "h264" | "h265" | "av1";

export interface MediaRuntimeCapabilities {
  platform: "darwin" | "win32" | "linux" | "unknown";
  arch: string;
  ffmpegVersion?: string;
  ffmpegLicense?: string;
  encoders: string[];
  hwaccels: string[];
}

export interface MediaWorkerRuntimeProfile {
  h264Encoder?: string;
  hevcEncoder?: string;
  av1Encoder?: string;
  decodeAcceleration?: string;
}

export interface MediaWorkerEncoderBenchmark {
  encoder: string;
  codec: WorkerVideoCodec;
  success: boolean;
  fps?: number;
  realtimeFactor?: number;
  detail?: string;
}

export interface MediaWorkerInfo {
  name: string;
  version: string;
  protocolVersion: number;
  upstream: {
    id: "ffmpeg-skill";
    version: string;
    contractVersion: string;
    commit?: string;
  };
  runtime?: MediaRuntimeCapabilities;
}

export interface MediaWorkerHealth {
  ok: boolean;
  checkedAt: string;
  checks: WorkerCheck[];
  tools: Record<string, { usable: "yes" | "no" | "unknown"; missing?: string[]; detail?: string }>;
  runtime?: MediaRuntimeCapabilities;
}

export interface MediaWorkerToolResult {
  isError?: boolean;
  content?: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
}

export interface MediaWorkerClient {
  info(): Promise<MediaWorkerInfo>;
  health(): Promise<MediaWorkerHealth>;
  configureRuntime(profile: MediaWorkerRuntimeProfile): Promise<void>;
  benchmarkVideoEncoders(codec: WorkerVideoCodec, encoders: string[]): Promise<MediaWorkerEncoderBenchmark[]>;
  listTools(): Promise<Array<{ name: string; inputSchema?: Record<string, unknown> }>>;
  callTool(name: string, arguments_: Record<string, unknown>, signal?: AbortSignal): Promise<MediaWorkerToolResult>;
}
