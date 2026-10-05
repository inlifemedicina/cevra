import { type ProjectHistory, type ProjectIR, type SourceAsset, type TimelineEditOperation } from "@cevra/project-ir";
import { createSourceContentVerificationMemo, SourceTechnicalDescriptorResolver, type SourceContentIdentityPort, type SourceFileOperationalStampV1 } from "./source-technical-descriptor.js";

/** Bounded first-video preview; streaming/composition remain separate work. */
export const MANUAL_VIDEO_MAX_BYTES = 8 * 1024 * 1024;
export const MANUAL_VIDEO_SOURCE_MAX_BYTES = 256 * 1024 * 1024;
export const MANUAL_VIDEO_FRAME_MAX_BYTES = 2 * 1024 * 1024;

export interface LocalVideoPreviewRequest {
  sourceId: string;
  expectedSnapshotId: string;
  /** A clip requires an operation; Original may also prepare a cancellable proxy. */
  clipId?: string;
  operationId?: string;
}

export interface LocalVideoPreview {
  sourceId: string;
  snapshotId: string;
  durationMs: number;
  mimeType: "video/mp4" | "video/quicktime" | "video/webm";
  base64: string;
  proxy?: { profile: "take-v1"; sourceDurationMs: number };
  /** Ephemeral first admitted frame; never a source, poster asset or project edit. */
  initialFrame?: { mimeType: "image/png"; base64: string; width: number; height: number; sourceTimeMs: number };
  clip?: { id: string; sourceStartMs: number; sourceEndMs: number; firstFrameMs: number; lastFrameMs: number; frameCount: number };
}

export interface CreateManualVideoClipRequest extends LocalVideoPreviewRequest {
  sourceStartMs: number;
  sourceEndMs: number;
}

export interface TrimManualVideoClipRequest {
  clipId: string;
  expectedSnapshotId: string;
  sourceStartMs: number;
  sourceEndMs: number;
}

export function manualVideoError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

/** Canonical ingest evidence, never a WebView path or duration. */
export function resolveManualVideo(project: Readonly<ProjectIR>, request: LocalVideoPreviewRequest): SourceAsset & { durationMs: number } {
  if (!request || typeof request.sourceId !== "string" || !request.sourceId
    || typeof request.expectedSnapshotId !== "string" || !request.expectedSnapshotId) throw manualVideoError("MANUAL_VIDEO_INVALID_REQUEST");
  if (project.history.headSnapshotId !== request.expectedSnapshotId) throw manualVideoError("MANUAL_VIDEO_STALE");
  const source = project.sources.find((item) => item.id === request.sourceId);
  const ingest = source?.extensions?.["cevra.ingest"];
  if (!source || source.kind !== "video" || !Number.isSafeInteger(source.durationMs) || source.durationMs! <= 0
    || source.technicalDescriptor?.basis !== "ingest" || source.technicalDescriptor.method.profile !== "cevra.source-technical.v1"
    || !ingest || typeof ingest !== "object" || Array.isArray(ingest) || !("method" in ingest) || ingest.method !== "local" || !("hasVideo" in ingest) || ingest.hasVideo !== true) {
    throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
  }
  if (source.technicalDescriptor.content.sizeBytes <= 0 || source.technicalDescriptor.content.sizeBytes > MANUAL_VIDEO_SOURCE_MAX_BYTES) {
    throw manualVideoError("MANUAL_VIDEO_TOO_LARGE");
  }
  return source as SourceAsset & { durationMs: number };
}

export class ManualVideoClipApplicationService {
  constructor(private readonly options: { history: ProjectHistory; identity: SourceContentIdentityPort; idGenerator?: () => string }) {}

  async create(request: CreateManualVideoClipRequest): Promise<{ clipId: string; project: ProjectIR }> {
    if (!request || typeof request !== "object" || Array.isArray(request)) throw manualVideoError("MANUAL_VIDEO_INVALID_REQUEST");
    const stable = structuredClone(request);
    if (Object.keys(stable).some((key) => !["sourceId", "expectedSnapshotId", "sourceStartMs", "sourceEndMs"].includes(key))) {
      throw manualVideoError("MANUAL_VIDEO_INVALID_REQUEST");
    }
    const before = this.options.history.current;
    const journalIdentity = this.options.history.journalIdentity;
    const source = resolveManualVideo(before, stable);
    if (!Number.isSafeInteger(stable.sourceStartMs) || !Number.isSafeInteger(stable.sourceEndMs)
      || stable.sourceStartMs < 0 || stable.sourceStartMs >= stable.sourceEndMs || stable.sourceEndMs > source.durationMs) {
      throw manualVideoError("MANUAL_VIDEO_INVALID_RANGE");
    }
    if (before.timeline.clips.length || before.captions.length || before.graphics.length) throw manualVideoError("MANUAL_VIDEO_TIMELINE_OCCUPIED");
    await this.verifySource(source);
    // The retained journal and redo branch also bind async work, even when the
    // visible snapshot has returned to the same ID after an intervening edit.
    if (this.options.history.journalIdentity !== journalIdentity) throw manualVideoError("MANUAL_VIDEO_STALE");
    resolveManualVideo(this.options.history.current, stable);
    const track = before.timeline.tracks.find((item) => item.kind === "video" && !item.locked && !item.hidden && !item.muted);
    const trackId = track?.id ?? (before.timeline.tracks.some((item) => item.id === "track-v1") ? `track-${this.nextId()}` : "track-v1");
    const clipId = `clip-${this.nextId()}`;
    const edits: TimelineEditOperation[] = [
      ...(!track ? [{ type: "track.add" as const, track: { id: trackId, kind: "video" as const, name: "V1", locked: false, hidden: false, muted: false } }] : []),
      { type: "clip.add", clip: { id: clipId, trackId, sourceId: source.id, timelineStartMs: 0, timelineEndMs: stable.sourceEndMs - stable.sourceStartMs,
        sourceStartMs: stable.sourceStartMs, sourceEndMs: stable.sourceEndMs, speed: 1, volume: 1, opacity: 1 } }
    ];
    // Track preparation and the first occurrence publish together. One Undo
    // restores exactly the state before the user's action, including no track.
    this.options.history.commit({ type: "timeline.edit", version: 1, edits }, { type: "user" });
    return { clipId, project: this.options.history.current };
  }

  async trim(request: TrimManualVideoClipRequest): Promise<{ clipId: string; project: ProjectIR }> {
    if (!request || typeof request !== "object" || Array.isArray(request)) throw manualVideoError("MANUAL_VIDEO_INVALID_REQUEST");
    const stable = structuredClone(request);
    if (!stable || typeof stable.clipId !== "string" || !stable.clipId
      || Object.keys(stable).some((key) => !["clipId", "expectedSnapshotId", "sourceStartMs", "sourceEndMs"].includes(key))) {
      throw manualVideoError("MANUAL_VIDEO_INVALID_REQUEST");
    }
    const before = this.options.history.current;
    const journalIdentity = this.options.history.journalIdentity;
    const clip = before.timeline.clips.find((item) => item.id === stable.clipId);
    if (!clip) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
    const binding = { sourceId: clip.sourceId, expectedSnapshotId: stable.expectedSnapshotId };
    const source = resolveManualVideo(before, binding);
    const track = before.timeline.tracks.find((item) => item.id === clip.trackId);
    if (before.timeline.clips.length !== 1 || before.captions.length || before.graphics.length
      || !track || track.kind !== "video" || track.locked || track.hidden || track.muted
      || clip.speed !== 1 || clip.volume !== 1 || clip.opacity !== 1 || Object.keys(clip.extensions ?? {}).length
      || clip.timelineStartMs !== 0 || clip.timelineEndMs !== clip.sourceEndMs - clip.sourceStartMs
      || clip.sourceStartMs < 0 || clip.sourceEndMs > source.durationMs) throw manualVideoError("MANUAL_VIDEO_UNSUPPORTED");
    if (!Number.isSafeInteger(stable.sourceStartMs) || !Number.isSafeInteger(stable.sourceEndMs)
      || stable.sourceStartMs < 0 || stable.sourceStartMs >= stable.sourceEndMs || stable.sourceEndMs > source.durationMs) {
      throw manualVideoError("MANUAL_VIDEO_INVALID_RANGE");
    }
    if (stable.sourceStartMs === clip.sourceStartMs && stable.sourceEndMs === clip.sourceEndMs) return { clipId: clip.id, project: before };
    await this.verifySource(source);
    if (this.options.history.journalIdentity !== journalIdentity) throw manualVideoError("MANUAL_VIDEO_STALE");
    resolveManualVideo(this.options.history.current, binding);
    this.options.history.commit({ type: "clip.trim", clipId: clip.id, timelineStartMs: 0,
      timelineEndMs: stable.sourceEndMs - stable.sourceStartMs, sourceStartMs: stable.sourceStartMs, sourceEndMs: stable.sourceEndMs }, { type: "user" });
    return { clipId: clip.id, project: this.options.history.current };
  }

  private async verifySource(source: SourceAsset): Promise<void> {
    await verifyManualVideoSource(source, this.options.identity);
  }

  private nextId(): string {
    return this.options.idGenerator?.() ?? globalThis.crypto.randomUUID();
  }
}

/** Shared original-content guard for typed manual edits; never a WebView path request. */
export async function verifyManualVideoSource(source: SourceAsset, identity: SourceContentIdentityPort, signal?: AbortSignal): Promise<void> {
  await verifyManualVideoSources([source], identity, signal);
}

/** Verify every unique original, then revalidate all stamps after the last hash. */
export async function verifyManualVideoSources(sources: readonly SourceAsset[], identity: SourceContentIdentityPort, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const byUri = new Map(sources.map(source => [source.uri, source]));
  const resolver = new SourceTechnicalDescriptorResolver({
    captureSource: async (uri, signal) => {
      const stamp = await identity.captureSource(uri, signal);
      const source = byUri.get(uri)!;
      // Reject replacement/growth before the generic resolver hashes the file.
      if (stamp.sizeBytes !== source.technicalDescriptor!.content.sizeBytes || stamp.sizeBytes > MANUAL_VIDEO_SOURCE_MAX_BYTES) throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
      return stamp;
    },
    identifySource: (uri, stamp, signal) => identity.identifySource(uri, stamp, signal),
    checkSource: (uri, stamp, signal) => identity.checkSource(uri, stamp, signal)
  });
  const memo = createSourceContentVerificationMemo(1);
  const stamps: SourceFileOperationalStampV1[] = [];
  for (const source of sources) {
    signal?.throwIfAborted();
    memo.entries.clear();
    const verified = await resolver.verify(source, memo, signal);
    signal?.throwIfAborted();
    if (verified.status !== "verified") throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
    stamps.push(verified.verification.stamp);
  }
  for (const stamp of stamps) {
    signal?.throwIfAborted();
    const status = await identity.checkSource(stamp.uri, stamp, signal);
    signal?.throwIfAborted();
    if (status !== "match") throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
  }
}
