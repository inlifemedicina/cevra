import type { CaptionCue, GraphicItem, ProjectIR, TimelineClip, TimelineTrack } from "@cevra/project-ir";
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { formatTime, type Translate } from "../ui-model";
import { Icon } from "./Icon";

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
  selectedId: string | null;
  playheadMs: number;
  zoom: number;
  t: Translate;
  onSelect(id: string): void;
  onPlayheadChange(milliseconds: number): void;
  onZoomChange(value: number): void;
  onResizeStart(event: ReactPointerEvent<HTMLButtonElement>): void;
}

type TimelineVisual =
  | { id: string; kind: "clip"; startMs: number; endMs: number; label: string; clip: TimelineClip }
  | { id: string; kind: "caption"; startMs: number; endMs: number; label: string; caption: CaptionCue }
  | { id: string; kind: "graphic"; startMs: number; endMs: number; label: string; graphic: GraphicItem };

export function Timeline({ project, selectedId, playheadMs, zoom, t, onSelect, onPlayheadChange, onZoomChange, onResizeStart }: TimelineProps) {
  const duration = Math.max(60_000, project.timeline.durationMs);
  const tracks = project.timeline.tracks.length > 0 ? project.timeline.tracks : EMPTY_TRACK_SCAFFOLD;
  const playheadPercent = (playheadMs / duration) * 100;
  const ticks = Array.from({ length: 14 }, (_, index) => Math.round((duration / 13) * index));

  function setPlayheadFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onPlayheadChange(Math.round(ratio * duration));
  }

  function movePlayheadFromKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (event.key === "Home") return onPlayheadChange(0);
    if (event.key === "End") return onPlayheadChange(duration);
    onPlayheadChange(Math.min(duration, Math.max(0, playheadMs + (event.key === "ArrowRight" ? 1000 : -1000))));
  }

  return (
    <section className="timeline" aria-label={t("timeline.title")}>
      <button type="button" className="timeline-resizer" onPointerDown={onResizeStart} aria-label={t("timeline.resize")} title={t("timeline.resize")}><span /></button>
      <div className="timeline-toolbar">
        <div><h2>{t("timeline.title")}</h2><span className="selected-item" data-testid="selected-item">{t("timeline.clipSelected", { name: selectedLabel(project, selectedId) })}</span></div>
        <div className="timeline-zoom"><label htmlFor="timeline-zoom">{t("timeline.zoom")}</label><span>−</span><input id="timeline-zoom" type="range" min="70" max="180" value={zoom} onChange={(event) => onZoomChange(Number(event.target.value))} /><span>＋</span><button type="button" onClick={() => onZoomChange(100)}><Icon name="fit" size={14} />{t("timeline.fit")}</button></div>
      </div>
      <div className="timeline-table">
        <div className="timeline-corner"><span className="timecode">{formatTime(playheadMs)}</span></div>
        <div
          className="timeline-ruler"
          role="slider"
          tabIndex={0}
          aria-label={t("timeline.ruler")}
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={playheadMs}
          aria-valuetext={t("timeline.playhead", { time: formatTime(playheadMs) })}
          onPointerDown={setPlayheadFromPointer}
          onKeyDown={movePlayheadFromKeyboard}
        >
          <div className="timeline-width" style={{ width: `${zoom}%` }}>
            {ticks.map((tick) => <span key={tick} style={{ left: `${(tick / duration) * 100}%` }}><i />{formatTime(tick).slice(0, 5)}</span>)}
          </div>
        </div>
        {tracks.map((track) => {
          const label = t(trackKeys[track.id as keyof typeof trackKeys]);
          return <TimelineRow key={track.id} track={track} label={label} visuals={visualsForTrack(project, track)} duration={duration} zoom={zoom} playheadPercent={playheadPercent} selectedId={selectedId} t={t} onSelect={onSelect} />;
        })}
      </div>
    </section>
  );
}

function TimelineRow({ track, label, visuals, duration, zoom, playheadPercent, selectedId, t, onSelect }: { track: TimelineTrack; label: string; visuals: TimelineVisual[]; duration: number; zoom: number; playheadPercent: number; selectedId: string | null; t: Translate; onSelect(id: string): void }) {
  const isAudio = track.kind === "audio";
  return <div className="timeline-row" data-testid={`timeline-track-${track.id}`}>
    <div className="track-head"><strong>{track.name}</strong><span>{label.replace(/^.. — /, "")}</span><div className="track-actions"><button type="button" disabled aria-label={t("timeline.lockTrack", { track: label })} title={t("inspector.demoControl")}><Icon name="lock" size={12} /></button><button type="button" disabled aria-label={t("timeline.showTrack", { track: label })} title={t("inspector.demoControl")}><Icon name="eye" size={12} /></button>{isAudio && <button type="button" disabled aria-label={t("timeline.muteTrack", { track: label })} title={t("inspector.demoControl")}><Icon name="mute" size={12} /></button>}</div></div>
    <div className={`track-lane track-${track.kind}`}>
      <div className="timeline-width" style={{ width: `${zoom}%` }}>
        {visuals.map((visual) => <button key={visual.id} type="button" className={`timeline-item item-${visual.kind}${selectedId === visual.id ? " selected" : ""}`} style={{ left: `${(visual.startMs / duration) * 100}%`, width: `${Math.max(1.4, ((visual.endMs - visual.startMs) / duration) * 100)}%` }} onClick={() => onSelect(visual.id)} title={visual.label} aria-pressed={selectedId === visual.id}>{isAudio && <span className="item-wave" aria-hidden="true">{waveformBars.map((height, index) => <i key={index} style={{ height }} />)}</span>}<span>{visual.label}</span></button>)}
        <i className="playhead-line" style={{ left: `${playheadPercent}%` }} aria-hidden="true"><b /></i>
      </div>
    </div>
  </div>;
}

function visualsForTrack(project: Readonly<ProjectIR>, track: TimelineTrack): TimelineVisual[] {
  const clips: TimelineVisual[] = project.timeline.clips.filter((clip) => clip.trackId === track.id).map((clip) => ({ id: clip.id, kind: "clip", startMs: clip.timelineStartMs, endMs: clip.timelineEndMs, label: project.sources.find((source) => source.id === clip.sourceId)?.displayName ?? clip.id, clip }));
  if (track.id === "track-v2") return project.captions.map((caption) => ({ id: caption.id, kind: "caption", startMs: caption.startMs, endMs: caption.endMs, label: caption.text, caption }));
  if (track.id === "track-v4") return project.graphics.map((graphic) => ({ id: graphic.id, kind: "graphic", startMs: graphic.startMs, endMs: graphic.endMs, label: graphic.text ?? graphic.styleToken ?? graphic.id, graphic }));
  return clips;
}

function selectedLabel(project: Readonly<ProjectIR>, selectedId: string | null): string {
  if (!selectedId) return "—";
  const source = project.sources.find((item) => item.id === selectedId);
  const clip = project.timeline.clips.find((item) => item.id === selectedId);
  const caption = project.captions.find((item) => item.id === selectedId);
  const graphic = project.graphics.find((item) => item.id === selectedId);
  const clipSourceName = clip ? project.sources.find((item) => item.id === clip.sourceId)?.displayName : undefined;
  return source?.displayName ?? caption?.text ?? graphic?.text ?? clipSourceName ?? selectedId;
}
