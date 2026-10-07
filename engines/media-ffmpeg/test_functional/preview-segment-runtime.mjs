import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveManualVideoSequence } from "@cevra/application";
import { FfmpegMediaEngine, PersistentMediaWorkerClient, ProcessMediaWorkerTransport } from "../dist/index.js";

// Explicit exact-runtime catalog. All inputs, projects and outputs belong to
// this test. DOM handoff is a separate measurement; no GUI or AI runs here.
const runtime = path.resolve(required("CEVRA_AUDIO_SEQUENCE_RUNTIME_ROOT"));
const python = required("CEVRA_AUDIO_SEQUENCE_PYTHON");
assert.equal(process.env.CEVRA_AUDIO_SEQUENCE_RELEASE, "1");
const root = realpathSync(mkdtempSync(path.join(process.env.CEVRA_PREVIEW_SEGMENT_EVIDENCE_ROOT || tmpdir(), "cevra-preview-segments-")));
const ffmpeg = path.join(runtime, "bin", "ffmpeg");
const ffprobe = path.join(runtime, "bin", "ffprobe");
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sha = (uri) => createHash("sha256").update(readFileSync(uri)).digest("hex");
const controlledEnvironment = { LANG: "C.UTF-8", LC_ALL: "C.UTF-8", PYTHONDONTWRITEBYTECODE: "1" };
const transport = new ProcessMediaWorkerTransport({ mode: "release", pythonExecutable: python,
  workerScript: path.join(runtime, "worker", "cevra_media_worker.py"), controlTimeoutMs: 30000,
  renderTimeoutMs: 240000, renderLivenessIntervalMs: 500,
  env: { ...controlledEnvironment, PATH: path.join(runtime, "bin"), CEVRA_MEDIA_RUNTIME_ROOT: runtime, CEVRA_RELEASE_MODE: "1" } });
const client = new PersistentMediaWorkerClient(transport), engine = new FfmpegMediaEngine(client);
const workerMeasurements = [], hostMeasurements = [], deliveries = [];
let host, serial = 0;
function required(key) { assert.ok(process.env[key], `Missing explicit ${key}`); return process.env[key]; }
function native(args, maxBuffer = 64 * 1024 ** 2) {
  return execFileSync(ffmpeg, ["-v", "error", "-nostdin", "-threads", "2", "-filter_threads", "2", ...args],
    { env: controlledEnvironment, maxBuffer, timeout: 120000 });
}
function probe(uri) {
  return JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_streams", "-of", "json", uri],
    { env: controlledEnvironment, encoding: "utf8", maxBuffer: 4 * 1024 ** 2, timeout: 30000 }));
}
function decoded(uri, frames) {
  const streams = probe(uri).streams, v = streams.find(s => s.codec_type === "video"), a = streams.find(s => s.codec_type === "audio");
  assert.equal(v.nb_read_frames, String(frames)); assert.equal(v.avg_frame_rate, "30/1");
  assert.equal(v.width, 720); assert.equal(v.height, 404); assert.equal(a.sample_rate, "48000"); assert.equal(a.channels, 2);
  const pictures = native(["-i", uri, "-map", "0:v:0", "-an", "-fps_mode", "passthrough", "-f", "framemd5", "pipe:1"]).toString()
    .split("\n").filter(line => line && !line.startsWith("#")).map(line => line.split(",").at(-1).trim());
  assert.equal(pictures.length, frames);
  const pcm = native(["-i", uri, "-map", "0:a:0", "-vn", "-c:a", "pcm_f32le", "-f", "f32le", "pipe:1"]);
  assert.equal(pcm.length, frames * 1600 * 2 * 4, "Actual decoded PCM must end at the exact edited endpoint.");
  return { pictures, pcmSha256: createHash("sha256").update(pcm).digest("hex"), decodedSamplesPerChannel: frames * 1600 };
}
function inputs() {
  return ["A", "B"].map((name, index) => {
    const uri = path.join(root, `source-${name}.mov`), override = process.env[`CEVRA_PREVIEW_SEGMENT_FIXTURE_${name}`];
    if (override) copyFileSync(override, uri);
    else native(["-y", "-f", "lavfi", "-i", `testsrc2=s=720x404:r=${index ? "30000/1001" : "24"}:d=${index ? 6 : 8}`,
      "-f", "lavfi", "-i", `aevalsrc=0.03*sin(2*PI*${index ? 660 : 440}*t)|0.02*sin(2*PI*880*t):s=44100:d=${index ? 6 : 8}`,
      "-map", "0:v:0", "-map", "1:a:0", "-c:v", "mpeg4", "-q:v", "4", "-bf", "2", "-c:a", "pcm_s16le", uri]);
    return { uri, sha256: sha(uri), sizeBytes: statSync(uri).size };
  });
}
const sources = inputs();
const items = sources.flatMap(source => Array.from({ length: 6 }, (_, i) => ({
  inputUri: source.uri, sourceContent: { sha256: source.sha256, sizeBytes: source.sizeBytes },
  sourceStartFrame: i * 3, sourceEndFrame: i * 3 + 150, audioSelection: "single-source-stream"
})));
const reversed = [...items].reverse();
const trimmed = reversed.map((item, i) => i ? item : { ...item, sourceStartFrame: item.sourceStartFrame + 1 });
const cases = [{ name: "cold", items, hits: 0, misses: 12 }, { name: "warm", items, hits: 12, misses: 0 },
  { name: "reorder", items: reversed, hits: 12, misses: 0 }, { name: "trim", items: trimmed, hits: 11, misses: 1 },
  { name: "removal", items: trimmed.slice(0, -2), hits: 10, misses: 0 }];
async function cacheState() {
  const state = await transport.request("cevra/preview-cache-state");
  assert.equal(state.pendingEntries, 0); assert.ok(state.retainedBytes <= 32 * 1024 ** 2); assert.ok(state.entries <= 64);
  return state;
}
async function render(name, sequence, signal) {
  const owned = mkdtempSync(path.join(root, "job-")); chmodSync(owned, 0o700);
  const output = path.join(root, `${name}.mp4`), before = await cacheState(), started = performance.now();
  const result = await transport.withOwnedRenderBudget({ ownedDirectory: owned,
    rendererRssLimitBytes: 512 * 1024 ** 2, ownedFileLimitBytes: 2 * 1024 ** 3 },
    () => engine.execute({ type: "render-manual-video-preview", version: 2, items: sequence,
      outputUri: output, ownedWorkspaceUri: owned }, { jobId: name, locale: "en-US", signal }));
  const wallMs = performance.now() - started, after = await cacheState();
  assert.equal(result.result.type, "file"); assert.equal(result.result.manualSequence.profile, "manual-cfr30-preview-v1");
  assert.equal(result.result.manualSequence.outputSha256, sha(output));
  assert.equal(result.resourceEvidence.memoryBudgetBytes, 512 * 1024 ** 2);
  assert.equal(result.result.manualSequence.logicalBudget.budgetBytes, 2 * 1024 ** 3);
  assert.deepEqual(readdirSync(owned), ["published-account.mp4"]);
  return { name, output, wallMs, frames: sequence.reduce((sum, item) => sum + item.sourceEndFrame - item.sourceStartFrame, 0),
    hits: after.hits - before.hits, misses: after.misses - before.misses, state: after,
    resources: result.resourceEvidence, logicalBudget: result.result.manualSequence.logicalBudget };
}
function startHost(store) {
  const child = spawn(process.execPath, [path.join(repository, "apps/desktop-host/dist/desktop-host.cjs")],
    { env: { ...controlledEnvironment, CEVRA_PROJECT_PERSISTENCE_ROOT: store,
      CEVRA_MEDIA_RUNTIME_ROOT: runtime, CEVRA_MEDIA_RUNTIME_MODE: "release" }, stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map(); let buffer = "", stderr = "", closed = false;
  const completion = new Promise(resolve => child.once("close", (code, signal) => {
    closed = true; for (const p of pending.values()) p.reject(Error(`Owned Host exited (${code ?? signal}): ${stderr}`));
    pending.clear(); resolve({ code, signal });
  }));
  child.on("error", error => { for (const p of pending.values()) p.reject(error); });
  child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-8192); });
  child.stdout.on("data", chunk => {
    buffer += chunk.toString("utf8");
    if (buffer.length > 32 * 1024 ** 2) { for (const p of pending.values()) p.reject(Error("Owned Host response exceeded bound")); return; }
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      try {
        const response = JSON.parse(line), p = pending.get(response.id);
        assert.ok(p); assert.equal(response.protocolVersion, 1); pending.delete(response.id);
        if (response.error) p.reject(Object.assign(Error(response.error.code), { code: response.error.code }));
        else p.resolve(response.result);
      } catch (error) { for (const p of pending.values()) p.reject(error); }
    }
  });
  return {
    async call(method, params = {}) {
      const id = `segment-catalog-${++serial}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(Error(`Owned ${method} timed out`)); }, 240000);
        pending.set(id, { resolve(value) { clearTimeout(timer); resolve(value); }, reject(error) { clearTimeout(timer); reject(error); } });
        child.stdin.write(JSON.stringify({ protocolVersion: 1, id, method, params }) + "\n");
      });
    },
    async stop(normal = false) {
      if (normal) {
        const attemptId = `owned-close-${serial}`;
        await this.call("host.prepareClose", { attemptId }); await this.call("host.shutdown", { attemptId });
      } else if (!closed) child.kill("SIGTERM");
      let timer;
      await Promise.race([completion, new Promise(resolve => { timer = setTimeout(resolve, 12000); })]); clearTimeout(timer);
      if (!closed) { child.kill("SIGKILL"); await completion; }
      if (normal) assert.deepEqual(await completion, { code: 0, signal: null });
    }
  };
}
try {
  assert.equal((await client.health()).ok, true);
  for (const c of cases) {
    const result = await render(`worker-${c.name}`, c.items);
    assert.equal(result.hits, c.hits, c.name); assert.equal(result.misses, c.misses, c.name);
    workerMeasurements.push(result);
  }
  // All cached outputs are independently decoded after timings. Baselines
  // release the worker cache through a normal unguarded health control.
  for (const [i, c] of cases.entries()) {
    await client.health(); assert.equal((await cacheState()).entries, 0);
    const reference = await render(`reference-${c.name}`, c.items);
    assert.equal(reference.hits, 0); assert.equal(reference.misses, new Set(c.items.map(item => JSON.stringify(item))).size);
    const actual = decoded(workerMeasurements[i].output, reference.frames), expected = decoded(reference.output, reference.frames);
    assert.deepEqual(actual, expected, `${c.name}: all decoded pictures and PCM must match uncached original-derived output`);
    workerMeasurements[i].referenceWallMs = reference.wallMs;
    workerMeasurements[i].decodedSamplesPerChannel = actual.decodedSamplesPerChannel;
    workerMeasurements[i].allDecodedPicturesAndPcmMatch = true;
  }
  await transport.stop();
  assert.equal((await cacheState()).entries, 0, "A fresh worker generation cannot inherit retained segments.");
  const cancellation = new AbortController();
  const pending = render("cancel-inflight", items, cancellation.signal);
  const rejected = assert.rejects(pending);
  let observedLiveJob = false;
  const cancellationDeadline = Date.now() + 5000;
  while (Date.now() < cancellationDeadline) {
    if ((await transport.request("ping")).activeJobId === "cancel-inflight") { observedLiveJob = true; break; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  cancellation.abort(); await rejected; await transport.settle();
  assert.equal(observedLiveJob, true, "Cancellation must target a confirmed live render job.");
  assert.equal((await cacheState()).entries, 0, "A cancelled render cannot promote or preserve segment retention.");
  await transport.stop();
  const store = mkdtempSync(path.join(root, "owned-project-")); chmodSync(store, 0o700);
  host = startHost(store); await host.call("host.hello");
  let state = await host.call("project.snapshot");
  assert.equal(state.capabilities.manualExport.available, true);
  const sourceIds = [];
  for (const [i, source] of sources.entries()) {
    const result = await host.call("media.ingestLocal", { uri: source.uri, displayName: `Synthetic source ${i}`, operationId: `ingest-${i}`, locale: "en-US" });
    sourceIds.push(result.importedSourceId); state = result.state;
  }
  async function edit(delta) {
    state = (await host.call("video.editManualSequence", { version: 2,
      expectedSnapshotId: state.project.history.headSnapshotId, ...delta })).state;
  }
  function sequenceFor() { return resolveManualVideoSequence(state.project, state.project.history.headSnapshotId); }
  for (const item of items) await edit({ type: "append", sourceId: sourceIds[sources.findIndex(s => s.uri === item.inputUri)],
    sourceStartFrame: item.sourceStartFrame, sourceEndFrame: item.sourceEndFrame });
  async function delivered(name, referenceIndex) {
    const expectedSnapshotId = state.project.history.headSnapshotId, sequence = sequenceFor();
    const started = performance.now();
    const packet = await host.call("video.previewLocal", { sourceId: sequence[0].sourceId,
      expectedSnapshotId, operationId: `host-${name}`, sequence: true });
    const wallMs = performance.now() - started;
    assert.equal(packet.snapshotId, expectedSnapshotId); assert.deepEqual(packet.sequence.clipIds, sequence.map(c => c.id));
    assert.equal(packet.initialFrame.sourceTimeMs, 0);
    const output = path.join(root, `host-${name}.mp4`), video = Buffer.from(packet.base64, "base64"), png = Buffer.from(packet.initialFrame.base64, "base64");
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.ok(video.length <= 8 * 1024 ** 2); assert.ok(png.length <= 2 * 1024 ** 2); writeFileSync(output, video);
    const frames = packet.sequence.totalFrames;
    assert.deepEqual(decoded(output, frames), decoded(workerMeasurements[referenceIndex].output, frames));
    hostMeasurements.push({ name, wallMs, frames, videoBytes: video.length, pngBytes: png.length,
      includes: name === "warm-whole-program"
        ? "fresh source verification, existing admitted whole-program Host RAM cache, base64 and child stdout JSON parsing; no segment render"
        : "source verification, guarded worker render, guarded first PNG, Host cleanup/base64 and child stdout JSON parsing",
      allDecodedPicturesAndPcmMatch: true });
    deliveries.push({ name, packet, project: state.project, hostWallMs: wallMs });
  }
  await delivered("cold", 0); await delivered("warm-whole-program", 1);
  await edit({ type: "reorder", clipIds: sequenceFor().map(c => c.id).reverse() });
  await delivered("reorder", 2);
  const first = sequenceFor()[0];
  await edit({ type: "trim", clipId: first.id, sourceStartFrame: first.frameTiming.sourceStartFrame + 1, sourceEndFrame: first.frameTiming.sourceEndFrame });
  await delivered("trim", 3);
  await edit({ type: "remove-many", clipIds: sequenceFor().slice(-2).map(c => c.id) });
  await delivered("removal", 4);
  await host.stop(true); host = undefined;
  for (const source of sources) assert.equal(sha(source.uri), source.sha256);
  const uiDeliveries = process.env.CEVRA_PREVIEW_SEGMENT_UI_RECEIPT_OUTPUT || path.join(root, "ui-deliveries.json");
  writeFileSync(uiDeliveries, JSON.stringify(deliveries));
  const receipt = { status: "PASS", root, sourceSha256Preserved: true, providerCalls: 0, nativeWindowLaunched: false,
    workerMeasurements, hostMeasurements, uiDeliveries, liveJobCancellationClearedCache: true, workerRestartClearedCache: true,
    runtimeManifestSha256: sha(path.join(runtime, "manifest.json")),
    limitations: ["RSS/disk observations are sampled, not instantaneous physical caps.", "Host receipt includes IPC delivery, not native decode, WKWebView paint or human perceived latency."] };
  writeFileSync(path.join(root, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  process.stdout.write(JSON.stringify(receipt) + "\n");
} catch (error) {
  writeFileSync(path.join(root, "failure.json"), JSON.stringify({ status: "FAIL", error: error.message, stack: error.stack, workerMeasurements, hostMeasurements }, null, 2));
  throw error;
} finally {
  await host?.stop(); await transport.stop();
}

