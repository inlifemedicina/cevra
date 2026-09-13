export const CURRENT_SCHEMA_VERSION = 1 as const;

export type CevraLocale = "pt-BR" | "en-US";
export type Milliseconds = number;
export type ISODateTime = string;
export type Id = string;
export type ExtensionMap = Record<string, unknown>;

export interface ProjectMetadata {
  id: Id;
  name: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  defaultLocale: CevraLocale;
}

export type SourceKind = "video" | "audio" | "image";

export interface SourceAsset {
  id: Id;
  kind: SourceKind;
  uri: string;
  displayName: string;
  durationMs?: Milliseconds;
  width?: number;
  height?: number;
  frameRate?: number;
  sampleRate?: number;
  channels?: number;
  checksum?: string;
  extensions?: ExtensionMap;
}

export interface TranscriptWord {
  id: Id;
  text: string;
  startMs: Milliseconds;
  endMs: Milliseconds;
  confidence?: number;
  speakerId?: Id;
}

export interface TranscriptSegment {
  id: Id;
  startMs: Milliseconds;
  endMs: Milliseconds;
  text: string;
  wordIds: Id[];
  speakerId?: Id;
}

export interface TranscriptState {
  language?: string;
  words: TranscriptWord[];
  segments: TranscriptSegment[];
}

export type TrackKind = "video" | "audio" | "overlay" | "caption";

export interface TimelineTrack {
  id: Id;
  kind: TrackKind;
  name: string;
  locked: boolean;
  hidden: boolean;
  muted: boolean;
}

export interface TimelineClip {
  id: Id;
  trackId: Id;
  sourceId: Id;
  timelineStartMs: Milliseconds;
  timelineEndMs: Milliseconds;
  sourceStartMs: Milliseconds;
  sourceEndMs: Milliseconds;
  speed: number;
  volume: number;
  opacity: number;
  extensions?: ExtensionMap;
}

export interface TimelineState {
  durationMs: Milliseconds;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
}

export interface CaptionCue {
  id: Id;
  startMs: Milliseconds;
  endMs: Milliseconds;
  text: string;
  speakerId?: Id;
  styleToken?: string;
}

export type GraphicKind = "text" | "image" | "video" | "shape" | "lottie";

export interface GraphicItem {
  id: Id;
  kind: GraphicKind;
  startMs: Milliseconds;
  endMs: Milliseconds;
  sourceId?: Id;
  text?: string;
  layoutId?: Id;
  styleToken?: string;
  extensions?: ExtensionMap;
}

export type LayoutKind = "fullscreen" | "split-horizontal" | "split-vertical" | "picture-in-picture" | "custom";

export interface LayoutDefinition {
  id: Id;
  name: string;
  kind: LayoutKind;
  regions: Array<{
    id: Id;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  extensions?: ExtensionMap;
}

export interface AudioState {
  masterGainDb: number;
  normalizeTargetLufs?: number;
  musicDuckDb?: number;
}

export interface StyleState {
  presetId?: string;
  accentColor?: string;
  captionStyle?: string;
  headlineStyle?: string;
  motionProfile?: string;
  extensions?: ExtensionMap;
}

export type GenerationKind = "image" | "video" | "audio";
export type GenerationStatus = "pending" | "running" | "completed" | "failed";

export interface GenerationRecord {
  id: Id;
  kind: GenerationKind;
  providerId: string;
  prompt: string;
  status: GenerationStatus;
  outputSourceIds: Id[];
  createdAt: ISODateTime;
  completedAt?: ISODateTime;
  errorCode?: string;
  extensions?: ExtensionMap;
}

export interface HistoryState {
  revision: number;
  headEntryId?: Id;
  headSnapshotId?: Id;
}

export type QaStatus = "PASS" | "WARN" | "FAIL" | "UNKNOWN";

export interface QaFinding {
  id: Id;
  ruleId: string;
  status: QaStatus;
  message: string;
  evidence?: Record<string, unknown>;
  createdAt: ISODateTime;
}

export interface ExportRecord {
  id: Id;
  presetId: string;
  status: "pending" | "running" | "completed" | "failed";
  outputUri?: string;
  createdAt: ISODateTime;
  completedAt?: ISODateTime;
  errorCode?: string;
}

export interface ProjectIRv1 {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  project: ProjectMetadata;
  sources: SourceAsset[];
  transcript: TranscriptState;
  timeline: TimelineState;
  captions: CaptionCue[];
  graphics: GraphicItem[];
  layouts: LayoutDefinition[];
  audio: AudioState;
  style: StyleState;
  generation: GenerationRecord[];
  history: HistoryState;
  qa: QaFinding[];
  exports: ExportRecord[];
  extensions: ExtensionMap;
}

export type ProjectIR = ProjectIRv1;

export type EditCommand =
  | { type: "project.rename"; name: string }
  | { type: "source.add"; source: SourceAsset }
  | { type: "source.remove"; sourceId: Id }
  | { type: "track.add"; track: TimelineTrack }
  | { type: "track.remove"; trackId: Id }
  | { type: "clip.add"; clip: TimelineClip }
  | { type: "clip.remove"; clipId: Id }
  | { type: "clip.trim"; clipId: Id; timelineStartMs: Milliseconds; timelineEndMs: Milliseconds; sourceStartMs: Milliseconds; sourceEndMs: Milliseconds }
  | { type: "caption.upsert"; caption: CaptionCue }
  | { type: "caption.remove"; captionId: Id }
  | { type: "style.patch"; patch: Partial<StyleState> }
  | { type: "export.add"; export: ExportRecord };
