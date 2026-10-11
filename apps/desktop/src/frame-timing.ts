import { floorMsToFrames, framesToMilliseconds, nearestMsToFrames, isCfr30Frame, MAX_CFR30_FRAME } from "@cevra/project-ir";

export { floorMsToFrames, framesToMilliseconds, nearestMsToFrames, isCfr30Frame, MAX_CFR30_FRAME };

import { formatTime } from "./ui-model";

export function formatFrames(frame: number, durationMs?: number): string {
  return formatTime(framesToMilliseconds(frame), durationMs);
}

export function frameInput(value: string): number | null {
  if (!value.trim()) return null;
  const frame = Number(value);
  return isCfr30Frame(frame) ? frame : null;
}

/** The source may retain a larger legacy duration than the bounded frame clock. */
export function maximumSourceFrame(durationMs: number): number {
  return floorMsToFrames(Math.min(durationMs, framesToMilliseconds(MAX_CFR30_FRAME)));
}

/** A visible input draft conversion; never used to repair a stored timeline. */
export function snapSourceMark(milliseconds: number, durationMs: number) {
  const frame = Math.min(maximumSourceFrame(durationMs), nearestMsToFrames(Math.min(milliseconds, framesToMilliseconds(MAX_CFR30_FRAME))));
  const projectedMs = framesToMilliseconds(frame);
  return { frame, projectedMs, deltaMs: projectedMs - milliseconds };
}
