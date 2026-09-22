import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUDIO_SEQUENCE_SAMPLE_FORMAT, AUDIO_SEQUENCE_SAMPLE_RATE, AUDIO_SEQUENCE_VERSION, MAX_AUDIO_SEQUENCE_GAIN_DB, MAX_AUDIO_SEQUENCE_GRAPH_BYTES, MAX_AUDIO_SEQUENCE_INPUT_ARGUMENT_BYTES, MAX_AUDIO_SEQUENCE_ITEMS, MAX_AUDIO_SEQUENCE_WAV_DATA_BYTES, MAX_MEDIA_DURATION_MS, MAX_MEDIA_FPS, MAX_MEDIA_HEIGHT, MAX_MEDIA_INPUTS, MAX_MEDIA_URI_LENGTH, MAX_MEDIA_WIDTH, MEDIA_DELIVERY_MATRIX, MIN_AUDIO_SEQUENCE_GAIN_DB } from "@cevra/contracts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures", "native_tool_matrix.py");
const python = process.env.CEVRA_TEST_PYTHON || "python3";

function run(operation, arguments_, metadata = {}, encoders) {
  const result = spawnSync(python, ["-s", "-B", fixture, JSON.stringify({ operation, arguments: arguments_, metadata, encoders })], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("TypeScript and Python use the same delivery matrix", () => {
  const pythonMatrix = run("matrix", {}).matrix;
  assert.deepEqual(Object.keys(pythonMatrix).sort(), Object.keys(MEDIA_DELIVERY_MATRIX).sort());
  assert.equal(Object.hasOwn(pythonMatrix, "webm"), false);
  assert.equal(Object.hasOwn(pythonMatrix, "mp3"), false);
  for (const [container, rule] of Object.entries(MEDIA_DELIVERY_MATRIX)) {
    assert.deepEqual(pythonMatrix[container], {
      videoCodecs: [...rule.videoCodecs].sort(),
      audioCodecs: [...rule.audioCodecs].sort(),
      defaultVideoCodec: rule.defaultVideoCodec ?? null,
      defaultAudioCodec: rule.defaultAudioCodec,
      audioOnly: rule.audioOnly
    });
  }
});

test("TypeScript and Python expose semantically identical media resource limits", () => {
  assert.deepEqual(run("limits", {}), {
    width: MAX_MEDIA_WIDTH,
    height: MAX_MEDIA_HEIGHT,
    fps: MAX_MEDIA_FPS,
    durationMs: MAX_MEDIA_DURATION_MS,
    inputs: MAX_MEDIA_INPUTS,
    uriLength: MAX_MEDIA_URI_LENGTH,
    audioSequenceItems: MAX_AUDIO_SEQUENCE_ITEMS,
    audioSequenceGainDb: [MIN_AUDIO_SEQUENCE_GAIN_DB, MAX_AUDIO_SEQUENCE_GAIN_DB],
    audioSequenceVersion: AUDIO_SEQUENCE_VERSION,
    audioSequenceSampleRate: AUDIO_SEQUENCE_SAMPLE_RATE,
    audioSequenceSampleFormat: AUDIO_SEQUENCE_SAMPLE_FORMAT,
    audioSequenceGraphBytes: MAX_AUDIO_SEQUENCE_GRAPH_BYTES,
    audioSequenceInputArgumentBytes: MAX_AUDIO_SEQUENCE_INPUT_ARGUMENT_BYTES,
    audioSequenceWavDataBytes: MAX_AUDIO_SEQUENCE_WAV_DATA_BYTES
  });
});

test("Python worker applies the supported MKV defaults from its delivery matrix", () => {
  const result = run("transcode", { input: "in.mp4", output: "out.mkv" }, {
    "in.mp4": { video: { codec: "h264" }, audio: { codec: "aac" } }
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.command.slice(-3), ["-f", "matroska", "out.mkv"]);
  assert.equal(result.command.includes("h264_test"), true);
  assert.equal(result.command.includes("aac"), true);
});

test("Python worker fails explicitly when a requested bundle encoder is unavailable", () => {
  const metadata = { "in.mp4": { video: { codec: "h264" }, audio: { codec: "aac" } } };
  const missingOpus = run("transcode", { input: "in.mp4", output: "out.mkv", video_codec: "copy", audio_codec: "opus" }, metadata, ["aac"]);
  assert.match(missingOpus.error, /OPUS encoder opus is not available/);
  const removedWebm = run("transcode", { input: "in.mp4", output: "out.webm" }, metadata, ["aac"]);
  assert.match(removedWebm.error, /container is required or must be inferable/);
  const removedMp3 = run("transcode", { input: "in.mp4", output: "out.mp3" }, metadata, ["aac"]);
  assert.match(removedMp3.error, /container is required or must be inferable/);
});

test("Python worker enables the bundled native Opus encoder explicitly", () => {
  const result = run("transcode", { input: "in.mp4", output: "out.mkv", video_codec: "copy", audio_codec: "opus" }, {
    "in.mp4": { video: { codec: "h264" }, audio: { codec: "aac" } }
  }, ["aac", "opus"]);
  assert.equal(result.error, undefined);
  assert.equal(result.command.join(" ").includes("-c:a opus -strict -2 -b:a 160k"), true);
});

test("Python worker drops video explicitly for inferred audio-only containers", () => {
  const result = run("transcode", { input: "in.mp4", output: "out.wav" }, {
    "in.mp4": { video: { codec: "h264" }, audio: { codec: "aac" } }
  });
  assert.equal(result.error, undefined);
  assert.equal(result.command.includes("-vn"), true);
  assert.equal(result.command.includes("pcm_s16le"), true);
  assert.deepEqual(result.command.slice(-3), ["-f", "wav", "out.wav"]);

  const transformed = run("transcode", { input: "in.mp4", output: "out.wav", width: 100 }, {
    "in.mp4": { video: { codec: "h264" }, audio: { codec: "aac" } }
  });
  assert.match(transformed.error, /cannot be used when video is dropped/);
});

test("Python worker rejects non-scalar codecs and incompatible stream copy", () => {
  const malformed = run("transcode", { input: "in.mp4", output: "out.mp4", video_codec: ["h264"] }, {
    "in.mp4": { video: { codec: "h264" }, audio: { codec: "aac" } }
  });
  assert.match(malformed.error, /video_codec is invalid/);
  const nullCodec = run("transcode", { input: "in.mp4", output: "out.mp4", audio_codec: null }, {
    "in.mp4": { video: { codec: "h264" }, audio: { codec: "aac" } }
  });
  assert.match(nullCodec.error, /audio_codec is invalid/);
  const nullWidth = run("transcode", { input: "in.mp4", output: "out.mp4", width: null }, {
    "in.mp4": { video: { codec: "h264" }, audio: { codec: "aac" } }
  });
  assert.match(nullWidth.error, /width must be greater than 0/);

  const incompatible = run("transcode", { input: "in.mp4", output: "out.mp4", video_codec: "copy" }, {
    "in.mp4": { video: { codec: "vp9" }, audio: { codec: "aac" } }
  });
  assert.match(incompatible.error, /video codec cannot be copied into mp4/);
});

test("Python numeric validators reject NaN, Infinity and fractional pixel values", () => {
  const result = run("numbers", {});
  assert.equal(result.failures.length, 4);
  assert.match(result.failures[3], /positive integer/);
  assert.deepEqual(result.boundaryRejections, [true, true, true]);
});

test("Python mux keeps the existing audio stream only when replacement is disabled", () => {
  const metadata = {
    "video.mp4": { video: { codec: "h264" }, audio: { codec: "aac" } },
    "new.wav": { audio: { codec: "pcm_s16le" } }
  };
  const preserved = run("mux", { video: "video.mp4", audio: "new.wav", output: "out.mp4", replace_existing: false }, metadata);
  const replaced = run("mux", { video: "video.mp4", audio: "new.wav", output: "out.mp4", replace_existing: true }, metadata);
  assert.equal(preserved.error, undefined);
  assert.equal(replaced.error, undefined);
  assert.equal(preserved.command.join(" ").includes("-map 1:a:0 -map 0:a:0"), true);
  assert.equal(replaced.command.join(" ").includes("0:a:0"), false);
  assert.equal(replaced.command.join(" ").includes("-map 1:a:0"), true);
});

test("Python frame extraction writes exactly the requested output using the PNG encoder", () => {
  const result = run("extract-frame", { input: "in.mp4", output: "frame.png", at: 1.25 }, {
    "in.mp4": { video: { codec: "h264" }, audio: { codec: "aac" } }
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.command.slice(-7), ["-map", "0:v:0", "-frames:v", "1", "-c:v", "png", "frame.png"]);
  assert.equal(result.command.includes("frame_1.250s.png"), false);
});

test("Python audio-sequence compiler uses one bounded float32 pass with source URIs outside the graph", () => {
  const result = run("audio-sequence", {
    version: 1,
    sources: [
      { id: "a", uri: "replaced-by-fixture", channels: 1, channel_layout: "mono" },
      { id: "b", uri: "replaced-by-fixture", channels: 2, channel_layout: "stereo", sample_rate: 44100 },
      { id: "c", uri: "replaced-by-fixture", channels: 1, channel_layout: "mono" }
    ],
    items: [
      { source_id: "a", source_start_ms: 0, source_end_ms: 1500, timeline_start_ms: 0 },
      { source_id: "b", source_start_ms: 0, source_end_ms: 2500, timeline_start_ms: 1500, gain_db: -3, fade_in_ms: 50 },
      { source_id: "a", source_start_ms: 2000, source_end_ms: 2500, timeline_start_ms: 3000 },
      { source_id: "c", source_start_ms: 500, source_end_ms: 1000, timeline_start_ms: 3500, fade_out_ms: 50 }
    ],
    output_duration_ms: 4000,
    output_channel_layout: "stereo"
  });
  assert.equal(result.error, undefined);
  assert.equal(result.command.filter((part) => part === "-i").length, 3);
  assert.equal(result.command.includes("pcm_f32le"), true);
  assert.equal(result.command.includes("48000"), true);
  assert.equal(result.command.includes("-/filter_complex"), true);
  assert.match(result.graph, /asplit=2/);
  assert.match(result.graph, /pan=stereo\|c0=c0\|c1=c0/);
  assert.match(result.graph, /aformat=channel_layouts=stereo/);
  assert.match(result.graph, /amix=inputs=5:duration=longest:dropout_transition=0:normalize=0/);
  assert.match(result.graph, /atrim=end_sample=192000/);
  assert.equal(result.graph.includes("source-0.wav"), false);
  assert.deepEqual(result.result.audioSequence, {
    version: 1, sampleRate: 48000, sampleFormat: "pcm_f32le", channelLayout: "stereo",
    distinctSourceCount: 3, itemCount: 4, maximumSimultaneousItemCount: 2,
    outputSampleCount: 192000, estimatedDataBytes: 1536000, graphBytes: Buffer.byteLength(result.graph.trimEnd())
  });
});
