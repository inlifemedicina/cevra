import type { CreateManualVideoClipRequest, LocalVideoPreview } from "@cevra/application";
import type { ProjectIR, SourceAsset, TimelineClip } from "@cevra/project-ir";
import { useEffect, useRef, useState } from "react";
import type { DesktopBackend } from "../backend/desktop-backend";
import { formatMilliseconds, type Translate } from "../ui-model";

interface Props {
  backend: DesktopBackend;
  source?: SourceAsset;
  sourceLabel?: string;
  snapshotId: string;
  clip?: TimelineClip;
  unsupportedClip?: boolean;
  timelineOccupied: boolean;
  busy: boolean;
  seek: { sequence: number; timelineMs: number };
  t: Translate;
  onPlayheadChange(value: number): void;
  onCreate(request: CreateManualVideoClipRequest): Promise<void>;
}

/** Original bytes or a bounded, ephemeral derivative of the canonical clip. */
export function ManualVideoPreview({ backend, source, sourceLabel, snapshotId, clip, unsupportedClip, timelineOccupied, busy, seek, t, onPlayheadChange, onCreate }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [preview, setPreview] = useState<LocalVideoPreview | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [inMs, setInMs] = useState<number | null>(null);
  const [outMs, setOutMs] = useState<number | null>(null);
  const startMs = clip?.sourceStartMs ?? 0;
  const endMs = clip?.sourceEndMs ?? source?.durationMs ?? 0;
  const mediaEndMs = preview?.durationMs ?? 0;

  useEffect(() => {
    let active = true;
    let settled = false;
    let objectUrl: string | null = null;
    const operationId = `video-preview-${crypto.randomUUID()}`;
    setPreview(null); setUrl(null); setReady(false); setError(null); setPlaying(false); setSeeking(false); setInMs(null); setOutMs(null); setCurrentMs(0);
    if (source?.kind === "video") {
      void backend.previewLocalVideo({ sourceId: source.id, expectedSnapshotId: snapshotId, operationId, ...(clip ? { clipId: clip.id } : {}) }).then((result) => {
        settled = true;
        if (!active) return;
        if (result.sourceId !== source.id || result.snapshotId !== snapshotId || !Number.isSafeInteger(result.durationMs) || result.durationMs <= 0
          || (clip ? result.clip?.id !== clip.id || result.clip.sourceStartMs !== clip.sourceStartMs || result.clip.sourceEndMs !== clip.sourceEndMs
            || !Number.isFinite(result.clip.firstFrameMs) || result.clip.firstFrameMs < clip.sourceStartMs || !Number.isFinite(result.clip.lastFrameMs) || result.clip.lastFrameMs < result.clip.firstFrameMs || result.clip.lastFrameMs >= clip.sourceEndMs
            || !Number.isSafeInteger(result.clip.frameCount) || result.clip.frameCount < 1 : result.clip !== undefined || (result.proxy ? result.proxy.profile !== "take-v1" || result.proxy.sourceDurationMs !== source.durationMs : result.durationMs !== source.durationMs))
          || !["video/mp4", "video/quicktime", "video/webm"].includes(result.mimeType) || result.base64.length > 11_184_812) throw { code: "MANUAL_VIDEO_STALE" };
        const bytes = Uint8Array.from(atob(result.base64), (character) => character.charCodeAt(0));
        if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw { code: "MANUAL_VIDEO_TOO_LARGE" };
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: result.mimeType }));
        setPreview(result); setUrl(objectUrl);
      }).catch((cause: unknown) => { settled = true; if (active) setError(errorCode(cause)); });
    }
    const video = videoRef.current;
    return () => {
      active = false;
      if (operationId && !settled) void backend.cancelOperation(operationId).catch(() => undefined);
      // Release decoder before revoking; never retain an old source/snapshot URL.
      if (video && objectUrl) { video.pause(); video.removeAttribute("src"); video.load(); }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [backend, source?.id, snapshotId, clip?.id, clip?.sourceStartMs, clip?.sourceEndMs]);

  useEffect(() => {
    if (busy && url) videoRef.current?.pause();
  }, [busy, url]);

  useEffect(() => {
    if (!ready || !clip || seek.sequence === 0 || !videoRef.current) return;
    videoRef.current.pause();
    const target = Math.min(mediaEndMs, Math.max(0, seek.timelineMs - clip.timelineStartMs)) / 1000;
    if (Math.abs(videoRef.current.currentTime - target) < 0.001) { updateClock(); return; }
    setSeeking(true);
    videoRef.current.currentTime = target;
  }, [ready, seek.sequence]);

  useEffect(() => {
    if (!playing || !ready || !clip) return;
    let frame: number;
    const readClock = () => { updateClock(); frame = requestAnimationFrame(readClock); };
    frame = requestAnimationFrame(readClock);
    return () => cancelAnimationFrame(frame);
  }, [playing, ready, clip?.id]);

  function fail(code: string) {
    const video = videoRef.current;
    video?.pause();
    if (video) { video.removeAttribute("src"); video.load(); }
    if (url) URL.revokeObjectURL(url);
    setUrl(null); setReady(false); setPlaying(false); setError(code);
  }

  function metadataReady() {
    const video = videoRef.current;
    if (!video || !preview || !Number.isFinite(video.duration) || video.duration <= 0 || Math.abs(video.duration * 1000 - preview.durationMs) > 100) {
      fail("MANUAL_VIDEO_UNSUPPORTED"); return;
    }
    setReady(true);
    setCurrentMs(startMs);
    video.currentTime = 0;
  }

  function updateClock() {
    const video = videoRef.current;
    if (!video || !ready) return;
    const milliseconds = Math.min(endMs, Math.max(startMs, startMs + Math.round(video.currentTime * 1000)));
    if (clip && video.currentTime * 1000 >= mediaEndMs) {
      video.pause();
      if (video.currentTime * 1000 > mediaEndMs) video.currentTime = mediaEndMs / 1000;
    }
    setCurrentMs(milliseconds);
    if (clip) onPlayheadChange(clip.timelineStartMs + milliseconds - startMs);
  }

  function mark(which: "in" | "out") {
    const video = videoRef.current;
    if (!video || !ready || seeking || video.seeking || busy || timelineOccupied) return;
    const value = Math.min(source!.durationMs!, Math.max(0, Math.round(video.currentTime * 1000)));
    if (which === "in") setInMs(value); else setOutMs(value);
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video || !ready || seeking || busy) return;
    if (!video.paused) { video.pause(); return; }
    if (video.currentTime * 1000 >= mediaEndMs || video.currentTime < 0) video.currentTime = 0;
    try { await video.play(); } catch { fail("MANUAL_VIDEO_UNSUPPORTED"); }
  }

  const validRange = inMs !== null && outMs !== null && inMs < outMs && outMs <= (source?.durationMs ?? 0);
  const errorKey = error === "MANUAL_VIDEO_TOO_LARGE" ? "preview.localTooLarge" : error === "MANUAL_VIDEO_STALE" || error === "MANUAL_VIDEO_SOURCE_CHANGED" ? "preview.localChanged" : "preview.localUnavailable";
  return <section className="manual-video-preview" aria-label={t("preview.localVideo")}>
    <div className="manual-preview-heading"><strong>{sourceLabel ?? t("preview.localVideo")}</strong><span>{t(clip ? "preview.clipMode" : "preview.originalMode")}</span></div>
    <div className="manual-video-stage">
      <video ref={videoRef} src={url ?? undefined} preload="metadata" playsInline onLoadedMetadata={metadataReady} onError={() => { if (url) fail("MANUAL_VIDEO_UNSUPPORTED"); }}
        onSeeking={() => setSeeking(true)} onSeeked={() => { setSeeking(false); updateClock(); }} onTimeUpdate={updateClock} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); updateClock(); }} />
      {!ready && <p role="status">{error ? t(errorKey) : source?.kind === "video" ? t("preview.localLoading") : t("preview.localEmpty")}</p>}
    </div>
    <div className="manual-preview-controls">
      <button type="button" className="secondary-button" disabled={!ready || seeking || busy} onClick={() => void togglePlayback()}>{t(playing ? "preview.pauseLocal" : "preview.playLocal")}</button>
      <input type="range" aria-label={t(clip ? "preview.clipSeek" : "preview.sourceSeek")} min={startMs} max={Math.max(startMs + 1, endMs)} step="1" value={Math.min(endMs, Math.max(startMs, currentMs))} disabled={!ready || busy} onChange={(event) => {
        const video = videoRef.current; if (!video) return;
        setSeeking(true); video.currentTime = Math.min(mediaEndMs, Number(event.target.value) - startMs) / 1000;
      }} />
      <time data-testid="preview-timecode">{t("preview.sourcePosition", { time: formatMilliseconds(currentMs) })} / {formatMilliseconds(endMs)}</time>
    </div>
    {preview?.proxy && <p className="manual-preview-hint">{t("preview.proxyHint")}</p>}
    {clip && <div className="manual-preview-timing">
      <time data-testid="preview-clip-timecode">{t("preview.clipElapsed", { time: formatMilliseconds(currentMs - startMs), duration: formatMilliseconds(endMs - startMs) })}</time>
      <output>{t("preview.clipBounds", { start: formatMilliseconds(startMs), end: formatMilliseconds(endMs) })}</output>
    </div>}
    {timelineOccupied ? <p className="manual-preview-hint" role="status">{t(unsupportedClip ? "preview.unsupportedClip" : clip ? "preview.boundedClip" : "preview.singleClip")}</p> : <>
      <div className="manual-preview-marks">
        <button type="button" className="secondary-button" disabled={!ready || seeking || busy} onClick={() => mark("in")}>{t("preview.markIn")}</button><output>IN {inMs === null ? "—" : formatMilliseconds(inMs)}</output>
        <button type="button" className="secondary-button" disabled={!ready || seeking || busy} onClick={() => mark("out")}>{t("preview.markOut")}</button><output>OUT {outMs === null ? "—" : formatMilliseconds(outMs)}</output>
        <button type="button" className="manual-create-clip-button" disabled={!ready || seeking || busy || !validRange} onClick={() => {
          videoRef.current?.pause();
          if (source && validRange) void onCreate({ sourceId: source.id, expectedSnapshotId: snapshotId, sourceStartMs: inMs!, sourceEndMs: outMs! }).catch((cause: unknown) => fail(errorCode(cause)));
        }}>{t(busy ? "preview.creatingClip" : "preview.createClip")}</button>
      </div>
      <p className="manual-preview-hint">{inMs !== null && outMs !== null && !validRange ? t("preview.rangeInvalid") : t("preview.localHint")}</p>
    </>}
  </section>;
}

function errorCode(cause: unknown): string {
  return typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string" ? cause.code : "MANUAL_VIDEO_UNAVAILABLE";
}

/** This first slice must never imply a composed preview of older complex edits. */
export function supportsManualClipPreview(project: Readonly<ProjectIR>, clip: TimelineClip): boolean {
  const source = project.sources.find((item) => item.id === clip.sourceId);
  const track = project.timeline.tracks.find((item) => item.id === clip.trackId);
  return project.timeline.clips.length === 1 && !project.captions.length && !project.graphics.length
    && source?.kind === "video" && Number.isSafeInteger(source.durationMs) && source.durationMs! > 0
    && track?.kind === "video" && !track.hidden && !track.muted
    && clip.speed === 1 && clip.volume === 1 && clip.opacity === 1 && !clip.extensions
    && [clip.sourceStartMs, clip.sourceEndMs, clip.timelineStartMs, clip.timelineEndMs].every(Number.isSafeInteger)
    && clip.sourceStartMs >= 0 && clip.sourceStartMs < clip.sourceEndMs && clip.sourceEndMs <= source.durationMs!
    && clip.timelineStartMs === 0 && clip.timelineEndMs === clip.sourceEndMs - clip.sourceStartMs;
}
