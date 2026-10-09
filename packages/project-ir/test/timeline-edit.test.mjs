import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyProject, ProjectCommandError, ProjectHistory } from "../dist/index.js";

const now = "2026-10-05T18:00:00.000Z";
const track = { id: "video", name: "Video", kind: "video", locked: false, hidden: false, muted: false };
function clip(id, timelineStartMs = 0, sourceStartMs = 1000, durationMs = 1000, sourceId = "source-a") {
  return { id, trackId: track.id, sourceId, timelineStartMs, timelineEndMs: timelineStartMs + durationMs,
    sourceStartMs, sourceEndMs: sourceStartMs + durationMs, speed: 1, volume: 1, opacity: 1 };
}
function edit(...edits) { return { type: "timeline.edit", version: 1, edits }; }
function historyFixture(options = {}) {
  const project = createEmptyProject({ id: "sequence", now });
  project.sources = ["source-a", "source-b"].map(id => ({ id, kind: "video", uri: `file:///${id}.mp4`, displayName: id, durationMs: 10000 }));
  let id = 0;
  return new ProjectHistory(project, { clock: () => now, idGenerator: () => `history-${++id}`, ...options });
}
function trim(value) {
  const { id: clipId, timelineStartMs, timelineEndMs, sourceStartMs, sourceEndMs } = value;
  return { type: "clip.trim", clipId, timelineStartMs, timelineEndMs, sourceStartMs, sourceEndMs };
}

test("first track and clip are one recoverable action with one Undo", () => {
  const history = historyFixture();
  const initial = history.current;
  const action = edit({ type: "track.add", track }, { type: "clip.add", clip: clip("a") });
  const result = history.commit(action);
  assert.equal(result.history.revision, 1);
  assert.equal(history.entries.length, 1);
  assert.equal(history.snapshots.length, 2);
  assert.deepEqual(history.entries[0].command, action);
  assert.deepEqual(history.undo(), initial);
  assert.deepEqual(history.redo(), result);
  const reopened = ProjectHistory.fromArchive(JSON.parse(JSON.stringify(history.toArchive())));
  assert.deepEqual(reopened.current, result);
  assert.deepEqual(reopened.undo(), initial);
  assert.deepEqual(reopened.redo(), result);
});

test("split and ripple across repeated and different sources retain occurrence IDs", () => {
  const history = historyFixture();
  history.commit(edit({ type: "track.add", track },
    { type: "clip.add", clip: clip("a", 0, 1000, 2000) },
    { type: "clip.add", clip: clip("b", 2000, 4000, 1000, "source-b") },
    { type: "clip.add", clip: clip("repeat-a", 3000, 1000, 2000) }));
  const before = history.current;
  const numbering = history.sourceNumbering;
  const result = history.commit(edit(trim(clip("a", 0, 1000, 1000)),
    { type: "clip.add", clip: clip("split-a", 1000, 2000, 1000) },
    trim(clip("b", 2000, 4000, 500, "source-b")),
    trim(clip("repeat-a", 2500, 1000, 2000))));
  assert.equal(history.entries.length, 2);
  assert.equal(result.timeline.durationMs, 4500);
  assert.deepEqual([...result.timeline.clips].sort((a,b) => a.timelineStartMs-b.timelineStartMs).map(c => [c.id,c.sourceId,c.timelineStartMs,c.timelineEndMs]),
    [["a","source-a",0,1000],["split-a","source-a",1000,2000],["b","source-b",2000,2500],["repeat-a","source-a",2500,4500]]);
  assert.deepEqual(history.sourceNumbering, numbering);
  assert.deepEqual(result.sources, before.sources);
  assert.deepEqual(history.undo(), before);
  assert.deepEqual(history.redo(), result);
});

test("invalid last operation and invalid overwritten payload leave the redo branch intact", () => {
  const history = historyFixture();
  history.commit(edit({ type: "track.add", track }, { type: "clip.add", clip: clip("a") }));
  history.commit(edit({ type: "clip.add", clip: clip("b", 1000) }));
  history.undo();
  const archive = history.toArchive();
  const actions = [
    edit(trim(clip("a", 0, 1000, 500)), { type: "clip.remove", clipId: "missing" }),
    edit(trim({ ...clip("a"), sourceEndMs: -1 }), trim(clip("a"))),
    edit({ type: "clip.add", clip: { ...clip("bad"), sourceId: "missing" } }, { type: "clip.remove", clipId: "bad" })
  ];
  for (const action of actions) {
    assert.throws(() => history.commit(action));
    assert.deepEqual(history.toArchive(), archive);
    assert.equal(history.canRedo, true);
  }
});

test("no-op and closed-contract rejections consume no revision and preserve redo", () => {
  const history = historyFixture();
  history.commit(edit({ type: "track.add", track }, { type: "clip.add", clip: clip("a") }));
  history.commit(edit({ type: "clip.add", clip: clip("b", 1000) }));
  history.undo();
  const archive = history.toArchive();
  assert.throws(() => history.commit(edit(trim(clip("a")))), error => error instanceof ProjectCommandError && error.code === "PROJECT_TIMELINE_EDIT_NO_OP");
  for (const action of [edit(), { ...edit(trim(clip("a"))), version: 2 },
    edit({ type: "source.remove", sourceId: "source-a" }), edit(edit(trim(clip("a")))),
    edit({ ...trim(clip("a")), arbitrary: true }), { ...edit(trim(clip("a"))), arbitrary: true }]) {
    assert.throws(() => history.commit(action), error => error instanceof ProjectCommandError && error.code === "PROJECT_TIMELINE_EDIT_INVALID");
  }
  assert.deepEqual(history.toArchive(), archive);
});

test("legacy archives and individual commands remain compatible with gaps and overlaps", () => {
  const history = historyFixture();
  history.commit({ type: "track.add", track });
  history.commit({ type: "clip.add", clip: clip("a", 2000) });
  history.commit({ type: "clip.add", clip: clip("b", 2500, 2000, 1000, "source-b") });
  const v3 = history.toArchive();
  const { sourceNumbering: _numbering, ...v2 } = v3;
  const archives = [{ ...v2, version: 2 }, { version: 1, entries: history.entries, snapshots: history.snapshots, cursorSnapshotId: v3.cursorSnapshotId }, v3];
  for (const archive of archives) {
    const reopened = ProjectHistory.fromArchive(JSON.parse(JSON.stringify(archive)));
    assert.deepEqual(reopened.current, history.current);
    reopened.commit(edit(trim(clip("a", 4000))));
    assert.equal(reopened.current.timeline.durationMs, 5000);
  }
});

test("new aggregate rejects permissive legacy payloads without tightening old archives", () => {
  const history = historyFixture();
  const archive = history.toArchive();
  for (const action of [
    edit({ type: "track.add", track: { ...track, kind: ["video"] } }),
    edit({ type: "track.add", track: { ...track, arbitrary: true } }),
    edit({ type: "track.add", track }, { type: "clip.add", clip: { ...clip("a"), arbitrary: true } }),
    edit({ type: "track.add", track }, { type: "clip.add", clip: { ...clip("a"), extensions: [] } }),
    edit({ type: "track.add", track }, { type: "clip.add", clip: { ...clip("a"), timelineEndMs: Number.MAX_SAFE_INTEGER+1 } })
  ]) {
    assert.throws(() => history.commit(action), error => error instanceof ProjectCommandError && error.code === "PROJECT_TIMELINE_EDIT_INVALID");
    assert.deepEqual(history.toArchive(), archive);
  }
  history.commit({ type: "track.add", track: { ...track, kind: ["video"], historical: true } });
  const restored = ProjectHistory.fromArchive(history.toArchive());
  assert.deepEqual(restored.current, history.current);
});

test("large ripple commits one entry without duplicating source numbering or snapshots per clip", () => {
  const history = historyFixture();
  history.commit(edit({ type: "track.add", track }, ...Array.from({ length: 1000 }, (_,i) => ({ type: "clip.add", clip: clip(`clip-${i}`, i*100, 1000, 100) }))));
  const numbering = history.sourceNumbering;
  const before = history.current;
  history.commit(edit({ type: "clip.remove", clipId: "clip-0" }, ...Array.from({ length: 999 }, (_,i) => trim(clip(`clip-${i+1}`, i*100, 1000, 100)))));
  assert.equal(history.entries.length, 2);
  assert.equal(history.snapshots.length, 3);
  assert.equal(history.current.timeline.durationMs, 99900);
  assert.deepEqual(history.sourceNumbering, numbering);
  assert.deepEqual(history.undo(), before);
});
