import type { CreateManualVideoClipRequest, LocalVideoPreview } from "@cevra/application";
import type { ProjectIR, SourceAsset, TimelineClip } from "@cevra/project-ir";
import { useEffect, useRef, useState } from "react";
import type { DesktopBackend } from "../backend/desktop-backend";
import { formatMilliseconds, type Translate } from "../ui-model";
import { floorMsToFrames, framesToMilliseconds, nearestMsToFrames, formatFrames, snapSourceMark } from "../frame-timing";

import type { TimelineSeekPhase } from "../timeline-interactions";

interface Props {
  backend: DesktopBackend;
  source?: SourceAsset;
  sourceLabel?: string;
  snapshotId: string;
  clip?: TimelineClip;
  sequencePreview?: readonly TimelineClip[];
  unsupportedClip?: boolean;
  timelineOccupied: boolean;
  sequenceEditing?: boolean;
  frameEditing?: boolean;
  busy: boolean;
  seek: { sequence: number; timelineMs: number };
  t: Translate;
  onPlayheadChange(value: number): void;
  onCreate(request: CreateManualVideoClipRequest): Promise<void>;
  program?: {
    durationMs: number;
    resume: boolean;
    onPlaybackIntent(value: boolean): void;
    onSeek(value: number, resume?: boolean): void;
    onScrub?(value: number, phase: TimelineSeekPhase): void;
    onClipEnd(): void;
  };
}

/** Original bytes or a bounded, ephemeral derivative of the canonical clip. */
export function ManualVideoPreview({ backend, source, sourceLabel, snapshotId, clip, sequencePreview, unsupportedClip, timelineOccupied, sequenceEditing, frameEditing, busy, seek, t, onPlayheadChange, onCreate, program }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const metadataVerified = useRef(false);
  const imageVerified = useRef<string | null>(null);
  const activePreviewUrl = useRef<string | null>(null);
  const programRef = useRef(program);
  programRef.current = program;
  const sliderScrub = useRef<{ pointerId: number; originalMs: number; element: HTMLInputElement } | null>(null);
  const completed = useRef(false);
  const pendingSeek = useRef(false);
  const atProgramOut = useRef(false);
  const [initialFrame, setInitialFrame] = useState<{ url: string; image: string; width: number; height: number } | null>(null);
  const [preview, setPreview] = useState<LocalVideoPreview | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(clip?.sourceStartMs ?? 0);
  const [inMs, setInMs] = useState<number | null>(null);
  const [outMs, setOutMs] = useState<number | null>(null);
  const [markDeltas, setMarkDeltas] = useState<{ in?: number; out?: number }>({});
  const [retry, setRetry] = useState(0);
  const startMs = clip?.sourceStartMs ?? 0;
  const endMs = clip?.sourceEndMs ?? source?.durationMs ?? 0;
  const mediaEndMs = preview?.durationMs ?? 0;
  const timing = clip?.frameTiming;

  useEffect(() => {
    let active = true;
    let settled = false;
    let objectUrl: string | null = null;
    const operationId = `video-preview-${crypto.randomUUID()}`;
    activePreviewUrl.current = null;
    completed.current = false;
    pendingSeek.current = false;
    atProgramOut.current = false;
    metadataVerified.current = false;
    imageVerified.current = null;
    setInitialFrame(null);
    setPreview(null); setUrl(null); setReady(false); setError(null); setPlaying(false); setSeeking(false); setInMs(null); setOutMs(null); setMarkDeltas({}); setCurrentMs(startMs);
    if (source?.kind === "video") {
      void backend.previewLocalVideo({ sourceId: source.id, expectedSnapshotId: snapshotId, operationId, ...(sequencePreview ? { sequence: true } : clip ? { clipId: clip.id } : {}) }).then((result) => {
        settled = true;
        if (!active) return;
        if (!sequencePreview && timing && (result.proxy?.profile !== "manual-cfr30-preview-v1" || !result.clip?.frameTiming
          || result.clip.frameTiming.version !== 1 || (["timelineStartFrame", "timelineEndFrame", "sourceStartFrame", "sourceEndFrame"] as const).some(key => result.clip!.frameTiming![key] !== timing[key]) || result.clip.frameCount !== timing.sourceEndFrame - timing.sourceStartFrame
          || result.durationMs !== framesToMilliseconds(timing.sourceEndFrame - timing.sourceStartFrame))) throw { code: "MANUAL_VIDEO_FRAME_GRID_UNAVAILABLE" };
        if (sequencePreview && (result.sequence?.timingPolicy !== "cfr30" || result.proxy?.profile !== "manual-cfr30-preview-v1" || result.clip !== undefined
          || result.sequence.totalFrames !== timing?.sourceEndFrame || result.durationMs !== framesToMilliseconds(timing!.sourceEndFrame)
          || result.sequence.clipIds.length !== sequencePreview.length || result.sequence.clipIds.some((id, index) => id !== sequencePreview[index]!.id))) throw { code: "MANUAL_VIDEO_STALE" };
        if (!sequencePreview && result.sequence !== undefined) throw { code: "MANUAL_VIDEO_STALE" };
        if (result.sourceId !== source.id || result.snapshotId !== snapshotId || !(result.proxy?.profile === "manual-cfr30-preview-v1" ? Number.isFinite(result.durationMs) : Number.isSafeInteger(result.durationMs)) || result.durationMs <= 0
          || (sequencePreview ? false : clip ? result.clip?.id !== clip.id || result.clip.sourceStartMs !== clip.sourceStartMs || result.clip.sourceEndMs !== clip.sourceEndMs
            || !Number.isFinite(result.clip.firstFrameMs) || result.clip.firstFrameMs < clip.sourceStartMs || !Number.isFinite(result.clip.lastFrameMs) || result.clip.lastFrameMs < result.clip.firstFrameMs || result.clip.lastFrameMs >= clip.sourceEndMs
            || !Number.isSafeInteger(result.clip.frameCount) || result.clip.frameCount < 1 : result.clip !== undefined || (result.proxy ? result.proxy.profile !== "take-v1" || result.proxy.sourceDurationMs !== source.durationMs : result.durationMs !== source.durationMs))
          || !["video/mp4", "video/quicktime", "video/webm"].includes(result.mimeType) || result.base64.length > 11_184_812) throw { code: "MANUAL_VIDEO_STALE" };
        const bytes = Uint8Array.from(atob(result.base64), (character) => character.charCodeAt(0));
        if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw { code: "MANUAL_VIDEO_TOO_LARGE" };
        if (clip && !result.initialFrame) throw { code: "MANUAL_VIDEO_UNSUPPORTED" };
        const frame = result.initialFrame;
        if (frame) {
          if (frame.mimeType !== "image/png" || frame.base64.length > 2_796_204 || !Number.isSafeInteger(frame.width) || !Number.isSafeInteger(frame.height)
            || Math.min(frame.width, frame.height) < 1 || Math.max(frame.width, frame.height) > 720 || !Number.isFinite(frame.sourceTimeMs)
            || (sequencePreview ? frame.sourceTimeMs !== 0 : clip ? frame.sourceTimeMs !== result.clip!.firstFrameMs : frame.sourceTimeMs < 0 || frame.sourceTimeMs >= source.durationMs!)) throw { code: "MANUAL_VIDEO_UNSUPPORTED" };
          const png = Uint8Array.from(atob(frame.base64), character => character.charCodeAt(0));
          const signature = [137, 80, 78, 71, 13, 10, 26, 10];
          if (png.length < 24 || png.length > 2 * 1024 * 1024 || signature.some((value, i) => png[i] !== value)) throw { code: "MANUAL_VIDEO_UNSUPPORTED" };
          const header = new DataView(png.buffer, png.byteOffset, png.byteLength);
          if (header.getUint32(8) !== 13 || header.getUint32(12) !== 0x49484452 || header.getUint32(16) !== frame.width || header.getUint32(20) !== frame.height) throw { code: "MANUAL_VIDEO_UNSUPPORTED" };
        }
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: result.mimeType }));
        activePreviewUrl.current = objectUrl;
        setInitialFrame(frame ? { url: objectUrl, image: `data:image/png;base64,${frame.base64}`, width: frame.width, height: frame.height } : null);
        // Metadata remains in React; transport bytes belong only to the Blob/image.
        setPreview({ ...result, base64: "", ...(frame ? { initialFrame: { ...frame, base64: "" } } : {}) }); setUrl(objectUrl);
      }).catch((cause: unknown) => { settled = true; if (active) { setError(errorCode(cause)); programRef.current?.onPlaybackIntent(false); } });
    }
    const video = videoRef.current;
    return () => {
      active = false;
      if (activePreviewUrl.current === objectUrl) activePreviewUrl.current = null;
      if (operationId && !settled) void backend.cancelOperation(operationId).catch(() => undefined);
      // Release decoder before revoking; never retain an old source/snapshot URL.
      if (video && objectUrl) { video.pause(); video.removeAttribute("src"); video.load(); }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [backend, source?.id, snapshotId, clip?.id, clip?.sourceStartMs, clip?.sourceEndMs, Boolean(sequencePreview), retry]);

  function cancelSliderScrub(restore = true) {
    const active = sliderScrub.current; sliderScrub.current = null;
    if (!active) return;
    if (active.element.hasPointerCapture?.(active.pointerId)) active.element.releasePointerCapture(active.pointerId);
    if (restore) programRef.current?.onScrub?.(active.originalMs, "cancel");
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") cancelSliderScrub(); };
    const blur = () => cancelSliderScrub();
    window.addEventListener("keydown", escape); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", escape); window.removeEventListener("blur", blur); cancelSliderScrub(false); };
  }, []);
  useEffect(() => {
    if (busy) cancelSliderScrub(false);
    if (busy) { videoRef.current?.pause(); programRef.current?.onPlaybackIntent(false); }
  }, [busy, url]);

  useEffect(() => {
    if (!ready || !clip || seek.sequence === 0 || !videoRef.current) return;
    completed.current = false;
    videoRef.current.pause();
    atProgramOut.current = Boolean(program && seek.timelineMs >= clip.timelineEndMs);
    const localMs = timing ? framesToMilliseconds(Math.max(0, Math.min(timing.timelineEndFrame, floorMsToFrames(seek.timelineMs)) - timing.timelineStartFrame)) : Math.max(0, seek.timelineMs - clip.timelineStartMs);
    const target = Math.min(mediaEndMs, localMs) / 1000;
    if (atProgramOut.current) { setCurrentMs(endMs); onPlayheadChange(clip.timelineEndMs); }
    if (Math.abs(videoRef.current.currentTime - target) < 0.001) { updateClock(); return; }
    pendingSeek.current = true; setSeeking(true);
    videoRef.current.currentTime = target;
  }, [ready, seek.sequence]);

  useEffect(() => {
    const video = videoRef.current;
    if (program && !program.resume) { video?.pause(); return; }
    if (!program?.resume || !ready || seeking || pendingSeek.current || busy || !video || !url || activePreviewUrl.current !== url) return;
    let active = true;
    void video.play().catch(() => { if (active && activePreviewUrl.current === url) fail("MANUAL_VIDEO_UNSUPPORTED"); });
    return () => { active = false; };
  }, [program?.resume, ready, seeking, busy, url, seek.sequence]);

  useEffect(() => {
    if (!playing || !ready || !clip) return;
    let frame: number;
    const readClock = () => { updateClock(); frame = requestAnimationFrame(readClock); };
    frame = requestAnimationFrame(readClock);
    return () => cancelAnimationFrame(frame);
  }, [playing, ready, clip?.id]);

  function fail(code: string) {
    programRef.current?.onPlaybackIntent(false);
    activePreviewUrl.current = null;
    metadataVerified.current = false;
    imageVerified.current = null;
    setInitialFrame(null);
    const video = videoRef.current;
    video?.pause();
    if (video) { video.removeAttribute("src"); video.load(); }
    if (url) URL.revokeObjectURL(url);
    setUrl(null); setReady(false); setPlaying(false); setError(code);
  }

  function metadataReady() {
    const video = videoRef.current;
    if (!video || !preview || !url || activePreviewUrl.current !== url || video.getAttribute("src") !== url) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || Math.abs(video.duration * 1000 - preview.durationMs) > 100) {
      fail("MANUAL_VIDEO_UNSUPPORTED"); return;
    }
    metadataVerified.current = true;
    setCurrentMs(startMs);
    if (video.currentTime !== 0) video.currentTime = 0;
    frameReady();
  }

  function frameReady() {
    const video = videoRef.current;
    // Metadata alone does not guarantee a decoded frame in WKWebView.
    if (!metadataVerified.current || !video || !url || activePreviewUrl.current !== url || video.getAttribute("src") !== url
      || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.seeking) return;
    if (initialFrame ? imageVerified.current === url : !clip) setReady(true);
  }

  function updateClock() {
    const video = videoRef.current;
    if (!video || !currentMedia()) return;
    if (atProgramOut.current && program && !program.resume && clip) { setCurrentMs(endMs); onPlayheadChange(clip.timelineEndMs); return; }
    const localFrame = timing ? Math.min(timing.sourceEndFrame - timing.sourceStartFrame, floorMsToFrames(Math.max(0, video.currentTime * 1000))) : undefined;
    const milliseconds = timing ? framesToMilliseconds(timing.sourceStartFrame + localFrame!) : Math.min(endMs, Math.max(startMs, startMs + Math.round(video.currentTime * 1000)));
    const boundary = program && clip ? Math.min(mediaEndMs, endMs - startMs) : mediaEndMs;
    if (clip && video.currentTime * 1000 >= boundary) {
      video.pause();
      if (video.currentTime * 1000 > boundary) video.currentTime = boundary / 1000;
      if (program) {
        setCurrentMs(endMs);
        onPlayheadChange(clip.timelineEndMs);
        finishClip();
        return;
      }
    }
    setCurrentMs(milliseconds);
    if (clip) onPlayheadChange(timing ? framesToMilliseconds(timing.timelineStartFrame + localFrame!) : clip.timelineStartMs + (milliseconds - startMs));
  }

  function currentMedia() {
    const video = videoRef.current;
    return Boolean(video && ready && !busy && url && activePreviewUrl.current === url && video.getAttribute("src") === url);
  }

  function finishClip() {
    if (completed.current || !activePreviewUrl.current || !programRef.current?.resume || busy) return;
    completed.current = true;
    programRef.current.onClipEnd();
  }

  function mark(which: "in" | "out") {
    const video = videoRef.current;
    if (!video || !ready || seeking || video.seeking || busy || timelineOccupied && !sequenceEditing) return;
    const raw = Math.min(source!.durationMs!, Math.max(0, video.currentTime * 1000));
    const snapped = frameEditing ? snapSourceMark(raw, source!.durationMs!) : undefined;
    const value = snapped?.projectedMs ?? Math.round(raw);
    if (snapped) setMarkDeltas(values => ({ ...values, [which]: snapped.deltaMs }));
    if (which === "in") setInMs(value); else setOutMs(value);
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (program?.resume && !busy) { program.onPlaybackIntent(false); video?.pause(); return; }
    if (!video || !ready || seeking || busy) return;
    if (program) {
      if (clip && currentMs >= endMs) { program.onSeek(0, true); return; }
      program.onPlaybackIntent(true);
      return;
    }
    if (!video.paused) { video.pause(); return; }
    if (video.currentTime * 1000 >= mediaEndMs || video.currentTime < 0) video.currentTime = 0;
    try { await video.play(); } catch { fail("MANUAL_VIDEO_UNSUPPORTED"); }
  }

  const validRange = inMs !== null && outMs !== null && inMs < outMs && outMs <= (source?.durationMs ?? 0);
  const errorKey = error === "MANUAL_VIDEO_FRAME_GRID_UNAVAILABLE" ? "preview.gridUnavailable" : error === "MANUAL_VIDEO_PREVIEW_SETTLING" ? "preview.localSettling" : error === "MANUAL_VIDEO_TOO_LARGE" ? "preview.localTooLarge" : error === "MANUAL_VIDEO_STALE" || error === "MANUAL_SEQUENCE_STALE" || error === "MANUAL_VIDEO_SOURCE_CHANGED" ? "preview.localChanged" : "preview.localUnavailable";
  const programFrame = timing ? timing.timelineStartFrame + (Math.min(timing.sourceEndFrame, Math.max(timing.sourceStartFrame, nearestMsToFrames(Math.max(0, currentMs)))) - timing.sourceStartFrame) : undefined;
  const programMs = timing ? framesToMilliseconds(programFrame!) : clip ? clip.timelineStartMs + (currentMs - startMs) : 0;
  return <section className="manual-video-preview" aria-label={t("preview.localVideo")}>
    <div className="manual-preview-heading"><strong>{sourceLabel ?? t("preview.localVideo")}</strong><span>{t(program ? "sequence.preview" : clip ? "preview.clipMode" : "preview.originalMode")}</span></div>
    <div className="manual-video-stage">
      <video ref={videoRef} src={url ?? undefined} hidden={Boolean(program && currentMs >= endMs)} preload="auto" playsInline onLoadedMetadata={event => { if (event.currentTarget === videoRef.current && url) metadataReady(); }} onLoadedData={frameReady} onCanPlay={frameReady} onError={() => { if (url) fail("MANUAL_VIDEO_UNSUPPORTED"); }}
        onSeeking={() => { pendingSeek.current = true; setSeeking(true); }} onSeeked={() => { pendingSeek.current = false; frameReady(); setSeeking(false); updateClock(); }} onTimeUpdate={updateClock} onPlay={() => { if (!currentMedia() || program && !program.resume) { videoRef.current?.pause(); return; } setPlaying(true); }} onPause={() => setPlaying(false)} onEnded={() => { if (!currentMedia()) return; setPlaying(false); if (program && clip) { setCurrentMs(endMs); onPlayheadChange(clip.timelineEndMs); finishClip(); } else updateClock(); }} />
      {initialFrame && initialFrame.url === url && <img key={url} ref={imageRef} className="manual-initial-frame" src={initialFrame.image} alt="" aria-hidden="true" hidden={playing || seeking || currentMs !== startMs}
        onLoad={event => {
          const image = event.currentTarget;
          if (image !== imageRef.current || activePreviewUrl.current !== initialFrame.url || videoRef.current?.getAttribute("src") !== initialFrame.url) return;
          if (image.naturalWidth !== initialFrame.width || image.naturalHeight !== initialFrame.height) { fail("MANUAL_VIDEO_UNSUPPORTED"); return; }
          imageVerified.current = initialFrame.url; frameReady();
        }}
        onError={event => { if (event.currentTarget === imageRef.current) fail("MANUAL_VIDEO_UNSUPPORTED"); }} />}
      {!ready && <p role="status">{error ? t(errorKey) : source?.kind === "video" ? t("preview.localLoading") : t("preview.localEmpty")}</p>}
    </div>
    <div className="manual-preview-controls">
      {error && <button type="button" className="secondary-button" disabled={busy} onClick={() => { setError(null); setRetry(value => value + 1); }}>{t("preview.retryLocal")}</button>}
      <button type="button" className="secondary-button" disabled={busy || !program?.resume && (!ready || seeking)} onClick={() => void togglePlayback()}>{t((program ? program.resume : playing) ? "preview.pauseLocal" : "preview.playLocal")}</button>
      {timing && program && <>
        <button type="button" className="secondary-button" disabled={!ready || seeking || busy || programFrame === 0} onClick={() => program.onSeek(framesToMilliseconds(Math.max(0, programFrame! - 1)))}>{t("preview.previousFrame")}</button>
        <button type="button" className="secondary-button" disabled={!ready || seeking || busy || programFrame === floorMsToFrames(program.durationMs)} onClick={() => program.onSeek(framesToMilliseconds(Math.min(floorMsToFrames(program.durationMs), programFrame! + 1)))}>{t("preview.nextFrame")}</button>
      </>}
      <input type="range" aria-label={t(program ? "sequence.seek" : clip ? "preview.clipSeek" : "preview.sourceSeek")} min={program ? 0 : startMs} max={program ? timing ? floorMsToFrames(program.durationMs) : program.durationMs : Math.max(startMs + 1, endMs)} step="1" value={program ? timing ? programFrame : programMs : Math.min(endMs, Math.max(startMs, currentMs))} disabled={!ready || busy}
      onPointerDown={event => {
        if (event.button !== 0 || !ready || busy || !program?.onScrub || sliderScrub.current) return;
        sliderScrub.current = { pointerId: event.pointerId, originalMs: programMs, element: event.currentTarget };
        event.currentTarget.setPointerCapture?.(event.pointerId); program.onScrub(programMs, "start");
      }}
      onPointerUp={event => {
        if (sliderScrub.current?.pointerId !== event.pointerId || !program?.onScrub) return;
        const value = timing ? framesToMilliseconds(Number(event.currentTarget.value)) : Number(event.currentTarget.value);
        cancelSliderScrub(false); program.onScrub(value, "end");
      }} onPointerCancel={() => cancelSliderScrub()} onLostPointerCapture={() => cancelSliderScrub()}
      onChange={(event) => {
        if (program?.onScrub && sliderScrub.current) { program.onScrub(timing ? framesToMilliseconds(Number(event.target.value)) : Number(event.target.value), "move"); return; }
        if (program) { program.onSeek(timing ? framesToMilliseconds(Number(event.target.value)) : Number(event.target.value), program.resume); return; }
        const video = videoRef.current; if (!video) return;
        setSeeking(true); video.currentTime = Math.min(mediaEndMs, Number(event.target.value) - startMs) / 1000;
      }} />
      <time data-testid="preview-timecode">{timing && program ? t("sequence.framePosition", { frame: programFrame!, time: formatFrames(programFrame!) }) : t(program ? "sequence.position" : "preview.sourcePosition", { time: formatMilliseconds(program ? programMs : currentMs) })} / {timing && program ? formatFrames(floorMsToFrames(program.durationMs)) : formatMilliseconds(program ? program.durationMs : endMs)}</time>
    </div>
    {preview?.proxy && <p className="manual-preview-hint">{t("preview.proxyHint")}</p>}
    {clip && !sequencePreview && <div className="manual-preview-timing">
      <time data-testid="preview-clip-timecode">{t("preview.clipElapsed", { time: formatMilliseconds(currentMs - startMs), duration: formatMilliseconds(endMs - startMs) })}</time>
      <output>{t("preview.clipBounds", { start: timing ? formatFrames(timing.sourceStartFrame) : formatMilliseconds(startMs), end: timing ? formatFrames(timing.sourceEndFrame) : formatMilliseconds(endMs) })}{timing && " @ 30 fps"}</output>
    </div>}
    {sequenceEditing && timelineOccupied && !clip && <p className="manual-preview-hint" role="status">{t("sequence.previewPending")}</p>}
    {clip || timelineOccupied && !sequenceEditing ? <p className="manual-preview-hint" role="status">{t(unsupportedClip ? "preview.unsupportedClip" : clip ? "preview.boundedClip" : "preview.singleClip")}</p> : <>
      <div className="manual-preview-marks">
        <button type="button" className="secondary-button" disabled={!ready || seeking || busy} onClick={() => mark("in")}>{t("preview.markIn")}</button><output>{frameEditing && inMs !== null ? t("sequence.snapMark", { edge: "IN", frame: nearestMsToFrames(inMs), time: formatFrames(nearestMsToFrames(inMs)), delta: (markDeltas.in ?? 0).toFixed(3) }) : <>IN {inMs === null ? "—" : formatMilliseconds(inMs)}</>}</output>
        <button type="button" className="secondary-button" disabled={!ready || seeking || busy} onClick={() => mark("out")}>{t("preview.markOut")}</button><output>{frameEditing && outMs !== null ? t("sequence.snapMark", { edge: "OUT", frame: nearestMsToFrames(outMs), time: formatFrames(nearestMsToFrames(outMs)), delta: (markDeltas.out ?? 0).toFixed(3) }) : <>OUT {outMs === null ? "—" : formatMilliseconds(outMs)}</>}</output>
        <button type="button" className="manual-create-clip-button" disabled={!ready || seeking || busy || !validRange} onClick={() => {
          videoRef.current?.pause();
          if (source && validRange) void onCreate({ sourceId: source.id, expectedSnapshotId: snapshotId, sourceStartMs: inMs!, sourceEndMs: outMs! }).catch((cause: unknown) => fail(errorCode(cause)));
        }}>{t(busy ? "preview.creatingClip" : sequenceEditing && timelineOccupied ? "sequence.append" : "preview.createClip")}</button>
      </div>
      <p className="manual-preview-hint">{inMs !== null && outMs !== null && !validRange ? t("preview.rangeInvalid") : t("preview.localHint")}</p>
    </>}
  </section>;
}

function errorCode(cause: unknown): string {
  return typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string" ? cause.code : "MANUAL_VIDEO_UNAVAILABLE";
}

/** Legacy compatibility; frame-grid playback goes through the canonical sequence consumer. */
export function supportsManualClipPreview(project: Readonly<ProjectIR>, clip: TimelineClip): boolean {
  const source = project.sources.find((item) => item.id === clip.sourceId);
  const track = project.timeline.tracks.find((item) => item.id === clip.trackId);
  return project.timeline.timingPolicy === "legacy-milliseconds" && !clip.frameTiming && project.timeline.clips.length === 1 && !project.captions.length && !project.graphics.length
    && source?.kind === "video" && Number.isSafeInteger(source.durationMs) && source.durationMs! > 0
    && track?.kind === "video" && !track.hidden && !track.muted
    && clip.speed === 1 && clip.volume === 1 && clip.opacity === 1 && !clip.extensions
    && [clip.sourceStartMs, clip.sourceEndMs, clip.timelineStartMs, clip.timelineEndMs].every(Number.isSafeInteger)
    && clip.sourceStartMs >= 0 && clip.sourceStartMs < clip.sourceEndMs && clip.sourceEndMs <= source.durationMs!
    && clip.timelineStartMs === 0 && clip.timelineEndMs === clip.sourceEndMs - clip.sourceStartMs;
}
