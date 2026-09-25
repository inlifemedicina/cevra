import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyProject, ProjectHistory } from "@cevra/project-ir";
import {
  MediaApplicationError,
  SourceTechnicalDescriptorApplicationService,
  SourceTechnicalDescriptorError,
  SourceTechnicalDescriptorResolver,
  createSourceContentVerificationMemo,
  normalizeSourceTechnicalDescriptor
} from "../dist/index.js";

const now = "2026-09-24T12:00:00.000Z";
const uri = "file:///tmp/source.mov";

function source(overrides = {}) {
  return {
    id: "source-1",
    kind: "video",
    uri,
    displayName: "source.mov",
    durationMs: 4_000,
    width: 1920,
    height: 1080,
    frameRate: 29.97,
    sampleRate: 48_000,
    channels: 2,
    checksum: "legacy-checksum",
    extensions: { "cevra.ingest": { method: "local" } },
    ...overrides
  };
}

function descriptor(overrides = {}) {
  return {
    version: 1,
    basis: "post-ingest",
    content: { sha256: "d".repeat(64), sizeBytes: 8 },
    method: {
      profile: "cevra.source-technical.v1",
      engineId: "cevra.media.ffmpeg",
      engineVersion: "0.3.0",
      engineApiVersion: 1
    },
    video: {
      codec: "h264",
      pixelFormat: "yuv420p",
      avgFrameRate: "30000/1001",
      rotationDegrees: 0,
      colorPrimaries: "bt2020",
      colorTransfer: "bt709",
      colorSpace: "bt2020nc",
      colorRange: "tv"
    },
    audio: { codec: "aac" },
    ...overrides
  };
}

function stamp(overrides = {}) {
  return {
    version: 1,
    uri,
    canonicalPath: "/tmp/source.mov",
    device: "1",
    inode: "2",
    sizeBytes: 8,
    mtimeNs: "3",
    ctimeNs: "4",
    ...overrides
  };
}

function identityPort(overrides = {}) {
  const currentStamp = stamp();
  return {
    captureCalls: 0,
    identifyCalls: 0,
    checkCalls: 0,
    async captureSource() {
      this.captureCalls += 1;
      return currentStamp;
    },
    async identifySource(_uri, expected) {
      this.identifyCalls += 1;
      assert.deepEqual(expected, currentStamp);
      return {
        version: 1,
        content: { sha256: "d".repeat(64), sizeBytes: 8 },
        stamp: currentStamp,
        bytesRead: 8
      };
    },
    async checkSource() {
      this.checkCalls += 1;
      return "match";
    },
    ...overrides
  };
}

function probeRecord(request, project, probeOverrides = {}) {
  return {
    record: {
      id: request.id,
      projectId: project.project.id,
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
        ownedOutputUris: [],
        removedPartialOutputUris: [],
        cleanupFailedOutputUris: [],
        projectRevisionBefore: project.history.revision,
        result: {
          type: "probe",
          probe: {
            uri: request.operation.inputUri,
            sizeBytes: 8,
            durationMs: 4_000,
            width: 1920,
            height: 1080,
            frameRate: 29.97,
            avgFrameRate: "60000/2002",
            rFrameRate: "0/0",
            rotationDegrees: -360,
            pixelFormat: "yuv420p",
            colorPrimaries: "bt2020",
            colorTransfer: "bt709",
            colorSpace: "bt2020nc",
            colorRange: "tv",
            bitDepth: 10,
            hdr: false,
            variableFrameRateSuspected: true,
            hasVideo: true,
            hasAudio: true,
            videoCodec: "h264",
            audioCodec: "aac",
            sampleRate: 48_000,
            channels: 2,
            ...probeOverrides
          }
        },
        provenance: {
          engineId: "cevra.media.ffmpeg",
          engineVersion: "0.3.0",
          engineApiVersion: 1,
          engineDisplayName: "CEVRA FFmpeg"
        }
      }]
    },
    project
  };
}

function fixture({ sourceValue = source(), mediaExecute, identity = identityPort() } = {}) {
  let sequence = 0;
  const project = createEmptyProject({ id: "project-1", now });
  project.sources.push(sourceValue);
  const history = new ProjectHistory(project, {
    clock: () => now,
    idGenerator: () => `history-${++sequence}`
  });
  const media = {
    calls: [],
    async execute(request, signal) {
      this.calls.push({ request, signal });
      return mediaExecute ? mediaExecute(request, signal, history) : probeRecord(request, history.current);
    }
  };
  const service = new SourceTechnicalDescriptorApplicationService({
    media,
    history,
    identity,
    idGenerator: () => "descriptor-op"
  });
  return { history, media, identity, service };
}

test("normalizer preserves supported exact evidence and omits heuristic HDR, bit depth, and VFR claims", () => {
  const result = normalizeSourceTechnicalDescriptor({
    basis: "ingest",
    sourceKind: "video",
    probe: probeRecord({ id: "probe", operation: { inputUri: uri }, locale: "pt-BR", mutation: { type: "none" }, actor: { type: "user" } }, createEmptyProject()).record.attempts[0].result.probe,
    identity: { version: 1, content: { sha256: "d".repeat(64), sizeBytes: 8 }, stamp: stamp(), bytesRead: 8 },
    provenance: { engineId: "cevra.media.ffmpeg", engineVersion: "0.3.0", engineApiVersion: 1, engineDisplayName: "CEVRA" }
  });
  assert.equal(result.video.avgFrameRate, "30000/1001");
  assert.equal("rFrameRate" in result.video, false);
  assert.equal(result.video.rotationDegrees, 0);
  assert.equal(result.video.colorPrimaries, "bt2020");
  for (const key of ["bitDepth", "hdr", "hdrFormat", "variableFrameRateSuspected", "dolbyVision"]) {
    assert.equal(JSON.stringify(result).includes(key), false);
  }
  assert.throws(() => normalizeSourceTechnicalDescriptor({
    basis: "ingest",
    sourceKind: "video",
    probe: { uri, hasVideo: true, hasAudio: false, videoCodec: "h264", avgFrameRate: "30.0/1" },
    identity: { version: 1, content: { sha256: "d".repeat(64), sizeBytes: 8 }, stamp: stamp(), bytesRead: 8 },
    provenance: { engineId: "cevra.media.ffmpeg", engineVersion: "0.3.0", engineApiVersion: 1, engineDisplayName: "CEVRA" }
  }));
});

test("post-ingest adoption hashes and probes once, commits one guarded command, and preserves legacy source state", async () => {
  const context = fixture();
  const before = structuredClone(context.history.current.sources[0]);
  const outcome = await context.service.adopt({ sourceId: "source-1", actor: { type: "user", id: "editor" } });
  assert.equal(context.identity.captureCalls, 1);
  assert.equal(context.identity.identifyCalls, 1);
  assert.equal(context.media.calls.length, 1);
  assert.deepEqual(context.media.calls[0].request.operation, { type: "probe", inputUri: "/tmp/source.mov" });
  assert.equal(context.history.entries.length, 1);
  assert.equal(context.history.entries[0].command.type, "source.technicalDescriptor.set");
  assert.equal(outcome.source.technicalDescriptor.basis, "post-ingest");
  assert.equal(outcome.bytesRead, 8);
  assert.equal(outcome.source.checksum, before.checksum);
  assert.deepEqual(outcome.source.extensions, before.extensions);
  assert.equal(outcome.source.uri, before.uri);
});

test("post-ingest no-op creates no second revision or redo mutation", async () => {
  const context = fixture({ sourceValue: source({ technicalDescriptor: descriptor() }) });
  context.history.commit({ type: "project.rename", name: "redo" });
  context.history.undo();
  const before = {
    current: context.history.current,
    entries: context.history.entries,
    snapshots: context.history.snapshots,
    canRedo: context.history.canRedo
  };
  await assert.rejects(
    context.service.adopt({ sourceId: "source-1" }),
    (error) => error instanceof SourceTechnicalDescriptorError && error.code === "SOURCE_DESCRIPTOR_NO_OP"
  );
  assert.deepEqual({
    current: context.history.current,
    entries: context.history.entries,
    snapshots: context.history.snapshots,
    canRedo: context.history.canRedo
  }, before);
  assert.equal(context.history.redo().project.name, "redo");
});

test("post-ingest detects changed content and comparable metadata without mutating ProjectHistory", async () => {
  const changedIdentity = identityPort({
    async identifySource() {
      return { version: 1, content: { sha256: "e".repeat(64), sizeBytes: 8 }, stamp: stamp(), bytesRead: 8 };
    }
  });
  const changed = fixture({ sourceValue: source({ technicalDescriptor: descriptor() }), identity: changedIdentity });
  await assert.rejects(
    changed.service.adopt({ sourceId: "source-1" }),
    (error) => error instanceof SourceTechnicalDescriptorError && error.code === "SOURCE_CONTENT_CHANGED"
  );
  assert.equal(changed.history.entries.length, 0);

  const metadata = fixture({
    mediaExecute: (request, _signal, history) => probeRecord(request, history.current, { width: 1280 })
  });
  await assert.rejects(
    metadata.service.adopt({ sourceId: "source-1" }),
    (error) => error instanceof SourceTechnicalDescriptorError && error.code === "SOURCE_DESCRIPTOR_METADATA_CONFLICT"
  );
  assert.equal(metadata.history.entries.length, 0);
});

test("post-ingest stale guards cover edit plus undo, remove plus add, descriptor replacement, and caller mutation", async () => {
  for (const mutation of ["edit-undo", "remove-add", "descriptor"]) {
    let release;
    const barrier = new Promise((resolve) => { release = resolve; });
    const context = fixture({
      mediaExecute: async (request, _signal, history) => {
        await barrier;
        return probeRecord(request, history.current);
      }
    });
    const request = { id: `operation-${mutation}`, sourceId: "source-1", actor: { type: "user", id: "before" } };
    const pending = context.service.adopt(request);
    request.sourceId = "other";
    request.actor.id = "after";
    if (mutation === "edit-undo") {
      context.history.commit({ type: "project.rename", name: "edited" });
      context.history.undo();
    } else if (mutation === "remove-add") {
      context.history.commit({ type: "source.remove", sourceId: "source-1" });
      context.history.commit({ type: "source.add", source: source() });
    } else {
      context.history.commit({
        type: "source.technicalDescriptor.set",
        sourceId: "source-1",
        expectedSourceUri: uri,
        expectedTechnicalDescriptor: { state: "absent" },
        technicalDescriptor: descriptor()
      });
    }
    release();
    await assert.rejects(
      pending,
      (error) => error instanceof SourceTechnicalDescriptorError && error.code === "SOURCE_DESCRIPTOR_PROJECT_CONFLICT",
      mutation
    );
  }
});

test("post-ingest abort during identity acquisition closes without a commit", async () => {
  const controller = new AbortController();
  const identity = identityPort({
    async identifySource(_uri, _expected, signal) {
      if (signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      await new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
        setImmediate(resolve);
      });
      throw new Error("expected abort");
    }
  });
  const context = fixture({ identity });
  const pending = context.service.adopt({ sourceId: "source-1" }, controller.signal);
  controller.abort();
  await assert.rejects(
    pending,
    (error) => error instanceof MediaApplicationError && error.code === "MEDIA_OPERATION_CANCELLED"
  );
  assert.equal(context.history.entries.length, 0);
});

test("post-ingest abort after the final file recheck is observed before the synchronous commit", async () => {
  const controller = new AbortController();
  const identity = identityPort({
    async checkSource() {
      controller.abort();
      return "match";
    }
  });
  const context = fixture({ identity });
  await assert.rejects(
    context.service.adopt({ sourceId: "source-1" }, controller.signal),
    (error) => error?.name === "AbortError" && error.code === "SOURCE_IDENTITY_CANCELLED"
  );
  assert.equal(context.history.entries.length, 0);
});

test("post-ingest captures getter-backed caller input once before any asynchronous work", async () => {
  const context = fixture();
  let sourceReads = 0;
  let actorReads = 0;
  const request = {
    get sourceId() { sourceReads += 1; return "source-1"; },
    get actor() { actorReads += 1; return { type: "user", id: "captured" }; }
  };
  const outcome = await context.service.adopt(request);
  assert.equal(outcome.source.technicalDescriptor.basis, "post-ingest");
  assert.equal(sourceReads, 1);
  assert.equal(actorReads, 1);
});

test("post-ingest request and actor schemas are closed", async () => {
  for (const request of [
    null,
    undefined,
    [],
    "source-1",
    42,
    {},
    { sourceId: null },
    { sourceId: 42 },
    { sourceId: "source-1", extra: true },
    { sourceId: "source-1", actor: { type: "user", extra: true } },
    { sourceId: "source-1", actor: null },
    { sourceId: "source-1", locale: "fr" },
    { sourceId: "source-1", locale: null },
    { sourceId: "source-1", locale: 42 },
    { sourceId: "source-1", id: "" },
    { sourceId: "source-1", id: null }
  ]) {
    const context = fixture();
    await assert.rejects(
      context.service.adopt(request),
      (error) => error instanceof SourceTechnicalDescriptorError && error.code === "SOURCE_DESCRIPTOR_INVALID_REQUEST"
    );
    assert.equal(context.media.calls.length, 0);
    assert.equal(context.history.entries.length, 0);
  }

  const throwing = fixture();
  const request = {};
  Object.defineProperty(request, "sourceId", { enumerable: true, get() { throw new Error("getter failure"); } });
  await assert.rejects(
    throwing.service.adopt(request),
      (error) => error instanceof SourceTechnicalDescriptorError
      && error.code === "SOURCE_DESCRIPTOR_INVALID_REQUEST"
      && error.locale === "pt-BR"
      && error.operationId === "invalid-source-descriptor"
  );
  assert.equal(throwing.media.calls.length, 0);
  assert.equal(throwing.identity.captureCalls, 0);
  assert.equal(throwing.history.entries.length, 0);
});

test("resolver distinguishes adopted evidence, verifies once per execution, invalidates memo, and fails closed without capability", async () => {
  const identity = identityPort();
  const resolver = new SourceTechnicalDescriptorResolver(identity);
  const value = source({ technicalDescriptor: descriptor() });
  const memo = createSourceContentVerificationMemo(2);
  assert.equal(resolver.adopted(value).status, "adopted-evidence");
  assert.equal(resolver.adopted(source()).status, "absent");
  assert.equal((await resolver.verify(value, memo)).status, "verified");
  assert.equal((await resolver.verify(value, memo)).status, "verified");
  assert.equal(identity.identifyCalls, 1);
  assert.equal(memo.hashCount, 1);
  assert.equal(memo.bytesRead, 8);

  identity.checkSource = async () => "changed";
  assert.equal((await resolver.verify(value, memo)).status, "content-changed");
  assert.equal(await resolver.revalidate(memo), "content-changed");
  assert.equal((await new SourceTechnicalDescriptorResolver().verify(value, createSourceContentVerificationMemo())).status, "method-incompatible");

  const offline = identityPort({ async captureSource() { throw Object.assign(new Error("offline"), { code: "SOURCE_IDENTITY_OFFLINE" }); } });
  assert.equal((await new SourceTechnicalDescriptorResolver(offline).verify(value, createSourceContentVerificationMemo())).status, "offline");
});
