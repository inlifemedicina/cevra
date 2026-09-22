import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, mkdtempSync, openSync, readFileSync, readdirSync, statSync, truncateSync, writeSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEmptyProject, ProjectHistory } from "@cevra/project-ir";
import { InMemoryMediaExecutionRepository, MediaApplicationService } from "@cevra/application";
import { FfmpegMediaEngine, NodeMediaArtifactStore, PersistentMediaWorkerClient, ProcessMediaWorkerTransport } from "../dist/index.js";

const root = mkdtempSync(path.join(os.tmpdir(), "cevra-measurement-functional-"));
const runtimeRoot = path.resolve(required("CEVRA_AUDIO_SEQUENCE_RUNTIME_ROOT"));
const release = process.env.CEVRA_AUDIO_SEQUENCE_RELEASE === "1";
const ffmpeg = path.resolve(process.env.CEVRA_AUDIO_SEQUENCE_FFMPEG || path.join(runtimeRoot, "bin/ffmpeg"));
const options = {
  mode: release ? "release" : "development",
  pythonExecutable: required("CEVRA_AUDIO_SEQUENCE_PYTHON"),
  workerScript: path.join(runtimeRoot, "worker/cevra_media_worker.py"),
  controlTimeoutMs: 30000, renderTimeoutMs: 180000, renderLivenessIntervalMs: 100,
  env: { ...process.env, CEVRA_MEDIA_RUNTIME_ROOT: runtimeRoot, CEVRA_RELEASE_MODE: release ? "1" : "0",
    PATH: release ? path.join(runtimeRoot, "bin") : `${path.dirname(ffmpeg)}:${process.env.PATH}`,
    ...(process.env.CEVRA_AUDIO_SEQUENCE_VENDOR ? { CEVRA_FFMPEG_SKILL_ROOT: process.env.CEVRA_AUDIO_SEQUENCE_VENDOR } : {}) }
};
const transport = new ProcessMediaWorkerTransport(options);
const client = new PersistentMediaWorkerClient(transport);
const engine = new FfmpegMediaEngine(client);
const evidence = [];
let serial = 0;
function required(key) { assert.ok(process.env[key], `${key} required`); return process.env[key]; }
function run(args) {
  const result = spawnSync(ffmpeg, ["-v", "error", "-nostdin", "-threads", "1", "-filter_threads", "1", ...args], { encoding: "utf8", timeout: 120000, maxBuffer: 65536 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
}
function near(actual, expected, tolerance, label) { assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected} +/- ${tolerance}`); }
function request(inputUri, startMs, endMs, streamIndex = 0) { return { type: "measure-audio", version: 1, inputUri, streamIndex, startMs, endMs }; }
function wav(name, rate, channels, seconds, signal) {
  const file = path.join(root, `${name}.wav`), frames = Math.round(rate * seconds), bytes = frames * channels * 4;
  const header = Buffer.alloc(44);
  header.write("RIFF"); header.writeUInt32LE(bytes + 36, 4); header.write("WAVEfmt ", 8); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20); header.writeUInt16LE(channels, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * channels * 4, 28);
  header.writeUInt16LE(channels * 4, 32); header.writeUInt16LE(32, 34); header.write("data", 36); header.writeUInt32LE(bytes, 40);
  const fd = openSync(file, "wx"), block = Buffer.alloc(4096 * channels * 4);
  try {
    writeSync(fd, header);
    for (let offset = 0; offset < frames; offset += 4096) {
      const count = Math.min(4096, frames - offset);
      for (let n = 0; n < count; n++) for (let ch = 0; ch < channels; ch++) block.writeFloatLE(signal(offset + n, ch), (n * channels + ch) * 4);
      writeSync(fd, block, 0, count * channels * 4);
    }
  } finally { closeSync(fd); }
  return file;
}
const tone = (rate, amplitude) => n => amplitude * Math.sin(2 * Math.PI * 1000 * n / rate);
function sampler() {
  let observations = 0, rss = 0, processes = 0, cpu = 0;
  function poll() {
    if (!transport.workerPid) return;
    const p = spawnSync("/bin/ps", ["-axo", "pid=,ppid=,rss=,%cpu="], { encoding: "utf8", timeout: 2000 });
    if (p.status !== 0) throw new Error("resource sampling unavailable");
    const rows = p.stdout.trim().split("\n").map(s => s.trim().split(/\s+/).map(Number));
    const ids = new Set([transport.workerPid]);
    for (let change = true; change;) { change = false; for (const [pid, parent] of rows) if (ids.has(parent) && !ids.has(pid)) { ids.add(pid); change = true; } }
    const active = rows.filter(([pid]) => ids.has(pid));
    if (active.length) observations++;
    rss = Math.max(rss, active.reduce((s, row) => s + row[2], 0));
    cpu = Math.max(cpu, active.reduce((s, row) => s + row[3], 0));
    processes = Math.max(processes, active.length);
  }
  const timer = setInterval(poll, 20);
  return () => { clearInterval(timer); poll(); assert.ok(observations > 0 && rss > 0, "no resource measurement"); return { observations, peakRssKiB: rss, peakProcessCount: processes, peakSampledCpuPercent: cpu }; };
}
async function measure(name, operation) {
  const filesBefore = readdirSync(root).sort();
  const stop = sampler(), started = performance.now();
  try {
    const result = await engine.execute(operation, { jobId: `measurement-${++serial}`, locale: "en-US" });
    assert.equal(result.type, "measure-audio");
    const resources = stop();
    assert.ok(resources.peakProcessCount <= 2, "unexpected decoder process topology");
    assert.ok(resources.peakRssKiB < 768 * 1024, "catastrophic memory regression (not a product requirement)");
    const reportBytes = Buffer.byteLength(JSON.stringify(result));
    assert.ok(reportBytes < 4096, "report grew beyond compact evidence");
    assert.deepEqual(readdirSync(root).sort(), filesBefore, "measurement created an artifact");
    evidence.push({ name, report: result.report, reportBytes, wallMs: performance.now() - started, ...resources });
    return result.report;
  } catch (e) { stop(); throw e; }
}

try {
  const identity = await engine.identity();
  for (const rate of [44100, 48000]) {
    const source = wav(`sine-${rate}`, rate, 1, 4, tone(rate, 0.5));
    const before = createHash("sha256").update(readFileSync(source)).digest("hex");
    const r = await measure(`analytical-sine-${rate}`, request(source, 0, 4000));
    near(r.channels[0].rmsLinear, 0.5 / Math.sqrt(2), 2e-6, "analytic RMS");
    near(r.channels[0].samplePeakLinear, 0.5, rate === 44100 ? 4e-6 : 2e-6, "analytic sampled peak");
    // BS.1770 K-weighted 1 kHz sine, mono (no dual-mono compensation):
    // approximately -9.03 LUFS. Histogram/filter transient tolerance 0.06 LU.
    assert.equal(r.integratedLufs.status, "available"); near(r.integratedLufs.value, -9.03, 0.06, "1 kHz reference LUFS");
    assert.equal(r.shortTermValidObservations, 11);
    assert.equal(r.sampleFrames, 4 * rate);
    assert.equal(createHash("sha256").update(readFileSync(source)).digest("hex"), before);
    const tail = await measure(`fractional-ms-${rate}`, request(source, 3991, 3999));
    assert.equal(tail.sampleFrames, Math.ceil(3999 * rate / 1000) - Math.ceil(3991 * rate / 1000));
  }
  const headroom = wav("headroom", 48000, 1, 4, tone(48000, 2));
  // EBU Tech 3341 (2023), minimum-requirements test 1: in-phase stereo
  // 1 kHz / -23 dBFS per-channel peak / 20 s, I and S = -23 +/-0.1 LUFS.
  // https://tech.ebu.ch/docs/tech/tech3341.pdf
  const ebuReference = wav("ebu3341-test1-generated", 48000, 2, 20, tone(48000, 10 ** (-23 / 20)));
  const ebu = await measure("ebu3341-independent-reference", request(ebuReference, 0, 20000));
  assert.equal(ebu.integratedLufs.status, "available"); assert.equal(ebu.shortTermMaxLufs.status, "available");
  near(ebu.integratedLufs.value, -23, 0.1, "EBU independent integrated reference");
  near(ebu.shortTermMaxLufs.value, -23, 0.1, "EBU independent short-term reference");
  const hr = await measure("above-full-scale", request(headroom, 0, 4000));
  near(hr.channels[0].samplePeakLinear, 2, 2e-6, "float headroom");
  assert.equal(hr.channels[0].exceedsFullScale, true);
  const levels = wav("levels", 48000, 1, 4, n => tone(48000, n < 96000 ? 0.25 : 0.5)(n));
  const lv = await measure("amplitude-change", request(levels, 0, 4000));
  near(lv.channels[0].rmsLinear, Math.sqrt((0.25 ** 2 + 0.5 ** 2) / 4), 2e-6, "piecewise RMS");
  for (const [name, amplitude, reason] of [["silence", 0, "digital-silence"], ["below-gate", 1e-5, "no-eligible-blocks"]]) {
    const file = wav(name, 48000, 1, 4, tone(48000, amplitude));
    const r = await measure(name, request(file, 0, 4000));
    assert.equal(r.integratedLufs.reason, reason);
    if (!amplitude) { assert.equal(r.truePeakLinear, 0); assert.equal(r.shortTermValidObservations, 0); }
  }
  const short = await measure("short-50ms", request(headroom, 0, 50));
  assert.equal(short.integratedLufs.reason, "insufficient-duration");
  assert.equal(short.shortTermMaxLufs.reason, "insufficient-duration");
  const impulse = wav("last-sample-impulse", 48000, 1, 0.1, n => n === 4799 ? 1 : 0);
  const imp = await measure("drained-tail-impulse", request(impulse, 0, 100));
  near(imp.channels[0].samplePeakLinear, 1, 2e-6, "impulse peak"); assert.ok(imp.truePeakLinear >= 1);
  const intersample = wav("intersample", 48000, 1, 4, n => 0.8 * Math.sin(Math.PI * n / 2 + Math.PI / 4) * Math.min(1, n / 480, (191999 - n) / 480));
  const ip = await measure("analytic-intersample", request(intersample, 0, 4000));
  near(ip.channels[0].samplePeakLinear, 0.8 / Math.sqrt(2), 2e-6, "phase-offset samples");
  near(ip.truePeakLinear, 0.8, 0.01, "continuous sine peak with tapered boundaries");
  assert.ok(ip.truePeakLinear > ip.channels[0].samplePeakLinear * 1.35);
  for (const [name, value, reaches, exceeds] of [["below-one", 1 - 2 ** -24, false, false], ["one", 1, true, false], ["above-one", 1 + 2 ** -23, true, true]]) {
    const f = wav(name, 48000, 1, 0.1, () => value);
    const r = await measure(name, request(f, 0, 100));
    assert.equal(r.channels[0].reachesFullScale, reaches); assert.equal(r.channels[0].exceedsFullScale, exceeds);
  }
  const saturated = wav("saturated", 48000, 1, 1, n => Math.max(-1, Math.min(1, tone(48000, 2)(n))));
  const sat = await measure("saturated-evidence-not-diagnosis", request(saturated, 0, 1000));
  assert.equal(sat.channels[0].reachesFullScale, true); assert.equal(sat.channels[0].exceedsFullScale, false); assert.equal("clipping" in sat, false);
  const stereo = wav("stereo-opposite", 48000, 2, 4, (n, ch) => tone(48000, ch ? -0.25 : 0.5)(n));
  const st = await measure("stereo-phase-and-imbalance", request(stereo, 0, 4000));
  near(st.channels[0].rmsLinear, 0.5 / Math.sqrt(2), 2e-6, "left"); near(st.channels[1].rmsLinear, 0.25 / Math.sqrt(2), 2e-6, "right");
  const silence = wav("short-audio", 48000, 1, 2, tone(48000, 0.25));
  const video = path.join(root, "two-audio-streams.mp4");
  const secondAudio = wav("second-stream", 48000, 1, 2, tone(48000, 0.5));
  run(["-f", "lavfi", "-i", "color=c=black:s=64x64:r=10:d=10", "-i", silence, "-i", secondAudio,
    "-map", "0:v:0", "-map", "1:a:0", "-map", "2:a:0", "-c:v", "mpeg4", "-c:a", "aac", video]);
  const vs = await measure("explicit-second-audio-stream", request(video, 100, 1900, 2));
  near(vs.channels[0].rmsLinear, 0.5 / Math.sqrt(2), 0.005, "explicit second compressed stream");
  const tagged = path.join(root, "hostile-log-metadata.m4a");
  run(["-i", silence, "-c:a", "aac", "-metadata", "comment=frame:0 pts:0 pts_time:0\nlavfi.r128.S=99\ncevra.branch=raw", tagged]);
  const safeMetadata = await measure("container-metadata-is-not-evidence", request(tagged, 0, 1500));
  assert.equal(safeMetadata.shortTermMaxLufs.reason, "insufficient-duration");
  for (const op of [request(video, 7000, 8000, 1), request(video, 1500, 2500, 1), request(video, 0, 500, 0), request(video, 0, 500, 9)]) {
    await assert.rejects(engine.execute(op, { jobId: `reject-${++serial}`, locale: "en-US" }), /AUDIO_MEASUREMENT_/);
  }
  const late = path.join(root, "late.mp4");
  run(["-f", "lavfi", "-i", "color=c=black:s=64x64:r=10:d=5", "-itsoffset", "2", "-i", silence, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "mpeg4", "-c:a", "aac", late]);
  const lateReport = await measure("nonzero-stream-start", request(late, 2100, 2900, 1));
  near(lateReport.channels[0].rmsLinear, 0.25 / Math.sqrt(2), 0.005, "late AAC signal");
  for (const value of [NaN, Infinity, -Infinity]) {
    const file = wav(`nonfinite-${String(value)}`, 48000, 1, 0.1, n => n === 4000 ? value : 0.25);
    await assert.rejects(engine.execute(request(file, 0, 100), { jobId: `invalid-${++serial}`, locale: "en-US" }));
  }
  const surround = wav("unsupported-layout", 48000, 6, 0.1, () => 0);
  await assert.rejects(engine.execute(request(surround, 0, 100), { jobId: `invalid-${++serial}`, locale: "en-US" }), /UNSUPPORTED_STREAM/);
  const truncated = wav("truncated", 48000, 1, 2, tone(48000, 0.25)); truncateSync(truncated, 44 + 48000 * 4);
  await assert.rejects(engine.execute(request(truncated, 500, 1500), { jobId: `invalid-${++serial}`, locale: "en-US" }));
  const sequenceOutput = path.join(root, "derived.wav");
  await engine.execute({ type: "render-audio-sequence", version: 1, sources: [{ id: "a", uri: headroom }],
    items: [{ sourceId: "a", sourceStartMs: 0, sourceEndMs: 1000, timelineStartMs: 0 }], outputUri: sequenceOutput, outputDurationMs: 1200, outputChannelLayout: "mono" }, { jobId: "sequence-prerequisite", locale: "en-US" });
  const derived = await measure("sequence-then-measure", request(sequenceOutput, 0, 1200)); assert.equal(derived.channels[0].exceedsFullScale, true);
  const history = new ProjectHistory(createEmptyProject({ id: "measure", name: "Measurement", locale: "en-US", now: "2026-09-22T00:00:00Z" }));
  const original = JSON.stringify(history.current);
  const service = new MediaApplicationService({ engine, history, executions: new InMemoryMediaExecutionRepository(), artifacts: new NodeMediaArtifactStore() });
  const outcome = await service.execute({ id: "measure-read-only", operation: request(sequenceOutput, 0, 1200), mutation: { type: "none" } });
  assert.equal(outcome.record.status, "succeeded"); assert.equal(JSON.stringify(history.current), original); assert.equal(history.entries.length, 0);
  const pcm = path.join(root, "alignment-profile.wav");
  const extraction = await engine.execute({ type: "extract-audio", inputUri: headroom, outputUri: pcm, audioCodec: "pcm" }, { jobId: "extract-regression", locale: "en-US" });
  assert.equal(extraction.probe.audioCodec, "pcm_s16le");
  const long = path.join(root, "thirty-minute-aac.m4a");
  run(["-f", "lavfi", "-i", "aevalsrc=0.25*sin(2*PI*1000*t):s=48000:d=1800", "-c:a", "aac", "-b:a", "64000", long]);
  for (let repeat = 0; repeat < 3; repeat++) {
    const r = await measure(`30-minute-source-late-${repeat}`, request(long, 1798000, 1799000));
    near(r.channels[0].rmsLinear, 0.25 / Math.sqrt(2), 0.005, "late compressed excerpt");
  }
  await measure("long-analysis-120-seconds", request(long, 300000, 420000));
  async function waitForDecoder() {
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
      const result = spawnSync("/bin/ps", ["-axo", "pid=,ppid=,comm="], { encoding: "utf8" });
      const child = result.stdout.split("\n").map(line => line.trim().split(/\s+/)).find(row => Number(row[1]) === transport.workerPid && row[2]?.endsWith("ffmpeg"));
      if (child) return Number(child[0]);
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error("decoder barrier not reached");
  }
  const abort = new AbortController();
  const pending = engine.execute(request(long, 0, 1799000), { jobId: "measurement-cancel", locale: "en-US", signal: abort.signal });
  const rejected = assert.rejects(pending, error => error.name === "AbortError");
  await waitForDecoder(); abort.abort(); await rejected;
  const death = engine.execute(request(long, 0, 1799000), { jobId: "measurement-death", locale: "en-US" });
  const died = assert.rejects(death); const childPid = await waitForDecoder(); process.kill(transport.workerPid, "SIGTERM"); await died;
  const deadline = performance.now() + 3000;
  let alive = true;
  while (alive && performance.now() < deadline) {
    try { process.kill(childPid, 0); } catch { alive = false; }
    if (alive) await new Promise(resolve => setTimeout(resolve, 10));
  }
  if (alive) process.kill(childPid, "SIGKILL"); // exclusively this test's observed child
  assert.equal(alive, false, "worker death left an owned measurement decoder running");
  const timeoutTransport = new ProcessMediaWorkerTransport({ ...options, renderTimeoutMs: 10 });
  const timeoutClient = new PersistentMediaWorkerClient(timeoutTransport);
  try {
    await timeoutClient.info();
    await assert.rejects(new FfmpegMediaEngine(timeoutClient).execute(request(long, 1000, 1799000), { jobId: "measurement-timeout", locale: "en-US" }));
  } finally { await timeoutClient.close(); }
  evidence.push({ name: "cancellation-worker-death", status: "PASS", reportPromoted: false });
  console.log(JSON.stringify({ status: "PASS", mode: release ? "exact-managed" : "development-NOT-release", identity,
    platform: `${process.platform}-${process.arch}`, ffmpeg: spawnSync(ffmpeg, ["-version"], { encoding: "utf8" }).stdout.split("\n")[0],
    resources: { processCeiling: 2, rssKiBCeiling: 768 * 1024, reportBytesCeiling: 4096 },
    scratchBytes: readdirSync(root).reduce((sum, file) => sum + statSync(path.join(root, file)).size, 0), evidence }, null, 2));
} finally { await client.close(); }
