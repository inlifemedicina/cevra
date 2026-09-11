import type { CaptionCue, EditCommand, ProjectIR, StyleState, TimelineClip } from "./types.js";
import { assertValidProjectIR } from "./validation.js";

export function applyCommand(project: ProjectIR, command: EditCommand, now = new Date().toISOString()): ProjectIR {
  const next = clone(project);

  switch (command.type) {
    case "project.rename":
      if (!command.name.trim()) throw new Error("Project name cannot be empty.");
      next.project.name = command.name.trim();
      break;
    case "source.add":
      rejectDuplicate(next.sources, command.source.id, "source");
      next.sources.push(clone(command.source));
      break;
    case "source.remove": {
      if (next.timeline.clips.some((clip) => clip.sourceId === command.sourceId)) throw new Error("Cannot remove a source used by timeline clips.");
      next.sources = next.sources.filter((source) => source.id !== command.sourceId);
      break;
    }
    case "track.add":
      rejectDuplicate(next.timeline.tracks, command.track.id, "track");
      next.timeline.tracks.push(clone(command.track));
      break;
    case "track.remove":
      if (next.timeline.clips.some((clip) => clip.trackId === command.trackId)) throw new Error("Cannot remove a track containing clips.");
      next.timeline.tracks = next.timeline.tracks.filter((track) => track.id !== command.trackId);
      break;
    case "clip.add":
      rejectDuplicate(next.timeline.clips, command.clip.id, "clip");
      next.timeline.clips.push(clone(command.clip));
      break;
    case "clip.remove":
      next.timeline.clips = next.timeline.clips.filter((clip) => clip.id !== command.clipId);
      break;
    case "clip.trim": {
      const clip = requireClip(next, command.clipId);
      applyTrim(clip, command);
      break;
    }
    case "caption.upsert":
      upsertCaption(next.captions, command.caption);
      break;
    case "caption.remove":
      next.captions = next.captions.filter((caption) => caption.id !== command.captionId);
      break;
    case "style.patch":
      next.style = mergeDefined(next.style, command.patch);
      break;
    default:
      assertNever(command);
  }

  next.project.updatedAt = now;
  next.timeline.durationMs = calculateTimelineDuration(next.timeline.clips);
  return assertValidProjectIR(next);
}

function applyTrim(clip: TimelineClip, command: Extract<EditCommand, { type: "clip.trim" }>): void {
  clip.timelineStartMs = command.timelineStartMs;
  clip.timelineEndMs = command.timelineEndMs;
  clip.sourceStartMs = command.sourceStartMs;
  clip.sourceEndMs = command.sourceEndMs;
}

function upsertCaption(captions: CaptionCue[], caption: CaptionCue): void {
  const index = captions.findIndex((item) => item.id === caption.id);
  if (index === -1) captions.push(clone(caption));
  else captions[index] = clone(caption);
}

function mergeDefined<T extends object>(base: T, patch: Partial<T>): T {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (next as Record<string, unknown>)[key] = clone(value);
  }
  return next;
}

function rejectDuplicate(items: Array<{ id: string }>, id: string, label: string): void {
  if (items.some((item) => item.id === id)) throw new Error(`Duplicate ${label} id ${id}.`);
}

function requireClip(project: ProjectIR, clipId: string): TimelineClip {
  const clip = project.timeline.clips.find((item) => item.id === clipId);
  if (!clip) throw new Error(`Unknown clip ${clipId}.`);
  return clip;
}

function calculateTimelineDuration(clips: TimelineClip[]): number {
  return clips.reduce((max, clip) => Math.max(max, clip.timelineEndMs), 0);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported command: ${JSON.stringify(value)}`);
}
