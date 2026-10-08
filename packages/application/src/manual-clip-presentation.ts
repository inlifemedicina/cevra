import type { TimelineClip } from "@cevra/project-ir";

/** Presentation provenance only. It never changes picture/audio sampling. */
export const MANUAL_CLIP_COPY_EXTENSION = "cevra.manualClipCopy.v1";

export function manualClipCopyOrigin(clip: Readonly<TimelineClip>): string | undefined {
  const value = clip.extensions?.[MANUAL_CLIP_COPY_EXTENSION];
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const fields = value as Record<string, unknown>;
  return Object.keys(fields).length === 2 && fields.version === 1
    && typeof fields.originalClipId === "string" && fields.originalClipId.length > 0
    ? fields.originalClipId : undefined;
}

export function supportsManualClipExtensions(clip: Readonly<TimelineClip>): boolean {
  const keys = Object.keys(clip.extensions ?? {});
  return keys.length === 0 || keys.length === 1
    && keys[0] === MANUAL_CLIP_COPY_EXTENSION && manualClipCopyOrigin(clip) !== undefined;
}

export function copyManualClip(clip: Readonly<TimelineClip>, id: string): TimelineClip {
  return { ...structuredClone(clip), id, extensions: {
    [MANUAL_CLIP_COPY_EXTENSION]: { version: 1, originalClipId: clip.id }
  } };
}
