import {
  ProjectHistory,
  migrateProject,
  type HistoryArchive,
  type HistoryOptions,
  type JournalEntry,
  type ProjectSnapshot
} from "@cevra/project-ir";
import {
  PROJECT_PACKAGE_FORMAT,
  PROJECT_PACKAGE_VERSION,
  type ProjectPackageManifestV1,
  type SerializedProjectPackage
} from "./types.js";

const MANIFEST_PATH = "manifest.json";
const PROJECT_PATH = "project.json";
const JOURNAL_PATH = "history/journal.jsonl";
const SNAPSHOT_PREFIX = "history/snapshots/";

export function serializeProjectPackage(history: ProjectHistory, savedAt = new Date().toISOString()): SerializedProjectPackage {
  const current = history.current;
  const archive = history.toArchive();
  const activeSnapshotId = archive.cursorSnapshotId;
  const manifest: ProjectPackageManifestV1 = {
    format: PROJECT_PACKAGE_FORMAT,
    formatVersion: PROJECT_PACKAGE_VERSION,
    projectId: current.project.id,
    projectSchemaVersion: current.schemaVersion,
    activeSnapshotId,
    createdAt: current.project.createdAt,
    savedAt,
    defaultLocale: current.project.defaultLocale
  };

  const files: Record<string, string> = {
    [MANIFEST_PATH]: stableJson(manifest),
    [PROJECT_PATH]: stableJson(current),
    [JOURNAL_PATH]: archive.entries.map((entry) => JSON.stringify(entry)).join("\n")
  };
  for (const snapshot of archive.snapshots) {
    files[`${SNAPSHOT_PREFIX}${snapshot.id}.json`] = stableJson(snapshot);
  }
  return { files };
}

export function deserializeProjectPackage(serialized: SerializedProjectPackage, historyOptions: HistoryOptions = {}): ProjectHistory {
  const manifest = readManifest(serialized.files[MANIFEST_PATH]);
  const current = migrateProject(parseRequired(serialized.files[PROJECT_PATH], PROJECT_PATH));
  if (manifest.projectId !== current.project.id) throw new Error("Project package manifest projectId does not match project.json.");
  if (manifest.projectSchemaVersion > current.schemaVersion) throw new Error("Project package manifest requires a newer Project IR schema.");

  const entries = parseJournal(serialized.files[JOURNAL_PATH] ?? "");
  const snapshots = Object.entries(serialized.files)
    .filter(([path]) => path.startsWith(SNAPSHOT_PREFIX) && path.endsWith(".json"))
    .map(([path, content]) => readSnapshot(content, path))
    .sort((a, b) => a.revision - b.revision);

  const active = snapshots.find((snapshot) => snapshot.id === manifest.activeSnapshotId);
  if (!active) throw new Error(`Project package active snapshot ${manifest.activeSnapshotId} is missing.`);
  if (stableJson(active.project) !== stableJson(current)) throw new Error("project.json does not match the active history snapshot.");

  const archive: HistoryArchive = {
    version: 1,
    entries,
    snapshots,
    cursorSnapshotId: manifest.activeSnapshotId
  };
  return ProjectHistory.fromArchive(archive, historyOptions);
}

function readManifest(content: string | undefined): ProjectPackageManifestV1 {
  const raw = parseRequired(content, MANIFEST_PATH);
  if (!isRecord(raw)) throw new Error("Project package manifest must be an object.");
  if (raw.format !== PROJECT_PACKAGE_FORMAT) throw new Error(`Unsupported project package format ${String(raw.format)}.`);
  if (raw.formatVersion !== PROJECT_PACKAGE_VERSION) throw new Error(`Unsupported project package version ${String(raw.formatVersion)}.`);
  for (const key of ["projectId", "activeSnapshotId", "createdAt", "savedAt", "defaultLocale"] as const) {
    if (typeof raw[key] !== "string" || raw[key].length === 0) throw new Error(`Project package manifest ${key} is invalid.`);
  }
  if (!Number.isInteger(raw.projectSchemaVersion) || (raw.projectSchemaVersion as number) < 0) throw new Error("Project package manifest projectSchemaVersion is invalid.");
  if (raw.defaultLocale !== "pt-BR" && raw.defaultLocale !== "en-US") throw new Error("Project package manifest defaultLocale is invalid.");
  return raw as unknown as ProjectPackageManifestV1;
}

function parseJournal(content: string): JournalEntry[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  return trimmed.split(/\r?\n/).map((line, index) => {
    try {
      return JSON.parse(line) as JournalEntry;
    } catch {
      throw new Error(`Invalid JSON in history journal line ${index + 1}.`);
    }
  });
}

function readSnapshot(content: string, path: string): ProjectSnapshot {
  const raw = parseRequired(content, path);
  if (!isRecord(raw) || typeof raw.id !== "string" || !Number.isInteger(raw.revision) || typeof raw.createdAt !== "string" || !isRecord(raw.project)) {
    throw new Error(`Invalid project snapshot at ${path}.`);
  }
  const project = migrateProject(raw.project);
  return { id: raw.id, revision: raw.revision as number, createdAt: raw.createdAt, project };
}

function parseRequired(content: string | undefined, path: string): unknown {
  if (content === undefined) throw new Error(`Project package is missing ${path}.`);
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error(`Project package file ${path} contains invalid JSON.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2) + "\n";
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isRecord(value)) return value;
  return Object.keys(value).sort().reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = sortKeys(value[key]);
    return acc;
  }, {});
}
