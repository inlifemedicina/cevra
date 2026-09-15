import { deserializeProjectPackage, serializeProjectPackage, type SerializedProjectPackage } from "@cevra/project-store";
import { createEmptyProject, ProjectHistory, type HistoryOptions, type ProjectIR } from "@cevra/project-ir";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const CURRENT_FILE = "active-project.current.cevra.json";
const PREVIOUS_FILE = "active-project.previous.cevra.json";
const INVALID_CURRENT_FILE = "active-project.invalid-current.cevra.json";
const INVALID_PREVIOUS_FILE = "active-project.invalid-previous.cevra.json";
const TEMP_PREFIX = ".active-project-checkpoint-";
const OWNER_FILE = ".active-project.owner.lock";
const STALE_OWNER_PREFIX = ".active-project.owner.stale-";
const OWNER_FORMAT = "cevra-active-project-owner";
const OWNER_VERSION = 1;
const MAX_OWNER_BYTES = 1024;
const MAX_STALE_RECLAIM_ATTEMPTS = 3;

export type PersistenceState = "local-saved" | "local-recovered" | "persistence-error";

export interface DesktopProjectPersistenceOptions {
  initialProject?: ProjectIR;
  historyOptions?: HistoryOptions;
  clock?: () => string;
  recoveredSession?: boolean;
}

export interface OpenDesktopProjectResult {
  history: ProjectHistory;
  persistence: DesktopProjectPersistence;
  firstRun: boolean;
}

export class DesktopPersistenceError extends Error {
  readonly code: "PROJECT_PERSISTENCE_UNAVAILABLE" | "PROJECT_PERSISTENCE_CORRUPT" | "PROJECT_PERSISTENCE_FAILED";

  constructor(code: DesktopPersistenceError["code"]) {
    super(code);
    this.name = "DesktopPersistenceError";
    this.code = code;
  }
}

type PersistenceTestFaultPoint = "read-current" | "read-previous" | "checkpoint-write";
type PersistenceTestFaultInjector = (point: PersistenceTestFaultPoint) => void;

interface OwnerMetadata {
  format: typeof OWNER_FORMAT;
  version: typeof OWNER_VERSION;
  pid: number;
  token: string;
}

interface HistoryReadResult {
  kind: "valid" | "corrupt";
  history?: ProjectHistory;
}

/**
 * Owns desktop filesystem durability only. The serialized payload remains the
 * canonical @cevra/project-store representation of ProjectHistory.
 */
export class DesktopProjectPersistence {
  private sequence = 0;
  private stateInternal: PersistenceState;

  /** @internal Instances are created only by the trusted open boundary. */
  constructor(
    private readonly root: string,
    state: PersistenceState,
    private readonly clock: () => string,
    private readonly ownership: ActiveWriterOwnership,
    private readonly injectFault?: PersistenceTestFaultInjector
  ) {
    this.stateInternal = state;
  }

  get state(): PersistenceState {
    return this.stateInternal;
  }

  static async open(root: string, options: DesktopProjectPersistenceOptions = {}): Promise<OpenDesktopProjectResult> {
    return openDesktopProject(root, options);
  }

  async checkpoint(history: ProjectHistory): Promise<void> {
    const current = resolve(this.root, CURRENT_FILE);
    const previous = resolve(this.root, PREVIOUS_FILE);
    const payload = encodePackage(serializeProjectPackage(history, this.clock()));
    const token = `${process.pid}-${++this.sequence}`;
    const nextTemp = resolve(this.root, `${TEMP_PREFIX}${token}.next`);
    const previousTemp = resolve(this.root, `${TEMP_PREFIX}${token}.previous`);

    try {
      await this.ownership.assertOwned();
      this.injectFault?.("checkpoint-write");
      await writeDurably(nextTemp, payload);
      decodePackage(payload);

      if (await regularFileExists(current)) {
        const currentPayload = await readFileAvailable(current);
        decodePackage(currentPayload);
        await writeDurably(previousTemp, currentPayload);
      } else if (!(await regularFileExists(previous))) {
        await writeDurably(previousTemp, payload);
      }

      if (await regularFileExists(previousTemp)) await rename(previousTemp, previous);
      await rename(nextTemp, current);
      await syncDirectory(this.root);
      decodePackage(await readFileAvailable(current));
      this.stateInternal = "local-saved";
    } catch {
      this.stateInternal = "persistence-error";
      await Promise.allSettled([rm(nextTemp, { force: true }), rm(previousTemp, { force: true })]);
      throw new DesktopPersistenceError("PROJECT_PERSISTENCE_FAILED");
    }
  }

  async close(): Promise<void> {
    await this.ownership.release();
  }
}

/** @internal Deterministic fault seam used only by Desktop Host tests. */
export async function __openDesktopProjectForTest(
  root: string,
  options: DesktopProjectPersistenceOptions,
  injectFault: PersistenceTestFaultInjector
): Promise<OpenDesktopProjectResult> {
  return openDesktopProject(root, options, injectFault);
}

async function openDesktopProject(
  root: string,
  options: DesktopProjectPersistenceOptions,
  injectFault?: PersistenceTestFaultInjector
): Promise<OpenDesktopProjectResult> {
  let ownership: ActiveWriterOwnership | undefined;
  try {
    const canonicalRoot = await prepareTrustedRoot(root);
    ownership = await ActiveWriterOwnership.acquire(canonicalRoot);
    await ignoreOrphanArtifacts(canonicalRoot);
    const current = resolve(canonicalRoot, CURRENT_FILE);
    const previous = resolve(canonicalRoot, PREVIOUS_FILE);
    const invalidCurrent = resolve(canonicalRoot, INVALID_CURRENT_FILE);
    const invalidPrevious = resolve(canonicalRoot, INVALID_PREVIOUS_FILE);

    const currentExists = await regularFileExists(current);
    const previousExists = await regularFileExists(previous);
    if (!currentExists && !previousExists) {
      if (await regularFileExists(invalidCurrent) || await regularFileExists(invalidPrevious)) {
        throw new DesktopPersistenceError("PROJECT_PERSISTENCE_CORRUPT");
      }
      const history = new ProjectHistory(
        options.initialProject ?? createEmptyProject({ name: "CEVRA Vids", locale: "pt-BR" }),
        options.historyOptions
      );
      const persistence = new DesktopProjectPersistence(
        canonicalRoot,
        "local-saved",
        options.clock ?? (() => new Date().toISOString()),
        ownership,
        injectFault
      );
      await persistence.checkpoint(history);
      return { history, persistence, firstRun: true };
    }

    const currentResult = currentExists
      ? await readHistory(current, options.historyOptions, injectFault, "read-current")
      : null;
    if (currentResult?.kind === "valid" && currentResult.history) {
      return {
        history: currentResult.history,
        persistence: new DesktopProjectPersistence(
          canonicalRoot,
          options.recoveredSession ? "local-recovered" : "local-saved",
          options.clock ?? (() => new Date().toISOString()),
          ownership,
          injectFault
        ),
        firstRun: false
      };
    }

    const previousResult = previousExists
      ? await readHistory(previous, options.historyOptions, injectFault, "read-previous")
      : null;
    if (previousResult?.kind !== "valid" || !previousResult.history) {
      throw new DesktopPersistenceError("PROJECT_PERSISTENCE_CORRUPT");
    }

    if (currentExists) await quarantineInvalidCurrent(canonicalRoot, current);
    await copyDurably(previous, current, canonicalRoot, `.recovery-${process.pid}`);
    return {
      history: previousResult.history,
      persistence: new DesktopProjectPersistence(
        canonicalRoot,
        "local-recovered",
        options.clock ?? (() => new Date().toISOString()),
        ownership,
        injectFault
      ),
      firstRun: false
    };
  } catch (cause) {
    await ownership?.release();
    if (cause instanceof DesktopPersistenceError) {
      if (cause.code === "PROJECT_PERSISTENCE_CORRUPT" || cause.code === "PROJECT_PERSISTENCE_UNAVAILABLE") throw cause;
    }
    throw new DesktopPersistenceError("PROJECT_PERSISTENCE_UNAVAILABLE");
  }
}

class ActiveWriterOwnership {
  private released = false;

  private constructor(
    private readonly root: string,
    private readonly path: string,
    private readonly metadata: OwnerMetadata
  ) {}

  static async acquire(root: string): Promise<ActiveWriterOwnership> {
    const path = resolve(root, OWNER_FILE);
    const metadata: OwnerMetadata = {
      format: OWNER_FORMAT,
      version: OWNER_VERSION,
      pid: process.pid,
      token: randomUUID()
    };

    for (let attempt = 0; attempt < MAX_STALE_RECLAIM_ATTEMPTS; attempt += 1) {
      let created = false;
      try {
        await createOwnerFile(path, metadata, root);
        created = true;
      } catch (cause) {
        if (!isNodeError(cause) || cause.code !== "EEXIST") throw unavailable();
      }
      if (created) {
        const ownership = new ActiveWriterOwnership(root, path, metadata);
        try {
          await ownership.assertOwned();
          return ownership;
        } catch {
          await ownership.release();
          throw unavailable();
        }
      }

      const existing = await readOwnerFile(path);
      if (ownerMayBeAlive(existing.pid)) throw unavailable();
      const stalePath = resolve(root, `${STALE_OWNER_PREFIX}${metadata.token}`);
      try {
        await rename(path, stalePath);
      } catch (cause) {
        if (isNodeError(cause) && cause.code === "ENOENT") continue;
        throw unavailable();
      }
      const claimed = await readOwnerFile(stalePath);
      if (!sameOwner(existing, claimed)) {
        await restoreUnexpectedClaim(stalePath, path);
        throw unavailable();
      }
      await rm(stalePath, { force: true });
      await syncDirectory(root);
    }
    throw unavailable();
  }

  async assertOwned(): Promise<void> {
    if (this.released) throw unavailable();
    const current = await readOwnerFile(this.path);
    if (!sameOwner(current, this.metadata)) throw unavailable();
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    try {
      const current = await readOwnerFile(this.path);
      if (!sameOwner(current, this.metadata)) return;
      await rm(this.path);
      await syncDirectory(this.root);
    } catch {
      // Never remove ambiguous ownership. Process death makes our valid PID lock reclaimable.
    }
  }
}

async function createOwnerFile(path: string, metadata: OwnerMetadata, root: string): Promise<void> {
  let file;
  let created = false;
  try {
    file = await open(path, "wx", 0o600);
    created = true;
    await file.writeFile(`${JSON.stringify(metadata)}\n`, "utf8");
    await file.sync();
    await file.close();
    file = undefined;
    await syncDirectory(root);
  } catch (cause) {
    await file?.close().catch(() => undefined);
    if (created) await rm(path, { force: true }).catch(() => undefined);
    throw cause;
  }
}

async function readOwnerFile(path: string): Promise<OwnerMetadata> {
  let stat;
  let payload;
  try {
    stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_OWNER_BYTES) throw unavailable();
    payload = await readFile(path, "utf8");
  } catch (cause) {
    if (cause instanceof DesktopPersistenceError) throw cause;
    throw unavailable();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    throw unavailable();
  }
  if (!isRecord(parsed)
    || Object.keys(parsed).length !== 4
    || parsed.format !== OWNER_FORMAT
    || parsed.version !== OWNER_VERSION
    || !Number.isSafeInteger(parsed.pid)
    || (parsed.pid as number) <= 0
    || typeof parsed.token !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(parsed.token)) {
    throw unavailable();
  }
  return parsed as unknown as OwnerMetadata;
}

function ownerMayBeAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    if (isNodeError(cause) && cause.code === "ESRCH") return false;
    return true;
  }
}

async function restoreUnexpectedClaim(stalePath: string, ownerPath: string): Promise<void> {
  try {
    await link(stalePath, ownerPath);
    await rm(stalePath, { force: true });
  } catch {
    // A replacement owner is present or storage is ambiguous; never overwrite it.
  }
}

function sameOwner(left: OwnerMetadata, right: OwnerMetadata): boolean {
  return left.format === right.format
    && left.version === right.version
    && left.pid === right.pid
    && left.token === right.token;
}

async function prepareTrustedRoot(root: string): Promise<string> {
  if (!isAbsolute(root)) throw unavailable();
  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const stat = await lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw unavailable();
    return resolve(root);
  } catch (cause) {
    if (cause instanceof DesktopPersistenceError) throw cause;
    throw unavailable();
  }
}

async function regularFileExists(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new DesktopPersistenceError("PROJECT_PERSISTENCE_CORRUPT");
    return true;
  } catch (cause) {
    if (cause instanceof DesktopPersistenceError) throw cause;
    if (isNodeError(cause) && cause.code === "ENOENT") return false;
    throw unavailable();
  }
}

async function readHistory(
  path: string,
  historyOptions: HistoryOptions | undefined,
  injectFault: PersistenceTestFaultInjector | undefined,
  faultPoint: "read-current" | "read-previous"
): Promise<HistoryReadResult> {
  let payload: string;
  try {
    injectFault?.(faultPoint);
    payload = await readFile(path, "utf8");
  } catch {
    throw unavailable();
  }
  try {
    return { kind: "valid", history: decodePackage(payload, historyOptions) };
  } catch (cause) {
    if (cause instanceof DesktopPersistenceError && cause.code === "PROJECT_PERSISTENCE_CORRUPT") {
      return { kind: "corrupt" };
    }
    throw unavailable();
  }
}

function encodePackage(value: SerializedProjectPackage): string {
  return `${JSON.stringify(value)}\n`;
}

function decodePackage(payload: string, historyOptions?: HistoryOptions): ProjectHistory {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    throw new DesktopPersistenceError("PROJECT_PERSISTENCE_CORRUPT");
  }
  if (!isRecord(parsed) || !isRecord(parsed.files) || Object.values(parsed.files).some((value) => typeof value !== "string")) {
    throw new DesktopPersistenceError("PROJECT_PERSISTENCE_CORRUPT");
  }
  try {
    return deserializeProjectPackage(parsed as unknown as SerializedProjectPackage, historyOptions);
  } catch {
    throw new DesktopPersistenceError("PROJECT_PERSISTENCE_CORRUPT");
  }
}

async function readFileAvailable(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    throw unavailable();
  }
}

async function writeDurably(path: string, payload: string): Promise<void> {
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(payload, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
}

async function copyDurably(source: string, target: string, root: string, suffix: string): Promise<void> {
  const temporary = resolve(root, `${TEMP_PREFIX}${suffix}.copy`);
  try {
    await rm(temporary, { force: true });
    await writeDurably(temporary, await readFileAvailable(source));
    await rename(temporary, target);
    await syncDirectory(root);
  } catch (cause) {
    if (cause instanceof DesktopPersistenceError) throw cause;
    throw unavailable();
  }
}

async function quarantineInvalidCurrent(root: string, current: string): Promise<void> {
  try {
    const invalidCurrent = resolve(root, INVALID_CURRENT_FILE);
    const invalidPrevious = resolve(root, INVALID_PREVIOUS_FILE);
    if (await regularFileExists(invalidCurrent)) {
      await rm(invalidPrevious, { force: true });
      await rename(invalidCurrent, invalidPrevious);
    }
    await copyDurably(current, invalidCurrent, root, `.quarantine-${process.pid}`);
  } catch (cause) {
    if (cause instanceof DesktopPersistenceError) throw cause;
    throw unavailable();
  }
}

async function ignoreOrphanArtifacts(root: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    throw unavailable();
  }
  try {
    await Promise.all(entries
      .filter((entry) => entry.startsWith(TEMP_PREFIX) || entry.startsWith(STALE_OWNER_PREFIX))
      .map((entry) => rm(resolve(root, entry), { force: true })));
  } catch {
    throw unavailable();
  }
}

async function syncDirectory(root: string): Promise<void> {
  let directory;
  try {
    directory = await open(root, constants.O_RDONLY);
    await directory.sync();
  } catch (cause) {
    if (process.platform !== "win32") throw cause;
  } finally {
    await directory?.close();
  }
}

function unavailable(): DesktopPersistenceError {
  return new DesktopPersistenceError("PROJECT_PERSISTENCE_UNAVAILABLE");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}
