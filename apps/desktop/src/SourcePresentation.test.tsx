import { SourcePresentationRegistry } from "./source-presentation";
import { translate } from "@cevra/i18n";
import type { SourceAsset } from "@cevra/project-ir";
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
  render(<MediaPanel sources={sources} presentations={new SourcePresentationRegistry().present("synthetic-project", sources, pt)} selectedId={null} workspace="edit" importAvailable={false} importReason="review-session" importBusy={false} t={pt} onSelect={select} onImport={() => {}} />);
  expect(screen.getByText("Áudio 1")).toBeTruthy();
  expect(screen.getByText("Imagem 1")).toBeTruthy();
  expect(screen.queryByText("long-second-name.mov")).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: pt("media.filter.video") }));
  fireEvent.change(screen.getByRole("textbox", { name: pt("media.searchPlaceholder") }), { target: { value: "Vídeo 2" } });
  const second = screen.getByRole("button", { name: "Vídeo 2 · long-second-name.mov" });
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
  const props = { presentations: new SourcePresentationRegistry().present(backend.history.current.project.id, backend.history.current.sources, pt), busy: false, error: false, t: pt, onRefresh() {}, async onRevise() {}, onSourceSelect: select };
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

it("reserves removed numbers and restores IDs across undo, reordered sources, locale and project switching within the window", () => {
  const registry = new SourcePresentationRegistry();
  const a: SourceAsset = { id: "a", kind: "video", uri: "demo://a", displayName: "same.mov" };
  const b: SourceAsset = { ...a, id: "b" };
  const c: SourceAsset = { ...a, id: "c" };
  const d: SourceAsset = { ...a, id: "d" };
  expect(registry.present("one", [a, b], pt).get("b")?.label).toBe("Vídeo 2");
  expect(registry.present("one", [b, c], pt).get("b")?.label).toBe("Vídeo 2");
  expect(registry.present("one", [b, c], pt).get("c")?.label).toBe("Vídeo 3");
  registry.present("two", [d], pt);
  expect(registry.present("one", [c, b, a], pt).get("a")?.label).toBe("Vídeo 1");
  expect(registry.present("one", [b, d], pt).get("d")?.label).toBe("Vídeo 4");
  const en = (key: Parameters<typeof translate>[1], parameters?: Record<string, string | number>) => translate("en-US", key, parameters);
  expect(registry.present("one", [b], en).get("b")?.label).toBe("Video 2");
});
