import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { createEmptyProject, ProjectHistory, frameTimingMilliseconds } from "@cevra/project-ir";
import { removeManualProjectSource, ManualTitleApplicationService, type ManualTitleEdit } from "@cevra/application";
import { translate } from "@cevra/i18n";
import { App } from "./App";
import type { DesktopBackend, DesktopBackendState } from "./backend/desktop-backend";

function backendFixture() {
  const history = new ProjectHistory(createEmptyProject({ id: "title-workflow" }));
  history.commit({ type: "source.add", source: {
    id: "source", kind: "video", uri: "/offline-title-workflow.mp4", displayName: "Original.mp4", durationMs: 10000,
    technicalDescriptor: { version: 1, basis: "ingest", content: { sha256: "a".repeat(64), sizeBytes: 10 },
      method: { profile: "cevra.source-technical.v1", engineId: "test", engineVersion: "1", engineApiVersion: 1 }, video: { codec: "h264" } },
    extensions: { "cevra.ingest": { method: "local", hasVideo: true } },
  } });
  const frameTiming = { version: 1 as const, timelineStartFrame: 0, timelineEndFrame: 300, sourceStartFrame: 0, sourceEndFrame: 300 };
  history.commit({ type: "timeline.edit", version: 2, edits: [
    { type: "timeline.timingPolicy.set", timingPolicy: "cfr30" },
    { type: "track.add", track: { id: "v1", kind: "video", name: "V1", hidden: false, locked: false, muted: false } },
    { type: "clip.add", clip: { id: "clip", sourceId: "source", trackId: "v1", ...frameTimingMilliseconds(frameTiming), frameTiming, speed: 1, volume: 1, opacity: 1 } },
  ] });
  const service = new ManualTitleApplicationService(history, () => "workflow");
  const unavailable = { available: false, reason: "desktop-runtime-deferred" as const };
  const available = { available: true, reason: "available" as const };
  const loadState = async (): Promise<DesktopBackendState> => ({
    project: history.current, sourceNumbering: history.sourceNumbering, canUndo: history.canUndo, canRedo: history.canRedo, status: "local-saved",
    capabilities: { "media.import": unavailable, "transcription.transcribe": unavailable,
      "director.execute": unavailable, "changes.apply": unavailable, "project.export": available, "title.edit": available },
  });
  const editManualTitle = vi.fn(async (request: ManualTitleEdit) => {
    const result = service.edit(request); return { state: await loadState(), graphicId: result.graphicId };
  });
  const backend = {
    adapterName: "OfflineTitleWorkflow", presentationOnly: false, loadState, editManualTitle,
    editManualVideoSequence: async (request: Parameters<typeof removeManualProjectSource>[1]) => { const result = removeManualProjectSource(history, request); return { state: await loadState(), changedClipIds: result.changedClipIds }; },
    loadEditorialDraft: async () => ({ status: "empty" }),
    previewLocalVideo: async () => { throw { code: "MANUAL_VIDEO_UNAVAILABLE" }; },
    exportManualSequence: vi.fn(async () => ({ outcome: "cancelled" })),
    cancelOperation: async (operationId: string) => ({ operationId, cancelled: false }),
    undo: async () => { history.undo(); return loadState(); }, redo: async () => { history.redo(); return loadState(); },
  } as unknown as DesktopBackend;
  return { history, backend, editManualTitle };
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(1);
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(1);
  let serial=0;
  Object.defineProperty(URL,"createObjectURL",{configurable:true,value:vi.fn(()=>`blob:workflow-${++serial}`)});
  Object.defineProperty(URL,"revokeObjectURL",{configurable:true,value:vi.fn()});
});
afterEach(() => vi.restoreAllMocks());

async function mountTitle() {
  const fixture = backendFixture();
  await act(async () => { render(<App backend={fixture.backend} />); });
  await waitFor(() => expect(screen.getByLabelText("Texto do título").matches(":disabled")).toBe(false));
  fireEvent.change(screen.getByLabelText("Texto do título"), { target: { value: "Título integrado" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Adicionar título" })); });
  await waitFor(() => expect(fixture.history.current.graphics).toHaveLength(1));
  return fixture;
}

it("keeps one export panel when source/title selection changes after title edits", async () => {
  await mountTitle();
  expect(screen.queryByRole("region", { name: "Exportar sequência" })).toBeNull();
  for (const text of ["Segundo título", "Terceiro título"]) {
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Vídeo 1 · Original.mp4" })); });
    fireEvent.change(screen.getByLabelText("Texto do título"), { target: { value: text } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Aplicar título" })); });
    expect(screen.queryByRole("region", { name: "Exportar sequência" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Exportar" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Exportar" }).closest("header")).not.toBeNull();
  }
});

it("Delete removes a selected timeline title once, with Undo/Redo and guarded text/IME/modal focus", async () => {
  const fixture = await mountTitle();
  const before = fixture.history.current, entries = fixture.history.entries.length;
  const timeline = screen.getByRole("region", { name: translate("pt-BR", "timeline.title") });
  const title = within(timeline).getByRole("button", { name: "Título integrado" });
  fireEvent.click(title);
  title.focus();
  const text = screen.getByLabelText("Texto do título");
  fireEvent.keyDown(text, { key: "Delete" });
  fireEvent.keyDown(title, { key: "Backspace", isComposing: true, keyCode: 229 });
  fireEvent.keyDown(title, { key: "Delete", repeat: true });
  const modal = document.createElement("div"); modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); document.body.append(modal);
  fireEvent.keyDown(title, { key: "Delete" }); modal.remove();
  expect(fixture.history.entries.length).toBe(entries);
  await act(async () => { fireEvent.keyDown(title, { key: "Backspace" }); });
  await waitFor(() => expect(fixture.history.current.graphics).toEqual([]));
  expect(fixture.history.entries.length).toBe(entries + 1);
  expect(fixture.history.current.timeline).toEqual(before.timeline);
  expect(fixture.history.current.sources).toEqual(before.sources);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Desfazer" })); });
  expect(fixture.history.current.graphics).toEqual(before.graphics);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Refazer" })); });
  expect(fixture.history.current.graphics).toEqual([]);
});

it("focuses a clicked title so Delete stays with the selected timeline object", async () => {
  await mountTitle();
  const title = within(screen.getByRole("region", { name: translate("pt-BR", "timeline.title") })).getByRole("button", { name: "Título integrado" });
  await act(async () => { fireEvent.click(title); });
  expect(document.activeElement === title).toBe(true);
});

it("Delete on a media card reviews impact before one project-only removal and Undo restores title/clip/source", async () => {
 const f = await mountTitle(); const before=f.history.current, entries=f.history.entries.length;
 const media=screen.getByRole("button",{name:"Vídeo 1 · Original.mp4"});
 await act(async()=>fireEvent.click(media));
 fireEvent.keyDown(screen.getByLabelText(translate("pt-BR", "media.searchPlaceholder")),{key:"Delete"});expect(f.history.current).toEqual(before);
 await act(async()=>fireEvent.keyDown(media,{key:"Delete"}));
 const dialog=screen.getByRole("dialog"); expect(within(dialog).getByText(/1 trecho/)).toBeTruthy();expect(f.history.current).toEqual(before);
 const cancel=within(dialog).getByRole("button",{name:"Cancelar"}), confirm=within(dialog).getByRole("button",{name:"Retirar mídia e trechos"});
 expect(document.activeElement).toBe(cancel); fireEvent.keyDown(cancel,{key:"Tab"});expect(document.activeElement).toBe(confirm);
 fireEvent.keyDown(confirm,{key:"Tab"});expect(document.activeElement).toBe(cancel);
 fireEvent.keyDown(cancel,{key:"Tab",shiftKey:true});expect(document.activeElement).toBe(confirm);expect(f.history.current).toEqual(before);
 fireEvent.click(cancel);expect(document.activeElement).toBe(media);expect(f.history.current).toEqual(before);
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Retirar mídia do projeto"})));
 await act(async()=>fireEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Retirar mídia e trechos"})));
 expect(f.history.current.sources).toHaveLength(0);expect(f.history.current.timeline.clips).toHaveLength(0);expect(f.history.current.graphics).toHaveLength(0);expect(f.history.entries.length).toBe(entries+1);
 await waitFor(()=>expect(screen.getByRole("button",{name:"Desfazer"}).matches(":disabled")).toBe(false));
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Desfazer"})));expect(f.history.current).toEqual(before);
});


async function mountPreviewTitle(f=backendFixture(), aspect: "16:9" | "9:16" = "16:9") {
 const t=(key:Parameters<typeof translate>[1])=>translate("pt-BR",key);
 new ManualTitleApplicationService(f.history).edit({version:1,type:"set",expectedSnapshotId:f.history.current.history.headSnapshotId!,title:{version:1,componentId:"cevra.title.lower-third.inter.v1",text:"Título",startFrame:0,endFrame:300,aspect}});
 const png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
 f.backend.previewLocalVideo=async request=>({sourceId:"source",snapshotId:request.expectedSnapshotId,durationMs:10000,mimeType:"video/mp4",base64:btoa("offline"),proxy:{profile:"manual-cfr30-preview-v1",sourceDurationMs:10000},sequence:{timingPolicy:"cfr30",totalFrames:300,clipIds:["clip"]},initialFrame:{mimeType:"image/png",base64:png,width:1,height:1,sourceTimeMs:0}});
 const {container}=render(<App backend={f.backend}/>);const sequenceButton=await screen.findByRole("button",{name:t("sequence.preview")});await act(async()=>fireEvent.click(sequenceButton));await waitFor(()=>expect(container.querySelector("video")?.getAttribute("src")).toMatch(/^blob:/));
 const video=container.querySelector("video")!;
 Object.defineProperties(video,{duration:{configurable:true,value:10},readyState:{configurable:true,value:HTMLMediaElement.HAVE_CURRENT_DATA},videoWidth:{configurable:true,value:aspect === "16:9" ? 1920 : 1080},videoHeight:{configurable:true,value:aspect === "16:9" ? 1080 : 1920}});
 video.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:800,bottom:600,width:800,height:600,toJSON(){}});
 fireEvent.loadedMetadata(video);fireEvent.loadedData(video);fireEvent.load(container.querySelector(".manual-initial-frame")!);fireEvent.seeked(video);
 return {f,container,video,t};
}

it("keeps direct title text after a failed native-bound commit and retries exactly once through App", async () => {
 const {f,container,video,t}=await mountPreviewTitle();
 const hit=await screen.findByRole("button",{name:t("title.selectPreview")});
 await act(async()=>fireEvent.click(hit));const beforeDelete=f.history.current;await act(async()=>fireEvent.keyDown(hit,{key:"Delete"}));
 expect(f.history.current.graphics).toHaveLength(0);await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Desfazer"})));
 expect(f.history.current).toEqual(beforeDelete);
 await waitFor(()=>expect(container.querySelector("video")?.getAttribute("src")).toMatch(/^blob:/));
 fireEvent.loadedMetadata(video);fireEvent.loadedData(video);fireEvent.load(container.querySelector(".manual-initial-frame")!);fireEvent.seeked(video);
 fireEvent.doubleClick(await screen.findByRole("button",{name:t("title.selectPreview")}));
 const input=screen.getByLabelText(t("title.editPreview")) as HTMLInputElement;fireEvent.change(input,{target:{value:"Nova ação"}});
 let reject!:(cause:unknown)=>void; const original=f.backend.editManualTitle!;f.backend.editManualTitle=vi.fn(()=>new Promise<Awaited<ReturnType<NonNullable<DesktopBackend["editManualTitle"]>>>>((_resolve,rej)=>{reject=rej}));
 fireEvent.keyDown(input,{key:"Enter"});await waitFor(()=>expect(input.disabled).toBe(true));
 await act(async()=>reject({code:"MANUAL_TITLE_INVALID"}));expect((screen.getByLabelText(t("title.editPreview")) as HTMLInputElement).value).toBe("Nova ação");
 f.backend.editManualTitle=original;fireEvent.keyDown(screen.getByLabelText(t("title.editPreview")),{key:"Enter"});
 await waitFor(()=>expect(f.history.current.graphics[0]!.text).toBe("Nova ação"));
 fireEvent.click(screen.getByRole("button",{name:"Desfazer"}));await waitFor(()=>expect(f.history.current.graphics[0]!.text).toBe("Título"));
});


it.each(["export", "source", "undo"] as const)("settles direct text before the following %s click once at the canonical snapshot", async action => {
 const {f,t}=await mountPreviewTitle();const user=userEvent.setup();
 const before=f.history.current;
 fireEvent.doubleClick(await screen.findByRole("button",{name:t("title.selectPreview")}));
 const input=screen.getByLabelText(t("title.editPreview"));await user.clear(input);await user.type(input,"Clique preservado");
 const original=f.backend.editManualTitle!;let release!:()=>void;
 const commit=vi.fn((request:ManualTitleEdit)=>new Promise<Awaited<ReturnType<typeof original>>>(resolve=>{release=()=>{void original(request).then(resolve)}}));f.backend.editManualTitle=commit;
 const next=screen.getByRole("button",{name:action==="export"?t("action.export"):action==="source"?"Vídeo 1 · Original.mp4":"Desfazer"});
 await user.click(next);await waitFor(()=>expect(commit).toHaveBeenCalledTimes(1));
 expect(f.history.current).toEqual(before);expect(f.backend.exportManualSequence).not.toHaveBeenCalled();
 await act(async()=>release());
 if(action==="export") {await waitFor(()=>expect(f.backend.exportManualSequence).toHaveBeenCalledTimes(1));expect(vi.mocked(f.backend.exportManualSequence!).mock.calls[0]![0].expectedSnapshotId).toBe(f.history.current.history.headSnapshotId);}
 if(action==="source") {await waitFor(()=>expect(screen.getByTestId("app-shell").dataset.selectedProjectItemId).toBe("source"));expect(f.history.current.graphics[0]!.text).toBe("Clique preservado");}
 if(action==="undo") await waitFor(()=>expect(f.history.current.graphics[0]!.text).toBe("Título"));
 expect(commit).toHaveBeenCalledTimes(1);
});


it.each(["export", "source", "undo"] as const)("consumes a failed direct-text press/release before %s, then allows only a new gesture to retry", async action => {
 const {f,t}=await mountPreviewTitle();const user=userEvent.setup(), before=f.history.current;
 fireEvent.doubleClick(await screen.findByRole("button",{name:t("title.selectPreview")}));
 const input=screen.getByLabelText(t("title.editPreview"));await user.clear(input);await user.type(input,"Falha preservada");
 const original=f.backend.editManualTitle!;let attempts=0;const commit=vi.fn(async(request:ManualTitleEdit)=>{if(++attempts===1)throw {code:"MANUAL_TITLE_INVALID"};return original(request)});f.backend.editManualTitle=commit;
 const next=screen.getByRole("button",{name:action==="export"?t("action.export"):action==="source"?"Vídeo 1 · Original.mp4":"Desfazer"});
 await user.pointer({target:next,keys:"[MouseLeft>]"});await waitFor(()=>expect(commit).toHaveBeenCalledTimes(1));await waitFor(()=>expect(input.matches(":disabled")).toBe(false));
 await user.pointer({target:next,keys:"[/MouseLeft]"});expect(commit).toHaveBeenCalledTimes(1);expect(f.history.current).toEqual(before);expect(f.backend.exportManualSequence).not.toHaveBeenCalled();
 expect((screen.getByLabelText(t("title.editPreview")) as HTMLInputElement).value).toBe("Falha preservada");
 await user.click(next);await waitFor(()=>expect(commit).toHaveBeenCalledTimes(2));
 if(action==="export")await waitFor(()=>expect(f.backend.exportManualSequence).toHaveBeenCalledTimes(1));
 if(action==="source")await waitFor(()=>expect(screen.getByTestId("app-shell").dataset.selectedProjectItemId).toBe("source"));
 if(action==="undo")await waitFor(()=>expect(f.history.current.graphics[0]!.text).toBe("Título"));
});

it("settles direct text before a ruler seek and retains a rejected draft at its previous position", async () => {
 const {f,t,container,video}=await mountPreviewTitle();const user=userEvent.setup(), before=f.history.current;
 fireEvent.doubleClick(await screen.findByRole("button",{name:t("title.selectPreview")}));
 const input=screen.getByLabelText(t("title.editPreview"));await user.clear(input);await user.type(input,"Não perder ao navegar");
 let reject!:(cause:unknown)=>void;const original=f.backend.editManualTitle!;
 const commit=vi.fn(()=>new Promise<Awaited<ReturnType<typeof original>>>((_resolve,rej)=>{reject=rej}));f.backend.editManualTitle=commit;
 const ruler=screen.getByRole("slider",{name:t("timeline.ruler")});
 ruler.querySelector(".timeline-width")!.getBoundingClientRect=()=>({left:0,top:0,right:800,bottom:40,width:800,height:40,x:0,y:0,toJSON(){}});
 await user.pointer({target:ruler,coords:{clientX:400,clientY:20},keys:"[MouseLeft>]"});await waitFor(()=>expect(commit).toHaveBeenCalledTimes(1));
 expect(video.currentTime).toBe(0);expect(f.history.current).toEqual(before);
 await act(async()=>reject({code:"MANUAL_TITLE_INVALID"}));await user.pointer({target:ruler,keys:"[/MouseLeft]"});
 expect(video.currentTime).toBe(0);expect(commit).toHaveBeenCalledTimes(1);expect((screen.getByLabelText(t("title.editPreview")) as HTMLInputElement).value).toBe("Não perder ao navegar");
 expect(container.querySelector(".title-text-input")).toBeTruthy();
 f.backend.editManualTitle=original;await user.pointer({target:ruler,coords:{clientX:400,clientY:20},keys:"[MouseLeft]"});await waitFor(()=>expect(f.history.current.graphics[0]!.text).toBe("Não perder ao navegar"));
});

it.each(["play", "next-frame", "slider"] as const)("settles direct title text before preview %s without losing the action", async action => {
 const {f,t,container,video}=await mountPreviewTitle();const user=userEvent.setup();
 let releaseRead!:()=>void;
 if(action==="play")f.backend.loadEditorialDraft=()=>new Promise(resolve=>{releaseRead=()=>resolve({status:"empty"})});
 fireEvent.doubleClick(await screen.findByRole("button",{name:t("title.selectPreview")}));
 const input=screen.getByLabelText(t("title.editPreview"));await user.clear(input);await user.type(input,"Transporte preservado");
 const original=f.backend.editManualTitle!;let release!:()=>void;const commit=vi.fn((request:ManualTitleEdit)=>new Promise<Awaited<ReturnType<typeof original>>>(resolve=>{release=()=>{void original(request).then(resolve)}}));f.backend.editManualTitle=commit;
 if(action==="slider")fireEvent.change(screen.getByRole("slider",{name:t("sequence.seek")}),{target:{value:"60"}});
 else await user.click(screen.getByRole("button",{name:t(action==="play"?"preview.playLocal":"preview.nextFrame")}));
 await waitFor(()=>expect(commit).toHaveBeenCalledTimes(1));expect(video.currentTime).toBe(0);
 await act(async()=>release());await waitFor(()=>expect(f.history.current.graphics[0]!.text).toBe("Transporte preservado"));
 await waitFor(()=>expect(container.querySelector("video")?.getAttribute("src")).toMatch(/^blob:/));fireEvent.loadedMetadata(video);fireEvent.loadedData(video);fireEvent.load(container.querySelector(".manual-initial-frame")!);fireEvent.seeked(video);
 if(action==="play") {expect(screen.queryByRole("button",{name:t("preview.pauseLocal")})).toBeTruthy();await waitFor(()=>expect(vi.mocked(video.play)).toHaveBeenCalled());await act(async()=>releaseRead());}
 else expect(video.currentTime).toBe(action==="slider"?2+1/120:1/30+1/120);
 expect(commit).toHaveBeenCalledTimes(1);
});


it("preserves the canonical playback frame after pausing and editing a title, rather than returning to the previous seek", async () => {
 const {f,t,container,video}=await mountPreviewTitle();const user=userEvent.setup();
 await user.click(screen.getByRole("button",{name:t("preview.playLocal")}));fireEvent.play(video);
 video.currentTime=5.05;fireEvent.timeUpdate(video);
 await user.click(screen.getByRole("button",{name:t("preview.pauseLocal")}));fireEvent.pause(video);
 fireEvent.doubleClick(await screen.findByRole("button",{name:t("title.selectPreview")}));
 const input=screen.getByLabelText(t("title.editPreview"));fireEvent.change(input,{target:{value:"Quadro preservado"}});
 const oldUrl=video.getAttribute("src");await user.keyboard("{Enter}");await waitFor(()=>expect(f.history.current.graphics[0]!.text).toBe("Quadro preservado"));
 await waitFor(()=>expect(video.getAttribute("src")).not.toBe(oldUrl));
 fireEvent.loadedMetadata(video);fireEvent.loadedData(video);fireEvent.load(container.querySelector(".manual-initial-frame")!);fireEvent.seeked(video);
 expect(video.currentTime).toBeCloseTo(151/30+1/120,9);
 expect((screen.getByRole("slider",{name:t("sequence.seek")}) as HTMLInputElement).value).toBe("151");
 expect(screen.getByRole("button",{name:t("preview.playLocal")})).toBeTruthy();
});


it.each(["16:9", "9:16"] as const)("keeps a bounded admitted frame visible while a committed %s title preview refreshes", async aspect => {
  const draw = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: draw, getImageData: () => ({ data: Uint8ClampedArray.from([0, 0, 0, 255]) }) } as unknown as CanvasRenderingContext2D);
  const { f, t, container, video } = await mountPreviewTitle(backendFixture(), aspect);
  video.currentTime = 151 / 30; fireEvent.timeUpdate(video);
  const before = f.history.current, entries = f.history.entries.length, oldUrl = video.getAttribute("src");
  const originalPreview = f.backend.previewLocalVideo;
  let releasePreview!: () => void;
  f.backend.previewLocalVideo = vi.fn((request: Parameters<DesktopBackend["previewLocalVideo"]>[0]) => new Promise<Awaited<ReturnType<DesktopBackend["previewLocalVideo"]>>>(resolve => {
    releasePreview = () => { void originalPreview(request).then(resolve); };
  }));
  fireEvent.doubleClick(await screen.findByRole("button", { name: t("title.selectPreview") }));
  fireEvent.change(screen.getByLabelText(t("title.editPreview")), { target: { value: "Quadro contínuo" } });
  await act(async () => { fireEvent.keyDown(screen.getByLabelText(t("title.editPreview")), { key: "Enter" }); });
  await waitFor(() => expect(f.history.current.graphics[0]!.text).toBe("Quadro contínuo"));
  const held = container.querySelector<HTMLCanvasElement>(".manual-held-frame");
  expect(held).not.toBeNull(); expect(held!.hidden).toBe(false);
  expect(draw).toHaveBeenCalledOnce(); expect(Math.max(held!.width, held!.height)).toBe(720);
  expect(video.getAttribute("src")).toBeNull(); expect(URL.revokeObjectURL).toHaveBeenCalledWith(oldUrl);
  expect(screen.getByRole("button", { name: t("preview.playLocal") }).matches(":disabled")).toBe(true);
  expect(screen.queryByRole("button", { name: t("title.selectPreview") })).toBeNull();
  expect(f.history.current.timeline).toEqual(before.timeline); expect(f.history.entries.length).toBe(entries + 1);
  await act(async () => { releasePreview(); });
  await waitFor(() => expect(video.getAttribute("src")).toMatch(/^blob:/));
  expect(held!.hidden).toBe(false);
  fireEvent.loadedMetadata(video); fireEvent.loadedData(video); fireEvent.load(container.querySelector(".manual-initial-frame")!);
  expect(held!.hidden).toBe(false);
  fireEvent.seeked(video);
  await waitFor(() => expect(held!.hidden).toBe(true));
  expect(video.currentTime).toBeCloseTo(151 / 30 + 1 / 120, 9);
  expect(f.history.current.timeline).toEqual(before.timeline);
});


async function pendingTitleRefresh() {
  const draw = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: draw, getImageData: () => ({ data: Uint8ClampedArray.from([0, 0, 0, 255]) }) } as unknown as CanvasRenderingContext2D);
  const mounted = await mountPreviewTitle();
  const { f, t, container, video } = mounted;
  video.currentTime = 151 / 30; fireEvent.timeUpdate(video);
  const original = f.backend.previewLocalVideo;
  let release!: () => void, reject!: (cause: unknown) => void;
  f.backend.previewLocalVideo = vi.fn((request: Parameters<DesktopBackend["previewLocalVideo"]>[0]) => new Promise<Awaited<ReturnType<DesktopBackend["previewLocalVideo"]>>>((resolve, fail) => {
    release = () => { void original(request).then(resolve); }; reject = fail;
  }));
  fireEvent.doubleClick(await screen.findByRole("button", { name: t("title.selectPreview") }));
  fireEvent.change(screen.getByLabelText(t("title.editPreview")), { target: { value: "Transição retida" } });
  await act(async () => { fireEvent.keyDown(screen.getByLabelText(t("title.editPreview")), { key: "Enter" }); });
  await waitFor(() => expect(f.backend.previewLocalVideo).toHaveBeenCalledOnce());
  const canvas = container.querySelector<HTMLCanvasElement>(".manual-held-frame")!;
  expect(canvas.hidden).toBe(false);
  return { ...mounted, canvas, draw, release: () => release(), reject: (cause: unknown) => reject(cause) };
}

it("restores the latest ruler frame while a title render is pending, without moving cuts or History", async () => {
  const { f, t, container, video, canvas, release } = await pendingTitleRefresh();
  const before = f.history.toArchive();
  await act(async () => { fireEvent.keyDown(screen.getByRole("slider", { name: t("timeline.ruler") }), { key: "ArrowRight", shiftKey: true }); });
  expect(canvas.hidden).toBe(false);
  await act(async () => { release(); });
  await waitFor(() => expect(video.getAttribute("src")).toMatch(/^blob:/));
  fireEvent.loadedMetadata(video); fireEvent.loadedData(video); fireEvent.load(container.querySelector(".manual-initial-frame")!);
  expect(canvas.hidden).toBe(false); fireEvent.seeked(video);
  await waitFor(() => expect(canvas.hidden).toBe(true));
  expect(video.currentTime).toBeCloseTo(161 / 30 + 1 / 120, 9);
  expect((screen.getByRole("slider", { name: t("sequence.seek") }) as HTMLInputElement).value).toBe("161");
  expect(f.history.toArchive()).toEqual(before);
});

it.each(["MANUAL_VIDEO_UNSUPPORTED", "MANUAL_VIDEO_STALE"])("clears the held picture on %s and exposes the current render failure", async code => {
  const { f, t, container, canvas, reject } = await pendingTitleRefresh();
  const before = f.history.toArchive();
  await act(async () => { reject({ code }); });
  await waitFor(() => expect(canvas.hidden).toBe(true));
  expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
  expect(container.querySelector(".manual-preview-refreshing")).toBeNull();
  expect(screen.getByRole("button", { name: t("preview.retryLocal") })).toBeTruthy();
  expect(f.history.toArchive()).toEqual(before);
});

it("clears the inert picture and cancels its owned pending request when leaving Sequence", async () => {
  const { f, t, canvas, release } = await pendingTitleRefresh();
  const cancel = vi.spyOn(f.backend, "cancelOperation"), before = f.history.toArchive();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: t("preview.originalMode") })); });
  expect(canvas.isConnected).toBe(false); expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
  expect(cancel).toHaveBeenCalledOnce();
  await act(async () => { release(); });
  expect(f.history.toArchive()).toEqual(before);
});


it("rejects a transparent decoded-video capture instead of retaining a blank frame", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn(),
    getImageData: () => ({ data: Uint8ClampedArray.from([0, 0, 0, 0]) }) } as unknown as CanvasRenderingContext2D);
  const { f, t, container, video } = await mountPreviewTitle();
  video.currentTime = 151 / 30; fireEvent.timeUpdate(video);
  f.backend.previewLocalVideo = vi.fn(() => new Promise<Awaited<ReturnType<DesktopBackend["previewLocalVideo"]>>>(() => {}));
  fireEvent.doubleClick(await screen.findByRole("button", { name: t("title.selectPreview") }));
  fireEvent.change(screen.getByLabelText(t("title.editPreview")), { target: { value: "Quadro sem pintura" } });
  await act(async () => { fireEvent.keyDown(screen.getByLabelText(t("title.editPreview")), { key: "Enter" }); });
  const canvas = container.querySelector<HTMLCanvasElement>(".manual-held-frame")!;
  expect(canvas.hidden).toBe(true); expect(canvas.width).toBe(0);
  expect(container.querySelector(".manual-preview-refreshing")).toBeNull();
});
