import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, lstat, readdir, rm, symlink, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { createEmptyProject, ProjectHistory } from '@cevra/project-ir';
import { ManualVideoClipApplicationService } from '@cevra/application';
import { NodeMediaArtifactStore } from '@cevra/media-ffmpeg';
import { DesktopSession, DesktopHostProtocolServer } from '../dist/index.js';
import { DerivedVideoPreview } from '../dist/derived-video-preview.js';
const unavailable = { available: false, reason: 'runtime-not-configured' };

async function setup(t, execute, settle, fixtureBytes = Buffer.from('bounded original transport fixture')) {
  const root = await mkdtemp(join(tmpdir(), 'cevra-derived-preview-test-')); t.after(() => rm(root, { recursive: true, force: true }));
  const sourcePath = join(root, 'original.mp4'), bytes = fixtureBytes; await writeFile(sourcePath, bytes);
  const history = new ProjectHistory(createEmptyProject({ id: 'derived-preview' }));
  const source = { id: 'source', kind: 'video', uri: sourcePath, displayName: 'original.mp4', durationMs: 6000, sampleRate: 48000, channels: 1,
    technicalDescriptor: { version: 1, basis: 'ingest', content: { sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length },
      method: { profile: 'cevra.source-technical.v1', engineId: 'test', engineVersion: '1', engineApiVersion: 1 }, video: { codec: 'h264' }, audio: { codec: 'aac' } },
    extensions: { 'cevra.ingest': { method: 'local', hasVideo: true } } };
  history.commit({ type: 'source.add', source });
  const manual = new ManualVideoClipApplicationService({ history, identity: new NodeMediaArtifactStore(), idGenerator: () => 'test' });
  const created = await manual.create({ sourceId: 'source', expectedSnapshotId: history.current.history.headSnapshotId, sourceStartMs: 1000, sourceEndMs: 4000 });
  const calls = [];
  const engine = { async execute(op, context) { calls.push(op); if (op.type === 'extract-frame') return frameResult(op); return execute ? execute(op, context, { root, sourcePath, bytes, history }) : result(op); } };
  const service = new DerivedVideoPreview({ history, engine, temporaryRoot: root, ...(settle ? { settle } : {}) });
  const session = new DesktopSession({ history, manualVideoClip: manual, derivedVideoPreview: service, mediaCapability: unavailable, transcriptionCapability: unavailable });
  t.after(() => session.close());
  const request = { sourceId: 'source', clipId: created.clipId, operationId: 'preview-test', expectedSnapshotId: history.current.history.headSnapshotId };
  return { root, sourcePath, bytes, history, session, request, calls, service };
}
async function frameResult(op) {
  const png = Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
  png.writeUInt32BE(13,8); png.write('IHDR',12); png.writeUInt32BE(128,16); png.writeUInt32BE(96,20);
  await writeFile(op.outputUri,png,{flag:'wx'}); const s=await lstat(op.outputUri,{bigint:true});
  return {type:'file',outputUri:op.outputUri,probe:{uri:op.outputUri,width:128,height:96},publication:{version:1,scheme:'posix-dev-inode',device:String(s.dev),inode:String(s.ino)}};
}
async function result(op, mutate) {
  await writeFile(op.outputUri, Buffer.from('derived transport fixture'), { flag: 'wx' });
  const metadata = await lstat(op.outputUri, { bigint: true });
  const response = { type: 'file', outputUri: op.outputUri, durationMs: op.endMs - op.startMs,
    probe: { uri: op.outputUri, hasVideo: true, hasAudio: true, audioCodec: 'aac', width: 128, height: 96, rotationDegrees: 0 }, effectiveProfile: { container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
    publication: { version: 1, scheme: 'posix-dev-inode', device: String(metadata.dev), inode: String(metadata.ino) },
    boundedPreview: { version: 2, inputSha256: createHash('sha256').update(await readFile(op.inputUri)).digest('hex'), sourceTimesMs: Array.from({ length: Math.round((op.endMs - op.startMs) * 30 / 1000) }, (_, i) => op.startMs + i * 1000 / 30), outputTimesMs: Array.from({ length: Math.round((op.endMs - op.startMs) * 30 / 1000) }, (_, i) => i * 1000 / 30), timeBaseToleranceMs: 0.1, durationToleranceMs: 35, width: 128, height: 96, sourceRotation: 0, audioPadding: { leadingSamples: 0, trailingSamples: 0 }, sourceStartMs: op.startMs, sourceEndMs: op.endMs, firstFrameMs: op.startMs, lastFrameMs: op.endMs - 1000 / 30, frameCount: Math.round((op.endMs - op.startMs) * 30 / 1000), frameRate: 30, outputSha256: createHash('sha256').update(await readFile(op.outputUri)).digest('hex'), audio: { sampleRate: 48000, channels: 1, inputSamples: (op.endMs - op.startMs) * 48, decodedSamples: (op.endMs - op.startMs) * 48 } } };
  return mutate ? mutate(response) : response;
}
async function noTemporaryFiles(root) { assert.deepEqual((await readdir(root)).filter(name => name.startsWith('cevra-video-preview-')), []); }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

test('exact range cache revalidates source and rebinds a fresh snapshot after undo without rendering',async t=>{
  const f=await setup(t); const first=await f.session.previewLocalVideo(f.request);
  f.history.commit({type:'clip.trim',clipId:f.request.clipId,timelineStartMs:0,timelineEndMs:1990,sourceStartMs:2000,sourceEndMs:3990});
  const next={...f.request,operationId:'new-range',expectedSnapshotId:f.history.current.history.headSnapshotId};
  const changed=await f.session.previewLocalVideo(next);assert.equal(changed.clip.sourceStartMs,2000);
  f.history.undo();const old=await f.session.previewLocalVideo({...f.request,operationId:'undo-hit',expectedSnapshotId:f.history.current.history.headSnapshotId});
  assert.equal(old.base64,first.base64);assert.deepEqual(old.initialFrame,first.initialFrame);
  f.history.redo();const redoRequest={...next,operationId:'redo-hit',expectedSnapshotId:f.history.current.history.headSnapshotId};
  const before=f.history.toArchive();const redone=await f.session.previewLocalVideo(redoRequest);
  assert.equal(redone.snapshotId,redoRequest.expectedSnapshotId);assert.deepEqual(f.history.toArchive(),before);
  assert.equal(f.calls.filter(op=>op.type==='trim').length,2);assert.equal(f.calls.filter(op=>op.type==='extract-frame').length,2);
  await noTemporaryFiles(f.root);
});

test('cached range never serves a changed source and is evicted on failed identity',async t=>{
 const f=await setup(t);await f.session.previewLocalVideo(f.request);assert.equal(f.service.cacheState().entries,1);
 await writeFile(f.sourcePath,Buffer.alloc(f.bytes.length,90));
 await assert.rejects(f.session.previewLocalVideo({...f.request,operationId:'changed-hit'}),{code:'MANUAL_VIDEO_SOURCE_CHANGED'});
 assert.equal(f.service.cacheState().entries,0);assert.equal(f.calls.filter(op=>op.type==='trim').length,1);
});

test('runtime identity change invalidates exact derivative reuse',async t=>{
 const f=await setup(t);let identity='verified-runtime-a';f.service.options.runtimeIdentity=()=>identity;
 await f.session.previewLocalVideo(f.request);identity='verified-runtime-b';
 await f.session.previewLocalVideo({...f.request,operationId:'runtime-replaced'});assert.equal(f.calls.filter(op=>op.type==='trim').length,2);
});

test('a corrupted retained derivative is discarded and regenerated before delivery',async t=>{
 const f=await setup(t);const first=await f.session.previewLocalVideo(f.request);
 f.service.cache.values().next().value.video[0]^=1;
 const second=await f.session.previewLocalVideo({...f.request,operationId:'corruption-fallback'});
 assert.equal(second.base64,first.base64);assert.equal(f.calls.filter(op=>op.type==='trim').length,2);
});

test('a PNG descriptor close failure preserves the identity error and its cache eviction',async t=>{
 const f=await setup(t);await f.session.previewLocalVideo(f.request);
 f.history.commit({type:'clip.trim',clipId:f.request.clipId,timelineStartMs:0,timelineEndMs:1990,sourceStartMs:2000,sourceEndMs:3990});
 const execute=f.service.options.engine.execute.bind(f.service.options.engine);
 f.service.options.engine.execute=async(op,ctx)=>{const r=await execute(op,ctx);if(op.type==='extract-frame')r.publication.inode='0';return r};
 const {default:fs}=await import('node:fs');const {syncBuiltinESMExports}=await import('node:module');const originalOpen=fs.promises.open;
 fs.promises.open=async(...args)=>{const handle=await originalOpen(...args);if(String(args[0]).endsWith('first-frame.png')){const close=handle.close.bind(handle);handle.close=async()=>{await close();throw Error('close failed after identity failure')}}return handle};syncBuiltinESMExports();
 try{
  await assert.rejects(f.session.previewLocalVideo({...f.request,operationId:'close-primary',expectedSnapshotId:f.history.current.history.headSnapshotId}),{code:'MANUAL_VIDEO_SOURCE_CHANGED'});
  assert.equal(f.service.cacheState().entries,0);await noTemporaryFiles(f.root);
 }finally{fs.promises.open=originalOpen;syncBuiltinESMExports()}
});

test('LRU is bounded by entries and bytes and shutdown erases it and rejects new work',async t=>{
 const f=await setup(t);f.service.options.cacheLimits={maxEntries:2,maxBytes:3000};
 for(let i=0;i<3;i++){
  if(i)f.history.commit({type:'clip.trim',clipId:f.request.clipId,timelineStartMs:0,timelineEndMs:3000-i*100,sourceStartMs:1000+i*100,sourceEndMs:4000});
  await f.session.previewLocalVideo({...f.request,operationId:'range-'+i,expectedSnapshotId:f.history.current.history.headSnapshotId});
 }
 assert.equal(f.service.cacheState().entries,2);assert.ok(f.service.cacheState().retainedBytes<=3000);
 f.history.undo();f.history.undo();await f.session.previewLocalVideo({...f.request,operationId:'evicted'});
 assert.equal(f.calls.filter(op=>op.type==='trim').length,4);
 await f.session.close();assert.deepEqual(f.service.cacheState(),{entries:0,retainedBytes:0});
 await assert.rejects(f.session.previewLocalVideo({...f.request,operationId:'closed'}),{code:'OPERATION_CANCELLED'});
 await assert.rejects(f.service.prepare(f.request,new AbortController().signal),{code:'OPERATION_CANCELLED'});
});

test('cancellation while extracting first frame cannot publish a partial cache entry',async t=>{
 const f=await setup(t);const execute=f.service.options.engine.execute.bind(f.service.options.engine),entered=deferred();
 f.service.options.engine.execute=async(op,ctx)=>{if(op.type==='extract-frame'){entered.resolve();await new Promise(r=>ctx.signal.addEventListener('abort',r,{once:true}));ctx.signal.throwIfAborted();}return execute(op,ctx)};
 const task=f.session.previewLocalVideo(f.request),rejected=assert.rejects(task,{code:'OPERATION_CANCELLED'});await entered.promise;
 await f.session.close();await rejected;assert.equal(f.service.cacheState().entries,0);await noTemporaryFiles(f.root);
});

for(const attack of ['signature','dimensions','inode','oversize','decode-failure'])test(`invalid first-frame ${attack} cannot be cached`,async t=>{
 const f=await setup(t);const execute=f.service.options.engine.execute.bind(f.service.options.engine);
 f.service.options.engine.execute=async(op,ctx)=>{
  const r=await execute(op,ctx);if(op.type!=='extract-frame')return r;
  if(attack==='decode-failure')throw Error('extract failed');
  if(attack==='inode')r.publication.inode='0';
  if(attack==='oversize')await truncate(op.outputUri,2*1024*1024+1);
  if(attack==='signature'||attack==='dimensions'){const b=await readFile(op.outputUri);if(attack==='signature')b[0]=0;else b.writeUInt32BE(721,16);await writeFile(op.outputUri,b)}
  return r;
 };
 await assert.rejects(f.session.previewLocalVideo(f.request));assert.equal(f.service.cacheState().entries,0);await noTemporaryFiles(f.root);
});

test('derived preview consumes a private verified copy and leaves original, IR, history and paths untouched', async t => {
  const fixture = await setup(t, async (op, context, f) => {
    assert.notEqual(op.inputUri, f.sourcePath); assert.deepEqual(await readFile(op.inputUri), f.bytes);
    assert.equal((await lstat(dirname(op.inputUri))).mode & 0o777, 0o700); assert.equal((await lstat(op.inputUri)).mode & 0o777, 0o600);
    assert.deepEqual(Object.keys(op).sort(), ['boundedPreview', 'endMs', 'inputUri', 'outputUri', 'previewProfile', 'startMs', 'type']); assert.equal(op.boundedPreview, true);
    return result(op);
  });
  const before = fixture.history.toArchive(); const preview = await fixture.session.previewLocalVideo(fixture.request);
  assert.equal(preview.durationMs, 3000); assert.equal(preview.clip.id, fixture.request.clipId); assert.equal(preview.clip.sourceStartMs, 1000);
  assert.equal(Buffer.from(preview.base64, 'base64').toString(), 'derived transport fixture'); assert.doesNotMatch(JSON.stringify(preview), /\/tmp\//);
  assert.deepEqual(fixture.history.toArchive(), before); assert.deepEqual(await readFile(fixture.sourcePath), fixture.bytes); await noTemporaryFiles(fixture.root);
});

test('replacing the original during render cannot change consumed bytes and rejects admission', async t => {
  const f = await setup(t, async (op, context, f) => { await writeFile(f.sourcePath, Buffer.alloc(f.bytes.length, 88)); assert.deepEqual(await readFile(op.inputUri), f.bytes); return result(op); });
  await assert.rejects(f.session.previewLocalVideo(f.request), { code: 'MANUAL_VIDEO_SOURCE_CHANGED' }); await noTemporaryFiles(f.root);
});

test('trim during a read-only preparation invalidates the derivative without an extra journal entry', async t => {
  const entered = deferred(), release = deferred();
  const f = await setup(t, async op => { entered.resolve(); await release.promise; return result(op); });
  const preview = f.session.previewLocalVideo(f.request); const rejected = assert.rejects(preview, { code: 'MANUAL_VIDEO_STALE' }); await entered.promise;
  const length = f.history.entries.length;
  await f.session.trimManualVideoClip({ clipId: f.request.clipId, expectedSnapshotId: f.request.expectedSnapshotId, sourceStartMs: 2000, sourceEndMs: 3990 });
  release.resolve(); await rejected; assert.equal(f.history.entries.length, length + 1); await noTemporaryFiles(f.root);
});

test('cancel and shutdown await job settlement before deleting owned input/output', async t => {
  const entered = deferred(), aborted = deferred(), release = deferred(); let input;
  const f = await setup(t, async (op, context) => { input = op.inputUri; entered.resolve(); context.signal.addEventListener('abort', () => aborted.resolve(), { once: true }); await release.promise; context.signal.throwIfAborted(); return result(op); });
  const task = f.session.previewLocalVideo(f.request); const rejected = assert.rejects(task, { code: 'OPERATION_CANCELLED' }); await entered.promise;
  const closing = f.session.close(); await aborted.promise;
  assert.ok((await lstat(input)).isFile()); release.resolve(); await rejected; await closing; await noTemporaryFiles(f.root);
});

test('new preview cancels only previous preview and admits the current binding after cleanup', async t => {
  const entered = deferred(); let count = 0;
  const f = await setup(t, async (op, context) => { if (++count === 1) { entered.resolve(); await new Promise(resolve => context.signal.addEventListener('abort', resolve, { once: true })); context.signal.throwIfAborted(); } return result(op); });
  const first = f.session.previewLocalVideo(f.request), cancelled = assert.rejects(first, { code: 'OPERATION_CANCELLED' }); await entered.promise;
  const current = await f.session.previewLocalVideo({ ...f.request, operationId: 'preview-new' }); await cancelled;
  assert.equal(current.clip.id, f.request.clipId); assert.equal(f.session.cancel('preview-test').cancelled, false); await noTemporaryFiles(f.root);
});

for (const attack of ['inode', 'rewrite', 'input-hash', 'pts', 'audio', 'range', 'duration', 'symlink', 'oversized']) test(`derived admission rejects ${attack} and cleans only its owned namespace`, async t => {
  const f = await setup(t, async (op, context, f) => {
    const output = await result(op);
    if (attack === 'inode') output.publication.inode = '0';
    if (attack === 'rewrite') await writeFile(op.outputUri, 'same inode rewritten');
    if (attack === 'input-hash') output.boundedPreview.inputSha256 = '0'.repeat(64);
    if (attack === 'pts') output.boundedPreview.outputTimesMs[10] += 100;
    if (attack === 'audio') output.boundedPreview.audio.decodedSamples = 100;
    if (attack === 'range') output.boundedPreview.sourceEndMs++;
    if (attack === 'duration') output.durationMs = 6000;
    if (attack === 'symlink') { await rm(op.outputUri); await symlink(f.sourcePath, op.outputUri); }
    if (attack === 'oversized') await truncate(op.outputUri, 8 * 1024 * 1024 + 1);
    return output;
  });
  await assert.rejects(f.session.previewLocalVideo(f.request)); assert.deepEqual(await readFile(f.sourcePath), f.bytes); await noTemporaryFiles(f.root);
});

test('Original prepares a cancellable proxy with logical duration and no clip, journal or persisted source', async t => {
  const f = await setup(t), before = f.history.toArchive();
  const preview = await f.session.previewLocalVideo({ sourceId: f.request.sourceId, expectedSnapshotId: f.request.expectedSnapshotId, operationId: 'original-proxy' });
  assert.equal(preview.clip, undefined); assert.deepEqual(preview.proxy, { profile: 'take-v1', sourceDurationMs: 6000 });
  assert.equal(f.calls[0].startMs, 0); assert.equal(f.calls[0].endMs, 6000);
  assert.deepEqual(f.history.toArchive(), before); await noTemporaryFiles(f.root);
});

test('verified source above the IPC ceiling is copied privately and admitted only as a small proxy', async t => {
  const f = await setup(t, undefined, undefined, Buffer.alloc(9 * 1024 * 1024, 37));
  const before = f.history.toArchive(), preview = await f.session.previewLocalVideo(f.request);
  assert.equal(f.calls[0].previewProfile, 'take-v1'); assert.ok(Buffer.from(preview.base64, 'base64').length < 8 * 1024 * 1024);
  assert.deepEqual(await readFile(f.sourcePath), f.bytes); assert.deepEqual(f.history.toArchive(), before); await noTemporaryFiles(f.root);
});

test('RPC requires a complete canonical clip/operation binding and rejects time/path/raw engine overrides', async t => {
  const f = await setup(t); const lines = [];
  const server = new DesktopHostProtocolServer(f.session, { writeProtocolLine(line) { lines.push(JSON.parse(line)); }, writeLog() {}, requestShutdown() {} });
  for (const params of [{ sourceId: 'source', expectedSnapshotId: f.request.expectedSnapshotId, clipId: f.request.clipId }, { ...f.request, startMs: 0 }, { ...f.request, outputUri: '/tmp/arbitrary' }, { ...f.request, argv: [] }, { ...f.request, boundedPreview: true }]) {
    await server.handleLine(JSON.stringify({ protocolVersion: 1, id: 'invalid', method: 'video.previewLocal', params }));
  }
  assert.equal(lines.length, 5); assert.ok(lines.every(line => line.error.code === 'HOST_INVALID_PARAMS')); assert.equal(f.calls.length, 0);
});

test('worker failure waits for native retirement before cleanup and preserves the primary failure', async t => {
  const draining = deferred(), release = deferred(); let input;
  const f = await setup(t, async op => { input = op.inputUri; throw new Error('worker failed before process retirement'); }, async () => { draining.resolve(); await release.promise; });
  const preview = f.session.previewLocalVideo(f.request), rejected = assert.rejects(preview, { code: 'MANUAL_VIDEO_UNAVAILABLE' });
  await draining.promise; assert.ok((await lstat(input)).isFile()); release.resolve(); await rejected; await noTemporaryFiles(f.root);
});

test('unproved retirement retains owned files and cannot replace a primary error with cleanup failure', async t => {
  let input;
  const f = await setup(t, async op => { input = op.inputUri; throw Object.assign(new Error('primary'), { code: 'MANUAL_VIDEO_SOURCE_CHANGED' }); }, async () => { throw new Error('retirement not proved'); });
  await assert.rejects(f.session.previewLocalVideo(f.request), error => error.code === 'MANUAL_VIDEO_SOURCE_CHANGED' && error.cleanupError.code === 'MANUAL_VIDEO_CLEANUP_FAILED');
  assert.ok((await lstat(input)).isFile()); assert.deepEqual(await readFile(f.sourcePath), f.bytes);
});
