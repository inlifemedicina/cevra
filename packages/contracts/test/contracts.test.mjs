import test from "node:test";
import assert from "node:assert/strict";
import { MAX_MEDIA_DURATION_MS, MAX_MEDIA_FPS, MAX_MEDIA_HEIGHT, MAX_MEDIA_INPUTS, MAX_MEDIA_URI_LENGTH, MAX_MEDIA_WIDTH, MEDIA_DELIVERY_MATRIX, resolveAudioDelivery, resolveAudioMutationDelivery, resolveStandardAvDelivery, resolveTranscodeDelivery, validateCopyCompatibility, validateMediaOperation } from "../dist/index.js";

test("valid typed trim operation is accepted", () => {
  const operation = validateMediaOperation({ type: "trim", inputUri: "in.mp4", outputUri: "out.mp4", startMs: 0, endMs: 1000 });
  assert.equal(operation.type, "trim");
});

test("raw shell and ffmpeg filtergraph injection fields are rejected", () => {
  assert.throws(() => validateMediaOperation({ type: "probe", inputUri: "in.mp4", shell: "rm -rf /" }), /Forbidden execution field/);
  assert.throws(() => validateMediaOperation({ type: "probe", inputUri: "in.mp4", nested: { filtergraph: "evil" } }), /Forbidden execution field/);
  assert.throws(() => validateMediaOperation({ type: "probe", inputUri: "-f" }), /safe media URI/);
  assert.throws(() => validateMediaOperation({ type: "concat", inputUris: ["safe.mp4", "evil\nfile.mp4"], outputUri: "out.mp4" }), /safe media URI/);
  assert.throws(() => validateMediaOperation({ type: "probe", inputUri: "in.mp4", futureField: true }), /unexpected fields/);
});

test("unsafe timing and speed values are rejected", () => {
  assert.throws(() => validateMediaOperation({ type: "trim", inputUri: "in.mp4", outputUri: "out.mp4", startMs: 1000, endMs: 500 }), /greater than/);
  assert.throws(() => validateMediaOperation({ type: "speed", inputUri: "in.mp4", outputUri: "out.mp4", factor: 100 }), /between/);
});

test("unsupported codec and container values are rejected", () => {
  assert.throws(() => validateMediaOperation({ type: "transcode", inputUri: "in.mp4", outputUri: "out.mp4", container: "exe" }), /Invalid media container/);
  assert.throws(() => validateMediaOperation({ type: "transcode", inputUri: "in.mp4", outputUri: "out.mp4", videoCodec: "mystery" }), /Invalid video codec/);
  assert.throws(() => validateMediaOperation({ type: "extract-audio", inputUri: "in.mp4", outputUri: "out.wav", audioCodec: "mystery" }), /Invalid audio codec/);
});

test("codec and container fields require exact scalar string types", () => {
  assert.throws(() => validateMediaOperation({ type: "transcode", inputUri: "in.mp4", outputUri: "out.mp4", container: ["mp4"] }), /Invalid media container/);
  assert.throws(() => validateMediaOperation({ type: "transcode", inputUri: "in.mp4", outputUri: "out.mp4", videoCodec: ["h264"] }), /Invalid video codec/);
  assert.throws(() => validateMediaOperation({ type: "transcode", inputUri: "in.mp4", outputUri: "out.mp4", audioCodec: { toString: () => "aac" } }), /Invalid audio codec/);
  assert.throws(() => validateMediaOperation({ type: "fit", inputUri: "in.mp4", outputUri: "out.mp4", width: 10, height: 10, mode: ["cover"] }), /Invalid fit mode/);
});

test("delivery matrix accepts every declared codec and rejects cross-container combinations", () => {
  for (const [container, rule] of Object.entries(MEDIA_DELIVERY_MATRIX)) {
    for (const videoCodec of rule.videoCodecs) {
      assert.equal(resolveTranscodeDelivery({ outputUri: `out.${container}`, videoCodec }).videoCodec, videoCodec);
    }
    for (const audioCodec of rule.audioCodecs) {
      assert.equal(resolveAudioDelivery(`out.${container}`, audioCodec).audioCodec, audioCodec);
    }
  }
  assert.equal(Object.hasOwn(MEDIA_DELIVERY_MATRIX, "webm"), false);
  assert.equal(Object.hasOwn(MEDIA_DELIVERY_MATRIX, "mp3"), false);
  assert.throws(() => resolveTranscodeDelivery({ outputUri: "out.webm", videoCodec: "h264" }), /must be inferable/);
  assert.throws(() => resolveTranscodeDelivery({ outputUri: "out.mp4", audioCodec: "opus" }), /incompatible with MP4/);
  assert.throws(() => resolveTranscodeDelivery({ outputUri: "out.wav", videoCodec: "h264" }), /audio-only/);
  assert.throws(() => validateMediaOperation({ type: "extract-audio", inputUri: "in.mp4", outputUri: "out.m4a", audioCodec: "opus" }), /incompatible with M4A/);
  assert.throws(() => validateMediaOperation({ type: "mux-audio", videoUri: "in.mp4", audioUri: "voice.wav", outputUri: "out.wav" }), /audio-only/);
});

test("container inference applies compatible defaults and rejects extension conflicts", () => {
  assert.deepEqual(resolveTranscodeDelivery({ outputUri: "OUT.MKV" }), {
    container: "mkv", audioOnly: false, videoCodec: "h264", audioCodec: "aac"
  });
  assert.deepEqual(resolveTranscodeDelivery({ outputUri: "out.wav" }), {
    container: "wav", audioOnly: true, audioCodec: "pcm"
  });
  assert.throws(() => resolveTranscodeDelivery({ outputUri: "out.mkv", container: "mp4" }), /does not match/);
  assert.throws(() => resolveTranscodeDelivery({ outputUri: "out.unknown" }), /must be inferable/);
});

test("fixed media operations reject containers their actual codecs cannot produce", () => {
  assert.throws(() => validateMediaOperation({ type: "fit", inputUri: "in.mp4", outputUri: "out.wav", width: 10, height: 10, mode: "contain" }), /audio-only/);
  assert.throws(() => validateMediaOperation({ type: "volume", inputUri: "in.mp4", outputUri: "out.m4a", gainDb: 1 }), /audio-only/);
  assert.throws(() => validateMediaOperation({ type: "extract-frame", inputUri: "in.mp4", outputUri: "frame.jpg", atMs: 0 }), /PNG container/);
  assert.equal(resolveStandardAvDelivery("out.mov").videoCodec, "h264");
  assert.equal(resolveStandardAvDelivery("out.wav", true).audioOnly, true);
  assert.equal(resolveAudioMutationDelivery("out.mkv").videoCodec, "copy");
});

test("shared resource limits accept legitimate boundaries and reject overflow", () => {
  assert.doesNotThrow(() => validateMediaOperation({ type: "transcode", inputUri: "i", outputUri: "o.mp4", width: MAX_MEDIA_WIDTH, height: MAX_MEDIA_HEIGHT, fps: MAX_MEDIA_FPS }));
  assert.throws(() => validateMediaOperation({ type: "transcode", inputUri: "i", outputUri: "o.mp4", width: MAX_MEDIA_WIDTH + 1 }), /exceeds/);
  assert.throws(() => validateMediaOperation({ type: "trim", inputUri: "i", outputUri: "o.mp4", startMs: 0, endMs: MAX_MEDIA_DURATION_MS + 1 }), /maximum media duration/);
  assert.throws(() => validateMediaOperation({ type: "concat", inputUris: Array(MAX_MEDIA_INPUTS + 1).fill("i.mp4"), outputUri: "o.mp4" }), /1-128/);
  assert.throws(() => validateMediaOperation({ type: "probe", inputUri: "a".repeat(MAX_MEDIA_URI_LENGTH + 1) }), /no longer than/);
});

test("stream copy requires compatible codecs proven by input metadata", () => {
  const mp4 = resolveTranscodeDelivery({ outputUri: "out.mp4", videoCodec: "copy", audioCodec: "copy" });
  assert.doesNotThrow(() => validateCopyCompatibility(mp4, { hasVideo: true, hasAudio: true, videoCodec: "h264", audioCodec: "aac" }));
  assert.throws(() => validateCopyCompatibility(mp4, { hasVideo: true, hasAudio: true, videoCodec: "vp9", audioCodec: "aac" }), /video codec cannot be copied/);
  assert.throws(() => validateCopyCompatibility(mp4, { hasVideo: true, hasAudio: true, videoCodec: "h264", audioCodec: "opus" }), /audio codec cannot be copied/);
  assert.throws(() => validateCopyCompatibility(mp4, { hasVideo: false, hasAudio: false }), /video codec cannot be copied/);
});

test("numeric contracts reject non-finite, fractional pixel and misaligned speed values", () => {
  assert.throws(() => validateMediaOperation({ type: "transcode", inputUri: "in.mp4", outputUri: "out.mp4", fps: Number.NaN }), /greater than 0/);
  assert.throws(() => validateMediaOperation({ type: "volume", inputUri: "in.mp4", outputUri: "out.mp4", gainDb: Number.POSITIVE_INFINITY }), /finite/);
  assert.throws(() => validateMediaOperation({ type: "crop", inputUri: "in.mp4", outputUri: "out.mp4", x: 0.5, y: 0, width: 100, height: 100 }), /non-negative integer/);
  assert.throws(() => validateMediaOperation({ type: "transcode", inputUri: "in.mp4", outputUri: "out.mp4", width: 1920.5 }), /positive integer/);
  assert.throws(() => validateMediaOperation({ type: "speed", inputUri: "in.mp4", outputUri: "out.mp4", factor: 0.01 }), /between/);
});
