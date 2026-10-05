import { createEmptyProject, ProjectHistory, type SourceAsset } from "@cevra/project-ir";
import type { TrimManualVideoClipRequest, CreateManualVideoClipRequest, LocalVideoPreview, LocalVideoPreviewRequest } from "@cevra/application";
import { translate } from "@cevra/i18n";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { DesktopBackend, DesktopBackendState } from "./backend/desktop-backend";
import { App } from "./App";
import { ManualVideoPreview, supportsManualClipPreview } from "./components/ManualVideoPreview";
import { Timeline } from "./components/Timeline";
import { formatMilliseconds } from "./ui-model";

const source: SourceAsset = { id: "original-video", kind: "video", uri: "/tmp/fixture.mp4", displayName: "fixture.mp4", durationMs: 6000 };
const t = (key: Parameters<typeof translate>[1], parameters?: Parameters<typeof translate>[2]) => translate("pt-BR", key, parameters);
const revoke = vi.fn();
let urlSequence = 0;
const admittedPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,decoded-frame");
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(1);
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(1);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => `blob:test-${++urlSequence}`) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
  revoke.mockClear();
});
afterEach(() => { vi.restoreAllMocks(); });

class ManualBackend implements DesktopBackend {
  async editManualVideoSequence(): Promise<never> { throw { code: "MANUAL_VIDEO_UNAVAILABLE" }; }
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
    const clip = request.clipId ? this.history.current.timeline.clips.find(item => item.id === request.clipId) : undefined;
    const start = clip?.sourceStartMs ?? (request.clipId ? 1000 : 0), end = clip?.sourceEndMs ?? (request.clipId ? 4000 : 6000);
    return { sourceId: request.sourceId, snapshotId: request.expectedSnapshotId, durationMs: request.clipId ? end - start : 6000, mimeType: "video/mp4", base64: btoa("transport-test-only"),
      ...(request.clipId ? { initialFrame: {mimeType:'image/png',base64:admittedPng,width:1,height:1,sourceTimeMs:start}, clip: { id: request.clipId, sourceStartMs: start, sourceEndMs: end, firstFrameMs: start, lastFrameMs: Math.max(start, end - 1000 / 30), frameCount: Math.ceil((end - start) * 30 / 1000) } } : {}) };
  }
  async createManualVideoClip(request: CreateManualVideoClipRequest) {
    this.creates.push(request);
    this.history.commit({ type: "track.add", track: { id: "track-v1", kind: "video", name: "V1", locked: false, hidden: false, muted: false } });
    this.history.commit({ type: "clip.add", clip: { id: "manual-clip", sourceId: request.sourceId, trackId: "track-v1", sourceStartMs: request.sourceStartMs, sourceEndMs: request.sourceEndMs,
      timelineStartMs: 0, timelineEndMs: request.sourceEndMs - request.sourceStartMs, speed: 1, volume: 1, opacity: 1 } });
    return { state: await this.loadState(), clipId: "manual-clip" };
  }
  readonly trims: TrimManualVideoClipRequest[] = [];
  async trimManualVideoClip(request: TrimManualVideoClipRequest) {
    this.trims.push(request);
    this.history.commit({ type: "clip.trim", clipId: request.clipId, timelineStartMs: 0, timelineEndMs: request.sourceEndMs - request.sourceStartMs,
      sourceStartMs: request.sourceStartMs, sourceEndMs: request.sourceEndMs });
    return { state: await this.loadState(), clipId: request.clipId };
  }
  async pickAndImportMedia() { return { outcome: "cancelled" as const }; }
  async transcribeSource() { return this.loadState(); }
  async undo() { this.history.undo(); return this.loadState(); }
  async redo() { this.history.redo(); return this.loadState(); }
  async retryCheckpoint(): Promise<never> { throw { code: "PROJECT_PERSISTENCE_UNAVAILABLE" }; }
  async cancelOperation(operationId: string) { return { operationId, cancelled: false }; }
}

async function metadata(container: HTMLElement, duration?: number, initialFrame = true) {
  await waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toMatch(/^blob:/));
  const video = container.querySelector("video")!;
  const excerpt = screen.queryByTestId("preview-clip-timecode")?.textContent?.match(/\/ (\d+):(\d+)\.(\d+)/);
  const effectiveDuration = duration ?? (excerpt ? Number(excerpt[1]) * 60 + Number(excerpt[2]) + Number(excerpt[3]) / 1000 : 6);
  Object.defineProperty(video, "duration", { configurable: true, value: effectiveDuration });
  Object.defineProperty(video, "videoWidth", { configurable: true, value: 1920 });
  Object.defineProperty(video, "videoHeight", { configurable: true, value: 1080 });
  Object.defineProperty(video, "readyState", { configurable: true, value: HTMLMediaElement.HAVE_METADATA });
  fireEvent.loadedMetadata(video);
  if (initialFrame) {
    Object.defineProperty(video, "readyState", { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA });
    fireEvent.loadedData(video);
    if (excerpt) await waitFor(() => expect(container.querySelector(".manual-initial-frame")).not.toBeNull());
    const image = container.querySelector<HTMLImageElement>(".manual-initial-frame");
    if (image) fireEvent.load(image);
  }
  return video;
}

for (const excerpt of [false, true]) {
  it(`waits for the decoded initial frame of ${excerpt ? "the selected clip" : "Original"} without play or clock advancement`, async () => {
    const backend = new ManualBackend();
    const clip = { id: "clip", trackId: "track-v1", sourceId: source.id, timelineStartMs: 0, timelineEndMs: 3000, sourceStartMs: 1000, sourceEndMs: 4000, speed: 1, volume: 1, opacity: 1 };
    const { container } = render(<ManualVideoPreview backend={backend} source={source} snapshotId="initial-frame" clip={excerpt ? clip : undefined}
      timelineOccupied={excerpt} busy={false} seek={{ sequence: 0, timelineMs: 0 }} t={t} onPlayheadChange={vi.fn()} onCreate={vi.fn()} />);
    const video = await metadata(container, excerpt ? 3 : 6, false);
    const play = screen.getByRole("button", { name: "Reproduzir" }) as HTMLButtonElement;
    expect(play.disabled).toBe(true);
    expect(screen.getByText(t("preview.localLoading"))).toBeTruthy();
    expect(video.getAttribute("preload")).toBe("auto");
    expect(video.autoplay).toBe(false);
    expect(video.play).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(0);
    Object.defineProperty(video, "readyState", { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA });
    fireEvent.loadedData(video);
    if (excerpt) {
      expect(play.disabled).toBe(true);
      await waitFor(() => expect(container.querySelector(".manual-initial-frame")).not.toBeNull());
      const image = container.querySelector<HTMLImageElement>(".manual-initial-frame")!;
      expect(image.getAttribute("src")).toBe(`data:image/png;base64,${admittedPng}`);
      fireEvent.load(image);
    }
    expect(play.disabled).toBe(false);
    expect(video.play).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(0);
    expect(screen.getByTestId("preview-timecode").textContent).toBe(excerpt ? "Fonte 00:01.000 / 00:04.000" : "Fonte 00:00.000 / 00:06.000");
    if (excerpt) expect(screen.getByTestId("preview-clip-timecode").textContent).toBe("Trecho 00:00.000 / 00:03.000");
  });
}

it("metadata validation can admit an already buffered initial frame", async () => {
  const { container } = render(<ManualVideoPreview backend={new ManualBackend()} source={source} snapshotId="buffered" timelineOccupied={false} busy={false}
    seek={{ sequence: 0, timelineMs: 0 }} t={t} onPlayheadChange={vi.fn()} onCreate={vi.fn()} />);
  await waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toMatch(/^blob:/));
  const video = container.querySelector("video")!;
  Object.defineProperty(video, "duration", { configurable: true, value: 6 });
  Object.defineProperty(video, "readyState", { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA });
  fireEvent.loadedMetadata(video);
  expect((screen.getByRole("button", { name: "Reproduzir" }) as HTMLButtonElement).disabled).toBe(false);
  expect(video.play).not.toHaveBeenCalled();
});

it("uses a bounded ephemeral decoded excerpt image until playback or a seek leaves its first frame", async () => {
  const backend = new ManualBackend();
  const before = backend.history.toArchive();
  const clip = { id: "clip", trackId: "track-v1", sourceId: source.id, timelineStartMs: 0, timelineEndMs: 3000, sourceStartMs: 1000, sourceEndMs: 4000, speed: 1, volume: 1, opacity: 1 };
  const { container } = render(<ManualVideoPreview backend={backend} source={source} snapshotId="frame-image" clip={clip} timelineOccupied busy={false}
    seek={{ sequence: 1, timelineMs: 0 }} t={t} onPlayheadChange={vi.fn()} onCreate={vi.fn()} />);
  const video = await metadata(container, 3);
  const image = container.querySelector<HTMLImageElement>(".manual-initial-frame")!;
  expect(image.hidden).toBe(false);
  expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
  expect(video.play).not.toHaveBeenCalled();
  fireEvent.play(video);
  expect(image.hidden).toBe(true);
  video.currentTime = 1; fireEvent.timeUpdate(video); fireEvent.pause(video);
  expect(image.hidden).toBe(true);
  video.currentTime = 0; fireEvent.seeking(video);
  expect(image.hidden).toBe(true);
  fireEvent.seeked(video);
  expect(image.hidden).toBe(false);
  expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalled();
  expect(backend.history.toArchive()).toEqual(before);
});

it("admits the supplied frame even when video canvas is black at zero, after image and video readiness", async () => {
  const clip = { id: "clip", trackId: "track-v1", sourceId: source.id, timelineStartMs: 0, timelineEndMs: 3000, sourceStartMs: 1000, sourceEndMs: 4000, speed: 1, volume: 1, opacity: 1 };
  const { container } = render(<ManualVideoPreview backend={new ManualBackend()} source={source} snapshotId="render-turn" clip={clip} timelineOccupied busy={false}
    seek={{ sequence: 0, timelineMs: 0 }} t={t} onPlayheadChange={vi.fn()} onCreate={vi.fn()} />);
  const video = await metadata(container, 3, false), play = screen.getByRole("button", { name: "Reproduzir" }) as HTMLButtonElement;
  Object.defineProperty(video, "readyState", { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA });
  fireEvent.loadedData(video); fireEvent.canPlay(video);
  expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalled();
  expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
  expect(play.disabled).toBe(true);
  fireEvent.load(container.querySelector(".manual-initial-frame")!);
  expect(play.disabled).toBe(false); expect(video.play).not.toHaveBeenCalled(); expect(video.currentTime).toBe(0);
});

it("a stale image load cannot unlock the replacement Original before its metadata", async () => {
  const backend = new ManualBackend(), clip = { id: "clip", trackId: "track-v1", sourceId: source.id, timelineStartMs: 0, timelineEndMs: 3000, sourceStartMs: 1000, sourceEndMs: 4000, speed: 1, volume: 1, opacity: 1 };
  const props = { backend, source, timelineOccupied: true, busy: false, seek: { sequence: 0, timelineMs: 0 }, t, onPlayheadChange: vi.fn(), onCreate: vi.fn() };
  const { container, rerender } = render(<ManualVideoPreview {...props} snapshotId="old-clip" clip={clip} />);
  const video = await metadata(container, 3, false);
  Object.defineProperty(video, "readyState", { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA }); fireEvent.loadedData(video);
  const stale = container.querySelector('.manual-initial-frame')!;
  rerender(<ManualVideoPreview {...props} snapshotId="new-original" />);
  fireEvent.load(stale);
  expect((screen.getByRole("button", { name: "Reproduzir" }) as HTMLButtonElement).disabled).toBe(true);
  expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalled();
  expect(container.querySelector(".manual-initial-frame")).toBeNull();
  await metadata(container, 6);
  expect((screen.getByRole("button", { name: "Reproduzir" }) as HTMLButtonElement).disabled).toBe(false);
  expect(container.querySelector(".manual-initial-frame")).toBeNull();
});

it("retains early image decoding until that same video's metadata and current data arrive",async()=>{
 const clip={id:'clip',trackId:'track-v1',sourceId:source.id,timelineStartMs:0,timelineEndMs:3000,sourceStartMs:1000,sourceEndMs:4000,speed:1,volume:1,opacity:1};
 const {container}=render(<ManualVideoPreview backend={new ManualBackend()} source={source} snapshotId="early-image" clip={clip} timelineOccupied busy={false} seek={{sequence:0,timelineMs:0}} t={t} onPlayheadChange={vi.fn()} onCreate={vi.fn()}/>);
 await waitFor(()=>expect(container.querySelector('.manual-initial-frame')).not.toBeNull());
 fireEvent.load(container.querySelector('.manual-initial-frame')!);
 expect((screen.getByRole('button',{name:'Reproduzir'}) as HTMLButtonElement).disabled).toBe(true);
 const v=await metadata(container,3,false);Object.defineProperty(v,'readyState',{configurable:true,value:HTMLMediaElement.HAVE_CURRENT_DATA});fireEvent.loadedData(v);
 expect((screen.getByRole('button',{name:'Reproduzir'}) as HTMLButtonElement).disabled).toBe(false);
 expect(v.currentTime).toBe(0);expect(v.play).not.toHaveBeenCalled();
});

for(const attack of ['missing','bounds','source-time','signature','decoded-dimensions'])it(`rejects an invalid first-frame packet: ${attack}`,async()=>{
 const backend=new ManualBackend(),original=backend.previewLocalVideo.bind(backend);
 backend.previewLocalVideo=async r=>{const packet=await original(r);if(attack==='missing')delete packet.initialFrame;else if(attack==='bounds')packet.initialFrame!.base64='a'.repeat(2_796_205);else if(attack==='source-time')packet.initialFrame!.sourceTimeMs=999;else if(attack==='signature')packet.initialFrame!.base64=btoa('invalid PNG body');return packet;};
 if(attack==='decoded-dimensions')vi.spyOn(HTMLImageElement.prototype,'naturalWidth','get').mockReturnValue(2);
 const clip={id:'clip',trackId:'track-v1',sourceId:source.id,timelineStartMs:0,timelineEndMs:3000,sourceStartMs:1000,sourceEndMs:4000,speed:1,volume:1,opacity:1};
 const {container}=render(<ManualVideoPreview backend={backend} source={source} snapshotId="bad-packet" clip={clip} timelineOccupied busy={false} seek={{sequence:0,timelineMs:0}} t={t} onPlayheadChange={vi.fn()} onCreate={vi.fn()}/>);
 if(attack==='decoded-dimensions'){await waitFor(()=>expect(container.querySelector('.manual-initial-frame')).not.toBeNull());fireEvent.load(container.querySelector('.manual-initial-frame')!);}
 await screen.findByText(t('preview.localUnavailable'));expect((screen.getByRole('button',{name:'Reproduzir'}) as HTMLButtonElement).disabled).toBe(true);
 expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});

it("keeps the excerpt unavailable if its initial image cannot decode and releases the media", async () => {
  const clip = { id: "clip", trackId: "track-v1", sourceId: source.id, timelineStartMs: 0, timelineEndMs: 3000, sourceStartMs: 1000, sourceEndMs: 4000, speed: 1, volume: 1, opacity: 1 };
  const { container } = render(<ManualVideoPreview backend={new ManualBackend()} source={source} snapshotId="bad-frame-image" clip={clip} timelineOccupied busy={false}
    seek={{ sequence: 0, timelineMs: 0 }} t={t} onPlayheadChange={vi.fn()} onCreate={vi.fn()} />);
  const video = await metadata(container, 3, false);
  Object.defineProperty(video, "readyState", { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA });
  fireEvent.loadedData(video);
  await waitFor(() => expect(container.querySelector(".manual-initial-frame")).not.toBeNull());
  const play = screen.getByRole("button", { name: "Reproduzir" }) as HTMLButtonElement;
  expect(play.disabled).toBe(true);
  fireEvent.error(container.querySelector(".manual-initial-frame")!);
  expect(play.disabled).toBe(true);
  expect(screen.getByText(t("preview.localUnavailable"))).toBeTruthy();
  expect(video.hasAttribute("src")).toBe(false);
  expect(container.querySelector(".manual-initial-frame")).toBeNull();
  expect(revoke).toHaveBeenCalled();
});

it("a frame notification cannot unlock a replacement preview before its own metadata is verified", async () => {
  const backend = new ManualBackend();
  let deliver!: (value: LocalVideoPreview) => void;
  const original = backend.previewLocalVideo.bind(backend);
  backend.previewLocalVideo = async request => request.expectedSnapshotId === "replacement" ? new Promise(resolve => { deliver = resolve; }) : original(request);
  const props = { backend, source, timelineOccupied: false, busy: false, seek: { sequence: 0, timelineMs: 0 }, t, onPlayheadChange: vi.fn(), onCreate: vi.fn() };
  const { container, rerender } = render(<ManualVideoPreview {...props} snapshotId="first" />);
  const video = await metadata(container);
  rerender(<ManualVideoPreview {...props} snapshotId="replacement" />);
  fireEvent.loadedData(video);
  expect((screen.getByRole("button", { name: "Reproduzir" }) as HTMLButtonElement).disabled).toBe(true);
  deliver(await original({ sourceId: source.id, expectedSnapshotId: "replacement" }));
  await metadata(container);
  expect((screen.getByRole("button", { name: "Reproduzir" }) as HTMLButtonElement).disabled).toBe(false);
  expect(video.play).not.toHaveBeenCalled();
});

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

it("derived clip playback starts at zero, maps timeline seek and ends at the bounded media duration", async () => {
  const backend = new ManualBackend(); const onPlayheadChange = vi.fn();
  const clip = { id: "clip", trackId: "track-v1", sourceId: source.id, timelineStartMs: 0, timelineEndMs: 3000, sourceStartMs: 1000, sourceEndMs: 4000, speed: 1, volume: 1, opacity: 1 };
  const props = { backend, source, snapshotId: "snapshot", timelineOccupied: true, busy: false, clip, t, onPlayheadChange, onCreate: vi.fn() };
  const { container, rerender } = render(<ManualVideoPreview {...props} seek={{ sequence: 0, timelineMs: 0 }} />);
  const video = await metadata(container); expect(video.currentTime).toBe(0); fireEvent.seeked(video);
  rerender(<ManualVideoPreview {...props} seek={{ sequence: 1, timelineMs: 1500 }} />);
  expect(video.currentTime).toBe(1.5); fireEvent.seeked(video); expect(onPlayheadChange).toHaveBeenLastCalledWith(1500);
  video.currentTime = 3.1; fireEvent.timeUpdate(video);
  expect(video.pause).toHaveBeenCalled(); expect(video.currentTime).toBe(3); expect(onPlayheadChange).toHaveBeenLastCalledWith(3000);
});

it("shows source milliseconds separately from excerpt elapsed/duration for the reported 2.000–3.990 range", async () => {
  const backend = new ManualBackend(); const onPlayheadChange = vi.fn();
  const clip = { id: "clip", trackId: "track-v1", sourceId: source.id, timelineStartMs: 0, timelineEndMs: 1990, sourceStartMs: 2000, sourceEndMs: 3990, speed: 1, volume: 1, opacity: 1 };
  const props = { backend, source, snapshotId: "snapshot", timelineOccupied: true, busy: false, clip, onPlayheadChange, onCreate: vi.fn(), seek: { sequence: 0, timelineMs: 0 } };
  backend.previewLocalVideo = vi.fn(async (request: LocalVideoPreviewRequest): Promise<LocalVideoPreview> => ({ sourceId: request.sourceId, snapshotId: request.expectedSnapshotId, durationMs: 2000, mimeType: "video/mp4", base64: btoa("transport-test-only"), initialFrame:{mimeType:'image/png',base64:admittedPng,width:1,height:1,sourceTimeMs:2000}, clip: { id: "clip", sourceStartMs: 2000, sourceEndMs: 3990, firstFrameMs: 2000, lastFrameMs: 3966.666667, frameCount: 60 } }));
  const { container, rerender } = render(<ManualVideoPreview {...props} snapshotId="quantized" t={t} />);
  const video = await metadata(container, 2); fireEvent.seeked(video);
  expect(video.currentTime).toBe(0);
  expect(screen.getByTestId("preview-timecode").textContent).toBe("Fonte 00:02.000 / 00:03.990");
  expect(screen.getByTestId("preview-clip-timecode").textContent).toBe("Trecho 00:00.000 / 00:01.990");
  expect(screen.getByText("IN 00:02.000 · OUT 00:03.990")).toBeTruthy();
  expect(screen.getByText(t("preview.boundedClip"))).toBeTruthy();
  video.currentTime = 0.034; fireEvent.timeUpdate(video);
  expect(screen.getByTestId("preview-timecode").textContent).toBe("Fonte 00:02.034 / 00:03.990");
  expect(screen.getByTestId("preview-clip-timecode").textContent).toBe("Trecho 00:00.034 / 00:01.990");
  video.currentTime = 2.01; fireEvent.timeUpdate(video);
  expect(video.pause).toHaveBeenCalled(); expect(video.currentTime).toBe(2);
  expect(onPlayheadChange).toHaveBeenLastCalledWith(1990);
  expect(screen.getByTestId("preview-timecode").textContent).toBe("Fonte 00:03.990 / 00:03.990");
  expect(screen.getByTestId("preview-clip-timecode").textContent).toBe("Trecho 00:01.990 / 00:01.990");
  rerender(<ManualVideoPreview {...props} snapshotId="quantized" t={(key, parameters) => translate("en-US", key, parameters)} />);
  expect(screen.getByTestId("preview-timecode").textContent).toBe("Source 00:03.990 / 00:03.990");
  expect(screen.getByTestId("preview-clip-timecode").textContent).toBe("Excerpt 00:01.990 / 00:01.990");
  expect(screen.getByText(translate("en-US", "preview.boundedClip"))).toBeTruthy();
});

it("formats media milliseconds without assuming fps or losing exact subsecond boundaries", () => {
  expect([0, 1500, 2000, 2034, 3990, 60_001].map(formatMilliseconds)).toEqual([
    "00:00.000", "00:01.500", "00:02.000", "00:02.034", "00:03.990", "01:00.001"
  ]);
});

it("Original proxy keeps marks in the logical source clock despite physical duration padding", async () => {
  const backend = new ManualBackend(), onCreate = vi.fn(async () => {});
  backend.previewLocalVideo = vi.fn(async (request: LocalVideoPreviewRequest): Promise<LocalVideoPreview> => ({ sourceId: source.id, snapshotId: request.expectedSnapshotId, durationMs: 6033,
    proxy: { profile: "take-v1", sourceDurationMs: 6000 }, mimeType: "video/mp4", base64: btoa("proxy") }));
  const { container } = render(<ManualVideoPreview backend={backend} source={source} snapshotId="proxy" timelineOccupied={false} busy={false} seek={{ sequence: 0, timelineMs: 0 }} t={t} onPlayheadChange={vi.fn()} onCreate={onCreate} />);
  const video = await metadata(container, 6.033);
  expect(backend.previewLocalVideo).toHaveBeenCalledWith(expect.objectContaining({ operationId: expect.stringMatching(/^video-preview-/) }));
  expect(screen.getByText(t("preview.proxyHint"))).toBeTruthy();
  video.currentTime = 1.01; fireEvent.click(screen.getByRole("button", { name: "Marcar IN" }));
  video.currentTime = 6.02; fireEvent.click(screen.getByRole("button", { name: "Marcar OUT" }));
  fireEvent.click(screen.getByRole("button", { name: "Criar clip do trecho" }));
  expect(onCreate).toHaveBeenCalledWith({ sourceId: source.id, expectedSnapshotId: "proxy", sourceStartMs: 1010, sourceEndMs: 6000 });
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

async function selectedTrimApp(sourceStartMs = 1000, sourceEndMs = 4000) {
  const backend = new ManualBackend();
  await backend.createManualVideoClip({ sourceId: source.id, expectedSnapshotId: backend.history.current.history.headSnapshotId!, sourceStartMs, sourceEndMs });
  const rendered = render(<App backend={backend} />);
  await metadata(rendered.container);
  fireEvent.click(within(screen.getByTestId("timeline-track-track-v1")).getByRole("button", { name: "Vídeo 1 · fixture.mp4" }));
  await metadata(rendered.container);
  await waitFor(() => expect(screen.getByRole("slider", { name: "Ajustar OUT do clip" }).getAttribute("aria-disabled")).toBe("false"));
  return { backend, ...rendered };
}
function pointer(target: Element, type: string, clientX: number, pointerId = 1) {
  const event = new MouseEvent(type, { bubbles: true, clientX, button: 0 });
  Object.defineProperty(event, "pointerId", { value: pointerId }); fireEvent(target, event);
}
function measureTrim(handle: Element, width: number, visualWidth = width / 2) {
  vi.spyOn(handle.closest(".timeline-width")!, "getBoundingClientRect").mockReturnValue({ left: 0, right: width, width } as DOMRect);
  vi.spyOn(handle.closest(".timeline-trim-clip")!, "getBoundingClientRect").mockReturnValue({ left: 0, right: visualWidth, width: visualWidth } as DOMRect);
}
for (const [zoom, width] of [[70, 700], [180, 1800]]) {
  it(`keeps an initially minimum-width clip's visible OUT stationary at IN pointerdown and drag at zoom ${zoom}`, async () => {
    const { backend } = await selectedTrimApp(2000, 2010);
    fireEvent.change(screen.getByLabelText("Zoom da linha do tempo"), { target: { value: String(zoom) } });
    const handle = screen.getByRole("slider", { name: "Ajustar IN do clip" });
    const bar = handle.closest<HTMLElement>(".timeline-trim-clip")!;
    measureTrim(handle, width, 48);
    pointer(handle, "pointerdown", 100);
    const expectedRight = 100 - 48 / width * 100;
    expect(parseFloat(bar.style.right)).toBeCloseTo(expectedRight);
    pointer(handle, "pointermove", 100 + width / 6000 * 2);
    expect(parseFloat(bar.style.right)).toBeCloseTo(expectedRight);
    expect(handle.getAttribute("aria-valuenow")).toBe("2002");
    expect(screen.getByRole("slider", { name: "Ajustar OUT do clip" }).getAttribute("aria-valuenow")).toBe("2010");
    fireEvent.keyDown(window, { key: "Escape" }); pointer(handle, "pointerup", 100 + width / 6000 * 2);
    expect(bar.style.left).toBe("0%"); expect(bar.style.right).toBe("");
    expect(backend.trims).toHaveLength(0);
  });
  it(`IN drag at zoom ${zoom} keeps OUT visually fixed until release without changing history`, async () => {
    const { backend, container } = await selectedTrimApp();
    fireEvent.change(screen.getByLabelText("Zoom da linha do tempo"), { target: { value: String(zoom) } });
    const handle = screen.getByRole("slider", { name: "Ajustar IN do clip" });
    const bar = handle.closest<HTMLElement>(".timeline-trim-clip")!;
    measureTrim(handle, width);
    const revision = backend.history.current.history.revision;
    expect(bar.style.left).toBe("0%"); expect(bar.style.width).toBe("50%");
    pointer(handle, "pointerdown", 100); pointer(handle, "pointermove", 100 + width / 6);
    // Right anchoring also keeps OUT fixed when minimum visual handle width applies.
    expect(bar.style.left).toBe(""); expect(bar.style.right).toBe("50%");
    expect(parseFloat(bar.style.width)).toBeCloseTo(100 / 3);
    expect(screen.getByRole("slider", { name: "Ajustar OUT do clip" }).getAttribute("aria-valuenow")).toBe("4000");
    expect(backend.history.current.history.revision).toBe(revision); expect(backend.trims).toHaveLength(0);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(bar.style.left).toBe("0%"); expect(bar.style.right).toBe(""); expect(bar.style.width).toBe("50%");
    pointer(handle, "pointerdown", 100); pointer(handle, "pointermove", 100 + width / 6); pointer(handle, "pointerup", 100 + width / 6);
    await waitFor(() => expect(backend.trims).toHaveLength(1));
    expect(backend.trims[0]).toMatchObject({ sourceStartMs: 2000, sourceEndMs: 4000 });
    expect(backend.history.current.timeline.clips[0]?.timelineStartMs).toBe(0);
    expect(bar.style.left).toBe("0%"); expect(bar.style.right).toBe("");
    expect(parseFloat(bar.style.width)).toBeCloseTo(100 / 3);
    expect((await metadata(container)).currentTime).toBe(0);
  });
  it(`trim drag at zoom ${zoom} commits once at release and refreshes preview`, async () => {
    const { backend, container } = await selectedTrimApp();
    fireEvent.change(screen.getByLabelText("Zoom da linha do tempo"), { target: { value: String(zoom) } });
    const handle = screen.getByRole("slider", { name: "Ajustar OUT do clip" });
    measureTrim(handle, width);
    const initialRevision = backend.history.current.history.revision;
    pointer(handle, "pointerdown", 200); pointer(handle, "pointermove", 200 + width / 6);
    expect(handle.getAttribute("aria-valuenow")).toBe("5000");
    expect(backend.trims).toHaveLength(0); expect(backend.history.current.history.revision).toBe(initialRevision);
    pointer(handle, "pointerup", 200 + width / 6);
    await waitFor(() => expect(backend.trims).toHaveLength(1));
    expect(backend.trims[0]).toMatchObject({ clipId: "manual-clip", sourceStartMs: 1000, sourceEndMs: 5000 });
    expect(backend.history.current.history.revision).toBe(initialRevision + 1);
    const video = await metadata(container); expect(video.currentTime).toBe(0);
    video.currentTime = 4.2; fireEvent.timeUpdate(video); expect(video.currentTime).toBe(4);
    await waitFor(() => expect((screen.getByRole("button", { name: "Desfazer" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await waitFor(() => expect(backend.history.current.timeline.clips[0]?.sourceEndMs).toBe(4000)); await metadata(container);
    await waitFor(() => expect((screen.getByRole("button", { name: "Refazer" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Refazer" }));
    await waitFor(() => expect(backend.history.current.timeline.clips[0]?.sourceEndMs).toBe(5000));
    expect((await metadata(container)).currentTime).toBe(0);
  });
}
it("IN keyboard trim supports fine adjustment, bounds and EN parity", async () => {
  const { backend, container } = await selectedTrimApp(); const initial = backend.history.entries.length;
  fireEvent.keyDown(screen.getByRole("slider", { name: "Ajustar IN do clip" }), { key: "ArrowRight", shiftKey: true });
  await waitFor(() => expect(backend.history.current.timeline.clips[0]?.sourceStartMs).toBe(1010));
  expect((await metadata(container)).currentTime).toBe(0);
  await waitFor(() => expect(screen.getByRole("slider", { name: "Ajustar IN do clip" }).getAttribute("aria-disabled")).toBe("false"));
  fireEvent.keyDown(screen.getByRole("slider", { name: "Ajustar IN do clip" }), { key: "Home" });
  await waitFor(() => expect(backend.history.current.timeline.clips[0]?.sourceStartMs).toBe(0)); await metadata(container);
  await waitFor(() => expect(screen.getByRole("slider", { name: "Ajustar IN do clip" }).getAttribute("aria-disabled")).toBe("false"));
  fireEvent.keyDown(screen.getByRole("slider", { name: "Ajustar IN do clip" }), { key: "ArrowLeft" });
  expect(backend.history.entries.length).toBe(initial + 2); expect(backend.trims).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: translate("pt-BR", "top.switchLanguage") }));
  expect(screen.getByRole("slider", { name: "Adjust clip IN" })).toBeTruthy(); expect(screen.getByRole("slider", { name: "Adjust clip OUT" })).toBeTruthy();
});
for (const cancellation of ["escape", "pointercancel", "captureloss", "zoom", "selection", "blur"]) {
  it(`cancels trim draft on ${cancellation} without a command`, async () => {
    const { backend } = await selectedTrimApp(); const handle = screen.getByRole("slider", { name: "Ajustar IN do clip" });
    measureTrim(handle, 600);
    pointer(handle, "pointerdown", 100); pointer(handle, "pointermove", 150); expect(handle.getAttribute("aria-valuenow")).toBe("1500");
    if (cancellation === "escape") fireEvent.keyDown(window, { key: "Escape" });
    if (cancellation === "pointercancel") pointer(handle, "pointercancel", 150);
    if (cancellation === "captureloss") pointer(handle, "lostpointercapture", 150);
    if (cancellation === "zoom") fireEvent.change(screen.getByLabelText("Zoom da linha do tempo"), { target: { value: "180" } });
    if (cancellation === "selection") fireEvent.click(within(screen.getByRole("complementary", { name: "Mídia do projeto" })).getByRole("button", { name: /Vídeo 1/ }));
    if (cancellation === "blur") fireEvent.blur(window);
    pointer(handle, "pointerup", 150); expect(backend.trims).toHaveLength(0); expect(backend.history.current.timeline.clips[0]?.sourceStartMs).toBe(1000);
  });
}
it("rejected trim reports canonical error and preserves preview/history", async () => {
  const { backend, container } = await selectedTrimApp(); const before = backend.history.toArchive();
  backend.trimManualVideoClip = async () => { throw { code: "MANUAL_VIDEO_SOURCE_CHANGED" }; };
  fireEvent.keyDown(screen.getByRole("slider", { name: "Ajustar OUT do clip" }), { key: "ArrowRight" });
  await screen.findByRole("alert"); expect(backend.history.toArchive()).toEqual(before);
  expect(screen.getByRole("slider", { name: "Ajustar OUT do clip" }).getAttribute("aria-valuenow")).toBe("4000"); expect(container.querySelector("video")!.currentTime).toBe(0);
});

it("a pending trim disables handles and history until canonical confirmation", async () => {
  const { backend } = await selectedTrimApp();
  const trim = backend.trimManualVideoClip.bind(backend); let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  backend.trimManualVideoClip = async (request) => { await pending; return trim(request); };
  const handle = screen.getByRole("slider", { name: "Ajustar OUT do clip" });
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(handle.getAttribute("aria-disabled")).toBe("true");
  expect((screen.getByRole("button", { name: "Desfazer" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(backend.trims).toHaveLength(0);
  release(); await waitFor(() => expect(backend.trims).toHaveLength(1));
  expect(backend.history.current.timeline.clips[0]?.sourceEndMs).toBe(4100);
});


it("keeps keyboard focus on the same edge after confirmation without stealing another control's focus", async () => {
  const { backend } = await selectedTrimApp();
  const handle = screen.getByRole("slider", { name: "Ajustar OUT do clip" }) as HTMLButtonElement;
  handle.focus(); fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
  await waitFor(() => expect(backend.history.current.timeline.clips[0]?.sourceEndMs).toBe(4100));
  await waitFor(() => expect(handle.getAttribute("aria-disabled")).toBe("false"));
  expect(document.activeElement).toBe(handle);
  fireEvent.keyDown(document.activeElement!, { key: "ArrowRight", shiftKey: true });
  await waitFor(() => expect(backend.history.current.timeline.clips[0]?.sourceEndMs).toBe(4110));
  expect(document.activeElement).toBe(handle);
  let release!: () => void; const pending = new Promise<void>((resolve) => { release = resolve; });
  const original = backend.trimManualVideoClip.bind(backend); backend.trimManualVideoClip = async (request) => { await pending; return original(request); };
  await waitFor(() => expect(handle.getAttribute("aria-disabled")).toBe("false"));
  fireEvent.keyDown(handle, { key: "ArrowLeft" });
  const zoom = screen.getByLabelText("Zoom da linha do tempo"); zoom.focus(); release();
  await waitFor(() => expect(backend.history.current.timeline.clips[0]?.sourceEndMs).toBe(4010));
  expect(document.activeElement).toBe(zoom);
});

it("preserves a newly selected Original while a trim is awaiting canonical confirmation", async () => {
  const { backend } = await selectedTrimApp(); let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; }); const original = backend.trimManualVideoClip.bind(backend);
  backend.trimManualVideoClip = async (request) => { await pending; return original(request); };
  fireEvent.keyDown(screen.getByRole("slider", { name: "Ajustar OUT do clip" }), { key: "ArrowRight" });
  fireEvent.click(within(screen.getByRole("complementary", { name: "Mídia do projeto" })).getByRole("button", { name: /Vídeo 1/ }));
  expect(screen.getByTestId("app-shell").getAttribute("data-selected-project-item-id")).toBe(source.id);
  release(); await waitFor(() => expect(backend.history.current.timeline.clips[0]?.sourceEndMs).toBe(4100));
  expect(screen.getByTestId("app-shell").getAttribute("data-selected-project-item-id")).toBe(source.id);
  expect(screen.queryByRole("slider", { name: "Ajustar OUT do clip" })).toBeNull();
  expect(screen.getByText("Original")).toBeTruthy();
});

it("preserves a newer Original selection while reconciling a rejected trim's canonical state", async () => {
  const { backend } = await selectedTrimApp(); let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; }); const trim = backend.trimManualVideoClip.bind(backend);
  backend.trimManualVideoClip = async (request) => { await pending; const result = await trim(request); throw { code: "PROJECT_PERSISTENCE_FAILED", reconciledState: result.state }; };
  fireEvent.keyDown(screen.getByRole("slider", { name: "Ajustar OUT do clip" }), { key: "ArrowRight" });
  fireEvent.click(within(screen.getByRole("complementary", { name: "Mídia do projeto" })).getByRole("button", { name: /Vídeo 1/ }));
  release(); await screen.findByRole("alert");
  expect(screen.getByTestId("app-shell").getAttribute("data-project-revision")).toBe(String(backend.history.current.history.revision));
  expect(screen.getByTestId("app-shell").getAttribute("data-selected-project-item-id")).toBe(source.id);
  expect(screen.queryByRole("slider", { name: "Ajustar OUT do clip" })).toBeNull(); expect(screen.getByText("Original")).toBeTruthy();
});

it("trim invalidates pending derived preparation, cancels its operation and ignores the late old range", async () => {
  const backend = new ManualBackend(); let finish!: (value: LocalVideoPreview) => void;
  const clip = { id: "clip", trackId: "v1", sourceId: source.id, sourceStartMs: 2000, sourceEndMs: 3990, timelineStartMs: 0, timelineEndMs: 1990, speed: 1, volume: 1, opacity: 1 };
  const answer = (request: LocalVideoPreviewRequest, start: number): LocalVideoPreview => ({ sourceId: source.id, snapshotId: request.expectedSnapshotId, durationMs: 3990 - start, mimeType: "video/mp4", base64: btoa("derived"), initialFrame:{mimeType:'image/png',base64:admittedPng,width:1,height:1,sourceTimeMs:start}, clip: { id: "clip", sourceStartMs: start, sourceEndMs: 3990, firstFrameMs: start, lastFrameMs: 3966, frameCount: 40 } });
  const requests: LocalVideoPreviewRequest[] = [];
  backend.previewLocalVideo = async request => { requests.push(request); return request.expectedSnapshotId === "old" ? new Promise(resolve => { finish = resolve; }) : answer(request, 2500); };
  backend.cancelOperation = vi.fn(async operationId => ({ operationId, cancelled: true }));
  const props = { backend, source, timelineOccupied: true, busy: false, clip, t, onPlayheadChange: vi.fn(), onCreate: vi.fn(), seek: { sequence: 0, timelineMs: 0 } };
  const { container, rerender } = render(<ManualVideoPreview {...props} snapshotId="old" />);
  rerender(<ManualVideoPreview {...props} clip={{ ...clip, sourceStartMs: 2500, timelineEndMs: 1490 }} snapshotId="new" />);
  await metadata(container, 1.49); const current = container.querySelector("video")!.getAttribute("src");
  expect(backend.cancelOperation).toHaveBeenCalledWith(requests[0]!.operationId); expect(requests[1]!.operationId).not.toBe(requests[0]!.operationId);
  finish(answer(requests[0]!, 2000)); await waitFor(() => expect(container.querySelector("video")!.getAttribute("src")).toBe(current));
  expect(screen.getByText("IN 00:02.500 · OUT 00:03.990")).toBeTruthy();
});

it("selected clip never admits original bytes or a mismatched range as its derived preview", async () => {
  const backend = new ManualBackend();
  backend.previewLocalVideo = async request => ({ sourceId: source.id, snapshotId: request.expectedSnapshotId, durationMs: 6000, mimeType: "video/mp4", base64: btoa("original") });
  const clip = { id: "clip", trackId: "v1", sourceId: source.id, sourceStartMs: 2000, sourceEndMs: 3990, timelineStartMs: 0, timelineEndMs: 1990, speed: 1, volume: 1, opacity: 1 };
  const { container } = render(<ManualVideoPreview backend={backend} source={source} snapshotId="snapshot" clip={clip} timelineOccupied busy={false} seek={{ sequence: 0, timelineMs: 0 }} t={t} onPlayheadChange={vi.fn()} onCreate={vi.fn()} />);
  await screen.findByText(t("preview.localChanged")); expect(container.querySelector("video")!.hasAttribute("src")).toBe(false);
  expect((screen.getByRole("button", { name: "Reproduzir" }) as HTMLButtonElement).disabled).toBe(true);
});
