import test from "node:test";
import assert from "node:assert/strict";
import { FfmpegMediaEngine } from "../dist/index.js";

const item = () => ({ inputUri: "/original.mp4", sourceStartFrame: 1, sourceEndFrame: 2,
  sourceContent: { sha256: "a".repeat(64), sizeBytes: 100 }, audioSelection: "single-source-stream" });
const final = () => ({ type: "render-manual-video-sequence", version: 1, items: [item(), item()], outputUri: "/final.mp4", ownedWorkspaceUri: "/job" });
class Worker {
  calls = [];
  change = value => value;
  async health() { return { ok: true, checks: [], tools: {}, effectiveDeliveries: [{ container: "mp4", audioOnly: false, videoCodec: "h264", audioCodec: "aac", videoEncoder: "h264_videotoolbox", audioEncoder: "aac" }] }; }
  async callTool(name, args, jobId, signal) {
    this.calls.push({ name, args, jobId, signal });
    if (name === "cevra-extract-frame") return { structuredContent: { status: "completed", output: args.output,
      probe: { file: args.output, video: { codec: "png", width: 720, height: 405 } }, effectiveProfile: { container: "png", videoCodec: "png", videoEncoder: "png" } } };
    const preview = name === "cevra-render-manual-video-preview", frames = args.items.reduce((total, item) => total + item.source_end_frame - item.source_start_frame, 0);
    const width = preview ? 720 : 1920, height = preview ? 404 : 1080;
    return { structuredContent: this.change({ status: "completed", output: args.output,
      probe: { file: args.output, duration: frames / 30, video: { codec: "h264", width, height, fps: 30, avg_frame_rate: "30/1", r_frame_rate: "30/1", hdr: false }, audio: { codec: "aac", sample_rate: 48000, channels: 2 } },
      effectiveProfile: { container: "mp4", videoCodec: "h264", videoEncoder: "h264_videotoolbox", audioCodec: "aac", audioEncoder: "aac" },
      publication: { version: 1, scheme: "posix-dev-inode", device: "1", inode: "2" },
      manualSequence: { version: 1, outputSha256: "b".repeat(64), profile: preview ? "manual-cfr30-preview-v1" : "manual-cfr30-export-v1",
        samplingPolicy: "source-pts-fps30-near-v1", frameRate: { numerator: 30, denominator: 1 }, container: "mp4", videoCodec: "h264", audioCodec: "aac", dynamicRange: "sdr",
        width, height, targetVideoBitsPerSecond: preview ? 700000 : 20000000, totalFrames: frames, outputFrameCount: frames, totalPcmSamples: frames * 1600, outputAudioSampleCount: frames * 1600,
        audioSampleRate: 48000, audioChannelLayout: "stereo", durationMs: frames * 1000 / 30, muxVideoDurationMs: frames * 1000 / 30, muxAudioDurationMs: frames * 1000 / 30,
        itemCount: args.items.length, uniqueSegmentCount: 1, sources: [{ inputUri: args.items[0].input, sha256: args.items[0].source_content.sha256, sizeBytes: 100,
          videoStreamIndex: 0, audioStreamIndex: 3, audioStreamCount: 1, sampleRate: 48000, channelLayout: "stereo", sourceVideoFrameCount: 30, sourceVideoEndMs: 1000, sourceAudioFirstSample: 0, sourceAudioSampleCount: 48000 }] }
    }) };
  }
}
const context = { jobId: "owned-job", locale: "pt-BR" };

test("manual renderer adapter carries original identities, repeated frame occurrences and distinct owned workspace", async () => {
  const worker = new Worker(), signal = new AbortController().signal;
  const result = await new FfmpegMediaEngine(worker).execute(final(), { ...context, signal });
  assert.equal(result.manualSequence.outputAudioSampleCount, 3200);
  assert.deepEqual(worker.calls[0], { name: "cevra-render-manual-video-sequence", args: { version: 1, output: "/final.mp4", owned_workspace: "/job",
    items: [1, 2].map(() => ({ input: "/original.mp4", source_start_frame: 1, source_end_frame: 2, source_content: { sha256: "a".repeat(64), size_bytes: 100 }, audio_selection: "single-source-stream" })) }, jobId: context.jobId, signal });
});

test("disposable preview uses the single-item same-sampler closed profile", async () => {
  const worker = new Worker();
  const result = await new FfmpegMediaEngine(worker).execute({ type: "render-manual-video-preview", version: 1, item: item(), outputUri: "/preview.mp4", ownedWorkspaceUri: "/job" }, context);
  assert.equal(worker.calls[0].name, "cevra-render-manual-video-preview");
  assert.equal(result.manualSequence.profile, "manual-cfr30-preview-v1");
  assert.equal(result.manualSequence.width, 720);
  assert.equal(result.manualSequence.outputFrameCount, 1);
});

test("manual renderer rejects absent, forged or inconsistent measured output and source evidence", async () => {
  for (const change of [
    value => { delete value.manualSequence; return value; },
    value => { delete value.publication; return value; },
    value => { value.manualSequence.outputFrameCount = 1; return value; },
    value => { value.manualSequence.outputSha256 = "bad"; return value; },
    value => { value.manualSequence.outputAudioSampleCount++; return value; },
    value => { value.manualSequence.sources[0].sha256 = "c".repeat(64); return value; },
    value => { value.manualSequence.sources[0].audioStreamCount = 2; return value; },
    value => { value.manualSequence.itemCount = 1; return value; },
    value => { value.probe.video.width = 720; return value; },
    value => { value.probe.audio.sample_rate = 44100; return value; },
    value => { value.probe.video.hdr = true; return value; },
    value => { value.effectiveProfile.videoCodec = "h265"; return value; }
  ]) {
    const worker = new Worker(); worker.change = change;
    await assert.rejects(() => new FfmpegMediaEngine(worker).execute(final(), context));
  }
});

test("bounded initial preview frame forwards only literal 720 and rejects arbitrary dimensions before worker call", async () => {
  const worker = new Worker(), engine = new FfmpegMediaEngine(worker);
  await engine.execute({ type: "extract-frame", inputUri: "/preview.mp4", outputUri: "/first.png", atMs: 0, maxDimension: 720 }, context);
  assert.equal(worker.calls[0].args.max_dimension, 720);
  await assert.rejects(() => engine.execute({ type: "extract-frame", inputUri: "/preview.mp4", outputUri: "/first.png", atMs: 0, maxDimension: 1080 }, context));
  assert.equal(worker.calls.length, 1);
});


test("whole-montage preview requires its closed V2 items shape and preserves occurrence accounting", async () => {
  const worker=new Worker(),engine=new FfmpegMediaEngine(worker);
  const operation={...final(),type:"render-manual-video-preview",version:2};
  const result=await engine.execute(operation,context);
  assert.equal(result.manualSequence.itemCount,2);assert.equal(result.manualSequence.totalFrames,2);
  assert.equal(worker.calls[0].name,"cevra-render-manual-video-preview");assert.equal(worker.calls[0].args.version,2);
  for(const bad of [{...operation,version:1},{...operation,item:item()},{...operation,items:[]},{...operation,type:"render-manual-video-sequence"}]) await assert.rejects(engine.execute(bad,context));
  assert.equal(worker.calls.length,1);
});
