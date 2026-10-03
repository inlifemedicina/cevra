import type { ReactNode } from "react";
import { presetOptions, type Translate } from "../ui-model";
import { Icon } from "./Icon";

interface DirectorPanelProps {
  draft: string;
  preset: string;
  directorAvailable: boolean;
  t: Translate;
  editorialPanel: ReactNode;
  onDraftChange(value: string): void;
  onPresetChange(value: string): void;
}

export function DirectorPanel({ draft, preset, directorAvailable, t, onDraftChange, onPresetChange, editorialPanel }: DirectorPanelProps) {
  return (
    <section className="director-panel" aria-labelledby="director-title">
      <div className="director-main">
        <div className="director-title-row">
          <span className="director-symbol"><Icon name="spark" size={17} /></span>
          <div><h2 id="director-title">{t("director.title")}</h2><p>{t("director.supporting")}</p></div>
          {!directorAvailable && <span className="demo-chip">{t("status.unavailableShort")}</span>}
        </div>
        <div className="director-compose">
          <textarea rows={2} value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder={t("director.placeholder")} aria-label={t("director.inputLabel")} />
          <button type="button" className="director-execute" disabled={!directorAvailable} title={directorAvailable ? undefined : t("director.executionUnavailable")} aria-label={t("action.execute")}><Icon name="spark" size={16} /></button>
        </div>
        <div className="director-footer">
          <button type="button" className="text-button" disabled={!directorAvailable} title={directorAvailable ? undefined : t("director.executionUnavailable")}><Icon name="spark" size={14} />{t("action.suggestIdeas")}</button>
          <label className="preset-select"><span>{t("preset.label")}</span><select value={preset} onChange={(event) => onPresetChange(event.target.value)} aria-label={t("preset.label")}>{presetOptions.map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</select></label>
          <small>{t("preset.libraryFixture")}</small>
        </div>
      </div>
      <div className="change-set">
        {editorialPanel}
        <div className="change-actions"><button type="button" className="apply-button" disabled title={t("changes.applyUnavailable")}>{t("action.apply")}</button></div>
      </div>
    </section>
  );
}
