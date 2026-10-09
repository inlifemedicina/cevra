import type { CaptionCue, GraphicItem, ProjectIR, TimelineClip, TimelineTrack } from "@cevra/project-ir";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type HTMLAttributes } from "react";
import type { ManualVideoSequenceEdit, TrimManualVideoClipRequest } from "@cevra/application";
import { ManualSequenceControls, type ManualRangeDraftController } from "./ManualSequenceControls";
import type { RefObject } from "react";
import type { RangeActionGate } from "../range-activation-guard";
import { supportsManualClipPreview } from "./ManualVideoPreview";
import { formatMilliseconds, formatTime, type Translate } from "../ui-model";
import { Icon } from "./Icon";

import type { SourcePresentation } from "../source-presentation";
import type { DesktopBackend } from "../backend/desktop-backend";
import { maximumSourceFrame, floorMsToFrames, framesToMilliseconds, nearestMsToFrames, formatFrames } from "../frame-timing";
import { gestureEscape, reorderedTimeline, timelineSelection, timelineShortcutBlocked, type TimelineSeekPhase } from "../timeline-interactions";
import { shortcutAction, activateShortcut, shortcutProps } from "../keyboard-shortcuts";

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
  backend?: DesktopBackend;
  project: Readonly<ProjectIR>;
  presentations: ReadonlyMap<string, SourcePresentation>;
  selectedId: string | null;
  selectedClipIds?: readonly string[];
  onSelectClips?(ids: string[], primary: string | null): void;
  playheadMs: number;
  zoom: number;
  t: Translate;
  trimAvailable?: boolean;
  trimBusy?: boolean;
  onTrim?(request: TrimManualVideoClipRequest): Promise<void>;
  sequenceClips?: readonly TimelineClip[];
  onSequenceEdit?(request: ManualVideoSequenceEdit): Promise<void>;
  onCommitRange?(request: ManualVideoSequenceEdit): Promise<void>;
  rangeDraft?: RefObject<ManualRangeDraftController | null>;
  onRangeAction?: RangeActionGate;
  onSelect(id: string): void;
  onPlayheadChange(milliseconds: number, phase?: TimelineSeekPhase): void;
  onZoomChange(value: number): void;
  onResizeStart(event: ReactPointerEvent<HTMLButtonElement>): void;
  onResizeCancel?(event: ReactPointerEvent<HTMLButtonElement>): void;
  onResizeKey?(event: ReactKeyboardEvent<HTMLButtonElement>): void;
  height?: number;
}

type TimelineVisual =
  | { id: string; kind: "clip"; startMs: number; endMs: number; label: string; fileName?: string; clip: TimelineClip }
  | { id: string; kind: "caption"; startMs: number; endMs: number; label: string; caption: CaptionCue }
  | { id: string; kind: "graphic"; startMs: number; endMs: number; label: string; graphic: GraphicItem };

export function Timeline({ project, presentations, selectedId, selectedClipIds, onSelectClips, playheadMs, zoom, t, onSelect, onPlayheadChange, onZoomChange, onResizeStart, onResizeCancel, onResizeKey, height = 292, trimAvailable, trimBusy, onTrim, sequenceClips, onSequenceEdit, onCommitRange, rangeDraft, onRangeAction, backend }: TimelineProps) {
  const selectedIds = selectedClipIds ?? (selectedId && project.timeline.clips.some(clip => clip.id === selectedId) ? [selectedId] : []);
  const orderedIds = sequenceClips?.map(clip => clip.id) ?? [];
  const anchor = useRef<string | null>(selectedId);
  const dragging = useRef<{ ids: string[]; snapshot: string } | null>(null);
  const scrub = useRef<{ id: number; originalMs: number; element: HTMLDivElement } | null>(null);
  const seekCallback = useRef(onPlayheadChange);
  seekCallback.current = onPlayheadChange;
  const editPending = useRef(false);
  const [pending, setPending] = useState(false);
  const editingDisabled = Boolean(trimBusy || pending);
  const grid = project.timeline.timingPolicy === "cfr30";
  const canonicalDuration = project.timeline.durationMs;
  const trimClip = trimAvailable && onTrim ? sequenceClips?.find(clip => clip.id === selectedId) ?? project.timeline.clips.find((clip) => supportsManualClipPreview(project, clip)
    && !project.timeline.tracks.find((track) => track.id === clip.trackId)?.locked) : undefined;
  const sourceDuration = trimClip ? project.sources.find((source) => source.id === trimClip.sourceId)!.durationMs! : 0;
  const geometryLimit = grid ? framesToMilliseconds(maximumSourceFrame(Number.MAX_SAFE_INTEGER)) : Number.MAX_SAFE_INTEGER;
  const sourceGeometry = grid ? framesToMilliseconds(maximumSourceFrame(sourceDuration)) : sourceDuration;
  // Selection never changes the sequence viewport scale. Source handles retain
  // their source bounds, independently of this canonical timeline geometry.
  const geometryDuration = sequenceClips ? Math.max(1000, canonicalDuration)
    : trimClip ? Math.max(1000, canonicalDuration, Math.min(geometryLimit, trimClip.timelineStartMs + sourceGeometry)) : Math.max(60_000, canonicalDuration);
  const tracks = project.timeline.tracks.length > 0 ? project.timeline.tracks : EMPTY_TRACK_SCAFFOLD;
  const playheadPercent = canonicalDuration === 0 ? 0 : (playheadMs / geometryDuration) * 100;
  const tickIntervals = sequenceClips ? Math.min(10, Math.max(1, Math.ceil(geometryDuration / 1000))) : trimClip ? Math.min(13, Math.max(1, Math.floor(geometryDuration / 1000))) : 13;
  const ticks = canonicalDuration === 0 ? [0] : Array.from({ length: tickIntervals + 1 }, (_, index) => Math.round((geometryDuration / tickIntervals) * index));

  function pointerPosition(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.querySelector<HTMLElement>(".timeline-width")!.getBoundingClientRect();
    if (rect.width <= 0 || !Number.isFinite(event.clientX)) return null;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const milliseconds = Math.min(canonicalDuration, Math.max(0, ratio * geometryDuration));
    return grid ? framesToMilliseconds(nearestMsToFrames(milliseconds)) : Math.round(milliseconds);
  }

  function cancelScrub(restore = true) {
    const active = scrub.current;
    scrub.current = null;
    if (!active) return;
    if (active.element.hasPointerCapture?.(active.id)) active.element.releasePointerCapture(active.id);
    if (restore) seekCallback.current(active.originalMs, "cancel");
  }
  useLayoutEffect(() => { cancelScrub(false); dragging.current = null; }, [project.history.headSnapshotId, trimBusy]);
  useLayoutEffect(() => { cancelScrub(); dragging.current = null; }, [zoom]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (gestureEscape(event)) { cancelScrub(); dragging.current = null; } };
    window.addEventListener("keydown", cancel);
    const blur = () => { cancelScrub(); dragging.current = null; };
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", cancel); window.removeEventListener("blur", blur); cancelScrub(false); };
  }, []);
  function selectClip(id: string, event: MouseEvent) {
    if (!onSelectClips || sequenceClips === undefined) return onSelect(id);
    const next = timelineSelection(orderedIds, selectedIds, id, anchor.current, { shift: event.shiftKey, toggle: event.metaKey || event.ctrlKey });
    if (!event.shiftKey) anchor.current = id;
    onSelectClips(next, next.includes(id) ? id : next.at(-1) ?? null);
  }
  async function editSequence(request: ManualVideoSequenceEdit) {
    if (editingDisabled || editPending.current || !onSequenceEdit) return;
    editPending.current = true; setPending(true);
    try { await onSequenceEdit(request); } catch { /* App presents the canonical error/reconciliation. */ }
    finally { editPending.current = false; setPending(false); }
  }
  function keyboardSelection(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.nativeEvent.defaultPrevented || event.repeat || timelineShortcutBlocked(event.nativeEvent)) return;
    if (event.target === event.currentTarget) {
      movePlayheadFromKeyboard(event);
      if (event.defaultPrevented) return;
    }
    const action = shortcutAction(event, "timeline");
    if (action === "zoom-in" || action === "zoom-out") {
      event.preventDefault(); event.stopPropagation(); onZoomChange(Math.min(180, Math.max(70, zoom + (action === "zoom-in" ? 10 : -10)))); return;
    }
    if (action && action !== "remove" && activateShortcut(event, event.currentTarget, action)) return;
    if (shortcutAction(event, "preview") === "play") {
      const shell = event.currentTarget.closest<HTMLElement>(".app-shell");
      if (shell && activateShortcut(event, shell, "play")) return;
    }
    if (!onSelectClips || sequenceClips === undefined || event.metaKey && event.ctrlKey || event.ctrlKey && event.altKey) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a" && !event.altKey && !event.shiftKey) {
      event.preventDefault(); onSelectClips([...orderedIds], selectedIds.includes(selectedId ?? "") ? selectedId : orderedIds[0] ?? null); return;
    }
    if (!["Delete", "Backspace"].includes(event.key) || event.repeat || event.metaKey || event.ctrlKey || event.altKey || editingDisabled || !onSequenceEdit || !selectedIds.length) return;
    event.preventDefault(); event.stopPropagation();
    void editSequence({ type: "remove-many", version: grid ? 2 : 1, expectedSnapshotId: project.history.headSnapshotId!, clipIds: selectedIds });
  }
  function clipInteraction(id: string): HTMLAttributes<HTMLElement> & { draggable: boolean } {
    return {
      draggable: sequenceClips !== undefined && !editingDisabled,
      onClick: event => selectClip(id, event),
      onDragStart: event => {
        if (editingDisabled || !onSelectClips || event.target instanceof Element && event.target.closest(".timeline-trim-handle")) { event.preventDefault(); return; }
        const ids = selectedIds.includes(id) ? orderedIds.filter(item => selectedIds.includes(item)) : [id];
        if (!selectedIds.includes(id)) onSelectClips(ids, id);
        dragging.current = { ids, snapshot: project.history.headSnapshotId! };
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-cevra-timeline", JSON.stringify({ ids, snapshot: project.history.headSnapshotId }));
      },
      onDragOver: event => { if (dragging.current && !editingDisabled) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } },
      onDrop: event => {
        const active = dragging.current; dragging.current = null;
        if (!active || editingDisabled || active.snapshot !== project.history.headSnapshotId) return;
        event.preventDefault(); event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        if (!Number.isFinite(event.clientX) || rect.width <= 0) return;
        const ids = reorderedTimeline(orderedIds, active.ids, id, event.clientX >= rect.left + rect.width / 2);
        if (ids.every((item, index) => item === orderedIds[index])) return;
        void editSequence({ type: "reorder", version: grid ? 2 : 1, expectedSnapshotId: active.snapshot, clipIds: ids });
      },
      onDragEnd: () => { dragging.current = null; }
    };
  }
  const selectedDuration = project.timeline.clips.filter(clip => selectedIds.includes(clip.id)).reduce((total, clip) => total + clip.timelineEndMs - clip.timelineStartMs, 0);
  const durationLabel = (duration: number) => t(grid ? "timeline.durationFrames" : "timeline.durationSeconds", { seconds: Number((duration / 1000).toFixed(3)), frames: nearestMsToFrames(duration) });

  function movePlayheadFromKeyboard(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || trimBusy || timelineShortcutBlocked(event.nativeEvent)) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (event.key === "Home") return onPlayheadChange(0);
    if (event.key === "End") return onPlayheadChange(canonicalDuration);
    if (grid) {
      const frame = floorMsToFrames(playheadMs) + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 10 : 1);
      return onPlayheadChange(framesToMilliseconds(Math.min(floorMsToFrames(canonicalDuration), Math.max(0, frame))));
    }
    const step = sequenceClips ? event.shiftKey ? 10 : 100 : 1000;
    onPlayheadChange(Math.min(canonicalDuration, Math.max(0, playheadMs + (event.key === "ArrowRight" ? step : -step))));
  }

  return (
    <section className="timeline" aria-label={t("timeline.title")} tabIndex={0} onKeyDown={keyboardSelection}>
      <button type="button" role="separator" className="timeline-resizer" onPointerDown={onResizeStart} onPointerCancel={onResizeCancel} onLostPointerCapture={onResizeCancel} onKeyDown={onResizeKey} aria-label={t("timeline.resize")} title={t("timeline.resize")} aria-orientation="horizontal" aria-valuemin={220} aria-valuemax={420} aria-valuenow={height}><span /></button>
      <div className="timeline-toolbar">
        <div><h2>{t("timeline.title")}</h2><span className="selected-item" data-testid="selected-item">{t("timeline.clipSelected", { name: selectedLabel(project, presentations, selectedId) })}</span></div>
        {trimClip && selectedId === trimClip.id && <span className="timeline-trim-hint">{t(grid ? "timeline.frameTrimHint" : "timeline.trimHint")}</span>}
        <div className="timeline-zoom"><label htmlFor="timeline-zoom">{t("timeline.zoom")}</label><span>−</span><input id="timeline-zoom" type="range" min="70" max="180" value={zoom} onChange={(event) => onZoomChange(Number(event.target.value))} /><span>＋</span><button {...shortcutProps("fit", t)} type="button" onClick={() => onZoomChange(100)}><Icon name="fit" size={14} />{t("timeline.fit")}</button></div>
      </div>
      <div className="timeline-summary">
        <output data-testid="timeline-total-duration">{t("timeline.totalDuration", { duration: durationLabel(canonicalDuration) })}</output>
        {selectedIds.length > 0 && <output data-testid="timeline-selected-duration">{t("timeline.selectedDuration", { count: selectedIds.length, duration: durationLabel(selectedDuration) })}</output>}
        {sequenceClips && onSelectClips && <>
          <button {...shortcutProps("select-all", t)} type="button" onClick={() => onSelectClips([...orderedIds], selectedId && orderedIds.includes(selectedId) ? selectedId : orderedIds[0] ?? null)}>{t("timeline.selectAll")}</button>
          <button {...shortcutProps("clear-selection", t)} type="button" disabled={!selectedIds.length} onClick={() => onSelectClips([], null)}>{t("keyboard.clearSelection")}</button>
        </>}
      </div>
      {sequenceClips && onSequenceEdit && onCommitRange && rangeDraft && onRangeAction && <ManualSequenceControls backend={backend} project={project} clips={sequenceClips} presentations={presentations} selectedId={selectedIds.length === 1 ? selectedIds[0]! : null} selectedClipIds={selectedIds} playheadMs={playheadMs} busy={editingDisabled} t={t} onEdit={onSequenceEdit} onCommitRange={onCommitRange} rangeDraft={rangeDraft} onAction={onRangeAction} />}
      <div className="timeline-table">
        <div className="timeline-corner"><span className="timecode">{grid ? formatFrames(floorMsToFrames(playheadMs)) : trimClip ? formatMilliseconds(playheadMs) : formatTime(playheadMs)}</span></div>
        <div
          className="timeline-ruler"
          role="slider"
          tabIndex={0}
          aria-label={t("timeline.ruler")}
          aria-valuemin={0}
          aria-valuemax={grid ? floorMsToFrames(canonicalDuration) : canonicalDuration}
          aria-valuenow={grid ? floorMsToFrames(playheadMs) : playheadMs}
          aria-valuetext={grid ? t("sequence.framePosition", { frame: floorMsToFrames(playheadMs), time: formatFrames(floorMsToFrames(playheadMs)) }) : t("timeline.playhead", { time: trimClip ? formatMilliseconds(playheadMs) : formatTime(playheadMs) })}
          onPointerDown={event => {
            if (event.button !== 0 || scrub.current || trimBusy) return;
            const value = pointerPosition(event); if (value === null) return;
            event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
            scrub.current = { id: event.pointerId, originalMs: playheadMs, element: event.currentTarget };
            event.currentTarget.setPointerCapture?.(event.pointerId); onPlayheadChange(value, "start");
          }}
          onPointerMove={event => { if (scrub.current?.id !== event.pointerId) return; const value = pointerPosition(event); if (value !== null) onPlayheadChange(value, "move"); }}
          onPointerUp={event => { if (scrub.current?.id !== event.pointerId) return; const value = pointerPosition(event); if (value === null) { cancelScrub(); return; } cancelScrub(false); onPlayheadChange(value, "end"); }}
          onPointerCancel={() => cancelScrub()}
          onLostPointerCapture={() => cancelScrub()}
          onKeyDown={movePlayheadFromKeyboard}
        >
          <div className="timeline-width" style={{ width: `${zoom}%` }}>
            {ticks.map((tick) => <span key={tick} style={{ left: `${(tick / geometryDuration) * 100}%` }}><i />{grid ? formatFrames(nearestMsToFrames(tick)) : formatTime(tick).slice(0, 5)}</span>)}
          </div>
        </div>
        {tracks.map((track) => {
          const labelKey = trackKeys[track.id as keyof typeof trackKeys];
          const label = labelKey ? t(labelKey) : track.name;
          return <TimelineRow key={track.id} track={track} label={label} visuals={visualsForTrack(project, presentations, track)} duration={geometryDuration} zoom={zoom} playheadPercent={playheadPercent} selectedId={selectedId} selectedIds={selectedIds} clipInteraction={clipInteraction} durationLabel={durationLabel} t={t} onSelect={onSelect} trimClipId={selectedIds.length === 1 ? trimClip?.id : undefined} sourceDuration={sourceDuration} snapshotId={project.history.headSnapshotId!} trimBusy={editingDisabled} onTrim={onTrim} />;
        })}
      </div>
    </section>
  );
}

function TimelineRow({ track, label, visuals, duration, zoom, playheadPercent, selectedId, selectedIds, clipInteraction, durationLabel, t, onSelect, trimClipId, sourceDuration, snapshotId, trimBusy, onTrim }: { trimClipId?: string; sourceDuration: number; snapshotId: string; trimBusy?: boolean; onTrim?: TimelineProps["onTrim"]; track: TimelineTrack; label: string; visuals: TimelineVisual[]; duration: number; zoom: number; playheadPercent: number; selectedId: string | null; selectedIds: readonly string[]; clipInteraction(id: string): HTMLAttributes<HTMLElement> & { draggable: boolean }; durationLabel(value: number): string; t: Translate; onSelect(id: string): void }) {
  const isAudio = track.kind === "audio";
  return <div className="timeline-row" data-testid={`timeline-track-${track.id}`}>
    <div className="track-head"><strong>{track.name}</strong><span>{label.replace(/^.. — /, "")}</span><div className="track-actions"><button type="button" disabled aria-label={t("timeline.lockTrack", { track: label })} title={t("inspector.demoControl")}><Icon name="lock" size={12} /></button><button type="button" disabled aria-label={t("timeline.showTrack", { track: label })} title={t("inspector.demoControl")}><Icon name="eye" size={12} /></button>{isAudio && <button type="button" disabled aria-label={t("timeline.muteTrack", { track: label })} title={t("inspector.demoControl")}><Icon name="mute" size={12} /></button>}</div></div>
    <div className={`track-lane track-${track.kind}`}>
      <div className="timeline-width" style={{ width: `${zoom}%` }}>
        {visuals.map((visual) => visual.kind === "clip" && visual.id === trimClipId && selectedId === visual.id && onTrim
          ? <TrimTimelineClip key={visual.id} clip={visual.clip} label={visual.label} fileName={visual.fileName} duration={duration} sourceDuration={sourceDuration} snapshotId={snapshotId} zoom={zoom} busy={Boolean(trimBusy)} t={t} onSelect={onSelect} onTrim={onTrim} interaction={clipInteraction(visual.id)} />
          : <button key={visual.id} type="button" {...(visual.kind === "clip" ? clipInteraction(visual.id) : { onClick: () => onSelect(visual.id) })} className={`timeline-item item-${visual.kind}${(visual.kind === "clip" ? selectedIds.includes(visual.id) : selectedId === visual.id) ? " selected" : ""}`} data-clip-id={visual.kind === "clip" ? visual.id : undefined} style={{ left: `${(visual.startMs / duration) * 100}%`, width: `${Math.max(1.4, ((visual.endMs - visual.startMs) / duration) * 100)}%` }} title={visual.kind === "clip" ? `${visual.label} · ${visual.fileName ?? ""} · ${durationLabel(visual.endMs - visual.startMs)}` : visual.label} aria-label={visual.kind === "clip" && visual.fileName ? `${visual.label} · ${visual.fileName}` : visual.label} aria-pressed={visual.kind === "clip" ? selectedIds.includes(visual.id) : selectedId === visual.id}>{isAudio && <span className="item-wave" aria-hidden="true">{waveformBars.map((height, index) => <i key={index} style={{ height }} />)}</span>}<span>{visual.label}</span>{visual.kind === "clip" && <small>{durationLabel(visual.endMs - visual.startMs)}</small>}</button>)}
        <i className="playhead-line" style={{ left: `${playheadPercent}%` }} aria-hidden="true"><b /></i>
      </div>
    </div>
  </div>;
}

type TrimRange = { sourceStartMs: number; sourceEndMs: number };
type TrimEdge = "in" | "out";

function TrimTimelineClip({ clip, label, fileName, duration, sourceDuration, snapshotId, zoom, busy, t, onSelect, onTrim, interaction }: {
  clip: TimelineClip; label: string; fileName?: string; duration: number; sourceDuration: number; snapshotId: string; zoom: number; busy: boolean;
  t: Translate; onSelect(id: string): void; onTrim: NonNullable<TimelineProps["onTrim"]>;
  interaction?: HTMLAttributes<HTMLElement> & { draggable: boolean };
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
    const escape = (event: KeyboardEvent) => { if (gestureEscape(event)) cancel(); };
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("keydown", escape); window.removeEventListener("blur", cancel); cancel(); };
  }, []);

  function adjust(edge: TrimEdge, delta: number): TrimRange {
    if (clip.frameTiming) {
      const startFrame = clip.frameTiming.sourceStartFrame, endFrame = clip.frameTiming.sourceEndFrame;
      const sourceStartFrame = edge === "in" ? Math.min(endFrame - 1, Math.max(0, startFrame + delta)) : startFrame;
      const sourceEndFrame = edge === "out" ? Math.min(maximumSourceFrame(sourceDuration), Math.max(startFrame + 1, endFrame + delta)) : endFrame;
      return { sourceStartMs: framesToMilliseconds(sourceStartFrame), sourceEndMs: framesToMilliseconds(sourceEndFrame) };
    }
    return edge === "in" ? { sourceStartMs: Math.min(clip.sourceEndMs - 1, Math.max(0, clip.sourceStartMs + delta)), sourceEndMs: clip.sourceEndMs }
      : { sourceStartMs: clip.sourceStartMs, sourceEndMs: Math.min(sourceDuration, Math.max(clip.sourceStartMs + 1, clip.sourceEndMs + delta)) };
  }
  function rangeAt(event: ReactPointerEvent<HTMLButtonElement>): TrimRange | null {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId || !Number.isFinite(event.clientX)) return null;
    return adjust(active.edge, Math.round((event.clientX - active.startX) * active.msPerPixel * (clip.frameTiming ? 30 / 1000 : 1)));
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
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || timelineShortcutBlocked(event.nativeEvent)) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || busy || pending || gesture.current) return;
    event.preventDefault(); event.stopPropagation();
    if (event.repeat) return;
    const current = clip.frameTiming ? edge === "in" ? clip.frameTiming.sourceStartFrame : clip.frameTiming.sourceEndFrame : edge === "in" ? clip.sourceStartMs : clip.sourceEndMs;
    const maximum = clip.frameTiming ? maximumSourceFrame(sourceDuration) : sourceDuration;
    const delta = event.key === "Home" ? -current : event.key === "End" ? maximum - current : (event.key === "ArrowRight" ? 1 : -1) * (clip.frameTiming ? event.shiftKey ? 10 : 1 : event.shiftKey ? 10 : 100);
    void commit(adjust(edge, delta));
  }
  // During IN drag anchor the presentation at the unchanged OUT. Canonical
  // placement stays at zero; only release confirms and reanchors the new range.
  // Right anchoring also preserves OUT when the minimum visual width applies.
  const draggingIn = draft !== null && gesture.current?.edge === "in";
  return <div className="timeline-trim-clip" data-clip-id={clip.id} draggable={interaction?.draggable} onDragStart={interaction?.onDragStart} onDragOver={interaction?.onDragOver} onDrop={interaction?.onDrop} onDragEnd={interaction?.onDragEnd} style={{
    left: draggingIn ? undefined : `${clip.timelineStartMs / duration * 100}%`,
    right: draggingIn ? `${gesture.current!.outRightPercent}%` : undefined,
    width: `${(range.sourceEndMs - range.sourceStartMs) / duration * 100}%`
  }}>
    <button type="button" className="timeline-item item-clip selected" aria-pressed="true" aria-label={fileName ? `${label} · ${fileName}` : label} title={fileName} onClick={interaction?.onClick ?? (() => onSelect(clip.id))}><span>{label}</span></button>
    {(["in", "out"] as const).map((edge) => <button key={edge} type="button" role="slider" className={`timeline-trim-handle trim-${edge}`} aria-disabled={busy || pending} tabIndex={busy || pending ? -1 : 0}
      aria-label={t(edge === "in" ? "timeline.trimIn" : "timeline.trimOut")} aria-orientation="horizontal"
      aria-valuemin={edge === "in" ? 0 : clip.frameTiming ? nearestMsToFrames(range.sourceStartMs) + 1 : range.sourceStartMs + 1} aria-valuemax={edge === "in" ? clip.frameTiming ? nearestMsToFrames(range.sourceEndMs) - 1 : range.sourceEndMs - 1 : clip.frameTiming ? maximumSourceFrame(sourceDuration) : sourceDuration}
      aria-valuenow={clip.frameTiming ? nearestMsToFrames(edge === "in" ? range.sourceStartMs : range.sourceEndMs) : edge === "in" ? range.sourceStartMs : range.sourceEndMs} aria-valuetext={clip.frameTiming ? t("sequence.framePosition", { frame: nearestMsToFrames(edge === "in" ? range.sourceStartMs : range.sourceEndMs), time: formatFrames(nearestMsToFrames(edge === "in" ? range.sourceStartMs : range.sourceEndMs)) }) : `${(edge === "in" ? range.sourceStartMs : range.sourceEndMs) / 1000} s`}
      title={t(clip.frameTiming ? "timeline.frameTrimHint" : "timeline.trimHint")} onPointerDown={(event) => start(event, edge)} onPointerMove={(event) => { const next = rangeAt(event); if (next && !busy) setDraft(next); }}
      onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={(event) => key(event, edge)}><span aria-hidden="true" /></button>)}
    <output className="timeline-trim-range" aria-label={t("timeline.trimRange")}>{clip.frameTiming ? <>IN {formatFrames(nearestMsToFrames(range.sourceStartMs))} · OUT {formatFrames(nearestMsToFrames(range.sourceEndMs))} @ 30 fps</> : <>IN {(range.sourceStartMs / 1000).toFixed(3)} · OUT {(range.sourceEndMs / 1000).toFixed(3)}</>}</output>
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
