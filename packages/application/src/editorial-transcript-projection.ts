import type {
  ProjectHistory,
  SourceTranscript,
  TranscriptDigest,
  TranscriptSegment,
  TranscriptWord
} from "@cevra/project-ir";

export const EDITORIAL_TRANSCRIPT_PROJECTION_VERSION = 1 as const;
export const EDITORIAL_TRANSCRIPT_PROJECTION_PROFILE = "cevra.editorial-transcript.v1" as const;
export const EDITORIAL_TRANSCRIPT_GROUPING_GAP_MS = 500 as const;
export const DEFAULT_EDITORIAL_TRANSCRIPT_PAGE_BYTES = 64 * 1024;
export const MIN_EDITORIAL_TRANSCRIPT_PAGE_BYTES = 4 * 1024;
export const MAX_EDITORIAL_TRANSCRIPT_PAGE_BYTES = 256 * 1024;

export type EditorialTranscriptProjectionErrorCode =
  | "EDITORIAL_TRANSCRIPT_INVALID_REQUEST"
  | "EDITORIAL_TRANSCRIPT_SOURCE_NOT_FOUND"
  | "EDITORIAL_TRANSCRIPT_TRANSCRIPT_NOT_FOUND"
  | "EDITORIAL_TRANSCRIPT_CURSOR_INVALID"
  | "EDITORIAL_TRANSCRIPT_CURSOR_STALE"
  | "EDITORIAL_TRANSCRIPT_UNIT_TOO_LARGE";

export class EditorialTranscriptProjectionError extends Error {
  constructor(
    readonly code: EditorialTranscriptProjectionErrorCode,
    message: string
  ) {
    super(message);
    this.name = "EditorialTranscriptProjectionError";
  }
}

export interface EditorialTranscriptProjectionRequest {
  sourceIds?: readonly string[];
  maxBytes?: number;
  cursor?: string;
}

export interface EditorialTranscriptProjectBinding {
  projectId: string;
  projectRevision: number;
  projectSnapshotId?: string;
  sourceTranscripts: ReadonlyArray<{
    sourceId: string;
    transcriptDigest?: TranscriptDigest;
  }>;
}

export type EditorialTranscriptSourceStatus = "projected" | "transcript-unavailable" | "no-speech";

export interface EditorialTranscriptProjectionSource {
  sourceId: string;
  status: EditorialTranscriptSourceStatus;
  transcriptDigest?: TranscriptDigest;
  basis?: "words" | "segments";
  unitCount: number;
}

export interface EditorialTranscriptContinuation {
  scope: "projection-only";
  continuedFromPrevious: boolean;
  continuesOnNextPage: boolean;
}

interface EditorialTranscriptReasoningUnitBase {
  id: string;
  sourceId: string;
  transcriptDigest: TranscriptDigest;
  startMs: number;
  endMs: number;
  text: string;
  speakerId?: string;
  continuation?: EditorialTranscriptContinuation;
}

export interface EditorialTranscriptWordUnit extends EditorialTranscriptReasoningUnitBase {
  basis: "words";
  wordIds: readonly string[];
}

export interface EditorialTranscriptSegmentUnit extends EditorialTranscriptReasoningUnitBase {
  basis: "segments";
  segmentId: string;
  wordIds: readonly string[];
}

export type EditorialTranscriptReasoningUnit =
  | EditorialTranscriptWordUnit
  | EditorialTranscriptSegmentUnit;

export interface EditorialTranscriptProjectionPage {
  byteLength: number;
  nextCursor?: string;
}

export interface EditorialTranscriptProjectionV1 {
  version: typeof EDITORIAL_TRANSCRIPT_PROJECTION_VERSION;
  profile: typeof EDITORIAL_TRANSCRIPT_PROJECTION_PROFILE;
  binding: EditorialTranscriptProjectBinding;
  groupingPolicy: {
    gapMs: typeof EDITORIAL_TRANSCRIPT_GROUPING_GAP_MS;
    speakerChange: true;
  };
  selection: {
    mode: "all" | "explicit";
    sourceIds: readonly string[];
  };
  sources: readonly EditorialTranscriptProjectionSource[];
  reasoningUnits: readonly EditorialTranscriptReasoningUnit[];
  renderedText: string;
  page: EditorialTranscriptProjectionPage;
}

interface WordUnitInternal extends EditorialTranscriptWordUnit {
  words: readonly TranscriptWord[];
}

type UnitInternal = WordUnitInternal | EditorialTranscriptSegmentUnit;

interface SourceInternal extends EditorialTranscriptProjectionSource {
  units: readonly UnitInternal[];
}

interface CursorV1 {
  version: 1;
  profile: typeof EDITORIAL_TRANSCRIPT_PROJECTION_PROFILE;
  projectId: string;
  projectRevision: number;
  projectSnapshotId: string | null;
  selectionMode: "all" | "explicit";
  sourceBindings: Array<{ sourceId: string; transcriptDigest: TranscriptDigest | null }>;
  nextSourceIndex: number;
  nextUnitIndex: number;
  nextWordOffset: number;
}

interface Position {
  sourceIndex: number;
  unitIndex: number;
  wordOffset: number;
}

export class EditorialTranscriptProjectionService {
  constructor(private readonly history: ProjectHistory) {}

  project(request: EditorialTranscriptProjectionRequest = {}): EditorialTranscriptProjectionV1 {
    const captured = captureRequest(request);
    const project = this.history.current;
    const cursor = captured.cursor === undefined ? undefined : parseCursor(captured.cursor);
    const selection = resolveSelection(project.sources.map((source) => source.id), project.sourceTranscripts, captured.sourceIds, cursor);
    const transcriptBySource = new Map(project.sourceTranscripts.map((transcript) => [transcript.sourceId, transcript]));
    const binding: EditorialTranscriptProjectBinding = {
      projectId: project.project.id,
      projectRevision: project.history.revision,
      ...(project.history.headSnapshotId === undefined ? {} : { projectSnapshotId: project.history.headSnapshotId }),
      sourceTranscripts: selection.sourceIds.map((sourceId) => {
        const transcriptDigest = transcriptBySource.get(sourceId)?.transcriptDigest;
        return { sourceId, ...(transcriptDigest === undefined ? {} : { transcriptDigest }) };
      })
    };
    const sourceBindings = binding.sourceTranscripts.map((item) => ({
      sourceId: item.sourceId,
      transcriptDigest: item.transcriptDigest ?? null
    }));
    const start = cursor === undefined
      ? { sourceIndex: 0, unitIndex: 0, wordOffset: 0 }
      : validateCursor(cursor, binding, selection.mode, sourceBindings);
    const sources = selection.sourceIds.map((sourceId) => buildSource(sourceId, transcriptBySource.get(sourceId)));
    validatePosition(start, sources);
    const maxBytes = captured.maxBytes ?? DEFAULT_EDITORIAL_TRANSCRIPT_PAGE_BYTES;
    const rendered = renderPage(sources, start, maxBytes);
    const publicSources = sources.map(({ units: _units, ...source }) => source);
    const result: EditorialTranscriptProjectionV1 = {
      version: EDITORIAL_TRANSCRIPT_PROJECTION_VERSION,
      profile: EDITORIAL_TRANSCRIPT_PROJECTION_PROFILE,
      binding,
      groupingPolicy: { gapMs: EDITORIAL_TRANSCRIPT_GROUPING_GAP_MS, speakerChange: true },
      selection,
      sources: publicSources,
      reasoningUnits: rendered.units,
      renderedText: rendered.text,
      page: {
        byteLength: utf8Length(rendered.text),
        ...(rendered.next === undefined ? {} : {
          nextCursor: serializeCursor(binding, selection.mode, sourceBindings, rendered.next)
        })
      }
    };
    return deepFreeze(result);
  }
}

function captureRequest(value: EditorialTranscriptProjectionRequest): {
  sourceIds?: string[];
  maxBytes?: number;
  cursor?: string;
} {
  if (!isRecord(value)) throw invalidRequest("request must be an object.");
  const keys = Object.keys(value);
  if (keys.some((key) => !["sourceIds", "maxBytes", "cursor"].includes(key))) {
    throw invalidRequest("request contains an unsupported field.");
  }
  const rawSourceIds = value.sourceIds;
  const rawMaxBytes = value.maxBytes;
  const rawCursor = value.cursor;
  const output: { sourceIds?: string[]; maxBytes?: number; cursor?: string } = {};
  if (rawSourceIds !== undefined) {
    if (!Array.isArray(rawSourceIds) || rawSourceIds.length === 0 || rawSourceIds.some((id) => !isId(id))) {
      throw invalidRequest("sourceIds must be a non-empty array of canonical IDs.");
    }
    const sourceIds = [...rawSourceIds];
    if (new Set(sourceIds).size !== sourceIds.length) throw invalidRequest("sourceIds must not contain duplicates.");
    output.sourceIds = sourceIds;
  }
  if (rawMaxBytes !== undefined) {
    if (typeof rawMaxBytes !== "number" || !Number.isSafeInteger(rawMaxBytes) || rawMaxBytes < MIN_EDITORIAL_TRANSCRIPT_PAGE_BYTES || rawMaxBytes > MAX_EDITORIAL_TRANSCRIPT_PAGE_BYTES) {
      throw invalidRequest(`maxBytes must be an integer between ${MIN_EDITORIAL_TRANSCRIPT_PAGE_BYTES} and ${MAX_EDITORIAL_TRANSCRIPT_PAGE_BYTES}.`);
    }
    output.maxBytes = rawMaxBytes;
  }
  if (rawCursor !== undefined) {
    if (typeof rawCursor !== "string" || rawCursor.length === 0 || rawCursor.length > 1024 * 1024) throw invalidRequest("cursor must be a bounded non-empty string.");
    output.cursor = rawCursor;
  }
  return output;
}

function resolveSelection(
  projectSourceIds: readonly string[],
  transcripts: readonly SourceTranscript[],
  requestedSourceIds: readonly string[] | undefined,
  cursor: CursorV1 | undefined
): { mode: "all" | "explicit"; sourceIds: readonly string[] } {
  const sourceSet = new Set(projectSourceIds);
  const transcriptSet = new Set(transcripts.map((item) => item.sourceId));
  const cursorIds = cursor?.sourceBindings.map((item) => item.sourceId);
  const explicit = requestedSourceIds ?? (cursor?.selectionMode === "explicit" ? cursorIds : undefined);
  const mode = explicit === undefined ? "all" : "explicit";
  const sourceIds = explicit === undefined ? [...projectSourceIds] : [...explicit];
  for (const sourceId of sourceIds) {
    if (!sourceSet.has(sourceId)) {
      throw new EditorialTranscriptProjectionError("EDITORIAL_TRANSCRIPT_SOURCE_NOT_FOUND", `Source ${sourceId} does not exist.`);
    }
    if (mode === "explicit" && !transcriptSet.has(sourceId)) {
      throw new EditorialTranscriptProjectionError("EDITORIAL_TRANSCRIPT_TRANSCRIPT_NOT_FOUND", `Source ${sourceId} has no canonical transcript.`);
    }
  }
  if (cursor !== undefined) {
    if (cursor.selectionMode !== mode || !equalStrings(cursorIds ?? [], sourceIds)) {
      throw new EditorialTranscriptProjectionError("EDITORIAL_TRANSCRIPT_CURSOR_STALE", "Cursor selection no longer matches the request.");
    }
  }
  return { mode, sourceIds };
}

function buildSource(sourceId: string, transcript: SourceTranscript | undefined): SourceInternal {
  if (transcript === undefined) return { sourceId, status: "transcript-unavailable", unitCount: 0, units: [] };
  const units = transcript.transcript.words.length > 0
    ? groupWords(sourceId, transcript)
    : transcript.transcript.segments.map((segment) => segmentUnit(sourceId, transcript.transcriptDigest, segment));
  if (units.length === 0) {
    return { sourceId, status: "no-speech", transcriptDigest: transcript.transcriptDigest, unitCount: 0, units: [] };
  }
  return {
    sourceId,
    status: "projected",
    transcriptDigest: transcript.transcriptDigest,
    basis: transcript.transcript.words.length > 0 ? "words" : "segments",
    unitCount: units.length,
    units
  };
}

function groupWords(sourceId: string, transcript: SourceTranscript): WordUnitInternal[] {
  const groups: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];
  let lastKnownSpeaker: string | undefined;
  for (const word of transcript.transcript.words) {
    const previous = current.at(-1);
    const gapBoundary = previous !== undefined && word.startMs - previous.endMs >= EDITORIAL_TRANSCRIPT_GROUPING_GAP_MS;
    const speakerBoundary = lastKnownSpeaker !== undefined
      && word.speakerId !== undefined
      && lastKnownSpeaker !== word.speakerId;
    if (current.length > 0 && (gapBoundary || speakerBoundary)) {
      groups.push(current);
      current = [];
      lastKnownSpeaker = undefined;
    }
    current.push(word);
    if (word.speakerId !== undefined) lastKnownSpeaker = word.speakerId;
  }
  if (current.length > 0) groups.push(current);
  return groups.map((words) => wordUnit(sourceId, transcript.transcriptDigest, words));
}

function wordUnit(sourceId: string, transcriptDigest: TranscriptDigest, words: readonly TranscriptWord[]): WordUnitInternal {
  const first = words[0]!;
  const last = words.at(-1)!;
  const speakerId = coherentSpeaker(words);
  return {
    id: `${sourceId}:words:${first.id}:${last.id}`,
    sourceId,
    transcriptDigest,
    basis: "words",
    startMs: first.startMs,
    endMs: last.endMs,
    text: renderTokenText(words.map((word) => word.text)),
    wordIds: words.map((word) => word.id),
    ...(speakerId === undefined ? {} : { speakerId }),
    words
  };
}

function segmentUnit(sourceId: string, transcriptDigest: TranscriptDigest, segment: TranscriptSegment): EditorialTranscriptSegmentUnit {
  return {
    id: `${sourceId}:segment:${segment.id}`,
    sourceId,
    transcriptDigest,
    basis: "segments",
    segmentId: segment.id,
    startMs: segment.startMs,
    endMs: segment.endMs,
    text: normalizeStandaloneText(segment.text),
    wordIds: [...segment.wordIds],
    ...(segment.speakerId === undefined ? {} : { speakerId: segment.speakerId })
  };
}

function renderPage(
  sources: readonly SourceInternal[],
  start: Position,
  maxBytes: number
): { text: string; units: EditorialTranscriptReasoningUnit[]; next?: Position } {
  const chunks: string[] = [];
  const units: EditorialTranscriptReasoningUnit[] = [];
  let bytes = 0;
  let position = { ...start };
  while (position.sourceIndex < sources.length) {
    const source = sources[position.sourceIndex]!;
    const header = renderSourceHeader(source);
    if (position.unitIndex === 0 && position.wordOffset === 0) {
      const addedBytes = appendChunk(chunks, header, maxBytes, bytes);
      if (addedBytes === undefined) {
        if (chunks.length === 0) throw unitTooLarge(source.sourceId);
        return { text: chunks.join("\n"), units, next: position };
      }
      bytes += addedBytes;
      if (source.status !== "projected") {
        position = { sourceIndex: position.sourceIndex + 1, unitIndex: 0, wordOffset: 0 };
        continue;
      }
    } else if (chunks.length === 0) {
      const addedBytes = appendChunk(chunks, header, maxBytes, bytes);
      if (addedBytes === undefined) throw unitTooLarge(source.sourceId);
      bytes += addedBytes;
    }

    const unit = source.units[position.unitIndex];
    if (unit === undefined) {
      position = { sourceIndex: position.sourceIndex + 1, unitIndex: 0, wordOffset: 0 };
      continue;
    }
    const fragment = fitUnit(unit, position.wordOffset, maxBytes - bytes - 1);
    if (fragment === undefined) {
      if (chunks.length === 1) throw unitTooLarge(unit.id);
      return { text: chunks.join("\n"), units, next: position };
    }
    const line = renderUnit(fragment.unit);
    const addedBytes = appendChunk(chunks, line, maxBytes, bytes);
    if (addedBytes === undefined) {
      if (chunks.length === 1) throw unitTooLarge(unit.id);
      return { text: chunks.join("\n"), units, next: position };
    }
    bytes += addedBytes;
    units.push(fragment.unit);
    position = fragment.nextWordOffset === undefined
      ? { sourceIndex: position.sourceIndex, unitIndex: position.unitIndex + 1, wordOffset: 0 }
      : { sourceIndex: position.sourceIndex, unitIndex: position.unitIndex, wordOffset: fragment.nextWordOffset };
  }
  return { text: chunks.join("\n"), units };
}

function fitUnit(
  unit: UnitInternal,
  wordOffset: number,
  availableBytes: number
): { unit: EditorialTranscriptReasoningUnit; nextWordOffset?: number } | undefined {
  if (availableBytes <= 0) return undefined;
  if (unit.basis === "segments") {
    if (wordOffset !== 0) throw new EditorialTranscriptProjectionError("EDITORIAL_TRANSCRIPT_CURSOR_INVALID", "Segment cursor has an invalid word offset.");
    return utf8Length(renderUnit(unit)) <= availableBytes ? { unit: publicUnit(unit) } : undefined;
  }
  if (wordOffset < 0 || wordOffset >= unit.words.length) {
    throw new EditorialTranscriptProjectionError("EDITORIAL_TRANSCRIPT_CURSOR_INVALID", "Word cursor offset is invalid.");
  }
  const whole = wordFragment(unit, wordOffset, unit.words.length, wordOffset > 0, false);
  if (utf8Length(renderUnit(whole)) <= availableBytes) return { unit: whole };
  const first = unit.words[wordOffset]!;
  const firstSpeaker = first.speakerId;
  const removableSpeakerBytes = firstSpeaker === undefined ? 0 : utf8Length(renderSpeakerTag(firstSpeaker));
  let speakerCoherent = firstSpeaker !== undefined;
  let fragmentTextBytes = 0;
  let hasFragmentText = false;
  let acceptedEndExclusive: number | undefined;
  for (let endExclusive = wordOffset + 1; endExclusive < unit.words.length; endExclusive += 1) {
    const word = unit.words[endExclusive - 1]!;
    if (endExclusive > wordOffset + 1 && (!speakerCoherent || word.speakerId !== firstSpeaker)) {
      speakerCoherent = false;
    }
    const normalized = normalizeStandaloneText(word.text);
    if (normalized.length > 0) {
      const separator = tokenSeparator(hasFragmentText, normalized);
      fragmentTextBytes += utf8Length(separator) + utf8Length(normalized);
      hasFragmentText = true;
    }
    const continuation: EditorialTranscriptContinuation = {
      scope: "projection-only",
      continuedFromPrevious: wordOffset > 0,
      continuesOnNextPage: true
    };
    const prefix = renderUnitPrefix({
      id: unit.id,
      startMs: first.startMs,
      endMs: word.endMs,
      ...(speakerCoherent ? { speakerId: firstSpeaker } : {}),
      continuation
    });
    const renderedBytes = utf8Length(prefix) + 1 + fragmentTextBytes;
    if (renderedBytes <= availableBytes) acceptedEndExclusive = endExclusive;
    else if (!speakerCoherent || renderedBytes - removableSpeakerBytes > availableBytes) {
      // Text and canonical end time can only grow. A coherent speaker tag can
      // disappear once; this lower bound proves that even that removal cannot fit.
      break;
    }
  }
  if (acceptedEndExclusive === undefined) return undefined;
  return {
    unit: wordFragment(unit, wordOffset, acceptedEndExclusive, wordOffset > 0, true),
    nextWordOffset: acceptedEndExclusive
  };
}

function wordFragment(
  original: WordUnitInternal,
  startIndex: number,
  endIndex: number,
  continuedFromPrevious: boolean,
  continuesOnNextPage: boolean
): EditorialTranscriptWordUnit {
  const words = original.words.slice(startIndex, endIndex);
  const first = words[0]!;
  const last = words.at(-1)!;
  const speakerId = coherentSpeaker(words);
  const continuation = continuedFromPrevious || continuesOnNextPage
    ? { scope: "projection-only" as const, continuedFromPrevious, continuesOnNextPage }
    : undefined;
  return {
    id: original.id,
    sourceId: original.sourceId,
    transcriptDigest: original.transcriptDigest,
    basis: "words",
    startMs: first.startMs,
    endMs: last.endMs,
    text: renderTokenText(words.map((word) => word.text)),
    wordIds: words.map((word) => word.id),
    ...(speakerId === undefined ? {} : { speakerId }),
    ...(continuation === undefined ? {} : { continuation })
  };
}

function publicUnit(unit: UnitInternal): EditorialTranscriptReasoningUnit {
  if (unit.basis === "segments") return { ...unit, wordIds: [...unit.wordIds] };
  const { words: _words, ...output } = unit;
  return { ...output, wordIds: [...output.wordIds] };
}

function renderSourceHeader(source: EditorialTranscriptProjectionSource): string {
  const digest = source.transcriptDigest === undefined ? "none" : source.transcriptDigest;
  return `## source=${JSON.stringify(source.sourceId)} status=${source.status} transcript=${digest}`;
}

function renderUnitPrefix(unit: Pick<EditorialTranscriptReasoningUnit, "id" | "startMs" | "endMs" | "speakerId" | "continuation">): string {
  const speaker = unit.speakerId === undefined ? "" : renderSpeakerTag(unit.speakerId);
  const continuation = unit.continuation === undefined
    ? ""
    : ` continuation=${unit.continuation.continuedFromPrevious ? "from-previous" : "start"}/${unit.continuation.continuesOnNextPage ? "to-next" : "end"}`;
  return `[${unit.startMs}-${unit.endMs}ms]${speaker}${continuation} unit=${JSON.stringify(unit.id)}`;
}

function renderSpeakerTag(speakerId: string): string {
  return ` speaker=${JSON.stringify(speakerId)}`;
}

function renderUnit(unit: EditorialTranscriptReasoningUnit): string {
  return `${renderUnitPrefix(unit)} ${unit.text}`;
}

function appendChunk(chunks: string[], chunk: string, maxBytes: number, currentBytes: number): number | undefined {
  const separatorBytes = chunks.length === 0 ? 0 : 1;
  const addedBytes = separatorBytes + utf8Length(chunk);
  if (currentBytes + addedBytes > maxBytes) return undefined;
  chunks.push(chunk);
  return addedBytes;
}

function serializeCursor(
  binding: EditorialTranscriptProjectBinding,
  selectionMode: "all" | "explicit",
  sourceBindings: CursorV1["sourceBindings"],
  next: Position
): string {
  return JSON.stringify({
    version: 1,
    profile: EDITORIAL_TRANSCRIPT_PROJECTION_PROFILE,
    projectId: binding.projectId,
    projectRevision: binding.projectRevision,
    projectSnapshotId: binding.projectSnapshotId ?? null,
    selectionMode,
    sourceBindings,
    nextSourceIndex: next.sourceIndex,
    nextUnitIndex: next.unitIndex,
    nextWordOffset: next.wordOffset
  } satisfies CursorV1);
}

function parseCursor(value: string): CursorV1 {
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    throw new EditorialTranscriptProjectionError("EDITORIAL_TRANSCRIPT_CURSOR_INVALID", "Cursor is not valid JSON.");
  }
  if (!isRecord(raw) || !equalStrings(Object.keys(raw).sort(), [
    "nextSourceIndex", "nextUnitIndex", "nextWordOffset", "profile", "projectId", "projectRevision",
    "projectSnapshotId", "selectionMode", "sourceBindings", "version"
  ].sort())) throw cursorInvalid();
  if (raw.version !== 1 || raw.profile !== EDITORIAL_TRANSCRIPT_PROJECTION_PROFILE) throw cursorInvalid();
  if (!isId(raw.projectId) || !Number.isSafeInteger(raw.projectRevision) || (raw.projectSnapshotId !== null && !isId(raw.projectSnapshotId))) throw cursorInvalid();
  if (raw.selectionMode !== "all" && raw.selectionMode !== "explicit") throw cursorInvalid();
  if (!Array.isArray(raw.sourceBindings) || raw.sourceBindings.some((item) => !isCursorBinding(item))) throw cursorInvalid();
  if (![raw.nextSourceIndex, raw.nextUnitIndex, raw.nextWordOffset].every((item) => typeof item === "number" && Number.isSafeInteger(item) && item >= 0)) throw cursorInvalid();
  return raw as unknown as CursorV1;
}

function validateCursor(
  cursor: CursorV1,
  binding: EditorialTranscriptProjectBinding,
  selectionMode: "all" | "explicit",
  sourceBindings: CursorV1["sourceBindings"]
): Position {
  if (cursor.projectId !== binding.projectId
    || cursor.projectRevision !== binding.projectRevision
    || cursor.projectSnapshotId !== (binding.projectSnapshotId ?? null)
    || cursor.selectionMode !== selectionMode
    || JSON.stringify(cursor.sourceBindings) !== JSON.stringify(sourceBindings)) {
    throw new EditorialTranscriptProjectionError("EDITORIAL_TRANSCRIPT_CURSOR_STALE", "Cursor does not match the current canonical project snapshot.");
  }
  if (cursor.nextSourceIndex > sourceBindings.length) throw cursorInvalid();
  return {
    sourceIndex: cursor.nextSourceIndex,
    unitIndex: cursor.nextUnitIndex,
    wordOffset: cursor.nextWordOffset
  };
}

function validatePosition(position: Position, sources: readonly SourceInternal[]): void {
  if (position.sourceIndex === sources.length) {
    if (position.unitIndex !== 0 || position.wordOffset !== 0) throw cursorInvalid();
    return;
  }
  const source = sources[position.sourceIndex];
  if (source === undefined) throw cursorInvalid();
  if (source.status !== "projected") {
    if (position.unitIndex !== 0 || position.wordOffset !== 0) throw cursorInvalid();
    return;
  }
  const unit = source.units[position.unitIndex];
  if (unit === undefined) throw cursorInvalid();
  if (unit.basis === "segments" && position.wordOffset !== 0) throw cursorInvalid();
  if (unit.basis === "words" && position.wordOffset >= unit.words.length) throw cursorInvalid();
}

function isCursorBinding(value: unknown): boolean {
  return isRecord(value)
    && equalStrings(Object.keys(value).sort(), ["sourceId", "transcriptDigest"].sort())
    && isId(value.sourceId)
    && (value.transcriptDigest === null || (typeof value.transcriptDigest === "string" && /^sha256-v1:[0-9a-f]{64}$/.test(value.transcriptDigest)));
}

function coherentSpeaker(words: readonly TranscriptWord[]): string | undefined {
  const speaker = words[0]?.speakerId;
  return speaker !== undefined && words.every((word) => word.speakerId === speaker) ? speaker : undefined;
}

function renderTokenText(tokens: readonly string[]): string {
  let output = "";
  for (const token of tokens) {
    const normalized = normalizeStandaloneText(token);
    if (normalized.length === 0) continue;
    output += `${tokenSeparator(output.length > 0, normalized)}${normalized}`;
  }
  return output;
}

function tokenSeparator(hasText: boolean, normalizedToken: string): "" | " " {
  return !hasText || /^[,.;:!?%\])}]/u.test(normalizedToken) ? "" : " ";
}

function normalizeStandaloneText(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value);
}

function equalStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function invalidRequest(message: string): EditorialTranscriptProjectionError {
  return new EditorialTranscriptProjectionError("EDITORIAL_TRANSCRIPT_INVALID_REQUEST", message);
}

function cursorInvalid(): EditorialTranscriptProjectionError {
  return new EditorialTranscriptProjectionError("EDITORIAL_TRANSCRIPT_CURSOR_INVALID", "Cursor has an unsupported shape.");
}

function unitTooLarge(id: string): EditorialTranscriptProjectionError {
  return new EditorialTranscriptProjectionError("EDITORIAL_TRANSCRIPT_UNIT_TOO_LARGE", `Reasoning unit ${id} cannot fit without unsafe truncation.`);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
