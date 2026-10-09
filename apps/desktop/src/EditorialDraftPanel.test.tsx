import { presentSources } from "./source-presentation";
import { translate } from "@cevra/i18n";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { App } from "./App";
import { EditorialFixtureBackend } from "./backend/editorial-fixture-backend";
import { DemoDesktopBackend } from "./backend/demo-desktop-backend";
import { EditorialDraftPanel } from "./components/EditorialDraftPanel";
import { TauriDesktopBackend } from "./backend/tauri-desktop-backend";

it("shows accepted blocks, sources, caveats, unchanged partial assessment and original relations", async () => {
  const backend = new EditorialFixtureBackend(); const before = backend.history.toArchive();
  render(<App backend={backend} />);
  await screen.findByText("Proposta para revisão · não aplicada ao vídeo");
  const panel = screen.getByRole("region", { name: "Rascunho editorial" });
  expect(within(panel).getAllByLabelText("Título do bloco")).toHaveLength(5);
  expect(within(panel).getByText("Parcial", { selector: "strong" })).toBeTruthy();
  expect(within(panel).getAllByText(translate("pt-BR", "editorialDraft.block.caveat"))).toHaveLength(2);
  expect(within(panel).getAllByText("Referência da análise: E1")).toHaveLength(2);
  expect(within(panel).getAllByText("Referência da análise: E2")).toHaveLength(3);
  expect(within(panel).getByText(/Possible repetition/)).toBeTruthy();
  expect(within(panel).getByText(/compares E1 but cites only E2/)).toBeTruthy();
  fireEvent.click(within(panel).getAllByRole("button", { name: "Ver fonte no Vídeo 2" })[0]);
  expect(screen.getByTestId("app-shell").dataset.activeSourceId).toBe("source-2");
  expect(backend.history.toArchive()).toEqual(before);
  expect((screen.getByRole("button", { name: "Aplicar" }) as HTMLButtonElement).disabled).toBe(true);
});

it("reorders while retaining unsaved title/note edits, immutable evidence and project redo", async () => {
  const backend = new EditorialFixtureBackend(); const before = backend.history.toArchive(); const original = await backend.loadEditorialDraft();
  const user = userEvent.setup(); render(<App backend={backend} />);
  const titles = await screen.findAllByLabelText("Título do bloco");
  await waitFor(() => expect((titles[1] as HTMLInputElement).disabled).toBe(false));
  fireEvent.change(titles[1], { target: { value: "Condição essencial" } });
  fireEvent.change(screen.getAllByLabelText("Sua nota")[1], { target: { value: "Preservar junto ao prazo." } });
  await user.click(screen.getByRole("button", { name: "Mover bloco 2 para cima" }));
  await waitFor(() => expect((screen.getAllByLabelText("Título do bloco")[0] as HTMLInputElement).value).toBe("Condição essencial"));
  const next = await backend.loadEditorialDraft();
  if (next.status !== "current" || original.status !== "current") throw new Error("fixture unavailable");
  expect(next.draft.blocks[0].userNote).toBe("Preservar junto ao prazo.");
  expect(next.draft.analysis).toEqual(original.draft.analysis);
  expect(next.draft.evidence).toEqual(original.draft.evidence);
  expect(backend.history.toArchive()).toEqual(before); expect(backend.history.canRedo).toBe(true);
});

it("saves title/note only and displays stale state after canonical redo", async () => {
  const backend = new EditorialFixtureBackend(); const user = userEvent.setup(); render(<App backend={backend} />);
  const titles = await screen.findAllByLabelText("Título do bloco");
  fireEvent.change(titles[0], { target: { value: "Oficina sob encomenda" } });
  await user.click(screen.getByRole("button", { name: "Guardar títulos e notas na sessão" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "Atualizar" }) as HTMLButtonElement).disabled).toBe(false));
  await user.click(screen.getByRole("button", { name: "Refazer" }));
  await screen.findByText(translate("pt-BR", "editorialDraft.error.stale"));
  expect(screen.queryAllByLabelText("Título do bloco")).toHaveLength(5);
  expect((screen.getAllByLabelText("Título do bloco")[0] as HTMLInputElement).disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: "Atualizar" }));
  expect(screen.queryAllByLabelText("Título do bloco")).toHaveLength(5);
});

it("keeps the same draft and editable content when switching the interface to English", async () => {
  const backend = new EditorialFixtureBackend(); const user = userEvent.setup(); render(<App backend={backend} />);
  await screen.findAllByLabelText("Título do bloco");
  await user.click(screen.getByRole("button", { name: translate("pt-BR", "top.switchLanguage") }));
  expect(screen.getAllByLabelText("Block title")).toHaveLength(5);
  expect(screen.getByText("Proposal for review · not applied to the video")).toBeTruthy();
  expect(screen.getByText("A oficina monta caixas sob encomenda.", { selector: ".editorial-statement" })).toBeTruthy();
});

it("shows an honest empty session instead of a fabricated change set", async () => {
  render(<App backend={new DemoDesktopBackend()} />);
  await screen.findByText("Nenhuma análise aceita está disponível nesta sessão.");
  expect(screen.queryAllByLabelText("Título do bloco")).toHaveLength(0);
  expect(screen.queryByText("12")).toBeNull();
});

it("retains unsaved edits across workspace navigation and same-revision refresh; discard leaves history/draft untouched", async () => {
  const backend = new EditorialFixtureBackend(); const before = backend.history.toArchive(); const original = await backend.loadEditorialDraft();
  const user = userEvent.setup(); render(<App backend={backend} />);
  const titles = await screen.findAllByLabelText("Título do bloco");
  fireEvent.change(titles[0], { target: { value: "Nota de revisão ainda não guardada" } });
  await user.click(screen.getByRole("tab", { name: "Transcrição" }));
  expect(screen.queryByRole("region", { name: "Rascunho editorial" })).toBeNull();
  await user.click(screen.getByRole("tab", { name: "Editar" }));
  expect((screen.getAllByLabelText("Título do bloco")[0] as HTMLInputElement).value).toBe("Nota de revisão ainda não guardada");
  await user.click(screen.getByRole("button", { name: "Atualizar" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "Atualizar" }) as HTMLButtonElement).disabled).toBe(false));
  expect((screen.getAllByLabelText("Título do bloco")[0] as HTMLInputElement).value).toBe("Nota de revisão ainda não guardada");
  await user.click(screen.getByRole("button", { name: "Descartar títulos e notas não guardados" }));
  expect((screen.getAllByLabelText("Título do bloco")[0] as HTMLInputElement).value).toBe("Tema");
  expect(await backend.loadEditorialDraft()).toEqual(original);
  expect(backend.history.toArchive()).toEqual(before);
});

it("blocks invalid blank titles locally and allows discard without a revision", async () => {
  const backend = new EditorialFixtureBackend(); render(<App backend={backend} />);
  const titles = await screen.findAllByLabelText("Título do bloco");
  fireEvent.change(titles[0], { target: { value: " " } });
  expect((screen.getByRole("button", { name: "Guardar títulos e notas na sessão" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Descartar títulos e notas não guardados" }));
  const state = await backend.loadEditorialDraft();
  expect(state.status === "current" && state.draft.revision).toBe(0);
});

it("resets local edits when analysis identity changes at the same draft id and revision", async () => {
  const sourceBackend = new EditorialFixtureBackend();
  const state = await sourceBackend.loadEditorialDraft();
  if (state.status !== "current") throw new Error("fixture unavailable");
  const props = { presentations: presentSources(sourceBackend.history.current.sources, sourceBackend.history.sourceNumbering, (key, parameters) => translate("pt-BR", key, parameters)), busy: false, error: false, t: (key: Parameters<typeof translate>[1]) => translate("pt-BR", key), onRefresh() {}, async onRevise() {}, onSourceSelect() {} };
  const { rerender } = render(<EditorialDraftPanel state={state} {...props} />);
  fireEvent.change(screen.getAllByLabelText("Título do bloco")[0], { target: { value: "Nota do contexto anterior" } });
  const draft = { ...state.draft, analysis: { ...state.draft.analysis, contextId: "another-synthetic-context", candidate: { ...state.draft.analysis.candidate, observations: state.draft.analysis.candidate.observations.map(item => ({ ...item, id: `next-${item.id}` })) } }, blocks: state.draft.blocks.map(item => ({ ...item, id: `next-${item.id}`, observationId: `next-${item.observationId}`, title: "Novo contexto" })) };
  rerender(<EditorialDraftPanel state={{ status: "current", draft }} {...props} />);
  expect((screen.getAllByLabelText("Título do bloco")[0] as HTMLInputElement).value).toBe("Novo contexto");
});

it("reviews through the existing native commands while temporary-session canonical actions remain disabled", async () => {
  const source = new EditorialFixtureBackend(); const state = await source.loadState(); const calls: string[] = [];
  const backend = new TauriDesktopBackend(async (command, args) => {
    calls.push(command);
    if (command === "desktop_get_state") return { project: state.project, sourceNumbering: state.sourceNumbering, canUndo: false, canRedo: false,
      status: { hostAvailable: true, persistence: "temporary-review" }, capabilities: {
        mediaImport: { available: false, reason: "review-session" }, transcription: { available: false, reason: "review-session" }
      } } as never;
    if (command === "desktop_get_editorial_draft") return await source.loadEditorialDraft() as never;
    if (command === "desktop_revise_editorial_draft") return await source.reviseEditorialDraft(args!.args as Parameters<typeof source.reviseEditorialDraft>[0]) as never;
    throw new Error("Unexpected native action");
  });
  const user = userEvent.setup(); render(<App backend={backend} />);
  await screen.findByText("Revisão temporária · não guardada");
  const titles = await screen.findAllByLabelText("Título do bloco");
  await waitFor(() => expect((titles[0] as HTMLInputElement).disabled).toBe(false));
  expect((screen.getByRole("button", { name: "Refazer" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Importar" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(titles[0], { target: { value: "Revisão na sessão temporária" } });
  await user.click(screen.getByRole("button", { name: "Guardar títulos e notas na sessão" }));
  await waitFor(() => expect(calls).toContain("desktop_revise_editorial_draft"));
  await waitFor(() => expect((screen.getByRole("button", { name: "Atualizar" }) as HTMLButtonElement).disabled).toBe(false));
  const revised = await source.loadEditorialDraft();
  expect(revised.status === "current" && revised.draft.blocks[0].title).toBe("Revisão na sessão temporária");
  await user.click(screen.getByRole("button", { name: "Trocar idioma" }));
  expect(screen.getByText("Temporary review · not saved")).toBeTruthy();
  expect((await source.loadEditorialDraft()).status).toBe("current");
  expect(calls.every(command => ["desktop_get_state", "desktop_get_editorial_draft", "desktop_revise_editorial_draft"].includes(command))).toBe(true);
});
it.each(["refresh", "revise"])("transient %s failure retains pending text, avoids false stale, and retry preserves the draft", async failingAction => {
  const backend = new EditorialFixtureBackend();
  render(<App backend={backend} />);
  const titles = await screen.findAllByLabelText("Título do bloco");
  await waitFor(() => expect((titles[0] as HTMLInputElement).disabled).toBe(false));
  const before = backend.history.toArchive();
  fireEvent.change(titles[0], { target: { value: "Texto ainda não guardado" } });
  const note = screen.getAllByLabelText("Sua nota")[0]!;
  fireEvent.change(note, { target: { value: "Minha anotação pendente." } });
  const method = failingAction === "refresh" ? "loadEditorialDraft" : "reviseEditorialDraft";
  vi.spyOn(backend, method).mockRejectedValueOnce({ code: "HOST_TIMEOUT" });
  fireEvent.click(screen.getByRole("button", { name: failingAction === "refresh" ? "Atualizar" : "Guardar títulos e notas na sessão" }));
  await screen.findByText(translate("pt-BR", "editorialReview.error"));
  expect((screen.getAllByLabelText("Título do bloco")[0] as HTMLInputElement).value).toBe("Texto ainda não guardado");
  expect((screen.getAllByLabelText("Sua nota")[0] as HTMLTextAreaElement).value).toBe("Minha anotação pendente.");
  expect(screen.queryByText(translate("pt-BR", "editorialDraft.error.stale"))).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
  await waitFor(() => expect((screen.getAllByLabelText("Título do bloco")[0] as HTMLInputElement).disabled).toBe(false));
  expect((screen.getAllByLabelText("Título do bloco")[0] as HTMLInputElement).value).toBe("Texto ainda não guardado");
  expect(backend.history.toArchive()).toEqual(before);
});

it("editorial labels identify block and limits, expose invalid fields, and disclose reorder saving drafts", async () => {
  render(<App backend={new EditorialFixtureBackend()} />);
  const title = await screen.findByRole("textbox", { name: "Título do bloco 2 (até 200 caracteres)" });
  expect(screen.getByRole("textbox", { name: "Sua nota no bloco 2 (até 2.000 caracteres)" })).toBeTruthy();
  fireEvent.change(title, { target: { value: " " } });
  expect(title.getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(title.getAttribute("aria-describedby")!)?.textContent).toBeTruthy();
  expect(screen.getByText("Reordenar também guarda os títulos e notas pendentes na sessão.")).toBeTruthy();
});
