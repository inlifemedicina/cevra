export type LocalAlignmentErrorCode =
  | "ALIGNMENT_INVALID_REQUEST"
  | "ALIGNMENT_RUNTIME_UNAVAILABLE"
  | "ALIGNMENT_WORKER_START_FAILED"
  | "ALIGNMENT_MODEL_UNAVAILABLE"
  | "ALIGNMENT_UNSUPPORTED_LANGUAGE"
  | "ALIGNMENT_FAILED"
  | "ALIGNMENT_MALFORMED_RESULT"
  | "ALIGNMENT_CANCELLED"
  | "ALIGNMENT_BUSY";

export class LocalAlignmentError extends Error {
  constructor(readonly code: LocalAlignmentErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LocalAlignmentError";
  }
}

export function alignmentCancellation(cause?: unknown): LocalAlignmentError {
  return new LocalAlignmentError("ALIGNMENT_CANCELLED", "The local alignment operation was cancelled.", cause === undefined ? undefined : { cause });
}
