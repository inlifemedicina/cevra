import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { translate } from "@cevra/i18n";
import { MediaPanel } from "./components/MediaPanel";
import { DemoDesktopBackend } from "./backend/demo-desktop-backend";
import type { LocalVideoPreviewRequest } from "@cevra/application";
import type { SourceAsset } from "@cevra/project-ir";

const source = (id: string): SourceAsset => ({ id, kind: "video", uri: `/tmp/${id}.mp4`, displayName: `${id}.mp4`, durationMs: 1000 });
const png = btoa(String.fromCharCode(137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1));
const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate("pt-BR", key, params);
const packet = (id: string, snapshotId: string) => ({ sourceId: id, snapshotId, mimeType: "image/png" as const, base64: png, width: 1, height: 1 });
function panel(backend: DemoDesktopBackend, sources: SourceAsset[], snapshotId: string) {
  return <MediaPanel backend={backend} sources={sources} snapshotId={snapshotId} presentations={new Map(sources.map(s => [s.id, { id: s.id, label: s.id, fileName: s.displayName, kind: s.kind }]))}
    selectedId={null} workspace="edit" importAvailable importReason="available" importBusy={false} t={t} onSelect={vi.fn()} onImport={vi.fn()} />;
}

it("prepares each imported video thumbnail without playing or selecting it", async () => {
  const backend = new DemoDesktopBackend(), thumbnailLocalVideo = vi.fn(async (r: LocalVideoPreviewRequest) => packet(r.sourceId, r.expectedSnapshotId));
  Object.assign(backend, { thumbnailLocalVideo });
  const preview = vi.spyOn(backend, "previewLocalVideo"), sources = [source("a"), source("b")];
  const { container } = render(panel(backend, sources, "s1"));
  await waitFor(() => expect(container.querySelectorAll(".media-thumb img")).toHaveLength(2));
  expect(thumbnailLocalVideo).toHaveBeenCalledTimes(2); expect(preview).not.toHaveBeenCalled();
  expect(screen.getByText("a.mp4")).toBeTruthy(); expect(screen.getByText("b.mp4")).toBeTruthy();
});

it("rapid and repeated imports discard late packets and keep distinct source identities", async () => {
  const backend = new DemoDesktopBackend(); let finish!: (value: ReturnType<typeof packet>) => void;
  const thumbnailLocalVideo = vi.fn(async (r: LocalVideoPreviewRequest) => r.expectedSnapshotId === "old" ? new Promise<ReturnType<typeof packet>>(resolve => { finish = resolve; }) : packet(r.sourceId, r.expectedSnapshotId));
  Object.assign(backend, { thumbnailLocalVideo }); const cancel = vi.spyOn(backend, "cancelOperation");
  const { container, rerender } = render(panel(backend, [source("a")], "old"));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  rerender(panel(backend, [source("a"), { ...source("a-copy"), uri: source("a").uri, displayName: "a.mp4" }], "new"));
  await waitFor(() => expect(container.querySelectorAll(".media-thumb img")).toHaveLength(2));
  await act(async () => finish({ ...packet("wrong-source", "old"), base64: "bad" }));
  expect(container.querySelectorAll(".media-thumb img")).toHaveLength(2); expect(cancel).toHaveBeenCalledTimes(1);
  expect(thumbnailLocalVideo.mock.calls.slice(1).map(([r]) => r.sourceId)).toEqual(["a", "a-copy"]);
});

it("failed extraction or image decode leaves a readable filename and fallback", async () => {
  const backend = new DemoDesktopBackend(); Object.assign(backend, { thumbnailLocalVideo: vi.fn(async () => { throw Error("offline"); }) });
  const { rerender, container } = render(panel(backend, [source("a")], "s1"));
  expect(await screen.findByText("Miniatura indisponível")).toBeTruthy(); expect(screen.getByText("a.mp4")).toBeTruthy();
  Object.assign(backend, { thumbnailLocalVideo: vi.fn(async (r: LocalVideoPreviewRequest) => packet(r.sourceId, r.expectedSnapshotId)) });
  rerender(panel(backend, [source("a")], "s2"));
  await waitFor(() => expect(container.querySelector(".media-thumb img")).toBeTruthy());
  fireEvent.error(container.querySelector(".media-thumb img")!);
  expect(screen.getByText("Miniatura indisponível")).toBeTruthy();
});
it("explicit thumbnail retry uses the existing route, retains other admitted cards and never selects/plays", async () => {
  const backend = new DemoDesktopBackend(); let failed = true;
  const thumbnailLocalVideo = vi.fn(async (r: LocalVideoPreviewRequest) => {
    if (r.sourceId === "a" && failed) throw Error("transient");
    return packet(r.sourceId, r.expectedSnapshotId);
  });
  Object.assign(backend, { thumbnailLocalVideo });
  const { container } = render(panel(backend, [source("a"), source("b")], "s1"));
  const retry = await screen.findByRole("button", { name: "Tentar miniatura novamente · a" });
  await waitFor(() => expect(container.querySelectorAll(".media-thumb img")).toHaveLength(1));
  failed = false; fireEvent.click(retry);
  await waitFor(() => expect(container.querySelectorAll(".media-thumb img")).toHaveLength(2));
  expect(thumbnailLocalVideo.mock.calls.map(([request]) => request.sourceId)).toEqual(["a", "b", "a"]);
  expect(screen.queryByRole("button", { name: "Tentar miniatura novamente · a" })).toBeNull();
});

it("media filter tabs rove and change with arrows/Home/End, while IME and VoiceOver modifiers remain owned", () => {
  render(panel(new DemoDesktopBackend(), [source("a")], "s1"));
  const tabs = screen.getAllByRole("tab");
  expect(tabs.map(tab => tab.tabIndex)).toEqual([0, -1, -1, -1]);
  tabs[0]!.focus(); fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
  expect(document.activeElement).toBe(tabs[1]);
  expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
  fireEvent.keyDown(tabs[1]!, { key: "End", ctrlKey: true, altKey: true });
  expect(document.activeElement).toBe(tabs[1]);
  fireEvent.keyDown(tabs[1]!, { key: "End", isComposing: true });
  expect(document.activeElement).toBe(tabs[1]);
  fireEvent.keyDown(tabs[1]!, { key: "End" }); expect(document.activeElement).toBe(tabs[3]);
  fireEvent.keyDown(tabs[3]!, { key: "Home" }); expect(document.activeElement).toBe(tabs[0]);
});
