import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { translate, translationKeys } from "@cevra/i18n";
import { createEmptyProject, createSourceTranscript, ProjectHistory, validateProjectIR, type ProjectIR } from "@cevra/project-ir";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { DemoDesktopBackend } from "./backend/demo-desktop-backend";
import type { DesktopBackend, DesktopBackendState, ImportMediaResult } from "./backend/desktop-backend";
import { TauriDesktopBackend } from "./backend/tauri-desktop-backend";
import { Inspector } from "./components/Inspector";
import { createDemoProject } from "./fixtures/demo-project";

async function renderApplication(backend = new DemoDesktopBackend()) {
  const user = userEvent.setup();
  render(<App backend={backend} />);
  await screen.findByText("Consulta — Dra. Helena");
  return user;
}

class MultiSourceDemoDesktopBackend extends DemoDesktopBackend {
  override async loadState() {
    const state = await super.loadState();
    const project = structuredClone(state.project) as ProjectIR;
    project.sources.push({
      id: "source-secondary",
      kind: "video",
      uri: "demo://entrevista-secundaria.mov",
      displayName: "Entrevista_Secundaria.mov",
      durationMs: 30000,
      width: 1920,
      height: 1080,
      frameRate: 30,
      checksum: "demo-source-secondary"
    });
    project.sourceTranscripts.push(createSourceTranscript({
      sourceId: "source-secondary",
      wordTiming: "none",
      speakerState: "none",
      transcript: {
        language: "pt-BR",
        words: [],
        segments: [{ id: "segment-secondary", startMs: 1000, endMs: 4000, text: "Conteúdo exclusivo da fonte secundária.", wordIds: [] }]
      },
      provenance: {
        sourceChecksum: "demo-source-secondary",
        stages: [{
          kind: "transcription",
          executionId: "test-transcription-secondary",
          engineId: "test-presentation-adapter",
          engineVersion: "0.1.0",
          engineApiVersion: "1",
          modelId: "test-fixture",
          createdAt: "2026-09-14T12:00:00.000Z"
        }]
      }
    }));
    return { ...state, project };
  }
}

class FunctionalDesktopBackend implements DesktopBackend {
  readonly adapterName = "FunctionalDesktopBackend";
  readonly presentationOnly = false;
  readonly history = new ProjectHistory(createEmptyProject({ id: "desktop-real", name: "CEVRA Vids", now: "2026-09-14T00:00:00.000Z" }), {
    idGenerator: (() => { let value = 0; return () => `desktop-test-${++value}`; })(),
    clock: () => "2026-09-14T00:00:00.000Z"
  });
  pickerCancelled = false;

  async loadState(): Promise<DesktopBackendState> { return this.state(); }
  async pickAndImportMedia(): Promise<ImportMediaResult> {
    if (this.pickerCancelled) return { outcome: "cancelled" };
    const project = this.history.commit({ type: "source.add", source: { id: "imported-source", kind: "video", uri: "/tmp/imported.mp4", displayName: "imported.mp4", durationMs: 4000, width: 1920, height: 1080, frameRate: 30 } });
    return { outcome: "imported", state: this.state(project), importedSourceId: "imported-source" };
  }
  async transcribeSource(sourceId: string): Promise<DesktopBackendState> {
    this.history.commit({ type: "transcript.set", transcript: createSourceTranscript({
      sourceId,
      wordTiming: "none",
      speakerState: "none",
      transcript: { language: "pt-BR", words: [], segments: [{ id: "real-segment", startMs: 0, endMs: 1000, text: "Transcrição local concluída.", wordIds: [] }] },
      provenance: { stages: [{ kind: "transcription", executionId: "real-transcription", engineId: "test", engineVersion: "1", engineApiVersion: "1", modelId: "base", createdAt: "2026-09-14T00:00:00.000Z" }] }
    }) });
    return this.state();
  }
  async undo(): Promise<DesktopBackendState> { this.history.undo(); return this.state(); }
  async redo(): Promise<DesktopBackendState> { this.history.redo(); return this.state(); }
  async cancelOperation(operationId: string) { return { operationId, cancelled: false }; }

  state(project = this.history.current): DesktopBackendState {
    return {
      project,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      status: "local-unsaved",
      capabilities: {
        "media.import": { available: true, reason: "available" },
        "transcription.transcribe": { available: true, reason: "available" },
        "director.execute": { available: false, reason: "desktop-runtime-deferred" },
        "changes.apply": { available: false, reason: "desktop-runtime-deferred" },
        "project.export": { available: false, reason: "desktop-runtime-deferred" }
      }
    };
  }
}

async function renderFunctional(backend = new FunctionalDesktopBackend()) {
  const user = userEvent.setup();
  render(<App backend={backend} />);
  await screen.findByText("Sessão local · não salva");
  return { user, backend };
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

  it("resolves each transcript from the explicitly selected source", async () => {
    const user = await renderApplication(new MultiSourceDemoDesktopBackend());
    await user.click(screen.getByRole("tab", { name: "Transcrição" }));
    expect(screen.getByText("Quando a explicação é clara, a confiança cresce.")).toBeTruthy();
    expect(screen.queryByText("Conteúdo exclusivo da fonte secundária.")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Entrevista_Secundaria\.mov/ }));
    expect(screen.getByText("Conteúdo exclusivo da fonte secundária.")).toBeTruthy();
    expect(screen.queryByText("Quando a explicação é clara, a confiança cresce.")).toBeNull();
    expect(screen.getByTestId("app-shell").dataset.activeSourceId).toBe("source-secondary");
  });

  it("keeps transcript segment focus local to Transcrição", async () => {
    const user = await renderApplication();
    const shell = screen.getByTestId("app-shell");
    expect(shell.dataset.selectedProjectItemId).toBe("source-main");
    await user.click(screen.getByRole("tab", { name: "Transcrição" }));
    await user.click(within(screen.getByTestId("workspace-transcription")).getByRole("button", { name: /Quando a explicação é clara/ }));
    expect(shell.dataset.selectedProjectItemId).toBe("source-main");
    await user.click(screen.getByRole("tab", { name: "Editar" }));
    expect(screen.getByTestId("inspector-selection").textContent).toContain("Consulta_Original.mov");
    expect(screen.getByTestId("inspector-selection").textContent).not.toContain("segment-1");
  });

  it("keeps composition demo-card focus out of project selection", async () => {
    const user = await renderApplication();
    const shell = screen.getByTestId("app-shell");
    await user.click(screen.getByRole("tab", { name: "Composição" }));
    await user.click(screen.getByRole("button", { name: "Overlays 1" }));
    expect(shell.dataset.selectedProjectItemId).toBe("source-main");
    await user.click(screen.getByRole("tab", { name: "Editar" }));
    expect(screen.getByTestId("inspector-selection").textContent).toContain("Consulta_Original.mov");
  });

  it("binds a selected B-roll clip to its source and shows the no-transcript state", async () => {
    const user = await renderApplication();
    const timeline = screen.getByLabelText("Linha do tempo");
    await user.click(within(timeline).getByRole("button", { name: "B-roll_Detalhes.mp4" }));
    const shell = screen.getByTestId("app-shell");
    expect(shell.dataset.selectedProjectItemId).toBe("clip-broll-1");
    expect(shell.dataset.activeSourceId).toBe("source-broll");
    await user.click(screen.getByRole("tab", { name: "Transcrição" }));
    expect(screen.getByText("Nenhuma transcrição disponível para esta fonte.")).toBeTruthy();
    expect(screen.queryByText("Quando a explicação é clara, a confiança cresce.")).toBeNull();
    expect(screen.getByText(/Fonte selecionada: B-roll_Detalhes\.mp4/)).toBeTruthy();
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
    expect(translate("en-US", "runtime.hostUnavailable")).toBe("The local session has ended. Restart CEVRA to start a new session. Unsaved changes cannot be recovered yet.");
    expect(translate("en-US", "composition.empty")).toBe("Import media to start composing.");
    expect(translate("en-US", "audio.empty")).toBe("Import media with audio to get started.");
  });

  it("declares every execution capability unavailable in DemoDesktopBackend", async () => {
    const backend = new DemoDesktopBackend();
    const state = await backend.loadState();
    const capabilities = ["media.import", "transcription.transcribe", "director.execute", "changes.apply", "project.export"] as const;
    expect(capabilities.map((capability) => state.capabilities[capability].available)).toEqual([false, false, false, false, false]);
    expect(backend.presentationOnly).toBe(true);
  });

  it("loads a fixture that remains a valid Project IR projection", async () => {
    const project = (await new DemoDesktopBackend().loadState()).project;
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

  it("labels the demo backend as not persisted in both locales", async () => {
    const user = await renderApplication();
    expect(screen.getByText("Demo · não persistido")).toBeTruthy();
    expect(screen.queryByText("Salvo")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Trocar idioma" }));
    expect(screen.getByText("Demo · not persisted")).toBeTruthy();
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("renders a neutral inspector state for an unresolved selection", () => {
    const project = createDemoProject();
    render(<Inspector project={project} selectedProjectItemId="segment-1" workspace="edit" t={(key, parameters = {}) => translate("pt-BR", key, parameters)} />);
    expect(screen.getByText("Selecione um item do projeto para inspecionar suas propriedades.")).toBeTruthy();
    expect(screen.queryByText("Selecionado: segment-1")).toBeNull();
  });

  it("makes every deferred production action explicit and unavailable", async () => {
    await renderApplication();
    expect((screen.getByRole("button", { name: "Importar" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Exportar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("A importação real de arquivos não está conectada nesta versão de apresentação.")).toBeTruthy();
  });

  it("renders a true empty Project IR with presentation-only timeline scaffolding", async () => {
    await renderFunctional();
    expect(screen.getByText("Nenhuma mídia corresponde a este filtro.")).toBeTruthy();
    expect(screen.getByText("Importe um vídeo para começar")).toBeTruthy();
    expect(screen.queryByText("CONSULTA • SEÇÃO 02")).toBeNull();
    expect(screen.queryByText(/Clareza gera confiança/)).toBeNull();
    expect(screen.getAllByTestId(/^timeline-track-/)).toHaveLength(7);
    expect(screen.getByRole("slider", { name: "Régua e cursor da linha do tempo" }).getAttribute("aria-valuemax")).toBe("0");
    expect(screen.getByTestId("preview-timecode").textContent).toContain("00:00:00 / 00:00:00");
    expect(screen.getByTestId("app-shell").dataset.activeSourceId).toBeUndefined();
  });

  it("keeps a production empty Composition workspace free of fabricated assets", async () => {
    const { user } = await renderFunctional();
    await user.click(within(screen.getByRole("tablist", { name: "Espaços de trabalho do editor" })).getByRole("tab", { name: "Composição" }));
    expect(screen.getByText("Importe mídia para começar a compor.")).toBeTruthy();
    expect(document.querySelectorAll(".composition-card")).toHaveLength(0);
  });

  it("keeps a production empty Audio workspace free of fabricated channels and levels", async () => {
    const { user } = await renderFunctional();
    await user.click(within(screen.getByRole("tablist", { name: "Espaços de trabalho do editor" })).getByRole("tab", { name: "Áudio" }));
    expect(screen.getByText("Importe mídia com áudio para começar.")).toBeTruthy();
    expect(document.querySelectorAll(".audio-channel")).toHaveLength(0);
    expect(screen.queryByText(/dB/)).toBeNull();
  });

  it("imports through the backend and selects the returned canonical source", async () => {
    const { user } = await renderFunctional();
    await user.click(screen.getByRole("button", { name: "Importar" }));
    expect(await screen.findByRole("button", { name: /imported\.mp4/ })).toBeTruthy();
    expect(screen.getByTestId("app-shell").dataset.activeSourceId).toBe("imported-source");
    expect(screen.getByRole("button", { name: "Desfazer" }).hasAttribute("disabled")).toBe(false);
  });

  it("treats native picker cancellation as a no-op", async () => {
    const backend = new FunctionalDesktopBackend();
    backend.pickerCancelled = true;
    const { user } = await renderFunctional(backend);
    await user.click(screen.getByRole("button", { name: "Importar" }));
    expect(screen.getByTestId("app-shell").dataset.projectRevision).toBe("0");
    expect(screen.queryByText("imported.mp4")).toBeNull();
    expect(screen.getByText("Seleção de arquivo cancelada; o projeto não foi alterado.")).toBeTruthy();
  });

  it("uses host-derived undo and redo state", async () => {
    const { user } = await renderFunctional();
    await user.click(screen.getByRole("button", { name: "Importar" }));
    await user.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(screen.queryByText("imported.mp4")).toBeNull();
    expect(screen.getByRole("button", { name: "Refazer" }).hasAttribute("disabled")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Refazer" }));
    expect(await screen.findByRole("button", { name: /imported\.mp4/ })).toBeTruthy();
  });

  it("transcribes the active canonical source and exposes Retranscrever", async () => {
    const { user } = await renderFunctional();
    await user.click(screen.getByRole("button", { name: "Importar" }));
    await user.click(screen.getByRole("tab", { name: "Transcrição" }));
    await user.click(screen.getByRole("button", { name: "Transcrever" }));
    expect(await screen.findByText("Transcrição local concluída.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retranscrever" })).toBeTruthy();
  });

  it("keeps real preview playback disabled until preview integration", async () => {
    await renderFunctional();
    expect((screen.getByRole("button", { name: "Reproduzir" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Reproduzir" }).getAttribute("title")).toBe("A reprodução real ainda não está conectada.");
  });

  it("maps only narrow Tauri application commands and never sends an ingest path", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const empty = new FunctionalDesktopBackend().state();
    const hostState = {
      project: empty.project,
      canUndo: false,
      canRedo: false,
      status: { hostAvailable: true, persistence: "local-unsaved" as const },
      capabilities: {
        mediaImport: { available: false, reason: "runtime-not-configured" as const },
        transcription: { available: false, reason: "runtime-not-configured" as const }
      }
    };
    const backend = new TauriDesktopBackend(async (command, args) => {
      calls.push({ command, ...(args ? { args } : {}) });
      if (command === "desktop_pick_and_ingest_media") return { outcome: "cancelled" } as never;
      return hostState as never;
    });
    await backend.loadState();
    await backend.pickAndImportMedia("pt-BR");
    await backend.undo();
    await backend.redo();
    await backend.cancelOperation("operation-1");
    expect(calls.map((call) => call.command)).toEqual(["desktop_get_state", "desktop_pick_and_ingest_media", "desktop_undo", "desktop_redo", "desktop_cancel_operation"]);
    expect(JSON.stringify(calls)).not.toContain("path");
    expect(JSON.stringify(calls)).not.toContain("uri");
  });

  it("renders a terminal localized state when initial host loading fails", async () => {
    const backend = new FunctionalDesktopBackend();
    backend.loadState = async () => { throw { code: "HOST_START_FAILED" }; };
    render(<App backend={backend} />);
    expect(await screen.findByText("A sessão local foi encerrada. Reinicie o CEVRA para iniciar uma nova sessão. Alterações não salvas ainda não podem ser recuperadas.")).toBeTruthy();
  });

  it("maps import conflicts without falsely terminating the host session", async () => {
    const backend = new FunctionalDesktopBackend();
    backend.pickAndImportMedia = async () => { throw { code: "LOCAL_SOURCE_PROJECT_CONFLICT" }; };
    const { user } = await renderFunctional(backend);
    await user.click(screen.getByRole("button", { name: "Importar" }));
    expect((await screen.findByRole("alert")).textContent).toContain("A fonte não foi adicionada");
    expect(screen.getByText("Sessão local · não salva")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Importar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("surfaces a normal import failure and restores the import action", async () => {
    const backend = new FunctionalDesktopBackend();
    backend.pickAndImportMedia = async () => { throw { code: "MEDIA_OPERATION_FAILED" }; };
    const { user } = await renderFunctional(backend);
    await user.click(screen.getByRole("button", { name: "Importar" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível importar a mídia selecionada.");
    expect((screen.getByRole("button", { name: "Importar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("surfaces transcription failures and restores the action after settlement", async () => {
    const backend = new FunctionalDesktopBackend();
    const { user } = await renderFunctional(backend);
    await user.click(screen.getByRole("button", { name: "Importar" }));
    backend.transcribeSource = async () => { throw { code: "TRANSCRIPTION_OPERATION_FAILED" }; };
    await user.click(screen.getByRole("tab", { name: "Transcrição" }));
    await user.click(screen.getByRole("button", { name: "Transcrever" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível concluir a transcrição local.");
    expect((screen.getByRole("button", { name: "Transcrever" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("explains a transcription project conflict without leaking host details", async () => {
    const backend = new FunctionalDesktopBackend();
    const { user } = await renderFunctional(backend);
    await user.click(screen.getByRole("button", { name: "Importar" }));
    backend.transcribeSource = async () => { throw { code: "TRANSCRIPTION_APP_PROJECT_CONFLICT", message: "internal execution id" }; };
    await user.click(screen.getByRole("tab", { name: "Transcrição" }));
    await user.click(screen.getByRole("button", { name: "Transcrever" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("A transcrição não foi aplicada");
    expect(alert.textContent).not.toContain("execution id");
  });

  it("keeps cancellation neutral and distinguishes accepted from already-finished requests", async () => {
    const backend = new FunctionalDesktopBackend();
    const pending = deferred<DesktopBackendState>();
    backend.transcribeSource = () => pending.promise;
    backend.cancelOperation = async (operationId) => ({ operationId, cancelled: true });
    const { user } = await renderFunctional(backend);
    await user.click(screen.getByRole("button", { name: "Importar" }));
    await user.click(screen.getByRole("tab", { name: "Transcrição" }));
    await user.click(screen.getByRole("button", { name: "Transcrever" }));
    expect((screen.getByRole("button", { name: "Transcrevendo…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Desfazer" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(await screen.findByText("Cancelamento solicitado. A operação será encerrada com segurança.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();

    backend.cancelOperation = async (operationId) => ({ operationId, cancelled: false });
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(await screen.findByText("A operação já foi concluída ou não está mais ativa.")).toBeTruthy();
    pending.reject({ code: "OPERATION_CANCELLED" });
    expect(await screen.findByText("A operação foi cancelada sem alterar o projeto.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("applies reconciled canonical state from a timed-out mutation", async () => {
    const backend = new FunctionalDesktopBackend();
    const reconciled = await backend.pickAndImportMedia();
    if (reconciled.outcome !== "imported") throw new Error("test fixture import failed");
    backend.pickAndImportMedia = async () => {
      throw { code: "OPERATION_TIMEOUT", reconciledState: reconciled.state };
    };
    const { user } = await renderFunctional(backend);
    await user.click(screen.getByRole("button", { name: "Importar" }));
    expect(await screen.findByRole("button", { name: /imported\.mp4/ })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("O estado do projeto foi reconciliado");
    expect(screen.getByText("Sessão local · não salva")).toBeTruthy();
  });

  it("keeps HOST_TIMEOUT non-terminal when the supervisor does not declare failure", async () => {
    const backend = new FunctionalDesktopBackend();
    backend.pickAndImportMedia = async () => { throw { code: "HOST_TIMEOUT" }; };
    const { user } = await renderFunctional(backend);
    await user.click(screen.getByRole("button", { name: "Importar" }));
    expect((await screen.findByRole("alert")).textContent).toContain("excedeu o tempo limite");
    expect(screen.getByText("Sessão local · não salva")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Importar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("treats only terminal host codes as terminal and disables mutations", async () => {
    const backend = new FunctionalDesktopBackend();
    backend.pickAndImportMedia = async () => { throw { code: "HOST_UNAVAILABLE" }; };
    const { user } = await renderFunctional(backend);
    await user.click(screen.getByRole("button", { name: "Importar" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Reinicie o CEVRA para iniciar uma nova sessão");
    const failureCopies = screen.getAllByText("A sessão local foi encerrada. Reinicie o CEVRA para iniciar uma nova sessão. Alterações não salvas ainda não podem ser recuperadas.");
    expect(failureCopies.length).toBeGreaterThan(0);
    expect(failureCopies.some((element) => element.classList.contains("failed-status"))).toBe(true);
    expect((screen.getByRole("button", { name: "Importar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables history while a canonical mutation is pending", async () => {
    const backend = new FunctionalDesktopBackend();
    const { user } = await renderFunctional(backend);
    await user.click(screen.getByRole("button", { name: "Importar" }));
    expect((screen.getByRole("button", { name: "Desfazer" }) as HTMLButtonElement).disabled).toBe(false);
    const pending = deferred<ImportMediaResult>();
    backend.pickAndImportMedia = () => pending.promise;
    await user.click(screen.getByRole("button", { name: "Importar" }));
    expect((screen.getByRole("button", { name: "Desfazer" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Refazer" }) as HTMLButtonElement).disabled).toBe(true);
    pending.resolve({ outcome: "cancelled" });
    await waitFor(() => expect((screen.getByRole("button", { name: "Desfazer" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("normalizes reconciled state returned in a Tauri command error", async () => {
    const state = new FunctionalDesktopBackend().state();
    const backend = new TauriDesktopBackend(async () => {
      throw { code: "OPERATION_TIMEOUT", message: "safe", details: { state: {
        project: state.project,
        canUndo: state.canUndo,
        canRedo: state.canRedo,
        status: { hostAvailable: true, persistence: "local-unsaved" },
        capabilities: {
          mediaImport: state.capabilities["media.import"],
          transcription: state.capabilities["transcription.transcribe"]
        }
      } } };
    });
    await expect(backend.undo()).rejects.toMatchObject({
      code: "OPERATION_TIMEOUT",
      reconciledState: { status: "local-unsaved", project: { project: { id: "desktop-real" } } }
    });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
