import type { ProjectIR } from "@cevra/project-ir";
import { useState } from "react";
import type { DesktopCapabilityState } from "../backend/desktop-backend";
import { capabilityReasonKey, type Translate, type Workspace } from "../ui-model";
import { formatTime } from "../ui-model";
import { Preview } from "./Preview";

interface WorkspaceStageProps {
  workspace: Workspace;
  project: Readonly<ProjectIR>;
  selectedProjectItemId: string | null;
  activeSourceId: string | null;
  playheadMs: number;
  playing: boolean;
  previewInteractive: boolean;
  transcriptionCapability: DesktopCapabilityState;
  transcriptionOperationId: string | null;
  t: Translate;
  onProjectSelect(id: string): void;
  onPlayingChange(value: boolean): void;
  onTranscribe(): void;
  onCancelTranscription(): void;
}

export function WorkspaceStage(props: WorkspaceStageProps) {
  if (props.workspace === "transcription") return <TranscriptionWorkspace {...props} />;
  if (props.workspace === "composition") return <CompositionWorkspace {...props} />;
  if (props.workspace === "captions") return <CaptionsWorkspace {...props} />;
  if (props.workspace === "audio") return <AudioWorkspace {...props} />;
  return <Preview interactive={props.previewInteractive} playing={props.playing} playheadMs={props.playheadMs} durationMs={props.project.timeline.durationMs} t={props.t} onPlayingChange={props.onPlayingChange} />;
}

function TranscriptionWorkspace({ project, activeSourceId, playheadMs, playing, previewInteractive, transcriptionCapability, transcriptionOperationId, t, onPlayingChange, onTranscribe, onCancelTranscription }: WorkspaceStageProps) {
  const [focusedSegmentId, setFocusedSegmentId] = useState<string | null>(null);
  const source = project.sources.find((item) => item.id === activeSourceId);
  const sourceTranscript = project.sourceTranscripts.find((item) => item.sourceId === activeSourceId);
  const transcript = sourceTranscript?.transcript;
  return (
    <div className="specialized-workspace transcript-workspace" data-testid="workspace-transcription">
      <section className="dominant-list-panel">
        <div className="specialized-heading"><div><span className="eyebrow">{t("workspace.transcription")}</span><h2>{t("transcription.title")}</h2><p>{t("transcription.description")}</p></div><div className="transcription-actions">{source && transcriptionCapability.available && <button type="button" className="import-button" disabled={transcriptionOperationId !== null} onClick={onTranscribe}>{t(transcriptionOperationId ? "transcription.busy" : sourceTranscript ? "transcription.retranscribe" : "transcription.transcribe")}</button>}{transcriptionOperationId && <button type="button" className="secondary-button" onClick={onCancelTranscription}>{t("transcription.cancel")}</button>}<label className="follow-toggle"><input type="checkbox" defaultChecked />{t("transcription.followPlayhead")}</label></div></div>
        {source && !transcriptionCapability.available && <p className="unavailable-note" role="status"><span aria-hidden="true">●</span>{t(capabilityReasonKey(transcriptionCapability.reason))}</p>}
        <div className="search-field wide"><span aria-hidden="true">⌕</span><input aria-label={t("transcription.search")} placeholder={t("transcription.search")} /></div>
        <div className="transcript-segments">
          {transcript?.segments.map((segment) => {
            const active = playheadMs >= segment.startMs && playheadMs <= segment.endMs;
            return <button key={segment.id} type="button" className={`${focusedSegmentId === segment.id ? "selected " : ""}${active ? "active" : ""}`} onClick={() => setFocusedSegmentId(segment.id)}><time>{formatTime(segment.startMs).slice(0, 5)}</time><span><small>{t("transcription.speaker")}</small>{segment.text}</span></button>;
          })}
          {!source && <p className="workspace-empty-state" role="status">{t("transcription.noSource")}</p>}
          {source && !transcript && <p className="workspace-empty-state" role="status">{t("transcription.emptyForSource")}</p>}
        </div>
        <footer><span>{transcript?.words.length ?? 0} {t("transcription.words")}</span>{source && <span>{t("media.selectedSource")}: {source.displayName}</span>}</footer>
      </section>
      <Preview compact interactive={previewInteractive} playing={playing} playheadMs={playheadMs} durationMs={project.timeline.durationMs} t={t} onPlayingChange={onPlayingChange} />
    </div>
  );
}

function CompositionWorkspace({ project, playheadMs, playing, previewInteractive, t, onPlayingChange }: WorkspaceStageProps) {
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  return (
    <div className="specialized-workspace composition-workspace" data-testid="workspace-composition">
      <section className="asset-browser">
        <div className="specialized-heading"><div><span className="eyebrow">{t("workspace.composition")}</span><h2>{t("composition.title")}</h2><p>{t("composition.description")}</p></div></div>
        <div className="asset-groups">
          {(["composition.overlays", "composition.broll", "composition.graphics"] as const).map((key, groupIndex) => <div key={key}><h3>{t(key)}</h3><div className="composition-grid">{[0, 1, 2].map((item) => { const id = `composition-${groupIndex}-${item}`; return <button key={id} type="button" className={focusedCardId === id ? "composition-card selected" : "composition-card"} onClick={() => setFocusedCardId(id)}><span aria-hidden="true">{groupIndex === 0 ? "◇" : groupIndex === 1 ? "▧" : "Aa"}</span><small>{t(key)} {item + 1}</small></button>; })}</div></div>)}
        </div>
      </section>
      <div className="composition-preview"><Preview compact interactive={previewInteractive} playing={playing} playheadMs={playheadMs} durationMs={project.timeline.durationMs} t={t} onPlayingChange={onPlayingChange} /><span className="safe-area-label">{t("composition.safeArea")}</span></div>
    </div>
  );
}

function CaptionsWorkspace({ project, selectedProjectItemId, playheadMs, playing, previewInteractive, t, onProjectSelect, onPlayingChange }: WorkspaceStageProps) {
  return (
    <div className="specialized-workspace captions-workspace" data-testid="workspace-captions">
      <section className="dominant-list-panel caption-list-panel">
        <div className="specialized-heading"><div><span className="eyebrow">{t("workspace.captions")}</span><h2>{t("captions.title")}</h2><p>{t("captions.description")}</p></div></div>
        <div className="caption-cues">{project.captions.map((caption, index) => { const active = playheadMs >= caption.startMs && playheadMs <= caption.endMs; return <button type="button" key={caption.id} className={`${selectedProjectItemId === caption.id ? "selected " : ""}${active ? "active" : ""}`} onClick={() => onProjectSelect(caption.id)}><span className="cue-number">{String(index + 1).padStart(2, "0")}</span><span><time>{formatTime(caption.startMs).slice(0, 5)} — {formatTime(caption.endMs).slice(0, 5)}</time><strong>{caption.text}</strong></span></button>; })}</div>
        <div className="caption-style-strip"><label>{t("captions.style")}<select disabled title={t("inspector.demoControl")}><option>{t("captions.styleClean")}</option></select></label><label>{t("captions.font")}<input disabled value="Inter" readOnly /></label><label>{t("captions.size")}<input disabled value="48 px" readOnly /></label></div>
      </section>
      <Preview compact interactive={previewInteractive} playing={playing} playheadMs={playheadMs} durationMs={project.timeline.durationMs} t={t} onPlayingChange={onPlayingChange} />
    </div>
  );
}

const waveHeights = [12, 24, 18, 32, 14, 28, 38, 22, 16, 34, 26, 40, 20, 30, 13, 35, 25, 17, 31, 21, 37, 15, 29, 19, 33, 23, 39, 18, 27, 14, 32, 22];

function AudioWorkspace({ project, playheadMs, playing, previewInteractive, t, onPlayingChange }: WorkspaceStageProps) {
  const [focusedChannelId, setFocusedChannelId] = useState<string | null>(null);
  const channels = [["track-a1", "audio.voice", "-1.0 dB"], ["track-a2", "audio.music", "-12.0 dB"], ["track-a3", "audio.sfx", "-6.0 dB"]] as const;
  return (
    <div className="specialized-workspace audio-workspace" data-testid="workspace-audio">
      <section className="audio-mixer">
        <div className="specialized-heading"><div><span className="eyebrow">{t("workspace.audio")}</span><h2>{t("audio.title")}</h2><p>{t("audio.description")}</p></div></div>
        <div className="audio-channels">{channels.map(([id, key, level], channelIndex) => <button type="button" key={id} className={focusedChannelId === id ? "audio-channel selected" : "audio-channel"} onClick={() => setFocusedChannelId(id)}><span className="channel-head"><strong>{t(key)}</strong><em>{level}</em></span><span className="large-wave" aria-label={t("audio.waveform")}>{waveHeights.map((height, index) => <i key={index} style={{ height: Math.max(5, height - channelIndex * 5) }} />)}</span><span className="channel-controls"><small>{t("audio.gain")}</small><b>−</b><span className="meter"><i style={{ width: `${78 - channelIndex * 17}%` }} /></span><b>＋</b><small>{t("audio.pan")}: 0</small></span></button>)}</div>
      </section>
      <Preview compact interactive={previewInteractive} playing={playing} playheadMs={playheadMs} durationMs={project.timeline.durationMs} t={t} onPlayingChange={onPlayingChange} />
    </div>
  );
}
