import { useEffect, useLayoutEffect, useState, type InputHTMLAttributes } from "react";
import { formatTime } from "../ui-model";
import { framesToMilliseconds, nearestMsToFrames } from "../frame-timing";

export function parseTime(value: string): number | null {
  const match = /^(\d{2,}):([0-5]\d):([0-5]\d)(?:[.,](\d{1,3}))?$/u.exec(value);
  if (!match) return null;
  const ms = (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000 + Number((match[4] ?? "").padEnd(3, "0"));
  return Number.isSafeInteger(ms) ? ms : null;
}
/** Display precision never replaces the exact owning draft. Focus/blur is lossless. */
export function TimeInput({ value, grid, onValue, maximum, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max" | "step"> & {
  value: string; grid: boolean; onValue(value: string): void; maximum?: number;
}) {
  const numeric = value.trim() ? Number(value) : NaN;
  const formatted = Number.isFinite(numeric) ? formatTime(grid ? framesToMilliseconds(numeric) : numeric) : "";
  const [text, setText] = useState(formatted), [focused, setFocused] = useState(false);
  const [resetRevision, setResetRevision] = useState(0);
  useLayoutEffect(() => { if (resetRevision) setText(formatted); }, [resetRevision]);
  useEffect(() => { if (!focused) setText(formatted); }, [formatted, value, focused]);
  return <input {...props} type="text" inputMode="numeric" placeholder="00:00:00" value={text}
    onFocus={event => { setFocused(true); props.onFocus?.(event); }}
    onChange={event => {
      const next = event.target.value; setText(next);
      if (next === formatted) return;
      const ms = parseTime(next); onValue(ms === null || maximum !== undefined && ms > (grid ? framesToMilliseconds(maximum) : maximum) ? "" : String(grid ? nearestMsToFrames(ms) : ms));
    }}
    onKeyDown={event => {
      if (!event.nativeEvent.isComposing && !event.metaKey && !event.ctrlKey && !event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key) && Number.isFinite(numeric)) {
        event.preventDefault(); event.stopPropagation();
        const next = Math.min(maximum ?? Number.MAX_SAFE_INTEGER, Math.max(0, numeric + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? grid ? 30 : 1000 : 1)));
        onValue(String(next)); setText(formatTime(grid ? framesToMilliseconds(next) : next));
      } else { if (event.key === "Escape" && !event.nativeEvent.isComposing) setResetRevision(old => old + 1); props.onKeyDown?.(event); }
    }}
    onBlur={event => { setFocused(false); setText(formatted); props.onBlur?.(event); }} />;
}
