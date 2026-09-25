import test from "node:test";
import assert from "node:assert/strict";
import { FfmpegMediaEngine } from "../dist/index.js";
import { AUDIO_MEASUREMENT_METHOD } from "@cevra/contracts";

const operation = { type: "measure-audio", version: 1, inputUri: "/a.wav", streamIndex: 3, startMs: 1, endMs: 9 };
function evidence() { return { version: 1, method: AUDIO_MEASUREMENT_METHOD, executionId: "job", inputUri: "/a.wav", streamIndex: 3, startMs: 1, endMs: 9,
  sampleRate: 44100, channelLayout: "mono", sampleFrames: 352, coverageStartSample: 45, coverageEndSample: 397, complete: true,
  channels: [{ channelIndex: 0, rmsLinear: 1.1, samplePeakLinear: 1.2, reachesFullScale: true, exceedsFullScale: true }], truePeakLinear: 1.25,
  integratedLufs: { status: "unavailable", reason: "insufficient-duration" }, shortTermMaxLufs: { status: "unavailable", reason: "insufficient-duration" }, shortTermValidObservations: 0 }; }
test("adapter executes typed read-only measurement without requiring video encoder/delivery", async () => {
  const worker = { health() { assert.fail("measurement must not need a delivery encoder"); }, async callTool(name, args, jobId) {
    assert.equal(name, "cevra-measure-audio"); assert.equal(jobId, "job");
    assert.deepEqual(args, { version: 1, input: "/a.wav", stream_index: 3, start_ms: 1, end_ms: 9 });
    return { structuredContent: evidence() };
  } };
  const result = await new FfmpegMediaEngine(worker).execute(operation, { jobId: "job", locale: "en-US" });
  assert.equal(result.type, "measure-audio"); assert.equal(result.report.sampleFrames, 352);
});
test("adapter rejects malformed, mismatched and incomplete worker evidence", async () => {
  for (const patch of [{ sampleFrames: 353 }, { streamIndex: 2 }, { complete: false }, { inputUri: "/foreign" }, { channels: [] }]) {
    const worker = { async callTool() { return { structuredContent: { ...evidence(), ...patch } }; } };
    await assert.rejects(new FfmpegMediaEngine(worker).execute(operation, { jobId: "job", locale: "en-US" }), /measurement evidence/);
  }
});
