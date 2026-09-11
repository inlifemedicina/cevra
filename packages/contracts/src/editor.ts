import type { ProjectIR } from "@cevra/project-ir";
import type { EngineAdapter, ExecutionContext } from "./base.js";

export interface EditorExportRequest {
  project: ProjectIR;
  destinationUri: string;
  format: string;
}

export interface EditorImportRequest {
  sourceUri: string;
  format?: string;
}

export interface ExternalEditorAdapter extends EngineAdapter {
  exportProject(request: EditorExportRequest, context: ExecutionContext): Promise<{ destinationUri: string }>;
  importProject(request: EditorImportRequest, context: ExecutionContext): Promise<ProjectIR>;
}
