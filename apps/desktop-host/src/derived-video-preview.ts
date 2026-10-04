import { MANUAL_VIDEO_MAX_BYTES, manualVideoError, resolveManualVideo, type LocalVideoPreview, type LocalVideoPreviewRequest } from "@cevra/application";
import type { MediaEngineAdapter } from "@cevra/contracts";
import type { ProjectHistory } from "@cevra/project-ir";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdtemp, open, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { readVerifiedVideoBytes } from "./local-video-preview.js";

export function resolvePreviewClip(history: ProjectHistory, request: LocalVideoPreviewRequest) {
  const project = history.current;
  const source = resolveManualVideo(project, request);
  const clip = project.timeline.clips.find((item) => item.id === request.clipId);
  const track = project.timeline.tracks.find((item) => item.id === clip?.trackId);
  if (!clip || clip.sourceId !== source.id || !track || track.kind !== "video" || track.hidden || track.muted
    || project.timeline.clips.length !== 1 || project.captions.length || project.graphics.length
    || clip.speed !== 1 || clip.volume !== 1 || clip.opacity !== 1 || Object.keys(clip.extensions ?? {}).length
    || ![clip.sourceStartMs, clip.sourceEndMs, clip.timelineStartMs, clip.timelineEndMs].every(Number.isSafeInteger)
    || clip.timelineStartMs !== 0 || clip.timelineEndMs !== clip.sourceEndMs - clip.sourceStartMs
    || clip.sourceStartMs < 0 || clip.sourceStartMs >= clip.sourceEndMs || clip.sourceEndMs > source.durationMs || source.durationMs > 60_000) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
  return { source, clip };
}

/** Read-only preparation: no Project IR, execution ledger or checkpoint writes. */
export class DerivedVideoPreview {
  constructor(private readonly options: { history: ProjectHistory; engine: MediaEngineAdapter; settle?: () => Promise<void>; temporaryRoot?: string }) {}

  async prepare(request: LocalVideoPreviewRequest, signal: AbortSignal): Promise<LocalVideoPreview> {
    const { source, clip } = resolvePreviewClip(this.options.history, request);
    const timeout = new AbortController();
    const combined = AbortSignal.any([signal, timeout.signal]);
    const timer = setTimeout(() => timeout.abort(), 30_000);
    let root: string | undefined;
    let owned: Awaited<ReturnType<typeof lstat>> | undefined;
    let primary: Error | undefined;
    try {
      const original = await readVerifiedVideoBytes(source, combined);
      resolvePreviewClip(this.options.history, request);
      root = await mkdtemp(join(await realpath(this.options.temporaryRoot ?? tmpdir()), "cevra-video-preview-"));
      owned = await lstat(root);
      await chmod(root, 0o700);
      const input = join(root, `input${extname(source.uri).toLowerCase()}`);
      const output = join(root, "preview.mp4");
      await writeFile(input, original.bytes, { flag: "wx", mode: 0o600, signal: combined });
      combined.throwIfAborted();
      const result = await this.options.engine.execute({ type: "trim", inputUri: input, outputUri: output,
        startMs: clip.sourceStartMs, endMs: clip.sourceEndMs, boundedPreview: true }, { jobId: `preview:${request.operationId}`, locale: "en-US", signal: combined });
      combined.throwIfAborted();
      const evidence = result.type === "file" ? result.boundedPreview : undefined;
      const duration = result.type === "file" ? result.durationMs : undefined;
      if (result.type !== "file" || result.outputUri !== output || result.probe.uri !== output || !result.probe.hasVideo
        || !evidence || evidence.sourceStartMs !== clip.sourceStartMs || evidence.sourceEndMs !== clip.sourceEndMs
        || evidence.firstFrameMs < clip.sourceStartMs || evidence.lastFrameMs >= clip.sourceEndMs || evidence.frameCount < 1
        || result.probe.hasAudio !== Boolean(source.technicalDescriptor?.audio)
        || (result.probe.hasAudio && (result.probe.audioCodec !== "aac" || !evidence.audio || evidence.audio.sampleRate !== source.sampleRate || evidence.audio.channels !== source.channels
          || evidence.audio.inputSamples !== Math.ceil(clip.sourceEndMs * evidence.audio.sampleRate / 1000) - Math.ceil(clip.sourceStartMs * evidence.audio.sampleRate / 1000)
          || evidence.audio.decodedSamples < evidence.audio.inputSamples || evidence.audio.decodedSamples >= evidence.audio.inputSamples + 1024))
        || result.effectiveProfile.container !== "mp4" || result.effectiveProfile.videoCodec !== "h264"
        || !Number.isSafeInteger(duration) || duration! <= 0 || Math.abs(duration! - clip.timelineEndMs) > Math.ceil(Math.max(1000 / evidence.frameRate, 1024_000 / (source.sampleRate ?? 44100))) + 2) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
      const handle = await open(output, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      let bytes: Buffer;
      try {
        const initial = await handle.stat({ bigint: true });
        if (!initial.isFile() || initial.size <= 0n || initial.size > BigInt(MANUAL_VIDEO_MAX_BYTES)) throw manualVideoError("MANUAL_VIDEO_TOO_LARGE");
        if (!result.publication || result.publication.device !== String(initial.dev) || result.publication.inode !== String(initial.ino)) throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
        bytes = Buffer.alloc(Number(initial.size));
        let offset = 0;
        while (offset < bytes.length) {
          combined.throwIfAborted();
          const read = await handle.read(bytes, offset, bytes.length - offset, offset);
          if (!read.bytesRead) throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
          offset += read.bytesRead;
        }
        const final = await handle.stat({ bigint: true });
        const path = await lstat(output, { bigint: true });
        if (initial.dev !== final.dev || initial.ino !== final.ino || initial.size !== final.size || initial.mtimeNs !== final.mtimeNs || initial.ctimeNs !== final.ctimeNs
          || path.dev !== final.dev || path.ino !== final.ino || !path.isFile() || createHash("sha256").update(bytes).digest("hex") !== evidence.outputSha256) throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
      } finally { await handle.close(); }
      await readVerifiedVideoBytes(source, combined);
      resolvePreviewClip(this.options.history, request);
      combined.throwIfAborted();
      return { sourceId: source.id, snapshotId: request.expectedSnapshotId, durationMs: duration!, mimeType: "video/mp4", base64: bytes.toString("base64"),
        clip: { id: clip.id, sourceStartMs: clip.sourceStartMs, sourceEndMs: clip.sourceEndMs, firstFrameMs: evidence.firstFrameMs, lastFrameMs: evidence.lastFrameMs, frameCount: evidence.frameCount } };
    } catch (cause) {
      primary = combined.aborted ? manualVideoError(timeout.signal.aborted && !signal.aborted ? "MANUAL_VIDEO_PREVIEW_TIMEOUT" : "OPERATION_CANCELLED")
        : cause instanceof Error && "code" in cause && String(cause.code).startsWith("MANUAL_VIDEO_") ? cause : manualVideoError("MANUAL_VIDEO_UNAVAILABLE");
      throw primary;
    } finally {
      clearTimeout(timer);
      if (root && owned) {
        try {
          // A transport failure rejects pending calls before native retirement.
          // Retain files if retirement cannot be proved; never race a live reader.
          await this.options.settle?.();
          const current = await lstat(root);
          if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== owned.dev || current.ino !== owned.ino) throw manualVideoError("MANUAL_VIDEO_CLEANUP_FAILED");
          await rm(root, { recursive: true, force: true });
        } catch {
          const cleanup = manualVideoError("MANUAL_VIDEO_CLEANUP_FAILED");
          if (!primary) throw cleanup;
          Object.assign(primary, { cleanupError: cleanup });
        }
      }
    }
  }
}
