import { validateManualTitle, type ManualTitle } from "@cevra/project-ir";
export const MANUAL_TITLE_FONT_SHA256 = "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031" as const;
/** Closed admission failure; worker diagnostics never become user-facing text. */
export class ManualTitleColourError extends Error {
  readonly code = "MANUAL_TITLE_UNSUPPORTED_COLOUR";
  constructor() { super("MANUAL_TITLE_UNSUPPORTED_COLOUR"); this.name = "ManualTitleColourError"; }
}
/** Engine-independent component plan. Paths and generated pixels never enter Project IR or UI requests. */
export interface ManualTitleCompositionPlanV1 {
  version: 1;
  title: ManualTitle;
  fontSha256: typeof MANUAL_TITLE_FONT_SHA256;
  rasterizerId: "cevra.coretext.inter.v1";
}
export interface ManualTitleCompositionCompilerAdapter {
  compile(title: ManualTitle): ManualTitleCompositionPlanV1;
}
/** Bounded first-party component adapter, without promoting a default composition engine. */
export class FixedManualTitleCompositionAdapter implements ManualTitleCompositionCompilerAdapter {
  compile(title: ManualTitle): ManualTitleCompositionPlanV1 {
    return { version: 1, title: validateManualTitle(title), fontSha256: MANUAL_TITLE_FONT_SHA256, rasterizerId: "cevra.coretext.inter.v1" };
  }
}
export function validateManualTitleComposition(value: unknown): ManualTitleCompositionPlanV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid title composition");
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 4 || Object.keys(v).some(k => !["version", "title", "fontSha256", "rasterizerId"].includes(k))
    || v.version !== 1 || v.fontSha256 !== MANUAL_TITLE_FONT_SHA256 || v.rasterizerId !== "cevra.coretext.inter.v1") throw Error("Invalid title composition");
  return new FixedManualTitleCompositionAdapter().compile(validateManualTitle(v.title));
}
