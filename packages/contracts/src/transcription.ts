import type { TranscriptState } from "@cevra/project-ir";
import type { EngineAdapter, ExecutionContext } from "./base.js";

export interface TranscriptionRequest {
  inputUri: string;
  language?: "auto" | "pt" | "en";
  wordTimestamps: boolean;
  diarization?: boolean;
}

export interface TranscriptionResult {
  transcript: TranscriptState;
  detectedLanguage?: string;
  modelId: string;
  durationMs?: number;
  /** Native model timestamps. Forced alignment uses the separate provider-neutral AlignmentEngineAdapter. */
  wordTiming?: "none" | "model";
}

export interface TranscriptionEngineAdapter extends EngineAdapter {
  transcribe(request: TranscriptionRequest, context: ExecutionContext): Promise<TranscriptionResult>;
}

/** Exact, provider-neutral identity of one deterministic transcription execution profile. */
export interface TranscriptionExecutionIdentity {
  engineId: string;
  engineVersion: string;
  engineApiVersion: number;
  workerProtocolVersion: number;
  modelId: string;
  /** Provider-facing model identifier expected in TranscriptionResult. */
  resultModelId: string;
  modelRevision: string;
  modelArtifactDigest: `sha256:${string}`;
  languageDetectionPolicyVersion: string;
  devicePolicy: string;
  effectiveDevice: string;
  computeType: string;
  task: "transcribe";
  resultNormalizationVersion: string;
  runtimePipelineVersion: string;
}

/** Optional additive cache capability. Absence means cache bypass, never a weak key. */
export interface TranscriptionExecutionIdentityProvider {
  describeTranscriptionExecution(
    request: TranscriptionRequest,
    signal?: AbortSignal
  ): Promise<TranscriptionExecutionIdentity | undefined>;
}
