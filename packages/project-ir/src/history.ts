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
