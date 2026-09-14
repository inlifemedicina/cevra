import type { ExecutionContext } from "@cevra/contracts";

export const TRANSCRIPTION_PROTOCOL_VERSION = 1 as const;
export const FASTER_WHISPER_VERSION = "1.2.1" as const;
export const DEFAULT_TRANSCRIPTION_MODEL_ID = "base" as const;

export type SupportedTranscriptionModelId = "tiny" | "base" | "small" | "medium" | "large-v3" | "turbo";
export type TranscriptionDevice = "auto" | "cpu" | "cuda";
export type TranscriptionComputeType = "default" | "int8" | "int8_float16" | "float16" | "float32";

export interface ManagedTranscriptionRuntime {
  mode: "managed";
  /** A venv executable below environmentRoot, backed by the private CEVRA CPython distribution. */
  pythonExecutable: string;
  /** Root of the immutable private CPython distribution shared by CEVRA engines. */
  privatePythonRoot: string;
  /** Transcription-only venv; it must not overlap privatePythonRoot or the Media Runtime. */
  environmentRoot: string;
}

export interface DevelopmentTranscriptionRuntime {
  mode: "development";
  /** Explicit interpreter only. Developer mode never searches PATH. */
  pythonExecutable: string;
  environmentRoot?: string;
  workerScript?: string;
}

export type TranscriptionRuntime = ManagedTranscriptionRuntime | DevelopmentTranscriptionRuntime;

export interface FasterWhisperProfile {
  modelId?: SupportedTranscriptionModelId;
  modelCacheDir: string;
  allowModelDownload?: boolean;
  device?: TranscriptionDevice;
  computeType?: TranscriptionComputeType;
}

export interface LocalTranscriptionAdapterOptions {
  runtime: TranscriptionRuntime;
  profile: FasterWhisperProfile;
  runner?: TranscriptionWorkerRunner;
}

export interface TranscriptionWorkerRequest {
  protocolVersion: typeof TRANSCRIPTION_PROTOCOL_VERSION;
  operation: "transcribe";
  jobId: string;
  inputPath: string;
  language?: "pt" | "en";
  wordTimestamps: boolean;
  modelId: SupportedTranscriptionModelId;
  modelCacheDir: string;
  allowModelDownload: boolean;
  device: TranscriptionDevice;
  computeType: TranscriptionComputeType;
}

export interface TranscriptionWorkerHealth {
  protocolVersion: typeof TRANSCRIPTION_PROTOCOL_VERSION;
  status: "ready";
  fasterWhisperVersion: string;
}

export interface TranscriptionWorkerRunner {
  transcribe(request: TranscriptionWorkerRequest, context: ExecutionContext): Promise<unknown>;
  healthcheck(): Promise<TranscriptionWorkerHealth>;
}

export interface RawWorkerWord {
  text: unknown;
  startSeconds: unknown;
  endSeconds: unknown;
  confidence?: unknown;
}

export interface RawWorkerSegment {
  text: unknown;
  startSeconds: unknown;
  endSeconds: unknown;
  words?: unknown;
}

export interface RawWorkerResult {
  protocolVersion: unknown;
  modelId: unknown;
  detectedLanguage?: unknown;
  durationSeconds?: unknown;
  segments: unknown;
}
