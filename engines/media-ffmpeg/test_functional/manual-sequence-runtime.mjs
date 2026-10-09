import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEmptyProject, framesToMilliseconds, ProjectHistory } from "@cevra/project-ir";
import { deserializeProjectPackage, serializeProjectPackage } from "@cevra/project-store";
import {
  InMemoryMediaExecutionRepository, LocalSourceIngestService, ManualSequenceExportApplicationService,
  ManualSequencePreviewApplicationService, ManualVideoSequenceApplicationService, MediaApplicationService,
  validatePersistedMediaExecutionArchive
} from "@cevra/application";
import { FfmpegMediaEngine, NodeMediaArtifactStore, PersistentMediaWorkerClient, ProcessMediaWorkerTransport } from "../dist/index.js";
import { guardManualExportEngine } from "../../../apps/desktop-host/dist/manual-export-resources.js";
import { DerivedVideoPreview } from "../../../apps/desktop-host/dist/derived-video-preview.js";

// Synthetic inputs and all disposable outputs are exclusively owned by this test.
// No account, user-media directory, GUI, proxy master, or provider is involved.
const runtime = path.resolve(required("CEVRA_AUDIO_SEQUENCE_RUNTIME_ROOT"));
const release = process.env.CEVRA_AUDIO_SEQUENCE_RELEASE === "1";
if (release && process.env.CEVRA_MANUAL_SEQUENCE_WORKER) throw Error("Release acceptance cannot override the sealed worker.");
const root = realpathSync(mkdtempSync(path.join(tmpdir(), "cevra-manual-sequence-functional-")));
const ffmpeg = path.resolve(process.env.CEVRA_AUDIO_SEQUENCE_FFMPEG || path.join(runtime, "bin", "ffmpeg"));
const ffprobe = path.resolve(process.env.CEVRA_AUDIO_SEQUENCE_FFPROBE || path.join(runtime, "bin", "ffprobe"));
const workerScript = release ? path.join(runtime, "worker", "cevra_media_worker.py")
  : path.resolve(process.env.CEVRA_MANUAL_SEQUENCE_WORKER || path.join(runtime, "worker", "cevra_media_worker.py"));
const transport = new ProcessMediaWorkerTransport({ mode: release ? "release" : "development",
  pythonExecutable: required("CEVRA_AUDIO_SEQUENCE_PYTHON"), workerScript,
  controlTimeoutMs: 30_000, renderTimeoutMs: 240_000, renderLivenessIntervalMs: 500,
  env: { ...process.env, PATH: release ? path.join(runtime, "bin") : `${path.dirname(ffmpeg)}${path.delimiter}${process.env.PATH || ""}`,
    CEVRA_MEDIA_RUNTIME_ROOT: runtime, CEVRA_RELEASE_MODE: release ? "1" : "0", PYTHONNOUSERSITE: "1",
    ...(process.env.CEVRA_AUDIO_SEQUENCE_VENDOR ? { CEVRA_FFMPEG_SKILL_ROOT: process.env.CEVRA_AUDIO_SEQUENCE_VENDOR } : {}) }
});
const client = new PersistentMediaWorkerClient(transport), engine = new FfmpegMediaEngine(client);
const artifacts = new NodeMediaArtifactStore(), measurements = [], finalResourceAdmissions = new Map();
const resourceProof = "sampled owned worker/process-group RSS and conservative per-name owned-file accounting; no hard ceiling guarantee";
let executionCount = 0, serial = 0;
const countedEngine = {
  identity: (...args) => engine.identity(...args),
  healthcheck: (...args) => engine.healthcheck(...args),
  capabilities: (...args) => engine.capabilities(...args),
  execute: (...args) => { executionCount++; return engine.execute(...args); }
};

function required(name) { if (!process.env[name]) throw Error(`Missing explicit ${name}.`); return process.env[name]; }
function run(args, timeout = 60_000) {
  return execFileSync(ffmpeg, ["-v", "error", "-nostdin", "-threads", "2", "-filter_threads", "2", ...args],
    { timeout, maxBuffer: 64 * 1024 * 1024 });
}
function probe(args) {
  return JSON.parse(execFileSync(ffprobe, ["-v", "error", ...args, "-of", "json"], { encoding: "utf8", timeout: 60_000, maxBuffer: 16 * 1024 * 1024 }));
}
function sha(uri) { return createHash("sha256").update(readFileSync(uri)).digest("hex"); }
function fraction(text) { const [a, b = "1"] = text.split("/"); return [BigInt(a), BigInt(b)]; }
function nearestPositive(numerator, denominator) { return Number((numerator * 2n + denominator) / (2n * denominator)); }
function frameIds(uri) {
  const bytes = run(["-i", uri, "-map", "0:v:0", "-an", "-vf", "scale=160:90", "-fps_mode", "passthrough", "-pix_fmt", "gray", "-f", "rawvideo", "pipe:1"]);
  const size = 160 * 90; assert.equal(bytes.length % size, 0);
  return Array.from({ length: bytes.length / size }, (_, frame) => {
    let id = 0;
    for (let bit = 0; bit < 8; bit++) if (bytes[frame * size + 45 * 160 + bit * 20 + 10] > 128) id |= 1 << bit;
    return id;
  });
}
function sourceSampler(uri) {
  const data = probe(["-select_streams", "v:0", "-show_streams", "-show_frames", "-show_entries",
    "stream=time_base,avg_frame_rate,has_b_frames:frame=best_effort_timestamp", uri]);
  assert.equal(data.streams.length, 1);
  const [numerator, denominator] = fraction(data.streams[0].time_base), ids = frameIds(uri);
  assert.equal(data.frames.length, ids.length);
  // Independent integer-rational interpretation of the approved PTS sampler:
  // round each display timestamp to the nearest 30Hz boundary, then hold the
  // last picture whose rounded boundary is <= the requested source frame.
  // This oracle neither runs the production fps filter nor reads its receipt.
  const boundaries = data.frames.map(frame => nearestPositive(BigInt(frame.best_effort_timestamp) * numerator * 30n, denominator));
  assert.equal(boundaries[0], 0);
  for (let i = 1; i < boundaries.length; i++) assert.ok(boundaries[i] >= boundaries[i - 1]);
  return { ids, stream: data.streams[0], boundaries,
    interval(start, end) {
      const result = []; let picture = 0;
      for (let frame = start; frame < end; frame++) {
        while (picture + 1 < boundaries.length && boundaries[picture + 1] <= frame) picture++;
        result.push(ids[picture]);
      }
      return result;
    } };
}
function stereoPulses(uri, { durationMs = 2940, startMs = 500 } = {}) {
  const rate = 44_100, samples = Math.round(rate * durationMs / 1000), channels = 2;
  const bytes = Buffer.alloc(44 + samples * channels * 2);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(channels, 22); bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * channels * 2, 28);
  bytes.writeUInt16LE(channels * 2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(samples * channels * 2, 40);
  // Common source clock, not WAV-local clock: the MOV starts its audio at 30ms.
  for (const [channel, events] of [[0, [startMs - 50, startMs + 250, startMs + 1050]], [1, [startMs + 700, startMs + 1100]]]) {
    for (const ms of events) {
      const start = Math.round((ms - 30) * rate / 1000), count = Math.round(rate * 0.004);
      for (let n = 0; n < count; n++) bytes.writeInt16LE(Math.round(0.65 * 32767 * Math.sin(n * 2 * Math.PI * 1100 / rate)), 44 + ((start + n) * channels + channel) * 2);
    }
  }
  writeFileSync(uri, bytes);
}
function createBarcode(uri, rate, audio, { vfr = false, duration = 3, stress = false } = {}) {
  run(["-y", "-f", "lavfi", "-i", `nullsrc=s=160x90:r=${rate}:d=${duration},geq=lum='16+220*mod(floor(N/pow(2,floor(X/20))),2)':cb=128:cr=128`,
    ...(stress ? ["-f", "lavfi", "-i", `aevalsrc=0.01*sin(2*PI*440*t)|0.01*sin(2*PI*660*t):s=48000:d=${duration}`] : ["-itsoffset", "0.03", "-i", audio]),
    ...(vfr ? ["-vf", "select=not(eq(mod(n\\,5)\\,4))"] : []),
    "-map", "0:v:0", "-map", "1:a:0", "-fps_mode", "passthrough", "-c:v", "mpeg4", "-q:v", "2", "-bf", "2", "-g", "12", "-c:a", "pcm_s16le", uri]);
}
function assertOutputClock(uri, frameCount, preview) {
  const data = probe(["-show_streams", "-show_frames", "-show_entries",
    "stream=index,codec_type,codec_name,width,height,pix_fmt,time_base,duration_ts,avg_frame_rate,r_frame_rate,sample_rate,channels,start_pts:frame=media_type,best_effort_timestamp,duration", uri]);
  const video = data.streams.filter(stream => stream.codec_type === "video"), audio = data.streams.filter(stream => stream.codec_type === "audio");
  assert.equal(video.length, 1); assert.equal(audio.length, 1);
  const v = video[0], a = audio[0];
  assert.equal(v.codec_name, "h264"); assert.equal(v.pix_fmt, "yuv420p");
  assert.equal(v.width, preview ? 720 : 1920); assert.equal(v.height, preview ? 404 : 1080);
  assert.equal(v.avg_frame_rate, "30/1"); assert.equal(v.r_frame_rate, "30/1");
  const [vn, vd] = fraction(v.time_base), frames = data.frames.filter(frame => frame.media_type === "video");
  assert.equal(frames.length, frameCount);
  frames.forEach((frame, index) => {
    assert.equal(BigInt(frame.best_effort_timestamp) * vn * 30n, BigInt(index) * vd);
    assert.equal(BigInt(frame.duration) * vn * 30n, vd);
  });
  assert.equal(BigInt(v.duration_ts) * vn * 30n, BigInt(frameCount) * vd);
  assert.equal(a.codec_name, "aac"); assert.equal(a.sample_rate, "48000"); assert.equal(a.channels, 2); assert.equal(Number(a.start_pts), 0);
  const [an, ad] = fraction(a.time_base), expectedSamples = frameCount * 1600;
  assert.equal(BigInt(a.duration_ts) * an * 48_000n, BigInt(expectedSamples) * ad);
  const packets = probe(["-select_streams", "a:0", "-show_packets", "-show_entries", "packet=pts,duration:packet_side_data=skip_samples,discard_padding", uri]).packets;
  let end, terminalDiscard = 0;
  for (let index = 0; index < packets.length; index++) {
    const packet = packets[index], side = packet.side_data_list ?? [];
    const ptsNumerator = BigInt(packet.pts) * an * 48_000n, durationNumerator = BigInt(packet.duration) * an * 48_000n;
    assert.equal(ptsNumerator % ad, 0n); assert.equal(durationNumerator % ad, 0n);
    const pts = Number(ptsNumerator / ad), duration = Number(durationNumerator / ad);
    const skip = side.reduce((sum, entry) => sum + (entry.skip_samples ?? 0), 0), discard = side.reduce((sum, entry) => sum + (entry.discard_padding ?? 0), 0);
    assert.ok(duration > 0 && skip >= 0 && skip <= 1024 && discard >= 0 && discard <= 1024);
    if (index === 0) assert.equal(pts + skip, 0);
    else { assert.equal(pts, end); assert.equal(skip, 0); }
    if (discard) assert.equal(index, packets.length - 1);
    end = pts + duration; terminalDiscard = discard;
  }
  // MP4 may expose a clipped last packet duration and also its AAC discard
  // padding. Do not subtract that padding twice; the track endpoint above is
  // exact, and either representation must independently terminate there.
  assert.ok(end === expectedSamples || end - terminalDiscard === expectedSamples);
  const bytes = run(["-i", uri, "-map", "0:a:0", "-vn", "-c:a", "pcm_f32le", "-f", "f32le", "pipe:1"]);
  assert.equal(bytes.length % 8, 0);
  const decodedSamples = bytes.length / 8;
  assert.equal(decodedSamples, expectedSamples, "Actual decoded PCM must end at the exact edited sample endpoint.");
  const pcm = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  return { expectedSamples, decodedSamples, terminalDiscard, pcm };
}
function peak(pcm, channel, startMs, endMs) {
  let maximum = 0;
  for (let frame = Math.max(0, Math.floor(startMs * 48)); frame < Math.min(pcm.length / 2, Math.ceil(endMs * 48)); frame++) maximum = Math.max(maximum, Math.abs(pcm[frame * 2 + channel]));
  return maximum;
}
function pulseTime(pcm, channel, expectedMs) {
  let maximum = 0, selected = -1;
  for (let frame = Math.max(0, Math.floor((expectedMs - 6) * 48)); frame < Math.min(pcm.length / 2, Math.ceil((expectedMs + 6) * 48)); frame++) {
    const value = Math.abs(pcm[frame * 2 + channel]); if (value > maximum) { maximum = value; selected = frame; }
  }
  assert.ok(maximum > 0.1, `Missing stereo pulse ${channel} at ${expectedMs}ms`);
  assert.ok(Math.abs(selected / 48 - expectedMs) <= 6);
  return selected / 48;
}
function workspace(name) {
  const uri = mkdtempSync(path.join(root, `owned-${name}-`)); chmodSync(uri, 0o700); return uri;
}
async function measured(name, owned, action) {
  const started = performance.now();
  const guarded = await transport.withOwnedRenderBudget({ ownedDirectory: owned,
    rendererRssLimitBytes: 512 * 1024 * 1024, ownedFileLimitBytes: 2 * 1024 * 1024 * 1024 }, action);
  assert.deepEqual(readdirSync(owned), ["published-account.mp4"], "Private originals, graph, PCM and segment staging must be cleaned.");
  measurements.push({ name, wallMs: Math.round(performance.now() - started), resources: guarded.resourceEvidence,
    resourceProof });
  return guarded.result;
}
async function preview(item, oracle, name) {
  const output = path.join(root, `${name}.mp4`), owned = workspace(name);
  const result = await measured(name, owned, () => countedEngine.execute({ type: "render-manual-video-preview", version: 1, item,
    outputUri: output, ownedWorkspaceUri: owned }, { jobId: name, locale: "en-US" }));
  assert.equal(result.type, "file");
  const expectedFrames = item.sourceEndFrame - item.sourceStartFrame;
  assert.deepEqual(frameIds(output), oracle.interval(item.sourceStartFrame, item.sourceEndFrame), `${name} content must match original display-PTS sampling`);
  const clock = assertOutputClock(output, expectedFrames, true);
  assert.equal(result.manualSequence.profile, "manual-cfr30-preview-v1"); assert.equal(result.manualSequence.targetVideoBitsPerSecond, 700_000);
  assert.equal(result.effectiveProfile.videoEncoder, "h264_videotoolbox"); assert.equal(result.effectiveProfile.audioEncoder, "aac");
  assert.equal(result.manualSequence.totalPcmSamples, clock.expectedSamples); assert.equal(result.manualSequence.outputAudioSampleCount, clock.expectedSamples);
  assert.equal(result.manualSequence.outputSha256, sha(output)); assert.ok(statSync(output).size <= 8 * 1024 * 1024);
  assert.equal(await artifacts.matchesPublication(output, result.publication), true);
  assert.equal(await artifacts.matchesPublication(path.join(owned, "published-account.mp4"), result.publication), true);
  await transport.settle(); rmSync(owned, { recursive: true });
  return { output, result, clock };
}
async function projectFor(sources, name) {
  const history = new ProjectHistory(createEmptyProject({ id: name, locale: "en-US" }));
  const executions = new InMemoryMediaExecutionRepository();
  // Use the production Host guard. The tiny trusted transport delegate only
  // records its returned evidence; admission still completes before export.add.
  const tracedTransport = {
    settle: () => transport.settle(),
    async withOwnedRenderBudget(options, action) {
      const guarded = await transport.withOwnedRenderBudget(options, action);
      assert.equal(history.current.exports.length, 0, "Resource admission must finish before canonical export.add.");
      finalResourceAdmissions.set(options.ownedDirectory, guarded.resourceEvidence);
      return guarded;
    }
  };
  const media = new MediaApplicationService({ engine: guardManualExportEngine(countedEngine, tracedTransport, artifacts), history, executions, artifacts });
  const ingest = new LocalSourceIngestService({ media, history, identity: artifacts, idGenerator: () => `probe-${++serial}` });
  for (const [index, uri] of sources.entries()) {
    const { source } = await ingest.ingest({ uri, displayName: path.basename(uri), sourceId: `source-${index}`, expectedKind: "video" });
    assert.equal(source.technicalDescriptor.content.sha256, sha(uri));
  }
  return { history, executions, media, sequence: new ManualVideoSequenceApplicationService({ history, identity: artifacts }) };
}
async function originalSourceClock(fixture, uri, oracle) {
  const before = fixture.history.toArchive(), executionArchive = fixture.executions.toArchive();
  const source = fixture.history.current.sources.find(source => source.id === "source-0");
  const markers = fixture.history.current.timeline.clips.filter(clip => clip.sourceId === source.id)
    .map(clip => [clip.sourceStartMs, clip.sourceEndMs, clip.frameTiming]);
  const temporaryRoot = workspace("original-cache");
  const derived = new DerivedVideoPreview({ history: fixture.history, engine: countedEngine,
    settle: () => transport.settle(), temporaryRoot });
  const request = { sourceId: source.id, expectedSnapshotId: fixture.history.current.history.headSnapshotId, operationId: "original-source-clock" };
  try {
    const packet = await derived.prepare(request, new AbortController().signal);
    assert.equal(packet.sourceId, source.id); assert.equal(packet.snapshotId, request.expectedSnapshotId);
    assert.equal(packet.clip, undefined); assert.deepEqual(packet.proxy, { profile: "take-v1", sourceDurationMs: source.durationMs });
    assert.equal(packet.durationMs, source.durationMs);
    const video = Buffer.from(packet.base64, "base64"), png = Buffer.from(packet.initialFrame.base64, "base64");
    assert.ok(video.length > 0 && video.length <= 8 * 1024 * 1024);
    assert.ok(png.length >= 24 && png.length <= 2 * 1024 * 1024);
    assert.equal(packet.initialFrame.mimeType, "image/png"); assert.equal(packet.initialFrame.sourceTimeMs, 0);
    assert.ok(Math.min(packet.initialFrame.width, packet.initialFrame.height) > 0 && Math.max(packet.initialFrame.width, packet.initialFrame.height) <= 720);
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(png.readUInt32BE(16), packet.initialFrame.width); assert.equal(png.readUInt32BE(20), packet.initialFrame.height);
    const decoded = path.join(root, "original-source-clock.mp4"), initial = path.join(root, "original-source-first.png");
    writeFileSync(decoded, video); writeFileSync(initial, png);
    assert.deepEqual(frameIds(decoded), oracle.ids, "Original keeps every original picture; it does not apply CFR30 source sampling.");
    assert.deepEqual(frameIds(initial), [oracle.ids[0]]);
    const clock = uri => probe(["-select_streams", "v:0", "-show_streams", "-show_frames", "-show_entries",
      "stream=time_base,avg_frame_rate:frame=best_effort_timestamp", uri]);
    const sourceClock = clock(uri), previewClock = clock(decoded);
    assert.equal(sourceClock.streams[0].avg_frame_rate, "24/1"); assert.equal(previewClock.streams[0].avg_frame_rate, "24/1");
    assert.equal(previewClock.frames.length, sourceClock.frames.length);
    const [sn, sd] = fraction(sourceClock.streams[0].time_base), [pn, pd] = fraction(previewClock.streams[0].time_base);
    previewClock.frames.forEach((frame, index) => assert.equal(BigInt(frame.best_effort_timestamp) * pn * sd,
      BigInt(sourceClock.frames[index].best_effort_timestamp) * sn * pd, "Original retains the original source clock at every picture."));
    const audio = probe(["-select_streams", "a:0", "-show_streams", decoded]).streams;
    assert.equal(audio.length, 1); assert.equal(audio[0].codec_name, "aac"); assert.equal(audio[0].sample_rate, "44100"); assert.equal(audio[0].channels, 2);
    // Resampling here is an observation only. The transported Original itself
    // stays at 44.1kHz; common-clock pulses must retain the 30ms source origin.
    const audioBytes = run(["-i", decoded, "-map", "0:a:0", "-vn", "-ar", "48000", "-c:a", "pcm_f32le", "-f", "f32le", "pipe:1"]);
    const originalPcm = new Float32Array(audioBytes.buffer.slice(audioBytes.byteOffset, audioBytes.byteOffset + audioBytes.byteLength));
    assert.ok(peak(originalPcm, 0, 0, 20) < 0.015);
    for (const [channel, ms] of [[0, 450], [0, 750], [1, 1200], [0, 1550], [1, 1600]]) pulseTime(originalPcm, channel, ms);
    const cache = derived.cacheState(); assert.equal(cache.entries, 1); assert.ok(cache.retainedBytes <= 32 * 1024 * 1024);
    const callsBeforeCacheHit = executionCount;
    const hit = await derived.prepare({ ...request, operationId: "original-cache-hit" }, new AbortController().signal);
    assert.deepEqual(hit, packet); assert.equal(executionCount, callsBeforeCacheHit, "Verified Original cache hit must not run another renderer.");
    assert.deepEqual(fixture.history.toArchive(), before); assert.deepEqual(fixture.executions.toArchive(), executionArchive);
    assert.deepEqual(fixture.history.current.timeline.clips.filter(clip => clip.sourceId === source.id)
      .map(clip => [clip.sourceStartMs, clip.sourceEndMs, clip.frameTiming]), markers);
    assert.deepEqual(readdirSync(temporaryRoot), [], "Original private source/proxy/PNG staging must be retired.");
    measurements.push({ name: "original-source-clock", frameCount: previewClock.frames.length, frameRate: "24/1",
      proxyProfile: packet.proxy.profile, audioSampleRate: 44100, audioSourceOffsetMs: 30,
      sourceClockAndMarkersUnchanged: true, audioSourceOriginAndWholeSourcePulsesPreserved: true,
      historyAndExecutionArchiveUnchanged: true, cachedWithoutReplay: true });
    derived.close(); assert.deepEqual(derived.cacheState(), { entries: 0, retainedBytes: 0 });
    await assert.rejects(derived.prepare({ ...request, operationId: "original-closed" }, new AbortController().signal), { code: "OPERATION_CANCELLED" });
  } finally { derived.close(); await transport.settle(); rmSync(temporaryRoot, { recursive: true, force: true }); }
}
function destination(output) {
  const parent = lstatSync(root, { bigint: true });
  const issued = Object.freeze({ label: path.basename(output), availableBytes: 4 * 1024 * 1024 * 1024 });
  function sameParent() {
    const actual = lstatSync(root, { bigint: true }); assert.equal(actual.dev, parent.dev); assert.equal(actual.ino, parent.ino); assert.ok(actual.isDirectory());
  }
  return {
    async prepare(bytes) { sameParent(); assert.ok(bytes < issued.availableBytes); assert.equal(existsSync(output), false); return issued; },
    async revalidate(target, bytes) { assert.equal(target, issued); sameParent(); assert.ok(bytes < issued.availableBytes); assert.equal(existsSync(output), false); },
    resolveOutputUri(target) { assert.equal(target, issued); return output; },
    async revalidatePublication(target, publication) { assert.equal(target, issued); sameParent(); assert.equal(await artifacts.matchesPublication(output, publication), true); }
  };
}
async function finalExport(fixture, name, expectedIds, { compareBarcode = true } = {}) {
  const { history, media, executions } = fixture, before = history.toArchive(), beforeCount = history.entries.length;
  const output = path.join(root, `${name}.mp4`), owned = workspace(name);
  const service = new ManualSequenceExportApplicationService({ history, identity: artifacts, media });
  const started = performance.now();
  const result = await service.execute({ version: 1, expectedSnapshotId: history.current.history.headSnapshotId,
    operationId: name, locale: "en-US" }, destination(output), owned);
  const resources = finalResourceAdmissions.get(owned);
  assert.ok(resources?.samples > 0, "Production Host guard must return actual sampled evidence.");
  assert.deepEqual(readdirSync(owned), ["published-account.mp4"], "Private inputs and intermediates must be cleaned before admission.");
  measurements.push({ name, wallMs: Math.round(performance.now() - started), resources, resourceProof,
    resourceAdmissionBeforeExportCommit: true });
  assert.equal(result.record.status, "succeeded"); assert.equal(history.entries.length, beforeCount + 1);
  assert.equal(history.entries.at(-1).command.type, "export.add"); assert.equal(history.current.exports.length, 1);
  assert.equal(history.current.exports[0].outputUri, output);
  const file = result.record.attempts.at(-1).result;
  if (compareBarcode) assert.deepEqual(frameIds(output), expectedIds, "Final must use original pictures with the same sampling as preview.");
  const clock = assertOutputClock(output, expectedIds.length, false), receipt = file.manualSequence;
  assert.equal(receipt.profile, "manual-cfr30-export-v1"); assert.equal(receipt.targetVideoBitsPerSecond, 20_000_000);
  assert.equal(receipt.totalFrames, expectedIds.length); assert.equal(receipt.totalPcmSamples, clock.expectedSamples);
  assert.equal(receipt.outputAudioSampleCount, clock.expectedSamples); assert.equal(receipt.durationMs, framesToMilliseconds(expectedIds.length));
  assert.equal(receipt.logicalBudget.enforcement, "reserved-logical-space");
  assert.equal(receipt.logicalBudget.budgetBytes, 2 * 1024 ** 3);
  assert.ok(receipt.logicalBudget.peakReservedBytes <= receipt.logicalBudget.budgetBytes);
  assert.equal(receipt.logicalBudget.accountingOverlapReserved, true);
  assert.equal(receipt.logicalBudget.allocatedBlockQuota, false);
  measurements.at(-1).logicalReservations = receipt.logicalBudget;
  assert.equal(receipt.outputSha256, sha(output)); assert.equal(file.probe.videoCodec, "h264"); assert.equal(file.probe.audioCodec, "aac");
  assert.equal(file.effectiveProfile.videoEncoder, "h264_videotoolbox"); assert.equal(file.effectiveProfile.audioEncoder, "aac");
  assert.equal(await artifacts.matchesPublication(output, file.publication), true);
  assert.equal(await artifacts.matchesPublication(path.join(owned, "published-account.mp4"), file.publication), true);
  const executionArchive = validatePersistedMediaExecutionArchive({ ...executions.toArchive(), projectId: history.current.project.id });
  const saved = { project: serializeProjectPackage(history), executions: executionArchive };
  const archivePath = path.join(root, `${name}-archive.json`); writeFileSync(archivePath, JSON.stringify(saved));
  const reopenedArchive = JSON.parse(readFileSync(archivePath, "utf8")), reopened = deserializeProjectPackage(reopenedArchive.project);
  assert.deepEqual(reopened.toArchive(), history.toArchive());
  const executionCallsBeforeReopen = executionCount;
  const reopenedMedia = new MediaApplicationService({ history: reopened, engine: countedEngine,
    executions: new InMemoryMediaExecutionRepository(validatePersistedMediaExecutionArchive(reopenedArchive.executions)), artifacts });
  assert.deepEqual(await reopenedMedia.reconcilePendingWithoutReplay(), []); assert.equal(executionCount, executionCallsBeforeReopen);
  const retainedSources = reopened.current.sources;
  reopened.undo(); assert.equal(reopened.current.exports.length, 0); assert.deepEqual(reopened.current.timeline, before.snapshots.at(-1).project.timeline);
  assert.deepEqual(reopened.current.sources, retainedSources); assert.equal(existsSync(output), true);
  reopened.redo(); assert.equal(reopened.current.exports.length, 1); assert.equal(executionCount, executionCallsBeforeReopen);
  await transport.settle(); rmSync(owned, { recursive: true });
  measurements.at(-1).outputBytes = statSync(output).size;
  return { output, receipt, clock };
}

try {
  assert.equal((await engine.healthcheck()).status, "ready", "The actual sealed runtime must be ready before acceptance.");
  const availableCapabilities = await engine.capabilities();
  for (const id of ["media.cevra-render-manual-video-sequence", "media.cevra-render-manual-video-preview"]) {
    const capability = availableCapabilities.find(value => value.id === id);
    assert.equal(capability?.available, true, `The Host requires available ${id}: ${capability?.detail ?? "missing"}`);
  }
  const audio = path.join(root, "stereo-44100-offset.wav"); stereoPulses(audio);
  const lateAudio = path.join(root, "late-stereo-44100-offset.wav");
  stereoPulses(lateAudio, { durationMs: 34940, startMs: framesToMilliseconds(1000) });
  const configs = [{ name: "cfr24-bframes", rate: "24", vfr: false }, { name: "ntsc-30000-1001", rate: "30000/1001", vfr: false, duration: 35 }, { name: "vfr", rate: "30", vfr: true }];
  const sources = configs.map((config, index) => { const uri = path.join(root, `${config.name}.mov`); createBarcode(uri, config.rate, index === 1 ? lateAudio : audio, config); return uri; });
  const originals = sources.map(uri => ({ uri, sha256: sha(uri), sizeBytes: statSync(uri).size })), oracles = sources.map(sourceSampler);
  assert.ok(oracles[0].stream.has_b_frames > 0, "CFR24 fixture must exercise reordered B frames.");
  assert.equal(oracles[0].stream.avg_frame_rate, "24/1"); assert.equal(oracles[1].stream.avg_frame_rate, "30000/1001");
  assert.ok(oracles[2].ids.some((id, index) => id !== index), "VFR negative control must contain dropped source pictures.");
  assert.notDeepEqual(oracles[0].interval(15, 46), oracles[0].ids.slice(15, 46), "CFR24 negative control must reject frame-index slicing without PTS sampling.");
  assert.notDeepEqual(oracles[1].interval(1000, 1031), oracles[1].ids.slice(1000, 1031), "Late 30000/1001 excerpt must expose fractional-rate phase drift.");
  const fixture = await projectFor(sources, "manual-frame-clock"), ranges = [[0, 15, 46], [1, 1000, 1031], [2, 15, 46], [0, 46, 47], [0, 15, 46]];
  for (const [index, sourceStartFrame, sourceEndFrame] of ranges) {
    const before = fixture.history.entries.length;
    await fixture.sequence.edit({ version: 2, type: "append", expectedSnapshotId: fixture.history.current.history.headSnapshotId,
      sourceId: `source-${index}`, sourceStartFrame, sourceEndFrame });
    assert.equal(fixture.history.entries.length, before + 1); assert.equal(fixture.history.entries.at(-1).command.version, 2);
  }
  assert.equal(fixture.history.current.timeline.timingPolicy, "cfr30");
  await originalSourceClock(fixture, sources[0], oracles[0]);
  const previewPlanService = new ManualSequencePreviewApplicationService({ history: fixture.history, identity: artifacts });
  const plan = await previewPlanService.prepare({ version: 1, expectedSnapshotId: fixture.history.current.history.headSnapshotId });
  assert.equal(previewPlanService.position(plan, framesToMilliseconds(31)).sourceId, "source-1");
  assert.equal(previewPlanService.position(plan, plan.durationMs), null);
  const previews = [];
  for (const [rangeIndex, [index, sourceStartFrame, sourceEndFrame]] of ranges.slice(0, 4).entries()) {
    previews.push(await preview({ inputUri: sources[index], sourceStartFrame, sourceEndFrame,
      sourceContent: { sha256: originals[index].sha256, sizeBytes: originals[index].sizeBytes }, audioSelection: "single-source-stream" }, oracles[index], `preview-${rangeIndex}`));
  }
  for (const preview of previews.slice(0, 3)) {
    pulseTime(preview.clock.pcm, 0, 250); pulseTime(preview.clock.pcm, 1, 700);
    assert.ok(peak(preview.clock.pcm, 0, 0, 30) < 0.015, "Pulse before IN must stay excluded.");
    assert.ok(peak(preview.clock.pcm, 1, 1000, 1033) < 0.015, "Pulse after OUT must stay excluded.");
  }
  pulseTime(previews[3].clock.pcm, 0, 1550 - framesToMilliseconds(46));
  const expectedIds = ranges.flatMap(([index, start, end]) => oracles[index].interval(start, end));
  const final = await finalExport(fixture, "final-31-plus-1-repeated", expectedIds);
  assert.equal(final.receipt.itemCount, 5); assert.equal(final.receipt.uniqueSegmentCount, 4); assert.equal(final.receipt.sources.length, 3);
  for (const source of final.receipt.sources) {
    assert.equal(source.sampleRate, 44_100); assert.equal(source.channelLayout, "stereo"); assert.equal(source.sourceAudioFirstSample, 1323);
    assert.equal(source.audioStreamCount, 1); assert.equal(source.videoStreamIndex, 0); assert.equal(source.audioStreamIndex, 1);
  }
  const pulseMeasurements = []; let cursor = 0;
  for (const [sourceIndex, start, end] of ranges) {
    const sourceIn = sourceIndex === 1 ? framesToMilliseconds(1000) : 500;
    for (const [channel, ms] of [[0, sourceIn + 250], [1, sourceIn + 700], [0, sourceIn + 1050]]) if (ms >= framesToMilliseconds(start) && ms < framesToMilliseconds(end)) {
      const expected = framesToMilliseconds(cursor) + ms - framesToMilliseconds(start);
      pulseMeasurements.push({ channel, expectedMs: expected, observedMs: pulseTime(final.clock.pcm, channel, expected) });
    }
    cursor += end - start;
  }
  assert.equal(cursor, 125);
  const stress = path.join(root, "sixty-second-original.mov"); createBarcode(stress, "30", null, { stress: true, duration: 60 });
  const stressDigest = sha(stress), stressOracle = sourceSampler(stress), stressItem = {
    inputUri: stress, sourceStartFrame: 0, sourceEndFrame: 1800, sourceContent: { sha256: stressDigest, sizeBytes: statSync(stress).size }, audioSelection: "single-source-stream"
  };
  await preview(stressItem, stressOracle, "preview-60-seconds");
  const longFixture = await projectFor([stress], "manual-sixty-second-clock");
  await longFixture.sequence.edit({ version: 2, type: "append", expectedSnapshotId: longFixture.history.current.history.headSnapshotId,
    sourceId: "source-0", sourceStartFrame: 0, sourceEndFrame: 1800 });
  await finalExport(longFixture, "final-60-seconds", stressOracle.interval(0, 1800));
  assert.equal(sha(stress), stressDigest);
  if (process.env.CEVRA_MANUAL_RESOURCE_REPRESENTATIVE === "1") {
    const detailed = path.join(root, "synthetic-fullhd-motion-60s.mov");
    run(["-y", "-f", "lavfi", "-i", "testsrc2=s=1920x1080:r=30:d=60", "-f", "lavfi", "-i", "aevalsrc=0.01*sin(2*PI*440*t)|0.01*sin(2*PI*660*t):s=48000:d=60",
      "-map", "0:v:0", "-map", "1:a:0", "-c:v", "mpeg4", "-q:v", "3", "-bf", "2", "-c:a", "pcm_s16le", detailed], 180_000);
    const originalHash = sha(detailed), fixture = await projectFor([detailed], "manual-fullhd-resource-validation");
    await fixture.sequence.edit({ version: 2, type: "append", expectedSnapshotId: fixture.history.current.history.headSnapshotId,
      sourceId: "source-0", sourceStartFrame: 0, sourceEndFrame: 1800 });
    const rendered = await finalExport(fixture, "final-fullhd-motion-60s", Array(1800), { compareBarcode: false });
    const comparison = spawnSync(ffmpeg, ["-v", "info", "-nostdin", "-threads", "2", "-filter_complex_threads", "2", "-i", detailed, "-i", rendered.output,
      "-filter_complex", "[0:v]setpts=PTS-STARTPTS[ref];[1:v]setpts=PTS-STARTPTS[out];[ref][out]psnr", "-an", "-f", "null", "-"], { timeout: 180_000, encoding: "utf8", maxBuffer: 4 * 1024 ** 2 });
    assert.equal(comparison.status, 0, comparison.stderr);
    const match = comparison.stderr.match(/PSNR[^\n]*average:([0-9.]+|inf)/u);
    assert.ok(match, "Independent full-program quality comparison must report PSNR.");
    const psnr = match[1] === "inf" ? "infinite" : Number(match[1]);
    assert.equal(sha(detailed), originalHash);
    measurements.at(-1).quality = { comparison: "decoded original versus decoded final, whole 60-s 1080p moving test pattern", psnrDb: psnr, perceptualAcceptance: "NOT EXECUTED", sourceSha256Preserved: true, sourceBytes: statSync(detailed).size };
  }
  for (const original of originals) { assert.equal(sha(original.uri), original.sha256); assert.equal(statSync(original.uri).size, original.sizeBytes); }
  process.stdout.write(JSON.stringify({ status: "PASS", mode: release ? "exact-release-runtime" : "development-current-worker-with-explicit-tools",
    platform: `${process.platform}-${process.arch}`, runtime: await client.info(),
    ...(release ? { runtimeManifestSha256: sha(path.join(runtime, "manifest.json")), sealedWorkerSha256: sha(workerScript) } : {}),
    sampler: "independent rational display-PTS barcode oracle",
    actualRuntimeHealthAndManualCapabilitiesVerified: true,
    cfr24BFrames: true, originalSourceClockAndCacheVerified: true, ntsc30000Over1001: true, lateNtscSourceClockVerified: true, vfrPictures: true, repeatedRangeAndSingleFrame: true,
    independent44100StereoOffsetAndPulseClock: true, pulseMeasurements, sourceSha256Preserved: true,
    auditedExportAndArchiveReopenUndoWithoutReplay: true, sixtySecondPreviewAndFinal: true, measurements,
    limitations: ["Resource evidence is sampled; it does not prove an unsampled hard RSS/disk ceiling.",
      "AAC priming/padding, edited MP4 endpoint and actual decoded PCM all agree exactly; pulse localization allows 6ms for lossy AAC waveform shape.",
      "Encoder bitrate is an explicit target, not a guaranteed measured minimum or maximum.",
      "Synthetic runtime acceptance does not replace owner review of visual quality or native picker UX."] }, null, 2) + "\n");
} finally {
  await transport.settle(); await client.close(); rmSync(root, { recursive: true, force: true });
}
