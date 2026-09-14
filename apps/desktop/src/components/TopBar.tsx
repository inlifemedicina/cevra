import type { CevraLocale } from "@cevra/i18n";
import { Icon } from "./Icon";
import { workspaces, workspaceKeys, type Translate, type Workspace } from "../ui-model";

interface TopBarProps {
  projectName: string;
  workspace: Workspace;
  locale: CevraLocale;
  inspectorOpen: boolean;
  mediaOpen: boolean;
  exportAvailable: boolean;
  presentationOnly: boolean;
  t: Translate;
  onWorkspaceChange(workspace: Workspace): void;
  onLocaleChange(locale: CevraLocale): void;
  onInspectorToggle(): void;
  onMediaToggle(): void;
}

export function TopBar({ projectName, workspace, locale, inspectorOpen, mediaOpen, exportAvailable, presentationOnly, t, onWorkspaceChange, onLocaleChange, onInspectorToggle, onMediaToggle }: TopBarProps) {
  function handleWorkspaceKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = workspaces.indexOf(workspace);
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = workspaces[(currentIndex + delta + workspaces.length) % workspaces.length];
    if (next) onWorkspaceChange(next);
  }

  return (
    <header className="topbar">
      <div className="brand-block">
        <span className="brand-mark" aria-hidden="true">C</span>
        <strong>{t("app.vidsName")}</strong>
        <button className="project-menu" type="button" disabled title={t("status.unavailableDetail")} aria-label={t("top.projectMenu")}>
          <span>{projectName}</span><Icon name="chevron" size={14} />
        </button>
      </div>

      <div className="workspace-tabs" role="tablist" aria-label={t("workspace.navigation")} onKeyDown={handleWorkspaceKeyDown}>
        {workspaces.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={workspace === item}
            tabIndex={workspace === item ? 0 : -1}
            className={workspace === item ? "workspace-tab active" : "workspace-tab"}
            onClick={() => onWorkspaceChange(item)}
          >
            {t(workspaceKeys[item])}
          </button>
        ))}
      </div>

      <div className="top-actions">
        <button type="button" className={mediaOpen ? "icon-button toggled" : "icon-button"} onClick={onMediaToggle} aria-label={t("top.mediaPanel")} title={t("top.mediaPanel")}><Icon name="panel" /></button>
        <button type="button" className={inspectorOpen ? "icon-button toggled" : "icon-button"} onClick={onInspectorToggle} aria-label={t("top.inspector")} title={t("top.inspector")}><Icon name="inspect" /></button>
        <button type="button" className="icon-button" disabled aria-label={t("action.undo")} title={t("status.unavailableDetail")}><Icon name="undo" /></button>
        <button type="button" className="icon-button" disabled aria-label={t("action.redo")} title={t("status.unavailableDetail")}><Icon name="redo" /></button>
        <span className={presentationOnly ? "save-status demo-status" : "save-status"}><i aria-hidden="true" />{t(presentationOnly ? "top.demoNotPersisted" : "top.saved")}</span>
        <button className="locale-button" type="button" onClick={() => onLocaleChange(locale === "pt-BR" ? "en-US" : "pt-BR")} aria-label={t("top.switchLanguage")} title={t("top.switchLanguage")}>
          {locale === "pt-BR" ? "EN" : "PT"}
        </button>
        <button type="button" className="export-button" disabled={!exportAvailable} title={exportAvailable ? undefined : t("status.unavailableDetail")}>{t("action.export")}</button>
        <button type="button" className="icon-button" disabled aria-label={t("top.settings")} title={t("status.unavailableDetail")}><Icon name="settings" /></button>
      </div>
    </header>
  );
}
