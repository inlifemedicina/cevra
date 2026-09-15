import { deserializeProjectPackage, serializeProjectPackage, type SerializedProjectPackage } from "@cevra/project-store";
import { createEmptyProject, ProjectHistory, type HistoryOptions, type ProjectIR } from "@cevra/project-ir";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const CURRENT_FILE = "active-project.current.cevra.json";
const PREVIOUS_FILE = "active-project.previous.cevra.json";
const INVALID_CURRENT_FILE = "active-project.invalid-current.cevra.json";
const INVALID_PREVIOUS_FILE = "active-project.invalid-previous.cevra.json";
const TEMP_PREFIX = ".active-project-checkpoint-";

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

/**
 * Owns desktop filesystem durability only. The serialized payload remains the
 * canonical @cevra/project-store representation of ProjectHistory.
 */
export class DesktopProjectPersistence {
  private sequence = 0;
  private stateInternal: PersistenceState;

  private constructor(
    private readonly root: string,
    state: PersistenceState,
    private readonly clock: () => string
  ) {
    this.stateInternal = state;
  }

  get state(): PersistenceState {
    return this.stateInternal;
  }

  static async open(root: string, options: DesktopProjectPersistenceOptions = {}): Promise<OpenDesktopProjectResult> {
    const canonicalRoot = await prepareTrustedRoot(root);
    const current = resolve(canonicalRoot, CURRENT_FILE);
    const previous = resolve(canonicalRoot, PREVIOUS_FILE);
    const invalidCurrent = resolve(canonicalRoot, INVALID_CURRENT_FILE);
    const invalidPrevious = resolve(canonicalRoot, INVALID_PREVIOUS_FILE);
    await ignoreOrphanTemps(canonicalRoot);

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
      const persistence = new DesktopProjectPersistence(canonicalRoot, "local-saved", options.clock ?? (() => new Date().toISOString()));
      await persistence.checkpoint(history);
      return { history, persistence, firstRun: true };
    }

    const currentResult = currentExists ? await tryReadHistory(current, options.historyOptions) : null;
    if (currentResult?.history) {
      return {
        history: currentResult.history,
        persistence: new DesktopProjectPersistence(canonicalRoot, options.recoveredSession ? "local-recovered" : "local-saved", options.clock ?? (() => new Date().toISOString())),
        firstRun: false
      };
    }

    const previousResult = previousExists ? await tryReadHistory(previous, options.historyOptions) : null;
    if (!previousResult?.history) {
      throw new DesktopPersistenceError("PROJECT_PERSISTENCE_CORRUPT");
    }

    if (currentExists) await quarantineInvalidCurrent(canonicalRoot, current);
    await copyDurably(previous, current, canonicalRoot, `.recovery-${process.pid}`);
    return {
      history: previousResult.history,
      persistence: new DesktopProjectPersistence(canonicalRoot, "local-recovered", options.clock ?? (() => new Date().toISOString())),
      firstRun: false
    };
  }

  async checkpoint(history: ProjectHistory): Promise<void> {
    const current = resolve(this.root, CURRENT_FILE);
    const previous = resolve(this.root, PREVIOUS_FILE);
    const payload = encodePackage(serializeProjectPackage(history, this.clock()));
    const token = `${process.pid}-${++this.sequence}`;
    const nextTemp = resolve(this.root, `${TEMP_PREFIX}${token}.next`);
    const previousTemp = resolve(this.root, `${TEMP_PREFIX}${token}.previous`);

    try {
      await writeDurably(nextTemp, payload);
      decodePackage(payload);

      if (await regularFileExists(current)) {
        const currentPayload = await readFile(current, "utf8");
        decodePackage(currentPayload);
        await writeDurably(previousTemp, currentPayload);
      } else if (!(await regularFileExists(previous))) {
        await writeDurably(previousTemp, payload);
      }

      if (await regularFileExists(previousTemp)) await rename(previousTemp, previous);
      await rename(nextTemp, current);
      await syncDirectory(this.root);
      decodePackage(await readFile(current, "utf8"));
      this.stateInternal = "local-saved";
    } catch (cause) {
      this.stateInternal = "persistence-error";
      await Promise.allSettled([rm(nextTemp, { force: true }), rm(previousTemp, { force: true })]);
      if (cause instanceof DesktopPersistenceError) throw cause;
      throw new DesktopPersistenceError("PROJECT_PERSISTENCE_FAILED");
    }
  }
}

async function prepareTrustedRoot(root: string): Promise<string> {
  if (!isAbsolute(root)) throw new DesktopPersistenceError("PROJECT_PERSISTENCE_UNAVAILABLE");
  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const stat = await lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("invalid root");
    return resolve(root);
  } catch {
    throw new DesktopPersistenceError("PROJECT_PERSISTENCE_UNAVAILABLE");
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
    throw new DesktopPersistenceError("PROJECT_PERSISTENCE_UNAVAILABLE");
  }
}

async function tryReadHistory(path: string, historyOptions: HistoryOptions | undefined): Promise<{ history?: ProjectHistory }> {
  try {
    return { history: decodePackage(await readFile(path, "utf8"), historyOptions) };
  } catch {
    return {};
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
  await rm(temporary, { force: true });
  await writeDurably(temporary, await readFile(source, "utf8"));
  await rename(temporary, target);
  await syncDirectory(root);
}

async function quarantineInvalidCurrent(root: string, current: string): Promise<void> {
  const invalidCurrent = resolve(root, INVALID_CURRENT_FILE);
  const invalidPrevious = resolve(root, INVALID_PREVIOUS_FILE);
  if (await regularFileExists(invalidCurrent)) {
    await rm(invalidPrevious, { force: true });
    await rename(invalidCurrent, invalidPrevious);
  }
  await copyDurably(current, invalidCurrent, root, `.quarantine-${process.pid}`);
}

async function ignoreOrphanTemps(root: string): Promise<void> {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(root);
  await Promise.all(entries.filter((entry) => entry.startsWith(TEMP_PREFIX)).map((entry) => rm(resolve(root, entry), { force: true })));
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}
