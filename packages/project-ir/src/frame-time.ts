import type { ClipFrameTimingV1 } from "./types.js";

export const CFR30_FRAMES_PER_SECOND = 30 as const;
// Keep the integer numerator exact before its single division by 30.
export const MAX_CFR30_FRAME = Math.floor(Number.MAX_SAFE_INTEGER / 1000);

export function isCfr30Frame(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    && !Object.is(value, -0) && value <= MAX_CFR30_FRAME;
}

export function framesToMilliseconds(frame: number): number {
  if (!isCfr30Frame(frame)) throw new Error("CFR30 frame must be a bounded non-negative safe integer.");
  return frame * 1000 / CFR30_FRAMES_PER_SECOND;
}

function fractionalFrames(milliseconds: number): number {
  if (!Number.isFinite(milliseconds) || milliseconds < 0 || Object.is(milliseconds, -0)
    || milliseconds > framesToMilliseconds(MAX_CFR30_FRAME)) throw new Error("Milliseconds exceed the CFR30 clock.");
  return milliseconds * CFR30_FRAMES_PER_SECOND / 1000;
}

/** Explicit review/input conversion only; never a schema migration or export repair. */
export function nearestMsToFrames(milliseconds: number): number {
  const frame = Math.round(fractionalFrames(milliseconds));
  if (!isCfr30Frame(frame)) throw new Error("Milliseconds exceed the CFR30 clock.");
  return frame;
}

export function floorMsToFrames(milliseconds: number): number {
  let frame = Math.floor(fractionalFrames(milliseconds));
  while (frame > 0 && framesToMilliseconds(frame) > milliseconds) frame -= 1;
  while (frame < MAX_CFR30_FRAME && framesToMilliseconds(frame + 1) <= milliseconds) frame += 1;
  return frame;
}

export function frameTimingMilliseconds(timing: ClipFrameTimingV1): {
  timelineStartMs: number; timelineEndMs: number; sourceStartMs: number; sourceEndMs: number;
} {
  return {
    timelineStartMs: framesToMilliseconds(timing.timelineStartFrame),
    timelineEndMs: framesToMilliseconds(timing.timelineEndFrame),
    sourceStartMs: framesToMilliseconds(timing.sourceStartFrame),
    sourceEndMs: framesToMilliseconds(timing.sourceEndFrame)
  };
}
