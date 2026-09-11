import { applyCommand } from "./commands.js";
import { assertValidProjectIR } from "./validation.js";
import type { EditCommand, Id, ProjectIR } from "./types.js";

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

export interface HistoryOptions {
  idGenerator?: () => string;
  clock?: () => string;
}

export interface HistoryArchive {
  version: 1;
  entries: JournalEntry[];
  snapshots: ProjectSnapshot[];
  cursorSnapshotId: Id;
}

export class ProjectHistory {
  private readonly idGenerator: () => string;
  private readonly clock: () => string;
  private entriesInternal: JournalEntry[] = [];
  private snapshotsInternal: ProjectSnapshot[] = [];
  private cursor = 0;

  constructor(initialProject: ProjectIR, options: HistoryOptions = {}) {
    this.idGenerator = options.idGenerator ?? defaultId;
    this.clock = options.clock ?? (() => new Date().toISOString());
    const project = assertValidProjectIR(clone(initialProject));
    const now = this.clock();
    const snapshotId = this.idGenerator();
    const revision = project.history.revision;
    const headEntryId = project.history.headEntryId;
    project.history = { revision, ...(headEntryId ? { headEntryId } : {}), headSnapshotId: snapshotId };
    this.snapshotsInternal.push({ id: snapshotId, revision, createdAt: now, project: clone(project) });
  }

  get current(): ProjectIR {
    return clone(this.snapshotsInternal[this.cursor]!.project);
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

  get snapshots(): readonly ProjectSnapshot[] {
    return clone(this.snapshotsInternal);
  }

  toArchive(): HistoryArchive {
    return {
      version: 1,
      entries: clone(this.entriesInternal),
      snapshots: clone(this.snapshotsInternal),
      cursorSnapshotId: this.snapshotsInternal[this.cursor]!.id
    };
  }

  static fromArchive(archive: HistoryArchive, options: HistoryOptions = {}): ProjectHistory {
    validateArchive(archive);
    const baseline = archive.snapshots[0]!.project;
    const history = new ProjectHistory(baseline, options);
    history.entriesInternal = clone(archive.entries);
    history.snapshotsInternal = clone(archive.snapshots);
    const cursor = history.snapshotsInternal.findIndex((snapshot) => snapshot.id === archive.cursorSnapshotId);
    if (cursor < 0) throw new Error(`History cursor references unknown snapshot ${archive.cursorSnapshotId}.`);
    history.cursor = cursor;
    return history;
  }

  commit(command: EditCommand, actor: JournalActor = { type: "user" }): ProjectIR {
    if (this.canRedo) {
      this.snapshotsInternal = this.snapshotsInternal.slice(0, this.cursor + 1);
      const maxRevision = this.snapshotsInternal[this.snapshotsInternal.length - 1]!.revision;
      this.entriesInternal = this.entriesInternal.filter((entry) => entry.revision <= maxRevision);
    }

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
    this.entriesInternal.push(entry);
    this.snapshotsInternal.push({ id: snapshotId, revision, createdAt: now, project: clone(validated) });
    this.cursor = this.snapshotsInternal.length - 1;
    return this.current;
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
}

function defaultId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `cevra_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validateArchive(archive: HistoryArchive): void {
  if (archive.version !== 1) throw new Error(`Unsupported history archive version ${String(archive.version)}.`);
  if (!Array.isArray(archive.snapshots) || archive.snapshots.length === 0) throw new Error("History archive must contain at least one snapshot.");
  if (!Array.isArray(archive.entries)) throw new Error("History archive entries must be an array.");

  const snapshotIds = new Set<string>();
  let previousRevision = -1;
  for (const snapshot of archive.snapshots) {
    if (snapshotIds.has(snapshot.id)) throw new Error(`Duplicate snapshot id ${snapshot.id}.`);
    snapshotIds.add(snapshot.id);
    assertValidProjectIR(snapshot.project);
    if (snapshot.project.history.revision !== snapshot.revision) throw new Error(`Snapshot ${snapshot.id} revision does not match Project IR history.`);
    if (snapshot.revision <= previousRevision) throw new Error("Snapshot revisions must be strictly increasing.");
    previousRevision = snapshot.revision;
  }
  if (!snapshotIds.has(archive.cursorSnapshotId)) throw new Error(`History cursor references unknown snapshot ${archive.cursorSnapshotId}.`);

  const entryIds = new Set<string>();
  for (const entry of archive.entries) {
    if (entryIds.has(entry.id)) throw new Error(`Duplicate journal entry id ${entry.id}.`);
    entryIds.add(entry.id);
    const snapshot = archive.snapshots.find((candidate) => candidate.id === entry.snapshotId);
    if (!snapshot) throw new Error(`Journal entry ${entry.id} references unknown snapshot ${entry.snapshotId}.`);
    if (snapshot.revision !== entry.revision) throw new Error(`Journal entry ${entry.id} revision does not match its snapshot.`);
    if (snapshot.project.history.headEntryId !== entry.id) throw new Error(`Snapshot ${snapshot.id} does not point to journal entry ${entry.id}.`);
  }
}
