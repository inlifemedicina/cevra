import type { ProjectHistory, SourceAsset, TimelineClip } from "@cevra/project-ir";
import { manualVideoError, verifyManualVideoSources } from "./manual-video-clip.js";
import { resolveManualVideoSequence } from "./manual-video-sequence.js";
import type { SourceContentIdentityPort } from "./source-technical-descriptor.js";

export interface ManualSequencePreviewRequest { version: 1; expectedSnapshotId: string }

/** Host-only preparation; paths and this plan are never editing/IPC input. */
export interface ManualSequencePreviewPlan {
  readonly version: 1;
  readonly projectId: string;
  readonly snapshotId: string;
  readonly durationMs: number;
  readonly sources: readonly Readonly<SourceAsset>[];
  readonly clips: readonly Readonly<TimelineClip>[];
}

export interface ManualSequencePreviewPosition {
  clipId: string;
  sourceId: string;
  sourceTimeMs: number;
}

/** Read-only canonical sequence binding, independent of the pending frame policy. */
export class ManualSequencePreviewApplicationService {
  private readonly prepared = new WeakMap<ManualSequencePreviewPlan, string>();
  constructor(private readonly options: { history: ProjectHistory; identity: SourceContentIdentityPort }) {}

  async prepare(request: ManualSequencePreviewRequest, signal?: AbortSignal): Promise<ManualSequencePreviewPlan> {
    if (!request || typeof request !== "object" || Array.isArray(request)
      || Object.keys(request).some(key => !["version", "expectedSnapshotId"].includes(key))
      || request.version !== 1 || typeof request.expectedSnapshotId !== "string" || !request.expectedSnapshotId) {
      throw manualVideoError("MANUAL_SEQUENCE_INVALID_REQUEST");
    }
    const stable = structuredClone(request);
    signal?.throwIfAborted();
    const journal = this.options.history.journalIdentity;
    const project = this.options.history.current;
    const clips = resolveManualVideoSequence(project, stable.expectedSnapshotId);
    if (!clips.length) throw manualVideoError("MANUAL_SEQUENCE_UNSUPPORTED");
    const sourceIds = new Set(clips.map(clip => clip.sourceId));
    const sources = project.sources.filter(source => sourceIds.has(source.id));
    await verifyManualVideoSources(sources, this.options.identity, signal);
    signal?.throwIfAborted();
    if (journal !== this.options.history.journalIdentity) throw manualVideoError("MANUAL_SEQUENCE_STALE");
    resolveManualVideoSequence(this.options.history.current, stable.expectedSnapshotId);
    const plan: ManualSequencePreviewPlan = freeze(structuredClone({ version: 1 as const, projectId: project.project.id,
      snapshotId: stable.expectedSnapshotId, durationMs: project.timeline.durationMs, sources, clips }));
    this.prepared.set(plan, journal);
    return plan;
  }

  /** State check only; the Host must separately admit rendered bytes and source identity. */
  assertCurrent(plan: ManualSequencePreviewPlan): void {
    const journal = this.prepared.get(plan);
    if (journal === undefined || journal !== this.options.history.journalIdentity) throw manualVideoError("MANUAL_SEQUENCE_STALE");
    resolveManualVideoSequence(this.options.history.current, plan.snapshotId);
  }

  /** Half-open program intervals: a join belongs to the next clip; OUT has no frame. */
  position(plan: ManualSequencePreviewPlan, timelineMs: number): ManualSequencePreviewPosition | null {
    this.assertCurrent(plan);
    if (!Number.isSafeInteger(timelineMs) || timelineMs < 0 || timelineMs > plan.durationMs) throw manualVideoError("MANUAL_SEQUENCE_INVALID_RANGE");
    if (timelineMs === plan.durationMs) return null;
    let first = 0, end = plan.clips.length;
    while (first < end) {
      const middle = Math.floor((first + end) / 2);
      if (plan.clips[middle]!.timelineEndMs <= timelineMs) first = middle + 1;
      else end = middle;
    }
    const clip = plan.clips[first]!;
    return { clipId: clip.id, sourceId: clip.sourceId, sourceTimeMs: clip.sourceStartMs + (timelineMs - clip.timelineStartMs) };
  }
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
