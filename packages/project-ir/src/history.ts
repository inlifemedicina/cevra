import { applyCommand } from "./commands.js";
import {
  computeHistoryTranscriptBlobDigest,
  isHistoryTranscriptBlobDigest,
  type HistoryTranscriptBlobDigest
} from "./history-transcript-digest.js";
import { assertValidProjectIR, assertValidSourceTranscriptInProject } from "./validation.js";
import type { EditCommand, Id, ProjectIR, SourceTranscript } from "./types.js";

export interface JournalActor {
  type: "user" | "agent" | "system";
  id?: string;
}

export interface JournalEntry {
  id: Id;
  revision: number;
  parentEntryId?: Id;
  command: EditCommand;
  actor: JournalActor;
  createdAt: string;
  snapshotId: Id;
}

export interface ProjectSnapshot {
  id: Id;
  revision: number;
  createdAt: string;
  project: ProjectIR;
}

export type ProjectWithoutSourceTranscripts = Omit<ProjectIR, "sourceTranscripts">;

export interface HistoryTranscriptRef {
  sourceId: Id;
  digest: HistoryTranscriptBlobDigest;
}

export interface CompactProjectSnapshot {
  id: Id;
  revision: number;
  createdAt: string;
  project: ProjectWithoutSourceTranscripts;
  sourceTranscriptRefs: HistoryTranscriptRef[];
}

export interface HistoryTranscriptBlob {
  digest: HistoryTranscriptBlobDigest;
  transcript: SourceTranscript;
}

export interface HistoryOptions {
  idGenerator?: () => string;
  clock?: () => string;
}

export interface HistoryArchiveV1 {
  version: 1;
  entries: JournalEntry[];
  snapshots: ProjectSnapshot[];
  cursorSnapshotId: Id;
}

export interface HistoryArchiveV2 {
  version: 2;
  entries: JournalEntry[];
  snapshots: CompactProjectSnapshot[];
  transcriptBlobs: HistoryTranscriptBlob[];
  cursorSnapshotId: Id;
}

export type HistoryArchive = HistoryArchiveV1 | HistoryArchiveV2;

export class ProjectHistory {
  private readonly idGenerator: () => string;
  private readonly clock: () => string;
  private entriesInternal: JournalEntry[] = [];
  private snapshotsInternal: CompactProjectSnapshot[] = [];
  private transcriptBlobs = new Map<HistoryTranscriptBlobDigest, SourceTranscript>();
  private cursor = 0;

  constructor(initialProject: ProjectIR, options: HistoryOptions = {}) {
    this.idGenerator = options.idGenerator ?? defaultId;
    this.clock = options.clock ?? (() => new Date().toISOString());
    const project = assertValidProjectIR(initialProject);
    for (const transcript of project.sourceTranscripts) computeHistoryTranscriptBlobDigest(transcript);
    const now = this.clock();
    const snapshotId = this.idGenerator();
    const revision = project.history.revision;
    const headEntryId = project.history.headEntryId;
    const withSnapshot = assertValidProjectIR(clone({
      ...project,
      history: { revision, ...(headEntryId ? { headEntryId } : {}), headSnapshotId: snapshotId }
    }));
    this.snapshotsInternal.push(this.compactSnapshot(snapshotId, revision, now, withSnapshot));
  }

  get current(): ProjectIR {
    return this.materialize(this.snapshotsInternal[this.cursor]!);
  }

  get canUndo(): boolean {
    return this.cursor > 0;
  }

  get canRedo(): boolean {
    return this.cursor < this.snapshotsInternal.length - 1;
  }

  get entries(): readonly JournalEntry[] {
    return clone(this.entriesInternal);
  }

  /** Compatibility API. Persistence should use toArchive() to avoid materializing every heavy snapshot. */
  get snapshots(): readonly ProjectSnapshot[] {
    return this.snapshotsInternal.map((snapshot) => ({
      id: snapshot.id,
      revision: snapshot.revision,
      createdAt: snapshot.createdAt,
      project: this.materialize(snapshot)
    }));
  }

  retainedMediaUris(): readonly string[] {
    const uris = new Set<string>();
    for (const snapshot of this.snapshotsInternal) {
      for (const source of snapshot.project.sources) uris.add(source.uri);
      for (const record of snapshot.project.exports) if (record.outputUri) uris.add(record.outputUri);
    }
    return [...uris];
  }

  toArchive(): HistoryArchiveV2 {
    const reachable = new Set<HistoryTranscriptBlobDigest>();
    for (const snapshot of this.snapshotsInternal) {
      for (const ref of snapshot.sourceTranscriptRefs) reachable.add(ref.digest);
    }
    const transcriptBlobs = [...reachable].sort().map((digest) => {
      const transcript = this.transcriptBlobs.get(digest);
      if (!transcript) throw new Error(`History snapshot references missing transcript blob ${digest}.`);
      return { digest, transcript: clone(transcript) };
    });
    return {
      version: 2,
      entries: clone(this.entriesInternal),
      snapshots: clone(this.snapshotsInternal),
      transcriptBlobs,
      cursorSnapshotId: this.snapshotsInternal[this.cursor]!.id
    };
  }

  static fromArchive(archive: HistoryArchive, options: HistoryOptions = {}): ProjectHistory {
    if (archive.version === 1) {
      validateArchiveV1(archive);
      const history = new ProjectHistory(archive.snapshots[0]!.project, options);
      history.entriesInternal = clone(archive.entries);
      history.snapshotsInternal = [];
      history.transcriptBlobs.clear();
      for (const snapshot of archive.snapshots) {
        history.snapshotsInternal.push(history.compactSnapshot(snapshot.id, snapshot.revision, snapshot.createdAt, snapshot.project));
      }
      history.restoreArchiveCursor(archive.cursorSnapshotId);
      return history;
    }
    if (archive.version === 2) {
      const blobs = validateArchiveV2(archive);
      const first = materializeSnapshot(archive.snapshots[0]!, blobs);
      const history = new ProjectHistory(first, options);
      history.entriesInternal = clone(archive.entries);
      history.snapshotsInternal = clone(archive.snapshots);
      history.transcriptBlobs = new Map([...blobs].map(([digest, transcript]) => [digest, clone(transcript)]));
      history.restoreArchiveCursor(archive.cursorSnapshotId);
      return history;
    }
    throw new Error(`Unsupported history archive version ${String((archive as { version?: unknown }).version)}.`);
  }

  commit(command: EditCommand, actor: JournalActor = { type: "user" }): ProjectIR {
    const before = this.current;
    const now = this.clock();
    const next = applyCommand(before, command, now);
    const revision = before.history.revision + 1;
    const entryId = this.idGenerator();
    const snapshotId = this.idGenerator();
    const parentEntryId = before.history.headEntryId;

    next.history = { revision, headEntryId: entryId, headSnapshotId: snapshotId };
    const validated = assertValidProjectIR(next);
    const entry: JournalEntry = {
      id: entryId,
      revision,
      ...(parentEntryId ? { parentEntryId } : {}),
      command: clone(command),
      actor: clone(actor),
      createdAt: now,
      snapshotId
    };
    const changedTranscriptSourceId = transcriptMutationSource(command);
    const snapshot = this.compactSnapshot(
      snapshotId,
      revision,
      now,
      validated,
      this.snapshotsInternal[this.cursor]!.sourceTranscriptRefs,
      changedTranscriptSourceId
    );
    const retainedSnapshots = this.canRedo ? this.snapshotsInternal.slice(0, this.cursor + 1) : [...this.snapshotsInternal];
    const retainedEntries = this.canRedo
      ? this.entriesInternal.filter((item) => item.revision <= retainedSnapshots[retainedSnapshots.length - 1]!.revision)
      : [...this.entriesInternal];

    this.entriesInternal = [...retainedEntries, entry];
    this.snapshotsInternal = [...retainedSnapshots, snapshot];
    this.cursor = this.snapshotsInternal.length - 1;
    return validated;
  }

  undo(): ProjectIR {
    if (!this.canUndo) return this.current;
    this.cursor -= 1;
    return this.current;
  }

  redo(): ProjectIR {
    if (!this.canRedo) return this.current;
    this.cursor += 1;
    return this.current;
  }

  restoreSnapshot(snapshotId: string): ProjectIR {
    const index = this.snapshotsInternal.findIndex((snapshot) => snapshot.id === snapshotId);
    if (index < 0) throw new Error(`Unknown snapshot ${snapshotId}.`);
    this.cursor = index;
    return this.current;
  }

  private compactSnapshot(
    id: Id,
    revision: number,
    createdAt: string,
    input: ProjectIR,
    reusableRefs: readonly HistoryTranscriptRef[] = [],
    changedTranscriptSourceId?: Id
  ): CompactProjectSnapshot {
    const reusableBySourceId = new Map(reusableRefs.map((ref) => [ref.sourceId, ref]));
    const sourceTranscriptRefs = input.sourceTranscripts.map((transcript) => {
      const reusable = reusableBySourceId.get(transcript.sourceId);
      if (reusable && transcript.sourceId !== changedTranscriptSourceId) return clone(reusable);
      const digest = computeHistoryTranscriptBlobDigest(transcript);
      if (!this.transcriptBlobs.has(digest)) this.transcriptBlobs.set(digest, clone(transcript));
      return { sourceId: transcript.sourceId, digest };
    });
    const { sourceTranscripts: _sourceTranscripts, ...projectWithoutSourceTranscripts } = input;
    return { id, revision, createdAt, project: clone(projectWithoutSourceTranscripts), sourceTranscriptRefs };
  }

  private materialize(snapshot: CompactProjectSnapshot): ProjectIR {
    return materializeSnapshot(snapshot, this.transcriptBlobs);
  }

  private restoreArchiveCursor(cursorSnapshotId: Id): void {
    const cursor = this.snapshotsInternal.findIndex((snapshot) => snapshot.id === cursorSnapshotId);
    if (cursor < 0) throw new Error(`History cursor references unknown snapshot ${cursorSnapshotId}.`);
    this.cursor = cursor;
  }
}

function defaultId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `cevra_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function transcriptMutationSource(command: EditCommand): Id | undefined {
  switch (command.type) {
    case "source.remove":
    case "transcript.remove":
      return command.sourceId;
    case "transcript.set":
      return command.transcript.sourceId;
    case "project.rename":
    case "source.add":
    case "track.add":
    case "track.remove":
    case "clip.add":
    case "clip.remove":
    case "clip.trim":
    case "caption.upsert":
    case "caption.remove":
    case "style.patch":
    case "export.add":
      return undefined;
    default:
      return assertNever(command);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported edit command ${JSON.stringify(value)}.`);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function materializeSnapshot(
  snapshot: CompactProjectSnapshot,
  blobs: ReadonlyMap<HistoryTranscriptBlobDigest, SourceTranscript>
): ProjectIR {
  const sourceTranscripts = snapshot.sourceTranscriptRefs.map((ref) => {
    const transcript = blobs.get(ref.digest);
    if (!transcript) throw new Error(`History snapshot ${snapshot.id} references missing transcript blob ${ref.digest}.`);
    if (transcript.sourceId !== ref.sourceId) throw new Error(`History snapshot ${snapshot.id} transcript ref/source mismatch for ${ref.digest}.`);
    return clone(transcript);
  });
  return assertValidProjectIR(clone({ ...snapshot.project, sourceTranscripts }));
}

function validateArchiveV1(archive: HistoryArchiveV1): void {
  if (!Array.isArray(archive.snapshots) || archive.snapshots.length === 0) throw new Error("History archive must contain at least one snapshot.");
  if (!Array.isArray(archive.entries)) throw new Error("History archive entries must be an array.");
  validateSnapshotsAndEntries(archive.snapshots.map((snapshot) => {
    assertValidProjectIR(snapshot.project);
    if (snapshot.project.history.revision !== snapshot.revision) throw new Error(`Snapshot ${snapshot.id} revision does not match Project IR history.`);
    return { ...snapshot, headEntryId: snapshot.project.history.headEntryId };
  }), archive.entries, archive.cursorSnapshotId);
}

function validateArchiveV2(archive: HistoryArchiveV2): Map<HistoryTranscriptBlobDigest, SourceTranscript> {
  if (!Array.isArray(archive.snapshots) || archive.snapshots.length === 0) throw new Error("History archive must contain at least one snapshot.");
  if (!Array.isArray(archive.entries)) throw new Error("History archive entries must be an array.");
  if (!Array.isArray(archive.transcriptBlobs)) throw new Error("History archive transcriptBlobs must be an array.");

  const blobs = new Map<HistoryTranscriptBlobDigest, SourceTranscript>();
  for (const blob of archive.transcriptBlobs) {
    if (!isHistoryTranscriptBlobDigest(blob?.digest)) throw new Error(`Invalid history transcript blob digest ${String(blob?.digest)}.`);
    if (blobs.has(blob.digest)) throw new Error(`Duplicate transcript blob digest ${blob.digest}.`);
    const computed = computeHistoryTranscriptBlobDigest(blob.transcript);
    if (computed !== blob.digest) throw new Error(`History transcript blob digest mismatch for ${blob.digest}.`);
    blobs.set(blob.digest, blob.transcript);
  }

  const validatedTranscriptContexts = new Set<string>();
  const validated = archive.snapshots.map((snapshot) => {
    if (Object.hasOwn(snapshot.project as object, "sourceTranscripts")) throw new Error(`Compact snapshot ${snapshot.id} embeds sourceTranscripts.`);
    if (!Array.isArray(snapshot.sourceTranscriptRefs)) throw new Error(`Compact snapshot ${snapshot.id} transcript refs must be an array.`);
    const project = assertValidProjectIR(clone({ ...snapshot.project, sourceTranscripts: [] }));
    const sourceById = new Map(project.sources.map((source) => [source.id, source]));
    const referencedSourceIds = new Set<string>();
    for (const ref of snapshot.sourceTranscriptRefs) {
      if (typeof ref?.sourceId !== "string" || !isHistoryTranscriptBlobDigest(ref?.digest)) throw new Error(`Compact snapshot ${snapshot.id} has an invalid transcript ref.`);
      if (referencedSourceIds.has(ref.sourceId)) throw new Error(`Compact snapshot ${snapshot.id} has duplicate transcript refs for ${ref.sourceId}.`);
      referencedSourceIds.add(ref.sourceId);
      const transcript = blobs.get(ref.digest);
      if (!transcript) throw new Error(`History snapshot ${snapshot.id} references missing transcript blob ${ref.digest}.`);
      if (transcript.sourceId !== ref.sourceId) throw new Error(`History snapshot ${snapshot.id} transcript ref/source mismatch for ${ref.digest}.`);
      const source = sourceById.get(ref.sourceId);
      if (!source) throw new Error(`History snapshot ${snapshot.id} transcript references unknown source ${ref.sourceId}.`);
      const contextKey = JSON.stringify([ref.digest, source.id, source.kind, source.durationMs ?? null, source.checksum ?? null]);
      if (!validatedTranscriptContexts.has(contextKey)) {
        assertValidSourceTranscriptInProject(transcript, source);
        validatedTranscriptContexts.add(contextKey);
      }
    }
    if (project.history.revision !== snapshot.revision) throw new Error(`Snapshot ${snapshot.id} revision does not match Project IR history.`);
    return { ...snapshot, headEntryId: project.history.headEntryId };
  });
  validateSnapshotsAndEntries(validated, archive.entries, archive.cursorSnapshotId);
  return blobs;
}

function validateSnapshotsAndEntries(
  snapshots: Array<{ id: Id; revision: number; headEntryId: Id | undefined }>,
  entries: JournalEntry[],
  cursorSnapshotId: Id
): void {
  const snapshotIds = new Set<string>();
  let previousRevision = -1;
  for (const snapshot of snapshots) {
    if (snapshotIds.has(snapshot.id)) throw new Error(`Duplicate snapshot id ${snapshot.id}.`);
    snapshotIds.add(snapshot.id);
    if (!Number.isInteger(snapshot.revision) || snapshot.revision <= previousRevision) throw new Error("Snapshot revisions must be strictly increasing.");
    previousRevision = snapshot.revision;
  }
  if (!snapshotIds.has(cursorSnapshotId)) throw new Error(`History cursor references unknown snapshot ${cursorSnapshotId}.`);

  const entryIds = new Set<string>();
  for (const entry of entries) {
    if (entryIds.has(entry.id)) throw new Error(`Duplicate journal entry id ${entry.id}.`);
    entryIds.add(entry.id);
    const snapshot = snapshots.find((candidate) => candidate.id === entry.snapshotId);
    if (!snapshot) throw new Error(`Journal entry ${entry.id} references unknown snapshot ${entry.snapshotId}.`);
    if (snapshot.revision !== entry.revision) throw new Error(`Journal entry ${entry.id} revision does not match its snapshot.`);
    if (snapshot.headEntryId !== entry.id) throw new Error(`Snapshot ${snapshot.id} does not point to journal entry ${entry.id}.`);
  }
}
