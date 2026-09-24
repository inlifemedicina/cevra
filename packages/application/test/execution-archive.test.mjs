import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_MEDIA_EXECUTION_INTENTS,
  MAX_MEDIA_EXECUTION_RECORDS,
  validatePersistedMediaExecutionArchive
} from "../dist/index.js";

const now = "2026-09-23T12:00:00.000Z";
const projectId = "project-archive";

function record(id = "record") {
  return {
    id, projectId, locale: "pt-BR", operation: { type: "probe", inputUri: "/tmp/source.mov" },
    mutation: { type: "none" }, actor: { type: "system" }, status: "requested", createdAt: now, attempts: []
  };
}

function intent(id = "intent") {
  return {
    version: 1, id, kind: "resolved-audio-plan", projectId,
    projectBinding: { projectId, projectRevision: 0, projectSnapshotId: "snapshot", projectJournalEntryCount: 0 },
    status: "requested", childExecutionIds: { audio: `${id}:audio`, mux: `${id}:mux` },
    exportIntent: { exportId: `${id}:export`, presetId: "preset", expectedOutputUri: "/tmp/export.mp4" },
    createdAt: now, updatedAt: now
  };
}

test("persisted archive parser is closed, detached, and project-bound", () => {
  const source = { version: 1, projectId, records: [record()], intents: [intent()] };
  const parsed = validatePersistedMediaExecutionArchive(source);
  source.records[0].status = "failed";
  assert.equal(parsed.records[0].status, "requested");
  assert.throws(() => validatePersistedMediaExecutionArchive({ ...source, unexpected: true }), /unexpected fields/u);
  assert.throws(() => validatePersistedMediaExecutionArchive({ ...source, version: 2 }));
  assert.throws(() => validatePersistedMediaExecutionArchive({ ...source, records: [{ ...record(), projectId: "other" }] }), /project binding/u);
  assert.throws(() => validatePersistedMediaExecutionArchive({ ...source, intents: [{ ...intent(), future: true }] }), /unexpected fields/u);
});

test("persisted archive rejects malformed nested results and publication evidence", () => {
  const malformed = record("malformed");
  malformed.status = "running";
  malformed.operation = {
    type: "render-audio-sequence", version: 1, sources: [{ id: "source", uri: "/tmp/source.wav" }],
    items: [{ sourceId: "source", sourceStartMs: 0, sourceEndMs: 1000, timelineStartMs: 0 }],
    outputUri: "/tmp/output.wav", outputDurationMs: 1000, outputChannelLayout: "mono"
  };
  malformed.attempts = [{ number: 1, jobId: "malformed:1", status: "running", requestedAt: now,
    outputUris: ["/tmp/output.wav"], preexistingOutputUris: [], ownedOutputUris: ["/tmp/output.wav"],
    ownedOutputPublications: [{ uri: "/tmp/output.wav", evidence: { version: 1, scheme: "posix-dev-inode", device: "not-a-number", inode: "1" } }],
    removedPartialOutputUris: [], cleanupFailedOutputUris: [], projectRevisionBefore: 0 }];
  assert.throws(() => validatePersistedMediaExecutionArchive({ version: 1, projectId, records: [malformed], intents: [] }), /publication evidence/u);
  malformed.attempts[0].ownedOutputPublications[0].evidence.device = "1";
  malformed.attempts[0].result = { type: "file", outputUri: "/tmp/output.wav",
    probe: { uri: "/tmp/output.wav", hasVideo: false, hasAudio: true, sampleRate: "48000" },
    effectiveProfile: { container: "wav", audioCodec: "pcm" } };
  assert.throws(() => validatePersistedMediaExecutionArchive({ version: 1, projectId, records: [malformed], intents: [] }), /sampleRate/u);
});

test("persisted attempt tracking is exactly bound to canonical operation outputs", () => {
  const outputUri = "/tmp/output.mp4";
  const base = {
    ...record("bound-output"), status: "running",
    operation: { type: "trim", inputUri: "/tmp/input.mp4", outputUri, startMs: 0, endMs: 1000 },
    attempts: [{
      number: 1, jobId: "bound-output:1", status: "running", requestedAt: now,
      outputUris: [outputUri], preexistingOutputUris: [], ownedOutputUris: [],
      ownedOutputPublications: [], removedPartialOutputUris: [], cleanupFailedOutputUris: [], projectRevisionBefore: 0
    }]
  };
  const parse = (candidate) => validatePersistedMediaExecutionArchive({
    version: 1, projectId, records: [candidate], intents: []
  });
  assert.doesNotThrow(() => parse(base));
  for (const field of [
    "outputUris", "preexistingOutputUris", "ownedOutputUris", "removedPartialOutputUris", "cleanupFailedOutputUris"
  ]) {
    const candidate = structuredClone(base);
    candidate.attempts[0][field] = ["/tmp/foreign"];
    assert.throws(() => parse(candidate), /operation|outside the operation outputs/u, field);
  }
  const publication = structuredClone(base);
  publication.attempts[0].ownedOutputPublications = [{
    uri: "/tmp/foreign",
    evidence: { version: 1, scheme: "posix-dev-inode", device: "1", inode: "2" }
  }];
  assert.throws(() => parse(publication), /not an operation output/u);

  const outputless = record("outputless");
  outputless.attempts = [{
    number: 1, jobId: "outputless:1", status: "running", requestedAt: now,
    outputUris: [], preexistingOutputUris: ["/tmp/foreign"], ownedOutputUris: [],
    removedPartialOutputUris: [], cleanupFailedOutputUris: [], projectRevisionBefore: 0
  }];
  assert.throws(() => parse(outputless), /outside the operation outputs/u);
});

test("persisted archive enforces defensive record and intent count bounds", () => {
  assert.throws(() => validatePersistedMediaExecutionArchive({
    version: 1, projectId, records: Array(MAX_MEDIA_EXECUTION_RECORDS + 1).fill(null), intents: []
  }));
  assert.throws(() => validatePersistedMediaExecutionArchive({
    version: 1, projectId, records: [], intents: Array(MAX_MEDIA_EXECUTION_INTENTS + 1).fill(null)
  }));
});
