import test from "node:test";
import assert from "node:assert/strict";
import { FfmpegMediaEngine } from "../dist/index.js";

class FakeWorker {
  calls = [];
  probeVideoCodec = "h264";
  probeAudioCodec = "aac";
  async info() {
    return { name: "cevra-media-worker", version: "0.1.0", protocolVersion: 1, upstream: { id: "ffmpeg-skill", version: "1.4.2", contractVersion: "1.0" } };
  }
  async health() {
    return { ok: true, checkedAt: "2026-09-11T18:00:00.000Z", checks: [{ id: "ffmpeg", status: "PASS" }], tools: { probe: { usable: "yes" }, cut: { usable: "yes" }, fit: { usable: "yes" }, silence: { usable: "yes" } } };
  }
  async listTools() { return []; }
  async callTool(name, arguments_, jobId, signal) {
    this.calls.push({ name, arguments_, jobId, signal });
    if (name === "probe") return { structuredContent: { file: arguments_.inputs[0], duration: 2.5, video: { width: 1920, height: 1080, fps: 30, codec: this.probeVideoCodec }, audio: { codec: this.probeAudioCodec, sample_rate: 48000, channels: 2 } } };
    if (name === "silence") return { structuredContent: { silences: [[1.2, 2.4], [5.0, null]] } };
    return { structuredContent: { status: "completed", output: arguments_.output, probe: { file: arguments_.output, duration: 1.0 } } };
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
  assert.equal(result.ranges[1].endMs, Number.MAX_SAFE_INTEGER);
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
    /incompatible with WEBM/
  );
  await assert.rejects(
    () => engine.execute({ type: "transcode", inputUri: "in.mp4", outputUri: "out.mp4", container: "mp4", audioCodec: "mp3" }, context),
    /incompatible with MP4/
  );
  assert.equal(worker.calls.length, 0);
});

test("inferred containers dispatch compatible defaults instead of H.264/AAC everywhere", async () => {
  const worker = new FakeWorker();
  const engine = new FfmpegMediaEngine(worker);
  await engine.execute({ type: "transcode", inputUri: "in.mp4", outputUri: "out.webm" }, context);
  assert.equal(worker.calls[0].name, "cevra-transcode");
  assert.deepEqual(worker.calls[0].arguments_, {
    input: "in.mp4", output: "out.webm", container: "webm", video_codec: "vp9", audio_codec: "opus"
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
  worker.probeVideoCodec = "vp9";
  worker.probeAudioCodec = "opus";
  const engine = new FfmpegMediaEngine(worker);
  await engine.execute({ type: "transcode", inputUri: "in.webm", outputUri: "out.webm", videoCodec: "copy", audioCodec: "copy" }, context);
  assert.deepEqual(worker.calls.map((call) => call.name), ["probe", "cevra-transcode"]);
  assert.equal(worker.calls[1].arguments_.video_codec, "copy");
  assert.equal(worker.calls[1].arguments_.audio_codec, "copy");

  const incompatible = new FakeWorker();
  const incompatibleEngine = new FfmpegMediaEngine(incompatible);
  await assert.rejects(
    () => incompatibleEngine.execute({ type: "transcode", inputUri: "in.mp4", outputUri: "out.webm", videoCodec: "copy" }, context),
    /video codec cannot be copied/
  );
  assert.deepEqual(incompatible.calls.map((call) => call.name), ["probe"]);
});

test("extract-audio forwards its resolved codec through the typed transcode tool", async () => {
  const worker = new FakeWorker();
  const engine = new FfmpegMediaEngine(worker);
  await engine.execute({ type: "extract-audio", inputUri: "in.mp4", outputUri: "out.webm", audioCodec: "opus" }, context);
  assert.equal(worker.calls[0].name, "cevra-transcode");
  assert.deepEqual(worker.calls[0].arguments_, {
    input: "in.mp4", output: "out.webm", container: "webm", audio_codec: "opus", drop_video: true
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
