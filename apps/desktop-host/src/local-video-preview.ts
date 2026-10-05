import { MANUAL_VIDEO_MAX_BYTES, MANUAL_VIDEO_SOURCE_MAX_BYTES, localSourceProbeInput, manualVideoError, type LocalVideoPreview } from "@cevra/application";
import type { SourceAsset } from "@cevra/project-ir";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, lstat } from "node:fs/promises";
import { extname } from "node:path";

/** Hash exactly the bounded bytes served, from one regular descriptor. */
export async function readLocalVideoPreview(source: SourceAsset & { durationMs: number }, snapshotId: string, signal?: AbortSignal): Promise<LocalVideoPreview> {
  const { bytes, mimeType } = await readVerifiedVideoBytes(source, signal);
  return { sourceId: source.id, snapshotId, durationMs: source.durationMs, mimeType, base64: bytes.toString("base64") };
}

/** Source admission/copy uses one descriptor and a fixed chunk, independent of IPC size. */
export async function verifyAndCopyVideoSource(source: SourceAsset, signal: AbortSignal, destination?: string): Promise<void> {
  const path = localSourceProbeInput(source.uri);
  if (!path || ![".mp4", ".m4v", ".mov", ".webm"].includes(extname(path).toLowerCase())) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
  let input, output, primary: unknown;
  try {
    signal.throwIfAborted();
    input = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const initial = await input.stat({ bigint: true });
    if (!initial.isFile()) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
    if (initial.size <= 0n || initial.size > BigInt(MANUAL_VIDEO_SOURCE_MAX_BYTES)) throw manualVideoError("MANUAL_VIDEO_TOO_LARGE");
    if (initial.size !== BigInt(source.technicalDescriptor!.content.sizeBytes)) throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
    if (destination) output = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const hash = createHash("sha256"), chunk = Buffer.alloc(64 * 1024);
    let position = 0;
    while (position < Number(initial.size)) {
      signal.throwIfAborted();
      const { bytesRead } = await input.read(chunk, 0, Math.min(chunk.length, Number(initial.size) - position), position);
      if (!bytesRead) throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
      hash.update(chunk.subarray(0, bytesRead));
      if (output) {
        let written = 0;
        while (written < bytesRead) {
          signal.throwIfAborted();
          const result = await output.write(chunk, written, bytesRead - written, position + written);
          if (!result.bytesWritten) throw manualVideoError("MANUAL_VIDEO_UNAVAILABLE");
          written += result.bytesWritten;
        }
      }
      position += bytesRead;
    }
    const final = await input.stat({ bigint: true }), named = await lstat(path, { bigint: true });
    if (initial.dev !== final.dev || initial.ino !== final.ino || initial.size !== final.size || initial.mtimeNs !== final.mtimeNs || initial.ctimeNs !== final.ctimeNs
      || named.dev !== final.dev || named.ino !== final.ino || !named.isFile() || named.size !== final.size || named.mtimeNs !== final.mtimeNs || named.ctimeNs !== final.ctimeNs
      || hash.digest("hex") !== source.technicalDescriptor!.content.sha256) throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
    signal.throwIfAborted();
  } catch (error) {
    primary = signal.aborted || (error instanceof Error && "code" in error && String(error.code).startsWith("MANUAL_VIDEO_")) ? error : manualVideoError("MANUAL_VIDEO_UNAVAILABLE");
    throw primary;
  } finally {
    const closed = await Promise.allSettled([output?.close(), input?.close()]);
    if (primary === undefined && closed.some(result => result.status === "rejected")) throw manualVideoError("MANUAL_VIDEO_UNAVAILABLE");
  }
}

export async function readVerifiedVideoBytes(source: SourceAsset, signal?: AbortSignal): Promise<{ bytes: Buffer; mimeType: LocalVideoPreview["mimeType"] }> {
  signal?.throwIfAborted();
  const path = localSourceProbeInput(source.uri);
  if (!path) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
  const extension = extname(path).toLowerCase();
  const mimeType = extension === ".mp4" || extension === ".m4v" ? "video/mp4" : extension === ".mov" ? "video/quicktime" : extension === ".webm" ? "video/webm" : null;
  if (!mimeType) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const initial = await handle.stat({ bigint: true });
    if (!initial.isFile()) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
    if (initial.size <= 0n || initial.size > BigInt(MANUAL_VIDEO_MAX_BYTES)) throw manualVideoError("MANUAL_VIDEO_TOO_LARGE");
    if (initial.size !== BigInt(source.technicalDescriptor!.content.sizeBytes)) throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
    const bytes = Buffer.alloc(Number(initial.size));
    let offset = 0;
    while (offset < bytes.length) {
      signal?.throwIfAborted();
      const read = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!read.bytesRead) throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
      offset += read.bytesRead;
    }
    const final = await handle.stat({ bigint: true });
    if (initial.dev !== final.dev || initial.ino !== final.ino || initial.size !== final.size || initial.mtimeNs !== final.mtimeNs || initial.ctimeNs !== final.ctimeNs
      || createHash("sha256").update(bytes).digest("hex") !== source.technicalDescriptor!.content.sha256) throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
    signal?.throwIfAborted();
    return { bytes, mimeType };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof Error && "code" in error && String(error.code).startsWith("MANUAL_VIDEO_")) throw error;
    throw manualVideoError("MANUAL_VIDEO_UNAVAILABLE");
  } finally {
    await handle?.close();
  }
}
