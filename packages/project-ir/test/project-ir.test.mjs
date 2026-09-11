import test from "node:test";
import assert from "node:assert/strict";
import {
  ProjectHistory,
  createEmptyProject,
  migrateProject,
  validateProjectIR
} from "../dist/index.js";

const fixedTime = "2026-09-11T18:00:00.000Z";

test("createEmptyProject creates a valid bilingual-ready v1 project", () => {
  const project = createEmptyProject({ id: "project-1", name: "CEVRA Test", locale: "pt-BR", now: fixedTime });
  const result = validateProjectIR(project);
  assert.equal(result.ok, true);
  assert.equal(project.schemaVersion, 1);
  assert.equal(project.project.defaultLocale, "pt-BR");
});

test("migration rejects unknown future schema", () => {
  const project = createEmptyProject({ id: "project-1", now: fixedTime });
  assert.throws(() => migrateProject({ ...project, schemaVersion: 999 }), /newer than supported/);
});

test("history commits typed changes and supports undo redo", () => {
  let seq = 0;
  const history = new ProjectHistory(createEmptyProject({ id: "project-1", name: "Before", now: fixedTime }), {
    idGenerator: () => `id-${++seq}`,
    clock: () => fixedTime
  });

  const changed = history.commit({ type: "project.rename", name: "After" });
  assert.equal(changed.project.name, "After");
  assert.equal(changed.history.revision, 1);
  assert.equal(history.entries.length, 1);

  const undone = history.undo();
  assert.equal(undone.project.name, "Before");
  assert.equal(undone.history.revision, 0);

  const redone = history.redo();
  assert.equal(redone.project.name, "After");
  assert.equal(redone.history.revision, 1);
});

test("new edit after undo truncates redo branch", () => {
  let seq = 0;
  const history = new ProjectHistory(createEmptyProject({ id: "project-1", name: "A", now: fixedTime }), {
    idGenerator: () => `id-${++seq}`,
    clock: () => fixedTime
  });
  history.commit({ type: "project.rename", name: "B" });
  history.commit({ type: "project.rename", name: "C" });
  history.undo();
  history.commit({ type: "project.rename", name: "D" });
  assert.equal(history.current.project.name, "D");
  assert.equal(history.canRedo, false);
  assert.equal(history.entries.length, 2);
});

test("clip references are validated", () => {
  const project = createEmptyProject({ id: "project-1", now: fixedTime });
  project.timeline.tracks.push({ id: "v1", kind: "video", name: "Video", locked: false, hidden: false, muted: false });
  project.timeline.clips.push({
    id: "clip-1",
    trackId: "v1",
    sourceId: "missing-source",
    timelineStartMs: 0,
    timelineEndMs: 1000,
    sourceStartMs: 0,
    sourceEndMs: 1000,
    speed: 1,
    volume: 1,
    opacity: 1
  });
  const result = validateProjectIR(project);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some((issue) => issue.code === "reference"));
});

test("validator rejects malformed nested source and caption data", () => {
  const project = createEmptyProject({ id: "project-1", now: fixedTime });
  project.sources.push({ id: "bad", kind: "document", uri: "x", displayName: "x" });
  project.captions.push({ id: "c1", startMs: 1000, endMs: 500, text: "bad" });
  const result = validateProjectIR(project);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) => issue.path === "sources[0].kind"));
    assert.ok(result.issues.some((issue) => issue.path === "captions[0]" && issue.code === "range"));
  }
});

test("history preserves an existing baseline revision", () => {
  let seq = 0;
  const project = createEmptyProject({ id: "project-1", now: fixedTime });
  project.history.revision = 7;
  project.history.headEntryId = "existing-entry";
  const history = new ProjectHistory(project, {
    idGenerator: () => `id-${++seq}`,
    clock: () => fixedTime
  });
  assert.equal(history.current.history.revision, 7);
  assert.equal(history.current.history.headEntryId, "existing-entry");
  const changed = history.commit({ type: "project.rename", name: "Next" });
  assert.equal(changed.history.revision, 8);
});

test("history archive round-trips current state and redo cursor", () => {
  let seq = 0;
  const history = new ProjectHistory(createEmptyProject({ id: "project-1", name: "A", now: fixedTime }), {
    idGenerator: () => `id-${++seq}`,
    clock: () => fixedTime
  });
  history.commit({ type: "project.rename", name: "B" });
  history.commit({ type: "project.rename", name: "C" });
  history.undo();
  const restored = ProjectHistory.fromArchive(history.toArchive(), {
    idGenerator: () => `restored-${++seq}`,
    clock: () => fixedTime
  });
  assert.equal(restored.current.project.name, "B");
  assert.equal(restored.canRedo, true);
  assert.equal(restored.redo().project.name, "C");
});
