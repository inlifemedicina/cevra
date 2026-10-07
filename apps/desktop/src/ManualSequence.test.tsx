import { ManualVideoSequenceApplicationService, type ManualVideoSequenceEdit, type SourceContentIdentityPort } from "@cevra/application";
import { createEmptyProject, ProjectHistory, framesToMilliseconds, type SourceAsset } from "@cevra/project-ir";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  async previewManualSequenceConform(request: { version: 1; expectedSnapshotId: string }) { return this.service.previewConform(request.expectedSnapshotId); }
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
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function controls() { return within(screen.getByRole("region", { name: "Controles da montagem" })); }
function range(start: string, end: string) {
  const grid = controls().queryByLabelText("IN (frames)") !== null;
  fireEvent.change(controls().getByLabelText(grid ? "IN (frames)" : "IN (segundos)"), { target: { value: grid && start !== "" ? String(Number(start) * 30) : start } });
  fireEvent.change(controls().getByLabelText(grid ? "OUT (frames)" : "OUT (segundos)"), { target: { value: grid && end !== "" ? String(Number(end) * 30) : end } });
}
function clips(backend: SequenceBackend) { return [...backend.history.current.timeline.clips].sort((a, b) => a.timelineStartMs - b.timelineStartMs); }
async function action(backend: SequenceBackend, label: string) {
  const count = backend.requests.length, entries = backend.history.entries.length;
  await waitFor(() => expect(controls().getByRole("button", { name: label }).matches(":disabled")).toBe(false));
  await act(async () => {
    fireEvent.click(controls().getByRole("button", { name: label }));
  });
  await waitFor(() => expect(backend.history.entries.length).toBe(entries + 1));
  await waitFor(() => expect(controls().getByRole("combobox", { name: "Fonte" }).matches(":disabled")).toBe(false));
  expect(backend.requests.length).toBe(count + 1);
}
async function mount(backend = new SequenceBackend()) {
  let rendered!: ReturnType<typeof render>;
  await act(async () => {
    rendered = render(<App backend={backend} />);
  });
  await waitFor(() => expect(controls().getByRole("combobox", { name: "Fonte" }).matches(":disabled")).toBe(false));
  return { backend, ...rendered };
}

async function gestureFixture() {
  const backend = new SequenceBackend();
  for (const [sourceId, sourceStartFrame, sourceEndFrame] of [["s0", 0, 30], ["s0", 30, 60], ["s0", 0, 30], ["s1", 0, 60]] as const) {
    await backend.service.edit({ version: 2, type: "append", expectedSnapshotId: backend.history.current.history.headSnapshotId!, sourceId, sourceStartFrame, sourceEndFrame });
  }
  const view = await mount(backend);
  const item = (id: string) => view.container.querySelector<HTMLElement>(`[data-clip-id="${id}"]`)!;
  const click = (id: string, modifiers = {}) => { const root = item(id); fireEvent.click(root.querySelector(".timeline-trim-select") ?? root, modifiers); };
  return { ...view, item, click, ids: clips(backend).map(clip => clip.id), timeline: view.container.querySelector<HTMLElement>(".timeline")! };
}

it("clip selection retains timeline scale and exposes exact total and selected durations", async () => {
  const f = await gestureFixture();
  const positions = () => [...f.container.querySelectorAll<HTMLElement>("[data-clip-id]")].map(item => item.style.cssText);
  f.click(f.ids[0]!); const first = positions();
  f.click(f.ids[3]!); expect(positions()).toEqual(first);
  expect(screen.getByTestId("timeline-total-duration").textContent).toContain("5 s · 150 quadros");
  expect(screen.getByTestId("timeline-selected-duration").textContent).toContain("2 s · 60 quadros");
  f.click(f.ids[1]!); f.click(f.ids[3]!, { shiftKey: true });
  expect(screen.getByTestId("timeline-selected-duration").textContent).toContain("Seleção (3): 4 s · 120 quadros");
  f.click(f.ids[2]!, { metaKey: true });
  expect(screen.getByTestId("timeline-selected-duration").textContent).toContain("Seleção (2): 3 s · 90 quadros");
});

it("Cmd+A and Delete remove a montage in one Undo while typing, composition and modal dialogs are guarded", async () => {
  const f = await gestureFixture(), before = f.backend.history.current;
  f.click(f.ids[0]!);
  const input = controls().getByLabelText("IN (frames)");
  fireEvent.keyDown(input, { key: "Delete" }); fireEvent.keyDown(input, { key: "a", metaKey: true });
  expect(f.backend.requests).toHaveLength(0);
  fireEvent.keyDown(f.timeline, { key: "a", metaKey: true });
  expect(screen.getByTestId("timeline-selected-duration").textContent).toContain("Seleção (4)");
  fireEvent.keyDown(f.timeline, { key: "Delete", isComposing: true, keyCode: 229 });
  const modal = document.createElement("div"); modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); document.body.append(modal);
  fireEvent.keyDown(f.timeline, { key: "Backspace" }); modal.remove();
  expect(f.backend.requests).toHaveLength(0);
  fireEvent.keyDown(f.timeline, { key: "Delete" }); fireEvent.keyDown(f.timeline, { key: "Delete", repeat: true });
  await waitFor(() => expect(clips(f.backend)).toHaveLength(0));
  expect(f.backend.requests).toHaveLength(1);
  expect(f.backend.requests[0]).toMatchObject({ version: 2, type: "remove-many", clipIds: f.ids });
  fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
  await waitFor(() => expect(f.backend.history.current).toEqual(before));
});

it("dragging an already selected group preserves its members and publishes one reorder", async () => {
  const f = await gestureFixture(), before = f.backend.history.current;
  f.click(f.ids[0]!); f.click(f.ids[2]!, { metaKey: true });
  const transfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
  fireEvent.dragStart(f.item(f.ids[0]!), { dataTransfer: transfer });
  expect(screen.getByTestId("timeline-selected-duration").textContent).toContain("Seleção (2)");
  const target = f.item(f.ids[3]!);
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100 } as DOMRect);
  const drop = new MouseEvent("drop", { bubbles: true, clientX: 90 }); Object.defineProperty(drop, "dataTransfer", { value: transfer }); fireEvent(target, drop);
  await waitFor(() => expect(clips(f.backend).map(clip => clip.id)).toEqual([f.ids[1], f.ids[3], f.ids[0], f.ids[2]]));
  expect(f.backend.requests).toHaveLength(1);
  expect(f.backend.requests[0].type).toBe("reorder");
  fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
  await waitFor(() => expect(f.backend.history.current).toEqual(before));
});

it("assembles four retained source ranges through UI with one Undo per action and unchanged source numbering", async () => {
  const { backend, container } = await mount();
  const numbering = structuredClone(backend.history.sourceNumbering);
  range("0", "0.7"); await action(backend, "Adicionar trecho ao final");
  const first = clips(backend)[0]!.id;
  // A new source excerpt is drafted from Original; selected-clip fields edit that clip.
  fireEvent.click(screen.getAllByRole("button", { name: /Vídeo 1.*s0.mp4/ })[0]!);
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
  expect(clips(backend)[0]!.frameTiming!.sourceEndFrame).toBe(16);
  expect(clips(backend)[1]!.frameTiming!.sourceStartFrame).toBe(16);
  await action(backend, "Remover selecionado");
  expect(clips(backend)[0]!.timelineStartMs).toBe(0);
  expect(clips(backend).find(c => c.id === original)!.frameTiming!.timelineStartFrame).toBe(8);
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
  expect((english.getByLabelText("IN (frames)") as HTMLInputElement).value).toBe("3");
  expect((english.getByLabelText("OUT (frames)") as HTMLInputElement).value).toBe("36");
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

it("reviews all legacy boundaries, resolves a collapsed range explicitly and converts with one Undo and lossless reopen", async () => {
  const backend = new SequenceBackend();
  await backend.service.edit({ version: 1, expectedSnapshotId: backend.history.current.history.headSnapshotId!, type: "append", sourceId: "s0", sourceStartMs: 901, sourceEndMs: 908 });
  const legacy = backend.history.current.timeline;
  const entries = backend.history.entries.length;
  await mount(backend);
  fireEvent.click(controls().getByRole("button", { name: "Revisar conversão para 30 fps" }));
  await screen.findByText(/Este trecho colapsa/);
  expect(screen.getAllByText(/ajuste .* ms/)).toHaveLength(4);
  const confirm = screen.getByRole("button", { name: "Confirmar cortes em frames revisados" });
  expect(confirm.matches(":disabled")).toBe(true);
  const review = within(screen.getByRole("region", { name: "Revise cada corte antes de converter" }));
  fireEvent.change(review.getByLabelText("OUT (frames)"), { target: { value: "28" } });
  expect(confirm.matches(":disabled")).toBe(false);
  fireEvent.click(confirm);
  await waitFor(() => expect(backend.history.current.timeline.timingPolicy).toBe("cfr30"));
  expect(backend.requests).toHaveLength(1);
  expect(backend.requests[0]).toMatchObject({ version: 2, type: "conform", clips: [{ clipId: legacy.clips[0]!.id, sourceStartFrame: 27, sourceEndFrame: 28 }] });
  expect(backend.history.entries.length).toBe(entries + 1);
  const reopened = ProjectHistory.fromArchive(backend.history.toArchive());
  expect(reopened.current.timeline).toEqual(backend.history.current.timeline);
  expect(reopened.current.timeline.clips[0]!.sourceEndMs).toBe(framesToMilliseconds(28));
  reopened.undo(); expect(reopened.current.timeline).toEqual(legacy);
  reopened.redo(); expect(reopened.current.timeline).toEqual(backend.history.current.timeline);
});

it("a new frame action adopts CFR30 atomically and keyboard edits step whole frames without changing originals", async () => {
  const { backend } = await mount();
  const before = backend.history.current.timeline;
  fireEvent.change(controls().getByLabelText("IN (frames)"), { target: { value: "27" } });
  fireEvent.change(controls().getByLabelText("OUT (frames)"), { target: { value: "58" } });
  await action(backend, "Adicionar trecho ao final");
  expect(backend.requests[0]).toMatchObject({ version: 2, type: "append", sourceStartFrame: 27, sourceEndFrame: 58 });
  expect(backend.history.current.timeline.timingPolicy).toBe("cfr30");
  const ruler = screen.getByRole("slider", { name: "Régua e cursor da linha do tempo" });
  fireEvent.keyDown(ruler, { key: "ArrowRight" });
  expect(ruler.getAttribute("aria-valuenow")).toBe("1");
  fireEvent.keyDown(ruler, { key: "ArrowRight", shiftKey: true });
  expect(ruler.getAttribute("aria-valuenow")).toBe("11");
  const trim = screen.getByRole("slider", { name: "Ajustar IN do clip" });
  fireEvent.keyDown(trim, { key: "ArrowRight" });
  await waitFor(() => expect(backend.history.current.timeline.clips[0]!.frameTiming!.sourceStartFrame).toBe(28));
  expect(backend.requests.at(-1)).toMatchObject({ version: 2, type: "trim", sourceStartFrame: 28, sourceEndFrame: 58 });
  expect(backend.history.current.sources).toEqual(originals);
  backend.history.undo(); backend.history.undo();
  expect(backend.history.current.timeline).toEqual(before);
});

for (const committedFailure of [false, true]) {
  it(`App retains a late ${committedFailure ? "committed failure and checkpoint" : "export receipt"} across the new export history head without replay`, async () => {
    const backend = new SequenceBackend();
    await backend.service.edit({ version: 2, expectedSnapshotId: backend.history.current.history.headSnapshotId!, type: "append", sourceId: "s0", sourceStartFrame: 27, sourceEndFrame: 58 });
    let persistedError = false;
    const read = backend.loadState.bind(backend);
    backend.loadState = async () => ({ ...await read(), status: persistedError ? "persistence-error" : "local-saved", ...(persistedError ? { checkpoint: { token: "export-journal", pending: false } } : {}),
      capabilities: { ...(await read()).capabilities, "project.export": { available: true, reason: "available" } } });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const exportSequence = vi.fn(async () => {
      await gate;
      backend.history.commit({ type: "export.add", export: { id: "saved-export", presetId: "manual-cfr30", status: "completed", outputUri: "/tmp/offline-export.mp4", createdAt: "2026-10-06T00:00:00.000Z" } });
      persistedError = committedFailure;
      const state = await backend.loadState();
      if (committedFailure) throw { code: "MANUAL_EXPORT_COMMITTED_ERROR", reconciledState: state };
      return { outcome: "exported" as const, state, executionId: "execution", exportId: "saved-export", destinationLabel: "offline-export.mp4" };
    });
    Object.assign(backend, { exportManualSequence: exportSequence });
    const { container } = await mount(backend);
    const entries = backend.history.entries.length;
    const exportButton = screen.getByRole("button", { name: translate("pt-BR", "action.export") });
    await waitFor(() => expect(exportButton.matches(":disabled")).toBe(false));
    fireEvent.click(exportButton);
    expect(screen.getByRole("button", { name: "Desfazer" }).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: translate("pt-BR", "export.cancel") }));
    fireEvent.click(screen.getByRole("tab", { name: translate("pt-BR", "workspace.composition") }));
    expect(screen.getByRole("button", { name: translate("pt-BR", "export.cancel") }).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: translate("pt-BR", "workspace.edit") }));
    fireEvent.click(screen.getByRole("button", { name: /Vídeo 2.*s1.mp4/ }));
    await act(async () => release());
    await waitFor(() => expect(container.querySelector('[data-testid="app-shell"]')!.getAttribute("data-project-revision")).toBe(String(backend.history.current.history.revision)));
    expect(backend.history.entries.length).toBe(entries + 1);
    expect(backend.history.current.exports).toHaveLength(1);
    expect(exportSequence).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="app-shell"]')!.getAttribute("data-selected-project-item-id")).toBe("s1");
    expect(screen.queryByText(translate("pt-BR", "export.cancelled"))).toBeNull();
    if (committedFailure) {
      await screen.findAllByText(translate("pt-BR", "export.committedError"));
      await waitFor(() => expect(screen.getByRole("button", { name: "Tentar salvar" }).matches(":disabled")).toBe(false));
    } else {
      expect(await screen.findByText("offline-export.mp4")).toBeTruthy();
      expect(screen.getByText(translate("pt-BR", "export.complete"), { exact: false })).toBeTruthy();
    }
    expect(ProjectHistory.fromArchive(backend.history.toArchive()).current).toEqual(backend.history.current);
  });
}

it.each(["pt-BR", "en-US"] as const)("%s reveals compact export feedback and cancellation from the toolbar without changing the project or Director draft", async locale => {
  const backend = new SequenceBackend();
  await backend.service.edit({ version: 2, expectedSnapshotId: backend.history.current.history.headSnapshotId!, type: "append", sourceId: "s0", sourceStartFrame: 15, sourceEndFrame: 60 });
  const read = backend.loadState.bind(backend);
  backend.loadState = async () => ({ ...await read(), status: "local-saved", capabilities: { ...(await read()).capabilities, "project.export": { available: true, reason: "available" } } });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const exportSequence = vi.fn(async (_request: unknown) => { await gate; return { outcome: "cancelled" as const }; });
  const cancel = vi.fn(async (operationId: string) => { release(); return { operationId, cancelled: true }; });
  Object.assign(backend, { exportManualSequence: exportSequence, cancelOperation: cancel });
  const { container } = await mount(backend);
  const draft = screen.getByLabelText("Instrução para o Diretor CEVRA") as HTMLTextAreaElement;
  fireEvent.change(draft, { target: { value: "Manter esta instrução sem executar IA" } });
  if (locale === "en-US") fireEvent.click(screen.getByRole("button", { name: "Trocar idioma" }));
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  fireEvent.click(screen.getByRole("button", { name: t("sidebar.compact") }));
  expect(screen.getByRole("tab", { name: t("sidebar.directorTab") }).getAttribute("aria-selected")).toBe("true");
  const before = backend.history.toArchive();
  const selection = container.querySelector('[data-testid="app-shell"]')!.getAttribute("data-selected-project-item-id");
  if (locale === "pt-BR") {
    const shell = screen.getByTestId("app-shell");
    fireEvent.keyDown(shell, { key: "e", metaKey: true }); expect(exportSequence).not.toHaveBeenCalled();
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    fireEvent.keyDown(draft, { key: "e", metaKey: true }); expect(exportSequence).not.toHaveBeenCalled();
    fireEvent.keyDown(shell, { key: "e", metaKey: true });
  } else fireEvent.click(screen.getByRole("button", { name: t("action.export") }));
  const cancelButton = await screen.findByRole("button", { name: t("export.cancel") });
  fireEvent.keyDown(screen.getByTestId("app-shell"), { key: "e", metaKey: true });
  expect(exportSequence).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("tab", { name: t("sidebar.controlsTab") }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByText(t("export.running"))).toBeTruthy();
  fireEvent.click(cancelButton);
  await screen.findByText(t("export.cancelled"));
  expect(exportSequence).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledExactlyOnceWith((exportSequence.mock.calls[0][0] as { operationId: string }).operationId);
  expect(backend.history.toArchive()).toEqual(before);
  expect(container.querySelector('[data-testid="app-shell"]')!.getAttribute("data-selected-project-item-id")).toBe(selection);
  fireEvent.click(screen.getByRole("tab", { name: t("sidebar.directorTab") }));
  expect(draft.value).toBe("Manter esta instrução sem executar IA");
});

it("keeps a larger legacy source duration intact while bounding disposable frame inputs", async () => {
  const backend = new SequenceBackend();
  backend.history.commit({ type: "source.add", source: { ...originals[0]!, id: "large-clock", uri: "/tmp/offline-large-clock.mp4", durationMs: Number.MAX_SAFE_INTEGER } });
  await mount(backend);
  const before = backend.history.toArchive();
  fireEvent.change(controls().getByRole("combobox", { name: "Fonte" }), { target: { value: "large-clock" } });
  expect((controls().getByLabelText("OUT (frames)") as HTMLInputElement).value).toBe(String(Math.floor(Number.MAX_SAFE_INTEGER / 1000)));
  expect(backend.history.toArchive()).toEqual(before);
  expect(backend.history.current.sources.at(-1)!.durationMs).toBe(Number.MAX_SAFE_INTEGER);
});


it("pointer playhead dragging uses the fixed ruler geometry and Escape restores its original position", async () => {
  const f=await gestureFixture();const ruler=f.container.querySelector<HTMLElement>(".timeline-ruler")!;
  vi.spyOn(ruler.querySelector(".timeline-width")!,"getBoundingClientRect").mockReturnValue({left:100,width:500} as DOMRect);
  function pointer(type:string,x:number) {const event=new MouseEvent(type,{bubbles:true,button:0,clientX:x});Object.defineProperty(event,"pointerId",{value:7});fireEvent(ruler,event);}
  const before=f.backend.history.toArchive();fireEvent.keyDown(ruler,{key:"Home"});fireEvent.keyDown(ruler,{key:"ArrowRight"});expect(ruler.getAttribute("aria-valuenow")).toBe("1");
  pointer("pointerdown",200);expect(ruler.getAttribute("aria-valuenow")).toBe("30");
  pointer("pointermove",350);expect(ruler.getAttribute("aria-valuenow")).toBe("75");
  fireEvent.keyDown(window,{key:"Escape"});expect(ruler.getAttribute("aria-valuenow")).toBe("1");
  pointer("pointerup",400);expect(ruler.getAttribute("aria-valuenow")).toBe("1");
  pointer("pointerdown",200);pointer("pointermove",350);pointer("pointerup",400);expect(ruler.getAttribute("aria-valuenow")).toBe("90");
  expect(f.backend.history.toArchive()).toEqual(before);expect(f.backend.requests).toHaveLength(0);
});
it.each(["Enter", "blur"])("valid IN/OUT %s commits once, remains atomic and preserves text Undo", async trigger => {
  const f = await gestureFixture(); f.click(f.ids[0]!); const before = f.backend.history.current; const user = userEvent.setup();
  const input = controls().getByLabelText("OUT (frames)");
  await user.click(input); await user.clear(input); await user.type(input, "29");
  if (trigger === "Enter") await user.keyboard("{Enter}");
  else await user.click(screen.getByLabelText(translate("pt-BR", "director.inputLabel")));
  await user.click(f.timeline); fireEvent.keyDown(input, { key: "Enter", repeat: true });
  await waitFor(() => expect(clips(f.backend)[0]!.frameTiming!.sourceEndFrame).toBe(29));
  expect(f.backend.requests).toHaveLength(1);
  const undo = screen.getByRole("button", { name: "Desfazer" });
  await waitFor(() => expect(undo.matches(":disabled")).toBe(false));
  await user.click(undo);
  await waitFor(() => expect(f.backend.history.current).toEqual(before));
});

it("Escape restores numerical drafts and invalid, IME or other-source drafts create no mutation", async () => {
  const f = await gestureFixture(); f.click(f.ids[0]!);
  let input = controls().getByLabelText("OUT (frames)");
  fireEvent.change(input, { target: { value: "29" } });
  fireEvent.compositionStart(input); fireEvent.blur(input);
  expect(f.backend.requests).toHaveLength(0);
  fireEvent.compositionEnd(input);
  fireEvent.keyDown(input, { key: "Enter", isComposing: true, keyCode: 229 });
  fireEvent.keyDown(input, { key: "Escape" }); fireEvent.blur(input);
  expect((input as HTMLInputElement).value).toBe("30");
  fireEvent.change(input, { target: { value: "" } }); fireEvent.blur(input); fireEvent.keyDown(input, { key: "Enter" });
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(input.getAttribute("aria-describedby")).toBeTruthy();
  fireEvent.change(controls().getByRole("combobox", { name: "Fonte" }), { target: { value: "s1" } });
  input = controls().getByLabelText("OUT (frames)");
  fireEvent.change(input, { target: { value: "31" } }); fireEvent.blur(input);
  expect(f.backend.requests).toHaveLength(0);
});

it("Enter plus blur during a pending trim neither duplicates the command nor prevents a failed retry", async () => {
  const f = await gestureFixture(); f.click(f.ids[0]!);
  let reject!: (error: unknown) => void;
  f.backend.beforeEdit = () => new Promise((_, r) => { reject = r; });
  const input = controls().getByLabelText("OUT (frames)");
  fireEvent.change(input, { target: { value: "29" } });
  fireEvent.keyDown(input, { key: "Enter" }); fireEvent.blur(input);
  expect(f.backend.requests).toHaveLength(1);
  await act(async () => reject({ code: "HOST_TIMEOUT" }));
  await waitFor(() => expect(input.matches(":disabled")).toBe(false));
  f.backend.beforeEdit = async () => {};
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(clips(f.backend)[0]!.frameTiming!.sourceEndFrame).toBe(29));
  expect(f.backend.requests).toHaveLength(2);
});

it.each([
  ["sequence.append", "append"], ["sequence.insert", "insert"], ["sequence.trim", "trim"],
  ["sequence.duplicate", "duplicate"], ["sequence.split", "split"],
  ["sequence.later", "reorder"], ["sequence.remove", "remove"]
] as const)("focused range → real click %s settles trim before the explicit action", async (label, type) => {
  const f = await gestureFixture(); f.click(f.ids[0]!); const user = userEvent.setup();
  if (type === "split") fireEvent.keyDown(f.timeline, { key: "ArrowRight" });
  const before = f.backend.history.current;
  const input = controls().getByLabelText("OUT (frames)");
  await user.click(input); await user.clear(input); await user.type(input, "29");
  expect(document.activeElement).toBe(input);
  let release!: () => void; f.backend.beforeEdit = async () => { if (f.backend.requests.length === 1) await new Promise<void>(resolve => { release = resolve; }); };
  await user.click(controls().getByRole("button", { name: translate("pt-BR", label) }));
  expect(f.backend.requests).toHaveLength(1);
  expect(f.backend.requests[0]).toMatchObject({ type: "trim", expectedSnapshotId: before.history.headSnapshotId, version: 2, sourceStartFrame: 0, sourceEndFrame: 29 });
  await act(async () => release());
  const count = type === "trim" ? 1 : 2;
  await waitFor(() => expect(f.backend.history.current.history.revision).toBe(before.history.revision + count));
  const request = f.backend.requests.at(-1)!;
  expect(request.type).toBe(type);
  if (type !== "trim") expect(request.expectedSnapshotId).toBe(f.backend.history.entries.at(-2)!.snapshotId);
  if (["append", "insert", "duplicate", "reorder"].includes(type)) {
    expect(clips(f.backend).find(c => c.id === f.ids[0])!.frameTiming!.sourceEndFrame).toBe(29);
  }
  await waitFor(() => expect(screen.getByRole("button", { name: "Desfazer" }).matches(":disabled")).toBe(false));
  await user.click(screen.getByRole("button", { name: "Desfazer" }));
  if (count === 2) {
    await waitFor(() => expect(clips(f.backend)).toHaveLength(4));
    expect(clips(f.backend)[0]!.frameTiming!.sourceEndFrame).toBe(29);
    await user.click(screen.getByRole("button", { name: "Desfazer" }));
  }
  await waitFor(() => expect(f.backend.history.current).toEqual(before));
  expect(f.backend.requests).toHaveLength(count);
});

it("real Enter then focus loss serializes one trim; Escape followed by a real action uses restored bounds", async () => {
  const f = await gestureFixture(); f.click(f.ids[0]!); const user = userEvent.setup();
  let input = controls().getByLabelText("OUT (frames)");
  await user.click(input); await user.clear(input); await user.type(input, "29");
  let release!: () => void; f.backend.beforeEdit = () => new Promise(resolve => { release = resolve; });
  await user.keyboard("{Enter}"); await user.click(f.timeline);
  expect(f.backend.requests.map(r => r.type)).toEqual(["trim"]);
  await act(async () => release());
  await waitFor(() => expect(clips(f.backend)[0]!.frameTiming!.sourceEndFrame).toBe(29));
  f.backend.beforeEdit = async () => {};
  await user.click(screen.getByRole("button", { name: "Desfazer" }));
  await waitFor(() => expect(clips(f.backend)[0]!.frameTiming!.sourceEndFrame).toBe(30));
  input = controls().getByLabelText("OUT (frames)");
  await user.click(input); await user.clear(input); await user.type(input, "29"); await user.keyboard("{Escape}");
  await user.click(f.timeline); expect(f.backend.requests.map(r => r.type)).toEqual(["trim"]);
  await user.click(input); await user.click(controls().getByRole("button", { name: translate("pt-BR", "sequence.append") }));
  await waitFor(() => expect(clips(f.backend)).toHaveLength(5));
  expect(f.backend.requests.map(r => r.type)).toEqual(["trim", "append"]);
  expect(f.backend.requests[1]).toMatchObject({ version: 2, sourceStartFrame: 0, sourceEndFrame: 30 });
});

it("a real Undo after a dirty range reverses the confirmed trim before older History", async () => {
  const f = await gestureFixture(); f.click(f.ids[0]!); const user = userEvent.setup();
  const before = f.backend.history.current;
  const input = controls().getByLabelText("OUT (frames)");
  await user.click(input); await user.clear(input); await user.type(input, "29");
  await user.click(screen.getByRole("button", { name: "Desfazer" }));
  await waitFor(() => expect(f.backend.history.current).toEqual(before));
  expect(f.backend.requests.map(r => r.type)).toEqual(["trim"]);
  await user.click(screen.getByRole("button", { name: "Refazer" }));
  await waitFor(() => expect(clips(f.backend)[0]!.frameTiming!.sourceEndFrame).toBe(29));
});

it("real click keeps its action when the browser blurs the field without focusing the button", async () => {
  const f = await gestureFixture(); f.click(f.ids[0]!); const user = userEvent.setup();
  const before = f.backend.history.current;
  const input = controls().getByLabelText("OUT (frames)");
  await user.click(input); await user.clear(input); await user.type(input, "29");
  const button = controls().getByRole("button", { name: translate("pt-BR", "sequence.append") });
  button.addEventListener("mousedown", event => { event.preventDefault(); input.blur(); }, { once: true });
  await user.click(button);
  await waitFor(() => expect(clips(f.backend)).toHaveLength(5));
  expect(f.backend.requests.map(r => r.type)).toEqual(["trim", "append"]);
  expect(f.backend.requests[0]).toMatchObject({ type: "trim", expectedSnapshotId: before.history.headSnapshotId, sourceEndFrame: 29 });
  expect(f.backend.requests[1]).toMatchObject({ type: "append", expectedSnapshotId: f.backend.history.entries.at(-2)!.snapshotId, sourceStartFrame: 0, sourceEndFrame: 29 });
});

it("real focus loss still commits a valid range and rejects invalid bounds outside button actions", async () => {
  const f = await gestureFixture(); f.click(f.ids[0]!); const user = userEvent.setup();
  const input = controls().getByLabelText("OUT (frames)");
  await user.click(input); await user.clear(input);
  await user.click(screen.getByLabelText(translate("pt-BR", "director.inputLabel")));
  expect(f.backend.requests).toHaveLength(0);
  await user.click(input); await user.type(input, "29");
  await user.click(screen.getByLabelText(translate("pt-BR", "director.inputLabel")));
  await waitFor(() => expect(clips(f.backend)[0]!.frameTiming!.sourceEndFrame).toBe(29));
  expect(f.backend.requests.map(r => r.type)).toEqual(["trim"]);
});

it("dirty range settles before selecting another clip, retaining its owner and one recoverable trim", async () => {
  const f = await gestureFixture(); f.click(f.ids[0]!); const user = userEvent.setup();
  const before = f.backend.history.current;
  const input = controls().getByLabelText("OUT (frames)") as HTMLInputElement;
  await user.click(input); await user.clear(input); await user.type(input, "29");
  let release!: () => void;
  f.backend.beforeEdit = () => new Promise(resolve => { release = resolve; });
  await user.click(f.item(f.ids[3]!));
  expect(f.backend.requests.map(r => r.type)).toEqual(["trim"]);
  expect(screen.getByTestId("app-shell").getAttribute("data-selected-project-item-id")).toBe(f.ids[0]);
  expect(input.value).toBe("29");
  await act(async () => release());
  await waitFor(() => expect(screen.getByTestId("app-shell").getAttribute("data-selected-project-item-id")).toBe(f.ids[3]));
  expect(clips(f.backend)[0]!.frameTiming!.sourceEndFrame).toBe(29);
  expect((controls().getByLabelText("OUT (frames)") as HTMLInputElement).value).toBe("60");
  await user.click(screen.getByRole("button", { name: "Desfazer" }));
  await waitFor(() => expect(f.backend.history.current).toEqual(before));
});

it.each([
  ["sequence.duplicate", "duplicate", "pointer"], ["sequence.duplicate", "duplicate", "Enter"],
  ["sequence.duplicate", "duplicate", "EnterFromField"],
  ["sequence.duplicate", "duplicate", "NativeShortcut"],
  ["sequence.append", "append", "pointer"], ["sequence.append", "append", "Enter"],
  ["sequence.insert", "insert", "pointer"], ["sequence.insert", "insert", "Space"]
] as const)("dirty range → %s via %s/%s serializes trim then action against the returned snapshot", async (label, type, activation) => {
  const f = await gestureFixture(); f.click(f.ids[0]!); const user = userEvent.setup();
  const before = f.backend.history.current;
  const input = controls().getByLabelText("OUT (frames)");
  await user.click(input); await user.clear(input); await user.type(input, "29");
  let release!: () => void;
  f.backend.beforeEdit = async () => { if (f.backend.requests.length === 1) await new Promise<void>(resolve => { release = resolve; }); };
  const button = controls().getByRole("button", { name: translate("pt-BR", label) });
  if (activation === "pointer") await user.click(button);
  else if (activation === "EnterFromField") { await user.keyboard("{Enter}"); await user.click(button); }
  else if (activation === "NativeShortcut") {
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    await act(async () => f.timeline.focus());
    await user.keyboard("{Meta>}d{/Meta}");
  }
  else {
    for (let i = 0; i < 8 && document.activeElement !== button; i++) await user.tab();
    expect(document.activeElement).toBe(button);
    await user.keyboard(activation === "Enter" ? "{Enter}" : " ");
  }
  expect(f.backend.requests.map(r => r.type)).toEqual(["trim"]);
  expect(f.backend.requests[0]).toMatchObject({ clipId: f.ids[0], sourceEndFrame: 29, expectedSnapshotId: before.history.headSnapshotId });
  await act(async () => release());
  await waitFor(() => expect(f.backend.requests.map(r => r.type)).toEqual(["trim", type]));
  await waitFor(() => expect(clips(f.backend)).toHaveLength(5));
  const afterTrim = f.backend.history.entries.at(-2)!.snapshotId;
  expect(f.backend.requests[1]!.expectedSnapshotId).toBe(afterTrim);
  const original = clips(f.backend).find(c => c.id === f.ids[0])!;
  const added = clips(f.backend).find(c => !f.ids.includes(c.id))!;
  expect(original.frameTiming!.sourceEndFrame).toBe(29);
  expect(added.frameTiming!.sourceEndFrame).toBe(29);
  await waitFor(() => expect(screen.getByRole("button", { name: "Desfazer" }).matches(":disabled")).toBe(false));
  await user.click(screen.getByRole("button", { name: "Desfazer" }));
  await waitFor(() => expect(clips(f.backend)).toHaveLength(4));
  expect(clips(f.backend)[0]!.frameTiming!.sourceEndFrame).toBe(29);
  await user.click(screen.getByRole("button", { name: "Desfazer" }));
  await waitFor(() => expect(f.backend.history.current).toEqual(before));
});

it("Tab onto Append is focus alone: leaving for Director commits once without activating Append", async () => {
  const f = await gestureFixture(); f.click(f.ids[0]!); const user = userEvent.setup();
  const input = controls().getByLabelText("OUT (frames)");
  await user.click(input); await user.clear(input); await user.type(input, "29");
  let release!: () => void; f.backend.beforeEdit = () => new Promise(resolve => { release = resolve; });
  await user.tab();
  expect(document.activeElement).toBe(controls().getByRole("button", { name: translate("pt-BR", "sequence.append") }));
  const director = screen.getByLabelText(translate("pt-BR", "director.inputLabel")) as HTMLTextAreaElement;
  await user.click(director); await user.type(director, "Preservar esta instrução");
  expect(f.backend.requests.map(r => r.type)).toEqual(["trim"]);
  await act(async () => release());
  await waitFor(() => expect(clips(f.backend)[0]!.frameTiming!.sourceEndFrame).toBe(29));
  expect(clips(f.backend)).toHaveLength(4);
  expect(f.backend.requests).toHaveLength(1);
  expect(director.value).toBe("Preservar esta instrução");
});

it("keyboard selection settles the old clip's range before displaying the newly selected clip", async () => {
  const f = await gestureFixture(); f.click(f.ids[0]!); const user = userEvent.setup();
  const input = controls().getByLabelText("OUT (frames)");
  await user.click(input); await user.clear(input); await user.type(input, "29");
  await act(async () => f.item(f.ids[3]!).focus());
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.getByTestId("app-shell").getAttribute("data-selected-project-item-id")).toBe(f.ids[3]));
  expect(f.backend.requests.map(r => r.type)).toEqual(["trim"]);
  expect(clips(f.backend)[0]!.frameTiming!.sourceEndFrame).toBe(29);
  expect((controls().getByLabelText("OUT (frames)") as HTMLInputElement).value).toBe("60");
});

it("pointer press followed by release elsewhere commits blur but never activates the abandoned button", async () => {
  const f = await gestureFixture(); f.click(f.ids[0]!); const user = userEvent.setup();
  const input = controls().getByLabelText("OUT (frames)");
  await user.click(input); await user.clear(input); await user.type(input, "29");
  await user.pointer({ keys: "[MouseLeft>]", target: controls().getByRole("button", { name: translate("pt-BR", "sequence.append") }) });
  fireEvent.pointerCancel(document.activeElement!);
  await user.pointer({ keys: "[/MouseLeft]", target: screen.getByLabelText(translate("pt-BR", "director.inputLabel")) });
  await waitFor(() => expect(clips(f.backend)[0]!.frameTiming!.sourceEndFrame).toBe(29));
  expect(f.backend.requests.map(r => r.type)).toEqual(["trim"]);
  expect(clips(f.backend)).toHaveLength(4);
});

it("failed range settlement retains the draft and blocks a following duplicate until an explicit retry", async () => {
  const f = await gestureFixture(); f.click(f.ids[0]!); const user = userEvent.setup();
  const before = f.backend.history.current;
  const input = controls().getByLabelText("OUT (frames)") as HTMLInputElement;
  await user.click(input); await user.clear(input); await user.type(input, "29");
  f.backend.beforeEdit = async () => { throw { code: "HOST_TIMEOUT" }; };
  await user.click(controls().getByRole("button", { name: translate("pt-BR", "sequence.duplicate") }));
  await waitFor(() => expect(input.matches(":disabled")).toBe(false));
  expect(f.backend.requests.map(r => r.type)).toEqual(["trim"]);
  expect(input.value).toBe("29"); expect(f.backend.history.current).toEqual(before);
  f.backend.beforeEdit = async () => {};
  await user.click(controls().getByRole("button", { name: translate("pt-BR", "sequence.duplicate") }));
  await waitFor(() => expect(clips(f.backend)).toHaveLength(5));
  expect(f.backend.requests.map(r => r.type)).toEqual(["trim", "trim", "duplicate"]);
  expect(clips(f.backend).filter(c => c.sourceStartMs === 0 && c.frameTiming!.sourceEndFrame === 29)).toHaveLength(2);
});

it("native shortcuts duplicate once and history shortcuts respect fields, modals, IME and browser ownership", async () => {
  const f = await gestureFixture(); f.click(f.ids[0]!);
  fireEvent.keyDown(f.timeline, { key: "d", metaKey: true });
  expect(f.backend.requests).toHaveLength(0); // Browser keeps its bookmark shortcut.
  vi.stubGlobal("__TAURI_INTERNALS__", {});
  const consumed = new KeyboardEvent("keydown", { key: "d", metaKey: true, bubbles: true, cancelable: true });
  consumed.preventDefault(); fireEvent(f.timeline, consumed);
  const editable = document.createElement("div"); editable.setAttribute("contenteditable", "true"); f.timeline.append(editable);
  fireEvent.keyDown(editable, { key: "d", metaKey: true }); editable.remove();
  expect(f.backend.requests).toHaveLength(0);
  fireEvent.keyDown(f.timeline, { key: "d", metaKey: true });
  fireEvent.keyDown(f.timeline, { key: "d", metaKey: true, repeat: true });
  await waitFor(() => expect(clips(f.backend)).toHaveLength(5));
  expect(f.backend.requests).toHaveLength(1);
  const revision = f.backend.history.current.history.revision;
  for (const key of ["z", "a", "d", "b"]) fireEvent.keyDown(controls().getByLabelText("IN (frames)"), { key, metaKey: true });
  fireEvent.keyDown(f.timeline, { key: "z", metaKey: true, isComposing: true });
  fireEvent.keyDown(f.timeline, { key: "ArrowDown", ctrlKey: true, altKey: true });
  expect(f.backend.history.current.history.revision).toBe(revision);
  const modal = document.createElement("dialog"); modal.open = true; document.body.append(modal);
  fireEvent.keyDown(f.timeline, { key: "z", metaKey: true }); modal.remove();
  expect(clips(f.backend)).toHaveLength(5);
  fireEvent.keyDown(f.timeline, { key: "z", metaKey: true });
  await waitFor(() => expect(clips(f.backend)).toHaveLength(4));
  fireEvent.keyDown(f.timeline, { key: "z", metaKey: true, shiftKey: true });
  await waitFor(() => expect(clips(f.backend)).toHaveLength(5));
});

it("keyboard group movement matches canonical group drag, with one Undo, and clear-selection is contextual", async () => {
  const f = await gestureFixture(); f.click(f.ids[0]!); f.click(f.ids[2]!, { metaKey: true });
  const before = f.backend.history.current;
  fireEvent.keyDown(f.timeline, { key: "ArrowDown", altKey: true });
  await waitFor(() => expect(clips(f.backend).map(c => c.id)).toEqual([f.ids[1], f.ids[3], f.ids[0], f.ids[2]]));
  expect(f.backend.requests).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
  await waitFor(() => expect(f.backend.history.current).toEqual(before));
  fireEvent.keyDown(f.timeline, { key: "a", metaKey: true, shiftKey: true });
  expect(f.container.querySelectorAll('[data-clip-id] [aria-pressed="true"], [data-clip-id][aria-pressed="true"]')).toHaveLength(0);
  fireEvent.keyDown(f.timeline, { key: "a", metaKey: true, shiftKey: true });
  expect(screen.queryByTestId("timeline-selected-duration")).toBeNull();
  expect(f.backend.requests).toHaveLength(1);
});
