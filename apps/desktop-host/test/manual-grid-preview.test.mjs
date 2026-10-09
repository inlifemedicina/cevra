import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { link, lstat, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createEmptyProject, framesToMilliseconds, ProjectHistory } from '@cevra/project-ir';
import { ManualVideoSequenceApplicationService } from '@cevra/application';
import { NodeMediaArtifactStore } from '@cevra/media-ffmpeg';
import { DesktopSession, DesktopHostProtocolServer } from '../dist/index.js';
import { DerivedVideoPreview } from '../dist/derived-video-preview.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const unavailable = { available: false, reason: 'runtime-not-configured' };
async function publication(path) { const s = await lstat(path, { bigint: true }); return { version: 1, scheme: 'posix-dev-inode', device: String(s.dev), inode: String(s.ino) }; }

async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cevra-grid-preview-test-')); t.after(() => rm(root, { recursive: true, force: true }));
  const original = join(root, 'original.mp4'), input = Buffer.from('synthetic grid source descriptor, not decoded video'); await writeFile(original, input);
  const sampleRate = options.sampleRate ?? 48000, sourceDurationMs = options.sourceDurationMs ?? 6000, audioOriginSamples = options.audioOriginSamples ?? 0;
  const history = new ProjectHistory(createEmptyProject({ id: 'synthetic-grid' }));
  history.commit({ type: 'source.add', source: { id: 'source', kind: 'video', uri: original, displayName: 'Original', durationMs: sourceDurationMs, width: 1920, height: 1080, sampleRate, channels: 1,
    technicalDescriptor: { version: 1, basis: 'ingest', content: { sha256: sha(input), sizeBytes: input.length },
      method: { profile: 'cevra.source-technical.v1', engineId: 'synthetic', engineVersion: '1', engineApiVersion: 1 }, video: { codec: 'h264', avgFrameRate: '30/1' }, audio: { codec: 'aac' } },
    extensions: { 'cevra.ingest': { method: 'local', hasVideo: true } } } });
  const editor = new ManualVideoSequenceApplicationService({ history, identity: new NodeMediaArtifactStore() });
  await editor.edit(options.legacy ? { version: 1, type: 'append', expectedSnapshotId: history.current.history.headSnapshotId, sourceId: 'source', sourceStartMs: 507, sourceEndMs: 1535 }
    : { version: 2, type: 'append', expectedSnapshotId: history.current.history.headSnapshotId, sourceId: 'source', sourceStartFrame: 15, sourceEndFrame: 46 });
  const calls = [], hooks = {}, engine = { async execute(operation, context) {
    calls.push(operation); context.signal.throwIfAborted();
    if (operation.type === 'extract-frame') {
      assert.equal(operation.maxDimension, calls.at(-2).type === 'render-manual-video-preview' ? 720 : undefined); assert.equal(operation.atMs, 0);
      await hooks.beforeExtract?.(operation, context);
      const bytes = Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes); bytes.writeUInt32BE(13, 8); bytes.write('IHDR', 12); bytes.writeUInt32BE(720, 16); bytes.writeUInt32BE(404, 20);
      await writeFile(operation.outputUri, bytes, { flag: 'wx' });
      return { type: 'file', outputUri: operation.outputUri, probe: { uri: operation.outputUri, width: 720, height: 404 }, publication: await publication(operation.outputUri) };
    }
    if (operation.type === 'trim') {
      assert.equal(operation.previewProfile, 'take-v1'); assert.equal(operation.boundedPreview, true);
      assert.equal(operation.startMs, 0); assert.equal(operation.endMs, sourceDurationMs);
      assert.notEqual(operation.inputUri, original); assert.deepEqual(await readFile(operation.inputUri), input);
      const bytes = Buffer.from('synthetic source-clock Take derivative'); await writeFile(operation.outputUri, bytes, { flag: 'wx' });
      const samples = Math.ceil(sourceDurationMs * sampleRate / 1000);
      const sourceTimesMs = Array.from({ length: 180 }, (_, i) => i * 1000 / 30 + (i % 2 ? .5 : 0));
      return { type: 'file', outputUri: operation.outputUri, durationMs: sourceDurationMs, publication: await publication(operation.outputUri),
        probe: { uri: operation.outputUri, width: 720, height: 404, rotationDegrees: 0, hasVideo: true, hasAudio: true, audioCodec: 'aac' },
        effectiveProfile: { container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
        boundedPreview: { version: 2, inputSha256: sha(input), sourceTimesMs, outputTimesMs: [...sourceTimesMs], timeBaseToleranceMs: .1, durationToleranceMs: 40,
          width: 720, height: 404, sourceRotation: 0, audioPadding: { leadingSamples: audioOriginSamples, trailingSamples: 0 },
          sourceStartMs: 0, sourceEndMs: sourceDurationMs, firstFrameMs: 0, lastFrameMs: sourceTimesMs.at(-1), frameCount: sourceTimesMs.length, frameRate: 30,
          outputSha256: sha(bytes), audio: { sampleRate, channels: 1, inputSamples: samples, decodedSamples: samples + 360 } } };
    }
    assert.equal(operation.type, 'render-manual-video-preview');
    // Manual audio admission is deliberately unchanged: no fabricated samples
    // before this source's measured origin, even for preview.
    assert.ok(operation.item.sourceStartFrame * sampleRate / 30 >= audioOriginSamples);
    const job = operation.ownedWorkspaceUri, output = operation.outputUri;
    assert.equal(dirname(job), dirname(output)); assert.notEqual(dirname(output), job); assert.ok(relative(job, output).startsWith('..'));
    assert.equal((await lstat(job)).mode & 0o777, 0o700);
    assert.equal(operation.item.inputUri, original); assert.deepEqual(operation.item.sourceContent, { sha256: sha(input), sizeBytes: input.length });
    assert.equal(operation.item.audioSelection, 'single-source-stream');
    const bytes = Buffer.from('synthetic admitted CFR30 derivative'); await writeFile(output, bytes, { flag: 'wx' });
    await link(output, join(job, 'published-account.mp4'));
    const frames = operation.item.sourceEndFrame - operation.item.sourceStartFrame, durationMs = framesToMilliseconds(frames);
    const result = { type: 'file', outputUri: output, durationMs: Math.round(durationMs), publication: await publication(output),
      probe: { uri: output, width: 720, height: 404, frameRate: 30, rotationDegrees: 0, hasVideo: true, videoCodec: 'h264', hasAudio: true, audioCodec: 'aac', sampleRate: 48000, channels: 1 },
      effectiveProfile: { container: 'mp4', videoCodec: 'h264', audioCodec: 'aac', videoEncoder: 'h264_videotoolbox', audioEncoder: 'aac' },
      manualSequence: { version: 1, profile: 'manual-cfr30-preview-v1', samplingPolicy: 'source-pts-fps30-near-v1', frameRate: { numerator: 30, denominator: 1 },
        container: 'mp4', videoCodec: 'h264', audioCodec: 'aac', dynamicRange: 'sdr', width: 720, height: 404, targetVideoBitsPerSecond: 700000,
        totalFrames: frames, outputFrameCount: frames, totalPcmSamples: frames * 1600, outputAudioSampleCount: frames * 1600, audioSampleRate: 48000,
        audioChannelLayout: 'mono', durationMs, muxVideoDurationMs: durationMs, muxAudioDurationMs: durationMs, outputSha256: sha(bytes), itemCount: 1, uniqueSegmentCount: 1,
        sources: [{ inputUri: original, sha256: sha(input), sizeBytes: input.length, videoStreamIndex: 0, audioStreamIndex: 1, audioStreamCount: 1,
          sampleRate, channelLayout: 'mono', sourceVideoFrameCount: 180, sourceVideoEndMs: sourceDurationMs, sourceAudioFirstSample: audioOriginSamples,
          sourceAudioSampleCount: Math.floor(sourceDurationMs * sampleRate / 1000) - audioOriginSamples }] } };
    return options.mutate ? options.mutate(result) : result;
  } };
  let settled = 0;
  const derived = new DerivedVideoPreview({ history, engine, temporaryRoot: root, runtimeIdentity: () => 'synthetic-sealed-runtime', settle: async () => { settled++; await hooks.beforeSettle?.(); } });
  const session = new DesktopSession({ history, derivedVideoPreview: derived, manualVideoSequence: editor, mediaCapability: unavailable, transcriptionCapability: unavailable }); t.after(() => session.close());
  const request = operationId => ({ sourceId: 'source', clipId: history.current.timeline.clips[0].id, operationId, expectedSnapshotId: history.current.history.headSnapshotId });
  return { root, original, input, history, editor, session, derived, calls, hooks, request, settled: () => settled };
}

test('grid clip uses the admitted CFR30 sampler while Original retains its source-clock Take profile', async t => {
  const f = await fixture(t), before = f.history.toArchive();
  const packet = await f.session.previewLocalVideo(f.request('grid-one'));
  assert.equal(packet.proxy.profile, 'manual-cfr30-preview-v1'); assert.equal(packet.durationMs, framesToMilliseconds(31));
  assert.equal(packet.clip.firstFrameMs, framesToMilliseconds(15)); assert.equal(packet.clip.lastFrameMs, framesToMilliseconds(45));
  assert.equal(packet.initialFrame.sourceTimeMs, framesToMilliseconds(15)); assert.equal(packet.clip.frameCount, 31);
  assert.deepEqual(packet.clip.frameTiming, f.history.current.timeline.clips[0].frameTiming); assert.equal(packet.initialFrame.width, 720);
  const reused = await f.session.previewLocalVideo(f.request('grid-cache')); assert.deepEqual(reused, packet); assert.equal(f.calls.length, 2);
  assert.deepEqual(f.history.toArchive(), before); assert.deepEqual(await readFile(f.original), f.input);
  const original = await f.session.previewLocalVideo({ sourceId: 'source', operationId: 'grid-original', expectedSnapshotId: f.history.current.history.headSnapshotId });
  assert.equal(original.proxy.profile, 'take-v1');
  assert.equal(original.durationMs, 6000); assert.equal(original.initialFrame.sourceTimeMs, 0); assert.equal(original.clip, undefined);
  assert.equal(f.calls.length, 4); assert.equal(f.settled(), 2);
  assert.deepEqual((await readdir(f.root)).filter(name => name.startsWith('cevra-video-preview-')), []);
});

test('a grid cut covered by 30ms-offset audio does not route Original through the stricter manual audio window', async t => {
  const f = await fixture(t, { sampleRate: 44100, audioOriginSamples: 1323, sourceDurationMs: 6007 }), before = f.history.toArchive();
  const cut = await f.session.previewLocalVideo(f.request('covered-offset-cut'));
  assert.equal(cut.proxy.profile, 'manual-cfr30-preview-v1'); assert.equal(cut.clip.frameCount, 31);
  const original = await f.session.previewLocalVideo({ sourceId: 'source', operationId: 'offset-original', expectedSnapshotId: f.history.current.history.headSnapshotId });
  assert.equal(original.proxy.profile, 'take-v1'); assert.equal(original.proxy.sourceDurationMs, 6007); assert.equal(original.durationMs, 6007);
  assert.equal(original.clip, undefined); assert.equal(original.initialFrame.sourceTimeMs, 0);
  assert.equal(f.calls[2].type, 'trim'); assert.equal(f.calls[2].endMs, 6007); assert.equal(f.calls.filter(op => op.type === 'render-manual-video-preview').length, 1);
  const repeated = await f.session.previewLocalVideo({ sourceId: 'source', operationId: 'offset-original-cache', expectedSnapshotId: f.history.current.history.headSnapshotId });
  assert.deepEqual(repeated, original); assert.equal(f.calls.length, 4); assert.deepEqual(f.history.toArchive(), before); assert.deepEqual(await readFile(f.original), f.input);
});

test('grid receipt rejects mismatched source/audio/codec or output hash without admitting bytes or cache', async t => {
  for (const mutate of [r => { r.manualSequence.sources[0].sha256 = 'f'.repeat(64); return r; }, r => { r.manualSequence.sources[0].sampleRate = 44100; return r; },
    r => { r.probe.videoCodec = 'hevc'; return r; }, r => { r.manualSequence.outputSha256 = 'f'.repeat(64); return r; }]) {
    const f = await fixture(t, { mutate }), before = f.history.toArchive();
    await assert.rejects(f.session.previewLocalVideo(f.request('reject-grid')));
    assert.equal(f.derived.cacheState().entries, 0); assert.deepEqual(f.history.toArchive(), before); assert.deepEqual(await readFile(f.original), f.input);
    assert.deepEqual((await readdir(f.root)).filter(name => name.startsWith('cevra-video-preview-')), []);
  }
});

test('grid render file remains bound through PNG extraction and cleanup waits retirement', async t => {
  const f = await fixture(t); let release, entered; const enteredPromise = new Promise(r => { entered = r; }), retirement = new Promise(r => { release = r; });
  f.hooks.beforeExtract = async operation => { await writeFile(operation.inputUri, 'in-place derivative mutation'); };
  f.hooks.beforeSettle = async () => { entered(); await retirement; };
  const pending = f.session.previewLocalVideo(f.request('grid-changing')), rejected = assert.rejects(pending, { code: 'MANUAL_VIDEO_SOURCE_CHANGED' });
  await enteredPromise; assert.equal((await readdir(f.root)).filter(n => n.startsWith('cevra-video-preview-')).length, 1);
  release(); await rejected; assert.equal(f.derived.cacheState().entries, 0); assert.deepEqual(await readFile(f.original), f.input);
});

test('closed conform query returns review-only projection and rejects editing/path fields', async t => {
  const f = await fixture(t, { legacy: true }), before = f.history.toArchive(), lines = [];
  const server = new DesktopHostProtocolServer(f.session, { writeProtocolLine(line) { lines.push(JSON.parse(line)); }, writeLog() {}, requestShutdown() {} });
  const params = { version: 1, expectedSnapshotId: f.history.current.history.headSnapshotId };
  await server.handleLine(JSON.stringify({ protocolVersion: 1, id: 'conform', method: 'video.previewManualSequenceConform', params }));
  assert.equal(lines[0].result.version, 1); assert.equal(lines[0].result.canConform, true); assert.equal(lines[0].result.clips.length, 1);
  assert.equal(lines[0].result.clips[0].boundaries.sourceStart.originalMs, 507);
  await server.handleLine(JSON.stringify({ protocolVersion: 1, id: 'bad-conform', method: 'video.previewManualSequenceConform', params: { ...params, outputUri: '/synthetic', clips: [] } }));
  assert.equal(lines[1].error.code, 'HOST_INVALID_PARAMS'); assert.equal(f.calls.length, 0); assert.deepEqual(f.history.toArchive(), before);
});
