import type { ProjectIR } from "@cevra/project-ir";
import { workspaceKeys, type Translate, type Workspace } from "../ui-model";

const videoFields = [["inspector.position", "0, 0"], ["inspector.scale", "100%"], ["inspector.rotation", "0°"], ["inspector.opacity", "100%"]] as const;

export function Inspector({ project, selectedProjectItemId, workspace, t }: { project: Readonly<ProjectIR>; selectedProjectItemId: string | null; workspace: Workspace; t: Translate }) {
  const source = project.sources.find((item) => item.id === selectedProjectItemId);
  const clip = project.timeline.clips.find((item) => item.id === selectedProjectItemId);
  const clipSource = clip ? project.sources.find((item) => item.id === clip.sourceId) : undefined;
  const clipTrack = clip ? project.timeline.tracks.find((item) => item.id === clip.trackId) : undefined;
  const caption = project.captions.find((item) => item.id === selectedProjectItemId);
  const graphic = project.graphics.find((item) => item.id === selectedProjectItemId);
  const selectedName = source?.displayName ?? clipSource?.displayName ?? caption?.text ?? graphic?.text ?? graphic?.styleToken ?? null;
  const isAudioSelection = source?.kind === "audio" || clipTrack?.kind === "audio";
  return (
    <aside className="inspector" aria-label={t("inspector.title")}>
      <div className="inspector-heading"><div><span className="eyebrow">{t("inspector.context")}</span><h2>{t("inspector.title")}</h2></div><span className="workspace-context">{t(workspaceKeys[workspace])}</span></div>
      {selectedName ? <p className="selection-label" data-testid="inspector-selection">{t("inspector.selected", { name: selectedName })}</p> : <div className="inspector-empty" role="status"><span aria-hidden="true">◇</span><p>{t("inspector.emptySelection")}</p></div>}
      {caption ? <CaptionInspector t={t} /> : isAudioSelection ? <AudioInspector t={t} /> : (source || clip || graphic) ? <VideoInspector t={t} /> : null}
    </aside>
  );
}

function VideoInspector({ t }: { t: Translate }) {
  return <div className="inspector-sections">
    <details open><summary>{t("inspector.video")}<span>⌄</span></summary><div className="property-grid">{videoFields.map(([key, value]) => <label key={key}>{t(key)}<input value={value} readOnly aria-label={t(key)} /></label>)}</div><button type="button" className="property-row" disabled title={t("inspector.demoControl")}><span>{t("inspector.crop")}</span><span>›</span></button></details>
    <details><summary>{t("inspector.audio")}<span>⌄</span></summary></details>
    <details><summary>{t("inspector.speed")}<span>⌄</span></summary></details>
    <details open><summary>{t("inspector.color")}<span>⌄</span></summary><div className="color-control"><span className="color-wheel" aria-hidden="true" /><div><button type="button" disabled title={t("inspector.demoControl")}>{t("inspector.autoColor")}</button><small>{t("status.unavailableShort")}</small></div></div></details>
    <details><summary>{t("inspector.advanced")}<span>⌄</span></summary><button type="button" disabled title={t("inspector.demoControl")}>{t("inspector.stabilization")}</button></details>
  </div>;
}

function CaptionInspector({ t }: { t: Translate }) {
  return <div className="inspector-sections"><details open><summary>{t("captions.style")}<span>⌄</span></summary><div className="property-grid"><label>{t("captions.font")}<input value="Inter" readOnly /></label><label>{t("captions.size")}<input value="48 px" readOnly /></label><label>{t("captions.alignment")}<input value={t("captions.alignmentCenter")} readOnly /></label><label>{t("captions.position")}<input value="86%" readOnly /></label></div></details><details open><summary>{t("inspector.advanced")}<span>⌄</span></summary><button type="button" disabled title={t("inspector.demoControl")}>{t("changes.previewOnly")}</button></details></div>;
}

function AudioInspector({ t }: { t: Translate }) {
  return <div className="inspector-sections"><details open><summary>{t("inspector.audio")}<span>⌄</span></summary><div className="property-grid"><label>{t("audio.gain")}<input value="-1.0 dB" readOnly /></label><label>{t("audio.pan")}<input value="0" readOnly /></label></div><div className="inline-buttons"><button type="button" disabled title={t("inspector.demoControl")}>{t("audio.solo")}</button><button type="button" disabled title={t("inspector.demoControl")}>{t("audio.mute")}</button></div></details><details open><summary>{t("inspector.advanced")}<span>⌄</span></summary><button type="button" disabled title={t("inspector.demoControl")}>{t("inspector.reduceNoise")}</button></details></div>;
}
