export type LocalTranscriptionErrorCode =
  | "TRANSCRIPTION_INVALID_REQUEST"
  | "TRANSCRIPTION_RUNTIME_UNAVAILABLE"
  | "TRANSCRIPTION_WORKER_START_FAILED"
  | "TRANSCRIPTION_MODEL_UNAVAILABLE"
  | "TRANSCRIPTION_UNSUPPORTED_LANGUAGE"
  | "TRANSCRIPTION_FAILED"
  | "TRANSCRIPTION_MALFORMED_RESULT"
  | "TRANSCRIPTION_CANCELLED"
  | "TRANSCRIPTION_BUSY";

export class LocalTranscriptionError extends Error {
  readonly code: LocalTranscriptionErrorCode;

  constructor(code: LocalTranscriptionErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LocalTranscriptionError";
    this.code = code;
  }
}

export function cancellationError(cause?: unknown): LocalTranscriptionError {
  return new LocalTranscriptionError(
    "TRANSCRIPTION_CANCELLED",
    "The local transcription operation was cancelled.",
    cause === undefined ? undefined : { cause }
  );
}
