import { CURRENT_SCHEMA_VERSION, type ProjectIR } from "./types.js";
import { assertValidProjectIR } from "./validation.js";

export interface MigrationContext {
  fromVersion: number;
  toVersion: number;
}

export type Migration = (input: Record<string, unknown>, context: MigrationContext) => Record<string, unknown>;

const migrations = new Map<number, Migration>();

export function registerMigration(fromVersion: number, migration: Migration): void {
  if (!Number.isInteger(fromVersion) || fromVersion < 0) throw new Error("fromVersion must be a non-negative integer.");
  if (migrations.has(fromVersion)) throw new Error(`Migration from schema ${fromVersion} is already registered.`);
  migrations.set(fromVersion, migration);
}

export function migrateProject(input: unknown): ProjectIR {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("Project must be an object.");
  let current = structuredCopy(input as Record<string, unknown>);
  const rawVersion = current.schemaVersion;
  if (!Number.isInteger(rawVersion) || (rawVersion as number) < 0) throw new Error("Project schemaVersion is missing or invalid.");
  let version = rawVersion as number;
  if (version > CURRENT_SCHEMA_VERSION) throw new Error(`Project schema ${version} is newer than supported schema ${CURRENT_SCHEMA_VERSION}.`);

  while (version < CURRENT_SCHEMA_VERSION) {
    const migration = migrations.get(version);
    if (!migration) throw new Error(`No migration registered from schema ${version}.`);
    current = migration(current, { fromVersion: version, toVersion: version + 1 });
    version += 1;
    current.schemaVersion = version;
  }
  return assertValidProjectIR(current);
}

function structuredCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
