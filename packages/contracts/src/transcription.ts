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
  /** Native model timestamps. WhisperX forced alignment is a separate future capability. */
  wordTiming?: "none" | "model";
}

export interface TranscriptionEngineAdapter extends EngineAdapter {
  transcribe(request: TranscriptionRequest, context: ExecutionContext): Promise<TranscriptionResult>;
}
