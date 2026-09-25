import test from "node:test";
import assert from "node:assert/strict";
import { FfmpegMediaEngine } from "../dist/index.js";

class FakeWorker {
  calls = [];
  probeVideoCodec = "h264";
  probeAudioCodec = "aac";
  probeVideoMetadata = {};
  async info() {
    return { name: "cevra-media-worker", version: "0.2.1", protocolVersion: 1, upstream: { id: "ffmpeg-skill", version: "1.4.2", contractVersion: "1.0" } };
  }
  async health() {
    return {
      ok: true, checkedAt: "2026-09-11T18:00:00.000Z", checks: [{ id: "ffmpeg", status: "PASS" }],
      tools: { probe: { usable: "yes" }, cut: { usable: "yes" }, fit: { usable: "yes" }, silence: { usable: "yes" } },
      effectiveDeliveries: [
        { container: "mp4", audioOnly: false, videoCodec: "h264", audioCodec: "aac", videoEncoder: "h264_videotoolbox", audioEncoder: "aac" },
        { container: "mp4", audioOnly: false, videoCodec: "copy", audioCodec: "aac", videoEncoder: "copy", audioEncoder: "aac" },
        { container: "mov", audioOnly: false, videoCodec: "h264", audioCodec: "aac", videoEncoder: "h264_videotoolbox", audioEncoder: "aac" },
        { container: "mkv", audioOnly: false, videoCodec: "h264", audioCodec: "aac", videoEncoder: "h264_videotoolbox", audioEncoder: "aac" },
        { container: "mkv", audioOnly: false, videoCodec: "h264", audioCodec: "opus", videoEncoder: "h264_videotoolbox", audioEncoder: "opus" },
        { container: "mkv", audioOnly: false, videoCodec: "copy", audioCodec: "opus", videoEncoder: "copy", audioEncoder: "opus" },
        { container: "mkv", audioOnly: false, videoCodec: "copy", audioCodec: "copy", videoEncoder: "copy", audioEncoder: "copy" },
        { container: "mkv", audioOnly: true, audioCodec: "opus", audioEncoder: "opus" },
        { container: "wav", audioOnly: true, audioCodec: "pcm", audioEncoder: "pcm_s16le" },
        { container: "m4a", audioOnly: true, audioCodec: "aac", audioEncoder: "aac" }
      ]
    };
  }
  async listTools() { return []; }
  async callTool(name, arguments_, jobId, signal) {
    this.calls.push({ name, arguments_, jobId, signal });
    if (name === "probe") return { structuredContent: { file: arguments_.inputs[0], duration: 2.5, video: { width: 1920, height: 1080, fps: 30, codec: this.probeVideoCodec, ...this.probeVideoMetadata }, audio: { codec: this.probeAudioCodec, sample_rate: 48000, channels: 2 } } };
    if (name === "silence") return { structuredContent: { silences: [[1.2, 2.4], [5.0, null]] } };
    if (name === "cevra-extract-frame") return { structuredContent: { status: "completed", output: arguments_.output, probe: { file: arguments_.output, video: { codec: "png", width: 1920, height: 1080 } }, effectiveProfile: { container: "png", videoCodec: "png", videoEncoder: "png" } } };
    if (name === "cevra-render-audio-sequence") return { structuredContent: {
      status: "completed", output: arguments_.output,
      probe: { file: arguments_.output, duration: arguments_.output_duration_ms / 1000, size_bytes: arguments_.output_duration_ms * 48 * (arguments_.output_channel_layout === "mono" ? 1 : 2) * 4 + 114, audio: { codec: "pcm_f32le", sample_rate: 48000, channels: arguments_.output_channel_layout === "mono" ? 1 : 2 } },
      effectiveProfile: { container: "wav", audioCodec: "pcm", audioEncoder: "pcm_f32le" },
      publication: { version: 1, scheme: "posix-dev-inode", device: "1", inode: "2" },
      audioSequence: { version: 1, sampleRate: 48000, sampleFormat: "pcm_f32le", channelLayout: arguments_.output_channel_layout, distinctSourceCount: arguments_.sources.length, itemCount: arguments_.items.length, maximumSimultaneousItemCount: 2, outputSampleCount: arguments_.output_duration_ms * 48, estimatedDataBytes: arguments_.output_duration_ms * 48 * (arguments_.output_channel_layout === "mono" ? 1 : 2) * 4, measuredDataBytes: arguments_.output_duration_ms * 48 * (arguments_.output_channel_layout === "mono" ? 1 : 2) * 4, graphBytes: 1024 }
    } };
    const audioOnly = arguments_.drop_video === true;
    const audioCodec = arguments_.audio_codec ?? "aac";
    const videoCodec = arguments_.video_codec ?? "h264";
    return { structuredContent: {
      status: "completed", output: arguments_.output,
      probe: { file: arguments_.output, duration: 1.0, ...(!audioOnly ? { video: { codec: videoCodec === "copy" ? this.probeVideoCodec : videoCodec, width: 1920, height: 1080, fps: 30 } } : {}), audio: { codec: audioCodec === "pcm" ? "pcm_s16le" : audioCodec } },
      effectiveProfile: { container: arguments_.container ?? (String(arguments_.output).split(".").pop()), ...(!audioOnly ? { videoCodec: videoCodec === "copy" ? this.probeVideoCodec : videoCodec, videoEncoder: videoCodec === "copy" ? "copy" : "h264_videotoolbox" } : {}), audioCodec, audioEncoder: audioCodec === "copy" ? "copy" : audioCodec },
      ...(name === "cevra-mux-audio" ? {
        publication: { version: 1, scheme: "posix-dev-inode", device: "1", inode: "3" },
        ...(arguments_.duration_validation ? { muxDuration: {
          version: 1,
          inputVideoDurationMs: arguments_.duration_validation.video_duration_ms,
          inputAudioDurationMs: arguments_.duration_validation.audio_duration_ms,
          outputVideoDurationMs: arguments_.duration_validation.video_duration_ms,
          outputAudioDurationMs: arguments_.duration_validation.audio_duration_ms
        } } : {})
      } : {})
    } };
  }
}

const context = { jobId: "job-1", locale: "pt-BR" };

test("probe maps worker measurement into CEVRA media result", async () => {
  const worker = new FakeWorker();
  const engine = new FfmpegMediaEngine(worker);
  const result = await engine.execute({ type: "probe", inputUri: "in.mp4" }, context);
  assert.equal(result.type, "probe");
  assert.equal(result.probe.durationMs, 2500);
  assert.equal(result.probe.width, 1920);
  assert.equal(result.probe.hasAudio, true);
});

test("probe preserves SDR color, pixel, rotation, and exact frame-rate evidence", async () => {
  const worker = new FakeWorker();
  worker.probeVideoMetadata = {
    avg_frame_rate: "30000/1001",
    r_frame_rate: "30/1",
    variable_frame_rate_suspected: true,
    rotation: 90,
    pix_fmt: "yuv420p",
    bit_depth: 8,
    color_space: "bt709",
    color_primaries: "bt709",
    color_transfer: "bt709",
    color_range: "tv",
    hdr: false
  };
  const result = await new FfmpegMediaEngine(worker).execute({ type: "probe", inputUri: "rotated-sdr.mp4" }, context);
  assert.equal(result.type, "probe");
  assert.deepEqual(result.probe, {
    uri: "rotated-sdr.mp4",
    durationMs: 2500,
    width: 1920,
    height: 1080,
    frameRate: 30,
    avgFrameRate: "30000/1001",
    rFrameRate: "30/1",
    variableFrameRateSuspected: true,
    rotationDegrees: 90,
    pixelFormat: "yuv420p",
    bitDepth: 8,
    colorSpace: "bt709",
    colorPrimaries: "bt709",
    colorTransfer: "bt709",
    colorRange: "tv",
    hdr: false,
    hasVideo: true,
    hasAudio: true,
    videoCodec: "h264",
    audioCodec: "aac",
    sampleRate: 48000,
    channels: 2
  });
});

test("probe preserves 10-bit HDR evidence without interpreting or altering pixels", async () => {
  const worker = new FakeWorker();
  worker.probeVideoMetadata = {
    avg_frame_rate: "24000/1001",
    r_frame_rate: "24000/1001",
    variable_frame_rate_suspected: false,
    rotation: 0,
    pix_fmt: "yuv420p10le",
    bit_depth: 10,
    color_space: "bt2020nc",
    color_primaries: "bt2020",
    color_transfer: "smpte2084",
    color_range: "tv",
    hdr: true,
    hdr_format: "HDR10/PQ"
  };
  const result = await new FfmpegMediaEngine(worker).execute({ type: "probe", inputUri: "hdr.mov" }, context);
  assert.equal(result.probe.pixelFormat, "yuv420p10le");
  assert.equal(result.probe.bitDepth, 10);
  assert.equal(result.probe.colorPrimaries, "bt2020");
  assert.equal(result.probe.colorTransfer, "smpte2084");
  assert.equal(result.probe.hdr, true);
  assert.equal(result.probe.hdrFormat, "HDR10/PQ");
});

test("probe leaves unavailable optional metadata absent", async () => {
  const result = await new FfmpegMediaEngine(new FakeWorker()).execute({ type: "probe", inputUri: "minimal.mp4" }, context);
  for (const key of ["avgFrameRate", "rFrameRate", "rotationDegrees", "pixelFormat", "bitDepth", "colorSpace", "colorPrimaries", "colorTransfer", "colorRange", "hdr", "hdrFormat"]) {
    assert.equal(Object.hasOwn(result.probe, key), false, key);
  }
});

test("probe rejects malformed structured metadata at the adapter boundary", async () => {
  const malformed = [
    ["avg_frame_rate", "30000"],
    ["r_frame_rate", "30/0"],
    ["variable_frame_rate_suspected", "yes"],
    ["rotation", 90.5],
    ["pix_fmt", ["yuv420p"]],
    ["bit_depth", 0],
    ["color_space", { name: "bt709" }],
    ["color_primaries", "bt709\n"],
    ["color_transfer", ""],
    ["color_range", 1],
    ["hdr", "false"],
    ["hdr_format", "x".repeat(129)]
  ];
  for (const [field, value] of malformed) {
    const worker = new FakeWorker();
    worker.probeVideoMetadata = { [field]: value };
    await assert.rejects(
      () => new FfmpegMediaEngine(worker).execute({ type: "probe", inputUri: "malformed.mp4" }, context),
      new RegExp(`probe ${field} is invalid`)
    );
  }
});

test("trim maps milliseconds to accurate upstream cut", async () => {
  const worker = new FakeWorker();
  const engine = new FfmpegMediaEngine(worker);
  await engine.execute({ type: "trim", inputUri: "in.mp4", outputUri: "out.mp4", startMs: 500, endMs: 1750 }, context);
  assert.equal(worker.calls[0].name, "cut");
  assert.deepEqual(worker.calls[0].arguments_, { input: "in.mp4", output: "out.mp4", start: 0.5, end: 1.75, accurate: true });
});

test("contain and cover map to upstream pad and crop modes", async () => {
  const worker = new FakeWorker();
  const engine = new FfmpegMediaEngine(worker);
  await engine.execute({ type: "fit", inputUri: "in.mp4", outputUri: "contain.mp4", width: 1080, height: 1920, mode: "contain" }, context);
  await engine.execute({ type: "fit", inputUri: "in.mp4", outputUri: "cover.mp4", width: 1080, height: 1920, mode: "cover" }, context);
  assert.equal(worker.calls[0].arguments_.fit, "pad");
  assert.equal(worker.calls[1].arguments_.fit, "crop");
});

test("silence detection normalizes seconds into milliseconds", async () => {
  const worker = new FakeWorker();
  const engine = new FfmpegMediaEngine(worker);
  const result = await engine.execute({ type: "detect-silence", inputUri: "in.mp4", thresholdDb: -35, minDurationMs: 600 }, context);
  assert.equal(result.type, "detect-silence");
  assert.deepEqual(result.ranges[0], { startMs: 1200, endMs: 2400 });
  assert.equal(result.ranges[1].startMs, 5000);
  assert.equal(result.ranges[1].endMs, null);
});

test("worker error propagates as engine failure", async () => {
  const worker = new FakeWorker();
  worker.callTool = async () => ({ isError: true, content: [{ type: "text", text: "ffmpeg failed" }] });
  const engine = new FfmpegMediaEngine(worker);
  await assert.rejects(() => engine.execute({ type: "trim", inputUri: "in.mp4", outputUri: "out.mp4", startMs: 0, endMs: 1000 }, context), /ffmpeg failed/);
});

test("invalid worker results and file results without output evidence are rejected", async () => {
  const worker = new FakeWorker();
  const engine = new FfmpegMediaEngine(worker);
  worker.callTool = async () => ({ content: [{ type: "text", text: "not json" }] });
  await assert.rejects(() => engine.execute({ type: "probe", inputUri: "in.mp4" }, context), /invalid result/);

  worker.callTool = async () => ({ structuredContent: { status: "completed" } });
  await assert.rejects(
    () => engine.execute({ type: "trim", inputUri: "in.mp4", outputUri: "out.mp4", startMs: 0, endMs: 1000 }, context),
    /no completed output evidence/
  );

  worker.callTool = async () => ({ structuredContent: { status: "completed", output: "out.mp4" } });
  await assert.rejects(
    () => engine.execute({ type: "trim", inputUri: "in.mp4", outputUri: "out.mp4", startMs: 0, endMs: 1000 }, context),
    /no verified output probe/
  );

  worker.callTool = async () => ({ structuredContent: { status: "completed", output: "other.mp4", probe: { file: "other.mp4" } } });
  await assert.rejects(
    () => engine.execute({ type: "trim", inputUri: "in.mp4", outputUri: "out.mp4", startMs: 0, endMs: 1000 }, context),
    /no completed output evidence/
  );

  worker.callTool = async () => ({ structuredContent: { status: "completed", output: "out.mp4", probe: { file: "other.mp4" } } });
  await assert.rejects(
    () => engine.execute({ type: "trim", inputUri: "in.mp4", outputUri: "out.mp4", startMs: 0, endMs: 1000 }, context),
    /no verified output probe/
  );

  worker.callTool = async () => ({ structuredContent: { file: "in.mp4" } });
  await assert.rejects(() => engine.execute({ type: "probe", inputUri: "in.mp4" }, context), /no output evidence/);

  worker.callTool = async () => ({ structuredContent: { file: "other.mp4", duration: 1 } });
  await assert.rejects(() => engine.execute({ type: "probe", inputUri: "in.mp4" }, context), /no output evidence/);
});

test("abort signal is propagated to the worker and pre-aborted jobs fail immediately", async () => {
  const worker = new FakeWorker();
  const engine = new FfmpegMediaEngine(worker);
  const controller = new AbortController();
  await engine.execute({ type: "probe", inputUri: "in.mp4" }, { ...context, signal: controller.signal });
  assert.equal(worker.calls[0].signal, controller.signal);
  assert.equal(worker.calls[0].jobId, context.jobId);

  controller.abort();
  await assert.rejects(
    () => engine.execute({ type: "probe", inputUri: "in.mp4" }, { ...context, signal: controller.signal }),
    (error) => error?.name === "AbortError"
  );
});

test("incompatible delivery codec/container pairs are rejected before worker execution", async () => {
  const worker = new FakeWorker();
  const engine = new FfmpegMediaEngine(worker);
  await assert.rejects(
    () => engine.execute({ type: "transcode", inputUri: "in.mp4", outputUri: "out.webm", container: "webm", videoCodec: "h264", audioCodec: "opus" }, context),
    /Invalid media container/
  );
  await assert.rejects(
    () => engine.execute({ type: "transcode", inputUri: "in.mp4", outputUri: "out.mp4", container: "mp4", audioCodec: "mp3" }, context),
    /Invalid audio codec/
  );
  assert.equal(worker.calls.length, 0);
});

test("inferred MKV delivery dispatches only a currently supported default", async () => {
  const worker = new FakeWorker();
  const engine = new FfmpegMediaEngine(worker);
  await engine.execute({ type: "transcode", inputUri: "in.mp4", outputUri: "out.mkv" }, context);
  assert.equal(worker.calls[0].name, "cevra-transcode");
  assert.deepEqual(worker.calls[0].arguments_, {
    input: "in.mp4", output: "out.mkv", container: "mkv", video_codec: "h264", audio_codec: "aac"
  });
});

test("audio-only transcode drops video explicitly and rejects video transforms", async () => {
  const worker = new FakeWorker();
  const engine = new FfmpegMediaEngine(worker);
  await engine.execute({ type: "transcode", inputUri: "in.mp4", outputUri: "out.wav" }, context);
  assert.deepEqual(worker.calls[0].arguments_, {
    input: "in.mp4", output: "out.wav", container: "wav", audio_codec: "pcm", drop_video: true
  });

  worker.calls.length = 0;
  await assert.rejects(
    () => engine.execute({ type: "transcode", inputUri: "in.mp4", outputUri: "out.wav", width: 100 }, context),
    /audio-only/
  );
  assert.equal(worker.calls.length, 0);
});

test("stream copy probes real input codecs before dispatch", async () => {
  const worker = new FakeWorker();
  worker.probeVideoCodec = "h264";
  worker.probeAudioCodec = "opus";
  const engine = new FfmpegMediaEngine(worker);
  await engine.execute({ type: "transcode", inputUri: "in.mkv", outputUri: "out.mkv", videoCodec: "copy", audioCodec: "copy" }, context);
  assert.deepEqual(worker.calls.map((call) => call.name), ["probe", "cevra-transcode"]);
  assert.equal(worker.calls[1].arguments_.video_codec, "copy");
  assert.equal(worker.calls[1].arguments_.audio_codec, "copy");

  const incompatible = new FakeWorker();
  incompatible.probeVideoCodec = "vp9";
  const incompatibleEngine = new FfmpegMediaEngine(incompatible);
  await assert.rejects(
    () => incompatibleEngine.execute({ type: "transcode", inputUri: "in.mp4", outputUri: "out.mkv", videoCodec: "copy", audioCodec: "opus" }, context),
    /video codec cannot be copied/
  );
  assert.deepEqual(incompatible.calls.map((call) => call.name), ["probe"]);
});

test("extract-audio forwards its resolved codec through the typed transcode tool", async () => {
  const worker = new FakeWorker();
  const engine = new FfmpegMediaEngine(worker);
  await engine.execute({ type: "extract-audio", inputUri: "in.mp4", outputUri: "out.mkv", audioCodec: "opus" }, context);
  assert.equal(worker.calls[0].name, "cevra-transcode");
  assert.deepEqual(worker.calls[0].arguments_, {
    input: "in.mp4", output: "out.mkv", container: "mkv", audio_codec: "opus", drop_video: true
  });
});

test("extract-frame uses the typed CEVRA tool and preserves the requested output path", async () => {
  const worker = new FakeWorker();
  const engine = new FfmpegMediaEngine(worker);
  await engine.execute({ type: "extract-frame", inputUri: "in.mp4", outputUri: "frame.png", atMs: 1250 }, context);
  assert.deepEqual(worker.calls[0], {
    name: "cevra-extract-frame",
    arguments_: { input: "in.mp4", output: "frame.png", at: 1.25 },
    jobId: "job-1",
    signal: undefined
  });
});

test("mux-audio preserves or replaces existing audio according to replaceExisting", async () => {
  const worker = new FakeWorker();
  const engine = new FfmpegMediaEngine(worker);
  await engine.execute({ type: "mux-audio", videoUri: "video.mp4", audioUri: "new.wav", outputUri: "added.mp4", replaceExisting: false }, context);
  assert.deepEqual(worker.calls.map((call) => call.name), ["probe", "cevra-mux-audio"]);
  assert.equal(worker.calls[1].arguments_.replace_existing, false);

  worker.calls.length = 0;
  await engine.execute({ type: "mux-audio", videoUri: "video.mp4", audioUri: "new.wav", outputUri: "replaced.mp4" }, context);
  assert.equal(worker.calls[1].arguments_.replace_existing, true);
});

test("mux-audio maps closed per-stream duration validation and parses publication evidence", async () => {
  const worker = new FakeWorker();
  const result = await new FfmpegMediaEngine(worker).execute({
    type: "mux-audio", videoUri: "video.mp4", audioUri: "audio.wav", outputUri: "out.mp4",
    durationValidation: { version: 1, videoDurationMs: 4000, audioDurationMs: 4000, inputToleranceMs: 1, outputAudioToleranceMs: 23 }
  }, context);
  assert.deepEqual(worker.calls[1].arguments_.duration_validation, {
    version: 1, video_duration_ms: 4000, audio_duration_ms: 4000, input_tolerance_ms: 1, output_audio_tolerance_ms: 23
  });
  assert.deepEqual(result.publication, { version: 1, scheme: "posix-dev-inode", device: "1", inode: "3" });
  assert.equal(result.muxDuration.outputAudioDurationMs, 4000);
});

test("adapter rejects malformed publication and mux-duration evidence", async () => {
  for (const patch of [
    { publication: { version: 1, scheme: "posix-dev-inode", device: "1", inode: "0" } },
    { muxDuration: { version: 1, inputVideoDurationMs: 4000, inputAudioDurationMs: 4000, outputVideoDurationMs: 4000, outputAudioDurationMs: -1 } }
  ]) {
    const worker = new FakeWorker();
    const original = worker.callTool.bind(worker);
    worker.callTool = async (...args) => {
      const response = await original(...args);
      if (args[0] === "cevra-mux-audio") Object.assign(response.structuredContent, patch);
      return response;
    };
    await assert.rejects(() => new FfmpegMediaEngine(worker).execute({ type: "mux-audio", videoUri: "video.mp4", audioUri: "audio.wav", outputUri: "out.mp4" }, context), /evidence is invalid/);
  }
});

test("audio mutations validate copied input video against the output container", async () => {
  const compatible = new FakeWorker();
  const engine = new FfmpegMediaEngine(compatible);
  await engine.execute({ type: "volume", inputUri: "in.mp4", outputUri: "out.mp4", gainDb: -2 }, context);
  assert.deepEqual(compatible.calls.map((call) => call.name), ["probe", "audio"]);

  const incompatible = new FakeWorker();
  incompatible.probeVideoCodec = "vp9";
  const incompatibleEngine = new FfmpegMediaEngine(incompatible);
  await assert.rejects(
    () => incompatibleEngine.execute({ type: "volume", inputUri: "in.webm", outputUri: "out.mp4", gainDb: -2 }, context),
    /video codec cannot be copied/
  );
  assert.deepEqual(incompatible.calls.map((call) => call.name), ["probe"]);
});

test("render-audio-sequence maps the general typed value without a video delivery prerequisite", async () => {
  const worker = new FakeWorker();
  const engine = new FfmpegMediaEngine(worker);
  const result = await engine.execute({
    type: "render-audio-sequence", version: 1,
    sources: [{ id: "a", uri: "/media/a.wav" }, { id: "b", uri: "/media/b.mov" }, { id: "c", uri: "/media/c.wav" }],
    items: [
      { sourceId: "a", sourceStartMs: 0, sourceEndMs: 1500, timelineStartMs: 0 },
      { sourceId: "b", sourceStartMs: 0, sourceEndMs: 2500, timelineStartMs: 1500, gainDb: -3, fadeInMs: 50 },
      { sourceId: "c", sourceStartMs: 500, sourceEndMs: 1000, timelineStartMs: 3000, fadeOutMs: 50 }
    ],
    outputUri: "/media/staging/jcut.wav", outputDurationMs: 4000, outputChannelLayout: "stereo"
  }, context);
  assert.equal(worker.calls.length, 1);
  assert.equal(worker.calls[0].name, "cevra-render-audio-sequence");
  assert.deepEqual(worker.calls[0].arguments_.sources, [
    { id: "a", uri: "/media/a.wav" }, { id: "b", uri: "/media/b.mov" }, { id: "c", uri: "/media/c.wav" }
  ]);
  assert.deepEqual(worker.calls[0].arguments_.items[1], {
    source_id: "b", source_start_ms: 0, source_end_ms: 2500, timeline_start_ms: 1500, gain_db: -3, fade_in_ms: 50
  });
  assert.equal(result.probe.audioCodec, "pcm_f32le");
  assert.equal(result.probe.sizeBytes, 1_536_114);
  assert.equal(result.audioSequence.outputSampleCount, 192_000);
});

test("render-audio-sequence rejects malformed worker evidence", async () => {
  for (const audioSequence of [
    { version: 1, sampleRate: 48000, sampleFormat: "pcm_f32le", channelLayout: "mono", distinctSourceCount: 1, itemCount: 1, maximumSimultaneousItemCount: -1, outputSampleCount: 48000, estimatedDataBytes: 192000, measuredDataBytes: 192000, graphBytes: 10 },
    { version: 1, sampleRate: 48000, sampleFormat: "pcm_f32le", channelLayout: "mono", distinctSourceCount: 1, itemCount: 1, maximumSimultaneousItemCount: 1, outputSampleCount: 48000, estimatedDataBytes: 192000, measuredDataBytes: 192000, graphBytes: 10, arbitrary: true }
  ]) {
    const worker = new FakeWorker();
    worker.callTool = async () => ({ structuredContent: {
      status: "completed", output: "/media/out.wav",
      probe: { file: "/media/out.wav", duration: 1, audio: { codec: "pcm_f32le", sample_rate: 48000, channels: 1 } },
      effectiveProfile: { container: "wav", audioCodec: "pcm", audioEncoder: "pcm_f32le" },
      audioSequence
    } });
    await assert.rejects(() => new FfmpegMediaEngine(worker).execute({
      type: "render-audio-sequence", version: 1,
      sources: [{ id: "a", uri: "/media/a.wav" }],
      items: [{ sourceId: "a", sourceStartMs: 0, sourceEndMs: 1000, timelineStartMs: 0 }],
      outputUri: "/media/out.wav", outputDurationMs: 1000, outputChannelLayout: "mono"
    }, context), /audio sequence evidence is invalid/);
  }
});
