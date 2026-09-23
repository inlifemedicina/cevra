import type {
  MediaExecutionIntentStatus,
  MediaExecutionIntentV1,
  MediaExecutionRecord,
  MediaExecutionStatus
} from "./types.js";

export class MediaExecutionAlreadyExistsError extends Error {
  constructor(readonly id: string) {
    super(`Media execution ${id} already exists.`);
    this.name = "MediaExecutionAlreadyExistsError";
  }
}

export interface MediaExecutionRepository {
  get(id: string): Promise<MediaExecutionRecord | undefined>;
  create(record: MediaExecutionRecord): Promise<void>;
  save(record: MediaExecutionRecord): Promise<void>;
  listByStatus(projectId: string, statuses: readonly MediaExecutionStatus[]): Promise<MediaExecutionRecord[]>;
}

export interface MediaExecutionIntentRepository {
  getIntent(id: string): Promise<MediaExecutionIntentV1 | undefined>;
  createIntent(intent: MediaExecutionIntentV1): Promise<void>;
  saveIntent(intent: MediaExecutionIntentV1): Promise<void>;
  listIntentsByStatus(projectId: string, statuses: readonly MediaExecutionIntentStatus[]): Promise<MediaExecutionIntentV1[]>;
}

export interface MediaExecutionArchive {
  version: 1;
  records: MediaExecutionRecord[];
  intents?: MediaExecutionIntentV1[];
}

export class InMemoryMediaExecutionRepository implements MediaExecutionRepository, MediaExecutionIntentRepository {
  private readonly records = new Map<string, MediaExecutionRecord>();
  private readonly intents = new Map<string, MediaExecutionIntentV1>();

  constructor(archive?: MediaExecutionArchive) {
    if (archive) {
      if (archive.version !== 1 || !Array.isArray(archive.records)) throw new Error("Invalid media execution archive.");
      for (const record of archive.records) this.records.set(record.id, clone(record));
      for (const intent of archive.intents ?? []) this.intents.set(intent.id, clone(intent));
    }
  }

  async get(id: string): Promise<MediaExecutionRecord | undefined> {
    const record = this.records.get(id);
    return record ? clone(record) : undefined;
  }

  async save(record: MediaExecutionRecord): Promise<void> {
    this.records.set(record.id, clone(record));
  }

  async create(record: MediaExecutionRecord): Promise<void> {
    if (this.records.has(record.id)) throw new MediaExecutionAlreadyExistsError(record.id);
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
    return {
      version: 1,
      records: [...this.records.values()].map(clone),
      intents: [...this.intents.values()].map(clone)
    };
  }

  async getIntent(id: string): Promise<MediaExecutionIntentV1 | undefined> {
    const intent = this.intents.get(id);
    return intent ? clone(intent) : undefined;
  }

  async createIntent(intent: MediaExecutionIntentV1): Promise<void> {
    if (this.intents.has(intent.id)) throw new MediaExecutionAlreadyExistsError(intent.id);
    this.intents.set(intent.id, clone(intent));
  }

  async saveIntent(intent: MediaExecutionIntentV1): Promise<void> {
    this.intents.set(intent.id, clone(intent));
  }

  async listIntentsByStatus(
    projectId: string,
    statuses: readonly MediaExecutionIntentStatus[]
  ): Promise<MediaExecutionIntentV1[]> {
    const allowed = new Set(statuses);
    return [...this.intents.values()]
      .filter((intent) => intent.projectId === projectId && allowed.has(intent.status))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(clone);
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
