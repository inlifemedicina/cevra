import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ManualSequenceExportApplicationService, ManualVideoSequenceApplicationService, MediaApplicationService } from "@cevra/application";
import { NodeMediaArtifactStore, OwnedRenderResourceError } from "@cevra/media-ffmpeg";
import { DesktopSession, DesktopProjectPersistence, DesktopHostProtocolServer, NativeManualExportDestination, guardManualExportEngine } from "../dist/index.js";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const publication = async path => { const stamp = await lstat(path, { bigint: true }); return { version: 1, scheme: "posix-dev-inode", device: String(stamp.dev), inode: String(stamp.ino) }; };
const available = { available: true, reason: "available" }, unavailable = { available: false, reason: "runtime-not-configured" };

async function fixture(t, mode = "success") {
  const root = await mkdtemp(join(tmpdir(), "cevra-manual-final-test-")); t.after(() => rm(root, { recursive: true, force: true }));
  const opened = await DesktopProjectPersistence.open(join(root, "store"));
  const original = join(root, "original.mp4"), bytes = Buffer.from("synthetic descriptor-only original; no codec oracle"); await writeFile(original, bytes);
  const history = opened.history;
  history.commit({ type: "source.add", source: { id: "synthetic-source", kind: "video", uri: original, displayName: "original.mp4", durationMs: 6000,
    sampleRate: 48000, channels: 1,
    technicalDescriptor: { version: 1, basis: "ingest", content: { sha256: sha(bytes), sizeBytes: bytes.length },
      method: { profile: "cevra.source-technical.v1", engineId: "synthetic.media", engineVersion: "1", engineApiVersion: 1 }, video: { codec: "h264", avgFrameRate: "30/1" }, audio: { codec: "aac" } },
    extensions: { "cevra.ingest": { method: "local", hasVideo: true } } } });
  const artifacts = new NodeMediaArtifactStore(), editor = new ManualVideoSequenceApplicationService({ history, identity: artifacts });
  await editor.edit({ version: 2, expectedSnapshotId: history.current.history.headSnapshotId, type: "append", sourceId: "synthetic-source", sourceStartFrame: 15, sourceEndFrame: 46 });
  await opened.persistence.checkpoint(history);
  const executions = await opened.persistence.openMediaExecutionRepository(history.current.project.id);
  let calls = 0, capturedBudget, settleCalls = 0;
  const engine = {
    async identity() { return { id: "synthetic.media", kind: "media", displayName: "Synthetic", version: "1", apiVersion: 1 }; },
    async healthcheck() { return { status: "ready", checkedAt: "2026-10-06T00:00:00Z", checks: [] }; }, async capabilities() { return []; },
    async execute(operation, context) {
      calls++; await hooks.beforeWrite?.(context.signal, operation); context.signal?.throwIfAborted();
      const output = Buffer.from("synthetic final bytes"); await writeFile(operation.outputUri, output, { flag: "wx" });
      await link(operation.outputUri, join(operation.ownedWorkspaceUri, "published-account.mp4"));
      if (mode === "no-receipt") throw Error("synthetic adapter receipt rejected after publication");
      const frames = operation.items.reduce((sum, item) => sum + item.sourceEndFrame - item.sourceStartFrame, 0), durationMs = frames * 1000 / 30;
      return { type: "file", outputUri: operation.outputUri, durationMs: Math.round(durationMs), publication: await publication(operation.outputUri),
        probe: { uri: operation.outputUri, durationMs: Math.round(durationMs), width: 1920, height: 1080, frameRate: 30, hasVideo: true, hasAudio: true,
          videoCodec: "h264", audioCodec: "aac", sampleRate: 48000, channels: 1 },
        effectiveProfile: { container: "mp4", videoCodec: "h264", audioCodec: "aac", videoEncoder: "h264_videotoolbox", audioEncoder: "aac" },
        manualSequence: { version: 1, profile: "manual-cfr30-export-v1", samplingPolicy: "source-pts-fps30-near-v1", frameRate: { numerator: 30, denominator: 1 },
          container: "mp4", videoCodec: "h264", audioCodec: "aac", dynamicRange: "sdr", width: 1920, height: 1080, targetVideoBitsPerSecond: 20_000_000,
          totalFrames: frames, outputFrameCount: frames, totalPcmSamples: frames * 1600, outputAudioSampleCount: frames * 1600, audioSampleRate: 48000,
          audioChannelLayout: "mono", durationMs, muxVideoDurationMs: durationMs, muxAudioDurationMs: durationMs, outputSha256: sha(output),
          itemCount: operation.items.length, uniqueSegmentCount: 1,
          sources: [{ inputUri: original, sha256: sha(bytes), sizeBytes: bytes.length, videoStreamIndex: 0, audioStreamIndex: 1, audioStreamCount: 1,
            sampleRate: 48000, channelLayout: "mono", sourceVideoFrameCount: 180, sourceVideoEndMs: 6000, sourceAudioFirstSample: 0, sourceAudioSampleCount: 288000 }] } };
    }
  };
  const hooks = {};
  const budgetFailure = new OwnedRenderResourceError(mode.startsWith("disk") ? "MEDIA_RENDER_DISK_LIMIT" : mode.startsWith("resource") ? "MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED" : "MEDIA_RENDER_MEMORY_LIMIT");
  const transport = {
    async withOwnedRenderBudget(options, callback) {
      capturedBudget = options;
      if (mode.endsWith("-before")) throw budgetFailure;
      const result = await callback();
      if (mode === "foreign") { await rename(result.outputUri, `${result.outputUri}.owned`); await writeFile(result.outputUri, "foreign arrival", { flag: "wx" }); }
      if (mode !== "success") throw budgetFailure;
      return { result, resourceEvidence: { samples: 2, enforcement: "sampled-watchdog", intervalMs: 100 } };
    },
    async settle() { settleCalls++; await hooks.beforeSettle?.(); if (mode === "retirement" && calls) throw Error("retirement remains unknown"); }
  };
  const executionPort = new Proxy(executions, { get(target, key) {
    if (key === "save") return async record => {
      if (hooks.archiveFinalFault && record.status === "succeeded") {
        target.options.injectFault = point => { if (point === "before-temp-write") throw Error("synthetic final archive write fault"); };
      }
      return target.save(record);
    };
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
  const media = new MediaApplicationService({ history, engine: guardManualExportEngine(engine, transport), executions: executionPort, artifacts });
  const service = new ManualSequenceExportApplicationService({ history, identity: artifacts, media });
  const services = { history, persistence: opened.persistence, manualVideoSequence: editor,
    mediaCapability: available, transcriptionCapability: unavailable, manualExport: service, manualExportCapability: available, manualExportSettle: () => transport.settle() };
  const session = new DesktopSession(services);
  t.after(() => session.close());
  const request = operationId => ({ version: 1, expectedSnapshotId: history.current.history.headSnapshotId, operationId, locale: "en-US" });
  return { root, opened, history, original, bytes, session, executions, media, services, request, hooks, budgetFailure,
    calls: () => calls, budget: () => capturedBudget, settleCalls: () => settleCalls };
}

test("native-picked export checkpoints one audited record, reopens without replay and removes only its private workspace", async t => {
  const f = await fixture(t), target = join(f.root, "new.mp4"), before = f.history.entries.length;
  const response = await f.session.exportManualSequence(f.request("synthetic-one"), target);
  assert.equal(response.outcome, "exported"); assert.equal(response.state.status.persistence, "local-saved");
  assert.equal(response.executionId, "manual-export-synthetic-one"); assert.equal(response.exportId, response.executionId); assert.equal(response.destinationLabel, "new.mp4");
  assert.equal(f.history.entries.length, before + 1); assert.equal(f.history.current.exports.length, 1);
  assert.equal(f.budget().rendererRssLimitBytes, 512 * 1024 * 1024); assert.equal(f.budget().ownedFileLimitBytes, 2 * 1024 * 1024 * 1024);
  assert.deepEqual((await readdir(f.root)).filter(name => name.startsWith(".cevra-export-")), []); assert.deepEqual(await readFile(f.original), f.bytes);
  await f.session.close(); const reopened = await DesktopProjectPersistence.open(join(f.root, "store"));
  assert.equal(reopened.history.current.exports.length, 1);
  const records = await reopened.persistence.openMediaExecutionRepository(reopened.history.current.project.id);
  assert.equal((await records.get(response.executionId)).status, "succeeded"); assert.equal(f.calls(), 1);
  await records.close?.(); await reopened.persistence.close();
});

test("budget final failure precedes export commit and conservatively retains publication/account evidence", async t => {
  const f = await fixture(t, "memory"), target = join(f.root, "failed.mp4"), before = f.history.toArchive();
  await assert.rejects(f.session.exportManualSequence(f.request("synthetic-budget"), target), error => {
    assert.equal(error.code, "MANUAL_EXPORT_PUBLICATION_UNVERIFIED"); assert.equal(error.details.causeCode, "MANUAL_EXPORT_MEMORY_LIMIT");
    assert.equal(error.details.state.project.exports.length, 0); return true;
  });
  assert.deepEqual(f.history.toArchive(), before); assert.equal(f.history.current.exports.length, 0);
  assert.equal(await readFile(target, "utf8"), "synthetic final bytes"); assert.ok(f.settleCalls() >= 2);
  const roots = (await readdir(f.root)).filter(name => name.startsWith(".cevra-export-")); assert.equal(roots.length, 1);
  assert.equal((await lstat(join(f.root, roots[0], "published-account.mp4"))).ino, (await lstat(target)).ino);
  assert.equal((await f.executions.get("manual-export-synthetic-budget")).status, "failed"); assert.deepEqual(await readFile(f.original), f.bytes);
});

test("budget failure preserves a foreign replacement and preserves the primary observer error", async t => {
  const f = await fixture(t, "foreign"), target = join(f.root, "foreign.mp4");
  await assert.rejects(f.session.exportManualSequence(f.request("synthetic-foreign"), target), error => {
    assert.equal(error.code, "MANUAL_EXPORT_PUBLICATION_UNVERIFIED"); assert.equal(error.details.causeCode, "MANUAL_EXPORT_MEMORY_LIMIT");
    let cause = error; for (let n = 0; n < 5 && cause !== f.budgetFailure; n++) cause = cause?.cause;
    assert.equal(cause, f.budgetFailure); return true;
  });
  assert.equal(await readFile(target, "utf8"), "foreign arrival"); assert.equal(f.history.current.exports.length, 0);
  assert.equal((await readdir(f.root)).filter(name => name.startsWith(".cevra-export-")).length, 1); assert.deepEqual(await readFile(f.original), f.bytes);
});

test("unproved worker retirement retains output and its owned workspace instead of racing cleanup", async t => {
  const f = await fixture(t, "retirement"), target = join(f.root, "unretired.mp4");
  await assert.rejects(f.session.exportManualSequence(f.request("synthetic-unretired"), target), error => {
    assert.equal(error.code, "MANUAL_EXPORT_CLEANUP_FAILED"); assert.ok(error.cleanupError); assert.equal(error.details.causeCode, "MANUAL_EXPORT_MEMORY_LIMIT"); return true;
  });
  assert.equal(await readFile(target, "utf8"), "synthetic final bytes");
  assert.equal((await readdir(f.root)).filter(name => name.startsWith(".cevra-export-")).length, 1);
  assert.equal(f.history.current.exports.length, 0);
});

test("a published result without an admitted receipt retains output/account evidence and reports uncertainty", async t => {
  const f = await fixture(t, "no-receipt"), target = join(f.root, "uncertain.mp4");
  await assert.rejects(f.session.exportManualSequence(f.request("synthetic-unproven"), target), error => {
    assert.equal(error.code, "MANUAL_EXPORT_PUBLICATION_UNVERIFIED"); assert.equal(error.details.state.project.exports.length, 0); assert.ok(error.cause); return true;
  });
  const workspaces = (await readdir(f.root)).filter(name => name.startsWith(".cevra-export-")); assert.equal(workspaces.length, 1);
  const account = join(f.root, workspaces[0], "published-account.mp4");
  assert.equal((await lstat(account)).ino, (await lstat(target)).ino); assert.equal(await readFile(target, "utf8"), "synthetic final bytes");
  assert.equal(f.history.current.exports.length, 0); assert.equal(f.calls(), 1); assert.deepEqual(await readFile(f.original), f.bytes);
});

test("checkpoint failure keeps the published record/state; explicit checkpoint retry does not rerender", async t => {
  const f = await fixture(t), target = join(f.root, "checkpoint.mp4");
  let writes = 0;
  f.opened.persistence.injectFault = point => { if (point === "checkpoint-write") { writes++; throw Error("synthetic save fault"); } };
  await assert.rejects(f.session.exportManualSequence(f.request("synthetic-save"), target), error => {
    assert.equal(error.code, "MANUAL_EXPORT_COMMITTED_ERROR"); assert.equal(error.details.state.project.exports.length, 1);
    assert.equal(error.details.executionId, "manual-export-synthetic-save"); assert.equal(error.details.exportId, error.details.executionId);
    assert.equal(error.details.destinationLabel, "checkpoint.mp4"); assert.equal(error.details.checkpointStatus, "persistence-error"); return true;
  });
  assert.equal(writes, 1);
  assert.equal((await f.executions.get("manual-export-synthetic-save")).status, "succeeded"); assert.equal(f.calls(), 1);
  assert.equal(await readFile(target, "utf8"), "synthetic final bytes");
  f.opened.persistence.injectFault = undefined;
  const state = await f.session.retryCheckpoint(f.session.state().checkpoint.token); assert.equal(state.status.persistence, "local-saved"); assert.equal(f.calls(), 1);
});

test("final archive save failure checkpoints the canonical export once and recovery reconciles without replay", async t => {
  const f = await fixture(t), target = join(f.root, "archive.mp4"), before = f.history.entries.length;
  f.hooks.archiveFinalFault = true;
  const lines = [], server = new DesktopHostProtocolServer(f.session, { writeProtocolLine(line) { lines.push(JSON.parse(line)); }, writeLog() {}, requestShutdown() {} });
  await server.handleLine(JSON.stringify({ protocolVersion: 1, id: "export", method: "video.exportManualSequence", params: { ...f.request("synthetic-archive"), destinationUri: target } }));
  const wire = lines[0].error;
  assert.equal(wire.code, "MANUAL_EXPORT_COMMITTED_ERROR"); assert.equal(wire.details.checkpointStatus, "local-saved");
  assert.deepEqual(Object.keys(wire.details).sort(), ["checkpointStatus", "destinationLabel", "executionId", "exportId", "state"]);
  assert.equal(wire.details.executionId, "manual-export-synthetic-archive"); assert.equal(wire.details.state.project.exports.length, 1);
  assert.equal(wire.message.includes("synthetic final archive write fault"), false);
  assert.equal(f.history.entries.length, before + 1); assert.equal(f.calls(), 1);
  await assert.rejects(f.executions.get(wire.details.executionId));
  assert.equal(await readFile(target, "utf8"), "synthetic final bytes");
  await f.session.close();
  const reopened = await DesktopProjectPersistence.open(join(f.root, "store")), records = await reopened.persistence.openMediaExecutionRepository(reopened.history.current.project.id);
  assert.equal((await records.get(wire.details.executionId)).status, "committing");
  const recovery = new MediaApplicationService({ history: reopened.history, executions: records, artifacts: new NodeMediaArtifactStore(), engine: { async execute() { throw Error("replay forbidden"); } } });
  assert.deepEqual(await recovery.reconcilePendingWithoutReplay(), [{ executionId: wire.details.executionId, status: "succeeded" }]);
  assert.equal((await records.get(wire.details.executionId)).status, "succeeded"); assert.equal(reopened.history.current.exports.length, 1);
  assert.equal(f.calls(), 1); assert.deepEqual(await readFile(f.original), f.bytes);
  await records.close?.(); await reopened.persistence.close();
});

test("archive and checkpoint faults preserve one committed export for an explicit save without rerender", async t => {
  const f = await fixture(t), target = join(f.root, "double-fault.mp4"); f.hooks.archiveFinalFault = true;
  let writes = 0; f.opened.persistence.injectFault = point => { if (point === "checkpoint-write") { writes++; throw Error("synthetic save fault"); } };
  await assert.rejects(f.session.exportManualSequence(f.request("synthetic-double"), target), error => {
    assert.equal(error.code, "MANUAL_EXPORT_COMMITTED_ERROR"); assert.equal(error.details.checkpointStatus, "persistence-error");
    assert.equal(error.details.state.project.exports.length, 1); assert.ok(error.checkpointError); return true;
  });
  assert.equal(writes, 1); assert.equal(f.calls(), 1); assert.equal(await readFile(target, "utf8"), "synthetic final bytes");
  f.opened.persistence.injectFault = undefined;
  assert.equal((await f.session.retryCheckpoint(f.session.state().checkpoint.token)).status.persistence, "local-saved"); assert.equal(f.calls(), 1);
});

test("disk and observation resource faults have closed Host codes and retain the unchanged canonical state", async t => {
  for (const [mode, code] of [["memory-before", "MANUAL_EXPORT_MEMORY_LIMIT"], ["disk-before", "MANUAL_EXPORT_DISK_LIMIT"], ["resource-before", "MANUAL_EXPORT_RESOURCE_UNAVAILABLE"]]) {
    const f = await fixture(t, mode), target = join(f.root, `${mode}.mp4`);
    await assert.rejects(f.session.exportManualSequence(f.request(`synthetic-${mode}`), target), error => {
      assert.equal(error.code, code); assert.equal(error.details.state.project.exports.length, 0); return true;
    });
    await assert.rejects(lstat(target), { code: "ENOENT" });
  }
});

test("wire publication uncertainty carries only the closed budget cause code and canonical state", async t => {
  const f = await fixture(t, "disk"), target = join(f.root, "wire-disk.mp4"), lines = [];
  const server = new DesktopHostProtocolServer(f.session, { writeProtocolLine(line) { lines.push(JSON.parse(line)); }, writeLog() {}, requestShutdown() {} });
  await server.handleLine(JSON.stringify({ protocolVersion: 1, id: "disk", method: "video.exportManualSequence", params: { ...f.request("synthetic-wire-disk"), destinationUri: target } }));
  const error = lines[0].error;
  assert.equal(error.code, "MANUAL_EXPORT_PUBLICATION_UNVERIFIED"); assert.equal(error.details.causeCode, "MANUAL_EXPORT_DISK_LIMIT");
  assert.deepEqual(Object.keys(error.details).sort(), ["causeCode", "state"]); assert.equal(error.details.state.project.exports.length, 0);
  assert.equal(await readFile(target, "utf8"), "synthetic final bytes");
});

test("export cancels a queued preview and awaits its job plus transport retirement before budgeting", async t => {
  const f = await fixture(t), events = []; let enter, finishPreview, finishRetirement;
  const entered = new Promise(resolve => { enter = resolve; }), previewGate = new Promise(resolve => { finishPreview = resolve; }), retirementGate = new Promise(resolve => { finishRetirement = resolve; });
  f.services.derivedVideoPreview = { async prepare(_request, signal) { events.push("preview-read-extract-queued"); enter(); await previewGate; assert.equal(signal.aborted, true); events.push("preview-job-settled"); signal.throwIfAborted(); } };
  f.hooks.beforeSettle = async () => { events.push("retirement-check"); await retirementGate; events.push("retired"); };
  f.hooks.beforeWrite = async () => { events.push("export-render"); assert.ok(events.includes("preview-job-settled")); assert.ok(events.includes("retired")); };
  const previewRequest = { sourceId: "synthetic-source", clipId: f.history.current.timeline.clips[0].id, operationId: "synthetic-preview", expectedSnapshotId: f.history.current.history.headSnapshotId };
  const preview = f.session.previewLocalVideo(previewRequest), rejected = assert.rejects(preview, { name: "AbortError" }); await entered;
  const exporting = f.session.exportManualSequence(f.request("legacy-preview-export"), join(f.root, "after-preview.mp4"));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(f.calls(), 0);
  await assert.rejects(f.session.previewLocalVideo({ ...previewRequest, operationId: "new-preview" }), { code: "PROJECT_MUTATION_BUSY" });
  assert.throws(() => f.session.prepareClose("while-retiring"), { code: "PROJECT_CLOSE_BUSY" });
  finishPreview(); await rejected; await new Promise(resolve => setImmediate(resolve)); assert.equal(f.calls(), 0);
  finishRetirement(); assert.equal((await exporting).outcome, "exported"); assert.equal(f.calls(), 1);
});

test("cancel/stale admission and busy Close never publish or lose the current canonical history", async t => {
  const f = await fixture(t), target = join(f.root, "cancel.mp4"); let release, started;
  const gate = new Promise(resolve => { release = resolve; }), begin = new Promise(resolve => { started = resolve; });
  f.hooks.beforeWrite = async () => { started(); await gate; };
  const executing = f.session.exportManualSequence(f.request("synthetic-cancel"), target), rejected = assert.rejects(executing);
  await begin; assert.throws(() => f.session.prepareClose("synthetic-close"), { code: "PROJECT_CLOSE_BUSY" });
  await assert.rejects(f.session.undo(), { code: "PROJECT_MUTATION_BUSY" });
  f.session.cancel("synthetic-cancel"); release(); await rejected; assert.equal(f.history.current.exports.length, 0);
  await assert.rejects(lstat(target), { code: "ENOENT" }); assert.deepEqual(await readFile(f.original), f.bytes);
  const before = f.calls(); await assert.rejects(f.session.exportManualSequence({ ...f.request("synthetic-stale"), expectedSnapshotId: "stale" }, target)); assert.equal(f.calls(), before);
});

test("issued workspace cleanup refuses directory replacement and leaves foreign content intact", async t => {
  const root = await mkdtemp(join(tmpdir(), "cevra-owned-final-root-")); t.after(() => rm(root, { recursive: true, force: true }));
  const destination = new NativeManualExportDestination(join(root, "output.mp4"), { temporaryRoot: root });
  const target = await destination.prepare(1); assert.equal(destination.resolveOutputUri(target), join(await realpath(root), "output.mp4"));
  assert.throws(() => destination.resolveOutputUri({ ...target }), { code: "MANUAL_EXPORT_DESTINATION_INVALID" });
  const workspace = await destination.createOwnedWorkspace(); const stamp = await lstat(workspace.uri);
  assert.equal(stamp.mode & 0o777, 0o700); assert.equal(stamp.dev, (await lstat(root)).dev);
  await rename(workspace.uri, `${workspace.uri}.original`); await mkdir(workspace.uri); await writeFile(join(workspace.uri, "foreign"), "preserve");
  await assert.rejects(workspace.remove(), { code: "MANUAL_EXPORT_DESTINATION_CHANGED" });
  assert.equal(await readFile(join(workspace.uri, "foreign"), "utf8"), "preserve");
});
