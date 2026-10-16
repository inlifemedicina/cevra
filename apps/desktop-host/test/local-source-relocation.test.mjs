import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile, rename, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createEmptyProject, frameTimingMilliseconds, MANUAL_TITLE_COMPONENT, createSourceTranscript } from "@cevra/project-ir";
import { LocalSourceRelocationService, ManualTitleApplicationService } from "@cevra/application";
import { NodeMediaArtifactStore } from "@cevra/media-ffmpeg";
import { DesktopSession, validateSourceRelocationParams } from "../dist/index.js";
import { __openDesktopProjectForTest } from "../dist/persistence.js";

const unavailable = { available: false, reason: "runtime-not-configured" };
async function fixture(t, diagnostics = {}, injectFault) {
  const root = await mkdtemp(join(tmpdir(), "cevra-relocate-")); t.after(() => rm(root, { recursive: true, force: true }));
  const opened = await __openDesktopProjectForTest(join(root, "store"), { initialProject: createEmptyProject({ id: "relocate-physical" }) }, injectFault);
  const history = opened.history, original = join(root, "original.mp4"), moved = join(root, "moved.mp4"), bytes = Buffer.from("synthetic source bytes A");
  await writeFile(original, bytes);
  const content = { sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length };
  history.commit({ type: "source.add", source: { id: "s", kind: "video", uri: original, displayName: "Original", durationMs: 1000,
    technicalDescriptor: { version: 1, basis: "ingest", content, method: { profile: "cevra.source-technical.v1", engineId: "test", engineVersion: "1", engineApiVersion: 1 }, video: { codec: "h264" } },
    extensions: { "cevra.ingest": { method: "local", hasVideo: true } } } });
  const frameTiming = { version: 1, timelineStartFrame: 0, timelineEndFrame: 30, sourceStartFrame: 0, sourceEndFrame: 30 };
  history.commit({ type: "timeline.edit", version: 2, edits: [{ type: "timeline.timingPolicy.set", timingPolicy: "cfr30" },
    { type: "track.add", track: { id: "v", name: "V1", kind: "video", hidden: false, locked: false, muted: false } },
    { type: "clip.add", clip: { id: "c", trackId: "v", sourceId: "s", frameTiming, ...frameTimingMilliseconds(frameTiming), speed: 1, volume: 1, opacity: 1 } }] });
  new ManualTitleApplicationService(history).edit({ version: 1, type: "set", expectedSnapshotId: history.current.history.headSnapshotId,
    title: { version: 1, componentId: MANUAL_TITLE_COMPONENT, text: "Título preservado", startFrame: 1, endFrame: 29, aspect: "9:16" } });
  history.commit({ type: "transcript.set", transcript: createSourceTranscript({ sourceId: "s", wordTiming: "model", speakerState: "none",
    transcript: { language: "pt", words: [{ id: "w", text: "Olá", startMs: 0, endMs: 500 }], segments: [{ id: "seg", text: "Olá", startMs: 0, endMs: 500, wordIds: ["w"] }] },
    provenance: { stages: [{ kind: "transcription", executionId: "offline", engineId: "test", engineVersion: "1", engineApiVersion: "1", modelId: "base", createdAt: "2026-10-15T00:00:00.000Z" }] } }) });
  await opened.persistence.checkpoint(history); await rename(original, moved);
  const sessionFor = opened => new DesktopSession({ history: opened.history, persistence: opened.persistence, mediaCapability: unavailable, transcriptionCapability: unavailable,
    sourceRelocation: new LocalSourceRelocationService(opened.history, new NodeMediaArtifactStore(diagnostics)) });
  const session = sessionFor(opened); t.after(() => session.close());
  const request = () => ({ version: 1, sourceId: "s", expectedSnapshotId: history.current.history.headSnapshotId, uri: moved, operationId: "relocate-1", locale: "pt-BR" });
  return { root, opened, history, original, moved, bytes, session, sessionFor, request };
}

test("real moved-file hash, checkpoint and physical reopens preserve all edits and persisted Undo/Redo", async t => {
  const f = await fixture(t), before = f.history.current, numbering = f.history.sourceNumbering, count = f.history.entries.length;
  await assert.rejects(readFile(f.original), { code: "ENOENT" });
  assert.equal(f.session.state().capabilities.sourceRelocation.available, true, "requires no media engine/provider");
  const result = await f.session.relocateLocalSource(f.request());
  assert.equal(result.changed, true); assert.equal(result.state.status.persistence, "local-saved"); assert.equal(f.history.entries.length, count + 1);
  const after = f.history.current;
  assert.deepEqual(after.sources[0], { ...before.sources[0], uri: f.moved });
  for (const key of ["timeline", "graphics", "sourceTranscripts"]) assert.deepEqual(after[key], before[key]);
  assert.deepEqual(f.history.sourceNumbering, numbering); assert.deepEqual(await readFile(f.moved), f.bytes);
  await f.session.close();
  for (const action of ["undo", "redo"]) {
    const opened = await __openDesktopProjectForTest(join(f.root, "store"), {}), session = f.sessionFor(opened);
    try {
      assert.deepEqual(opened.history.current, action === "undo" ? after : before);
      await session[action](); assert.deepEqual(opened.history.current, action === "undo" ? before : after);
      assert.equal(session.state().status.persistence, "local-saved");
    } finally { await session.close(); }
  }
  const final = await __openDesktopProjectForTest(join(f.root, "store"), {});
  try { assert.deepEqual(final.history.current, after); assert.equal(final.history.canUndo, true); } finally { await final.persistence.close(); }
});

test("real different bytes of the same size cannot replace media or consume redo", async t => {
  const f = await fixture(t); f.history.commit({ type: "project.rename", name: "Redo" }); f.history.undo();
  const before = f.history.toArchive(); await writeFile(f.moved, Buffer.from("synthetic source bytes B"));
  await assert.rejects(f.session.relocateLocalSource(f.request()), { code: "SOURCE_RELOCATION_CONTENT_MISMATCH" });
  assert.deepEqual(f.history.toArchive(), before); assert.equal(f.history.canRedo, true);
});

test("native cancellation while hashing stops before commit and holds the mutation gate until settlement", async t => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const f = await fixture(t, { onSourceIdentityChunk: async () => { entered(); await new Promise(resolve => { release = resolve; }); } });
  const before = f.history.toArchive(), operation = f.session.relocateLocalSource(f.request());
  await started;
  await assert.rejects(f.session.undo(), { code: "PROJECT_MUTATION_BUSY" });
  assert.equal(f.session.cancel("relocate-1").cancelled, true); release();
  await assert.rejects(operation, { code: "SOURCE_RELOCATION_CANCELLED" });
  assert.deepEqual(f.history.toArchive(), before); assert.deepEqual(await readFile(f.moved), f.bytes);
});

test("checkpoint failure reports reconciled changed memory while preserving the old durable project", async t => {
  let fail = false;
  const f = await fixture(t, {}, point => { if (fail && point === "checkpoint-write") throw Error("controlled failure"); });
  const before = f.history.current; fail = true;
  await assert.rejects(f.session.relocateLocalSource(f.request()), error => {
    assert.equal(error.code, "PROJECT_PERSISTENCE_FAILED"); assert.equal(error.details.state.project.sources[0].uri, f.moved); return true;
  });
  assert.equal(f.history.current.sources[0].uri, f.moved); assert.equal(f.session.state().status.persistence, "persistence-error");
  await f.session.close();
  const reopened = await __openDesktopProjectForTest(join(f.root, "store"), {});
  try { assert.deepEqual(reopened.history.current, before); } finally { await reopened.persistence.close(); }
});

test("private Host request accepts only one source and a closed native candidate", () => {
  const request = { version: 1, sourceId: "s", expectedSnapshotId: "snapshot", uri: "/native-picked.mp4", operationId: "relocate-1", locale: "en-US" };
  assert.deepEqual(validateSourceRelocationParams(request, "request"), request);
  for (const extra of [{ paths: [] }, { sha256: "a".repeat(64) }, { replace: true }]) assert.throws(() => validateSourceRelocationParams({ ...request, ...extra }, "request"));
});
