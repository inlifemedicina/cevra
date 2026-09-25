export const PROJECT_IR_SCHEMA_VERSION_V1 = 1 as const;
export const CURRENT_SCHEMA_VERSION = 2 as const;
export const TRANSCRIPT_DIGEST_VERSION = 1 as const;
export const MAX_TRANSCRIPT_PROVENANCE_STAGES = 5 as const;

export type CevraLocale = "pt-BR" | "en-US";
export type Milliseconds = number;
export type ISODateTime = string;
export type Id = string;
export type ExtensionMap = Record<string, unknown>;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface ProjectMetadata {
  id: Id;
  name: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  defaultLocale: CevraLocale;
}

export type SourceKind = "video" | "audio" | "image";

export const SOURCE_TECHNICAL_DESCRIPTOR_VERSION = 1 as const;
export const SOURCE_TECHNICAL_DESCRIPTOR_PROFILE = "cevra.source-technical.v1" as const;
export const MAX_SOURCE_TECHNICAL_DESCRIPTOR_BYTES = 2048 as const;

export interface SourceTechnicalDescriptorV1 {
  version: typeof SOURCE_TECHNICAL_DESCRIPTOR_VERSION;
  basis: "ingest" | "post-ingest";
  content: {
    sha256: string;
    sizeBytes: number;
  };
  method: {
    profile: typeof SOURCE_TECHNICAL_DESCRIPTOR_PROFILE;
    engineId: string;
    engineVersion: string;
    engineApiVersion: number;
  };
  video?: {
    codec?: string;
    pixelFormat?: string;
    avgFrameRate?: string;
    rFrameRate?: string;
    rotationDegrees?: number;
    colorPrimaries?: string;
    colorTransfer?: string;
    colorSpace?: string;
    colorRange?: string;
  };
  audio?: {
    codec?: string;
  };
}

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
  technicalDescriptor?: SourceTechnicalDescriptorV1;
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

export type TranscriptDigest = `sha256-v1:${string}`;
export type TranscriptWordTiming = "none" | "model" | "aligned" | "unknown";
export type TranscriptSpeakerState = "none" | "partial" | "complete";

export type OptionalModelIdentity =
  | {
      modelId: string;
      modelRevision?: string;
      modelDigest?: string;
    }
  | {
      modelId?: never;
      modelRevision?: never;
      modelDigest?: never;
    };

export type ExecutedTranscriptStageBase = OptionalModelIdentity & {
  executionId: Id;
  engineId: string;
  engineVersion: string;
  engineApiVersion: string;
  createdAt: ISODateTime;
};

export type TranscriptProvenanceStage =
  | (ExecutedTranscriptStageBase & {
      kind: "transcription";
      modelId: string;
    })
  | (ExecutedTranscriptStageBase & {
      kind: "alignment";
      inputTranscriptDigest: TranscriptDigest;
    })
  | (ExecutedTranscriptStageBase & {
      kind: "speaker-attribution";
      inputTranscriptDigest: TranscriptDigest;
    })
  | {
      kind: "manual-correction";
      inputTranscriptDigest: TranscriptDigest;
      createdAt: ISODateTime;
      executionId?: Id;
    }
  | {
      kind: "migration";
      fromSchemaVersion: typeof PROJECT_IR_SCHEMA_VERSION_V1;
      toSchemaVersion: typeof CURRENT_SCHEMA_VERSION;
    };

export interface SourceTranscriptProvenance {
  sourceChecksum?: string;
  stages: TranscriptProvenanceStage[];
}

export interface SourceTranscript {
  sourceId: Id;
  transcriptDigest: TranscriptDigest;
  wordTiming: TranscriptWordTiming;
  speakerState: TranscriptSpeakerState;
  transcript: TranscriptState;
  provenance: SourceTranscriptProvenance;
  extensions?: ExtensionMap;
}

export type V1TranscriptQuarantineReason =
  | "no-eligible-source"
  | "ambiguous-multiple-sources"
  | "incompatible-canonical-transcript";

export interface V1UnassignedTranscriptQuarantine {
  schemaVersion: typeof PROJECT_IR_SCHEMA_VERSION_V1;
  originalSchemaVersion: typeof PROJECT_IR_SCHEMA_VERSION_V1;
  reason: V1TranscriptQuarantineReason;
  payload: JsonObject;
  eligibleSourceIdsAtMigration: Id[];
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

interface ProjectIRSharedState {
  project: ProjectMetadata;
  sources: SourceAsset[];
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

export interface ProjectIRv1 extends ProjectIRSharedState {
  schemaVersion: typeof PROJECT_IR_SCHEMA_VERSION_V1;
  transcript: TranscriptState;
}

export interface ProjectIRv2 extends ProjectIRSharedState {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  sourceTranscripts: SourceTranscript[];
}

export type ProjectIR = ProjectIRv2;

export type EditCommand =
  | { type: "project.rename"; name: string }
  | { type: "source.add"; source: SourceAsset }
  | { type: "source.remove"; sourceId: Id }
  | {
      type: "source.technicalDescriptor.set";
      sourceId: Id;
      expectedSourceUri: string;
      expectedTechnicalDescriptor:
        | { state: "absent" }
        | { state: "value"; value: SourceTechnicalDescriptorV1 };
      technicalDescriptor: SourceTechnicalDescriptorV1;
    }
  | { type: "transcript.set"; transcript: SourceTranscript; expectedCurrentTranscriptDigest?: TranscriptDigest }
  | { type: "transcript.remove"; sourceId: Id; expectedTranscriptDigest: TranscriptDigest }
  | { type: "track.add"; track: TimelineTrack }
  | { type: "track.remove"; trackId: Id }
  | { type: "clip.add"; clip: TimelineClip }
  | { type: "clip.remove"; clipId: Id }
  | { type: "clip.trim"; clipId: Id; timelineStartMs: Milliseconds; timelineEndMs: Milliseconds; sourceStartMs: Milliseconds; sourceEndMs: Milliseconds }
  | { type: "caption.upsert"; caption: CaptionCue }
  | { type: "caption.remove"; captionId: Id }
  | { type: "style.patch"; patch: Partial<StyleState> }
  | { type: "export.add"; export: ExportRecord };
