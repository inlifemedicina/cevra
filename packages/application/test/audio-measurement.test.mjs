import test from "node:test";
import assert from "node:assert/strict";
import { AUDIO_MEASUREMENT_METHOD } from "@cevra/contracts";
import { createEmptyProject, ProjectHistory } from "@cevra/project-ir";
import { InMemoryMediaExecutionRepository, MediaApplicationService } from "../dist/index.js";

const operation = { type: "measure-audio", version: 1, inputUri: "/source.wav", streamIndex: 0, startMs: 0, endMs: 100 };
function result(context) { return { type: "measure-audio", report: { version: 1, method: AUDIO_MEASUREMENT_METHOD, executionId: context.jobId,
  inputUri: operation.inputUri, streamIndex: 0, startMs: 0, endMs: 100, sampleRate: 48000, channelLayout: "mono", sampleFrames: 4800,
  coverageStartSample: 0, coverageEndSample: 4800, complete: true, channels: [{ channelIndex: 0, rmsLinear: 0, samplePeakLinear: 0, reachesFullScale: false, exceedsFullScale: false }],
  truePeakLinear: 0, integratedLufs: { status: "unavailable", reason: "digital-silence" }, shortTermMaxLufs: { status: "unavailable", reason: "digital-silence" }, shortTermValidObservations: 0 } }; }
function fixture(execute) {
  const history = new ProjectHistory(createEmptyProject({ id: "p", name: "p", locale: "en-US", now: "2026-09-22T00:00:00Z" }));
  const executions = new InMemoryMediaExecutionRepository();
  const service = new MediaApplicationService({ history, executions, engine: { identity: async () => ({ id: "media", kind: "media", version: "0.3.0", apiVersion: 1, displayName: "test" }), execute },
    artifacts: { kind() { assert.fail("measurement has no output"); }, exists() { assert.fail("measurement has no output"); }, remove() { assert.fail("measurement must not clean any file"); } } });
  return { history, service, executions };
}
test("Application accepts measurement only with mutation none; project/history remain byte-equivalent", async () => {
  const { service, history } = fixture(async (_, context) => result(context));
  const before = JSON.stringify(history.current);
  const outcome = await service.execute({ id: "read", operation, mutation: { type: "none" } });
  assert.equal(outcome.record.status, "succeeded"); assert.deepEqual(outcome.record.attempts[0].outputUris, []);
  assert.equal(JSON.stringify(history.current), before); assert.equal(history.entries.length, 0);
  await assert.rejects(service.execute({ id: "mutate", operation, mutation: { type: "source.add", source: { id: "x", kind: "audio", displayName: "x" } } }));
});
test("Application independently rejects bad report, engine failure and late cancellation without cleaning inputs", async () => {
  for (const kind of ["malformed", "failure", "cancel"]) {
    const controller = new AbortController();
    const { service, history, executions } = fixture(async (_, context) => {
      if (kind === "failure") throw new Error("decoder failed");
      const value = result(context);
      if (kind === "malformed") value.report.sampleFrames--;
      if (kind === "cancel") controller.abort();
      return value;
    });
    const before = JSON.stringify(history.current);
    await assert.rejects(service.execute({ id: kind, operation, mutation: { type: "none" } }, controller.signal));
    assert.equal(JSON.stringify(history.current), before);
    assert.notEqual((await executions.get(kind)).status, "succeeded");
  }
});
