import { useEffect, useRef, type DragEvent, type FormEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

type Activation = { epoch: number; target: Element; cancelled: boolean; pointerId?: number };
function actionTarget(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest("button, summary, select, input[type=checkbox], input[type=radio], a[href], [role=button], [data-clip-id]") : null;
}

/** A failed range settlement consumes the activation which was already in progress.
 * Recording a press never commits or invokes an action. A new press/key is a new
 * explicit retry; release/click of the failed gesture is not.
 */
export function useRangeActivationGuard() {
  const failureEpoch = useRef(0);
  const pointer = useRef<Activation | null>(null);
  const keyboard = useRef<Activation | null>(null);
  const drag = useRef<Activation | null>(null);
  const active = useRef<Activation | null>(null);
  const cancelled = (value: Activation | null) => Boolean(value && (value.cancelled || value.epoch !== failureEpoch.current));
  function scope(value: Activation | null) {
    active.current = value;
    queueMicrotask(() => { if (active.current === value) active.current = null; });
  }
  function pointerDown(event: PointerEvent<HTMLElement>) {
    const target = actionTarget(event.target);
    pointer.current = event.button === 0 && target ? { epoch: failureEpoch.current, target, cancelled: false, pointerId: event.pointerId } : null;
    scope(pointer.current);
  }
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.repeat) { scope(null); return; }
    if (event.nativeEvent.isComposing || event.keyCode === 229 || ["Tab", "Dead", "Process", "Unidentified"].includes(event.key)) { keyboard.current = null; scope(null); return; }
    const target = event.target instanceof Element ? event.target : event.currentTarget;
    keyboard.current = { epoch: failureEpoch.current, target, cancelled: false };
    scope(keyboard.current);
  }
  function click(event: MouseEvent<HTMLElement>) {
    const target = actionTarget(event.target);
    const value = event.detail > 0 && pointer.current?.target === target ? pointer.current
      : event.detail === 0 ? active.current : null;
    if (event.detail > 0) pointer.current = null;
    scope(value);
    if (cancelled(value)) { event.preventDefault(); event.stopPropagation(); }
  }
  function change(event: FormEvent<HTMLElement>) {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const value = pointer.current?.target === event.target ? pointer.current : keyboard.current?.target === event.target ? keyboard.current : active.current;
    scope(value);
    if (cancelled(value)) { event.preventDefault(); event.stopPropagation(); }
  }
  function dragStart(event: DragEvent<HTMLElement>) {
    const target = event.target instanceof Element ? event.target : event.currentTarget;
    const press = pointer.current;
    drag.current = press && (press.target === target || target.contains(press.target) || press.target.contains(target))
      ? { ...press, target } : { epoch: failureEpoch.current, target, cancelled: false };
    scope(drag.current);
    if (cancelled(drag.current)) { event.preventDefault(); event.stopPropagation(); }
  }
  function drop(event: DragEvent<HTMLElement>) {
    scope(drag.current);
    if (cancelled(drag.current)) { event.preventDefault(); event.stopPropagation(); }
  }
  useEffect(() => {
    let keyRelease: ReturnType<typeof setTimeout> | undefined;
    const release = (event: globalThis.PointerEvent) => {
      if (pointer.current?.pointerId === event.pointerId && pointer.current?.target !== actionTarget(event.target)) pointer.current = null;
    };
    const cancel = (event: globalThis.PointerEvent) => { const value = pointer.current; if (value && value.pointerId === event.pointerId) value.cancelled = true; };
    const blur = () => { if (pointer.current) pointer.current.cancelled = true; if (keyboard.current) keyboard.current.cancelled = true; if (drag.current) drag.current.cancelled = true; };
    const keyUp = () => {
      const value = keyboard.current;
      scope(value);
      clearTimeout(keyRelease);
      // Space's default click follows keyup. Keep its epoch through that click.
      keyRelease = setTimeout(() => { if (keyboard.current === value) keyboard.current = null; }, 0);
    };
    window.addEventListener("pointerup", release, true); window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("blur", blur); window.addEventListener("keyup", keyUp, true);
    return () => {
      clearTimeout(keyRelease); pointer.current = null; keyboard.current = null; drag.current = null; active.current = null;
      window.removeEventListener("pointerup", release, true); window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("blur", blur); window.removeEventListener("keyup", keyUp, true);
    };
  }, []);
  return {
    failed: () => { failureEpoch.current++; },
    assertCurrent: () => { if (cancelled(active.current)) throw { code: "RANGE_ACTION_CANCELLED" }; },
    captureProps: { onPointerDownCapture: pointerDown, onKeyDownCapture: keyDown, onClickCapture: click, onChangeCapture: change,
      onDragStartCapture: dragStart, onDropCapture: drop, onDragEndCapture: () => { drag.current = null; } }
  };
}

/** Shared UI callback protocol; it never owns Project IR or backend execution. */
export type RangeActionGate = (action: () => void | Promise<void>) => Promise<void>;
