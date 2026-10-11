import { manualTitleHeight, manualTitleLayout, validateManualTitle, type ManualTitle, type ManualTitleLayoutV1 } from "@cevra/project-ir";
import type { ManualRangeDraftController } from "./ManualSequenceControls";
import type { ManualTitleEdit } from "@cevra/application";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject, type PointerEvent as ReactPointerEvent } from "react";
import { gestureEscape, timelineShortcutBlocked } from "../timeline-interactions";
import type { Translate } from "../ui-model";

export interface TitlePreviewEditing {
  draftRef?: RefObject<ManualRangeDraftController | null>;
  title: ManualTitle; graphicId: string; snapshotId: string; selected: boolean;
  onSelect(): void; onCommit(request: ManualTitleEdit): Promise<void>;
}
/** Selection/gesture drafts are UI-only; one validated History operation owns the result. */
export function ManualTitleOverlay({ editing, videoRef, active, blocked = false, t }: {
  editing: TitlePreviewEditing; videoRef: RefObject<HTMLVideoElement | null>; active: boolean; blocked?: boolean; t: Translate;
}) {
  const { title, snapshotId } = editing;
  const layout = manualTitleLayout(title);
  const [picture, setPicture] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [draft, setDraft] = useState<ManualTitleLayoutV1 | null>(null);
  const [text, setText] = useState<string | null>(null), [pending, setPending] = useState(false), [failed, setFailed] = useState(false);
  const gesture = useRef<{ pointerId: number; element: HTMLElement; x: number; y: number; original: ManualTitleLayoutV1; picture: typeof picture; resize: boolean; snapshot: string } | null>(null);
  const currentDraft = useRef(draft); currentDraft.current = draft;
  const composing = useRef(false), flight = useRef<Promise<void> | null>(null), latest = useRef({ snapshotId, active }); latest.current = { snapshotId, active };
  const textInput = useRef<HTMLInputElement>(null);
  function cancel() {
    const old = gesture.current; gesture.current = null; currentDraft.current = null; setDraft(null);
    if (old?.element.hasPointerCapture?.(old.pointerId)) old.element.releasePointerCapture(old.pointerId);
  }
  useLayoutEffect(() => {
    const video = videoRef.current;
    function measure() {
      if (!video || !video.videoWidth || !video.videoHeight) return;
      const r = video.getBoundingClientRect(), ratio = video.videoWidth / video.videoHeight;
      const width = Math.min(r.width, r.height * ratio), height = width / ratio;
      setPicture({ x: (r.width - width) / 2, y: (r.height - height) / 2, width, height });
    }
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { cancel(); measure(); });
    if (video) observer?.observe(video);
    const resize = () => { cancel(); measure(); };
    window.addEventListener("resize", resize);
    return () => { observer?.disconnect(); window.removeEventListener("resize", resize); };
  }, [videoRef, active, title.aspect]);
  useEffect(() => { if (blocked) cancel(); }, [blocked]);
  useEffect(() => { if (!active) cancel(); }, [active]);
  useEffect(() => { cancel(); setText(null); setFailed(false); }, [snapshotId]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (gestureEscape(event)) cancel(); };
    const blur = () => { cancel(); };
    window.addEventListener("keydown", escape); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", escape); window.removeEventListener("blur", blur); cancel(); };
  }, []);
  useEffect(() => { if (text !== null) { textInput.current?.focus(); textInput.current?.select(); } }, [text === null]);
  function publish(value: ManualTitle): Promise<void> {
    if (flight.current) return flight.current;
    if (!latest.current.active || snapshotId !== latest.current.snapshotId) return Promise.reject({ code: "MANUAL_TITLE_INVALID" });
    let candidate: ManualTitle;
    try { candidate = validateManualTitle(value); } catch { setFailed(true); return Promise.reject({ code: "MANUAL_TITLE_INVALID" }); }
    if (JSON.stringify(candidate) === JSON.stringify(title)) { setText(null); return Promise.resolve(); }
    setPending(true); setFailed(false);
    flight.current = editing.onCommit({ version: 1, type: "set", expectedSnapshotId: snapshotId, title: candidate })
      .then(() => { setText(null); }, cause => { setFailed(true); throw cause; })
      .finally(() => { flight.current = null; setPending(false); });
    return flight.current;
  }
  useLayoutEffect(() => {
    if (editing.draftRef) editing.draftRef.current = { settle: () => flight.current ?? (text !== null ? composing.current ? Promise.reject({ code: "MANUAL_TITLE_PENDING" }) : publish({ ...title, text }) : undefined) };
  });
  useLayoutEffect(() => () => { if (editing.draftRef) editing.draftRef.current = null; }, [editing.draftRef]);
  function start(event: ReactPointerEvent<HTMLElement>, resize = false) {
    if (!active || blocked || pending || text !== null || event.button !== 0 || !picture.width || gesture.current) return;
    event.preventDefault(); event.stopPropagation(); editing.onSelect(); setFailed(false);
    gesture.current = { pointerId: event.pointerId, element: event.currentTarget, x: event.clientX, y: event.clientY, original: layout, picture, resize, snapshot: snapshotId };
    event.currentTarget.setPointerCapture?.(event.pointerId); event.currentTarget.focus();
  }
  function move(event: ReactPointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g || blocked || g.pointerId !== event.pointerId || g.snapshot !== latest.current.snapshotId || !latest.current.active) return;
    const dx = (event.clientX - g.x) / g.picture.width, dy = (event.clientY - g.y) / g.picture.height;
    let next = { ...g.original };
    if (g.resize) {
      // Proportional corner resize: width, type and bar scale together.
      const factor = Math.max(0.5 / next.fontScale, 0.2 / next.width, Math.min(2 / next.fontScale,
        (1 - next.x) / next.width, (1 - next.y) / manualTitleHeight(title.aspect, next.fontScale), 1 + dx / next.width));
      next = { ...next, width: next.width * factor, fontScale: next.fontScale * factor };
    } else next = { ...next, x: Math.min(1 - next.width, Math.max(0, next.x + dx)), y: Math.min(1 - manualTitleHeight(title.aspect, next.fontScale), Math.max(0, next.y + dy)) };
    currentDraft.current = next; setDraft(next);
  }
  function end(event: ReactPointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g || event.pointerId !== g.pointerId) return;
    move(event); const next = currentDraft.current; cancel();
    if (next && JSON.stringify(next) !== JSON.stringify(g.original)) void publish({ ...title, version: 2, layout: next }).catch(() => {});
  }
  const shown = draft ?? layout, height = manualTitleHeight(title.aspect, shown.fontScale);
  const sourceWidth = title.aspect === "16:9" ? 1920 : 1080, sourceFont = title.aspect === "16:9" ? 56 : 48;
  if (!active || !picture.width) return null;
  return <div className="title-picture" style={{ left: picture.x, top: picture.y, width: picture.width, height: picture.height }}>
    <div className={`title-direct${editing.selected ? " selected" : ""}${draft ? " dragging" : ""}`} style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%`, width: `${shown.width * 100}%`, height: `${height * 100}%`, fontSize: picture.width / sourceWidth * sourceFont * shown.fontScale }}>
      {text === null ? <button type="button" className="title-hit" aria-label={t("title.selectPreview")} aria-pressed={editing.selected} disabled={pending || blocked}
        onClick={() => editing.onSelect()} onDoubleClick={() => { editing.onSelect(); setText(title.text); }}
        onPointerDown={event => start(event)} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={cancel}
        onKeyDown={event => {
          if (event.key === "Enter" && !pending && !blocked && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey && !timelineShortcutBlocked(event.nativeEvent)) { event.preventDefault(); event.stopPropagation(); editing.onSelect(); setText(title.text); return; }
          if (timelineShortcutBlocked(event) || event.repeat || event.metaKey || event.ctrlKey || event.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation(); const step = event.shiftKey ? 0.01 : 0.001;
          void publish({ ...title, version: 2, layout: { ...layout,
            x: Math.max(0, Math.min(1 - layout.width, layout.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0))),
            y: Math.max(0, Math.min(1 - manualTitleHeight(title.aspect, layout.fontScale), layout.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0))) } }).catch(() => {});
        }}>{draft && <span aria-hidden="true">{title.text}</span>}</button> : <input ref={textInput} className="title-text-input" aria-label={t("title.editPreview")} maxLength={80} value={text} disabled={pending || blocked}
          onChange={event => setText(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
          onBlur={() => { if (!composing.current && text !== null) void publish({ ...title, text }).catch(() => {}); }}
          onKeyDown={event => {
            event.stopPropagation(); if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
            if (event.key === "Escape") { event.preventDefault(); setText(null); }
            if (event.key === "Enter") { event.preventDefault(); void publish({ ...title, text }).catch(() => {}); }
          }} />}
      {editing.selected && text === null && <button type="button" className="title-resize" aria-label={t("title.resizePreview")} disabled={pending || blocked}
        onPointerDown={event => start(event, true)} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={cancel}
        onKeyDown={event => {
          if (timelineShortcutBlocked(event) || event.repeat || event.metaKey || event.ctrlKey || event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation(); const factor = event.key === "ArrowUp" ? 1.01 : 0.99;
          void publish({ ...title, version: 2, layout: { ...layout, width: layout.width * factor, fontScale: layout.fontScale * factor } }).catch(() => {});
        }} />}
    </div>
    {failed && <p className="title-direct-error" role="alert">{t("title.invalid")}</p>}
  </div>;
}
