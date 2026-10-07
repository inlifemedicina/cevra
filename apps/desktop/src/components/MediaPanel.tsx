import type { SourceAsset } from "@cevra/project-ir";
import { useMemo, useState, type KeyboardEvent } from "react";
import { capabilityReasonKey, workspaceKeys, type Translate, type Workspace } from "../ui-model";
import type { DesktopBackend, DesktopCapabilityReason } from "../backend/desktop-backend";
import { Icon } from "./Icon";
import { shortcutProps } from "../keyboard-shortcuts";
import { timelineShortcutBlocked } from "../timeline-interactions";
import type { SourcePresentation } from "../source-presentation";

import { useSourceThumbnails } from "../source-thumbnails";
import type { RangeActionGate } from "../range-activation-guard";

type MediaFilter = "all" | SourceAsset["kind"];

const filters = [
  ["all", "media.filter.all"],
  ["video", "media.filter.video"],
  ["audio", "media.filter.audio"],
  ["image", "media.filter.image"]
] as const;

export function MediaPanel({ sources, presentations, selectedId, workspace, importAvailable, importReason, importBusy, thumbnailBusy = false, actionBusy = thumbnailBusy, onAction, backend, snapshotId, t, onSelect, onImport }: { sources: readonly SourceAsset[]; backend?: DesktopBackend; snapshotId?: string; thumbnailBusy?: boolean; actionBusy?: boolean; onAction?: RangeActionGate; presentations: ReadonlyMap<string, SourcePresentation>; selectedId: string | null; workspace: Workspace; importAvailable: boolean; importReason: DesktopCapabilityReason; importBusy: boolean; t: Translate; onSelect(id: string): void; onImport(): void }) {
  const thumbnails = useSourceThumbnails(sources, backend, snapshotId, thumbnailBusy || importBusy);
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [query, setQuery] = useState("");
  function action(callback: () => void) { if (onAction) void onAction(callback).catch(() => {}); else callback(); }
  function filterKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || timelineShortcutBlocked(event.nativeEvent)) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const current = filters.findIndex(([value]) => value === filter);
    const index = event.key === "Home" ? 0 : event.key === "End" ? filters.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + filters.length) % filters.length;
    const target = event.currentTarget;
    action(() => { setFilter(filters[index]![0]); target.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus(); });
  }
  const visibleSources = useMemo(() => sources.filter((source) => {
    const matchesFilter = filter === "all" || source.kind === filter;
    return matchesFilter && [source.displayName, presentations.get(source.id)!.label].some(name => name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  }), [filter, query, sources, presentations]);

  return (
    <aside className="media-panel" aria-label={t("media.title")}>
      <div className="panel-heading">
        <div><span className="eyebrow">{t(workspaceKeys[workspace])}</span><h2>{t("media.title")}</h2></div>
        <button {...shortcutProps("import", t)} type="button" className="import-button" disabled={!importAvailable || importBusy || actionBusy} onClick={onImport} title={importBusy || actionBusy ? t("status.busy") : importAvailable ? shortcutProps("import", t).title : t(capabilityReasonKey(importReason))}>
          <span aria-hidden="true">＋</span>{t(importBusy ? "media.importBusy" : "media.import")}
        </button>
      </div>
      <div className="search-field">
        <Icon name="search" size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("media.searchPlaceholder")} aria-label={t("media.searchPlaceholder")} />
      </div>
      <div className="segmented-tabs" role="tablist" aria-label={t("media.title")} onKeyDown={filterKey}>
        {filters.map(([value, key]) => (
          <button key={value} type="button" role="tab" aria-selected={filter === value} tabIndex={filter === value ? 0 : -1} className={filter === value ? "active" : ""} onClick={() => action(() => setFilter(value))}>{t(key)}</button>
        ))}
      </div>
      <div className="media-grid">
        {visibleSources.map((source) => (
          <div key={source.id} className="media-card-group">
          <button type="button" className={selectedId === source.id ? "media-card selected" : "media-card"} onClick={() => onSelect(source.id)} aria-pressed={selectedId === source.id} aria-label={`${presentations.get(source.id)!.label} · ${source.displayName}`} title={source.displayName}>
            <span className={`media-thumb media-thumb-${source.kind}`}>
              {thumbnails.get(source) ? <img key={thumbnails.get(source)!.url} src={thumbnails.get(source)!.url} alt="" onLoad={event => {
                const frame = thumbnails.get(source);
                if (frame && event.currentTarget.getAttribute("src") === frame.url && (event.currentTarget.naturalWidth !== frame.width || event.currentTarget.naturalHeight !== frame.height)) thumbnails.reject(source);
              }} onError={event => {
                if (event.currentTarget.getAttribute("src") === thumbnails.get(source)?.url) thumbnails.reject(source);
              }} /> : <>
                <span aria-hidden="true">{source.kind === "video" ? "▶" : source.kind === "audio" ? "≋" : "▧"}</span>
                {source.kind === "video" && backend?.thumbnailLocalVideo && <small>{t(thumbnails.failed(source) ? "media.thumbnailUnavailable" : "media.thumbnailLoading")}</small>}
              </>}
            </span>
            <span className="media-card-copy"><strong>{presentations.get(source.id)!.label}</strong><small className="media-source-name">{source.displayName}</small><small>{metadata(source)}</small></span>
          </button>
          {thumbnails.failed(source) && backend?.thumbnailLocalVideo && <button type="button" className="text-button" disabled={actionBusy || importBusy} onClick={() => action(() => thumbnails.retry(source))} aria-label={`${t("media.thumbnailRetry")} · ${presentations.get(source.id)!.label}`}>{t("media.thumbnailRetry")}</button>}
          </div>
        ))}
        {visibleSources.length === 0 && <p className="empty-state">{t("media.empty")}</p>}
      </div>
      {(!importAvailable || importBusy || actionBusy) && <p className="unavailable-note" role="status"><span aria-hidden="true">●</span>{t(importBusy || actionBusy ? "status.busy" : importReason === "desktop-runtime-deferred" ? "media.importUnavailable" : capabilityReasonKey(importReason))}</p>}
    </aside>
  );
}

function metadata(source: SourceAsset): string {
  if (source.kind === "image") return `${source.width ?? 0} × ${source.height ?? 0}`;
  const seconds = Math.round((source.durationMs ?? 0) / 1000);
  if (source.kind === "audio") return `${seconds}s · ${(source.sampleRate ?? 0) / 1000} kHz`;
  return `${seconds}s · ${source.width ?? 0} × ${source.height ?? 0}`;
}
