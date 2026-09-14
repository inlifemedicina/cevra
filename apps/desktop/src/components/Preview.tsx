import { Icon } from "./Icon";
import { formatTime, type Translate } from "../ui-model";

const waveformBars = [5, 9, 13, 7, 16, 10, 6, 14, 18, 11, 7, 15, 9, 13, 6, 17, 11, 8, 14, 6, 12, 16, 9, 5];

export function Preview({ compact = false, playing, playheadMs, durationMs, t, onPlayingChange }: { compact?: boolean; playing: boolean; playheadMs: number; durationMs: number; t: Translate; onPlayingChange(value: boolean): void }) {
  return (
    <section className={compact ? "preview-panel compact" : "preview-panel"} aria-label={t("preview.title")}>
      <div className="preview-heading"><span>{t("preview.title")}</span><span className="demo-chip">{t("status.demo")}</span></div>
      <div className="preview-stage" role="img" aria-label={t("preview.canvasLabel")}>
        <div className="safe-frame" aria-hidden="true" />
        <div className="preview-subject" aria-hidden="true"><span className="subject-head"/><span className="subject-body"/></div>
        <div className="preview-copy">
          <span>{t("preview.sceneEyebrow")}</span>
          <strong>{t("preview.sceneTitle")}</strong>
          <p>{t("preview.sceneCaption")}</p>
        </div>
        <div className="preview-caption">{t("preview.sceneCaption")}</div>
      </div>
      <div className="preview-controls">
        <button type="button" className="play-button" onClick={() => onPlayingChange(!playing)} aria-label={t(playing ? "preview.pause" : "preview.play")} title={t(playing ? "preview.pause" : "preview.play")}><Icon name={playing ? "pause" : "play"} size={16} /></button>
        <output className="timecode" data-testid="preview-timecode" aria-label={t("preview.timecode", { current: formatTime(playheadMs), duration: formatTime(durationMs) })}>{formatTime(playheadMs)} <span>/ {formatTime(durationMs)}</span></output>
        <div className="control-spacer" />
        <span className="micro-wave" aria-hidden="true">{waveformBars.slice(0, 10).map((height, index) => <i key={index} style={{ height }} />)}</span>
        <button type="button" className="icon-button" disabled aria-label={t("preview.volume")} title={t("status.unavailableDetail")}><Icon name="volume" size={16} /></button>
        <button type="button" className="fit-button" disabled title={t("status.unavailableDetail")}><Icon name="fit" size={15} />{t("preview.fit")}</button>
        <button type="button" className="icon-button" disabled aria-label={t("preview.fullscreen")} title={t("status.unavailableDetail")}><Icon name="fullscreen" size={16} /></button>
      </div>
    </section>
  );
}
