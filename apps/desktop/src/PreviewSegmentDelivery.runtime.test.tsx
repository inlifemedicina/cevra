import { readFileSync, writeFileSync } from "node:fs";
import { act, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ProjectIR, TimelineClip } from "@cevra/project-ir";
import { resolveManualVideoSequence, type LocalVideoPreview } from "@cevra/application";
import type { DesktopBackend } from "./backend/desktop-backend";
import { ManualVideoPreview } from "./components/ManualVideoPreview";

// Explicit offline delivery catalog. Packets are real exact-runtime Host
// responses. jsdom supplies no native decoding, paint or perceptual evidence.
const input = process.env.CEVRA_PREVIEW_SEGMENT_UI_RECEIPT;
it.skipIf(!input)("delivers actual Host preview bytes to the current React/Blob/PNG consumer and rejects a late prior snapshot", async () => {
  const deliveries = JSON.parse(readFileSync(input!, "utf8")) as { name: string; packet: LocalVideoPreview; project: ProjectIR; hostWallMs: number }[];
  const rows: { name: string; hostWallMs: number; responseToDomMs: number; videoBytes: number; pngBytes: number }[] = [];
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  let urlSerial = 0;
  const createUrl = vi.fn((blob: Blob) => { expect(blob.size).toBeGreaterThan(0); return `blob:actual-delivery-${++urlSerial}`; });
  const revoke = vi.fn();
  const previousCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL"), previousRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createUrl });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
  function props(delivery: typeof deliveries[number], backend: DesktopBackend) {
    const { project, packet } = delivery, clips = resolveManualVideoSequence(project, packet.snapshotId);
    const clip: TimelineClip = { ...clips[0]!, id: "continuous-program-preview", sourceStartMs: 0, sourceEndMs: packet.durationMs,
      timelineStartMs: 0, timelineEndMs: packet.durationMs, frameTiming: { version: 1, timelineStartFrame: 0,
        timelineEndFrame: packet.sequence!.totalFrames, sourceStartFrame: 0, sourceEndFrame: packet.sequence!.totalFrames } };
    return { backend, source: project.sources.find(s => s.id === packet.sourceId), snapshotId: packet.snapshotId, clip,
      sequencePreview: clips, timelineOccupied: true, sequenceEditing: true, frameEditing: true, busy: false,
      seek: { sequence: 0, timelineMs: 0 }, t: (key: string) => key, onPlayheadChange: vi.fn(), onCreate: vi.fn(),
      program: { durationMs: packet.durationMs, resume: false, onPlaybackIntent: vi.fn(), onSeek: vi.fn(), onClipEnd: vi.fn() } };
  }
  try {
    for (const delivery of deliveries) {
      let release!: (packet: LocalVideoPreview) => void;
      const request = vi.fn(() => new Promise<LocalVideoPreview>(resolve => { release = resolve; }));
      const backend = { previewLocalVideo: request, cancelOperation: vi.fn().mockResolvedValue(undefined) } as unknown as DesktopBackend;
      const { container, unmount } = render(<ManualVideoPreview {...props(delivery, backend)} />);
      expect(request).toHaveBeenCalledTimes(1);
      expect(container.querySelector("video")!.getAttribute("src")).toBeNull();
      const started = performance.now();
      await act(async () => { release(delivery.packet); });
      const responseToDomMs = performance.now() - started, video = container.querySelector("video")!, image = container.querySelector("img.manual-initial-frame")!;
      expect(video.getAttribute("src")).toMatch(/^blob:actual-delivery-/);
      expect(image.getAttribute("src")).toBe(`data:image/png;base64,${delivery.packet.initialFrame!.base64}`);
      expect((container.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
      // No loadedmetadata/canplay/load events are synthesized. Native readiness
      // must stay false, even after actual bytes reach the consumer.
      const blob = createUrl.mock.calls.at(-1)![0];
      expect(blob.size).toBe(atob(delivery.packet.base64).length);
      rows.push({ name: delivery.name, hostWallMs: delivery.hostWallMs, responseToDomMs,
        videoBytes: blob.size, pngBytes: atob(delivery.packet.initialFrame!.base64).length });
      unmount(); expect(revoke).toHaveBeenCalledWith(video.getAttribute("src") ?? createUrl.mock.results.at(-1)!.value);
    }
    const previous = deliveries.find(d => d.name === "cold")!, current = deliveries.find(d => d.name === "reorder")!;
    expect(previous.packet.snapshotId).not.toBe(current.packet.snapshotId);
    const pending = new Map<string, (packet: LocalVideoPreview) => void>();
    const backend = { previewLocalVideo: vi.fn((request: { expectedSnapshotId: string }) => new Promise<LocalVideoPreview>(resolve => pending.set(request.expectedSnapshotId, resolve))),
      cancelOperation: vi.fn().mockResolvedValue(undefined) } as unknown as DesktopBackend;
    const { container, rerender, unmount } = render(<ManualVideoPreview {...props(previous, backend)} />);
    const count = createUrl.mock.calls.length;
    rerender(<ManualVideoPreview {...props(current, backend)} />);
    await act(async () => { pending.get(previous.packet.snapshotId)!(previous.packet); });
    expect(createUrl.mock.calls).toHaveLength(count); expect(container.querySelector("video")!.getAttribute("src")).toBeNull();
    await act(async () => { pending.get(current.packet.snapshotId)!(current.packet); });
    expect(createUrl.mock.calls).toHaveLength(count + 1);
    expect(container.querySelector("img")!.getAttribute("src")).toContain(current.packet.initialFrame!.base64);
    unmount();
    const receipt = { status: "PASS", scope: "actual Host packet to React/Blob/PNG DOM attributes",
      rows, currentSnapshotOnly: true, staleResponseDiscarded: true, nativeReadinessRemainedDisabled: true,
      nativeDecodeOrPaintProved: false, perceivedLatencyProved: false };
    if (process.env.CEVRA_PREVIEW_SEGMENT_UI_RESULT) writeFileSync(process.env.CEVRA_PREVIEW_SEGMENT_UI_RESULT, JSON.stringify(receipt, null, 2) + "\n");
    console.log(JSON.stringify(receipt));
  } finally {
    vi.restoreAllMocks();
    for (const [key, descriptor] of [["createObjectURL", previousCreate], ["revokeObjectURL", previousRevoke]] as const) {
      if (descriptor) Object.defineProperty(URL, key, descriptor); else Reflect.deleteProperty(URL, key);
    }
  }
}, 30000);
