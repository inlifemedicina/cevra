import test from "node:test";
import assert from "node:assert/strict";
import { ProjectHistory, createEmptyProject } from "@cevra/project-ir";
import { deserializeProjectPackage, serializeProjectPackage } from "../dist/index.js";

const fixedTime = "2026-09-11T18:00:00.000Z";

function legacySource(id) {
  return { id, kind: "video", uri: `file:///${id}.mp4`, displayName: id, durationMs: 1_000 };
}

function legacyProject({ name, revision, sources, transcript, headEntryId, headSnapshotId }) {
  return {
    schemaVersion: 1,
    project: { id: "legacy-project", name, createdAt: fixedTime, updatedAt: fixedTime, defaultLocale: "pt-BR" },
    sources,
    transcript,
    timeline: { durationMs: 0, tracks: [], clips: [] },
    captions: [], graphics: [], layouts: [], audio: { masterGainDb: 0 }, style: {}, generation: [],
    history: { revision, ...(headEntryId ? { headEntryId } : {}), ...(headSnapshotId ? { headSnapshotId } : {}) },
    qa: [], exports: [], extensions: {}
  };
}

test("project package round-trips history and redo state", () => {
  let seq = 0;
  const history = new ProjectHistory(createEmptyProject({ id: "p1", name: "A", now: fixedTime }), {
    idGenerator: () => `id-${++seq}`,
    clock: () => fixedTime
  });
  history.commit({ type: "project.rename", name: "B" });
  history.commit({ type: "project.rename", name: "C" });
  history.undo();
  const serialized = serializeProjectPackage(history, fixedTime);
  const restored = deserializeProjectPackage(serialized, {
    idGenerator: () => `restored-${++seq}`,
    clock: () => fixedTime
  });
  assert.equal(restored.current.project.name, "B");
  assert.equal(restored.canRedo, true);
  assert.equal(restored.redo().project.name, "C");
  assert.ok(serialized.files["manifest.json"]);
  assert.ok(serialized.files["project.json"]);
  assert.ok(serialized.files["history/journal.jsonl"] !== undefined);
});

test("tampered current project is rejected", () => {
  let seq = 0;
  const history = new ProjectHistory(createEmptyProject({ id: "p1", name: "A", now: fixedTime }), {
    idGenerator: () => `id-${++seq}`,
    clock: () => fixedTime
  });
  const serialized = serializeProjectPackage(history, fixedTime);
  const project = JSON.parse(serialized.files["project.json"]);
  project.project.name = "Tampered";
  serialized.files["project.json"] = JSON.stringify(project);
  assert.throws(() => deserializeProjectPackage(serialized), /does not match/);
});

test("v1 package migrates active project and every snapshot independently without changing package format", () => {
  const rawLegacy = {
    language: "pt",
    words: [{ id: "w1", text: "olá", startMs: 0, endMs: 100, extraWord: { keep: true } }],
    segments: [{ id: "s1", text: "olá", startMs: 0, endMs: 100, wordIds: ["w1"], extraSegment: [true, null] }],
    extraTranscript: "preserve"
  };
  const canonicalSnapshot = legacyProject({
    name: "One source",
    revision: 0,
    sources: [legacySource("source-a")],
    transcript: { language: "pt", words: [{ id: "w1", text: "olá", startMs: 0, endMs: 100 }], segments: [{ id: "s1", text: "olá", startMs: 0, endMs: 100, wordIds: ["w1"] }] },
    headSnapshotId: "snapshot-0"
  });
  const quarantinedSnapshot = legacyProject({
    name: "Two sources",
    revision: 1,
    sources: [legacySource("source-b"), legacySource("source-a")],
    transcript: rawLegacy,
    headEntryId: "entry-1",
    headSnapshotId: "snapshot-1"
  });
  const manifest = {
    format: "cevra-project",
    formatVersion: 1,
    projectId: "legacy-project",
    projectSchemaVersion: 1,
    activeSnapshotId: "snapshot-0",
    createdAt: fixedTime,
    savedAt: fixedTime,
    defaultLocale: "pt-BR"
  };
  const entry = {
    id: "entry-1",
    revision: 1,
    command: { type: "project.rename", name: "Two sources" },
    actor: { type: "user" },
    createdAt: fixedTime,
    snapshotId: "snapshot-1"
  };
  const serialized = { files: {
    "manifest.json": JSON.stringify(manifest),
    "project.json": JSON.stringify(canonicalSnapshot),
    "history/journal.jsonl": JSON.stringify(entry),
    "history/snapshots/snapshot-0.json": JSON.stringify({ id: "snapshot-0", revision: 0, createdAt: fixedTime, project: canonicalSnapshot }),
    "history/snapshots/snapshot-1.json": JSON.stringify({ id: "snapshot-1", revision: 1, createdAt: fixedTime, project: quarantinedSnapshot })
  }};

  const restored = deserializeProjectPackage(serialized);
  assert.equal(restored.current.schemaVersion, 2);
  assert.equal(restored.current.sourceTranscripts.length, 1);
  assert.equal(restored.current.history.headSnapshotId, "snapshot-0");
  assert.equal(restored.canRedo, true);
  assert.equal(restored.entries[0].id, "entry-1");

  const later = restored.redo();
  assert.equal(later.sourceTranscripts.length, 0);
  assert.equal(later.extensions["cevra.migration.v1UnassignedTranscript"].reason, "ambiguous-multiple-sources");
  assert.deepEqual(later.extensions["cevra.migration.v1UnassignedTranscript"].payload, rawLegacy);
  assert.deepEqual(later.extensions["cevra.migration.v1UnassignedTranscript"].eligibleSourceIdsAtMigration, ["source-a", "source-b"]);
  assert.equal(restored.undo().sourceTranscripts.length, 1);

  const roundTrip = serializeProjectPackage(restored, fixedTime);
  const roundTripManifest = JSON.parse(roundTrip.files["manifest.json"]);
  assert.equal(roundTripManifest.formatVersion, 1);
  assert.equal(roundTripManifest.projectSchemaVersion, 2);
  const reopened = deserializeProjectPackage(roundTrip);
  assert.equal(reopened.canRedo, true);
  assert.equal(reopened.entries[0].id, "entry-1");
  assert.deepEqual(reopened.redo().extensions["cevra.migration.v1UnassignedTranscript"].payload, rawLegacy);
  assert.equal(reopened.undo().sourceTranscripts.length, 1);
});
