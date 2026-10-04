import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync, statSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FfmpegMediaEngine, PersistentMediaWorkerClient, ProcessMediaWorkerTransport } from '../dist/index.js';

const runtime = resolve(process.env.CEVRA_AUDIO_SEQUENCE_RUNTIME_ROOT || '');
if (!process.env.CEVRA_AUDIO_SEQUENCE_RUNTIME_ROOT || !process.env.CEVRA_AUDIO_SEQUENCE_PYTHON) throw new Error('An explicit verified runtime is required.');
const root = mkdtempSync(join(tmpdir(), 'cevra-take-preview-functional-'));
const ffmpeg = join(runtime, 'bin', 'ffmpeg'), ffprobe = join(runtime, 'bin', 'ffprobe');
const transport = new ProcessMediaWorkerTransport({ mode: 'release', pythonExecutable: process.env.CEVRA_AUDIO_SEQUENCE_PYTHON,
  workerScript: join(runtime, 'worker', 'cevra_media_worker.py'), renderTimeoutMs: 60000, env: process.env });
const client = new PersistentMediaWorkerClient(transport), engine = new FfmpegMediaEngine(client), measurements = [];
let sequence = 0;
function run(args) { return execFileSync(ffmpeg, ['-v', 'error', '-nostdin', ...args], { maxBuffer: 32 * 1024 * 1024, timeout: 30000 }); }
function digest(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function times(path) {
  const data = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_frames', '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', path], { encoding: 'utf8' }));
  return data.frames.map(frame => Number(frame.best_effort_timestamp_time) * 1000);
}
function ids(path) {
  const bytes = run(['-i', path, '-map', '0:v:0', '-an', '-fps_mode', 'passthrough', '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1']);
  const size = 128 * 96; assert.equal(bytes.length % size, 0);
  return Array.from({ length: bytes.length / size }, (_, frame) => {
    let id = 0;
    for (let bit = 0; bit < 8; bit++) if (bytes[frame * size + 48 * 128 + bit * 16 + 8] > 128) id |= 1 << bit;
    return id;
  });
}
function audioFixture(path) {
  const count = 2940 * 48, bytes = Buffer.alloc(44 + count * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(48000, 24); bytes.writeUInt32LE(96000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(count * 2, 40);
  // Audio begins at source 30ms. Pulse locations below use the common source
  // clock; the pulse before IN and after OUT must never enter an excerpt.
  for (const sourceMs of [980, 1130, 1830, 2010]) for (let i = 0; i < 240; i++) bytes.writeInt16LE(Math.round(0.5 * 32767 * Math.sin(i * 2 * Math.PI * 1000 / 48000)), 44 + 2 * ((sourceMs - 30) * 48 + i));
  writeFileSync(path, bytes);
}
function pcm(path) { const bytes = run(['-i', path, '-map', '0:a:0', '-vn', '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1']); return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); }
function peak(samples, start, end) { let maximum = 0; for (let i = Math.floor(start * 48); i < Math.min(samples.length, Math.ceil(end * 48)); i++) maximum = Math.max(maximum, Math.abs(samples[i])); return maximum; }
async function preview(source, startMs, endMs) {
  const output = join(root, `preview-${++sequence}.mp4`), original = digest(source);
  const result = await engine.execute({ type: 'trim', inputUri: source, outputUri: output, startMs, endMs, boundedPreview: true, previewProfile: 'take-v1' }, { jobId: `take-${sequence}`, locale: 'en-US' });
  assert.equal(result.type, 'file'); const evidence = result.boundedPreview;
  assert.equal(evidence.version, 2); assert.equal(evidence.inputSha256, original); assert.equal(evidence.outputSha256, digest(output));
  assert.equal(digest(source), original); assert.ok(statSync(output).size <= 8 * 1024 * 1024);
  assert.equal(result.probe.rotationDegrees, 0);
  assert.ok(Math.max(result.probe.width, result.probe.height) <= 720);
  const sourceTimes = times(source).filter(time => time >= startMs && time < endMs), outputTimes = times(output);
  assert.equal(outputTimes.length, sourceTimes.length);
  for (let i = 0; i < sourceTimes.length; i++) assert.ok(Math.abs(outputTimes[i] - (sourceTimes[i] - startMs)) <= evidence.timeBaseToleranceMs + 0.001);
  measurements.push({ startMs, endMs, inputBytes: statSync(source).size, outputBytes: statSync(output).size, width: result.probe.width, height: result.probe.height,
    sourceRotation: evidence.sourceRotation, frameCount: evidence.frameCount, durationMs: result.durationMs, firstOutputMs: outputTimes[0], originalUnchanged: true });
  return { output, result };
}
try {
  // Barcode proves actual decoded frame identity independently of metadata.
  for (const vfr of [false, true]) {
    const source = join(root, vfr ? 'vfr.mov' : 'cfr.mov');
    run(['-y', '-f', 'lavfi', '-i', "nullsrc=s=128x96:r=30:d=3,geq=lum='16+220*mod(floor(N/pow(2,floor(X/16))),2)':cb=128:cr=128",
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3', ...(vfr ? ['-vf', 'select=not(eq(mod(n\\,5)\\,0))'] : []),
      '-fps_mode', 'passthrough', '-c:v', 'mpeg4', '-q:v', '2', '-c:a', 'pcm_s16le', source]);
    const sourceIds = ids(source), sourceTimes = times(source);
    for (const [start, end] of [[0, 3000], [1010, 1990]]) {
      const { output } = await preview(source, start, end);
      assert.deepEqual(ids(output), sourceIds.filter((_, i) => sourceTimes[i] >= start && sourceTimes[i] < end));
    }
  }
  const wav = join(root, 'edge-audio.wav'), edgeSource = join(root, 'edge-audio.mov'); audioFixture(wav);
  run(['-y', '-f', 'lavfi', '-i', 'testsrc2=s=128x96:r=30:d=3', '-itsoffset', '0.03', '-i', wav, '-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'pcm_s16le', edgeSource]);
  for (const [start, end] of [[0, 3000], [1010, 1990]]) {
    const { output, result } = await preview(edgeSource, start, end), samples = pcm(output), evidence = result.boundedPreview;
    assert.equal(samples.length, evidence.audio.decodedSamples);
    assert.ok(peak(samples, 1130 - start, 1135 - start) > 0.1); assert.ok(peak(samples, 1830 - start, 1835 - start) > 0.1);
    if (start === 0) {
      assert.deepEqual(evidence.audioPadding, { leadingSamples: 1440, trailingSamples: 1440 });
      assert.ok(peak(samples, 0, 20) < 0.001); assert.ok(peak(samples, 2980, samples.length / 48) < 0.001);
    } else {
      assert.deepEqual(evidence.audioPadding, { leadingSamples: 0, trailingSamples: 0 });
      assert.ok(peak(samples, 0, 60) < 0.001); assert.ok(peak(samples, end - start - 40, samples.length / 48) < 0.001);
    }
  }
  const gap = join(root, 'audio-gap.mov');
  run(['-y', '-f', 'lavfi', '-i', 'testsrc2=s=128x96:r=30:d=3', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3',
    '-af', 'aselect=not(between(t\\,1\\,1.1))', '-c:v', 'mpeg4', '-c:a', 'aac', gap]);
  await assert.rejects(engine.execute({ type: 'trim', inputUri: gap, outputUri: join(root, 'gap-rejected.mp4'), startMs: 0, endMs: 3000, boundedPreview: true, previewProfile: 'take-v1' }, { jobId: 'take-gap', locale: 'en-US' }), /gap or overlap/);
  // Actual portrait Full HD geometry; a valid unused tail separates the source
  // transport budget from the bounded payload without a huge committed fixture.
  const portrait = join(root, 'portrait.mov');
  run(['-y', '-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'pcm_s16le', portrait]);
  appendFileSync(portrait, Buffer.alloc(9 * 1024 * 1024));
  assert.ok(statSync(portrait).size > 8 * 1024 * 1024);
  const { result: vertical } = await preview(portrait, 0, 2000);
  assert.equal(vertical.probe.width, 404); assert.equal(vertical.probe.height, 720);
  const base = join(root, 'landscape.mov'), rotated = join(root, 'rotated.mov');
  run(['-y', '-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=30:d=2', '-c:v', 'mpeg4', '-q:v', '5', base]);
  run(['-y', '-display_rotation', '90', '-i', base, '-c', 'copy', rotated]);
  const { output, result: orientation } = await preview(rotated, 0, 2000);
  assert.equal(orientation.probe.width, 404); assert.equal(orientation.probe.height, 720); assert.ok([90, 270].includes(orientation.boundedPreview.sourceRotation));
  // Compare the first asymmetric picture after FFmpeg display rotation. A
  // second rotation or a missed rotation produces a materially different image.
  function picture(path) { return run(['-i', path, '-frames:v', '1', '-vf', 'scale=32:32', '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1']); }
  const expected = picture(rotated), actual = picture(output);
  const mae = expected.reduce((sum, value, i) => sum + Math.abs(value - actual[i]), 0) / expected.length;
  const wrong = picture(base), wrongMae = wrong.reduce((sum, value, i) => sum + Math.abs(value - actual[i]), 0) / wrong.length;
  assert.ok(mae < 20 && wrongMae > mae + 10, `orientation MAE ${mae}, unrotated negative control ${wrongMae}`);
  const quicktime = join(root, 'quicktime-edit-list.mov');
  run(['-y', '-display_rotation', '-90', '-i', base, '-c', 'copy', '-video_track_timescale', '600', quicktime]);
  // Reproduce Apple's origin-normalized matrix and a track edit list hiding
  // exactly two encoded tail packets. Only this generated fixture is modified.
  const movie = readFileSync(quicktime);
  function atom(start, end, type) {
    for (let offset = start; offset < end;) {
      const size = movie.readUInt32BE(offset); assert.ok(size >= 8 && offset + size <= end);
      if (movie.toString('ascii', offset + 4, offset + 8) === type) return { start: offset, end: offset + size };
      offset += size;
    }
    throw new Error(`Missing fixture atom ${type}`);
  }
  const moov = atom(0, movie.length, 'moov'), trak = atom(moov.start + 8, moov.end, 'trak');
  const tkhd = atom(trak.start + 8, trak.end, 'tkhd'), edts = atom(trak.start + 8, trak.end, 'edts');
  const elst = atom(edts.start + 8, edts.end, 'elst'), mvhd = atom(moov.start + 8, moov.end, 'mvhd');
  assert.equal(movie[tkhd.start + 8], 0); assert.equal(movie[elst.start + 8], 0); assert.equal(movie[mvhd.start + 8], 0);
  movie.writeInt32BE(1080 * 65536, tkhd.start + 8 + 40 + 6 * 4);
  const movieScale = movie.readUInt32BE(mvhd.start + 8 + 12);
  movie.writeUInt32BE(Math.floor(1.929 * movieScale), elst.start + 8 + 8);
  writeFileSync(quicktime, movie);
  assert.equal(times(quicktime).length, 58, 'edit list must hide exactly two encoded packets');
  const { result: edited } = await preview(quicktime, 0, 1900);
  assert.equal(edited.boundedPreview.sourceRotation, 270); assert.equal(edited.probe.width, 404); assert.equal(edited.probe.height, 720);
  const longest = join(root, 'maximum-duration.mov');
  run(['-y', '-f', 'lavfi', '-i', 'testsrc2=s=128x96:r=30:d=60', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=60', '-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'pcm_s16le', longest]);
  await preview(longest, 0, 60000);
  process.stdout.write(JSON.stringify({ status: 'PASS', mode: 'exact-release-runtime', measurements, orientationMeanAbsoluteError: mae, unrotatedNegativeControlMeanAbsoluteError: wrongMae, vfrContentVerified: true, audioOffsetAndEdgeSilenceVerified: true, interiorAudioGapRejected: true }, null, 2) + '\n');
} finally { await transport.settle(); await client.close(); rmSync(root, { recursive: true, force: true }); }
