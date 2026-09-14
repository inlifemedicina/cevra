import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyProject, ProjectHistory } from "@cevra/project-ir";
import {
  LocalSourceIngestError,
  LocalSourceIngestService,
  MediaApplicationError
} from "../dist/index.js";

const now = "2026-09-13T12:00:00.000Z";
const videoUri = "file:///Users/editor/Original Camera File.mov";

class FakeMediaApplicationService {
  calls = [];

  constructor(execute) {
    this.executeImpl = execute;
  }

  async execute(request, signal) {
    this.calls.push({ request, signal });
    return this.executeImpl(request, signal);
  }
}

function fixture(execute) {
  let historyId = 0;
  const history = new ProjectHistory(
    createEmptyProject({ id: "project-1", name: "Project", locale: "pt-BR", now }),
    { clock: () => now, idGenerator: () => `history-${++historyId}` }
  );
  const media = new FakeMediaApplicationService(execute);
  const generated = ["source-generated", "probe-generated"];
  const service = new LocalSourceIngestService({
    media,
    history,
    idGenerator: () => generated.shift() ?? "unexpected-id"
  });
  return { service, history, media };
}

function successfulProbe(request, history, probe) {
  const record = {
    id: request.id,
    projectId: history.current.project.id,
    locale: request.locale,
    operation: request.operation,
    mutation: request.mutation,
    actor: request.actor,
    status: "succeeded",
    createdAt: now,
    attempts: [{
      number: 1,
      jobId: `${request.id}:1`,
      status: "succeeded",
      requestedAt: now,
      startedAt: now,
      completedAt: now,
      outputUris: [],
      preexistingOutputUris: [],
      removedPartialOutputUris: [],
      cleanupFailedOutputUris: [],
      projectRevisionBefore: history.current.history.revision,
      result: { type: "probe", probe },
      provenance: {
        engineId: "cevra.media.ffmpeg",
        engineVersion: "1.0.0",
        engineApiVersion: 1,
        engineDisplayName: "CEVRA FFmpeg Media Engine"
      }
    }]
  };
  return { record, project: history.current };
}

test("ingests a local video through the media application probe and commits one source.add", async () => {
  let history;
  const context = fixture(async (request) => successfulProbe(request, history, {
    uri: videoUri,
    durationMs: 12_345,
    width: 3840,
    height: 2160,
    frameRate: 29.97,
    sampleRate: 48_000,
    channels: 2,
    hasVideo: true,
    hasAudio: true,
    videoCodec: "h264",
    audioCodec: "aac"
  }));
  history = context.history;

  const result = await context.service.ingest({
    uri: videoUri,
    displayName: "Original Camera File.mov",
    checksum: "sha256:caller-supplied",
    extensions: { caller: { retained: true }, "cevra.ingest": { requestTag: "take-1" } },
    actor: { type: "user", id: "editor-1" }
  });

  assert.equal(result.source.kind, "video");
  assert.equal(result.source.uri, videoUri);
  assert.equal(result.source.durationMs, 12_345);
  assert.equal(result.source.width, 3840);
  assert.equal(result.source.height, 2160);
  assert.equal(result.source.frameRate, 29.97);
  assert.equal(result.source.sampleRate, 48_000);
  assert.equal(result.source.channels, 2);
  assert.equal(result.source.checksum, "sha256:caller-supplied");
  assert.deepEqual(result.source.extensions.caller, { retained: true });
  assert.deepEqual(result.source.extensions["cevra.ingest"], {
    requestTag: "take-1",
    method: "local",
    probeExecutionId: "probe-generated",
    probeAttempt: 1,
    engineId: "cevra.media.ffmpeg",
    engineVersion: "1.0.0",
    engineApiVersion: 1,
    hasVideo: true,
    hasAudio: true,
    videoCodec: "h264",
    audioCodec: "aac"
  });
  assert.equal(result.project.history.revision, 1);
  assert.equal(history.entries.length, 1);
  assert.equal(history.entries[0].command.type, "source.add");
  assert.deepEqual(history.entries[0].actor, { type: "user", id: "editor-1" });
  assert.equal(context.media.calls.length, 1);
  assert.deepEqual(context.media.calls[0].request.operation, { type: "probe", inputUri: videoUri });
  assert.deepEqual(context.media.calls[0].request.mutation, { type: "none" });
  assert.equal("outputUri" in context.media.calls[0].request.operation, false);
});

test("ingests audio-only media as an audio source", async () => {
  let history;
  const context = fixture(async (request) => successfulProbe(request, history, {
    uri: "file:///Users/editor/voice.wav",
    durationMs: 5_000,
    sampleRate: 48_000,
    channels: 1,
    hasVideo: false,
    hasAudio: true,
    audioCodec: "pcm_s24le"
  }));
  history = context.history;

  const result = await context.service.ingest({
    uri: "file:///Users/editor/voice.wav",
    displayName: "voice.wav",
    expectedKind: "audio"
  });

  assert.equal(result.source.kind, "audio");
  assert.equal(result.source.sampleRate, 48_000);
  assert.equal(result.source.channels, 1);
  assert.equal(history.current.sources.length, 1);
});

test("rejects media without video or audio streams without mutating Project IR", async () => {
  let history;
  const context = fixture(async (request) => successfulProbe(request, history, {
    uri: "file:///Users/editor/unsupported.bin",
    hasVideo: false,
    hasAudio: false
  }));
  history = context.history;

  await assert.rejects(
    context.service.ingest({ uri: "file:///Users/editor/unsupported.bin", displayName: "unsupported.bin" }),
    (error) => error instanceof LocalSourceIngestError && error.code === "LOCAL_SOURCE_UNSUPPORTED_MEDIA"
  );
  assert.equal(history.current.history.revision, 0);
  assert.equal(history.current.sources.length, 0);
  assert.equal(history.entries.length, 0);
});

test("rejects an expected media kind mismatch, including unsupported image intake", async () => {
  let history;
  const context = fixture(async (request) => successfulProbe(request, history, {
    uri: videoUri,
    hasVideo: true,
    hasAudio: true,
    videoCodec: "h264"
  }));
  history = context.history;

  await assert.rejects(
    context.service.ingest({ uri: videoUri, displayName: "Camera.mov", expectedKind: "audio" }),
    (error) => error instanceof LocalSourceIngestError && error.code === "LOCAL_SOURCE_KIND_MISMATCH"
  );
  await assert.rejects(
    context.service.ingest({ uri: videoUri, displayName: "Still.png", expectedKind: "image" }),
    (error) => error instanceof LocalSourceIngestError && error.code === "LOCAL_SOURCE_KIND_MISMATCH"
  );
  assert.equal(history.current.history.revision, 0);
  assert.equal(history.current.sources.length, 0);
});

test("detects a concurrent Project IR revision after probe and does not ingest a source", async () => {
  let history;
  const context = fixture(async (request) => {
    history.commit({ type: "project.rename", name: "Concurrent edit" }, { type: "user" });
    return successfulProbe(request, history, { uri: videoUri, hasVideo: true, hasAudio: false, videoCodec: "h264" });
  });
  history = context.history;

  await assert.rejects(
    context.service.ingest({ uri: videoUri, displayName: "Camera.mov" }),
    (error) => error instanceof LocalSourceIngestError && error.code === "LOCAL_SOURCE_PROJECT_CONFLICT"
  );
  assert.equal(history.current.project.name, "Concurrent edit");
  assert.equal(history.current.sources.length, 0);
  assert.equal(history.current.history.revision, 1);
  assert.equal(history.entries.length, 1);
});

test("maps probe failure without adding a source", async () => {
  const technical = new Error("private ffprobe failed");
  const context = fixture(async () => { throw technical; });

  await assert.rejects(
    context.service.ingest({ uri: videoUri, displayName: "Camera.mov", locale: "en-US" }),
    (error) => error instanceof LocalSourceIngestError
      && error.code === "LOCAL_SOURCE_PROBE_FAILED"
      && error.message === "The selected media file could not be inspected."
      && error.cause === technical
  );
  assert.equal(context.history.current.history.revision, 0);
  assert.equal(context.history.current.sources.length, 0);
});

test("maps a rejected media probe request to the typed ingest invalid-request error", async () => {
  const mediaError = new MediaApplicationError("MEDIA_INVALID_REQUEST", "en-US", "probe-generated");
  const context = fixture(async () => { throw mediaError; });

  await assert.rejects(
    context.service.ingest({ uri: "unsafe\nuri.mov", displayName: "Camera.mov", locale: "en-US" }),
    (error) => error instanceof LocalSourceIngestError
      && error.code === "LOCAL_SOURCE_INVALID_REQUEST"
      && error.cause === mediaError
  );
  assert.equal(context.history.current.history.revision, 0);
  assert.equal(context.history.entries.length, 0);
});

test("propagates cancellation to the probe and performs no ingest commit", async () => {
  let receivedSignal;
  const context = fixture(async (_request, signal) => {
    receivedSignal = signal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("cancelled");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
  });
  const controller = new AbortController();
  const ingest = context.service.ingest({ uri: videoUri, displayName: "Camera.mov" }, controller.signal);
  controller.abort();

  await assert.rejects(ingest, (error) => error instanceof MediaApplicationError && error.code === "MEDIA_OPERATION_CANCELLED");
  assert.equal(receivedSignal, controller.signal);
  assert.equal(context.history.current.history.revision, 0);
  assert.equal(context.history.entries.length, 0);
});

test("undo removes the ingested source and redo restores the exact source", async () => {
  let history;
  const context = fixture(async (request) => successfulProbe(request, history, {
    uri: videoUri,
    durationMs: 4_000,
    width: 1920,
    height: 1080,
    frameRate: 30,
    hasVideo: true,
    hasAudio: false,
    videoCodec: "h264"
  }));
  history = context.history;
  const result = await context.service.ingest({ uri: videoUri, displayName: "Camera.mov", sourceId: "source-fixed" });

  assert.equal(history.undo().sources.length, 0);
  assert.deepEqual(history.redo().sources[0], result.source);
});

test("reports a typed commit failure and keeps the previous project revision", async () => {
  let history;
  const context = fixture(async (request) => successfulProbe(request, history, {
    uri: videoUri,
    hasVideo: true,
    hasAudio: false,
    videoCodec: "h264"
  }));
  history = context.history;
  history.commit({
    type: "source.add",
    source: { id: "duplicate-source", kind: "video", uri: "file:///existing.mov", displayName: "Existing" }
  });
  const revisionBefore = history.current.history.revision;

  await assert.rejects(
    context.service.ingest({ uri: videoUri, displayName: "Camera.mov", sourceId: "duplicate-source" }),
    (error) => error instanceof LocalSourceIngestError && error.code === "LOCAL_SOURCE_COMMIT_FAILED"
  );
  assert.equal(history.current.history.revision, revisionBefore);
  assert.equal(history.current.sources.length, 1);
});
