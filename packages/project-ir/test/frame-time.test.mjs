import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyProject, ProjectHistory, framesToMilliseconds, nearestMsToFrames, floorMsToFrames,
  frameTimingMilliseconds, validateProjectIR, migrateProject, MAX_CFR30_FRAME } from "../dist/index.js";

const track = { id: "v", kind: "video", name: "V", locked: false, hidden: false, muted: false };
function setup() {
  let id = 0;
  const history = new ProjectHistory(createEmptyProject({ id: "frame-clock", now: "2026-10-06T00:00:00.000Z" }), { idGenerator: () => `h-${++id}` });
  history.commit({ type: "source.add", source: { id: "s", kind: "video", uri: "/offline/original.mp4", displayName: "original", durationMs: 200000 } });
  return history;
}
function clip(id, start = 0, end = 1) {
  const frameTiming = { version: 1, timelineStartFrame: start, timelineEndFrame: end, sourceStartFrame: 0, sourceEndFrame: end - start };
  return { id, trackId: "v", sourceId: "s", speed: 1, volume: 1, opacity: 1, frameTiming, ...frameTimingMilliseconds(frameTiming) };
}
function adopt(history, clips) {
  return history.commit({ type: "timeline.edit", version: 2, edits: [
    { type: "timeline.timingPolicy.set", timingPolicy: "cfr30" }, { type: "track.add", track },
    ...clips.map(clip => ({ type: "clip.add", clip }))
  ] });
}

test("CFR30 projection is exact at each boundary and 3000 single-frame edits do not accumulate milliseconds", () => {
  const history = setup();
  const project = adopt(history, Array.from({ length: 3000 }, (_, index) => clip(`clip-${index}`, index, index + 1)));
  assert.equal(project.timeline.durationMs, 100000);
  for (const item of project.timeline.clips) {
    assert.equal(item.timelineStartMs, framesToMilliseconds(item.frameTiming.timelineStartFrame));
    assert.equal(item.timelineEndMs, framesToMilliseconds(item.frameTiming.timelineEndFrame));
    assert.equal(nearestMsToFrames(item.timelineEndMs), item.frameTiming.timelineEndFrame);
    assert.equal(floorMsToFrames(item.timelineEndMs), item.frameTiming.timelineEndFrame);
  }
  assert.equal(history.entries.at(-1).command.version, 2);
  history.undo(); assert.equal(history.current.timeline.timingPolicy, "legacy-milliseconds");
  assert.equal(history.current.timeline.clips.length, 0);
  assert.deepEqual(history.redo(), project);
  for (const value of [-1, -0, NaN, Infinity, 1.5, MAX_CFR30_FRAME + 1]) assert.throws(() => framesToMilliseconds(value));
});

test("CFR30 rejects dishonest projections, incomplete visual conform, extensions as timing and open operations", () => {
  const history = setup(), project = adopt(history, [clip("c")]);
  for (const mutation of [
    p => p.timeline.clips[0].timelineEndMs = 33,
    p => delete p.timeline.clips[0].frameTiming,
    p => p.timeline.clips[0].frameTiming.extra = true,
    p => p.timeline.clips[0].frameTiming.sourceStartFrame = -0,
    p => p.timeline.durationMs = 33,
    p => { delete p.timeline.clips[0].frameTiming; p.timeline.clips[0].extensions = { "cevra.frameTiming": clip("x").frameTiming }; }
  ]) { const bad = structuredClone(project); mutation(bad); assert.equal(validateProjectIR(bad).ok, false); }
  const archive = history.toArchive();
  for (const command of [
    { type: "timeline.edit", version: 1, edits: [{ type: "clip.remove", clipId: "c" }] },
    { type: "timeline.edit", version: 2, edits: [{ type: "clip.frameTiming.set", clipId: "c", frameTiming: { ...clip("x").frameTiming, sourceEndFrame: 0 } }] },
    { type: "timeline.edit", version: 2, edits: [{ type: "timeline.timingPolicy.set", timingPolicy: "cfr30", path: "/tmp/injected" }] },
    { type: "timeline.edit", version: 2, edits: [{ type: "clip.frameTiming.set", clipId: "c", frameTiming: clip("x").frameTiming, sourceEndMs: 100 }] }
  ]) assert.throws(() => history.commit(command));
  assert.deepEqual(history.toArchive(), archive);
});

test("independent legacy audio remains unchanged on a CFR30 visual timeline", () => {
  const history = setup(); adopt(history, [clip("c")]);
  history.commit({ type: "track.add", track: { ...track, id: "a", kind: "audio" } });
  history.commit({ type: "clip.add", clip: { id: "audio", trackId: "a", sourceId: "s", timelineStartMs: 7, timelineEndMs: 123,
    sourceStartMs: 11, sourceEndMs: 127, speed: 1, volume: 1, opacity: 1 } });
  const audio = structuredClone(history.current.timeline.clips[1]);
  assert.equal(history.current.timeline.durationMs, 123);
  assert.equal(Object.hasOwn(audio, "frameTiming"), false);
  history.commit({ type: "timeline.edit", version: 2, edits: [{ type: "clip.frameTiming.set", clipId: "c", frameTiming: clip("x", 0, 2).frameTiming }] });
  assert.deepEqual(history.current.timeline.clips[1], audio);
});

test("v2 migration retains off-grid endpoints and every snapshot/redo identity", () => {
  const history = setup();
  history.commit({ type: "track.add", track });
  history.commit({ type: "clip.add", clip: { id: "legacy", trackId: "v", sourceId: "s", timelineStartMs: 0, timelineEndMs: 7,
    sourceStartMs: 13, sourceEndMs: 20, speed: 1, volume: 1, opacity: 1 } });
  history.commit({ type: "project.rename", name: "Redo" }); history.undo();
  const old = history.toArchive();
  for (const snapshot of old.snapshots) { snapshot.project.schemaVersion = 2; delete snapshot.project.timeline.timingPolicy; }
  const original = structuredClone(old);
  const restored = ProjectHistory.fromArchive(old);
  assert.deepEqual(old, original);
  assert.deepEqual(restored.entries, old.entries);
  assert.equal(restored.current.history.headSnapshotId, old.cursorSnapshotId);
  assert.deepEqual(restored.toArchive().snapshots.map(s => [s.id, s.revision, s.createdAt]), old.snapshots.map(s => [s.id, s.revision, s.createdAt]));
  assert.equal(restored.current.timeline.clips[0].sourceStartMs, 13);
  assert.equal(restored.current.timeline.clips[0].sourceEndMs, 20);
  assert.equal(restored.current.timeline.durationMs, 7);
  assert.equal(restored.current.timeline.timingPolicy, "legacy-milliseconds");
  assert.equal(restored.canRedo, true); assert.equal(restored.redo().project.name, "Redo");
  const v2 = structuredClone(restored.current); v2.schemaVersion = 2; delete v2.timeline.timingPolicy;
  assert.equal(migrateProject(v2).timeline.durationMs, 7);
});
