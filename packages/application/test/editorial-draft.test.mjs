import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyProject, createSourceTranscript, ProjectHistory } from "@cevra/project-ir";
import { EditorialDraftService, EditorialTranscriptProjectionService, SEMANTIC_EDITORIAL_ANALYSIS_PROFILE, EDITORIAL_TRANSCRIPT_PROJECTION_PROFILE } from "../dist/index.js";

// Synthetic equivalent of the approved textual scenario, not a private result/receipt dump.
const now = "2026-09-28T18:00:00.000Z";
function fixture(locale = "pt-BR", timing = "none", sourceTexts) {
  const texts = sourceTexts ?? (locale === "pt-BR" ? [
    "A oficina monta caixas sob encomenda. A entrega no dia seguinte só vale quando o material está disponível. O prazo não é uma promessa sem essa condição.",
    "Com o material disponível, podemos entregar no dia seguinte. Além disso, cada caixa recebe uma etiqueta para acompanhamento. Não sabemos se haverá material para pedidos futuros."
  ] : [
    "The workshop makes boxes to order. Next-day delivery depends on material availability. This is not an unconditional promise.",
    "With material available, next-day delivery is possible. Each box also receives a tracking label. Material availability for future orders is uncertain."
  ]);
  const project = createEmptyProject({ id: "draft-fixture-project", locale, now });
  for (const [i, text] of texts.entries()) {
    const sourceId = `source-${i + 1}`;
    const words = timing === "none" ? [] : text.split(" ").map((text, j) => ({ id: `${sourceId}-word-${j}`, text, startMs: j * 100, endMs: j * 100 + 90 }));
    project.sources.push({ id: sourceId, kind: "video", uri: `file:///synthetic/${sourceId}.mov`, displayName: `${sourceId}.mov`, durationMs: 10000 });
    project.sourceTranscripts.push(createSourceTranscript({
      sourceId, wordTiming: timing, speakerState: "none",
      transcript: { language: locale, words, segments: [{ id: `segment-${i + 1}`, startMs: 0, endMs: words.at(-1)?.endMs ?? 10000, text, wordIds: words.map((x) => x.id) }] },
      provenance: { stages: [{ kind: "transcription", executionId: "synthetic-transcription", engineId: "synthetic-engine", engineVersion: "1", engineApiVersion: "1", modelId: "synthetic-model", createdAt: now }] }
    }));
  }
  let sequence = 0;
  const history = new ProjectHistory(project, { clock: () => now, idGenerator: () => `snapshot-${++sequence}` });
  history.commit({ type: "project.rename", name: "redo preserved" }); history.undo();
  const current = history.current;
  const statements = locale === "pt-BR" ? [
    "A oficina monta caixas sob encomenda.",
    "Entrega no dia seguinte depende de material disponível; não é promessa incondicional.",
    "Com material disponível, a entrega no dia seguinte é possível.",
    "A etiqueta serve para acompanhamento. Essa informação não aparece em E1.",
    "Não sabemos se haverá material para pedidos futuros."
  ] : [
    "The workshop makes boxes to order.", "Delivery depends on available material; it is not unconditional.",
    "Next-day delivery is possible with material available.", "The label supports tracking. E1 does not include this detail.",
    "Material availability for future orders is uncertain."
  ];
  const analysis = {
    version: 1, profile: SEMANTIC_EDITORIAL_ANALYSIS_PROFILE, kind: "analysis-candidate",
    executionId: "synthetic-analysis", contextId: "synthetic-context",
    binding: { projectId: current.project.id, projectRevision: current.history.revision, projectSnapshotId: current.history.headSnapshotId,
      journalEntryCount: history.entries.length, sourceTranscripts: current.sourceTranscripts.map(({ sourceId, transcriptDigest }) => ({ sourceId, transcriptDigest })),
      projectionProfile: EDITORIAL_TRANSCRIPT_PROJECTION_PROFILE, analysisProfile: SEMANTIC_EDITORIAL_ANALYSIS_PROFILE },
    coverage: { status: "complete", requestedSourceReferences: ["S1", "S2"], providedEvidenceReferences: ["E1", "E2"], transcriptUnavailableSourceReferences: [], noSpeechSourceReferences: [], sourcesWithRemainingEvidence: [] },
    evidence: current.sourceTranscripts.map((t, i) => ({ reference: `E${i + 1}`, sourceId: t.sourceId, transcriptDigest: t.transcriptDigest,
      startMs: 0, endMs: t.transcript.segments[0].endMs, timingBasis: timing,
      ...(timing === "none" ? { basis: "segments", wordIds: [], segmentId: `segment-${i + 1}` } : { basis: "words", wordIds: t.transcript.words.map((x) => x.id) }), text: texts[i] })),
    candidate: { version: 1, kind: "analysis-candidate", contextId: "synthetic-context",
      observations: statements.map((statement, i) => ({ id: `observation-${i + 1}`, kind: ["theme", "caveat", "idea", "idea", "caveat"][i],
        statement, justification: "Synthetic textual evidence", uncertainty: i === 4 ? "material" : "low", evidenceReferences: [i < 2 ? "E1" : "E2"] })),
      relations: [
        { id: "relation-repeat", kind: "possible-equivalence", statement: "Possible repetition; keep both alternatives unresolved.", uncertainty: "material", justification: "Both sources discuss conditional delivery.", leftEvidenceReferences: ["E1"], rightEvidenceReferences: ["E2"] },
        { id: "relation-complement", kind: "complement", statement: "The label complements the delivery information.", uncertainty: "low", justification: "E2 adds information.", leftEvidenceReferences: ["E1"], rightEvidenceReferences: ["E2"] }
      ],
      uncertainties: [{ statement: "The relationship between sources is uncertain.", reason: "No audiovisual evidence.", evidenceReferences: ["E1", "E2"] }],
      limitations: ["Text only; no take choice or precise cut timing."] },
    provenance: { invocationCount: 1, requestBytes: [1711], responseBytes: [4259] }
  };
  const analysisReview = { citationSupport: "PARTIAL", notes: ["The label observation compares E1 but cites only E2; the relation cites both."],
    priorChecks: [{ id: "prior-literal-helper", outcome: "PARTIAL", detail: "condition:false, complement:true, repetition:false, uncertainty:false; unchanged prior helper." }] };
  const request = { id: "draft-fixture", analysis, analysisReview };
  return { history, analysis, request, service: new EditorialDraftService(history) };
}
const fails = (callback, code = "EDITORIAL_DRAFT_INVALID") => assert.throws(callback, (error) => error.code === code);
function omitSecondSourceEvidence(analysis) {
  analysis.evidence = analysis.evidence.filter((item) => item.reference === "E1");
  analysis.coverage.providedEvidenceReferences = ["E1"];
  analysis.candidate.observations = analysis.candidate.observations.filter((item) => !item.evidenceReferences.includes("E2"));
  analysis.candidate.relations = [];
  analysis.candidate.uncertainties = [];
}

test("offline proposal retains all five blocks, source links, caveats, relationships and prior assessment without timing or history mutation", () => {
  const { service, history, request } = fixture();
  const before = history.toArchive();
  const draft = service.create(request);
  assert.equal(draft.blocks.length, 5);
  assert.deepEqual(draft.blocks.map((x) => x.evidenceReferences), [["E1"], ["E1"], ["E2"], ["E2"], ["E2"]]);
  assert.deepEqual(draft.caveatObservationIds, ["observation-2", "observation-5"]);
  assert.deepEqual(draft.analysis.candidate, request.analysis.candidate);
  assert.deepEqual(draft.analysisReview, request.analysisReview);
  assert.equal(draft.reviewState, "review-required");
  assert.equal(draft.orderBasis, "analysis-observation-order");
  assert.equal(draft.evidence[0].sourceId, "source-1");
  assert.equal(draft.evidence[0].timingBasis, "none");
  for (const key of ["startMs", "endMs", "durationMs", "commands", "changeSet", "selectedTake"]) assert.equal(key in draft.evidence[0] || key in draft, false);
  assert.equal(JSON.stringify(draft).includes("file:///"), false);
  assert.deepEqual(history.toArchive(), before);
  assert.equal(history.canRedo, true);
  request.analysis.candidate.observations[0].statement = "mutated input";
  assert.notEqual(draft.analysis.candidate.observations[0].statement, "mutated input");
  assert.throws(() => { draft.analysisReview.citationSupport = "PASS"; }, TypeError);
});

test("user can revise sequence/title/notes while immutable evidence and caveats remain; earlier revision is stale", () => {
  const { service, history, request } = fixture(); const before = history.toArchive();
  const draft = service.create(request);
  const order = ["observation-1", "observation-3", "observation-2", "observation-4", "observation-5"];
  const revised = service.revise(draft, { expectedRevision: 0, title: "Revisão da proposta", blockOrder: order,
    blockEdits: [{ blockId: "observation-2", title: "Condição essencial", userNote: "Preservar junto à promessa de prazo." }] });
  assert.deepEqual(revised.blocks.map((x) => x.id), order);
  assert.equal(revised.blocks[2].userNote, "Preservar junto à promessa de prazo.");
  assert.equal(revised.revision, 1); assert.equal(revised.orderBasis, "user-order");
  assert.deepEqual(revised.analysis, draft.analysis); assert.deepEqual(revised.analysisReview, draft.analysisReview);
  assert.deepEqual(revised.caveatObservationIds, draft.caveatObservationIds);
  fails(() => service.assertCurrent(draft), "EDITORIAL_DRAFT_STALE");
  service.assertCurrent(revised);
  assert.equal(service.revise(revised, { expectedRevision: 1 }), revised);
  assert.deepEqual(history.toArchive(), before);
});

test("drop, duplicate, unknown blocks, changed evidence and command-shaped edits fail without superseding the usable draft", () => {
  const { service, request } = fixture(); const draft = service.create(request);
  for (const edit of [
    { blockOrder: draft.blocks.slice(0, 4).map((x) => x.id) },
    { blockOrder: draft.blocks.map(() => "observation-1") },
    { blockOrder: draft.blocks.map((x, i) => i ? x.id : "unknown") },
    { blockEdits: [{ blockId: "observation-2", statement: "Remove condition" }] },
    { blockEdits: [{ blockId: "observation-2", evidenceReferences: ["E2"] }] },
    { commands: [{ type: "clip.remove" }] }
  ]) fails(() => service.revise(draft, { expectedRevision: 0, ...edit }));
  fails(() => service.revise(draft, { expectedRevision: 99 }), "EDITORIAL_DRAFT_STALE");
  service.assertCurrent(draft);
  fails(() => service.revise(JSON.parse(JSON.stringify(draft)), { expectedRevision: 0 }));
});

for (const [name, mutate] of [
  ["rename", (h) => h.commit({ type: "project.rename", name: "changed" })],
  ["commit then undo", (h) => { h.commit({ type: "project.rename", name: "changed" }); h.undo(); }],
  ["transcript removed", (h) => h.commit({ type: "transcript.remove", sourceId: "source-1", expectedTranscriptDigest: h.current.sourceTranscripts[0].transcriptDigest })]
]) test(`existing and new drafts are stale after ${name}`, () => {
  const { service, history, request } = fixture(); const draft = service.create(request); mutate(history);
  fails(() => service.assertCurrent(draft), "EDITORIAL_DRAFT_STALE");
  fails(() => service.create(request), "EDITORIAL_DRAFT_STALE");
  fails(() => service.revise(draft, { expectedRevision: 0 }), "EDITORIAL_DRAFT_STALE");
});

for (const [name, corrupt] of [
  ["foreign context", (a) => { a.candidate.contextId = "foreign"; }],
  ["unknown citation", (a) => { a.candidate.observations[0].evidenceReferences = ["E3"]; }],
  ["fabricated quote", (a) => { a.candidate.observations[0].quote = "fabricated"; }],
  ["fabricated source text", (a) => { a.evidence[0].text = "fabricated"; }],
  ["source alias swap", (a) => { a.evidence[0].sourceId = "source-2"; }],
  ["coverage mismatch", (a) => { a.coverage.providedEvidenceReferences = ["E1"]; }],
  ["hidden command", (a) => { a.candidate.commands = []; }],
  ["missing assessment", (_, r) => { delete r.analysisReview; }]
]) test(`rejects ${name} without project mutation`, () => {
  const { service, history, request } = fixture(); const before = history.toArchive(); corrupt(request.analysis, request);
  fails(() => service.create(request)); assert.deepEqual(history.toArchive(), before);
});

test("partial coverage and unresolved equivalence stay explicit, never authorize removing an alternative", () => {
  const { service, request } = fixture(); request.analysis.coverage.status = "partial"; request.analysis.coverage.sourcesWithRemainingEvidence = ["S2"];
  const draft = service.create(request);
  assert.equal(draft.analysis.coverage.status, "partial");
  assert.equal(draft.analysis.candidate.relations[0].kind, "possible-equivalence");
  assert.equal(draft.blocks.length, 5);
});

for (const [name, corrupt] of [
  ["complete coverage omitting an available source", omitSecondSourceEvidence],
  ["available source classified as no-speech", (a) => { a.coverage.noSpeechSourceReferences = ["S2"]; }],
  ["available source classified as unavailable", (a) => { a.coverage.status = "partial"; a.coverage.transcriptUnavailableSourceReferences = ["S2"]; }],
  ["overlapping source classifications", (a) => { a.coverage.status = "partial"; a.coverage.noSpeechSourceReferences = ["S2"]; a.coverage.transcriptUnavailableSourceReferences = ["S2"]; }]
]) test(`rejects ${name} against canonical source availability`, () => {
  const { service, history, request } = fixture(); const before = history.toArchive(); corrupt(request.analysis);
  fails(() => service.create(request)); assert.deepEqual(history.toArchive(), before);
});

test("a source omitted from partial coverage remains explicitly outstanding", () => {
  const { service, request } = fixture(); omitSecondSourceEvidence(request.analysis);
  request.analysis.coverage.status = "partial";
  fails(() => service.create(request));
  request.analysis.coverage.sourcesWithRemainingEvidence = ["S2"];
  const draft = service.create(request);
  assert.equal(draft.evidence.length, 1);
  assert.deepEqual(draft.analysis.coverage.sourcesWithRemainingEvidence, ["S2"]);
});

for (const [basis, timing, raw, expected] of [
  ["segments", "none", "  Hello\n   world  ", "Hello world"],
  ["words", "model", "Hello , world !", "Hello, world!"]
]) test(`accepts canonical ${basis} rendering with normalized whitespace and punctuation`, () => {
  const { service, history, request } = fixture("en-US", timing, [raw, "Other source"]);
  const before = history.toArchive();
  const projected = new EditorialTranscriptProjectionService(history).project().reasoningUnits.find((item) => item.sourceId === "source-1");
  assert.equal(projected.text, expected);
  request.analysis.evidence[0].text = projected.text;
  const draft = service.create(request);
  assert.equal(draft.evidence[0].text, expected);
  request.analysis.evidence[0].text = "fabricated";
  fails(() => service.create(request));
  assert.deepEqual(history.toArchive(), before);
});

test("PT-BR and EN-US share the same behavior with localized proposal and errors", () => {
  const results = ["pt-BR", "en-US"].map((locale) => {
    const f = fixture(locale); const draft = f.service.create(f.request);
    assert.equal(draft.blocks.length, 5); assert.equal(draft.locale, locale);
    let message; try { f.service.revise(draft, { expectedRevision: 9 }); } catch (error) { message = error.message; }
    return { title: draft.title, caveat: draft.blocks[1].title, message };
  });
  assert.notEqual(results[0].title, results[1].title);
  assert.notEqual(results[0].caveat, results[1].caveat);
  assert.notEqual(results[0].message, results[1].message);
});

test("word evidence retains canonical word links without turning source timing into a cut plan", () => {
  const { service, request } = fixture("pt-BR", "model");
  const draft = service.create(request);
  assert.equal(draft.evidence[0].basis, "words");
  assert.equal(draft.evidence[0].timingBasis, "model");
  assert.deepEqual(draft.evidence[0].wordIds, request.analysis.evidence[0].wordIds);
  assert.equal("startMs" in draft.evidence[0], false);
  const changed = structuredClone(request); changed.analysis.evidence[0].wordIds.reverse();
  fails(() => service.create(changed));
});
