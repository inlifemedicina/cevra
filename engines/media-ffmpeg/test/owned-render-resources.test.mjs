import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, writeFile, readFile, rm, open, link, symlink, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { OwnedRenderResourceWatchdog, observeOwnedRenderResources, ProcessMediaWorkerTransport, NodeMediaArtifactStore } from "../dist/index.js";

const limits = { rendererRssLimitBytes: 512 * 1024 ** 2, ownedFileLimitBytes: 2 * 1024 ** 3 };
const python = process.env.CEVRA_TEST_PYTHON || "python3";
const workerScript = fileURLToPath(new URL("./fixtures/resource_worker.py", import.meta.url));
async function directory(t) { const root = await realpath(await mkdtemp(join(tmpdir(), "cevra-owned-budget-"))); t.after(() => rm(root, { force: true, recursive: true })); return root; }
function transport(t) {
  const worker = new ProcessMediaWorkerTransport({ mode: "development", pythonExecutable: python, workerScript, shutdownTimeoutMs: 3000, controlTimeoutMs: 2000, renderLivenessIntervalMs: 100 });
  t.after(() => worker.stop()); return worker;
}
test("preview cache marker is issued only by a live captured lease and caller input cannot enable it", async t => {
  const root = await directory(t), worker = transport(t);
  assert.equal((await worker.request("fixture/cache-marker", { ownedPreviewCache: true })).ownedPreviewCache, false);
  const observe = async () => ({ rendererRssBytes: 32 * 1024 ** 2 + 100, ownedLogicalBytes: 1, ownedAllocatedBytes: 1, processIds: [worker.workerPid] });
  const guarded = await worker.withOwnedRenderBudget({ ...limits, ownedDirectory: root, observe },
    () => worker.request("fixture/cache-marker", { ownedPreviewCache: false }));
  assert.equal(guarded.result.ownedPreviewCache, true);
  assert.equal(guarded.resourceEvidence.memoryBudgetBytes, 512 * 1024 ** 2);
  assert.equal((await worker.request("fixture/cache-marker", { ownedPreviewCache: true })).ownedPreviewCache, false);
});
async function waitFile(path) { const deadline = Date.now() + 5000; while (true) { try { return await readFile(path, "utf8"); } catch { if (Date.now() > deadline) throw Error("Owned fixture did not become ready."); await new Promise(resolve => setTimeout(resolve, 20)); } } }
async function waitDead(pid) { const deadline = Date.now() + 3000; while (true) { try { process.kill(pid, 0); } catch { return; } if (Date.now() > deadline) throw Error("Owned fixture did not retire."); await new Promise(resolve => setTimeout(resolve, 20)); } }

test("full production segment objects share the native 512 MiB RSS scope and byte/entry eviction bounds", { skip: process.platform === "win32" }, async t => {
  const root = await directory(t), worker = transport(t);
  const guarded = await worker.withOwnedRenderBudget({ ...limits, ownedDirectory: root },
    () => worker.request("fixture/cache-pressure", { root }));
  const { full, evicted, entryPressure } = guarded.result;
  assert.equal(guarded.result.admittedMedia, false);
  assert.equal(full.entries, 4); assert.equal(full.pendingEntries, 0);
  assert.ok(full.retainedBytes > 31 * 1024 ** 2 && full.retainedBytes <= 32 * 1024 ** 2);
  assert.equal(evicted.entries, 4); assert.equal(evicted.evictions, 4);
  assert.ok(evicted.retainedBytes <= 32 * 1024 ** 2);
  assert.equal(entryPressure.entries, 64); assert.equal(entryPressure.evictions, 5);
  assert.equal(guarded.resourceEvidence.memoryBudgetBytes, limits.rendererRssLimitBytes);
  assert.ok(guarded.resourceEvidence.peakRendererRssBytes >= full.retainedBytes);
  assert.ok(guarded.resourceEvidence.peakRendererRssBytes <= limits.rendererRssLimitBytes);
  t.diagnostic(JSON.stringify({ scope: "synthetic byte pressure with production cache objects; not decoded media", full, evicted, entryPressure, resourceEvidence: guarded.resourceEvidence }));
});

test("watchdog observes aggregate RSS, fails closed on observation loss and binds one directory identity", async t => {
  const root = await directory(t); const failures = [];
  const observation = { rendererRssBytes: limits.rendererRssLimitBytes + 1, ownedLogicalBytes: 0, ownedAllocatedBytes: 0, processIds: [1, 2] };
  const excessive = new OwnedRenderResourceWatchdog({ ...limits, ownedDirectory: root, processGroupId: 1, observe: async () => observation, onFailure: error => failures.push(error.code) });
  await assert.rejects(excessive.start(), { code: "MEDIA_RENDER_MEMORY_LIMIT" }); assert.deepEqual(failures, ["MEDIA_RENDER_MEMORY_LIMIT"]);
  const lost = new OwnedRenderResourceWatchdog({ ...limits, ownedDirectory: root, processGroupId: 1, observe: async () => { throw Error("Denied observer"); }, onFailure: error => failures.push(error.code) });
  await assert.rejects(lost.start(), { code: "MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED" });
  const switched = new OwnedRenderResourceWatchdog({ ...limits, ownedDirectory: root, processGroupId: 1, observe: async () => { await rename(root, `${root}-old`); await mkdir(root); return { ...observation, rendererRssBytes: 1 }; }, onFailure() {} });
  t.after(() => rm(`${root}-old`, { force: true, recursive: true }));
  await assert.rejects(switched.start(), { code: "MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED" });
});

test("transport budget rejection retires only its worker and preserves originals and prior outputs", async t => {
  const root = await directory(t), job = join(root, "job"); await mkdir(job);
  await writeFile(join(root, "original.mp4"), "preserved original"); await writeFile(join(root, "prior.mp4"), "preserved prior");
  const worker = transport(t);
  await assert.rejects(worker.withOwnedRenderBudget({ ...limits, ownedDirectory: job, observe: async () => ({ rendererRssBytes: 1, ownedLogicalBytes: limits.ownedFileLimitBytes + 1, ownedAllocatedBytes: 1, processIds: [] }) }, async () => { throw Error("Must not start render"); }), { code: "MEDIA_RENDER_DISK_LIMIT" });
  await worker.settle(); assert.equal(worker.workerPid, undefined);
  assert.equal(await readFile(join(root, "original.mp4"), "utf8"), "preserved original"); assert.equal(await readFile(join(root, "prior.mp4"), "utf8"), "preserved prior");
});

test("sample evidence records observed excess and actual timing, including failure", async t => {
  const root = await directory(t); let calls = 0, terminal;
  const guard = new OwnedRenderResourceWatchdog({ ...limits, ownedDirectory: root, processGroupId: 1,
    observe: async () => { await new Promise(resolve => setTimeout(resolve, 25)); return { rendererRssBytes: ++calls === 1 ? 1 : limits.rendererRssLimitBytes + 4096, ownedLogicalBytes: 0, ownedAllocatedBytes: 0, processIds: [1] }; },
    onFailure: error => { terminal = error; } });
  await guard.start(); const first = guard.evidenceSnapshot;
  await assert.rejects(guard.check(), error => error === terminal && error.code === "MEDIA_RENDER_MEMORY_LIMIT");
  await assert.rejects(guard.stop(), error => error === terminal);
  assert.equal(first.samples, 1); assert.equal(terminal.resourceEvidence.samples, 2);
  assert.equal(terminal.resourceEvidence.observedRssOvershootBytes, 4096);
  assert.equal(terminal.resourceEvidence.memoryBudgetBytes, limits.rendererRssLimitBytes);
  assert.ok(terminal.resourceEvidence.maxObservationDurationMs >= 20);
  assert.ok(terminal.resourceEvidence.maxCompletedSampleIntervalMs >= 20);
  assert.ok(Object.isFrozen(first)); assert.ok(Object.isFrozen(terminal.resourceEvidence));
});

test("closed logical budget RPC error retires the scope and a later request starts a fresh worker", async t => {
  const root = await directory(t), worker = transport(t); let failedPid;
  const observe = async () => ({ rendererRssBytes: 100, ownedLogicalBytes: 1, ownedAllocatedBytes: 1, processIds: [worker.workerPid] });
  await assert.rejects(worker.withOwnedRenderBudget({ ...limits, ownedDirectory: root, observe }, async () => {
    failedPid = worker.workerPid;
    await worker.request("tools/call", { jobId: "logical-budget", root, mode: "logical-budget-error" });
  }), { code: "MEDIA_RENDER_DISK_LIMIT" });
  assert.equal(worker.workerPid, undefined); await waitDead(failedPid);
  const result = await worker.withOwnedRenderBudget({ ...limits, ownedDirectory: root, observe }, async () => {
    assert.notEqual(worker.workerPid, failedPid); return worker.request("ping");
  });
  assert.equal(result.result.activeJobId, null);
  await assert.rejects(worker.request("tools/call", { jobId: "wrong-code", root, mode: "logical-budget-error", errorCode: -32000 }), { code: -32000 });
});

test("one trusted budget scope spans preparation/result verification and rejects overlap", async t => {
  const root = await directory(t), worker = transport(t); let release, started;
  const gate = new Promise(resolve => { release = resolve; }), begin = new Promise(resolve => { started = resolve; });
  const observe = async () => ({ rendererRssBytes: 100, ownedLogicalBytes: 10, ownedAllocatedBytes: 20, processIds: [worker.workerPid] });
  const pending = worker.withOwnedRenderBudget({ ...limits, ownedDirectory: root, observe }, async () => { started(); await gate; return "verified candidate"; }); await begin;
  await assert.rejects(worker.withOwnedRenderBudget({ ...limits, ownedDirectory: root, observe }, async () => "overlap"), { code: "MEDIA_RENDER_RESOURCE_BUSY" });
  release(); const result = await pending; assert.equal(result.result, "verified candidate"); assert.equal(result.resourceEvidence.enforcement, "sampled-watchdog"); assert.ok(result.resourceEvidence.samples >= 2);
});

test("caller validation failure retires a live request before releasing the resource scope", async t => {
  const root = await directory(t), worker = transport(t), originalError = new Error("Candidate integrity failed"); let pendingRejected, childPid;
  const observe = async () => ({ rendererRssBytes: 100, ownedLogicalBytes: 10, ownedAllocatedBytes: 20, processIds: [worker.workerPid] });
  await assert.rejects(worker.withOwnedRenderBudget({ ...limits, ownedDirectory: root, observe }, async () => {
    const pending = worker.request("tools/call", { jobId: "validation-failure", root, mode: "wait" });
    pendingRejected = assert.rejects(pending, error => error === originalError);
    childPid = Number(await waitFile(join(root, "child-0.pid")));
    throw originalError;
  }), error => error === originalError);
  await pendingRejected; assert.equal(worker.workerPid, undefined); await waitDead(childPid);
});

test("resource-terminal scope prevents replacement generation even when callback retries", async t => {
  const root = await directory(t), worker = transport(t); let excessive = false, capturedPid;
  const observe = async () => ({ rendererRssBytes: excessive ? limits.rendererRssLimitBytes + 1 : 100, ownedLogicalBytes: 1, ownedAllocatedBytes: 1, processIds: [worker.workerPid ?? capturedPid] });
  await assert.rejects(worker.withOwnedRenderBudget({ ...limits, ownedDirectory: root, observe }, async () => {
    capturedPid = worker.workerPid;
    const pending = worker.request("tools/call", { jobId: "retry-after-limit", root, mode: "wait" });
    const rejected = assert.rejects(pending, { code: "MEDIA_RENDER_MEMORY_LIMIT" });
    await waitFile(join(root, "child-0.pid")); excessive = true; await rejected;
    await assert.rejects(worker.request("ping"), { code: "MEDIA_RENDER_MEMORY_LIMIT" });
    assert.ok(worker.workerPid === undefined || worker.workerPid === capturedPid);
    return "forbidden late success";
  }), { code: "MEDIA_RENDER_MEMORY_LIMIT" });
  assert.equal(worker.workerPid, undefined);
});

test("normally returning callback cannot certify a generation that died or an empty group", async t => {
  const root = await directory(t), worker = transport(t);
  const observe = async () => ({ rendererRssBytes: 100, ownedLogicalBytes: 1, ownedAllocatedBytes: 1, processIds: worker.workerPid ? [worker.workerPid] : [] });
  await assert.rejects(worker.withOwnedRenderBudget({ ...limits, ownedDirectory: root, observe }, async () => { await worker.stop(); return "false healthy result"; }));
  let called = false;
  await assert.rejects(worker.withOwnedRenderBudget({ ...limits, ownedDirectory: root, observe: async () => ({ rendererRssBytes: 0, ownedLogicalBytes: 0, ownedAllocatedBytes: 0, processIds: [] }) }, async () => { called = true; }), { code: "MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED" });
  assert.equal(called, false); assert.equal(worker.workerPid, undefined);
});

test("request racing owned stop cannot restart a generation after its admission wait", async t => {
  const root = await directory(t), worker = transport(t); let capturedPid;
  const observe = async () => ({ rendererRssBytes: 100, ownedLogicalBytes: 1, ownedAllocatedBytes: 1, processIds: worker.workerPid ? [worker.workerPid] : [] });
  await assert.rejects(worker.withOwnedRenderBudget({ ...limits, ownedDirectory: root, observe }, async () => {
    capturedPid = worker.workerPid;
    const stopping = worker.stop();
    const rejected = assert.rejects(worker.request("ping"));
    await Promise.all([stopping, rejected]);
    assert.equal(worker.workerPid, undefined);
    return "forbidden replacement";
  }));
  await waitDead(capturedPid); assert.equal(worker.workerPid, undefined);
});

test("native aggregate guard catches two individually sub-limit descendants exceeding 512 MiB", { skip: process.platform === "win32" }, async t => {
  const root = await directory(t), worker = transport(t); const ownedPids = [], observations = []; let terminal;
  await assert.rejects(worker.withOwnedRenderBudget({ ...limits, ownedDirectory: root, observe: async (...args) => { const sample = await observeOwnedRenderResources(...args); observations.push(sample); return sample; } }, async () => {
    const pending = worker.request("tools/call", { jobId: "joint-memory", root });
    const rejected = assert.rejects(pending, { code: "MEDIA_RENDER_MEMORY_LIMIT" });
    for (let i = 0; i < 2; ++i) ownedPids.push(Number(await waitFile(join(root, `child-${i}.pid`))));
    await rejected;
  }), error => { terminal = error; return error.code === "MEDIA_RENDER_MEMORY_LIMIT"; });
  const witness = observations.find(sample => sample.rendererRssBytes > limits.rendererRssLimitBytes);
  assert.ok(witness); assert.ok(witness.processRssBytes.every(process => process.rssBytes < limits.rendererRssLimitBytes));
  assert.ok(terminal.resourceEvidence.observedRssOvershootBytes > 0);
  t.diagnostic(JSON.stringify({ observedAggregateRssBytes: witness.rendererRssBytes, largestObservedMemberRssBytes: Math.max(...witness.processRssBytes.map(process => process.rssBytes)), members: witness.processIds.length, configuredLimitBytes: limits.rendererRssLimitBytes, resourceEvidence: terminal.resourceEvidence, instantaneousHardCapProved: false }));
  await worker.settle(); for (const pid of ownedPids) await waitDead(pid);
});

test("native observer sees reparented descendants by owned group and counts copies, sparse staging and hard links", { skip: process.platform === "win32" }, async t => {
  const root = await directory(t); const pidFile = join(root, "orphan.pid");
  const child = spawn(python, ["-I", "-B", workerScript, "orphan-parent", pidFile], { detached: true, stdio: "ignore" });
  const closed = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  let groupOwned = true;
  t.after(() => { if (groupOwned) { try { process.kill(-child.pid, "SIGKILL"); } catch {} } });
  const orphan = Number(await waitFile(pidFile)); await closed;
  await writeFile(join(root, "original-copy.mp4"), Buffer.alloc(1024)); await link(join(root, "original-copy.mp4"), join(root, "second-copy.mp4"));
  const sparse = await open(join(root, "staging.mp4"), "wx"); await sparse.truncate(limits.ownedFileLimitBytes); await sparse.close();
  const sample = await observeOwnedRenderResources(child.pid, root);
  assert.ok(sample.processIds.includes(orphan)); assert.ok(!sample.processIds.includes(child.pid)); assert.ok(sample.rendererRssBytes > 0);
  assert.ok(sample.ownedLogicalBytes >= limits.ownedFileLimitBytes + 2048);
  t.diagnostic(JSON.stringify({ reparentedOwnedMemberObserved: true, ownedLogicalBytes: sample.ownedLogicalBytes, ownedAllocatedBytes: sample.ownedAllocatedBytes, configuredLimitBytes: limits.ownedFileLimitBytes }));
  const guard = new OwnedRenderResourceWatchdog({ ...limits, ownedDirectory: root, processGroupId: child.pid, onFailure() {} });
  await assert.rejects(guard.start(), { code: "MEDIA_RENDER_DISK_LIMIT" });
  await symlink(join(root, "original-copy.mp4"), join(root, "foreign-alias"));
  await assert.rejects(observeOwnedRenderResources(child.pid, root), { code: "MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED" });
  process.kill(-child.pid, "SIGKILL"); groupOwned = false; await waitDead(orphan);
});

test("streamed result integrity remains separate from POSIX publication ownership", async t => {
  const root = await directory(t), candidate = join(root, "candidate.mp4"), replacement = join(root, "replacement.mp4"), store = new NodeMediaArtifactStore();
  const bytes = Buffer.alloc(3 * 1024 ** 2, 7); await writeFile(candidate, bytes);
  const stamp = await store.captureSource(candidate), digest = await store.identifySource(candidate, stamp);
  assert.equal(digest.bytesRead, bytes.length); const evidence = { version: 1, scheme: "posix-dev-inode", device: stamp.device, inode: stamp.inode };
  assert.equal(await store.matchesPublication(candidate, evidence), true);
  await writeFile(replacement, bytes); await rename(replacement, candidate);
  const sameBytes = await store.identifySource(candidate, await store.captureSource(candidate)); assert.equal(sameBytes.content.sha256, digest.content.sha256);
  assert.equal(await store.matchesPublication(candidate, evidence), false); assert.equal(await store.checkSource(candidate, stamp), "changed");
});
