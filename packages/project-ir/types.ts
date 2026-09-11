export type CevraLocale = 'pt-BR' | 'en-US';
export type AssetKind = 'video' | 'audio' | 'image';
export type TrackKind = 'video' | 'audio' | 'caption' | 'graphic';

export interface TimeRange { startMs: number; endMs: number; }

export interface SourceAsset {
  id: string;
  kind: AssetKind;
  uri: string;
  displayName?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  frameRate?: number;
  metadata?: Record<string, unknown>;
}

export interface TimelineClip extends TimeRange {
  id: string;
  sourceId: string;
  sourceStartMs: number;
  sourceEndMs: number;
  trackId: string;
  enabled?: boolean;
  properties?: Record<string, unknown>;
}

export interface TimelineTrack {
  id: string;
  kind: TrackKind;
  name: string;
  order: number;
  locked?: boolean;
  muted?: boolean;
  hidden?: boolean;
}

export interface TranscriptWord {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  speakerId?: string;
  confidence?: number;
}

export interface CaptionItem extends TimeRange {
  id: string;
  text: string;
  wordIds?: string[];
  stylePresetId?: string;
  properties?: Record<string, unknown>;
}

export interface QaFinding {
  id: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'UNKNOWN';
  rule: string;
  message: string;
  timeRange?: TimeRange;
  evidence?: Record<string, unknown>;
}

export interface CevraProject {
  schemaVersion: 1;
  project: {
    id: string;
    title: string;
    locale: CevraLocale;
    createdAt: string;
    updatedAt: string;
  };
  sources: SourceAsset[];
  transcript: { words: TranscriptWord[]; metadata?: Record<string, unknown> } | null;
  timeline: { tracks: TimelineTrack[]; clips: TimelineClip[] };
  captions: CaptionItem[];
  graphics: Array<Record<string, unknown>>;
  layouts: Array<Record<string, unknown>>;
  audio: Record<string, unknown>;
  style: Record<string, unknown>;
  generation: Array<Record<string, unknown>>;
  history: { currentSnapshotId?: string | null };
  qa: QaFinding[];
  exports: Array<Record<string, unknown>>;
  extensions: Record<string, unknown>;
}
