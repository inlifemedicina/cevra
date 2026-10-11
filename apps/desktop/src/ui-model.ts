import type { TranslationKey } from "@cevra/i18n";
import type { DesktopCapabilityReason } from "./backend/desktop-backend";

export const workspaces = ["edit", "transcription", "composition", "captions", "audio"] as const;
export type Workspace = (typeof workspaces)[number];

export const workspaceKeys: Record<Workspace, TranslationKey> = {
  edit: "workspace.edit",
  transcription: "workspace.transcription",
  composition: "workspace.composition",
  captions: "workspace.captions",
  audio: "workspace.audio"
};

export const presetOptions = [
  ["custom", "preset.custom"],
  ["dynamic-reels", "preset.dynamicReels"],
  ["talking-head-clean", "preset.talkingHeadClean"],
  ["podcast-clean", "preset.podcastClean"],
  ["medical-consultation-clean", "preset.medicalConsultationClean"],
  ["youtube-long-form", "preset.youtubeLongForm"],
  ["ad-30", "preset.ad30"],
  ["mine", "preset.mine"]
] as const satisfies ReadonlyArray<readonly [string, TranslationKey]>;

export type Translate = (key: TranslationKey, parameters?: Readonly<Record<string, string | number>>) => string;

/** Source/clip milliseconds, independent of a presumed source frame rate. */
export function formatMilliseconds(milliseconds: number, durationMs = milliseconds): string {
  return formatTime(milliseconds, durationMs);
}

/** Duration controls the clock width; displayed precision never changes stored time. */
export function formatTime(milliseconds: number, durationMs = milliseconds): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000 + 1e-9));
  const short = `${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return Math.max(milliseconds, durationMs) >= 3600000 ? `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${short}` : short;
}

export function formatPreciseTime(milliseconds: number, durationMs = milliseconds): string {
  const rounded = Math.max(0, Math.round(milliseconds));
  return `${formatTime(rounded, durationMs)},${String(rounded % 1000).padStart(3, "0")}`;
}

export function capabilityReasonKey(reason: DesktopCapabilityReason): TranslationKey {
  switch (reason) {
    case "runtime-not-configured": return "runtime.notConfigured";
    case "runtime-invalid": return "runtime.invalid";
    case "model-not-available": return "runtime.modelUnavailable";
    case "host-unavailable": return "runtime.hostUnavailable";
    case "available": return "status.ready";
    case "review-session": return "runtime.reviewSession";
    case "desktop-runtime-deferred": return "status.unavailableDetail";
  }
}
