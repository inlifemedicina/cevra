import {
  ProjectHistory,
  isHistoryTranscriptBlobDigest,
  migrateProject,
  type CompactProjectSnapshot,
  type HistoryArchiveV1,
  type HistoryArchiveV2,
  type HistoryOptions,
  type HistoryTranscriptBlob,
  type JournalEntry,
  type ProjectSnapshot
} from "@cevra/project-ir";
import {
  PROJECT_PACKAGE_FORMAT,
  PROJECT_PACKAGE_VERSION,
  PROJECT_PACKAGE_VERSION_V1,
  type ProjectPackageManifest,
  type ProjectPackageManifestV2,
  type SerializedProjectPackage
} from "./types.js";

const MANIFEST_PATH = "manifest.json";
const PROJECT_PATH = "project.json";
const JOURNAL_PATH = "history/journal.jsonl";
const SNAPSHOT_PREFIX = "history/snapshots/";
const TRANSCRIPT_BLOB_PREFIX = "history/transcript-blobs/";

export function serializeProjectPackage(history: ProjectHistory, savedAt = new Date().toISOString()): SerializedProjectPackage {
  const current = history.current;
  const archive = history.toArchive();
  const manifest: ProjectPackageManifestV2 = {
    format: PROJECT_PACKAGE_FORMAT,
    formatVersion: PROJECT_PACKAGE_VERSION,
    projectId: current.project.id,
    projectSchemaVersion: current.schemaVersion,
    activeSnapshotId: archive.cursorSnapshotId,
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
    files[`${SNAPSHOT_PREFIX}${encodeSnapshotId(snapshot.id)}.json`] = stableJson(snapshot);
  }
  for (const blob of archive.transcriptBlobs) {
    files[`${TRANSCRIPT_BLOB_PREFIX}${blob.digest}.json`] = stableJson(blob);
  }
  return { files };
}

export function deserializeProjectPackage(serialized: SerializedProjectPackage, historyOptions: HistoryOptions = {}): ProjectHistory {
  const manifest = readManifest(serialized.files[MANIFEST_PATH]);
  const current = migrateProject(parseRequired(serialized.files[PROJECT_PATH], PROJECT_PATH));
  if (manifest.projectId !== current.project.id) throw new Error("Project package manifest projectId does not match project.json.");
  if (manifest.projectSchemaVersion > current.schemaVersion) throw new Error("Project package manifest requires a newer Project IR schema.");
  return manifest.formatVersion === PROJECT_PACKAGE_VERSION_V1
    ? deserializeV1(serialized, manifest.activeSnapshotId, current, historyOptions)
    : deserializeV2(serialized, manifest.activeSnapshotId, current, historyOptions);
}

function deserializeV1(
  serialized: SerializedProjectPackage,
  activeSnapshotId: string,
  current: ReturnType<typeof migrateProject>,
  historyOptions: HistoryOptions
): ProjectHistory {
  const entries = parseJournal(serialized.files[JOURNAL_PATH] ?? "");
  const snapshots = Object.entries(serialized.files)
    .filter(([path]) => path.startsWith(SNAPSHOT_PREFIX) && path.endsWith(".json"))
    .map(([path, content]) => readV1Snapshot(content, path))
    .sort((a, b) => a.revision - b.revision);

  const active = snapshots.find((snapshot) => snapshot.id === activeSnapshotId);
  if (!active) throw new Error(`Project package active snapshot ${activeSnapshotId} is missing.`);
  if (stableJson(active.project) !== stableJson(current)) throw new Error("project.json does not match the active history snapshot.");

  const archive: HistoryArchiveV1 = { version: 1, entries, snapshots, cursorSnapshotId: activeSnapshotId };
  return ProjectHistory.fromArchive(archive, historyOptions);
}

function deserializeV2(
  serialized: SerializedProjectPackage,
  activeSnapshotId: string,
  current: ReturnType<typeof migrateProject>,
  historyOptions: HistoryOptions
): ProjectHistory {
  const entries = parseJournal(serialized.files[JOURNAL_PATH] ?? "");
  const snapshots: CompactProjectSnapshot[] = [];
  const transcriptBlobs: HistoryTranscriptBlob[] = [];

  for (const [path, content] of Object.entries(serialized.files)) {
    if (path.startsWith(SNAPSHOT_PREFIX)) snapshots.push(readV2Snapshot(content, path));
    if (path.startsWith(TRANSCRIPT_BLOB_PREFIX)) transcriptBlobs.push(readTranscriptBlob(content, path));
  }
  snapshots.sort((a, b) => a.revision - b.revision);
  transcriptBlobs.sort((a, b) => a.digest.localeCompare(b.digest));

  const archive: HistoryArchiveV2 = { version: 2, entries, snapshots, transcriptBlobs, cursorSnapshotId: activeSnapshotId };
  const history = ProjectHistory.fromArchive(archive, historyOptions);
  if (stableJson(history.current) !== stableJson(current)) throw new Error("project.json does not match the active history snapshot.");
  return history;
}

function readManifest(content: string | undefined): ProjectPackageManifest {
  const raw = parseRequired(content, MANIFEST_PATH);
  if (!isRecord(raw)) throw new Error("Project package manifest must be an object.");
  if (raw.format !== PROJECT_PACKAGE_FORMAT) throw new Error(`Unsupported project package format ${String(raw.format)}.`);
  if (raw.formatVersion !== PROJECT_PACKAGE_VERSION_V1 && raw.formatVersion !== PROJECT_PACKAGE_VERSION) {
    throw new Error(`Unsupported project package version ${String(raw.formatVersion)}.`);
  }
  for (const key of ["projectId", "activeSnapshotId", "createdAt", "savedAt", "defaultLocale"] as const) {
    if (typeof raw[key] !== "string" || raw[key].length === 0) throw new Error(`Project package manifest ${key} is invalid.`);
  }
  if (!Number.isInteger(raw.projectSchemaVersion) || (raw.projectSchemaVersion as number) < 0) throw new Error("Project package manifest projectSchemaVersion is invalid.");
  if (raw.defaultLocale !== "pt-BR" && raw.defaultLocale !== "en-US") throw new Error("Project package manifest defaultLocale is invalid.");
  return raw as unknown as ProjectPackageManifest;
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

function readV1Snapshot(content: string, path: string): ProjectSnapshot {
  const raw = parseRequired(content, path);
  if (!isRecord(raw) || typeof raw.id !== "string" || !Number.isInteger(raw.revision) || typeof raw.createdAt !== "string" || !isRecord(raw.project)) {
    throw new Error(`Invalid project snapshot at ${path}.`);
  }
  const project = migrateProject(raw.project);
  return { id: raw.id, revision: raw.revision as number, createdAt: raw.createdAt, project };
}

function readV2Snapshot(content: string, path: string): CompactProjectSnapshot {
  const encodedId = exactFileStem(path, SNAPSHOT_PREFIX, "project snapshot");
  let pathId: string;
  try {
    pathId = decodeURIComponent(encodedId);
  } catch {
    throw new Error(`Invalid project snapshot path ${path}.`);
  }
  if (encodeSnapshotId(pathId) !== encodedId) throw new Error(`Invalid project snapshot path ${path}.`);
  const raw = parseRequired(content, path);
  if (!isRecord(raw) || typeof raw.id !== "string" || raw.id !== pathId || !Number.isInteger(raw.revision) || typeof raw.createdAt !== "string" || !isRecord(raw.project) || !Array.isArray(raw.sourceTranscriptRefs)) {
    throw new Error(`Invalid compact project snapshot at ${path}.`);
  }
  return raw as unknown as CompactProjectSnapshot;
}

function readTranscriptBlob(content: string, path: string): HistoryTranscriptBlob {
  const digest = exactFileStem(path, TRANSCRIPT_BLOB_PREFIX, "history transcript blob");
  if (!isHistoryTranscriptBlobDigest(digest)) throw new Error(`Invalid history transcript blob path ${path}.`);
  const raw = parseRequired(content, path);
  if (!isRecord(raw) || raw.digest !== digest || !isRecord(raw.transcript)) throw new Error(`Invalid history transcript blob at ${path}.`);
  return raw as unknown as HistoryTranscriptBlob;
}

function exactFileStem(path: string, prefix: string, kind: string): string {
  if (!path.startsWith(prefix) || !path.endsWith(".json")) throw new Error(`Invalid ${kind} path ${path}.`);
  const stem = path.slice(prefix.length, -".json".length);
  if (stem.length === 0 || stem.includes("/") || stem.includes("\\")) throw new Error(`Invalid ${kind} path ${path}.`);
  return stem;
}

function encodeSnapshotId(id: string): string {
  if (id.length === 0) throw new Error("Project snapshot id must not be empty.");
  try {
    return encodeURIComponent(id);
  } catch {
    throw new Error("Project snapshot id contains invalid Unicode.");
  }
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
