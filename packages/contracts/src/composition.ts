import type { ProjectIR } from "@cevra/project-ir";
import type { EngineAdapter, ExecutionContext } from "./base.js";

export interface RenderProfile {
  width: number;
  height: number;
  fps: number;
  quality: "preview" | "final";
  container: "mp4" | "mov" | "webm";
}

export interface CompositionRenderRequest {
  project: ProjectIR;
  outputUri: string;
  profile: RenderProfile;
  range?: { startMs: number; endMs: number };
}

export interface CompositionRenderResult {
  outputUri: string;
  durationMs: number;
  renderedFrames?: number;
}

export interface CompositionEngineAdapter extends EngineAdapter {
  render(request: CompositionRenderRequest, context: ExecutionContext): Promise<CompositionRenderResult>;
}
