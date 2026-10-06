import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyProject, ProjectHistory } from "@cevra/project-ir";
import { ManualSequenceExportPreparationApplicationService, ManualVideoSequenceApplicationService, estimateManualExportOwnedBytes, MANUAL_EXPORT_LIMITS } from "../dist/index.js";

async function fixture() {
  const history = new ProjectHistory(createEmptyProject({ id: "export-preparation" }));
  const identity = {
    async captureSource(uri, signal) { signal?.throwIfAborted(); return { version: 1, uri, canonicalPath: uri, device: "1", inode: "1", sizeBytes: 10, mtimeNs: "1", ctimeNs: "1" }; },
    async identifySource(_uri, stamp, signal) { signal?.throwIfAborted(); return { version: 1, stamp, content: { sha256: "a".repeat(64), sizeBytes: 10 }, bytesRead: 10 }; },
    async checkSource(_uri, _stamp, signal) { signal?.throwIfAborted(); return "match"; }
  };
  for (const id of ["v0", "v1"]) history.commit({ type: "source.add", source: { id, kind: "video", uri: `/tmp/${id}.mp4`, displayName: `${id}.mp4`, durationMs: 6000,
    technicalDescriptor: { version: 1, basis: "ingest", content: { sha256: "a".repeat(64), sizeBytes: 10 }, method: { profile: "cevra.source-technical.v1", engineId: "test", engineVersion: "1", engineApiVersion: 1 }, video: { codec: "h264" } },
    extensions: { "cevra.ingest": { method: "local", hasVideo: true } } } });
  const editor = new ManualVideoSequenceApplicationService({ history, identity });
  for (const [sourceId, sourceStartMs, sourceEndMs] of [["v0", 901, 908], ["v1", 100, 800], ["v0", 901, 908]]) {
    await editor.edit({ version: 1, expectedSnapshotId: history.current.history.headSnapshotId, type: "append", sourceId, sourceStartMs, sourceEndMs });
  }
  const port = { async prepare(bytes, signal) { signal?.throwIfAborted(); assert.equal(bytes, 20); return Object.freeze({ label: "new.mp4", availableBytes: 1e9 }); }, async revalidate(_destination, _bytes, signal) { signal?.throwIfAborted(); } };
  const service = new ManualSequenceExportPreparationApplicationService({ history, identity });
  return { history, identity, port, service, request: () => ({ version: 1, expectedSnapshotId: history.current.history.headSnapshotId, operationId: "export-one", locale: "pt-BR" }) };
}

test("read-only preparation preserves exact seven-ms cuts, redo and numbering and never admits render", async () => {
  const f = await fixture(); f.history.commit({ type: "project.rename", name: "redo" }); f.history.undo();
  const before = f.history.toArchive();
  const result = await f.service.prepare(f.request(), f.port);
  assert.equal(result.durationMs, 714); assert.equal(result.clipCount, 3); assert.equal(result.originalCount, 2);
  assert.equal(result.originalCopyBytes, 20); assert.equal(result.renderAvailable, false);
  assert.equal(result.blockingReason, "delivery-timing-unresolved"); assert.equal(result.destinationLabel, "new.mp4");
  assert.equal(Object.isFrozen(result), true); assert.equal("destinationUri" in result, false);
  await f.service.revalidate(result); assert.deepEqual(f.history.toArchive(), before); assert.equal(f.history.canRedo, true);
  await assert.rejects(f.service.revalidate(structuredClone(result)), { code: "MANUAL_EXPORT_STALE" });
});

test("destination await cannot hide edit/Undo ABA or changed original bytes", async () => {
  for (const change of ["history", "source"]) {
    const f = await fixture(); const before = f.history.current.history.headSnapshotId;
    f.port.revalidate = async () => {
      if (change === "history") { f.history.commit({ type: "project.rename", name: "ABA" }); f.history.undo(); }
      else f.identity.checkSource = async () => "changed";
    };
    await assert.rejects(f.service.prepare(f.request(), f.port), error => ["MANUAL_SEQUENCE_STALE", "MANUAL_VIDEO_SOURCE_CHANGED"].includes(error.code));
    assert.equal(f.history.current.history.headSnapshotId, before);
  }
});

test("cancelled and closed requests never publish preparation or mutate history", async () => {
  const f = await fixture(); const before = f.history.toArchive(); const controller = new AbortController();
  f.port.prepare = async () => { controller.abort(); return { label: "new.mp4", availableBytes: 1e9 }; };
  await assert.rejects(f.service.prepare(f.request(), f.port, controller.signal), { name: "AbortError" });
  for (const extra of [{ destinationUri: "/tmp/foreign" }, { commands: [] }, { renderAvailable: true }, { operationId: "../bad" }]) {
    await assert.rejects(f.service.prepare({ ...f.request(), ...extra }, f.port), { code: "MANUAL_EXPORT_INVALID_REQUEST" });
  }
  assert.deepEqual(f.history.toArchive(), before);
});

test("disk preflight rejects only proved copy impossibility; bitrate estimates do not cap duration", async () => {
  const f = await fixture(), sources = f.history.current.sources;
  const long = estimateManualExportOwnedBytes({ sources, clips: [], durationMs: Number.MAX_SAFE_INTEGER });
  assert.equal(long.estimatedOwnedBytes, Number.MAX_SAFE_INTEGER);
  const huge = structuredClone(sources); huge[0].technicalDescriptor.content.sizeBytes = MANUAL_EXPORT_LIMITS.ownedJobBytes + 1;
  assert.throws(() => estimateManualExportOwnedBytes({ sources: huge, clips: [], durationMs: 7 }), { code: "MANUAL_EXPORT_DISK_LIMIT" });
});
