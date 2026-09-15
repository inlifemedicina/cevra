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

export interface AlignmentAudioLease {
  outputUri: string;
  release(): Promise<void>;
}

/** Trusted temporary storage for disposable alignment PCM artifacts. */
export interface AlignmentAudioWorkspace {
  acquire(jobId: string): Promise<AlignmentAudioLease>;
}
