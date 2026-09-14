import type { TranslationKey } from "@cevra/i18n";
import { Icon } from "./Icon";
import type { Translate } from "../ui-model";

const tools = [
  ["media", "media", "nav.media"],
  ["templates", "preset", "nav.templates"],
  ["elements", "element", "nav.elements"],
  ["text", "text", "nav.text"],
  ["transitions", "transition", "nav.transitions"],
  ["effects", "effect", "nav.effects"],
  ["ai", "ai", "nav.aiTools"]
] as const;

export function ToolRail({ selected, t, onSelect }: { selected: string; t: Translate; onSelect(value: string): void }) {
  return (
    <nav className="tool-rail" aria-label={t("nav.primary")}>
      {tools.map(([id, icon, key]) => (
        <button key={id} type="button" className={selected === id ? "rail-button active" : "rail-button"} onClick={() => onSelect(id)} title={t(key as TranslationKey)} aria-label={t(key as TranslationKey)}>
          <Icon name={icon} />
          <span>{t(key as TranslationKey)}</span>
        </button>
      ))}
      <button type="button" className="rail-button rail-settings" disabled title={t("status.unavailableDetail")} aria-label={t("nav.settings")}>
        <Icon name="settings" /><span>{t("nav.settings")}</span>
      </button>
    </nav>
  );
}
