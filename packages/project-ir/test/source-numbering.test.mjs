import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyProject, ProjectHistory } from "../dist/index.js";

const now = "2026-10-03T00:00:00.000Z";
const source = (id, kind = "video") => ({ id, kind, uri: `demo://${id}`, displayName: "same-name.mov" });
function fixture() {
  const project = createEmptyProject({ id: "numbers", name: "Sources", now });
  project.sources = [source("a"), source("b"), source("sound", "audio"), source("still", "image")];
  let sequence = 0;
  return new ProjectHistory(project, { idGenerator: () => `snapshot-${++sequence}`, clock: () => now });
}
const number = (history, id) => history.sourceNumbering.sources.find(item => item.sourceId === id)?.number;

test("source identities are independent of filenames/kinds and detached from callers", () => {
  const history = fixture();
  assert.equal(number(history, "a"), 1);
  assert.equal(number(history, "b"), 2);
  assert.equal(number(history, "sound"), 3);
  assert.equal(number(history, "still"), 4);
  const input = history.toArchive();
  const restored = ProjectHistory.fromArchive(input);
  input.sourceNumbering.sources[0].number = 500;
  const detached = restored.sourceNumbering;
  detached.nextNumber = 500;
  assert.equal(number(restored, "a"), 1);
  assert.equal(restored.sourceNumbering.nextNumber, 5);
  assert.deepEqual(restored.current, history.current);
});

test("removal, undo/redo, restore, branching and reopening never rewind or reuse reservations", () => {
  const history = fixture();
  const initialSnapshot = history.current.history.headSnapshotId;
  history.commit({ type: "source.remove", sourceId: "a" });
  assert.equal(number(history, "b"), 2);
  history.commit({ type: "source.add", source: source("c") });
  assert.equal(number(history, "c"), 5);
  history.undo(); history.redo();
  assert.equal(number(history, "c"), 5);
  history.restoreSnapshot(initialSnapshot);
  assert.equal(number(history, "a"), 1);
  history.commit({ type: "source.add", source: source("d") });
  assert.equal(number(history, "d"), 6);
  assert.equal(history.canRedo, false);
  assert(!history.toArchive().snapshots.some(s => s.project.sources.some(item => item.id === "c")));
  const reopened = ProjectHistory.fromArchive(history.toArchive());
  assert.equal(number(reopened, "c"), 5);
  reopened.commit({ type: "source.add", source: source("e") });
  assert.equal(number(reopened, "e"), 7);
  reopened.commit({ type: "project.rename", name: "Changed" });
  assert.equal(number(reopened, "b"), 2);
});

test("failed duplicate source command and exhausted allocation leave history and counters unchanged", () => {
  const history = fixture();
  const beforeDuplicate = history.toArchive();
  assert.throws(() => history.commit({ type: "source.add", source: source("b") }));
  assert.deepEqual(history.toArchive(), beforeDuplicate);
  history.commit({ type: "source.remove", sourceId: "a" });
  history.commit({ type: "source.add", source: source("a", "audio") });
  assert.equal(number(history, "a"), 1);
  const archive = history.toArchive();
  archive.sourceNumbering.nextNumber = Number.MAX_SAFE_INTEGER;
  const exhausted = ProjectHistory.fromArchive(archive);
  assert.throws(() => exhausted.commit({ type: "source.add", source: source("later") }), /exhausted/);
  assert.deepEqual(exhausted.toArchive(), archive);
});

test("V1/V2 migration initializes once from retained snapshots including removed and redo sources without mutating input", () => {
  const history = fixture();
  history.commit({ type: "source.remove", sourceId: "a" });
  history.commit({ type: "source.add", source: source("c") });
  history.undo();
  const { sourceNumbering: _numbers, ...compact } = history.toArchive();
  const inputs = [
    { version: 1, entries: history.entries, snapshots: history.snapshots, cursorSnapshotId: compact.cursorSnapshotId },
    { ...compact, version: 2 }
  ];
  for (const input of inputs) {
    const before = structuredClone(input);
    const loaded = ProjectHistory.fromArchive(input);
    assert.deepEqual(input, before);
    assert.equal(number(loaded, "a"), 1);
    assert.equal(number(loaded, "b"), 2);
    assert.equal(number(loaded, "c"), 5);
    assert.equal(loaded.canRedo, true);
    assert.deepEqual(ProjectHistory.fromArchive(loaded.toArchive()).sourceNumbering, loaded.sourceNumbering);
  }
});

test("V3 rejects missing, colliding, mismatched and rewinding registries", () => {
  const archive = fixture().toArchive();
  const mutations = [
    a => { delete a.sourceNumbering; },
    a => { a.version = 2; },
    a => { a.sourceNumbering.version = 2; },
    a => { a.sourceNumbering.extra = true; },
    a => { a.sourceNumbering.sources.push({ ...a.sourceNumbering.sources[0] }); },
    a => { a.sourceNumbering.sources[1].number = 1; },
    a => { a.sourceNumbering.nextNumber = 2; },
    a => { a.sourceNumbering.nextNumber = 2.5; },
    a => { a.sourceNumbering.sources[0].number = 0; },
    a => { a.sourceNumbering.sources[0].sourceId = "unrelated"; },
    a => { a.sourceNumbering.sources.shift(); }
  ];
  for (const mutate of mutations) {
    const malformed = structuredClone(archive); mutate(malformed);
    assert.throws(() => ProjectHistory.fromArchive(malformed), /source numbering|Source numbering|Invalid source/i);
  }
});

test("legacy ID reuse across media kinds remains readable and keeps one identity through undo/redo", () => {
  const history = fixture();
  history.commit({ type: "source.remove", sourceId: "a" });
  history.commit({ type: "source.add", source: source("a", "audio") });
  const { sourceNumbering: _numbers, ...archive } = history.toArchive();
  const restored = ProjectHistory.fromArchive({ ...archive, version: 2 });
  assert.equal(number(restored, "a"), 1);
  assert.equal(restored.current.sources.find(s => s.id === "a").kind, "audio");
  restored.undo(); restored.undo();
  assert.equal(restored.current.sources.find(s => s.id === "a").kind, "video");
  assert.equal(number(restored, "a"), 1);
});
