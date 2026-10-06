import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyProject, ProjectHistory, framesToMilliseconds } from "@cevra/project-ir";
import {
  ManualSequenceExportApplicationService, MediaApplicationService, MediaExecutionCommitError, InMemoryMediaExecutionRepository,
  validatePersistedMediaExecutionArchive
} from "../dist/index.js";

const sha256 = "a".repeat(64);
const publication = { version: 1, scheme: "posix-dev-inode", device: "1", inode: "17" };
function fixture({ legacy = false, fileUrl = false } = {}) {
  const history = new ProjectHistory(createEmptyProject({ id: "manual-final" }));
  history.commit({ type: "source.add", source: {
    id: "source", kind: "video", uri: fileUrl ? "file:///tmp/source.mp4" : "/tmp/source.mp4", displayName: "source.mp4", durationMs: 6000,
    technicalDescriptor: { version: 1, basis: "ingest", content: { sha256, sizeBytes: 10 },
      method: { profile: "cevra.source-technical.v1", engineId: "test.media", engineVersion: "1", engineApiVersion: 1 },
      video: { codec: "h264", avgFrameRate: "30/1" }, audio: { codec: "aac" } },
    extensions: { "cevra.ingest": { method: "local", hasVideo: true } }
  } });
  const frameTiming = { version: 1, timelineStartFrame: 0, timelineEndFrame: 31, sourceStartFrame: 15, sourceEndFrame: 46 };
  history.commit({ type: "timeline.edit", version: legacy ? 1 : 2, edits: [
    ...(!legacy ? [{ type: "timeline.timingPolicy.set", timingPolicy: "cfr30" }] : []),
    { type: "track.add", track: { id: "video", kind: "video", name: "V1", locked: false, hidden: false, muted: false } },
    { type: "clip.add", clip: { id: "clip", trackId: "video", sourceId: "source", speed: 1, volume: 1, opacity: 1,
      timelineStartMs: 0, timelineEndMs: legacy ? 1000 : framesToMilliseconds(31), sourceStartMs: 500,
      sourceEndMs: legacy ? 1500 : framesToMilliseconds(46), ...(!legacy ? { frameTiming } : {}) } }
  ] });
  const identity = {
    async captureSource(uri) { return { version: 1, uri, canonicalPath: uri, device: "1", inode: uri === "/tmp/final.mp4" ? "17" : "1", sizeBytes: 10, mtimeNs: "1", ctimeNs: "1" }; },
    async identifySource(_uri, stamp) { return { version: 1, stamp, content: { sha256, sizeBytes: 10 }, bytesRead: 10 }; },
    async checkSource() { return "match"; }
  };
  const files = new Map(); const removed = []; const calls = [];
  const artifacts = {
    async kind(uri) { return files.has(uri) ? "file" : "missing"; }, async exists(uri) { return files.has(uri); },
    async remove(uri) { removed.push(uri); files.delete(uri); },
    async matchesPublication(uri, proof) { return files.get(uri) === proof.inode; }
  };
  const engine = {
    async identity() { return { id: "test.media", kind: "media", displayName: "Test Media", version: "1", apiVersion: 1 }; },
    async execute(operation, context) { calls.push(operation); context.signal?.throwIfAborted(); files.set(operation.outputUri, publication.inode); return result(operation); }
  };
  const executions = new InMemoryMediaExecutionRepository();
  const media = new MediaApplicationService({ history, engine, executions, artifacts });
  const port = {
    prepareCalls: 0,
    async prepare(bytes, signal) { this.prepareCalls++; signal?.throwIfAborted(); assert.equal(bytes, 10); return Object.freeze({ label: "final.mp4", availableBytes: 1e9 }); },
    async revalidate(_target, _bytes, signal) { signal?.throwIfAborted(); assert.equal(files.has("/tmp/final.mp4"), false); },
    resolveOutputUri() { return "/tmp/final.mp4"; },
    async revalidatePublication(_target, proof, signal) { signal?.throwIfAborted(); assert.equal(files.get("/tmp/final.mp4"), proof.inode); }
  };
  const service = new ManualSequenceExportApplicationService({ history, identity, media });
  return { history, identity, files, removed, calls, engine, executions, artifacts, media, port, service,
    request: () => ({ version: 1, expectedSnapshotId: history.current.history.headSnapshotId, operationId: "one", locale: "en-US" }) };
}
function result(operation) {
  const frames = operation.items.reduce((count, item) => count + item.sourceEndFrame - item.sourceStartFrame, 0);
  const durationMs = frames * 1000 / 30;
  return {
    type: "file", outputUri: operation.outputUri, durationMs: Math.round(durationMs), publication,
    probe: { uri: operation.outputUri, durationMs: Math.round(durationMs), width: 1920, height: 1080, frameRate: 30,
      hasVideo: true, hasAudio: true, videoCodec: "h264", audioCodec: "aac", sampleRate: 48000, channels: 1 },
    effectiveProfile: { container: "mp4", videoCodec: "h264", audioCodec: "aac", videoEncoder: "h264_videotoolbox", audioEncoder: "aac" },
    manualSequence: { version: 1, outputSha256: sha256, profile: "manual-cfr30-export-v1", samplingPolicy: "source-pts-fps30-near-v1",
      frameRate: { numerator: 30, denominator: 1 }, container: "mp4", videoCodec: "h264", audioCodec: "aac", dynamicRange: "sdr",
      width: 1920, height: 1080, targetVideoBitsPerSecond: 20_000_000, totalFrames: frames, outputFrameCount: frames,
      totalPcmSamples: frames * 1600, outputAudioSampleCount: frames * 1600, audioSampleRate: 48000, audioChannelLayout: "mono",
      durationMs, muxVideoDurationMs: durationMs, muxAudioDurationMs: durationMs, itemCount: operation.items.length, uniqueSegmentCount: 1,
      sources: [{ inputUri: operation.items[0].inputUri, sha256, sizeBytes: 10, videoStreamIndex: 0, audioStreamIndex: 1, audioStreamCount: 1,
        sampleRate: 48000, channelLayout: "mono", sourceVideoFrameCount: 180, sourceVideoEndMs: 6000,
        sourceAudioFirstSample: 0, sourceAudioSampleCount: 288000 }] }
  };
}

test("canonical 31-frame final reads originals and commits one audited export with restart-safe evidence", async () => {
  const f = fixture({ fileUrl: true }), before = f.history.entries.length;
  const outcome = await f.service.execute(f.request(), f.port, "/tmp/private-issued-job");
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].items[0].inputUri, "/tmp/source.mp4");
  assert.deepEqual(f.calls[0].items[0].sourceContent, { sha256, sizeBytes: 10 });
  assert.equal(f.calls[0].items[0].audioSelection, "single-source-stream");
  assert.equal(f.calls[0].items[0].sourceEndFrame, 46); assert.equal(f.history.entries.length, before + 1);
  assert.equal(outcome.record.status, "succeeded"); assert.equal(outcome.project.exports.length, 1);
  assert.equal(outcome.project.sources[0].uri, "file:///tmp/source.mp4");
  assert.equal(outcome.project.exports[0].id, "manual-export-one");
  const archive = validatePersistedMediaExecutionArchive({ ...f.executions.toArchive(), projectId: "manual-final" });
  const reopened = new MediaApplicationService({ history: ProjectHistory.fromArchive(f.history.toArchive()), engine: f.engine,
    executions: new InMemoryMediaExecutionRepository(archive), artifacts: f.artifacts });
  assert.deepEqual(await reopened.reconcilePendingWithoutReplay(), []); assert.equal(f.calls.length, 1);
  f.history.undo(); assert.equal(f.history.current.exports.length, 0); assert.equal(f.files.has("/tmp/final.mp4"), true);
});

test("legacy export requires explicit reviewed conform before picker or execution", async () => {
  const f = fixture({ legacy: true }), archive = f.history.toArchive();
  await assert.rejects(f.service.execute(f.request(), f.port, "/tmp/private-issued-job"), { code: "MANUAL_EXPORT_CONFORM_REQUIRED" });
  assert.equal(f.port.prepareCalls, 0); assert.equal(f.calls.length, 0); assert.deepEqual(f.history.toArchive(), archive);
  assert.deepEqual(f.executions.toArchive().records, []);
});

test("invalid frame/source/profile evidence never promotes and preserves the possible public publication", async () => {
  for (const change of [r => r.manualSequence.outputFrameCount--, r => r.manualSequence.sources[0].sha256 = "b".repeat(64),
    r => r.probe.frameRate = 29.97, r => r.manualSequence.totalPcmSamples--, r => r.manualSequence.muxAudioDurationMs += 5]) {
    const f = fixture(); f.engine.execute = async operation => { f.files.set(operation.outputUri, "17"); const r = result(operation); change(r); return r; };
    await assert.rejects(f.service.execute(f.request(), f.port, "/tmp/private-issued-job"), { code: "MEDIA_OPERATION_FAILED" });
    assert.equal(f.history.current.exports.length, 0); assert.deepEqual(f.removed, []); assert.equal(f.files.get("/tmp/final.mp4"), "17");
    const failed = await f.executions.get("manual-export-one");
    assert.equal(failed.status, "failed"); assert.deepEqual(failed.attempts.at(-1).cleanupFailedOutputUris, ["/tmp/final.mp4"]);
  }
});

test("post-render source change, ABA, cancellation and destination replacement fail before canonical promotion", async () => {
  for (const variant of ["source", "aba", "cancel", "foreign"]) {
    const f = fixture(), controller = new AbortController(), snapshot = f.history.current.history.headSnapshotId;
    f.port.revalidatePublication = async () => {
      if (variant === "source") f.identity.checkSource = async () => "changed";
      if (variant === "aba") { f.history.commit({ type: "project.rename", name: "intervening" }); f.history.undo(); }
      if (variant === "cancel") controller.abort();
      if (variant === "foreign") { f.files.set("/tmp/final.mp4", "foreign"); throw Error("destination replaced"); }
    };
    await assert.rejects(f.service.execute(f.request(), f.port, "/tmp/private-issued-job", controller.signal));
    assert.equal(f.history.current.exports.length, 0); assert.equal(f.history.current.history.headSnapshotId, snapshot);
    if (variant === "foreign") { assert.equal(f.files.get("/tmp/final.mp4"), "foreign"); assert.deepEqual(f.removed, []); }
    else { assert.equal(f.files.has("/tmp/final.mp4"), true); assert.deepEqual(f.removed, []); }
    if (variant === "aba") assert.equal(f.history.canRedo, true);
  }
});

test("lost workspace/source guards prohibit isolated retry; restart reconciles without renderer replay", async () => {
  const f = fixture(); f.engine.execute = async () => { throw Error("worker stopped"); };
  await assert.rejects(f.service.execute(f.request(), f.port, "/tmp/private-issued-job"));
  await assert.rejects(f.media.retry("manual-export-one"), { code: "MEDIA_OPERATION_NOT_RETRYABLE" });
  const record = await f.executions.get("manual-export-one"); record.status = "running"; await f.executions.save(record);
  f.engine.execute = async () => { throw Error("must never replay"); };
  assert.equal((await f.media.reconcilePendingWithoutReplay())[0].status, "interrupted");
});

test("synchronous commit guard rejects equal snapshot/revision/count ABA after asynchronous verification", async () => {
  const f = fixture(); f.history.commit({ type: "project.rename", name: "original redo" }); f.history.undo();
  const before = f.history.current, journal = f.history.journalIdentity, count = f.history.entries.length;
  await assert.rejects(f.media.execute({ id: "late-aba", locale: "en-US",
    operation: { type: "render-manual-video-sequence", version: 1, outputUri: "/tmp/final.mp4", ownedWorkspaceUri: "/tmp/private-issued-job",
      items: [{ inputUri: "/tmp/source.mp4", sourceStartFrame: 15, sourceEndFrame: 46,
        sourceContent: { sha256, sizeBytes: 10 }, audioSelection: "single-source-stream" }] },
    mutation: { type: "export.add", exportId: "late-aba", presetId: "manual" },
    projectBinding: { projectId: before.project.id, projectRevision: before.history.revision,
      projectSnapshotId: before.history.headSnapshotId, projectJournalEntryCount: count }
  }, undefined, {
    beforeCommit: { async verify() { queueMicrotask(() => { f.history.commit({ type: "project.rename", name: "replacement redo" }); f.history.undo(); }); } },
    assertCurrent() { if (f.history.journalIdentity !== journal) throw Error("full journal changed"); }
  }));
  assert.equal(f.history.current.history.headSnapshotId, before.history.headSnapshotId);
  assert.equal(f.history.current.history.revision, before.history.revision); assert.equal(f.history.entries.length, count);
  assert.equal(f.history.current.exports.length, 0); assert.equal(f.files.has("/tmp/final.mp4"), true); assert.deepEqual(f.removed, []);
  assert.equal(f.history.redo().project.name, "replacement redo");
});

test("in-place output changes are rejected even when publication inode still matches", async () => {
  const f = fixture(), identify = f.identity.identifySource;
  f.identity.identifySource = async (uri, stamp) => {
    const value = await identify(uri, stamp);
    return uri === "/tmp/final.mp4" ? { ...value, content: { ...value.content, sha256: "b".repeat(64) } } : value;
  };
  await assert.rejects(f.service.execute(f.request(), f.port, "/tmp/private-issued-job"));
  assert.equal(f.history.current.exports.length, 0); assert.deepEqual(f.removed, []); assert.equal(f.files.has("/tmp/final.mp4"), true);
});

test("manual failure cleanup never checks then unlinks a public name or an arriving foreign file", async () => {
  const f = fixture();
  f.artifacts.matchesPublication = async () => { throw Error("No racy publication check may authorize pathname removal."); };
  f.artifacts.remove = async () => { throw Error("No public pathname unlink may run."); };
  f.engine.execute = async operation => { f.files.set(operation.outputUri, "foreign-arrival"); throw Error("worker result lost after possible publication"); };
  await assert.rejects(f.service.execute(f.request(), f.port, "/tmp/private-issued-job"));
  assert.equal(f.files.get("/tmp/final.mp4"), "foreign-arrival"); assert.equal(f.history.current.exports.length, 0);
  assert.deepEqual(await f.media.cleanupOwnedOutputs("manual-export-one"), { removed: [], failed: ["/tmp/final.mp4"] });
  assert.equal(f.files.get("/tmp/final.mp4"), "foreign-arrival");
});

test("archive failure after canonical commit carries trusted commit evidence and restart never rerenders", async () => {
  const f = fixture(), save = f.executions.save.bind(f.executions);
  f.executions.save = async record => {
    if (record.status === "succeeded") throw Error("archive finalization failed");
    return save(record);
  };
  let committedError;
  await assert.rejects(f.service.execute(f.request(), f.port, "/tmp/private-issued-job"), error => {
    committedError = error; return error instanceof MediaExecutionCommitError;
  });
  assert.equal(f.history.current.exports.length, 1); assert.equal(f.files.has("/tmp/final.mp4"), true); assert.deepEqual(f.removed, []);
  assert.equal(committedError.committedRecord.id, "manual-export-one");
  assert.equal(committedError.committedRecord.attempts.at(-1).projectJournalEntryId, f.history.entries.at(-1).id);
  assert.equal(Object.keys(committedError).includes("committedRecord"), false);
  const restoredRecords = new InMemoryMediaExecutionRepository(f.executions.toArchive());
  const restored = new MediaApplicationService({ history: ProjectHistory.fromArchive(f.history.toArchive()), engine: f.engine,
    executions: restoredRecords, artifacts: f.artifacts });
  assert.equal((await restored.reconcilePendingWithoutReplay())[0].status, "succeeded");
  assert.equal(f.calls.length, 1); assert.equal((await restoredRecords.get("manual-export-one")).status, "succeeded");
});
