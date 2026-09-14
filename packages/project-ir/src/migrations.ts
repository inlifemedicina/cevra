import {
  CURRENT_SCHEMA_VERSION,
  PROJECT_IR_SCHEMA_VERSION_V1,
  type ProjectIR,
  type SourceTranscript,
  type TranscriptState,
  type V1TranscriptQuarantineReason
} from "./types.js";
import { computeTranscriptDigest } from "./transcript-digest.js";
import {
  V1_UNASSIGNED_TRANSCRIPT_EXTENSION,
  assertValidProjectIR,
  assertValidProjectIRv1,
  deriveTranscriptSpeakerState
} from "./validation.js";

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
  if (!isRecord(input)) throw new Error("Project must be an object.");
  let current = deepJsonClone(input);
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

export function migrateProjectIRV1ToV2(input: Record<string, unknown>, context: MigrationContext): Record<string, unknown> {
  if (context.fromVersion !== PROJECT_IR_SCHEMA_VERSION_V1 || context.toVersion !== CURRENT_SCHEMA_VERSION) throw new Error("Project IR v1 migration requires a 1 to 2 context.");
  const v1 = assertValidProjectIRv1(input);
  if (hasOwn(v1, "sourceTranscripts")) throw new Error("Schema v1 input must not contain sourceTranscripts.");
  const extensions = v1.extensions as Record<string, unknown>;
  if (hasOwn(extensions, V1_UNASSIGNED_TRANSCRIPT_EXTENSION)) throw new Error("Schema v1 input already owns the reserved transcript quarantine namespace.");

  const rawTranscript = deepJsonClone(v1.transcript as Record<string, unknown>);
  const sources = deepJsonClone(v1.sources as Array<Record<string, unknown>>);
  const eligible = sources.filter((source) => source.kind === "audio" || source.kind === "video");
  const output = deepJsonClone(v1);
  output.schemaVersion = CURRENT_SCHEMA_VERSION;
  delete output.transcript;
  output.sourceTranscripts = [];

  if (isExactFactoryEmptyTranscript(rawTranscript)) return assertValidProjectIR(output) as unknown as Record<string, unknown>;

  let reason: V1TranscriptQuarantineReason;
  if (sources.length === 1 && eligible.length === 1) {
    const candidate = createLosslessMigrationCandidate(rawTranscript, eligible[0]!);
    if (candidate) {
      output.sourceTranscripts = [candidate];
      try {
        return assertValidProjectIR(output) as unknown as Record<string, unknown>;
      } catch {
        output.sourceTranscripts = [];
      }
    }
    reason = "incompatible-canonical-transcript";
  } else if (eligible.length === 0) {
    reason = "no-eligible-source";
  } else {
    reason = "ambiguous-multiple-sources";
  }

  (output.extensions as Record<string, unknown>)[V1_UNASSIGNED_TRANSCRIPT_EXTENSION] = {
    schemaVersion: PROJECT_IR_SCHEMA_VERSION_V1,
    originalSchemaVersion: PROJECT_IR_SCHEMA_VERSION_V1,
    reason,
    payload: rawTranscript,
    eligibleSourceIdsAtMigration: eligible.map((source) => source.id as string).sort()
  };
  return assertValidProjectIR(output) as unknown as Record<string, unknown>;
}

function createLosslessMigrationCandidate(raw: Record<string, unknown>, source: Record<string, unknown>): SourceTranscript | undefined {
  if (!hasOnlyKeys(raw, ["language", "words", "segments"])) return undefined;
  if (!Array.isArray(raw.words) || !Array.isArray(raw.segments)) return undefined;
  if (raw.words.some((word) => !isRecord(word) || !hasOnlyKeys(word, ["id", "text", "startMs", "endMs", "confidence", "speakerId"]))) return undefined;
  if (raw.segments.some((segment) => !isRecord(segment) || !hasOnlyKeys(segment, ["id", "text", "startMs", "endMs", "wordIds", "speakerId"]))) return undefined;

  const transcript = raw as unknown as TranscriptState;
  const wordTiming = transcript.words.length === 0 ? "none" as const : "unknown" as const;
  const speakerState = deriveTranscriptSpeakerState(transcript);
  const provenance: Record<string, unknown> = {
    ...(source.checksum === undefined ? {} : { sourceChecksum: source.checksum }),
    stages: [{ kind: "migration", fromSchemaVersion: PROJECT_IR_SCHEMA_VERSION_V1, toSchemaVersion: CURRENT_SCHEMA_VERSION }]
  };
  try {
    return {
      sourceId: source.id as string,
      transcriptDigest: computeTranscriptDigest({ transcript, wordTiming, speakerState }),
      wordTiming,
      speakerState,
      transcript,
      provenance: provenance as unknown as SourceTranscript["provenance"]
    };
  } catch {
    return undefined;
  }
}

function isExactFactoryEmptyTranscript(value: Record<string, unknown>): boolean {
  return hasOnlyKeys(value, ["words", "segments"])
    && Array.isArray(value.words) && value.words.length === 0
    && Array.isArray(value.segments) && value.segments.length === 0
    && !hasOwn(value, "language");
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepJsonClone<T>(value: T, ancestors: Set<object> = new Set()): T {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Project must be finite serializable JSON.");
    return value;
  }
  if (typeof value !== "object") throw new Error("Project must be finite serializable JSON.");
  if (ancestors.has(value)) throw new Error("Project must be finite serializable JSON.");
  ancestors.add(value);
  let copy: unknown;
  if (Array.isArray(value)) {
    copy = value.map((item) => deepJsonClone(item, ancestors));
  } else {
    const record: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      Object.defineProperty(record, key, {
        value: deepJsonClone((value as Record<string, unknown>)[key], ancestors),
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    copy = record;
  }
  ancestors.delete(value);
  return copy as T;
}

registerMigration(PROJECT_IR_SCHEMA_VERSION_V1, migrateProjectIRV1ToV2);
