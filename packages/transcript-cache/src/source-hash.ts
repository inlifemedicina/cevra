import { constants, type BigIntStats } from "node:fs";
import { open } from "node:fs/promises";
import { lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { isAbsolute } from "node:path";
import type { SourceContentIdentity, SourceContentIdentityProvider } from "@cevra/application";

export const SOURCE_HASH_CHUNK_BYTES = 1024 * 1024;

export interface NodeSourceContentIdentityOptions {
  /** @internal deterministic observation seam for bounded streaming tests. */
  onChunk?: (bytes: number) => void | Promise<void>;
}

export class NodeSourceContentIdentityProvider implements SourceContentIdentityProvider {
  constructor(private readonly options: NodeSourceContentIdentityOptions = {}) {}
  async identify(inputUri: string, signal?: AbortSignal): Promise<SourceContentIdentity | undefined> {
    try {
      throwIfAborted(signal);
      const path = localFilePath(inputUri);
      if (!path) return undefined;
      const pathMetadata = await lstat(path);
      if (!pathMetadata.isFile() || pathMetadata.isSymbolicLink()) return undefined;
      const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
      const handle = await open(path, constants.O_RDONLY | noFollow);
      try {
        const before = await handle.stat({ bigint: true });
        if (!before.isFile()) return undefined;
        const hash = createHash("sha256");
        let bytes = 0;
        const chunk = Buffer.allocUnsafe(SOURCE_HASH_CHUNK_BYTES);
        for (;;) {
          throwIfAborted(signal);
          const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, null);
          if (bytesRead === 0) break;
          bytes += bytesRead;
          hash.update(chunk.subarray(0, bytesRead));
          await this.options.onChunk?.(bytesRead);
        }
        const after = await handle.stat({ bigint: true });
        const pathAfter = await lstat(path, { bigint: true });
        if (pathAfter.isSymbolicLink() || !sameFileState(before, after) || !sameFileState(after, pathAfter) || BigInt(bytes) !== after.size) return undefined;
        return { algorithm: "sha256", digest: `sha256:${hash.digest("hex")}`, byteLength: bytes };
      } finally {
        await handle.close();
      }
    } catch (cause) {
      if (signal?.aborted || (cause instanceof Error && cause.name === "AbortError")) throw abortError(signal?.reason ?? cause);
      return undefined;
    }
  }
}

function localFilePath(inputUri: string): string | undefined {
  if (typeof inputUri !== "string" || !inputUri || inputUri.includes("\0")) return undefined;
  let path = inputUri;
  if (inputUri.startsWith("file://")) {
    let url: URL;
    try { url = new URL(inputUri); } catch { return undefined; }
    if (url.hostname && url.hostname !== "localhost") return undefined;
    try { path = fileURLToPath(url); } catch { return undefined; }
  } else if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(inputUri) && !/^[A-Za-z]:[\\/]/u.test(inputUri)) {
    return undefined;
  }
  if (!isAbsolute(path) || path.startsWith("//") || path.startsWith("\\\\")) return undefined;
  return path;
}

function sameFileState(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal.reason);
}

function abortError(cause?: unknown): Error {
  return Object.assign(new Error("Source hashing was cancelled.", { cause }), { name: "AbortError" });
}
