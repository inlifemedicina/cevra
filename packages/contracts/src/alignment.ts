import type { TranscriptState } from "@cevra/project-ir";
import type { EngineAdapter, ExecutionContext } from "./base.js";

export type AlignmentLanguage = "pt" | "en";

export interface AlignmentRequest {
  inputUri: string;
  language: AlignmentLanguage;
  transcript: TranscriptState;
}

export interface AlignmentResult {
  transcript: TranscriptState;
  modelId: string;
  modelRevision?: string;
  modelDigest?: string;
  durationMs?: number;
}

export interface AlignmentEngineAdapter extends EngineAdapter {
  align(request: AlignmentRequest, context: ExecutionContext): Promise<AlignmentResult>;
}

export interface AlignmentExecutionIdentity {
  engineId: string;
  engineVersion: string;
  engineApiVersion: number;
  workerProtocolVersion: number;
  modelId: string;
  modelRevision: string;
  modelDigest: `sha256:${string}`;
  device: string;
  pipelineVersion: string;
  requiredSampleRate: number;
  maximumWindowMs: number;
  maximumTokensPerWindow: number;
  wildcardAlgorithmVersion: string;
  resultValidationVersion: string;
}

/** Optional additive cache capability. Absence means cache bypass, never a weak key. */
export interface AlignmentExecutionIdentityProvider {
  describeAlignmentExecution(
    request: AlignmentRequest,
    signal?: AbortSignal
  ): Promise<AlignmentExecutionIdentity | undefined>;
}

export interface AlignmentAudioLease {
  outputUri: string;
  release(): Promise<void>;
}

/** Trusted temporary storage for disposable alignment PCM artifacts. */
export interface AlignmentAudioWorkspace {
  acquire(jobId: string): Promise<AlignmentAudioLease>;
}
