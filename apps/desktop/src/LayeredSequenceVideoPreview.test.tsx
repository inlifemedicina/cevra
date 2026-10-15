import { createHash, randomUUID, webcrypto } from "node:crypto";
import { Blob as NodeBlob } from "node:buffer";
import { createRef, type ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LocalVideoPreview, LocalVideoPreviewRequest } from "@cevra/application";
import type { DesktopBackend } from "./backend/desktop-backend";
import { LayeredSequenceVideoPreview } from "./components/LayeredSequenceVideoPreview";
import { ManualSequenceVideoPreview } from "./components/ManualSequenceVideoPreview";
import { createEmptyProject, ProjectHistory, manualTitleGraphic, type ManualTitle } from "@cevra/project-ir";
import type { ManualRangeDraftController } from "./components/ManualSequenceControls";

const sha=(data:Uint8Array)=>createHash("sha256").update(data).digest("hex");
const baseBytes=new Uint8Array([1,2,3,4]),baseId=sha(baseBytes);
function png(w:number,h:number){const bytes=new Uint8Array(24);bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);const view=new DataView(bytes.buffer);view.setUint32(16,w);view.setUint32(20,h);return {mimeType:"image/png" as const,width:w,height:h,base64:btoa(String.fromCharCode(...bytes)),sha256:sha(bytes)}}
const title:ManualTitle={version:2,componentId:"cevra.title.lower-third.inter.v1",text:"Ação",startFrame:90,endFrame:210,aspect:"16:9",layout:{version:1,x:.12,y:.25,width:.72,fontScale:.98}};
type Props=ComponentProps<typeof LayeredSequenceVideoPreview>;
let callbacks=new Map<number,VideoFrameRequestCallback>(),callbackId=0,draw=vi.fn(),load=vi.fn(),play=vi.fn(),close:ReturnType<typeof vi.fn>[],revoke=vi.fn();
function deferred<T>(){let resolve!:(v:T)=>void,reject!:(v:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
function packet(request:LocalVideoPreviewRequest,t:ManualTitle=title):LocalVideoPreview{
 return {sourceId:"source",snapshotId:request.expectedSnapshotId,durationMs:10000,mimeType:"video/mp4",base64:request.experimentalLayer?.knownBaseId===baseId?"":btoa(String.fromCharCode(...baseBytes)),proxy:{profile:"manual-cfr30-preview-v1",sourceDurationMs:10000},sequence:{timingPolicy:"cfr30",totalFrames:300,clipIds:["clip"]},layered:{version:1,baseId,baseReused:request.experimentalLayer?.knownBaseId===baseId,graphicId:(t.text==="Ação"?"a":"b").repeat(64),title:t,canonical:png(1920,1080) as NonNullable<LocalVideoPreview["layered"]>["canonical"],graphic:png(720,404) as NonNullable<LocalVideoPreview["layered"]>["graphic"],timings:{hostTotalMs:10,basePrepareMs:5,graphicPrepareMs:3,graphicCacheHit:false}}};
}
function fixture(){
 const preview=vi.fn(async(request:LocalVideoPreviewRequest)=>packet(request));
 const backend={previewLocalVideo:preview,cancelOperation:vi.fn().mockResolvedValue(undefined)} as unknown as DesktopBackend;
 const clip={id:"clip",trackId:"v1",sourceId:"source",sourceStartMs:0,sourceEndMs:10000,timelineStartMs:0,timelineEndMs:10000,speed:1,volume:1,opacity:1,frameTiming:{version:1 as const,sourceStartFrame:0,sourceEndFrame:300,timelineStartFrame:0,timelineEndFrame:300}};
 const props:Props={backend,source:{id:"source",kind:"video",uri:"/tmp/synthetic.mp4",displayName:"Synthetic",durationMs:10000},snapshotId:"s1",clip,sequencePreview:[clip],timelineOccupied:true,sequenceEditing:true,frameEditing:true,busy:false,seek:{sequence:1,timelineMs:5000},t:key=>key,onPlayheadChange:vi.fn(),onCreate:vi.fn(),titleEditing:{title,graphicId:"title",snapshotId:"s1",selected:true,onSelect:vi.fn(),onCommit:vi.fn().mockResolvedValue(undefined)},program:{durationMs:10000,resume:false,onPlaybackIntent:vi.fn(),onSeek:vi.fn(),onClipEnd:vi.fn()}};
 return {props,preview,backend,view:(p:Partial<Props>={})=><LayeredSequenceVideoPreview {...props} {...p}/>};
}
beforeEach(()=>{
 callbacks=new Map();callbackId=0;close=[];draw=vi.fn();load=vi.fn();play=vi.fn().mockResolvedValue(undefined);revoke=vi.fn();
 vi.stubGlobal("Blob",NodeBlob);vi.stubGlobal("crypto",{randomUUID,subtle:webcrypto.subtle});
 vi.stubGlobal("ResizeObserver",class{observe(){}disconnect(){}});
 vi.stubGlobal("createImageBitmap",vi.fn(async()=>{const fn=vi.fn();close.push(fn);return {width:1920,height:1080,close:fn} as unknown as ImageBitmap}));
 vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({clearRect:vi.fn(),fillRect:vi.fn(),drawImage:draw,getImageData:()=>({data:new Uint8ClampedArray([0,0,0,255])})} as unknown as CanvasRenderingContext2D);
 vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockReturnValue({x:0,y:0,left:0,top:0,right:720,bottom:404,width:720,height:404,toJSON(){}});
 for(const [key,value] of Object.entries({readyState:2,videoWidth:720,videoHeight:404,duration:10,seeking:false,paused:true}))Object.defineProperty(key.startsWith("video")?HTMLVideoElement.prototype:HTMLMediaElement.prototype,key,{configurable:true,get:()=>value});
 const time=new WeakMap<HTMLMediaElement,number>();Object.defineProperty(HTMLMediaElement.prototype,"currentTime",{configurable:true,get(){return time.get(this)??0},set(v:number){time.set(this,v);queueMicrotask(()=>this.dispatchEvent(new Event("seeked")))}});
 vi.spyOn(HTMLMediaElement.prototype,"pause").mockImplementation(()=>{});vi.spyOn(HTMLMediaElement.prototype,"load").mockImplementation(()=>load());vi.spyOn(HTMLMediaElement.prototype,"play").mockImplementation(()=>play());
 Object.defineProperty(HTMLVideoElement.prototype,"requestVideoFrameCallback",{configurable:true,value:(fn:VideoFrameRequestCallback)=>{callbacks.set(++callbackId,fn);return callbackId}});
 Object.defineProperty(HTMLVideoElement.prototype,"cancelVideoFrameCallback",{configurable:true,value:vi.fn()});
 Object.defineProperty(URL,"createObjectURL",{configurable:true,value:vi.fn(()=>"blob:owned-"+randomUUID())});Object.defineProperty(URL,"revokeObjectURL",{configurable:true,value:revoke});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs()});
async function ready(container:HTMLElement){await waitFor(()=>expect(container.querySelector("canvas.layered-picture")?.getAttribute("data-ready")).toBe("true"));return container.querySelector("video")!}

it("admits base and PNG before ready and preserves its decoder across React frame updates",async()=>{
 const f=fixture(),{container}=render(f.view());const video=await ready(container),url=video.getAttribute("src"),loads=load.mock.calls.length;expect(url).toMatch(/^blob:owned-/);expect(draw).toHaveBeenCalled();expect(loads).toBe(2);
 fireEvent.play(video);await act(async()=>{});expect(video.getAttribute("src")).toBe(url);expect(load).toHaveBeenCalledTimes(loads);
});
it("hides the old picture while a new snapshot is pending and drops a late old response",async()=>{
 const f=fixture(),pending=deferred<LocalVideoPreview>();f.preview.mockImplementationOnce(()=>pending.promise);const {container,rerender}=render(f.view());
 rerender(f.view({snapshotId:"s2",titleEditing:{...f.props.titleEditing!,snapshotId:"s2"}}));await ready(container);const calls=draw.mock.calls.length;
 await act(async()=>pending.resolve(packet({sourceId:"source",expectedSnapshotId:"s1"})));expect(draw).toHaveBeenCalledTimes(calls);expect(container.querySelector("canvas")!.getAttribute("data-snapshot")).toBe("s2");
});
it("reuses the base URL and decoded PNG pair for duration-only Undo/Redo",async()=>{
 const f=fixture(),{container,rerender}=render(f.view());const v=await ready(container),url=v.getAttribute("src"),bitmapCalls=close.length;
 const next={...title,endFrame:240};f.preview.mockImplementationOnce(async r=>packet(r,next));rerender(f.view({snapshotId:"s2",titleEditing:{...f.props.titleEditing!,snapshotId:"s2",title:next}}));await ready(container);
 expect(v.getAttribute("src")).toBe(url);expect(close.length).toBe(bitmapCalls);expect(f.preview.mock.calls.at(-1)![0].experimentalLayer?.knownBaseId).toBe(baseId);
});
it("rejects a queued old video-frame callback after a new seek admission",async()=>{
 const f=fixture(),resume={...f.props.program!,resume:true},{container,rerender}=render(f.view({program:resume}));const v=await ready(container);Object.defineProperty(v,"paused",{configurable:true,value:false});const old=[...callbacks.values()].at(-1)!;
 rerender(f.view({program:resume,seek:{sequence:2,timelineMs:8000}}));await ready(container);const count=draw.mock.calls.length;await act(async()=>old(0,{mediaTime:5} as VideoFrameCallbackMetadata));expect(draw).toHaveBeenCalledTimes(count);expect(container.querySelector("canvas")!.getAttribute("data-frame")).toBe("240");
});
it("does not fallback when a play promise from a previous seek rejects",async()=>{
 const f=fixture(),p=deferred<void>();play.mockReturnValueOnce(p.promise);const {container,rerender}=render(f.view({program:{...f.props.program!,resume:true}}));await ready(container);
 rerender(f.view({seek:{sequence:2,timelineMs:8000}}));await ready(container);await act(async()=>p.reject(new DOMException("Interrupted","AbortError")));expect(screen.queryByText("preview.layerFallback")).toBeNull();
});
it("can finish a second loop after parent-driven restart and retains preview keyboard shortcuts",async()=>{
 const f=fixture(),{container,rerender}=render(f.view());const video=await ready(container);fireEvent.ended(video);expect(f.props.program!.onClipEnd).toHaveBeenCalledTimes(1);
 rerender(f.view({seek:{sequence:2,timelineMs:0}}));await ready(container);fireEvent.ended(video);expect(f.props.program!.onClipEnd).toHaveBeenCalledTimes(2);
 const region=container.querySelector("section")!;fireEvent.keyDown(region,{key:"Home"});expect(f.props.program!.onSeek).toHaveBeenLastCalledWith(0);fireEvent.keyDown(region,{key:"ArrowLeft"});expect(f.props.program!.onSeek).toHaveBeenCalled();
});
it("forwards scrub phases and restores its original position on Escape",async()=>{
 const f=fixture(),onScrub=vi.fn(),{container}=render(f.view({program:{...f.props.program!,resume:true,onScrub}}));await ready(container);const slider=screen.getByRole("slider");
 fireEvent.pointerDown(slider,{button:0,pointerId:7});fireEvent.change(slider,{target:{value:"200"}});fireEvent.keyDown(window,{key:"Escape"});expect(onScrub.mock.calls.map(c=>c[1])).toEqual(["start","move","cancel"]);expect(onScrub.mock.calls.at(-1)![0]).toBe(5000);
});
it("releases bitmaps and base URL when falling back after an invalid current packet",async()=>{
 const f=fixture(),{container,rerender}=render(f.view());const video=await ready(container),url=video.getAttribute("src");f.preview.mockImplementationOnce(async r=>{const p=packet(r);p.layered!.graphic.sha256="0".repeat(64);p.layered!.graphicId="b".repeat(64);return p});
 rerender(f.view({snapshotId:"s2",titleEditing:{...f.props.titleEditing!,snapshotId:"s2"}}));await waitFor(()=>expect(screen.getByText("preview.layerFallback")).toBeTruthy());expect(revoke).toHaveBeenCalledWith(url);expect(close.every(fn=>fn.mock.calls.length===1)).toBe(true);
});
it("keeps experimental mode selected and the draft when action settlement rejects or is pending",async()=>{
 vi.stubEnv("VITE_CEVRA_TITLE_LAYER_EXPERIMENT","1");const f=fixture(),history=new ProjectHistory(createEmptyProject({id:"toggle"}));history.commit({type:"source.add",source:f.props.source!});history.commit({type:"timeline.edit",version:2,edits:[{type:"timeline.timingPolicy.set",timingPolicy:"cfr30"},{type:"track.add",track:{id:"v1",kind:"video",name:"V1",locked:false,hidden:false,muted:false}},{type:"clip.add",clip:f.props.clip!}]});history.commit({type:"graphic.manualTitle.set",graphic:manualTitleGraphic("title",title)});
 const gate=deferred<void>(),onAction=vi.fn(async(action:()=>void|Promise<void>)=>{await gate.promise;await action()}),draftRef=createRef<ManualRangeDraftController>();
 const {container}=render(<ManualSequenceVideoPreview backend={f.backend} project={history.current} clips={history.current.timeline.clips} presentations={new Map()} originalSourceId="source" busy={false} seek={{sequence:1,timelineMs:5000}} t={f.props.t} onPlayheadChange={vi.fn()} onCreate={vi.fn()} titleEditing={{...f.props.titleEditing!,draftRef}} onAction={onAction}/>);await ready(container);
 const checkbox=screen.getByRole("checkbox",{name:"preview.layerExperimental"});fireEvent.click(checkbox);expect((checkbox as HTMLInputElement).checked).toBe(true);await act(async()=>gate.reject({code:"MANUAL_TITLE_INVALID"}));expect((checkbox as HTMLInputElement).checked).toBe(true);expect(container.querySelector("canvas.layered-picture")).toBeTruthy();
});

it("cannot mark a packet ready on metadata without a decoded base frame",async()=>{
 Object.defineProperty(HTMLMediaElement.prototype,"readyState",{configurable:true,get:()=>1});const f=fixture(),{container}=render(f.view());await waitFor(()=>expect(container.querySelector("video")!.getAttribute("src")).toMatch(/^blob:/));
 fireEvent.loadedMetadata(container.querySelector("video")!);expect(container.querySelector("canvas")!.getAttribute("data-ready")).toBe("false");
 Object.defineProperty(HTMLMediaElement.prototype,"readyState",{configurable:true,get:()=>2});fireEvent.loadedData(container.querySelector("video")!);await ready(container);
});
it("closes a late bitmap pair without changing the newly admitted frame",async()=>{
 const slow=deferred<ImageBitmap>(),oldClose=vi.fn();vi.mocked(createImageBitmap).mockImplementationOnce(()=>slow.promise);const f=fixture(),{container,rerender}=render(f.view());await waitFor(()=>expect(createImageBitmap).toHaveBeenCalledTimes(1));
 rerender(f.view({snapshotId:"s2",titleEditing:{...f.props.titleEditing!,snapshotId:"s2"}}));await ready(container);const count=draw.mock.calls.length;
 await act(async()=>slow.resolve({close:oldClose} as unknown as ImageBitmap));await waitFor(()=>expect(oldClose).toHaveBeenCalledTimes(1));expect(draw).toHaveBeenCalledTimes(count);expect(container.querySelector("canvas")!.getAttribute("data-snapshot")).toBe("s2");
});
function sequenceWithDraft(){
 const f=fixture(),history=new ProjectHistory(createEmptyProject({id:"draft-toggle"}));history.commit({type:"source.add",source:f.props.source!});history.commit({type:"timeline.edit",version:2,edits:[{type:"timeline.timingPolicy.set",timingPolicy:"cfr30"},{type:"track.add",track:{id:"v1",kind:"video",name:"V1",locked:false,hidden:false,muted:false}},{type:"clip.add",clip:f.props.clip!}]});history.commit({type:"graphic.manualTitle.set",graphic:manualTitleGraphic("title",title)});
 const draftRef=createRef<ManualRangeDraftController>(),commit=deferred<void>(),onCommit=vi.fn(()=>commit.promise);
 const onAction=async(action:()=>void|Promise<void>)=>{await draftRef.current?.settle();await action()};
 const view=<ManualSequenceVideoPreview backend={f.backend} project={history.current} clips={history.current.timeline.clips} presentations={new Map()} originalSourceId="source" busy={false} seek={{sequence:1,timelineMs:5000}} t={f.props.t} onPlayheadChange={vi.fn()} onCreate={vi.fn()} titleEditing={{...f.props.titleEditing!,draftRef,onCommit}} onAction={onAction}/>;
 return {view,commit,onCommit};
}
it("does not discard an invalid or composing actual title draft when experimental mode is toggled",async()=>{
 vi.stubEnv("VITE_CEVRA_TITLE_LAYER_EXPERIMENT","1");const f=sequenceWithDraft(),{container}=render(f.view);await ready(container);fireEvent.doubleClick(screen.getByRole("button",{name:"title.selectPreview"}));const input=screen.getByRole("textbox",{name:"title.editPreview"}) as HTMLInputElement,checkbox=screen.getByRole("checkbox",{name:"preview.layerExperimental"}) as HTMLInputElement;
 fireEvent.change(input,{target:{value:""}});fireEvent.click(checkbox);await act(async()=>{});expect(checkbox.checked).toBe(true);expect(input.value).toBe("");expect(f.onCommit).not.toHaveBeenCalled();
 fireEvent.change(input,{target:{value:"Novo"}});fireEvent.compositionStart(input);fireEvent.click(checkbox);await act(async()=>{});expect(checkbox.checked).toBe(true);expect(input.value).toBe("Novo");expect(f.onCommit).not.toHaveBeenCalled();
 fireEvent.compositionEnd(input);fireEvent.click(checkbox);await waitFor(()=>expect(f.onCommit).toHaveBeenCalledTimes(1));expect(checkbox.checked).toBe(true);await act(async()=>f.commit.reject({code:"MANUAL_TITLE_INVALID"}));expect(checkbox.checked).toBe(true);expect(input.value).toBe("Novo");
});
it("keeps pointerdown from blurring the title and waits for its commit before Play",async()=>{
 vi.stubEnv("VITE_CEVRA_TITLE_LAYER_EXPERIMENT","1");const f=sequenceWithDraft(),{container}=render(f.view);await ready(container);fireEvent.doubleClick(screen.getByRole("button",{name:"title.selectPreview"}));const input=screen.getByRole("textbox",{name:"title.editPreview"}) as HTMLInputElement;
 fireEvent.change(input,{target:{value:"Novo"}});input.focus();const playButton=screen.getByRole("button",{name:"preview.playLocal"});expect(fireEvent.pointerDown(playButton,{button:0})).toBe(false);expect(document.activeElement).toBe(input);expect(f.onCommit).not.toHaveBeenCalled();
 fireEvent.click(playButton);await waitFor(()=>expect(f.onCommit).toHaveBeenCalledTimes(1));expect(play).not.toHaveBeenCalled();await act(async()=>f.commit.resolve());
});

it.each([true,false])("uses encoded fallback without ResizeObserver (video frame callback present: %s)",async frameCallbackPresent=>{
 vi.stubGlobal("ResizeObserver",undefined);
 if(!frameCallbackPresent)Object.defineProperty(HTMLVideoElement.prototype,"requestVideoFrameCallback",{configurable:true,value:undefined});
 const f=fixture(),{container}=render(f.view());
 await waitFor(()=>expect(screen.getByText("preview.layerFallback")).toBeTruthy());
 expect(container.querySelector("canvas.layered-picture")).toBeNull();
 await waitFor(()=>expect(f.preview.mock.calls.some(([request])=>request.experimentalLayer===undefined)).toBe(true));
 expect(container.querySelector("video.layered-decoder")).toBeNull();
});
