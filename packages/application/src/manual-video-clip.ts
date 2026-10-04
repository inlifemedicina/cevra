import { applyCommand, type EditCommand, type ProjectHistory, type ProjectIR, type SourceAsset } from "@cevra/project-ir";
import { createSourceContentVerificationMemo, SourceTechnicalDescriptorResolver, type SourceContentIdentityPort } from "./source-technical-descriptor.js";

/** Bounded first-video preview; streaming/composition remain separate work. */
export const MANUAL_VIDEO_MAX_BYTES = 8 * 1024 * 1024;

export interface LocalVideoPreviewRequest {
  sourceId: string;
  expectedSnapshotId: string;
  /** Together, request an ephemeral derivative of this canonical clip. */
  clipId?: string;
  operationId?: string;
}

export interface LocalVideoPreview {
  sourceId: string;
  snapshotId: string;
  durationMs: number;
  mimeType: "video/mp4" | "video/quicktime" | "video/webm";
  base64: string;
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
  if (source.technicalDescriptor.content.sizeBytes <= 0 || source.technicalDescriptor.content.sizeBytes > MANUAL_VIDEO_MAX_BYTES) {
    throw manualVideoError("MANUAL_VIDEO_TOO_LARGE");
  }
  return source as SourceAsset & { durationMs: number };
}

export class ManualVideoClipApplicationService {
  constructor(private readonly options: { history: ProjectHistory; identity: SourceContentIdentityPort; idGenerator?: () => string }) {}

  async create(request: CreateManualVideoClipRequest): Promise<{ clipId: string; project: ProjectIR }> {
    const stable = structuredClone(request);
    if (Object.keys(stable).some((key) => !["sourceId", "expectedSnapshotId", "sourceStartMs", "sourceEndMs"].includes(key))) {
      throw manualVideoError("MANUAL_VIDEO_INVALID_REQUEST");
    }
    const before = this.options.history.current;
    const source = resolveManualVideo(before, stable);
    if (!Number.isSafeInteger(stable.sourceStartMs) || !Number.isSafeInteger(stable.sourceEndMs)
      || stable.sourceStartMs < 0 || stable.sourceStartMs >= stable.sourceEndMs || stable.sourceEndMs > source.durationMs) {
      throw manualVideoError("MANUAL_VIDEO_INVALID_RANGE");
    }
    if (before.timeline.clips.length || before.captions.length || before.graphics.length) throw manualVideoError("MANUAL_VIDEO_TIMELINE_OCCUPIED");
    await this.verifySource(source);
    // Async identity work must never commit against a replaced/undone snapshot.
    resolveManualVideo(this.options.history.current, stable);
    const track = before.timeline.tracks.find((item) => item.kind === "video" && !item.locked && !item.hidden && !item.muted);
    const trackId = track?.id ?? (before.timeline.tracks.some((item) => item.id === "track-v1") ? `track-${this.nextId()}` : "track-v1");
    const clipId = `clip-${this.nextId()}`;
    const commands: EditCommand[] = [
      ...(!track ? [{ type: "track.add" as const, track: { id: trackId, kind: "video" as const, name: "V1", locked: false, hidden: false, muted: false } }] : []),
      { type: "clip.add", clip: { id: clipId, trackId, sourceId: source.id, timelineStartMs: 0, timelineEndMs: stable.sourceEndMs - stable.sourceStartMs,
        sourceStartMs: stable.sourceStartMs, sourceEndMs: stable.sourceEndMs, speed: 1, volume: 1, opacity: 1 } }
    ];
    // Validate both typed edits before recording anything. The existing journal
    // keeps track preparation explicit; one undo removes the clip, redo restores it.
    commands.reduce((project, command) => applyCommand(project, command), before);
    for (const command of commands) this.options.history.commit(command, { type: "user" });
    return { clipId, project: this.options.history.current };
  }

  async trim(request: TrimManualVideoClipRequest): Promise<{ clipId: string; project: ProjectIR }> {
    const stable = structuredClone(request);
    if (!stable || typeof stable.clipId !== "string" || !stable.clipId
      || Object.keys(stable).some((key) => !["clipId", "expectedSnapshotId", "sourceStartMs", "sourceEndMs"].includes(key))) {
      throw manualVideoError("MANUAL_VIDEO_INVALID_REQUEST");
    }
    const before = this.options.history.current;
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
    resolveManualVideo(this.options.history.current, binding);
    this.options.history.commit({ type: "clip.trim", clipId: clip.id, timelineStartMs: 0,
      timelineEndMs: stable.sourceEndMs - stable.sourceStartMs, sourceStartMs: stable.sourceStartMs, sourceEndMs: stable.sourceEndMs }, { type: "user" });
    return { clipId: clip.id, project: this.options.history.current };
  }

  private async verifySource(source: SourceAsset): Promise<void> {
    const identity = this.options.identity;
    const resolver = new SourceTechnicalDescriptorResolver({
      captureSource: async (uri, signal) => {
        const stamp = await identity.captureSource(uri, signal);
        // Reject replacement/growth before the generic resolver hashes the file.
        if (stamp.sizeBytes !== source.technicalDescriptor!.content.sizeBytes || stamp.sizeBytes > MANUAL_VIDEO_MAX_BYTES) throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
        return stamp;
      },
      identifySource: (uri, stamp, signal) => identity.identifySource(uri, stamp, signal),
      checkSource: (uri, stamp, signal) => identity.checkSource(uri, stamp, signal)
    });
    const memo = createSourceContentVerificationMemo(1);
    const verified = await resolver.verify(source, memo);
    if (verified.status !== "verified" || await resolver.revalidate(memo) !== "verified") throw manualVideoError("MANUAL_VIDEO_SOURCE_CHANGED");
  }

  private nextId(): string {
    return this.options.idGenerator?.() ?? globalThis.crypto.randomUUID();
  }
}
