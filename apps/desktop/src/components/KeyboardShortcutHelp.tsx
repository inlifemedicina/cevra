import type { Translate } from "../ui-model";
import { keyboardBindings, shortcutDisplay } from "../keyboard-shortcuts";

export function KeyboardShortcutHelp({ t }: { t: Translate }) {
  return <details className="keyboard-help">
    <summary>{t("keyboard.title")}</summary>
    <div className="keyboard-help-content" role="region" aria-label={t("keyboard.title")}>
      <p>{t("keyboard.native")}</p><p>{t("keyboard.availability")}</p>
      <dl>{keyboardBindings.map(binding => <div key={binding.id}>
        <dt>{t(binding.label)} <small>{t(`keyboard.scope.${binding.scope}`)}</small></dt><dd><kbd>{shortcutDisplay(binding, t)}</kbd></dd>
      </div>)}</dl>
      <p>{t("keyboard.fields")}</p>
    </div>
  </details>;
}
