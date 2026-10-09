import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createEmptyProject, ProjectHistory } from '@cevra/project-ir';
import { DesktopSession, DesktopHostProtocolServer } from '../dist/index.js';
import { SourceThumbnailService } from '../dist/source-thumbnail.js';
const unavailable = { available:false, reason:'runtime-not-configured' };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function deferred() { let resolve; const promise=new Promise(r=>{resolve=r;});return {promise,resolve}; }
async function fixture(t, hook=async()=>{}) {
  const root=await mkdtemp(join(tmpdir(),'cevra-thumbnail-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const original=join(root,'original.mp4'),bytes=Buffer.from('synthetic immutable source');await writeFile(original,bytes);
  const history=new ProjectHistory(createEmptyProject({id:'thumbnail-test'}));
  history.commit({type:'source.add',source:{id:'source',kind:'video',uri:original,displayName:'original.mp4',durationMs:6000,
    technicalDescriptor:{version:1,basis:'ingest',content:{sha256:sha(bytes),sizeBytes:bytes.length},method:{profile:'cevra.source-technical.v1',engineId:'test',engineVersion:'1',engineApiVersion:1},video:{codec:'h264'}},extensions:{'cevra.ingest':{method:'local',hasVideo:true}}}});
  let calls=0;
  const engine={async execute(op,ctx){calls++;assert.equal(op.type,'extract-frame');assert.equal(op.maxDimension,160);assert.equal(op.atMs,0);
    assert.notEqual(op.inputUri,original);assert.deepEqual(await readFile(op.inputUri),bytes);await hook(op,ctx,history,original);
    const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(1,16);png.writeUInt32BE(1,20);
    await writeFile(op.outputUri,png,{flag:'wx'});const stamp=await lstat(op.outputUri,{bigint:true});
    return {type:'file',outputUri:op.outputUri,probe:{uri:op.outputUri,width:1,height:1},publication:{version:1,scheme:'posix-dev-inode',device:String(stamp.dev),inode:String(stamp.ino)}};}};
  const service=new SourceThumbnailService({history,engine,temporaryRoot:root,settle:async()=>{}});
  const session=new DesktopSession({history,sourceThumbnail:service,mediaCapability:unavailable,transcriptionCapability:unavailable});t.after(()=>session.close());
  const request=operationId=>({sourceId:'source',expectedSnapshotId:history.current.history.headSnapshotId,operationId});
  return {root,original,bytes,history,service,session,request,calls:()=>calls};
}
async function noOwned(root) { assert.deepEqual((await readdir(root)).filter(name=>name.startsWith('cevra-source-thumbnail-')),[]); }

test('thumbnail admission/cache stays read-only and rebinds a fresh snapshot after Undo',async t=>{
  const f=await fixture(t),before=f.history.toArchive(),packet=await f.session.thumbnailLocalVideo(f.request('first'));
  assert.equal(packet.sourceId,'source');assert.equal(packet.mimeType,'image/png');assert.equal(packet.width,1);assert.equal(f.calls(),1);
  assert.deepEqual(f.history.toArchive(),before);assert.deepEqual(await readFile(f.original),f.bytes);await noOwned(f.root);
  f.history.commit({type:'project.rename',name:'fresh'});const fresh=await f.session.thumbnailLocalVideo(f.request('cached'));
  assert.notEqual(fresh.snapshotId,packet.snapshotId);assert.equal(fresh.base64,packet.base64);assert.equal(f.calls(),1);
  f.history.undo();await f.session.thumbnailLocalVideo(f.request('undo'));assert.equal(f.calls(),1);assert.equal(f.history.canRedo,true);
});

test('changed original cannot serve a cached card or alter the canonical project',async t=>{
  const f=await fixture(t);await f.session.thumbnailLocalVideo(f.request('first'));const before=f.history.toArchive();
  await writeFile(f.original,Buffer.alloc(f.bytes.length,7));
  await assert.rejects(f.session.thumbnailLocalVideo(f.request('changed')),{code:'MANUAL_VIDEO_SOURCE_CHANGED'});
  assert.equal(f.calls(),1);assert.deepEqual(f.history.toArchive(),before);
});

test('late stale thumbnail and cancellation cannot publish or retain owned files',async t=>{
  const entered=deferred(),release=deferred(),f=await fixture(t,async()=>{entered.resolve();await release.promise;});
  const old=f.session.thumbnailLocalVideo(f.request('late'));const rejected=assert.rejects(old,{code:'MANUAL_VIDEO_STALE'});await entered.promise;
  f.history.commit({type:'project.rename',name:'changed'});release.resolve();await rejected;await noOwned(f.root);
  const controller=new AbortController();controller.abort();await assert.rejects(f.service.prepare(f.request('cancelled'),controller.signal));await noOwned(f.root);
});

test('thumbnail and full preview preparation serialize without cancelling either operation',async t=>{
  const entered=deferred(),release=deferred(),f=await fixture(t,async()=>{entered.resolve();await release.promise;});
  const thumbnail=f.session.thumbnailLocalVideo(f.request('card'));await entered.promise;
  await assert.rejects(f.session.thumbnailLocalVideo(f.request('card')),{code:'OPERATION_DUPLICATE'});
  let previewCalls=0;
  // Trusted injected service isolates scheduling; bytes are admitted in separate tests.
  f.session.services.derivedVideoPreview={async prepare(r){previewCalls++;return {sourceId:r.sourceId,snapshotId:r.expectedSnapshotId,durationMs:6000,mimeType:'video/mp4',base64:'AA=='};}};
  const preview=f.session.previewLocalVideo(f.request('player'));await new Promise(resolve=>setImmediate(resolve));assert.equal(previewCalls,0);
  release.resolve();await thumbnail;await preview;assert.equal(previewCalls,1);await noOwned(f.root);
});

test('thumbnail IPC admits IDs only and rejects paths, time overrides, clip/sequence and missing operation',async t=>{
  const f=await fixture(t),before=f.history.toArchive(),lines=[];
  const server=new DesktopHostProtocolServer(f.session,{writeProtocolLine:line=>lines.push(JSON.parse(line)),writeLog(){},requestShutdown(){}});
  for(const extra of ['path','inputUri','atMs','clipId','sequence']) {
    await server.handleLine(JSON.stringify({protocolVersion:1,id:extra,method:'video.thumbnailLocal',params:{...f.request(extra),[extra]:'/injected'}}));assert.ok(lines.at(-1).error);
  }
  await server.handleLine(JSON.stringify({protocolVersion:1,id:'missing',method:'video.thumbnailLocal',params:{...f.request('missing'),operationId:undefined}}));assert.ok(lines.at(-1).error);
  assert.equal(f.calls(),0);assert.deepEqual(f.history.toArchive(),before);
});


test('cancelling an in-flight extraction waits for its owned reader before cleanup',async t=>{
  const entered=deferred(),release=deferred(),f=await fixture(t,async()=>{entered.resolve();await release.promise;});
  const pending=f.session.thumbnailLocalVideo(f.request('cancel-active')),rejected=assert.rejects(pending,{code:'OPERATION_CANCELLED'});
  await entered.promise;assert.equal(f.session.cancel('cancel-active').cancelled,true);
  assert.equal((await readdir(f.root)).filter(name=>name.startsWith('cevra-source-thumbnail-')).length,1);
  release.resolve();await rejected;await noOwned(f.root);
});
