import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyProject, ProjectHistory } from "@cevra/project-ir";
import { deserializeProjectPackage, serializeProjectPackage } from "../dist/index.js";

const now = "2026-10-03T00:00:00.000Z";
const source = id => ({ id, kind: "video", uri: `demo://${id}`, displayName: "same.mov" });
function fixture() {
  let sequence = 0;
  const project = createEmptyProject({ id: "package-numbers", name: "Numbers", now });
  project.sources = [source("a"), source("b")];
  const history = new ProjectHistory(project, { idGenerator: () => `id-${++sequence}`, clock: () => now });
  history.commit({ type: "source.remove", sourceId: "a" });
  history.commit({ type: "source.add", source: source("c") });
  return history;
}

test("V3 save/reopen retains retired identities and redo, with unchanged audiovisual Project IR", () => {
  const history = fixture(); history.undo();
  const pkg = serializeProjectPackage(history, now);
  const manifest = JSON.parse(pkg.files["manifest.json"]);
  assert.equal(manifest.formatVersion, 3);
  assert.deepEqual(manifest.sourceNumbering, history.sourceNumbering);
  assert.deepEqual(JSON.parse(pkg.files["project.json"]), history.current);
  assert(!Object.hasOwn(history.current, "sourceNumbering"));
  assert.equal(history.current.schemaVersion, 3);
  const loaded = deserializeProjectPackage(pkg);
  assert.deepEqual(loaded.current, history.current);
  assert.deepEqual(loaded.sourceNumbering, history.sourceNumbering);
  assert.equal(loaded.canRedo, true);
  loaded.redo(); assert(loaded.current.sources.some(s => s.id === "c"));
  loaded.undo(); loaded.commit({ type: "source.add", source: source("d") });
  const again = deserializeProjectPackage(serializeProjectPackage(loaded, now));
  assert.equal(again.sourceNumbering.sources.find(s => s.sourceId === "d").number, 4);
  assert.equal(again.sourceNumbering.sources.find(s => s.sourceId === "c").number, 3);
});

test("genuine V2 packages initialize deterministically in memory and are unchanged until explicitly serialized", () => {
  const history = fixture(); history.undo();
  const pkg = serializeProjectPackage(history, now);
  const manifest = JSON.parse(pkg.files["manifest.json"]);
  manifest.formatVersion = 2; delete manifest.sourceNumbering;
  pkg.files["manifest.json"] = JSON.stringify(manifest);
  const before = structuredClone(pkg);
  const first = deserializeProjectPackage(pkg);
  const second = deserializeProjectPackage(pkg);
  assert.deepEqual(pkg, before);
  assert.deepEqual(first.sourceNumbering, second.sourceNumbering);
  assert.deepEqual(first.current, history.current);
  assert.equal(first.canRedo, true);
  assert.equal(first.sourceNumbering.sources.find(s => s.sourceId === "a").number, 1);
  assert.equal(JSON.parse(serializeProjectPackage(first, now).files["manifest.json"]).formatVersion, 3);
});

test("legacy packages cannot recover reservations belonging only to already discarded history", () => {
  const history = fixture(); history.undo();
  history.commit({ type: "source.add", source: source("d") });
  const pkg = serializeProjectPackage(history, now);
  const manifest = JSON.parse(pkg.files["manifest.json"]);
  manifest.formatVersion = 2; delete manifest.sourceNumbering;
  pkg.files["manifest.json"] = JSON.stringify(manifest);
  const legacy = deserializeProjectPackage(pkg);
  assert(!legacy.sourceNumbering.sources.some(s => s.sourceId === "c"));
  assert.equal(legacy.sourceNumbering.sources.find(s => s.sourceId === "d").number, 3);
  // Durability begins with the explicit V3 checkpoint; no fabricated legacy label.
  const saved = deserializeProjectPackage(serializeProjectPackage(legacy, now));
  saved.commit({ type: "source.add", source: source("e") });
  assert.equal(saved.sourceNumbering.sources.find(s => s.sourceId === "e").number, 4);
});

test("missing/colliding registry, rewind and mislabeled downgrade fail closed", () => {
  const base = serializeProjectPackage(fixture(), now);
  for (const mutate of [
    m => { delete m.sourceNumbering; },
    m => { m.sourceNumbering.sources[1].number = 1; },
    m => { m.sourceNumbering.nextNumber = 2; },
    m => { m.formatVersion = 2; }
  ]) {
    const pkg = structuredClone(base), manifest = JSON.parse(pkg.files["manifest.json"]);
    mutate(manifest); pkg.files["manifest.json"] = JSON.stringify(manifest);
    assert.throws(() => deserializeProjectPackage(pkg), /source numbering|Source numbering|Invalid source/i);
  }
});
