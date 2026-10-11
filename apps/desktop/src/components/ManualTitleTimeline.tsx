import { MANUAL_TITLE_EXTENSION, resolveManualTitle, type ProjectIR } from "@cevra/project-ir";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject, type PointerEvent as Pointer, type KeyboardEvent as Key } from "react";
import type { ManualRangeDraftController } from "./ManualSequenceControls";
import type { RangeActionGate } from "../range-activation-guard";
import { nearestMsToFrames, framesToMilliseconds, isCfr30Frame } from "../frame-timing";
import { gestureEscape, timelineShortcutBlocked } from "../timeline-interactions";
import { formatPreciseTime, type Translate } from "../ui-model";
import { TimeInput } from "./TimeInput";

export interface TitleTimelineRangeEdit {
  graphicId: string; expectedSnapshotId: string; startFrame: number; endFrame: number;
}
type Range = { startFrame: number; endFrame: number };
type Edge = "in" | "out";
type Gesture = { pointerId: number; edge: Edge; element: HTMLButtonElement; x: number; framesPerPixel: number;
  original: Range; snapshot: string; geometry: string; ready: boolean };

/** Ephemeral range drafts only. Canonical title edits remain typed Application/History operations. */
export function useTitleTimelineRange({ project, selectedId, busy, geometryKey, geometryDuration, draftRef, onEdit, onAction, t }: {
  project: Readonly<ProjectIR>; selectedId: string | null; busy: boolean; geometryKey: string; geometryDuration: number;
  draftRef?: RefObject<ManualRangeDraftController | null>; onEdit?: (request: TitleTimelineRangeEdit) => Promise<void>;
  onAction?: RangeActionGate; t: Translate;
}) {
  const graphic = project.graphics.find(item => item.id === selectedId && item.extensions?.[MANUAL_TITLE_EXTENSION]);
  const title = graphic ? resolveManualTitle(graphic) : undefined;
  const snapshot = project.history.headSnapshotId!;
  const maximum = nearestMsToFrames(project.timeline.durationMs);
  const [start, setStart] = useState(String(title?.startFrame ?? 0)), [end, setEnd] = useState(String(title?.endFrame ?? 0));
  const [dirty, setDirty] = useState(false), [pending, setPending] = useState(false), [keyBusy, setKeyBusy] = useState(false), [failed, setFailed] = useState(false);
  const [pointerRange, setPointerRange] = useState<Range | null>(null);
  const token = useRef(snapshot), owner = useRef(graphic?.id);
  const gesture = useRef<Gesture | null>(null), flight = useRef<Promise<void> | null>(null), composing = useRef(false), keyPending = useRef(false);
  const latest = useRef({ snapshot, geometryKey, graphicId: graphic?.id, busy });
  latest.current = { snapshot, geometryKey, graphicId: graphic?.id, busy };
  const enabled = Boolean(title && onEdit && onAction && project.timeline.timingPolicy === "cfr30");
  const begin = start.trim() ? Number(start) : NaN, finish = end.trim() ? Number(end) : NaN;
  const valid = isCfr30Frame(begin) && isCfr30Frame(finish) && begin < finish && finish <= maximum;
  function cancelPointer() {
    const old = gesture.current; gesture.current = null; setPointerRange(null);
    if (old?.element.hasPointerCapture?.(old.pointerId)) old.element.releasePointerCapture(old.pointerId);
  }
  function resetFields() {
    token.current = snapshot; owner.current = graphic?.id;
    setStart(String(title?.startFrame ?? 0)); setEnd(String(title?.endFrame ?? 0)); setDirty(false); setFailed(false);
  }
  useLayoutEffect(() => { cancelPointer(); }, [snapshot, geometryKey, graphic?.id, busy]);
  useEffect(() => { if (!dirty || owner.current !== graphic?.id) resetFields(); }, [snapshot, graphic?.id, dirty]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (gestureEscape(event)) cancelPointer(); };
    window.addEventListener("keydown", escape); window.addEventListener("blur", cancelPointer);
    return () => { window.removeEventListener("keydown", escape); window.removeEventListener("blur", cancelPointer); cancelPointer(); };
  }, []);
  function publish(range: Range, expectedSnapshotId = snapshot): Promise<void> {
    if (flight.current) return flight.current;
    if (!enabled || !graphic || !onEdit || composing.current) return Promise.reject({ code: "MANUAL_TITLE_INVALID" });
    if (range.startFrame === title!.startFrame && range.endFrame === title!.endFrame) { setDirty(false); return Promise.resolve(); }
    setPending(true); setFailed(false);
    flight.current = onEdit({ graphicId: graphic.id, expectedSnapshotId, ...range }).then(() => { setDirty(false); }, cause => {
      setFailed(true); throw cause;
    }).finally(() => { flight.current = null; setPending(false); });
    return flight.current;
  }
  function settle(): Promise<void> | undefined {
    if (flight.current) return flight.current;
    if (!dirty) return;
    if (!valid || composing.current) return Promise.reject({ code: "MANUAL_TITLE_INVALID" });
    return publish({ startFrame: begin, endFrame: finish }, token.current);
  }
  useLayoutEffect(() => { if (draftRef) draftRef.current = { settle }; });
  useLayoutEffect(() => () => { if (draftRef) draftRef.current = null; }, [draftRef]);
  function touch(value: string, edge: Edge) {
    if (Number(value) === (edge === "in" ? begin : finish) && value.trim()) return;
    if (!dirty) { token.current = snapshot; owner.current = graphic?.id; }
    setDirty(true); setFailed(false); (edge === "in" ? setStart : setEnd)(value);
  }
  function fieldKey(event: Key<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229 || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); void settle()?.catch(() => {}); }
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); resetFields(); }
  }
  function adjust(original: Range, edge: Edge, delta: number, limit = maximum): Range {
    return edge === "in" ? { startFrame: Math.max(0, Math.min(original.endFrame - 1, original.startFrame + delta)), endFrame: original.endFrame }
      : { startFrame: original.startFrame, endFrame: Math.max(original.startFrame + 1, Math.min(limit, original.endFrame + delta)) };
  }
  function pointerValue(event: Pointer<HTMLButtonElement>) {
    const g = gesture.current;
    if (!g || !g.ready || g.pointerId !== event.pointerId || !Number.isFinite(event.clientX)
      || g.snapshot !== latest.current.snapshot || g.geometry !== latest.current.geometryKey || latest.current.busy) return null;
    return adjust(g.original, g.edge, Math.round((event.clientX - g.x) * g.framesPerPixel));
  }
  function startPointer(event: Pointer<HTMLButtonElement>, edge: Edge) {
    if (!enabled || busy || pending || keyPending.current || gesture.current || event.button !== 0 || !Number.isFinite(event.clientX)) return;
    const element = event.currentTarget, content = element.closest(".timeline-width")?.getBoundingClientRect();
    if (!content || content.width <= 0 || !title) return;
    event.preventDefault(); event.stopPropagation(); element.focus({ preventScroll: true });
    const captured: Gesture = { pointerId: event.pointerId, edge, element, x: event.clientX,
      framesPerPixel: geometryDuration / 1000 * 30 / content.width,
      original: { startFrame: title.startFrame, endFrame: title.endFrame }, snapshot, geometry: geometryKey, ready: false };
    // Capture immediately so releasing while draft settlement is pending cannot start a late gesture.
    gesture.current = captured; element.setPointerCapture?.(event.pointerId);
    void onAction!(current => {
      if (gesture.current !== captured || current.history.headSnapshotId !== captured.snapshot
        || latest.current.graphicId !== graphic?.id || latest.current.geometryKey !== captured.geometry) { cancelPointer(); return; }
      captured.ready = true; setPointerRange(captured.original);
    }).catch(() => cancelPointer());
  }
  function finishPointer(event: Pointer<HTMLButtonElement>) {
    const g = gesture.current, value = pointerValue(event); cancelPointer();
    if (g && value) void publish(value, g.snapshot).catch(() => {});
  }
  function edgeKey(event: Key<HTMLButtonElement>, edge: Edge) {
    if (!enabled || busy || pending || keyPending.current || gesture.current || event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey
      || timelineShortcutBlocked(event.nativeEvent) || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    keyPending.current = true; setKeyBusy(true);
    const key = event.key, step = event.shiftKey ? 10 : 1, id = graphic!.id;
    void onAction!(current => {
      const item = current.graphics.find(value => value.id === id), value = item ? resolveManualTitle(item) : undefined;
      if (!value || !onEdit) return;
      const position = edge === "in" ? value.startFrame : value.endFrame, limit = nearestMsToFrames(current.timeline.durationMs);
      const delta = key === "Home" ? -position : key === "End" ? limit - position : (key === "ArrowRight" ? step : -step);
      const range = adjust(value, edge, delta, limit);
      if (range.startFrame === value.startFrame && range.endFrame === value.endFrame) return;
      return onEdit({ graphicId: id, expectedSnapshotId: current.history.headSnapshotId!, ...range });
    }).catch(() => {}).finally(() => { keyPending.current = false; setKeyBusy(false); });
  }
  const shown = pointerRange ?? title;
  const disabled = busy || pending || keyBusy || !enabled;
  const controls = title && <section className="title-timeline-controls" aria-label={t("title.timelineRange")}>
    {(["in", "out"] as const).map(edge => <label key={edge}>{t(edge === "in" ? "title.in" : "title.out")}
      <TimeInput grid durationMs={project.timeline.durationMs} maximum={maximum} value={edge === "in" ? start : end}
        aria-label={t(edge === "in" ? "title.timelineIn" : "title.timelineOut")} aria-invalid={!valid} disabled={disabled || pointerRange !== null}
        onValue={value => touch(value, edge)} onBlur={() => { void settle()?.catch(() => {}); }} onKeyDown={fieldKey}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} />
    </label>)}
    {(failed || dirty && !valid) && <span role="alert">{t("title.invalid")}</span>}
  </section>;
  return { graphicId: graphic?.id, title, shown, controls, disabled,
    edgeProps: (edge: Edge) => ({
      role: "slider" as const, "aria-disabled": disabled, tabIndex: disabled ? -1 : 0,
      "aria-label": t(edge === "in" ? "title.timelineTrimIn" : "title.timelineTrimOut"), "aria-orientation": "horizontal" as const,
      "aria-valuemin": edge === "in" ? 0 : (shown?.startFrame ?? 0) + 1,
      "aria-valuemax": edge === "in" ? (shown?.endFrame ?? 1) - 1 : maximum,
      "aria-valuenow": edge === "in" ? shown?.startFrame : shown?.endFrame,
      "aria-valuetext": formatPreciseTime(framesToMilliseconds(edge === "in" ? shown?.startFrame ?? 0 : shown?.endFrame ?? 0), project.timeline.durationMs),
      onPointerDown: (event: Pointer<HTMLButtonElement>) => startPointer(event, edge),
      onPointerMove: (event: Pointer<HTMLButtonElement>) => { const next = pointerValue(event); if (next) setPointerRange(next); },
      onPointerUp: finishPointer, onPointerCancel: cancelPointer, onLostPointerCapture: cancelPointer,
      onKeyDown: (event: Key<HTMLButtonElement>) => edgeKey(event, edge)
    })
  };
}
export type TitleTimelineModel = ReturnType<typeof useTitleTimelineRange>;
