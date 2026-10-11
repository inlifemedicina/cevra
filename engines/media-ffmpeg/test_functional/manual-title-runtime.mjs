import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createEmptyProject, ProjectHistory, MANUAL_TITLE_COMPONENT, manualTitleLayout, manualTitleHeight } from "@cevra/project-ir";
import { FixedManualTitleCompositionAdapter } from "@cevra/contracts";
import { InMemoryMediaExecutionRepository, LocalSourceIngestService, ManualSequenceExportApplicationService,
  ManualTitleApplicationService, ManualVideoSequenceApplicationService, MediaApplicationService } from "@cevra/application";
import { FfmpegMediaEngine, NodeMediaArtifactStore, PersistentMediaWorkerClient, ProcessMediaWorkerTransport } from "../dist/index.js";
import { guardManualExportEngine } from "../../../apps/desktop-host/dist/manual-export-resources.js";
import { DerivedVideoPreview } from "../../../apps/desktop-host/dist/derived-video-preview.js";

// Exact-release acceptance using the two immutable, previously reviewed synthetic originals.
// Disposable outputs stay outside Git. No provider, account, user store or GUI is used.
const required = name => { assert.ok(process.env[name], `Missing ${name}`); return realpathSync(process.env[name]); };
const runtime = required("CEVRA_TITLE_RUNTIME"), fixtures = required("CEVRA_TITLE_FIXTURES"), outputRoot = required("CEVRA_TITLE_OUTPUT");
assert.deepEqual(readdirSync(outputRoot), [], "Use an exclusively owned empty output directory.");
const ffmpeg = path.join(runtime, "bin/ffmpeg"), ffprobe = path.join(runtime, "bin/ffprobe");
const sha = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const originalPins = { landscape: "ecf161b9dd33805638a6f890817bd6d2f64c4335052e4c6e54d4ff53e68b1c1b",
  portrait: "825b9a81879abdbddca977fecfc7a1aba057015eac394c9f030899f7cbcf5acd" };
const preparedOriginals = {}, preparedPins = {};
for (const [name, pin] of Object.entries(originalPins)) assert.equal(sha(path.join(fixtures, `${name}.mp4`)), pin);
function transportFor(timeout = 120000) {
  return new ProcessMediaWorkerTransport({ mode: "release", pythonExecutable: path.join(runtime, "python/bin/python3.12"),
    workerScript: path.join(runtime, "worker/cevra_media_worker.py"), controlTimeoutMs: 30000, renderTimeoutMs: timeout,
    renderLivenessIntervalMs: 500, env: { PATH: path.join(runtime, "bin"), CEVRA_MEDIA_RUNTIME_ROOT: runtime,
      CEVRA_RELEASE_MODE: "1", PYTHONNOUSERSITE: "1" } });
}
const transport = transportFor(), engine = new FfmpegMediaEngine(new PersistentMediaWorkerClient(transport));
const artifacts = new NodeMediaArtifactStore(), measurements = [], quality = [], cancellations = [], negatives = [], deliveries = [], ownedRoots = [];
let serial = 0, renders = 0;
const measuredTransport = { async withOwnedRenderBudget(options, action) {
  const started = performance.now(); let guarded;
  try { guarded = await transport.withOwnedRenderBudget(options, action); }
  catch (cause) { process.stderr.write(`Render admission failed: ${cause.stack}\n${JSON.stringify(cause.resourceEvidence)}\n`); throw cause; }
  measurements.push({ root: path.basename(options.ownedDirectory), wallMs: performance.now() - started, ...guarded.resourceEvidence });
  return guarded;
} };
const countedEngine = { identity: () => engine.identity(), healthcheck: () => engine.healthcheck(), capabilities: () => engine.capabilities(),
  execute: (op, context) => { if (op.type.startsWith("render-manual-video")) renders++; return engine.execute(op, context).catch(cause=>{process.stderr.write(`Engine failed: ${cause.stack}\n`);throw cause;}); } };
const guardedEngine = guardManualExportEngine(countedEngine, measuredTransport);
// The existing publication contract keeps the private job and final output on one parent/device.
function owned(name) { const dir = realpathSync(mkdtempSync(path.join(outputRoot, `cevra-title-${name}-`))); chmodSync(dir, 0o700); ownedRoots.push(dir); return dir; }
function run(args, maxBuffer = 64 * 1024 * 1024) {
  return execFileSync(ffmpeg, ["-v", "error", "-nostdin", "-threads", "2", "-filter_threads", "2", ...args], { timeout: 60000, maxBuffer });
}
function probe(args) { return JSON.parse(execFileSync(ffprobe, ["-v", "error", ...args, "-of", "json"], { encoding: "utf8", timeout: 60000, maxBuffer: 16 * 1024 * 1024 })); }
const title = (aspect, patch = {}) => ({ version: 1, componentId: MANUAL_TITLE_COMPONENT, text: "Ação, café e conexão",
  startFrame: 90, endFrame: 210, aspect, ...patch });
const compile = value => new FixedManualTitleCompositionAdapter().compile(value);
function prepareSyntheticProfiles() {
  for(const name of Object.keys(originalPins)) {
    const original=path.join(fixtures,`${name}.mp4`),prepared=path.join(outputRoot,`original-${name}-bt709.mp4`);
    // The historical synthetic files signal matrix/range but omit primaries/transfer.
    // Declare their known synthetic BT709 profile in a separate lossless stream copy.
    // Originals stay immutable; verify decoded pictures and AAC payload byte-for-byte.
    run(["-i",original,"-map","0:v:0","-map","0:a:0","-c","copy","-bsf:v","h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0",prepared]);
    const decoded=file=>run(["-i",file,"-map","0:v:0","-an","-fps_mode","passthrough","-c:v","rawvideo","-pix_fmt","yuv420p","-f","framemd5","pipe:1"]);
    assert.deepEqual(decoded(prepared),decoded(original),"Synthetic profile declaration must not re-encode or change decoded pictures.");
    const audio=file=>run(["-i",file,"-map","0:a:0","-vn","-c:a","copy","-f","adts","pipe:1"]);
    assert.deepEqual(audio(prepared),audio(original));preparedOriginals[name]=prepared;preparedPins[name]=sha(prepared);
  }
}
function clock(file, portrait, preview, frames = 300) {
  const data = probe(["-show_streams", "-show_frames", "-show_entries", "stream=codec_type,codec_name,width,height,pix_fmt,time_base,duration_ts,avg_frame_rate,r_frame_rate,sample_rate,channels,start_pts:frame=media_type,best_effort_timestamp,duration", file]);
  const video = data.streams.filter(s => s.codec_type === "video"), audio = data.streams.filter(s => s.codec_type === "audio");
  assert.equal(video.length, 1); assert.equal(audio.length, 1);
  const v = video[0], a = audio[0];
  assert.deepEqual([v.width,v.height], preview ? (portrait ? [404,720] : [720,404]) : (portrait ? [1080,1920] : [1920,1080]));
  assert.equal(v.codec_name, "h264"); assert.equal(v.pix_fmt, "yuv420p");
  assert.equal(v.avg_frame_rate, "30/1"); assert.equal(v.r_frame_rate, "30/1");
  const [vn,vd] = v.time_base.split("/").map(BigInt), decoded = data.frames.filter(f => f.media_type === "video");
  assert.equal(decoded.length, frames);
  decoded.forEach((f,n) => { assert.equal(BigInt(f.best_effort_timestamp)*vn*30n,BigInt(n)*vd); assert.equal(BigInt(f.duration)*vn*30n,vd); });
  assert.equal(BigInt(v.duration_ts)*vn*30n,BigInt(frames)*vd);
  assert.equal(a.codec_name, "aac"); assert.equal(a.sample_rate, "48000"); assert.equal(a.channels, 2); assert.equal(Number(a.start_pts), 0);
  const [an,ad] = a.time_base.split("/").map(BigInt);
  assert.equal(BigInt(a.duration_ts)*an*48000n,BigInt(frames*1600)*ad);
  const pcm = run(["-i",file,"-map","0:a:0","-vn","-c:a","pcm_f32le","-f","f32le","pipe:1"]);
  assert.equal(pcm.length, frames*1600*8, "Decoded stereo PCM endpoint is exact.");
  return { width:v.width, height:v.height, decodedSamples:pcm.length/8,
    aacSha256:createHash("sha256").update(run(["-i",file,"-map","0:a:0","-vn","-c:a","copy","-f","adts","pipe:1"])).digest("hex") };
}
function intervalOracle(file, value, grid) {
  const cw = value.aspect === "9:16" ? 1080 : 1920, ch = value.aspect === "9:16" ? 1920 : 1080;
  const layout = manualTitleLayout(value), sx = grid.width/cw, sy = grid.height/ch;
  const x = Math.ceil((cw*layout.x+12)*sx), y = Math.ceil((ch*layout.y+16)*sy);
  const bytes = run(["-i",file,"-map","0:v:0","-an","-vf",`crop=4:4:${x}:${y},format=rgb24`,"-fps_mode","passthrough","-f","rawvideo","pipe:1"]);
  assert.equal(bytes.length,300*48);
  for (let n=0;n<300;n++) {
    const sums = [0,0,0]; for (let i=0;i<16;i++) for (let channel=0;channel<3;channel++) sums[channel]+=bytes[n*48+i*3+channel]/16;
    const distance = sums.reduce((sum,v,i)=>sum+Math.abs(v-[26,31,41][i]),0)/3;
    if (n>=value.startFrame && n<value.endFrame) assert.ok(distance<10, `Title missing at frame ${n}: ${sums}`);
    else assert.ok(distance>13, `Title extends past its half-open interval at frame ${n}: ${sums}`);
  }
}
function qualityOracle(file, value) {
  const portrait = value.aspect === "9:16", width = portrait ? 1080 : 1920, height = portrait ? 1920 : 1080, size = portrait ? 48 : 56;
  const png = path.join(outputRoot, `reference-${portrait ? "portrait" : "landscape"}-v${value.version}-${quality.length}.png`);
  const layout = manualTitleLayout(value);
  execFileSync(path.join(runtime,"components/manual-title/rasterizer"), [path.join(runtime,"components/manual-title/Inter.ttf"),String(width),String(height),value.text,...(value.version===2 ? [layout.x,layout.y,layout.width,layout.fontScale].map(String) : []),png]);
  const crop = `${Math.floor(width*layout.width)}:${Math.floor(height*manualTitleHeight(value.aspect,layout.fontScale))}:${Math.round(width*layout.x)}:${Math.round(height*layout.y)}`;
  const actual = run(["-i",file,"-vf",`select=eq(n\\,120),scale=in_color_matrix=bt709:in_range=tv:out_range=pc,crop=${crop},format=rgb24`,"-frames:v","1","-an","-f","rawvideo","pipe:1"]);
  const reference = run(["-i",png,"-vf",`crop=${crop},format=rgb24`,"-frames:v","1","-f","rawvideo","pipe:1"]);
  assert.equal(actual.length,reference.length);
  let absolute=0,squared=0; for(let i=0;i<actual.length;i++){ const d=actual[i]-reference[i];absolute+=Math.abs(d);squared+=d*d; }
  const mae=absolute/actual.length,psnr=10*Math.log10(255**2/(squared/actual.length));
  assert.ok(mae<=3 && psnr>=35, `Opaque title ROI MAE=${mae}, PSNR=${psnr}`); quality.push({aspect:value.aspect,version:value.version,layout,mae,psnr});
}
async function projectFor(name, sourceName, repeated = false) {
  const history = new ProjectHistory(createEmptyProject({id:name})), executions = new InMemoryMediaExecutionRepository();
  const media = new MediaApplicationService({engine:guardedEngine,history,executions,artifacts});
  const ingest = new LocalSourceIngestService({media,history,identity:artifacts,idGenerator:()=>`ingest-${++serial}`});
  await ingest.ingest({uri:preparedOriginals[sourceName],displayName:"Synthetic original BT709",sourceId:"original",expectedKind:"video"});
  const sequence = new ManualVideoSequenceApplicationService({history,identity:artifacts});
  for(const start of [0,repeated ? 0 : 150]) await sequence.edit({version:2,type:"append",expectedSnapshotId:history.current.history.headSnapshotId,sourceId:"original",sourceStartFrame:start,sourceEndFrame:start+150});
  return {history,media,executions};
}
async function exportProject(fixture,name) {
  const file=path.join(outputRoot,`${name}.mp4`),dir=owned(name),target=Object.freeze({label:name,availableBytes:4*1024**3});
  const parent=lstatSync(outputRoot,{bigint:true});
  const destination={async prepare(bytes){assert.ok(bytes<target.availableBytes);return target;},async revalidate(issued,bytes){assert.equal(issued,target);assert.ok(bytes<target.availableBytes);assert.equal(existsSync(file),false);assert.equal(lstatSync(outputRoot,{bigint:true}).ino,parent.ino);},resolveOutputUri(){return file;},async revalidatePublication(_,publication){assert.equal(await artifacts.matchesPublication(file,publication),true);}};
  const count=fixture.history.entries.length;
  const result=await new ManualSequenceExportApplicationService({history:fixture.history,media:fixture.media,identity:artifacts}).execute({version:1,operationId:name,expectedSnapshotId:fixture.history.current.history.headSnapshotId,locale:"pt-BR"},destination,dir);
  assert.equal(result.record.status,"succeeded"); assert.equal(fixture.history.entries.length,count+1);
  assert.deepEqual(readdirSync(dir),["published-account.mp4"]);
  return file;
}
async function previewProject(fixture,name) {
  const temporaryRoot=owned(`${name}-cache`),before=fixture.history.toArchive(),ledger=fixture.executions.toArchive();
  const derived=new DerivedVideoPreview({history:fixture.history,engine:guardedEngine,settle:()=>transport.settle(),temporaryRoot,runtimeIdentity:()=>sha(path.join(runtime,"manifest.json"))});
  const request=()=>({sourceId:"original",sequence:true,expectedSnapshotId:fixture.history.current.history.headSnapshotId,operationId:name});
  const started=performance.now(),packet=await derived.prepare(request(),new AbortController().signal),count=renders;
  deliveries.push({name,packet,project:fixture.history.current,hostWallMs:performance.now()-started});
  assert.equal((await derived.prepare(request(),new AbortController().signal)).base64,packet.base64);assert.equal(renders,count,"Verified cache hit does not render again.");
  const file=path.join(outputRoot,`${name}.mp4`);writeFileSync(file,Buffer.from(packet.base64,"base64"));
  assert.deepEqual(fixture.history.toArchive(),before);assert.deepEqual(fixture.executions.toArchive(),ledger);
  assert.deepEqual(readdirSync(temporaryRoot),[]);
  return {file,derived,request};
}
try {
  assert.ok(["ready","degraded"].includes((await engine.healthcheck()).status));
  assert.ok((await engine.capabilities()).some(capability=>capability.id==="media.cevra-manual-title-inter-v1" && capability.available));
  prepareSyntheticProfiles();
  for(const [name,aspect] of [["landscape","16:9"],["portrait","9:16"]]) {
    const fixture=await projectFor(name,name),before=fixture.history.current;
    const baseline=await exportProject(fixture,`${name}-baseline`),audio=clock(baseline,false,false).aacSha256;
    const baselinePreview=await previewProject(fixture,`${name}-preview-baseline`);
    const previewAudio=clock(baselinePreview.file,false,true).aacSha256;baselinePreview.derived.close();
    const service=new ManualTitleApplicationService(fixture.history),value=title(aspect);
    service.edit({version:1,type:"set",expectedSnapshotId:fixture.history.current.history.headSnapshotId,title:value});
    assert.deepEqual(fixture.history.current.sources,before.sources);assert.deepEqual(fixture.history.current.timeline,before.timeline);
    const preview=await previewProject(fixture,`${name}-preview`),grid=clock(preview.file,aspect==="9:16",true);
    intervalOracle(preview.file,value,grid);assert.equal(grid.aacSha256,previewAudio);
    const final=await exportProject(fixture,`${name}-final`),finalGrid=clock(final,aspect==="9:16",false);
    intervalOracle(final,value,finalGrid);qualityOracle(final,value);assert.equal(finalGrid.aacSha256,audio);
    const count=renders;
    service.edit({version:1,type:"set",expectedSnapshotId:fixture.history.current.history.headSnapshotId,title:title(aspect,{text:"Coffee and connection",startFrame:91,endFrame:209})});
    await assert.rejects(preview.derived.prepare({...preview.request(),expectedSnapshotId:"stale"},new AbortController().signal));
    await preview.derived.prepare(preview.request(),new AbortController().signal);assert.equal(renders,count+1,"Changed title invalidates preview cache.");
    fixture.history.undo();await preview.derived.prepare(preview.request(),new AbortController().signal);assert.equal(renders,count+2,"Snapshot-bound cache invalidates after returning to a distinct export snapshot.");
    preview.derived.close();
    const moved=title(aspect,{version:2,text:"Título direto",startFrame:91,endFrame:209,layout:{version:1,x:.12,y:.25,width:.72,fontScale:.8}});
    service.edit({version:1,type:"set",expectedSnapshotId:fixture.history.current.history.headSnapshotId,title:moved});
    const movedPreview=await previewProject(fixture,`${name}-direct-preview`),movedGrid=clock(movedPreview.file,aspect==="9:16",true);
    intervalOracle(movedPreview.file,moved,movedGrid);assert.equal(movedGrid.aacSha256,previewAudio);
    const movedFinal=await exportProject(fixture,`${name}-direct-final`),movedFinalGrid=clock(movedFinal,aspect==="9:16",false);
    intervalOracle(movedFinal,moved,movedFinalGrid);qualityOracle(movedFinal,moved);assert.equal(movedFinalGrid.aacSha256,audio);
    assert.deepEqual(fixture.history.current.timeline,before.timeline);assert.deepEqual(fixture.history.current.sources,before.sources);
    movedPreview.derived.close();
    // Literal title data is rasterized by the same closed helper in preview and export.
    const unicodeCases = [
      ["symbols", "© € ± ≤ ≥ ∞ ✓ ★"],
      ["combining-escapes", "Ação café: ' \" \\ % ; [ ] &"],
      ["selectors", "⬆︎ ⬆️ ♥︎ ♥️"],
      ["composed-missing", "😀 👩🏽‍⚕️ 🇧🇷 1️⃣ 漢"]
    ];
    for (const [caseName, text] of unicodeCases) {
      const unicode = { ...moved, text };
      service.edit({ version: 1, type: "set", expectedSnapshotId: fixture.history.current.history.headSnapshotId, title: unicode });
      assert.equal(fixture.history.current.graphics[0].text, text, "Drawing substitution never rewrites IR text.");
      const unicodePreview = await previewProject(fixture, `${name}-unicode-${caseName}-preview`);
      const unicodeGrid = clock(unicodePreview.file, aspect === "9:16", true);
      intervalOracle(unicodePreview.file, unicode, unicodeGrid); assert.equal(unicodeGrid.aacSha256, previewAudio);
      const unicodeFinal = await exportProject(fixture, `${name}-unicode-${caseName}-final`);
      const unicodeFinalGrid = clock(unicodeFinal, aspect === "9:16", false);
      intervalOracle(unicodeFinal, unicode, unicodeFinalGrid); qualityOracle(unicodeFinal, unicode);
      assert.equal(unicodeFinalGrid.aacSha256, audio);
      assert.equal(fixture.history.current.graphics[0].text, text);
      assert.deepEqual(fixture.history.current.timeline, before.timeline); assert.deepEqual(fixture.history.current.sources, before.sources);
      unicodePreview.derived.close();
    }
  }
  const repeated=await projectFor("repeated","landscape",true),value=title("16:9",{startFrame:150,endFrame:300});
  new ManualTitleApplicationService(repeated.history).edit({version:1,type:"set",expectedSnapshotId:repeated.history.current.history.headSnapshotId,title:value});
  const output=await exportProject(repeated,"repeated-source-distinct-title"),grid=clock(output,false,false);intervalOracle(output,value,grid);
  const original=preparedOriginals.landscape,item={inputUri:original,sourceStartFrame:0,sourceEndFrame:300,sourceContent:{sha256:sha(original),sizeBytes:statSync(original).size},audioSelection:"single-source-stream"};
  for(const [name,value,source,reason] of [
    ["uncertain-colour",title("16:9"),path.join(fixtures,"landscape.mp4"),/MANUAL_TITLE_UNSUPPORTED_COLOUR/u],
    ["text-overflow",title("9:16",{text:"W".repeat(80)}),original,/MANUAL_TITLE_RASTER_FAILED: (?:RasterError\.)?overflow/u]
  ]) {
    const child=transportFor(),childEngine=new FfmpegMediaEngine(new PersistentMediaWorkerClient(child));await childEngine.healthcheck();
    const dir=owned(name),file=path.join(outputRoot,`${name}.mp4`);let failure;
    try {await assert.rejects(child.withOwnedRenderBudget({ownedDirectory:dir,rendererRssLimitBytes:512*1024**2,ownedFileLimitBytes:2*1024**3},()=>childEngine.execute({type:"render-manual-video-sequence",version:2,composition:compile(value),items:[{...item,inputUri:source,sourceContent:{sha256:sha(source),sizeBytes:statSync(source).size}}],outputUri:file,ownedWorkspaceUri:dir},{jobId:name,locale:"en-US"})),cause=>{failure=cause;return reason.test(cause.message);});}
    finally {await child.settle();await child.stop();}
    assert.equal(existsSync(file),false);assert.deepEqual(readdirSync(dir),[]);
    negatives.push({name,failureMessage:failure.message,noPublication:true,ownedFilesCleaned:true});
  }
  for(const [name,timeout,cancel] of [["cancel",120000,true],["deadline",750,false]]) {
    const child=transportFor(timeout),childEngine=new FfmpegMediaEngine(new PersistentMediaWorkerClient(child));
    await childEngine.healthcheck();const dir=owned(name),file=path.join(outputRoot,`${name}.mp4`),controller=new AbortController();let observed=false;
    const timer=setInterval(()=>{if(readdirSync(dir,{recursive:true}).some(name=>String(name).endsWith(".png"))){observed=true;if(cancel)controller.abort();}},10);
    const started=performance.now();
    let failure;
    try {await assert.rejects(child.withOwnedRenderBudget({ownedDirectory:dir,rendererRssLimitBytes:512*1024**2,ownedFileLimitBytes:2*1024**3},()=>childEngine.execute({type:"render-manual-video-sequence",version:2,composition:compile(title("16:9")),items:[item],outputUri:file,ownedWorkspaceUri:dir},{jobId:name,locale:"en-US",signal:controller.signal})),cause=>{failure=cause;return cancel ? cause.name==="AbortError" || /cancelled/u.test(cause.message) : /timed out|deadline|timeout/iu.test(cause.message);});}
    finally {clearInterval(timer);await child.settle();await child.stop();}
    assert.equal(observed,true,"Cancellation/deadline occurs after the title producer created its PNG.");
    assert.equal(child.workerPid,undefined);
    assert.equal(existsSync(file),false);assert.deepEqual(readdirSync(dir),[]);cancellations.push({name,wallMs:performance.now()-started,failureName:failure.name,failureMessage:failure.message,titleProducerObserved:true,privateGroupRetired:true,noPublication:true});
  }
  for(const [name,pin] of Object.entries(originalPins))assert.equal(sha(path.join(fixtures,`${name}.mp4`)),pin);
  for(const [name,pin] of Object.entries(preparedPins))assert.equal(sha(preparedOriginals[name]),pin);
  for(const measurement of measurements){assert.ok(measurement.samples>0);assert.ok(measurement.peakRendererRssBytes<=512*1024**2);assert.ok(measurement.peakOwnedLogicalBytes<=2*1024**3);}
  writeFileSync(path.join(outputRoot,"ui-preview-deliveries.json"),JSON.stringify(deliveries));
  process.stdout.write(JSON.stringify({status:"PASS",runtimeManifestSha256:sha(path.join(runtime,"manifest.json")),originalPins,preparedPins,syntheticPreparation:"separate stream-copy profile declaration; decoded pictures and AAC payload identical; immutable historical originals retained",renders,quality,negatives,cancellations,measurements,outputRoot,resourceProof:"sampled private process-group RSS; live logical owned-file accounting; no hard ceiling guarantee"},null,2)+"\n");
} finally {await transport.settle();await transport.stop();for(const dir of ownedRoots)rmSync(dir,{recursive:true,force:true});}
