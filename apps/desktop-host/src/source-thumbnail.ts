import { manualVideoError, resolveManualVideo, type SourceThumbnailRequest, type SourceThumbnail } from "@cevra/application";
import type { MediaEngineAdapter } from "@cevra/contracts";
import type { ProjectHistory } from "@cevra/project-ir";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdtemp, open, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { verifyAndCopyVideoSource } from "./local-video-preview.js";

/** Ephemeral card images. Source IDs/paths come only from the current canonical snapshot. */
const CARD_FRAME_MAX_BYTES = 128 * 1024;
export class SourceThumbnailService {
  private readonly cache = new Map<string, { sourceId: string; frame: Buffer; width: number; height: number; seal: string }>();
  private bytes = 0;
  private closed = false;
  constructor(private readonly options: { history: ProjectHistory; engine: MediaEngineAdapter; settle: () => Promise<void>; temporaryRoot?: string }) {}
  close(): void { this.closed = true; this.cache.clear(); this.bytes = 0; }

  async prepare(request: SourceThumbnailRequest, signal: AbortSignal): Promise<SourceThumbnail> {
    if (this.closed) throw manualVideoError("OPERATION_CANCELLED");
    if (!request || typeof request !== "object" || Array.isArray(request) || Object.keys(request).length !== 3
      || Object.keys(request).some(key => !["sourceId", "expectedSnapshotId", "operationId"].includes(key))
      || typeof request.operationId !== "string" || !request.operationId || request.operationId.length > 128) throw manualVideoError("MANUAL_VIDEO_INVALID_REQUEST");
    const stable = structuredClone(request);
    const source = resolveManualVideo(this.options.history.current, stable);
    const journal = this.options.history.journalIdentity;
    const key = createHash("sha256").update(JSON.stringify([source.id, source.uri, source.technicalDescriptor, source.durationMs, "card-png-160-v1"])).digest("hex");
    const timeout = AbortSignal.timeout(120_000), combined = AbortSignal.any([signal, timeout]);
    const current = () => {
      combined.throwIfAborted();
      if (this.closed || this.options.history.journalIdentity !== journal) throw manualVideoError("MANUAL_VIDEO_STALE");
      resolveManualVideo(this.options.history.current, stable);
    };
    const packet = (entry: { frame: Buffer; width: number; height: number }): SourceThumbnail => ({ sourceId: source.id, snapshotId: stable.expectedSnapshotId,
      mimeType: "image/png", base64: entry.frame.toString("base64"), width: entry.width, height: entry.height });
    const cached = this.cache.get(key);
    if (cached) {
      try { await verifyAndCopyVideoSource(source, combined); current(); }
      catch (cause) { this.bytes -= cached.frame.length; this.cache.delete(key); throw cause; }
      if (createHash("sha256").update(JSON.stringify([cached.width, cached.height])).update(cached.frame).digest("hex") === cached.seal) {
        this.cache.delete(key); this.cache.set(key, cached); return packet(cached);
      }
      this.bytes -= cached.frame.length; this.cache.delete(key);
    }
    let root: string | undefined, owned: Awaited<ReturnType<typeof lstat>> | undefined, primary: unknown;
    let prepared: { sourceId: string; frame: Buffer; width: number; height: number; seal: string } | undefined;
    try {
      root = await mkdtemp(join(await realpath(this.options.temporaryRoot ?? tmpdir()), "cevra-source-thumbnail-"));
      owned = await lstat(root); await chmod(root, 0o700);
      const input = join(root, `input${extname(source.uri).toLowerCase()}`), output = join(root, "thumbnail.png");
      await verifyAndCopyVideoSource(source, combined, input); current();
      const result = await this.options.engine.execute({ type: "extract-frame", inputUri: input, outputUri: output, atMs: 0, maxDimension: 160 },
        { jobId: `thumbnail:${stable.operationId}`, locale: "en-US", signal: combined });
      current();
      if (result.type !== "file" || result.outputUri !== output || result.probe.uri !== output || !result.publication) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
      const width = result.probe.width!, height = result.probe.height!;
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || Math.min(width, height) < 1 || Math.max(width, height) > 160) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
      const handle = await open(output, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      let frame: Buffer;
      try {
        const initial = await handle.stat({ bigint: true });
        if (!initial.isFile() || initial.size < 24n || initial.size > BigInt(CARD_FRAME_MAX_BYTES)
          || String(initial.dev) !== result.publication.device || String(initial.ino) !== result.publication.inode) throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
        frame = Buffer.alloc(Number(initial.size));
        for (let offset = 0; offset < frame.length;) {
          current(); const read = await handle.read(frame, offset, frame.length - offset, offset);
          if (!read.bytesRead) throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED"); offset += read.bytesRead;
        }
        const end = await handle.stat({ bigint: true }), named = await lstat(output, { bigint: true });
        if (!named.isFile() || [end, named].some(stamp => initial.dev !== stamp.dev || initial.ino !== stamp.ino || initial.size !== stamp.size
          || initial.mtimeNs !== stamp.mtimeNs || initial.ctimeNs !== stamp.ctimeNs)) throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
      } finally { await handle.close(); }
      if (!frame.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || frame.readUInt32BE(8) !== 13
        || frame.toString("ascii", 12, 16) !== "IHDR" || frame.readUInt32BE(16) !== width || frame.readUInt32BE(20) !== height) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
      await verifyAndCopyVideoSource(source, combined); current();
      prepared = { sourceId: source.id, frame, width, height, seal: createHash("sha256").update(JSON.stringify([width, height])).update(frame).digest("hex") };
    } catch (cause) {
      primary = combined.aborted ? manualVideoError(signal.aborted ? "OPERATION_CANCELLED" : "MANUAL_VIDEO_PREVIEW_TIMEOUT") : cause;
      for (const [entryKey, entry] of this.cache) if (entry.sourceId === source.id) { this.bytes -= entry.frame.length; this.cache.delete(entryKey); }
      throw primary;
    } finally {
      if (root && owned) {
        try {
          await this.options.settle();
          const stamp = await lstat(root);
          if (!stamp.isDirectory() || stamp.isSymbolicLink() || stamp.dev !== owned.dev || stamp.ino !== owned.ino) throw manualVideoError("MANUAL_VIDEO_CLEANUP_FAILED");
          await rm(root, { recursive: true, force: true });
        } catch {
          const cleanup = manualVideoError("MANUAL_VIDEO_CLEANUP_FAILED");
          if (!primary) throw cleanup;
          if (primary instanceof Error) Object.assign(primary, { cleanupError: cleanup });
        }
      }
    }
    current();
    while (this.cache.size >= 32 || this.bytes + prepared!.frame.length > 16 * 1024 * 1024) {
      const oldest = this.cache.keys().next().value!; this.bytes -= this.cache.get(oldest)!.frame.length; this.cache.delete(oldest);
    }
    this.cache.set(key, prepared!); this.bytes += prepared!.frame.length;
    return packet(prepared!);
  }
}
