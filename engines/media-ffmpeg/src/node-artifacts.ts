import { constants, type BigIntStats } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, open, realpath, unlink } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import type { MediaPublicationEvidenceV1 } from "@cevra/contracts";

export type NodeSourceIdentityErrorCode =
  | "SOURCE_IDENTITY_OFFLINE"
  | "SOURCE_IDENTITY_UNSUPPORTED"
  | "SOURCE_IDENTITY_CHANGED"
  | "SOURCE_IDENTITY_READ_FAILED"
  | "SOURCE_IDENTITY_CANCELLED";

export class NodeSourceContentIdentityError extends Error {
  constructor(readonly code: NodeSourceIdentityErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = "NodeSourceContentIdentityError";
  }
}

interface SourceStamp {
  version: 1;
  uri: string;
  canonicalPath: string;
  device: string;
  inode: string;
  sizeBytes: number;
  mtimeNs: string;
  ctimeNs: string;
}

export class NodeMediaArtifactStore {
  /** @internal Deterministic fault seam for filesystem tests; never sourced from product input. */
  constructor(private readonly diagnostics: {
    onSourceIdentityChunk?: (bytesRead: number) => void | Promise<void>;
  } = {}) {}

  async kind(uri: string): Promise<"missing" | "file" | "symlink" | "other"> {
    const path = localPath(uri);
    try {
      const metadata = await lstat(path);
      if (metadata.isSymbolicLink()) return "symlink";
      return metadata.isFile() ? "file" : "other";
    } catch (error) {
      if (errorCode(error) === "ENOENT") return "missing";
      throw error;
    }
  }

  async exists(uri: string): Promise<boolean> {
    return (await this.kind(uri)) !== "missing";
  }

  async remove(uri: string): Promise<void> {
    await unlink(localPath(uri));
  }

  async matchesPublication(uri: string, evidence: MediaPublicationEvidenceV1): Promise<boolean> {
    if (evidence.version !== 1 || evidence.scheme !== "posix-dev-inode" || process.platform === "win32") return false;
    try {
      const metadata = await lstat(localPath(uri), { bigint: true });
      return metadata.isFile() && !metadata.isSymbolicLink()
        && metadata.dev.toString() === evidence.device
        && metadata.ino.toString() === evidence.inode;
    } catch (error) {
      if (errorCode(error) === "ENOENT") return false;
      throw error;
    }
  }

  async captureSource(uri: string, signal?: AbortSignal): Promise<SourceStamp> {
    try {
      signal?.throwIfAborted();
      const stamp = await captureRegularFile(uri);
      signal?.throwIfAborted();
      return stamp;
    } catch (cause) {
      throw sourceIdentityError(cause);
    }
  }

  async identifySource(uri: string, expected: SourceStamp, signal?: AbortSignal): Promise<{
    version: 1;
    content: { sha256: string; sizeBytes: number };
    stamp: SourceStamp;
    bytesRead: number;
  }> {
    if (expected.version !== 1 || expected.uri !== uri) {
      throw new NodeSourceContentIdentityError("SOURCE_IDENTITY_CHANGED", "Source identity request does not match its captured path state.");
    }
    const path = strictLocalPath(uri);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      signal?.throwIfAborted();
      const current = await captureRegularFile(uri);
      if (!sameStamp(current, expected)) throw changed();
      handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const before = stampFromStats(uri, await realpath(path), await handle.stat({ bigint: true }));
      if (!sameStamp(before, expected)) throw changed();

      const digest = createHash("sha256");
      let bytesRead = 0;
      const buffer = Buffer.allocUnsafe(1024 * 1024);
      while (bytesRead < expected.sizeBytes) {
        signal?.throwIfAborted();
        const requested = Math.min(buffer.byteLength, expected.sizeBytes - bytesRead);
        const read = await handle.read(buffer, 0, requested, bytesRead);
        if (read.bytesRead <= 0) throw changed();
        digest.update(buffer.subarray(0, read.bytesRead));
        bytesRead += read.bytesRead;
        await this.diagnostics.onSourceIdentityChunk?.(bytesRead);
      }
      const afterHandle = stampFromStats(uri, expected.canonicalPath, await handle.stat({ bigint: true }));
      if (bytesRead !== expected.sizeBytes || !sameStamp(afterHandle, expected)) throw changed();
      await handle.close();
      handle = undefined;
      const afterPath = await captureRegularFile(uri);
      if (!sameStamp(afterPath, expected)) throw changed();
      return {
        version: 1,
        content: { sha256: digest.digest("hex"), sizeBytes: bytesRead },
        stamp: afterPath,
        bytesRead
      };
    } catch (cause) {
      throw sourceIdentityError(cause);
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }

  async checkSource(uri: string, expected: SourceStamp, signal?: AbortSignal): Promise<"match" | "missing" | "changed" | "unsupported"> {
    try {
      signal?.throwIfAborted();
      const current = await captureRegularFile(uri);
      signal?.throwIfAborted();
      return sameStamp(current, expected) ? "match" : "changed";
    } catch (cause) {
      const mapped = sourceIdentityError(cause);
      if (mapped.code === "SOURCE_IDENTITY_OFFLINE") return "missing";
      if (mapped.code === "SOURCE_IDENTITY_UNSUPPORTED") return "unsupported";
      if (mapped.code === "SOURCE_IDENTITY_CHANGED") return "changed";
      throw mapped;
    }
  }
}

async function captureRegularFile(uri: string): Promise<SourceStamp> {
  const path = strictLocalPath(uri);
  let metadata;
  try {
    metadata = await lstat(path, { bigint: true });
  } catch (cause) {
    if (errorCode(cause) === "ENOENT") throw new NodeSourceContentIdentityError("SOURCE_IDENTITY_OFFLINE", "Source file is unavailable.", cause);
    throw cause;
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new NodeSourceContentIdentityError("SOURCE_IDENTITY_UNSUPPORTED", "Source identity requires a regular non-symlink file.");
  }
  const canonicalPath = await realpath(path);
  return stampFromStats(uri, canonicalPath, metadata);
}

function stampFromStats(
  uri: string,
  canonicalPath: string,
  metadata: BigIntStats
): SourceStamp {
  if (metadata.size < 0n || metadata.size > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new NodeSourceContentIdentityError("SOURCE_IDENTITY_UNSUPPORTED", "Source byte size exceeds the exact V1 numeric range.");
  }
  return {
    version: 1,
    uri,
    canonicalPath,
    device: metadata.dev.toString(),
    inode: metadata.ino.toString(),
    sizeBytes: Number(metadata.size),
    mtimeNs: metadata.mtimeNs.toString(),
    ctimeNs: metadata.ctimeNs.toString()
  };
}

function sameStamp(left: SourceStamp, right: SourceStamp): boolean {
  return left.version === right.version
    && left.uri === right.uri
    && left.canonicalPath === right.canonicalPath
    && left.device === right.device
    && left.inode === right.inode
    && left.sizeBytes === right.sizeBytes
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function strictLocalPath(uri: string): string {
  const path = localPath(uri);
  if (!isAbsolute(path)) throw new NodeSourceContentIdentityError("SOURCE_IDENTITY_UNSUPPORTED", "Source identity requires an absolute local path.");
  return path;
}

function changed(): NodeSourceContentIdentityError {
  return new NodeSourceContentIdentityError("SOURCE_IDENTITY_CHANGED", "Source path or file state changed during identity acquisition.");
}

function sourceIdentityError(cause: unknown): NodeSourceContentIdentityError {
  if (cause instanceof NodeSourceContentIdentityError) return cause;
  if (cause instanceof Error && cause.name === "AbortError") {
    return new NodeSourceContentIdentityError("SOURCE_IDENTITY_CANCELLED", "Source identity acquisition was cancelled.", cause);
  }
  const code = errorCode(cause);
  if (code === "ENOENT") return new NodeSourceContentIdentityError("SOURCE_IDENTITY_OFFLINE", "Source file is unavailable.", cause);
  if (code === "ELOOP") return new NodeSourceContentIdentityError("SOURCE_IDENTITY_UNSUPPORTED", "Source identity does not follow symlinks.", cause);
  return new NodeSourceContentIdentityError("SOURCE_IDENTITY_READ_FAILED", "Source identity acquisition failed.", cause);
}

function localPath(uri: string): string {
  if (!uri.startsWith("file:")) return uri;
  const parsed = new URL(uri);
  if (parsed.protocol !== "file:") throw new Error("Media artifact URI is not a local file.");
  return fileURLToPath(parsed);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}
