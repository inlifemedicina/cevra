import assert from "node:assert/strict";
import test from "node:test";
import { ProjectHistory, createEmptyProject, frameTimingMilliseconds, MANUAL_TITLE_COMPONENT, manualTitleGraphic } from "@cevra/project-ir";
import { LocalSourceRelocationService, validateLocalSourceRelocationRequest } from "../dist/index.js";

const content = { sha256: "a".repeat(64), sizeBytes: 8 };
function fixture(identityOverrides = {}, legacy = false) {
  const history = new ProjectHistory(createEmptyProject({ id: "relocation" }));
  history.commit({ type: "source.add", source: { id: "s", kind: "video", uri: "/missing/original.mp4", displayName: "Original", durationMs: 1000,
    ...(!legacy ? { technicalDescriptor: { version: 1, basis: "ingest", content, method: { profile: "cevra.source-technical.v1", engineId: "test", engineVersion: "1", engineApiVersion: 1 }, video: { codec: "h264" } } } : {}) } });
  const frameTiming = { version: 1, timelineStartFrame: 0, timelineEndFrame: 30, sourceStartFrame: 0, sourceEndFrame: 30 };
  history.commit({ type: "timeline.edit", version: 2, edits: [{ type: "timeline.timingPolicy.set", timingPolicy: "cfr30" },
    { type: "track.add", track: { id: "v", name: "V1", kind: "video", hidden: false, locked: false, muted: false } },
    { type: "clip.add", clip: { id: "c", sourceId: "s", trackId: "v", frameTiming, ...frameTimingMilliseconds(frameTiming), speed: 1, volume: 1, opacity: 1 } }] });
  history.commit({ type: "graphic.manualTitle.set", graphic: manualTitleGraphic("g", {
    version: 1, componentId: MANUAL_TITLE_COMPONENT, text: "Title", startFrame: 0, endFrame: 30, aspect: "16:9" }) });
  const stamp = { version: 1, uri: "/moved/original.mp4", canonicalPath: "/moved/original.mp4", sizeBytes: 8, device: "1", inode: "2", mtimeNs: "3", ctimeNs: "4" };
  let calls = 0;
  const identity = { async captureSource() { calls++; return stamp; }, async identifySource() { return { version: 1, content, stamp, bytesRead: 8 }; }, async checkSource() { return "match"; }, ...identityOverrides };
  const service = new LocalSourceRelocationService(history, identity);
  const request = () => ({ version: 1, sourceId: "s", expectedSnapshotId: history.current.history.headSnapshotId, uri: "/moved/original.mp4" });
  return { history, service, request, identity, calls: () => calls };
}

test("relocates once without reading a missing old file; preserves edits, numbering and repeated Undo/Redo", async () => {
  const f = fixture(), before = f.history.current, count = f.history.entries.length, numbering = f.history.sourceNumbering;
  const result = await f.service.relocate(f.request());
  assert.equal(result.changed, true); assert.equal(result.sourceId, "s"); assert.equal(f.calls(), 1);
  assert.equal(f.history.entries.length, count + 1); assert.equal(f.history.entries.at(-1).command.type, "source.relocate");
  const after = f.history.current;
  assert.deepEqual(after.sources[0], { ...before.sources[0], uri: "/moved/original.mp4" });
  for (const key of ["timeline", "graphics", "sourceTranscripts", "captions", "exports"]) assert.deepEqual(after[key], before[key]);
  assert.deepEqual(f.history.sourceNumbering, numbering);
  for (let i = 0; i < 3; i++) { assert.deepEqual(f.history.undo(), before); assert.deepEqual(f.history.redo(), after); }
});

for (const [name, overrides, code] of [
  ["same-size different bytes", { async identifySource() { return { content: { ...content, sha256: "b".repeat(64) } }; } }, "SOURCE_RELOCATION_CONTENT_MISMATCH"],
  ["different size before hashing", { async captureSource() { return { sizeBytes: 9 }; }, async identifySource() { assert.fail("must not hash a different size"); } }, "SOURCE_RELOCATION_CONTENT_MISMATCH"],
  ["changed file after hash", { async checkSource() { return "changed"; } }, "SOURCE_RELOCATION_CONTENT_MISMATCH"],
  ["unreadable selection", { async captureSource() { throw { code: "SOURCE_IDENTITY_OFFLINE" }; } }, "SOURCE_RELOCATION_OFFLINE"],
]) test(`rejects ${name} without losing a redo branch`, async () => {
  const f = fixture(overrides); f.history.commit({ type: "project.rename", name: "Redo branch" }); f.history.undo();
  const before = f.history.toArchive();
  await assert.rejects(f.service.relocate(f.request()), { code }); assert.deepEqual(f.history.toArchive(), before); assert.equal(f.history.canRedo, true);
});

test("legacy content identity, stale snapshot and unknown fields are rejected before reading files", async () => {
  const f = fixture({}, true), before = f.history.toArchive();
  await assert.rejects(f.service.relocate(f.request()), { code: "SOURCE_RELOCATION_UNAVAILABLE" });
  await assert.rejects(f.service.relocate({ ...f.request(), expectedSnapshotId: "old" }), { code: "SOURCE_RELOCATION_STALE" });
  for (const uri of ["relative.mp4", "https://example.com/a", "file://foreign/a", "//server/a"]) assert.throws(() => validateLocalSourceRelocationRequest({ ...f.request(), uri }), { code: "SOURCE_RELOCATION_INVALID" });
  assert.throws(() => validateLocalSourceRelocationRequest({ ...f.request(), commands: [] }), { code: "SOURCE_RELOCATION_INVALID" });
  assert.equal(f.calls(), 0); assert.deepEqual(f.history.toArchive(), before);
});

test("cancellation and commit/undo ABA during hashing cannot commit a relocation", async () => {
  for (const action of ["cancel", "ABA"]) {
    const controller = new AbortController(); let f;
    f = fixture({ async checkSource() { if (action === "cancel") controller.abort(); else { f.history.commit({ type: "project.rename", name: "Temporary" }); f.history.undo(); } return "match"; } });
    const before = f.history.current, request = f.request();
    await assert.rejects(f.service.relocate(request, controller.signal), { code: action === "cancel" ? "SOURCE_RELOCATION_CANCELLED" : "SOURCE_RELOCATION_STALE" });
    assert.deepEqual(f.history.current, before); assert.notEqual(f.history.entries.at(-1).command.type, "source.relocate");
  }
});

test("same local locator verifies content and returns no-op without journal or redo loss", async () => {
  const f = fixture(); const before = f.history.toArchive();
  const result = await f.service.relocate({ ...f.request(), uri: "file:///missing/original.mp4" });
  assert.equal(result.changed, false); assert.deepEqual(f.history.toArchive(), before);
});

test("domain relocation rejects content/URI rebinding and unknown fields transactionally", () => {
  const f = fixture(), before = f.history.toArchive();
  const command = { type: "source.relocate", version: 1, sourceId: "s", expectedSourceUri: "/missing/original.mp4", uri: "/moved/original.mp4", expectedContent: content };
  for (const bad of [{ ...command, expectedContent: { ...content, sizeBytes: 9 } }, { ...command, expectedSourceUri: "/other.mp4" }, { ...command, uri: "https://example.com/a" }, { ...command, injected: true }]) {
    assert.throws(() => f.history.commit(bad)); assert.deepEqual(f.history.toArchive(), before);
  }
});
