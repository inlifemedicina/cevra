import { useEffect, useRef, useState } from "react";
import type { DesktopBackend, NativeMediaDropState } from "./backend/desktop-backend";

/** Paths remain native. A physical drop is acknowledged once, including failures. */
export function useNativeMediaDrop(backend: DesktopBackend, handle: (state: NativeMediaDropState) => boolean, enabled = true): boolean {
  const latest = useRef(handle); latest.current = handle;
  const [hovering, setHovering] = useState(false);
  useEffect(() => {
    if (!enabled || !backend.getNativeMediaDropState || !backend.importDroppedMedia) { setHovering(false); return; }
    let active = true, timer: ReturnType<typeof setTimeout> | undefined, acknowledged = -1;
    async function poll() {
      try {
        const state = await backend.getNativeMediaDropState!();
        if (!active) return;
        setHovering(state.hovering);
        if (state.sequence > acknowledged && latest.current(state)) acknowledged = state.sequence;
      } catch { /* Native lifecycle errors are handled by the existing Host/close queries. */ }
      finally { if (active) timer = setTimeout(() => { void poll(); }, 250); }
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [backend, enabled]);
  return hovering;
}
