import { sourceNumberingForSources, type ProjectIR } from "@cevra/project-ir";
import type { EditorialDraftState, ReviseEditorialDraftRequest } from "@cevra/application";
import { createDemoProject } from "../fixtures/demo-project";
import type { DesktopBackend, DesktopBackendState, DesktopCapabilityState, ImportMediaResult } from "./desktop-backend";

const unavailable: DesktopCapabilityState = Object.freeze({
  available: false,
  reason: "desktop-runtime-deferred"
});

/**
 * Development presentation adapter only. It does not persist, execute engines,
 * create journal entries, or claim desktop-host functionality.
 */
export class DemoDesktopBackend implements DesktopBackend {
  readonly adapterName = "DemoDesktopBackend";
  readonly presentationOnly = true;
  async loadEditorialDraft(): Promise<EditorialDraftState> { return { status: "empty" }; }
  async reviseEditorialDraft(_request: ReviseEditorialDraftRequest): Promise<EditorialDraftState> { throw { code: "EDITORIAL_DRAFT_UNAVAILABLE" }; }
  async previewLocalVideo(): Promise<never> { throw { code: "MANUAL_VIDEO_UNAVAILABLE" }; }
  async trimManualVideoClip(): Promise<never> { throw { code: "MANUAL_VIDEO_UNAVAILABLE" }; }
  async createManualVideoClip(): Promise<never> { throw { code: "MANUAL_VIDEO_UNAVAILABLE" }; }

  async loadState(): Promise<DesktopBackendState> {
    return demoState(structuredClone(createDemoProject()));
  }

  async pickAndImportMedia(_locale: "pt-BR" | "en-US"): Promise<ImportMediaResult> { return { outcome: "cancelled" }; }
  async transcribeSource(): Promise<DesktopBackendState> { return this.loadState(); }
  async undo(): Promise<DesktopBackendState> { return this.loadState(); }
  async redo(): Promise<DesktopBackendState> { return this.loadState(); }
  async retryCheckpoint(): Promise<never> { throw { code: "PROJECT_PERSISTENCE_UNAVAILABLE" }; }
  async cancelOperation(operationId: string): Promise<{ operationId: string; cancelled: boolean }> { return { operationId, cancelled: false }; }
}

function demoState(project: Readonly<ProjectIR>): DesktopBackendState {
  return {
    project,
    sourceNumbering: sourceNumberingForSources(project.sources),
    canUndo: false,
    canRedo: false,
    status: "demo-not-persisted",
    capabilities: {
      "media.import": unavailable,
      "transcription.transcribe": unavailable,
      "director.execute": unavailable,
      "changes.apply": unavailable,
      "project.export": unavailable
    }
  };
}
