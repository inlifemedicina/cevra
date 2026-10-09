import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyProject, ProjectHistory, frameTimingMilliseconds } from "@cevra/project-ir";
import { serializeProjectPackage, deserializeProjectPackage } from "../dist/index.js";

function fixture() {
  let id = 0;
  const history = new ProjectHistory(createEmptyProject({ id: "clock-package" }), { idGenerator: () => `package-${++id}` });
  history.commit({ type: "source.add", source: { id: "s", kind: "video", uri: "/offline/original.mp4", displayName: "original", durationMs: 5000 } });
  return history;
}
test("CFR30 adoption round-trips all history with legacy Undo and frame-aware redo", () => {
  const history = fixture(); const before = history.current;
  const frameTiming = { version: 1, timelineStartFrame: 0, timelineEndFrame: 7, sourceStartFrame: 1, sourceEndFrame: 8 };
  history.commit({ type: "timeline.edit", version: 2, edits: [
    { type: "timeline.timingPolicy.set", timingPolicy: "cfr30" },
    { type: "track.add", track: { id: "v", kind: "video", name: "V", locked: false, hidden: false, muted: false } },
    { type: "clip.add", clip: { id: "c", trackId: "v", sourceId: "s", frameTiming, ...frameTimingMilliseconds(frameTiming), speed: 1, volume: 1, opacity: 1 } }
  ] });
  const after = history.current; history.undo();
  const restored = deserializeProjectPackage(serializeProjectPackage(history));
  assert.deepEqual(restored.toArchive(), history.toArchive());
  assert.deepEqual(restored.current, before); assert.deepEqual(restored.redo(), after); assert.deepEqual(restored.undo(), before);
});
test("old-schema package upgrades every retained snapshot without changing journal or legacy endpoint values", () => {
  const history = fixture(); history.commit({ type: "project.rename", name: "Redo" }); history.undo();
  const encoded = serializeProjectPackage(history);
  for (const [path, contents] of Object.entries(encoded.files)) {
    if (path === "project.json" || path.startsWith("history/snapshots/")) {
      const value = JSON.parse(contents), project = path === "project.json" ? value : value.project;
      project.schemaVersion = 2; delete project.timeline.timingPolicy; encoded.files[path] = JSON.stringify(value);
    }
  }
  const manifest = JSON.parse(encoded.files["manifest.json"]); manifest.projectSchemaVersion = 2; encoded.files["manifest.json"] = JSON.stringify(manifest);
  const original = structuredClone(encoded), restored = deserializeProjectPackage(encoded);
  assert.deepEqual(encoded, original); assert.deepEqual(restored.toArchive(), history.toArchive());
  assert.equal(restored.canRedo, true); assert.equal(restored.redo().project.name, "Redo");
  assert.equal(serializeProjectPackage(restored).files["history/journal.jsonl"], encoded.files["history/journal.jsonl"]);
});
