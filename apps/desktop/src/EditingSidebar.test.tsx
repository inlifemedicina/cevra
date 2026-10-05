import { act, fireEvent, render, screen } from "@testing-library/react";
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

it("switches to compact tabs and back while preserving unsaved editorial/Director state, selection and playhead", async () => {
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
  expect(screen.getByRole("complementary", { name: "Painel de edição" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "Diretor" }).getAttribute("aria-selected")).toBe("true");
  expect(shell.style.getPropertyValue("--sidebar-width")).toBe("286px");
  await user.click(screen.getByRole("tab", { name: "Controles" }));
  await user.click(screen.getByRole("tab", { name: "Diretor" }));
  await user.click(screen.getByRole("button", { name: "Modo aberto" }));
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

it("restores independent editorial and contextual scroll offsets after mode and tab layout changes", async () => {
  const { user } = await setup();
  const editorial = document.querySelector<HTMLElement>('[data-sidebar-scroll="editorial"]')!;
  const context = document.querySelector<HTMLElement>('[data-sidebar-scroll="context"]')!;
  editorial.scrollTop = 440; context.scrollTop = 76;
  fireEvent.scroll(editorial); fireEvent.scroll(context);
  await user.click(screen.getByRole("button", { name: "Modo compacto" }));
  editorial.scrollTop = 0; context.scrollTop = 0;
  await user.click(screen.getByRole("tab", { name: "Controles" }));
  await nextPaints();
  expect(context.scrollTop).toBe(76);
  await user.click(screen.getByRole("tab", { name: "Diretor" }));
  await nextPaints();
  expect(editorial.scrollTop).toBe(440);
  await user.click(screen.getByRole("button", { name: "Modo aberto" }));
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
  expect(screen.getByTestId("app-shell").style.getPropertyValue("--sidebar-width")).toBe("286px");
  await user.click(screen.getByRole("button", { name: "Modo aberto" }));
  expect(width.getAttribute("aria-valuenow")).toBe("480");
  expect(split.getAttribute("aria-valuenow")).toBe(split.getAttribute("aria-valuemax"));
  expect(backend.history.toArchive()).toEqual(before);
});

it("provides compact Director/Controls tabs and return to open mode in English", async () => {
  const { user } = await setup();
  const title = screen.getAllByLabelText("Título do bloco")[0] as HTMLInputElement;
  fireEvent.change(title, { target: { value: "Texto preservado" } });
  await user.click(screen.getByRole("button", { name: "Modo compacto" }));
  await user.click(screen.getByRole("button", { name: "Trocar idioma" }));
  expect(screen.getByRole("tab", { name: "Director" })).toBeTruthy();
  await user.click(screen.getByRole("tab", { name: "Controls" }));
  await user.click(screen.getByRole("button", { name: "Expanded mode" }));
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

it("supports keyboard tab selection and remembers it plus expanded width across mode transitions", async () => {
  const { backend, before, user } = await setup();
  const width = screen.getByRole("separator", { name: "Ajustar largura da coluna de edição" });
  fireEvent.keyDown(width, { key: "End" });
  await user.click(screen.getByRole("button", { name: "Modo compacto" }));
  const director = screen.getByRole("tab", { name: "Diretor" });
  director.focus();
  fireEvent.keyDown(director, { key: "ArrowRight" });
  const controls = screen.getByRole("tab", { name: "Controles" });
  expect(controls.getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(controls);
  expect(screen.getByRole("tabpanel", { name: "Controles" })).toBeTruthy();
  expect(screen.queryByRole("tabpanel", { name: "Diretor" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Modo aberto" }));
  expect(screen.getByTestId("app-shell").style.getPropertyValue("--sidebar-width")).toBe("480px");
  await user.click(screen.getByRole("button", { name: "Modo compacto" }));
  expect(controls.getAttribute("aria-selected")).toBe("true");
  fireEvent.keyDown(controls, { key: "Home" });
  expect(director.getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(director);
  expect(backend.history.toArchive()).toEqual(before);
});

it("restores a contextual offset after compact clamping and a delayed open-mode geometry measurement", async () => {
  const { user } = await setup();
  const context = document.querySelector<HTMLElement>('[data-sidebar-scroll="context"]')!;
  let actual = 76, maximum = 1000;
  Object.defineProperty(context, "scrollTop", { configurable: true, get: () => actual, set: value => { actual = Math.min(maximum, value); } });
  fireEvent.scroll(context);
  const body = document.querySelector<HTMLElement>(".editing-sidebar-body")!;
  let height = 444;
  const measurement = vi.spyOn(body, "getBoundingClientRect").mockImplementation(() => ({ height } as DOMRect));
  maximum = 0;
  await user.click(screen.getByRole("button", { name: "Modo compacto" }));
  fireEvent(window, new Event("resize"));
  await user.click(screen.getByRole("tab", { name: "Controles" }));
  await nextPaints();
  expect(context.scrollTop).toBe(0);
  fireEvent.scroll(context);
  await user.click(screen.getByRole("button", { name: "Modo aberto" }));
  await nextPaints();
  expect(context.scrollTop).toBe(0);
  fireEvent.scroll(context);
  maximum = 1000; height = 772;
  fireEvent(window, new Event("resize"));
  await nextPaints();
  expect(context.scrollTop).toBe(76);
  measurement.mockRestore();
});
