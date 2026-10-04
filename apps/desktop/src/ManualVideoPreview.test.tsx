import { createEmptyProject, ProjectHistory, type SourceAsset } from "@cevra/project-ir";
import type { CreateManualVideoClipRequest, LocalVideoPreview, LocalVideoPreviewRequest } from "@cevra/application";
import { translate } from "@cevra/i18n";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { DesktopBackend, DesktopBackendState } from "./backend/desktop-backend";
import { App } from "./App";
import { ManualVideoPreview, supportsManualClipPreview } from "./components/ManualVideoPreview";
import { Timeline } from "./components/Timeline";

const source: SourceAsset = { id: "original-video", kind: "video", uri: "/tmp/fixture.mp4", displayName: "fixture.mp4", durationMs: 6000 };
const t = (key: Parameters<typeof translate>[1]) => translate("pt-BR", key);
const revoke = vi.fn();
let urlSequence = 0;

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => `blob:test-${++urlSequence}`) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
  revoke.mockClear();
});
afterEach(() => { vi.restoreAllMocks(); });

class ManualBackend implements DesktopBackend {
  readonly adapterName = "ManualTestBackend";
  readonly presentationOnly = false;
  readonly history = new ProjectHistory(createEmptyProject({ id: "manual-ui" }));
  readonly creates: CreateManualVideoClipRequest[] = [];
  constructor() { this.history.commit({ type: "source.add", source }); }
  async loadState(): Promise<DesktopBackendState> {
    const unavailable = { available: false, reason: "desktop-runtime-deferred" as const };
    return { project: this.history.current, sourceNumbering: this.history.sourceNumbering, canUndo: this.history.canUndo, canRedo: this.history.canRedo,
      status: "local-unsaved", capabilities: { "media.import": unavailable, "transcription.transcribe": unavailable, "director.execute": unavailable, "changes.apply": unavailable, "project.export": unavailable } };
  }
  async loadEditorialDraft() { return { status: "empty" as const }; }
  async reviseEditorialDraft(): Promise<never> { throw { code: "EDITORIAL_DRAFT_UNAVAILABLE" }; }
  async previewLocalVideo(request: LocalVideoPreviewRequest): Promise<LocalVideoPreview> {
    return { sourceId: request.sourceId, snapshotId: request.expectedSnapshotId, durationMs: 6000, mimeType: "video/mp4", base64: btoa("transport-test-only") };
  }
  async createManualVideoClip(request: CreateManualVideoClipRequest) {
    this.creates.push(request);
    this.history.commit({ type: "track.add", track: { id: "track-v1", kind: "video", name: "V1", locked: false, hidden: false, muted: false } });
    this.history.commit({ type: "clip.add", clip: { id: "manual-clip", sourceId: request.sourceId, trackId: "track-v1", sourceStartMs: request.sourceStartMs, sourceEndMs: request.sourceEndMs,
      timelineStartMs: 0, timelineEndMs: request.sourceEndMs - request.sourceStartMs, speed: 1, volume: 1, opacity: 1 } });
    return { state: await this.loadState(), clipId: "manual-clip" };
  }
  async pickAndImportMedia() { return { outcome: "cancelled" as const }; }
  async transcribeSource() { return this.loadState(); }
  async undo() { this.history.undo(); return this.loadState(); }
  async redo() { this.history.redo(); return this.loadState(); }
  async cancelOperation(operationId: string) { return { operationId, cancelled: false }; }
}

async function metadata(container: HTMLElement, duration = 6) {
  await waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toMatch(/^blob:/));
  const video = container.querySelector("video")!;
  Object.defineProperty(video, "duration", { configurable: true, value: duration });
  fireEvent.loadedMetadata(video);
  return video;
}

it("marks from the actual media clock, creates a visible clip and verifies undo/redo in the same UI", async () => {
  const backend = new ManualBackend(); const { container } = render(<App backend={backend} />);
  const create = () => screen.getByRole("button", { name: "Criar clip do trecho" }) as HTMLButtonElement;
  expect((await screen.findByRole("button", { name: "Criar clip do trecho" }) as HTMLButtonElement).disabled).toBe(true);
  const video = await metadata(container);
  await waitFor(() => expect((screen.getByRole("button", { name: "Marcar IN" }) as HTMLButtonElement).disabled).toBe(false));
  video.currentTime = 1.25; fireEvent.timeUpdate(video);
  fireEvent.click(screen.getByRole("button", { name: "Marcar IN" }));
  expect(create().disabled).toBe(true);
  video.currentTime = 3.75; fireEvent.timeUpdate(video);
  fireEvent.click(screen.getByRole("button", { name: "Marcar OUT" }));
  expect(create().disabled).toBe(false);
  fireEvent.click(create());
  await waitFor(() => expect(backend.creates).toHaveLength(1));
  expect(backend.creates[0]).toMatchObject({ sourceId: source.id, sourceStartMs: 1250, sourceEndMs: 3750 });
  const track = await screen.findByTestId("timeline-track-track-v1");
  expect(within(track).getByRole("button", { name: "Vídeo 1 · fixture.mp4" })).toBeTruthy();
  expect(backend.history.current.timeline.durationMs).toBe(2500);
  await waitFor(() => expect((screen.getByRole("button", { name: "Desfazer" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
  await waitFor(() => expect(within(track).queryByRole("button", { name: "Vídeo 1 · fixture.mp4" })).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Refazer" }));
  await waitFor(() => expect(within(track).getByRole("button", { name: "Vídeo 1 · fixture.mp4" })).toBeTruthy());
  expect(backend.history.current.sources[0]).toEqual(source);
  expect(revoke).toHaveBeenCalled();
});

it("requires metadata and completed seek before marking and rejects inverted marks locally", async () => {
  const backend = new ManualBackend();
  const props = { backend, source, snapshotId: "snapshot", timelineOccupied: false, busy: false,
    seek: { sequence: 0, timelineMs: 0 }, t, onPlayheadChange: vi.fn(), onCreate: vi.fn() };
  const { container, rerender } = render(<ManualVideoPreview {...props} />);
  expect((screen.getByRole("button", { name: "Marcar IN" }) as HTMLButtonElement).disabled).toBe(true);
  const video = await metadata(container);
  video.currentTime = 4; fireEvent.seeking(video);
  expect((screen.getByRole("button", { name: "Marcar IN" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.seeked(video); fireEvent.click(screen.getByRole("button", { name: "Marcar IN" }));
  video.currentTime = 2; fireEvent.timeUpdate(video); fireEvent.click(screen.getByRole("button", { name: "Marcar OUT" }));
  expect((screen.getByRole("button", { name: "Criar clip do trecho" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(t("preview.rangeInvalid"))).toBeTruthy();
  video.currentTime = 5; fireEvent.timeUpdate(video); fireEvent.click(screen.getByRole("button", { name: "Marcar OUT" }));
  const create = screen.getByRole("button", { name: "Criar clip do trecho" }) as HTMLButtonElement;
  expect(create.disabled).toBe(false);
  fireEvent.seeking(video); expect(create.disabled).toBe(true);
  fireEvent.seeked(video); expect(create.disabled).toBe(false);
  rerender(<ManualVideoPreview {...props} busy />); expect(create.disabled).toBe(true);
  rerender(<ManualVideoPreview {...props} />); expect(create.disabled).toBe(false);
  expect(props.onCreate).not.toHaveBeenCalled();
});

it("clip playback starts at canonical IN, maps timeline seek and pauses at OUT", async () => {
  const backend = new ManualBackend(); const onPlayheadChange = vi.fn();
  const clip = { id: "clip", trackId: "track-v1", sourceId: source.id, timelineStartMs: 0, timelineEndMs: 3000, sourceStartMs: 1000, sourceEndMs: 4000, speed: 1, volume: 1, opacity: 1 };
  const props = { backend, source, snapshotId: "snapshot", timelineOccupied: true, busy: false, clip, t, onPlayheadChange, onCreate: vi.fn() };
  const { container, rerender } = render(<ManualVideoPreview {...props} seek={{ sequence: 0, timelineMs: 0 }} />);
  const video = await metadata(container); expect(video.currentTime).toBe(1); fireEvent.seeked(video);
  rerender(<ManualVideoPreview {...props} seek={{ sequence: 1, timelineMs: 1500 }} />);
  expect(video.currentTime).toBe(2.5); fireEvent.seeked(video); expect(onPlayheadChange).toHaveBeenLastCalledWith(1500);
  video.currentTime = 4.1; fireEvent.timeUpdate(video);
  expect(video.pause).toHaveBeenCalled(); expect(video.currentTime).toBe(4); expect(onPlayheadChange).toHaveBeenLastCalledWith(3000);
});

it("revokes old Blob URLs and ignores a late response from a replaced snapshot", async () => {
  const backend = new ManualBackend(); let finish!: (value: LocalVideoPreview) => void;
  const original = backend.previewLocalVideo.bind(backend);
  backend.previewLocalVideo = vi.fn(async (request) => request.expectedSnapshotId === "old" ? new Promise<LocalVideoPreview>((resolve) => { finish = resolve; }) : original(request));
  const props = { backend, source, timelineOccupied: false, busy: false, seek: { sequence: 0, timelineMs: 0 }, t, onPlayheadChange: vi.fn(), onCreate: vi.fn() };
  const { container, rerender, unmount } = render(<ManualVideoPreview {...props} snapshotId="old" />);
  rerender(<ManualVideoPreview {...props} snapshotId="new" />);
  await metadata(container); const currentUrl = container.querySelector("video")!.getAttribute("src");
  finish(await original({ sourceId: source.id, expectedSnapshotId: "old" }));
  await waitFor(() => expect(container.querySelector("video")!.getAttribute("src")).toBe(currentUrl));
  unmount(); expect(revoke).toHaveBeenCalledWith(currentUrl);
});

it("metadata disagreement and decoder failures disable marks and release the source", async () => {
  const backend = new ManualBackend(); const { container } = render(<ManualVideoPreview backend={backend} source={source} snapshotId="snapshot" timelineOccupied={false} busy={false}
    seek={{ sequence: 0, timelineMs: 0 }} t={t} onPlayheadChange={vi.fn()} onCreate={vi.fn()} />);
  await metadata(container, 8);
  expect(screen.getByText(t("preview.localUnavailable"))).toBeTruthy();
  expect((screen.getByRole("button", { name: "Marcar IN" }) as HTMLButtonElement).disabled).toBe(true);
  expect(container.querySelector("video")!.hasAttribute("src")).toBe(false); expect(revoke).toHaveBeenCalled();
});

for (const [zoom, measuredWidth] of [[70, 1000], [180, 1800]]) {
  it(`timeline seek uses measured content width at zoom ${zoom}`, () => {
    const project = createEmptyProject({ id: "timeline-geometry" }); project.timeline.durationMs = 60000;
    const onPlayheadChange = vi.fn();
    render(<Timeline project={project} presentations={new Map()} selectedId={null} playheadMs={0} zoom={zoom} t={t}
      onSelect={vi.fn()} onPlayheadChange={onPlayheadChange} onZoomChange={vi.fn()} onResizeStart={vi.fn()} />);
    const ruler = screen.getByRole("slider", { name: "Régua e cursor da linha do tempo" });
    vi.spyOn(ruler, "getBoundingClientRect").mockReturnValue({ left: 50, width: 1000 } as DOMRect);
    vi.spyOn(ruler.querySelector(".timeline-width")!, "getBoundingClientRect").mockReturnValue({ left: 50, width: measuredWidth } as DOMRect);
    fireEvent(ruler, new MouseEvent("pointerdown", { bubbles: true, clientX: 50 + measuredWidth / 2 }));
    expect(onPlayheadChange).toHaveBeenLastCalledWith(30000);
  });
}

it("preexisting speed/muted-track edits fall back explicitly to Original without claiming a composed clip", async () => {
  const backend = new ManualBackend();
  await backend.createManualVideoClip({ sourceId: source.id, expectedSnapshotId: backend.history.current.history.headSnapshotId!, sourceStartMs: 1000, sourceEndMs: 4000 });
  const canonical = backend.history.current; const clip = canonical.timeline.clips[0]!;
  expect(supportsManualClipPreview(canonical, clip)).toBe(true);
  expect(supportsManualClipPreview(canonical, { ...clip, speed: 2, timelineEndMs: 1500 })).toBe(false);
  expect(supportsManualClipPreview(canonical, { ...clip, opacity: 0.5 })).toBe(false);
  expect(supportsManualClipPreview({ ...canonical, timeline: { ...canonical.timeline, tracks: canonical.timeline.tracks.map(track => ({ ...track, muted: true })) } }, clip)).toBe(false);
  const unsupported = { ...canonical, timeline: { ...canonical.timeline, durationMs: 1500, clips: [{ ...clip, speed: 2, timelineEndMs: 1500 }] } };
  const load = backend.loadState.bind(backend);
  backend.loadState = async () => ({ ...await load(), project: unsupported });
  const { container } = render(<App backend={backend} />);
  await metadata(container);
  fireEvent.click(within(screen.getByTestId("timeline-track-track-v1")).getByRole("button", { name: "Vídeo 1 · fixture.mp4" }));
  await metadata(container);
  expect(screen.getByText(t("preview.unsupportedClip"))).toBeTruthy();
  expect(screen.getByText("Original")).toBeTruthy();
  expect(container.querySelector("video")!.currentTime).toBe(0);
});
