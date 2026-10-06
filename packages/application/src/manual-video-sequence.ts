import { framesToMilliseconds, nearestMsToFrames, frameTimingMilliseconds, isCfr30Frame, validateClipFrameTiming,
  type ClipFrameTimingV1, type ProjectHistory, type ProjectIR, type TimelineClip, type TimelineEditOperation, type TimelineEditOperationV2 } from "@cevra/project-ir";
import { type SourceContentIdentityPort } from "./source-technical-descriptor.js";
import { manualVideoError, resolveManualVideo, verifyManualVideoSource } from "./manual-video-clip.js";

interface Binding { version: 1; expectedSnapshotId: string }
interface SourceRange { sourceId: string; sourceStartMs: number; sourceEndMs: number }
export type ManualVideoSequenceEditV1 = Binding & (
  | ({ type: "append" } & SourceRange)
  | ({ type: "insert"; beforeClipId: string } & SourceRange)
  | { type: "duplicate"; clipId: string }
  | { type: "remove"; clipId: string }
  | { type: "remove-many"; clipIds: readonly string[] }
  | { type: "trim"; clipId: string; sourceStartMs: number; sourceEndMs: number }
  | { type: "split"; clipId: string; timelineAtMs: number }
  | { type: "reorder"; clipIds: readonly string[] }
);

export type ManualVideoSequenceEditV2 = { version: 2; expectedSnapshotId: string } & (
  | { type: "append"; sourceId: string; sourceStartFrame: number; sourceEndFrame: number }
  | { type: "insert"; beforeClipId: string; sourceId: string; sourceStartFrame: number; sourceEndFrame: number }
  | { type: "duplicate"; clipId: string }
  | { type: "remove"; clipId: string }
  | { type: "remove-many"; clipIds: readonly string[] }
  | { type: "trim"; clipId: string; sourceStartFrame: number; sourceEndFrame: number }
  | { type: "split"; clipId: string; timelineAtFrame: number }
  | { type: "reorder"; clipIds: readonly string[] }
  | { type: "conform"; clips: readonly { clipId: string; sourceStartFrame: number; sourceEndFrame: number }[] }
);
export type ManualVideoSequenceEdit = ManualVideoSequenceEditV1 | ManualVideoSequenceEditV2;

export interface ManualVideoSequenceConformBoundary {
  originalMs: number; nearestFrame: number; frame: number; projectedMs: number; deltaMs: number;
}
export interface ManualVideoSequenceConformPreview {
  version: 1;
  expectedSnapshotId: string;
  canConform: boolean;
  clips: {
    clipId: string; sourceId: string; frameTiming: ClipFrameTimingV1; collapsed: boolean; sourceOutOfBounds: boolean;
    boundaries: Record<"timelineStart" | "timelineEnd" | "sourceStart" | "sourceEnd", ManualVideoSequenceConformBoundary>;
  }[];
}

const fields = {
  append: ["sourceId", "sourceStartMs", "sourceEndMs"],
  insert: ["beforeClipId", "sourceId", "sourceStartMs", "sourceEndMs"],
  duplicate: ["clipId"], remove: ["clipId"], "remove-many": ["clipIds"],
  trim: ["clipId", "sourceStartMs", "sourceEndMs"],
  split: ["clipId", "timelineAtMs"], reorder: ["clipIds"]
} as const;
const frameFields = {
  append: ["sourceId", "sourceStartFrame", "sourceEndFrame"], insert: ["beforeClipId", "sourceId", "sourceStartFrame", "sourceEndFrame"],
  duplicate: ["clipId"], remove: ["clipId"], "remove-many": ["clipIds"], trim: ["clipId", "sourceStartFrame", "sourceEndFrame"],
  split: ["clipId", "timelineAtFrame"], reorder: ["clipIds"], conform: ["clips"]
} as const;
const fail = (code: string): never => { throw manualVideoError(`MANUAL_SEQUENCE_${code}`); };

export function validateManualVideoSequenceEdit(request: unknown): ManualVideoSequenceEdit {
  if (!request || typeof request !== "object" || Array.isArray(request)) fail("INVALID_REQUEST");
  let value: Record<string, unknown>;
  try { value = structuredClone(request) as Record<string, unknown>; } catch { return fail("INVALID_REQUEST"); }
  const schema: Record<string, readonly string[]> = value.version === 1 ? fields : frameFields;
  if (![1, 2].includes(value.version as number) || typeof value.type !== "string" || !Object.hasOwn(schema, value.type)
    || typeof value.expectedSnapshotId !== "string" || !value.expectedSnapshotId) fail("INVALID_REQUEST");
  const selected = schema[value.type as string]!;
  const allowed: readonly string[] = [...selected, "version", "type", "expectedSnapshotId"];
  if (Object.keys(value).some(key => !allowed.includes(key))) fail("INVALID_REQUEST");
  for (const key of selected) {
    const field = (value as unknown as Record<string, unknown>)[key];
    if (key.endsWith("Ms")) { if (!Number.isSafeInteger(field)) fail("INVALID_REQUEST"); }
    else if (key.endsWith("Frame")) { if (!isCfr30Frame(field)) fail("INVALID_REQUEST"); }
    else if (key === "clipIds") { if (!Array.isArray(field) || field.some(id => typeof id !== "string" || !id)) fail("INVALID_REQUEST"); }
    else if (key === "clips") {
      if (!Array.isArray(field) || field.some(clip => !clip || typeof clip !== "object" || Array.isArray(clip)
        || Object.keys(clip).length !== 3 || Object.keys(clip).some(key => !["clipId", "sourceStartFrame", "sourceEndFrame"].includes(key))
        || typeof clip.clipId !== "string" || !clip.clipId || !isCfr30Frame(clip.sourceStartFrame) || !isCfr30Frame(clip.sourceEndFrame))) fail("INVALID_REQUEST");
    }
    else if (typeof field !== "string" || !field) fail("INVALID_REQUEST");
  }
  return value as unknown as ManualVideoSequenceEdit;
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
  const grid = project.timeline.timingPolicy === "cfr30";
  for (const clip of ordered) {
    const source = resolveManualVideo(project, { sourceId: clip.sourceId, expectedSnapshotId });
    if (clip.trackId !== trackId || clip.speed !== 1 || clip.volume !== 1 || clip.opacity !== 1 || Object.keys(clip.extensions ?? {}).length
      || clip.sourceStartMs < 0 || clip.sourceStartMs >= clip.sourceEndMs || clip.sourceEndMs > source.durationMs) fail("UNSUPPORTED");
    if (grid) {
      const timing = validateClipFrameTiming(clip.frameTiming);
      if (!timing.ok) return fail("UNSUPPORTED");
      if (Object.entries(frameTimingMilliseconds(timing.value)).some(([key, value]) => clip[key as keyof TimelineClip] !== value)
        || timing.value.timelineStartFrame !== end
        || timing.value.timelineEndFrame - timing.value.timelineStartFrame !== timing.value.sourceEndFrame - timing.value.sourceStartFrame) fail("UNSUPPORTED");
      end = timing.value.timelineEndFrame;
    } else {
      if (clip.frameTiming !== undefined || ![clip.timelineStartMs, clip.timelineEndMs, clip.sourceStartMs, clip.sourceEndMs].every(Number.isSafeInteger)
        || clip.timelineStartMs !== end || clip.timelineEndMs - clip.timelineStartMs !== clip.sourceEndMs - clip.sourceStartMs) fail("UNSUPPORTED");
      end = clip.timelineEndMs;
    }
  }
  if (project.timeline.durationMs !== (grid ? framesToMilliseconds(end) : end)) fail("UNSUPPORTED");
  return ordered;
}

/** Closed editorial intents compile to one existing atomic History operation. */
export class ManualVideoSequenceApplicationService {
  constructor(private readonly options: { history: ProjectHistory; identity: SourceContentIdentityPort; idGenerator?: () => string }) {}

  async edit(request: ManualVideoSequenceEdit): Promise<{ project: ProjectIR; changedClipIds: string[] }> {
    const stable = validateManualVideoSequenceEdit(request);
    if (stable.version === 2) return this.editFrames(stable);
    if (this.options.history.current.timeline.timingPolicy !== "legacy-milliseconds") fail("UNSUPPORTED");
    return this.editLegacy(stable);
  }

  previewConform(expectedSnapshotId: string): ManualVideoSequenceConformPreview {
    const project = this.options.history.current;
    if (project.timeline.timingPolicy !== "legacy-milliseconds") fail("UNSUPPORTED");
    const original = resolveManualVideoSequence(project, expectedSnapshotId);
    let cursor = 0;
    const clips = original.map(clip => {
      const sourceStartFrame = nearestMsToFrames(clip.sourceStartMs), sourceEndFrame = nearestMsToFrames(clip.sourceEndMs);
      const timelineEndFrame = cursor + sourceEndFrame - sourceStartFrame;
      if (!isCfr30Frame(timelineEndFrame)) fail("INVALID_RANGE");
      const frameTiming: ClipFrameTimingV1 = { version: 1, timelineStartFrame: cursor, timelineEndFrame, sourceStartFrame, sourceEndFrame };
      cursor = timelineEndFrame;
      const source = resolveManualVideo(project, { sourceId: clip.sourceId, expectedSnapshotId });
      const boundary = (originalMs: number, frame: number): ManualVideoSequenceConformBoundary => {
        const projectedMs = framesToMilliseconds(frame);
        return { originalMs, nearestFrame: nearestMsToFrames(originalMs), frame, projectedMs, deltaMs: projectedMs - originalMs };
      };
      return {
        clipId: clip.id, sourceId: clip.sourceId, frameTiming,
        collapsed: sourceStartFrame === sourceEndFrame,
        sourceOutOfBounds: framesToMilliseconds(sourceEndFrame) > source.durationMs,
        boundaries: {
          timelineStart: boundary(clip.timelineStartMs, frameTiming.timelineStartFrame),
          timelineEnd: boundary(clip.timelineEndMs, frameTiming.timelineEndFrame),
          sourceStart: boundary(clip.sourceStartMs, sourceStartFrame), sourceEnd: boundary(clip.sourceEndMs, sourceEndFrame)
        }
      };
    });
    return { version: 1, expectedSnapshotId, clips, canConform: clips.every(clip => !clip.collapsed && !clip.sourceOutOfBounds) };
  }

  private async editFrames(stable: ManualVideoSequenceEditV2): Promise<{ project: ProjectIR; changedClipIds: string[] }> {
    const before = this.options.history.current, journalIdentity = this.options.history.journalIdentity;
    const original = resolveManualVideoSequence(before, stable.expectedSnapshotId);
    const legacy = before.timeline.timingPolicy === "legacy-milliseconds";
    if (stable.type === "conform" ? !legacy : legacy && !(original.length === 0 && stable.type === "append")) fail("CONFORM_REQUIRED");
    let clips = structuredClone(original);
    const edits: TimelineEditOperationV2[] = legacy ? [{ type: "timeline.timingPolicy.set", timingPolicy: "cfr30" }] : [];
    const changedClipIds: string[] = [], verifySources = new Set<string>(), usedIds = new Set(original.map(clip => clip.id));
    const indexOf = (id: string) => { const index = clips.findIndex(clip => clip.id === id); if (index < 0) fail("CLIP_UNKNOWN"); return index; };
    const newId = () => {
      const id = `clip-${this.options.idGenerator?.() ?? globalThis.crypto.randomUUID()}`;
      if (usedIds.has(id)) fail("ID_COLLISION");
      usedIds.add(id); return id;
    };
    const range = (sourceId: string, begin: number, end: number) => {
      const source = resolveManualVideo(before, { sourceId, expectedSnapshotId: stable.expectedSnapshotId });
      if (!isCfr30Frame(begin) || !isCfr30Frame(end) || begin >= end || framesToMilliseconds(end) > source.durationMs) fail("INVALID_RANGE");
      return source;
    };
    const timing = (clip: TimelineClip) => clip.frameTiming ?? fail("UNSUPPORTED");
    switch (stable.type) {
      case "conform": {
        const reviewed = new Map(stable.clips.map(clip => [clip.clipId, clip]));
        if (reviewed.size !== original.length || stable.clips.length !== original.length || original.some(clip => !reviewed.has(clip.id))) fail("INVALID_CONFORM");
        for (const clip of clips) {
          const review = reviewed.get(clip.id)!;
          range(clip.sourceId, review.sourceStartFrame, review.sourceEndFrame);
          clip.frameTiming = { version: 1, timelineStartFrame: 0, timelineEndFrame: review.sourceEndFrame - review.sourceStartFrame,
            sourceStartFrame: review.sourceStartFrame, sourceEndFrame: review.sourceEndFrame };
          verifySources.add(clip.sourceId);
        }
        break;
      }
      case "append":
      case "insert": {
        const source = range(stable.sourceId, stable.sourceStartFrame, stable.sourceEndFrame);
        const index = stable.type === "insert" ? indexOf(stable.beforeClipId) : clips.length;
        let trackId = clips[0]?.trackId ?? before.timeline.tracks.find(track => track.kind === "video" && !track.locked && !track.hidden && !track.muted)?.id;
        if (!trackId) {
          trackId = before.timeline.tracks.some(track => track.id === "track-v1") ? `track-${this.options.idGenerator?.() ?? globalThis.crypto.randomUUID()}` : "track-v1";
          edits.push({ type: "track.add", track: { id: trackId, kind: "video", name: "V1", locked: false, hidden: false, muted: false } });
        }
        const frameTiming: ClipFrameTimingV1 = { version: 1, timelineStartFrame: 0, timelineEndFrame: stable.sourceEndFrame - stable.sourceStartFrame,
          sourceStartFrame: stable.sourceStartFrame, sourceEndFrame: stable.sourceEndFrame };
        const clip: TimelineClip = { id: newId(), trackId, sourceId: source.id, frameTiming, ...frameTimingMilliseconds(frameTiming), speed: 1, volume: 1, opacity: 1 };
        clips.splice(index, 0, clip); verifySources.add(source.id); break;
      }
      case "duplicate": {
        const index = indexOf(stable.clipId), clip = structuredClone(clips[index]!);
        clip.id = newId(); clips.splice(index + 1, 0, clip); verifySources.add(clip.sourceId); break;
      }
      case "remove": {
        const [clip] = clips.splice(indexOf(stable.clipId), 1);
        edits.push({ type: "clip.remove", clipId: clip!.id }); changedClipIds.push(clip!.id); break;
      }
      case "remove-many": {
        if (!stable.clipIds.length || stable.clipIds.length > clips.length) fail("INVALID_SELECTION");
        const selected = new Set(stable.clipIds);
        if (!selected.size || selected.size !== stable.clipIds.length) fail("INVALID_SELECTION");
        for (const id of selected) indexOf(id);
        for (const clip of clips) if (selected.has(clip.id)) {
          edits.push({ type: "clip.remove", clipId: clip.id }); changedClipIds.push(clip.id);
        }
        clips = clips.filter(clip => !selected.has(clip.id));
        break;
      }
      case "trim": {
        const clip = clips[indexOf(stable.clipId)]!;
        range(clip.sourceId, stable.sourceStartFrame, stable.sourceEndFrame);
        Object.assign(timing(clip), { sourceStartFrame: stable.sourceStartFrame, sourceEndFrame: stable.sourceEndFrame });
        verifySources.add(clip.sourceId); break;
      }
      case "split": {
        const index = indexOf(stable.clipId), clip = clips[index]!, leftTiming = timing(clip);
        if (stable.timelineAtFrame <= leftTiming.timelineStartFrame || stable.timelineAtFrame >= leftTiming.timelineEndFrame) fail("INVALID_RANGE");
        const sourceAt = leftTiming.sourceStartFrame + stable.timelineAtFrame - leftTiming.timelineStartFrame;
        const right = structuredClone(clip); right.id = newId(); timing(right).sourceStartFrame = sourceAt;
        leftTiming.sourceEndFrame = sourceAt; clips.splice(index + 1, 0, right); verifySources.add(clip.sourceId); break;
      }
      case "reorder": {
        if (stable.clipIds.length !== clips.length || new Set(stable.clipIds).size !== clips.length) fail("INVALID_ORDER");
        const byId = new Map(clips.map(clip => [clip.id, clip])); clips = stable.clipIds.map(id => byId.get(id) ?? fail("INVALID_ORDER")); break;
      }
    }
    const previous = new Map(original.map(clip => [clip.id, clip]));
    let cursor = 0;
    for (const clip of clips) {
      const frame = timing(clip), end = cursor + frame.sourceEndFrame - frame.sourceStartFrame;
      if (!isCfr30Frame(end) || end <= cursor) fail("INVALID_RANGE");
      frame.timelineStartFrame = cursor; frame.timelineEndFrame = end; cursor = end;
      Object.assign(clip, frameTimingMilliseconds(frame));
      const old = previous.get(clip.id);
      if (!old) edits.push({ type: "clip.add", clip });
      else if (JSON.stringify(old.frameTiming) !== JSON.stringify(frame)) edits.push({ type: "clip.frameTiming.set", clipId: clip.id, frameTiming: frame });
      else continue;
      if (!changedClipIds.includes(clip.id)) changedClipIds.push(clip.id);
    }
    if (!edits.length) return { project: before, changedClipIds: [] };
    for (const sourceId of verifySources) await verifyManualVideoSource(resolveManualVideo(before, { sourceId, expectedSnapshotId: stable.expectedSnapshotId }), this.options.identity);
    if (this.options.history.journalIdentity !== journalIdentity) fail("STALE");
    resolveManualVideoSequence(this.options.history.current, stable.expectedSnapshotId);
    this.options.history.commit({ type: "timeline.edit", version: 2, edits }, { type: "user" });
    return { project: this.options.history.current, changedClipIds };
  }

  private async editLegacy(stable: ManualVideoSequenceEditV1): Promise<{ project: ProjectIR; changedClipIds: string[] }> {
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
      case "remove-many": {
        if (!stable.clipIds.length || stable.clipIds.length > clips.length) fail("INVALID_SELECTION");
        const selected = new Set(stable.clipIds);
        if (!selected.size || selected.size !== stable.clipIds.length) fail("INVALID_SELECTION");
        for (const id of selected) indexOf(id);
        for (const clip of clips) if (selected.has(clip.id)) {
          edits.push({ type: "clip.remove", clipId: clip.id }); changedClipIds.push(clip.id);
        }
        clips = clips.filter(clip => !selected.has(clip.id));
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
