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
  const outcome = await service.create(request);
  assert.deepEqual(history.entries.slice(-2).map((entry) => [entry.command.type, entry.actor.type]), [["track.add", "user"], ["clip.add", "user"]]);
  const clip = outcome.project.timeline.clips[0];
  assert.deepEqual([clip.sourceId, clip.sourceStartMs, clip.sourceEndMs, clip.timelineStartMs, clip.timelineEndMs, clip.speed], ["video", 1000, 4000, 0, 3000, 1]);
  assert.equal(outcome.clipId, clip.id); assert.equal(outcome.project.timeline.durationMs, 3000);
  assert.deepEqual(outcome.project.sources[0], source); assert.deepEqual(history.sourceNumbering, numbering);
  history.undo(); assert.equal(history.current.timeline.clips.length, 0); assert.equal(history.current.timeline.tracks.length, 1);
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
  await service.create({ ...request, expectedSnapshotId: history.current.history.headSnapshotId });
  assert.equal(history.current.timeline.tracks.length, 1); assert.equal(history.current.timeline.clips[0].trackId, "existing-video");
  const before = history.toArchive();
  await assert.rejects(service.create({ ...request, expectedSnapshotId: history.current.history.headSnapshotId }), { code: "MANUAL_VIDEO_TIMELINE_OCCUPIED" });
  assert.deepEqual(history.toArchive(), before);
});
