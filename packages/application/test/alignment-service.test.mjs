import assert from "node:assert/strict";
import test from "node:test";

import { CEVRA_ENGINE_API_VERSION } from "@cevra/contracts";
import { ProjectHistory, computeTranscriptDigest, createEmptyProject, createSourceTranscript } from "@cevra/project-ir";
import { AlignmentApplicationError, AlignmentApplicationService } from "../dist/index.js";

const now = "2026-09-15T12:00:00.000Z";
function transcript(language = "pt", speaker = false) {
  return {
    language,
    words: [
      { id: "w1", text: "olá", startMs: 20, endMs: 300, confidence: 0.8, ...(speaker ? { speakerId: "spk1" } : {}) },
      { id: "w2", text: "mundo", startMs: 320, endMs: 700, confidence: 0.9, ...(speaker ? { speakerId: "spk1" } : {}) }
    ],
    segments: [{ id: "s1", text: "olá mundo", startMs: 20, endMs: 700, wordIds: ["w1", "w2"], ...(speaker ? { speakerId: "spk1" } : {}) }]
  };
}
function canonical(language = "pt", speaker = false) {
  const base = createSourceTranscript({
    sourceId: "source-1", wordTiming: "model", speakerState: speaker ? "complete" : "none", transcript: transcript(language, speaker),
    provenance: { sourceChecksum: "sha256:media", stages: [
      { kind: "transcription", executionId: "tx", engineId: "test.tx", engineVersion: "1", engineApiVersion: "1", modelId: "base", createdAt: now },
      ...(speaker ? [{ kind: "speaker-attribution", executionId: "spk", engineId: "test.speaker", engineVersion: "1", engineApiVersion: "1", modelId: "speaker", inputTranscriptDigest: computeTranscriptDigest({ transcript: transcript(language), wordTiming: "model", speakerState: "none" }), createdAt: now }] : [])
    ] }
  });
  return base;
}
function project(options = {}) {
  const value = createEmptyProject({ id: "project-1", now, locale: "pt-BR" });
  value.sources.push({ id: "source-1", kind: options.kind ?? "video", uri: "/media/input.mp4", displayName: "input.mp4", durationMs: 2_000, checksum: "sha256:media" });
  if (!options.missing) value.sourceTranscripts.push(canonical(options.language ?? "pt", options.speaker ?? false));
  return value;
}
function aligned(from = transcript()) {
  return {
    transcript: {
      ...structuredClone(from),
      words: from.words.map((word, index) => ({ ...word, startMs: 100 + index * 500, endMs: 400 + index * 500 })),
      segments: from.segments.map((segment) => ({ ...segment, startMs: 100, endMs: 900 }))
    },
    modelId: "model/pt", modelRevision: "revision", modelDigest: "sha256:model", durationMs: 2_000
  };
}
class Engine {
  calls = [];
  constructor(impl = async (request) => aligned(request.transcript), identity = {}) { this.impl = impl; this.identityValue = identity; }
  async identity() { return { id: "test.alignment", kind: "alignment", displayName: "Test", version: "1.0.0", apiVersion: CEVRA_ENGINE_API_VERSION, ...this.identityValue }; }
  async healthcheck() { return { status: "ready", checkedAt: now, checks: [] }; }
  async capabilities() { return []; }
  async align(request, context) { this.calls.push({ request, context }); return this.impl(request, context); }
}
function setup(options = {}) {
  let n = 0;
  const history = new ProjectHistory(options.project ?? project(), { clock: () => now, idGenerator: () => `h-${++n}` });
  const media = options.media ?? { async execute(operation) { return { type: "file", outputUri: operation.outputUri, probe: { uri: operation.outputUri, hasVideo: false, hasAudio: true }, effectiveProfile: { container: "wav", audioCodec: "pcm", audioOnly: true } }; }, async identity() {}, async healthcheck() {}, async capabilities() {} };
  const releases = [];
  const audioWorkspace = options.audioWorkspace ?? { async acquire() { return { outputUri: "/tmp/cevra-alignment/audio.wav", async release() { releases.push(true); } }; } };
  const engine = options.engine ?? new Engine();
  const service = new AlignmentApplicationService({ engine, media, audioWorkspace, history, clock: () => now, idGenerator: () => "alignment-1", ...(options.additions ?? {}) });
  return { service, history, engine, releases, media };
}
const alignmentSourceIdentity = { algorithm: "sha256", digest: `sha256:${"a".repeat(64)}`, byteLength: 500 };
const alignmentExecutionIdentity = {
  engineId: "test.alignment", engineVersion: "1.0.0", engineApiVersion: 1, workerProtocolVersion: 1,
  modelId: "model/pt", modelRevision: "revision", modelDigest: "sha256:model", device: "cpu",
  pipelineVersion: "ctc-v1", requiredSampleRate: 16000, maximumWindowMs: 30000,
  maximumTokensPerWindow: 1024, wildcardAlgorithmVersion: "wildcard-v1", resultValidationVersion: "alignment-result-v1"
};
class AlignmentMemoryCache {
  entries = new Map(); reads = 0; writes = 0; invalidations = 0;
  async read(key) { this.reads++; return structuredClone(this.entries.get(JSON.stringify(key))); }
  async write(key, value) { this.writes++; this.entries.set(JSON.stringify(key), structuredClone(value)); return true; }
  async invalidate(key) { this.invalidations++; this.entries.delete(JSON.stringify(key)); }
}
function cacheableAlignmentEngine(impl) {
  const engine = new Engine(impl);
  engine.describeAlignmentExecution = async () => structuredClone(alignmentExecutionIdentity);
  return engine;
}
function cacheableMedia(counter) {
  return {
    async identity() { return { id: "test.media", kind: "media", displayName: "Media", version: "1.0.0", apiVersion: 1 }; },
    async healthcheck() { return { status: "ready", checkedAt: now, checks: [] }; }, async capabilities() { return []; },
    async execute(operation) { counter.calls++; return { type: "file", outputUri: operation.outputUri }; }
  };
}
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

test("successful alignment promotes one canonical SourceTranscript through history", async () => {
  const { service, history, engine, releases } = setup();
  const before = history.current.sourceTranscripts[0];
  const outcome = await service.alignSource({ sourceId: "source-1", actor: { type: "agent", id: "aligner" } });
  assert.equal(outcome.sourceTranscript.wordTiming, "aligned");
  assert.equal(outcome.sourceTranscript.provenance.stages.at(-1).kind, "alignment");
  assert.equal(outcome.sourceTranscript.provenance.stages.at(-1).inputTranscriptDigest, before.transcriptDigest);
  assert.equal(outcome.sourceTranscript.transcriptDigest, computeTranscriptDigest(outcome.sourceTranscript));
  assert.deepEqual(outcome.sourceTranscript.transcript.words.map(({ id, text }) => ({ id, text })), before.transcript.words.map(({ id, text }) => ({ id, text })));
  assert.deepEqual(outcome.sourceTranscript.transcript.segments.map(({ id, text, wordIds }) => ({ id, text, wordIds })), before.transcript.segments.map(({ id, text, wordIds }) => ({ id, text, wordIds })));
  assert.equal(outcome.sourceTranscript.provenance.sourceChecksum, "sha256:media");
  assert.equal(outcome.sourceTranscript.provenance.stages[0].kind, "transcription");
  assert.equal(history.entries[0].command.expectedCurrentTranscriptDigest, before.transcriptDigest);
  assert.deepEqual(history.undo().sourceTranscripts, [before]);
  assert.deepEqual(history.redo().sourceTranscripts, [outcome.sourceTranscript]);
  assert.equal(engine.calls[0].request.inputUri, "/tmp/cevra-alignment/audio.wav");
  assert.equal(releases.length, 1);
});

test("alignment preserves speaker assignments and appends provenance without rewriting history", async () => {
  const current = canonical("pt", true);
  const { service } = setup({ project: project({ speaker: true }), engine: new Engine(async () => aligned(current.transcript)) });
  const outcome = await service.alignSource({ sourceId: "source-1" });
  assert.equal(outcome.sourceTranscript.speakerState, "complete");
  assert.equal(outcome.sourceTranscript.transcript.words[0].speakerId, "spk1");
  assert.deepEqual(outcome.sourceTranscript.provenance.stages.map((stage) => stage.kind), ["transcription", "speaker-attribution", "alignment"]);
  assert.deepEqual(outcome.sourceTranscript.provenance.stages.slice(0, -1), current.provenance.stages);
  assert.equal(outcome.sourceTranscript.provenance.stages.at(-1).inputTranscriptDigest, current.transcriptDigest);
});

test("alignment remains the newest consuming stage after manual and speaker provenance", async () => {
  for (const kinds of [["manual-correction"], ["speaker-attribution", "manual-correction"]]) {
    const withSpeaker = kinds.includes("speaker-attribution");
    const initial = canonical("pt", withSpeaker);
    const stages = structuredClone(initial.provenance.stages);
    stages.push({ kind: "manual-correction", executionId: `manual-${kinds.length}`, inputTranscriptDigest: initial.transcriptDigest, createdAt: now });
    const current = createSourceTranscript({ ...initial, provenance: { sourceChecksum: "sha256:media", stages } });
    const value = project({ speaker: withSpeaker }); value.sourceTranscripts[0] = current;
    const { service } = setup({ project: value, engine: new Engine(async () => aligned(current.transcript)) });
    const outcome = await service.alignSource({ sourceId: "source-1" });
    assert.deepEqual(outcome.sourceTranscript.provenance.stages.slice(0, -1), current.provenance.stages);
    assert.equal(outcome.sourceTranscript.provenance.stages.at(-1).kind, "alignment");
    assert.equal(outcome.sourceTranscript.provenance.stages.at(-1).inputTranscriptDigest, current.transcriptDigest);
  }
});

test("audio is prepared through typed extract-audio and cleaned", async () => {
  const operations = [];
  const media = { async execute(operation, context) { operations.push({ operation, context }); return { type: "file", outputUri: operation.outputUri, probe: { uri: operation.outputUri, hasVideo: false, hasAudio: true }, effectiveProfile: { container: "wav", audioCodec: "pcm", audioOnly: true } }; } };
  const { service, releases } = setup({ media });
  await service.alignSource({ sourceId: "source-1", id: "job" });
  assert.deepEqual(operations[0].operation, { type: "extract-audio", inputUri: "/media/input.mp4", outputUri: "/tmp/cevra-alignment/audio.wav", audioCodec: "pcm" });
  assert.equal(releases.length, 1);
});

test("temporary audio cleanup failure is bounded, retried, and prevents promotion", async () => {
  let attempts = 0;
  const audioWorkspace = { async acquire() { return { outputUri: "/tmp/cevra-alignment/audio.wav", async release() { attempts += 1; throw new Error("raw rm /private/path"); } }; } };
  const { service, history } = setup({ audioWorkspace });
  await assert.rejects(service.alignSource({ sourceId: "source-1" }), (error) => error.code === "ALIGNMENT_APP_AUDIO_CLEANUP_FAILED" && !error.message.includes("private"));
  assert.equal(attempts, 2);
  assert.equal(history.entries.length, 0);
  assert.equal(history.current.sourceTranscripts[0].wordTiming, "model");
});

test("cleanup failure takes bounded precedence over engine failure and cancellation", async () => {
  const cancelled = new AbortController();
  for (const { engine, controller } of [
    { engine: new Engine(async () => { throw new Error("raw engine /secret"); }) },
    { controller: cancelled, engine: new Engine(() => { cancelled.abort(); throw Object.assign(new Error("aborted"), { name: "AbortError" }); }) }
  ]) {
    let attempts = 0;
    const audioWorkspace = { async acquire() { return { outputUri: "/tmp/cevra-alignment/audio.wav", async release() { attempts += 1; throw new Error("raw rm /private/path"); } }; } };
    const { service, history } = setup({ engine, audioWorkspace });
    await assert.rejects(service.alignSource({ sourceId: "source-1" }, controller?.signal), (error) => error.code === "ALIGNMENT_APP_AUDIO_CLEANUP_FAILED" && !error.message.includes("private"));
    assert.equal(attempts, 2);
    assert.equal(history.entries.length, 0);
  }
});

test("stale transcript replacement prevents promotion", async () => {
  const pending = deferred(); const engine = new Engine(() => pending.promise); const { service, history } = setup({ engine });
  const run = service.alignSource({ sourceId: "source-1" }); await new Promise(setImmediate);
  const replacement = createSourceTranscript({ ...canonical(), transcript: transcript("en"), provenance: { sourceChecksum: "sha256:media", stages: [{ kind: "transcription", executionId: "new", engineId: "tx", engineVersion: "1", engineApiVersion: "1", modelId: "base", createdAt: now }] } });
  history.commit({ type: "transcript.set", transcript: replacement, expectedCurrentTranscriptDigest: history.current.sourceTranscripts[0].transcriptDigest });
  pending.resolve(aligned(transcript()));
  await assert.rejects(run, (error) => error instanceof AlignmentApplicationError && error.code === "ALIGNMENT_APP_PROJECT_CONFLICT");
  assert.equal(history.current.history.revision, 1);
});

test("source removal while alignment runs remains canonical", async () => {
  const pending = deferred(); const { service, history } = setup({ engine: new Engine(() => pending.promise) });
  const run = service.alignSource({ sourceId: "source-1" }); await new Promise(setImmediate); history.commit({ type: "source.remove", sourceId: "source-1" }); pending.resolve(aligned());
  await assert.rejects(run, (error) => error.code === "ALIGNMENT_APP_PROJECT_CONFLICT");
  assert.equal(history.current.sources.length, 0); assert.equal(history.entries.length, 1);
});

test("transcript removal while alignment runs prevents stale candidate promotion", async () => {
  const pending = deferred(); const { service, history } = setup({ engine: new Engine(() => pending.promise) }); const digest = history.current.sourceTranscripts[0].transcriptDigest;
  const run = service.alignSource({ sourceId: "source-1" }); await new Promise(setImmediate); history.commit({ type: "transcript.remove", sourceId: "source-1", expectedTranscriptDigest: digest }); pending.resolve(aligned());
  await assert.rejects(run, (error) => error.code === "ALIGNMENT_APP_PROJECT_CONFLICT"); assert.equal(history.current.sourceTranscripts.length, 0); assert.equal(history.entries.length, 1);
});

test("cancellation before launch has no mutation or worker call", async () => {
  const controller = new AbortController(); controller.abort(); const { service, history, engine } = setup();
  await assert.rejects(service.alignSource({ sourceId: "source-1" }, controller.signal), (error) => error.code === "ALIGNMENT_APP_CANCELLED");
  assert.equal(engine.calls.length, 0); assert.equal(history.entries.length, 0);
});

test("cancellation during worker has no mutation and cleans audio", async () => {
  const controller = new AbortController(); const { service, history, releases } = setup({ engine: new Engine((_r, context) => new Promise((_resolve, reject) => context.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true }))) });
  const run = service.alignSource({ sourceId: "source-1" }, controller.signal); await new Promise(setImmediate); controller.abort();
  await assert.rejects(run, (error) => error.code === "ALIGNMENT_APP_CANCELLED"); assert.equal(history.entries.length, 0); assert.equal(releases.length, 1);
});

test("cancellation during audio preparation and after worker result leaves no candidate state", async () => {
  const during = new AbortController();
  const media = { async execute(_operation, context) { return new Promise((_resolve, reject) => context.signal.addEventListener("abort", () => reject(Object.assign(new Error("abort"), { name: "AbortError" })), { once: true })); } };
  const first = setup({ media }); const run = first.service.alignSource({ sourceId: "source-1" }, during.signal); await new Promise(setImmediate); during.abort();
  await assert.rejects(run, (error) => error.code === "ALIGNMENT_APP_CANCELLED"); assert.equal(first.history.entries.length, 0); assert.equal(first.releases.length, 1);

  const after = new AbortController(); const second = setup({ engine: new Engine(async (request) => { after.abort(); return aligned(request.transcript); }) });
  await assert.rejects(second.service.alignSource({ sourceId: "source-1" }, after.signal), (error) => error.code === "ALIGNMENT_APP_CANCELLED"); assert.equal(second.history.entries.length, 0); assert.equal(second.releases.length, 1);
});

test("missing, ineligible, unsupported, empty and already aligned inputs fail before execution", async () => {
  const cases = [
    [project({ missing: true }), "ALIGNMENT_APP_TRANSCRIPT_MISSING"],
    [project({ kind: "image", missing: true }), "ALIGNMENT_APP_SOURCE_INELIGIBLE"],
    [project({ language: "es" }), "ALIGNMENT_APP_LANGUAGE_UNSUPPORTED"]
  ];
  const emptyProject = project(); emptyProject.sourceTranscripts[0] = createSourceTranscript({ sourceId: "source-1", wordTiming: "none", speakerState: "none", transcript: { language: "pt", words: [], segments: [] }, provenance: { sourceChecksum: "sha256:media", stages: [{ kind: "transcription", executionId: "tx", engineId: "tx", engineVersion: "1", engineApiVersion: "1", modelId: "base", createdAt: now }] } }); cases.push([emptyProject, "ALIGNMENT_APP_TRANSCRIPT_NOT_ALIGNABLE"]);
  const alignedProject = project(); alignedProject.sourceTranscripts[0] = createSourceTranscript({ ...canonical(), wordTiming: "aligned", provenance: { sourceChecksum: "sha256:media", stages: [...canonical().provenance.stages, { kind: "alignment", executionId: "old", engineId: "align", engineVersion: "1", engineApiVersion: "1", modelId: "m", inputTranscriptDigest: canonical().transcriptDigest, createdAt: now }] } }); cases.push([alignedProject, "ALIGNMENT_APP_TRANSCRIPT_NOT_ALIGNABLE"]);
  for (const [value, code] of cases) { const { service, history, engine } = setup({ project: value }); await assert.rejects(service.alignSource({ sourceId: "source-1" }), (error) => error.code === code); assert.equal(history.entries.length, 0); assert.equal(engine.calls.length, 0); }
});

test("unknown source and invalid request fail closed", async () => {
  for (const [request, code] of [[{ sourceId: "missing" }, "ALIGNMENT_APP_SOURCE_UNKNOWN"], [{ sourceId: "source-1", inputUri: "/attacker" }, "ALIGNMENT_APP_INVALID_REQUEST"]]) { const { service, history } = setup(); await assert.rejects(service.alignSource(request), (error) => error.code === code); assert.equal(history.entries.length, 0); }
});

test("malformed or partial engine candidates never mutate history", async () => {
  const invalid = [
    { ...aligned(), extra: true },
    { ...aligned(), transcript: { ...aligned().transcript, words: aligned().transcript.words.slice(0, 1) } },
    { ...aligned(), transcript: { ...aligned().transcript, words: aligned().transcript.words.map((w, i) => i ? w : { ...w, text: "changed" }) } },
    { ...aligned(), transcript: { ...aligned().transcript, words: aligned().transcript.words.map((w, i) => i ? w : { ...w, startMs: -0 }) } },
    { ...aligned(), transcript: { ...aligned().transcript, words: aligned().transcript.words.map((w, i) => i ? w : { ...w, endMs: 3_000 }) } }
  ];
  for (const value of invalid) { const { service, history } = setup({ engine: new Engine(async () => value) }); await assert.rejects(service.alignSource({ sourceId: "source-1" }), (error) => error.code === "ALIGNMENT_APP_RESULT_INVALID"); assert.equal(history.entries.length, 0); }
});

test("Alignment V1 rejects word and segment crossings without canonical mutation", async () => {
  const overlapWords = aligned();
  overlapWords.transcript.words[1] = { ...overlapWords.transcript.words[1], startMs: 300, endMs: 700 };
  overlapWords.transcript.segments[0] = { ...overlapWords.transcript.segments[0], startMs: 100, endMs: 700 };
  const first = setup({ engine: new Engine(async () => overlapWords) });
  await assert.rejects(first.service.alignSource({ sourceId: "source-1" }), (error) => error.code === "ALIGNMENT_APP_RESULT_INVALID");
  assert.equal(first.history.entries.length, 0);

  const currentTranscript = {
    language: "pt",
    words: [
      { id: "w1", text: "um", startMs: 0, endMs: 300 },
      { id: "w2", text: "dois", startMs: 500, endMs: 800 }
    ],
    segments: [
      { id: "s1", text: "um", startMs: 0, endMs: 300, wordIds: ["w1"] },
      { id: "s2", text: "dois", startMs: 500, endMs: 800, wordIds: ["w2"] }
    ]
  };
  const current = createSourceTranscript({ sourceId: "source-1", wordTiming: "model", speakerState: "none", transcript: currentTranscript, provenance: { sourceChecksum: "sha256:media", stages: [{ kind: "transcription", executionId: "tx", engineId: "tx", engineVersion: "1", engineApiVersion: "1", modelId: "base", createdAt: now }] } });
  const value = project(); value.sourceTranscripts[0] = current;
  const crossing = aligned(currentTranscript);
  crossing.transcript.words = [
    { ...crossing.transcript.words[0], startMs: 600, endMs: 800 },
    { ...crossing.transcript.words[1], startMs: 100, endMs: 300 }
  ];
  crossing.transcript.segments = [
    { ...crossing.transcript.segments[0], startMs: 600, endMs: 800 },
    { ...crossing.transcript.segments[1], startMs: 100, endMs: 300 }
  ];
  const second = setup({ project: value, engine: new Engine(async () => crossing) });
  await assert.rejects(second.service.alignSource({ sourceId: "source-1" }), (error) => error.code === "ALIGNMENT_APP_RESULT_INVALID");
  assert.equal(second.history.entries.length, 0);
});

test("engine identity mismatch and media failure map to bounded errors", async () => {
  const wrong = setup({ engine: new Engine(undefined, { kind: "transcription" }) });
  await assert.rejects(wrong.service.alignSource({ sourceId: "source-1" }), (error) => error.code === "ALIGNMENT_APP_ENGINE_FAILED");
  const failed = setup({ media: { async execute() { throw new Error("raw media error"); } } });
  await assert.rejects(failed.service.alignSource({ sourceId: "source-1" }), (error) => error.code === "ALIGNMENT_APP_AUDIO_PREPARATION_FAILED" && !error.message.includes("raw"));
  const engineFailed = setup({ engine: new Engine(async () => { throw new Error("python traceback /secret/path"); }) });
  await assert.rejects(engineFailed.service.alignSource({ sourceId: "source-1" }), (error) => error.code === "ALIGNMENT_APP_ENGINE_FAILED" && !error.message.includes("secret"));
  assert.equal(engineFailed.history.entries.length, 0);
});

test("alignment cache MISS writes and HIT bypasses PCM extraction and alignment engine", async () => {
  const cache = new AlignmentMemoryCache(); const mediaCalls = { calls: 0 };
  const firstEngine = cacheableAlignmentEngine(async (request) => aligned(request.transcript));
  const first = setup({ engine: firstEngine, media: cacheableMedia(mediaCalls), additions: { cache, sourceIdentity: { identify: async () => structuredClone(alignmentSourceIdentity) } } });
  const generated = await first.service.alignSource({ sourceId: "source-1", id: "producer" });
  assert.equal(generated.cacheStatus, "miss"); assert.equal(mediaCalls.calls, 1); assert.equal(firstEngine.calls.length, 1); assert.equal(cache.writes, 1);

  const hitMedia = { calls: 0 };
  const hitEngine = cacheableAlignmentEngine(async () => assert.fail("cache hit must not align"));
  const second = setup({ engine: hitEngine, media: cacheableMedia(hitMedia), additions: { cache, sourceIdentity: { identify: async () => structuredClone(alignmentSourceIdentity) } } });
  const reused = await second.service.alignSource({ sourceId: "source-1", id: "consumer" });
  assert.equal(reused.cacheStatus, "hit"); assert.equal(hitMedia.calls, 0); assert.equal(hitEngine.calls.length, 0);
  assert.equal(reused.sourceTranscript.provenance.stages.at(-1).executionId, "producer");
  assert.equal(reused.sourceTranscript.provenance.stages.at(-1).createdAt, now);
});

test("alignment cache write failure still promotes and corrupt payload falls back to fresh execution", async () => {
  const denied = { async read() { return undefined; }, async write() { throw new Error("denied"); }, async invalidate() {} };
  const sourceIdentity = { identify: async () => structuredClone(alignmentSourceIdentity) };
  const promoted = setup({ engine: cacheableAlignmentEngine(async (request) => aligned(request.transcript)), media: cacheableMedia({ calls: 0 }), additions: { cache: denied, sourceIdentity } });
  assert.equal((await promoted.service.alignSource({ sourceId: "source-1" })).historyMutated, true);

  const cache = new AlignmentMemoryCache(); const keySeed = setup({ engine: cacheableAlignmentEngine(async (request) => aligned(request.transcript)), media: cacheableMedia({ calls: 0 }), additions: { cache, sourceIdentity } });
  await keySeed.service.alignSource({ sourceId: "source-1" });
  const [key] = cache.entries.keys(); cache.entries.set(key, { producerExecutionId: "bad", producedAt: now, payload: { modelId: "model/pt" } });
  const engine = cacheableAlignmentEngine(async (request) => aligned(request.transcript));
  const fallback = setup({ engine, media: cacheableMedia({ calls: 0 }), additions: { cache, sourceIdentity } });
  assert.equal((await fallback.service.alignSource({ sourceId: "source-1" })).cacheStatus, "miss");
  assert.equal(engine.calls.length, 1); assert.equal(cache.invalidations, 1);
});

test("source change during fresh alignment prevents cache and canonical promotion", async () => {
  const cache = new AlignmentMemoryCache(); let hashes = 0;
  const sourceIdentity = { identify: async () => ({ ...alignmentSourceIdentity, digest: `sha256:${(++hashes === 1 ? "a" : "c").repeat(64)}` }) };
  const fixture = setup({ engine: cacheableAlignmentEngine(async (request) => aligned(request.transcript)), media: cacheableMedia({ calls: 0 }), additions: { cache, sourceIdentity } });
  await assert.rejects(fixture.service.alignSource({ sourceId: "source-1" }), (error) => error.code === "ALIGNMENT_APP_PROJECT_CONFLICT");
  assert.equal(fixture.history.current.history.revision, 0); assert.equal(cache.writes, 0);
});

test("cached alignment still rejects a transcript replaced during lookup", async () => {
  const cache = new AlignmentMemoryCache();
  const sourceIdentity = { identify: async () => structuredClone(alignmentSourceIdentity) };
  const seed = setup({ engine: cacheableAlignmentEngine(async (request) => aligned(request.transcript)), media: cacheableMedia({ calls: 0 }), additions: { cache, sourceIdentity } });
  await seed.service.alignSource({ sourceId: "source-1", id: "cached-aligner" });

  const engine = cacheableAlignmentEngine(async () => assert.fail("cache hit must not run alignment"));
  const active = setup({ engine, media: cacheableMedia({ calls: 0 }), additions: { cache, sourceIdentity } });
  const read = cache.read.bind(cache);
  cache.read = async (cacheKey) => {
    const previous = active.history.current.sourceTranscripts[0];
    const replacement = createSourceTranscript({
      ...canonical(),
      transcript: transcript("en"),
      provenance: { sourceChecksum: "sha256:media", stages: [{ kind: "transcription", executionId: "replacement", engineId: "test.tx", engineVersion: "1", engineApiVersion: "1", modelId: "base", createdAt: now }] }
    });
    active.history.commit({ type: "transcript.set", transcript: replacement, expectedCurrentTranscriptDigest: previous.transcriptDigest });
    return read(cacheKey);
  };
  await assert.rejects(active.service.alignSource({ sourceId: "source-1" }), (error) => error.code === "ALIGNMENT_APP_PROJECT_CONFLICT");
  assert.equal(engine.calls.length, 0);
  assert.equal(active.history.current.sourceTranscripts[0].transcript.language, "en");
  assert.equal(active.history.current.history.revision, 1);
});
