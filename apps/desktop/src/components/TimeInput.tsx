import { useEffect, useLayoutEffect, useState, type InputHTMLAttributes } from "react";
import { formatTime, formatPreciseTime } from "../ui-model";
import { framesToMilliseconds, nearestMsToFrames, MAX_CFR30_FRAME, isCfr30Frame } from "../frame-timing";

export function parseTime(value: string): number | null {
  const match = /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)(?:[.,](\d{1,3}))?$/u.exec(value);
  if (!match) return null;
  const ms = (Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000 + Number((match[4] ?? "").padEnd(3, "0"));
  return Number.isSafeInteger(ms) ? ms : null;
}
/** Focus exposes millisecond precision; neither formatting nor focus/blur reparses the owning value. */
export function TimeInput({ value, grid, onValue, maximum, durationMs, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max" | "step"> & {
  value: string; grid: boolean; onValue(value: string): void; maximum?: number; durationMs?: number;
}) {
  const numeric = value.trim() ? Number(value) : NaN;
  const validNumeric = grid ? isCfr30Frame(numeric) : Number.isFinite(numeric) && numeric >= 0;
  const milliseconds = validNumeric ? grid ? framesToMilliseconds(numeric) : numeric : NaN;
  const formatted = validNumeric ? formatTime(milliseconds, durationMs) : "";
  const precise = validNumeric ? formatPreciseTime(milliseconds, durationMs) : "";
  const [text, setText] = useState(formatted), [focused, setFocused] = useState(false);
  const [resetRevision, setResetRevision] = useState(0);
  useLayoutEffect(() => { if (resetRevision) setText(focused ? precise : formatted); }, [resetRevision]);
  useEffect(() => { if (!focused) setText(formatted); }, [formatted, value, focused]);
  return <input {...props} type="text" inputMode="decimal" placeholder={durationMs !== undefined && durationMs >= 3600000 ? "00:00:00" : "00:00"} value={text}
    onFocus={event => { setFocused(true); setText(precise); props.onFocus?.(event); }}
    onChange={event => {
      const next = event.target.value; setText(next);
      if (next === (focused ? precise : formatted)) return;
      const ms = parseTime(next);
      let converted: number | null = ms;
      if (ms !== null && grid) { try { converted = nearestMsToFrames(ms); } catch { converted = null; } }
      const beyondMaximum = maximum !== undefined && converted !== null &&
        (converted > maximum || ms! > (grid ? Math.round(framesToMilliseconds(maximum)) : maximum));
      onValue(converted === null || beyondMaximum ? "" : String(converted));
    }}
    onKeyDown={event => {
      if (!event.nativeEvent.isComposing && !event.metaKey && !event.ctrlKey && !event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key) && validNumeric) {
        event.preventDefault(); event.stopPropagation();
        const next = Math.min(Math.min(maximum ?? Number.MAX_SAFE_INTEGER, grid ? MAX_CFR30_FRAME : Number.MAX_SAFE_INTEGER), Math.max(0, numeric + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? grid ? 30 : 1000 : 1)));
        onValue(String(next)); setText((focused ? formatPreciseTime : formatTime)(grid ? framesToMilliseconds(next) : next, durationMs));
      } else { if (event.key === "Escape" && !event.nativeEvent.isComposing) setResetRevision(old => old + 1); props.onKeyDown?.(event); }
    }}
    onBlur={event => { setFocused(false); setText(formatted); props.onBlur?.(event); }} />;
}
