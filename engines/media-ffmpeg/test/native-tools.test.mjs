import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MEDIA_DELIVERY_MATRIX } from "@cevra/contracts";

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

test("Python worker applies WebM defaults from its delivery matrix", () => {
  const result = run("transcode", { input: "in.mp4", output: "out.webm" }, {
    "in.mp4": { video: { codec: "h264" }, audio: { codec: "aac" } }
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.command.slice(-3), ["-f", "webm", "out.webm"]);
  assert.equal(result.command.includes("libvpx-vp9"), true);
  assert.equal(result.command.includes("libopus"), true);
  assert.equal(result.command.includes("h264_test"), false);
});

test("Python worker fails explicitly when a requested bundle encoder is unavailable", () => {
  const metadata = { "in.mp4": { video: { codec: "h264" }, audio: { codec: "aac" } } };
  const missingVp9 = run("transcode", { input: "in.mp4", output: "out.webm" }, metadata, ["aac"]);
  assert.match(missingVp9.error, /VP9 encoder is not available/);
  const missingOpus = run("transcode", { input: "in.mp4", output: "out.webm", video_codec: "copy" }, {
    "in.mp4": { video: { codec: "vp9" }, audio: { codec: "opus" } }
  }, ["libvpx-vp9"]);
  assert.match(missingOpus.error, /OPUS encoder libopus is not available/);
  const missingMp3 = run("transcode", { input: "in.mp4", output: "out.mp3" }, metadata, ["aac"]);
  assert.match(missingMp3.error, /MP3 encoder libmp3lame is not available/);
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

  const incompatible = run("transcode", { input: "in.mp4", output: "out.webm", video_codec: "copy" }, {
    "in.mp4": { video: { codec: "h264" }, audio: { codec: "opus" } }
  });
  assert.match(incompatible.error, /video codec cannot be copied into webm/);
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
  assert.equal(preserved.command.join(" ").includes("-map 0:a:0 -map 1:a:0"), true);
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
