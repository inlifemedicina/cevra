import type { SourceAsset } from "@cevra/project-ir";
import { useMemo, useState } from "react";
import { workspaceKeys, type Translate, type Workspace } from "../ui-model";
import { Icon } from "./Icon";

type MediaFilter = "all" | SourceAsset["kind"];

const filters = [
  ["all", "media.filter.all"],
  ["video", "media.filter.video"],
  ["audio", "media.filter.audio"],
  ["image", "media.filter.image"]
] as const;

export function MediaPanel({ sources, selectedId, workspace, importAvailable, t, onSelect }: { sources: readonly SourceAsset[]; selectedId: string | null; workspace: Workspace; importAvailable: boolean; t: Translate; onSelect(id: string): void }) {
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [query, setQuery] = useState("");
  const visibleSources = useMemo(() => sources.filter((source) => {
    const matchesFilter = filter === "all" || source.kind === filter;
    return matchesFilter && source.displayName.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  }), [filter, query, sources]);

  return (
    <aside className="media-panel" aria-label={t("media.title")}>
      <div className="panel-heading">
        <div><span className="eyebrow">{t(workspaceKeys[workspace])}</span><h2>{t("media.title")}</h2></div>
        <button type="button" className="import-button" disabled={!importAvailable} title={importAvailable ? undefined : t("media.importUnavailable")}>
          <span aria-hidden="true">＋</span>{t("media.import")}
        </button>
      </div>
      <div className="search-field">
        <Icon name="search" size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("media.searchPlaceholder")} aria-label={t("media.searchPlaceholder")} />
      </div>
      <div className="segmented-tabs" role="tablist" aria-label={t("media.title")}>
        {filters.map(([value, key]) => (
          <button key={value} type="button" role="tab" aria-selected={filter === value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{t(key)}</button>
        ))}
      </div>
      <div className="media-grid">
        {visibleSources.map((source, index) => (
          <button key={source.id} type="button" className={selectedId === source.id ? "media-card selected" : "media-card"} onClick={() => onSelect(source.id)} aria-pressed={selectedId === source.id}>
            <span className={`media-thumb media-thumb-${source.kind}`}>
              <span aria-hidden="true">{source.kind === "video" ? "▶" : source.kind === "audio" ? "≋" : "▧"}</span>
              {index === 0 && <small>4K</small>}
            </span>
            <span className="media-card-copy"><strong>{source.displayName}</strong><small>{metadata(source)}</small></span>
          </button>
        ))}
        {visibleSources.length === 0 && <p className="empty-state">{t("media.empty")}</p>}
      </div>
      {!importAvailable && <p className="unavailable-note"><span aria-hidden="true">●</span>{t("media.importUnavailable")}</p>}
    </aside>
  );
}

function metadata(source: SourceAsset): string {
  if (source.kind === "image") return `${source.width ?? 0} × ${source.height ?? 0}`;
  const seconds = Math.round((source.durationMs ?? 0) / 1000);
  if (source.kind === "audio") return `${seconds}s · ${(source.sampleRate ?? 0) / 1000} kHz`;
  return `${seconds}s · ${source.width ?? 0} × ${source.height ?? 0}`;
}
