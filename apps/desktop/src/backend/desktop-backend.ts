import type { ProjectIR, SourceNumberingV1 } from "@cevra/project-ir";
import type { EditorialDraftState, ReviseEditorialDraftRequest } from "@cevra/application";
import type { TrimManualVideoClipRequest, CreateManualVideoClipRequest, LocalVideoPreviewRequest, LocalVideoPreview } from "@cevra/application";

export type DesktopCapability = "media.import" | "director.execute" | "changes.apply" | "project.export";
export type DesktopRuntimeCapability = DesktopCapability | "transcription.transcribe";
export type DesktopCapabilityReason = "available" | "desktop-runtime-deferred" | "runtime-not-configured" | "runtime-invalid" | "model-not-available" | "host-unavailable" | "review-session";

export interface DesktopCapabilityState {
  readonly available: boolean;
  readonly reason: DesktopCapabilityReason;
}

export interface DesktopBackendState {
  readonly project: Readonly<ProjectIR>;
  readonly sourceNumbering: SourceNumberingV1;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly status: "demo-not-persisted" | "local-unsaved" | "local-saved" | "local-recovered" | "persistence-error" | "checkpoint-pending" | "host-unavailable" | "temporary-review";
  readonly checkpoint?: { readonly token: string; readonly pending: boolean };
  readonly closePending?: boolean;
  readonly capabilities: Readonly<Record<DesktopRuntimeCapability, DesktopCapabilityState>>;
}

export type ImportMediaResult =
  | { readonly outcome: "cancelled" }
  | { readonly outcome: "imported"; readonly state: DesktopBackendState; readonly importedSourceId: string };

export interface DesktopOperationError {
  readonly code: string;
  readonly message?: string;
  readonly reconciledState?: DesktopBackendState;
}

export interface DesktopBackend {
  readonly adapterName: string;
  readonly presentationOnly: boolean;
  loadState(): Promise<DesktopBackendState>;
  loadEditorialDraft(): Promise<EditorialDraftState>;
  reviseEditorialDraft(request: ReviseEditorialDraftRequest): Promise<EditorialDraftState>;
  previewLocalVideo(request: LocalVideoPreviewRequest): Promise<LocalVideoPreview>;
  createManualVideoClip(request: CreateManualVideoClipRequest): Promise<{ state: DesktopBackendState; clipId: string }>;
  trimManualVideoClip(request: TrimManualVideoClipRequest): Promise<{ state: DesktopBackendState; clipId: string }>;
  pickAndImportMedia(locale: "pt-BR" | "en-US"): Promise<ImportMediaResult>;
  transcribeSource(sourceId: string, operationId: string, locale: "pt-BR" | "en-US"): Promise<DesktopBackendState>;
  undo(): Promise<DesktopBackendState>;
  redo(): Promise<DesktopBackendState>;
  retryCheckpoint(expectedToken: string): Promise<DesktopBackendState>;
  getNativeCloseState?(): Promise<{ sequence: number; pending: boolean; errorCode?: string }>;
  cancelOperation(operationId: string): Promise<{ operationId: string; cancelled: boolean }>;
}
