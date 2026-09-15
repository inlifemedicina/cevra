import type { ProjectIR } from "@cevra/project-ir";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type {
  DesktopBackend,
  DesktopBackendState,
  DesktopCapabilityReason,
  DesktopOperationError,
  ImportMediaResult
} from "./desktop-backend";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

interface HostState {
  project: ProjectIR;
  canUndo: boolean;
  canRedo: boolean;
  status: { hostAvailable: true; persistence: "local-unsaved" | "local-saved" | "local-recovered" | "persistence-error" };
  capabilities: {
    mediaImport: { available: boolean; reason: DesktopCapabilityReason };
    transcription: { available: boolean; reason: DesktopCapabilityReason };
  };
}

export class TauriDesktopBackend implements DesktopBackend {
  readonly adapterName = "TauriDesktopBackend";
  readonly presentationOnly = false;

  constructor(private readonly invoke: Invoke = tauriInvoke) {}

  async loadState(): Promise<DesktopBackendState> {
    return fromHostState(await this.call<HostState>("desktop_get_state"));
  }

  async pickAndImportMedia(locale: "pt-BR" | "en-US"): Promise<ImportMediaResult> {
    const response = await this.call<
      | { outcome: "cancelled" }
      | { outcome: "imported"; result: { state: HostState; importedSourceId: string } }
    >("desktop_pick_and_ingest_media", { args: { locale } });
    if (response.outcome === "cancelled") return response;
    return {
      outcome: "imported",
      state: fromHostState(response.result.state),
      importedSourceId: response.result.importedSourceId
    };
  }

  async transcribeSource(sourceId: string, operationId: string, locale: "pt-BR" | "en-US"): Promise<DesktopBackendState> {
    const state = await this.call<HostState>("desktop_transcribe_source", { args: { sourceId, operationId, locale } });
    return fromHostState(state);
  }

  async undo(): Promise<DesktopBackendState> {
    return fromHostState(await this.call<HostState>("desktop_undo"));
  }

  async redo(): Promise<DesktopBackendState> {
    return fromHostState(await this.call<HostState>("desktop_redo"));
  }

  async cancelOperation(operationId: string): Promise<{ operationId: string; cancelled: boolean }> {
    return this.call("desktop_cancel_operation", { args: { operationId } });
  }

  private async call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    try {
      return await this.invoke<T>(command, args);
    } catch (cause) {
      throw normalizeInvokeError(cause);
    }
  }
}

function normalizeInvokeError(cause: unknown): DesktopOperationError {
  if (typeof cause !== "object" || cause === null) return { code: "HOST_OPERATION_FAILED" };
  const candidate = cause as { code?: unknown; message?: unknown; details?: unknown };
  const error: DesktopOperationError = {
    code: typeof candidate.code === "string" ? candidate.code : "HOST_OPERATION_FAILED",
    ...(typeof candidate.message === "string" ? { message: candidate.message } : {})
  };
  const state = reconciledHostState(candidate.details);
  return state ? { ...error, reconciledState: fromHostState(state) } : error;
}

function reconciledHostState(details: unknown): HostState | null {
  if (typeof details !== "object" || details === null || !("state" in details)) return null;
  const state = (details as { state?: unknown }).state;
  if (typeof state !== "object" || state === null || !("project" in state) || !("capabilities" in state)) return null;
  return state as HostState;
}

function fromHostState(state: HostState): DesktopBackendState {
  return {
    project: structuredClone(state.project),
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    status: state.status.persistence,
    capabilities: {
      "media.import": { ...state.capabilities.mediaImport },
      "transcription.transcribe": { ...state.capabilities.transcription },
      "director.execute": { available: false, reason: "desktop-runtime-deferred" },
      "changes.apply": { available: false, reason: "desktop-runtime-deferred" },
      "project.export": { available: false, reason: "desktop-runtime-deferred" }
    }
  };
}
