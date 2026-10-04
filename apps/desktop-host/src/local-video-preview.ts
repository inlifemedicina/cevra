import { MANUAL_VIDEO_MAX_BYTES, localSourceProbeInput, manualVideoError, type LocalVideoPreview } from "@cevra/application";
import type { SourceAsset } from "@cevra/project-ir";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { extname } from "node:path";

/** Hash exactly the bounded bytes served, from one regular descriptor. */
export async function readLocalVideoPreview(source: SourceAsset & { durationMs: number }, snapshotId: string): Promise<LocalVideoPreview> {
  const { bytes, mimeType } = await readVerifiedVideoBytes(source);
  return { sourceId: source.id, snapshotId, durationMs: source.durationMs, mimeType, base64: bytes.toString("base64") };
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
