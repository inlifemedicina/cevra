import test from "node:test";
import assert from "node:assert/strict";
import {
  ProjectHistory,
  computeHistoryTranscriptBlobDigest,
  createEmptyProject,
  createSourceTranscript
} from "@cevra/project-ir";
import { deserializeProjectPackage, serializeProjectPackage } from "../dist/index.js";

const fixedTime = "2026-09-11T18:00:00.000Z";

function legacySource(id) {
  return { id, kind: "video", uri: `file:///${id}.mp4`, displayName: id, durationMs: 1_000 };
}

function technicalDescriptor(basis = "post-ingest") {
  return {
    version: 1,
    basis,
    content: { sha256: "a".repeat(64), sizeBytes: 1234 },
    method: {
      profile: "cevra.source-technical.v1",
      engineId: "cevra-media-ffmpeg",
      engineVersion: "0.2.1",
      engineApiVersion: 1
    },
    video: {
      codec: "h264",
      pixelFormat: "yuv420p",
      avgFrameRate: "30000/1001",
      rFrameRate: "30000/1001",
      rotationDegrees: 0,
      colorPrimaries: "bt709",
      colorTransfer: "bt709",
      colorSpace: "bt709",
      colorRange: "tv"
    },
    audio: { codec: "aac" }
  };
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

function transcriptFor(sourceId = "source-1", overrides = {}) {
  return createSourceTranscript({
    sourceId,
    wordTiming: "model",
    speakerState: "none",
    transcript: {
      language: "pt-BR",
      words: [{ id: "w1", text: "olá", startMs: 0, endMs: 500, confidence: 0.91 }],
      segments: [{ id: "s1", text: "olá", startMs: 0, endMs: 500, wordIds: ["w1"] }]
    },
    provenance: {
      stages: [{ kind: "transcription", executionId: "exec-1", engineId: "engine", engineVersion: "1", engineApiVersion: "1", modelId: "model", createdAt: fixedTime }]
    },
    extensions: { review: "exact" },
    ...overrides
  });
}

function historyWithTranscript() {
  let sequence = 0;
  const project = createEmptyProject({ id: "p-transcript", name: "Transcript", now: fixedTime });
  project.sources.push({ id: "source-1", kind: "video", uri: "file:///source-1.mp4", displayName: "source-1", durationMs: 1_000 });
  project.sourceTranscripts.push(transcriptFor());
  const history = new ProjectHistory(project, { idGenerator: () => `package-${++sequence}`, clock: () => fixedTime });
  history.commit({ type: "project.rename", name: "After" });
  return history;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

test("V2 package and history preserve the optional source technical descriptor through undo and redo", () => {
  let seq = 0;
  const project = createEmptyProject({ id: "p-descriptor", name: "Descriptor", now: fixedTime });
  project.sources.push({
    id: "source-descriptor",
    kind: "video",
    uri: "/media/source.mov",
    displayName: "source.mov",
    durationMs: 1000,
    checksum: "legacy:unchanged",
    technicalDescriptor: technicalDescriptor("ingest")
  });
  const history = new ProjectHistory(project, {
    idGenerator: () => `descriptor-${++seq}`,
    clock: () => fixedTime
  });
  history.commit({ type: "project.rename", name: "After descriptor" });
  history.undo();

  const serialized = serializeProjectPackage(history, fixedTime);
  const manifest = JSON.parse(serialized.files["manifest.json"]);
  const restored = deserializeProjectPackage(serialized, {
    idGenerator: () => `restored-descriptor-${++seq}`,
    clock: () => fixedTime
  });

  assert.equal(manifest.projectSchemaVersion, 2);
  assert.equal(manifest.formatVersion, 2);
  assert.deepEqual(restored.current.sources[0].technicalDescriptor, technicalDescriptor("ingest"));
  assert.equal(restored.current.sources[0].checksum, "legacy:unchanged");
  assert.equal(restored.canRedo, true);
  assert.deepEqual(restored.redo().sources[0].technicalDescriptor, technicalDescriptor("ingest"));
  assert.deepEqual(restored.undo().sources[0].technicalDescriptor, technicalDescriptor("ingest"));
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

test("V2 package stores compact snapshots and exact per-source transcript blobs", () => {
  const history = historyWithTranscript();
  history.undo();
  const serialized = serializeProjectPackage(history, fixedTime);
  const manifest = JSON.parse(serialized.files["manifest.json"]);
  const snapshotFiles = Object.keys(serialized.files).filter((path) => path.startsWith("history/snapshots/"));
  const blobFiles = Object.keys(serialized.files).filter((path) => path.startsWith("history/transcript-blobs/"));

  assert.equal(manifest.formatVersion, 2);
  assert.equal(snapshotFiles.length, 2);
  assert.equal(blobFiles.length, 1);
  for (const path of snapshotFiles) {
    const snapshot = JSON.parse(serialized.files[path]);
    assert.equal(Object.hasOwn(snapshot.project, "sourceTranscripts"), false);
    assert.equal(snapshot.sourceTranscriptRefs.length, 1);
  }

  const restored = deserializeProjectPackage(serialized);
  assert.deepEqual(restored.current, history.current);
  assert.equal(restored.canRedo, true);
  assert.equal(restored.redo().project.name, "After");
  assert.deepEqual(restored.current.sourceTranscripts[0], transcriptFor());
});

test("same editorial digest but different exact transcript state survives V2 save, undo, and redo", () => {
  const history = historyWithTranscript();
  const initial = history.current.sourceTranscripts[0];
  const changed = clone(initial);
  changed.transcript.words[0].confidence = 0.33;
  changed.provenance.stages[0].executionId = "exec-2";
  changed.extensions = { review: "different exact state" };
  assert.equal(initial.transcriptDigest, changed.transcriptDigest);
  assert.notEqual(computeHistoryTranscriptBlobDigest(initial), computeHistoryTranscriptBlobDigest(changed));

  history.commit({ type: "transcript.set", transcript: changed, expectedCurrentTranscriptDigest: initial.transcriptDigest });
  const serialized = serializeProjectPackage(history, fixedTime);
  assert.equal(Object.keys(serialized.files).filter((path) => path.startsWith("history/transcript-blobs/")).length, 2);
  const restored = deserializeProjectPackage(serialized);
  assert.deepEqual(restored.current.sourceTranscripts[0], changed);
  assert.deepEqual(restored.undo().sourceTranscripts[0], initial);
  assert.deepEqual(restored.redo().sourceTranscripts[0], changed);
});

test("V2 package corruption cases fail closed", () => {
  const valid = serializeProjectPackage(historyWithTranscript(), fixedTime);
  const blobPath = Object.keys(valid.files).find((path) => path.startsWith("history/transcript-blobs/"));
  const snapshotPaths = Object.keys(valid.files).filter((path) => path.startsWith("history/snapshots/"));
  const activeId = JSON.parse(valid.files["manifest.json"]).activeSnapshotId;
  const activeSnapshotPath = snapshotPaths.find((path) => JSON.parse(valid.files[path]).id === activeId);
  assert.ok(blobPath);
  assert.ok(activeSnapshotPath);

  const missingBlob = clone(valid);
  delete missingBlob.files[blobPath];
  assert.throws(() => deserializeProjectPackage(missingBlob), /missing transcript blob/);

  const wrongDigest = clone(valid);
  const wrongDigestBlob = JSON.parse(wrongDigest.files[blobPath]);
  wrongDigestBlob.transcript.extensions.review = "tampered";
  wrongDigest.files[blobPath] = JSON.stringify(wrongDigestBlob);
  assert.throws(() => deserializeProjectPackage(wrongDigest), /digest mismatch/);

  const filenameMismatch = clone(valid);
  const filenameMismatchBlob = JSON.parse(filenameMismatch.files[blobPath]);
  filenameMismatchBlob.digest = `sha256-history-transcript-v1-${"0".repeat(64)}`;
  filenameMismatch.files[blobPath] = JSON.stringify(filenameMismatchBlob);
  assert.throws(() => deserializeProjectPackage(filenameMismatch), /Invalid history transcript blob/);

  const malformedBlob = clone(valid);
  malformedBlob.files[blobPath] = "{";
  assert.throws(() => deserializeProjectPackage(malformedBlob), /invalid JSON/);

  const invalidTranscript = clone(valid);
  const invalidBlob = JSON.parse(invalidTranscript.files[blobPath]);
  invalidBlob.transcript.transcript.words[0].confidence = 2;
  const invalidDigest = computeHistoryTranscriptBlobDigest(invalidBlob.transcript);
  invalidBlob.digest = invalidDigest;
  delete invalidTranscript.files[blobPath];
  const invalidPath = `history/transcript-blobs/${invalidDigest}.json`;
  invalidTranscript.files[invalidPath] = JSON.stringify(invalidBlob);
  for (const path of snapshotPaths) {
    const snapshot = JSON.parse(invalidTranscript.files[path]);
    snapshot.sourceTranscriptRefs[0].digest = invalidDigest;
    invalidTranscript.files[path] = JSON.stringify(snapshot);
  }
  assert.throws(() => deserializeProjectPackage(invalidTranscript), /confidence must be between/);

  const unknownRef = clone(valid);
  const unknownSnapshot = JSON.parse(unknownRef.files[activeSnapshotPath]);
  unknownSnapshot.sourceTranscriptRefs[0].digest = `sha256-history-transcript-v1-${"1".repeat(64)}`;
  unknownRef.files[activeSnapshotPath] = JSON.stringify(unknownSnapshot);
  assert.throws(() => deserializeProjectPackage(unknownRef), /missing transcript blob/);

  const sourceMismatch = clone(valid);
  const mismatchSnapshot = JSON.parse(sourceMismatch.files[activeSnapshotPath]);
  mismatchSnapshot.sourceTranscriptRefs[0].sourceId = "another-source";
  sourceMismatch.files[activeSnapshotPath] = JSON.stringify(mismatchSnapshot);
  assert.throws(() => deserializeProjectPackage(sourceMismatch), /ref\/source mismatch/);

  const activeMismatch = clone(valid);
  const project = JSON.parse(activeMismatch.files["project.json"]);
  project.project.name = "tampered current";
  activeMismatch.files["project.json"] = JSON.stringify(project);
  assert.throws(() => deserializeProjectPackage(activeMismatch), /does not match/);

  const partial = clone(valid);
  delete partial.files[activeSnapshotPath];
  assert.throws(() => deserializeProjectPackage(partial), /cursor references unknown snapshot/);

  const unsafeBlobPath = clone(valid);
  unsafeBlobPath.files["history/transcript-blobs/../outside.json"] = unsafeBlobPath.files[blobPath];
  assert.throws(() => deserializeProjectPackage(unsafeBlobPath), /Invalid history transcript blob path/);
});

test("V2 package serializes 500 unrelated commits with one transcript blob", () => {
  const history = historyWithTranscript();
  for (let index = 0; index < 500; index += 1) history.commit({ type: "project.rename", name: `Scale ${index}` });
  const serialized = serializeProjectPackage(history, fixedTime);
  assert.equal(Object.keys(serialized.files).filter((path) => path.startsWith("history/transcript-blobs/")).length, 1);
  assert.equal(Object.keys(serialized.files).filter((path) => path.startsWith("history/snapshots/")).length, 502);
  assert.equal(deserializeProjectPackage(serialized).current.project.name, "Scale 499");
});

test("v1 package migrates every snapshot and writes V2 on the next save", () => {
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
  assert.equal(roundTripManifest.formatVersion, 2);
  assert.equal(roundTripManifest.projectSchemaVersion, 2);
  const reopened = deserializeProjectPackage(roundTrip);
  assert.equal(reopened.canRedo, true);
  assert.equal(reopened.entries[0].id, "entry-1");
  assert.deepEqual(reopened.redo().extensions["cevra.migration.v1UnassignedTranscript"].payload, rawLegacy);
  assert.equal(reopened.undo().sourceTranscripts.length, 1);
});

test("V1 package with Project IR V2 preserves exact transcript metadata, IDs, and redo cursor through V2 rewrite", () => {
  const original = historyWithTranscript();
  original.commit({ type: "project.rename", name: "Newest" });
  original.undo();
  const fullSnapshots = original.snapshots;
  const active = original.current;
  const activeSnapshotId = active.history.headSnapshotId;
  const v1Package = { files: {
    "manifest.json": JSON.stringify({
      format: "cevra-project",
      formatVersion: 1,
      projectId: active.project.id,
      projectSchemaVersion: active.schemaVersion,
      activeSnapshotId,
      createdAt: active.project.createdAt,
      savedAt: fixedTime,
      defaultLocale: active.project.defaultLocale
    }),
    "project.json": JSON.stringify(active),
    "history/journal.jsonl": original.entries.map((entry) => JSON.stringify(entry)).join("\n"),
    ...Object.fromEntries(fullSnapshots.map((snapshot) => [
      `history/snapshots/${snapshot.id}.json`,
      JSON.stringify(snapshot)
    ]))
  }};

  const restoredV1 = deserializeProjectPackage(v1Package);
  assert.deepEqual(restoredV1.current, active);
  assert.deepEqual(restoredV1.current.sourceTranscripts[0].transcript.words[0].confidence, 0.91);
  assert.deepEqual(restoredV1.current.sourceTranscripts[0].provenance, transcriptFor().provenance);
  assert.deepEqual(restoredV1.current.sourceTranscripts[0].extensions, { review: "exact" });
  assert.deepEqual(restoredV1.entries.map(({ id, revision }) => ({ id, revision })), original.entries.map(({ id, revision }) => ({ id, revision })));
  assert.deepEqual(restoredV1.snapshots.map(({ id, revision }) => ({ id, revision })), fullSnapshots.map(({ id, revision }) => ({ id, revision })));
  assert.equal(restoredV1.canRedo, true);

  const v2Package = serializeProjectPackage(restoredV1, fixedTime);
  assert.equal(JSON.parse(v2Package.files["manifest.json"]).formatVersion, 2);
  const reopenedV2 = deserializeProjectPackage(v2Package);
  assert.deepEqual(reopenedV2.current, active);
  assert.equal(reopenedV2.canRedo, true);
  assert.equal(reopenedV2.redo().project.name, "Newest");
  assert.deepEqual(reopenedV2.undo().sourceTranscripts[0], transcriptFor());
});

test("v1 quarantine evidence survives a v2 source mutation and package round-trip", () => {
  let sequence = 0;
  const rawLegacy = {
    language: "pt",
    words: [{ id: "w1", text: "histórico", startMs: 0, endMs: 100, legacy: { keep: true } }],
    segments: [{ id: "s1", text: "histórico", startMs: 0, endMs: 100, wordIds: ["w1"] }],
    rawExtension: [true, null, "preserve"]
  };
  const legacy = legacyProject({
    name: "Historical quarantine",
    revision: 0,
    sources: [],
    transcript: rawLegacy,
    headSnapshotId: "snapshot-0"
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
  const legacyPackage = { files: {
    "manifest.json": JSON.stringify(manifest),
    "project.json": JSON.stringify(legacy),
    "history/journal.jsonl": "",
    "history/snapshots/snapshot-0.json": JSON.stringify({ id: "snapshot-0", revision: 0, createdAt: fixedTime, project: legacy })
  }};

  const history = deserializeProjectPackage(legacyPackage, {
    idGenerator: () => `roundtrip-${++sequence}`,
    clock: () => fixedTime
  });
  const historicalQuarantine = JSON.parse(JSON.stringify(history.current.extensions["cevra.migration.v1UnassignedTranscript"]));
  assert.equal(historicalQuarantine.reason, "no-eligible-source");
  assert.deepEqual(historicalQuarantine.eligibleSourceIdsAtMigration, []);
  assert.deepEqual(historicalQuarantine.payload, rawLegacy);

  const mutated = history.commit({ type: "source.add", source: legacySource("source-after-migration") });
  assert.deepEqual(mutated.sourceTranscripts, []);
  assert.deepEqual(mutated.extensions["cevra.migration.v1UnassignedTranscript"], historicalQuarantine);

  const reopened = deserializeProjectPackage(serializeProjectPackage(history, fixedTime));
  assert.deepEqual(reopened.current.sources.map(({ id }) => id), ["source-after-migration"]);
  assert.deepEqual(reopened.current.sourceTranscripts, []);
  assert.deepEqual(reopened.current.extensions["cevra.migration.v1UnassignedTranscript"], historicalQuarantine);
  assert.deepEqual(reopened.current.extensions["cevra.migration.v1UnassignedTranscript"].payload, rawLegacy);
});

test("v1 snapshots preserve the accepted quarantine canonical quarantine history boundary", () => {
  const rawLegacy = {
    language: "pt",
    words: [{ id: "w1", text: "fronteira", startMs: 0, endMs: 100 }],
    segments: [{ id: "s1", text: "fronteira", startMs: 0, endMs: 100, wordIds: ["w1"] }]
  };
  const noSourceSnapshot = legacyProject({
    name: "No source",
    revision: 0,
    sources: [],
    transcript: rawLegacy,
    headSnapshotId: "snapshot-0"
  });
  const canonicalSnapshot = legacyProject({
    name: "One source",
    revision: 1,
    sources: [legacySource("source-a")],
    transcript: rawLegacy,
    headEntryId: "entry-1",
    headSnapshotId: "snapshot-1"
  });
  const ambiguousSnapshot = legacyProject({
    name: "Two sources",
    revision: 2,
    sources: [legacySource("source-b"), legacySource("source-a")],
    transcript: rawLegacy,
    headEntryId: "entry-2",
    headSnapshotId: "snapshot-2"
  });
  const manifest = {
    format: "cevra-project",
    formatVersion: 1,
    projectId: "legacy-project",
    projectSchemaVersion: 1,
    activeSnapshotId: "snapshot-1",
    createdAt: fixedTime,
    savedAt: fixedTime,
    defaultLocale: "pt-BR"
  };
  const entries = [
    { id: "entry-1", revision: 1, command: { type: "project.rename", name: "One source" }, actor: { type: "user" }, createdAt: fixedTime, snapshotId: "snapshot-1" },
    { id: "entry-2", revision: 2, parentEntryId: "entry-1", command: { type: "project.rename", name: "Two sources" }, actor: { type: "user" }, createdAt: fixedTime, snapshotId: "snapshot-2" }
  ];
  const serialized = { files: {
    "manifest.json": JSON.stringify(manifest),
    "project.json": JSON.stringify(canonicalSnapshot),
    "history/journal.jsonl": entries.map((entry) => JSON.stringify(entry)).join("\n"),
    "history/snapshots/snapshot-0.json": JSON.stringify({ id: "snapshot-0", revision: 0, createdAt: fixedTime, project: noSourceSnapshot }),
    "history/snapshots/snapshot-1.json": JSON.stringify({ id: "snapshot-1", revision: 1, createdAt: fixedTime, project: canonicalSnapshot }),
    "history/snapshots/snapshot-2.json": JSON.stringify({ id: "snapshot-2", revision: 2, createdAt: fixedTime, project: ambiguousSnapshot })
  }};

  const history = deserializeProjectPackage(serialized);
  assert.equal(history.current.sourceTranscripts.length, 1);
  assert.equal(history.current.extensions["cevra.migration.v1UnassignedTranscript"], undefined);

  const earlier = history.undo();
  assert.deepStrictEqual(earlier.sourceTranscripts, []);
  assert.equal(earlier.extensions["cevra.migration.v1UnassignedTranscript"].reason, "no-eligible-source");
  assert.deepStrictEqual(earlier.extensions["cevra.migration.v1UnassignedTranscript"].payload, rawLegacy);

  const middle = history.redo();
  assert.equal(middle.sourceTranscripts.length, 1);
  assert.equal(middle.extensions["cevra.migration.v1UnassignedTranscript"], undefined);

  const later = history.redo();
  assert.deepStrictEqual(later.sourceTranscripts, []);
  assert.equal(later.extensions["cevra.migration.v1UnassignedTranscript"].reason, "ambiguous-multiple-sources");
  assert.deepStrictEqual(later.extensions["cevra.migration.v1UnassignedTranscript"].eligibleSourceIdsAtMigration, ["source-a", "source-b"]);
  assert.deepStrictEqual(later.extensions["cevra.migration.v1UnassignedTranscript"].payload, rawLegacy);

  history.undo();
  const reopened = deserializeProjectPackage(serializeProjectPackage(history, fixedTime));
  assert.equal(reopened.current.sourceTranscripts.length, 1);
  assert.deepStrictEqual(reopened.undo().extensions["cevra.migration.v1UnassignedTranscript"].payload, rawLegacy);
  assert.equal(reopened.redo().sourceTranscripts.length, 1);
  assert.deepStrictEqual(reopened.redo().extensions["cevra.migration.v1UnassignedTranscript"].payload, rawLegacy);
});
