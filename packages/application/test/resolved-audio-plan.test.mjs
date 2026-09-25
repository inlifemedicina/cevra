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
  SourceTechnicalDescriptorResolver,
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

function services(executeImpl, project = projectFixture(), sourceVerifier) {
  const history = historyFixture(project);
  const artifacts = new MemoryArtifacts();
  const repository = new InMemoryMediaExecutionRepository();
  const engine = new FakeEngine(executeImpl ?? (async (operation) => {
    artifacts.files.set(operation.outputUri, Buffer.from(operation.type));
    return operation.type === "render-audio-sequence" ? sequenceResult(operation) : muxResult(operation);
  }));
  const media = new MediaApplicationService({ engine, history, executions: repository, artifacts, clock: () => now });
  const service = new ResolvedAudioPlanApplicationService({
    history,
    media,
    intents: repository,
    idGenerator: () => "plan-generated",
    clock: () => now,
    ...(sourceVerifier ? { sourceVerifier } : {})
  });
  return { history, artifacts, repository, engine, media, service };
}

function sourceDescriptor(digest) {
  return {
    version: 1,
    basis: "ingest",
    content: { sha256: digest.repeat(64), sizeBytes: 1 },
    method: {
      profile: "cevra.source-technical.v1",
      engineId: "cevra.media.ffmpeg",
      engineVersion: "0.3.0",
      engineApiVersion: 1
    },
    video: { codec: "h264" },
    audio: { codec: "aac" }
  };
}

function verificationPort(history, state = { changed: false }) {
  return {
    captureCalls: [],
    identifyCalls: [],
    checkCalls: [],
    async captureSource(uri) {
      this.captureCalls.push(uri);
      return { version: 1, uri, canonicalPath: uri, device: "1", inode: uri, sizeBytes: 1, mtimeNs: "1", ctimeNs: "1" };
    },
    async identifySource(uri, stamp) {
      this.identifyCalls.push(uri);
      const source = history.current.sources.find((item) => item.uri === uri);
      return { version: 1, content: structuredClone(source.technicalDescriptor.content), stamp, bytesRead: 1 };
    },
    async checkSource(uri) {
      this.checkCalls.push({ uri, exportCount: history.current.exports.length });
      return state.changed ? "changed" : "match";
    }
  };
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

test("descriptor-bearing resolved audio verifies each unique source once and rechecks before export promotion", async () => {
  const project = projectFixture();
  project.sources.find((item) => item.id === "a").technicalDescriptor = sourceDescriptor("a");
  project.sources.find((item) => item.id === "b").technicalDescriptor = sourceDescriptor("b");
  const history = historyFixture(project);
  const port = verificationPort(history);
  const artifacts = new MemoryArtifacts();
  const repository = new InMemoryMediaExecutionRepository();
  const engine = new FakeEngine(async (operation) => {
    artifacts.files.set(operation.outputUri, Buffer.from(operation.type));
    return operation.type === "render-audio-sequence" ? sequenceResult(operation) : muxResult(operation);
  });
  const media = new MediaApplicationService({ engine, history, executions: repository, artifacts, clock: () => now });
  const service = new ResolvedAudioPlanApplicationService({
    history,
    media,
    intents: repository,
    sourceVerifier: new SourceTechnicalDescriptorResolver(port),
    clock: () => now
  });
  const plan = service.compile({ id: "verified", audioOutputUri: "/render/verified.wav", outputChannelLayout: "stereo", normalization: { type: "none" } });
  await service.execute({ id: "verified", plan, visual: visual(plan), outputUri: "/render/verified.mp4", exportId: "verified", presetId: "fixture" });
  assert.deepEqual(port.captureCalls.sort(), ["/media/a.mov", "/media/b.mov"]);
  assert.deepEqual(port.identifyCalls.sort(), ["/media/a.mov", "/media/b.mov"]);
  assert.equal(port.checkCalls.length, 4, "two sources are rechecked after sequence and immediately before export.add");
  assert.equal(port.checkCalls.every((call) => call.exportCount === 0), true, "decisive checks must occur before export.add");
  assert.equal(history.current.exports.length, 1);
});

test("source change during resolved-audio consumption prevents export promotion and cleans owned outputs", async () => {
  const project = projectFixture();
  project.sources.find((item) => item.id === "a").technicalDescriptor = sourceDescriptor("a");
  const history = historyFixture(project);
  const state = { changed: false };
  const port = verificationPort(history, state);
  const artifacts = new MemoryArtifacts();
  const repository = new InMemoryMediaExecutionRepository();
  const engine = new FakeEngine(async (operation) => {
    artifacts.files.set(operation.outputUri, Buffer.from(operation.type));
    if (operation.type === "mux-audio") state.changed = true;
    return operation.type === "render-audio-sequence" ? sequenceResult(operation) : muxResult(operation);
  });
  const media = new MediaApplicationService({ engine, history, executions: repository, artifacts, clock: () => now });
  const service = new ResolvedAudioPlanApplicationService({
    history,
    media,
    intents: repository,
    sourceVerifier: new SourceTechnicalDescriptorResolver(port),
    clock: () => now
  });
  const plan = service.compile({ id: "changed", audioOutputUri: "/render/changed.wav", outputChannelLayout: "stereo", normalization: { type: "none" } });
  await assert.rejects(
    service.execute({ id: "changed", plan, visual: visual(plan), outputUri: "/render/changed.mp4", exportId: "changed", presetId: "fixture" }),
    (error) => error instanceof MediaApplicationError && error.code === "SOURCE_CONTENT_CHANGED"
  );
  assert.equal(history.current.exports.length, 0);
  assert.equal(artifacts.files.has("/render/changed.wav"), false);
  assert.equal(artifacts.files.has("/render/changed.mp4"), false);
  assert.equal(port.checkCalls.at(-1).exportCount, 0);
});

test("descriptor-bearing resolved audio fails closed when source verification capability is absent", async () => {
  const project = projectFixture();
  project.sources.find((item) => item.id === "a").technicalDescriptor = sourceDescriptor("a");
  const fixture = services(undefined, project);
  const plan = fixture.service.compile({ id: "no-verifier", audioOutputUri: "/render/no-verifier.wav", outputChannelLayout: "stereo", normalization: { type: "none" } });
  await assert.rejects(
    fixture.service.execute({ id: "no-verifier", plan, visual: visual(plan), outputUri: "/render/no-verifier.mp4", exportId: "no-verifier", presetId: "fixture" }),
    (error) => error instanceof ResolvedAudioPlanError && error.code === "AUDIO_PLAN_SOURCE_VERIFICATION_UNAVAILABLE"
  );
  assert.equal(fixture.engine.calls.length, 0);
  assert.equal(fixture.history.current.exports.length, 0);
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

test("composite intent precedes children, remains application-committed until checkpoint, then becomes durable", async () => {
  const fixture = services();
  const plan = fixture.service.compile({ id: "intent-plan", audioOutputUri: "/render/intent.wav", outputChannelLayout: "stereo", normalization: { type: "none" } });
  const outcome = await fixture.service.execute({ id: "intent", plan, visual: visual(plan), outputUri: "/render/intent.mp4", exportId: "intent-export", presetId: "fixture" });
  const beforeCheckpoint = await fixture.repository.getIntent("intent");
  assert.equal(beforeCheckpoint.status, "application-committed");
  assert.deepEqual(beforeCheckpoint.childExecutionIds, { audio: "intent:audio", mux: "intent:mux" });
  assert.equal(outcome.project.exports[0].id, "intent-export");
  await fixture.service.markCheckpointSucceeded("intent");
  assert.equal((await fixture.repository.getIntent("intent")).status, "durable-succeeded");
});

test("composite startup reconciliation never executes children and is idempotent", async () => {
  const history = historyFixture();
  const repository = new InMemoryMediaExecutionRepository({ version: 1, records: [], intents: [{
    version: 1, id: "pending-intent", kind: "resolved-audio-plan", projectId: history.current.project.id,
    projectBinding: { projectId: history.current.project.id, projectRevision: history.current.history.revision,
      projectSnapshotId: history.current.history.headSnapshotId, projectJournalEntryCount: history.entries.length },
    status: "audio-running", childExecutionIds: { audio: "pending-intent:audio", mux: "pending-intent:mux" },
    exportIntent: { exportId: "pending-export", presetId: "fixture", expectedOutputUri: "/render/pending.mp4" },
    createdAt: now, updatedAt: now
  }] });
  let executeCalls = 0;
  const media = {
    async execute() { executeCalls += 1; assert.fail("startup reconciliation must not execute media"); },
    async cleanupOwnedOutputs() { return { removed: [], failed: [] }; },
    async getExecutionRecord() { return undefined; }
  };
  const service = new ResolvedAudioPlanApplicationService({ history, media, intents: repository, clock: () => now });
  assert.deepEqual((await service.reconcilePendingWithoutReplay()).map(({ status }) => status), ["interrupted"]);
  assert.deepEqual(await service.reconcilePendingWithoutReplay(), []);
  assert.equal(executeCalls, 0);
  assert.equal((await repository.getIntent("pending-intent")).status, "interrupted");
  assert.deepEqual((await repository.getIntent("pending-intent")).cleanupUncertainUris, []);
});

test("audio-running recovery cleans a proven audio child while a missing mux child is empty cleanup", async () => {
  const history = historyFixture();
  const plan = compileResolvedAudioPlan(history.current, {
    id: "missing-mux-plan", audioOutputUri: "/render/missing-mux.wav", outputChannelLayout: "stereo",
    normalization: { type: "none" }, projectJournalEntryCount: history.entries.length
  });
  const audioResult = sequenceResult(plan.operation);
  const repository = new InMemoryMediaExecutionRepository({ version: 1, records: [{
    id: "missing-mux:audio", projectId: history.current.project.id, locale: "pt-BR",
    operation: plan.operation, mutation: { type: "none" }, actor: { type: "system" },
    status: "succeeded", createdAt: now, attempts: [{
      number: 1, jobId: "missing-mux:audio:1", status: "succeeded", requestedAt: now, completedAt: now,
      outputUris: [plan.operation.outputUri], preexistingOutputUris: [], ownedOutputUris: [plan.operation.outputUri],
      ownedOutputPublications: [{ uri: plan.operation.outputUri, evidence: publication }],
      removedPartialOutputUris: [], cleanupFailedOutputUris: [], projectRevisionBefore: history.current.history.revision,
      result: audioResult
    }]
  }], intents: [{
    version: 1, id: "missing-mux", kind: "resolved-audio-plan", projectId: history.current.project.id,
    projectBinding: plan.projectBinding, status: "audio-running",
    childExecutionIds: { audio: "missing-mux:audio", mux: "missing-mux:mux" },
    exportIntent: { exportId: "missing-mux-export", presetId: "fixture", expectedOutputUri: "/render/missing-mux.mp4" },
    createdAt: now, updatedAt: now
  }] });
  const artifacts = new MemoryArtifacts();
  artifacts.files.set(plan.operation.outputUri, Buffer.from("pcm"));
  const media = new MediaApplicationService({
    history, executions: repository, artifacts, clock: () => now,
    engine: new FakeEngine(async () => assert.fail("restart must not execute media"))
  });
  const service = new ResolvedAudioPlanApplicationService({ history, media, intents: repository, clock: () => now });
  assert.deepEqual((await service.reconcilePendingWithoutReplay()).map(({ status }) => status), ["interrupted"]);
  assert.equal(artifacts.files.has(plan.operation.outputUri), false);
  assert.deepEqual(artifacts.removed, [plan.operation.outputUri]);
  assert.deepEqual((await repository.getIntent("missing-mux")).cleanupUncertainUris, []);
});

test("pre-existing canonical export cannot satisfy a pending intent without its applied mux child", async () => {
  for (const status of ["requested", "audio-running", "mux-running", "application-committed"]) {
    const history = historyFixture();
    history.commit({ type: "export.add", export: {
      id: "collision-export", presetId: "fixture", status: "completed", outputUri: "/render/collision.mp4",
      createdAt: now, completedAt: now
    } });
    const repository = new InMemoryMediaExecutionRepository({ version: 1, records: [], intents: [{
      version: 1, id: `collision-${status}`, kind: "resolved-audio-plan", projectId: history.current.project.id,
      projectBinding: { projectId: history.current.project.id, projectRevision: history.current.history.revision,
        projectSnapshotId: history.current.history.headSnapshotId, projectJournalEntryCount: history.entries.length },
      status, childExecutionIds: { audio: `collision-${status}:audio`, mux: `collision-${status}:mux` },
      exportIntent: { exportId: "collision-export", presetId: "fixture", expectedOutputUri: "/render/collision.mp4" },
      createdAt: now, updatedAt: now
    }] });
    const media = new MediaApplicationService({
      history, executions: repository, artifacts: new MemoryArtifacts(), clock: () => now,
      engine: new FakeEngine(async () => assert.fail("restart must not execute media"))
    });
    const service = new ResolvedAudioPlanApplicationService({ history, media, intents: repository, clock: () => now });
    assert.deepEqual((await service.reconcilePendingWithoutReplay()).map(({ status: value }) => value), ["interrupted"]);
    assert.equal((await repository.getIntent(`collision-${status}`)).status, "interrupted");
    assert.deepEqual((await repository.getIntent(`collision-${status}`)).cleanupUncertainUris, []);
  }
});

test("restart durable promotion requires the exact mux child and an applied canonical mutation", async () => {
  const variants = ["missing-result", "wrong-operation", "wrong-output", "wrong-export", "wrong-preset", "wrong-mutation", "correct"];
  for (const variant of variants) {
    const history = historyFixture();
    history.commit({ type: "export.add", export: {
      id: "proof-export", presetId: "fixture", status: "completed", outputUri: "/render/proof.mp4",
      createdAt: now, completedAt: now
    } });
    const muxId = `proof-${variant}:mux`;
    const baseRecord = {
      id: muxId, projectId: history.current.project.id, locale: "pt-BR",
      operation: { type: "mux-audio", videoUri: "/render/visual.mp4", audioUri: "/render/audio.wav",
        outputUri: variant === "wrong-output" ? "/render/wrong.mp4" : "/render/proof.mp4", replaceExisting: true },
      mutation: variant === "wrong-mutation"
        ? { type: "none" }
        : { type: "export.add", exportId: variant === "wrong-export" ? "other-export" : "proof-export",
          presetId: variant === "wrong-preset" ? "other-preset" : "fixture" },
      actor: { type: "system" }, status: "succeeded", createdAt: now,
      attempts: [{ number: 1, jobId: `${muxId}:1`, status: "succeeded", requestedAt: now,
        outputUris: [variant === "wrong-output" ? "/render/wrong.mp4" : "/render/proof.mp4"],
        preexistingOutputUris: [], ownedOutputUris: [], removedPartialOutputUris: [], cleanupFailedOutputUris: [],
        projectRevisionBefore: 0,
        ...(variant === "missing-result" ? {} : { result: muxResult({
          type: "mux-audio", videoUri: "/render/visual.mp4", audioUri: "/render/audio.wav",
          outputUri: variant === "wrong-output" ? "/render/wrong.mp4" : "/render/proof.mp4", replaceExisting: true
        }) }) }]
    };
    if (variant === "wrong-operation") {
      baseRecord.operation = { type: "probe", inputUri: "/render/visual.mp4" };
      baseRecord.attempts[0].outputUris = [];
    }
    const repository = new InMemoryMediaExecutionRepository({ version: 1, records: [baseRecord], intents: [{
      version: 1, id: `proof-${variant}`, kind: "resolved-audio-plan", projectId: history.current.project.id,
      projectBinding: { projectId: history.current.project.id, projectRevision: history.current.history.revision,
        projectSnapshotId: history.current.history.headSnapshotId, projectJournalEntryCount: history.entries.length },
      status: "application-committed", childExecutionIds: { audio: `proof-${variant}:audio`, mux: muxId },
      exportIntent: { exportId: "proof-export", presetId: "fixture", expectedOutputUri: "/render/proof.mp4" },
      createdAt: now, updatedAt: now
    }] });
    const media = new MediaApplicationService({
      history, executions: repository, artifacts: new MemoryArtifacts(), clock: () => now,
      engine: new FakeEngine(async () => assert.fail("restart must not execute media"))
    });
    const service = new ResolvedAudioPlanApplicationService({ history, media, intents: repository, clock: () => now });
    const [result] = await service.reconcilePendingWithoutReplay();
    assert.equal(result.status, variant === "correct" ? "succeeded" : "interrupted", variant);
    assert.equal((await repository.getIntent(`proof-${variant}`)).status,
      variant === "correct" ? "durable-succeeded" : "interrupted", variant);
  }
});
