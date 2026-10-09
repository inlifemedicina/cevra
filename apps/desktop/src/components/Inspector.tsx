import type { ProjectIR } from "@cevra/project-ir";
import type { ReactNode } from "react";
import { workspaceKeys, type Translate, type Workspace } from "../ui-model";

import type { SourcePresentation } from "../source-presentation";
import { presentClip } from "../clip-presentation";

const videoFields = ["inspector.position", "inspector.scale", "inspector.rotation", "inspector.opacity"] as const;

export function Inspector({ project, presentations, selectedProjectItemId, workspace, t, exportPreparation }: { project: Readonly<ProjectIR>; presentations: ReadonlyMap<string, SourcePresentation>; selectedProjectItemId: string | null; workspace: Workspace; t: Translate; exportPreparation?: ReactNode }) {
  const source = project.sources.find((item) => item.id === selectedProjectItemId);
  const clip = project.timeline.clips.find((item) => item.id === selectedProjectItemId);
  const clipSource = clip ? project.sources.find((item) => item.id === clip.sourceId) : undefined;
  const clipTrack = clip ? project.timeline.tracks.find((item) => item.id === clip.trackId) : undefined;
  const caption = project.captions.find((item) => item.id === selectedProjectItemId);
  const graphic = project.graphics.find((item) => item.id === selectedProjectItemId);
  const selectedSource = source ?? clipSource;
  const selectedName = clip ? presentClip(project, clip, presentations, t) : (selectedSource && t("clipPresentation.source", { name: presentations.get(selectedSource.id)?.label ?? selectedSource.id })) ?? caption?.text ?? graphic?.text ?? graphic?.styleToken ?? null;
  const isAudioSelection = source?.kind === "audio" || clipTrack?.kind === "audio";
  return (
    <aside className="inspector" aria-label={t("inspector.title")} data-sidebar-scroll="context">
      <div className="inspector-heading"><div><span className="eyebrow">{t("inspector.context")}</span><h2>{t("inspector.title")}</h2></div><span className="workspace-context">{t(workspaceKeys[workspace])}</span></div>
      {selectedName ? <p className="selection-label" data-testid="inspector-selection">{t("inspector.selected", { name: selectedName })}</p> : <div className="inspector-empty" role="status"><span aria-hidden="true">◇</span><p>{t("inspector.emptySelection")}</p></div>}
      {selectedSource && <details className="source-file-details"><summary>{t("sourcePresentation.fileDetails")}</summary><p>{selectedSource.displayName}</p></details>}
      {exportPreparation}
      {caption ? <CaptionInspector t={t} /> : isAudioSelection ? <AudioInspector t={t} /> : (source || clip || graphic) ? <VideoInspector t={t} opacity={clip?.opacity} /> : null}
    </aside>
  );
}

function VideoInspector({ t, opacity }: { t: Translate; opacity?: number }) {
  return <div className="inspector-sections">
    <details open><summary>{t("inspector.video")}<span>⌄</span></summary><div className="property-grid">{videoFields.map(key => <label key={key}>{t(key)}<input value={key === "inspector.opacity" && opacity !== undefined ? `${Number((opacity * 100).toFixed(3))}%` : t("status.notImplementedShort")} readOnly aria-label={t(key)} /></label>)}</div><button type="button" className="property-row" disabled title={t("status.notImplemented")}><span>{t("inspector.crop")}</span><span>›</span></button></details>
    <details><summary>{t("inspector.audio")}<span>⌄</span></summary></details>
    <details><summary>{t("inspector.speed")}<span>⌄</span></summary></details>
    <details open><summary>{t("inspector.color")}<span>⌄</span></summary><div className="color-control"><span className="color-wheel" aria-hidden="true" /><div><button type="button" disabled title={t("status.notImplemented")}>{t("inspector.autoColor")}</button><small>{t("status.unavailableShort")}</small></div></div></details>
    <details><summary>{t("inspector.advanced")}<span>⌄</span></summary><button type="button" disabled title={t("status.notImplemented")}>{t("inspector.stabilization")}</button></details>
  </div>;
}

function CaptionInspector({ t }: { t: Translate }) {
  return <div className="inspector-sections"><details open><summary>{t("captions.style")}<span>⌄</span></summary><div className="property-grid"><label>{t("captions.font")}<input value={t("status.notImplementedShort")} readOnly /></label><label>{t("captions.size")}<input value={t("status.notImplementedShort")} readOnly /></label><label>{t("captions.alignment")}<input value={t("status.notImplementedShort")} readOnly /></label><label>{t("captions.position")}<input value={t("status.notImplementedShort")} readOnly /></label></div></details><details open><summary>{t("inspector.advanced")}<span>⌄</span></summary><button type="button" disabled title={t("status.notImplemented")}>{t("changes.previewOnly")}</button></details></div>;
}

function AudioInspector({ t }: { t: Translate }) {
  return <div className="inspector-sections"><details open><summary>{t("inspector.audio")}<span>⌄</span></summary><div className="property-grid"><label>{t("audio.gain")}<input value={t("status.notImplementedShort")} readOnly /></label><label>{t("audio.pan")}<input value={t("status.notImplementedShort")} readOnly /></label></div><div className="inline-buttons"><button type="button" disabled title={t("status.notImplemented")}>{t("audio.solo")}</button><button type="button" disabled title={t("status.notImplemented")}>{t("audio.mute")}</button></div></details><details open><summary>{t("inspector.advanced")}<span>⌄</span></summary><button type="button" disabled title={t("status.notImplemented")}>{t("inspector.reduceNoise")}</button></details></div>;
}
