import type { CevraLocale } from "@cevra/i18n";
import { Icon } from "./Icon";
import { workspaces, workspaceKeys, type Translate, type Workspace } from "../ui-model";

interface TopBarProps {
  projectName: string;
  workspace: Workspace;
  locale: CevraLocale;
  sidebarCompact: boolean;
  mediaOpen: boolean;
  exportAvailable: boolean;
  status: "demo-not-persisted" | "local-unsaved" | "local-saved" | "local-recovered" | "persistence-error" | "checkpoint-pending" | "host-unavailable" | "temporary-review";
  retryAvailable: boolean;
  retryBusy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  t: Translate;
  onWorkspaceChange(workspace: Workspace): void;
  onLocaleChange(locale: CevraLocale): void;
  onSidebarToggle(): void;
  onMediaToggle(): void;
  onUndo(): void;
  onRedo(): void;
  onRetryCheckpoint(): void;
}

export function TopBar({ projectName, workspace, locale, sidebarCompact, mediaOpen, exportAvailable, status, retryAvailable, retryBusy, canUndo, canRedo, t, onWorkspaceChange, onLocaleChange, onSidebarToggle, onMediaToggle, onUndo, onRedo, onRetryCheckpoint }: TopBarProps) {
  function handleWorkspaceKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = workspaces.indexOf(workspace);
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = workspaces[(currentIndex + delta + workspaces.length) % workspaces.length];
    if (next) {
      onWorkspaceChange(next);
      event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="tab"]')[workspaces.indexOf(next)]?.focus();
    }
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
        <button type="button" data-sidebar-toggle className={sidebarCompact ? "icon-button toggled sidebar-toggle" : "icon-button sidebar-toggle"} onClick={onSidebarToggle} aria-label={t(sidebarCompact ? "sidebar.activateOpen" : "sidebar.activateCompact")} title={t(sidebarCompact ? "sidebar.activateOpen" : "sidebar.activateCompact")} aria-pressed={sidebarCompact} aria-controls="editing-sidebar"><Icon name="inspect" /></button>
        <button type="button" className="icon-button" disabled={!canUndo} onClick={onUndo} aria-label={t("action.undo")} title={canUndo ? t("action.undo") : t("history.undoUnavailable")}><Icon name="undo" /></button>
        <button type="button" className="icon-button" disabled={!canRedo} onClick={onRedo} aria-label={t("action.redo")} title={canRedo ? t("action.redo") : t("history.redoUnavailable")}><Icon name="redo" /></button>
        <span role="status" className={`save-status ${status === "demo-not-persisted" ? "demo-status" : status === "host-unavailable" || status === "persistence-error" ? "failed-status" : "local-status"}`}><i aria-hidden="true" />{t(statusKey(status))}</span>
        {retryAvailable && <button type="button" className="save-retry-button" disabled={retryBusy} onClick={onRetryCheckpoint}>{t("top.retrySave")}</button>}
        <button className="locale-button" type="button" onClick={() => onLocaleChange(locale === "pt-BR" ? "en-US" : "pt-BR")} aria-label={t("top.switchLanguage")} title={t("top.switchLanguage")}>
          {locale === "pt-BR" ? "EN" : "PT"}
        </button>
        <button type="button" className="export-button" disabled={!exportAvailable} title={exportAvailable ? undefined : t("status.unavailableDetail")}>{t("action.export")}</button>
        <button type="button" className="icon-button settings-action" disabled aria-label={t("top.settings")} title={t("status.unavailableDetail")}><Icon name="settings" /></button>
      </div>
    </header>
  );
}

function statusKey(status: TopBarProps["status"]): "top.demoNotPersisted" | "top.localUnsaved" | "top.saved" | "top.recovered" | "top.persistenceError" | "top.saving" | "runtime.hostUnavailable" | "top.temporaryReview" {
  switch (status) {
    case "demo-not-persisted": return "top.demoNotPersisted";
    case "local-unsaved": return "top.localUnsaved";
    case "temporary-review": return "top.temporaryReview";
    case "local-saved": return "top.saved";
    case "local-recovered": return "top.recovered";
    case "persistence-error": return "top.persistenceError";
    case "checkpoint-pending": return "top.saving";
    case "host-unavailable": return "runtime.hostUnavailable";
  }
}
