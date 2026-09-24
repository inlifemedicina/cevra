import assert from "node:assert/strict";
import test from "node:test";

import { CEVRA_ENGINE_API_VERSION } from "@cevra/contracts";
import { createEmptyProject, ProjectHistory } from "@cevra/project-ir";
import {
  InMemoryMediaExecutionRepository,
  MediaApplicationError,
  MediaApplicationService
} from "../dist/index.js";

const now = "2026-09-12T12:00:00.000Z";
const trim = { type: "trim", inputUri: "/media/in.mp4", outputUri: "/media/out.mp4", startMs: 0, endMs: 1000 };
const sourceMutation = { type: "source.add", source: { id: "source-out", kind: "video", displayName: "Output" } };
const audioSequence = {
  type: "render-audio-sequence", version: 1,
  sources: [{ id: "a", uri: "/media/a.wav" }, { id: "b", uri: "/media/b.wav" }, { id: "c", uri: "/media/c.wav" }],
  items: [
    { sourceId: "a", sourceStartMs: 0, sourceEndMs: 1500, timelineStartMs: 0 },
    { sourceId: "b", sourceStartMs: 0, sourceEndMs: 2500, timelineStartMs: 1500 },
    { sourceId: "c", sourceStartMs: 0, sourceEndMs: 500, timelineStartMs: 3500 }
  ],
  outputUri: "/media/staging/audio.wav", outputDurationMs: 4000, outputChannelLayout: "stereo"
};
const muxAudio = {
  type: "mux-audio", videoUri: "/media/picture.mp4", audioUri: audioSequence.outputUri,
  outputUri: "/media/final.mp4", replaceExisting: true
};

class MemoryArtifacts {
  files = new Set();
  symlinks = new Set();
  identities = new Map();
  removed = [];

  async kind(uri) { return this.symlinks.has(uri) ? "symlink" : this.files.has(uri) ? "file" : "missing"; }
  async exists(uri) { return this.files.has(uri); }
  async remove(uri) { this.files.delete(uri); this.symlinks.delete(uri); this.removed.push(uri); }
  async matchesPublication(uri, evidence) {
    return this.files.has(uri) && !this.symlinks.has(uri)
      && evidence.scheme === "posix-dev-inode" && evidence.device === "1"
      && evidence.inode === (this.identities.get(uri) ?? "1");
  }
}

const publication = { version: 1, scheme: "posix-dev-inode", device: "1", inode: "1" };

function completedFile(outputUri, durationMs = 1000) {
  return {
    type: "file", outputUri, durationMs,
    probe: { uri: outputUri, durationMs, width: 1920, height: 1080, frameRate: 30, hasVideo: true, hasAudio: true, videoCodec: "h264", audioCodec: "aac" },
    effectiveProfile: { container: "mp4", videoCodec: "h264", audioCodec: "aac", videoEncoder: "h264_videotoolbox", audioEncoder: "aac" }
  };
}

function completedAudioSequence(operation = audioSequence) {
  const channels = operation.outputChannelLayout === "mono" ? 1 : 2;
  const maximumSimultaneousItemCount = Math.max(...operation.items.map((candidate) => operation.items.filter((item) => {
    const end = item.timelineStartMs + item.sourceEndMs - item.sourceStartMs;
    return item.timelineStartMs <= candidate.timelineStartMs && candidate.timelineStartMs < end;
  }).length));
  return {
    type: "file", outputUri: operation.outputUri, durationMs: operation.outputDurationMs,
    probe: { uri: operation.outputUri, durationMs: operation.outputDurationMs, sizeBytes: operation.outputDurationMs * 48 * channels * 4 + 114, hasVideo: false, hasAudio: true, audioCodec: "pcm_f32le", sampleRate: 48000, channels },
    effectiveProfile: { container: "wav", audioCodec: "pcm", audioEncoder: "pcm_f32le" },
    publication,
    audioSequence: { version: 1, sampleRate: 48000, sampleFormat: "pcm_f32le", channelLayout: operation.outputChannelLayout, distinctSourceCount: operation.sources.length, itemCount: operation.items.length, maximumSimultaneousItemCount, outputSampleCount: operation.outputDurationMs * 48, estimatedDataBytes: operation.outputDurationMs * 48 * channels * 4, measuredDataBytes: operation.outputDurationMs * 48 * channels * 4, graphBytes: 1024 }
  };
}

function completedMuxAudio(operation = muxAudio) {
  return {
    type: "file", outputUri: operation.outputUri, durationMs: 4000,
    probe: { uri: operation.outputUri, durationMs: 4000, width: 1920, height: 1080, frameRate: 30, hasVideo: true, hasAudio: true, videoCodec: "h264", audioCodec: "aac" },
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

class FakeEngine {
  calls = [];

  constructor(execute) { this.executeImpl = execute; }
  async identity() {
    return { id: "test.media", kind: "media", displayName: "Test Media", version: "1.2.3", apiVersion: CEVRA_ENGINE_API_VERSION };
  }
  async healthcheck() { return { status: "ready", checkedAt: now, checks: [] }; }
  async capabilities() { return []; }
  async execute(operation, context) {
    this.calls.push({ operation, context });
    return this.executeImpl(operation, context);
  }
}

class HookRepository extends InMemoryMediaExecutionRepository {
  constructor(hook) { super(); this.hook = hook; }
  async save(record) {
    await this.hook?.(record);
    return super.save(record);
  }
}

function fixture(engine, artifacts = new MemoryArtifacts(), repository = new InMemoryMediaExecutionRepository()) {
  let id = 0;
  const history = new ProjectHistory(
    createEmptyProject({ id: "project-1", name: "Project", locale: "pt-BR", now }),
    { clock: () => now, idGenerator: () => `history-${++id}` }
  );
  const service = new MediaApplicationService({
    engine,
    history,
    executions: repository,
    artifacts,
    clock: () => now,
    idGenerator: () => "generated-execution"
  });
  return { service, history, artifacts, repository };
}

test("successful file operation commits one typed command and recoverable Project IR snapshot", async () => {
  const artifacts = new MemoryArtifacts();
  const engine = new FakeEngine(async () => {
    artifacts.files.add(trim.outputUri);
    return completedFile(trim.outputUri);
  });
  const { service, history, repository } = fixture(engine, artifacts);

  const outcome = await service.execute({ id: "execution-1", operation: trim, mutation: sourceMutation, actor: { type: "agent", id: "agent-1" } });

  assert.equal(outcome.record.status, "succeeded");
  assert.equal(outcome.record.attempts[0].result.outputUri, trim.outputUri);
  assert.deepEqual(outcome.record.attempts[0].outputUris, [trim.outputUri]);
  assert.deepEqual(outcome.record.attempts[0].provenance, {
    engineId: "test.media", engineVersion: "1.2.3", engineApiVersion: 1, engineDisplayName: "Test Media"
  });
  assert.equal(outcome.project.history.revision, 1);
  assert.equal(outcome.project.sources[0].uri, trim.outputUri);
  assert.equal(outcome.project.sources[0].extensions["cevra.media"].executionId, "execution-1");
  assert.equal(history.entries.length, 1);
  assert.equal(history.entries[0].command.type, "source.add");
  assert.deepEqual(history.entries[0].actor, { type: "agent", id: "agent-1" });
  assert.equal(history.snapshots.length, 2);
  assert.equal(outcome.record.attempts[0].projectJournalEntryId, history.entries[0].id);
  assert.deepEqual((await repository.get("execution-1")).status, "succeeded");
});

test("successful export is added through the Project IR command API", async () => {
  const artifacts = new MemoryArtifacts();
  const engine = new FakeEngine(async () => {
    artifacts.files.add(trim.outputUri);
    return completedFile(trim.outputUri);
  });
  const { service, history } = fixture(engine, artifacts);

  const outcome = await service.execute({
    id: "export-execution",
    operation: trim,
    mutation: { type: "export.add", exportId: "export-1", presetId: "delivery-1080p" }
  });

  assert.equal(outcome.project.exports[0].status, "completed");
  assert.equal(outcome.project.exports[0].outputUri, trim.outputUri);
  assert.equal(history.entries[0].command.type, "export.add");
});

test("engine failure removes a new partial output and leaves Project IR unchanged", async () => {
  const artifacts = new MemoryArtifacts();
  const engine = new FakeEngine(async () => {
    artifacts.files.add(trim.outputUri);
    throw new Error("ffmpeg exited with status 1");
  });
  const { service, history, repository } = fixture(engine, artifacts);

  await assert.rejects(
    service.execute({ id: "failed-execution", locale: "en-US", operation: trim, mutation: sourceMutation }),
    (error) => error instanceof MediaApplicationError
      && error.code === "MEDIA_OPERATION_FAILED"
      && error.message === "The media operation could not be completed."
  );

  assert.equal(artifacts.files.has(trim.outputUri), false);
  assert.deepEqual(artifacts.removed, [trim.outputUri]);
  assert.equal(history.current.history.revision, 0);
  assert.equal(history.entries.length, 0);
  const record = await repository.get("failed-execution");
  assert.equal(record.status, "failed");
  assert.equal(record.attempts[0].technicalError, "ffmpeg exited with status 1");
  assert.deepEqual(record.attempts[0].removedPartialOutputUris, [trim.outputUri]);
});

test("cancellation records a stable code, cleans partial output and keeps the project snapshot", async () => {
  const artifacts = new MemoryArtifacts();
  let started;
  const didStart = new Promise((resolve) => { started = resolve; });
  const engine = new FakeEngine(async (_operation, context) => {
    artifacts.files.add(trim.outputUri);
    started();
    return new Promise((_resolve, reject) => {
      context.signal.addEventListener("abort", () => {
        const error = new Error("worker cancelled job");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
  });
  const { service, history, repository } = fixture(engine, artifacts);
  const controller = new AbortController();
  const execution = service.execute({ id: "cancelled-execution", operation: trim, mutation: sourceMutation }, controller.signal);
  await didStart;
  controller.abort();

  await assert.rejects(execution, (error) => error instanceof MediaApplicationError
    && error.code === "MEDIA_OPERATION_CANCELLED"
    && error.message === "A operação de mídia foi cancelada.");
  assert.equal(history.current.history.revision, 0);
  assert.equal(artifacts.files.has(trim.outputUri), false);
  assert.equal((await repository.get("cancelled-execution")).status, "cancelled");
});

test("retry reuses the application record with a new worker job and commits only the successful attempt", async () => {
  const artifacts = new MemoryArtifacts();
  let calls = 0;
  const engine = new FakeEngine(async () => {
    calls += 1;
    artifacts.files.add(trim.outputUri);
    if (calls === 1) throw new Error("transient failure");
    return completedFile(trim.outputUri);
  });
  const { service, history, repository } = fixture(engine, artifacts);
  await assert.rejects(service.execute({ id: "retry-execution", operation: trim, mutation: sourceMutation }));

  const outcome = await service.retry("retry-execution");

  assert.equal(outcome.record.status, "succeeded");
  assert.equal(outcome.record.attempts.length, 2);
  assert.deepEqual(outcome.record.attempts.map((attempt) => attempt.jobId), ["retry-execution:1", "retry-execution:2"]);
  assert.equal(history.entries.length, 1);
  assert.equal(history.current.sources.length, 1);
  assert.equal((await repository.get("retry-execution")).attempts.length, 2);
});

test("crash recovery removes an uncommitted partial artifact and retries from persisted execution state", async () => {
  const artifacts = new MemoryArtifacts();
  artifacts.files.add(trim.outputUri);
  const repository = new InMemoryMediaExecutionRepository({
    version: 1,
    records: [{
      id: "crashed-execution",
      projectId: "project-1",
      locale: "pt-BR",
      operation: trim,
      mutation: sourceMutation,
      actor: { type: "system" },
      status: "running",
      createdAt: now,
      attempts: [{
        number: 1,
        jobId: "crashed-execution:1",
        status: "running",
        requestedAt: now,
        startedAt: now,
        outputUris: [trim.outputUri],
        preexistingOutputUris: [],
        removedPartialOutputUris: [],
        cleanupFailedOutputUris: [],
        projectRevisionBefore: 0
      }]
    }]
  });
  const engine = new FakeEngine(async () => {
    artifacts.files.add(trim.outputUri);
    return completedFile(trim.outputUri);
  });
  const { service, history } = fixture(engine, artifacts, repository);

  const result = await service.recoverPending();

  assert.deepEqual(result, [{ executionId: "crashed-execution", status: "succeeded" }]);
  assert.deepEqual(artifacts.removed, [trim.outputUri]);
  const recovered = await repository.get("crashed-execution");
  assert.equal(recovered.attempts[0].status, "interrupted");
  assert.equal(recovered.attempts[1].status, "succeeded");
  assert.equal(history.current.history.revision, 1);
});

test("crash recovery reconciles an already committed Project IR mutation without rerunning the engine", async () => {
  const artifacts = new MemoryArtifacts();
  artifacts.files.add(trim.outputUri);
  const repository = new InMemoryMediaExecutionRepository();
  const engine = new FakeEngine(async () => assert.fail("committed operation must not run again"));
  const { service, history } = fixture(engine, artifacts, repository);
  const project = history.commit({
    type: "source.add",
    source: {
      id: sourceMutation.source.id,
      kind: sourceMutation.source.kind,
      uri: trim.outputUri,
      displayName: sourceMutation.source.displayName,
      extensions: { "cevra.media": { executionId: "commit-crash", attempt: 1 } }
    }
  }, { type: "system" });
  await repository.save({
    id: "commit-crash",
    projectId: "project-1",
    locale: "pt-BR",
    operation: trim,
    mutation: sourceMutation,
    actor: { type: "system" },
    status: "committing",
    createdAt: now,
    attempts: [{
      number: 1,
      jobId: "commit-crash:1",
      status: "committing",
      requestedAt: now,
      startedAt: now,
      outputUris: [trim.outputUri],
      preexistingOutputUris: [],
      removedPartialOutputUris: [],
      cleanupFailedOutputUris: [],
      projectRevisionBefore: 0,
      result: { type: "file", outputUri: trim.outputUri },
      provenance: { engineId: "test.media", engineVersion: "1.2.3", engineApiVersion: 1, engineDisplayName: "Test Media" }
    }]
  });

  const recovered = await service.recoverPending();

  assert.deepEqual(recovered, [{ executionId: "commit-crash", status: "succeeded" }]);
  assert.equal(engine.calls.length, 0);
  assert.equal(artifacts.files.has(trim.outputUri), true);
  assert.deepEqual(artifacts.removed, []);
  assert.equal(history.current.history.revision, project.history.revision);
  assert.equal((await repository.get("commit-crash")).attempts[0].projectJournalEntryId, history.entries[0].id);
});

test("pre-existing output is preserved and the engine is never invoked", async () => {
  const artifacts = new MemoryArtifacts();
  artifacts.files.add(trim.outputUri);
  const engine = new FakeEngine(async () => assert.fail("engine must not execute"));
  const { service, history, repository } = fixture(engine, artifacts);

  await assert.rejects(
    service.execute({ id: "protected-execution", locale: "en-US", operation: trim, mutation: sourceMutation }),
    (error) => error instanceof MediaApplicationError
      && error.code === "MEDIA_OUTPUT_EXISTS"
      && error.message.includes(trim.outputUri)
  );

  assert.equal(engine.calls.length, 0);
  assert.equal(artifacts.files.has(trim.outputUri), true);
  assert.deepEqual(artifacts.removed, []);
  assert.equal(history.current.history.revision, 0);
  assert.deepEqual((await repository.get("protected-execution")).attempts[0].preexistingOutputUris, [trim.outputUri]);
});

test("concurrent Project IR change rejects the stale result and preserves the newer snapshot", async () => {
  const artifacts = new MemoryArtifacts();
  let history;
  const engine = new FakeEngine(async () => {
    artifacts.files.add(trim.outputUri);
    history.commit({ type: "project.rename", name: "Changed concurrently" }, { type: "user" });
    return completedFile(trim.outputUri);
  });
  const context = fixture(engine, artifacts);
  history = context.history;

  await assert.rejects(
    context.service.execute({ id: "conflict-execution", operation: trim, mutation: sourceMutation }),
    (error) => error instanceof MediaApplicationError && error.code === "MEDIA_PROJECT_CONFLICT"
  );

  assert.equal(history.current.project.name, "Changed concurrently");
  assert.equal(history.current.sources.length, 0);
  assert.equal(history.current.history.revision, 1);
  assert.equal(history.entries.length, 1);
  assert.equal(artifacts.files.has(trim.outputUri), false);
});

test("read-only probe is recorded without creating a Project IR mutation", async () => {
  const operation = { type: "probe", inputUri: "/media/in.mp4" };
  const engine = new FakeEngine(async () => ({ type: "probe", probe: { uri: operation.inputUri, hasVideo: true, hasAudio: true } }));
  const { service, history } = fixture(engine);

  const outcome = await service.execute({ id: "probe-execution", operation, mutation: { type: "none" } });

  assert.equal(outcome.record.status, "succeeded");
  assert.equal(history.current.history.revision, 0);
  assert.equal(history.entries.length, 0);
  assert.equal(history.snapshots.length, 1);
});

test("read-only probe succeeds across a concurrent Project IR revision", async () => {
  const operation = { type: "probe", inputUri: "/media/in.mp4" };
  let history;
  const engine = new FakeEngine(async () => {
    history.commit({ type: "project.rename", name: "Concurrent edit" }, { type: "user" });
    return { type: "probe", probe: { uri: operation.inputUri, hasVideo: true, hasAudio: false, videoCodec: "h264" } };
  });
  const context = fixture(engine);
  history = context.history;
  const outcome = await context.service.execute({ id: "concurrent-probe", operation, mutation: { type: "none" } });
  assert.equal(outcome.record.status, "succeeded");
  assert.equal(history.current.project.name, "Concurrent edit");
  assert.equal(history.current.history.revision, 1);
});

test("application service rejects pre-existing symlink outputs and preserves the link target", async () => {
  const artifacts = new MemoryArtifacts();
  artifacts.symlinks.add(trim.outputUri);
  const engine = new FakeEngine(async () => assert.fail("engine must not execute for a symlink output"));
  const { service } = fixture(engine, artifacts);
  await assert.rejects(
    service.execute({ id: "symlink-output", operation: trim, mutation: sourceMutation }),
    (error) => error instanceof MediaApplicationError && error.code === "MEDIA_INVALID_REQUEST"
  );
  assert.equal(artifacts.symlinks.has(trim.outputUri), true);
  assert.deepEqual(artifacts.removed, []);
});

test("file result without A/V streams fails before Project IR commit", async () => {
  const artifacts = new MemoryArtifacts();
  const engine = new FakeEngine(async () => {
    artifacts.files.add(trim.outputUri);
    return { type: "file", outputUri: trim.outputUri, probe: { uri: trim.outputUri, hasVideo: false, hasAudio: false }, effectiveProfile: { container: "mp4" } };
  });
  const { service, history } = fixture(engine, artifacts);
  await assert.rejects(service.execute({ id: "empty-output", operation: trim, mutation: sourceMutation }),
    (error) => error instanceof MediaApplicationError && error.code === "MEDIA_OUTPUT_MISSING");
  assert.equal(history.current.history.revision, 0);
  assert.equal(artifacts.files.has(trim.outputUri), false);
});

test("postcondition rejects produced codec/profile mismatch before Project IR commit", async () => {
  const artifacts = new MemoryArtifacts();
  const engine = new FakeEngine(async () => {
    artifacts.files.add(trim.outputUri);
    const result = completedFile(trim.outputUri);
    result.probe.videoCodec = "h265";
    result.effectiveProfile.videoCodec = "h265";
    return result;
  });
  const { service, history } = fixture(engine, artifacts);
  await assert.rejects(service.execute({ id: "codec-mismatch", operation: trim, mutation: sourceMutation }),
    (error) => error instanceof MediaApplicationError && error.code === "MEDIA_OPERATION_FAILED");
  assert.equal(history.current.history.revision, 0);
  assert.equal(artifacts.files.has(trim.outputUri), false);
});

test("recovery preserves outputs referenced by a reachable redo snapshot", async () => {
  const artifacts = new MemoryArtifacts();
  const repository = new InMemoryMediaExecutionRepository();
  const engine = new FakeEngine(async () => assert.fail("protected redo artifact must not be regenerated"));
  const context = fixture(engine, artifacts, repository);
  context.history.commit({
    type: "source.add",
    source: { id: "redo-source", kind: "video", uri: trim.outputUri, displayName: "Redo output" }
  }, { type: "user" });
  context.history.undo();
  artifacts.files.add(trim.outputUri);
  await repository.save({
    id: "redo-recovery", projectId: "project-1", locale: "pt-BR", operation: trim, mutation: sourceMutation,
    actor: { type: "system" }, status: "running", createdAt: now,
    attempts: [{ number: 1, jobId: "redo-recovery:1", status: "running", requestedAt: now, startedAt: now,
      outputUris: [trim.outputUri], preexistingOutputUris: [], removedPartialOutputUris: [], cleanupFailedOutputUris: [], projectRevisionBefore: 0 }]
  });
  const recovered = await context.service.recoverPending();
  assert.equal(artifacts.files.has(trim.outputUri), true);
  assert.deepEqual(artifacts.removed, []);
  assert.equal(context.history.canRedo, true);
  assert.equal(context.history.redo().sources[0].uri, trim.outputUri);
  assert.equal(recovered[0].status, "failed");
});

test("cleanup uses retained metadata without materializing snapshots and protects undo and redo artifacts", async () => {
  const undoUri = "/media/undo-only.mp4";
  const redoUri = "/media/redo-only.mp4";
  const artifacts = new MemoryArtifacts();
  const repository = new InMemoryMediaExecutionRepository();
  const engine = new FakeEngine(async () => {
    throw new Error("recovery retry intentionally fails");
  });
  const context = fixture(engine, artifacts, repository);
  context.history.commit({
    type: "source.add",
    source: { id: "undo-source", kind: "video", uri: undoUri, displayName: "Undo only" }
  });
  context.history.commit({ type: "source.remove", sourceId: "undo-source" });
  context.history.commit({
    type: "source.add",
    source: { id: "redo-source", kind: "video", uri: redoUri, displayName: "Redo only" }
  });
  context.history.undo();
  Object.defineProperty(context.history, "snapshots", {
    configurable: true,
    get: () => assert.fail("cleanup must not materialize full history snapshots")
  });
  artifacts.files.add(undoUri);
  artifacts.files.add(redoUri);
  artifacts.files.add(trim.outputUri);
  await repository.save({
    id: "metadata-cleanup", projectId: "project-1", locale: "pt-BR", operation: trim, mutation: sourceMutation,
    actor: { type: "system" }, status: "running", createdAt: now,
    attempts: [{ number: 1, jobId: "metadata-cleanup:1", status: "running", requestedAt: now, startedAt: now,
      outputUris: [undoUri, redoUri, trim.outputUri], preexistingOutputUris: [], removedPartialOutputUris: [], cleanupFailedOutputUris: [], projectRevisionBefore: 2 }]
  });

  const recovered = await context.service.recoverPending();

  assert.equal(artifacts.files.has(undoUri), true);
  assert.equal(artifacts.files.has(redoUri), true);
  assert.equal(artifacts.files.has(trim.outputUri), false);
  assert.deepEqual(artifacts.removed, [trim.outputUri]);
  assert.equal(context.history.canRedo, true);
  assert.equal(recovered[0].status, "failed");
});

test("audio sequence succeeds as a derived PCM artifact without mutating Project IR", async () => {
  const artifacts = new MemoryArtifacts();
  const engine = new FakeEngine(async () => {
    artifacts.files.add(audioSequence.outputUri);
    return completedAudioSequence();
  });
  const { service, history, repository } = fixture(engine, artifacts);
  const outcome = await service.execute({ id: "audio-derived", operation: audioSequence, mutation: { type: "none" } });
  assert.equal(outcome.record.status, "succeeded");
  assert.equal(outcome.record.attempts[0].result.audioSequence.itemCount, 3);
  assert.deepEqual(outcome.record.attempts[0].ownedOutputUris, [audioSequence.outputUri]);
  assert.equal(history.current.history.revision, 0);
  assert.equal(history.entries.length, 0);
  assert.equal(artifacts.files.has(audioSequence.outputUri), true);
  assert.equal((await repository.get("audio-derived")).status, "succeeded");
});

test("audio sequence cannot be promoted as hidden editable Project IR state", async () => {
  const engine = new FakeEngine(async () => assert.fail("invalid mutation must fail before execution"));
  const { service } = fixture(engine);
  await assert.rejects(
    service.execute({ id: "audio-hidden-state", operation: audioSequence, mutation: sourceMutation }),
    (error) => error instanceof MediaApplicationError && error.code === "MEDIA_INVALID_REQUEST"
  );
  assert.equal(engine.calls.length, 0);
});

test("audio sequence engine failures preserve a race-winning foreign destination", async () => {
  for (const detail of ["EACCES: permission denied", "ENOSPC: no space left", "WorkerProcessExitedError: worker exited"]) {
    const artifacts = new MemoryArtifacts();
    const sentinel = new TextEncoder().encode(`foreign:${detail}`);
    artifacts.bytes = new Map();
    const engine = new FakeEngine(async () => {
      artifacts.files.add(audioSequence.outputUri);
      artifacts.bytes.set(audioSequence.outputUri, sentinel);
      throw new Error(detail);
    });
    const { service, history, repository } = fixture(engine, artifacts);
    await assert.rejects(
      service.execute({ id: `audio-failure-${detail.slice(0, 6)}`, operation: audioSequence, mutation: { type: "none" } }),
      (error) => error instanceof MediaApplicationError && error.code === "MEDIA_OPERATION_FAILED"
    );
    assert.equal(artifacts.files.has(audioSequence.outputUri), true);
    assert.deepEqual(artifacts.bytes.get(audioSequence.outputUri), sentinel);
    assert.deepEqual(artifacts.removed, []);
    assert.equal(history.current.history.revision, 0);
    const record = await repository.get(`audio-failure-${detail.slice(0, 6)}`);
    assert.equal(record.attempts[0].technicalError, detail);
  }
});

test("mux engine failures preserve a race-winning foreign destination", async () => {
  const artifacts = new MemoryArtifacts();
  const sentinel = new TextEncoder().encode("foreign mux winner");
  artifacts.bytes = new Map();
  const engine = new FakeEngine(async () => {
    artifacts.files.add(muxAudio.outputUri);
    artifacts.bytes.set(muxAudio.outputUri, sentinel);
    throw new Error("exclusive publication lost to foreign file");
  });
  const { service, history, repository } = fixture(engine, artifacts);

  await assert.rejects(
    service.execute({ id: "mux-foreign-race", operation: muxAudio, mutation: { type: "export.add", exportId: "foreign-race", presetId: "fixture" } }),
    (error) => error instanceof MediaApplicationError && error.code === "MEDIA_OPERATION_FAILED"
  );

  assert.equal(artifacts.files.has(muxAudio.outputUri), true);
  assert.deepEqual(artifacts.bytes.get(muxAudio.outputUri), sentinel);
  assert.deepEqual(artifacts.removed, []);
  assert.equal(history.current.history.revision, 0);
  assert.deepEqual((await repository.get("mux-foreign-race")).attempts[0].ownedOutputUris, []);
});

test("mux output becomes owned only after successful exclusive publication evidence", async () => {
  const artifacts = new MemoryArtifacts();
  const engine = new FakeEngine(async () => {
    artifacts.files.add(muxAudio.outputUri);
    const result = completedMuxAudio();
    result.probe.videoCodec = "h265";
    return result;
  });
  const { service, repository } = fixture(engine, artifacts);

  await assert.rejects(
    service.execute({ id: "mux-owned-invalid", operation: muxAudio, mutation: { type: "export.add", exportId: "owned-invalid", presetId: "fixture" } }),
    (error) => error instanceof MediaApplicationError && error.code === "MEDIA_OPERATION_FAILED"
  );

  const record = await repository.get("mux-owned-invalid");
  assert.deepEqual(record.attempts[0].ownedOutputUris, [muxAudio.outputUri]);
  assert.deepEqual(record.attempts[0].removedPartialOutputUris, [muxAudio.outputUri]);
  assert.equal(artifacts.files.has(muxAudio.outputUri), false);
});

test("audio sequence cancellation preserves a race-winning foreign destination", async () => {
  const artifacts = new MemoryArtifacts();
  const controller = new AbortController();
  const engine = new FakeEngine(async () => {
    artifacts.files.add(audioSequence.outputUri);
    controller.abort();
    const error = new Error("cancelled after foreign publication race");
    error.name = "AbortError";
    throw error;
  });
  const { service } = fixture(engine, artifacts);
  await assert.rejects(
    service.execute({ id: "audio-foreign-cancel", operation: audioSequence, mutation: { type: "none" } }, controller.signal),
    (error) => error instanceof MediaApplicationError && error.code === "MEDIA_OPERATION_CANCELLED"
  );
  assert.equal(artifacts.files.has(audioSequence.outputUri), true);
  assert.deepEqual(artifacts.removed, []);
});

test("audio sequence known-owned output cleanup failure remains visible", async () => {
  const artifacts = new MemoryArtifacts();
  artifacts.remove = async () => { throw new Error("injected cleanup failure"); };
  const engine = new FakeEngine(async () => {
    artifacts.files.add(audioSequence.outputUri);
    const result = completedAudioSequence();
    result.audioSequence.measuredDataBytes -= 4;
    return result;
  });
  const { service, repository } = fixture(engine, artifacts);
  await assert.rejects(
    service.execute({ id: "audio-cleanup-failure", operation: audioSequence, mutation: { type: "none" } }),
    (error) => error instanceof MediaApplicationError && error.code === "MEDIA_OPERATION_FAILED"
  );
  const record = await repository.get("audio-cleanup-failure");
  assert.equal(record.status, "failed");
  assert.deepEqual(record.attempts[0].cleanupFailedOutputUris, [audioSequence.outputUri]);
  assert.equal(artifacts.files.has(audioSequence.outputUri), true);
});

test("audio sequence rejects pre-existing and symlink outputs at the Application boundary", async () => {
  for (const kind of ["file", "symlink"]) {
    const artifacts = new MemoryArtifacts();
    (kind === "file" ? artifacts.files : artifacts.symlinks).add(audioSequence.outputUri);
    const engine = new FakeEngine(async () => assert.fail("protected output must fail before execution"));
    const { service } = fixture(engine, artifacts);
    await assert.rejects(
      service.execute({ id: `audio-${kind}`, operation: audioSequence, mutation: { type: "none" } }),
      (error) => error instanceof MediaApplicationError && error.code === (kind === "file" ? "MEDIA_OUTPUT_EXISTS" : "MEDIA_INVALID_REQUEST")
    );
    assert.equal(engine.calls.length, 0);
    assert.deepEqual(artifacts.removed, []);
  }
});

test("audio sequence postcondition rejects clipped-format substitution or wrong duration", async () => {
  for (const mutate of [
    (result) => { result.probe.audioCodec = "pcm_s16le"; },
    (result) => { result.durationMs -= 1; },
    (result) => { result.audioSequence.maximumSimultaneousItemCount -= 1; },
    (result) => { result.audioSequence.estimatedDataBytes -= 4; },
    (result) => { result.audioSequence.measuredDataBytes -= 4; }
  ]) {
    const artifacts = new MemoryArtifacts();
    const engine = new FakeEngine(async () => {
      artifacts.files.add(audioSequence.outputUri);
      const result = completedAudioSequence();
      mutate(result);
      return result;
    });
    const { service, history } = fixture(engine, artifacts);
    await assert.rejects(
      service.execute({ operation: audioSequence, mutation: { type: "none" } }),
      (error) => error instanceof MediaApplicationError && error.code === "MEDIA_OPERATION_FAILED"
    );
    assert.equal(artifacts.files.has(audioSequence.outputUri), false);
    assert.equal(history.current.history.revision, 0);
  }
});

test("audio sequence recovery preserves an ambiguous crash-time destination", async () => {
  const artifacts = new MemoryArtifacts();
  artifacts.files.add(audioSequence.outputUri);
  const repository = new InMemoryMediaExecutionRepository({ version: 1, records: [{
    id: "audio-ambiguous-crash", projectId: "project-1", locale: "pt-BR", operation: audioSequence,
    mutation: { type: "none" }, actor: { type: "system" }, status: "running", createdAt: now,
    attempts: [{ number: 1, jobId: "audio-ambiguous-crash:1", status: "running", requestedAt: now, startedAt: now,
      outputUris: [audioSequence.outputUri], preexistingOutputUris: [], ownedOutputUris: [], removedPartialOutputUris: [], cleanupFailedOutputUris: [], projectRevisionBefore: 0 }]
  }] });
  const engine = new FakeEngine(async () => { throw new Error("retry blocked by preserved ambiguous output"); });
  const { service } = fixture(engine, artifacts, repository);

  const recovered = await service.recoverPending();

  assert.equal(artifacts.files.has(audioSequence.outputUri), true);
  assert.deepEqual(artifacts.removed, []);
  assert.equal(recovered[0].status, "failed");
  assert.equal((await repository.get("audio-ambiguous-crash")).attempts[0].status, "interrupted");
});

test("final commit boundary rechecks project state and abort after the committing save without an intervening await", async (t) => {
  for (const scenario of ["mutation", "commit-undo", "abort", "save-failure"]) {
    await t.test(scenario, async () => {
      const artifacts = new MemoryArtifacts();
      const controller = new AbortController();
      let context;
      const repository = new HookRepository(async (record) => {
        if (record.status !== "committing") return;
        if (scenario === "mutation") context.history.commit({ type: "project.rename", name: "Concurrent" });
        if (scenario === "commit-undo") {
          context.history.commit({ type: "project.rename", name: "Transient" });
          context.history.undo();
        }
        if (scenario === "abort") controller.abort();
        if (scenario === "save-failure") throw new Error("injected pre-commit archive failure");
      });
      const engine = new FakeEngine(async () => {
        artifacts.files.add(trim.outputUri);
        return completedFile(trim.outputUri);
      });
      context = fixture(engine, artifacts, repository);
      const current = context.history.current;
      await assert.rejects(context.service.execute({
        id: `commit-boundary-${scenario}`, operation: trim, mutation: sourceMutation,
        projectBinding: {
          projectId: current.project.id, projectRevision: current.history.revision,
          projectSnapshotId: current.history.headSnapshotId,
          projectJournalEntryCount: context.history.entries.length
        }
      }, controller.signal), (error) => error instanceof MediaApplicationError
        && error.code === (scenario === "abort" ? "MEDIA_OPERATION_CANCELLED"
          : scenario === "save-failure" ? "MEDIA_OPERATION_FAILED" : "MEDIA_PROJECT_CONFLICT"));
      assert.equal(context.history.current.sources.length, 0);
      assert.equal(context.history.entries.some((entry) => entry.command.type === "source.add"), false);
    });
  }
});

test("a post-commit archive failure reports recovery failure and preserves the canonical commit", async () => {
  const artifacts = new MemoryArtifacts();
  const repository = new HookRepository(async (record) => {
    if (record.status === "succeeded") throw new Error("injected post-commit archive failure");
  });
  const engine = new FakeEngine(async () => {
    artifacts.files.add(trim.outputUri);
    return completedFile(trim.outputUri);
  });
  const { service, history } = fixture(engine, artifacts, repository);
  await assert.rejects(service.execute({ id: "post-commit-failure", operation: trim, mutation: sourceMutation }),
    (error) => error instanceof MediaApplicationError && error.code === "MEDIA_RECOVERY_FAILED");
  assert.equal(history.entries.filter((entry) => entry.command.type === "source.add").length, 1);
  assert.equal(history.current.sources[0].uri, trim.outputUri);
  assert.equal(artifacts.files.has(trim.outputUri), true);
});

test("execute snapshots every validated request field before its first await", async () => {
  let release;
  let entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const reached = new Promise((resolve) => { entered = resolve; });
  let first = true;
  const repository = new HookRepository(async () => {
    if (!first) return;
    first = false;
    entered();
    await gate;
  });
  const artifacts = new MemoryArtifacts();
  const engine = new FakeEngine(async (operation) => {
    artifacts.files.add(operation.outputUri);
    return completedFile(operation.outputUri);
  });
  const { service, history } = fixture(engine, artifacts, repository);
  const current = history.current;
  const request = {
    id: "snapshot-request", locale: "en-US", operation: structuredClone(trim), mutation: structuredClone(sourceMutation),
    actor: { type: "agent", id: "original" },
    projectBinding: { projectId: current.project.id, projectRevision: 0, projectSnapshotId: current.history.headSnapshotId, projectJournalEntryCount: 0 },
    expectedOutput: { durationMs: 1000, durationToleranceMs: 0 }
  };
  const execution = service.execute(request);
  await reached;
  request.operation.outputUri = "/media/attacker.mp4";
  request.mutation.source.id = "attacker";
  request.actor.id = "attacker";
  request.projectBinding.projectRevision = 99;
  request.expectedOutput.durationMs = 2;
  request.locale = "pt-BR";
  release();
  const outcome = await execution;
  assert.equal(engine.calls[0].operation.outputUri, trim.outputUri);
  assert.equal(outcome.project.sources[0].id, sourceMutation.source.id);
  assert.deepEqual(history.entries[0].actor, { type: "agent", id: "original" });
  assert.equal(outcome.record.locale, "en-US");
});

test("execute clones getter-backed output expectations before validating the captured value", async () => {
  const artifacts = new MemoryArtifacts();
  const engine = new FakeEngine(async (operation) => {
    artifacts.files.add(operation.outputUri);
    return completedFile(operation.outputUri);
  });
  const { service, history } = fixture(engine, artifacts);
  const current = history.current;
  let toleranceReads = 0;
  const expectedOutput = {
    durationMs: 1000,
    get durationToleranceMs() {
      toleranceReads += 1;
      return toleranceReads === 1 ? 0 : 999;
    }
  };
  const outcome = await service.execute({
    id: "getter-snapshot", operation: trim, mutation: sourceMutation,
    projectBinding: { projectId: current.project.id, projectRevision: 0,
      projectSnapshotId: current.history.headSnapshotId, projectJournalEntryCount: 0 },
    expectedOutput
  });
  assert.equal(toleranceReads, 1);
  assert.equal(outcome.record.expectedOutput.durationToleranceMs, 0);
});

test("closed execution schemas reject extra nested fields and invalid locales before engine execution", async () => {
  const engine = new FakeEngine(async () => assert.fail("closed-schema request must not execute"));
  const { service, history } = fixture(engine);
  const current = history.current;
  const base = {
    id: "closed", operation: trim, mutation: sourceMutation, actor: { type: "agent", id: "a" },
    projectBinding: { projectId: current.project.id, projectRevision: 0, projectSnapshotId: current.history.headSnapshotId, projectJournalEntryCount: 0 },
    expectedOutput: { durationMs: 1000, durationToleranceMs: 0 }
  };
  const invalid = [
    { ...base, unexpected: true },
    { ...base, locale: "fr-FR" },
    { ...base, actor: { ...base.actor, role: "admin" } },
    { ...base, projectBinding: { ...base.projectBinding, future: 1 } },
    { ...base, expectedOutput: { ...base.expectedOutput, future: 1 } },
    { ...base, mutation: { ...base.mutation, future: 1 } },
    { ...base, mutation: { ...base.mutation, source: { ...base.mutation.source, future: 1 } } }
  ];
  for (const [index, request] of invalid.entries()) {
    await assert.rejects(service.execute({ ...request, id: `closed-${index}` }),
      (error) => error instanceof MediaApplicationError && error.code === "MEDIA_INVALID_REQUEST");
  }
  assert.equal(engine.calls.length, 0);
});

test("publication identity mismatch preserves a foreign replacement and records cleanup uncertainty", async () => {
  const artifacts = new MemoryArtifacts();
  const sentinel = new TextEncoder().encode("foreign replacement");
  artifacts.bytes = new Map();
  const engine = new FakeEngine(async () => {
    artifacts.files.add(muxAudio.outputUri);
    artifacts.bytes.set(muxAudio.outputUri, sentinel);
    artifacts.identities.set(muxAudio.outputUri, "2");
    const result = completedMuxAudio();
    result.probe.videoCodec = "h265";
    return result;
  });
  const { service, repository } = fixture(engine, artifacts);
  await assert.rejects(service.execute({ id: "foreign-replacement", operation: muxAudio,
    mutation: { type: "export.add", exportId: "foreign", presetId: "fixture" } }),
  (error) => error instanceof MediaApplicationError && error.code === "MEDIA_OPERATION_FAILED");
  assert.equal(artifacts.files.has(muxAudio.outputUri), true);
  assert.deepEqual(artifacts.bytes.get(muxAudio.outputUri), sentinel);
  assert.deepEqual((await repository.get("foreign-replacement")).attempts[0].cleanupFailedOutputUris, [muxAudio.outputUri]);
});

test("historical exclusive records without publication identity preserve ambiguous files", async () => {
  const artifacts = new MemoryArtifacts();
  artifacts.files.add(audioSequence.outputUri);
  const repository = new InMemoryMediaExecutionRepository({ version: 1, records: [{
    id: "legacy-owned", projectId: "project-1", locale: "pt-BR", operation: audioSequence,
    mutation: { type: "none" }, actor: { type: "system" }, status: "failed", createdAt: now,
    attempts: [{ number: 1, jobId: "legacy-owned:1", status: "failed", requestedAt: now,
      outputUris: [audioSequence.outputUri], preexistingOutputUris: [], ownedOutputUris: [audioSequence.outputUri],
      removedPartialOutputUris: [], cleanupFailedOutputUris: [], projectRevisionBefore: 0 }]
  }] });
  const { service } = fixture(new FakeEngine(async () => assert.fail()), artifacts, repository);
  assert.deepEqual(await service.cleanupOwnedOutputs("legacy-owned"), { removed: [], failed: [audioSequence.outputUri] });
  assert.equal(artifacts.files.has(audioSequence.outputUri), true);
});

test("atomic execution create permits at most one engine call for a duplicate id", async () => {
  const engine = new FakeEngine(async (operation) => ({
    type: "probe",
    probe: { uri: operation.inputUri, hasVideo: true, hasAudio: true, videoCodec: "h264", audioCodec: "aac" }
  }));
  const { service, repository } = fixture(engine);
  const request = { id: "atomic-duplicate", operation: { type: "probe", inputUri: "/media/in.mp4" }, mutation: { type: "none" } };
  const outcomes = await Promise.allSettled([service.execute(request), service.execute(request)]);
  assert.equal(outcomes.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(({ status }) => status === "rejected").length, 1);
  assert.equal(engine.calls.length, 1);
  assert.equal((await repository.get("atomic-duplicate")).status, "succeeded");
});

test("restart reconciliation interrupts noncanonical work without retry, cleans proven derived output, and is idempotent", async () => {
  const artifacts = new MemoryArtifacts();
  artifacts.files.add(audioSequence.outputUri);
  const runningOperation = { ...audioSequence, outputUri: "/media/staging/running.wav" };
  const repository = new InMemoryMediaExecutionRepository({ version: 1, records: [
    {
      id: "restart-requested", projectId: "project-1", locale: "pt-BR",
      operation: { type: "probe", inputUri: "/media/in.mp4" }, mutation: { type: "none" }, actor: { type: "system" },
      status: "requested", createdAt: now, attempts: []
    },
    {
      id: "restart-running", projectId: "project-1", locale: "pt-BR",
      operation: runningOperation, mutation: { type: "none" }, actor: { type: "system" },
      status: "running", createdAt: now, attempts: [{
        number: 1, jobId: "restart-running:1", status: "running", requestedAt: now, startedAt: now,
        outputUris: [runningOperation.outputUri], preexistingOutputUris: [], ownedOutputUris: [],
        removedPartialOutputUris: [], cleanupFailedOutputUris: [], projectRevisionBefore: 0
      }]
    },
    {
      id: "restart-committing-derived", projectId: "project-1", locale: "pt-BR",
      operation: audioSequence, mutation: { type: "none" }, actor: { type: "system" },
      status: "committing", createdAt: now, attempts: [{
        number: 1, jobId: "restart-committing-derived:1", status: "committing", requestedAt: now, startedAt: now,
        outputUris: [audioSequence.outputUri], preexistingOutputUris: [], ownedOutputUris: [audioSequence.outputUri],
        ownedOutputPublications: [{ uri: audioSequence.outputUri, evidence: publication }],
        removedPartialOutputUris: [], cleanupFailedOutputUris: [], projectRevisionBefore: 0,
        result: completedAudioSequence()
      }]
    }
  ] });
  const engine = new FakeEngine(async () => assert.fail("restart reconciliation must not execute the engine"));
  const { service } = fixture(engine, artifacts, repository);
  const first = await service.reconcilePendingWithoutReplay();
  const second = await service.reconcilePendingWithoutReplay();
  assert.deepEqual(first.map(({ status }) => status), ["interrupted", "interrupted", "interrupted"]);
  assert.deepEqual(second, []);
  assert.equal(engine.calls.length, 0);
  assert.equal(artifacts.files.has(audioSequence.outputUri), false);
  assert.equal((await repository.get("restart-requested")).attempts.length, 0);
  assert.equal((await repository.get("restart-running")).attempts.length, 1);
  assert.deepEqual((await repository.get("restart-committing-derived")).attempts[0].removedPartialOutputUris,
    [audioSequence.outputUri]);
});

test("restart reconciliation preserves non-exclusive foreign output without current ownership proof", async () => {
  const artifacts = new MemoryArtifacts();
  artifacts.files.add(trim.outputUri);
  const repository = new InMemoryMediaExecutionRepository({ version: 1, records: [{
    id: "restart-foreign-trim", projectId: "project-1", locale: "pt-BR",
    operation: trim, mutation: { type: "none" }, actor: { type: "system" },
    status: "running", createdAt: now, attempts: [{
      number: 1, jobId: "restart-foreign-trim:1", status: "running", requestedAt: now, startedAt: now,
      outputUris: [trim.outputUri], preexistingOutputUris: [], ownedOutputUris: [trim.outputUri],
      removedPartialOutputUris: [], cleanupFailedOutputUris: [], projectRevisionBefore: 0
    }]
  }] });
  const engine = new FakeEngine(async () => assert.fail("restart must not execute or retry"));
  const { service } = fixture(engine, artifacts, repository);
  const [recovery] = await service.reconcilePendingWithoutReplay();
  assert.equal(recovery.status, "failed");
  assert.equal(recovery.errorCode, "MEDIA_RECOVERY_FAILED");
  assert.equal(artifacts.files.has(trim.outputUri), true);
  assert.deepEqual(artifacts.removed, []);
  assert.deepEqual((await repository.get("restart-foreign-trim")).attempts[0].cleanupFailedOutputUris, [trim.outputUri]);
  assert.equal(engine.calls.length, 0);
});
