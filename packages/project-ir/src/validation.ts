import { CURRENT_SCHEMA_VERSION, type ProjectIR, type TimelineClip } from "./types.js";

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isNonNegativeInteger = (value: unknown): value is number => isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isIsoDateTime = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

function push(issues: ValidationIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

function requireString(record: Record<string, unknown>, key: string, path: string, issues: ValidationIssue[]): void {
  if (!isNonEmptyString(record[key])) push(issues, `${path}.${key}`, "required", `${key} is required.`);
}

function requireTime(record: Record<string, unknown>, key: string, path: string, issues: ValidationIssue[]): void {
  if (!isNonNegativeInteger(record[key])) push(issues, `${path}.${key}`, "time", `${key} must be a non-negative integer millisecond value.`);
}

function validateTimeRange(record: Record<string, unknown>, startKey: string, endKey: string, path: string, issues: ValidationIssue[]): void {
  requireTime(record, startKey, path, issues);
  requireTime(record, endKey, path, issues);
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
  if (source.durationMs !== undefined && !isNonNegativeInteger(source.durationMs)) push(issues, `${path}.durationMs`, "time", "durationMs must be a non-negative integer.");
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
  validateTimeRange(clip, "timelineStartMs", "timelineEndMs", path, issues);
  validateTimeRange(clip, "sourceStartMs", "sourceEndMs", path, issues);
  if (!isFiniteNumber(clip.speed) || clip.speed <= 0) push(issues, `${path}.speed`, "range", "speed must be greater than 0.");
  if (!isFiniteNumber(clip.volume) || clip.volume < 0) push(issues, `${path}.volume`, "range", "volume must be 0 or greater.");
  if (!isFiniteNumber(clip.opacity) || clip.opacity < 0 || clip.opacity > 1) push(issues, `${path}.opacity`, "range", "opacity must be between 0 and 1.");
}

function validateTranscript(transcript: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(transcript)) return push(issues, "transcript", "type", "transcript must be an object.");
  if (!Array.isArray(transcript.words)) push(issues, "transcript.words", "type", "transcript.words must be an array.");
  else transcript.words.forEach((word, index) => {
    const path = `transcript.words[${index}]`;
    if (!isRecord(word)) return push(issues, path, "type", "Transcript word must be an object.");
    requireString(word, "id", path, issues);
    if (typeof word.text !== "string") push(issues, `${path}.text`, "type", "text must be a string.");
    validateTimeRange(word, "startMs", "endMs", path, issues);
    if (word.confidence !== undefined && (!isFiniteNumber(word.confidence) || word.confidence < 0 || word.confidence > 1)) push(issues, `${path}.confidence`, "range", "confidence must be between 0 and 1.");
  });
  if (!Array.isArray(transcript.segments)) push(issues, "transcript.segments", "type", "transcript.segments must be an array.");
  else transcript.segments.forEach((segment, index) => {
    const path = `transcript.segments[${index}]`;
    if (!isRecord(segment)) return push(issues, path, "type", "Transcript segment must be an object.");
    requireString(segment, "id", path, issues);
    if (typeof segment.text !== "string") push(issues, `${path}.text`, "type", "text must be a string.");
    validateTimeRange(segment, "startMs", "endMs", path, issues);
    if (!Array.isArray(segment.wordIds) || segment.wordIds.some((id) => !isNonEmptyString(id))) push(issues, `${path}.wordIds`, "type", "wordIds must contain string IDs.");
  });
}

function validateCaption(caption: unknown, index: number, issues: ValidationIssue[]): void {
  const path = `captions[${index}]`;
  if (!isRecord(caption)) return push(issues, path, "type", "Caption must be an object.");
  requireString(caption, "id", path, issues);
  if (typeof caption.text !== "string") push(issues, `${path}.text`, "type", "text must be a string.");
  validateTimeRange(caption, "startMs", "endMs", path, issues);
}

function validateGraphic(graphic: unknown, index: number, issues: ValidationIssue[]): void {
  const path = `graphics[${index}]`;
  if (!isRecord(graphic)) return push(issues, path, "type", "Graphic must be an object.");
  requireString(graphic, "id", path, issues);
  if (!["text", "image", "video", "shape", "lottie"].includes(String(graphic.kind))) push(issues, `${path}.kind`, "enum", "Unsupported graphic kind.");
  validateTimeRange(graphic, "startMs", "endMs", path, issues);
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

export function validateProjectIR(value: unknown): ValidationResult<ProjectIR> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return { ok: false, issues: [{ path: "$", code: "type", message: "Project must be an object." }] };
  if (value.schemaVersion !== CURRENT_SCHEMA_VERSION) push(issues, "schemaVersion", "schema", `Expected schemaVersion ${CURRENT_SCHEMA_VERSION}.`);

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
  validateTranscript(value.transcript, issues);

  if (!isRecord(value.timeline)) push(issues, "timeline", "type", "timeline must be an object.");
  else {
    if (!isNonNegativeInteger(value.timeline.durationMs)) push(issues, "timeline.durationMs", "time", "durationMs must be a non-negative integer.");
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
  else if (!isNonNegativeInteger(value.history.revision)) push(issues, "history.revision", "revision", "history.revision must be a non-negative integer.");
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

  if (issues.length > 0) return { ok: false, issues };
  const project = value as unknown as ProjectIR;
  validateReferences(project, issues);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: project };
}

function validateReferences(project: ProjectIR, issues: ValidationIssue[]): void {
  const sourceIds = new Set(project.sources.map((source) => source.id));
  const trackIds = new Set(project.timeline.tracks.map((track) => track.id));
  const layoutIds = new Set(project.layouts.map((layout) => layout.id));
  const wordIds = new Set(project.transcript.words.map((word) => word.id));
  const uniqueGroups: Array<[string, Array<{ id: string }>]> = [
    ["sources", project.sources], ["transcript.words", project.transcript.words], ["transcript.segments", project.transcript.segments],
    ["timeline.tracks", project.timeline.tracks], ["timeline.clips", project.timeline.clips], ["captions", project.captions],
    ["graphics", project.graphics], ["layouts", project.layouts], ["generation", project.generation], ["qa", project.qa], ["exports", project.exports]
  ];
  for (const [path, items] of uniqueGroups) {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id)) push(issues, `${path}[${index}].id`, "duplicate", `Duplicate id ${item.id}.`);
      seen.add(item.id);
    });
  }
  project.timeline.clips.forEach((clip: TimelineClip, index) => {
    if (!sourceIds.has(clip.sourceId)) push(issues, `timeline.clips[${index}].sourceId`, "reference", `Unknown source ${clip.sourceId}.`);
    if (!trackIds.has(clip.trackId)) push(issues, `timeline.clips[${index}].trackId`, "reference", `Unknown track ${clip.trackId}.`);
  });
  project.transcript.segments.forEach((segment, index) => segment.wordIds.forEach((id) => {
    if (!wordIds.has(id)) push(issues, `transcript.segments[${index}].wordIds`, "reference", `Unknown transcript word ${id}.`);
  }));
  project.graphics.forEach((graphic, index) => {
    if (graphic.sourceId && !sourceIds.has(graphic.sourceId)) push(issues, `graphics[${index}].sourceId`, "reference", `Unknown source ${graphic.sourceId}.`);
    if (graphic.layoutId && !layoutIds.has(graphic.layoutId)) push(issues, `graphics[${index}].layoutId`, "reference", `Unknown layout ${graphic.layoutId}.`);
  });
  project.generation.forEach((record, index) => record.outputSourceIds.forEach((sourceId) => {
    if (!sourceIds.has(sourceId)) push(issues, `generation[${index}].outputSourceIds`, "reference", `Unknown generated source ${sourceId}.`);
  }));
}

export function assertValidProjectIR(value: unknown): ProjectIR {
  const result = validateProjectIR(value);
  if (!result.ok) {
    const detail = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
    throw new Error(`Invalid CEVRA Project IR:\n${detail}`);
  }
  return result.value;
}
