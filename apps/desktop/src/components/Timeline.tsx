import type { CaptionCue, GraphicItem, ProjectIR, TimelineClip, TimelineTrack } from "@cevra/project-ir";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { TrimManualVideoClipRequest } from "@cevra/application";
import { supportsManualClipPreview } from "./ManualVideoPreview";
import { formatMilliseconds, formatTime, type Translate } from "../ui-model";
import { Icon } from "./Icon";

import type { SourcePresentation } from "../source-presentation";

const trackKeys = {
  "track-v4": "timeline.track.v4",
  "track-v3": "timeline.track.v3",
  "track-v2": "timeline.track.v2",
  "track-v1": "timeline.track.v1",
  "track-a3": "timeline.track.a3",
  "track-a2": "timeline.track.a2",
  "track-a1": "timeline.track.a1"
} as const;

const waveformBars = [4, 12, 7, 16, 9, 5, 14, 8, 17, 11, 6, 15, 9, 13, 5, 16, 8, 12, 6, 14, 10, 17, 7, 12, 5, 15, 9, 13, 6, 16, 8, 11, 5, 14, 9, 17];
const EMPTY_TRACK_SCAFFOLD: readonly TimelineTrack[] = [
  { id: "track-v4", kind: "overlay", name: "V4", locked: false, hidden: false, muted: false },
  { id: "track-v3", kind: "video", name: "V3", locked: false, hidden: false, muted: false },
  { id: "track-v2", kind: "caption", name: "V2", locked: false, hidden: false, muted: false },
  { id: "track-v1", kind: "video", name: "V1", locked: false, hidden: false, muted: false },
  { id: "track-a3", kind: "audio", name: "A3", locked: false, hidden: false, muted: false },
  { id: "track-a2", kind: "audio", name: "A2", locked: false, hidden: false, muted: false },
  { id: "track-a1", kind: "audio", name: "A1", locked: false, hidden: false, muted: false }
];

interface TimelineProps {
  project: Readonly<ProjectIR>;
  presentations: ReadonlyMap<string, SourcePresentation>;
  selectedId: string | null;
  playheadMs: number;
  zoom: number;
  t: Translate;
  trimAvailable?: boolean;
  trimBusy?: boolean;
  onTrim?(request: TrimManualVideoClipRequest): Promise<void>;
  onSelect(id: string): void;
  onPlayheadChange(milliseconds: number): void;
  onZoomChange(value: number): void;
  onResizeStart(event: ReactPointerEvent<HTMLButtonElement>): void;
}

type TimelineVisual =
  | { id: string; kind: "clip"; startMs: number; endMs: number; label: string; fileName?: string; clip: TimelineClip }
  | { id: string; kind: "caption"; startMs: number; endMs: number; label: string; caption: CaptionCue }
  | { id: string; kind: "graphic"; startMs: number; endMs: number; label: string; graphic: GraphicItem };

export function Timeline({ project, presentations, selectedId, playheadMs, zoom, t, onSelect, onPlayheadChange, onZoomChange, onResizeStart, trimAvailable, trimBusy, onTrim }: TimelineProps) {
  const canonicalDuration = project.timeline.durationMs;
  const trimClip = trimAvailable && onTrim ? project.timeline.clips.find((clip) => supportsManualClipPreview(project, clip)
    && !project.timeline.tracks.find((track) => track.id === clip.trackId)?.locked) : undefined;
  const sourceDuration = trimClip ? project.sources.find((source) => source.id === trimClip.sourceId)!.durationMs! : 0;
  const geometryDuration = trimClip ? Math.max(1000, sourceDuration) : Math.max(60_000, canonicalDuration);
  const tracks = project.timeline.tracks.length > 0 ? project.timeline.tracks : EMPTY_TRACK_SCAFFOLD;
  const playheadPercent = canonicalDuration === 0 ? 0 : (playheadMs / geometryDuration) * 100;
  const tickIntervals = trimClip ? Math.min(13, Math.max(1, Math.floor(geometryDuration / 1000))) : 13;
  const ticks = canonicalDuration === 0 ? [0] : Array.from({ length: tickIntervals + 1 }, (_, index) => Math.round((geometryDuration / tickIntervals) * index));

  function setPlayheadFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.querySelector<HTMLElement>(".timeline-width")!.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onPlayheadChange(Math.min(canonicalDuration, Math.round(ratio * geometryDuration)));
  }

  function movePlayheadFromKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (event.key === "Home") return onPlayheadChange(0);
    if (event.key === "End") return onPlayheadChange(canonicalDuration);
    onPlayheadChange(Math.min(canonicalDuration, Math.max(0, playheadMs + (event.key === "ArrowRight" ? 1000 : -1000))));
  }

  return (
    <section className="timeline" aria-label={t("timeline.title")}>
      <button type="button" className="timeline-resizer" onPointerDown={onResizeStart} aria-label={t("timeline.resize")} title={t("timeline.resize")}><span /></button>
      <div className="timeline-toolbar">
        <div><h2>{t("timeline.title")}</h2><span className="selected-item" data-testid="selected-item">{t("timeline.clipSelected", { name: selectedLabel(project, presentations, selectedId) })}</span></div>
        {trimClip && selectedId === trimClip.id && <span className="timeline-trim-hint">{t("timeline.trimHint")}</span>}
        <div className="timeline-zoom"><label htmlFor="timeline-zoom">{t("timeline.zoom")}</label><span>−</span><input id="timeline-zoom" type="range" min="70" max="180" value={zoom} onChange={(event) => onZoomChange(Number(event.target.value))} /><span>＋</span><button type="button" onClick={() => onZoomChange(100)}><Icon name="fit" size={14} />{t("timeline.fit")}</button></div>
      </div>
      <div className="timeline-table">
        <div className="timeline-corner"><span className="timecode">{trimClip ? formatMilliseconds(playheadMs) : formatTime(playheadMs)}</span></div>
        <div
          className="timeline-ruler"
          role="slider"
          tabIndex={0}
          aria-label={t("timeline.ruler")}
          aria-valuemin={0}
          aria-valuemax={canonicalDuration}
          aria-valuenow={playheadMs}
          aria-valuetext={t("timeline.playhead", { time: trimClip ? formatMilliseconds(playheadMs) : formatTime(playheadMs) })}
          onPointerDown={setPlayheadFromPointer}
          onKeyDown={movePlayheadFromKeyboard}
        >
          <div className="timeline-width" style={{ width: `${zoom}%` }}>
            {ticks.map((tick) => <span key={tick} style={{ left: `${(tick / geometryDuration) * 100}%` }}><i />{formatTime(tick).slice(0, 5)}</span>)}
          </div>
        </div>
        {tracks.map((track) => {
          const labelKey = trackKeys[track.id as keyof typeof trackKeys];
          const label = labelKey ? t(labelKey) : track.name;
          return <TimelineRow key={track.id} track={track} label={label} visuals={visualsForTrack(project, presentations, track)} duration={geometryDuration} zoom={zoom} playheadPercent={playheadPercent} selectedId={selectedId} t={t} onSelect={onSelect} trimClipId={trimClip?.id} sourceDuration={sourceDuration} snapshotId={project.history.headSnapshotId!} trimBusy={trimBusy} onTrim={onTrim} />;
        })}
      </div>
    </section>
  );
}

function TimelineRow({ track, label, visuals, duration, zoom, playheadPercent, selectedId, t, onSelect, trimClipId, sourceDuration, snapshotId, trimBusy, onTrim }: { trimClipId?: string; sourceDuration: number; snapshotId: string; trimBusy?: boolean; onTrim?: TimelineProps["onTrim"]; track: TimelineTrack; label: string; visuals: TimelineVisual[]; duration: number; zoom: number; playheadPercent: number; selectedId: string | null; t: Translate; onSelect(id: string): void }) {
  const isAudio = track.kind === "audio";
  return <div className="timeline-row" data-testid={`timeline-track-${track.id}`}>
    <div className="track-head"><strong>{track.name}</strong><span>{label.replace(/^.. — /, "")}</span><div className="track-actions"><button type="button" disabled aria-label={t("timeline.lockTrack", { track: label })} title={t("inspector.demoControl")}><Icon name="lock" size={12} /></button><button type="button" disabled aria-label={t("timeline.showTrack", { track: label })} title={t("inspector.demoControl")}><Icon name="eye" size={12} /></button>{isAudio && <button type="button" disabled aria-label={t("timeline.muteTrack", { track: label })} title={t("inspector.demoControl")}><Icon name="mute" size={12} /></button>}</div></div>
    <div className={`track-lane track-${track.kind}`}>
      <div className="timeline-width" style={{ width: `${zoom}%` }}>
        {visuals.map((visual) => visual.kind === "clip" && visual.id === trimClipId && selectedId === visual.id && onTrim
          ? <TrimTimelineClip key={visual.id} clip={visual.clip} label={visual.label} fileName={visual.fileName} duration={duration} sourceDuration={sourceDuration} snapshotId={snapshotId} zoom={zoom} busy={Boolean(trimBusy)} t={t} onSelect={onSelect} onTrim={onTrim} />
          : <button key={visual.id} type="button" className={`timeline-item item-${visual.kind}${selectedId === visual.id ? " selected" : ""}`} style={{ left: `${(visual.startMs / duration) * 100}%`, width: `${Math.max(1.4, ((visual.endMs - visual.startMs) / duration) * 100)}%` }} onClick={() => onSelect(visual.id)} title={visual.kind === "clip" ? visual.fileName : visual.label} aria-label={visual.kind === "clip" && visual.fileName ? `${visual.label} · ${visual.fileName}` : visual.label} aria-pressed={selectedId === visual.id}>{isAudio && <span className="item-wave" aria-hidden="true">{waveformBars.map((height, index) => <i key={index} style={{ height }} />)}</span>}<span>{visual.label}</span></button>)}
        <i className="playhead-line" style={{ left: `${playheadPercent}%` }} aria-hidden="true"><b /></i>
      </div>
    </div>
  </div>;
}

type TrimRange = { sourceStartMs: number; sourceEndMs: number };
type TrimEdge = "in" | "out";

function TrimTimelineClip({ clip, label, fileName, duration, sourceDuration, snapshotId, zoom, busy, t, onSelect, onTrim }: {
  clip: TimelineClip; label: string; fileName?: string; duration: number; sourceDuration: number; snapshotId: string; zoom: number; busy: boolean;
  t: Translate; onSelect(id: string): void; onTrim: NonNullable<TimelineProps["onTrim"]>;
}) {
  const [draft, setDraft] = useState<TrimRange | null>(null);
  const [pending, setPending] = useState(false);
  const gesture = useRef<{ edge: TrimEdge; pointerId: number; startX: number; msPerPixel: number; outRightPercent: number; target: HTMLButtonElement } | null>(null);
  const range = draft ?? clip;

  function cancel() {
    const active = gesture.current;
    gesture.current = null;
    setDraft(null);
    if (active?.target.hasPointerCapture?.(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
  }
  // Keep the focused edge mounted across our own confirmation. Canonical/zoom
  // changes still discard captured pointer geometry before another event.
  useLayoutEffect(() => { cancel(); }, [busy, snapshotId, zoom]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("keydown", escape); window.removeEventListener("blur", cancel); cancel(); };
  }, []);

  function adjust(edge: TrimEdge, delta: number): TrimRange {
    return edge === "in" ? { sourceStartMs: Math.min(clip.sourceEndMs - 1, Math.max(0, clip.sourceStartMs + delta)), sourceEndMs: clip.sourceEndMs }
      : { sourceStartMs: clip.sourceStartMs, sourceEndMs: Math.min(sourceDuration, Math.max(clip.sourceStartMs + 1, clip.sourceEndMs + delta)) };
  }
  function rangeAt(event: ReactPointerEvent<HTMLButtonElement>): TrimRange | null {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId || !Number.isFinite(event.clientX)) return null;
    return adjust(active.edge, Math.round((event.clientX - active.startX) * active.msPerPixel));
  }
  function start(event: ReactPointerEvent<HTMLButtonElement>, edge: TrimEdge) {
    if (busy || pending || gesture.current || event.button !== 0 || !Number.isFinite(event.clientX)) return;
    const contentBounds = event.currentTarget.closest(".timeline-width")!.getBoundingClientRect();
    const width = contentBounds.width;
    if (width <= 0) return;
    const clipBounds = event.currentTarget.closest(".timeline-trim-clip")!.getBoundingClientRect();
    const outRightPercent = (contentBounds.right - clipBounds.right) / width * 100;
    if (!Number.isFinite(outRightPercent)) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true });
    gesture.current = { edge, pointerId: event.pointerId, startX: event.clientX, msPerPixel: duration / width, outRightPercent, target: event.currentTarget };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraft({ sourceStartMs: clip.sourceStartMs, sourceEndMs: clip.sourceEndMs });
  }
  async function commit(next: TrimRange) {
    if (busy || pending || next.sourceStartMs === clip.sourceStartMs && next.sourceEndMs === clip.sourceEndMs) return;
    setPending(true);
    try { await onTrim({ clipId: clip.id, expectedSnapshotId: snapshotId, ...next }); }
    finally { setPending(false); }
  }
  function finish(event: ReactPointerEvent<HTMLButtonElement>) {
    const next = rangeAt(event);
    if (!next) return;
    cancel();
    void commit(next);
  }
  function key(event: ReactKeyboardEvent<HTMLButtonElement>, edge: TrimEdge) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || busy || pending || gesture.current) return;
    event.preventDefault(); event.stopPropagation();
    if (event.repeat) return;
    const current = edge === "in" ? clip.sourceStartMs : clip.sourceEndMs;
    const delta = event.key === "Home" ? -current : event.key === "End" ? sourceDuration - current : (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 10 : 100);
    void commit(adjust(edge, delta));
  }
  // During IN drag anchor the presentation at the unchanged OUT. Canonical
  // placement stays at zero; only release confirms and reanchors the new range.
  // Right anchoring also preserves OUT when the minimum visual width applies.
  const draggingIn = draft !== null && gesture.current?.edge === "in";
  return <div className="timeline-trim-clip" style={{
    left: draggingIn ? undefined : `${clip.timelineStartMs / duration * 100}%`,
    right: draggingIn ? `${gesture.current!.outRightPercent}%` : undefined,
    width: `${(range.sourceEndMs - range.sourceStartMs) / duration * 100}%`
  }}>
    <button type="button" className="timeline-item item-clip selected" aria-pressed="true" aria-label={fileName ? `${label} · ${fileName}` : label} title={fileName} onClick={() => onSelect(clip.id)}><span>{label}</span></button>
    {(["in", "out"] as const).map((edge) => <button key={edge} type="button" role="slider" className={`timeline-trim-handle trim-${edge}`} aria-disabled={busy || pending} tabIndex={busy || pending ? -1 : 0}
      aria-label={t(edge === "in" ? "timeline.trimIn" : "timeline.trimOut")} aria-orientation="horizontal"
      aria-valuemin={edge === "in" ? 0 : range.sourceStartMs + 1} aria-valuemax={edge === "in" ? range.sourceEndMs - 1 : sourceDuration}
      aria-valuenow={edge === "in" ? range.sourceStartMs : range.sourceEndMs} aria-valuetext={`${(edge === "in" ? range.sourceStartMs : range.sourceEndMs) / 1000} s`}
      title={t("timeline.trimHint")} onPointerDown={(event) => start(event, edge)} onPointerMove={(event) => { const next = rangeAt(event); if (next && !busy) setDraft(next); }}
      onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={(event) => key(event, edge)}><span aria-hidden="true" /></button>)}
    <output className="timeline-trim-range" aria-label={t("timeline.trimRange")}>IN {(range.sourceStartMs / 1000).toFixed(3)} · OUT {(range.sourceEndMs / 1000).toFixed(3)}</output>
  </div>;
}

function visualsForTrack(project: Readonly<ProjectIR>, presentations: ReadonlyMap<string, SourcePresentation>, track: TimelineTrack): TimelineVisual[] {
  const clips: TimelineVisual[] = project.timeline.clips.filter((clip) => clip.trackId === track.id).map((clip) => ({ id: clip.id, kind: "clip", startMs: clip.timelineStartMs, endMs: clip.timelineEndMs, label: presentations.get(clip.sourceId)?.label ?? clip.id, fileName: presentations.get(clip.sourceId)?.fileName, clip }));
  if (track.id === "track-v2") return project.captions.map((caption) => ({ id: caption.id, kind: "caption", startMs: caption.startMs, endMs: caption.endMs, label: caption.text, caption }));
  if (track.id === "track-v4") return project.graphics.map((graphic) => ({ id: graphic.id, kind: "graphic", startMs: graphic.startMs, endMs: graphic.endMs, label: graphic.text ?? graphic.styleToken ?? graphic.id, graphic }));
  return clips;
}

function selectedLabel(project: Readonly<ProjectIR>, presentations: ReadonlyMap<string, SourcePresentation>, selectedId: string | null): string {
  if (!selectedId) return "—";
  const source = project.sources.find((item) => item.id === selectedId);
  const clip = project.timeline.clips.find((item) => item.id === selectedId);
  const caption = project.captions.find((item) => item.id === selectedId);
  const graphic = project.graphics.find((item) => item.id === selectedId);
  const clipSourceName = clip ? presentations.get(clip.sourceId)?.label : undefined;
  return (source && presentations.get(source.id)?.label) ?? caption?.text ?? graphic?.text ?? clipSourceName ?? selectedId;
}
