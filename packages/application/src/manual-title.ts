import { MANUAL_TITLE_COMPONENT, manualTitleGraphic, resolveManualTitle, validateManualTitle,
  type ManualTitle, type ProjectHistory, type ProjectIR } from "@cevra/project-ir";
import { resolveManualVideoSequence } from "./manual-video-sequence.js";
import { manualVideoError } from "./manual-video-clip.js";

export type ManualTitleEdit = { version: 1; expectedSnapshotId: string } & (
  | { type: "set"; title: ManualTitle }
  | { type: "remove" }
);
export function validateManualTitleEdit(value: unknown): ManualTitleEdit {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw manualVideoError("MANUAL_TITLE_INVALID");
  const v = structuredClone(value) as Record<string, unknown>;
  const keys = v.type === "set" ? ["version", "expectedSnapshotId", "type", "title"] : ["version", "expectedSnapshotId", "type"];
  if (Object.keys(v).length !== keys.length || Object.keys(v).some(k => !keys.includes(k))
    || v.version !== 1 || typeof v.expectedSnapshotId !== "string" || !v.expectedSnapshotId
    || !["set", "remove"].includes(String(v.type))) throw manualVideoError("MANUAL_TITLE_INVALID");
  if (v.type === "set") {
    try { v.title = validateManualTitle(v.title); } catch { throw manualVideoError("MANUAL_TITLE_INVALID"); }
  }
  return v as unknown as ManualTitleEdit;
}
export function resolveProjectManualTitle(project: Readonly<ProjectIR>): ManualTitle | undefined {
  if (!project.graphics.length) return undefined;
  if (project.graphics.length !== 1 || project.timeline.timingPolicy !== "cfr30") throw manualVideoError("MANUAL_SEQUENCE_UNSUPPORTED");
  try {
    const title = resolveManualTitle(project.graphics[0]!);
    return title;
  } catch { throw manualVideoError("MANUAL_SEQUENCE_UNSUPPORTED"); }
}
export class ManualTitleApplicationService {
  constructor(private readonly history: ProjectHistory, private readonly idGenerator: () => string = () => crypto.randomUUID()) {}
  edit(request: ManualTitleEdit): { project: ProjectIR; graphicId?: string } {
    const stable = validateManualTitleEdit(request), project = this.history.current;
    resolveManualVideoSequence(project, stable.expectedSnapshotId);
    const old = project.graphics[0];
    if (stable.type === "remove") {
      if (!old) throw manualVideoError("MANUAL_TITLE_UNKNOWN");
      this.history.commit({ type: "graphic.manualTitle.remove", graphicId: old.id }, { type: "user" });
      return { project: this.history.current };
    }
    if (project.timeline.timingPolicy !== "cfr30" || !project.timeline.clips.length) throw manualVideoError("MANUAL_TITLE_UNSUPPORTED");
    if (stable.title.endFrame > Math.round(project.timeline.durationMs * 30 / 1000)) throw manualVideoError("MANUAL_TITLE_INVALID");
    const graphic = manualTitleGraphic(old?.id ?? `title-${this.idGenerator()}`, stable.title);
    if (stable.title.componentId !== MANUAL_TITLE_COMPONENT) throw manualVideoError("MANUAL_TITLE_INVALID");
    if (JSON.stringify(old) !== JSON.stringify(graphic)) this.history.commit({ type: "graphic.manualTitle.set", graphic }, { type: "user" });
    return { project: this.history.current, graphicId: graphic.id };
  }
}
