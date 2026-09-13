import type { MediaExecutionRecord, MediaExecutionStatus } from "./types.js";

export interface MediaExecutionRepository {
  get(id: string): Promise<MediaExecutionRecord | undefined>;
  save(record: MediaExecutionRecord): Promise<void>;
  listByStatus(projectId: string, statuses: readonly MediaExecutionStatus[]): Promise<MediaExecutionRecord[]>;
}

export interface MediaExecutionArchive {
  version: 1;
  records: MediaExecutionRecord[];
}

export class InMemoryMediaExecutionRepository implements MediaExecutionRepository {
  private readonly records = new Map<string, MediaExecutionRecord>();

  constructor(archive?: MediaExecutionArchive) {
    if (archive) {
      if (archive.version !== 1 || !Array.isArray(archive.records)) throw new Error("Invalid media execution archive.");
      for (const record of archive.records) this.records.set(record.id, clone(record));
    }
  }

  async get(id: string): Promise<MediaExecutionRecord | undefined> {
    const record = this.records.get(id);
    return record ? clone(record) : undefined;
  }

  async save(record: MediaExecutionRecord): Promise<void> {
    this.records.set(record.id, clone(record));
  }

  async listByStatus(projectId: string, statuses: readonly MediaExecutionStatus[]): Promise<MediaExecutionRecord[]> {
    const allowed = new Set(statuses);
    return [...this.records.values()]
      .filter((record) => record.projectId === projectId && allowed.has(record.status))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(clone);
  }

  toArchive(): MediaExecutionArchive {
    return { version: 1, records: [...this.records.values()].map(clone) };
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
