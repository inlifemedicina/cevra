import { fileURLToPath } from "node:url";
import { isAbsolute } from "node:path";
import type { TranscriptionRequest, TranscriptionResult } from "@cevra/contracts";
import { LocalTranscriptionError } from "./errors.js";
import {
  TRANSCRIPTION_PROTOCOL_VERSION,
  type RawWorkerResult,
  type RawWorkerSegment,
  type RawWorkerWord,
  type SupportedTranscriptionModelId
} from "./types.js";

const MAX_INPUT_URI_LENGTH = 4096;
const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;
/** faster-whisper timestamp tokens have 20 ms precision; only boundary drift within one token is clamped. */
export const MODEL_TIMESTAMP_TOLERANCE_MS = 20;
const FLOAT_COMPARISON_EPSILON_MS = 1e-6;
type TranscriptWord = TranscriptionResult["transcript"]["words"][number];
type TranscriptSegment = TranscriptionResult["transcript"]["segments"][number];

export function validateAndNormalizeRequest(request: TranscriptionRequest): {
  inputPath: string;
  language?: "pt" | "en";
  wordTimestamps: boolean;
} {
  if (!request || typeof request !== "object") invalidRequest("Transcription request must be an object.");
  const unexpected = Object.keys(request).filter((key) => !["inputUri", "language", "wordTimestamps", "diarization"].includes(key));
  if (unexpected.length > 0) invalidRequest(`Transcription request contains unexpected fields: ${unexpected.join(", ")}.`);
  if (typeof request.inputUri !== "string" || request.inputUri.length === 0 || request.inputUri.length > MAX_INPUT_URI_LENGTH) {
    invalidRequest(`inputUri must be a non-empty local path no longer than ${MAX_INPUT_URI_LENGTH} characters.`);
  }
  if (request.wordTimestamps !== true && request.wordTimestamps !== false) {
    invalidRequest("wordTimestamps must be a boolean.");
  }
  if (request.diarization !== undefined && request.diarization !== false) {
    invalidRequest("Diarization is not supported by Local Transcription Engine V1.");
  }
  if (request.language !== undefined && request.language !== "auto" && request.language !== "pt" && request.language !== "en") {
    throw new LocalTranscriptionError("TRANSCRIPTION_UNSUPPORTED_LANGUAGE", "Supported languages are auto, pt, and en.");
  }
  const inputPath = localPath(request.inputUri);
  return {
    inputPath,
    ...(request.language && request.language !== "auto" ? { language: request.language } : {}),
    wordTimestamps: request.wordTimestamps
  };
}

export function validateModelId(value: string): asserts value is SupportedTranscriptionModelId {
  if (!["tiny", "base", "small", "medium", "large-v3", "turbo"].includes(value)) {
    invalidRequest("The configured faster-whisper model is not allow-listed.");
  }
}

export function validateModelCacheDir(value: string): void {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_INPUT_URI_LENGTH || value.startsWith("-") || !isAbsolute(value)) {
    invalidRequest("modelCacheDir must be an absolute local path.");
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value) && !WINDOWS_ABSOLUTE_PATH.test(value)) {
    invalidRequest("modelCacheDir must not be a URI.");
  }
  if (/[\u0000-\u001f\u007f]/u.test(value)) invalidRequest("modelCacheDir contains control characters.");
}

export function normalizeWorkerResult(raw: unknown, request: TranscriptionWorkerRequestShape): TranscriptionResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) malformed("Worker result must be an object.");
  const result = raw as RawWorkerResult;
  exactKeys(result as unknown as Record<string, unknown>, ["protocolVersion", "modelId", "detectedLanguage", "durationSeconds", "segments"], "worker result");
  if (result.protocolVersion !== TRANSCRIPTION_PROTOCOL_VERSION) malformed("Worker protocol version is invalid.");
  if (result.modelId !== request.modelId) malformed("Worker model ID does not match the requested profile.");
  if (!Array.isArray(result.segments)) malformed("Worker segments must be an array.");
  const rawSegments = result.segments;
  if (result.detectedLanguage !== undefined && (typeof result.detectedLanguage !== "string" || !result.detectedLanguage.trim())) {
    malformed("Detected language must be a non-empty string.");
  }
  const durationMs = result.durationSeconds === undefined ? undefined : secondsToMilliseconds(result.durationSeconds, "duration");
  const words: TranscriptWord[] = [];
  const segments: TranscriptSegment[] = [];

  rawSegments.forEach((candidate, segmentIndex) => {
    const segment = objectValue(candidate, `segment ${segmentIndex}`) as unknown as RawWorkerSegment;
    exactKeys(segment as unknown as Record<string, unknown>, ["startSeconds", "endSeconds", "text", "words"], `segment ${segmentIndex}`);
    const interval = normalizeInterval(segment.startSeconds, segment.endSeconds, `segment ${segmentIndex}`);
    const { startMs, endMs } = interval;
    if (typeof segment.text !== "string") malformed(`Segment ${segmentIndex} text must be a string.`);
    const segmentId = `segment-${String(segmentIndex + 1).padStart(6, "0")}`;
    const wordIds: string[] = [];
    if (segment.words !== undefined) {
      if (!request.wordTimestamps) malformed("Worker returned words when word timestamps were disabled.");
      if (!Array.isArray(segment.words)) malformed(`Segment ${segmentIndex} words must be an array.`);
      segment.words.forEach((candidateWord, wordIndex) => {
        const word = objectValue(candidateWord, `segment ${segmentIndex} word ${wordIndex}`) as unknown as RawWorkerWord;
        exactKeys(word as unknown as Record<string, unknown>, ["startSeconds", "endSeconds", "text", "confidence"], `segment ${segmentIndex} word ${wordIndex}`);
        const wordInterval = normalizeInterval(
          word.startSeconds,
          word.endSeconds,
          `segment ${segmentIndex} word ${wordIndex}`
        );
        const normalizedWord = clampWordToSegment(wordInterval, interval, segmentIndex, wordIndex);
        if (typeof word.text !== "string") malformed(`Word ${wordIndex} in segment ${segmentIndex} text must be a string.`);
        const wordId = `${segmentId}-word-${String(wordIndex + 1).padStart(6, "0")}`;
        const confidence = optionalConfidence(word.confidence, segmentIndex, wordIndex);
        words.push({
          id: wordId,
          text: word.text,
          startMs: normalizedWord.startMs,
          endMs: normalizedWord.endMs,
          ...(confidence === undefined ? {} : { confidence })
        });
        wordIds.push(wordId);
      });
    }
    segments.push({ id: segmentId, startMs, endMs, text: segment.text, wordIds });
  });

  if (request.wordTimestamps && segments.some((segment, index) => {
    const rawSegment = rawSegments[index] as RawWorkerSegment;
    return !Array.isArray(rawSegment.words);
  })) malformed("Worker omitted requested word timestamps.");

  const transcriptLanguage = typeof result.detectedLanguage === "string" ? result.detectedLanguage : request.language;
  return {
    transcript: {
      ...(transcriptLanguage ? { language: transcriptLanguage } : {}),
      words,
      segments
    },
    ...(typeof result.detectedLanguage === "string" ? { detectedLanguage: result.detectedLanguage } : {}),
    modelId: request.modelId,
    ...(durationMs === undefined ? {} : { durationMs }),
    wordTiming: request.wordTimestamps ? "model" : "none"
  };
}

interface TranscriptionWorkerRequestShape {
  modelId: string;
  language?: string;
  wordTimestamps: boolean;
}

function localPath(inputUri: string): string {
  if (/[\u0000-\u001f\u007f]/u.test(inputUri)) invalidRequest("inputUri contains control characters.");
  if (inputUri.startsWith("-")) invalidRequest("inputUri must not be an option-like path.");
  if (inputUri.startsWith("file://")) {
    let url: URL;
    try { url = new URL(inputUri); } catch (error) { throw invalidRequestError("inputUri is not a valid file URI.", error); }
    if (url.hostname && url.hostname !== "localhost") invalidRequest("Network file URIs are not supported.");
    try { return fileURLToPath(url); } catch (error) { throw invalidRequestError("inputUri is not a valid local file URI.", error); }
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(inputUri) && !WINDOWS_ABSOLUTE_PATH.test(inputUri)) {
    invalidRequest("Only local file paths are supported.");
  }
  if (!isAbsolute(inputUri) && !WINDOWS_ABSOLUTE_PATH.test(inputUri)) invalidRequest("inputUri must be an absolute local path or file URI.");
  return inputUri;
}

function secondsToMilliseconds(value: unknown, field: string): number {
  const seconds = finiteNonNegativeSeconds(value, field);
  const milliseconds = Math.round(seconds * 1000);
  if (!Number.isSafeInteger(milliseconds)) malformed(`${field} exceeds the supported timestamp range.`);
  return milliseconds;
}

interface NormalizedInterval {
  rawStartSeconds: number;
  rawEndSeconds: number;
  startMs: number;
  endMs: number;
}

function normalizeInterval(rawStart: unknown, rawEnd: unknown, field: string): NormalizedInterval {
  const rawStartSeconds = finiteNonNegativeSeconds(rawStart, `${field} start`);
  const rawEndSeconds = finiteNonNegativeSeconds(rawEnd, `${field} end`);
  if (rawEndSeconds < rawStartSeconds) malformed(`${field} end must not precede its start.`);
  const startMs = secondsToMilliseconds(rawStartSeconds, `${field} start`);
  let endMs = secondsToMilliseconds(rawEndSeconds, `${field} end`);
  if (endMs <= startMs) endMs = startMs + 1;
  if (!Number.isSafeInteger(endMs)) malformed(`${field} exceeds the supported timestamp range.`);
  return { rawStartSeconds, rawEndSeconds, startMs, endMs };
}

function clampWordToSegment(
  word: NormalizedInterval,
  segment: NormalizedInterval,
  segmentIndex: number,
  wordIndex: number
): Pick<NormalizedInterval, "startMs" | "endMs"> {
  const earlyDriftMs = Math.max(0, (segment.rawStartSeconds - word.rawStartSeconds) * 1000);
  const lateDriftMs = Math.max(0, (word.rawEndSeconds - segment.rawEndSeconds) * 1000);
  if (
    earlyDriftMs > MODEL_TIMESTAMP_TOLERANCE_MS + FLOAT_COMPARISON_EPSILON_MS ||
    lateDriftMs > MODEL_TIMESTAMP_TOLERANCE_MS + FLOAT_COMPARISON_EPSILON_MS
  ) {
    malformed(`Word ${wordIndex} is outside segment ${segmentIndex} by more than ${MODEL_TIMESTAMP_TOLERANCE_MS} ms.`);
  }
  let startMs = Math.max(segment.startMs, word.startMs);
  let endMs = Math.min(segment.endMs, word.endMs);
  if (endMs <= startMs) {
    startMs = Math.min(Math.max(startMs, segment.startMs), segment.endMs - 1);
    endMs = startMs + 1;
  }
  return { startMs, endMs };
}

function finiteNonNegativeSeconds(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    malformed(`${field} must be a finite non-negative number.`);
  }
  return value;
}

function optionalConfidence(value: unknown, segmentIndex: number, wordIndex: number): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    malformed(`Word ${wordIndex} in segment ${segmentIndex} confidence must be between 0 and 1.`);
  }
  return value;
}

function objectValue(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) malformed(`${field} must be an object.`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: string[], field: string): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) malformed(`${field} contains unexpected fields: ${unexpected.join(", ")}.`);
}

function invalidRequest(message: string): never {
  throw new LocalTranscriptionError("TRANSCRIPTION_INVALID_REQUEST", message);
}

function invalidRequestError(message: string, cause: unknown): LocalTranscriptionError {
  return new LocalTranscriptionError("TRANSCRIPTION_INVALID_REQUEST", message, { cause });
}

function malformed(message: string): never {
  throw new LocalTranscriptionError("TRANSCRIPTION_MALFORMED_RESULT", message);
}
