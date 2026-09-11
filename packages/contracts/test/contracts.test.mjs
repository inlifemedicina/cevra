import test from "node:test";
import assert from "node:assert/strict";
import { validateMediaOperation } from "../dist/index.js";

test("valid typed trim operation is accepted", () => {
  const operation = validateMediaOperation({ type: "trim", inputUri: "in.mp4", outputUri: "out.mp4", startMs: 0, endMs: 1000 });
  assert.equal(operation.type, "trim");
});

test("raw shell and ffmpeg filtergraph injection fields are rejected", () => {
  assert.throws(() => validateMediaOperation({ type: "probe", inputUri: "in.mp4", shell: "rm -rf /" }), /Forbidden execution field/);
  assert.throws(() => validateMediaOperation({ type: "probe", inputUri: "in.mp4", nested: { filtergraph: "evil" } }), /Forbidden execution field/);
});

test("unsafe timing and speed values are rejected", () => {
  assert.throws(() => validateMediaOperation({ type: "trim", inputUri: "in.mp4", outputUri: "out.mp4", startMs: 1000, endMs: 500 }), /greater than/);
  assert.throws(() => validateMediaOperation({ type: "speed", inputUri: "in.mp4", outputUri: "out.mp4", factor: 100 }), /safety limit/);
});

test("unsupported codec and container values are rejected", () => {
  assert.throws(() => validateMediaOperation({ type: "transcode", inputUri: "in.mp4", outputUri: "out.mp4", container: "exe" }), /Invalid media container/);
  assert.throws(() => validateMediaOperation({ type: "transcode", inputUri: "in.mp4", outputUri: "out.mp4", videoCodec: "mystery" }), /Invalid video codec/);
  assert.throws(() => validateMediaOperation({ type: "extract-audio", inputUri: "in.mp4", outputUri: "out.wav", audioCodec: "mystery" }), /Invalid audio codec/);
});
