import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  CURRENT_SCHEMA_VERSION,
  PROJECT_IR_SCHEMA_VERSION_V1,
  ProjectHistory,
  V1_UNASSIGNED_TRANSCRIPT_EXTENSION,
  computeTranscriptDigest,
  createEmptyProject,
  createSourceTranscript,
  migrateProject,
  serializeTranscriptDigestInput,
  validateProjectIR,
  validateProjectIRv1
} from "../dist/index.js";

const fixedTime = "2026-09-11T18:00:00.000Z";
const dummyDigest = `sha256-v1:${"0".repeat(64)}`;

function v1Project(overrides = {}) {
  return {
    schemaVersion: 1,
    project: { id: "project-1", name: "Legacy", createdAt: fixedTime, updatedAt: fixedTime, defaultLocale: "pt-BR" },
    sources: [],
    transcript: { words: [], segments: [] },
    timeline: { durationMs: 0, tracks: [], clips: [] },
    captions: [], graphics: [], layouts: [], audio: { masterGainDb: 0 }, style: {}, generation: [],
    history: { revision: 0 }, qa: [], exports: [], extensions: {},
    ...overrides
  };
}

function source(id = "source-1", kind = "video", overrides = {}) {
  return { id, kind, uri: `file:///${id}.mp4`, displayName: id, durationMs: 10_000, ...overrides };
}

function transcriptionStage(overrides = {}) {
  return {
    kind: "transcription",
    executionId: "execution-1",
    engineId: "engine-1",
    engineVersion: "1.0.0",
    engineApiVersion: "1",
    modelId: "model-1",
    createdAt: fixedTime,
    ...overrides
  };
}

function wordTranscript(overrides = {}) {
  return {
    language: "pt",
    words: [{ id: "w1", text: "ação", startMs: 0, endMs: 500 }],
    segments: [{ id: "s1", text: "ação", startMs: 0, endMs: 500, wordIds: ["w1"] }],
    ...overrides
  };
}

function sourceTranscript(overrides = {}) {
  const input = {
    sourceId: "source-1",
    wordTiming: "model",
    speakerState: "none",
    transcript: wordTranscript(),
    provenance: { stages: [transcriptionStage()] },
    ...overrides
  };
  return createSourceTranscript(input);
}

function v2ProjectWith(transcript, sourceValue = source()) {
  const project = createEmptyProject({ id: "project-1", now: fixedTime });
  project.sources.push(sourceValue);
  project.sourceTranscripts.push(transcript);
  return project;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function quarantine(project) {
  return project.extensions[V1_UNASSIGNED_TRANSCRIPT_EXTENSION];
}

test("factory creates schema v2 with source-scoped transcripts and no legacy transcript", () => {
  const project = createEmptyProject({ id: "project-1", locale: "pt-BR", now: fixedTime });
  assert.equal(CURRENT_SCHEMA_VERSION, 2);
  assert.equal(PROJECT_IR_SCHEMA_VERSION_V1, 1);
  assert.equal(project.schemaVersion, 2);
  assert.deepEqual(project.sourceTranscripts, []);
  assert.equal(Object.hasOwn(project, "transcript"), false);
  assert.equal(validateProjectIR(project).ok, true);
});

test("TranscriptState public shape remains usable as the nested payload", () => {
  const transcript = wordTranscript();
  const aggregate = sourceTranscript({ transcript });
  assert.strictEqual(aggregate.transcript, transcript);
  assert.deepEqual(aggregate.transcript.words.map(({ id }) => id), ["w1"]);
});

test("imported SHA-256 primitive passes official vectors and Node/Web Crypto cross-checks", async () => {
  const vectors = [["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"], ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"]];
  for (const [input, expected] of vectors) {
    const bytes = new TextEncoder().encode(input);
    assert.equal(Buffer.from(sha256(bytes)).toString("hex"), expected);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected);
    assert.equal(Buffer.from(await webcrypto.subtle.digest("SHA-256", bytes)).toString("hex"), expected);
  }
});

test("digest freezes empty and PT-BR compatibility vectors", () => {
  const empty = { transcript: { words: [], segments: [] }, wordTiming: "none", speakerState: "none" };
  assert.equal(serializeTranscriptDigestInput(empty), '{"version":1,"language":null,"wordTiming":"none","speakerState":"none","words":[],"segments":[]}');
  assert.equal(computeTranscriptDigest(empty), "sha256-v1:d06d7f6c29c7b410c9629378f02f8a783fb18080c00603842e2e298bcd1b557a");

  const pt = { transcript: wordTranscript(), wordTiming: "model", speakerState: "none" };
  assert.equal(serializeTranscriptDigestInput(pt), '{"version":1,"language":"pt","wordTiming":"model","speakerState":"none","words":[["w1","ação",0,500,null]],"segments":[["s1","ação",0,500,["w1"],null]]}');
  assert.equal(computeTranscriptDigest(pt), "sha256-v1:a5baceec7680861ed2ceb3eac117c9e2c8e6ddc804c5f0f01b2035e9d869597f");
});

test("digest freezes four-byte Unicode and exact JSON escaping", () => {
  const fourByte = {
    transcript: { language: "en", words: [{ id: "w😀", text: "😀", startMs: 1, endMs: 2 }], segments: [{ id: "s😀", text: "😀", startMs: 1, endMs: 2, wordIds: ["w😀"] }] },
    wordTiming: "model", speakerState: "none"
  };
  assert.equal(computeTranscriptDigest(fourByte), "sha256-v1:44c990286db8950d45409f858e4c26e60545fcd4bb60fde857a114c293640f09");

  const escaping = {
    transcript: { language: "en", words: [{ id: 'w"\\', text: "\b\t\n\f\r\u0000\u001f/\u2028\u2029", startMs: 0, endMs: 1 }], segments: [{ id: "s1", text: '"\\', startMs: 0, endMs: 1, wordIds: ['w"\\'] }] },
    wordTiming: "model", speakerState: "none"
  };
  assert.equal(computeTranscriptDigest(escaping), "sha256-v1:d52c3b787cc06a99993624e4328e57d6c33b9ba00c2406e9a243a5ffb50bdff0");
  const canonical = serializeTranscriptDigestInput(escaping);
  assert.ok(canonical.includes("\\b\\t\\n\\f\\r\\u0000\\u001f/"));
  assert.ok(canonical.includes(String.fromCodePoint(0x2028, 0x2029)));
});

test("digest changes for every semantic dimension and preserves ordering", () => {
  const base = { transcript: { language: "en", words: [{ id: "w1", text: "one", startMs: 0, endMs: 10 }, { id: "w2", text: "two", startMs: 10, endMs: 20 }], segments: [{ id: "s1", text: "one two", startMs: 0, endMs: 20, wordIds: ["w1", "w2"] }] }, wordTiming: "model", speakerState: "none" };
  const baseDigest = computeTranscriptDigest(base);
  const variants = [
    { ...clone(base), transcript: { ...clone(base.transcript), language: "pt" } },
    { ...clone(base), wordTiming: "aligned" },
    { ...clone(base), speakerState: "partial" },
    { ...clone(base), transcript: { ...clone(base.transcript), words: [clone(base.transcript.words[1]), clone(base.transcript.words[0])] } },
    { ...clone(base), transcript: { ...clone(base.transcript), segments: [{ ...clone(base.transcript.segments[0]), wordIds: ["w2", "w1"] }] } },
    { ...clone(base), transcript: { ...clone(base.transcript), words: [{ ...clone(base.transcript.words[0]), id: "renamed" }, clone(base.transcript.words[1])] } },
    { ...clone(base), transcript: { ...clone(base.transcript), words: [{ ...clone(base.transcript.words[0]), text: "ONE" }, clone(base.transcript.words[1])] } },
    { ...clone(base), transcript: { ...clone(base.transcript), words: [{ ...clone(base.transcript.words[0]), startMs: 1 }, clone(base.transcript.words[1])] } },
    { ...clone(base), transcript: { ...clone(base.transcript), words: [{ ...clone(base.transcript.words[0]), endMs: 9 }, clone(base.transcript.words[1])] } },
    { ...clone(base), transcript: { ...clone(base.transcript), words: [{ ...clone(base.transcript.words[0]), speakerId: "speaker" }, clone(base.transcript.words[1])] } },
    { ...clone(base), transcript: { ...clone(base.transcript), segments: [{ ...clone(base.transcript.segments[0]), id: "s2" }] } },
    { ...clone(base), transcript: { ...clone(base.transcript), segments: [{ ...clone(base.transcript.segments[0]), text: "changed" }] } },
    { ...clone(base), transcript: { ...clone(base.transcript), segments: [{ ...clone(base.transcript.segments[0]), startMs: 1 }] } },
    { ...clone(base), transcript: { ...clone(base.transcript), segments: [{ ...clone(base.transcript.segments[0]), endMs: 19 }] } },
    { ...clone(base), transcript: { ...clone(base.transcript), segments: [{ ...clone(base.transcript.segments[0]), speakerId: "speaker" }] } }
  ];
  for (const variant of variants) assert.notEqual(computeTranscriptDigest(variant), baseDigest);

  const twoSegments = { transcript: { language: "en", words: [], segments: [{ id: "s1", text: "one", startMs: 0, endMs: 10, wordIds: [] }, { id: "s2", text: "two", startMs: 10, endMs: 20, wordIds: [] }] }, wordTiming: "none", speakerState: "none" };
  assert.notEqual(computeTranscriptDigest(twoSegments), computeTranscriptDigest({ ...twoSegments, transcript: { ...twoSegments.transcript, segments: [...twoSegments.transcript.segments].reverse() } }));
});

test("digest preserves Unicode normalization distinctions", () => {
  const composed = { transcript: wordTranscript({ language: "é" }), wordTiming: "model", speakerState: "none" };
  const decomposed = { transcript: wordTranscript({ language: "e\u0301" }), wordTiming: "model", speakerState: "none" };
  assert.notEqual(computeTranscriptDigest(composed), computeTranscriptDigest(decomposed));
});

test("digest excludes confidence, source ownership, provenance, and extensions", () => {
  const base = sourceTranscript();
  const confidence = sourceTranscript({ transcript: wordTranscript({ words: [{ id: "w1", text: "ação", startMs: 0, endMs: 500, confidence: 0.01 }] }) });
  const metadata = sourceTranscript({ sourceId: "other-source", provenance: { stages: [transcriptionStage({ executionId: "other" })] }, extensions: { vendor: true } });
  assert.equal(confidence.transcriptDigest, base.transcriptDigest);
  assert.equal(metadata.transcriptDigest, base.transcriptDigest);
});

test("digest rejects unpaired surrogates and invalid integer time encodings", () => {
  assert.throws(() => computeTranscriptDigest({ transcript: wordTranscript({ language: "\ud800" }), wordTiming: "model", speakerState: "none" }), /unpaired surrogate/);
  for (const startMs of [-0, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity]) {
    assert.throws(() => computeTranscriptDigest({ transcript: wordTranscript({ words: [{ id: "w1", text: "x", startMs, endMs: 2 }] }), wordTiming: "model", speakerState: "none" }), /safe integer/);
  }
});

test("historical v1 validator accepts exactly its under-validated transcript behavior", () => {
  const project = v1Project({ transcript: {
    language: 42,
    extraTranscriptField: { retained: true },
    words: [{ id: "w1", text: "hello", startMs: 0, endMs: 250, confidence: 0.5, speakerId: { legacy: true }, extraWordField: ["retained"] }],
    segments: [{ id: "s1", text: "hello", startMs: 0, endMs: 250, wordIds: ["w1", "w1"], speakerId: 7, extraSegmentField: null }]
  }});
  assert.equal(validateProjectIRv1(project).ok, true);
  assert.equal(validateProjectIR(project).ok, true);
});

test("historical v1 validator still rejects invalid confidence, unknown references, and duplicate IDs", () => {
  const invalidConfidence = v1Project({ transcript: { words: [{ id: "w1", text: "x", startMs: 0, endMs: 1, confidence: 1.1 }], segments: [] } });
  assert.equal(validateProjectIRv1(invalidConfidence).ok, false);
  const unknownReference = v1Project({ transcript: { words: [], segments: [{ id: "s1", text: "x", startMs: 0, endMs: 1, wordIds: ["missing"] }] } });
  assert.equal(validateProjectIRv1(unknownReference).ok, false);
  const duplicate = v1Project({ transcript: { words: [{ id: "same", text: "a", startMs: 0, endMs: 1 }, { id: "same", text: "b", startMs: 1, endMs: 2 }], segments: [] } });
  assert.equal(validateProjectIRv1(duplicate).ok, false);
});

test("v2 accepts none, model, aligned, and migration-only unknown timing states", () => {
  const none = createSourceTranscript({ sourceId: "source-1", wordTiming: "none", speakerState: "none", transcript: { language: "pt", words: [], segments: [{ id: "s1", text: "fala", startMs: 0, endMs: 100, wordIds: [] }] }, provenance: { stages: [transcriptionStage()] } });
  assert.equal(validateProjectIR(v2ProjectWith(none)).ok, true);
  assert.equal(validateProjectIR(v2ProjectWith(sourceTranscript())).ok, true);
  const aligned = createSourceTranscript({ sourceId: "source-1", wordTiming: "aligned", speakerState: "none", transcript: wordTranscript(), provenance: { stages: [transcriptionStage(), { kind: "alignment", executionId: "align-1", engineId: "aligner", engineVersion: "1", engineApiVersion: "1", inputTranscriptDigest: dummyDigest, createdAt: fixedTime }] } });
  assert.equal(validateProjectIR(v2ProjectWith(aligned)).ok, true);
  const migrated = migrateProject(v1Project({ sources: [source()], transcript: wordTranscript() }));
  assert.equal(migrated.sourceTranscripts[0].wordTiming, "unknown");
  assert.equal(validateProjectIR(migrated).ok, true);
  assert.throws(() => createSourceTranscript({ sourceId: "source-1", wordTiming: "unknown", speakerState: "none", transcript: wordTranscript(), provenance: { stages: [{ kind: "migration", fromSchemaVersion: 1, toSchemaVersion: 2 }] } }), /reserved for migration/);
});

test("v2 enforces source ownership, digest, checksum, duration, and unique IDs", () => {
  const valid = sourceTranscript({ provenance: { sourceChecksum: "sha256:source", stages: [transcriptionStage()] } });
  const base = v2ProjectWith(valid, source("source-1", "video", { checksum: "sha256:source", durationMs: 500 }));
  assert.equal(validateProjectIR(base).ok, true);
  const cases = [];
  const unknown = clone(base); unknown.sourceTranscripts[0].sourceId = "missing"; cases.push(unknown);
  const image = clone(base); image.sources[0].kind = "image"; cases.push(image);
  const duplicateOwner = clone(base); duplicateOwner.sourceTranscripts.push(clone(duplicateOwner.sourceTranscripts[0])); cases.push(duplicateOwner);
  const wrongDigest = clone(base); wrongDigest.sourceTranscripts[0].transcriptDigest = dummyDigest; cases.push(wrongDigest);
  const wrongChecksum = clone(base); wrongChecksum.sourceTranscripts[0].provenance.sourceChecksum = "wrong"; cases.push(wrongChecksum);
  const overDuration = clone(base); overDuration.sourceTranscripts[0].transcript.words[0].endMs = 501; overDuration.sourceTranscripts[0].transcriptDigest = computeTranscriptDigest(overDuration.sourceTranscripts[0]); cases.push(overDuration);
  const duplicateWord = clone(base); duplicateWord.sourceTranscripts[0].transcript.words.push(clone(duplicateWord.sourceTranscripts[0].transcript.words[0])); cases.push(duplicateWord);
  const untrimmedLanguage = clone(base); untrimmedLanguage.sourceTranscripts[0].transcript.language = " pt "; untrimmedLanguage.sourceTranscripts[0].transcriptDigest = computeTranscriptDigest(untrimmedLanguage.sourceTranscripts[0]); cases.push(untrimmedLanguage);
  for (const candidate of cases) assert.equal(validateProjectIR(candidate).ok, false);
});

test("v2 validation reports malformed nested arrays without throwing", () => {
  const project = v2ProjectWith(sourceTranscript());
  project.sourceTranscripts[0].transcript.segments = [7];
  assert.doesNotThrow(() => validateProjectIR(project));
  assert.equal(validateProjectIR(project).ok, false);
});

test("model and aligned timing require exact unique containing segment mappings", () => {
  assert.throws(() => sourceTranscript({ transcript: wordTranscript({ segments: [{ id: "s1", text: "ação", startMs: 0, endMs: 500, wordIds: [] }] }) }), /exactly one segment/);
  assert.throws(() => sourceTranscript({ transcript: wordTranscript({ segments: [{ id: "s1", text: "ação", startMs: 10, endMs: 500, wordIds: ["w1"] }] }) }), /outside its segment/);
  assert.throws(() => sourceTranscript({ transcript: wordTranscript({ segments: [{ id: "s1", text: "ação", startMs: 0, endMs: 500, wordIds: ["w1", "w1"] }] }) }), /Duplicate word reference/);
});

test("speaker states are derived and conflicts fail closed", () => {
  const partialTranscript = wordTranscript({ words: [{ id: "w1", text: "ação", startMs: 0, endMs: 500, speakerId: "speaker-1" }] });
  const partial = createSourceTranscript({ sourceId: "source-1", wordTiming: "model", speakerState: "partial", transcript: partialTranscript, provenance: { stages: [transcriptionStage(), { kind: "speaker-attribution", executionId: "speaker-run", engineId: "speaker-engine", engineVersion: "1", engineApiVersion: "1", inputTranscriptDigest: dummyDigest, createdAt: fixedTime }] } });
  assert.equal(validateProjectIR(v2ProjectWith(partial)).ok, true);
  const completeTranscript = wordTranscript({ words: [{ id: "w1", text: "ação", startMs: 0, endMs: 500, speakerId: "speaker-1" }], segments: [{ id: "s1", text: "ação", startMs: 0, endMs: 500, wordIds: ["w1"], speakerId: "speaker-1" }] });
  const complete = createSourceTranscript({ sourceId: "source-1", wordTiming: "model", speakerState: "complete", transcript: completeTranscript, provenance: { stages: [transcriptionStage(), { kind: "manual-correction", inputTranscriptDigest: dummyDigest, createdAt: fixedTime }] } });
  assert.equal(validateProjectIR(v2ProjectWith(complete)).ok, true);
  const segmentOnlyComplete = createSourceTranscript({ sourceId: "source-1", wordTiming: "none", speakerState: "complete", transcript: { words: [], segments: [{ id: "s1", text: "fala", startMs: 0, endMs: 10, wordIds: [], speakerId: "speaker-1" }] }, provenance: { stages: [transcriptionStage(), { kind: "speaker-attribution", executionId: "speaker-run", engineId: "speaker-engine", engineVersion: "1", engineApiVersion: "1", inputTranscriptDigest: dummyDigest, createdAt: fixedTime }] } });
  assert.equal(validateProjectIR(v2ProjectWith(segmentOnlyComplete)).ok, true);
  assert.throws(() => createSourceTranscript({ sourceId: "source-1", wordTiming: "model", speakerState: "complete", transcript: wordTranscript({ words: [{ id: "w1", text: "x", startMs: 0, endMs: 500, speakerId: "a" }], segments: [{ id: "s1", text: "x", startMs: 0, endMs: 500, wordIds: ["w1"], speakerId: "b" }] }), provenance: { stages: [transcriptionStage(), { kind: "manual-correction", inputTranscriptDigest: dummyDigest, createdAt: fixedTime }] } }), /conflicts/);
});

test("provenance validates exact shape, order, duplicates, and bounded stages", () => {
  const valid = sourceTranscript();
  assert.equal(validateProjectIR(v2ProjectWith(valid)).ok, true);
  for (const stages of [[], [transcriptionStage(), transcriptionStage({ executionId: "two" })], [{ kind: "manual-correction", inputTranscriptDigest: dummyDigest, createdAt: fixedTime }, transcriptionStage()]]) {
    const raw = clone(valid);
    raw.provenance.stages = stages;
    assert.equal(validateProjectIR(v2ProjectWith(raw)).ok, false);
  }
  const unexpected = clone(valid); unexpected.provenance.stages[0].providerSpecific = true;
  assert.equal(validateProjectIR(v2ProjectWith(unexpected)).ok, false);
  const tooMany = clone(valid); tooMany.provenance.stages = Array.from({ length: 6 }, (_, index) => transcriptionStage({ executionId: `execution-${index}` }));
  assert.equal(validateProjectIR(v2ProjectWith(tooMany)).ok, false);
});

test("migration discards only the exact historical factory-empty transcript", () => {
  for (const sources of [[], [source()], [source("a"), source("b")]]) {
    const migrated = migrateProject(v1Project({ sources }));
    assert.deepEqual(migrated.sourceTranscripts, []);
    assert.equal(quarantine(migrated), undefined);
    assert.equal(Object.hasOwn(migrated, "transcript"), false);
  }
  const withExtra = migrateProject(v1Project({ transcript: { words: [], segments: [], legacy: true } }));
  assert.equal(quarantine(withExtra).reason, "no-eligible-source");
  assert.deepEqual(quarantine(withExtra).payload, { words: [], segments: [], legacy: true });
});

test("migration binds lossless transcripts only to the sole eligible source", () => {
  for (const kind of ["video", "audio"]) {
    const migrated = migrateProject(v1Project({ sources: [source("only", kind, { checksum: "sha256:asset" })], transcript: wordTranscript() }));
    assert.equal(migrated.sourceTranscripts[0].sourceId, "only");
    assert.equal(migrated.sourceTranscripts[0].wordTiming, "unknown");
    assert.equal(migrated.sourceTranscripts[0].provenance.sourceChecksum, "sha256:asset");
    assert.deepEqual(migrated.sourceTranscripts[0].provenance.stages, [{ kind: "migration", fromSchemaVersion: 1, toSchemaVersion: 2 }]);
  }
  const languageOnly = migrateProject(v1Project({ sources: [source()], transcript: { language: "pt", words: [], segments: [] } }));
  assert.equal(languageOnly.sourceTranscripts[0].wordTiming, "none");
  const segmentOnly = migrateProject(v1Project({ sources: [source()], transcript: { words: [], segments: [{ id: "s1", text: "fala", startMs: 0, endMs: 10, wordIds: [] }] } }));
  assert.equal(segmentOnly.sourceTranscripts[0].wordTiming, "none");
});

test("migration quarantines no-owner and ambiguous ownership with sorted evidence", () => {
  const noSource = migrateProject(v1Project({ transcript: wordTranscript() }));
  assert.equal(quarantine(noSource).reason, "no-eligible-source");
  const image = migrateProject(v1Project({ sources: [source("image", "image")], transcript: wordTranscript() }));
  assert.equal(quarantine(image).reason, "no-eligible-source");
  const ambiguous = migrateProject(v1Project({ sources: [source("z", "video"), source("image", "image"), source("a", "audio")], transcript: wordTranscript() }));
  assert.equal(quarantine(ambiguous).reason, "ambiguous-multiple-sources");
  assert.deepEqual(quarantine(ambiguous).eligibleSourceIdsAtMigration, ["a", "z"]);
  const oneEligibleAmongMany = migrateProject(v1Project({ sources: [source("only", "audio"), source("image", "image")], transcript: wordTranscript() }));
  assert.equal(quarantine(oneEligibleAmongMany).reason, "ambiguous-multiple-sources");
});

test("historically accepted but non-canonical legacy data is preserved raw in quarantine", () => {
  const raw = {
    language: 42,
    legacy: { flags: [true, false, null], count: 3 },
    words: [{ id: "w1", text: "x", startMs: 0, endMs: 10, speakerId: 9, extra: "keep" }],
    segments: [{ id: "s1", text: "x", startMs: 0, endMs: 10, wordIds: ["w1", "w1"], extra: { keep: true } }]
  };
  assert.equal(validateProjectIRv1(v1Project({ sources: [source()], transcript: raw })).ok, true);
  const migrated = migrateProject(v1Project({ sources: [source()], transcript: raw }));
  assert.deepEqual(migrated.sourceTranscripts, []);
  assert.equal(quarantine(migrated).reason, "incompatible-canonical-transcript");
  assert.deepEqual(quarantine(migrated).payload, raw);
  assert.equal(Object.hasOwn(migrated, "transcript"), false);
});

test("migration quarantines legacy transcript intervals beyond the source and negative zero", () => {
  const overDuration = migrateProject(v1Project({ sources: [source("source-1", "video", { durationMs: 50 })], transcript: wordTranscript() }));
  assert.equal(quarantine(overDuration).reason, "incompatible-canonical-transcript");
  const negativeZero = migrateProject(v1Project({ sources: [source()], transcript: { words: [{ id: "w1", text: "x", startMs: -0, endMs: 1 }], segments: [] } }));
  assert.equal(quarantine(negativeZero).reason, "incompatible-canonical-transcript");
});

test("migration is pure, repeated deterministic, and protects the reserved namespace", () => {
  const input = v1Project({ sources: [source("b"), source("a")], transcript: wordTranscript() });
  const before = clone(input);
  const first = migrateProject(input);
  const second = migrateProject(input);
  assert.deepEqual(input, before);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(JSON.stringify(first).includes(fixedTime), true);
  assert.equal(JSON.stringify(quarantine(first)).includes("createdAt"), false);
  const collision = v1Project({ extensions: { [V1_UNASSIGNED_TRANSCRIPT_EXTENSION]: { untrusted: true } } });
  assert.throws(() => migrateProject(collision), /reserved transcript quarantine/);
});

test("quarantine envelope rejects invalid intrinsic evidence", () => {
  const migrated = migrateProject(v1Project({ sources: [source("b"), source("a")], transcript: wordTranscript() }));
  const extra = clone(migrated); quarantine(extra).extra = true;
  assert.equal(validateProjectIR(extra).ok, false);
  const unsorted = clone(migrated); quarantine(unsorted).eligibleSourceIdsAtMigration.reverse();
  assert.equal(validateProjectIR(unsorted).ok, false);
  const duplicate = clone(migrated); quarantine(duplicate).eligibleSourceIdsAtMigration = ["a", "a"];
  assert.equal(validateProjectIR(duplicate).ok, false);
  const invalidEvidenceType = clone(migrated); quarantine(invalidEvidenceType).eligibleSourceIdsAtMigration = [42];
  assert.equal(validateProjectIR(invalidEvidenceType).ok, false);
  const nonFinite = clone(migrated); quarantine(nonFinite).payload.bad = Infinity;
  assert.equal(validateProjectIR(nonFinite).ok, false);
  const invalidReason = clone(migrated); quarantine(invalidReason).reason = "invalid-reason";
  assert.equal(validateProjectIR(invalidReason).ok, false);
});

test("source.add preserves no-source quarantine evidence through undo and redo", () => {
  let sequence = 0;
  const raw = wordTranscript({ legacyEvidence: { keep: [true, null, "raw"] } });
  const migrated = migrateProject(v1Project({ transcript: raw }));
  const historicalQuarantine = clone(quarantine(migrated));
  assert.equal(historicalQuarantine.reason, "no-eligible-source");
  assert.deepEqual(historicalQuarantine.eligibleSourceIdsAtMigration, []);

  const history = new ProjectHistory(migrated, { idGenerator: () => `add-${++sequence}`, clock: () => fixedTime });
  const added = history.commit({ type: "source.add", source: source("later", "audio") });
  assert.deepEqual(added.sources.map(({ id }) => id), ["later"]);
  assert.deepEqual(added.sourceTranscripts, []);
  assert.deepEqual(quarantine(added), historicalQuarantine);
  assert.deepEqual(quarantine(added).payload, raw);
  assert.equal(validateProjectIR(added).ok, true);

  const undone = history.undo();
  assert.deepEqual(undone.sources, []);
  assert.deepEqual(quarantine(undone), historicalQuarantine);
  assert.equal(validateProjectIR(undone).ok, true);

  const redone = history.redo();
  assert.deepEqual(redone.sources.map(({ id }) => id), ["later"]);
  assert.deepEqual(redone.sourceTranscripts, []);
  assert.deepEqual(quarantine(redone), historicalQuarantine);
  assert.equal(validateProjectIR(redone).ok, true);
});

test("source.remove preserves ambiguous quarantine evidence through zero sources and undo redo", () => {
  let sequence = 0;
  const raw = wordTranscript({ legacyEvidence: { keep: "verbatim" } });
  const migrated = migrateProject(v1Project({ sources: [source("b"), source("a", "audio")], transcript: raw }));
  const historicalQuarantine = clone(quarantine(migrated));
  assert.equal(historicalQuarantine.reason, "ambiguous-multiple-sources");
  assert.deepEqual(historicalQuarantine.eligibleSourceIdsAtMigration, ["a", "b"]);

  const history = new ProjectHistory(migrated, { idGenerator: () => `remove-${++sequence}`, clock: () => fixedTime });
  const removedA = history.commit({ type: "source.remove", sourceId: "a" });
  assert.deepEqual(removedA.sources.map(({ id }) => id), ["b"]);
  assert.deepEqual(removedA.sourceTranscripts, []);
  assert.deepEqual(quarantine(removedA), historicalQuarantine);
  assert.deepEqual(quarantine(removedA).payload, raw);
  assert.equal(validateProjectIR(removedA).ok, true);

  const undone = history.undo();
  assert.deepEqual(undone.sources.map(({ id }) => id), ["b", "a"]);
  assert.deepEqual(quarantine(undone), historicalQuarantine);
  assert.equal(validateProjectIR(undone).ok, true);

  const redone = history.redo();
  assert.deepEqual(redone.sources.map(({ id }) => id), ["b"]);
  assert.deepEqual(quarantine(redone), historicalQuarantine);
  assert.equal(validateProjectIR(redone).ok, true);

  const removedAll = history.commit({ type: "source.remove", sourceId: "b" });
  assert.deepEqual(removedAll.sources, []);
  assert.deepEqual(removedAll.sourceTranscripts, []);
  assert.deepEqual(quarantine(removedAll), historicalQuarantine);
  assert.deepEqual(quarantine(removedAll).eligibleSourceIdsAtMigration, ["a", "b"]);
  assert.equal(validateProjectIR(removedAll).ok, true);
});

test("source.remove cascades its transcript atomically and undo redo restore both", () => {
  let sequence = 0;
  const migrated = migrateProject(v1Project({ sources: [source()], transcript: wordTranscript() }));
  const history = new ProjectHistory(migrated, { idGenerator: () => `id-${++sequence}`, clock: () => fixedTime });
  const removed = history.commit({ type: "source.remove", sourceId: "source-1" });
  assert.deepEqual(removed.sources, []);
  assert.deepEqual(removed.sourceTranscripts, []);
  assert.equal(removed.history.revision, 1);
  assert.equal(history.undo().sourceTranscripts.length, 1);
  assert.equal(history.undo().sources.length, 1);
  assert.equal(history.redo().sources.length, 0);
  assert.equal(history.redo().sourceTranscripts.length, 0);
});

test("source.remove preserves blockers and unknown source creates no revision", () => {
  let sequence = 0;
  const project = createEmptyProject({ id: "project-1", now: fixedTime });
  project.sources.push(source());
  project.timeline.tracks.push({ id: "v1", kind: "video", name: "Video", locked: false, hidden: false, muted: false });
  project.timeline.clips.push({ id: "clip-1", trackId: "v1", sourceId: "source-1", timelineStartMs: 0, timelineEndMs: 100, sourceStartMs: 0, sourceEndMs: 100, speed: 1, volume: 1, opacity: 1 });
  const history = new ProjectHistory(project, { idGenerator: () => `id-${++sequence}`, clock: () => fixedTime });
  assert.throws(() => history.commit({ type: "source.remove", sourceId: "source-1" }), /timeline clips/);
  assert.equal(history.entries.length, 0);
  assert.throws(() => history.commit({ type: "source.remove", sourceId: "missing" }), /Unknown source/);
  assert.equal(history.entries.length, 0);
});

test("source.remove preserves graphic and generation-history blockers", () => {
  for (const blockedBy of ["graphic", "generation"]) {
    let sequence = 0;
    const project = createEmptyProject({ id: `project-${blockedBy}`, now: fixedTime });
    project.sources.push(source());
    if (blockedBy === "graphic") project.graphics.push({ id: "graphic-1", kind: "image", startMs: 0, endMs: 100, sourceId: "source-1" });
    else project.generation.push({ id: "generation-1", kind: "video", providerId: "provider", prompt: "", status: "completed", outputSourceIds: ["source-1"], createdAt: fixedTime });
    const history = new ProjectHistory(project, { idGenerator: () => `${blockedBy}-${++sequence}`, clock: () => fixedTime });
    assert.throws(() => history.commit({ type: "source.remove", sourceId: "source-1" }), blockedBy === "graphic" ? /graphics/ : /generation history/);
    assert.equal(history.entries.length, 0);
  }
});

test("history archive round-trips v2 snapshots and an active redo cursor", () => {
  let sequence = 0;
  const history = new ProjectHistory(createEmptyProject({ id: "project-1", name: "A", now: fixedTime }), { idGenerator: () => `id-${++sequence}`, clock: () => fixedTime });
  history.commit({ type: "project.rename", name: "B" });
  history.commit({ type: "project.rename", name: "C" });
  history.undo();
  const restored = ProjectHistory.fromArchive(history.toArchive(), { idGenerator: () => `restored-${++sequence}`, clock: () => fixedTime });
  assert.equal(restored.current.schemaVersion, 2);
  assert.equal(restored.current.project.name, "B");
  assert.equal(restored.canRedo, true);
  assert.equal(restored.redo().project.name, "C");
  assert.equal(restored.restoreSnapshot(restored.snapshots[0].id).project.name, "A");
});

test("migration rejects unknown future schema", () => {
  const project = createEmptyProject({ id: "project-1", now: fixedTime });
  assert.throws(() => migrateProject({ ...project, schemaVersion: 999 }), /newer than supported/);
});
