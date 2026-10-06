import test from "node:test";
import assert from "node:assert/strict";
import { validateMediaOperation, validateManualSequenceExecutionEvidence } from "../dist/index.js";

const item = () => ({ inputUri: "/original.mp4", sourceStartFrame: 1, sourceEndFrame: 2,
  sourceContent: { sha256: "a".repeat(64), sizeBytes: 100 }, audioSelection: "single-source-stream" });
const operation = () => ({ type: "render-manual-video-sequence", version: 1, items: [item(), item()], outputUri: "/final.mp4", ownedWorkspaceUri: "/private-job" });
const evidence = () => ({ version: 1, outputSha256: "b".repeat(64), profile: "manual-cfr30-export-v1", samplingPolicy: "source-pts-fps30-near-v1",
  frameRate: { numerator: 30, denominator: 1 }, container: "mp4", videoCodec: "h264", audioCodec: "aac", dynamicRange: "sdr", width: 1920, height: 1080,
  targetVideoBitsPerSecond: 20_000_000, totalFrames: 2, outputFrameCount: 2, totalPcmSamples: 3200, outputAudioSampleCount: 3200,
  audioSampleRate: 48000, audioChannelLayout: "stereo", durationMs: 2000 / 30, muxVideoDurationMs: 2000 / 30, muxAudioDurationMs: 2000 / 30,
  itemCount: 2, uniqueSegmentCount: 1, sources: [{ inputUri: "/original.mp4", sha256: "a".repeat(64), sizeBytes: 100, videoStreamIndex: 0, audioStreamIndex: 2,
    audioStreamCount: 1, sampleRate: 48000, channelLayout: "stereo", sourceVideoFrameCount: 30, sourceVideoEndMs: 1000, sourceAudioFirstSample: 0, sourceAudioSampleCount: 48000 }] });

test("closed frame-clock operation permits repeated intervals and rejects execution/profile/audio ambiguity", () => {
  assert.equal(validateMediaOperation(operation()).items.length, 2);
  const reordered = operation(); reordered.items[1].sourceContent = { sizeBytes: 100, sha256: "a".repeat(64) };
  assert.equal(validateMediaOperation(reordered).items.length, 2);
  assert.equal(validateMediaOperation({ type: "render-manual-video-preview", version: 1, item: item(), outputUri: "/preview.mp4", ownedWorkspaceUri: "/private-job" }).item.sourceStartFrame, 1);
  for (const extra of [{ fps: 60 }, { targetBitrate: 1 }, { commands: [] }, { ownedWorkspaceUri: "relative" }, { outputUri: "/final.mov" }, { version: 2 }]) assert.throws(() => validateMediaOperation({ ...operation(), ...extra }));
  for (const change of [{ sourceStartFrame: 1.1 }, { sourceEndFrame: 1 }, { audioSelection: "first" }, { streamIndex: 0 }, { sourceContent: { sha256: "bad", sizeBytes: 100 } }]) {
    const value = operation(); value.items[0] = { ...item(), ...change }; assert.throws(() => validateMediaOperation(value));
  }
  const inconsistent = operation(); inconsistent.items[1].sourceContent.sha256 = "c".repeat(64); assert.throws(() => validateMediaOperation(inconsistent));
});

test("strict measured sequence evidence binds exact frames, effective samples, source indices and profile", () => {
  assert.equal(validateManualSequenceExecutionEvidence(evidence()).outputAudioSampleCount, 3200);
  for (const change of [{ outputFrameCount: 1 }, { outputAudioSampleCount: 4096 }, { totalPcmSamples: 3199 }, { fps: 30 }, { outputSha256: "bad" },
    { muxAudioDurationMs: 90 }, { frameRate: { numerator: 30000, denominator: 1001 } }, { width: 1280 }, { sources: [{ ...evidence().sources[0], audioStreamCount: 2 }] }]) {
    assert.throws(() => validateManualSequenceExecutionEvidence({ ...evidence(), ...change }));
  }
  const value = evidence(); value.sources.push(value.sources[0]); assert.throws(() => validateManualSequenceExecutionEvidence(value));
});

test("extract-frame exposes only the closed optional 720 bound", () => {
  const base = { type: "extract-frame", inputUri: "/preview.mp4", outputUri: "/first.png", atMs: 0 };
  assert.equal(validateMediaOperation({ ...base, maxDimension: 720 }).maxDimension, 720);
  assert.equal(validateMediaOperation(base).maxDimension, undefined);
  for (const maxDimension of [0, 719, 721, 1080, true, "720"]) assert.throws(() => validateMediaOperation({ ...base, maxDimension }));
});

test("logical budget evidence preserves legacy results and rejects stronger unproved guarantees", () => {
  assert.equal(validateManualSequenceExecutionEvidence(evidence()).logicalBudget, undefined);
  const budget = { version: 1, enforcement: "reserved-logical-space", budgetBytes: 2 * 1024 ** 3,
    peakReservedBytes: 2 * 1024 ** 3, producerCount: 8, accountingOverlapReserved: true, allocatedBlockQuota: false };
  assert.equal(validateManualSequenceExecutionEvidence({ ...evidence(), logicalBudget: budget }).logicalBudget.allocatedBlockQuota, false);
  for (const change of [{ peakReservedBytes: budget.budgetBytes + 1 }, { budgetBytes: 0 }, { producerCount: 0 },
    { enforcement: "physical-filesystem-quota" }, { allocatedBlockQuota: true }, { accountingOverlapReserved: false },
    { nativeCommand: "untrusted" }, { producerCount: 1.5 }]) {
    assert.throws(() => validateManualSequenceExecutionEvidence({ ...evidence(), logicalBudget: { ...budget, ...change } }));
  }
  assert.throws(() => validateManualSequenceExecutionEvidence({ ...evidence(), logicalBudget: undefined }));
});
