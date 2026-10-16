import { presentSources } from "./source-presentation";
import { translate } from "@cevra/i18n";
import { createEmptyProject, ProjectHistory, sourceNumberingForSources, type SourceAsset } from "@cevra/project-ir";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EditorialFixtureBackend } from "./backend/editorial-fixture-backend";
import { EditorialDraftPanel } from "./components/EditorialDraftPanel";
import { MediaPanel } from "./components/MediaPanel";

const pt = (key: Parameters<typeof translate>[1], parameters?: Record<string, string | number>) => translate("pt-BR", key, parameters);

it("keeps source numbers across media search/filter and names non-video sources accurately", () => {
  const sources: SourceAsset[] = [
    { id: "video-a", kind: "video", uri: "demo://a.mov", displayName: "a.mov" },
    { id: "audio-a", kind: "audio", uri: "demo://sound.wav", displayName: "sound.wav" },
    { id: "video-b", kind: "video", uri: "demo://long-second-name.mov", displayName: "long-second-name.mov" },
    { id: "image-a", kind: "image", uri: "demo://still.png", displayName: "still.png" }
  ];
  const select = vi.fn();
  render(<MediaPanel sources={sources} presentations={presentSources(sources, sourceNumberingForSources(sources), pt)} selectedId={null} workspace="edit" importAvailable={false} importReason="review-session" importBusy={false} t={pt} onSelect={select} onImport={() => {}} />);
  expect(screen.getByText("Áudio 2")).toBeTruthy();
  expect(screen.getByText("Imagem 4")).toBeTruthy();
  expect(screen.getByText("long-second-name.mov")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: pt("media.filter.video") }));
  fireEvent.change(screen.getByRole("textbox", { name: pt("media.searchPlaceholder") }), { target: { value: "Vídeo 3" } });
  const second = screen.getByRole("button", { name: "Vídeo 3 · long-second-name.mov" });
  expect(second.getAttribute("title")).toBe("long-second-name.mov");
  expect(screen.queryByText("Vídeo 1")).toBeNull();
  fireEvent.click(second);
  expect(select).toHaveBeenCalledWith("video-b");
});

it("maps multiple evidence references to their one real source regardless of block order", async () => {
  const backend = new EditorialFixtureBackend();
  const state = await backend.loadEditorialDraft();
  if (state.status !== "current") throw new Error("fixture unavailable");
  const firstEvidence = state.draft.evidence[0];
  const firstBlock = state.draft.blocks[0];
  const draft = {
    ...state.draft,
    evidence: [...state.draft.evidence, { ...firstEvidence, reference: "E3" }],
    blocks: [{ ...firstBlock, evidenceReferences: [firstEvidence.reference, "E3"] }, ...state.draft.blocks.slice(1)]
  };
  const select = vi.fn();
  const props = { presentations: presentSources(backend.history.current.sources, backend.history.sourceNumbering, pt), busy: false, error: false, t: pt, onRefresh() {}, async onRevise() {}, onSourceSelect: select };
  const { container, rerender } = render(<EditorialDraftPanel state={{ status: "current", draft }} {...props} />);
  const first = container.querySelector(`[data-block-id="${firstBlock.id}"]`)! as HTMLElement;
  expect(within(first).getAllByText("Trecho do Vídeo 1:")).toHaveLength(2);
  const actions = within(first).getAllByRole("button", { name: "Ver fonte no Vídeo 1" });
  fireEvent.click(actions[1]);
  expect(select).toHaveBeenCalledWith(firstEvidence.sourceId);
  rerender(<EditorialDraftPanel state={{ status: "current", draft: { ...draft, revision: 1, blocks: [...draft.blocks].reverse() } }} {...props} />);
  const moved = container.querySelector(`[data-block-id="${firstBlock.id}"]`)! as HTMLElement;
  expect(within(moved).getByText("Bloco 5")).toBeTruthy();
  expect(within(moved).getAllByRole("button", { name: "Ver fonte no Vídeo 1" })).toHaveLength(2);
});

it("displays host-owned identities after removal, undo, branch replacement and reopening in either locale", () => {
  const project = createEmptyProject({ id: "one", name: "Sources" });
  const a: SourceAsset = { id: "a", kind: "video", uri: "demo://a", displayName: "same.mov" };
  const b: SourceAsset = { ...a, id: "b" };
  const c: SourceAsset = { ...a, id: "c" };
  const d: SourceAsset = { ...a, id: "d" };
  project.sources = [a, b];
  const history = new ProjectHistory(project);
  history.commit({ type: "source.remove", sourceId: "a" });
  history.commit({ type: "source.add", source: c });
  history.undo();
  history.commit({ type: "source.add", source: d });
  const reopened = ProjectHistory.fromArchive(history.toArchive());
  const select = vi.fn();
  const props = { selectedId: null, workspace: "edit" as const, importAvailable: false, importReason: "review-session" as const, importBusy: false, t: pt, onSelect: select, onImport() {} };
  const { rerender } = render(<MediaPanel sources={reopened.current.sources} presentations={presentSources(reopened.current.sources, reopened.sourceNumbering, pt)} {...props} />);
  fireEvent.change(screen.getByRole("textbox", { name: pt("media.searchPlaceholder") }), { target: { value: "Vídeo 4" } });
  fireEvent.click(screen.getByRole("button", { name: "Vídeo 4 · same.mov" }));
  expect(select).toHaveBeenCalledWith("d");
  expect(screen.queryByText("Vídeo 3")).toBeNull();
  const en = (key: Parameters<typeof translate>[1], parameters?: Record<string, string | number>) => translate("en-US", key, parameters);
  rerender(<MediaPanel sources={reopened.current.sources} presentations={presentSources(reopened.current.sources, reopened.sourceNumbering, en)} {...props} t={en} />);
  fireEvent.change(screen.getByRole("textbox", { name: en("media.searchPlaceholder") }), { target: { value: "" } });
  expect(screen.getByText("Video 2")).toBeTruthy();
  expect(screen.getByText("Video 4")).toBeTruthy();
});
