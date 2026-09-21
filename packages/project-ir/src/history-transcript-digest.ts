import { sha256 } from "@noble/hashes/sha2.js";
import type { SourceTranscript } from "./types.js";

export const HISTORY_TRANSCRIPT_BLOB_DIGEST_PREFIX = "sha256-history-transcript-v1-" as const;
export type HistoryTranscriptBlobDigest = `${typeof HISTORY_TRANSCRIPT_BLOB_DIGEST_PREFIX}${string}`;

export function serializeHistoryTranscriptBlobInput(transcript: SourceTranscript): string {
  return canonicalJson(transcript, "sourceTranscript", new Set<object>());
}

export function computeHistoryTranscriptBlobDigest(transcript: SourceTranscript): HistoryTranscriptBlobDigest {
  const canonical = serializeHistoryTranscriptBlobInput(transcript);
  const digest = sha256(new TextEncoder().encode(canonical));
  return `${HISTORY_TRANSCRIPT_BLOB_DIGEST_PREFIX}${bytesToHex(digest)}`;
}

export function isHistoryTranscriptBlobDigest(value: unknown): value is HistoryTranscriptBlobDigest {
  return typeof value === "string" && /^sha256-history-transcript-v1-[0-9a-f]{64}$/u.test(value);
}

function canonicalJson(value: unknown, path: string, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return quoteCanonicalString(value, path);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new Error(`${path} must contain only finite JSON numbers without negative zero.`);
    return JSON.stringify(value);
  }
  if (typeof value !== "object") throw new Error(`${path} contains unsupported non-JSON state.`);
  if (ancestors.has(value)) throw new Error(`${path} contains a circular reference.`);

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (const key of Reflect.ownKeys(value)) {
        if (key === "length") continue;
        if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length) {
          throw new Error(`${path} contains unsupported array properties.`);
        }
      }
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new Error(`${path}[${index}] is an array hole.`);
        items.push(canonicalJson(value[index], `${path}[${index}]`, ancestors));
      }
      return `[${items.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error(`${path} contains a non-JSON object.`);
    const record = value as Record<string, unknown>;
    for (const key of Reflect.ownKeys(record)) {
      if (typeof key !== "string") throw new Error(`${path} contains unsupported symbol properties.`);
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(`${path}.${key} contains unsupported object state.`);
    }
    const fields = Object.keys(record).sort().map((key) => {
      const encodedKey = quoteCanonicalString(key, `${path} key`);
      return `${encodedKey}:${canonicalJson(record[key], `${path}.${key}`, ancestors)}`;
    });
    return `{${fields.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function quoteCanonicalString(value: string, path: string): string {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error(`${path} contains an unpaired surrogate.`);
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error(`${path} contains an unpaired surrogate.`);
    }
  }
  return JSON.stringify(value);
}

function bytesToHex(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) output += byte.toString(16).padStart(2, "0");
  return output;
}
