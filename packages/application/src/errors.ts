import { translate, type CevraLocale, type TranslationKey, type TranslationParameters } from "@cevra/i18n";
import type { MediaApplicationErrorCode } from "./types.js";

const ERROR_KEYS: Readonly<Record<MediaApplicationErrorCode, TranslationKey>> = {
  MEDIA_OPERATION_CANCELLED: "media.error.cancelled",
  MEDIA_OPERATION_INTERRUPTED: "media.error.interrupted",
  MEDIA_OPERATION_FAILED: "media.error.failed",
  MEDIA_OUTPUT_EXISTS: "media.error.outputExists",
  MEDIA_OUTPUT_MISSING: "media.error.outputMissing",
  MEDIA_OPERATION_NOT_FOUND: "media.error.notFound",
  MEDIA_OPERATION_NOT_RETRYABLE: "media.error.notRetryable",
  MEDIA_PROJECT_CONFLICT: "media.error.projectConflict",
  MEDIA_INVALID_REQUEST: "media.error.invalidRequest",
  MEDIA_PROJECT_COMMIT_FAILED: "media.error.commitFailed",
  MEDIA_RECOVERY_FAILED: "media.error.recoveryFailed",
  MEDIA_INPUT_ARTIFACT_CHANGED: "media.error.inputArtifactChanged",
  SOURCE_CONTENT_CHANGED: "sourceDescriptor.error.contentChanged",
  SOURCE_OFFLINE: "sourceDescriptor.error.sourceOffline",
  SOURCE_VERIFICATION_UNAVAILABLE: "sourceDescriptor.error.identityUnavailable"
};

export class MediaApplicationError extends Error {
  readonly cause: unknown;

  constructor(
    readonly code: MediaApplicationErrorCode,
    readonly locale: CevraLocale,
    readonly executionId: string,
    parameters: TranslationParameters = {},
    cause?: unknown
  ) {
    super(translate(locale, ERROR_KEYS[code], parameters));
    this.name = "MediaApplicationError";
    this.cause = cause;
  }
}
