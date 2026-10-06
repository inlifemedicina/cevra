import { MANUAL_VIDEO_MAX_BYTES, MANUAL_VIDEO_FRAME_MAX_BYTES, localSourceProbeInput, manualVideoError, resolveManualVideo, resolveManualVideoSequence, type LocalVideoPreview, type LocalVideoPreviewRequest } from "@cevra/application";
import { validateManualSequenceExecutionEvidence, type MediaEngineAdapter } from "@cevra/contracts";
import { framesToMilliseconds, type ProjectHistory, type SourceAsset } from "@cevra/project-ir";
import { constants, type BigIntStats } from "node:fs";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdtemp, open, realpath, rm, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { verifyAndCopyVideoSource } from "./local-video-preview.js";

/** Early metadata rejection only; the runtime still performs complete admission. */
export function supportsOriginalProxy(source: SourceAsset & { durationMs: number }): boolean {
  const transfer = source.technicalDescriptor?.video?.colorTransfer?.toLowerCase();
  return source.durationMs <= 60_000 && transfer !== "smpte2084" && transfer !== "arib-std-b67"
    && (source.width === undefined || source.height === undefined || Math.min(source.width, source.height) >= 2 && Math.min(source.width, source.height) <= 1080 && Math.max(source.width, source.height) <= 1920)
    && (!source.technicalDescriptor?.audio || (source.sampleRate === undefined || [44100, 48000].includes(source.sampleRate)) && (source.channels === undefined || [1, 2].includes(source.channels)));
}

/** Conservative preparation allowance, not a latency SLA or delivery policy. */
export function previewPreparationBudgetMs(source: SourceAsset & { durationMs: number }, startMs: number, endMs: number): number {
  const ioMs = source.technicalDescriptor!.content.sizeBytes * 4 / (8 * 1024 * 1024) * 1000;
  return Math.min(360_000, Math.ceil(30_000 + source.durationMs * 2 + (endMs - startMs) + ioMs));
}

export function resolvePreviewClip(history: ProjectHistory, request: LocalVideoPreviewRequest) {
  const project = history.current;
  const source = resolveManualVideo(project, request);
  const clip = resolveManualVideoSequence(project, request.expectedSnapshotId).find(item => item.id === request.clipId);
  if (!clip || clip.sourceId !== source.id || source.durationMs > 60_000) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
  return { source, clip };
}

export function resolvePreviewRange(history: ProjectHistory, request: LocalVideoPreviewRequest) {
  if (request.clipId !== undefined) {
    const { source, clip } = resolvePreviewClip(history, request);
    return { source, clip, startMs: clip.sourceStartMs, endMs: clip.sourceEndMs,
      frameRange: clip.frameTiming ? { sourceStartFrame: clip.frameTiming.sourceStartFrame, sourceEndFrame: clip.frameTiming.sourceEndFrame } : undefined };
  }
  const source = resolveManualVideo(history.current, request);
  if (source.durationMs > 60_000) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
  // Original remains a source-clock viewer. The manual CFR30 sampler is
  // admitted only for a canonical clip, whose audio window is independently
  // covered; Take's approved padding policy handles a source's initial gap.
  return { source, clip: undefined, startMs: 0, endMs: source.durationMs, frameRange: undefined };
}

/** Read-only preparation: no Project IR, execution ledger or checkpoint writes. */
interface PreparedPreview {
  sourceId: string; video: Buffer; frame: Buffer; durationMs: number; width: number; height: number;
  firstFrameMs: number; lastFrameMs: number; frameCount: number;
  seal: string;
}
const CACHE_MAX_ENTRIES = 4;
const CACHE_MAX_BYTES = 32 * 1024 * 1024;
const ENTRY_OVERHEAD_BYTES = 1024;

export class DerivedVideoPreview {
  private readonly cache = new Map<string, PreparedPreview>();
  private retainedBytes = 0;
  private closed = false;
  constructor(private readonly options: { history: ProjectHistory; engine: MediaEngineAdapter; settle?: () => Promise<void>; temporaryRoot?: string;
    /** Bound to the verified runtime manifest by the production composition root. */
    runtimeIdentity?: () => string; cacheLimits?: { maxEntries: number; maxBytes: number } }) {
    const limits = options.cacheLimits;
    if (limits && (!Number.isSafeInteger(limits.maxEntries) || limits.maxEntries < 0 || limits.maxEntries > CACHE_MAX_ENTRIES
      || !Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < 0 || limits.maxBytes > CACHE_MAX_BYTES)) throw new RangeError("Invalid preview cache limits");
  }

  close(): void { this.closed = true; this.cache.clear(); this.retainedBytes = 0; }
  /** Internal measurement/review surface; never exposed over WebView IPC. */
  cacheState() { return { entries: this.cache.size, retainedBytes: this.retainedBytes }; }

  private key(range: ReturnType<typeof resolvePreviewRange>): string {
    const s = range.source;
    return createHash("sha256").update(JSON.stringify([s.id, s.uri, s.durationMs, s.width, s.height, s.frameRate, s.sampleRate, s.channels,
      s.technicalDescriptor, range.startMs, range.endMs, range.frameRange, range.frameRange ? "manual-cfr30-preview-v1" : "take-v1", this.options.runtimeIdentity?.() ?? "session-bound-engine"])).digest("hex");
  }

  private packet(entry: PreparedPreview, request: LocalVideoPreviewRequest, range: ReturnType<typeof resolvePreviewRange>): LocalVideoPreview {
    return { sourceId: range.source.id, snapshotId: request.expectedSnapshotId, durationMs: entry.durationMs, mimeType: "video/mp4", base64: entry.video.toString("base64"),
      proxy: { profile: range.frameRange ? "manual-cfr30-preview-v1" : "take-v1", sourceDurationMs: range.source.durationMs },
      initialFrame: { mimeType: "image/png", base64: entry.frame.toString("base64"), width: entry.width, height: entry.height, sourceTimeMs: entry.firstFrameMs },
      ...(range.clip ? { clip: { id: range.clip.id, sourceStartMs: range.startMs, sourceEndMs: range.endMs,
        firstFrameMs: entry.firstFrameMs, lastFrameMs: entry.lastFrameMs, frameCount: entry.frameCount,
        ...(range.clip.frameTiming ? { frameTiming: structuredClone(range.clip.frameTiming) } : {}) } } : {}) };
  }

  private seal(key: string, entry: PreparedPreview): string {
    return createHash("sha256").update(JSON.stringify([key, entry.sourceId, entry.durationMs, entry.width, entry.height,
      entry.firstFrameMs, entry.lastFrameMs, entry.frameCount])).update(entry.video).update(entry.frame).digest("hex");
  }

  private entrySize(entry: PreparedPreview): number { return entry.video.length + entry.frame.length + ENTRY_OVERHEAD_BYTES + 2 * Buffer.byteLength(entry.sourceId); }

  private forget(key: string): void {
    const old = this.cache.get(key);
    if (old) { this.retainedBytes -= this.entrySize(old); this.cache.delete(key); }
  }

  private remember(key: string, entry: PreparedPreview): void {
    if (this.closed) return;
    const maxEntries = this.options.cacheLimits?.maxEntries ?? CACHE_MAX_ENTRIES;
    const maxBytes = this.options.cacheLimits?.maxBytes ?? CACHE_MAX_BYTES;
    const size = this.entrySize(entry);
    if (!maxEntries || size > maxBytes) return;
    this.forget(key);
    while (this.cache.size >= maxEntries || this.retainedBytes + size > maxBytes) this.forget(this.cache.keys().next().value!);
    this.cache.set(key, entry); this.retainedBytes += size;
  }

  async prepare(request: LocalVideoPreviewRequest, signal: AbortSignal): Promise<LocalVideoPreview> {
    if (this.closed) throw manualVideoError("OPERATION_CANCELLED");
    const range = resolvePreviewRange(this.options.history, request);
    const { source, startMs, endMs } = range;
    const timeout = new AbortController();
    const combined = AbortSignal.any([signal, timeout.signal]);
    const timer = setTimeout(() => timeout.abort(), previewPreparationBudgetMs(source, startMs, endMs));
    let root: string | undefined;
    let owned: Awaited<ReturnType<typeof lstat>> | undefined;
    let primary: Error | undefined;
    let pendingCache: PreparedPreview | undefined;
    let key: string | undefined;
    try {
      key = this.key(range);
      const cached = this.cache.get(key);
      if (cached && (!cached.video.length || cached.video.length > MANUAL_VIDEO_MAX_BYTES || cached.frame.length < 24 || cached.frame.length > MANUAL_VIDEO_FRAME_MAX_BYTES
        || this.seal(key, cached) !== cached.seal)) this.forget(key);
      else if (cached) {
        await verifyAndCopyVideoSource(source, combined);
        const current = resolvePreviewRange(this.options.history, request);
        if (this.key(current) !== key) throw manualVideoError("MANUAL_VIDEO_STALE");
        combined.throwIfAborted();
        if (this.closed) throw manualVideoError("OPERATION_CANCELLED");
        this.cache.delete(key); this.cache.set(key, cached);
        return this.packet(cached, request, current);
      }
      root = await mkdtemp(join(await realpath(this.options.temporaryRoot ?? tmpdir()), "cevra-video-preview-"));
      owned = await lstat(root);
      await chmod(root, 0o700);
      const input = range.frameRange ? localSourceProbeInput(source.uri)! : join(root, `input${extname(source.uri).toLowerCase()}`);
      const output = join(root, "preview.mp4");
      // The worker owns a sibling job tree, never the output's parent. Keep
      // both under our private wrapper until the complete preview job retires.
      const jobRoot = range.frameRange ? await mkdtemp(join(root, "job-")) : undefined;
      if (jobRoot) await chmod(jobRoot, 0o700);
      await verifyAndCopyVideoSource(source, combined, range.frameRange ? undefined : input);
      resolvePreviewRange(this.options.history, request);
      combined.throwIfAborted();
      const result = await this.options.engine.execute(range.frameRange ? {
        type: "render-manual-video-preview", version: 1, item: { inputUri: input, ...range.frameRange,
          sourceContent: { ...source.technicalDescriptor!.content }, audioSelection: "single-source-stream" }, outputUri: output, ownedWorkspaceUri: jobRoot!
      } : { type: "trim", inputUri: input, outputUri: output,
        startMs, endMs, boundedPreview: true, previewProfile: "take-v1" }, { jobId: `preview:${request.operationId}`, locale: "en-US", signal: combined });
      combined.throwIfAborted();
      if (result.type !== "file" || result.outputUri !== output || result.probe.uri !== output || !result.probe.hasVideo) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
      let evidence: { width: number; height: number; firstFrameMs: number; lastFrameMs: number; frameCount: number; outputSha256: string };
      let duration = result.durationMs;
      if (range.frameRange) {
        let grid;
        try { grid = validateManualSequenceExecutionEvidence(result.manualSequence); } catch { throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED"); }
        const frames = range.frameRange.sourceEndFrame - range.frameRange.sourceStartFrame;
        const original = grid.sources[0];
        if (grid.profile !== "manual-cfr30-preview-v1" || grid.totalFrames !== frames || grid.itemCount !== 1 || grid.sources.length !== 1
          || !original || original.inputUri !== input || original.sha256 !== source.technicalDescriptor!.content.sha256 || original.sizeBytes !== source.technicalDescriptor!.content.sizeBytes
          || original.sampleRate !== source.sampleRate || original.channelLayout !== (source.channels === 2 ? "stereo" : "mono")
          || result.probe.width !== 720 || result.probe.height !== 404 || result.probe.frameRate !== 30 || result.probe.rotationDegrees !== 0
          || result.probe.videoCodec !== "h264"
          || !result.probe.hasAudio || result.probe.audioCodec !== "aac" || result.probe.sampleRate !== 48000
          || result.probe.channels !== (grid.audioChannelLayout === "stereo" ? 2 : 1) || result.probe.hdr === true
          || result.effectiveProfile.container !== "mp4" || result.effectiveProfile.videoCodec !== "h264" || result.effectiveProfile.audioCodec !== "aac"
          || !Number.isFinite(duration) || Math.abs(duration! - framesToMilliseconds(frames)) > 1
          || endMs > original.sourceVideoEndMs + 1
          || range.frameRange.sourceStartFrame * original.sampleRate / 30 < original.sourceAudioFirstSample
          || range.frameRange.sourceEndFrame * original.sampleRate / 30 > original.sourceAudioFirstSample + original.sourceAudioSampleCount) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
        duration = framesToMilliseconds(frames);
        evidence = { width: 720, height: 404, firstFrameMs: startMs,
          lastFrameMs: framesToMilliseconds(range.frameRange.sourceEndFrame - 1), frameCount: frames, outputSha256: grid.outputSha256 };
      } else {
        const take = result.boundedPreview;
        if (!take || take.version !== 2) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
        evidence = take;
        if (result.outputUri !== output || result.probe.uri !== output || !result.probe.hasVideo
        || take.inputSha256 !== source.technicalDescriptor!.content.sha256
        || take.sourceStartMs !== startMs || take.sourceEndMs !== endMs
        || take.firstFrameMs < startMs || take.lastFrameMs >= endMs || take.frameCount < 1
        || take.sourceTimesMs.length !== take.frameCount || take.outputTimesMs.length !== take.frameCount
        || take.sourceTimesMs.some((time, index) => !Number.isFinite(time) || time < startMs || time >= endMs
          || !Number.isFinite(take.outputTimesMs[index]) || Math.abs(take.outputTimesMs[index]! - (time - startMs)) > take.timeBaseToleranceMs)
        || !Number.isFinite(take.durationToleranceMs) || take.durationToleranceMs > 102.001
        || result.probe.width !== take.width || result.probe.height !== take.height || result.probe.rotationDegrees !== 0
        || result.probe.hasAudio !== Boolean(source.technicalDescriptor?.audio)
        || (result.probe.hasAudio && (result.probe.audioCodec !== "aac" || !take.audio || take.audio.sampleRate !== source.sampleRate || take.audio.channels !== source.channels
          || take.audio.inputSamples !== Math.ceil(endMs * take.audio.sampleRate / 1000) - Math.ceil(startMs * take.audio.sampleRate / 1000)
          || take.audio.decodedSamples < take.audio.inputSamples || take.audio.decodedSamples >= take.audio.inputSamples + 1024))
        || result.effectiveProfile.container !== "mp4" || result.effectiveProfile.videoCodec !== "h264"
        || !Number.isSafeInteger(duration) || duration! <= 0 || Math.abs(duration! - (endMs - startMs)) > take.durationToleranceMs + 1) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
      }
      const handle = await open(output, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      let bytes: Buffer;
      let videoReadError: unknown;
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
        // Extract from the admitted derivative, never from movie-time-zero canvas
        // or by moving the video/audio clock. Retain its FD through extraction.
        const frameOutput = join(root, "first-frame.png");
        const frameResult = await this.options.engine.execute({ type: "extract-frame", inputUri: output, outputUri: frameOutput, atMs: 0,
          ...(range.frameRange ? { maxDimension: 720 as const } : {}) },
          { jobId: `preview-frame:${request.operationId}`, locale: "en-US", signal: combined });
        combined.throwIfAborted();
        if (frameResult.type !== "file" || frameResult.outputUri !== frameOutput || frameResult.probe.uri !== frameOutput) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
        const frameWidth = frameResult.probe.width!, frameHeight = frameResult.probe.height!;
        if (!Number.isSafeInteger(frameWidth) || !Number.isSafeInteger(frameHeight) || Math.min(frameWidth, frameHeight) < 1 || Math.max(frameWidth, frameHeight) > 720
          || (range.frameRange ? Math.abs(frameWidth * evidence.height - frameHeight * evidence.width) > Math.max(evidence.width, evidence.height)
            : frameWidth !== evidence.width || frameHeight !== evidence.height)) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
        const frameHandle = await open(frameOutput, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        let frame: Buffer;
        let frameReadError: unknown;
        try {
          const stamp = await frameHandle.stat({ bigint: true });
          if (!stamp.isFile() || stamp.size < 24n || stamp.size > BigInt(MANUAL_VIDEO_FRAME_MAX_BYTES)) throw manualVideoError("MANUAL_VIDEO_TOO_LARGE");
          if (!frameResult.publication || frameResult.publication.device !== String(stamp.dev) || frameResult.publication.inode !== String(stamp.ino)) throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
          frame = Buffer.alloc(Number(stamp.size));
          for (let offset = 0; offset < frame.length;) {
            combined.throwIfAborted();
            const read = await frameHandle.read(frame, offset, frame.length - offset, offset);
            if (!read.bytesRead) throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
            offset += read.bytesRead;
          }
          const end = await frameHandle.stat({ bigint: true }), named = await lstat(frameOutput, { bigint: true });
          if (!sameFile(stamp, end) || !sameFile(end, named) || !named.isFile()) throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
          if (!frame.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || frame.readUInt32BE(8) !== 13 || frame.toString("ascii", 12, 16) !== "IHDR"
            || frame.readUInt32BE(16) !== frameWidth || frame.readUInt32BE(20) !== frameHeight) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
        } catch (cause) { frameReadError = cause; throw cause; }
        finally { await closePreservingFailure(frameHandle, frameReadError); }
        const afterFrame = await handle.stat({ bigint: true }), named = await lstat(output, { bigint: true });
        if (!sameFile(initial, afterFrame) || !sameFile(afterFrame, named) || !named.isFile()) throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
        const entry: PreparedPreview = { sourceId: source.id, video: bytes, frame, durationMs: duration!, width: frameWidth, height: frameHeight,
          firstFrameMs: evidence.firstFrameMs, lastFrameMs: evidence.lastFrameMs, frameCount: evidence.frameCount, seal: "" };
        pendingCache = Object.freeze({ ...entry, seal: this.seal(key!, entry) });
      } catch (cause) { videoReadError = cause; throw cause; }
      finally { await closePreservingFailure(handle, videoReadError); }
      await verifyAndCopyVideoSource(source, combined);
      const current = resolvePreviewRange(this.options.history, request);
      if (this.key(current) !== key) throw manualVideoError("MANUAL_VIDEO_STALE");
      combined.throwIfAborted();
      return this.packet(pendingCache!, request, current);
    } catch (cause) {
      primary = combined.aborted ? manualVideoError(timeout.signal.aborted && !signal.aborted ? "MANUAL_VIDEO_PREVIEW_TIMEOUT" : "OPERATION_CANCELLED")
        : cause instanceof Error && "code" in cause && (String(cause.code).startsWith("MANUAL_VIDEO_") || String(cause.code).startsWith("MANUAL_SEQUENCE_")) ? cause : manualVideoError("MANUAL_VIDEO_UNAVAILABLE");
      if ("code" in primary && primary.code === "MANUAL_VIDEO_SOURCE_CHANGED") for (const [cachedKey, entry] of this.cache) if (entry.sourceId === source.id) this.forget(cachedKey);
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
      if (!primary && pendingCache && key) {
        if (combined.aborted || this.closed) throw manualVideoError("OPERATION_CANCELLED");
        if (this.key(resolvePreviewRange(this.options.history, request)) !== key) throw manualVideoError("MANUAL_VIDEO_STALE");
        this.remember(key, pendingCache);
      }
    }
  }
}

function sameFile(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

async function closePreservingFailure(handle: FileHandle, primary: unknown): Promise<void> {
  try { await handle.close(); }
  catch (cause) {
    if (primary === undefined) throw cause;
    if (primary instanceof Error) { try { Object.assign(primary, { closeError: cause }); } catch { /* Retain the primary even if frozen. */ } }
  }
}
