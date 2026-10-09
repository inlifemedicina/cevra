import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyProject, ProjectHistory } from "@cevra/project-ir";
import { ManualSequencePreviewApplicationService, ManualVideoSequenceApplicationService } from "../dist/index.js";

async function setup(overrides = {}) {
  let id = 0;
  const history = new ProjectHistory(createEmptyProject({ id: "preview-montage" }), { idGenerator: () => `s-${++id}` });
  for (const sourceId of ["v0", "v1"]) history.commit({ type: "source.add", source: {
    id: sourceId, kind: "video", uri: `/tmp/${sourceId}.mp4`, displayName: `${sourceId}.mp4`, durationMs: 6000,
    technicalDescriptor: { version: 1, basis: "ingest", content: { sha256: "a".repeat(64), sizeBytes: 10 },
      method: { profile: "cevra.source-technical.v1", engineId: "fixture", engineVersion: "1", engineApiVersion: 1 }, video: { codec: "h264" } },
    extensions: { "cevra.ingest": { method: "local", hasVideo: true } }
  } });
  const calls = [];
  const identity = {
    async captureSource(uri, signal) { signal?.throwIfAborted(); calls.push(["capture", uri]); return { version: 1, uri, canonicalPath: uri, device: "1", inode: "1", sizeBytes: 10, mtimeNs: "1", ctimeNs: "1" }; },
    async identifySource(uri, stamp, signal) { signal?.throwIfAborted(); calls.push(["hash", uri]); return { version: 1, stamp, content: { sha256: "a".repeat(64), sizeBytes: 10 }, bytesRead: 10 }; },
    async checkSource(uri, stamp, signal) { signal?.throwIfAborted(); calls.push(["check", uri]); return "match"; }
  };
  const editor = new ManualVideoSequenceApplicationService({ history, identity, idGenerator: () => String(++id) });
  for (const [sourceId, sourceStartMs, sourceEndMs] of [["v0", 0, 700], ["v0", 900, 1500], ["v0", 0, 700], ["v1", 300, 1000]]) {
    await editor.edit({ version: 1, expectedSnapshotId: history.current.history.headSnapshotId, type: "append", sourceId, sourceStartMs, sourceEndMs });
  }
  calls.length = 0;
  Object.assign(identity, overrides);
  const preview = new ManualSequencePreviewApplicationService({ history, identity });
  return { history, identity, calls, preview, request: () => ({ version: 1, expectedSnapshotId: history.current.history.headSnapshotId }) };
}

test("four-range preparation verifies two unique originals and preserves archive, numbering and redo", async () => {
  const f = await setup();
  f.history.commit({ type: "project.rename", name: "redo retained" }); f.history.undo();
  const before = f.history.toArchive();
  const plan = await f.preview.prepare(f.request());
  assert.equal(plan.durationMs, 2700);
  assert.deepEqual(plan.sources.map(source => source.id), ["v0", "v1"]);
  assert.deepEqual(plan.clips.map(clip => [clip.sourceId, clip.sourceStartMs, clip.sourceEndMs, clip.timelineStartMs, clip.timelineEndMs]), [
    ["v0", 0, 700, 0, 700], ["v0", 900, 1500, 700, 1300], ["v0", 0, 700, 1300, 2000], ["v1", 300, 1000, 2000, 2700]
  ]);
  assert.deepEqual(f.calls.filter(call => call[0] === "hash"), [["hash", "/tmp/v0.mp4"], ["hash", "/tmp/v1.mp4"]]);
  assert.deepEqual(f.history.toArchive(), before);
  assert.equal(f.history.canRedo, true);
  assert.throws(() => { plan.clips[0].sourceStartMs = 5; }, TypeError);
  assert.throws(() => { plan.sources[0].technicalDescriptor.content.sha256 = "b".repeat(64); }, TypeError);
});

test("program joins use the following occurrence and exact program OUT returns no source position", async () => {
  const f = await setup(); const plan = await f.preview.prepare(f.request());
  for (const [time, index, sourceTime] of [[0, 0, 0], [699, 0, 699], [700, 1, 900], [1299, 1, 1499], [1300, 2, 0], [1999, 2, 699], [2000, 3, 300], [2699, 3, 999]]) {
    assert.deepEqual(f.preview.position(plan, time), { clipId: plan.clips[index].id, sourceId: plan.clips[index].sourceId, sourceTimeMs: sourceTime });
  }
  assert.equal(f.preview.position(plan, 2700), null);
  for (const time of [-1, 2701, 0.5, NaN, Infinity]) assert.throws(() => f.preview.position(plan, time), { code: "MANUAL_SEQUENCE_INVALID_RANGE" });
});

test("closed request rejects injected paths and stale IDs without identity work", async () => {
  const f = await setup(); const before = f.history.toArchive();
  for (const request of [null, [], { ...f.request(), inputUri: "/tmp/foreign.mp4" }, { ...f.request(), version: 2 }, { ...f.request(), expectedSnapshotId: "" }]) {
    await assert.rejects(f.preview.prepare(request), { code: "MANUAL_SEQUENCE_INVALID_REQUEST" });
  }
  await assert.rejects(f.preview.prepare({ ...f.request(), expectedSnapshotId: "stale" }), { code: "MANUAL_SEQUENCE_STALE" });
  assert.deepEqual(f.calls, []); assert.deepEqual(f.history.toArchive(), before);
});

test("a plan is instance-bound and becomes stale after edit/Undo returning to the same snapshot", async () => {
  const f = await setup(); const plan = await f.preview.prepare(f.request());
  assert.throws(() => f.preview.assertCurrent(structuredClone(plan)), { code: "MANUAL_SEQUENCE_STALE" });
  const other = new ManualSequencePreviewApplicationService({ history: f.history, identity: f.identity });
  assert.throws(() => other.assertCurrent(plan), { code: "MANUAL_SEQUENCE_STALE" });
  f.history.commit({ type: "project.rename", name: "intervening" }); f.history.undo();
  assert.equal(f.history.current.history.headSnapshotId, plan.snapshotId);
  assert.throws(() => f.preview.position(plan, 0), { code: "MANUAL_SEQUENCE_STALE" });
});

test("edit/Undo while hashing cannot publish a stale read-only plan", async () => {
  const f = await setup();
  const original = f.identity.identifySource;
  let once = false;
  f.identity.identifySource = async (...args) => {
    if (!once) { once = true; f.history.commit({ type: "project.rename", name: "during verify" }); f.history.undo(); }
    return original(...args);
  };
  const snapshot = f.request().expectedSnapshotId;
  await assert.rejects(f.preview.prepare(f.request()), { code: "MANUAL_SEQUENCE_STALE" });
  assert.equal(f.history.current.history.headSnapshotId, snapshot);
  assert.equal(f.history.canRedo, true);
});

test("all originals are rechecked after the final hash; changed bytes never publish a plan", async () => {
  const f = await setup(); let secondHashed = false;
  const hash = f.identity.identifySource;
  f.identity.identifySource = async (...args) => { const result = await hash(...args); if (args[0].endsWith("v1.mp4")) secondHashed = true; return result; };
  f.identity.checkSource = async uri => secondHashed && uri.endsWith("v0.mp4") ? "changed" : "match";
  const before = f.history.toArchive();
  await assert.rejects(f.preview.prepare(f.request()), { code: "MANUAL_VIDEO_SOURCE_CHANGED" });
  assert.deepEqual(f.history.toArchive(), before);
});

test("cancellation propagates into identity work and never publishes or mutates state", async () => {
  const f = await setup(); const controller = new AbortController();
  const before = f.history.toArchive(); const hash = f.identity.identifySource;
  f.identity.identifySource = async (uri, stamp, signal) => { assert.equal(signal, controller.signal); controller.abort(); return hash(uri, stamp, signal); };
  await assert.rejects(f.preview.prepare(f.request(), controller.signal), { name: "AbortError" });
  assert.deepEqual(f.history.toArchive(), before);
  f.calls.length = 0;
  await assert.rejects(f.preview.prepare(f.request(), controller.signal), { name: "AbortError" });
  assert.deepEqual(f.calls, []);
});

test("a seven-millisecond range retains its exact canonical source/program bounds without frame snapping", async () => {
  const f = await setup();
  const editor = new ManualVideoSequenceApplicationService({ history: f.history, identity: f.identity });
  await editor.edit({ ...f.request(), type: "append", sourceId: "v0", sourceStartMs: 901, sourceEndMs: 908 });
  const plan = await f.preview.prepare(f.request());
  assert.equal(plan.durationMs, 2707);
  assert.equal(f.preview.position(plan, 2700).sourceTimeMs, 901);
  assert.equal(f.preview.position(plan, 2706).sourceTimeMs, 907);
  assert.equal(f.preview.position(plan, 2707), null);
  assert.equal(plan.clips.at(-1).sourceEndMs, 908);
});

test("source clock near MAX_SAFE stays inside IN/OUT at a nonzero program placement", async () => {
  const f = await setup();
  for (const duration of [1, 4]) {
    const history = new ProjectHistory(createEmptyProject({ id: `large-source-clock-${duration}` }));
    const source = { ...f.history.current.sources[0], durationMs: Number.MAX_SAFE_INTEGER };
    history.commit({ type: "source.add", source });
    const editor = new ManualVideoSequenceApplicationService({ history, identity: f.identity });
    for (const [begin, end] of [[0, 1001], [Number.MAX_SAFE_INTEGER - duration, Number.MAX_SAFE_INTEGER]]) {
      await editor.edit({ version: 1, expectedSnapshotId: history.current.history.headSnapshotId, type: "append", sourceId: source.id, sourceStartMs: begin, sourceEndMs: end });
    }
    const preview = new ManualSequencePreviewApplicationService({ history, identity: f.identity });
    const plan = await preview.prepare({ version: 1, expectedSnapshotId: history.current.history.headSnapshotId });
    assert.equal(preview.position(plan, 1001).sourceTimeMs, Number.MAX_SAFE_INTEGER - duration);
    assert.equal(preview.position(plan, 1001 + duration - 1).sourceTimeMs, Number.MAX_SAFE_INTEGER - 1);
    assert.equal(preview.position(plan, 1001 + duration), null);
  }
});

test("CFR30 preview maps finite decoder time to integer frames, half-open joins and exact OUT without drift", async () => {
  const f = await setup();
  const history = new ProjectHistory(createEmptyProject({ id: "cfr30-preview" }));
  for (const source of f.history.current.sources) history.commit({ type: "source.add", source });
  const editor = new ManualVideoSequenceApplicationService({ history, identity: f.identity });
  for (const [sourceStartFrame, sourceEndFrame] of [[27, 28], [55, 58], [91, 92]]) {
    await editor.edit({ version: 2, expectedSnapshotId: history.current.history.headSnapshotId, type: "append", sourceId: "v0", sourceStartFrame, sourceEndFrame });
  }
  const preview = new ManualSequencePreviewApplicationService({ history, identity: f.identity });
  const plan = await preview.prepare({ version: 1, expectedSnapshotId: history.current.history.headSnapshotId });
  assert.equal(plan.timingPolicy, "cfr30");
  assert.deepEqual(preview.position(plan, 0), { clipId: plan.clips[0].id, sourceId: "v0", timelineFrame: 0, sourceFrame: 27, sourceTimeMs: 900 });
  for (const ms of [0.01, 7, 1000 / 30 - 1e-10]) assert.equal(preview.position(plan, ms).sourceFrame, 27);
  assert.equal(preview.position(plan, 1000 / 30).sourceFrame, 55);
  assert.equal(preview.position(plan, 3999 / 30).sourceFrame, 57);
  assert.equal(preview.position(plan, 4000 / 30).sourceFrame, 91);
  assert.equal(preview.position(plan, 4999 / 30).sourceFrame, 91);
  assert.equal(preview.position(plan, 5000 / 30), null);
  for (const ms of [-1, NaN, Infinity, plan.durationMs + 0.01]) assert.throws(() => preview.position(plan, ms), { code: "MANUAL_SEQUENCE_INVALID_RANGE" });
  const archive = history.toArchive();
  const reopened = ProjectHistory.fromArchive(archive);
  assert.deepEqual(reopened.current.timeline, history.current.timeline);
  assert.deepEqual(history.toArchive(), archive);
});
