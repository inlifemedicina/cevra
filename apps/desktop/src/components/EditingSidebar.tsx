import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type UIEvent } from "react";
import type { Translate } from "../ui-model";

const MIN_WIDTH = 320;
const MAX_WIDTH = 480;
const DIVIDER_HEIGHT = 8;
const MIN_EDITORIAL_HEIGHT = 280;
const MIN_CONTEXT_HEIGHT = 180;

type Gesture = { kind: "width" | "split"; pointerId: number; start: number; width: number; height: number; share: number; usableHeight: number; target: HTMLButtonElement };

export function EditingSidebar({ open, width, editorialVisible, directorPanel, contextualPanel, t, onWidthChange, onCollapse }: {
  open: boolean; width: number; editorialVisible: boolean; directorPanel: ReactNode; contextualPanel: ReactNode;
  t: Translate; onWidthChange(width: number): void; onCollapse(): void;
}) {
  const body = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLElement>(null);
  const [bodyHeight, setBodyHeight] = useState(772);
  const [editorialShare, setEditorialShare] = useState(0.65);
  const gesture = useRef<Gesture | null>(null);
  const scrollPositions = useRef(new Map<string, number>());
  const restoringScroll = useRef(false);
  const usableHeight = Math.max(0, bodyHeight - DIVIDER_HEIGHT);
  const minEditorial = Math.min(MIN_EDITORIAL_HEIGHT, usableHeight);
  const maxEditorial = Math.max(minEditorial, usableHeight - MIN_CONTEXT_HEIGHT);
  const editorialHeight = Math.max(minEditorial, Math.min(maxEditorial, usableHeight * editorialShare));

  const stopGesture = useCallback(() => {
    const current = gesture.current;
    gesture.current = null;
    if (current?.target.hasPointerCapture?.(current.pointerId)) current.target.releasePointerCapture(current.pointerId);
  }, []);

  useLayoutEffect(() => {
    const element = body.current;
    if (!element) return;
    const measure = () => {
      const height = element.getBoundingClientRect().height;
      // Hidden layout must not overwrite the last usable size or scroll state.
      if (height > 0) {
        const current = gesture.current;
        if (current?.kind === "split" && Math.abs(height - DIVIDER_HEIGHT - current.usableHeight) > 1) stopGesture();
        setBodyHeight(height);
      }
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [stopGesture]);

  useEffect(() => {
    const cancel = () => stopGesture();
    const escape = (event: globalThis.KeyboardEvent) => {
      const current = gesture.current;
      if (event.key !== "Escape" || !current) return;
      onWidthChange(current.width);
      setEditorialShare(current.share);
      stopGesture();
    };
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
    window.addEventListener("keydown", escape);
    return () => {
      stopGesture();
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
      window.removeEventListener("keydown", escape);
    };
  }, [onWidthChange, stopGesture]);

  useLayoutEffect(() => {
    if (!open) { stopGesture(); return; }
    const saved = new Map(scrollPositions.current);
    restoringScroll.current = true;
    const restore = () => container.current?.querySelectorAll<HTMLElement>("[data-sidebar-scroll]").forEach(element => {
      const value = saved.get(element.dataset.sidebarScroll!);
      if (value !== undefined) element.scrollTop = value;
    });
    let second = 0;
    const first = requestAnimationFrame(() => {
      restore();
      second = requestAnimationFrame(() => { restore(); restoringScroll.current = false; });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      restoringScroll.current = false;
    };
  }, [open, stopGesture]);

  function rememberScroll(event: UIEvent<HTMLElement>) {
    const element = event.target;
    if (open && !restoringScroll.current && element instanceof HTMLElement && element.dataset.sidebarScroll) {
      scrollPositions.current.set(element.dataset.sidebarScroll, element.scrollTop);
    }
  }
  function setHeight(height: number, available = usableHeight) {
    const minimum = Math.min(MIN_EDITORIAL_HEIGHT, available);
    const maximum = Math.max(minimum, available - MIN_CONTEXT_HEIGHT);
    if (available > 0) setEditorialShare(Math.max(minimum, Math.min(maximum, height)) / available);
  }
  function start(event: PointerEvent<HTMLButtonElement>, kind: Gesture["kind"]) {
    if (!open || event.button !== 0 || gesture.current) return;
    event.preventDefault();
    event.currentTarget.focus();
    gesture.current = { kind, pointerId: event.pointerId, start: kind === "width" ? event.clientX : event.clientY, width, height: editorialHeight, share: editorialShare, usableHeight, target: event.currentTarget };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current || event.pointerId !== current.pointerId) return;
    if (current.kind === "width") onWidthChange(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, current.width + current.start - event.clientX)));
    else setHeight(current.height + event.clientY - current.start, current.usableHeight);
  }
  function key(event: KeyboardEvent<HTMLButtonElement>, kind: Gesture["kind"]) {
    const keys = kind === "width" ? ["ArrowLeft", "ArrowRight", "Home", "End"] : ["ArrowUp", "ArrowDown", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    stopGesture();
    const step = event.shiftKey ? 48 : 16;
    if (kind === "width") {
      const next = event.key === "Home" ? MIN_WIDTH : event.key === "End" ? MAX_WIDTH : width + (event.key === "ArrowLeft" ? step : -step);
      onWidthChange(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, next)));
    } else setHeight(event.key === "Home" ? minEditorial : event.key === "End" ? maxEditorial : editorialHeight + (event.key === "ArrowDown" ? step : -step));
  }
  function collapse() {
    stopGesture();
    onCollapse();
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("[data-sidebar-toggle]")?.focus());
  }
  const splitStyle = { "--editorial-height": `${editorialHeight}px` } as CSSProperties;
  return <aside id="editing-sidebar" className="editing-sidebar" aria-label={t("sidebar.title")} hidden={!open} ref={container} onScrollCapture={rememberScroll}>
    <button type="button" role="separator" className="sidebar-width-resizer" aria-label={t("sidebar.resizeWidth")} aria-orientation="vertical" aria-valuemin={MIN_WIDTH} aria-valuemax={MAX_WIDTH} aria-valuenow={Math.round(width)} aria-controls="editing-sidebar"
      onPointerDown={event => start(event, "width")} onPointerMove={move} onPointerUp={stopGesture} onPointerCancel={stopGesture} onLostPointerCapture={stopGesture} onKeyDown={event => key(event, "width")}><span /></button>
    <header className="editing-sidebar-heading"><strong>{t("sidebar.expanded")}</strong><button type="button" className="secondary-button" onClick={collapse} title={t("sidebar.collapse")}>{t("sidebar.compact")}</button></header>
    <div ref={body} className={`editing-sidebar-body${editorialVisible ? "" : " context-only"}`} style={splitStyle}>
      <div id="sidebar-editorial" className="sidebar-editorial" hidden={!editorialVisible}>{directorPanel}</div>
      <button type="button" role="separator" className="sidebar-height-resizer" hidden={!editorialVisible} aria-label={t("sidebar.resizeSplit")} aria-orientation="horizontal" aria-valuemin={Math.round(minEditorial)} aria-valuemax={Math.round(maxEditorial)} aria-valuenow={Math.round(editorialHeight)} aria-controls="sidebar-editorial sidebar-context"
        onPointerDown={event => start(event, "split")} onPointerMove={move} onPointerUp={stopGesture} onPointerCancel={stopGesture} onLostPointerCapture={stopGesture} onKeyDown={event => key(event, "split")}><span /></button>
      <div id="sidebar-context" className="sidebar-context">{contextualPanel}</div>
    </div>
  </aside>;
}
