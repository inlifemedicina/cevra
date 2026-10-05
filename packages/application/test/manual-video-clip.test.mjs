import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyProject, ProjectHistory } from "@cevra/project-ir";
import { ManualVideoClipApplicationService } from "../dist/index.js";

function setup(sourceOverrides = {}, identityOverrides = {}, idGenerator) {
  let sequence = 0;
  const history = new ProjectHistory(createEmptyProject({ id: "manual-project" }), { idGenerator: () => `snapshot-${++sequence}` });
  history.commit({ type: "source.add", source: { id: "video", kind: "video", uri: "/tmp/fixture.mp4", displayName: "fixture.mp4", durationMs: 6000,
    technicalDescriptor: { version: 1, basis: "ingest", content: { sha256: "a".repeat(64), sizeBytes: 10 },
      method: { profile: "cevra.source-technical.v1", engineId: "test", engineVersion: "1", engineApiVersion: 1 }, video: { codec: "h264" } },
    extensions: { "cevra.ingest": { method: "local", hasVideo: true } }, ...sourceOverrides } });
  const stamp = { version: 1, uri: "/tmp/fixture.mp4", canonicalPath: "/tmp/fixture.mp4", device: "1", inode: "1", sizeBytes: 10, mtimeNs: "1", ctimeNs: "1" };
  const identity = {
    async captureSource() { return stamp; },
    async identifySource() { return { version: 1, content: { sha256: "a".repeat(64), sizeBytes: 10 }, stamp, bytesRead: 10 }; },
    async checkSource() { return "match"; }, ...identityOverrides
  };
  const service = new ManualVideoClipApplicationService({ history, identity, ...(idGenerator ? { idGenerator } : {}) });
  const request = { sourceId: "video", expectedSnapshotId: history.current.history.headSnapshotId, sourceStartMs: 1000, sourceEndMs: 4000 };
  return { history, service, request };
}

test("manual excerpt uses typed history, exact source range, stable numbering and recoverable undo/redo", async () => {
  const { history, service, request } = setup();
  const source = history.current.sources[0]; const numbering = history.sourceNumbering;
  const before = history.current; const entryCount = history.entries.length;
  const outcome = await service.create(request);
  assert.equal(history.entries.length, entryCount + 1);
  assert.deepEqual([history.entries.at(-1).command.type, history.entries.at(-1).actor.type], ["timeline.edit", "user"]);
  const clip = outcome.project.timeline.clips[0];
  assert.deepEqual([clip.sourceId, clip.sourceStartMs, clip.sourceEndMs, clip.timelineStartMs, clip.timelineEndMs, clip.speed], ["video", 1000, 4000, 0, 3000, 1]);
  assert.equal(outcome.clipId, clip.id); assert.equal(outcome.project.timeline.durationMs, 3000);
  assert.deepEqual(outcome.project.sources[0], source); assert.deepEqual(history.sourceNumbering, numbering);
  history.undo(); assert.deepEqual(history.current.timeline, before.timeline);
  const restored = ProjectHistory.fromArchive(history.toArchive());
  restored.redo(); assert.deepEqual(restored.current.timeline.clips, [clip]); assert.deepEqual(restored.sourceNumbering, numbering);
});

for (const range of [[-1, 100], [1000, 1000], [1000, 999], [0.5, 2000], [0, 6001], [0, Number.MAX_SAFE_INTEGER + 1]]) {
  test(`invalid range ${range} leaves every snapshot and journal entry unchanged`, async () => {
    const { history, service, request } = setup(); const archive = history.toArchive();
    await assert.rejects(service.create({ ...request, sourceStartMs: range[0], sourceEndMs: range[1] }), { code: "MANUAL_VIDEO_INVALID_RANGE" });
    assert.deepEqual(history.toArchive(), archive);
  });
}

test("stale and injected requests fail before identity access", async () => {
  const { history, service, request } = setup({}, { async captureSource() { assert.fail("must not read"); } }); const before = history.toArchive();
  await assert.rejects(service.create({ ...request, expectedSnapshotId: "old" }), { code: "MANUAL_VIDEO_STALE" });
  await assert.rejects(service.create({ ...request, uri: "/tmp/other.mp4" }), { code: "MANUAL_VIDEO_INVALID_REQUEST" });
  assert.deepEqual(history.toArchive(), before);
});

test("legacy source without strong ingest evidence cannot create a clip", async () => {
  const { history, service, request } = setup({ technicalDescriptor: undefined }); const before = history.toArchive();
  await assert.rejects(service.create(request), { code: "MANUAL_VIDEO_UNSUPPORTED" }); assert.deepEqual(history.toArchive(), before);
});

test("identity changes between hashing and commit leave timeline and journal unchanged", async () => {
  const { history, service, request } = setup({}, { async checkSource() { return "changed"; } }); const before = history.toArchive();
  await assert.rejects(service.create(request), { code: "MANUAL_VIDEO_SOURCE_CHANGED" }); assert.deepEqual(history.toArchive(), before);
});

test("replaced oversized source is rejected before hashing any bytes", async () => {
  const { history, service, request } = setup({}, {
    async captureSource() { return { sizeBytes: 64 * 1024 * 1024 }; },
    async identifySource() { assert.fail("must not hash an oversized replacement"); }
  });
  const before = history.toArchive();
  await assert.rejects(service.create(request), { code: "MANUAL_VIDEO_SOURCE_CHANGED" });
  assert.deepEqual(history.toArchive(), before);
});

test("canonical mutation while hashing rejects the old snapshot", async () => {
  const setupResult = setup({}, { async identifySource() {
    setupResult.history.commit({ type: "project.rename", name: "Changed while reading" });
    return { version: 1, content: { sha256: "a".repeat(64), sizeBytes: 10 }, stamp: {}, bytesRead: 10 };
  } });
  await assert.rejects(setupResult.service.create(setupResult.request), { code: "MANUAL_VIDEO_STALE" });
  assert.equal(setupResult.history.current.timeline.tracks.length, 0); assert.equal(setupResult.history.current.timeline.clips.length, 0);
});

test("ID preparation failure cannot leave a prepared track behind", async () => {
  const { history, service, request } = setup({}, {}, () => { throw new Error("ID allocation unavailable"); }); const before = history.toArchive();
  await assert.rejects(service.create(request), /ID allocation unavailable/);
  assert.deepEqual(history.toArchive(), before);
});

test("existing unlocked video track is reused and a second clip is rejected", async () => {
  const { history, service, request } = setup();
  history.commit({ type: "track.add", track: { id: "existing-video", kind: "video", name: "Existing", locked: false, hidden: false, muted: false } });
  const initialTimeline = history.current.timeline;
  await service.create({ ...request, expectedSnapshotId: history.current.history.headSnapshotId });
  assert.equal(history.current.timeline.tracks.length, 1); assert.equal(history.current.timeline.clips[0].trackId, "existing-video");
  const before = history.toArchive();
  await assert.rejects(service.create({ ...request, expectedSnapshotId: history.current.history.headSnapshotId }), { code: "MANUAL_VIDEO_TIMELINE_OCCUPIED" });
  assert.deepEqual(history.toArchive(), before);
  history.undo(); assert.deepEqual(history.current.timeline, initialTimeline);
});

test("failed atomic journal publication preserves the original empty timeline and redo", async () => {
  const initial = setup();
  initial.history.commit({ type: "project.rename", name: "Redo retained" }); initial.history.undo();
  let ids = 0;
  let fail = false;
  const history = ProjectHistory.fromArchive(initial.history.toArchive(), { idGenerator: () => {
    if (fail && ++ids === 2) throw new Error("snapshot allocation failed");
    return `atomic-${ids}`;
  } });
  fail = true;
  const service = new ManualVideoClipApplicationService({ history, identity: {
    async captureSource() { return { sizeBytes: 10 }; },
    async identifySource() { return { version: 1, content: { sha256: "a".repeat(64), sizeBytes: 10 }, stamp: {}, bytesRead: 10 }; },
    async checkSource() { return "match"; }
  } });
  const before = history.toArchive();
  await assert.rejects(service.create({ ...initial.request, expectedSnapshotId: history.current.history.headSnapshotId }), /snapshot allocation failed/);
  assert.deepEqual(history.toArchive(), before); assert.equal(history.canRedo, true);
  assert.equal(history.current.timeline.tracks.length, 0);
});

for (const action of ["create", "trim"]) {
  test(`${action} rejects an intervening edit/Undo while hashing even when the visible snapshot returns`, async () => {
    const context = action === "create" ? setup() : await trimSetup();
    let release;
    const blocked = new Promise((resolve) => { release = resolve; });
    const service = new ManualVideoClipApplicationService({ history: context.history, identity: {
      async captureSource() { await blocked; return { sizeBytes: 10 }; },
      async identifySource() { return { version: 1, content: { sha256: "a".repeat(64), sizeBytes: 10 }, stamp: {}, bytesRead: 10 }; },
      async checkSource() { return "match"; }
    } });
    const request = action === "create" ? context.request : context.trimRequest;
    const task = service[action](request);
    context.history.commit({ type: "project.rename", name: "Intervening branch" }); context.history.undo();
    assert.equal(context.history.current.history.headSnapshotId, request.expectedSnapshotId);
    const before = context.history.toArchive(); release();
    await assert.rejects(task, { code: "MANUAL_VIDEO_STALE" });
    assert.deepEqual(context.history.toArchive(), before); assert.equal(context.history.canRedo, true);
  });
}

test("malformed create and trim requests fail with a closed error before identity reads", async () => {
  const { history, service } = setup({}, { async captureSource() { assert.fail("must not read"); } });
  const before = history.toArchive();
  for (const value of [null, undefined, [], "request", 1]) {
    await assert.rejects(service.create(value), { code: "MANUAL_VIDEO_INVALID_REQUEST" });
    await assert.rejects(service.trim(value), { code: "MANUAL_VIDEO_INVALID_REQUEST" });
  }
  assert.deepEqual(history.toArchive(), before);
});

async function trimSetup(identityOverrides = {}) {
  const context = setup({}, identityOverrides);
  const created = await context.service.create(context.request);
  return { ...context, trimRequest: { clipId: created.clipId, expectedSnapshotId: context.history.current.history.headSnapshotId, sourceStartMs: 1500, sourceEndMs: 4500 } };
}

test("trim records one user command, survives archive recovery and preserves source/numbering", async () => {
  const { history, service, trimRequest } = await trimSetup();
  const before = history.current; const numbering = history.sourceNumbering; const count = history.entries.length;
  const result = await service.trim(trimRequest);
  assert.equal(history.entries.length, count + 1);
  assert.equal(history.entries.at(-1).command.type, "clip.trim"); assert.equal(history.entries.at(-1).actor.type, "user");
  assert.deepEqual(result.project.timeline.clips[0], { ...before.timeline.clips[0], sourceStartMs: 1500, sourceEndMs: 4500, timelineEndMs: 3000 });
  assert.deepEqual(result.project.sources, before.sources); assert.deepEqual(history.sourceNumbering, numbering);
  history.undo(); assert.deepEqual(history.current.timeline.clips, before.timeline.clips);
  const restored = ProjectHistory.fromArchive(history.toArchive()); restored.redo();
  assert.deepEqual(restored.current.timeline.clips, result.project.timeline.clips);
});

test("no-op trim preserves redo and every snapshot", async () => {
  const { history, service, trimRequest } = await trimSetup();
  history.commit({ type: "project.rename", name: "Later" }); history.undo();
  const before = history.toArchive(); const clip = history.current.timeline.clips[0];
  await service.trim({ ...trimRequest, expectedSnapshotId: history.current.history.headSnapshotId, sourceStartMs: clip.sourceStartMs, sourceEndMs: clip.sourceEndMs });
  assert.deepEqual(history.toArchive(), before); assert.equal(history.canRedo, true);
});

for (const range of [[-1, 100], [1000, 1000], [0.5, 2000], [0, 6001], [0, Number.MAX_SAFE_INTEGER + 1]]) {
  test(`trim rejects unsafe source range ${range} without mutation`, async () => {
    const { history, service, trimRequest } = await trimSetup(); const before = history.toArchive();
    await assert.rejects(service.trim({ ...trimRequest, sourceStartMs: range[0], sourceEndMs: range[1] }), { code: "MANUAL_VIDEO_INVALID_RANGE" });
    assert.deepEqual(history.toArchive(), before);
  });
}

test("trim rejects stale, path and source overrides without reading media", async () => {
  let deny = false;
  const { history, service, trimRequest } = await trimSetup({ async captureSource() { if (deny) assert.fail("must not read"); return { version: 1, uri: "/tmp/fixture.mp4", canonicalPath: "/tmp/fixture.mp4", device: "1", inode: "1", sizeBytes: 10, mtimeNs: "1", ctimeNs: "1" }; } });
  deny = true; const before = history.toArchive();
  await assert.rejects(service.trim({ ...trimRequest, expectedSnapshotId: "old" }), { code: "MANUAL_VIDEO_STALE" });
  for (const key of ["uri", "sourceId", "timelineStartMs", "commands"]) await assert.rejects(service.trim({ ...trimRequest, [key]: "injected" }), { code: "MANUAL_VIDEO_INVALID_REQUEST" });
  assert.deepEqual(history.toArchive(), before);
});

for (const change of ["locked", "speed", "overlay", "second-clip"]) {
  test(`trim rejects unsupported ${change} instead of silently losing composition`, async () => {
    const initial = await trimSetup(); const project = structuredClone(initial.history.current); const clip = project.timeline.clips[0];
    if (change === "locked") project.timeline.tracks[0].locked = true;
    if (change === "speed") clip.speed = 2;
    if (change === "overlay") project.captions.push({ id: "caption", text: "overlay", startMs: 0, endMs: 1000 });
    if (change === "second-clip") { project.timeline.clips.push({ ...clip, id: "second", timelineStartMs: 3000, timelineEndMs: 6000 }); project.timeline.durationMs = 6000; }
    const history = new ProjectHistory(project);
    const service = new ManualVideoClipApplicationService({ history, identity: { async captureSource() { assert.fail("must not read unsupported edit"); } } });
    const trimRequest = initial.trimRequest;
    const before = history.toArchive();
    await assert.rejects(service.trim({ ...trimRequest, expectedSnapshotId: history.current.history.headSnapshotId }), { code: "MANUAL_VIDEO_UNSUPPORTED" });
    assert.deepEqual(history.toArchive(), before);
  });
}

test("changed identity and stale async work cannot record a trim", async () => {
  let changed = false;
  const { history, service, trimRequest } = await trimSetup({ async checkSource() { return changed ? "changed" : "match"; } });
  changed = true; const before = history.toArchive();
  await assert.rejects(service.trim(trimRequest), { code: "MANUAL_VIDEO_SOURCE_CHANGED" }); assert.deepEqual(history.toArchive(), before);
  changed = false;
  let release; const blocked = new Promise((resolve) => { release = resolve; });
  const slow = new ManualVideoClipApplicationService({ history, identity: {
    async captureSource() { await blocked; return { sizeBytes: 10 }; },
    async identifySource() { return { version: 1, content: { sha256: "a".repeat(64), sizeBytes: 10 }, stamp: {}, bytesRead: 10 }; }, async checkSource() { return "match"; }
  } });
  const task = slow.trim(trimRequest); history.commit({ type: "project.rename", name: "New snapshot" }); release();
  await assert.rejects(task, { code: "MANUAL_VIDEO_STALE" }); assert.equal(history.entries.at(-1).command.type, "project.rename");
});
