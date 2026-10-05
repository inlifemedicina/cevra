import { ManualVideoSequenceApplicationService, type ManualVideoSequenceEdit, type SourceContentIdentityPort } from "@cevra/application";
import { createEmptyProject, ProjectHistory, type SourceAsset } from "@cevra/project-ir";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { ManualVideoPreview } from "./components/ManualVideoPreview";
import { translate } from "@cevra/i18n";
import type { DesktopBackend, DesktopBackendState } from "./backend/desktop-backend";

const originals: SourceAsset[] = ["s0", "s1"].map(id => ({
  id, kind: "video", uri: `/tmp/offline-ui-${id}.mp4`, displayName: `${id}.mp4`, durationMs: 6000,
  technicalDescriptor: { version: 1, basis: "ingest", content: { sha256: "a".repeat(64), sizeBytes: 10 },
    method: { profile: "cevra.source-technical.v1", engineId: "test", engineVersion: "1", engineApiVersion: 1 }, video: { codec: "h264" } },
  extensions: { "cevra.ingest": { method: "local", hasVideo: true } }
}));
class SequenceBackend implements DesktopBackend {
  readonly adapterName = "OfflineSequenceTest";
  readonly presentationOnly = false;
  readonly history = new ProjectHistory(createEmptyProject({ id: "sequence-ui" }));
  readonly requests: ManualVideoSequenceEdit[] = [];
  beforeEdit: () => Promise<void> = async () => {};
  private occurrence = 0;
  private readonly identity: SourceContentIdentityPort = {
    async captureSource(uri) { return { version: 1, uri, canonicalPath: uri, device: "1", inode: "1", sizeBytes: 10, mtimeNs: "1", ctimeNs: "1" }; },
    async identifySource(_uri, stamp) { return { version: 1, content: { sha256: "a".repeat(64), sizeBytes: 10 }, stamp, bytesRead: 10 }; },
    async checkSource() { return "match"; }
  };
  readonly service = new ManualVideoSequenceApplicationService({ history: this.history, identity: this.identity, idGenerator: () => String(++this.occurrence) });
  constructor() { for (const source of originals) this.history.commit({ type: "source.add", source }); }
  async loadState(): Promise<DesktopBackendState> {
    const unavailable = { available: false, reason: "desktop-runtime-deferred" as const };
    return { project: this.history.current, sourceNumbering: this.history.sourceNumbering, canUndo: this.history.canUndo, canRedo: this.history.canRedo, status: "local-unsaved",
      capabilities: { "media.import": unavailable, "transcription.transcribe": unavailable, "director.execute": unavailable, "changes.apply": unavailable, "project.export": unavailable } };
  }
  async editManualVideoSequence(request: ManualVideoSequenceEdit) {
    this.requests.push(structuredClone(request)); await this.beforeEdit();
    const result = await this.service.edit(request);
    return { state: await this.loadState(), changedClipIds: result.changedClipIds };
  }
  async loadEditorialDraft() { return { status: "empty" as const }; }
  async reviseEditorialDraft(): Promise<never> { throw { code: "EDITORIAL_DRAFT_UNAVAILABLE" }; }
  async previewLocalVideo(): Promise<never> { throw { code: "MANUAL_VIDEO_UNAVAILABLE" }; }
  async createManualVideoClip(): Promise<never> { throw { code: "MANUAL_VIDEO_UNAVAILABLE" }; }
  async trimManualVideoClip(): Promise<never> { throw { code: "MANUAL_VIDEO_UNAVAILABLE" }; }
  async pickAndImportMedia() { return { outcome: "cancelled" as const }; }
  async transcribeSource() { return this.loadState(); }
  async undo() { this.history.undo(); return this.loadState(); }
  async redo() { this.history.redo(); return this.loadState(); }
  async retryCheckpoint(): Promise<never> { throw { code: "PROJECT_PERSISTENCE_UNAVAILABLE" }; }
  async cancelOperation(operationId: string) { return { operationId, cancelled: false }; }
}
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function controls() { return within(screen.getByRole("region", { name: "Controles da montagem" })); }
function range(start: string, end: string) {
  fireEvent.change(controls().getByLabelText("IN (segundos)"), { target: { value: start } });
  fireEvent.change(controls().getByLabelText("OUT (segundos)"), { target: { value: end } });
}
function clips(backend: SequenceBackend) { return [...backend.history.current.timeline.clips].sort((a, b) => a.timelineStartMs - b.timelineStartMs); }
async function action(backend: SequenceBackend, label: string) {
  const count = backend.requests.length, entries = backend.history.entries.length;
  await waitFor(() => expect(controls().getByRole("button", { name: label }).matches(":disabled")).toBe(false));
  fireEvent.click(controls().getByRole("button", { name: label }));
  await waitFor(() => expect(backend.history.entries.length).toBe(entries + 1));
  await waitFor(() => expect(controls().getByRole("combobox", { name: "Fonte" }).matches(":disabled")).toBe(false));
  expect(backend.requests.length).toBe(count + 1);
}
async function mount(backend = new SequenceBackend()) {
  const rendered = render(<App backend={backend} />);
  await waitFor(() => expect(controls().getByRole("combobox", { name: "Fonte" }).matches(":disabled")).toBe(false));
  return { backend, ...rendered };
}

it("assembles four retained source ranges through UI with one Undo per action and unchanged source numbering", async () => {
  const { backend, container } = await mount();
  const numbering = structuredClone(backend.history.sourceNumbering);
  range("0", "0.7"); await action(backend, "Adicionar trecho ao final");
  const first = clips(backend)[0]!.id;
  range("0.9", "1.5"); await action(backend, "Adicionar trecho ao final");
  const firstButton = container.querySelector('[data-testid="timeline-track-track-v1"] .timeline-item')!;
  fireEvent.click(firstButton);
  await action(backend, "Duplicar selecionado"); await action(backend, "Mover para depois");
  fireEvent.change(controls().getByRole("combobox", { name: "Fonte" }), { target: { value: "s1" } });
  range("0.3", "1"); await action(backend, "Adicionar trecho ao final");
  expect(clips(backend).map(c => [c.sourceId, c.sourceStartMs, c.sourceEndMs, c.timelineStartMs, c.timelineEndMs])).toEqual([
    ["s0", 0, 700, 0, 700], ["s0", 900, 1500, 700, 1300], ["s0", 0, 700, 1300, 2000], ["s1", 300, 1000, 2000, 2700]
  ]);
  expect(clips(backend)[0]!.id).toBe(first);
  expect(backend.history.sourceNumbering).toEqual(numbering); expect(backend.history.current.sources).toEqual(originals);
  const before = backend.history.current;
  fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
  await waitFor(() => expect(clips(backend)).toHaveLength(3));
  await waitFor(() => expect(screen.getByRole("button", { name: "Refazer" }).matches(":disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Refazer" }));
  await waitFor(() => expect(backend.history.current).toEqual(before));
  expect(screen.getByRole("button", { name: "Sequência" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Original" })).toBeTruthy();
});

it("inserts another source before selection, ripples trim, splits at the cursor and removes without extra journal entries", async () => {
  const { backend, container } = await mount();
  range("1", "4"); await action(backend, "Adicionar trecho ao final");
  const original = clips(backend)[0]!.id;
  fireEvent.change(controls().getByRole("combobox", { name: "Fonte" }), { target: { value: "s1" } });
  range("0", "1"); await action(backend, "Inserir antes do selecionado");
  expect(clips(backend).map(c => [c.sourceId, c.timelineStartMs, c.timelineEndMs])).toEqual([["s1", 0, 1000], ["s0", 1000, 4000]]);
  range("0.2", "0.8"); await action(backend, "Ajustar trecho selecionado");
  expect(clips(backend)[1]!.timelineStartMs).toBe(600);
  const ruler = screen.getByRole("slider", { name: "Régua e cursor da linha do tempo" });
  fireEvent.keyDown(ruler, { key: "ArrowRight", shiftKey: true });
  await action(backend, "Dividir no cursor");
  expect(clips(backend)[0]!.sourceEndMs).toBe(210);
  expect(clips(backend)[1]!.sourceStartMs).toBe(210);
  await action(backend, "Remover selecionado");
  expect(clips(backend)[0]!.timelineStartMs).toBe(0);
  expect(clips(backend).find(c => c.id === original)!.timelineStartMs).toBe(590);
  expect(container.querySelector('[data-testid="app-shell"]')!.getAttribute("data-selected-project-item-id")).toBe(clips(backend)[0]!.id);
});

it("disables invalid/sub-millisecond ranges, out-of-clip splits and unavailable move directions", async () => {
  const { backend } = await mount();
  for (const [start, end] of [["", "1"], ["-1", "1"], ["1", "1"], ["0", "6.001"], ["0.0001", "1"]]) {
    range(start!, end!); expect(controls().getByRole("button", { name: "Adicionar trecho ao final" }).matches(":disabled")).toBe(true);
  }
  expect(backend.requests).toHaveLength(0);
  range("0", "1"); await action(backend, "Adicionar trecho ao final");
  for (const label of ["Dividir no cursor", "Mover para antes", "Mover para depois"]) expect(controls().getByRole("button", { name: label }).matches(":disabled")).toBe(true);
});

it("blocks repeated edits while pending and preserves a newly selected Original at late confirmation", async () => {
  const { backend, container } = await mount();
  range("0", "1"); await action(backend, "Adicionar trecho ao final");
  let release!: () => void; backend.beforeEdit = () => new Promise(resolve => { release = resolve; });
  const duplicate = controls().getByRole("button", { name: "Duplicar selecionado" });
  fireEvent.click(duplicate); fireEvent.click(duplicate);
  expect(backend.requests).toHaveLength(2);
  expect(controls().getByRole("combobox", { name: "Fonte" }).matches(":disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Desfazer" }).matches(":disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Vídeo 2.*s1.mp4/ }));
  await act(async () => { release(); });
  await waitFor(() => expect(clips(backend)).toHaveLength(2));
  expect(container.querySelector('[data-testid="app-shell"]')!.getAttribute("data-selected-project-item-id")).toBe("s1");
});

it("reconciles a committed save failure without replay and surfaces the canonical error", async () => {
  const { backend } = await mount();
  const original = backend.editManualVideoSequence.bind(backend);
  backend.editManualVideoSequence = async request => {
    const result = await original(request);
    throw { code: "PROJECT_PERSISTENCE_FAILED", reconciledState: { ...result.state, status: "persistence-error", checkpoint: { token: "matching-journal", pending: false } } };
  };
  range("0", "1"); fireEvent.click(controls().getByRole("button", { name: "Adicionar trecho ao final" }));
  await waitFor(() => expect(clips(backend)).toHaveLength(1));
  await waitFor(() => expect(screen.getByRole("button", { name: "Tentar salvar" }).matches(":disabled")).toBe(false));
  expect(screen.getByRole("alert")).toBeTruthy(); expect(backend.requests).toHaveLength(1);
});

it("keeps the same controls and source range drafts after switching to English", async () => {
  await mount(); range("0.1", "1.2");
  fireEvent.click(screen.getByRole("button", { name: "Trocar idioma" }));
  const english = within(screen.getByRole("region", { name: "Montage controls" }));
  expect((english.getByLabelText("IN (seconds)") as HTMLInputElement).value).toBe("0.1");
  expect((english.getByLabelText("OUT (seconds)") as HTMLInputElement).value).toBe("1.2");
  expect(english.getByRole("button", { name: "Append range" }).matches(":disabled")).toBe(false);
  expect(english.getByRole("button", { name: "Insert before selected" }).matches(":disabled")).toBe(true);
});

it("retains source-clock IN/OUT marking and append after the montage already contains clips", async () => {
  const backend: DesktopBackend = new SequenceBackend();
  backend.previewLocalVideo = async request => ({ sourceId: request.sourceId, snapshotId: request.expectedSnapshotId, durationMs: 6000, mimeType: "video/mp4", base64: btoa("offline-transport-only") });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:sequence-test" });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  const create = vi.fn().mockResolvedValue(undefined);
  const { container } = render(<ManualVideoPreview backend={backend} source={originals[0]} snapshotId="snapshot" timelineOccupied sequenceEditing busy={false} seek={{ sequence: 0, timelineMs: 0 }} t={(key, params) => translate("pt-BR", key, params)} onPlayheadChange={() => {}} onCreate={create} />);
  await waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toBe("blob:sequence-test"));
  const video = container.querySelector("video")!;
  Object.defineProperty(video, "duration", { configurable: true, value: 6 });
  Object.defineProperty(video, "readyState", { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA });
  fireEvent.loadedMetadata(video);
  video.currentTime = 1.25; fireEvent.click(screen.getByRole("button", { name: "Marcar IN" }));
  video.currentTime = 2.5; fireEvent.click(screen.getByRole("button", { name: "Marcar OUT" }));
  fireEvent.click(screen.getByRole("button", { name: "Adicionar trecho ao final" }));
  expect(create).toHaveBeenCalledExactlyOnceWith({ sourceId: "s0", expectedSnapshotId: "snapshot", sourceStartMs: 1250, sourceEndMs: 2500 });
});
