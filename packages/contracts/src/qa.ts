import type { ProjectIR, QaFinding } from "@cevra/project-ir";
import type { EngineAdapter, ExecutionContext } from "./base.js";

export interface QaRequest {
  project: ProjectIR;
  renderedUri?: string;
  ruleIds?: string[];
}

export interface QaResult {
  findings: QaFinding[];
  checkedAt: string;
}

export interface QaEngineAdapter extends EngineAdapter {
  run(request: QaRequest, context: ExecutionContext): Promise<QaResult>;
}
