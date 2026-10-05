import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { App } from "./App";
import { EditorialFixtureBackend } from "./backend/editorial-fixture-backend";

async function nextPaints() {
  await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
}
async function setup() {
  const backend = new EditorialFixtureBackend();
  const before = backend.history.toArchive(), draft = await backend.loadEditorialDraft();
  const user = userEvent.setup();
  render(<App backend={backend} />);
  await screen.findAllByLabelText("Título do bloco");
  await nextPaints();
  return { backend, before, draft, user };
}

it("collapses the whole column explicitly and restores unsaved editorial/Director state, selection and playhead", async () => {
  const { backend, before, draft, user } = await setup();
  const shell = screen.getByTestId("app-shell"), selected = shell.dataset.selectedProjectItemId;
  const playhead = screen.getByRole("slider", { name: "Régua e cursor da linha do tempo" }).getAttribute("aria-valuenow");
  const title = screen.getAllByLabelText("Título do bloco")[0] as HTMLInputElement;
  const note = screen.getAllByLabelText("Sua nota")[0] as HTMLTextAreaElement;
  const instruction = screen.getByLabelText("Instrução para o Diretor CEVRA") as HTMLTextAreaElement;
  fireEvent.change(title, { target: { value: "Título ainda não guardado" } });
  fireEvent.change(note, { target: { value: "Nota local ainda não guardada" } });
  fireEvent.change(instruction, { target: { value: "Rever a abertura" } });
  await user.selectOptions(screen.getByLabelText("Preset"), "dynamic-reels");
  await user.click(screen.getByRole("button", { name: "Modo compacto" }));
  expect(screen.queryByRole("complementary", { name: "Painel de edição" })).toBeNull();
  const reopen = screen.getByRole("button", { name: "Reabrir coluna" });
  expect(reopen.getAttribute("aria-expanded")).toBe("false");
  await waitFor(() => expect(document.activeElement).toBe(reopen));
  await user.click(reopen);
  await nextPaints();
  expect(screen.getAllByLabelText("Título do bloco")[0]).toBe(title);
  expect(title.value).toBe("Título ainda não guardado");
  expect(note.value).toBe("Nota local ainda não guardada");
  expect(instruction.value).toBe("Rever a abertura");
  expect((screen.getByLabelText("Preset") as HTMLSelectElement).value).toBe("dynamic-reels");
  expect(shell.dataset.selectedProjectItemId).toBe(selected);
  expect(screen.getByRole("slider", { name: "Régua e cursor da linha do tempo" }).getAttribute("aria-valuenow")).toBe(playhead);
  expect(backend.history.toArchive()).toEqual(before);
  expect(await backend.loadEditorialDraft()).toEqual(draft);
});

it("restores independent editorial and contextual scroll offsets after collapsed layout loses its boxes", async () => {
  const { user } = await setup();
  const editorial = document.querySelector<HTMLElement>('[data-sidebar-scroll="editorial"]')!;
  const context = document.querySelector<HTMLElement>('[data-sidebar-scroll="context"]')!;
  editorial.scrollTop = 440; context.scrollTop = 76;
  fireEvent.scroll(editorial); fireEvent.scroll(context);
  await user.click(screen.getByRole("button", { name: "Modo compacto" }));
  editorial.scrollTop = 0; context.scrollTop = 0;
  await user.click(screen.getByRole("button", { name: "Reabrir coluna" }));
  await nextPaints();
  expect(editorial.scrollTop).toBe(440);
  expect(context.scrollTop).toBe(76);
});

it("bounds keyboard width/height changes without automatically collapsing or mutating the project", async () => {
  const { backend, before, user } = await setup();
  const width = screen.getByRole("separator", { name: "Ajustar largura da coluna de edição" });
  const split = screen.getByRole("separator", { name: "Dividir espaço entre Diretor e controles" });
  expect(width.getAttribute("aria-valuenow")).toBe("360");
  fireEvent.keyDown(width, { key: "Home" });
  expect(width.getAttribute("aria-valuenow")).toBe("320");
  fireEvent.keyDown(width, { key: "ArrowRight" });
  expect(width.getAttribute("aria-valuenow")).toBe("320");
  fireEvent.keyDown(width, { key: "End" });
  expect(width.getAttribute("aria-valuenow")).toBe("480");
  fireEvent.keyDown(width, { key: "ArrowLeft", shiftKey: true });
  expect(width.getAttribute("aria-valuenow")).toBe("480");
  fireEvent.keyDown(split, { key: "Home" });
  expect(split.getAttribute("aria-valuenow")).toBe(split.getAttribute("aria-valuemin"));
  fireEvent.keyDown(split, { key: "End" });
  expect(split.getAttribute("aria-valuenow")).toBe(split.getAttribute("aria-valuemax"));
  expect(screen.getByRole("complementary", { name: "Painel de edição" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Modo compacto" }));
  await user.click(screen.getByRole("button", { name: "Reabrir coluna" }));
  expect(width.getAttribute("aria-valuenow")).toBe("480");
  expect(split.getAttribute("aria-valuenow")).toBe(split.getAttribute("aria-valuemax"));
  expect(backend.history.toArchive()).toEqual(before);
});

it("keeps the explicit reopen action available in English and returns to the same editable draft", async () => {
  const { user } = await setup();
  const title = screen.getAllByLabelText("Título do bloco")[0] as HTMLInputElement;
  fireEvent.change(title, { target: { value: "Texto preservado" } });
  await user.click(screen.getByRole("button", { name: "Modo compacto" }));
  await user.click(screen.getByRole("button", { name: "Trocar idioma" }));
  await user.click(screen.getByRole("button", { name: "Reopen column" }));
  expect(screen.getByRole("complementary", { name: "Editing panel" })).toBeTruthy();
  expect(screen.getAllByLabelText("Block title")[0]).toBe(title);
  expect(title.value).toBe("Texto preservado");
});

it("starts divider dragging at the visible height after an enlarged editorial area is clamped by window resize", async () => {
  const { backend, before } = await setup();
  const split = screen.getByRole("separator", { name: "Dividir espaço entre Diretor e controles" });
  fireEvent.keyDown(split, { key: "End" });
  const body = document.querySelector<HTMLElement>(".editing-sidebar-body")!;
  const measurement = vi.spyOn(body, "getBoundingClientRect").mockReturnValue({ height: 508 } as DOMRect);
  fireEvent(window, new Event("resize"));
  expect(split.getAttribute("aria-valuenow")).toBe("320");
  const pointer = (type: string, clientY: number) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientY });
    Object.defineProperty(event, "pointerId", { value: 7 });
    fireEvent(split, event);
  };
  pointer("pointerdown", 400);
  pointer("pointermove", 384);
  expect(split.getAttribute("aria-valuenow")).toBe("304");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(split.getAttribute("aria-valuenow")).toBe("320");
  expect(backend.history.toArchive()).toEqual(before);
  measurement.mockRestore();
});
