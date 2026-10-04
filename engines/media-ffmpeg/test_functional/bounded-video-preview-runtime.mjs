import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FfmpegMediaEngine, PersistentMediaWorkerClient, ProcessMediaWorkerTransport } from '../dist/index.js';
const runtime = resolve(process.env.CEVRA_AUDIO_SEQUENCE_RUNTIME_ROOT || '');
if (!process.env.CEVRA_AUDIO_SEQUENCE_RUNTIME_ROOT || !process.env.CEVRA_AUDIO_SEQUENCE_PYTHON) throw new Error('An explicit verified runtime is required.');
const root = mkdtempSync(join(tmpdir(), 'cevra-bounded-preview-functional-'));
const ffmpeg = join(runtime, 'bin', 'ffmpeg');
const transport = new ProcessMediaWorkerTransport({ mode: 'release', pythonExecutable: process.env.CEVRA_AUDIO_SEQUENCE_PYTHON,
  workerScript: join(runtime, 'worker', 'cevra_media_worker.py'), renderTimeoutMs: 60000, env: process.env });
const client = new PersistentMediaWorkerClient(transport), engine = new FfmpegMediaEngine(client), measurements = [];
let sequence = 0;
function run(args, output = 'buffer') { return execFileSync(ffmpeg, ['-v', 'error', '-nostdin', ...args], { encoding: output === 'text' ? 'utf8' : undefined, maxBuffer: 32 * 1024 * 1024, timeout: 30000 }); }
function digest(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function wav(path) {
  const count = 6 * 48000, bytes = Buffer.alloc(44 + count * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(48000, 24); bytes.writeUInt32LE(96000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(count * 2, 40);
  for (const ms of [1900, 2100, 3900, 4100]) for (let i = 0; i < 240; i++) bytes.writeInt16LE(Math.round(0.5 * 32767 * Math.sin(i * 2 * Math.PI * 1000 / 48000)), 44 + 2 * (ms * 48 + i));
  writeFileSync(path, bytes);
}
function frameIds(path) {
  const bytes = run(['-i', path, '-map', '0:v:0', '-an', '-fps_mode', 'passthrough', '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1']);
  const size = 128 * 96; assert.equal(bytes.length % size, 0);
  return Array.from({ length: bytes.length / size }, (_, frame) => {
    let id = 0;
    for (let bit = 0; bit < 8; bit++) if (bytes[frame * size + 48 * 128 + bit * 16 + 8] > 128) id |= 1 << bit;
    return id;
  });
}
function pcm(path) { const bytes = run(['-i', path, '-map', '0:a:0', '-vn', '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1']); return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); }
function peak(samples, startMs, endMs) { let maximum = 0; for (let i = Math.floor(startMs * 48); i < Math.min(samples.length, Math.ceil(endMs * 48)); i++) maximum = Math.max(maximum, Math.abs(samples[i])); return maximum; }
try {
  const audio = join(root, 'audio.wav'); wav(audio);
  for (const [rate, numerator, denominator] of [['30', 30, 1], ['30000/1001', 30000, 1001]]) {
    const source = join(root, `source-${numerator}-${denominator}.mov`);
    // Eight monochrome blocks encode the actual frame index; every decoded
    // output frame can be identified independently of clocks/container metadata.
    run(['-y', '-f', 'lavfi', '-i', `nullsrc=s=128x96:r=${rate}:d=6,geq=lum='16+220*mod(floor(N/pow(2,floor(X/16))),2)':cb=128:cr=128`,
      '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'mpeg4', '-q:v', '2', '-c:a', 'pcm_s16le', source]);
    const original = digest(source), ids = frameIds(source); assert.deepEqual(ids, ids.map((_, index) => index));
    for (const [startMs, endMs] of [[2000, 3990], [2010, 3990], [0, 11]]) {
      const output = join(root, `preview-${++sequence}.mp4`);
      const result = await engine.execute({ type: 'trim', inputUri: source, outputUri: output, startMs, endMs, boundedPreview: true }, { jobId: `preview-${sequence}`, locale: 'en-US' });
      assert.equal(result.type, 'file'); const expected = ids.filter(id => id * denominator * 1000 >= startMs * numerator && id * denominator * 1000 < endMs * numerator);
      const decoded = frameIds(output); assert.deepEqual(decoded, expected, 'actual decoded frame content must stay inside [IN, OUT)');
      assert.equal(result.boundedPreview.frameCount, expected.length); assert.equal(result.boundedPreview.outputSha256, digest(output));
      assert.ok(statSync(output).size <= 8 * 1024 * 1024);
      const samples = pcm(output); const evidence = result.boundedPreview.audio;
      assert.equal(samples.length, evidence.decodedSamples); assert.equal(evidence.inputSamples, (endMs - startMs) * 48);
      assert.ok(samples.length >= evidence.inputSamples && samples.length < evidence.inputSamples + 1024);
      if (startMs >= 2000) {
        assert.ok(peak(samples, 0, 60) < 0.001, 'pre-IN sentinel must be absent in decoded audio');
        assert.ok(peak(samples, 2100 - startMs, 2105 - startMs) > 0.1, 'included first audio sentinel must survive');
        assert.ok(peak(samples, 3900 - startMs, 3905 - startMs) > 0.1, 'included last audio sentinel must survive');
        assert.ok(peak(samples, endMs - startMs - 40, samples.length / 48) < 0.001, 'tail/padding must not contain post-OUT sentinel');
      }
      assert.equal(digest(source), original);
      measurements.push({ rate, startMs, endMs, firstSourceFrame: decoded[0], lastSourceFrame: decoded.at(-1), frameCount: decoded.length,
        durationMs: result.durationMs, inputAudioSamples: evidence.inputSamples, decodedAudioSamples: samples.length, paddingSamples: samples.length - evidence.inputSamples, originalUnchanged: true });
    }
    // Negative control: serving the full original fails the same content test,
    // even if a UI counter is clamped to the requested OUT.
    assert.throws(() => assert.deepEqual(ids, ids.filter(id => id * denominator * 1000 >= 2000 * numerator && id * denominator * 1000 < 3990 * numerator)));
  }
  const vfr = join(root, 'vfr.mov');
  run(['-y', '-f', 'lavfi', '-i', 'testsrc2=s=128x96:r=30:d=2', '-vf', 'select=not(eq(mod(n\\,5)\\,0))', '-fps_mode', 'vfr', '-c:v', 'mpeg4', vfr]);
  await assert.rejects(engine.execute({ type: 'trim', inputUri: vfr, outputUri: join(root, 'rejected.mp4'), startMs: 0, endMs: 1000, boundedPreview: true }, { jobId: 'preview-vfr', locale: 'en-US' }));
  process.stdout.write(JSON.stringify({ status: 'PASS', mode: 'exact-release-runtime', runtime: await client.info(), measurements, vfrRejected: true, fullOriginalNegativeControlRejected: true }, null, 2) + '\n');
} finally { await transport.settle(); await client.close(); rmSync(root, { recursive: true, force: true }); }
