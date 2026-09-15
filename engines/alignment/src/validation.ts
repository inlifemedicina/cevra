import { fileURLToPath } from "node:url";
import { isAbsolute } from "node:path";
import type { AlignmentRequest, AlignmentResult } from "@cevra/contracts";
import { LocalAlignmentError } from "./errors.js";
import { ALIGNMENT_PROTOCOL_VERSION, type AlignmentModelPin, type AlignmentWorkerRequest } from "./types.js";

const MAX_PATH = 4096;
const WINDOWS_PATH = /^[A-Za-z]:[\\/]/u;

type TranscriptState = AlignmentRequest["transcript"];

export function normalizeAlignmentRequest(request: AlignmentRequest): { inputPath: string; language: "pt" | "en"; transcript: TranscriptState } {
  if (!isRecord(request)) invalid("Alignment request must be an object.");
  exactKeys(request, ["inputUri", "language", "transcript"], "request");
  if (request.language !== "pt" && request.language !== "en") throw new LocalAlignmentError("ALIGNMENT_UNSUPPORTED_LANGUAGE", "Supported alignment languages are pt and en.");
  validateTranscriptShape(request.transcript, "request.transcript", false);
  return { inputPath: localPath(request.inputUri), language: request.language, transcript: clone(request.transcript) };
}

export function normalizeAlignmentWorkerResult(raw: unknown, request: AlignmentWorkerRequest, pin: AlignmentModelPin): AlignmentResult {
  if (!isRecord(raw)) malformed("Worker result must be an object.");
  exactKeys(raw, ["protocolVersion", "transcript", "modelId", "modelRevision", "modelDigest", "durationMs"], "worker result");
  if (raw.protocolVersion !== ALIGNMENT_PROTOCOL_VERSION) malformed("Worker protocol version is invalid.");
  if (raw.modelId !== pin.modelId || raw.modelRevision !== pin.revision || raw.modelDigest !== pin.modelDigest) malformed("Worker model identity does not match the pinned model.");
  validateTranscriptShape(raw.transcript, "worker transcript", true);
  if ((raw.transcript as TranscriptState).language !== request.language) malformed("Worker transcript language changed.");
  if (raw.durationMs !== undefined && !canonicalNonNegative(raw.durationMs)) malformed("Worker durationMs is invalid.");
  validateCandidateIdentity(raw.transcript as TranscriptState, request.transcript, raw.durationMs as number | undefined);
  return {
    transcript: clone(raw.transcript as TranscriptState), modelId: pin.modelId,
    modelRevision: pin.revision, modelDigest: pin.modelDigest,
    ...(raw.durationMs === undefined ? {} : { durationMs: raw.durationMs as number })
  };
}

function validateTranscriptShape(value: unknown, field: string, requirePositiveTimes: boolean): asserts value is TranscriptState {
  if (!isRecord(value)) malformed(`${field} must be an object.`);
  exactKeys(value, ["language", "words", "segments"], field);
  if (value.language !== "pt" && value.language !== "en") malformed(`${field}.language is unsupported.`);
  if (!Array.isArray(value.words) || value.words.length === 0 || !Array.isArray(value.segments) || value.segments.length === 0) malformed(`${field} must contain words and segments.`);
  const wordIds = new Set<string>();
  let previousWordEnd = 0;
  value.words.forEach((raw, index) => {
    if (!isRecord(raw)) malformed(`${field}.words[${index}] must be an object.`);
    exactKeys(raw, ["id", "text", "startMs", "endMs", "confidence", "speakerId"], `${field}.words[${index}]`);
    if (typeof raw.id !== "string" || !raw.id || wordIds.has(raw.id) || typeof raw.text !== "string") malformed(`${field}.words[${index}] identity is invalid.`);
    wordIds.add(raw.id);
    if (!canonicalNonNegative(raw.startMs) || !canonicalNonNegative(raw.endMs) || (requirePositiveTimes && raw.endMs <= raw.startMs)) malformed(`${field}.words[${index}] timing is invalid.`);
    if (requirePositiveTimes && index > 0 && raw.startMs < previousWordEnd) malformed(`${field}.words[${index}] crosses the prior word.`);
    previousWordEnd = raw.endMs as number;
    if (raw.confidence !== undefined && (typeof raw.confidence !== "number" || !Number.isFinite(raw.confidence) || raw.confidence < 0 || raw.confidence > 1)) malformed(`${field}.words[${index}] confidence is invalid.`);
    if (raw.speakerId !== undefined && (typeof raw.speakerId !== "string" || !raw.speakerId)) malformed(`${field}.words[${index}] speakerId is invalid.`);
  });
  const segmentIds = new Set<string>();
  const mapped = new Set<string>();
  let previousSegmentEnd = 0;
  value.segments.forEach((raw, index) => {
    if (!isRecord(raw)) malformed(`${field}.segments[${index}] must be an object.`);
    exactKeys(raw, ["id", "text", "startMs", "endMs", "wordIds", "speakerId"], `${field}.segments[${index}]`);
    if (typeof raw.id !== "string" || !raw.id || segmentIds.has(raw.id) || typeof raw.text !== "string" || !Array.isArray(raw.wordIds)) malformed(`${field}.segments[${index}] identity is invalid.`);
    segmentIds.add(raw.id);
    if (!canonicalNonNegative(raw.startMs) || !canonicalNonNegative(raw.endMs) || (requirePositiveTimes && raw.endMs <= raw.startMs)) malformed(`${field}.segments[${index}] timing is invalid.`);
    if (requirePositiveTimes && index > 0 && raw.startMs < previousSegmentEnd) malformed(`${field}.segments[${index}] crosses the prior segment.`);
    previousSegmentEnd = raw.endMs as number;
    raw.wordIds.forEach((id) => { if (typeof id !== "string" || !wordIds.has(id) || mapped.has(id)) malformed(`${field}.segments[${index}] word mapping is invalid.`); mapped.add(id); });
    if (raw.speakerId !== undefined && (typeof raw.speakerId !== "string" || !raw.speakerId)) malformed(`${field}.segments[${index}] speakerId is invalid.`);
  });
  if (mapped.size !== wordIds.size) malformed(`${field} does not map every canonical word exactly once.`);
}

function validateCandidateIdentity(candidate: TranscriptState, input: TranscriptState, durationMs?: number): void {
  if (candidate.words.length !== input.words.length || candidate.segments.length !== input.segments.length) malformed("Worker transcript is partial.");
  const candidateWords = new Map(candidate.words.map((word) => [word.id, word]));
  candidate.words.forEach((word, index) => {
    const original = input.words[index];
    if (!original || word.id !== original.id || word.text !== original.text || word.confidence !== original.confidence || word.speakerId !== original.speakerId) malformed(`Worker word ${index} changed canonical identity or text.`);
    if (durationMs !== undefined && word.endMs > durationMs) malformed(`Worker word ${index} exceeds prepared audio.`);
  });
  candidate.segments.forEach((segment, index) => {
    const original = input.segments[index];
    if (!original || segment.id !== original.id || segment.text !== original.text || segment.speakerId !== original.speakerId
      || segment.wordIds.length !== original.wordIds.length || segment.wordIds.some((id, wordIndex) => id !== original.wordIds[wordIndex])) {
      malformed(`Worker segment ${index} changed canonical identity or mapping.`);
    }
    const words = segment.wordIds.map((id) => candidateWords.get(id));
    if (words.some((word) => word === undefined)
      || words.length === 0
      || words.some((word) => word!.startMs < segment.startMs || word!.endMs > segment.endMs)
      || segment.startMs !== Math.min(...words.map((word) => word!.startMs))
      || segment.endMs !== Math.max(...words.map((word) => word!.endMs))) malformed(`Worker segment ${index} timing is not derived from its words.`);
    if (durationMs !== undefined && segment.endMs > durationMs) malformed(`Worker segment ${index} exceeds prepared audio.`);
  });
}

function localPath(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > MAX_PATH || value.startsWith("-") || /[\u0000-\u001f\u007f]/u.test(value)) invalid("inputUri is invalid.");
  if (value.startsWith("file://")) { try { const url = new URL(value); if (url.hostname && url.hostname !== "localhost") invalid("Network file URIs are not supported."); return fileURLToPath(url); } catch (cause) { throw new LocalAlignmentError("ALIGNMENT_INVALID_REQUEST", "inputUri is not a valid local file URI.", { cause }); } }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value) && !WINDOWS_PATH.test(value)) invalid("Only local paths are supported.");
  if (!isAbsolute(value) && !WINDOWS_PATH.test(value)) invalid("inputUri must be an absolute local path.");
  return value;
}
function canonicalNonNegative(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0); }
function exactKeys(value: Record<string, unknown>, allowed: readonly string[], field: string): void { const extras = Object.keys(value).filter((key) => !allowed.includes(key)); if (extras.length) malformed(`${field} contains unexpected fields: ${extras.join(", ")}.`); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function invalid(message: string): never { throw new LocalAlignmentError("ALIGNMENT_INVALID_REQUEST", message); }
function malformed(message: string): never { throw new LocalAlignmentError("ALIGNMENT_MALFORMED_RESULT", message); }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
