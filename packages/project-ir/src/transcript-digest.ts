import { sha256 } from "@noble/hashes/sha2.js";
import {
  TRANSCRIPT_DIGEST_VERSION,
  type SourceTranscript,
  type TranscriptDigest,
  type TranscriptSpeakerState,
  type TranscriptState,
  type TranscriptWordTiming
} from "./types.js";
import { assertValidSourceTranscriptForCreation } from "./validation.js";

export interface TranscriptDigestInput {
  transcript: TranscriptState;
  wordTiming: TranscriptWordTiming;
  speakerState: TranscriptSpeakerState;
}

export function serializeTranscriptDigestInput(input: TranscriptDigestInput): string {
  assertDigestEnum(input.wordTiming, ["none", "model", "aligned", "unknown"], "wordTiming");
  assertDigestEnum(input.speakerState, ["none", "partial", "complete"], "speakerState");

  const language = input.transcript.language === undefined
    ? "null"
    : quoteCanonicalString(input.transcript.language, "transcript.language");
  const words = input.transcript.words.map((word, index) => {
    const path = `transcript.words[${index}]`;
    return `[${quoteCanonicalString(word.id, `${path}.id`)},${quoteCanonicalString(word.text, `${path}.text`)},${canonicalTime(word.startMs, `${path}.startMs`)},${canonicalTime(word.endMs, `${path}.endMs`)},${optionalCanonicalString(word.speakerId, `${path}.speakerId`)}]`;
  }).join(",");
  const segments = input.transcript.segments.map((segment, index) => {
    const path = `transcript.segments[${index}]`;
    const wordIds = segment.wordIds.map((wordId, wordIndex) => quoteCanonicalString(wordId, `${path}.wordIds[${wordIndex}]`)).join(",");
    return `[${quoteCanonicalString(segment.id, `${path}.id`)},${quoteCanonicalString(segment.text, `${path}.text`)},${canonicalTime(segment.startMs, `${path}.startMs`)},${canonicalTime(segment.endMs, `${path}.endMs`)},[${wordIds}],${optionalCanonicalString(segment.speakerId, `${path}.speakerId`)}]`;
  }).join(",");

  return `{"version":${TRANSCRIPT_DIGEST_VERSION},"language":${language},"wordTiming":${quoteCanonicalString(input.wordTiming, "wordTiming")},"speakerState":${quoteCanonicalString(input.speakerState, "speakerState")},"words":[${words}],"segments":[${segments}]}`;
}

export function computeTranscriptDigest(input: TranscriptDigestInput): TranscriptDigest {
  const canonical = serializeTranscriptDigestInput(input);
  const digest = sha256(new TextEncoder().encode(canonical));
  return `sha256-v1:${bytesToHex(digest)}`;
}

export function createSourceTranscript(input: Omit<SourceTranscript, "transcriptDigest">): SourceTranscript {
  const transcript: SourceTranscript = {
    ...input,
    transcriptDigest: computeTranscriptDigest(input)
  };
  return assertValidSourceTranscriptForCreation(transcript);
}

function optionalCanonicalString(value: string | undefined, path: string): string {
  return value === undefined ? "null" : quoteCanonicalString(value, path);
}

function canonicalTime(value: number, path: string): string {
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
    throw new Error(`${path} must be a non-negative safe integer without negative zero.`);
  }
  return String(value);
}

function quoteCanonicalString(value: string, path: string): string {
  if (typeof value !== "string") throw new Error(`${path} must be a string.`);
  let output = '"';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error(`${path} contains an unpaired surrogate.`);
      output += value.slice(index, index + 2);
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) throw new Error(`${path} contains an unpaired surrogate.`);
    switch (code) {
      case 0x08: output += "\\b"; break;
      case 0x09: output += "\\t"; break;
      case 0x0a: output += "\\n"; break;
      case 0x0c: output += "\\f"; break;
      case 0x0d: output += "\\r"; break;
      case 0x22: output += '\\"'; break;
      case 0x5c: output += "\\\\"; break;
      default:
        output += code <= 0x1f ? `\\u${code.toString(16).padStart(4, "0")}` : value.charAt(index);
    }
  }
  return `${output}"`;
}

function assertDigestEnum<T extends string>(value: string, allowed: readonly T[], path: string): asserts value is T {
  if (!allowed.includes(value as T)) throw new Error(`${path} is invalid.`);
}

function bytesToHex(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) output += byte.toString(16).padStart(2, "0");
  return output;
}
