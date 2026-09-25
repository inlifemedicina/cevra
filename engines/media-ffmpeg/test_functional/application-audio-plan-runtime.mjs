import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createEmptyProject, ProjectHistory } from "@cevra/project-ir";
import {
  InMemoryMediaExecutionRepository,
  LocalSourceIngestService,
  MediaApplicationService,
  ResolvedAudioPlanApplicationService,
  SourceTechnicalDescriptorResolver
} from "@cevra/application";
import {
  FfmpegMediaEngine,
  NodeMediaArtifactStore,
  PersistentMediaWorkerClient,
  ProcessMediaWorkerTransport
} from "../dist/index.js";

const SAMPLE_RATE = 48_000;
const PROCESS_COUNT_CEILING = 2;
const RSS_KIB_CEILING = 768 * 1024;
const TIMING_TOLERANCE_MS = 25;
const root = mkdtempSync(path.join(os.tmpdir(), "cevra-application-audio-plan-"));
const runtimeRoot = path.resolve(required("CEVRA_AUDIO_SEQUENCE_RUNTIME_ROOT"));
const releaseMode = process.env.CEVRA_AUDIO_SEQUENCE_RELEASE === "1";
const pythonExecutable = path.resolve(required("CEVRA_AUDIO_SEQUENCE_PYTHON"));
const ffmpeg = path.resolve(process.env.CEVRA_AUDIO_SEQUENCE_FFMPEG || path.join(runtimeRoot, "bin", "ffmpeg"));
const ffprobe = path.resolve(process.env.CEVRA_AUDIO_SEQUENCE_FFPROBE || path.join(runtimeRoot, "bin", "ffprobe"));
const transport = new ProcessMediaWorkerTransport({
  mode: releaseMode ? "release" : "development",
  pythonExecutable,
  workerScript: path.join(runtimeRoot, "worker", "cevra_media_worker.py"),
  controlTimeoutMs: 30_000,
  renderTimeoutMs: 180_000,
  renderLivenessIntervalMs: 500,
  env: {
    ...process.env,
    PATH: releaseMode ? path.join(runtimeRoot, "bin") : `${path.dirname(ffmpeg)}${path.delimiter}${process.env.PATH || ""}`,
    CEVRA_MEDIA_RUNTIME_ROOT: runtimeRoot,
    CEVRA_RELEASE_MODE: releaseMode ? "1" : "0",
    PYTHONNOUSERSITE: "1"
  }
});
const client = new PersistentMediaWorkerClient(transport);
const engine = new FfmpegMediaEngine(client);

async function main() {
  try {
    const sourceA = path.join(root, "source-a.wav");
    const sourceB = path.join(root, "source-b-44100.wav");
    writeFloatWav(sourceA, 48_000, 2_600, [250, 750, 1_250]);
    writeFloatWav(sourceB, 44_100, 2_600, [500, 1_100, 1_700, 2_300]);
    const visual = path.join(root, "caller-visual.mp4");
    runFfmpeg([
      "-y", "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=4",
      "-an", "-c:v", "h264_videotoolbox", "-b:v", "1500000", "-pix_fmt", "yuv420p", "-movflags", "+faststart", visual
    ]);
    const shortVisual = path.join(root, "caller-visual-short.mp4");
    runFfmpeg([
      "-y", "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=3.5",
      "-an", "-c:v", "h264_videotoolbox", "-b:v", "1500000", "-pix_fmt", "yuv420p", shortVisual
    ]);

    const correct = await runVertical({ sourceA, sourceB, visual, wrongPlacement: false, prefix: "correct" });
    const correctAudio = decodeAudio(correct.output, "correct-decoded.wav");
    const expected = [250, 750, 1_250, 2_000, 2_600, 3_200, 3_800];
    const observed = expected.map((at) => correctAudio.peakFrameNear(at, 120) / 48);
    const errors = observed.map((at, index) => Math.abs(at - expected[index]));
    assert.ok(Math.max(...errors) <= TIMING_TOLERANCE_MS, `correct J-cut error ${Math.max(...errors)} ms`);
    assert.equal(correct.plan.operation.items[1].sourceStartMs, 0);
    assert.equal(correct.plan.operation.items[1].timelineStartMs, 1_500);
    assert.equal(correct.project.exports.length, 1);
    assert.equal(correct.project.exports[0].outputUri, correct.output);
    assert.equal(correct.pcmExistsAfterPromotion, false);
    assert.ok(Math.abs(correct.muxDuration.inputVideoDurationMs - 4_000) <= 1);
    assert.ok(Math.abs(correct.muxDuration.inputAudioDurationMs - 4_000) <= 1);
    assert.ok(Math.abs(correct.muxDuration.outputVideoDurationMs - 4_000) <= 1);
    assert.ok(Math.abs(correct.muxDuration.outputAudioDurationMs - 4_000) <= 23);

    const descriptorSource = path.join(root, "descriptor-source.wav");
    writeFloatWav(descriptorSource, 48_000, 4_000, [300, 1_300, 2_300, 3_300]);
    const descriptorPositive = await runDescriptorVertical({ source: descriptorSource, visual, prefix: "descriptor-positive" });
    assert.equal(descriptorPositive.descriptor.version, 1);
    assert.equal(descriptorPositive.descriptor.basis, "ingest");
    assert.equal(descriptorPositive.descriptor.method.profile, "cevra.source-technical.v1");
    assert.equal(descriptorPositive.project.exports.length, 1);
    assert.equal(descriptorPositive.pcmExistsAfterPromotion, false);

    const changedDescriptorSource = path.join(root, "descriptor-source-changed.wav");
    writeFloatWav(changedDescriptorSource, 48_000, 4_000, [400, 1_400, 2_400, 3_400]);
    const descriptorNegative = await runDescriptorVertical({
      source: changedDescriptorSource,
      visual,
      prefix: "descriptor-negative",
      mutateAfterAdoption: () => writeFloatWav(changedDescriptorSource, 48_000, 4_000, [600, 1_600, 2_600, 3_600])
    });
    assert.equal(descriptorNegative.rejectedCode, "AUDIO_PLAN_SOURCE_CONTENT_CHANGED");
    assert.equal(descriptorNegative.project.exports.length, 0);

    await assert.rejects(
      runVertical({ sourceA, sourceB, visual: shortVisual, wrongPlacement: false, prefix: "short-visual" }),
      (error) => causesContain(error, "mux input video stream duration")
    );
    const shortAudio = path.join(root, "short-audio.wav");
    writeFloatWav(shortAudio, 48_000, 3_500, [250]);
    await assert.rejects(engine.execute({
      type: "mux-audio", videoUri: visual, audioUri: shortAudio, outputUri: path.join(root, "short-audio-final.mp4"),
      replaceExisting: true,
      durationValidation: { version: 1, videoDurationMs: 4_000, audioDurationMs: 4_000, inputToleranceMs: 1, outputAudioToleranceMs: 23 }
    }, { jobId: "short-audio-duration-rejection", locale: "en-US" }),
    (error) => causesContain(error, "mux input audio stream duration"));

    const wrong = await runVertical({ sourceA, sourceB, visual, wrongPlacement: true, prefix: "wrong" });
    const wrongAudio = decodeAudio(wrong.output, "wrong-decoded.wav");
    const intendedB = [2_000, 2_600, 3_200];
    const wrongObserved = intendedB.map((at) => wrongAudio.peakFrameNear(at + 500, 120) / 48);
    const wrongErrors = wrongObserved.map((at, index) => Math.abs(at - intendedB[index]));
    assert.ok(Math.min(...wrongErrors) >= 475, `wrong placement unexpectedly passed: ${wrongErrors.join(",")}`);

    const sourcePackets = videoPackets(visual);
    const finalPackets = videoPackets(correct.output);
    assert.deepEqual(finalPackets.map((packet) => packet.data_hash), sourcePackets.map((packet) => packet.data_hash));
    assert.deepEqual(finalPackets.map(packetTiming), sourcePackets.map(packetTiming));
    assert.equal(probeStreams(correct.output).filter((stream) => stream.codec_type === "video").length, 1);
    assert.equal(probeStreams(correct.output).filter((stream) => stream.codec_type === "audio").length, 1);

    process.stdout.write(`${JSON.stringify({
      status: "PASS",
      mode: releaseMode ? "exact-release-runtime" : "development-runtime",
      platform: `${process.platform}-${process.arch}`,
      runtime: await client.info(),
      ffmpeg: firstLine(execFileSync(ffmpeg, ["-version"], { encoding: "utf8" })),
      contract: {
        normalization: "NONE",
        callerVisualBinding: "project id + revision + snapshot + journal count + producer execution id",
        videoGenerationAtMux: 0,
        audioLossyGenerationsAtMux: 1,
        packetPayloadAndTimingIdentity: true,
        perStreamDurationEvidence: correct.muxDuration,
        shortVisualRejected: true,
        shortAudioRejected: true,
        descriptorBearingAcquisitionAndExport: true,
        descriptorBearingChangedSourceRejected: true
      },
      oracle: {
        toleranceMs: TIMING_TOLERANCE_MS,
        maximumCorrectErrorMs: round(Math.max(...errors)),
        minimumExecutedWrongPlacementErrorMs: round(Math.min(...wrongErrors))
      },
      resources: correct.resources,
      artifacts: {
        finalBytes: statSync(correct.output).size,
        planBytes: Buffer.byteLength(JSON.stringify(correct.plan)),
        ownedStagingArtifactsAfterSuccess: ownedStagingArtifacts()
      },
      scratch: root
    }, null, 2)}\n`);
  } finally {
    await client.close();
  }
}

async function runDescriptorVertical({ source, visual, prefix, mutateAfterAdoption }) {
  const project = createEmptyProject({
    id: `${prefix}-project`, name: "Descriptor-bearing audio", locale: "en-US", now: "2026-09-25T00:00:00.000Z"
  });
  const history = new ProjectHistory(project);
  const repository = new InMemoryMediaExecutionRepository();
  const artifacts = new NodeMediaArtifactStore();
  const media = new MediaApplicationService({ engine, history, executions: repository, artifacts });
  let generated = 0;
  const ingest = new LocalSourceIngestService({
    history,
    media,
    identity: artifacts,
    idGenerator: () => `${prefix}-ingest-${++generated}`
  });
  const ingestion = await ingest.ingest({
    sourceId: `${prefix}-source`, uri: source, displayName: `${prefix} source`, expectedKind: "audio", locale: "en-US"
  });
  assert.ok(ingestion.source.technicalDescriptor, "managed probe and Node identity must adopt a real descriptor");
  history.commit({
    type: "track.add",
    track: { id: `${prefix}-track`, kind: "audio", name: "Audio", locked: false, hidden: false, muted: false }
  });
  history.commit({
    type: "clip.add",
    clip: clip(`${prefix}-clip`, `${prefix}-track`, ingestion.source.id, 0, 4_000, 0, 4_000)
  });

  const service = new ResolvedAudioPlanApplicationService({
    history,
    media,
    intents: repository,
    sourceVerifier: new SourceTechnicalDescriptorResolver(artifacts),
    idGenerator: () => `${prefix}-plan`
  });
  const pcm = path.join(root, `${prefix}-mix.wav`);
  const output = path.join(root, `${prefix}-final.mp4`);
  const plan = service.compile({ audioOutputUri: pcm, outputChannelLayout: "stereo", normalization: { type: "none" } });
  mutateAfterAdoption?.();
  try {
    const outcome = await service.execute({
      id: `${prefix}-vertical`,
      plan,
      visual: {
        version: 1,
        uri: visual,
        projectBinding: plan.projectBinding,
        durationMs: 4_000,
        producerExecutionId: "synthetic-caller-visual-fixture"
      },
      outputUri: output,
      exportId: `${prefix}-export`,
      presetId: "application-audio-plan-functional"
    });
    return {
      descriptor: ingestion.source.technicalDescriptor,
      project: outcome.project,
      pcmExistsAfterPromotion: exists(pcm)
    };
  } catch (error) {
    if (!mutateAfterAdoption) throw error;
    assert.equal(exists(output), false);
    assert.equal(exists(pcm), false);
    return {
      descriptor: ingestion.source.technicalDescriptor,
      project: history.current,
      rejectedCode: error?.code
    };
  }
}

async function runVertical({ sourceA, sourceB, visual, wrongPlacement, prefix }) {
  const project = projectFixture(sourceA, sourceB, wrongPlacement);
  const history = new ProjectHistory(project);
  const media = new MediaApplicationService({
    engine,
    history,
    executions: new InMemoryMediaExecutionRepository(),
    artifacts: new NodeMediaArtifactStore()
  });
  const service = new ResolvedAudioPlanApplicationService({ history, media, idGenerator: () => `${prefix}-plan` });
  const pcm = path.join(root, `${prefix}-mix.wav`);
  const output = path.join(root, `${prefix}-final.mp4`);
  const plan = service.compile({ audioOutputUri: pcm, outputChannelLayout: "stereo", normalization: { type: "none" } });
  const sampler = sampleProcessTree(() => transport.workerPid);
  const started = performance.now();
  let resources;
  try {
    const outcome = await service.execute({
      id: `${prefix}-vertical`,
      plan,
      visual: {
        version: 1,
        uri: visual,
        projectBinding: plan.projectBinding,
        durationMs: 4_000,
        producerExecutionId: "synthetic-caller-visual-fixture"
      },
      outputUri: output,
      exportId: `${prefix}-export`,
      presetId: "application-audio-plan-functional"
    });
    resources = { ...sampler.stop(), wallMs: round(performance.now() - started) };
    assert.ok(resources.processCountPeak <= PROCESS_COUNT_CEILING, `process topology exceeded ${PROCESS_COUNT_CEILING}`);
    assert.ok(resources.rssKiBPeak <= RSS_KIB_CEILING, `RSS exceeded ${RSS_KIB_CEILING} KiB`);
    assert.deepEqual(outcome.audioCleanup, { removed: [pcm], failed: [] });
    assert.equal(ownedStagingArtifacts(), 0);
    return {
      output, plan, project: outcome.project, resources, pcmExistsAfterPromotion: exists(pcm),
      muxDuration: outcome.muxExecution.attempts.at(-1).result.muxDuration
    };
  } finally {
    if (!resources) sampler.stop();
  }
}

function projectFixture(sourceA, sourceB, wrongPlacement) {
  const project = createEmptyProject({ id: `application-jcut-${wrongPlacement ? "wrong" : "correct"}`, name: "Application J-cut", locale: "en-US", now: "2026-09-23T00:00:00.000Z" });
  project.sources = [
    { id: "a", kind: "video", uri: sourceA, displayName: "A", durationMs: 2_600 },
    { id: "b", kind: "video", uri: sourceB, displayName: "B", durationMs: 2_600 }
  ];
  project.timeline.durationMs = 4_000;
  project.timeline.tracks = [
    { id: "picture", kind: "video", name: "Picture", locked: false, hidden: false, muted: false },
    { id: "audio", kind: "audio", name: "Audio", locked: false, hidden: false, muted: false }
  ];
  project.timeline.clips = [
    clip("picture-a", "picture", "a", 0, 2_000, 0, 2_000),
    clip("audio-a", "audio", "a", 0, 1_500, 0, 1_500),
    wrongPlacement
      ? clip("audio-b", "audio", "b", 2_000, 4_000, 0, 2_000)
      : clip("audio-b", "audio", "b", 1_500, 4_000, 0, 2_500),
    clip("picture-b", "picture", "b", 2_000, 4_000, 500, 2_500)
  ];
  return project;
}

function clip(id, trackId, sourceId, timelineStartMs, timelineEndMs, sourceStartMs, sourceEndMs) {
  return { id, trackId, sourceId, timelineStartMs, timelineEndMs, sourceStartMs, sourceEndMs, speed: 1, volume: 1, opacity: 1 };
}

function decodeAudio(input, name) {
  const output = path.join(root, name);
  runFfmpeg(["-y", "-i", input, "-map", "0:a:0", "-c:a", "pcm_f32le", "-ar", "48000", "-ac", "2", output]);
  return new Wav(output);
}

function videoPackets(file) {
  const result = JSON.parse(execFileSync(ffprobe, [
    "-v", "error", "-select_streams", "v:0", "-show_packets", "-show_data_hash", "sha256",
    "-show_entries", "packet=pts_time,dts_time,duration_time,size,data_hash", "-of", "json", file
  ], { encoding: "utf8" }));
  assert.ok(Array.isArray(result.packets) && result.packets.length > 0);
  return result.packets;
}

function packetTiming(packet) {
  return { pts_time: packet.pts_time, dts_time: packet.dts_time, duration_time: packet.duration_time, size: packet.size };
}

function probeStreams(file) {
  return JSON.parse(execFileSync(ffprobe, ["-v", "error", "-show_streams", "-of", "json", file], { encoding: "utf8" })).streams;
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
  return { stop() { clearInterval(timer); poll(); return { rssKiBPeak, cpuPercentPeak: round(cpuPercentPeak), processCountPeak, processCountCeiling: PROCESS_COUNT_CEILING, rssKiBCeiling: RSS_KIB_CEILING }; } };
}

function ownedStagingArtifacts() {
  return readdirSync(root).filter((entry) => entry.startsWith(".cevra-audio-sequence-") || entry.startsWith(".cevra-mux-audio-")).length;
}

function writeFloatWav(file, sampleRate, durationMs, eventTimesMs) {
  const frames = Math.round(durationMs * sampleRate / 1000);
  const samples = new Float32Array(frames);
  for (const eventMs of eventTimesMs) {
    const start = Math.round(eventMs * sampleRate / 1000);
    const end = Math.min(frames, start + Math.round(5 * sampleRate / 1000));
    for (let frame = start; frame < end; frame += 1) samples[frame] = 0.8;
  }
  const dataBytes = samples.byteLength;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + dataBytes, 4); header.write("WAVEfmt ", 8); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(32, 34);
  header.write("data", 36); header.writeUInt32LE(dataBytes, 40);
  writeFileSync(file, Buffer.concat([header, Buffer.from(samples.buffer)]));
}

class Wav {
  constructor(file) {
    this.file = file;
    const fd = openSync(file, "r");
    try {
      const header = Buffer.alloc(Math.min(statSync(file).size, 1_048_576));
      readSync(fd, header, 0, header.length, 0);
      assert.equal(header.toString("ascii", 0, 4), "RIFF");
      assert.equal(header.toString("ascii", 8, 12), "WAVE");
      let offset = 12;
      while (offset + 8 <= header.length) {
        const id = header.toString("ascii", offset, offset + 4);
        const size = header.readUInt32LE(offset + 4);
        if (id === "fmt ") {
          this.format = header.readUInt16LE(offset + 8);
          this.channels = header.readUInt16LE(offset + 10);
          this.sampleRate = header.readUInt32LE(offset + 12);
          this.bits = header.readUInt16LE(offset + 22);
        }
        if (id === "data") { this.dataOffset = offset + 8; this.dataBytes = size; break; }
        offset += 8 + size + (size % 2);
      }
    } finally { closeSync(fd); }
    assert.ok(this.format === 3 || this.format === 0xfffe);
    assert.equal(this.bits, 32);
    assert.equal(this.sampleRate, SAMPLE_RATE);
    this.frames = this.dataBytes / (this.channels * 4);
  }

  peakFrameNear(ms, radiusMs) {
    const center = Math.round(ms * this.sampleRate / 1000);
    const radius = Math.round(radiusMs * this.sampleRate / 1000);
    const start = Math.max(0, center - radius);
    const end = Math.min(this.frames, center + radius + 1);
    const buffer = Buffer.alloc((end - start) * this.channels * 4);
    const fd = openSync(this.file, "r");
    try { readSync(fd, buffer, 0, buffer.length, this.dataOffset + start * this.channels * 4); } finally { closeSync(fd); }
    let maximum = -1;
    let frame = start;
    for (let candidate = start; candidate < end; candidate += 1) {
      const value = Math.abs(buffer.readFloatLE((candidate - start) * this.channels * 4));
      if (value > maximum) { maximum = value; frame = candidate; }
    }
    assert.ok(maximum > 0.05, `no identifiable event near ${ms} ms`);
    return frame;
  }
}

function runFfmpeg(args) {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function exists(file) { try { statSync(file); return true; } catch { return false; } }
function required(name) { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }
function round(value) { return Math.round(value * 1000) / 1000; }
function firstLine(value) { return value.split(/\r?\n/u)[0]; }
function causesContain(error, fragment) {
  for (let current = error; current; current = current.cause) {
    if (String(current.message ?? current).includes(fragment)) return true;
  }
  return false;
}

await main();
