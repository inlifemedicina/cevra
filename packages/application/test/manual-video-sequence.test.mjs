import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyProject, ProjectHistory, framesToMilliseconds, frameTimingMilliseconds } from "@cevra/project-ir";
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

function frameSetup(overrides = {}) {
  const f = setup(overrides);
  f.request = intent => ({ version: 2, expectedSnapshotId: f.history.current.history.headSnapshotId, ...intent });
  return f;
}
async function frameAction(f, intent, expected) {
  await action(f, intent, expected.map(([id, source, ...frames]) => [id, source, ...frames.map(framesToMilliseconds)]));
  assert.deepEqual([...f.history.current.timeline.clips].sort((a, b) => a.frameTiming.timelineStartFrame - b.frameTiming.timelineStartFrame)
    .map(c => [c.id, c.sourceId, c.frameTiming.sourceStartFrame, c.frameTiming.sourceEndFrame, c.frameTiming.timelineStartFrame, c.frameTiming.timelineEndFrame]), expected);
  assert.equal(f.history.current.timeline.timingPolicy, "cfr30");
  assert.equal(f.history.entries.at(-1).command.version, 2);
}

test("legacy group deletion closes all selected gaps in one recoverable Undo", async () => {
  const f = await fourRanges();
  await action(f, { type: "remove-many", clipIds: ["clip-4", "clip-2"] }, [
    ["clip-1", "s0", 0, 700, 0, 700], ["clip-3", "s0", 0, 700, 700, 1400]
  ]);
  await action(f, { type: "remove-many", clipIds: ["clip-1", "clip-3"] }, []);
  assert.equal(f.history.current.timeline.durationMs, 0);
});

test("CFR30 group deletion preserves every remaining frame range in one recoverable Undo", async () => {
  const f = frameSetup();
  for (const [sourceId, sourceStartFrame, sourceEndFrame] of [["s0", 0, 21], ["s0", 27, 45], ["s0", 0, 21], ["s1", 9, 30]]) {
    await f.service.edit(f.request({ type: "append", sourceId, sourceStartFrame, sourceEndFrame }));
  }
  await frameAction(f, { type: "remove-many", clipIds: ["clip-4", "clip-2"] }, [
    ["clip-1", "s0", 0, 21, 0, 21], ["clip-3", "s0", 0, 21, 21, 42]
  ]);
  await frameAction(f, { type: "remove-many", clipIds: ["clip-1", "clip-3"] }, []);
  assert.equal(f.history.current.timeline.durationMs, 0);
});

for (const version of [1, 2]) test(`V${version} invalid or stale group deletion retains the complete archive and redo`, async () => {
  const f = version === 1 ? await fourRanges() : frameSetup();
  if (version === 2) {
    await f.service.edit(f.request({ type: "append", sourceId: "s0", sourceStartFrame: 0, sourceEndFrame: 30 }));
    await f.service.edit(f.request({ type: "append", sourceId: "s1", sourceStartFrame: 0, sourceEndFrame: 30 }));
  }
  f.history.commit({ type: "project.rename", name: "retained redo" }); f.history.undo();
  const before = f.history.toArchive();
  f.identity.captureSource = async () => assert.fail("invalid work cannot read sources");
  for (const [clipIds, code] of [[[], "INVALID_SELECTION"], [["clip-1", "clip-1"], "INVALID_SELECTION"], [["clip-1", "foreign"], "CLIP_UNKNOWN"]]) {
    await assert.rejects(f.service.edit(f.request({ type: "remove-many", clipIds })), { code: `MANUAL_SEQUENCE_${code}` });
    assert.deepEqual(f.history.toArchive(), before);
  }
  await assert.rejects(f.service.edit(f.request({ type: "remove-many", clipIds: Array.from({ length: f.history.current.timeline.clips.length + 1 }, (_, index) => `foreign-${index}`) })), { code: "MANUAL_SEQUENCE_INVALID_SELECTION" });
  assert.deepEqual(f.history.toArchive(), before);
  await assert.rejects(f.service.edit({ ...f.request({ type: "remove-many", clipIds: ["clip-1"] }), expectedSnapshotId: "old" }), { code: "MANUAL_SEQUENCE_STALE" });
  assert.deepEqual(f.history.toArchive(), before);
});

test("all seven CFR30 intents use integer frame counts and one reversible atomic action", async () => {
  const f = frameSetup();
  await frameAction(f, { type: "append", sourceId: "s0", sourceStartFrame: 0, sourceEndFrame: 3 }, [["clip-1", "s0", 0, 3, 0, 3]]);
  await frameAction(f, { type: "append", sourceId: "s1", sourceStartFrame: 3, sourceEndFrame: 6 }, [["clip-1", "s0", 0, 3, 0, 3], ["clip-2", "s1", 3, 6, 3, 6]]);
  await frameAction(f, { type: "insert", beforeClipId: "clip-2", sourceId: "s0", sourceStartFrame: 1, sourceEndFrame: 2 },
    [["clip-1", "s0", 0, 3, 0, 3], ["clip-3", "s0", 1, 2, 3, 4], ["clip-2", "s1", 3, 6, 4, 7]]);
  await frameAction(f, { type: "duplicate", clipId: "clip-3" },
    [["clip-1", "s0", 0, 3, 0, 3], ["clip-3", "s0", 1, 2, 3, 4], ["clip-4", "s0", 1, 2, 4, 5], ["clip-2", "s1", 3, 6, 5, 8]]);
  await frameAction(f, { type: "trim", clipId: "clip-1", sourceStartFrame: 0, sourceEndFrame: 2 },
    [["clip-1", "s0", 0, 2, 0, 2], ["clip-3", "s0", 1, 2, 2, 3], ["clip-4", "s0", 1, 2, 3, 4], ["clip-2", "s1", 3, 6, 4, 7]]);
  await frameAction(f, { type: "split", clipId: "clip-2", timelineAtFrame: 5 },
    [["clip-1", "s0", 0, 2, 0, 2], ["clip-3", "s0", 1, 2, 2, 3], ["clip-4", "s0", 1, 2, 3, 4], ["clip-2", "s1", 3, 4, 4, 5], ["clip-5", "s1", 4, 6, 5, 7]]);
  await frameAction(f, { type: "reorder", clipIds: ["clip-5", "clip-1", "clip-3", "clip-4", "clip-2"] },
    [["clip-5", "s1", 4, 6, 0, 2], ["clip-1", "s0", 0, 2, 2, 4], ["clip-3", "s0", 1, 2, 4, 5], ["clip-4", "s0", 1, 2, 5, 6], ["clip-2", "s1", 3, 4, 6, 7]]);
  await frameAction(f, { type: "remove", clipId: "clip-3" },
    [["clip-5", "s1", 4, 6, 0, 2], ["clip-1", "s0", 0, 2, 2, 4], ["clip-4", "s0", 1, 2, 4, 5], ["clip-2", "s1", 3, 4, 5, 6]]);
});

test("legacy conform previews every boundary without mutation, requires reviewed positive complete ranges, and retains legacy Undo", async () => {
  const f = setup();
  await f.service.edit(f.request({ type: "append", sourceId: "s0", sourceStartMs: 0, sourceEndMs: 7 }));
  const archive = f.history.toArchive(), snapshot = f.history.current.history.headSnapshotId;
  const preview = f.service.previewConform(snapshot);
  assert.equal(preview.canConform, false); assert.equal(preview.clips[0].collapsed, true);
  assert.deepEqual(Object.keys(preview.clips[0].boundaries).sort(), ["sourceEnd", "sourceStart", "timelineEnd", "timelineStart"]);
  assert.equal(preview.clips[0].boundaries.sourceEnd.originalMs, 7);
  assert.equal(preview.clips[0].boundaries.sourceEnd.nearestFrame, 0);
  assert.equal(preview.clips[0].boundaries.sourceEnd.deltaMs, -7);
  assert.deepEqual(f.history.toArchive(), archive);
  const base = { version: 2, type: "conform", expectedSnapshotId: snapshot };
  for (const clips of [[], [{ clipId: "foreign", sourceStartFrame: 0, sourceEndFrame: 1 }],
    [{ clipId: "clip-1", sourceStartFrame: 0, sourceEndFrame: 0 }],
    [{ clipId: "clip-1", sourceStartFrame: 0, sourceEndFrame: 1 }, { clipId: "clip-1", sourceStartFrame: 0, sourceEndFrame: 1 }]]) {
    await assert.rejects(f.service.edit({ ...base, clips })); assert.deepEqual(f.history.toArchive(), archive);
  }
  await assert.rejects(f.service.edit({ version: 2, type: "duplicate", clipId: "clip-1", expectedSnapshotId: snapshot }), { code: "MANUAL_SEQUENCE_CONFORM_REQUIRED" });
  await f.service.edit({ ...base, clips: [{ clipId: "clip-1", sourceStartFrame: 0, sourceEndFrame: 1 }] });
  const after = f.history.current;
  assert.equal(after.timeline.durationMs, framesToMilliseconds(1)); assert.equal(f.history.entries.length, archive.entries.length + 1);
  await assert.rejects(f.service.edit(f.request({ type: "remove", clipId: "clip-1" })), { code: "MANUAL_SEQUENCE_UNSUPPORTED" });
  f.history.undo(); assert.deepEqual(f.history.toArchive().entries.slice(0, archive.entries.length), archive.entries);
  assert.equal(f.history.current.timeline.durationMs, 7); assert.equal(f.history.current.timeline.timingPolicy, "legacy-milliseconds");
  const restored = ProjectHistory.fromArchive(f.history.toArchive()); assert.deepEqual(restored.redo(), after);
});

test("CFR30 no-ops preserve redo, closed intents reject before media reads, and async ABA is stale", async () => {
  const f = frameSetup(); await f.service.edit(f.request({ type: "append", sourceId: "s0", sourceStartFrame: 1, sourceEndFrame: 8 }));
  f.history.commit({ type: "project.rename", name: "Retain redo" }); f.history.undo();
  const archive = f.history.toArchive();
  const capture = f.identity.captureSource;
  f.identity.captureSource = async () => assert.fail("no source reads for no-op/invalid work");
  await f.service.edit(f.request({ type: "trim", clipId: "clip-1", sourceStartFrame: 1, sourceEndFrame: 8 }));
  await f.service.edit(f.request({ type: "reorder", clipIds: ["clip-1"] }));
  for (const intent of [
    { type: "append", sourceId: "s0", sourceStartFrame: 0.5, sourceEndFrame: 1 },
    { type: "append", sourceId: "s0", sourceStartFrame: 0, sourceEndFrame: 1, sourceEndMs: 33 },
    { type: "trim", clipId: "clip-1", sourceStartFrame: 0, sourceEndFrame: 181 },
    { type: "split", clipId: "clip-1", timelineAtFrame: 0 },
    { type: "conform", clips: [{ clipId: "clip-1", sourceStartFrame: 0, sourceEndFrame: 1, extensions: {} }] }
  ]) await assert.rejects(f.service.edit(f.request(intent)));
  assert.deepEqual(f.history.toArchive(), archive);
  f.identity.captureSource = capture;
  const identify = f.identity.identifySource;
  f.identity.identifySource = async (...args) => { f.history.commit({ type: "project.rename", name: "ABA" }); f.history.undo(); return identify(...args); };
  await assert.rejects(f.service.edit(f.request({ type: "duplicate", clipId: "clip-1" })), { code: "MANUAL_SEQUENCE_STALE" });
  assert.equal(f.history.canRedo, true); assert.equal(f.history.current.timeline.clips.length, 1);
});

test("3000 canonical one-frame occurrences resolve without rounded-ms duration comparisons", async () => {
  const f = frameSetup();
  const clips = Array.from({ length: 3000 }, (_, frame) => {
    const frameTiming = { version: 1, timelineStartFrame: frame, timelineEndFrame: frame + 1, sourceStartFrame: 0, sourceEndFrame: 1 };
    return { id: `single-${frame}`, trackId: "v", sourceId: "s0", frameTiming, ...frameTimingMilliseconds(frameTiming), speed: 1, volume: 1, opacity: 1 };
  });
  f.history.commit({ type: "timeline.edit", version: 2, edits: [
    { type: "timeline.timingPolicy.set", timingPolicy: "cfr30" },
    { type: "track.add", track: { id: "v", kind: "video", name: "V", locked: false, hidden: false, muted: false } },
    ...clips.map(clip => ({ type: "clip.add", clip }))
  ] });
  const archive = f.history.toArchive();
  await f.service.edit(f.request({ type: "reorder", clipIds: clips.map(c => c.id) }));
  assert.deepEqual(f.history.toArchive(), archive); assert.equal(f.history.current.timeline.durationMs, 100000);
});
