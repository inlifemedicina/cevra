import { ManualTitleOverlay, type TitlePreviewEditing } from "./ManualTitleOverlay";
import { supportsManualClipExtensions } from "@cevra/application";
import type { CreateManualVideoClipRequest, LocalVideoPreview } from "@cevra/application";
import type { ProjectIR, SourceAsset, TimelineClip } from "@cevra/project-ir";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { DesktopBackend } from "../backend/desktop-backend";
import { EditingHelp } from "./EditingHelp";
import { formatMilliseconds, type Translate } from "../ui-model";
import { floorMsToFrames, framesToMilliseconds, nearestMsToFrames, cfr30DecoderSeekSeconds, formatFrames, snapSourceMark } from "../frame-timing";

import { gestureEscape, type TimelineSeekPhase } from "../timeline-interactions";
import { activateShortcut, shortcutAction, shortcutProps } from "../keyboard-shortcuts";

interface Props {
  onAction?(action: () => void | Promise<void>): Promise<void>;
  actionBusy?: boolean;
  titleEditing?: TitlePreviewEditing;
  titleEditingBlocked?: boolean;
  titleContinuityKey?: string;
  backend: DesktopBackend;
  source?: SourceAsset;
  sourceLabel?: string;
  sourceFileName?: string;
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
export function ManualVideoPreview({ onAction, actionBusy, backend, source, sourceLabel, sourceFileName, snapshotId, clip, sequencePreview, unsupportedClip, timelineOccupied, sequenceEditing, frameEditing, busy, seek, t, onPlayheadChange, onCreate, program, titleEditing, titleEditingBlocked, titleContinuityKey }: Props) {
  const controlBusy = actionBusy ?? busy;
  function runAction(action: () => void | Promise<void>) {
    if (onAction) void onAction(action).catch(() => {});
    else void action();
  }
  const videoRef = useRef<HTMLVideoElement>(null);
  const heldCanvasRef = useRef<HTMLCanvasElement>(null);
  const heldFrame = useRef<{ identity: string; timeMs: number } | null>(null);
  const [holdingFrame, setHoldingFrame] = useState(false);
  const previousView = useRef({ snapshotId, titleContinuityKey });
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

  function discardHeldFrame() {
    heldFrame.current = null;
    const canvas = heldCanvasRef.current;
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    setHoldingFrame(false);
  }

  // A labelled, inert picture bridges a title-only refresh; it never admits stale media.
  // Layout effects run before the previous request releases its decoder and Blob.
  useLayoutEffect(() => {
    const previous = previousView.current;
    previousView.current = { snapshotId, titleContinuityKey };
    if (!titleContinuityKey || titleContinuityKey !== previous.titleContinuityKey) { discardHeldFrame(); return; }
    if (snapshotId === previous.snapshotId) return;
    if (heldFrame.current?.identity === titleContinuityKey) return;
    const video = videoRef.current, canvas = heldCanvasRef.current;
    if (!ready || playing || program?.resume || seeking || pendingSeek.current || !video || !canvas
      || preview?.snapshotId !== previous.snapshotId || !metadataVerified.current || !url
      || activePreviewUrl.current !== url || video.getAttribute("src") !== url
      || !video.paused || video.seeking || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      || initialFrame && imageVerified.current !== url || currentMs >= endMs
      || !Number.isSafeInteger(video.videoWidth) || !Number.isSafeInteger(video.videoHeight)
      || video.videoWidth < 1 || video.videoHeight < 1) { discardHeldFrame(); return; }
    try {
      // At frame zero the admitted PNG is the visible picture, including before Play.
      const image = imageRef.current;
      const picture = currentMs === startMs && image && !image.hidden && imageVerified.current === url ? image : video;
      const width = picture === image ? image.naturalWidth : video.videoWidth;
      const height = picture === image ? image.naturalHeight : video.videoHeight;
      const ratio = Math.min(1, 720 / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      const context = canvas.getContext("2d");
      if (!context) { discardHeldFrame(); return; }
      context.drawImage(picture, 0, 0, canvas.width, canvas.height);
      // A decoded-but-unpainted WK video can yield transparent pixels. Never retain that as a frame.
      if (context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[3] !== 255) { discardHeldFrame(); return; }
      heldFrame.current = { identity: titleContinuityKey, timeMs: currentMs };
      setHoldingFrame(true);
    } catch { discardHeldFrame(); }
  }, [snapshotId, titleContinuityKey]);
  useLayoutEffect(() => () => {
    heldFrame.current = null;
    const canvas = heldCanvasRef.current;
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }, []);

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
    setPreview(null); setUrl(null); setReady(false); setError(null); setPlaying(false); setSeeking(false); setInMs(null); setOutMs(null); setMarkDeltas({}); setCurrentMs(heldFrame.current?.timeMs ?? startMs);
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
      }).catch((cause: unknown) => { settled = true; if (active) { discardHeldFrame(); setError(errorCode(cause)); programRef.current?.onPlaybackIntent(false); } });
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

  function decoderSeekSeconds(localMs: number) {
    return timing ? cfr30DecoderSeekSeconds(floorMsToFrames(localMs), timing.sourceEndFrame - timing.sourceStartFrame)
      : Math.min(mediaEndMs, localMs) / 1000;
  }

  function cancelSliderScrub(restore = true) {
    const active = sliderScrub.current; sliderScrub.current = null;
    if (!active) return;
    if (active.element.hasPointerCapture?.(active.pointerId)) active.element.releasePointerCapture(active.pointerId);
    if (restore) programRef.current?.onScrub?.(active.originalMs, "cancel");
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (gestureEscape(event)) cancelSliderScrub(); };
    const blur = () => cancelSliderScrub();
    window.addEventListener("keydown", escape); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", escape); window.removeEventListener("blur", blur); cancelSliderScrub(false); };
  }, []);
  useEffect(() => {
    if (busy) cancelSliderScrub(false);
    if (busy) { videoRef.current?.pause(); programRef.current?.onPlaybackIntent(false); }
  }, [busy]);

  useEffect(() => {
    if (!ready || !clip || seek.sequence === 0 || !videoRef.current) return;
    completed.current = false;
    videoRef.current.pause();
    atProgramOut.current = Boolean(program && seek.timelineMs >= clip.timelineEndMs);
    const localMs = timing ? framesToMilliseconds(Math.max(0, Math.min(timing.timelineEndFrame, floorMsToFrames(seek.timelineMs)) - timing.timelineStartFrame)) : Math.max(0, seek.timelineMs - clip.timelineStartMs);
    const target = decoderSeekSeconds(localMs);
    if (atProgramOut.current) { setCurrentMs(endMs); onPlayheadChange(clip.timelineEndMs); }
    if (Math.abs(videoRef.current.currentTime - target) < 0.001) { updateClock(); return; }
    pendingSeek.current = true; setSeeking(true);
    videoRef.current.currentTime = target;
  }, [ready, seek.sequence]);

  useEffect(() => {
    const video = videoRef.current;
    if (!holdingFrame || !ready || seeking || pendingSeek.current || !video || !url
      || preview?.snapshotId !== snapshotId || activePreviewUrl.current !== url
      || video.getAttribute("src") !== url || !metadataVerified.current
      || initialFrame && imageVerified.current !== url
      || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.seeking) return;
    const localMs = timing ? framesToMilliseconds(Math.max(0, Math.min(timing.timelineEndFrame, floorMsToFrames(seek.timelineMs)) - timing.timelineStartFrame)) : Math.max(0, seek.timelineMs - (clip?.timelineStartMs ?? 0));
    if (Math.abs(video.currentTime - decoderSeekSeconds(localMs)) >= 0.001) return;
    discardHeldFrame();
    setCurrentMs(timing ? framesToMilliseconds(timing.sourceStartFrame + floorMsToFrames(localMs)) : startMs + localMs);
  }, [holdingFrame, ready, seeking, url, snapshotId, seek.sequence]);

  useEffect(() => {
    const video = videoRef.current;
    if (program && !program.resume) { video?.pause(); return; }
    if (!program?.resume || !ready || holdingFrame || seeking || pendingSeek.current || busy || !video || !url || activePreviewUrl.current !== url) return;
    let active = true;
    void video.play().catch(() => { if (active && activePreviewUrl.current === url) fail("MANUAL_VIDEO_UNSUPPORTED"); });
    return () => { active = false; };
  }, [program?.resume, ready, holdingFrame, seeking, busy, url, seek.sequence]);

  useEffect(() => {
    if (!playing || !ready || !clip) return;
    let frame: number;
    const readClock = () => { updateClock(); frame = requestAnimationFrame(readClock); };
    frame = requestAnimationFrame(readClock);
    return () => cancelAnimationFrame(frame);
  }, [playing, ready, clip?.id]);

  function fail(code: string) {
    discardHeldFrame();
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
    setCurrentMs(heldFrame.current?.timeMs ?? startMs);
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

  function seekOriginal(milliseconds: number) {
    const video = videoRef.current;
    if (!video || !currentMedia()) return;
    const localMs = Math.max(0, Math.min(mediaEndMs, endMs - startMs, milliseconds - startMs));
    const changed = Math.abs(video.currentTime * 1000 - localMs) > 1e-6;
    try { video.currentTime = localMs / 1000; } catch { fail("MANUAL_VIDEO_UNSUPPORTED"); return; }
    // This is the requested source clock, not proof that the decoder painted it.
    setCurrentMs(startMs + localMs); setSeeking(changed || video.seeking);
    if (clip) onPlayheadChange(clip.timelineStartMs + localMs);
  }

  function currentMedia() {
    const video = videoRef.current;
    return Boolean(video && ready && !holdingFrame && !busy && url && activePreviewUrl.current === url && video.getAttribute("src") === url);
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
  const clockDuration = program?.durationMs ?? source?.durationMs ?? endMs;
  const programMs = timing ? framesToMilliseconds(programFrame!) : clip ? clip.timelineStartMs + (currentMs - startMs) : 0;
  function keyboard(event: ReactKeyboardEvent<HTMLElement>) {
    const action = shortcutAction(event, "preview");
    if (!action) return;
    if (action === "start" || action === "end") {
      if (!ready || holdingFrame || seeking || busy) return;
      event.preventDefault(); event.stopPropagation();
      if (program) runAction(() => programRef.current?.onSeek(action === "start" ? 0 : programRef.current.durationMs));
      else seekOriginal(action === "start" ? startMs : endMs);
      return;
    }
    activateShortcut(event, event.currentTarget, action);
  }
  return <section className="manual-video-preview" aria-label={t("preview.localVideo")} tabIndex={0} onKeyDown={keyboard}>
    <div className="manual-preview-heading"><strong title={sourceFileName ?? source?.displayName}>{sourceFileName ?? source?.displayName ?? sourceLabel ?? t("preview.localVideo")}</strong><span>{t(program ? "sequence.preview" : clip ? "preview.clipMode" : "preview.originalMode")}</span></div>
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
      <canvas ref={heldCanvasRef} className="manual-held-frame" aria-hidden="true" hidden={!holdingFrame} />
      {titleEditing && <ManualTitleOverlay editing={titleEditing} videoRef={videoRef} t={t} blocked={busy || titleEditingBlocked === true} active={ready && !holdingFrame && !seeking && !playing && !program?.resume && programFrame !== undefined && programFrame >= titleEditing.title.startFrame && programFrame < titleEditing.title.endFrame} />}
      {(!ready || holdingFrame) && <p className={holdingFrame ? "manual-preview-refreshing" : undefined} role="status">{error ? t(errorKey) : holdingFrame ? t("preview.refreshing") : source?.kind === "video" ? t("preview.localLoading") : t("preview.localEmpty")}</p>}
    </div>
    <div className="manual-preview-controls" onPointerDownCapture={event => {
      // Keep the text draft focused until a button captures its following intent.
      if ((event.target as Element).closest("button") && document.activeElement?.classList.contains("title-text-input")) event.preventDefault();
    }}>
      {error && <button type="button" className="secondary-button" disabled={busy} onClick={() => { setError(null); setRetry(value => value + 1); }}>{t("preview.retryLocal")}</button>}
      <button {...shortcutProps("play", t)} type="button" className="secondary-button" disabled={controlBusy || holdingFrame || !program?.resume && (!ready || seeking)} onClick={() => {
        if (program && onAction) {
          const resume = !program.resume, restart = currentMs >= endMs;
          runAction(() => { const current = programRef.current; if (!current) return;
            if (resume && restart) current.onSeek(0, true); else current.onPlaybackIntent(resume);
            if (!resume) videoRef.current?.pause();
          });
        } else runAction(togglePlayback);
      }}>{t((program ? program.resume : playing) ? "preview.pauseLocal" : "preview.playLocal")}</button>
      {timing && program && <>
        <button {...shortcutProps("previous-frame", t)} type="button" className="secondary-button" disabled={!ready || holdingFrame || seeking || controlBusy || programFrame === 0} onClick={() => { const value = framesToMilliseconds(Math.max(0, programFrame! - 1)); runAction(() => programRef.current?.onSeek(value)); }}>{t("preview.previousFrame")}</button>
        <button {...shortcutProps("next-frame", t)} type="button" className="secondary-button" disabled={!ready || holdingFrame || seeking || controlBusy || programFrame === floorMsToFrames(program.durationMs)} onClick={() => { const value = framesToMilliseconds(Math.min(floorMsToFrames(program.durationMs), programFrame! + 1)); runAction(() => programRef.current?.onSeek(value)); }}>{t("preview.nextFrame")}</button>
      </>}
      <input type="range" aria-label={t(program ? "sequence.seek" : clip ? "preview.clipSeek" : "preview.sourceSeek")} min={program ? 0 : startMs} max={program ? timing ? floorMsToFrames(program.durationMs) : program.durationMs : Math.max(startMs + 1, endMs)} step="1" value={program ? timing ? programFrame : programMs : Math.min(endMs, Math.max(startMs, currentMs))} disabled={!ready || holdingFrame || controlBusy}
      onPointerDown={event => {
        if (event.button !== 0 || !ready || controlBusy || !program?.onScrub || sliderScrub.current) return;
        sliderScrub.current = { pointerId: event.pointerId, originalMs: programMs, element: event.currentTarget };
        event.currentTarget.setPointerCapture?.(event.pointerId); runAction(() => programRef.current?.onScrub?.(programMs, "start"));
      }}
      onPointerUp={event => {
        if (sliderScrub.current?.pointerId !== event.pointerId || !program?.onScrub) return;
        const value = timing ? framesToMilliseconds(Number(event.currentTarget.value)) : Number(event.currentTarget.value);
        cancelSliderScrub(false); runAction(() => programRef.current?.onScrub?.(value, "end"));
      }} onPointerCancel={() => cancelSliderScrub()} onLostPointerCapture={() => cancelSliderScrub()}
      onChange={(event) => {
        if (program?.onScrub && sliderScrub.current) { const value = timing ? framesToMilliseconds(Number(event.target.value)) : Number(event.target.value); runAction(() => programRef.current?.onScrub?.(value, "move")); return; }
        if (program) { const value = timing ? framesToMilliseconds(Number(event.target.value)) : Number(event.target.value); runAction(() => programRef.current?.onSeek(value, programRef.current.resume)); return; }
        seekOriginal(Number(event.target.value));
      }} />
      <time data-testid="preview-timecode">{timing && program ? t("sequence.position", { time: formatFrames(programFrame!, clockDuration) }) : t(program ? "sequence.position" : "preview.sourcePosition", { time: formatMilliseconds(program ? programMs : currentMs, clockDuration) })} / {timing && program ? formatFrames(floorMsToFrames(program.durationMs), clockDuration) : formatMilliseconds(program ? program.durationMs : endMs, clockDuration)}</time>
    </div>
    <EditingHelp t={t}>
      {preview?.proxy && <p>{t("preview.proxyHint")}</p>}
      {clip && !unsupportedClip && <p>{t("preview.boundedClip")}</p>}
      {!clip && <><p>{t("preview.marksDraft")}</p><p>{t("preview.localHint")}</p></>}
      <p>{t("editing.fineTime")}</p><p>{t("editing.mediaTitleCaption")}</p>
    </EditingHelp>
    {clip && !sequencePreview && <div className="manual-preview-timing">
      <time data-testid="preview-clip-timecode">{t("preview.clipElapsed", { time: formatMilliseconds(currentMs - startMs, endMs - startMs), duration: formatMilliseconds(endMs - startMs) })}</time>
      <output>{t("preview.clipBounds", { start: timing ? formatFrames(timing.sourceStartFrame, source?.durationMs) : formatMilliseconds(startMs, source?.durationMs), end: timing ? formatFrames(timing.sourceEndFrame, source?.durationMs) : formatMilliseconds(endMs, source?.durationMs) })}</output>
    </div>}
    {sequenceEditing && timelineOccupied && !clip && <p className="manual-preview-hint" role="status">{t("sequence.previewPending")}</p>}
    {clip || timelineOccupied && !sequenceEditing ? (unsupportedClip || !clip) && <p className="manual-preview-hint" role="status">{t(unsupportedClip ? "preview.unsupportedClip" : "preview.singleClip")}</p> : <>
      <div className="manual-preview-marks">
        <button {...shortcutProps("mark-in", t)} type="button" className="secondary-button" disabled={!ready || seeking || busy} onClick={() => mark("in")}>{t("preview.markIn")}</button><output>{frameEditing && inMs !== null ? `IN ${formatFrames(nearestMsToFrames(inMs), source?.durationMs)}` : <>IN {inMs === null ? "—" : formatMilliseconds(inMs, source?.durationMs)}</>}</output>
        <button {...shortcutProps("mark-out", t)} type="button" className="secondary-button" disabled={!ready || seeking || busy} onClick={() => mark("out")}>{t("preview.markOut")}</button><output>{frameEditing && outMs !== null ? `OUT ${formatFrames(nearestMsToFrames(outMs), source?.durationMs)}` : <>OUT {outMs === null ? "—" : formatMilliseconds(outMs, source?.durationMs)}</>}</output>
        <button type="button" className="manual-create-clip-button" disabled={!ready || seeking || busy || !validRange} onClick={() => {
          videoRef.current?.pause();
          if (source && validRange) void onCreate({ sourceId: source.id, expectedSnapshotId: snapshotId, sourceStartMs: inMs!, sourceEndMs: outMs! }).catch((cause: unknown) => fail(errorCode(cause)));
        }}>{t(busy ? "preview.creatingClip" : sequenceEditing && timelineOccupied ? "sequence.append" : "preview.createClip")}</button>
      </div>
      {inMs !== null && outMs !== null && !validRange && <p className="manual-preview-hint" role="alert">{t("preview.rangeInvalid")}</p>}
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
    && clip.speed === 1 && clip.volume === 1 && clip.opacity === 1 && supportsManualClipExtensions(clip)
    && [clip.sourceStartMs, clip.sourceEndMs, clip.timelineStartMs, clip.timelineEndMs].every(Number.isSafeInteger)
    && clip.sourceStartMs >= 0 && clip.sourceStartMs < clip.sourceEndMs && clip.sourceEndMs <= source.durationMs!
    && clip.timelineStartMs === 0 && clip.timelineEndMs === clip.sourceEndMs - clip.sourceStartMs;
}
