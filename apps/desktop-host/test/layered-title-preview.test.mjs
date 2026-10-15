import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,writeFile,lstat,readdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {createEmptyProject,ProjectHistory} from '@cevra/project-ir';
import {ManualTitleApplicationService} from '@cevra/application';
import {LayeredTitlePreview} from '../dist/layered-title-preview.js';
const sha=b=>createHash('sha256').update(b).digest('hex'),base=Buffer.from('owned prepared base'),title={version:2,componentId:'cevra.title.lower-third.inter.v1',text:'Ação',startFrame:30,endFrame:90,aspect:'16:9',layout:{version:1,x:.12,y:.25,width:.72,fontScale:1}};
const png=(w,h)=>{const p=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]).copy(p);p.writeUInt32BE(w,16);p.writeUInt32BE(h,20);return p};
async function fixture(t,execute,settle){
 const root=await mkdtemp(join(tmpdir(),'cevra-layer-host-unit-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const project=createEmptyProject({id:'layer-host'});project.sources=[{id:'s',kind:'video',uri:join(root,'source.mp4'),displayName:'synthetic',durationMs:6000,width:1920,height:1080,sampleRate:48000,channels:2,technicalDescriptor:{version:1,basis:'ingest',content:{sha256:'a'.repeat(64),sizeBytes:4},method:{profile:'cevra.source-technical.v1',engineId:'test',engineVersion:'1',engineApiVersion:1},video:{codec:'h264',pixelFormat:'yuv420p',colorPrimaries:'bt709',colorTransfer:'bt709',colorSpace:'bt709',colorRange:'tv'},audio:{codec:'aac'}},extensions:{'cevra.ingest':{method:'local',hasVideo:true}}}];
 project.timeline={...project.timeline,timingPolicy:'cfr30',durationMs:6000,tracks:[{id:'v',kind:'video',name:'V1',locked:false,hidden:false,muted:false}],clips:[{id:'c',sourceId:'s',trackId:'v',sourceStartMs:0,sourceEndMs:6000,timelineStartMs:0,timelineEndMs:6000,speed:1,volume:1,opacity:1,frameTiming:{version:1,sourceStartFrame:0,sourceEndFrame:180,timelineStartFrame:0,timelineEndFrame:180}}]};
 const history=new ProjectHistory(project),titles=new ManualTitleApplicationService(history);const set=value=>titles.edit({version:1,type:'set',expectedSnapshotId:history.current.history.headSnapshotId,title:value});set(title);
 let runtime='runtime-1',calls=0,settled=0;
 const engine={async execute(op,context){calls++;return execute?execute(op,context,{history,set,root}):result(op)}};
 const video={async prepare(request,signal,experimental){signal.throwIfAborted();assert.equal(experimental,true);return {sourceId:'s',snapshotId:request.expectedSnapshotId,mimeType:'video/mp4',durationMs:6000,base64:base.toString('base64'),proxy:{profile:'manual-cfr30-preview-v1',sourceDurationMs:6000},sequence:{timingPolicy:'cfr30',totalFrames:180,clipIds:['c']}}}};
 const service=new LayeredTitlePreview({history,video,engine,settle:async()=>{settled++;await settle?.()},runtimeIdentity:()=>runtime,temporaryRoot:root});t.after(()=>service.close());
 const request=()=>({sourceId:'s',sequence:true,expectedSnapshotId:history.current.history.headSnapshotId,operationId:'unit',experimentalLayer:{version:1}});
 return {root,service,history,set,request,prepare:()=>service.prepare(request(),new AbortController().signal),calls:()=>calls,settled:()=>settled,runtime:value=>runtime=value};
}
async function result(op,change){
 const canonical=png(1920,1080),preview=png(720,404);await writeFile(op.canonicalUri,canonical,{flag:'wx'});await writeFile(op.previewUri,preview,{flag:'wx'});
 const pub=async p=>{const s=await lstat(p,{bigint:true});return {version:1,scheme:'posix-dev-inode',device:String(s.dev),inode:String(s.ino)}};
 const r={type:'manual-title-preview',canonicalUri:op.canonicalUri,previewUri:op.previewUri,canonicalSha256:sha(canonical),previewSha256:sha(preview),colourProfile:'kCGColorSpaceCoreMedia709',publications:{canonical:await pub(op.canonicalUri),preview:await pub(op.previewUri)}};if(change)await change(r,op);return r;
}
const empty=async f=>assert.deepEqual((await readdir(f.root)).filter(p=>p.startsWith('cevra-title-preview-')),[]);

test('duration and undo reuse immutable graphic bytes and base identity without History writes',async t=>{
 const f=await fixture(t),first=await f.prepare();assert.equal(f.calls(),1);f.set({...title,endFrame:120});const before=f.history.toArchive(),r=await f.service.prepare({...f.request(),experimentalLayer:{version:1,knownBaseId:first.layered.baseId}},new AbortController().signal);assert.equal(r.base64,'');assert.equal(r.layered.baseReused,true);assert.equal(r.layered.graphicId,first.layered.graphicId);assert.equal(r.layered.timings.graphicCacheHit,true);assert.deepEqual(f.history.toArchive(),before);f.history.undo();const undo=await f.prepare();assert.equal(undo.layered.title.endFrame,90);assert.equal(f.calls(),1);await empty(f);
});
for(const kind of ['hash','dimensions','publication','signature','size'])test(`rejects ${kind} PNG evidence and cleans before retaining`,async t=>{
 const f=await fixture(t,op=>result(op,async(r,op)=>{if(kind==='hash')r.canonicalSha256='0'.repeat(64);if(kind==='publication')r.publications.canonical.inode='0';if(kind==='dimensions'||kind==='signature'){const b=png(1920,1080);if(kind==='dimensions')b.writeUInt32BE(1080,16);else b[0]=0;await writeFile(op.canonicalUri,b);r.canonicalSha256=sha(b)}if(kind==='size'){const b=Buffer.alloc(2*1024*1024+1);await writeFile(op.canonicalUri,b);r.canonicalSha256=sha(b)}}));
 await assert.rejects(f.prepare());assert.equal(f.service.cacheState().entries,0);assert.equal(f.settled(),1);await empty(f);
});
test('rejects a completed old raster after edit then Undo returns the same snapshot',async t=>{
 const f=await fixture(t,async(op,_context,state)=>{const r=await result(op);state.set({...title,text:'B'});state.history.undo();return r});const snapshot=f.history.current.history.headSnapshotId;
 await assert.rejects(f.prepare(),{code:'MANUAL_VIDEO_STALE'});assert.equal(f.history.current.history.headSnapshotId,snapshot);assert.equal(f.service.cacheState().entries,0);await empty(f);
});
test('cancellation after partial producer waits for retirement and clears private artifacts',async t=>{
 const control=new AbortController();let retire,entered;const waiting=new Promise(r=>entered=r),retirement=new Promise(r=>retire=r);let partial,done=false;
 const f=await fixture(t,async(op,ctx)=>{partial=join(op.ownedWorkspaceUri,'partial.tmp');await writeFile(partial,'partial');control.abort();ctx.signal.throwIfAborted()},async()=>{entered();await retirement});
 const pending=f.service.prepare(f.request(),control.signal).finally(()=>{done=true});const rejected=assert.rejects(pending);await waiting;
 assert.equal(done,false);assert.equal((await readFile(partial,'utf8')),'partial');assert.equal(f.service.cacheState().entries,0);retire();await rejected;assert.equal(done,true);assert.equal(f.settled(),1);await empty(f);
});
test('runtime changes cannot admit a pending graphic and a new runtime misses old cache',async t=>{
 let f,change=false;f=await fixture(t,async op=>{const r=await result(op);if(change)f.runtime('runtime-3');return r});const first=await f.prepare();f.runtime('runtime-2');const second=await f.prepare();assert.notEqual(first.layered.graphicId,second.layered.graphicId);assert.equal(second.layered.timings.graphicCacheHit,false);assert.equal(f.calls(),2);
 f.set({...title,text:'new graphic'});change=true;await assert.rejects(f.prepare(),{code:'MANUAL_VIDEO_STALE'});assert.equal(f.service.cacheState().entries,2);await empty(f);
});
test('unsupported title aspect cannot reach experimental rendering',async t=>{
 const f=await fixture(t);f.set({...title,aspect:'9:16'});await assert.rejects(f.prepare(),{code:'MANUAL_LAYER_UNAVAILABLE'});assert.equal(f.calls(),0);await empty(f);
});
test('LRU retains at most four graphics under its byte ceiling and evicts oldest',async t=>{
 const f=await fixture(t);const first=await f.prepare();for(const text of ['B','C','D','E']){f.set({...title,text});await f.prepare()}
 assert.equal(f.service.cacheState().entries,4);assert.ok(f.service.cacheState().retainedBytes<=f.service.cacheState().maxBytes);f.set(title);const again=await f.prepare();assert.equal(again.layered.graphicId,first.layered.graphicId);assert.equal(again.layered.timings.graphicCacheHit,false);assert.equal(f.calls(),6);await empty(f);
});
test('a corrupted retained graphic regenerates before returning any packet',async t=>{
 const f=await fixture(t);await f.prepare();const entry=[...f.service.cache.values()][0];entry.canonical[0]^=1;const p=await f.prepare();assert.equal(f.calls(),2);assert.equal(p.layered.timings.graphicCacheHit,false);await empty(f);
});
