import { type ProjectHistory, type ProjectIR, type TimelineClip, type TimelineEditOperation } from "@cevra/project-ir";
import { type SourceContentIdentityPort } from "./source-technical-descriptor.js";
import { manualVideoError, resolveManualVideo, verifyManualVideoSource } from "./manual-video-clip.js";

interface Binding { version: 1; expectedSnapshotId: string }
interface SourceRange { sourceId: string; sourceStartMs: number; sourceEndMs: number }
export type ManualVideoSequenceEdit = Binding & (
  | ({ type: "append" } & SourceRange)
  | ({ type: "insert"; beforeClipId: string } & SourceRange)
  | { type: "duplicate"; clipId: string }
  | { type: "remove"; clipId: string }
  | { type: "trim"; clipId: string; sourceStartMs: number; sourceEndMs: number }
  | { type: "split"; clipId: string; timelineAtMs: number }
  | { type: "reorder"; clipIds: readonly string[] }
);

const fields = {
  append: ["sourceId", "sourceStartMs", "sourceEndMs"],
  insert: ["beforeClipId", "sourceId", "sourceStartMs", "sourceEndMs"],
  duplicate: ["clipId"], remove: ["clipId"],
  trim: ["clipId", "sourceStartMs", "sourceEndMs"],
  split: ["clipId", "timelineAtMs"], reorder: ["clipIds"]
} as const;
const fail = (code: string): never => { throw manualVideoError(`MANUAL_SEQUENCE_${code}`); };

export function validateManualVideoSequenceEdit(request: ManualVideoSequenceEdit): ManualVideoSequenceEdit {
  if (!request || typeof request !== "object" || Array.isArray(request)) fail("INVALID_REQUEST");
  const value = structuredClone(request);
  if (value.version !== 1 || typeof value.type !== "string" || !Object.hasOwn(fields, value.type)
    || typeof value.expectedSnapshotId !== "string" || !value.expectedSnapshotId) fail("INVALID_REQUEST");
  const allowed: readonly string[] = [...fields[value.type], "version", "type", "expectedSnapshotId"];
  if (Object.keys(value).some(key => !allowed.includes(key))) fail("INVALID_REQUEST");
  for (const key of fields[value.type]) {
    const field = (value as unknown as Record<string, unknown>)[key];
    if (key.endsWith("Ms")) { if (!Number.isSafeInteger(field)) fail("INVALID_REQUEST"); }
    else if (key === "clipIds") { if (!Array.isArray(field) || field.some(id => typeof id !== "string" || !id)) fail("INVALID_REQUEST"); }
    else if (typeof field !== "string" || !field) fail("INVALID_REQUEST");
  }
  return value;
}

/** G1 intent scope only; general Project IR continues to permit other compositions. */
export function resolveManualVideoSequence(project: Readonly<ProjectIR>, expectedSnapshotId: string): TimelineClip[] {
  if (project.history.headSnapshotId !== expectedSnapshotId) fail("STALE");
  if (project.captions.length || project.graphics.length) fail("UNSUPPORTED");
  const ordered = [...project.timeline.clips].sort((a, b) => a.timelineStartMs - b.timelineStartMs);
  const trackId = ordered[0]?.trackId;
  const track = project.timeline.tracks.find(item => item.id === trackId);
  if (ordered.length && (!track || track.kind !== "video" || track.locked || track.hidden || track.muted)) fail("UNSUPPORTED");
  let end = 0;
  for (const clip of ordered) {
    const source = resolveManualVideo(project, { sourceId: clip.sourceId, expectedSnapshotId });
    if (clip.trackId !== trackId || clip.speed !== 1 || clip.volume !== 1 || clip.opacity !== 1 || Object.keys(clip.extensions ?? {}).length
      || ![clip.timelineStartMs, clip.timelineEndMs, clip.sourceStartMs, clip.sourceEndMs].every(Number.isSafeInteger)
      || clip.timelineStartMs !== end || clip.sourceStartMs < 0 || clip.sourceStartMs >= clip.sourceEndMs || clip.sourceEndMs > source.durationMs
      || clip.timelineEndMs - clip.timelineStartMs !== clip.sourceEndMs - clip.sourceStartMs) fail("UNSUPPORTED");
    end = clip.timelineEndMs;
  }
  if (project.timeline.durationMs !== end) fail("UNSUPPORTED");
  return ordered;
}

/** Closed editorial intents compile to one existing atomic History operation. */
export class ManualVideoSequenceApplicationService {
  constructor(private readonly options: { history: ProjectHistory; identity: SourceContentIdentityPort; idGenerator?: () => string }) {}

  async edit(request: ManualVideoSequenceEdit): Promise<{ project: ProjectIR; changedClipIds: string[] }> {
    const stable = validateManualVideoSequenceEdit(request);
    const before = this.options.history.current;
    const journalIdentity = this.options.history.journalIdentity;
    const original = resolveManualVideoSequence(before, stable.expectedSnapshotId);
    let clips = structuredClone(original);
    const edits: TimelineEditOperation[] = [];
    const changedClipIds: string[] = [];
    let verifySourceId: string | undefined;
    const indexOf = (id: string) => { const index = clips.findIndex(clip => clip.id === id); if (index < 0) fail("CLIP_UNKNOWN"); return index; };
    const sourceRange = (sourceId: string, begin: number, end: number) => {
      const source = resolveManualVideo(before, { sourceId, expectedSnapshotId: stable.expectedSnapshotId });
      if (begin < 0 || begin >= end || end > source.durationMs) fail("INVALID_RANGE");
      return source;
    };
    const usedClipIds = new Set(original.map(clip => clip.id));
    const newId = () => {
      const id = `clip-${this.options.idGenerator?.() ?? globalThis.crypto.randomUUID()}`;
      if (usedClipIds.has(id)) fail("ID_COLLISION");
      usedClipIds.add(id);
      return id;
    };
    switch (stable.type) {
      case "append":
      case "insert": {
        const source = sourceRange(stable.sourceId, stable.sourceStartMs, stable.sourceEndMs);
        const index = stable.type === "insert" ? indexOf(stable.beforeClipId) : clips.length;
        let trackId = clips[0]?.trackId;
        if (!trackId) {
          trackId = before.timeline.tracks.find(track => track.kind === "video" && !track.locked && !track.hidden && !track.muted)?.id;
          if (!trackId) {
            trackId = before.timeline.tracks.some(track => track.id === "track-v1") ? `track-${this.options.idGenerator?.() ?? globalThis.crypto.randomUUID()}` : "track-v1";
            edits.push({ type: "track.add", track: { id: trackId, kind: "video", name: "V1", locked: false, hidden: false, muted: false } });
          }
        }
        const clip: TimelineClip = { id: newId(), trackId, sourceId: source.id, sourceStartMs: stable.sourceStartMs, sourceEndMs: stable.sourceEndMs,
          timelineStartMs: 0, timelineEndMs: stable.sourceEndMs - stable.sourceStartMs, speed: 1, volume: 1, opacity: 1 };
        clips.splice(index, 0, clip); changedClipIds.push(clip.id); verifySourceId = source.id;
        break;
      }
      case "duplicate": {
        const index = indexOf(stable.clipId);
        const clip = { ...clips[index]!, id: newId() };
        clips.splice(index + 1, 0, clip); changedClipIds.push(clip.id); verifySourceId = clip.sourceId;
        break;
      }
      case "remove": {
        const [clip] = clips.splice(indexOf(stable.clipId), 1);
        edits.push({ type: "clip.remove", clipId: clip!.id }); changedClipIds.push(clip!.id);
        break;
      }
      case "trim": {
        const clip = clips[indexOf(stable.clipId)]!;
        sourceRange(clip.sourceId, stable.sourceStartMs, stable.sourceEndMs);
        clip.sourceStartMs = stable.sourceStartMs; clip.sourceEndMs = stable.sourceEndMs;
        verifySourceId = clip.sourceId;
        break;
      }
      case "split": {
        const index = indexOf(stable.clipId); const clip = clips[index]!;
        if (stable.timelineAtMs <= clip.timelineStartMs || stable.timelineAtMs >= clip.timelineEndMs) fail("INVALID_RANGE");
        const sourceAtMs = clip.sourceStartMs + (stable.timelineAtMs - clip.timelineStartMs);
        const right = { ...clip, id: newId(), sourceStartMs: sourceAtMs };
        clip.sourceEndMs = sourceAtMs;
        clips.splice(index + 1, 0, right); verifySourceId = clip.sourceId;
        break;
      }
      case "reorder": {
        if (stable.clipIds.length !== clips.length || new Set(stable.clipIds).size !== clips.length) fail("INVALID_ORDER");
        const byId = new Map(clips.map(clip => [clip.id, clip]));
        clips = stable.clipIds.map(id => byId.get(id) ?? fail("INVALID_ORDER"));
        break;
      }
    }
    const byId = new Map(original.map(clip => [clip.id, clip]));
    let timelineStartMs = 0;
    for (const clip of clips) {
      const durationMs = clip.sourceEndMs - clip.sourceStartMs;
      if (!Number.isSafeInteger(timelineStartMs + durationMs)) fail("INVALID_RANGE");
      clip.timelineStartMs = timelineStartMs; clip.timelineEndMs = timelineStartMs + durationMs;
      timelineStartMs = clip.timelineEndMs;
      const previous = byId.get(clip.id);
      if (!previous) edits.push({ type: "clip.add", clip });
      else if (previous.timelineStartMs !== clip.timelineStartMs || previous.timelineEndMs !== clip.timelineEndMs
        || previous.sourceStartMs !== clip.sourceStartMs || previous.sourceEndMs !== clip.sourceEndMs) {
        edits.push({ type: "clip.trim", clipId: clip.id, timelineStartMs: clip.timelineStartMs, timelineEndMs: clip.timelineEndMs,
          sourceStartMs: clip.sourceStartMs, sourceEndMs: clip.sourceEndMs });
      } else continue;
      if (!changedClipIds.includes(clip.id)) changedClipIds.push(clip.id);
    }
    if (!edits.length) return { project: before, changedClipIds: [] };
    if (verifySourceId) await verifyManualVideoSource(resolveManualVideo(before, { sourceId: verifySourceId, expectedSnapshotId: stable.expectedSnapshotId }), this.options.identity);
    if (this.options.history.journalIdentity !== journalIdentity) fail("STALE");
    resolveManualVideoSequence(this.options.history.current, stable.expectedSnapshotId);
    this.options.history.commit({ type: "timeline.edit", version: 1, edits }, { type: "user" });
    return { project: this.options.history.current, changedClipIds };
  }
}
