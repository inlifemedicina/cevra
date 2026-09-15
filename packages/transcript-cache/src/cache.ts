import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import type { Stats } from "node:fs";
import { chmod, lstat, mkdir, open, readdir, realpath, rename, rm, stat, utimes } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { CachedProducerResult, TranscriptCacheKey, TranscriptResultCache } from "@cevra/application";
import { canonicalJson, sha256Digest } from "./canonical-json.js";

export const TRANSCRIPT_CACHE_FORMAT = "cevra-transcript-cache" as const;
export const TRANSCRIPT_CACHE_FORMAT_VERSION = 1 as const;
export const DEFAULT_MAX_ENTRY_BYTES = 32 * 1024 * 1024;
export const DEFAULT_MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const DIGEST_HEX = /^[0-9a-f]{64}$/u;
const ENTRY_NAME = /^[0-9a-f]{64}\.json$/u;
const TEMPORARY_NAME = /^\.[0-9a-f]{64}\.[0-9a-f-]{36}\.tmp$/u;
const ORPHAN_TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface FileTranscriptCacheOptions {
  maxEntryBytes?: number;
  maxTotalBytes?: number;
  now?: () => Date;
}

interface CacheEnvelope {
  format: typeof TRANSCRIPT_CACHE_FORMAT;
  formatVersion: typeof TRANSCRIPT_CACHE_FORMAT_VERSION;
  kind: "transcription" | "alignment";
  key: TranscriptCacheKey;
  keyDigest: `sha256:${string}`;
  payload: unknown;
  payloadDigest: `sha256:${string}`;
  producerExecutionId: string;
  producedAt: string;
}

export class FileTranscriptCache implements TranscriptResultCache {
  private readonly maxEntryBytes: number;
  private readonly maxTotalBytes: number;
  private readonly now: () => Date;
  private initializedRoot: string | undefined;

  constructor(private readonly root: string, options: FileTranscriptCacheOptions = {}) {
    this.maxEntryBytes = boundedLimit(options.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES, "maxEntryBytes");
    this.maxTotalBytes = boundedLimit(options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES, "maxTotalBytes");
    this.now = options.now ?? (() => new Date());
  }

  async read(key: TranscriptCacheKey, signal?: AbortSignal): Promise<CachedProducerResult | undefined> {
    throwIfAborted(signal);
    const keyDigest = cacheKeyDigest(key);
    try {
      const path = await this.entryPath(key.kind, keyDigest);
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > this.maxEntryBytes) {
        await this.removeInvalid(path);
        return undefined;
      }
      const handle = await open(path, constants.O_RDONLY | noFollowFlag());
      let text: string;
      try {
        const current = await handle.stat();
        if (!current.isFile() || current.size > this.maxEntryBytes) return undefined;
        text = await handle.readFile({ encoding: "utf8", ...(signal ? { signal } : {}) });
      } finally {
        await handle.close();
      }
      throwIfAborted(signal);
      const envelope = parseEnvelope(text);
      if (envelope.kind !== key.kind || envelope.keyDigest !== keyDigest
        || canonicalJson(envelope.key) !== canonicalJson(key)
        || envelope.payloadDigest !== sha256Digest(canonicalJson(envelope.payload))) {
        await this.removeInvalid(path);
        return undefined;
      }
      const time = this.now();
      await utimes(path, time, time).catch(() => undefined);
      return {
        producerExecutionId: envelope.producerExecutionId,
        producedAt: envelope.producedAt,
        payload: envelope.payload
      };
    } catch (cause) {
      if (signal?.aborted || (cause instanceof Error && cause.name === "AbortError")) throw abortError(signal?.reason ?? cause);
      return undefined;
    }
  }

  async write(key: TranscriptCacheKey, value: CachedProducerResult, signal?: AbortSignal): Promise<boolean> {
    throwIfAborted(signal);
    const keyDigest = cacheKeyDigest(key);
    const envelope: CacheEnvelope = {
      format: TRANSCRIPT_CACHE_FORMAT,
      formatVersion: TRANSCRIPT_CACHE_FORMAT_VERSION,
      kind: key.kind,
      key,
      keyDigest,
      payload: value.payload,
      payloadDigest: sha256Digest(canonicalJson(value.payload)),
      producerExecutionId: requiredText(value.producerExecutionId),
      producedAt: requiredIso(value.producedAt)
    };
    const bytes = Buffer.from(canonicalJson(envelope), "utf8");
    if (bytes.byteLength > this.maxEntryBytes || bytes.byteLength > this.maxTotalBytes) return false;
    try {
      const path = await this.entryPath(key.kind, keyDigest, true);
      if (!await this.ensureBudget(bytes.byteLength, path)) return false;
      const temporary = join(dirname(path), `.${keyDigest.slice(7)}.${randomUUID()}.tmp`);
      let handle: Awaited<ReturnType<typeof open>> | undefined;
      try {
        handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollowFlag(), 0o600);
        await handle.writeFile(bytes);
        await handle.sync();
        await handle.close();
        handle = undefined;
        throwIfAborted(signal);
        await rename(temporary, path);
        await chmod(path, 0o600);
        await syncDirectory(dirname(path));
        return true;
      } finally {
        await handle?.close().catch(() => undefined);
        await rm(temporary, { force: true }).catch(() => undefined);
      }
    } catch (cause) {
      if (signal?.aborted || (cause instanceof Error && cause.name === "AbortError")) throw abortError(signal?.reason ?? cause);
      return false;
    }
  }

  async invalidate(key: TranscriptCacheKey): Promise<void> {
    try { await this.removeInvalid(await this.entryPath(key.kind, cacheKeyDigest(key))); } catch { /* disposable cache */ }
  }

  private async initialize(): Promise<string> {
    if (this.initializedRoot) return this.initializedRoot;
    const expectedRoot = resolve(this.root);
    await mkdir(expectedRoot, { recursive: true, mode: 0o700 });
    const metadata = await lstat(expectedRoot);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("Cache root is not a private directory.");
    await chmod(expectedRoot, 0o700);
    this.initializedRoot = await realpath(expectedRoot);
    return this.initializedRoot;
  }

  private async entryPath(kind: TranscriptCacheKey["kind"], digest: `sha256:${string}`, create = false): Promise<string> {
    const root = await this.initialize();
    const rootMetadata = await lstat(root);
    if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink() || await realpath(root) !== root) {
      throw new Error("Cache root ownership changed.");
    }
    const hex = digest.slice(7);
    if (!DIGEST_HEX.test(hex)) throw new Error("Cache digest is invalid.");
    const directory = join(root, kind, hex.slice(0, 2));
    if (create) await safeOwnedDirectory(root, directory);
    else await assertDirectoryChain(root, directory);
    const path = join(directory, `${hex}.json`);
    if (!path.startsWith(`${root}${sep}`)) throw new Error("Cache path escaped its root.");
    return path;
  }

  private async removeInvalid(path: string): Promise<void> {
    const name = path.slice(path.lastIndexOf(sep) + 1);
    if (!ENTRY_NAME.test(name)) return;
    await rm(path, { force: true }).catch(() => undefined);
  }

  private async ensureBudget(incomingBytes: number, targetPath: string): Promise<boolean> {
    const root = await this.initialize();
    const entries = await this.knownEntries();
    const target = entries.find((entry) => entry.path === targetPath);
    let total = entries.reduce((sum, entry) => sum + entry.size, 0) - (target?.size ?? 0);
    if (total + incomingBytes <= this.maxTotalBytes) return true;
    for (const entry of entries.filter((item) => item.path !== targetPath).sort((a, b) => a.accessed - b.accessed)) {
      if (!await isSafeRecognizedEntry(root, entry.path)) return false;
      try { await rm(entry.path); } catch { return false; }
      total -= entry.size;
      if (total + incomingBytes <= this.maxTotalBytes) return true;
    }
    return total + incomingBytes <= this.maxTotalBytes;
  }

  private async knownEntries(): Promise<Array<{ path: string; size: number; accessed: number }>> {
    const root = await this.initialize();
    const entries: Array<{ path: string; size: number; accessed: number }> = [];
    if (!await isSafeOwnedDirectory(root, root)) return entries;
    for (const kind of ["transcription", "alignment"] as const) {
      const kindPath = join(root, kind);
      if (!await isSafeOwnedDirectory(root, kindPath)) continue;
      const prefixes = await safeDirectoryEntries(kindPath);
      for (const prefix of prefixes) {
        if (!prefix.isDirectory() || prefix.isSymbolicLink() || !/^[0-9a-f]{2}$/u.test(prefix.name)) continue;
        const prefixPath = join(kindPath, prefix.name);
        if (!await isSafeOwnedDirectory(root, prefixPath)) continue;
        for (const item of await safeDirectoryEntries(prefixPath)) {
          if (item.isFile() && !item.isSymbolicLink() && TEMPORARY_NAME.test(item.name)) {
            const temporaryPath = join(prefixPath, item.name);
            const metadata = await safeOwnedRegularFile(temporaryPath);
            if (metadata && this.now().getTime() - metadata.mtimeMs >= ORPHAN_TEMP_MAX_AGE_MS) {
              await rm(temporaryPath, { force: true }).catch(() => undefined);
            }
            continue;
          }
          if (!item.isFile() || item.isSymbolicLink() || !ENTRY_NAME.test(item.name)) continue;
          const path = join(prefixPath, item.name);
          const metadata = await safeOwnedRegularFile(path);
          if (!metadata) continue;
          entries.push({ path, size: metadata.size, accessed: Math.max(metadata.atimeMs, metadata.mtimeMs) });
        }
      }
    }
    return entries;
  }
}

async function isSafeOwnedDirectory(root: string, directory: string): Promise<boolean> {
  const expected = resolve(directory);
  if (!isContained(root, expected)) return false;
  try {
    const metadata = await lstat(expected);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) return false;
    const canonical = await realpath(expected);
    return canonical === expected && isContained(root, canonical);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw cause;
  }
}

async function isSafeRecognizedEntry(root: string, path: string): Promise<boolean> {
  const parts = relative(root, path).split(sep);
  if (parts.length !== 3
    || (parts[0] !== "transcription" && parts[0] !== "alignment")
    || !/^[0-9a-f]{2}$/u.test(parts[1] ?? "")
    || !ENTRY_NAME.test(parts[2] ?? "")) return false;
  const kindPath = join(root, parts[0]!);
  const prefixPath = join(kindPath, parts[1]!);
  if (!await isSafeOwnedDirectory(root, kindPath) || !await isSafeOwnedDirectory(root, prefixPath)) return false;
  return !!await safeOwnedRegularFile(path);
}

async function safeOwnedRegularFile(path: string): Promise<Stats | undefined> {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(path) !== path) return undefined;
    return metadata;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw cause;
  }
}

function isContained(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

export function cacheKeyDigest(key: TranscriptCacheKey): `sha256:${string}` {
  validateCacheKey(key);
  return sha256Digest(canonicalJson(key));
}

function validateCacheKey(key: TranscriptCacheKey): void {
  if (!isRecord(key)) throw new Error("Cache key must be an object.");
  if (key.kind === "transcription") {
    exactKeys(key, ["schemaVersion", "kind", "source", "execution", "requestedLanguage", "wordTimestamps"]);
    if (!isRecord(key.execution)) throw new Error("Transcription execution identity is invalid.");
    exactKeys(key.execution, ["engineId", "engineVersion", "engineApiVersion", "workerProtocolVersion", "modelId", "resultModelId", "modelRevision", "modelArtifactDigest", "languageDetectionPolicyVersion", "devicePolicy", "effectiveDevice", "computeType", "task", "resultNormalizationVersion", "runtimePipelineVersion"]);
    for (const field of ["engineId", "engineVersion", "modelId", "resultModelId", "modelRevision", "languageDetectionPolicyVersion", "devicePolicy", "effectiveDevice", "computeType", "resultNormalizationVersion", "runtimePipelineVersion"] as const) boundedText(key.execution[field]);
    positiveVersion(key.execution.engineApiVersion); positiveVersion(key.execution.workerProtocolVersion);
    sha256Value(key.execution.modelArtifactDigest);
    if (key.execution.task !== "transcribe" || !["auto", "pt", "en"].includes(key.requestedLanguage) || typeof key.wordTimestamps !== "boolean") throw new Error("Transcription cache key is invalid.");
  } else if (key.kind === "alignment") {
    exactKeys(key, ["schemaVersion", "kind", "source", "inputTranscriptDigest", "language", "execution", "mediaPreparation"]);
    if (!isRecord(key.execution) || !isRecord(key.mediaPreparation)) throw new Error("Alignment execution identity is invalid.");
    exactKeys(key.execution, ["engineId", "engineVersion", "engineApiVersion", "workerProtocolVersion", "modelId", "modelRevision", "modelDigest", "device", "pipelineVersion", "requiredSampleRate", "maximumWindowMs", "maximumTokensPerWindow", "wildcardAlgorithmVersion", "resultValidationVersion"]);
    exactKeys(key.mediaPreparation, ["engineId", "engineVersion", "engineApiVersion", "operation", "audioCodec", "profileVersion"]);
    for (const field of ["engineId", "engineVersion", "modelId", "modelRevision", "device", "pipelineVersion", "wildcardAlgorithmVersion", "resultValidationVersion"] as const) boundedText(key.execution[field]);
    for (const field of ["engineId", "engineVersion"] as const) boundedText(key.mediaPreparation[field]);
    positiveVersion(key.execution.engineApiVersion); positiveVersion(key.execution.workerProtocolVersion);
    positiveVersion(key.execution.requiredSampleRate); positiveVersion(key.execution.maximumWindowMs); positiveVersion(key.execution.maximumTokensPerWindow);
    positiveVersion(key.mediaPreparation.engineApiVersion); sha256Value(key.execution.modelDigest);
    if (!/^sha256-v1:[0-9a-f]{64}$/u.test(key.inputTranscriptDigest) || !["pt", "en"].includes(key.language)
      || key.mediaPreparation.operation !== "extract-audio" || key.mediaPreparation.audioCodec !== "pcm" || key.mediaPreparation.profileVersion !== "alignment-pcm-v1") throw new Error("Alignment cache key is invalid.");
  } else throw new Error("Cache key kind is invalid.");
  if (key.schemaVersion !== 1 || !isRecord(key.source)) throw new Error("Cache key version or source is invalid.");
  exactKeys(key.source, ["algorithm", "digest", "byteLength"]);
  if (key.source.algorithm !== "sha256" || !Number.isSafeInteger(key.source.byteLength) || key.source.byteLength < 0) throw new Error("Source identity is invalid.");
  sha256Value(key.source.digest);
}

function parseEnvelope(text: string): CacheEnvelope {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) throw new Error("Cache envelope must be an object.");
  exactKeys(value, ["format", "formatVersion", "kind", "key", "keyDigest", "payload", "payloadDigest", "producerExecutionId", "producedAt"]);
  if (value.format !== TRANSCRIPT_CACHE_FORMAT || value.formatVersion !== TRANSCRIPT_CACHE_FORMAT_VERSION
    || (value.kind !== "transcription" && value.kind !== "alignment") || !isRecord(value.key)
    || value.key.kind !== value.kind || typeof value.keyDigest !== "string" || typeof value.payloadDigest !== "string"
    || !/^sha256:[0-9a-f]{64}$/u.test(value.keyDigest) || !/^sha256:[0-9a-f]{64}$/u.test(value.payloadDigest)) {
    throw new Error("Cache envelope header is invalid.");
  }
  requiredText(value.producerExecutionId);
  requiredIso(value.producedAt);
  canonicalJson(value);
  return value as unknown as CacheEnvelope;
}

async function safeOwnedDirectory(root: string, directory: string): Promise<void> {
  const relative = directory.slice(root.length + 1).split(sep);
  let current = root;
  for (const part of relative) {
    current = join(current, part);
    try { await mkdir(current, { mode: 0o700 }); } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
    }
    const metadata = await lstat(current);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("Cache directory chain is unsafe.");
    await chmod(current, 0o700);
  }
}

async function assertDirectoryChain(root: string, directory: string): Promise<void> {
  const relative = directory.slice(root.length + 1).split(sep);
  let current = root;
  for (const part of relative) {
    current = join(current, part);
    const metadata = await lstat(current);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("Cache directory chain is unsafe.");
  }
}

async function safeDirectoryEntries(path: string) {
  try { return await readdir(path, { withFileTypes: true }); } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw cause;
  }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new Error("Cache envelope fields are invalid.");
}
function requiredText(value: unknown): string { if (typeof value !== "string" || !value.trim() || value.length > 256) throw new Error("Cache producer ID is invalid."); return value; }
function requiredIso(value: unknown): string { if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error("Cache timestamp is invalid."); return value; }
function boundedText(value: unknown): string { if (typeof value !== "string" || !value.trim() || value.length > 512) throw new Error("Cache identity text is invalid."); return value; }
function positiveVersion(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error("Cache identity version is invalid."); return value as number; }
function sha256Value(value: unknown): void { if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) throw new Error("Cache SHA-256 identity is invalid."); }
function boundedLimit(value: number, field: string): number { if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${field} must be a positive safe integer.`); return value; }
function noFollowFlag(): number { return typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function throwIfAborted(signal?: AbortSignal): void { if (signal?.aborted) throw abortError(signal.reason); }
function abortError(cause?: unknown): Error { return Object.assign(new Error("Cache operation was cancelled.", { cause }), { name: "AbortError" }); }
