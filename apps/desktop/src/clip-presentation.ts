import { manualClipCopyOrigin } from "@cevra/application";
import type { ProjectIR, TimelineClip } from "@cevra/project-ir";
import type { SourcePresentation } from "./source-presentation";
import type { Translate } from "./ui-model";

export function presentClip(project: Readonly<ProjectIR>, clip: Readonly<TimelineClip>, presentations: ReadonlyMap<string, SourcePresentation>, t: Translate): string {
  return presentClips(project, presentations, t).get(clip.id) ?? clip.id;
}

export function presentClips(project: Readonly<ProjectIR>, presentations: ReadonlyMap<string, SourcePresentation>, t: Translate): Map<string, string> {
  const ordered = [...project.timeline.clips].sort((a, b) => a.timelineStartMs - b.timelineStartMs || a.id.localeCompare(b.id));
  return new Map(ordered.map((clip, index) => {
    const occurrence = t(manualClipCopyOrigin(clip) ? "clipPresentation.copy" : "clipPresentation.occurrence", { number: index + 1 });
    return [clip.id, `${occurrence} · ${t("clipPresentation.source", { name: presentations.get(clip.sourceId)?.label ?? clip.sourceId })}`];
  }));
}
