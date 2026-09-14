import {
  CURRENT_SCHEMA_VERSION,
  MAX_TRANSCRIPT_PROVENANCE_STAGES,
  PROJECT_IR_SCHEMA_VERSION_V1,
  type ProjectIR,
  type ProjectIRv2,
  type SourceTranscript,
  type TranscriptSpeakerState
} from "./types.js";
import { computeTranscriptDigest } from "./transcript-digest.js";

export const V1_UNASSIGNED_TRANSCRIPT_EXTENSION = "cevra.migration.v1UnassignedTranscript" as const;

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

type RawProject = Record<string, unknown>;
type SourceLike = { id: string; kind: string; durationMs?: unknown; checksum?: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isNonNegativeIntegerV1 = (value: unknown): value is number => isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
const isTranscriptTime = (value: unknown): value is number =>
  isFiniteNumber(value) && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isIsoDateTime = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

function push(issues: ValidationIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

function requireString(record: Record<string, unknown>, key: string, path: string, issues: ValidationIssue[]): void {
  if (!isNonEmptyString(record[key])) push(issues, `${path}.${key}`, "required", `${key} is required.`);
}

function requireLegacyTime(record: Record<string, unknown>, key: string, path: string, issues: ValidationIssue[]): void {
  if (!isNonNegativeIntegerV1(record[key])) push(issues, `${path}.${key}`, "time", `${key} must be a non-negative integer millisecond value.`);
}

function validateLegacyTimeRange(record: Record<string, unknown>, startKey: string, endKey: string, path: string, issues: ValidationIssue[]): void {
  requireLegacyTime(record, startKey, path, issues);
  requireLegacyTime(record, endKey, path, issues);
  const start = record[startKey];
  const end = record[endKey];
  if (isFiniteNumber(start) && isFiniteNumber(end) && end <= start) push(issues, path, "range", `${endKey} must be greater than ${startKey}.`);
}

function validateSource(source: unknown, index: number, issues: ValidationIssue[]): void {
  const path = `sources[${index}]`;
  if (!isRecord(source)) return push(issues, path, "type", "Source must be an object.");
  requireString(source, "id", path, issues);
  requireString(source, "uri", path, issues);
  requireString(source, "displayName", path, issues);
  if (!["video", "audio", "image"].includes(String(source.kind))) push(issues, `${path}.kind`, "enum", "Unsupported source kind.");
  if (source.durationMs !== undefined && !isNonNegativeIntegerV1(source.durationMs)) push(issues, `${path}.durationMs`, "time", "durationMs must be a non-negative integer.");
  for (const key of ["width", "height", "sampleRate", "channels"] as const) {
    if (source[key] !== undefined && (!isFiniteNumber(source[key]) || (source[key] as number) <= 0)) push(issues, `${path}.${key}`, "range", `${key} must be greater than 0.`);
  }
  if (source.frameRate !== undefined && (!isFiniteNumber(source.frameRate) || source.frameRate <= 0)) push(issues, `${path}.frameRate`, "range", "frameRate must be greater than 0.");
}

function validateTrack(track: unknown, index: number, issues: ValidationIssue[]): void {
  const path = `timeline.tracks[${index}]`;
  if (!isRecord(track)) return push(issues, path, "type", "Track must be an object.");
  requireString(track, "id", path, issues);
  requireString(track, "name", path, issues);
  if (!["video", "audio", "overlay", "caption"].includes(String(track.kind))) push(issues, `${path}.kind`, "enum", "Unsupported track kind.");
  for (const key of ["locked", "hidden", "muted"] as const) if (typeof track[key] !== "boolean") push(issues, `${path}.${key}`, "type", `${key} must be boolean.`);
}

function validateClip(clip: unknown, index: number, issues: ValidationIssue[]): void {
  const path = `timeline.clips[${index}]`;
  if (!isRecord(clip)) return push(issues, path, "type", "Clip must be an object.");
  for (const key of ["id", "trackId", "sourceId"] as const) requireString(clip, key, path, issues);
  validateLegacyTimeRange(clip, "timelineStartMs", "timelineEndMs", path, issues);
  validateLegacyTimeRange(clip, "sourceStartMs", "sourceEndMs", path, issues);
  if (!isFiniteNumber(clip.speed) || clip.speed <= 0) push(issues, `${path}.speed`, "range", "speed must be greater than 0.");
  if (!isFiniteNumber(clip.volume) || clip.volume < 0) push(issues, `${path}.volume`, "range", "volume must be 0 or greater.");
  if (!isFiniteNumber(clip.opacity) || clip.opacity < 0 || clip.opacity > 1) push(issues, `${path}.opacity`, "range", "opacity must be between 0 and 1.");
}

function validateLegacyTranscript(transcript: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(transcript)) return push(issues, "transcript", "type", "transcript must be an object.");
  if (!Array.isArray(transcript.words)) push(issues, "transcript.words", "type", "transcript.words must be an array.");
  else transcript.words.forEach((word, index) => {
    const path = `transcript.words[${index}]`;
    if (!isRecord(word)) return push(issues, path, "type", "Transcript word must be an object.");
    requireString(word, "id", path, issues);
    if (typeof word.text !== "string") push(issues, `${path}.text`, "type", "text must be a string.");
    validateLegacyTimeRange(word, "startMs", "endMs", path, issues);
    if (word.confidence !== undefined && (!isFiniteNumber(word.confidence) || word.confidence < 0 || word.confidence > 1)) push(issues, `${path}.confidence`, "range", "confidence must be between 0 and 1.");
  });
  if (!Array.isArray(transcript.segments)) push(issues, "transcript.segments", "type", "transcript.segments must be an array.");
  else transcript.segments.forEach((segment, index) => {
    const path = `transcript.segments[${index}]`;
    if (!isRecord(segment)) return push(issues, path, "type", "Transcript segment must be an object.");
    requireString(segment, "id", path, issues);
    if (typeof segment.text !== "string") push(issues, `${path}.text`, "type", "text must be a string.");
    validateLegacyTimeRange(segment, "startMs", "endMs", path, issues);
    if (!Array.isArray(segment.wordIds) || segment.wordIds.some((id) => !isNonEmptyString(id))) push(issues, `${path}.wordIds`, "type", "wordIds must contain string IDs.");
  });
}

function validateCaption(caption: unknown, index: number, issues: ValidationIssue[]): void {
  const path = `captions[${index}]`;
  if (!isRecord(caption)) return push(issues, path, "type", "Caption must be an object.");
  requireString(caption, "id", path, issues);
  if (typeof caption.text !== "string") push(issues, `${path}.text`, "type", "text must be a string.");
  validateLegacyTimeRange(caption, "startMs", "endMs", path, issues);
}

function validateGraphic(graphic: unknown, index: number, issues: ValidationIssue[]): void {
  const path = `graphics[${index}]`;
  if (!isRecord(graphic)) return push(issues, path, "type", "Graphic must be an object.");
  requireString(graphic, "id", path, issues);
  if (!["text", "image", "video", "shape", "lottie"].includes(String(graphic.kind))) push(issues, `${path}.kind`, "enum", "Unsupported graphic kind.");
  validateLegacyTimeRange(graphic, "startMs", "endMs", path, issues);
}

function validateLayout(layout: unknown, index: number, issues: ValidationIssue[]): void {
  const path = `layouts[${index}]`;
  if (!isRecord(layout)) return push(issues, path, "type", "Layout must be an object.");
  requireString(layout, "id", path, issues);
  requireString(layout, "name", path, issues);
  if (!["fullscreen", "split-horizontal", "split-vertical", "picture-in-picture", "custom"].includes(String(layout.kind))) push(issues, `${path}.kind`, "enum", "Unsupported layout kind.");
  if (!Array.isArray(layout.regions)) return push(issues, `${path}.regions`, "type", "regions must be an array.");
  layout.regions.forEach((region, regionIndex) => {
    const regionPath = `${path}.regions[${regionIndex}]`;
    if (!isRecord(region)) return push(issues, regionPath, "type", "Region must be an object.");
    requireString(region, "id", regionPath, issues);
    for (const key of ["x", "y", "width", "height"] as const) if (!isFiniteNumber(region[key])) push(issues, `${regionPath}.${key}`, "type", `${key} must be finite.`);
    if (isFiniteNumber(region.width) && region.width <= 0) push(issues, `${regionPath}.width`, "range", "width must be greater than 0.");
    if (isFiniteNumber(region.height) && region.height <= 0) push(issues, `${regionPath}.height`, "range", "height must be greater than 0.");
  });
}

function validateSharedProject(value: RawProject, issues: ValidationIssue[]): void {
  if (!isRecord(value.project)) push(issues, "project", "type", "project must be an object.");
  else {
    requireString(value.project, "id", "project", issues);
    requireString(value.project, "name", "project", issues);
    if (!isIsoDateTime(value.project.createdAt)) push(issues, "project.createdAt", "datetime", "createdAt must be an ISO-compatible datetime.");
    if (!isIsoDateTime(value.project.updatedAt)) push(issues, "project.updatedAt", "datetime", "updatedAt must be an ISO-compatible datetime.");
    if (value.project.defaultLocale !== "pt-BR" && value.project.defaultLocale !== "en-US") push(issues, "project.defaultLocale", "locale", "defaultLocale must be pt-BR or en-US.");
  }

  if (!Array.isArray(value.sources)) push(issues, "sources", "type", "sources must be an array.");
  else value.sources.forEach((source, index) => validateSource(source, index, issues));

  if (!isRecord(value.timeline)) push(issues, "timeline", "type", "timeline must be an object.");
  else {
    if (!isNonNegativeIntegerV1(value.timeline.durationMs)) push(issues, "timeline.durationMs", "time", "durationMs must be a non-negative integer.");
    if (!Array.isArray(value.timeline.tracks)) push(issues, "timeline.tracks", "type", "timeline.tracks must be an array.");
    else value.timeline.tracks.forEach((track, index) => validateTrack(track, index, issues));
    if (!Array.isArray(value.timeline.clips)) push(issues, "timeline.clips", "type", "timeline.clips must be an array.");
    else value.timeline.clips.forEach((clip, index) => validateClip(clip, index, issues));
  }

  if (!Array.isArray(value.captions)) push(issues, "captions", "type", "captions must be an array.");
  else value.captions.forEach((caption, index) => validateCaption(caption, index, issues));
  if (!Array.isArray(value.graphics)) push(issues, "graphics", "type", "graphics must be an array.");
  else value.graphics.forEach((graphic, index) => validateGraphic(graphic, index, issues));
  if (!Array.isArray(value.layouts)) push(issues, "layouts", "type", "layouts must be an array.");
  else value.layouts.forEach((layout, index) => validateLayout(layout, index, issues));

  if (!isRecord(value.audio)) push(issues, "audio", "type", "audio must be an object.");
  else {
    if (!isFiniteNumber(value.audio.masterGainDb)) push(issues, "audio.masterGainDb", "type", "masterGainDb must be finite.");
    if (value.audio.normalizeTargetLufs !== undefined && !isFiniteNumber(value.audio.normalizeTargetLufs)) push(issues, "audio.normalizeTargetLufs", "type", "normalizeTargetLufs must be finite.");
  }
  if (!isRecord(value.style)) push(issues, "style", "type", "style must be an object.");
  if (!Array.isArray(value.generation)) push(issues, "generation", "type", "generation must be an array.");
  else value.generation.forEach((item, index) => {
    const path = `generation[${index}]`;
    if (!isRecord(item)) return push(issues, path, "type", "Generation record must be an object.");
    requireString(item, "id", path, issues);
    requireString(item, "providerId", path, issues);
    if (!["image", "video", "audio"].includes(String(item.kind))) push(issues, `${path}.kind`, "enum", "Unsupported generation kind.");
    if (!["pending", "running", "completed", "failed"].includes(String(item.status))) push(issues, `${path}.status`, "enum", "Unsupported generation status.");
    if (typeof item.prompt !== "string") push(issues, `${path}.prompt`, "type", "prompt must be a string.");
    if (!Array.isArray(item.outputSourceIds)) push(issues, `${path}.outputSourceIds`, "type", "outputSourceIds must be an array.");
    if (!isIsoDateTime(item.createdAt)) push(issues, `${path}.createdAt`, "datetime", "createdAt must be an ISO-compatible datetime.");
  });

  if (!isRecord(value.history)) push(issues, "history", "type", "history must be an object.");
  else if (!isNonNegativeIntegerV1(value.history.revision)) push(issues, "history.revision", "revision", "history.revision must be a non-negative integer.");
  if (!Array.isArray(value.qa)) push(issues, "qa", "type", "qa must be an array.");
  else value.qa.forEach((finding, index) => {
    const path = `qa[${index}]`;
    if (!isRecord(finding)) return push(issues, path, "type", "QA finding must be an object.");
    requireString(finding, "id", path, issues);
    requireString(finding, "ruleId", path, issues);
    if (!["PASS", "WARN", "FAIL", "UNKNOWN"].includes(String(finding.status))) push(issues, `${path}.status`, "enum", "Unsupported QA status.");
    if (typeof finding.message !== "string") push(issues, `${path}.message`, "type", "message must be a string.");
    if (!isIsoDateTime(finding.createdAt)) push(issues, `${path}.createdAt`, "datetime", "createdAt must be an ISO-compatible datetime.");
  });
  if (!Array.isArray(value.exports)) push(issues, "exports", "type", "exports must be an array.");
  else value.exports.forEach((item, index) => {
    const path = `exports[${index}]`;
    if (!isRecord(item)) return push(issues, path, "type", "Export record must be an object.");
    requireString(item, "id", path, issues);
    requireString(item, "presetId", path, issues);
    if (!["pending", "running", "completed", "failed"].includes(String(item.status))) push(issues, `${path}.status`, "enum", "Unsupported export status.");
    if (!isIsoDateTime(item.createdAt)) push(issues, `${path}.createdAt`, "datetime", "createdAt must be an ISO-compatible datetime.");
  });
  if (!isRecord(value.extensions)) push(issues, "extensions", "type", "extensions must be an object.");
}

function validateSharedReferences(value: RawProject, issues: ValidationIssue[]): void {
  const sources = value.sources as Array<Record<string, unknown>>;
  const timeline = value.timeline as Record<string, unknown>;
  const tracks = timeline.tracks as Array<Record<string, unknown>>;
  const clips = timeline.clips as Array<Record<string, unknown>>;
  const graphics = value.graphics as Array<Record<string, unknown>>;
  const layouts = value.layouts as Array<Record<string, unknown>>;
  const generation = value.generation as Array<Record<string, unknown>>;
  const sourceIds = new Set(sources.map((source) => source.id as string));
  const trackIds = new Set(tracks.map((track) => track.id as string));
  const layoutIds = new Set(layouts.map((layout) => layout.id as string));
  const uniqueGroups: Array<[string, Array<Record<string, unknown>>]> = [
    ["sources", sources], ["timeline.tracks", tracks], ["timeline.clips", clips],
    ["captions", value.captions as Array<Record<string, unknown>>], ["graphics", graphics],
    ["layouts", layouts], ["generation", generation], ["qa", value.qa as Array<Record<string, unknown>>],
    ["exports", value.exports as Array<Record<string, unknown>>]
  ];
  validateUniqueIds(uniqueGroups, issues);
  clips.forEach((clip, index) => {
    if (!sourceIds.has(clip.sourceId as string)) push(issues, `timeline.clips[${index}].sourceId`, "reference", `Unknown source ${String(clip.sourceId)}.`);
    if (!trackIds.has(clip.trackId as string)) push(issues, `timeline.clips[${index}].trackId`, "reference", `Unknown track ${String(clip.trackId)}.`);
  });
  graphics.forEach((graphic, index) => {
    if (graphic.sourceId && !sourceIds.has(graphic.sourceId as string)) push(issues, `graphics[${index}].sourceId`, "reference", `Unknown source ${String(graphic.sourceId)}.`);
    if (graphic.layoutId && !layoutIds.has(graphic.layoutId as string)) push(issues, `graphics[${index}].layoutId`, "reference", `Unknown layout ${String(graphic.layoutId)}.`);
  });
  generation.forEach((record, index) => (record.outputSourceIds as unknown[]).forEach((sourceId) => {
    if (!sourceIds.has(sourceId as string)) push(issues, `generation[${index}].outputSourceIds`, "reference", `Unknown generated source ${String(sourceId)}.`);
  }));
}

function validateUniqueIds(groups: Array<[string, Array<Record<string, unknown>>]>, issues: ValidationIssue[]): void {
  for (const [path, items] of groups) {
    const seen = new Set<unknown>();
    items.forEach((item, index) => {
      if (seen.has(item.id)) push(issues, `${path}[${index}].id`, "duplicate", `Duplicate id ${String(item.id)}.`);
      seen.add(item.id);
    });
  }
}

export function validateProjectIRv1(value: unknown): ValidationResult<RawProject> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return { ok: false, issues: [{ path: "$", code: "type", message: "Project must be an object." }] };
  if (value.schemaVersion !== PROJECT_IR_SCHEMA_VERSION_V1) push(issues, "schemaVersion", "schema", `Expected schemaVersion ${PROJECT_IR_SCHEMA_VERSION_V1}.`);
  validateSharedProject(value, issues);
  validateLegacyTranscript(value.transcript, issues);
  if (issues.length === 0) {
    validateSharedReferences(value, issues);
    const transcript = value.transcript as Record<string, unknown>;
    const words = transcript.words as Array<Record<string, unknown>>;
    const segments = transcript.segments as Array<Record<string, unknown>>;
    validateUniqueIds([["transcript.words", words], ["transcript.segments", segments]], issues);
    const wordIds = new Set(words.map((word) => word.id));
    segments.forEach((segment, index) => (segment.wordIds as unknown[]).forEach((id) => {
      if (!wordIds.has(id)) push(issues, `transcript.segments[${index}].wordIds`, "reference", `Unknown transcript word ${String(id)}.`);
    }));
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value };
}

export function assertValidProjectIRv1(value: unknown): RawProject {
  const result = validateProjectIRv1(value);
  if (!result.ok) throwValidation(result.issues);
  return result.value;
}

function validateProjectIRv2(value: unknown): ValidationResult<ProjectIRv2> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return { ok: false, issues: [{ path: "$", code: "type", message: "Project must be an object." }] };
  if (value.schemaVersion !== CURRENT_SCHEMA_VERSION) push(issues, "schemaVersion", "schema", `Expected schemaVersion ${CURRENT_SCHEMA_VERSION}.`);
  if (hasOwn(value, "transcript")) push(issues, "transcript", "legacy", "Legacy top-level transcript is not allowed in schema v2.");
  validateSharedProject(value, issues);

  if (!Array.isArray(value.sourceTranscripts)) push(issues, "sourceTranscripts", "type", "sourceTranscripts must be an array.");
  if (issues.length === 0) {
    validateSharedReferences(value, issues);
    const sources = value.sources as Array<Record<string, unknown>>;
    const sourceById = new Map<string, SourceLike>(sources.map((source) => [source.id as string, source as unknown as SourceLike]));
    const sourceTranscripts = value.sourceTranscripts as unknown[];
    sourceTranscripts.forEach((transcript, index) => validateSourceTranscriptValue(transcript, index, issues, sourceById, true));
    const seenSources = new Set<string>();
    sourceTranscripts.forEach((item, index) => {
      if (!isRecord(item) || typeof item.sourceId !== "string") return;
      if (seenSources.has(item.sourceId)) push(issues, `sourceTranscripts[${index}].sourceId`, "duplicate", `Duplicate source transcript for ${item.sourceId}.`);
      seenSources.add(item.sourceId);
    });
    validateQuarantine((value.extensions as Record<string, unknown>)[V1_UNASSIGNED_TRANSCRIPT_EXTENSION], sourceById, issues);
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: value as unknown as ProjectIRv2 };
}

function validateSourceTranscriptValue(
  value: unknown,
  index: number,
  issues: ValidationIssue[],
  sourceById: Map<string, SourceLike> | undefined,
  allowMigrationUnknown: boolean
): void {
  const path = `sourceTranscripts[${index}]`;
  if (!isRecord(value)) return push(issues, path, "type", "Source transcript must be an object.");
  rejectUnexpectedKeys(value, ["sourceId", "transcriptDigest", "wordTiming", "speakerState", "transcript", "provenance", "extensions"], path, issues);
  requireString(value, "sourceId", path, issues);
  if (!isDigest(value.transcriptDigest)) push(issues, `${path}.transcriptDigest`, "digest", "transcriptDigest must use sha256-v1 with 64 lowercase hexadecimal characters.");
  if (!["none", "model", "aligned", "unknown"].includes(String(value.wordTiming))) push(issues, `${path}.wordTiming`, "enum", "Unsupported word timing state.");
  if (!["none", "partial", "complete"].includes(String(value.speakerState))) push(issues, `${path}.speakerState`, "enum", "Unsupported speaker state.");
  if (value.extensions !== undefined && !isRecord(value.extensions)) push(issues, `${path}.extensions`, "type", "extensions must be an object.");

  const source = typeof value.sourceId === "string" ? sourceById?.get(value.sourceId) : undefined;
  if (sourceById && !source) push(issues, `${path}.sourceId`, "reference", `Unknown source ${String(value.sourceId)}.`);
  if (source && source.kind !== "audio" && source.kind !== "video") push(issues, `${path}.sourceId`, "source-kind", "Only audio and video sources may own transcripts.");

  const transcript = validateCanonicalTranscript(value.transcript, path, issues, source);
  const stages = validateProvenance(value.provenance, path, issues, source);
  if (!transcript || !stages || !["none", "model", "aligned", "unknown"].includes(String(value.wordTiming)) || !["none", "partial", "complete"].includes(String(value.speakerState))) return;

  const wordTiming = value.wordTiming as SourceTranscript["wordTiming"];
  const speakerState = value.speakerState as TranscriptSpeakerState;
  const origin = stages[0]?.kind;
  const hasAlignment = stages.some((stage) => stage.kind === "alignment");
  if (wordTiming === "none" && transcript.words.length !== 0) push(issues, `${path}.wordTiming`, "timing", "none requires an empty words array.");
  if (wordTiming === "model" && (transcript.words.length === 0 || origin !== "transcription" || hasAlignment)) push(issues, `${path}.wordTiming`, "timing", "model requires words, transcription origin, and no alignment stage.");
  if (wordTiming === "aligned" && (transcript.words.length === 0 || !hasAlignment)) push(issues, `${path}.wordTiming`, "timing", "aligned requires words and an alignment stage.");
  if (wordTiming === "unknown") {
    if (!allowMigrationUnknown) push(issues, `${path}.wordTiming`, "migration-only", "unknown is reserved for migration.");
    if (transcript.words.length === 0 || origin !== "migration" || hasAlignment) push(issues, `${path}.wordTiming`, "timing", "unknown requires words, migration origin, and no alignment stage.");
  }

  if (wordTiming === "model" || wordTiming === "aligned") validatePreciseWordMapping(transcript, path, issues);
  const derivedSpeakerState = deriveSpeakerState(transcript, path, issues);
  if (derivedSpeakerState !== speakerState) push(issues, `${path}.speakerState`, "speaker-state", `speakerState must be ${derivedSpeakerState}.`);
  if (speakerState !== "none" && !(wordTiming === "unknown" && origin === "migration") && !stages.some((stage) => stage.kind === "speaker-attribution" || stage.kind === "manual-correction")) {
    push(issues, `${path}.provenance.stages`, "speaker-provenance", "Speaker assignments require speaker-attribution or manual-correction provenance.");
  }

  if (isDigest(value.transcriptDigest)) {
    try {
      const expected = computeTranscriptDigest({ transcript, wordTiming, speakerState });
      if (value.transcriptDigest !== expected) push(issues, `${path}.transcriptDigest`, "digest-mismatch", "transcriptDigest does not match transcript semantics.");
    } catch (error) {
      push(issues, `${path}.transcriptDigest`, "digest-input", error instanceof Error ? error.message : "Transcript digest input is invalid.");
    }
  }
}

function validateCanonicalTranscript(value: unknown, aggregatePath: string, issues: ValidationIssue[], source: SourceLike | undefined): SourceTranscript["transcript"] | undefined {
  const path = `${aggregatePath}.transcript`;
  const initialIssueCount = issues.length;
  if (!isRecord(value)) {
    push(issues, path, "type", "transcript must be an object.");
    return undefined;
  }
  rejectUnexpectedKeys(value, ["language", "words", "segments"], path, issues);
  if (value.language !== undefined && (typeof value.language !== "string" || value.language.length === 0 || value.language !== value.language.trim() || !hasValidUnicodeScalars(value.language) || [...value.language].length > 64)) push(issues, `${path}.language`, "language", "language must be a trimmed non-empty string of at most 64 Unicode scalar values.");
  if (!Array.isArray(value.words)) push(issues, `${path}.words`, "type", "words must be an array.");
  if (!Array.isArray(value.segments)) push(issues, `${path}.segments`, "type", "segments must be an array.");
  if (!Array.isArray(value.words) || !Array.isArray(value.segments)) return undefined;

  value.words.forEach((word, index) => {
    const wordPath = `${path}.words[${index}]`;
    if (!isRecord(word)) return push(issues, wordPath, "type", "Transcript word must be an object.");
    rejectUnexpectedKeys(word, ["id", "text", "startMs", "endMs", "confidence", "speakerId"], wordPath, issues);
    validateCanonicalString(word.id, `${wordPath}.id`, issues, true);
    validateCanonicalString(word.text, `${wordPath}.text`, issues, false);
    validateTranscriptRange(word, wordPath, issues, source);
    if (word.confidence !== undefined && (!isFiniteNumber(word.confidence) || word.confidence < 0 || word.confidence > 1)) push(issues, `${wordPath}.confidence`, "range", "confidence must be between 0 and 1.");
    if (word.speakerId !== undefined) validateCanonicalString(word.speakerId, `${wordPath}.speakerId`, issues, true);
  });
  value.segments.forEach((segment, index) => {
    const segmentPath = `${path}.segments[${index}]`;
    if (!isRecord(segment)) return push(issues, segmentPath, "type", "Transcript segment must be an object.");
    rejectUnexpectedKeys(segment, ["id", "text", "startMs", "endMs", "wordIds", "speakerId"], segmentPath, issues);
    validateCanonicalString(segment.id, `${segmentPath}.id`, issues, true);
    validateCanonicalString(segment.text, `${segmentPath}.text`, issues, false);
    validateTranscriptRange(segment, segmentPath, issues, source);
    if (!Array.isArray(segment.wordIds)) push(issues, `${segmentPath}.wordIds`, "type", "wordIds must be an array.");
    else {
      const seen = new Set<string>();
      segment.wordIds.forEach((wordId, wordIndex) => {
        validateCanonicalString(wordId, `${segmentPath}.wordIds[${wordIndex}]`, issues, true);
        if (typeof wordId === "string" && seen.has(wordId)) push(issues, `${segmentPath}.wordIds[${wordIndex}]`, "duplicate", `Duplicate word reference ${wordId}.`);
        if (typeof wordId === "string") seen.add(wordId);
      });
    }
    if (segment.speakerId !== undefined) validateCanonicalString(segment.speakerId, `${segmentPath}.speakerId`, issues, true);
  });

  const words = value.words.filter(isRecord);
  const segments = value.segments.filter(isRecord);
  validateUniqueIds([[`${path}.words`, words], [`${path}.segments`, segments]], issues);
  const wordIds = new Set(words.map((word) => word.id));
  segments.forEach((segment, index) => {
    if (!Array.isArray(segment.wordIds)) return;
    segment.wordIds.forEach((wordId, wordIndex) => {
      if (!wordIds.has(wordId)) push(issues, `${path}.segments[${index}].wordIds[${wordIndex}]`, "reference", `Unknown transcript word ${String(wordId)}.`);
    });
  });
  return issues.length === initialIssueCount ? value as unknown as SourceTranscript["transcript"] : undefined;
}

function validateTranscriptRange(record: Record<string, unknown>, path: string, issues: ValidationIssue[], source: SourceLike | undefined): void {
  for (const key of ["startMs", "endMs"] as const) if (!isTranscriptTime(record[key])) push(issues, `${path}.${key}`, "time", `${key} must be a non-negative safe integer without negative zero.`);
  if (isTranscriptTime(record.startMs) && isTranscriptTime(record.endMs) && record.endMs <= record.startMs) push(issues, path, "range", "endMs must be greater than startMs.");
  if (source && isNonNegativeIntegerV1(source.durationMs) && isTranscriptTime(record.endMs) && record.endMs > source.durationMs) push(issues, `${path}.endMs`, "source-duration", "Transcript time exceeds source duration.");
}

function validateCanonicalString(value: unknown, path: string, issues: ValidationIssue[], nonEmpty: boolean): void {
  if (typeof value !== "string" || (nonEmpty && !isNonEmptyString(value))) return push(issues, path, "type", nonEmpty ? "Value must be a non-empty string." : "Value must be a string.");
  if (!hasValidUnicodeScalars(value)) push(issues, path, "unicode", "Value contains an unpaired surrogate.");
}

function validatePreciseWordMapping(transcript: SourceTranscript["transcript"], path: string, issues: ValidationIssue[]): void {
  const wordById = new Map(transcript.words.map((word) => [word.id, word]));
  const counts = new Map(transcript.words.map((word) => [word.id, 0]));
  transcript.segments.forEach((segment, segmentIndex) => segment.wordIds.forEach((wordId, wordIndex) => {
    const word = wordById.get(wordId);
    if (!word) return;
    counts.set(wordId, (counts.get(wordId) ?? 0) + 1);
    if (word.startMs < segment.startMs || word.endMs > segment.endMs) push(issues, `${path}.transcript.segments[${segmentIndex}].wordIds[${wordIndex}]`, "word-interval", `Word ${wordId} is outside its segment interval.`);
  }));
  for (const [wordId, count] of counts) if (count !== 1) push(issues, `${path}.transcript.words`, "word-mapping", `Word ${wordId} must belong to exactly one segment.`);
}

export function deriveTranscriptSpeakerState(transcript: SourceTranscript["transcript"]): TranscriptSpeakerState {
  return deriveSpeakerState(transcript, "sourceTranscript", []);
}

function deriveSpeakerState(transcript: SourceTranscript["transcript"], path: string, issues: ValidationIssue[]): TranscriptSpeakerState {
  const wordById = new Map(transcript.words.map((word) => [word.id, word]));
  const any = transcript.words.some((word) => word.speakerId !== undefined) || transcript.segments.some((segment) => segment.speakerId !== undefined);
  let complete = transcript.words.length + transcript.segments.length > 0
    && transcript.words.every((word) => word.speakerId !== undefined)
    && transcript.segments.every((segment) => segment.speakerId !== undefined);
  transcript.segments.forEach((segment, segmentIndex) => {
    const assignedSpeakers = segment.wordIds.map((wordId) => wordById.get(wordId)?.speakerId).filter((speaker): speaker is string => speaker !== undefined);
    const distinct = new Set(assignedSpeakers);
    if (segment.speakerId !== undefined && distinct.size > 1) push(issues, `${path}.transcript.segments[${segmentIndex}].speakerId`, "speaker-conflict", "A mixed-speaker segment cannot claim one speaker.");
    if (segment.speakerId !== undefined && assignedSpeakers.some((speaker) => speaker !== segment.speakerId)) push(issues, `${path}.transcript.segments[${segmentIndex}].speakerId`, "speaker-conflict", "Segment speaker conflicts with an assigned word speaker.");
    if (segment.wordIds.length > 0 && (distinct.size !== 1 || segment.speakerId === undefined || !distinct.has(segment.speakerId))) complete = false;
    if (segment.wordIds.length === 0 && segment.speakerId === undefined) complete = false;
  });
  if (!any) return "none";
  return complete ? "complete" : "partial";
}

function validateProvenance(value: unknown, aggregatePath: string, issues: ValidationIssue[], source: SourceLike | undefined): Array<Record<string, unknown>> | undefined {
  const path = `${aggregatePath}.provenance`;
  if (!isRecord(value)) {
    push(issues, path, "type", "provenance must be an object.");
    return undefined;
  }
  rejectUnexpectedKeys(value, ["sourceChecksum", "stages"], path, issues);
  if (value.sourceChecksum !== undefined && !isNonEmptyString(value.sourceChecksum)) push(issues, `${path}.sourceChecksum`, "type", "sourceChecksum must be a non-empty string.");
  if (source) {
    if (source.checksum !== undefined && value.sourceChecksum !== source.checksum) push(issues, `${path}.sourceChecksum`, "checksum", "Transcript provenance must match the source checksum.");
    if (source.checksum === undefined && value.sourceChecksum !== undefined) push(issues, `${path}.sourceChecksum`, "checksum", "sourceChecksum must be omitted when the source has no checksum.");
  }
  if (!Array.isArray(value.stages) || value.stages.length < 1 || value.stages.length > MAX_TRANSCRIPT_PROVENANCE_STAGES) {
    push(issues, `${path}.stages`, "bounds", `stages must contain 1 to ${MAX_TRANSCRIPT_PROVENANCE_STAGES} entries.`);
    return undefined;
  }
  const stages = value.stages.filter(isRecord);
  if (stages.length !== value.stages.length) push(issues, `${path}.stages`, "type", "Every provenance stage must be an object.");
  const rank: Record<string, number> = { transcription: 0, migration: 0, alignment: 1, "speaker-attribution": 2, "manual-correction": 3 };
  const seen = new Set<unknown>();
  stages.forEach((stage, index) => {
    const stagePath = `${path}.stages[${index}]`;
    if (!Object.hasOwn(rank, String(stage.kind))) push(issues, `${stagePath}.kind`, "enum", "Unsupported provenance stage kind.");
    if (seen.has(stage.kind)) push(issues, `${stagePath}.kind`, "duplicate", `Duplicate provenance stage ${String(stage.kind)}.`);
    seen.add(stage.kind);
    if (index === 0 && stage.kind !== "transcription" && stage.kind !== "migration") push(issues, `${stagePath}.kind`, "origin", "The first provenance stage must be transcription or migration.");
    if (index > 0) {
      const prior = stages[index - 1];
      if (prior && (rank[String(stage.kind)] ?? -1) <= (rank[String(prior.kind)] ?? -1)) push(issues, `${stagePath}.kind`, "order", "Provenance stages are out of order.");
    }
    validateProvenanceStage(stage, stagePath, issues);
  });
  return stages;
}

function validateProvenanceStage(stage: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  const executed = ["executionId", "engineId", "engineVersion", "engineApiVersion", "createdAt"];
  if (stage.kind === "migration") {
    rejectUnexpectedKeys(stage, ["kind", "fromSchemaVersion", "toSchemaVersion"], path, issues);
    if (stage.fromSchemaVersion !== PROJECT_IR_SCHEMA_VERSION_V1 || stage.toSchemaVersion !== CURRENT_SCHEMA_VERSION) push(issues, path, "migration", "Migration provenance must record schema 1 to 2.");
    return;
  }
  if (stage.kind === "manual-correction") {
    rejectUnexpectedKeys(stage, ["kind", "inputTranscriptDigest", "createdAt", "executionId"], path, issues);
    if (!isDigest(stage.inputTranscriptDigest)) push(issues, `${path}.inputTranscriptDigest`, "digest", "inputTranscriptDigest is invalid.");
    if (!isIsoDateTime(stage.createdAt)) push(issues, `${path}.createdAt`, "datetime", "createdAt must be an ISO-compatible datetime.");
    if (stage.executionId !== undefined && !isNonEmptyString(stage.executionId)) push(issues, `${path}.executionId`, "required", "executionId must be a non-empty string.");
    return;
  }
  if (stage.kind === "transcription" || stage.kind === "alignment" || stage.kind === "speaker-attribution") {
    const allowed = ["kind", ...executed, "modelId", "modelRevision", "modelDigest", ...(stage.kind === "transcription" ? [] : ["inputTranscriptDigest"])];
    rejectUnexpectedKeys(stage, allowed, path, issues);
    for (const key of executed.slice(0, 4)) requireString(stage, key, path, issues);
    if (!isIsoDateTime(stage.createdAt)) push(issues, `${path}.createdAt`, "datetime", "createdAt must be an ISO-compatible datetime.");
    if (stage.kind === "transcription" && !isNonEmptyString(stage.modelId)) push(issues, `${path}.modelId`, "required", "modelId is required for transcription.");
    if (stage.kind !== "transcription" && !isDigest(stage.inputTranscriptDigest)) push(issues, `${path}.inputTranscriptDigest`, "digest", "inputTranscriptDigest is invalid.");
    if (stage.modelId !== undefined && !isNonEmptyString(stage.modelId)) push(issues, `${path}.modelId`, "required", "modelId must be a non-empty string.");
    for (const key of ["modelRevision", "modelDigest"] as const) {
      if (stage[key] !== undefined && !isNonEmptyString(stage[key])) push(issues, `${path}.${key}`, "required", `${key} must be a non-empty string.`);
      if (stage[key] !== undefined && stage.modelId === undefined) push(issues, `${path}.${key}`, "model", `${key} requires modelId.`);
    }
  }
}

function validateQuarantine(value: unknown, sourceById: Map<string, SourceLike>, issues: ValidationIssue[]): void {
  if (value === undefined) return;
  const path = `extensions.${V1_UNASSIGNED_TRANSCRIPT_EXTENSION}`;
  if (!isRecord(value)) return push(issues, path, "type", "Migration quarantine must be an object.");
  rejectUnexpectedKeys(value, ["schemaVersion", "originalSchemaVersion", "reason", "payload", "eligibleSourceIdsAtMigration"], path, issues);
  if (value.schemaVersion !== 1 || value.originalSchemaVersion !== 1) push(issues, path, "schema", "Migration quarantine schema versions must both be 1.");
  if (!["no-eligible-source", "ambiguous-multiple-sources", "incompatible-canonical-transcript"].includes(String(value.reason))) push(issues, `${path}.reason`, "enum", "Migration quarantine reason is invalid.");
  if (!isRecord(value.payload) || !isFiniteJson(value.payload, new Set())) push(issues, `${path}.payload`, "json", "Migration quarantine payload must be a finite serializable JSON object.");
  const expected = [...sourceById.values()].filter((source) => source.kind === "audio" || source.kind === "video").map((source) => source.id).sort();
  const expectedReason = expected.length === 0
    ? "no-eligible-source"
    : sourceById.size > 1
      ? "ambiguous-multiple-sources"
      : "incompatible-canonical-transcript";
  if (value.reason !== expectedReason) push(issues, `${path}.reason`, "evidence", `Migration quarantine reason must be ${expectedReason} for the current sources.`);
  if (!Array.isArray(value.eligibleSourceIdsAtMigration) || value.eligibleSourceIdsAtMigration.some((id) => !isNonEmptyString(id))) push(issues, `${path}.eligibleSourceIdsAtMigration`, "type", "eligibleSourceIdsAtMigration must contain source IDs.");
  else if (new Set(value.eligibleSourceIdsAtMigration).size !== value.eligibleSourceIdsAtMigration.length || value.eligibleSourceIdsAtMigration.some((id, index) => id !== expected[index]) || value.eligibleSourceIdsAtMigration.length !== expected.length) push(issues, `${path}.eligibleSourceIdsAtMigration`, "evidence", "Eligible source IDs must exactly match the sorted eligible sources.");
}

function isFiniteJson(value: unknown, ancestors: Set<object>): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || value === null) return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Array.isArray(value) ? value.every((item) => isFiniteJson(item, ancestors)) : Object.values(value).every((item) => isFiniteJson(item, ancestors));
  ancestors.delete(value);
  return valid;
}

function rejectUnexpectedKeys(record: Record<string, unknown>, allowed: readonly string[], path: string, issues: ValidationIssue[]): void {
  for (const key of Object.keys(record)) if (!allowed.includes(key)) push(issues, `${path}.${key}`, "unexpected", `Unexpected property ${key}.`);
}

function isDigest(value: unknown): value is SourceTranscript["transcriptDigest"] {
  return typeof value === "string" && /^sha256-v1:[0-9a-f]{64}$/u.test(value);
}

function hasValidUnicodeScalars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

export function validateProjectIR(value: unknown): ValidationResult<RawProject | ProjectIRv2> {
  if (!isRecord(value)) return { ok: false, issues: [{ path: "$", code: "type", message: "Project must be an object." }] };
  if (value.schemaVersion === PROJECT_IR_SCHEMA_VERSION_V1) return validateProjectIRv1(value);
  if (value.schemaVersion === CURRENT_SCHEMA_VERSION) return validateProjectIRv2(value);
  return { ok: false, issues: [{ path: "schemaVersion", code: "schema", message: `Unsupported schemaVersion ${String(value.schemaVersion)}.` }] };
}

export function assertValidProjectIR(value: unknown): ProjectIR {
  const result = validateProjectIRv2(value);
  if (!result.ok) throwValidation(result.issues);
  return result.value;
}

export function assertValidSourceTranscriptForCreation(value: SourceTranscript): SourceTranscript {
  const issues: ValidationIssue[] = [];
  validateSourceTranscriptValue(value, 0, issues, undefined, false);
  if (issues.length > 0) throwValidation(issues);
  return value;
}

function throwValidation(issues: ValidationIssue[]): never {
  const detail = issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
  throw new Error(`Invalid CEVRA Project IR:\n${detail}`);
}
