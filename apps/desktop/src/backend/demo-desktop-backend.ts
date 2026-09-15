import type { ProjectIR } from "@cevra/project-ir";
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

  async loadState(): Promise<DesktopBackendState> {
    return demoState(structuredClone(createDemoProject()));
  }

  async pickAndImportMedia(_locale: "pt-BR" | "en-US"): Promise<ImportMediaResult> { return { outcome: "cancelled" }; }
  async transcribeSource(): Promise<DesktopBackendState> { return this.loadState(); }
  async undo(): Promise<DesktopBackendState> { return this.loadState(); }
  async redo(): Promise<DesktopBackendState> { return this.loadState(); }
  async cancelOperation(operationId: string): Promise<{ operationId: string; cancelled: boolean }> { return { operationId, cancelled: false }; }
}

function demoState(project: Readonly<ProjectIR>): DesktopBackendState {
  return {
    project,
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
