import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyProject, ProjectHistory } from "@cevra/project-ir";
import { ManualVideoSequenceApplicationService } from "../dist/index.js";

function setup(identityOverrides = {}, idGenerator) {
  let snapshot = 0;
  let occurrence = 0;
  const history = new ProjectHistory(createEmptyProject({ id: "continuous-manual" }), {
    idGenerator: () => `snapshot-${++snapshot}`,
    clock: () => "2026-10-05T00:00:00.000Z"
  });
  for (const id of ["s0", "s1"]) history.commit({ type: "source.add", source: {
    id, kind: "video", uri: `/tmp/${id}.mp4`, displayName: `${id}.mp4`, durationMs: 6000,
    technicalDescriptor: { version: 1, basis: "ingest", content: { sha256: "a".repeat(64), sizeBytes: 10 },
      method: { profile: "cevra.source-technical.v1", engineId: "test", engineVersion: "1", engineApiVersion: 1 }, video: { codec: "h264" } },
    extensions: { "cevra.ingest": { method: "local", hasVideo: true } }
  } });
  const identity = {
    async captureSource(uri) { return { version: 1, uri, canonicalPath: uri, device: "1", inode: "1", sizeBytes: 10, mtimeNs: "1", ctimeNs: "1" }; },
    async identifySource(uri, stamp) { return { version: 1, content: { sha256: "a".repeat(64), sizeBytes: 10 }, stamp, bytesRead: 10 }; },
    async checkSource() { return "match"; }, ...identityOverrides
  };
  const service = new ManualVideoSequenceApplicationService({ history, identity, idGenerator: idGenerator ?? (() => String(++occurrence)) });
  const request = (intent) => ({ version: 1, expectedSnapshotId: history.current.history.headSnapshotId, ...intent });
  return { history, service, identity, request };
}

function rows(history) {
  return [...history.current.timeline.clips].sort((a, b) => a.timelineStartMs - b.timelineStartMs)
    .map(c => [c.id, c.sourceId, c.sourceStartMs, c.sourceEndMs, c.timelineStartMs, c.timelineEndMs]);
}

async function action(f, intent, expected) {
  const before = f.history.current;
  const numbering = f.history.sourceNumbering;
  const entries = f.history.entries.length;
  const snapshots = f.history.toArchive().snapshots.length;
  await f.service.edit(f.request(intent));
  assert.deepEqual(rows(f.history), expected);
  assert.equal(f.history.entries.length, entries + 1);
  assert.equal(f.history.toArchive().snapshots.length, snapshots + 1);
  assert.equal(f.history.entries.at(-1).command.type, "timeline.edit");
  assert.equal(f.history.entries.at(-1).actor.type, "user");
  assert.deepEqual(f.history.current.sources, before.sources);
  assert.deepEqual(f.history.sourceNumbering, numbering);
  const after = f.history.current;
  f.history.undo();
  assert.deepEqual(f.history.current, before);
  const reopened = ProjectHistory.fromArchive(f.history.toArchive());
  reopened.redo();
  assert.deepEqual(reopened.current, after);
  assert.deepEqual(reopened.sourceNumbering, numbering);
  f.history.redo();
  assert.deepEqual(f.history.current, after);
}

async function fourRanges(overrides, idGenerator) {
  const f = setup(overrides, idGenerator);
  for (const [sourceId, sourceStartMs, sourceEndMs] of [["s0", 0, 700], ["s0", 900, 1500], ["s0", 0, 700], ["s1", 300, 1000]]) {
    await f.service.edit(f.request({ type: "append", sourceId, sourceStartMs, sourceEndMs }));
  }
  return f;
}

test("repeated and other-source ranges append contiguously with one Undo including initial track", async () => {
  const f = setup();
  await action(f, { type: "append", sourceId: "s0", sourceStartMs: 0, sourceEndMs: 700 }, [["clip-1", "s0", 0, 700, 0, 700]]);
  await action(f, { type: "append", sourceId: "s0", sourceStartMs: 900, sourceEndMs: 1500 }, [
    ["clip-1", "s0", 0, 700, 0, 700], ["clip-2", "s0", 900, 1500, 700, 1300]
  ]);
  await action(f, { type: "append", sourceId: "s0", sourceStartMs: 0, sourceEndMs: 700 }, [
    ["clip-1", "s0", 0, 700, 0, 700], ["clip-2", "s0", 900, 1500, 700, 1300], ["clip-3", "s0", 0, 700, 1300, 2000]
  ]);
  await action(f, { type: "append", sourceId: "s1", sourceStartMs: 300, sourceEndMs: 1000 }, [
    ["clip-1", "s0", 0, 700, 0, 700], ["clip-2", "s0", 900, 1500, 700, 1300], ["clip-3", "s0", 0, 700, 1300, 2000], ["clip-4", "s1", 300, 1000, 2000, 2700]
  ]);
  assert.equal(f.history.current.timeline.tracks.length, 1);
  assert.equal(f.history.current.timeline.durationMs, 2700);
});

test("insert precedes selected occurrence and ripples the following ranges in one action", async () => {
  const f = await fourRanges();
  await action(f, { type: "insert", beforeClipId: "clip-2", sourceId: "s1", sourceStartMs: 100, sourceEndMs: 200 }, [
    ["clip-1", "s0", 0, 700, 0, 700], ["clip-5", "s1", 100, 200, 700, 800], ["clip-2", "s0", 900, 1500, 800, 1400],
    ["clip-3", "s0", 0, 700, 1400, 2100], ["clip-4", "s1", 300, 1000, 2100, 2800]
  ]);
});

test("duplicate follows selected occurrence with a new ID and the same original range", async () => {
  const f = await fourRanges();
  await action(f, { type: "duplicate", clipId: "clip-2" }, [
    ["clip-1", "s0", 0, 700, 0, 700], ["clip-2", "s0", 900, 1500, 700, 1300], ["clip-5", "s0", 900, 1500, 1300, 1900],
    ["clip-3", "s0", 0, 700, 1900, 2600], ["clip-4", "s1", 300, 1000, 2600, 3300]
  ]);
});

test("remove and trim close the gap while retaining source IN/OUT on other occurrences", async () => {
  const f = await fourRanges();
  await action(f, { type: "remove", clipId: "clip-2" }, [
    ["clip-1", "s0", 0, 700, 0, 700], ["clip-3", "s0", 0, 700, 700, 1400], ["clip-4", "s1", 300, 1000, 1400, 2100]
  ]);
  await action(f, { type: "trim", clipId: "clip-3", sourceStartMs: 100, sourceEndMs: 500 }, [
    ["clip-1", "s0", 0, 700, 0, 700], ["clip-3", "s0", 100, 500, 700, 1100], ["clip-4", "s1", 300, 1000, 1100, 1800]
  ]);
});

test("split maps the canonical nonzero placement to source time, then reorder remains contiguous", async () => {
  const f = await fourRanges();
  await action(f, { type: "split", clipId: "clip-2", timelineAtMs: 1000 }, [
    ["clip-1", "s0", 0, 700, 0, 700], ["clip-2", "s0", 900, 1200, 700, 1000], ["clip-5", "s0", 1200, 1500, 1000, 1300],
    ["clip-3", "s0", 0, 700, 1300, 2000], ["clip-4", "s1", 300, 1000, 2000, 2700]
  ]);
  await action(f, { type: "reorder", clipIds: ["clip-4", "clip-2", "clip-5", "clip-1", "clip-3"] }, [
    ["clip-4", "s1", 300, 1000, 0, 700], ["clip-2", "s0", 900, 1200, 700, 1000], ["clip-5", "s0", 1200, 1500, 1000, 1300],
    ["clip-1", "s0", 0, 700, 1300, 2000], ["clip-3", "s0", 0, 700, 2000, 2700]
  ]);
});

test("no-op trim/reorder and invalid intents preserve the complete redo archive without source reads", async () => {
  const f = await fourRanges();
  f.history.commit({ type: "project.rename", name: "Retained redo" }); f.history.undo();
  const before = f.history.toArchive();
  f.identity.captureSource = async () => assert.fail("must not read unchanged or invalid work");
  await f.service.edit(f.request({ type: "trim", clipId: "clip-2", sourceStartMs: 900, sourceEndMs: 1500 }));
  await f.service.edit(f.request({ type: "reorder", clipIds: ["clip-1", "clip-2", "clip-3", "clip-4"] }));
  for (const [intent, code] of [
    [{ type: "split", clipId: "clip-2", timelineAtMs: 700 }, "INVALID_RANGE"],
    [{ type: "split", clipId: "clip-2", timelineAtMs: 1300 }, "INVALID_RANGE"],
    [{ type: "reorder", clipIds: ["clip-1", "clip-1", "clip-3", "clip-4"] }, "INVALID_ORDER"],
    [{ type: "reorder", clipIds: ["clip-1", "foreign", "clip-3", "clip-4"] }, "INVALID_ORDER"],
    [{ type: "remove", clipId: "foreign" }, "CLIP_UNKNOWN"],
    [{ type: "append", sourceId: "s0", sourceStartMs: -1, sourceEndMs: 10 }, "INVALID_RANGE"],
    [{ type: "append", sourceId: "s0", sourceStartMs: 0, sourceEndMs: 6001 }, "INVALID_RANGE"],
    [{ type: "append", sourceId: "s0", sourceStartMs: 0.5, sourceEndMs: 10 }, "INVALID_REQUEST"],
    [{ type: "remove", clipId: "clip-1", path: "/tmp/injected" }, "INVALID_REQUEST"],
    [{ type: "remove", clipId: "clip-1", edits: [] }, "INVALID_REQUEST"]
  ]) await assert.rejects(f.service.edit(f.request(intent)), { code: `MANUAL_SEQUENCE_${code}` });
  assert.deepEqual(f.history.toArchive(), before);
});

test("metadata-only remove/reorder can edit offline originals without hashing media", async () => {
  const f = await fourRanges();
  f.identity.captureSource = async () => assert.fail("must not read media for metadata-only edit");
  await f.service.edit(f.request({ type: "remove", clipId: "clip-2" }));
  await f.service.edit(f.request({ type: "reorder", clipIds: ["clip-4", "clip-3", "clip-1"] }));
  assert.deepEqual(rows(f.history), [["clip-4", "s1", 300, 1000, 0, 700], ["clip-3", "s0", 0, 700, 700, 1400], ["clip-1", "s0", 0, 700, 1400, 2100]]);
});

test("changed content and intervening edit plus Undo reject async duplicate and preserve redo", async () => {
  const f = await fourRanges();
  f.identity.checkSource = async () => "changed";
  const before = f.history.toArchive();
  await assert.rejects(f.service.edit(f.request({ type: "duplicate", clipId: "clip-2" })), { code: "MANUAL_VIDEO_SOURCE_CHANGED" });
  assert.deepEqual(f.history.toArchive(), before);
  f.identity.checkSource = async () => "match";
  const identify = f.identity.identifySource;
  f.identity.identifySource = async (...args) => {
    f.history.commit({ type: "project.rename", name: "Intervening" }); f.history.undo();
    return identify(...args);
  };
  await assert.rejects(f.service.edit(f.request({ type: "duplicate", clipId: "clip-2" })), { code: "MANUAL_SEQUENCE_STALE" });
  assert.equal(f.history.canRedo, true);
  assert.equal(f.history.entries.at(-1).command.type, "project.rename");
  assert.equal(f.history.current.timeline.clips.length, 4);
});

test("an occurrence ID collision cannot silently replace an existing clip", async () => {
  const f = await fourRanges();
  const collision = new ManualVideoSequenceApplicationService({ history: f.history, identity: f.identity, idGenerator: () => "2" });
  const before = f.history.toArchive();
  await assert.rejects(collision.edit(f.request({ type: "duplicate", clipId: "clip-2" })), { code: "MANUAL_SEQUENCE_ID_COLLISION" });
  assert.deepEqual(f.history.toArchive(), before);
});

for (const change of ["gap", "overlap", "locked", "hidden", "speed", "volume", "caption"]) {
  test(`unsupported ${change} composition is preserved without media reads`, async () => {
    const f = await fourRanges(); const project = f.history.current;
    if (change === "gap") { project.timeline.clips[1].timelineStartMs += 100; project.timeline.clips[1].timelineEndMs += 100; }
    if (change === "overlap") { project.timeline.clips[1].timelineStartMs -= 100; project.timeline.clips[1].timelineEndMs -= 100; }
    if (change === "locked" || change === "hidden") project.timeline.tracks[0][change] = true;
    if (change === "speed") project.timeline.clips[0].speed = 2;
    if (change === "volume") project.timeline.clips[0].volume = 0.5;
    if (change === "caption") project.captions.push({ id: "c", text: "Keep me", startMs: 0, endMs: 500 });
    const history = new ProjectHistory(project);
    const service = new ManualVideoSequenceApplicationService({ history, identity: { async captureSource() { assert.fail("must not read unsupported work"); } } });
    const before = history.toArchive();
    await assert.rejects(service.edit({ version: 1, type: "remove", clipId: "clip-2", expectedSnapshotId: history.current.history.headSnapshotId }), { code: "MANUAL_SEQUENCE_UNSUPPORTED" });
    assert.deepEqual(history.toArchive(), before);
  });
}
