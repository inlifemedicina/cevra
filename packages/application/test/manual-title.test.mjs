import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyProject, ProjectHistory, frameTimingMilliseconds, MANUAL_TITLE_COMPONENT, resolveManualTitle, validateManualTitle, validateProjectIR } from "@cevra/project-ir";
import { ManualTitleApplicationService, resolveManualVideoSequence, ManualSequencePreviewApplicationService, estimateManualExportOwnedBytes, MANUAL_EXPORT_LIMITS } from "../dist/index.js";

const title = (patch = {}) => ({ version: 1, componentId: MANUAL_TITLE_COMPONENT, text: "Ação, café e conexão", startFrame: 1, endFrame: 209, aspect: "16:9", ...patch });
function fixture() {
  const history = new ProjectHistory(createEmptyProject({ id: "title-history" }));
  const source = { id: "original", kind: "video", uri: "/original.mp4", displayName: "Original", durationMs: 10000,
    technicalDescriptor: { version: 1, basis: "ingest", content: { sha256: "a".repeat(64), sizeBytes: 10 }, method: {
      profile: "cevra.source-technical.v1", engineId: "test", engineVersion: "1", engineApiVersion: 1 }, video: { codec: "h264" } },
    extensions: { "cevra.ingest": { method: "local", hasVideo: true } } };
  history.commit({ type: "source.add", source });
  const timing = { version: 1, timelineStartFrame: 0, timelineEndFrame: 300, sourceStartFrame: 0, sourceEndFrame: 300 };
  history.commit({ type: "timeline.edit", version: 2, edits: [{ type: "timeline.timingPolicy.set", timingPolicy: "cfr30" },
    { type: "track.add", track: { id: "v1", kind: "video", name: "V1", hidden: false, locked: false, muted: false } },
    { type: "clip.add", clip: { id: "clip", trackId: "v1", sourceId: source.id, ...frameTimingMilliseconds(timing), frameTiming: timing, speed: 1, volume: 1, opacity: 1 } }] });
  const service = new ManualTitleApplicationService(history, () => "fixed");
  const request = (type, value) => ({ version: 1, expectedSnapshotId: history.current.history.headSnapshotId, type, ...(value ? { title: value } : {}) });
  return { history, service, request };
}
test("title create/edit/remove are one History action, exact frame aliases, Undo/Redo/reopen preserve montage/originals", () => {
  const f = fixture(), before = f.history.current;
  for (const value of [title(), title({ text: "Coffee and connection", startFrame: 91, endFrame: 210, aspect: "9:16" })]) {
    const prior = f.history.current, count = f.history.entries.length;
    f.service.edit(f.request("set", value));
    const after = f.history.current;
    assert.equal(f.history.entries.length, count + 1);
    assert.deepEqual(resolveManualTitle(after.graphics[0]), value);
    assert.equal(validateProjectIR(after).ok, true);
    assert.deepEqual(after.timeline, before.timeline); assert.deepEqual(after.sources, before.sources);
    assert.equal(resolveManualVideoSequence(after, after.history.headSnapshotId).length, 1);
    f.history.undo(); assert.deepEqual(f.history.current, prior);
    const reopened = ProjectHistory.fromArchive(f.history.toArchive()); reopened.redo(); assert.deepEqual(reopened.current, after);
    f.history.redo(); assert.deepEqual(f.history.current, after);
  }
  const last = f.history.current;
  f.service.edit(f.request("remove")); assert.deepEqual(f.history.current.graphics, []);
  f.history.undo(); assert.deepEqual(f.history.current, last);
});
test("stale/invalid/unknown composition preserves retained history and redo", () => {
  const f = fixture(); f.service.edit(f.request("set", title()));
  f.history.commit({ type: "project.rename", name: "redo" }); f.history.undo();
  const archive = f.history.toArchive();
  for (const bad of [title({ startFrame: 1.5 }), title({ text: "" }), title({ text: "a\nline" }),
    title({ endFrame: 301 }), title({ aspect: "1:1" }), title({ componentId: "caller.code" }), { ...title(), fontPath: "/private" }]) {
    assert.throws(() => f.service.edit(f.request("set", bad))); assert.deepEqual(f.history.toArchive(), archive);
  }
  assert.throws(() => f.service.edit({ ...f.request("remove"), expectedSnapshotId: "stale" }));
  assert.deepEqual(f.history.toArchive(), archive);
  f.service.edit(f.request("set", title())); assert.deepEqual(f.history.toArchive(), archive, "no-op retains redo");
  assert.throws(() => validateManualTitle(title({ text: "\ud800" })));
});
test("preview plan binds title and full journal: edit then Undo invalidates prepared work", async () => {
  const f = fixture();
  const identity = { async captureSource(uri) { return { version: 1, uri, canonicalPath: uri, device: "1", inode: "1", sizeBytes: 10, mtimeNs: "1", ctimeNs: "1" }; },
    async identifySource(_uri, stamp) { return { version: 1, stamp, content: { sha256: "a".repeat(64), sizeBytes: 10 }, bytesRead: 10 }; }, async checkSource() { return "match"; } };
  const preview = new ManualSequencePreviewApplicationService({ history: f.history, identity });
  f.service.edit(f.request("set", title()));
  const plan = await preview.prepare({ version: 1, expectedSnapshotId: f.history.current.history.headSnapshotId });
  assert.deepEqual(plan.title, title()); assert.equal(Object.isFrozen(plan.title), true);
  f.service.edit(f.request("set", title({ text: "changed" }))); f.history.undo();
  assert.throws(() => preview.assertCurrent(plan), { code: "MANUAL_SEQUENCE_STALE" });
});
test("title stays independently editable/removable after montage shortens, without changing absolute timing", () => {
  const f = fixture(); f.service.edit(f.request("set", title()));
  f.history.commit({ type: "timeline.edit", version: 2, edits: [{ type: "clip.remove", clipId: "clip" }] });
  assert.deepEqual(resolveManualTitle(f.history.current.graphics[0]), title());
  f.service.edit(f.request("remove")); assert.deepEqual(f.history.current.graphics, []);
});
test("title preflight accounts for the mandatory raster and refuses an impossible owned workspace", () => {
  const f = fixture(), project = f.history.current;
  const plan = { sources: project.sources, clips: project.timeline.clips, durationMs: project.timeline.durationMs };
  const plain = estimateManualExportOwnedBytes(plan), composed = estimateManualExportOwnedBytes({ ...plan, title: title() });
  assert.equal(composed.originalCopyBytes, plain.originalCopyBytes, "Font raster is not an original copy.");
  assert.equal(composed.estimatedOwnedBytes - plain.estimatedOwnedBytes, 1920 * 1080 * 4 + 65536);
  const sources = structuredClone(project.sources);
  sources[0].technicalDescriptor.content.sizeBytes = MANUAL_EXPORT_LIMITS.ownedJobBytes - 1;
  assert.doesNotThrow(() => estimateManualExportOwnedBytes({ ...plan, sources }));
  assert.throws(() => estimateManualExportOwnedBytes({ ...plan, sources, title: title() }), { code: "MANUAL_EXPORT_DISK_LIMIT" });
});
