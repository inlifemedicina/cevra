import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyProject, createSourceTranscript, ProjectHistory } from "@cevra/project-ir";
import {
  EDITORIAL_TRANSCRIPT_GROUPING_GAP_MS,
  EDITORIAL_TRANSCRIPT_PROJECTION_PROFILE,
  EditorialTranscriptProjectionService
} from "../dist/index.js";

const now = "2026-09-28T12:00:00.000Z";

function word(id, text, startMs, endMs, speakerId) {
  return { id, text, startMs, endMs, ...(speakerId === undefined ? {} : { speakerId }) };
}

function source(id, kind = "video") {
  return { id, kind, uri: `file:///private/${id}.mov`, displayName: `${id}.mov`, durationMs: 10_000_000 };
}

function transcript(sourceId, { words = [], segments, language = "pt-BR" } = {}) {
  const resolvedSegments = segments ?? (words.length === 0 ? [] : [{
    id: `${sourceId}-segment`, startMs: words[0].startMs, endMs: words.at(-1).endMs,
    text: words.map((item) => item.text).join(" "), wordIds: words.map((item) => item.id)
  }]);
  const speakers = [...words, ...resolvedSegments].some((item) => item.speakerId !== undefined);
  const baseDigest = `sha256-v1:${"a".repeat(64)}`;
  return createSourceTranscript({
    sourceId,
    wordTiming: words.length === 0 ? "none" : "model",
    speakerState: speakers ? "partial" : "none",
    transcript: { language, words, segments: resolvedSegments },
    provenance: {
      stages: [
        { kind: "transcription", executionId: `${sourceId}-tx`, engineId: "test", engineVersion: "1", engineApiVersion: "1", modelId: "test", createdAt: now },
        ...(speakers ? [{ kind: "speaker-attribution", executionId: `${sourceId}-speaker`, engineId: "test", engineVersion: "1", engineApiVersion: "1", inputTranscriptDigest: baseDigest, createdAt: now }] : [])
      ]
    }
  });
}

function fixture(entries, { sourceIds = entries.map((item) => item.sourceId), extraSources = [] } = {}) {
  const project = createEmptyProject({ id: "project-1", now });
  project.sources.push(...sourceIds.map((id) => source(id)), ...extraSources);
  project.sourceTranscripts.push(...entries);
  let sequence = 0;
  const history = new ProjectHistory(project, { clock: () => now, idGenerator: () => `history-${++sequence}` });
  return { history, service: new EditorialTranscriptProjectionService(history) };
}

function errorCode(code) {
  return (error) => error?.code === code;
}

test("groups at the versioned 500ms boundary and preserves every canonical word once", () => {
  const words = [
    word("w1", "Olá", 0, 100),
    word("w2", ",", 599, 650),
    word("w3", "mundo", 1_150, 1_300),
    word("w4", "!", 1_801, 1_850)
  ];
  const { service } = fixture([transcript("s1", { words })]);
  const output = service.project();
  assert.equal(output.profile, EDITORIAL_TRANSCRIPT_PROJECTION_PROFILE);
  assert.equal(output.groupingPolicy.gapMs, EDITORIAL_TRANSCRIPT_GROUPING_GAP_MS);
  assert.deepEqual(output.reasoningUnits.map((unit) => unit.wordIds), [["w1", "w2"], ["w3"], ["w4"]]);
  assert.deepEqual(output.reasoningUnits.map((unit) => unit.text), ["Olá,", "mundo", "!"]);
  assert.deepEqual(output.reasoningUnits.flatMap((unit) => unit.wordIds), words.map((item) => item.id));
});

test("splits only on known speaker changes and exposes speaker only for coherent units", () => {
  const words = [
    word("w1", "um", 0, 100, "speaker-a"),
    word("w2", "dois", 150, 250),
    word("w3", "três", 300, 400, "speaker-a"),
    word("w4", "quatro", 450, 550, "speaker-b")
  ];
  const { service } = fixture([transcript("s1", { words })]);
  const output = service.project();
  assert.equal(output.reasoningUnits.length, 2);
  assert.deepEqual(output.reasoningUnits[0].wordIds, ["w1", "w2", "w3"]);
  assert.equal(output.reasoningUnits[0].speakerId, undefined);
  assert.deepEqual(output.reasoningUnits[1].wordIds, ["w4"]);
  assert.equal(output.reasoningUnits[1].speakerId, "speaker-b");
});

test("uses source order by default and explicit requested order without silently omitting unavailable sources", () => {
  const one = transcript("s1", { words: [word("w1", "um", 0, 100)] });
  const two = transcript("s2", { words: [word("w2", "two", 0, 100)], language: "en-US" });
  const { service } = fixture([one, two], { sourceIds: ["s2", "s1"], extraSources: [source("s3", "audio")] });
  const all = service.project();
  assert.deepEqual(all.selection.sourceIds, ["s2", "s1", "s3"]);
  assert.deepEqual(all.sources.map((item) => item.status), ["projected", "projected", "transcript-unavailable"]);
  assert.deepEqual(service.project({ sourceIds: ["s1", "s2"] }).selection.sourceIds, ["s1", "s2"]);
  assert.throws(() => service.project({ sourceIds: ["s3"] }), errorCode("EDITORIAL_TRANSCRIPT_TRANSCRIPT_NOT_FOUND"));
  assert.throws(() => service.project({ sourceIds: ["missing"] }), errorCode("EDITORIAL_TRANSCRIPT_SOURCE_NOT_FOUND"));
  assert.throws(() => service.project({ sourceIds: ["s1", "s1"] }), errorCode("EDITORIAL_TRANSCRIPT_INVALID_REQUEST"));
});

test("falls back to canonical segments and represents no speech explicitly", () => {
  const segmentOnly = transcript("s1", {
    segments: [{ id: "seg-1", startMs: 10, endMs: 900, text: "  texto   do segmento  ", wordIds: [] }]
  });
  const silent = transcript("s2");
  const { service } = fixture([segmentOnly, silent]);
  const output = service.project();
  assert.equal(output.sources[0].basis, "segments");
  assert.equal(output.reasoningUnits[0].basis, "segments");
  assert.equal(output.reasoningUnits[0].segmentId, "seg-1");
  assert.equal(output.reasoningUnits[0].text, "texto do segmento");
  assert.equal(output.sources[1].status, "no-speech");
  assert.match(output.renderedText, /status=no-speech/);
});

test("renders PT-BR and EN-US transcript text with identical structure and no source URI leakage", () => {
  const pt = transcript("s1", { words: [word("p1", "Olá", 0, 100), word("p2", "mundo", 120, 220)] });
  const en = transcript("s2", { words: [word("e1", "Hello", 0, 100), word("e2", "world", 120, 220)], language: "en-US" });
  const { service } = fixture([pt, en]);
  const output = service.project();
  assert.match(output.renderedText, /Olá mundo/);
  assert.match(output.renderedText, /Hello world/);
  assert.equal(output.renderedText.includes("file:///"), false);
  assert.equal(JSON.stringify(output).includes("displayName"), false);
  assert.equal(JSON.stringify(output).includes("technicalDescriptor"), false);
});

test("pages deterministically by UTF-8 bytes and resumes without loss or duplication", () => {
  const words = Array.from({ length: 80 }, (_, index) => word(`word-${index}`, `palavra-${index}-${"á".repeat(80)}`, index * 100, index * 100 + 50));
  const { service } = fixture([transcript("s1", { words })]);
  const seen = [];
  const rendered = [];
  let cursor;
  do {
    const page = service.project({ maxBytes: 4096, ...(cursor === undefined ? {} : { cursor }) });
    assert.equal(Buffer.byteLength(page.renderedText, "utf8"), page.page.byteLength);
    assert.ok(page.page.byteLength <= 4096);
    seen.push(...page.reasoningUnits.flatMap((unit) => unit.wordIds));
    rendered.push(page.renderedText);
    cursor = page.page.nextCursor;
  } while (cursor !== undefined);
  assert.deepEqual(seen, words.map((item) => item.id));
  const repeat = service.project({ maxBytes: 4096 });
  assert.equal(repeat.renderedText, rendered[0]);
});

test("continues deterministically across phrase and source boundaries", () => {
  const makeWords = (prefix) => Array.from({ length: 70 }, (_, index) => {
    const startMs = index * 700;
    return word(`${prefix}-${index}`, `${prefix}-${index}-${"z".repeat(120)}`, startMs, startMs + 100);
  });
  const sourceOneWords = makeWords("one");
  const sourceTwoWords = makeWords("two");
  const { service } = fixture([
    transcript("s1", { words: sourceOneWords }),
    transcript("s2", { words: sourceTwoWords, language: "en-US" })
  ]);
  const pages = [];
  const ids = [];
  let cursor;
  do {
    const page = service.project({ maxBytes: 4096, ...(cursor === undefined ? {} : { cursor }) });
    pages.push(page.renderedText);
    ids.push(...page.reasoningUnits.flatMap((unit) => unit.wordIds));
    cursor = page.page.nextCursor;
  } while (cursor !== undefined);
  assert.deepEqual(ids, [...sourceOneWords, ...sourceTwoWords].map((item) => item.id));
  assert.ok(pages.some((page) => page.startsWith('## source="s2"')));
});

test("rejects stale, malformed, unknown-version, and invalid-position cursors", () => {
  const { history, service } = fixture([transcript("s1", { words: Array.from({ length: 80 }, (_, index) => word(`w${index}`, "x".repeat(80), index * 100, index * 100 + 50)) })]);
  const first = service.project({ maxBytes: 4096 });
  assert.ok(first.page.nextCursor);
  assert.throws(() => service.project({ cursor: "not-json" }), errorCode("EDITORIAL_TRANSCRIPT_CURSOR_INVALID"));
  const unknown = JSON.parse(first.page.nextCursor);
  unknown.version = 2;
  assert.throws(() => service.project({ cursor: JSON.stringify(unknown) }), errorCode("EDITORIAL_TRANSCRIPT_CURSOR_INVALID"));
  const invalid = JSON.parse(first.page.nextCursor);
  invalid.nextSourceIndex = 99;
  assert.throws(() => service.project({ cursor: JSON.stringify(invalid) }), errorCode("EDITORIAL_TRANSCRIPT_CURSOR_INVALID"));
  const invalidUnit = JSON.parse(first.page.nextCursor);
  invalidUnit.nextUnitIndex = 99;
  assert.throws(() => service.project({ cursor: JSON.stringify(invalidUnit) }), errorCode("EDITORIAL_TRANSCRIPT_CURSOR_INVALID"));
  const tamperedDigest = JSON.parse(first.page.nextCursor);
  tamperedDigest.sourceBindings[0].transcriptDigest = `sha256-v1:${"f".repeat(64)}`;
  assert.throws(() => service.project({ cursor: JSON.stringify(tamperedDigest) }), errorCode("EDITORIAL_TRANSCRIPT_CURSOR_STALE"));
  history.commit({ type: "project.rename", name: "changed" });
  assert.throws(() => service.project({ cursor: first.page.nextCursor }), errorCode("EDITORIAL_TRANSCRIPT_CURSOR_STALE"));
});

test("rejects a continuation after the canonical transcript digest changes", () => {
  const current = transcript("s1", { words: Array.from({ length: 80 }, (_, index) => word(`w${index}`, "x".repeat(80), index * 700, index * 700 + 100)) });
  const { history, service } = fixture([current]);
  const first = service.project({ maxBytes: 4096 });
  assert.ok(first.page.nextCursor);
  history.commit({ type: "transcript.remove", sourceId: "s1", expectedTranscriptDigest: current.transcriptDigest });
  assert.throws(() => service.project({ cursor: first.page.nextCursor }), errorCode("EDITORIAL_TRANSCRIPT_CURSOR_STALE"));
});

test("splits oversized word units only on canonical word boundaries and rejects an indivisible unit", () => {
  const splittable = transcript("s1", { words: Array.from({ length: 12 }, (_, index) => word(`w${index}`, "x".repeat(700), index * 100, index * 100 + 50)) });
  const { service } = fixture([splittable]);
  const first = service.project({ maxBytes: 4096 });
  assert.equal(first.reasoningUnits[0].continuation.continuesOnNextPage, true);
  const second = service.project({ maxBytes: 4096, cursor: first.page.nextCursor });
  assert.equal(second.reasoningUnits[0].continuation.continuedFromPrevious, true);

  const huge = transcript("s2", { words: [word("huge", "x".repeat(5_000), 0, 10)] });
  const hugeFixture = fixture([huge]);
  assert.throws(() => hugeFixture.service.project({ maxBytes: 4096 }), errorCode("EDITORIAL_TRANSCRIPT_UNIT_TOO_LARGE"));
});

test("is read-only, deterministic, deeply immutable, and does not discard redo", () => {
  const { history, service } = fixture([transcript("s1", { words: [word("w1", "imutável", 0, 100)] })]);
  history.commit({ type: "project.rename", name: "second" });
  history.undo();
  const before = {
    project: history.current,
    entries: history.entries,
    canRedo: history.canRedo
  };
  const first = service.project();
  const second = service.project();
  assert.deepEqual(first, second);
  assert.throws(() => first.reasoningUnits[0].wordIds.push("foreign"), TypeError);
  assert.throws(() => { first.sources[0].status = "no-speech"; }, TypeError);
  assert.deepEqual(history.current, before.project);
  assert.deepEqual(history.entries, before.entries);
  assert.equal(history.canRedo, before.canRedo);
});

test("validates request bounds and keeps unknown fields closed", () => {
  const { service } = fixture([transcript("s1", { words: [word("w1", "ok", 0, 100)] })]);
  for (const request of [null, [], { maxBytes: 4095 }, { maxBytes: 262145 }, { sourceIds: [] }, { extra: true }]) {
    assert.throws(() => service.project(request), errorCode("EDITORIAL_TRANSCRIPT_INVALID_REQUEST"));
  }
});

test("characterizes bounded projection scale for 5, 30, 60 and 3x30 minute fixtures", () => {
  const scenarios = [[5], [30], [60], [30, 30, 30]];
  for (const minutes of scenarios) {
    const transcripts = minutes.map((durationMinutes, sourceIndex) => {
      const count = durationMinutes * 60 * 2;
      const words = Array.from({ length: count }, (_, index) => {
        const startMs = Math.floor(index / 8) * 4_500 + (index % 8) * 400;
        return word(`s${sourceIndex}-w${index}`, `token${index}`, startMs, startMs + 180);
      });
      return transcript(`s${sourceIndex}`, { words });
    });
    const { service } = fixture(transcripts);
    const started = performance.now();
    let cursor;
    let pageCount = 0;
    let renderedBytes = 0;
    let phraseCount;
    let peakHeapUsedBytes = process.memoryUsage().heapUsed;
    const initialHeapUsedBytes = peakHeapUsedBytes;
    do {
      const page = service.project({ maxBytes: 64 * 1024, ...(cursor === undefined ? {} : { cursor }) });
      pageCount += 1;
      renderedBytes += page.page.byteLength;
      phraseCount ??= page.sources.reduce((sum, item) => sum + item.unitCount, 0);
      cursor = page.page.nextCursor;
      peakHeapUsedBytes = Math.max(peakHeapUsedBytes, process.memoryUsage().heapUsed);
    } while (cursor !== undefined);
    const elapsedMs = performance.now() - started;
    assert.equal(phraseCount, transcripts.reduce((sum, item) => sum + Math.ceil(item.transcript.words.length / 8), 0));
    assert.ok(renderedBytes > 0);
    assert.ok(pageCount > 0);
    console.log(JSON.stringify({
      fixtureMinutes: minutes,
      phraseCount,
      renderedBytes,
      pageCount,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      observedHeapGrowthBytes: Math.max(0, peakHeapUsedBytes - initialHeapUsedBytes)
    }));
  }
});
