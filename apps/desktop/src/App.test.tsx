import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { translationKeys } from "@cevra/i18n";
import { validateProjectIR } from "@cevra/project-ir";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { DemoDesktopBackend } from "./backend/demo-desktop-backend";

async function renderApplication() {
  const user = userEvent.setup();
  render(<App backend={new DemoDesktopBackend()} />);
  await screen.findByText("Consulta — Dra. Helena");
  return user;
}

describe("CEVRA Vids desktop shell", () => {
  it("renders the application with Editar as the default workspace", async () => {
    await renderApplication();
    expect(screen.getByText("CEVRA Vids")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Editar" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Pré-visualização")).toBeTruthy();
  });

  it("switches all adaptive workspaces without replacing the project", async () => {
    const user = await renderApplication();
    const workspaceNavigation = screen.getByRole("tablist", { name: "Espaços de trabalho do editor" });
    for (const [tab, testId] of [["Transcrição", "workspace-transcription"], ["Composição", "workspace-composition"], ["Legendas", "workspace-captions"], ["Áudio", "workspace-audio"]] as const) {
      await user.click(within(workspaceNavigation).getByRole("tab", { name: tab }));
      expect(screen.getByTestId(testId)).toBeTruthy();
      expect(screen.getByText("Consulta — Dra. Helena")).toBeTruthy();
    }
  });

  it("supports keyboard workspace navigation", async () => {
    await renderApplication();
    const edit = screen.getByRole("tab", { name: "Editar" });
    edit.focus();
    fireEvent.keyDown(edit.parentElement!, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Transcrição" }).getAttribute("aria-selected")).toBe("true");
  });

  it("preserves the same playhead when changing workspaces", async () => {
    const user = await renderApplication();
    const ruler = screen.getByRole("slider", { name: "Régua e cursor da linha do tempo" });
    expect(ruler.getAttribute("aria-valuenow")).toBe("24300");
    fireEvent.keyDown(ruler, { key: "ArrowRight" });
    expect(ruler.getAttribute("aria-valuenow")).toBe("25300");
    await user.click(screen.getByRole("tab", { name: "Transcrição" }));
    expect(screen.getByRole("slider", { name: "Régua e cursor da linha do tempo" }).getAttribute("aria-valuenow")).toBe("25300");
  });

  it("preserves the selected timeline item across workspaces", async () => {
    const user = await renderApplication();
    const timeline = screen.getByLabelText("Linha do tempo");
    const captionItem = within(timeline).getByRole("button", { name: "Quando a explicação é clara," });
    await user.click(captionItem);
    expect(screen.getByTestId("selected-item").textContent).toContain("Quando a explicação é clara,");
    await user.click(screen.getByRole("tab", { name: "Legendas" }));
    expect(screen.getByTestId("selected-item").textContent).toContain("Quando a explicação é clara,");
  });

  it("edits the local Director draft while execution stays unavailable", async () => {
    const user = await renderApplication();
    const input = screen.getByLabelText("Instrução para o Diretor CEVRA") as HTMLTextAreaElement;
    await user.type(input, "Priorize a explicação final");
    expect(input.value).toBe("Priorize a explicação final");
    expect((screen.getByRole("button", { name: "Executar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("selects a demo preset without executing a Project IR mutation", async () => {
    const user = await renderApplication();
    const selector = screen.getByLabelText("Preset") as HTMLSelectElement;
    const shell = screen.getByTestId("app-shell");
    expect(shell.dataset.projectRevision).toBe("0");
    await user.selectOptions(selector, "dynamic-reels");
    expect(selector.value).toBe("dynamic-reels");
    expect(shell.dataset.projectRevision).toBe("0");
    expect((screen.getByRole("button", { name: "Aplicar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the exact canonical timeline track order", async () => {
    await renderApplication();
    const tracks = screen.getAllByTestId(/^timeline-track-/).map((element) => element.getAttribute("data-testid")?.replace("timeline-track-track-", ""));
    expect(tracks).toEqual(["v4", "v3", "v2", "v1", "a3", "a2", "a1"]);
  });

  it("maintains exact PT-BR and EN-US catalog key parity", () => {
    expect(translationKeys("pt-BR")).toEqual(translationKeys("en-US"));
  });

  it("declares every execution capability unavailable in DemoDesktopBackend", () => {
    const backend = new DemoDesktopBackend();
    const capabilities = ["media.import", "director.execute", "changes.apply", "project.export"] as const;
    expect(capabilities.map((capability) => backend.capability(capability).available)).toEqual([false, false, false, false]);
    expect(backend.presentationOnly).toBe(true);
  });

  it("loads a fixture that remains a valid Project IR projection", async () => {
    const project = await new DemoDesktopBackend().loadProjectProjection();
    expect(validateProjectIR(project)).toEqual({ ok: true, value: project });
  });

  it("exposes localized accessibility labels for core icon controls", async () => {
    await renderApplication();
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refazer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tela cheia" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Redimensionar linha do tempo verticalmente" })).toBeTruthy();
  });

  it("switches visible chrome to EN-US with feature parity", async () => {
    const user = await renderApplication();
    await user.click(screen.getByRole("button", { name: "Trocar idioma" }));
    expect(screen.getByRole("tab", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Transcription" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("en-US");
  });

  it("makes every deferred production action explicit and unavailable", async () => {
    await renderApplication();
    expect((screen.getByRole("button", { name: "Importar" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Exportar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("A importação real de arquivos não está conectada nesta versão de apresentação.")).toBeTruthy();
  });
});
