import type { TranslationKey } from "@cevra/i18n";

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

export function formatTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const frames = Math.floor((milliseconds % 1000) / (1000 / 30));
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}
