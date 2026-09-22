import test from "node:test";
import assert from "node:assert/strict";
import { AUDIO_MEASUREMENT_LINEAR_TOLERANCE, AUDIO_MEASUREMENT_METHOD, validateMediaOperation, validateAudioMeasurementReport } from "../dist/index.js";

const op = { type: "measure-audio", version: 1, inputUri: "/media/source.wav", streamIndex: 2, startMs: 0, endMs: 4000 };
function report() { return { version: 1, method: AUDIO_MEASUREMENT_METHOD, executionId: "job", inputUri: op.inputUri, streamIndex: 2, startMs: 0, endMs: 4000,
  sampleRate: 48000, channelLayout: "mono", sampleFrames: 192000, coverageStartSample: 0, coverageEndSample: 192000, complete: true,
  channels: [{ channelIndex: 0, rmsLinear: 0.353553, samplePeakLinear: 0.5, reachesFullScale: false, exceedsFullScale: false }],
  truePeakLinear: 0.5, integratedLufs: { status: "available", value: -9.03 }, shortTermMaxLufs: { status: "available", value: -9.024 }, shortTermValidObservations: 11 }; }

test("measurement request is closed, local, explicit and bounded without a project duration policy", () => {
  assert.deepEqual(validateMediaOperation(op), op);
  for (const inputUri of ["C:\\media\\test.wav", "/media/a|b.wav"]) assert.equal(validateMediaOperation({ ...op, inputUri }).inputUri, inputUri);
  for (const patch of [{ version: 2 }, { streamIndex: -1 }, { streamIndex: 1.2 }, { streamIndex: 2 ** 31 }, { endMs: 0 }, { startMs: 4000 }, { endMs: Infinity }, { startMs: 0.5 }, { inputUri: "https://media/a" }, { inputUri: "//server/share" }, { inputUri: "/a\nb" }, { outputUri: "/out.wav" }, { filtergraph: "evil" }]) {
    assert.throws(() => validateMediaOperation({ ...op, ...patch }), JSON.stringify(patch));
  }
});
test("measurement result binds execution, stream, interval and measured samples with detached output", () => {
  const value = report(); const valid = validateAudioMeasurementReport(value, op, "job");
  valid.channels[0].rmsLinear = 99; assert.notEqual(value.channels[0].rmsLinear, 99);
  for (const patch of [{ inputUri: "/other" }, { executionId: "other" }, { streamIndex: 0 }, { startMs: 1 }, { complete: false }, { sampleFrames: 191999 }, { coverageEndSample: 1 }, { method: "other" }, { unexpected: 1 }, { truePeakLinear: NaN }, { shortTermValidObservations: 12 }, { integratedLufs: { status: "available", value: -70 } }]) {
    assert.throws(() => validateAudioMeasurementReport({ ...report(), ...patch }, op, "job"), JSON.stringify(patch));
  }
});
test("nonfinite metrics, impossible channel shapes and hidden policy fields fail closed", () => {
  for (const patch of [{ rmsLinear: NaN }, { samplePeakLinear: Infinity }, { rmsLinear: -1 }, { rmsLinear: 1 }, { channelIndex: 1 }, { exceedsFullScale: true }, { clippingCount: 123 }, { reachesFullScale: 1 }]) {
    const value = report(); Object.assign(value.channels[0], patch);
    assert.throws(() => validateAudioMeasurementReport(value, op, "job"));
  }
});
test("digital sample silence retains zero core evidence while contextual true peak may be positive", () => {
  const value = report(); Object.assign(value.channels[0], { rmsLinear: 0, samplePeakLinear: 0 }); value.truePeakLinear = 0;
  value.integratedLufs = value.shortTermMaxLufs = { status: "unavailable", reason: "digital-silence" }; value.shortTermValidObservations = 0;
  validateAudioMeasurementReport(value, op, "job");
  value.truePeakLinear = 0.125;
  validateAudioMeasurementReport(value, op, "job");
  value.integratedLufs = { status: "available", value: -69 }; assert.throws(() => validateAudioMeasurementReport(value, op, "job"));
});
test("peak and exact full-scale predicates remain acoustically consistent within declared rounding tolerance", () => {
  for (const patch of [
    { samplePeakLinear: 0.8, truePeakLinear: 0.7 },
    { samplePeakLinear: 0.9, reachesFullScale: true },
    { samplePeakLinear: 1.1, reachesFullScale: false },
    { samplePeakLinear: 1.1, reachesFullScale: true, exceedsFullScale: false },
    { samplePeakLinear: 1, reachesFullScale: false, exceedsFullScale: true }
  ]) {
    const value = report();
    const { truePeakLinear, ...channelPatch } = patch;
    Object.assign(value.channels[0], channelPatch);
    if (truePeakLinear !== undefined) value.truePeakLinear = truePeakLinear;
    else value.truePeakLinear = Math.max(value.truePeakLinear, value.channels[0].samplePeakLinear);
    assert.throws(() => validateAudioMeasurementReport(value, op, "job"), JSON.stringify(patch));
  }
  for (const delta of [-AUDIO_MEASUREMENT_LINEAR_TOLERANCE, AUDIO_MEASUREMENT_LINEAR_TOLERANCE]) {
    const value = report(); Object.assign(value.channels[0], { samplePeakLinear: 1 + delta, reachesFullScale: delta <= 0, exceedsFullScale: false });
    value.truePeakLinear = 1 + delta;
    validateAudioMeasurementReport(value, op, "job");
  }
});
