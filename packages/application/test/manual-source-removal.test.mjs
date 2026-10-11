import assert from "node:assert/strict";
import test from "node:test";
import { ProjectHistory, createEmptyProject, frameTimingMilliseconds, manualTitleGraphic, MANUAL_TITLE_COMPONENT } from "@cevra/project-ir";
import { removeManualProjectSource } from "../dist/index.js";
function fixture() {
 const history = new ProjectHistory(createEmptyProject({id:"remove-media"}));
 for(const id of ["a","b"]) history.commit({type:"source.add",source:{id,kind:"video",uri:`/immutable-${id}.mp4`,displayName:id,durationMs:1000,technicalDescriptor:{version:1,basis:"ingest",content:{sha256:"a".repeat(64),sizeBytes:10},method:{profile:"cevra.source-technical.v1",engineId:"fixture",engineVersion:"1",engineApiVersion:1},video:{codec:"h264"}},extensions:{"cevra.ingest":{method:"local",hasVideo:true}}}});
 const edits=[{type:"timeline.timingPolicy.set",timingPolicy:"cfr30"},{type:"track.add",track:{id:"v",kind:"video",name:"V",locked:false,hidden:false,muted:false}}];
 ["a","b","a"].forEach((sourceId,i)=>{const frameTiming={version:1,timelineStartFrame:i*29,timelineEndFrame:(i+1)*29,sourceStartFrame:1,sourceEndFrame:30};edits.push({type:"clip.add",clip:{id:`c${i}`,sourceId,trackId:"v",frameTiming,...frameTimingMilliseconds(frameTiming),speed:1,volume:1,opacity:1}});});
 history.commit({type:"timeline.edit",version:2,edits});
 history.commit({type:"graphic.manualTitle.set",graphic:manualTitleGraphic("t",{version:1,componentId:MANUAL_TITLE_COMPONENT,text:"Title",startFrame:1,endFrame:80,aspect:"16:9"})});return history;
}
test("removes every reviewed occurrence, ripples in frames and clamps title atomically; Undo restores all",()=>{
 const h=fixture(),before=h.current,count=h.entries.length,request={version:2,type:"remove-source",sourceId:"a",dependentClipIds:["c2","c0"],expectedSnapshotId:before.history.headSnapshotId};
 removeManualProjectSource(h,request);assert.equal(h.entries.length,count+1);assert.deepEqual(h.current.sources.map(s=>s.id),["b"]);
 assert.equal(h.current.timeline.clips.length,1);assert.deepEqual(h.current.timeline.clips[0].frameTiming,{version:1,timelineStartFrame:0,timelineEndFrame:29,sourceStartFrame:1,sourceEndFrame:30});assert.equal(h.current.graphics[0].extensions["cevra.manual-title"].endFrame,29);
 const after=h.current;h.undo();assert.deepEqual(h.current,before);h.redo();assert.deepEqual(h.current,after);
});
test("missing/repeated/unreviewed dependency IDs and stale head fail without damaging redo",()=>{
 for(const ids of [[],["c0"],["c0","c0","c2"],["c0","c1","c2"]]) {const h=fixture(),before=h.toArchive();assert.throws(()=>removeManualProjectSource(h,{version:2,type:"remove-source",sourceId:"a",dependentClipIds:ids,expectedSnapshotId:h.current.history.headSnapshotId}));assert.deepEqual(h.toArchive(),before);}
 const h=fixture();const snapshot=h.current.history.headSnapshotId;h.undo();const before=h.toArchive();assert.throws(()=>removeManualProjectSource(h,{version:2,type:"remove-source",sourceId:"a",dependentClipIds:["c0","c2"],expectedSnapshotId:snapshot}));assert.deepEqual(h.toArchive(),before);
});
test("removing last used media removes title, and unused audio needs no engine or timeline conform",()=>{
 const h=fixture();removeManualProjectSource(h,{version:2,type:"remove-source",sourceId:"a",dependentClipIds:["c0","c2"],expectedSnapshotId:h.current.history.headSnapshotId});removeManualProjectSource(h,{version:2,type:"remove-source",sourceId:"b",dependentClipIds:["c1"],expectedSnapshotId:h.current.history.headSnapshotId});assert.equal(h.current.graphics.length,0);assert.equal(h.current.timeline.durationMs,0);
 const legacy=new ProjectHistory(createEmptyProject({id:"unused"}));legacy.commit({type:"source.add",source:{id:"audio",kind:"audio",uri:"/original.wav",displayName:"Audio"}});removeManualProjectSource(legacy,{version:1,type:"remove-source",sourceId:"audio",dependentClipIds:[],expectedSnapshotId:legacy.current.history.headSnapshotId});assert.equal(legacy.current.sources.length,0);legacy.undo();assert.equal(legacy.current.sources[0].uri,"/original.wav");
});
