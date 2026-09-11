import test from "node:test";
import assert from "node:assert/strict";
import { ProjectHistory, createEmptyProject } from "@cevra/project-ir";
import { deserializeProjectPackage, serializeProjectPackage } from "../dist/index.js";

const fixedTime = "2026-09-11T18:00:00.000Z";

test("project package round-trips history and redo state", () => {
  let seq = 0;
  const history = new ProjectHistory(createEmptyProject({ id: "p1", name: "A", now: fixedTime }), {
    idGenerator: () => `id-${++seq}`,
    clock: () => fixedTime
  });
  history.commit({ type: "project.rename", name: "B" });
  history.commit({ type: "project.rename", name: "C" });
  history.undo();
  const serialized = serializeProjectPackage(history, fixedTime);
  const restored = deserializeProjectPackage(serialized, {
    idGenerator: () => `restored-${++seq}`,
    clock: () => fixedTime
  });
  assert.equal(restored.current.project.name, "B");
  assert.equal(restored.canRedo, true);
  assert.equal(restored.redo().project.name, "C");
  assert.ok(serialized.files["manifest.json"]);
  assert.ok(serialized.files["project.json"]);
  assert.ok(serialized.files["history/journal.jsonl"] !== undefined);
});

test("tampered current project is rejected", () => {
  let seq = 0;
  const history = new ProjectHistory(createEmptyProject({ id: "p1", name: "A", now: fixedTime }), {
    idGenerator: () => `id-${++seq}`,
    clock: () => fixedTime
  });
  const serialized = serializeProjectPackage(history, fixedTime);
  const project = JSON.parse(serialized.files["project.json"]);
  project.project.name = "Tampered";
  serialized.files["project.json"] = JSON.stringify(project);
  assert.throws(() => deserializeProjectPackage(serialized), /does not match/);
});
