import type { ProjectIR } from "@cevra/project-ir";
import type { Translate, Workspace } from "../ui-model";
import { formatTime } from "../ui-model";
import { Preview } from "./Preview";

interface WorkspaceStageProps {
  workspace: Workspace;
  project: Readonly<ProjectIR>;
  selectedId: string;
  playheadMs: number;
  playing: boolean;
  t: Translate;
  onSelect(id: string): void;
  onPlayingChange(value: boolean): void;
}

export function WorkspaceStage(props: WorkspaceStageProps) {
  if (props.workspace === "transcription") return <TranscriptionWorkspace {...props} />;
  if (props.workspace === "composition") return <CompositionWorkspace {...props} />;
  if (props.workspace === "captions") return <CaptionsWorkspace {...props} />;
  if (props.workspace === "audio") return <AudioWorkspace {...props} />;
  return <Preview playing={props.playing} playheadMs={props.playheadMs} durationMs={props.project.timeline.durationMs} t={props.t} onPlayingChange={props.onPlayingChange} />;
}

function TranscriptionWorkspace({ project, selectedId, playheadMs, playing, t, onSelect, onPlayingChange }: WorkspaceStageProps) {
  const transcript = project.sourceTranscripts[0]?.transcript;
  return (
    <div className="specialized-workspace transcript-workspace" data-testid="workspace-transcription">
      <section className="dominant-list-panel">
        <div className="specialized-heading"><div><span className="eyebrow">{t("workspace.transcription")}</span><h2>{t("transcription.title")}</h2><p>{t("transcription.description")}</p></div><label className="follow-toggle"><input type="checkbox" defaultChecked />{t("transcription.followPlayhead")}</label></div>
        <div className="search-field wide"><span aria-hidden="true">⌕</span><input aria-label={t("transcription.search")} placeholder={t("transcription.search")} /></div>
        <div className="transcript-segments">
          {transcript?.segments.map((segment) => {
            const active = playheadMs >= segment.startMs && playheadMs <= segment.endMs;
            return <button key={segment.id} type="button" className={`${selectedId === segment.id ? "selected " : ""}${active ? "active" : ""}`} onClick={() => onSelect(segment.id)}><time>{formatTime(segment.startMs).slice(0, 5)}</time><span><small>{t("transcription.speaker")}</small>{segment.text}</span></button>;
          })}
        </div>
        <footer><span>{transcript?.words.length ?? 0} {t("transcription.words")}</span><span>{t("media.selectedSource")}: {project.sources[0]?.displayName}</span></footer>
      </section>
      <Preview compact playing={playing} playheadMs={playheadMs} durationMs={project.timeline.durationMs} t={t} onPlayingChange={onPlayingChange} />
    </div>
  );
}

function CompositionWorkspace({ project, selectedId, playheadMs, playing, t, onSelect, onPlayingChange }: WorkspaceStageProps) {
  return (
    <div className="specialized-workspace composition-workspace" data-testid="workspace-composition">
      <section className="asset-browser">
        <div className="specialized-heading"><div><span className="eyebrow">{t("workspace.composition")}</span><h2>{t("composition.title")}</h2><p>{t("composition.description")}</p></div></div>
        <div className="asset-groups">
          {(["composition.overlays", "composition.broll", "composition.graphics"] as const).map((key, groupIndex) => <div key={key}><h3>{t(key)}</h3><div className="composition-grid">{[0, 1, 2].map((item) => { const id = `composition-${groupIndex}-${item}`; return <button key={id} type="button" className={selectedId === id ? "composition-card selected" : "composition-card"} onClick={() => onSelect(id)}><span aria-hidden="true">{groupIndex === 0 ? "◇" : groupIndex === 1 ? "▧" : "Aa"}</span><small>{t(key)} {item + 1}</small></button>; })}</div></div>)}
        </div>
      </section>
      <div className="composition-preview"><Preview compact playing={playing} playheadMs={playheadMs} durationMs={project.timeline.durationMs} t={t} onPlayingChange={onPlayingChange} /><span className="safe-area-label">{t("composition.safeArea")}</span></div>
    </div>
  );
}

function CaptionsWorkspace({ project, selectedId, playheadMs, playing, t, onSelect, onPlayingChange }: WorkspaceStageProps) {
  return (
    <div className="specialized-workspace captions-workspace" data-testid="workspace-captions">
      <section className="dominant-list-panel caption-list-panel">
        <div className="specialized-heading"><div><span className="eyebrow">{t("workspace.captions")}</span><h2>{t("captions.title")}</h2><p>{t("captions.description")}</p></div></div>
        <div className="caption-cues">{project.captions.map((caption, index) => { const active = playheadMs >= caption.startMs && playheadMs <= caption.endMs; return <button type="button" key={caption.id} className={`${selectedId === caption.id ? "selected " : ""}${active ? "active" : ""}`} onClick={() => onSelect(caption.id)}><span className="cue-number">{String(index + 1).padStart(2, "0")}</span><span><time>{formatTime(caption.startMs).slice(0, 5)} — {formatTime(caption.endMs).slice(0, 5)}</time><strong>{caption.text}</strong></span></button>; })}</div>
        <div className="caption-style-strip"><label>{t("captions.style")}<select disabled title={t("inspector.demoControl")}><option>{t("captions.styleClean")}</option></select></label><label>{t("captions.font")}<input disabled value="Inter" readOnly /></label><label>{t("captions.size")}<input disabled value="48 px" readOnly /></label></div>
      </section>
      <Preview compact playing={playing} playheadMs={playheadMs} durationMs={project.timeline.durationMs} t={t} onPlayingChange={onPlayingChange} />
    </div>
  );
}

const waveHeights = [12, 24, 18, 32, 14, 28, 38, 22, 16, 34, 26, 40, 20, 30, 13, 35, 25, 17, 31, 21, 37, 15, 29, 19, 33, 23, 39, 18, 27, 14, 32, 22];

function AudioWorkspace({ project, selectedId, playheadMs, playing, t, onSelect, onPlayingChange }: WorkspaceStageProps) {
  const channels = [["track-a1", "audio.voice", "-1.0 dB"], ["track-a2", "audio.music", "-12.0 dB"], ["track-a3", "audio.sfx", "-6.0 dB"]] as const;
  return (
    <div className="specialized-workspace audio-workspace" data-testid="workspace-audio">
      <section className="audio-mixer">
        <div className="specialized-heading"><div><span className="eyebrow">{t("workspace.audio")}</span><h2>{t("audio.title")}</h2><p>{t("audio.description")}</p></div></div>
        <div className="audio-channels">{channels.map(([id, key, level], channelIndex) => <button type="button" key={id} className={selectedId === id ? "audio-channel selected" : "audio-channel"} onClick={() => onSelect(id)}><span className="channel-head"><strong>{t(key)}</strong><em>{level}</em></span><span className="large-wave" aria-label={t("audio.waveform")}>{waveHeights.map((height, index) => <i key={index} style={{ height: Math.max(5, height - channelIndex * 5) }} />)}</span><span className="channel-controls"><small>{t("audio.gain")}</small><b>−</b><span className="meter"><i style={{ width: `${78 - channelIndex * 17}%` }} /></span><b>＋</b><small>{t("audio.pan")}: 0</small></span></button>)}</div>
      </section>
      <Preview compact playing={playing} playheadMs={playheadMs} durationMs={project.timeline.durationMs} t={t} onPlayingChange={onPlayingChange} />
    </div>
  );
}
