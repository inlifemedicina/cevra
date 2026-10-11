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
/** A single line, explicitly bounded; unsupported glyphs/overflow are rejected by the renderer. */
export function validateManualTitle(value: unknown): ManualTitleV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("MANUAL_TITLE_INVALID");
  const v = value as Record<string, unknown>;
  const keys = ["version", "componentId", "text", "startFrame", "endFrame", "aspect"];
  if (Object.keys(v).length !== keys.length || Object.keys(v).some(k => !keys.includes(k))
    || v.version !== 1 || v.componentId !== MANUAL_TITLE_COMPONENT
    || typeof v.text !== "string" || !v.text.trim() || v.text.length > 80
    || /[\u0000-\u001f\u007f-\u009f\u2028\u2029\ud800-\udfff]/u.test(v.text)
    || !isCfr30Frame(v.startFrame) || !isCfr30Frame(v.endFrame) || v.endFrame > 18144000 || v.endFrame <= v.startFrame
    || !["16:9", "9:16"].includes(String(v.aspect))) throw Error("MANUAL_TITLE_INVALID");
  return { version: 1, componentId: MANUAL_TITLE_COMPONENT, text: v.text as string,
    startFrame: v.startFrame as number, endFrame: v.endFrame as number, aspect: v.aspect as ManualTitleV1["aspect"] };
}
export function manualTitleGraphic(id: string, value: ManualTitleV1): GraphicItem {
  const title = validateManualTitle(value);
  if (!id.trim()) throw Error("MANUAL_TITLE_INVALID");
  return { id, kind: "text", text: title.text, startMs: framesToMilliseconds(title.startFrame),
    endMs: framesToMilliseconds(title.endFrame), extensions: { [MANUAL_TITLE_EXTENSION]: title } };
}
export function resolveManualTitle(graphic: GraphicItem): ManualTitleV1 {
  const title = validateManualTitle(graphic.extensions?.[MANUAL_TITLE_EXTENSION]);
  if (Object.keys(graphic).some(k => !["id", "kind", "text", "startMs", "endMs", "extensions"].includes(k))
    || Object.keys(graphic.extensions!).length !== 1 || graphic.kind !== "text" || graphic.text !== title.text
    || graphic.startMs !== framesToMilliseconds(title.startFrame) || graphic.endMs !== framesToMilliseconds(title.endFrame)) throw Error("MANUAL_TITLE_INVALID");
  return title;
}
