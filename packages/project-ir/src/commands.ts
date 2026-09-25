import type { CaptionCue, EditCommand, ProjectIR, SourceTechnicalDescriptorV1, SourceTranscript, StyleState, TimelineClip, TranscriptProvenanceStage } from "./types.js";
import { computeTranscriptDigest } from "./transcript-digest.js";
import { assertValidProjectIR, validateProjectIR } from "./validation.js";

export type ProjectCommandErrorCode =
  | "PROJECT_TRANSCRIPT_INVALID"
  | "PROJECT_TRANSCRIPT_SOURCE_UNKNOWN"
  | "PROJECT_TRANSCRIPT_SOURCE_INELIGIBLE"
  | "PROJECT_TRANSCRIPT_ALREADY_EXISTS"
  | "PROJECT_TRANSCRIPT_MISSING"
  | "PROJECT_TRANSCRIPT_DIGEST_MISMATCH"
  | "PROJECT_TRANSCRIPT_STALE"
  | "PROJECT_TRANSCRIPT_NO_OP"
  | "PROJECT_SOURCE_DESCRIPTOR_INVALID"
  | "PROJECT_SOURCE_DESCRIPTOR_SOURCE_UNKNOWN"
  | "PROJECT_SOURCE_DESCRIPTOR_SOURCE_INELIGIBLE"
  | "PROJECT_SOURCE_DESCRIPTOR_URI_MISMATCH"
  | "PROJECT_SOURCE_DESCRIPTOR_STALE"
  | "PROJECT_SOURCE_DESCRIPTOR_CONTENT_MISMATCH"
  | "PROJECT_SOURCE_DESCRIPTOR_BASIS_MISMATCH"
  | "PROJECT_SOURCE_DESCRIPTOR_NO_OP";

export class ProjectCommandError extends Error {
  readonly code: ProjectCommandErrorCode;

  constructor(code: ProjectCommandErrorCode, message: string) {
    super(message);
    this.name = "ProjectCommandError";
    this.code = code;
  }
}

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
      if (!next.sources.some((source) => source.id === command.sourceId)) throw new Error(`Unknown source ${command.sourceId}.`);
      if (next.timeline.clips.some((clip) => clip.sourceId === command.sourceId)) throw new Error("Cannot remove a source used by timeline clips.");
      if (next.graphics.some((graphic) => graphic.sourceId === command.sourceId)) throw new Error("Cannot remove a source used by graphics.");
      if (next.generation.some((record) => record.outputSourceIds.includes(command.sourceId))) throw new Error("Cannot remove a source referenced by generation history.");
      next.sources = next.sources.filter((source) => source.id !== command.sourceId);
      next.sourceTranscripts = next.sourceTranscripts.filter((transcript) => transcript.sourceId !== command.sourceId);
      break;
    }
    case "source.technicalDescriptor.set":
      applySourceTechnicalDescriptorSet(next, command);
      break;
    case "transcript.set":
      applyTranscriptSet(next, command);
      break;
    case "transcript.remove":
      applyTranscriptRemove(next, command);
      break;
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
    case "export.add":
      rejectDuplicate(next.exports, command.export.id, "export");
      next.exports.push(clone(command.export));
      break;
    default:
      assertNever(command);
  }

  next.project.updatedAt = now;
  next.timeline.durationMs = calculateTimelineDuration(next.timeline.clips);
  return assertValidProjectIR(next);
}

function applySourceTechnicalDescriptorSet(
  project: ProjectIR,
  command: Extract<EditCommand, { type: "source.technicalDescriptor.set" }>
): void {
  if (typeof command.sourceId !== "string" || command.sourceId.trim().length === 0
    || typeof command.expectedSourceUri !== "string" || command.expectedSourceUri.length === 0
    || !isRecord(command.expectedTechnicalDescriptor)
    || (command.expectedTechnicalDescriptor.state !== "absent" && command.expectedTechnicalDescriptor.state !== "value")) {
    throwSourceDescriptorError("PROJECT_SOURCE_DESCRIPTOR_INVALID", "Source technical descriptor command is invalid.");
  }
  const source = project.sources.find((item) => item.id === command.sourceId);
  if (!source) throwSourceDescriptorError("PROJECT_SOURCE_DESCRIPTOR_SOURCE_UNKNOWN", `Unknown source ${command.sourceId}.`);
  if (source.kind !== "audio" && source.kind !== "video") {
    throwSourceDescriptorError("PROJECT_SOURCE_DESCRIPTOR_SOURCE_INELIGIBLE", `Source ${source.id} cannot own a V1 technical descriptor.`);
  }
  if (source.uri !== command.expectedSourceUri) {
    throwSourceDescriptorError("PROJECT_SOURCE_DESCRIPTOR_URI_MISMATCH", "Expected source URI is no longer current.");
  }

  const current = source.technicalDescriptor;
  if (command.expectedTechnicalDescriptor.state === "absent") {
    if (current !== undefined) throwSourceDescriptorError("PROJECT_SOURCE_DESCRIPTOR_STALE", "Expected source technical descriptor is no longer absent.");
  } else {
    if (!("value" in command.expectedTechnicalDescriptor) || current === undefined
      || !deepEqual(current, command.expectedTechnicalDescriptor.value)) {
      throwSourceDescriptorError("PROJECT_SOURCE_DESCRIPTOR_STALE", "Expected source technical descriptor is no longer current.");
    }
  }

  let candidate: SourceTechnicalDescriptorV1;
  try {
    candidate = clone(command.technicalDescriptor);
  } catch {
    throwSourceDescriptorError("PROJECT_SOURCE_DESCRIPTOR_INVALID", "Source technical descriptor must be serializable Project IR data.");
  }
  const validation = validateProjectIR({
    ...project,
    sources: project.sources.map((item) => item.id === source.id ? { ...item, technicalDescriptor: candidate } : item)
  });
  if (!validation.ok) {
    throwSourceDescriptorError("PROJECT_SOURCE_DESCRIPTOR_INVALID", "Source technical descriptor candidate is invalid.");
  }

  if (current === undefined) {
    if (candidate.basis !== "post-ingest") {
      throwSourceDescriptorError("PROJECT_SOURCE_DESCRIPTOR_BASIS_MISMATCH", "First command adoption must use post-ingest basis.");
    }
  } else {
    if (candidate.basis !== current.basis) {
      throwSourceDescriptorError("PROJECT_SOURCE_DESCRIPTOR_BASIS_MISMATCH", "Source technical descriptor basis is immutable.");
    }
    if (!deepEqual(candidate.content, current.content)) {
      throwSourceDescriptorError("PROJECT_SOURCE_DESCRIPTOR_CONTENT_MISMATCH", "A source technical descriptor cannot replace the adopted content identity.");
    }
    if (deepEqual(candidate, current)) {
      throwSourceDescriptorError("PROJECT_SOURCE_DESCRIPTOR_NO_OP", "Source technical descriptor is identical to the current evidence.");
    }
  }
  source.technicalDescriptor = candidate;
}

function applyTranscriptSet(project: ProjectIR, command: Extract<EditCommand, { type: "transcript.set" }>): void {
  const rawCandidate: unknown = command.transcript;
  if (!isRecord(rawCandidate) || typeof rawCandidate.sourceId !== "string" || rawCandidate.sourceId.trim().length === 0) {
    throwTranscriptError("PROJECT_TRANSCRIPT_INVALID", "Transcript candidate must identify a valid source.");
  }

  const source = project.sources.find((item) => item.id === rawCandidate.sourceId);
  if (!source) throwTranscriptError("PROJECT_TRANSCRIPT_SOURCE_UNKNOWN", `Unknown transcript source ${rawCandidate.sourceId}.`);
  if (source.kind !== "audio" && source.kind !== "video") {
    throwTranscriptError("PROJECT_TRANSCRIPT_SOURCE_INELIGIBLE", `Source ${source.id} cannot own a transcript.`);
  }

  const candidate = rawCandidate as unknown as SourceTranscript;
  let recomputedDigest: SourceTranscript["transcriptDigest"];
  try {
    recomputedDigest = computeTranscriptDigest(candidate);
  } catch {
    throwTranscriptError("PROJECT_TRANSCRIPT_INVALID", "Transcript candidate semantic content is invalid.");
  }
  if (candidate.transcriptDigest !== recomputedDigest) {
    throwTranscriptError("PROJECT_TRANSCRIPT_DIGEST_MISMATCH", "Transcript candidate digest does not match its semantic content.");
  }
  if (candidate.wordTiming === "unknown") {
    throwTranscriptError("PROJECT_TRANSCRIPT_INVALID", "Migration-only unknown word timing cannot be set by a command.");
  }

  const currentIndex = project.sourceTranscripts.findIndex((item) => item.sourceId === candidate.sourceId);
  const current = currentIndex === -1 ? undefined : project.sourceTranscripts[currentIndex];
  let candidateCopy: SourceTranscript;
  try {
    candidateCopy = clone(candidate);
  } catch {
    throwTranscriptError("PROJECT_TRANSCRIPT_INVALID", "Transcript candidate must be serializable Project IR data.");
  }
  const candidateTranscripts = [...project.sourceTranscripts];
  if (currentIndex === -1) candidateTranscripts.push(candidateCopy);
  else candidateTranscripts[currentIndex] = candidateCopy;
  const validation = validateProjectIR({ ...project, sourceTranscripts: candidateTranscripts });
  if (!validation.ok) {
    const detail = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
    throwTranscriptError("PROJECT_TRANSCRIPT_INVALID", `Transcript candidate is invalid:\n${detail}`);
  }

  const finalStage = candidate.provenance.stages[candidate.provenance.stages.length - 1];
  if (!current) {
    if (command.expectedCurrentTranscriptDigest !== undefined) {
      throwTranscriptError("PROJECT_TRANSCRIPT_STALE", "Expected transcript no longer exists.");
    }
    if (isConsumingTranscriptStage(finalStage)) {
      throwTranscriptError("PROJECT_TRANSCRIPT_STALE", "Transcript candidate has no current canonical input to consume.");
    }
    project.sourceTranscripts = candidateTranscripts;
    return;
  }

  if (command.expectedCurrentTranscriptDigest === undefined) {
    throwTranscriptError("PROJECT_TRANSCRIPT_ALREADY_EXISTS", `Source ${source.id} already owns a canonical transcript.`);
  }
  if (command.expectedCurrentTranscriptDigest !== current.transcriptDigest) {
    throwTranscriptError("PROJECT_TRANSCRIPT_STALE", "Expected transcript digest is not current.");
  }
  if (deepEqual(candidateCopy, current)) {
    throwTranscriptError("PROJECT_TRANSCRIPT_NO_OP", "Transcript candidate is identical to the current aggregate.");
  }

  if (candidate.transcriptDigest !== current.transcriptDigest
    && isConsumingTranscriptStage(finalStage)
    && finalStage.inputTranscriptDigest !== current.transcriptDigest) {
    throwTranscriptError("PROJECT_TRANSCRIPT_STALE", "Transcript candidate was produced from a stale canonical transcript.");
  }
  project.sourceTranscripts = candidateTranscripts;
}

function applyTranscriptRemove(project: ProjectIR, command: Extract<EditCommand, { type: "transcript.remove" }>): void {
  const source = project.sources.find((item) => item.id === command.sourceId);
  if (!source) throwTranscriptError("PROJECT_TRANSCRIPT_SOURCE_UNKNOWN", `Unknown transcript source ${command.sourceId}.`);
  if (source.kind !== "audio" && source.kind !== "video") {
    throwTranscriptError("PROJECT_TRANSCRIPT_SOURCE_INELIGIBLE", `Source ${source.id} cannot own a transcript.`);
  }
  const current = project.sourceTranscripts.find((item) => item.sourceId === source.id);
  if (!current) throwTranscriptError("PROJECT_TRANSCRIPT_MISSING", `Source ${source.id} has no canonical transcript.`);
  if (command.expectedTranscriptDigest !== current.transcriptDigest) {
    throwTranscriptError("PROJECT_TRANSCRIPT_STALE", "Expected transcript digest is not current.");
  }
  project.sourceTranscripts = project.sourceTranscripts.filter((item) => item.sourceId !== source.id);
}

function throwTranscriptError(code: ProjectCommandErrorCode, message: string): never {
  throw new ProjectCommandError(code, message);
}

function throwSourceDescriptorError(code: ProjectCommandErrorCode, message: string): never {
  throw new ProjectCommandError(code, message);
}

function isConsumingTranscriptStage(stage: TranscriptProvenanceStage | undefined): stage is Extract<TranscriptProvenanceStage, { inputTranscriptDigest: string }> {
  return stage?.kind === "alignment" || stage?.kind === "speaker-attribution" || stage?.kind === "manual-correction";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => deepEqual(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key]));
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
