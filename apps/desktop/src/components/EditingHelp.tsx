import { useId, type ReactNode } from "react";
import type { Translate } from "../ui-model";

export function EditingHelp({ t, children }: { t: Translate; children: ReactNode }) {
  const id = useId();
  return <details className="editing-help"><summary aria-describedby={id}>{t("editing.help")}<span id={id} role="tooltip" className="contextual-help-tip">{t("editing.helpTip")}</span></summary><div className="editing-help-body">{children}</div></details>;
}
