import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, fstatSync, ftruncateSync, mkdtempSync, openSync, readFileSync, readSync, statSync, writeFileSync, writeSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createEmptyProject, ProjectHistory } from "@cevra/project-ir";
import { InMemoryMediaExecutionRepository, MediaApplicationService } from "@cevra/application";
import { FfmpegMediaEngine, NodeMediaArtifactStore, PersistentMediaWorkerClient, ProcessMediaWorkerTransport } from "../dist/index.js";

const SAMPLE_RATE = 48_000;
const root = mkdtempSync(path.join(os.tmpdir(), "cevra-audio-sequence-functional-"));
const runtimeRoot = path.resolve(required("CEVRA_AUDIO_SEQUENCE_RUNTIME_ROOT"));
const releaseMode = process.env.CEVRA_AUDIO_SEQUENCE_RELEASE === "1";
const pythonExecutable = path.resolve(required("CEVRA_AUDIO_SEQUENCE_PYTHON"));
const workerScript = path.join(runtimeRoot, "worker", "cevra_media_worker.py");
const ffmpeg = path.resolve(process.env.CEVRA_AUDIO_SEQUENCE_FFMPEG || path.join(runtimeRoot, "bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"));
const transport = new ProcessMediaWorkerTransport({
  mode: releaseMode ? "release" : "development",
  pythonExecutable,
  workerScript,
  controlTimeoutMs: 30_000,
  renderTimeoutMs: 180_000,
  renderLivenessIntervalMs: 500,
  env: {
    ...process.env,
    PATH: releaseMode ? path.join(runtimeRoot, "bin") : `${path.dirname(ffmpeg)}${path.delimiter}${process.env.PATH || ""}`,
    CEVRA_MEDIA_RUNTIME_ROOT: runtimeRoot,
    ...(process.env.CEVRA_AUDIO_SEQUENCE_VENDOR ? { CEVRA_FFMPEG_SKILL_ROOT: path.resolve(process.env.CEVRA_AUDIO_SEQUENCE_VENDOR) } : {}),
    CEVRA_RELEASE_MODE: releaseMode ? "1" : "0",
    PYTHONNOUSERSITE: "1"
  }
});
const client = new PersistentMediaWorkerClient(transport);
const engine = new FfmpegMediaEngine(client);
const measurements = [];
let execution = 0;

async function main() {
try {
  await runJcut();
  await runChannelsGainFadeAndHeadroom();
  for (const count of [3, 8, 16, 32]) await runDistinctSources(count);
  for (const count of [64, 256]) await runItemCount(count);
  for (const count of [2, 4, 8]) await runOverlap(count);
  await runLateThirtyMinuteSources();
  await runLongOutput();
  await runAudioBearingVideo();
  await runCancellation();
  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    mode: releaseMode ? "exact-release-runtime" : "development-runtime",
    platform: `${process.platform}-${process.arch}`,
    runtime: await client.info(),
    ffmpeg: firstLine(execFileSync(ffmpeg, ["-version"], { encoding: "utf8" })),
    scratch: root,
    measurements
  }, null, 2)}\n`);
} finally {
  await client.close();
}
}

async function runJcut() {
  const a = path.join(root, "jcut-a.wav");
  const b = path.join(root, "jcut-b-44100.wav");
  writeFloatWav(a, { sampleRate: 48_000, channels: 1, durationMs: 2_600, base: 0.01, events: [250, 750, 1_250].map((ms) => ({ ms, values: [0.31] })) });
  writeFloatWav(b, { sampleRate: 44_100, channels: 1, durationMs: 2_600, base: -0.02, events: [600, 1_200, 1_800, 2_400].map((ms) => ({ ms, values: [0.42] })) });
  const output = path.join(root, "jcut.wav");
  const operation = sequence({ sources: [{ id: "a", uri: a }, { id: "b", uri: b }], items: [
    item("a", 0, 1_500, 0), item("b", 0, 2_500, 1_500)
  ], output, outputDurationMs: 4_000, layout: "stereo" });
  const history = new ProjectHistory(createEmptyProject({ id: "functional", name: "Functional", locale: "en-US", now: "2026-09-22T00:00:00.000Z" }));
  const service = new MediaApplicationService({ engine, history, executions: new InMemoryMediaExecutionRepository(), artifacts: new NodeMediaArtifactStore() });
  const measured = await measure("jcut-application", 2, 2, output, () => service.execute({ id: "functional-jcut", operation, mutation: { type: "none" } }));
  assert.equal(measured.value.record.status, "succeeded");
  assert.equal(history.current.history.revision, 0);
  const wav = new Wav(output);
  assert.equal(wav.sampleRate, SAMPLE_RATE);
  assert.equal(wav.channels, 2);
  assert.equal(wav.frames, 192_000);
  const toleranceSamples = 3;
  const expectedA = [250, 750, 1_250];
  const expectedB = [2_100, 2_700, 3_300, 3_900];
  const observed = [...expectedA.map((ms) => wav.peakNear(msToFrame(ms), 0, 6)), ...expectedB.map((ms) => wav.peakNear(msToFrame(ms), 0, 8))];
  const errors = observed.map((frame, index) => Math.abs(frame - msToFrame([...expectedA, ...expectedB][index])));
  assert.ok(Math.max(...errors) <= toleranceSamples, `J-cut sample error ${Math.max(...errors)} > ${toleranceSamples}`);
  assert.ok(Math.abs(wav.sampleAt(msToFrame(1_490), 0) - 0.01) < 0.002, "A audio disappeared before its authorized end");
  assert.ok(Math.abs(wav.sampleAt(msToFrame(1_510), 0) - (-0.02)) < 0.003, "B audio did not begin at its authorized placement");
  const oldWrongVideoSchedule = [2_600, 3_200, 3_800, 4_400];
  const negativeErrorsMs = observed.slice(expectedA.length).map((frame, index) => Math.abs(frame / 48 - oldWrongVideoSchedule[index]));
  assert.ok(Math.max(...negativeErrorsMs) >= 499, "mandatory old 500 ms mapping negative control did not fail");
  measurements.push({ name: "jcut-oracle", status: "PASS", toleranceSamples, toleranceMs: toleranceSamples / 48, maximumObservedErrorSamples: Math.max(...errors), maximumObservedErrorMs: Math.max(...errors) / 48, oldMappingMinimumErrorMs: Math.min(...negativeErrorsMs) });
}

async function runChannelsGainFadeAndHeadroom() {
  const mono = path.join(root, "mono.wav");
  const stereo = path.join(root, "stereo.wav");
  writeFloatWav(mono, { sampleRate: SAMPLE_RATE, channels: 1, durationMs: 1_000, base: 0.25 });
  writeFloatWav(stereo, { sampleRate: SAMPLE_RATE, channels: 2, durationMs: 1_000, base: [0.2, -0.4] });

  const stereoOut = path.join(root, "mono-to-stereo.wav");
  await execute(sequence({ sources: [{ id: "m", uri: mono }], items: [{ ...item("m", 0, 1_000, 0), gainDb: 6.020599913, fadeInMs: 200, fadeOutMs: 200 }], output: stereoOut, outputDurationMs: 1_000, layout: "stereo" }), "channels-gain-fade");
  const stereoWav = new Wav(stereoOut);
  assert.ok(Math.abs(stereoWav.sampleAt(msToFrame(500), 0) - 0.5) < 0.003);
  assert.ok(Math.abs(stereoWav.sampleAt(msToFrame(500), 1) - 0.5) < 0.003);
  assert.ok(Math.abs(stereoWav.sampleAt(msToFrame(100), 0) - 0.25) < 0.01);

  const monoOut = path.join(root, "stereo-to-mono.wav");
  await execute(sequence({ sources: [{ id: "s", uri: stereo }], items: [item("s", 0, 1_000, 0)], output: monoOut, outputDurationMs: 1_000, layout: "mono" }), "stereo-to-mono");
  assert.ok(Math.abs(new Wav(monoOut).sampleAt(msToFrame(500), 0) - (-0.1)) < 0.003);

  const monoPreservedOut = path.join(root, "mono-to-mono.wav");
  await execute(sequence({ sources: [{ id: "m", uri: mono }], items: [item("m", 0, 1_000, 0)], output: monoPreservedOut, outputDurationMs: 1_000, layout: "mono" }), "mono-to-mono");
  assert.ok(Math.abs(new Wav(monoPreservedOut).sampleAt(msToFrame(500), 0) - 0.25) < 0.003);

  const stereoPreservedOut = path.join(root, "stereo-to-stereo.wav");
  await execute(sequence({ sources: [{ id: "s", uri: stereo }], items: [item("s", 0, 1_000, 0)], output: stereoPreservedOut, outputDurationMs: 1_000, layout: "stereo" }), "stereo-to-stereo");
  const stereoPreserved = new Wav(stereoPreservedOut);
  assert.ok(Math.abs(stereoPreserved.sampleAt(msToFrame(500), 0) - 0.2) < 0.003);
  assert.ok(Math.abs(stereoPreserved.sampleAt(msToFrame(500), 1) - (-0.4)) < 0.003);

  const overlapSources = Array.from({ length: 8 }, (_, index) => {
    const uri = path.join(root, `headroom-${index}.wav`);
    writeFloatWav(uri, { sampleRate: SAMPLE_RATE, channels: 1, durationMs: 100, events: [{ ms: 20, values: [0.25] }] });
    return { id: `h${index}`, uri };
  });
  const headroom = path.join(root, "headroom.wav");
  await execute(sequence({ sources: overlapSources, items: overlapSources.map((source) => item(source.id, 0, 100, 0)), output: headroom, outputDurationMs: 100, layout: "mono" }), "float-headroom-8");
  const peak = new Wav(headroom).sampleAt(msToFrame(20), 0);
  assert.ok(peak > 1.99 && peak < 2.01, `float headroom was clipped or normalized: ${peak}`);
  measurements.push({ name: "pcm-semantics", status: "PASS", monoToMonoSample: 0.25, stereoToStereoSamples: [0.2, -0.4], monoToStereo: "duplicated", stereoToMonoSample: -0.1, gainMidpoint: 0.5, explicitFadeMidpoint: 0.25, eightWayPeak: peak });
}

async function runDistinctSources(count) {
  const sources = [];
  const items = [];
  for (let index = 0; index < count; index += 1) {
    const uri = path.join(root, `distinct-${count}-${index}.wav`);
    writeFloatWav(uri, { sampleRate: index % 2 ? 44_100 : SAMPLE_RATE, channels: index % 3 ? 1 : 2, durationMs: 40, events: [{ ms: 10, values: index % 3 ? [0.2] : [0.2, -0.15] }] });
    sources.push({ id: `s${index}`, uri });
    items.push(item(`s${index}`, 0, 40, index * 40));
  }
  const output = path.join(root, `distinct-${count}.wav`);
  await execute(sequence({ sources, items, output, outputDurationMs: count * 40, layout: "stereo" }), `distinct-sources-${count}`);
  const wav = new Wav(output);
  for (let index = 0; index < count; index += 1) assert.ok(Math.abs(wav.sampleAt(msToFrame(index * 40 + 10), 0)) > 0.12, `source ${index} made no measured contribution`);
}

async function runItemCount(count) {
  const uri = path.join(root, "item-source.wav");
  if (!exists(uri)) writeFloatWav(uri, { sampleRate: SAMPLE_RATE, channels: 1, durationMs: 20, events: [{ ms: 5, values: [0.4] }] });
  const output = path.join(root, `items-${count}.wav`);
  await execute(sequence({ sources: [{ id: "reused", uri }], items: Array.from({ length: count }, (_, index) => item("reused", 0, 10, index * 10)), output, outputDurationMs: count * 10, layout: "mono" }), `items-${count}`);
  const wav = new Wav(output);
  assert.ok(Math.abs(wav.peakNear(msToFrame(5), 0, 2) - msToFrame(5)) <= 1);
  assert.ok(Math.abs(wav.peakNear(msToFrame((count - 1) * 10 + 5), 0, 2) - msToFrame((count - 1) * 10 + 5)) <= 1);
  assert.equal(wav.frames, count * 10 * 48);
}

async function runOverlap(count) {
  const sources = Array.from({ length: count }, (_, index) => ({ id: `o${index}`, uri: path.join(root, `overlap-${count}-${index}.wav`) }));
  for (const source of sources) writeFloatWav(source.uri, { sampleRate: SAMPLE_RATE, channels: 1, durationMs: 50, events: [{ ms: 10, values: [0.2] }] });
  const output = path.join(root, `overlap-${count}.wav`);
  await execute(sequence({ sources, items: sources.map((source) => item(source.id, 0, 50, 0)), output, outputDurationMs: 50, layout: "mono" }), `simultaneous-${count}`);
  assert.ok(Math.abs(new Wav(output).sampleAt(msToFrame(10), 0) - count * 0.2) < 0.005);
}

async function runLateThirtyMinuteSources() {
  const sources = [];
  const items = [];
  for (let index = 0; index < 3; index += 1) {
    const uri = path.join(root, `late-${index}.wav`);
    writeFloatWav(uri, { sampleRate: SAMPLE_RATE, channels: 1, durationMs: 1_800_000, events: [{ ms: 1_799_050, values: [0.25 + index * 0.1] }] });
    sources.push({ id: `late${index}`, uri });
    items.push(item(`late${index}`, 1_799_000, 1_799_100, index * 100));
  }
  const output = path.join(root, "late-reordered.wav");
  await execute(sequence({ sources: sources.reverse(), items: items.reverse(), output, outputDurationMs: 500, layout: "mono" }), "late-30-minute-sources");
  const wav = new Wav(output);
  for (const expected of [50, 150, 250]) assert.ok(Math.abs(wav.sampleAt(msToFrame(expected), 0)) > 0.2);
}

async function runLongOutput() {
  const uri = path.join(root, "long-source.wav");
  writeFloatWav(uri, { sampleRate: SAMPLE_RATE, channels: 1, durationMs: 100, events: [{ ms: 10, values: [0.5] }] });
  const output = path.join(root, "long-output-120s.wav");
  await execute(sequence({ sources: [{ id: "long", uri }], items: [item("long", 0, 100, 60_000)], output, outputDurationMs: 120_000, layout: "stereo" }), "long-output-120s");
  const wav = new Wav(output);
  assert.equal(wav.frames, 5_760_000);
  assert.equal(wav.sampleAt(0, 0), 0);
  assert.ok(wav.sampleAt(msToFrame(60_010), 0) > 0.45);
  assert.equal(wav.sampleAt(wav.frames - 1, 0), 0);
}

async function runAudioBearingVideo() {
  const video = path.join(root, "audio-bearing-video.mkv");
  const made = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:r=10:d=1", "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=1", "-c:v", "ffv1", "-c:a", "pcm_s16le", video], { encoding: "utf8" });
  assert.equal(made.status, 0, made.stderr);
  const output = path.join(root, "audio-from-video.wav");
  await execute(sequence({ sources: [{ id: "video", uri: video }], items: [item("video", 0, 1_000, 0)], output, outputDurationMs: 1_000, layout: "mono" }), "audio-bearing-video");
  assert.ok(new Wav(output).maximumAbsolute(0, 1_000) > 0.05);
}

async function runCancellation() {
  const sources = Array.from({ length: 32 }, (_, index) => ({ id: `cancel${index}`, uri: path.join(root, `cancel-${index}.wav`) }));
  for (const source of sources) writeFloatWav(source.uri, { sampleRate: SAMPLE_RATE, channels: 1, durationMs: 60_000 });
  const output = path.join(root, "cancelled.wav");
  const controller = new AbortController();
  const operation = sequence({ sources, items: sources.map((source) => item(source.id, 0, 60_000, 0)), output, outputDurationMs: 600_000, layout: "stereo" });
  const promise = engine.execute(operation, { jobId: "functional-cancel", locale: "en-US", signal: controller.signal });
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(promise, (error) => error?.name === "AbortError");
  assert.equal(exists(output), false);
  measurements.push({ name: "cancellation", status: "PASS", sourceCount: 32, outputPromoted: false });
}

async function execute(operation, name) {
  return (await measure(name, operation.sources.length, operation.items.length, operation.outputUri, () => engine.execute(operation, { jobId: `functional-${++execution}`, locale: "en-US" }))).value;
}

async function measure(name, sourceCount, itemCount, output, action) {
  const sampler = sampleProcessTree(() => transport.workerPid);
  const started = performance.now();
  try {
    const value = await action();
    const wallMs = performance.now() - started;
    const resource = sampler.stop();
    const outputBytes = exists(output) ? statSync(output).size : 0;
    measurements.push({ name, status: "PASS", cold: measurements.length === 0, distinctSourceCount: sourceCount, itemCount, maximumOpenInputDecoders: sourceCount, processCountPeak: resource.processCountPeak, peakProcessTreeRssKiB: resource.rssKiBPeak, peakSampledCpuPercent: resource.cpuPercentPeak, wallMs: round(wallMs), outputBytes });
    return { value, wallMs };
  } catch (error) {
    sampler.stop();
    throw error;
  }
}

function sampleProcessTree(rootPid) {
  let rssKiBPeak = 0;
  let cpuPercentPeak = 0;
  let processCountPeak = 0;
  const poll = () => {
    const pid = rootPid();
    if (!pid || process.platform === "win32") return;
    const result = spawnSync("/bin/ps", ["-axo", "pid=,ppid=,rss=,%cpu="], { encoding: "utf8" });
    if (result.status !== 0) return;
    const rows = result.stdout.trim().split("\n").map((line) => line.trim().split(/\s+/u).map(Number)).filter((row) => row.length === 4);
    const descendants = new Set([pid]);
    for (let changed = true; changed;) {
      changed = false;
      for (const [child, parent] of rows) if (descendants.has(parent) && !descendants.has(child)) { descendants.add(child); changed = true; }
    }
    const active = rows.filter(([child]) => descendants.has(child));
    rssKiBPeak = Math.max(rssKiBPeak, active.reduce((sum, row) => sum + row[2], 0));
    cpuPercentPeak = Math.max(cpuPercentPeak, active.reduce((sum, row) => sum + row[3], 0));
    processCountPeak = Math.max(processCountPeak, active.length);
  };
  poll();
  const timer = setInterval(poll, 10);
  return { stop() { clearInterval(timer); poll(); return { rssKiBPeak, cpuPercentPeak: round(cpuPercentPeak), processCountPeak }; } };
}

function sequence({ sources, items, output, outputDurationMs, layout }) {
  return { type: "render-audio-sequence", version: 1, sources, items, outputUri: output, outputDurationMs, outputChannelLayout: layout };
}

function item(sourceId, sourceStartMs, sourceEndMs, timelineStartMs) { return { sourceId, sourceStartMs, sourceEndMs, timelineStartMs }; }
function msToFrame(ms) { return ms * 48; }
function exists(value) { try { statSync(value); return true; } catch { return false; } }
function round(value) { return Math.round(value * 1000) / 1000; }
function firstLine(value) { return value.split(/\r?\n/u)[0]; }
function required(name) { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }

function writeFloatWav(file, { sampleRate, channels, durationMs, base = 0, events = [] }) {
  const frames = Math.round(durationMs * sampleRate / 1000);
  const dataBytes = frames * channels * 4;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + dataBytes, 4); header.write("WAVEfmt ", 8); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20); header.writeUInt16LE(channels, 22); header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 4, 28); header.writeUInt16LE(channels * 4, 32); header.writeUInt16LE(32, 34);
  header.write("data", 36); header.writeUInt32LE(dataBytes, 40);
  const fd = openSync(file, "w+");
  try {
    writeSync(fd, header, 0, header.length, 0);
    ftruncateSync(fd, 44 + dataBytes);
    const baseValues = Array.isArray(base) ? base : Array(channels).fill(base);
    if (baseValues.some((value) => value !== 0)) {
      const blockFrames = 8_192;
      const block = Buffer.alloc(blockFrames * channels * 4);
      for (let frame = 0; frame < blockFrames; frame += 1) for (let channel = 0; channel < channels; channel += 1) block.writeFloatLE(baseValues[channel] ?? baseValues[0], (frame * channels + channel) * 4);
      for (let frame = 0; frame < frames; frame += blockFrames) {
        const count = Math.min(blockFrames, frames - frame);
        writeSync(fd, block, 0, count * channels * 4, 44 + frame * channels * 4);
      }
    }
    for (const event of events) {
      const frame = Math.round(event.ms * sampleRate / 1000);
      const payload = Buffer.alloc(channels * 4);
      for (let channel = 0; channel < channels; channel += 1) payload.writeFloatLE(event.values[channel] ?? event.values[0], channel * 4);
      writeSync(fd, payload, 0, payload.length, 44 + frame * channels * 4);
    }
  } finally { closeSync(fd); }
}

class Wav {
  constructor(file) {
    this.file = file;
    const fd = openSync(file, "r");
    try {
      const header = Buffer.alloc(Math.min(4096, fstatSync(fd).size));
      readSync(fd, header, 0, header.length, 0);
      assert.equal(header.toString("ascii", 0, 4), "RIFF");
      assert.equal(header.toString("ascii", 8, 12), "WAVE");
      let offset = 12;
      while (offset + 8 <= header.length) {
        const id = header.toString("ascii", offset, offset + 4);
        const size = header.readUInt32LE(offset + 4);
        if (id === "fmt ") {
          this.format = header.readUInt16LE(offset + 8); this.channels = header.readUInt16LE(offset + 10); this.sampleRate = header.readUInt32LE(offset + 12); this.bits = header.readUInt16LE(offset + 22);
        }
        if (id === "data") { this.dataOffset = offset + 8; this.dataBytes = size; break; }
        offset += 8 + size + (size % 2);
      }
    } finally { closeSync(fd); }
    assert.ok(this.format === 3 || this.format === 0xfffe, `unexpected WAV format ${this.format}`);
    assert.equal(this.bits, 32);
    this.frames = this.dataBytes / (this.channels * 4);
  }
  sampleAt(frame, channel) {
    assert.ok(frame >= 0 && frame < this.frames);
    const fd = openSync(this.file, "r"); const buffer = Buffer.alloc(4);
    try { readSync(fd, buffer, 0, 4, this.dataOffset + (frame * this.channels + channel) * 4); } finally { closeSync(fd); }
    return buffer.readFloatLE(0);
  }
  peakNear(frame, channel, radius) {
    let peakFrame = frame; let peak = -1;
    for (let candidate = frame - radius; candidate <= frame + radius; candidate += 1) {
      const value = Math.abs(this.sampleAt(candidate, channel));
      if (value > peak) { peak = value; peakFrame = candidate; }
    }
    return peakFrame;
  }
  maximumAbsolute(startMs, endMs) {
    const start = msToFrame(startMs); const end = Math.min(this.frames, msToFrame(endMs));
    const fd = openSync(this.file, "r"); const buffer = Buffer.alloc((end - start) * this.channels * 4);
    try { readSync(fd, buffer, 0, buffer.length, this.dataOffset + start * this.channels * 4); } finally { closeSync(fd); }
    let peak = 0; for (let offset = 0; offset < buffer.length; offset += 4) peak = Math.max(peak, Math.abs(buffer.readFloatLE(offset))); return peak;
  }
}

await main();
