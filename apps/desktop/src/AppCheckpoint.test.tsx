import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { DemoDesktopBackend } from "./backend/demo-desktop-backend";
import type { DesktopBackend, DesktopBackendState } from "./backend/desktop-backend";
import { TauriDesktopBackend } from "./backend/tauri-desktop-backend";

afterEach(() => { cleanup(); vi.useRealTimers(); });

async function fixture() {
  const demo = new DemoDesktopBackend();
  const token = "checkpoint-v1:" + "a".repeat(64);
  let state: DesktopBackendState = { ...await demo.loadState(), status: "persistence-error", checkpoint: { token, pending: false }, canUndo: true };
  state = { ...state, capabilities: { ...state.capabilities, "media.import": { available: true, reason: "available" } } };
  const backend: DesktopBackend = {
    adapterName: "FoundationFixture", presentationOnly: true,
    loadState: vi.fn(async () => state),
    loadEditorialDraft: demo.loadEditorialDraft.bind(demo),
    reviseEditorialDraft: demo.reviseEditorialDraft.bind(demo),
    previewLocalVideo: demo.previewLocalVideo.bind(demo),
    createManualVideoClip: demo.createManualVideoClip.bind(demo),
    trimManualVideoClip: demo.trimManualVideoClip.bind(demo),
    editManualVideoSequence: demo.editManualVideoSequence.bind(demo),
    pickAndImportMedia: vi.fn(async () => ({ outcome: "cancelled" as const })),
    transcribeSource: vi.fn(async () => state),
    undo: vi.fn(async () => state), redo: vi.fn(async () => state),
    cancelOperation: demo.cancelOperation.bind(demo),
    retryCheckpoint: vi.fn(async () => {
      state = { ...state, status: "local-saved", checkpoint: { token, pending: false } };
      return state;
    })
  };
  return { backend, token, getState: () => state, setState: (next: DesktopBackendState) => { state = next; } };
}

describe("checkpoint retry and native close admission", () => {
  it("explicit retry saves once without invoking an edit and preserves the project", async () => {
    const f = await fixture();
    let release!: (state: DesktopBackendState) => void;
    const saved = { ...f.getState(), status: "local-saved" as const };
    f.backend.retryCheckpoint = vi.fn(() => new Promise<DesktopBackendState>(resolve => { release = resolve; }));
    render(<App backend={f.backend} />);
    const retry = await screen.findByRole("button", { name: "Tentar salvar" });
    const project = screen.getByTestId("app-shell").getAttribute("data-project-revision");
    fireEvent.click(retry); fireEvent.click(retry);
    fireEvent.click(screen.getByTestId("timeline-track-track-v1").querySelector("button.timeline-item")!);
    expect(f.backend.retryCheckpoint).toHaveBeenCalledExactlyOnceWith(f.token);
    expect((screen.getByRole("button", { name: "Desfazer" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => release(saved));
    expect(screen.getByText("Salvo")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tentar salvar" })).toBeNull();
    expect(screen.getByTestId("app-shell").getAttribute("data-project-revision")).toBe(project);
    expect(screen.getByTestId("app-shell").getAttribute("data-selected-project-item-id")).toBe("clip-main-1");
    expect(f.backend.undo).not.toHaveBeenCalled();
    expect(f.backend.redo).not.toHaveBeenCalled();
    expect(f.backend.pickAndImportMedia).not.toHaveBeenCalled();
  });

  it("failed retry and cancelled picker keep unsaved state visible and permit another explicit retry", async () => {
    const f = await fixture();
    f.backend.retryCheckpoint = vi.fn(async () => { throw { code: "PROJECT_PERSISTENCE_FAILED", reconciledState: f.getState() }; });
    render(<App backend={f.backend} />);
    fireEvent.click(await screen.findByRole("button", { name: "Tentar salvar" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Tentar salvar" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    await waitFor(() => expect(f.backend.pickAndImportMedia).toHaveBeenCalledOnce());
    expect(screen.getByText("Alterações não salvas")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tentar salvar" })).toBeTruthy();
    expect(f.backend.retryCheckpoint).toHaveBeenCalledOnce();
    expect(f.backend.undo).not.toHaveBeenCalled();
  });

  it("timeout reconciles a late checkpoint until settlement without replaying retry", async () => {
    const f = await fixture();
    f.backend.retryCheckpoint = vi.fn(async () => {
      f.setState({ ...f.getState(), status: "checkpoint-pending", checkpoint: { token: f.token, pending: true } });
      throw { code: "HOST_TIMEOUT" };
    });
    vi.useFakeTimers();
    await act(async () => { render(<App backend={f.backend} />); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Tentar salvar" })); });
    expect(screen.getByText("Salvando…")).toBeTruthy();
    expect(f.backend.loadState).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect((screen.getByRole("button", { name: "Desfazer" }) as HTMLButtonElement).disabled).toBe(true);
    f.setState({ ...f.getState(), status: "local-saved", checkpoint: { token: f.token, pending: false } });
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByText("Salvo")).toBeTruthy();
    const reads = vi.mocked(f.backend.loadState).mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(f.backend.loadState).toHaveBeenCalledTimes(reads);
    expect(f.backend.retryCheckpoint).toHaveBeenCalledOnce();
    expect(f.backend.undo).not.toHaveBeenCalled();
  });

  it("native close polling blocks edits on unknown close and reads full state only when its sequence changes", async () => {
    const f = await fixture();
    let close = { sequence: 0, pending: false, errorCode: undefined as string | undefined };
    f.backend.getNativeCloseState = vi.fn(async () => close);
    vi.useFakeTimers();
    await act(async () => { render(<App backend={f.backend} />); });
    fireEvent.click(screen.getByTestId("timeline-track-track-v1").querySelector("button.timeline-item")!);
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(f.backend.loadState).toHaveBeenCalledOnce();
    close = { sequence: 1, pending: true, errorCode: "PROJECT_CLOSE_UNKNOWN" };
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect((screen.getByRole("button", { name: "Tentar salvar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("fechamento");
    expect(screen.getByTestId("app-shell").getAttribute("data-selected-project-item-id")).toBe("clip-main-1");
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(f.backend.undo).not.toHaveBeenCalled();
    expect(f.backend.loadState).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(f.backend.loadState).toHaveBeenCalledTimes(2);
    close = { sequence: 2, pending: false, errorCode: "PROJECT_CLOSE_UNSAVED" };
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect((screen.getByRole("button", { name: "Tentar salvar" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Alterações não salvas")).toBeTruthy();
    fireEvent.click(document.querySelector("button.media-card")!);
    const selectedSource = screen.getByTestId("app-shell").getAttribute("data-selected-project-item-id");
    close = { sequence: 3, pending: false, errorCode: "PROJECT_CLOSE_UNSAVED" };
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByTestId("app-shell").getAttribute("data-selected-project-item-id")).toBe(selectedSource);
  });

  it("Tauri retry passes only the bound token and maps canonical pending/close metadata", async () => {
    const f = await fixture(); const calls: unknown[] = [];
    const state = f.getState();
    const hostState = { ...state, status: { hostAvailable: true, persistence: "checkpoint-pending" }, checkpoint: { token: f.token, pending: true }, closePending: true,
      capabilities: { mediaImport: state.capabilities["media.import"], transcription: state.capabilities["transcription.transcribe"] } };
    const backend = new TauriDesktopBackend(async (command, args) => {
      calls.push({ command, args });
      return (command === "desktop_get_close_state" ? { sequence: 2, pending: true } : hostState) as never;
    });
    expect(await backend.retryCheckpoint(f.token)).toMatchObject({ status: "checkpoint-pending", checkpoint: { token: f.token, pending: true }, closePending: true });
    expect(await backend.getNativeCloseState()).toEqual({ sequence: 2, pending: true });
    expect(calls).toEqual([
      { command: "desktop_retry_checkpoint", args: { args: { expectedToken: f.token } } },
      { command: "desktop_get_close_state", args: undefined }
    ]);
  });

  it.each(["saved", "failed"] as const)("a late %s retry preserves the newer explanation from a refused native close", async outcome => {
    const f = await fixture();
    let release!: (state: DesktopBackendState) => void;
    let reject!: (cause: unknown) => void;
    let close = { sequence: 0, pending: false, errorCode: undefined as string | undefined };
    f.backend.getNativeCloseState = vi.fn(async () => close);
    f.backend.retryCheckpoint = vi.fn(() => new Promise<DesktopBackendState>((resolve, rejectPromise) => { release = resolve; reject = rejectPromise; }));
    vi.useFakeTimers();
    await act(async () => { render(<App backend={f.backend} />); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Tentar salvar" })); });
    close = { sequence: 1, pending: false, errorCode: "PROJECT_CLOSE_BUSY" };
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    const explanation = screen.getByRole("alert").textContent;
    expect(explanation).toContain("operação está ativa");
    await act(async () => {
      if (outcome === "saved") release({ ...f.getState(), status: "local-saved" });
      else reject({ code: "PROJECT_PERSISTENCE_FAILED", reconciledState: f.getState() });
    });
    expect(screen.getByText(outcome === "saved" ? "Salvo" : "Alterações não salvas")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(explanation);
    expect(f.backend.retryCheckpoint).toHaveBeenCalledOnce();
  });
});
