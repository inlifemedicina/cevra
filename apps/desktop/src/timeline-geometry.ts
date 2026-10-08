export function trailingTimelineMs(durationMs: number): number {
  return Math.min(10_000, Math.max(1000, durationMs / 10));
}
export function timelineGeometry(durationMs: number, viewportPx: number, pixelsPerSecond: number) {
  const scale = Math.max(0.001, pixelsPerSecond);
  const width = Math.max(1, viewportPx, (durationMs + trailingTimelineMs(durationMs)) / 1000 * scale);
  return { width, duration: width / scale * 1000 };
}
/** Frame-aligned ticks with enough room for mm:ss:ff. Work is bounded to the visible viewport. */
export function timelineRulerTicks(durationMs: number, pixelsPerSecond: number, scrollPx: number, viewportPx: number): number[] {
  const minimumFrames = Math.max(1, Math.ceil(90 / pixelsPerSecond * 30));
  const steps = [1, 2, 5, 10, 15, 30, 60, 150, 300, 450, 900, 1800, 4500, 9000, 18000, 45000, 90000];
  const step = steps.find(value => value >= minimumFrames) ?? Math.ceil(minimumFrames / 90000) * 90000;
  const first = Math.max(0, Math.floor(scrollPx / pixelsPerSecond * 30 / step));
  const last = Math.min(Math.floor(durationMs / 1000 * 30 / step), Math.ceil((scrollPx + viewportPx) / pixelsPerSecond * 30 / step));
  return Array.from({ length: Math.min(128, Math.max(0, last - first + 1)) }, (_, index) => (first + index) * step);
}
