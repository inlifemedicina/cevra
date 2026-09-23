import {
  MAX_MEDIA_EXECUTION_ARCHIVE_BYTES,
  MAX_MEDIA_EXECUTION_INTENTS,
  MAX_MEDIA_EXECUTION_RECORDS,
  MediaExecutionAlreadyExistsError,
  validateMediaExecutionIntent,
  validateMediaExecutionRecord,
  validatePersistedMediaExecutionArchive,
  type MediaExecutionIntentRepository,
  type MediaExecutionIntentStatus,
  type MediaExecutionIntentV1,
  type MediaExecutionRecord,
  type MediaExecutionRepository,
  type MediaExecutionStatus,
  type PersistedMediaExecutionArchiveV1
} from "@cevra/application";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, readdir, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";

export const MEDIA_EXECUTION_ARCHIVE_FILE = "media-executions.v1.cevra.json";
const TEMP_PREFIX = ".media-execution-archive-";
const INVALID_PREFIX = "media-executions.invalid-";
const FORMAT = "cevra-media-execution-archive";
const MAX_QUARANTINES = 2;

export type MediaExecutionArchiveHealth = "healthy" | "recovered-corrupt" | "recovered-project-mismatch";
export type MediaExecutionArchiveFaultPoint =
  | "before-temp-write"
  | "during-temp-write"
  | "before-rename"
  | "after-rename"
  | "directory-sync";

export class DesktopMediaExecutionArchiveError extends Error {
  constructor(readonly code: "MEDIA_EXECUTION_ARCHIVE_UNAVAILABLE" | "MEDIA_EXECUTION_ARCHIVE_INVALID") {
    super(code);
    this.name = "DesktopMediaExecutionArchiveError";
  }
}

interface IntegrityEnvelopeV1 {
  format: typeof FORMAT;
  version: 1;
  integrity: { algorithm: "sha256"; value: string };
  archive: PersistedMediaExecutionArchiveV1;
}

export interface DesktopMediaExecutionRepositoryOptions {
  root: string;
  projectId: string;
  assertOwned: () => Promise<void>;
  injectFault?: (point: MediaExecutionArchiveFaultPoint) => void;
}

export class DesktopMediaExecutionRepository implements MediaExecutionRepository, MediaExecutionIntentRepository {
  private queue: Promise<void> = Promise.resolve();
  private writeBlocked = false;

  private constructor(
    private readonly options: DesktopMediaExecutionRepositoryOptions,
    private state: PersistedMediaExecutionArchiveV1,
    readonly health: MediaExecutionArchiveHealth
  ) {}

  static async open(options: DesktopMediaExecutionRepositoryOptions): Promise<DesktopMediaExecutionRepository> {
    await options.assertOwned();
    await rejectUnsafeTempArtifacts(options.root);
    const canonical = resolve(options.root, MEDIA_EXECUTION_ARCHIVE_FILE);
    const found = await pathKind(canonical);
    if (found === "missing") {
      const state = emptyArchive(options.projectId);
      const repository = new DesktopMediaExecutionRepository(options, state, "healthy");
      await repository.persist(state);
      return repository;
    }

    try {
      if (found !== "file") throw new Error("Archive path is not a regular file.");
      const state = await readEnvelope(canonical);
      if (state.projectId !== options.projectId) throw new ProjectMismatchError();
      return new DesktopMediaExecutionRepository(options, state, "healthy");
    } catch (cause) {
      if (!(cause instanceof ProjectMismatchError)
        && !(cause instanceof DesktopMediaExecutionArchiveError && cause.code === "MEDIA_EXECUTION_ARCHIVE_INVALID")) {
        throw unavailable();
      }
      const health: MediaExecutionArchiveHealth = cause instanceof ProjectMismatchError
        ? "recovered-project-mismatch"
        : "recovered-corrupt";
      await quarantineInvalidArchive(options.root, canonical);
      const state = emptyArchive(options.projectId);
      const repository = new DesktopMediaExecutionRepository(options, state, health);
      await repository.persist(state);
      return repository;
    }
  }

  async get(id: string): Promise<MediaExecutionRecord | undefined> {
    await this.queue;
    const record = this.state.records.find((item) => item.id === id);
    return record ? clone(record) : undefined;
  }

  async create(record: MediaExecutionRecord): Promise<void> {
    return this.mutate((state) => {
      const validated = validateMediaExecutionRecord(record);
      this.assertProject(validated.projectId);
      if (state.records.some(({ id }) => id === validated.id)) throw new MediaExecutionAlreadyExistsError(validated.id);
      if (state.records.length >= MAX_MEDIA_EXECUTION_RECORDS) throw invalid();
      state.records.push(validated);
    });
  }

  async save(record: MediaExecutionRecord): Promise<void> {
    return this.mutate((state) => {
      const validated = validateMediaExecutionRecord(record);
      this.assertProject(validated.projectId);
      const index = state.records.findIndex(({ id }) => id === validated.id);
      if (index < 0) throw new Error("Cannot update an execution record that was not atomically created.");
      state.records[index] = validated;
    });
  }

  async listByStatus(projectId: string, statuses: readonly MediaExecutionStatus[]): Promise<MediaExecutionRecord[]> {
    await this.queue;
    this.assertProject(projectId);
    const allowed = new Set(statuses);
    return this.state.records.filter((record) => allowed.has(record.status))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)).map(clone);
  }

  async getIntent(id: string): Promise<MediaExecutionIntentV1 | undefined> {
    await this.queue;
    const intent = this.state.intents.find((item) => item.id === id);
    return intent ? clone(intent) : undefined;
  }

  async createIntent(intent: MediaExecutionIntentV1): Promise<void> {
    return this.mutate((state) => {
      const validated = validateMediaExecutionIntent(intent);
      this.assertProject(validated.projectId);
      if (state.intents.some(({ id }) => id === validated.id)) throw new MediaExecutionAlreadyExistsError(validated.id);
      if (state.intents.length >= MAX_MEDIA_EXECUTION_INTENTS) throw invalid();
      state.intents.push(validated);
    });
  }

  async saveIntent(intent: MediaExecutionIntentV1): Promise<void> {
    return this.mutate((state) => {
      const validated = validateMediaExecutionIntent(intent);
      this.assertProject(validated.projectId);
      const index = state.intents.findIndex(({ id }) => id === validated.id);
      if (index < 0) throw new Error("Cannot update an execution intent that was not atomically created.");
      state.intents[index] = validated;
    });
  }

  async listIntentsByStatus(projectId: string, statuses: readonly MediaExecutionIntentStatus[]): Promise<MediaExecutionIntentV1[]> {
    await this.queue;
    this.assertProject(projectId);
    const allowed = new Set(statuses);
    return this.state.intents.filter((intent) => allowed.has(intent.status))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)).map(clone);
  }

  snapshot(): PersistedMediaExecutionArchiveV1 { return clone(this.state); }

  private assertProject(projectId: string): void {
    if (projectId !== this.options.projectId) throw invalid();
  }

  private mutate(change: (state: PersistedMediaExecutionArchiveV1) => void): Promise<void> {
    const operation = this.queue.then(async () => {
      if (this.writeBlocked) throw unavailable();
      await this.options.assertOwned();
      const next = clone(this.state);
      change(next);
      validatePersistedMediaExecutionArchive(next);
      try {
        await this.persist(next);
      } catch (cause) {
        this.writeBlocked = true;
        throw cause;
      }
      this.state = next;
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async persist(state: PersistedMediaExecutionArchiveV1): Promise<void> {
    await this.options.assertOwned();
    const envelope = encodeEnvelope(validatePersistedMediaExecutionArchive(state));
    const payload = `${JSON.stringify(envelope)}\n`;
    if (Buffer.byteLength(payload, "utf8") > MAX_MEDIA_EXECUTION_ARCHIVE_BYTES) throw invalid();
    const canonical = resolve(this.options.root, MEDIA_EXECUTION_ARCHIVE_FILE);
    const temporary = resolve(this.options.root, `${TEMP_PREFIX}${process.pid}-${randomUUID()}.tmp`);
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      this.options.injectFault?.("before-temp-write");
      file = await open(temporary, "wx", 0o600);
      this.options.injectFault?.("during-temp-write");
      await file.writeFile(payload, "utf8");
      await file.sync();
      await file.close();
      file = undefined;
      await readEnvelope(temporary);
      this.options.injectFault?.("before-rename");
      await rename(temporary, canonical);
      this.options.injectFault?.("after-rename");
      await syncDirectory(this.options.root, this.options.injectFault);
    } catch (cause) {
      await file?.close().catch(() => undefined);
      await rm(temporary, { force: true }).catch(() => undefined);
      if (cause instanceof DesktopMediaExecutionArchiveError || cause instanceof MediaExecutionAlreadyExistsError) throw cause;
      throw unavailable();
    }
  }
}

function emptyArchive(projectId: string): PersistedMediaExecutionArchiveV1 {
  return { version: 1, projectId, records: [], intents: [] };
}

function encodeEnvelope(archive: PersistedMediaExecutionArchiveV1): IntegrityEnvelopeV1 {
  const value = createHash("sha256").update(JSON.stringify(archive), "utf8").digest("hex");
  return { format: FORMAT, version: 1, integrity: { algorithm: "sha256", value }, archive };
}

async function readEnvelope(path: string): Promise<PersistedMediaExecutionArchiveV1> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_MEDIA_EXECUTION_ARCHIVE_BYTES) throw invalid();
  const payload = await readFile(path, "utf8");
  let parsed: unknown;
  try { parsed = JSON.parse(payload) as unknown; } catch { throw invalid(); }
  if (!isRecord(parsed) || exactKeys(parsed, ["format", "version", "integrity", "archive"]) === false
    || parsed.format !== FORMAT || parsed.version !== 1 || !isRecord(parsed.integrity)
    || exactKeys(parsed.integrity, ["algorithm", "value"]) === false || parsed.integrity.algorithm !== "sha256"
    || typeof parsed.integrity.value !== "string" || !/^[0-9a-f]{64}$/u.test(parsed.integrity.value)) {
    throw invalid();
  }
  const expected = createHash("sha256").update(JSON.stringify(parsed.archive), "utf8").digest("hex");
  if (expected !== parsed.integrity.value) throw invalid();
  return validatePersistedMediaExecutionArchive(parsed.archive);
}

async function rejectUnsafeTempArtifacts(root: string): Promise<void> {
  for (const entry of await readdir(root)) {
    if (!entry.startsWith(TEMP_PREFIX)) continue;
    const path = resolve(root, entry);
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile()) throw unavailable();
    await rm(path, { force: true });
  }
}

async function quarantineInvalidArchive(root: string, canonical: string): Promise<void> {
  const quarantines = (await readdir(root)).filter((entry) => entry.startsWith(INVALID_PREFIX)).sort();
  while (quarantines.length >= MAX_QUARANTINES) {
    const oldest = quarantines.shift();
    if (oldest) await rm(resolve(root, oldest), { force: true });
  }
  await rename(canonical, resolve(root, `${INVALID_PREFIX}${Date.now()}-${randomUUID()}.json`));
  await syncDirectory(root);
}

async function pathKind(path: string): Promise<"missing" | "file" | "other"> {
  try {
    const stat = await lstat(path);
    return stat.isFile() && !stat.isSymbolicLink() ? "file" : "other";
  } catch (cause) {
    if (isNodeError(cause) && cause.code === "ENOENT") return "missing";
    throw unavailable();
  }
}

async function syncDirectory(root: string, injectFault?: (point: MediaExecutionArchiveFaultPoint) => void): Promise<void> {
  let directory: Awaited<ReturnType<typeof open>> | undefined;
  try {
    injectFault?.("directory-sync");
    directory = await open(root, constants.O_RDONLY);
    await directory.sync();
  } catch (cause) {
    if (process.platform !== "win32") throw cause;
  } finally {
    await directory?.close();
  }
}

class ProjectMismatchError extends Error {}
function invalid(): DesktopMediaExecutionArchiveError { return new DesktopMediaExecutionArchiveError("MEDIA_EXECUTION_ARCHIVE_INVALID"); }
function unavailable(): DesktopMediaExecutionArchiveError { return new DesktopMediaExecutionArchiveError("MEDIA_EXECUTION_ARCHIVE_UNAVAILABLE"); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isNodeError(value: unknown): value is NodeJS.ErrnoException { return value instanceof Error && "code" in value; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
