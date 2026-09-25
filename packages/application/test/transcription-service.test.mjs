import assert from "node:assert/strict";
import test from "node:test";

import { CEVRA_ENGINE_API_VERSION } from "@cevra/contracts";
import {
  ProjectCommandError,
  ProjectHistory,
  V1_UNASSIGNED_TRANSCRIPT_EXTENSION,
  computeTranscriptDigest,
  createEmptyProject,
  createSourceTranscript
} from "@cevra/project-ir";
import {
  InMemoryMediaExecutionRepository,
  LocalSourceIngestService,
  MediaApplicationService,
  TranscriptionApplicationError,
  TranscriptionApplicationService
} from "../dist/index.js";

const now = "2026-09-14T18:00:00.000Z";

function source(id = "source-1", kind = "video", overrides = {}) {
  return {
    id,
    kind,
    uri: `file:///media/${id}.mp4`,
    displayName: `${id}.mp4`,
    durationMs: 5_000,
    ...overrides
  };
}

function transcript(text = "olá") {
  return {
    language: "pt",
    words: [{ id: "word-1", text, startMs: 0, endMs: 500 }],
    segments: [{ id: "segment-1", text, startMs: 0, endMs: 500, wordIds: ["word-1"] }]
  };
}

function result(text = "olá", overrides = {}) {
  return {
    transcript: transcript(text),
    detectedLanguage: "pt",
    modelId: "base",
    durationMs: 5_000,
    wordTiming: "model",
    ...overrides
  };
}

function canonicalTranscript(text = "anterior", overrides = {}) {
  return createSourceTranscript({
    sourceId: "source-1",
    wordTiming: "model",
    speakerState: "none",
    transcript: transcript(text),
    provenance: {
      stages: [{
        kind: "transcription",
        executionId: "previous-execution",
        engineId: "test.transcription",
        engineVersion: "1.2.3",
        engineApiVersion: "1",
        modelId: "base",
        createdAt: "2026-09-14T17:00:00.000Z"
      }]
    },
    ...overrides
  });
}

function technicalDescriptor(content = { sha256: "a".repeat(64), sizeBytes: 100 }) {
  return {
    version: 1,
    basis: "ingest",
    content,
    method: {
      profile: "cevra.source-technical.v1",
      engineId: "test.media",
      engineVersion: "1.0.0",
      engineApiVersion: 1
    },
    video: { codec: "h264" },
    audio: { codec: "aac" }
  };
}

class FakeTranscriptionEngine {
  calls = [];
  identityCalls = 0;

  constructor(transcribe, identity = undefined) {
    this.transcribeImpl = transcribe;
    this.identityImpl = identity;
  }

  async identity() {
    this.identityCalls += 1;
    if (this.identityImpl) return this.identityImpl();
    return {
      id: "test.transcription",
      kind: "transcription",
      displayName: "Test Transcription",
      version: "1.2.3",
      apiVersion: CEVRA_ENGINE_API_VERSION
    };
  }

  async healthcheck() { return { status: "ready", checkedAt: now, checks: [] }; }
  async capabilities() { return []; }

  async transcribe(request, context) {
    this.calls.push({ request, context });
    return this.transcribeImpl(request, context);
  }
}

function projectWith(sources = [source()], transcripts = []) {
  const project = createEmptyProject({ id: "project-1", name: "Project", locale: "pt-BR", now });
  project.sources.push(...sources);
  project.sourceTranscripts.push(...transcripts);
  return project;
}

function fixture(engine, project = projectWith(), additions = {}) {
  let historyId = 0;
  const history = new ProjectHistory(project, {
    clock: () => now,
    idGenerator: () => `history-${++historyId}`
  });
  const service = new TranscriptionApplicationService({
    engine,
    history,
    clock: () => now,
    idGenerator: () => "generated-transcription",
    ...additions
  });
  return { service, history };
}

const strongSource = { sha256: "a".repeat(64), sizeBytes: 100 };
const exactExecution = {
  engineId: "test.transcription", engineVersion: "1.2.3", engineApiVersion: 1, workerProtocolVersion: 1,
  modelId: "provider/base", resultModelId: "base", modelRevision: "revision-1", modelArtifactDigest: `sha256:${"b".repeat(64)}`,
  languageDetectionPolicyVersion: "auto-v1", devicePolicy: "cpu", effectiveDevice: "cpu", computeType: "int8",
  task: "transcribe", resultNormalizationVersion: "result-v1", runtimePipelineVersion: "pipeline-v1"
};
class MemoryCache {
  entries = new Map(); reads = 0; writes = 0; invalidations = 0;
  async read(key) { this.reads += 1; return structuredClone(this.entries.get(JSON.stringify(key))); }
  async write(key, value) { this.writes += 1; this.entries.set(JSON.stringify(key), structuredClone(value)); return true; }
  async invalidate(key) { this.invalidations += 1; this.entries.delete(JSON.stringify(key)); }
}
function cacheableEngine(impl = async () => result()) {
  const engine = new FakeTranscriptionEngine(impl);
  engine.describeTranscriptionExecution = async () => structuredClone(exactExecution);
  return engine;
}
function sourceIdentityPort(identify = async () => structuredClone(strongSource), check = async () => "match") {
  return {
    async captureSource(uri) {
      return { version: 1, uri, canonicalPath: uri, device: "1", inode: "2", sizeBytes: 100, mtimeNs: "3", ctimeNs: "4" };
    },
    async identifySource(uri, stamp) {
      const content = await identify();
      return { version: 1, content, stamp: { ...stamp, uri }, bytesRead: content.sizeBytes };
    },
    checkSource: check
  };
}
function cacheOptions(cache, identify = async () => structuredClone(strongSource), check) {
  return { cache, sourceIdentity: sourceIdentityPort(identify, check) };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("first transcription authorizes the canonical source and commits a complete SourceTranscript", async () => {
  const checksum = "sha256:source-content";
  const engineResult = result();
  const engine = new FakeTranscriptionEngine(async () => engineResult);
  const { service, history } = fixture(engine, projectWith([source("source-1", "video", { checksum })]));

  const outcome = await service.transcribeSource({
    sourceId: "source-1",
    id: "transcription-1",
    actor: { type: "agent", id: "editor-agent" }
  });

  assert.equal(engine.identityCalls, 1);
  assert.equal(engine.calls.length, 1);
  assert.deepEqual(engine.calls[0].request, {
    inputUri: "file:///media/source-1.mp4",
    language: "auto",
    wordTimestamps: true
  });
  assert.deepEqual(engine.calls[0].context, { jobId: "transcription-1", locale: "pt-BR" });
  assert.equal(outcome.executionId, "transcription-1");
  assert.equal(outcome.sourceId, "source-1");
  assert.deepEqual(outcome.result, engineResult);
  assert.equal(outcome.sourceTranscript.sourceId, "source-1");
  assert.equal(outcome.sourceTranscript.wordTiming, "model");
  assert.equal(outcome.sourceTranscript.speakerState, "none");
  assert.equal(outcome.sourceTranscript.transcript.language, "pt");
  assert.equal(outcome.sourceTranscript.transcriptDigest, computeTranscriptDigest(outcome.sourceTranscript));
  assert.equal(outcome.sourceTranscript.provenance.sourceChecksum, checksum);
  assert.deepEqual(outcome.sourceTranscript.provenance.stages, [{
    kind: "transcription",
    executionId: "transcription-1",
    engineId: "test.transcription",
    engineVersion: "1.2.3",
    engineApiVersion: "1",
    modelId: "base",
    createdAt: now
  }]);
  assert.equal(outcome.project.history.revision, 1);
  assert.deepEqual(outcome.sourceTranscript, outcome.project.sourceTranscripts[0]);
  assert.deepEqual(outcome.sourceTranscript, history.current.sourceTranscripts[0]);
  assert.equal(history.entries.length, 1);
  assert.equal(history.entries[0].command.type, "transcript.set");
  assert.deepEqual(history.entries[0].actor, { type: "agent", id: "editor-agent" });

  engineResult.transcript.words[0].text = "mutated engine result";
  assert.equal(history.current.sourceTranscripts[0].transcript.words[0].text, "olá");
  outcome.result.transcript.words[0].text = "mutated outcome result";
  assert.equal(outcome.sourceTranscript.transcript.words[0].text, "olá");
  assert.equal(history.current.sourceTranscripts[0].transcript.words[0].text, "olá");
});

test("no-speech transcription normalizes model metadata to canonical none timing", async () => {
  const engine = new FakeTranscriptionEngine(async () => ({
    transcript: { words: [], segments: [] },
    modelId: "base",
    wordTiming: "model"
  }));
  const { service, history } = fixture(engine);

  const outcome = await service.transcribeSource({ sourceId: "source-1" });

  assert.equal(outcome.executionId, "generated-transcription");
  assert.equal(outcome.sourceTranscript.wordTiming, "none");
  assert.equal(outcome.sourceTranscript.speakerState, "none");
  assert.deepEqual(outcome.sourceTranscript.transcript, { words: [], segments: [] });
  assert.equal(Object.hasOwn(outcome.sourceTranscript.provenance, "sourceChecksum"), false);
  assert.equal(history.current.history.revision, 1);
  assert.deepEqual(history.entries[0].actor, { type: "user" });
});

test("retranscription uses the captured digest and undo redo cross the replacement", async () => {
  const previous = canonicalTranscript();
  const engine = new FakeTranscriptionEngine(async () => result("novo"));
  const { service, history } = fixture(engine, projectWith([source()], [previous]));

  const outcome = await service.transcribeSource({ sourceId: "source-1", id: "retranscription" });

  assert.notEqual(outcome.sourceTranscript.transcriptDigest, previous.transcriptDigest);
  assert.equal(history.entries[0].command.type, "transcript.set");
  assert.equal(history.entries[0].command.expectedCurrentTranscriptDigest, previous.transcriptDigest);
  assert.equal(history.current.history.revision, 1);
  assert.deepEqual(history.undo().sourceTranscripts, [previous]);
  assert.deepEqual(history.redo().sourceTranscripts, [outcome.sourceTranscript]);
});

test("same-semantic retranscription journals new provenance without changing digest identity", async () => {
  const previous = canonicalTranscript("igual");
  const engine = new FakeTranscriptionEngine(async () => result("igual"));
  const { service, history } = fixture(engine, projectWith([source()], [previous]));

  const outcome = await service.transcribeSource({ sourceId: "source-1", id: "new-execution" });

  assert.equal(outcome.sourceTranscript.transcriptDigest, previous.transcriptDigest);
  assert.notDeepEqual(outcome.sourceTranscript.provenance, previous.provenance);
  assert.equal(outcome.sourceTranscript.provenance.stages[0].executionId, "new-execution");
  assert.equal(history.current.history.revision, 1);
  assert.equal(history.entries.length, 1);
});

test("an exact command no-op maps to a stable commit failure without history mutation", async () => {
  const current = canonicalTranscript("igual", {
    provenance: { stages: [{
      kind: "transcription",
      executionId: "same-execution",
      engineId: "test.transcription",
      engineVersion: "1.2.3",
      engineApiVersion: "1",
      modelId: "base",
      createdAt: now
    }] }
  });
  const engine = new FakeTranscriptionEngine(async () => result("igual"));
  const { service, history } = fixture(engine, projectWith([source()], [current]));

  await assert.rejects(
    service.transcribeSource({ sourceId: "source-1", id: "same-execution" }),
    (error) => error instanceof TranscriptionApplicationError
      && error.code === "TRANSCRIPTION_APP_COMMIT_FAILED"
      && error.cause instanceof ProjectCommandError
      && error.cause.code === "PROJECT_TRANSCRIPT_NO_OP"
  );
  assert.equal(history.current.history.revision, 0);
  assert.equal(history.entries.length, 0);
  assert.deepEqual(history.current.sourceTranscripts, [current]);
});

test("command concurrency and generic commit failures map to stable application boundaries", async () => {
  const cases = [
    [new ProjectCommandError("PROJECT_TRANSCRIPT_STALE", "stale command"), "TRANSCRIPTION_APP_PROJECT_CONFLICT"],
    [new Error("journal storage failed"), "TRANSCRIPTION_APP_COMMIT_FAILED"]
  ];

  for (const [cause, code] of cases) {
    const engine = new FakeTranscriptionEngine(async () => result());
    const { service, history } = fixture(engine);
    history.commit = () => { throw cause; };

    await assert.rejects(
      service.transcribeSource({ sourceId: "source-1" }),
      (error) => error instanceof TranscriptionApplicationError
        && error.code === code
        && error.cause === cause
    );
    assert.equal(history.current.history.revision, 0);
    assert.deepEqual(history.current.sourceTranscripts, []);
  }
});

test("a concurrent project change wins and prevents candidate promotion", async () => {
  const pending = deferred();
  let started;
  const didStart = new Promise((resolve) => { started = resolve; });
  const engine = new FakeTranscriptionEngine(async () => {
    started();
    return pending.promise;
  });
  const { service, history } = fixture(engine);
  const transcription = service.transcribeSource({ sourceId: "source-1", id: "concurrent" });
  await didStart;
  history.commit({ type: "project.rename", name: "Concurrent edit" });
  pending.resolve(result());

  await assert.rejects(transcription, (error) => error instanceof TranscriptionApplicationError
    && error.code === "TRANSCRIPTION_APP_PROJECT_CONFLICT");
  assert.equal(history.current.project.name, "Concurrent edit");
  assert.deepEqual(history.current.sourceTranscripts, []);
  assert.equal(history.current.history.revision, 1);
  assert.equal(history.entries.length, 1);
});

test("source removal during transcription remains canonical and prevents promotion", async () => {
  const pending = deferred();
  let started;
  const didStart = new Promise((resolve) => { started = resolve; });
  const engine = new FakeTranscriptionEngine(async () => {
    started();
    return pending.promise;
  });
  const { service, history } = fixture(engine);
  const transcription = service.transcribeSource({ sourceId: "source-1", id: "removed-source" });
  await didStart;
  history.commit({ type: "source.remove", sourceId: "source-1" });
  pending.resolve(result());

  await assert.rejects(transcription, (error) => error instanceof TranscriptionApplicationError
    && error.code === "TRANSCRIPTION_APP_PROJECT_CONFLICT");
  assert.deepEqual(history.current.sources, []);
  assert.deepEqual(history.current.sourceTranscripts, []);
  assert.equal(history.current.history.revision, 1);
});

test("invalid, unknown, ineligible and URI-injecting requests never reach the engine", async () => {
  const cases = [
    [{ sourceId: " " }, projectWith(), "TRANSCRIPTION_APP_INVALID_REQUEST"],
    [{ sourceId: "missing" }, projectWith(), "TRANSCRIPTION_APP_SOURCE_UNKNOWN"],
    [{ sourceId: "image" }, projectWith([source("image", "image")]), "TRANSCRIPTION_APP_SOURCE_INELIGIBLE"],
    [{ sourceId: "source-1", inputUri: "file:///attacker.mp4" }, projectWith(), "TRANSCRIPTION_APP_INVALID_REQUEST"],
    [{ sourceId: "source-1", cachePolicy: "forever" }, projectWith(), "TRANSCRIPTION_APP_INVALID_REQUEST"]
  ];

  for (const [request, project, code] of cases) {
    const engine = new FakeTranscriptionEngine(async () => assert.fail("invalid source must not be transcribed"));
    const { service, history } = fixture(engine, project);
    await assert.rejects(service.transcribeSource(request), (error) => error instanceof TranscriptionApplicationError && error.code === code);
    assert.equal(engine.identityCalls, 0, code);
    assert.equal(engine.calls.length, 0, code);
    assert.equal(history.current.history.revision, 0, code);
  }
});

test("words require model timing metadata and no invalid timing value is inferred", async () => {
  const invalidResults = [
    (() => { const value = result(); delete value.wordTiming; return value; })(),
    result("olá", { wordTiming: "none" }),
    result("olá", { wordTiming: "aligned" })
  ];

  for (const invalidResult of invalidResults) {
    const engine = new FakeTranscriptionEngine(async () => invalidResult);
    const { service, history } = fixture(engine);
    await assert.rejects(service.transcribeSource({ sourceId: "source-1" }), (error) => error instanceof TranscriptionApplicationError
      && error.code === "TRANSCRIPTION_APP_RESULT_INVALID");
    assert.equal(history.current.history.revision, 0);
    assert.deepEqual(history.current.sourceTranscripts, []);
  }
});

test("canonical validation rejects negative zero before any JSON normalization", async () => {
  const invalidResults = [
    result("word-negative-zero", { transcript: {
      language: "pt",
      words: [{ id: "word-1", text: "word-negative-zero", startMs: -0, endMs: 500 }],
      segments: [{ id: "segment-1", text: "word-negative-zero", startMs: 0, endMs: 500, wordIds: ["word-1"] }]
    } }),
    result("segment-negative-zero", { transcript: {
      language: "pt",
      words: [{ id: "word-1", text: "segment-negative-zero", startMs: 0, endMs: 500 }],
      segments: [{ id: "segment-1", text: "segment-negative-zero", startMs: -0, endMs: 500, wordIds: ["word-1"] }]
    } })
  ];

  for (const invalidResult of invalidResults) {
    const engine = new FakeTranscriptionEngine(async () => invalidResult);
    const { service, history } = fixture(engine);
    await assert.rejects(service.transcribeSource({ sourceId: "source-1" }), (error) => error instanceof TranscriptionApplicationError
      && error.code === "TRANSCRIPTION_APP_RESULT_INVALID");
    assert.equal(Object.is(invalidResult.transcript.words[0].startMs, -0)
      || Object.is(invalidResult.transcript.segments[0].startMs, -0), true);
    assert.equal(history.current.history.revision, 0);
    assert.equal(history.entries.length, 0);
    assert.deepEqual(history.current.sourceTranscripts, []);
  }
});

test("language accepts only supported runtime string literals without coercion", async () => {
  for (const language of ["auto", "pt", "en"]) {
    const engine = new FakeTranscriptionEngine(async () => result());
    const { service } = fixture(engine);
    await service.transcribeSource({ sourceId: "source-1", language });
    assert.equal(engine.calls[0].request.language, language);
  }

  let coercionCalls = 0;
  const invalidLanguages = [
    "es",
    { toString() { coercionCalls += 1; return "pt"; } }
  ];
  for (const language of invalidLanguages) {
    const engine = new FakeTranscriptionEngine(async () => assert.fail("invalid language must not be transcribed"));
    const { service, history } = fixture(engine);
    await assert.rejects(
      service.transcribeSource({ sourceId: "source-1", language }),
      (error) => error instanceof TranscriptionApplicationError && error.code === "TRANSCRIPTION_APP_INVALID_REQUEST"
    );
    assert.equal(engine.identityCalls, 0);
    assert.equal(engine.calls.length, 0);
    assert.equal(history.current.history.revision, 0);
    assert.equal(history.entries.length, 0);
  }
  assert.equal(coercionCalls, 0);
});

test("malformed transcript timing, references and source duration fail closed", async () => {
  const invalidResults = [
    result("timing", { transcript: {
      language: "pt",
      words: [{ id: "word-1", text: "timing", startMs: 0, endMs: 0 }],
      segments: [{ id: "segment-1", text: "timing", startMs: 0, endMs: 500, wordIds: ["word-1"] }]
    } }),
    result("reference", { transcript: {
      language: "pt",
      words: [{ id: "word-1", text: "reference", startMs: 0, endMs: 500 }],
      segments: [{ id: "segment-1", text: "reference", startMs: 0, endMs: 500, wordIds: ["missing"] }]
    } }),
    result("duration", { transcript: {
      language: "pt",
      words: [{ id: "word-1", text: "duration", startMs: 0, endMs: 1_000 }],
      segments: [{ id: "segment-1", text: "duration", startMs: 0, endMs: 1_000, wordIds: ["word-1"] }]
    } })
  ];

  for (const invalidResult of invalidResults) {
    const engine = new FakeTranscriptionEngine(async () => invalidResult);
    const { service, history } = fixture(engine, projectWith([source("source-1", "video", { durationMs: 500 })]));
    await assert.rejects(service.transcribeSource({ sourceId: "source-1" }), (error) => error instanceof TranscriptionApplicationError
      && error.code === "TRANSCRIPTION_APP_RESULT_INVALID");
    assert.equal(history.current.history.revision, 0);
    assert.deepEqual(history.current.sourceTranscripts, []);
  }
});

test("cancellation before or during transcription never mutates Project IR", async () => {
  const beforeEngine = new FakeTranscriptionEngine(async () => assert.fail("pre-aborted request must not run"));
  const before = fixture(beforeEngine);
  const preAborted = new AbortController();
  preAborted.abort(new Error("cancel before start"));
  await assert.rejects(
    before.service.transcribeSource({ sourceId: "source-1" }, preAborted.signal),
    (error) => error instanceof TranscriptionApplicationError
      && error.code === "TRANSCRIPTION_APP_CANCELLED"
      && error.message === "A operação de transcrição foi cancelada."
  );
  assert.equal(beforeEngine.identityCalls, 0);
  assert.equal(beforeEngine.calls.length, 0);
  assert.equal(before.history.current.history.revision, 0);

  let started;
  const didStart = new Promise((resolve) => { started = resolve; });
  const duringEngine = new FakeTranscriptionEngine(async (_request, context) => {
    started();
    return new Promise((_resolve, reject) => context.signal.addEventListener("abort", () => {
      const error = new Error("engine cancelled");
      error.name = "AbortError";
      reject(error);
    }, { once: true }));
  });
  const during = fixture(duringEngine);
  const controller = new AbortController();
  const operation = during.service.transcribeSource({ sourceId: "source-1" }, controller.signal);
  await didStart;
  controller.abort();
  await assert.rejects(operation, (error) => error instanceof TranscriptionApplicationError
    && error.code === "TRANSCRIPTION_APP_CANCELLED");
  assert.equal(duringEngine.calls[0].context.signal, controller.signal);
  assert.equal(during.history.current.history.revision, 0);
});

test("engine failures and malformed identities expose only application errors with causes", async () => {
  const technical = new Error("private faster-whisper detail");
  const failingEngine = new FakeTranscriptionEngine(async () => { throw technical; });
  const failing = fixture(failingEngine);
  await assert.rejects(
    failing.service.transcribeSource({ sourceId: "source-1", locale: "en-US" }),
    (error) => error instanceof TranscriptionApplicationError
      && error.code === "TRANSCRIPTION_APP_ENGINE_FAILED"
      && error.message === "The transcription engine could not complete the operation."
      && error.cause === technical
  );
  assert.equal(failing.history.current.history.revision, 0);

  const malformedIdentity = new FakeTranscriptionEngine(
    async () => assert.fail("malformed identity must stop before transcription"),
    async () => ({ id: "", kind: "media", version: "", apiVersion: 999 })
  );
  const malformed = fixture(malformedIdentity);
  await assert.rejects(
    malformed.service.transcribeSource({ sourceId: "source-1" }),
    (error) => error instanceof TranscriptionApplicationError && error.code === "TRANSCRIPTION_APP_ENGINE_FAILED"
  );
  assert.equal(malformedIdentity.calls.length, 0);
  assert.equal(malformed.history.current.history.revision, 0);
});

test("explicit transcription coexists with immutable historical migration quarantine", async () => {
  const evidence = {
    schemaVersion: 1,
    originalSchemaVersion: 1,
    reason: "no-eligible-source",
    payload: { language: "pt", words: [], segments: [], legacyEvidence: { retain: true } },
    eligibleSourceIdsAtMigration: []
  };
  const project = projectWith();
  project.extensions[V1_UNASSIGNED_TRANSCRIPT_EXTENSION] = structuredClone(evidence);
  const engine = new FakeTranscriptionEngine(async () => result());
  const { service, history } = fixture(engine, project);

  const outcome = await service.transcribeSource({ sourceId: "source-1", id: "explicit-transcription" });

  assert.equal(outcome.project.sourceTranscripts.length, 1);
  assert.deepStrictEqual(outcome.project.extensions[V1_UNASSIGNED_TRANSCRIPT_EXTENSION], evidence);
  assert.deepStrictEqual(history.current.extensions[V1_UNASSIGNED_TRANSCRIPT_EXTENSION], evidence);
});

test("real application services integrate ingest to canonical transcription with undo and redo", async () => {
  let historyId = 0;
  const history = new ProjectHistory(
    createEmptyProject({ id: "vertical-project", name: "Vertical", locale: "pt-BR", now }),
    { clock: () => now, idGenerator: () => `vertical-history-${++historyId}` }
  );
  const originalUri = "file:///Users/editor/Original.mov";
  const mediaEngine = {
    async identity() {
      return { id: "test.media", kind: "media", displayName: "Test Media", version: "1.0.0", apiVersion: CEVRA_ENGINE_API_VERSION };
    },
    async healthcheck() { return { status: "ready", checkedAt: now, checks: [] }; },
    async capabilities() { return []; },
    async execute(operation) {
      assert.deepEqual(operation, { type: "probe", inputUri: "/Users/editor/Original.mov" });
      return {
        type: "probe",
        probe: {
          uri: originalUri,
          durationMs: 5_000,
          width: 1920,
          height: 1080,
          frameRate: 30,
          hasVideo: true,
          hasAudio: true,
          videoCodec: "h264",
          audioCodec: "aac"
        }
      };
    }
  };
  const artifacts = {
    async kind() { return "missing"; },
    async exists() { return false; },
    async remove() {}
  };
  const media = new MediaApplicationService({
    engine: mediaEngine,
    history,
    executions: new InMemoryMediaExecutionRepository(),
    artifacts,
    clock: () => now,
    idGenerator: () => "unused-media-id"
  });
  const generatedIngestIds = ["ingested-source", "probe-execution"];
  const ingest = new LocalSourceIngestService({
    media,
    history,
    idGenerator: () => generatedIngestIds.shift() ?? "unexpected-ingest-id"
  });
  const transcriptionEngine = new FakeTranscriptionEngine(async () => result("vertical"));
  const transcriptionService = new TranscriptionApplicationService({
    engine: transcriptionEngine,
    history,
    clock: () => now,
    idGenerator: () => "vertical-transcription"
  });

  const ingested = await ingest.ingest({ uri: originalUri, displayName: "Original.mov" });
  const transcribed = await transcriptionService.transcribeSource({ sourceId: ingested.source.id });

  assert.equal(history.current.sources.length, 1);
  assert.equal(history.current.sourceTranscripts.length, 1);
  assert.equal(history.current.sources[0].uri, originalUri);
  assert.equal(history.current.sourceTranscripts[0].sourceId, "ingested-source");
  assert.equal(transcriptionEngine.calls[0].request.inputUri, originalUri);
  assert.equal(history.current.history.revision, 2);
  assert.deepEqual(history.entries.map((entry) => entry.command.type), ["source.add", "transcript.set"]);
  const withoutTranscript = history.undo();
  assert.equal(withoutTranscript.sources.length, 1);
  assert.deepEqual(withoutTranscript.sourceTranscripts, []);
  assert.deepEqual(history.redo().sourceTranscripts, [transcribed.sourceTranscript]);
});

test("transcription cache MISS writes and the next identical request HIT bypasses the engine", async () => {
  const cache = new MemoryCache();
  const firstEngine = cacheableEngine();
  const first = fixture(firstEngine, projectWith(), cacheOptions(cache));
  const generated = await first.service.transcribeSource({ sourceId: "source-1", id: "fresh" });
  assert.equal(generated.cacheStatus, "miss");
  assert.equal(firstEngine.calls.length, 1);
  assert.equal(cache.writes, 1);

  const secondEngine = cacheableEngine(async () => assert.fail("cache hit must bypass engine"));
  const second = fixture(secondEngine, projectWith([source("other-source")]), cacheOptions(cache));
  const reused = await second.service.transcribeSource({ sourceId: "other-source", id: "request-two" });
  assert.equal(reused.cacheStatus, "hit");
  assert.equal(secondEngine.calls.length, 0);
  assert.equal(reused.sourceTranscript.sourceId, "other-source");
  assert.equal(reused.sourceTranscript.provenance.stages[0].executionId, "fresh");
  assert.equal(reused.sourceTranscript.provenance.stages[0].createdAt, now);
  assert.equal(reused.sourceTranscript.provenance.stages[0].modelRevision, "revision-1");
  assert.equal(reused.sourceTranscript.provenance.stages[0].modelDigest, exactExecution.modelArtifactDigest);
});

test("descriptor-bearing cache HIT performs one full hash plus an operational recheck", async () => {
  const cache = new MemoryCache();
  await fixture(cacheableEngine(), projectWith(), cacheOptions(cache)).service.transcribeSource({ sourceId: "source-1", id: "descriptor-producer" });
  let hashCount = 0;
  let recheckCount = 0;
  const port = sourceIdentityPort(
    async () => { hashCount += 1; return structuredClone(strongSource); },
    async () => { recheckCount += 1; return "match"; }
  );
  const engine = cacheableEngine(async () => assert.fail("descriptor-bearing hit must bypass engine"));
  const descriptorSource = source("source-1", "video", { technicalDescriptor: technicalDescriptor() });
  const outcome = await fixture(engine, projectWith([descriptorSource]), { cache, sourceIdentity: port }).service.transcribeSource({ sourceId: "source-1", id: "descriptor-consumer" });
  assert.equal(outcome.cacheStatus, "hit");
  assert.equal(hashCount, 1);
  assert.equal(recheckCount, 1);
  assert.equal(engine.calls.length, 0);
});

test("descriptor mismatch and a changed HIT stamp fail closed without cache promotion", async () => {
  const mismatchCache = new MemoryCache();
  const mismatchEngine = cacheableEngine(async () => assert.fail("descriptor mismatch must not transcribe"));
  const mismatched = source("source-1", "video", {
    technicalDescriptor: technicalDescriptor({ sha256: "c".repeat(64), sizeBytes: 100 })
  });
  const mismatch = fixture(mismatchEngine, projectWith([mismatched]), cacheOptions(mismatchCache));
  await assert.rejects(mismatch.service.transcribeSource({ sourceId: "source-1" }), (error) => error.code === "TRANSCRIPTION_APP_PROJECT_CONFLICT");
  assert.equal(mismatchEngine.calls.length, 0);
  assert.equal(mismatch.history.current.history.revision, 0);

  const hitCache = new MemoryCache();
  await fixture(cacheableEngine(), projectWith(), cacheOptions(hitCache)).service.transcribeSource({ sourceId: "source-1", id: "stamp-producer" });
  const hitEngine = cacheableEngine(async () => assert.fail("changed hit must not transcribe"));
  const changed = fixture(hitEngine, projectWith(), cacheOptions(hitCache, undefined, async () => "changed"));
  await assert.rejects(changed.service.transcribeSource({ sourceId: "source-1" }), (error) => error.code === "TRANSCRIPTION_APP_PROJECT_CONFLICT");
  assert.equal(hitEngine.calls.length, 0);
  assert.equal(changed.history.current.history.revision, 0);
});

test("descriptor-bearing transcription fails closed when strong source proof is unavailable", async () => {
  const engine = cacheableEngine(async () => assert.fail("unverified descriptor source must not transcribe"));
  const descriptorSource = source("source-1", "video", { technicalDescriptor: technicalDescriptor() });
  const sourceIdentity = sourceIdentityPort();
  sourceIdentity.captureSource = async () => { throw Object.assign(new Error("unsupported"), { code: "SOURCE_IDENTITY_UNSUPPORTED" }); };
  const active = fixture(engine, projectWith([descriptorSource]), { cache: new MemoryCache(), sourceIdentity });
  await assert.rejects(active.service.transcribeSource({ sourceId: "source-1" }), (error) => error.code === "TRANSCRIPTION_APP_PROJECT_CONFLICT");
  assert.equal(engine.calls.length, 0);
  assert.equal(active.history.current.history.revision, 0);
});

test("fresh transcription timestamps the produced result and cache HIT preserves that producer time", async () => {
  const cache = new MemoryCache();
  const producedAt = "2026-09-15T12:01:00.000Z";
  let phase = "lookup";
  let freshClockCalls = 0;
  const engine = cacheableEngine(async () => {
    assert.equal(freshClockCalls, 0, "producer clock must not run before engine completion");
    phase = "produced";
    return result();
  });
  const fresh = fixture(engine, projectWith(), {
    ...cacheOptions(cache),
    clock: () => { freshClockCalls++; assert.equal(phase, "produced"); return producedAt; }
  });
  const generated = await fresh.service.transcribeSource({ sourceId: "source-1", id: "original-producer" });
  assert.equal(freshClockCalls, 1);
  assert.equal(generated.sourceTranscript.provenance.stages[0].createdAt, producedAt);

  let hitClockCalls = 0;
  const hit = fixture(cacheableEngine(async () => assert.fail("cache hit must bypass engine")), projectWith([source("other-source")]), {
    ...cacheOptions(cache),
    clock: () => { hitClockCalls++; throw new Error("consumer clock must not replace cached producer time"); }
  });
  const reused = await hit.service.transcribeSource({ sourceId: "other-source", id: "consumer" });
  assert.equal(hitClockCalls, 0);
  assert.equal(reused.sourceTranscript.provenance.stages[0].createdAt, producedAt);
  assert.equal(reused.sourceTranscript.provenance.stages[0].executionId, "original-producer");
});

test("transcription refresh executes and bypass neither reads nor writes", async () => {
  const cache = new MemoryCache();
  const refreshEngine = cacheableEngine();
  const refresh = fixture(refreshEngine, projectWith(), cacheOptions(cache));
  assert.equal((await refresh.service.transcribeSource({ sourceId: "source-1", cachePolicy: "refresh" })).cacheStatus, "refresh");
  assert.equal(cache.reads, 0); assert.equal(cache.writes, 1); assert.equal(refreshEngine.calls.length, 1);
  const bypassEngine = cacheableEngine();
  const bypass = fixture(bypassEngine, projectWith(), cacheOptions(cache));
  assert.equal((await bypass.service.transcribeSource({ sourceId: "source-1", cachePolicy: "bypass" })).cacheStatus, "bypass");
  assert.equal(cache.reads, 0); assert.equal(cache.writes, 1); assert.equal(bypassEngine.calls.length, 1);
});

test("same semantic cache hit is idempotent and preserves richer canonical provenance", async () => {
  const existing = canonicalTranscript("olá");
  const cache = new MemoryCache();
  const seeding = fixture(cacheableEngine(), projectWith(), cacheOptions(cache));
  await seeding.service.transcribeSource({ sourceId: "source-1", id: "original-producer" });
  const engine = cacheableEngine(async () => assert.fail("must hit"));
  const { service, history } = fixture(engine, projectWith([source()], [existing]), cacheOptions(cache));
  const outcome = await service.transcribeSource({ sourceId: "source-1" });
  assert.equal(outcome.cacheStatus, "hit"); assert.equal(outcome.historyMutated, false);
  assert.equal(history.current.history.revision, 0);
  assert.deepEqual(outcome.sourceTranscript.provenance, existing.provenance);
});

test("idempotent cache HIT preserves the existing redo branch", async () => {
  const existing = canonicalTranscript("olá");
  const cache = new MemoryCache();
  await fixture(cacheableEngine(), projectWith(), cacheOptions(cache)).service.transcribeSource({ sourceId: "source-1", id: "redo-producer" });
  const active = fixture(
    cacheableEngine(async () => assert.fail("cache hit must bypass engine")),
    projectWith([source()], [existing]),
    cacheOptions(cache)
  );
  active.history.commit({ type: "source.add", source: source("redo-only") });
  active.history.undo();
  assert.equal(active.history.canRedo, true);
  const revision = active.history.current.history.revision;
  const journalCount = active.history.entries.length;
  const outcome = await active.service.transcribeSource({ sourceId: "source-1", id: "redo-consumer" });
  assert.equal(outcome.historyMutated, false);
  assert.equal(active.history.current.history.revision, revision);
  assert.equal(active.history.entries.length, journalCount);
  assert.equal(active.history.canRedo, true);
});

test("transcription snapshots cache policy and caller fields before its first await", async () => {
  const cache = new MemoryCache();
  await fixture(cacheableEngine(), projectWith(), cacheOptions(cache)).service.transcribeSource({ sourceId: "source-1", id: "snapshot-producer" });
  const gate = deferred();
  const started = deferred();
  const engine = cacheableEngine(async () => assert.fail("captured prefer policy must hit cache"));
  engine.identity = async () => { started.resolve(); await gate.promise; return FakeTranscriptionEngine.prototype.identity.call(engine); };
  const active = fixture(engine, projectWith(), cacheOptions(cache));
  let policyReads = 0;
  const request = {
    sourceId: "source-1",
    id: "snapshot-consumer",
    get cachePolicy() { policyReads += 1; return policyReads === 1 ? "prefer" : "bypass"; },
    actor: { type: "user" }
  };
  const pending = active.service.transcribeSource(request);
  await started.promise;
  request.sourceId = "missing";
  request.id = "mutated";
  request.actor = { type: "agent", id: "mutated" };
  gate.resolve();
  const outcome = await pending;
  assert.equal(outcome.cacheStatus, "hit");
  assert.equal(outcome.sourceId, "source-1");
  assert.equal(policyReads, 1);
});

test("invalid cached payload is evicted and fresh validation path executes", async () => {
  const cache = new MemoryCache();
  const seedEngine = cacheableEngine();
  const seed = fixture(seedEngine, projectWith(), cacheOptions(cache));
  await seed.service.transcribeSource({ sourceId: "source-1" });
  const [cacheKey] = cache.entries.keys();
  cache.entries.set(cacheKey, { producerExecutionId: "poison", producedAt: now, payload: { modelId: "base" } });
  const engine = cacheableEngine();
  const outcome = await fixture(engine, projectWith(), cacheOptions(cache)).service.transcribeSource({ sourceId: "source-1" });
  assert.equal(outcome.cacheStatus, "miss"); assert.equal(engine.calls.length, 1); assert.equal(cache.invalidations, 1);
});

test("cache unavailability and write failure never block a valid transcription", async () => {
  const cache = { async read() { throw new Error("unavailable"); }, async write() { throw new Error("denied"); }, async invalidate() {} };
  const engine = cacheableEngine();
  const outcome = await fixture(engine, projectWith(), cacheOptions(cache)).service.transcribeSource({ sourceId: "source-1" });
  assert.equal(outcome.cacheStatus, "miss"); assert.equal(outcome.historyMutated, true); assert.equal(engine.calls.length, 1);
});

test("source or execution identity change during fresh transcription blocks cache and promotion", async () => {
  for (const mode of ["source", "model"]) {
    const cache = new MemoryCache(); let calls = 0;
    const engine = cacheableEngine();
    if (mode === "model") engine.describeTranscriptionExecution = async () => ({ ...exactExecution, modelRevision: ++calls === 1 ? "revision-1" : "revision-2" });
    const identify = async () => ({ ...strongSource, sha256: (mode === "source" && ++calls > 1 ? "c" : "a").repeat(64) });
    const { service, history } = fixture(engine, projectWith(), cacheOptions(cache, identify));
    await assert.rejects(service.transcribeSource({ sourceId: "source-1" }), (error) => error.code === "TRANSCRIPTION_APP_PROJECT_CONFLICT");
    assert.equal(history.current.history.revision, 0); assert.equal(cache.writes, 0);
  }
});

test("weak/unprovable identity bypasses cache without weakening transcription", async () => {
  const cache = new MemoryCache(); const engine = cacheableEngine();
  const outcome = await fixture(engine, projectWith(), cacheOptions(cache, async () => undefined)).service.transcribeSource({ sourceId: "source-1" });
  assert.equal(outcome.cacheStatus, "bypass"); assert.equal(engine.calls.length, 1); assert.equal(cache.reads, 0); assert.equal(cache.writes, 0);
});

test("unresolved automatic execution profile bypasses cache while fresh transcription remains functional", async () => {
  const cache = new MemoryCache();
  const engine = cacheableEngine();
  engine.describeTranscriptionExecution = async () => undefined;
  const outcome = await fixture(engine, projectWith(), cacheOptions(cache)).service.transcribeSource({ sourceId: "source-1" });
  assert.equal(outcome.cacheStatus, "bypass");
  assert.equal(outcome.historyMutated, true);
  assert.equal(engine.calls.length, 1);
  assert.equal(cache.reads, 0);
  assert.equal(cache.writes, 0);
});

test("a canonical project change during cache lookup still blocks cached promotion", async () => {
  const cache = new MemoryCache();
  await fixture(cacheableEngine(), projectWith(), cacheOptions(cache)).service.transcribeSource({ sourceId: "source-1", id: "cached-producer" });
  const engine = cacheableEngine(async () => assert.fail("valid cache data must bypass the engine"));
  const active = fixture(engine, projectWith(), cacheOptions(cache));
  const read = cache.read.bind(cache);
  cache.read = async (cacheKey) => {
    active.history.commit({ type: "source.add", source: source("concurrent-source") });
    return read(cacheKey);
  };
  await assert.rejects(active.service.transcribeSource({ sourceId: "source-1" }), (error) => error.code === "TRANSCRIPTION_APP_PROJECT_CONFLICT");
  assert.equal(engine.calls.length, 0);
  assert.equal(active.history.current.sourceTranscripts.length, 0);
  assert.equal(active.history.current.history.revision, 1);
});
