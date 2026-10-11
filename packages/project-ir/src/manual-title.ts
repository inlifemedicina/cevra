import type { GraphicItem } from "./types.js";
import { framesToMilliseconds, isCfr30Frame } from "./frame-time.js";

export const MANUAL_TITLE_COMPONENT = "cevra.title.lower-third.inter.v1" as const;
export const MANUAL_TITLE_EXTENSION = "cevra.manual-title" as const;
export interface ManualTitleV1 {
  version: 1;
  componentId: typeof MANUAL_TITLE_COMPONENT;
  text: string;
  startFrame: number;
  endFrame: number;
  aspect: "16:9" | "9:16";
}
export interface ManualTitleLayoutV1 {
  version: 1;
  /** Normalized top-left coordinates in the final picture, excluding preview letterboxing. */
  x: number; y: number; width: number; fontScale: number;
}
export interface ManualTitleV2 extends Omit<ManualTitleV1, "version"> {
  version: 2; layout: ManualTitleLayoutV1;
}
export type ManualTitle = ManualTitleV1 | ManualTitleV2;
export function manualTitleHeight(aspect: ManualTitle["aspect"], fontScale = 1): number {
  return (aspect === "16:9" ? 56 / 1080 : 48 / 1920) * 1.9 * fontScale;
}
export function manualTitleLayout(title: ManualTitle): ManualTitleLayoutV1 {
  return title.version === 2 ? { ...title.layout } : { version: 1, x: 0.08,
    y: 0.9 - manualTitleHeight(title.aspect), width: 0.84, fontScale: 1 };
}
export function validateManualTitleLayout(value: unknown, aspect: ManualTitle["aspect"]): ManualTitleLayoutV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("MANUAL_TITLE_INVALID");
  const v = value as Record<string, unknown>, keys = ["version", "x", "y", "width", "fontScale"];
  if (Object.keys(v).length !== keys.length || Object.keys(v).some(k => !keys.includes(k)) || v.version !== 1
    || keys.slice(1).some(k => typeof v[k] !== "number" || !Number.isFinite(v[k]))
    || (v.width as number) < 0.2 || (v.width as number) > 1 || (v.fontScale as number) < 0.5 || (v.fontScale as number) > 2
    || (v.x as number) < 0 || (v.y as number) < 0 || (v.x as number) + (v.width as number) > 1 + 1e-9
    || (v.y as number) + manualTitleHeight(aspect, v.fontScale as number) > 1 + 1e-9) throw Error("MANUAL_TITLE_INVALID");
  return { version: 1, x: v.x as number, y: v.y as number, width: v.width as number, fontScale: v.fontScale as number };
}
/** A single line, explicitly bounded; missing graphemes have a visible private-font marker; overflow is rejected by the renderer. */
export function validateManualTitle(value: unknown): ManualTitle {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("MANUAL_TITLE_INVALID");
  const v = value as Record<string, unknown>;
  const keys = ["version", "componentId", "text", "startFrame", "endFrame", "aspect", ...(v.version === 2 ? ["layout"] : [])];
  if (Object.keys(v).length !== keys.length || Object.keys(v).some(k => !keys.includes(k))
    || ![1, 2].includes(v.version as number) || v.componentId !== MANUAL_TITLE_COMPONENT
    || typeof v.text !== "string" || !v.text.trim() || v.text.length > 80
    || /[\u0000-\u001f\u007f-\u009f\u2028\u2029\ud800-\udfff]/u.test(v.text)
    || !isCfr30Frame(v.startFrame) || !isCfr30Frame(v.endFrame) || v.endFrame > 18144000 || v.endFrame <= v.startFrame
    || !["16:9", "9:16"].includes(String(v.aspect))) throw Error("MANUAL_TITLE_INVALID");
  const base = { componentId: MANUAL_TITLE_COMPONENT, text: v.text as string, startFrame: v.startFrame as number,
    endFrame: v.endFrame as number, aspect: v.aspect as ManualTitle["aspect"] };
  return v.version === 2 ? { ...base, version: 2, layout: validateManualTitleLayout(v.layout, base.aspect) } : { ...base, version: 1 };
}
export function manualTitleGraphic(id: string, value: ManualTitle): GraphicItem {
  const title = validateManualTitle(value);
  if (!id.trim()) throw Error("MANUAL_TITLE_INVALID");
  return { id, kind: "text", text: title.text, startMs: framesToMilliseconds(title.startFrame),
    endMs: framesToMilliseconds(title.endFrame), extensions: { [MANUAL_TITLE_EXTENSION]: title } };
}
export function resolveManualTitle(graphic: GraphicItem): ManualTitle {
  const title = validateManualTitle(graphic.extensions?.[MANUAL_TITLE_EXTENSION]);
  if (Object.keys(graphic).some(k => !["id", "kind", "text", "startMs", "endMs", "extensions"].includes(k))
    || Object.keys(graphic.extensions!).length !== 1 || graphic.kind !== "text" || graphic.text !== title.text
    || graphic.startMs !== framesToMilliseconds(title.startFrame) || graphic.endMs !== framesToMilliseconds(title.endFrame)) throw Error("MANUAL_TITLE_INVALID");
  return title;
}
