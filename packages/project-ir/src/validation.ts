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

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isNonNegativeInteger = (value: unknown): value is number =>
  isFiniteNumber(value) && Number.isInteger(value) && value >= 0;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isIsoDateTime = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

function push(issues: ValidationIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

function validateClip(clip: unknown, index: number, issues: ValidationIssue[]): void {
  const path = `timeline.clips[${index}]`;
  if (!isRecord(clip)) {
    push(issues, path, "type", "Clip must be an object.");
    return;
  }
  for (const key of ["id", "trackId", "sourceId"] as const) {
    if (!isNonEmptyString(clip[key])) push(issues, `${path}.${key}`, "required", `${key} is required.`);
  }
  for (const key of ["timelineStartMs", "timelineEndMs", "sourceStartMs", "sourceEndMs"] as const) {
    if (!isNonNegativeInteger(clip[key])) push(issues, `${path}.${key}`, "time", `${key} must be a non-negative integer millisecond value.`);
  }
  if (isFiniteNumber(clip.timelineStartMs) && isFiniteNumber(clip.timelineEndMs) && clip.timelineEndMs <= clip.timelineStartMs) {
    push(issues, path, "range", "timelineEndMs must be greater than timelineStartMs.");
  }
  if (isFiniteNumber(clip.sourceStartMs) && isFiniteNumber(clip.sourceEndMs) && clip.sourceEndMs <= clip.sourceStartMs) {
    push(issues, path, "range", "sourceEndMs must be greater than sourceStartMs.");
  }
  if (!isFiniteNumber(clip.speed) || clip.speed <= 0) push(issues, `${path}.speed`, "range", "speed must be greater than 0.");
  if (!isFiniteNumber(clip.volume) || clip.volume < 0) push(issues, `${path}.volume`, "range", "volume must be 0 or greater.");
  if (!isFiniteNumber(clip.opacity) || clip.opacity < 0 || clip.opacity > 1) push(issues, `${path}.opacity`, "range", "opacity must be between 0 and 1.");
}

export function validateProjectIR(value: unknown): ValidationResult<ProjectIR> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return { ok: false, issues: [{ path: "$", code: "type", message: "Project must be an object." }] };

  if (value.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    push(issues, "schemaVersion", "schema", `Expected schemaVersion ${CURRENT_SCHEMA_VERSION}.`);
  }

  if (!isRecord(value.project)) {
    push(issues, "project", "type", "project must be an object.");
  } else {
    if (!isNonEmptyString(value.project.id)) push(issues, "project.id", "required", "project.id is required.");
    if (!isNonEmptyString(value.project.name)) push(issues, "project.name", "required", "project.name is required.");
    if (!isIsoDateTime(value.project.createdAt)) push(issues, "project.createdAt", "datetime", "createdAt must be an ISO-compatible datetime.");
    if (!isIsoDateTime(value.project.updatedAt)) push(issues, "project.updatedAt", "datetime", "updatedAt must be an ISO-compatible datetime.");
    if (value.project.defaultLocale !== "pt-BR" && value.project.defaultLocale !== "en-US") {
      push(issues, "project.defaultLocale", "locale", "defaultLocale must be pt-BR or en-US.");
    }
  }

  const requiredArrays = ["sources", "captions", "graphics", "layouts", "generation", "qa", "exports"] as const;
  for (const key of requiredArrays) {
    if (!Array.isArray(value[key])) push(issues, key, "type", `${key} must be an array.`);
  }

  if (!isRecord(value.transcript)) {
    push(issues, "transcript", "type", "transcript must be an object.");
  } else {
    if (!Array.isArray(value.transcript.words)) push(issues, "transcript.words", "type", "transcript.words must be an array.");
    if (!Array.isArray(value.transcript.segments)) push(issues, "transcript.segments", "type", "transcript.segments must be an array.");
  }

  if (!isRecord(value.timeline)) {
    push(issues, "timeline", "type", "timeline must be an object.");
  } else {
    if (!isNonNegativeInteger(value.timeline.durationMs)) push(issues, "timeline.durationMs", "time", "durationMs must be a non-negative integer.");
    if (!Array.isArray(value.timeline.tracks)) push(issues, "timeline.tracks", "type", "timeline.tracks must be an array.");
    if (!Array.isArray(value.timeline.clips)) {
      push(issues, "timeline.clips", "type", "timeline.clips must be an array.");
    } else {
      value.timeline.clips.forEach((clip, index) => validateClip(clip, index, issues));
    }
  }

  for (const key of ["audio", "style", "history", "extensions"] as const) {
    if (!isRecord(value[key])) push(issues, key, "type", `${key} must be an object.`);
  }
  if (isRecord(value.history) && (!isNonNegativeInteger(value.history.revision))) {
    push(issues, "history.revision", "revision", "history.revision must be a non-negative integer.");
  }

  if (issues.length > 0) return { ok: false, issues };

  const project = value as unknown as ProjectIR;
  validateReferences(project, issues);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: project };
}

function validateReferences(project: ProjectIR, issues: ValidationIssue[]): void {
  const sourceIds = new Set(project.sources.map((source) => source.id));
  const trackIds = new Set(project.timeline.tracks.map((track) => track.id));
  const uniqueGroups: Array<[string, Array<{ id: string }>]> = [
    ["sources", project.sources],
    ["timeline.tracks", project.timeline.tracks],
    ["timeline.clips", project.timeline.clips],
    ["captions", project.captions],
    ["graphics", project.graphics],
    ["layouts", project.layouts]
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
}

export function assertValidProjectIR(value: unknown): ProjectIR {
  const result = validateProjectIR(value);
  if (!result.ok) {
    const detail = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
    throw new Error(`Invalid CEVRA Project IR:\n${detail}`);
  }
  return result.value;
}
