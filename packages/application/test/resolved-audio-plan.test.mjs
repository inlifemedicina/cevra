import assert from "node:assert/strict";
import test from "node:test";

import { CEVRA_ENGINE_API_VERSION } from "@cevra/contracts";
import { createEmptyProject, ProjectHistory } from "@cevra/project-ir";
import {
  InMemoryMediaExecutionRepository,
  MediaApplicationError,
  MediaApplicationService,
  ResolvedAudioPlanApplicationService,
  ResolvedAudioPlanError,
  compileResolvedAudioPlan
} from "../dist/index.js";

const now = "2026-09-23T00:00:00.000Z";

class MemoryArtifacts {
  files = new Map();
  identities = new Map();
  removed = [];
  failRemoval = new Set();
  async kind(uri) { return this.files.has(uri) ? "file" : "missing"; }
  async exists(uri) { return this.files.has(uri); }
  async remove(uri) {
    if (this.failRemoval.has(uri)) throw new Error("simulated cleanup failure");
    this.files.delete(uri);
    this.removed.push(uri);
  }
  async matchesPublication(uri, evidence) {
    return this.files.has(uri) && evidence.scheme === "posix-dev-inode"
      && evidence.device === "1" && evidence.inode === (this.identities.get(uri) ?? "1");
  }
}

const publication = { version: 1, scheme: "posix-dev-inode", device: "1", inode: "1" };

class FakeEngine {
  calls = [];
  constructor(execute) { this.executeImpl = execute; }
  async identity() {
    return { id: "test.media", kind: "media", displayName: "Test Media", version: "0.3.1", apiVersion: CEVRA_ENGINE_API_VERSION };
  }
  async execute(operation, context) {
    this.calls.push({ operation, context });
    return this.executeImpl(operation, context);
  }
}

function projectFixture() {
  const project = createEmptyProject({ id: "project-jcut", name: "J-cut", locale: "en-US", now });
  project.sources = [
    { id: "a", kind: "video", uri: "/media/a.mov", displayName: "A", durationMs: 3_000 },
    { id: "b", kind: "video", uri: "/media/b.mov", displayName: "B", durationMs: 3_000 },
    { id: "music", kind: "audio", uri: "/media/music.wav", displayName: "Music", durationMs: 4_000 }
  ];
  project.timeline.tracks = [
    { id: "v1", kind: "video", name: "Picture", locked: false, hidden: false, muted: false },
    { id: "a1", kind: "audio", name: "Voice", locked: false, hidden: true, muted: false },
    { id: "a2", kind: "audio", name: "Muted music", locked: false, hidden: false, muted: true }
  ];
  project.timeline.clips = [
    clip("picture-a", "v1", "a", 0, 2_000, 0, 2_000, 1),
    clip("audio-a", "a1", "a", 0, 1_500, 0, 1_500, 1),
    clip("audio-b", "a1", "b", 1_500, 4_000, 0, 2_500, 0.5),
    clip("picture-b", "v1", "b", 2_000, 4_000, 500, 2_500, 1),
    clip("muted-music", "a2", "music", 0, 4_000, 0, 4_000, 1),
    clip("zero-volume", "a1", "music", 0, 4_000, 0, 4_000, 0)
  ];
  project.timeline.durationMs = 4_000;
  project.audio.masterGainDb = -3;
  return project;
}

function clip(id, trackId, sourceId, timelineStartMs, timelineEndMs, sourceStartMs, sourceEndMs, volume, speed = 1) {
  return { id, trackId, sourceId, timelineStartMs, timelineEndMs, sourceStartMs, sourceEndMs, speed, volume, opacity: 1 };
}

function historyFixture(project = projectFixture()) {
  let sequence = 0;
  return new ProjectHistory(project, { clock: () => now, idGenerator: () => `history-${++sequence}` });
}

function sequenceResult(operation) {
  const channels = operation.outputChannelLayout === "mono" ? 1 : 2;
  const samples = operation.outputDurationMs * 48;
  const bytes = samples * channels * 4;
  return {
    type: "file", outputUri: operation.outputUri, durationMs: operation.outputDurationMs,
    probe: { uri: operation.outputUri, durationMs: operation.outputDurationMs, hasVideo: false, hasAudio: true, audioCodec: "pcm_f32le", sampleRate: 48_000, channels },
    effectiveProfile: { container: "wav", audioCodec: "pcm", audioEncoder: "pcm_f32le" },
    publication,
    audioSequence: {
      version: 1, sampleRate: 48_000, sampleFormat: "pcm_f32le", channelLayout: operation.outputChannelLayout,
      distinctSourceCount: operation.sources.length, itemCount: operation.items.length,
      maximumSimultaneousItemCount: maximumSimultaneousItems(operation.items),
      outputSampleCount: samples, estimatedDataBytes: bytes, measuredDataBytes: bytes, graphBytes: 1_024
    }
  };
}

function maximumSimultaneousItems(items) {
  const events = items.flatMap((item) => [
    { at: item.timelineStartMs, delta: 1 },
    { at: item.timelineStartMs + item.sourceEndMs - item.sourceStartMs, delta: -1 }
  ]).sort((left, right) => left.at - right.at || left.delta - right.delta);
  let active = 0;
  let maximum = 0;
  for (const event of events) {
    active += event.delta;
    maximum = Math.max(maximum, active);
  }
  return maximum;
}

function muxResult(operation, durationMs = 4_000) {
  return {
    type: "file", outputUri: operation.outputUri, durationMs,
    probe: { uri: operation.outputUri, durationMs, hasVideo: true, hasAudio: true, videoCodec: "h264", audioCodec: "aac" },
    effectiveProfile: { container: "mp4", videoCodec: "h264", audioCodec: "aac", videoEncoder: "copy", audioEncoder: "aac" },
    publication,
    ...(operation.durationValidation ? { muxDuration: {
      version: 1,
      inputVideoDurationMs: operation.durationValidation.videoDurationMs,
      inputAudioDurationMs: operation.durationValidation.audioDurationMs,
      outputVideoDurationMs: operation.durationValidation.videoDurationMs,
      outputAudioDurationMs: operation.durationValidation.audioDurationMs
    } } : {})
  };
}

function services(executeImpl, project = projectFixture()) {
  const history = historyFixture(project);
  const artifacts = new MemoryArtifacts();
  const repository = new InMemoryMediaExecutionRepository();
  const engine = new FakeEngine(executeImpl ?? (async (operation) => {
    artifacts.files.set(operation.outputUri, Buffer.from(operation.type));
    return operation.type === "render-audio-sequence" ? sequenceResult(operation) : muxResult(operation);
  }));
  const media = new MediaApplicationService({ engine, history, executions: repository, artifacts, clock: () => now });
  const service = new ResolvedAudioPlanApplicationService({ history, media, idGenerator: () => "plan-generated" });
  return { history, artifacts, repository, engine, media, service };
}

function visual(plan) {
  return { version: 1, uri: "/render/picture.mp4", projectBinding: plan.projectBinding, durationMs: 4_000, producerExecutionId: "fixture-visual" };
}

test("pure compiler derives the corrected J-cut without mutating Project IR or duplicating video-track audio", () => {
  const history = historyFixture();
  const before = history.current;
  const plan = compileResolvedAudioPlan(before, {
    id: "plan-1", audioOutputUri: "/render/audio.wav", outputChannelLayout: "stereo", normalization: { type: "none" },
    projectJournalEntryCount: history.entries.length
  });

  assert.deepEqual(plan.audioClipIds, ["audio-a", "audio-b"]);
  assert.deepEqual(plan.operation.sources, [{ id: "a", uri: "/media/a.mov" }, { id: "b", uri: "/media/b.mov" }]);
  assert.deepEqual(plan.operation.items.map(({ sourceId, sourceStartMs, sourceEndMs, timelineStartMs }) => ({ sourceId, sourceStartMs, sourceEndMs, timelineStartMs })), [
    { sourceId: "a", sourceStartMs: 0, sourceEndMs: 1_500, timelineStartMs: 0 },
    { sourceId: "b", sourceStartMs: 0, sourceEndMs: 2_500, timelineStartMs: 1_500 }
  ]);
  assert.equal(plan.operation.items[0].gainDb, -3);
  assert.ok(Math.abs(plan.operation.items[1].gainDb - (-9.020599913279625)) < 1e-12);
  assert.equal(plan.outputDurationMs, 4_000);
  assert.deepEqual(history.current, before);

  plan.operation.items[0].sourceEndMs = 42;
  assert.deepEqual(history.current, before, "returned plan must be detached from canonical history");
});

test("compiler rejects unsupported timing, absent audio, out-of-range gain, and any explicit normalization target", () => {
  const baseRequest = { id: "plan", audioOutputUri: "/render/audio.wav", outputChannelLayout: "stereo", normalization: { type: "none" }, projectJournalEntryCount: 0 };
  for (const mutate of [
    (project) => { project.timeline.clips.find((item) => item.id === "audio-a").speed = 1.1; },
    (project) => { project.timeline.clips.find((item) => item.id === "audio-a").timelineEndMs = 1_499; },
    (project) => { project.audio.masterGainDb = 30; }
  ]) {
    const project = historyFixture().current;
    mutate(project);
    assert.throws(() => compileResolvedAudioPlan(project, baseRequest), ResolvedAudioPlanError);
  }
  const noAudio = historyFixture().current;
  for (const track of noAudio.timeline.tracks) if (track.kind === "audio") track.muted = true;
  assert.throws(() => compileResolvedAudioPlan(noAudio, baseRequest), /No unmuted non-zero clips/u);

  const targetProject = historyFixture().current;
  targetProject.audio.normalizeTargetLufs = -16;
  assert.throws(() => compileResolvedAudioPlan(targetProject, baseRequest), (error) => error.code === "AUDIO_PLAN_NORMALIZATION_UNSUPPORTED");
  assert.throws(() => compileResolvedAudioPlan(historyFixture().current, { ...baseRequest, normalization: { type: "target-lufs", targetLufs: -16 } }), (error) => error.code === "AUDIO_PLAN_NORMALIZATION_UNSUPPORTED");

  const missing = historyFixture().current;
  missing.timeline.clips.find((item) => item.id === "audio-a").sourceId = "missing";
  assert.throws(() => compileResolvedAudioPlan(missing, baseRequest), (error) => error.code === "AUDIO_PLAN_UNSUPPORTED_SOURCE");

  const outOfRange = historyFixture().current;
  outOfRange.timeline.clips.find((item) => item.id === "audio-b").sourceEndMs = 3_001;
  outOfRange.timeline.clips.find((item) => item.id === "audio-b").timelineEndMs = 4_501;
  assert.throws(() => compileResolvedAudioPlan(outOfRange, baseRequest), (error) => error.code === "AUDIO_PLAN_UNSUPPORTED_TIMING");
});

test("compiler preserves deliberate multi-source overlap and rejects an unbound visual", async () => {
  const project = projectFixture();
  project.timeline.clips.find((item) => item.id === "audio-b").timelineStartMs = 1_000;
  project.timeline.clips.find((item) => item.id === "audio-b").timelineEndMs = 3_500;
  const fixture = services(undefined, project);
  const plan = fixture.service.compile({ id: "overlap-plan", audioOutputUri: "/render/overlap.wav", outputChannelLayout: "stereo", normalization: { type: "none" } });
  assert.deepEqual(plan.operation.items.map((item) => item.timelineStartMs), [0, 1_000]);
  const badVisual = { ...visual(plan), projectBinding: { ...plan.projectBinding, projectJournalEntryCount: plan.projectBinding.projectJournalEntryCount + 1 } };
  await assert.rejects(
    fixture.service.execute({ id: "bad-visual", plan, visual: badVisual, outputUri: "/render/bad.mp4", exportId: "bad", presetId: "fixture" }),
    (error) => error instanceof MediaApplicationError && error.code === "MEDIA_INVALID_REQUEST"
  );
  assert.equal(fixture.engine.calls.length, 0);
});

test("Application executes sequence then exclusive mux, promotes one export, and cleans only the PCM", async () => {
  const { service, history, artifacts, engine } = services();
  const plan = service.compile({ id: "vertical-plan", audioOutputUri: "/render/audio.wav", outputChannelLayout: "stereo", normalization: { type: "none" } });
  const outcome = await service.execute({
    id: "vertical", plan, visual: visual(plan), outputUri: "/render/final.mp4", exportId: "export-1", presetId: "fixture"
  });

  assert.deepEqual(engine.calls.map(({ operation }) => operation.type), ["render-audio-sequence", "mux-audio"]);
  assert.equal(engine.calls[1].operation.replaceExisting, true);
  assert.equal(outcome.project.exports[0].outputUri, "/render/final.mp4");
  assert.equal(outcome.project.history.revision, plan.projectBinding.projectRevision + 1);
  assert.deepEqual(outcome.audioCleanup, { removed: ["/render/audio.wav"], failed: [] });
  assert.equal(artifacts.files.has("/render/audio.wav"), false);
  assert.equal(artifacts.files.has("/render/final.mp4"), true);
  assert.deepEqual(history.entries.at(-1).command.type, "export.add");
});

test("commit followed by undo during rendering cannot restore authority to the old plan", async () => {
  const fixture = services();
  let injectConflict = true;
  fixture.engine.executeImpl = async (operation) => {
    fixture.artifacts.files.set(operation.outputUri, Buffer.from(operation.type));
    if (operation.type === "render-audio-sequence" && injectConflict) {
      injectConflict = false;
      fixture.history.commit({ type: "project.rename", name: "Changed during render" });
      fixture.history.undo();
      return sequenceResult(operation);
    }
    if (operation.type === "render-audio-sequence") return sequenceResult(operation);
    return muxResult(operation);
  };
  const plan = fixture.service.compile({ id: "stale-plan", audioOutputUri: "/render/stale.wav", outputChannelLayout: "stereo", normalization: { type: "none" } });
  await assert.rejects(
    fixture.service.execute({ id: "stale", plan, visual: visual(plan), outputUri: "/render/stale.mp4", exportId: "stale-export", presetId: "fixture" }),
    (error) => error instanceof MediaApplicationError && error.code === "MEDIA_PROJECT_CONFLICT"
  );
  assert.deepEqual(fixture.engine.calls.map(({ operation }) => operation.type), ["render-audio-sequence"]);
  assert.equal(fixture.artifacts.files.has("/render/stale.wav"), false);
  assert.equal(fixture.history.current.exports.length, 0);

  const newPlan = fixture.service.compile({ id: "fresh-plan", audioOutputUri: "/render/fresh.wav", outputChannelLayout: "stereo", normalization: { type: "none" } });
  assert.equal(newPlan.projectBinding.projectJournalEntryCount, 1);
  const fresh = await fixture.service.execute({ id: "fresh", plan: newPlan, visual: visual(newPlan), outputUri: "/render/fresh.mp4", exportId: "fresh-export", presetId: "fixture" });
  assert.equal(fresh.project.exports[0].outputUri, "/render/fresh.mp4");
});

test("cancellation or worker death between sequence and mux never promotes an export", async () => {
  for (const failure of ["cancel", "worker-death"]) {
    const controller = new AbortController();
    const fixture = services(async (operation) => {
      fixture.artifacts.files.set(operation.outputUri, Buffer.from(operation.type));
      if (operation.type === "render-audio-sequence") return sequenceResult(operation);
      if (failure === "cancel") {
        controller.abort();
        const error = new Error("cancelled in mux");
        error.name = "AbortError";
        throw error;
      }
      throw new Error("WorkerProcessExitedError: worker died during mux");
    });
    const plan = fixture.service.compile({ id: `${failure}-plan`, audioOutputUri: `/render/${failure}.wav`, outputChannelLayout: "stereo", normalization: { type: "none" } });
    await assert.rejects(
      fixture.service.execute({ id: failure, plan, visual: visual(plan), outputUri: `/render/${failure}.mp4`, exportId: `${failure}-export`, presetId: "fixture" }, controller.signal),
      (error) => error instanceof MediaApplicationError && error.code === (failure === "cancel" ? "MEDIA_OPERATION_CANCELLED" : "MEDIA_OPERATION_FAILED")
    );
    assert.equal(fixture.history.current.exports.length, 0);
    assert.equal(fixture.artifacts.files.has(`/render/${failure}.wav`), false);
    assert.equal(fixture.artifacts.files.has(`/render/${failure}.mp4`), true, "ambiguous mux destination must be preserved");
  }
});

test("duration failure removes attempt-owned mux output and PCM without promoting an export", async () => {
  const fixture = services(async (operation) => {
    fixture.artifacts.files.set(operation.outputUri, Buffer.from(operation.type));
    return operation.type === "render-audio-sequence" ? sequenceResult(operation) : muxResult(operation, 3_900);
  });
  const plan = fixture.service.compile({ id: "duration-plan", audioOutputUri: "/render/duration.wav", outputChannelLayout: "stereo", normalization: { type: "none" } });
  await assert.rejects(fixture.service.execute({
    id: "duration", plan, visual: visual(plan), outputUri: "/render/duration.mp4", exportId: "duration-export", presetId: "fixture"
  }), (error) => error instanceof MediaApplicationError && error.code === "MEDIA_OPERATION_FAILED");
  assert.equal(fixture.artifacts.files.has("/render/duration.wav"), false);
  assert.equal(fixture.artifacts.files.has("/render/duration.mp4"), false);
  assert.equal(fixture.history.current.exports.length, 0);
});

test("cleanup failure after canonical ProjectHistory export commit remains visible without deleting the export", async () => {
  const fixture = services();
  const plan = fixture.service.compile({ id: "cleanup-plan", audioOutputUri: "/render/cleanup.wav", outputChannelLayout: "stereo", normalization: { type: "none" } });
  fixture.artifacts.failRemoval.add("/render/cleanup.wav");
  const outcome = await fixture.service.execute({
    id: "cleanup", plan, visual: visual(plan), outputUri: "/render/cleanup.mp4", exportId: "cleanup-export", presetId: "fixture"
  });
  assert.deepEqual(outcome.audioCleanup, { removed: [], failed: ["/render/cleanup.wav"] });
  assert.equal(outcome.project.exports[0].outputUri, "/render/cleanup.mp4");
  assert.equal(fixture.artifacts.files.has("/render/cleanup.mp4"), true);
});

test("compiler fails closed when canonical music ducking is present", () => {
  const project = projectFixture();
  project.audio.musicDuckDb = -9;
  const history = historyFixture(project);
  assert.throws(() => compileResolvedAudioPlan(history.current, {
    id: "duck", audioOutputUri: "/render/duck.wav", outputChannelLayout: "stereo",
    normalization: { type: "none" }, projectJournalEntryCount: 0
  }), (error) => error instanceof ResolvedAudioPlanError && error.code === "AUDIO_PLAN_DUCKING_UNSUPPORTED");
});

test("resolved plan comparison ignores object key order but rejects changed values and extra fields", async () => {
  const fixture = services();
  const plan = fixture.service.compile({ id: "structural", audioOutputUri: "/render/structural.wav", outputChannelLayout: "stereo", normalization: { type: "none" } });
  const reorder = (value) => Array.isArray(value) ? value.map(reorder)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)]))
      : value;
  await fixture.service.execute({ id: "reordered", plan: reorder(plan), visual: visual(plan), outputUri: "/render/reordered.mp4", exportId: "reordered", presetId: "fixture" });

  const changedFixture = services();
  const changed = changedFixture.service.compile({ id: "changed-plan", audioOutputUri: "/render/changed.wav", outputChannelLayout: "stereo", normalization: { type: "none" } });
  changed.operation.items[0].timelineStartMs = 1;
  await assert.rejects(changedFixture.service.execute({ id: "changed", plan: changed, visual: visual(changed), outputUri: "/render/changed.mp4", exportId: "changed", presetId: "fixture" }),
    (error) => error instanceof MediaApplicationError && error.code === "MEDIA_INVALID_REQUEST");
  const extraFixture = services();
  const extra = extraFixture.service.compile({ id: "extra-plan", audioOutputUri: "/render/extra.wav", outputChannelLayout: "stereo", normalization: { type: "none" } });
  extra.future = true;
  await assert.rejects(extraFixture.service.execute({ id: "extra", plan: extra, visual: visual(extra), outputUri: "/render/extra.mp4", exportId: "extra", presetId: "fixture" }),
    (error) => error instanceof MediaApplicationError && error.code === "MEDIA_INVALID_REQUEST");
});

test("resolved execution snapshots plan, visual, output, export, preset, locale and actor before its first await", async () => {
  let release;
  let entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const reached = new Promise((resolve) => { entered = resolve; });
  const fixture = services(async (operation) => {
    if (operation.type === "render-audio-sequence") {
      entered();
      await gate;
    }
    fixture.artifacts.files.set(operation.outputUri, Buffer.from(operation.type));
    return operation.type === "render-audio-sequence" ? sequenceResult(operation) : muxResult(operation);
  });
  const plan = fixture.service.compile({ id: "snapshot-plan", audioOutputUri: "/render/snapshot.wav", outputChannelLayout: "stereo", normalization: { type: "none" } });
  const request = {
    id: "snapshot-execution", plan, visual: visual(plan), outputUri: "/render/snapshot.mp4",
    exportId: "snapshot-export", presetId: "fixture", locale: "en-US", actor: { type: "agent", id: "original" }
  };
  const execution = fixture.service.execute(request);
  await reached;
  request.plan.operation.outputUri = "/render/attacker.wav";
  request.visual.uri = "/render/attacker-video.mp4";
  request.visual.projectBinding.projectRevision = 99;
  request.outputUri = "/render/attacker.mp4";
  request.exportId = "attacker-export";
  request.presetId = "attacker-preset";
  request.locale = "pt-BR";
  request.actor.id = "attacker";
  release();
  const outcome = await execution;
  assert.deepEqual(fixture.engine.calls.map(({ operation }) => operation.outputUri), ["/render/snapshot.wav", "/render/snapshot.mp4"]);
  assert.equal(outcome.project.exports[0].id, "snapshot-export");
  assert.equal(outcome.project.exports[0].presetId, "fixture");
  assert.deepEqual(fixture.history.entries.at(-1).actor, { type: "agent", id: "original" });
});

test("resolved execution validates and uses one getter-backed request snapshot", async () => {
  const fixture = services();
  const plan = fixture.service.compile({ id: "getter-plan", audioOutputUri: "/render/getter.wav", outputChannelLayout: "stereo", normalization: { type: "none" } });
  let outputReads = 0;
  const request = {
    id: "getter-execution", plan, visual: visual(plan), exportId: "getter-export",
    presetId: "fixture",
    get outputUri() {
      outputReads += 1;
      return outputReads === 1 ? "/render/getter.mp4" : "/render/changed-by-getter.mp4";
    }
  };
  const outcome = await fixture.service.execute(request);
  assert.equal(outputReads, 1);
  assert.deepEqual(fixture.engine.calls.map(({ operation }) => operation.outputUri), ["/render/getter.wav", "/render/getter.mp4"]);
  assert.equal(outcome.project.exports[0].outputUri, "/render/getter.mp4");
});

test("closed resolved-plan schemas reject every requested boundary extra and malformed locale/normalization", async () => {
  const fixture = services();
  const plan = fixture.service.compile({ id: "closed", audioOutputUri: "/render/closed.wav", outputChannelLayout: "stereo", normalization: { type: "none" } });
  const base = { id: "closed-exec", plan, visual: visual(plan), outputUri: "/render/closed.mp4", exportId: "closed", presetId: "fixture" };
  const requests = [
    { ...base, future: 1 },
    { ...base, locale: "fr-FR" },
    { ...base, actor: { type: "user", future: 1 } },
    { ...base, visual: { ...base.visual, future: 1 } },
    { ...base, visual: { ...base.visual, projectBinding: { ...base.visual.projectBinding, future: 1 } } },
    { ...base, plan: { ...plan, normalization: { type: "none", targetLufs: -14 } } }
  ];
  for (const [index, request] of requests.entries()) {
    await assert.rejects(fixture.service.execute({ ...request, id: `closed-${index}` }),
      (error) => error instanceof MediaApplicationError && error.code === "MEDIA_INVALID_REQUEST");
  }
  assert.equal(fixture.engine.calls.length, 0);
  assert.throws(() => compileResolvedAudioPlan(fixture.history.current, {
    id: "extra-compile", audioOutputUri: "/render/x.wav", outputChannelLayout: "stereo",
    normalization: { type: "none" }, projectJournalEntryCount: 0, future: 1
  }), ResolvedAudioPlanError);
  assert.throws(() => compileResolvedAudioPlan(fixture.history.current, {
    id: "extra-normalization", audioOutputUri: "/render/x.wav", outputChannelLayout: "stereo",
    normalization: { type: "none", targetLufs: -14 }, projectJournalEntryCount: 0
  }), ResolvedAudioPlanError);
});

test("mux duration evidence rejects each truncated selected stream and accepts bounded AAC duration", async () => {
  for (const field of ["inputVideoDurationMs", "inputAudioDurationMs", "outputVideoDurationMs", "outputAudioDurationMs"]) {
    const fixture = services(async (operation) => {
      fixture.artifacts.files.set(operation.outputUri, Buffer.from(operation.type));
      if (operation.type === "render-audio-sequence") return sequenceResult(operation);
      const result = muxResult(operation);
      result.muxDuration[field] = 3_900;
      return result;
    });
    const plan = fixture.service.compile({ id: `duration-${field}`, audioOutputUri: `/render/${field}.wav`, outputChannelLayout: "stereo", normalization: { type: "none" } });
    await assert.rejects(fixture.service.execute({ id: `duration-${field}`, plan, visual: visual(plan), outputUri: `/render/${field}.mp4`, exportId: field, presetId: "fixture" }),
      (error) => error instanceof MediaApplicationError && error.code === "MEDIA_OPERATION_FAILED");
    assert.equal(fixture.history.current.exports.length, 0);
  }
  const accepted = services(async (operation) => {
    accepted.artifacts.files.set(operation.outputUri, Buffer.from(operation.type));
    if (operation.type === "render-audio-sequence") return sequenceResult(operation);
    const result = muxResult(operation);
    result.muxDuration.outputAudioDurationMs = 4_023;
    return result;
  });
  const plan = accepted.service.compile({ id: "aac-bound", audioOutputUri: "/render/aac.wav", outputChannelLayout: "stereo", normalization: { type: "none" } });
  const outcome = await accepted.service.execute({ id: "aac-bound", plan, visual: visual(plan), outputUri: "/render/aac.mp4", exportId: "aac", presetId: "fixture" });
  assert.equal(outcome.project.exports.length, 1);
});
