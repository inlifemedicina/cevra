import { assertValidSourceNumbering, SourceNumberRegistry, type ProjectIR, type SourceNumberingV1 } from "@cevra/project-ir";
import type { EditorialDraftState, ReviseEditorialDraftRequest } from "@cevra/application";
import type { TrimManualVideoClipRequest, CreateManualVideoClipRequest, LocalVideoPreviewRequest, LocalVideoPreview } from "@cevra/application";
import type { ManualVideoSequenceEdit, ManualVideoSequenceConformPreview } from "@cevra/application";
import type { ManualExportPreparation, ManualExportPreparationRequest } from "@cevra/application";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { isManualExportResourceCauseCode } from "./desktop-backend";
import type {
  DesktopBackend,
  DesktopBackendState,
  DesktopCapabilityReason,
  DesktopOperationError,
  ManualSequenceExportResult,
  ImportMediaResult
} from "./desktop-backend";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

interface HostState {
  project: ProjectIR;
  sourceNumbering: SourceNumberingV1;
  canUndo: boolean;
  canRedo: boolean;
  status: { hostAvailable: true; persistence: "local-unsaved" | "local-saved" | "local-recovered" | "persistence-error" | "checkpoint-pending" | "temporary-review" };
  checkpoint?: { token: string; pending: boolean };
  closePending?: boolean;
  capabilities: {
    mediaImport: { available: boolean; reason: DesktopCapabilityReason };
    transcription: { available: boolean; reason: DesktopCapabilityReason };
    manualExport?: { available: boolean; reason: DesktopCapabilityReason };
  };
}

export class TauriDesktopBackend implements DesktopBackend {
  readonly adapterName = "TauriDesktopBackend";
  readonly presentationOnly = false;

  constructor(private readonly invoke: Invoke = tauriInvoke) {}

  async loadState(): Promise<DesktopBackendState> {
    return fromHostState(await this.call<HostState>("desktop_get_state"));
  }

  async loadEditorialDraft(): Promise<EditorialDraftState> {
    return this.call("desktop_get_editorial_draft");
  }

  async previewLocalVideo(request: LocalVideoPreviewRequest): Promise<LocalVideoPreview> {
    return this.call("desktop_preview_local_video", { args: request });
  }

  async prepareManualExport(request: ManualExportPreparationRequest): Promise<
    { outcome: "cancelled" } | { outcome: "prepared"; preparation: ManualExportPreparation }> {
    return this.call("desktop_prepare_manual_export", { args: request });
  }

  async exportManualSequence(request: ManualExportPreparationRequest): Promise<ManualSequenceExportResult> {
    const result = await this.call<{ outcome: "cancelled" } | { outcome: "exported"; state: HostState; executionId: string; exportId: string; destinationLabel: string }>("desktop_export_manual_sequence", { args: request });
    return result.outcome === "cancelled" ? result : { ...result, state: fromHostState(result.state) };
  }

  async previewManualSequenceConform(request: { version: 1; expectedSnapshotId: string }): Promise<ManualVideoSequenceConformPreview> {
    return this.call("desktop_preview_manual_sequence_conform", { args: request });
  }

  async createManualVideoClip(request: CreateManualVideoClipRequest): Promise<{ state: DesktopBackendState; clipId: string }> {
    const result = await this.call<{ state: HostState; clipId: string }>("desktop_create_manual_video_clip", { args: request });
    return { state: fromHostState(result.state), clipId: result.clipId };
  }

  async trimManualVideoClip(request: TrimManualVideoClipRequest): Promise<{ state: DesktopBackendState; clipId: string }> {
    const result = await this.call<{ state: HostState; clipId: string }>("desktop_trim_manual_video_clip", { args: request });
    return { state: fromHostState(result.state), clipId: result.clipId };
  }

  async reviseEditorialDraft(request: ReviseEditorialDraftRequest): Promise<EditorialDraftState> {
    return this.call("desktop_revise_editorial_draft", { args: request });
  }

  async editManualVideoSequence(request: ManualVideoSequenceEdit): Promise<{ state: DesktopBackendState; changedClipIds: string[] }> {
    const { version, expectedSnapshotId, ...action } = request;
    const result = await this.call<{ state: HostState; changedClipIds: string[] }>("desktop_edit_manual_video_sequence", {
      args: { version, expectedSnapshotId, action }
    });
    return { state: fromHostState(result.state), changedClipIds: result.changedClipIds };
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

  async retryCheckpoint(expectedToken: string): Promise<DesktopBackendState> {
    return fromHostState(await this.call<HostState>("desktop_retry_checkpoint", { args: { expectedToken } }));
  }

  async getNativeCloseState(): Promise<{ sequence: number; pending: boolean; errorCode?: string }> {
    return this.call("desktop_get_close_state");
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
  const code = typeof candidate.code === "string" ? candidate.code : "HOST_OPERATION_FAILED";
  const causeCode = (code === "MANUAL_EXPORT_PUBLICATION_UNVERIFIED" || code === "MANUAL_EXPORT_CLEANUP_FAILED")
    && typeof candidate.details === "object" && candidate.details !== null && !Array.isArray(candidate.details) && "causeCode" in candidate.details
    && isManualExportResourceCauseCode(candidate.details.causeCode) ? candidate.details.causeCode : undefined;
  const error: DesktopOperationError = {
    code,
    ...(causeCode ? { causeCode } : {}),
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
  const numbering = new SourceNumberRegistry(assertValidSourceNumbering(state.sourceNumbering));
  for (const source of state.project.sources) numbering.assertReserved(source);
  return {
    project: structuredClone(state.project),
    sourceNumbering: numbering.toRegistry(),
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    status: state.status.persistence,
    ...(state.checkpoint ? { checkpoint: { ...state.checkpoint } } : {}),
    ...(state.closePending !== undefined ? { closePending: state.closePending } : {}),
    capabilities: {
      "media.import": { ...state.capabilities.mediaImport },
      "transcription.transcribe": { ...state.capabilities.transcription },
      "director.execute": { available: false, reason: "desktop-runtime-deferred" },
      "changes.apply": { available: false, reason: "desktop-runtime-deferred" },
      "project.export": state.capabilities.manualExport ? { ...state.capabilities.manualExport } : { available: false, reason: "desktop-runtime-deferred" }
    }
  };
}
