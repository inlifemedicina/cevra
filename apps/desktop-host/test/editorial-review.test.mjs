import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ProjectHistory } from "@cevra/project-ir";
import { DesktopSession, DesktopHostProtocolServer } from "../dist/index.js";

// One canonical synthetic fixture shared by host and visible desktop review.
const fixture = JSON.parse(await readFile(new URL("../../desktop/src/fixtures/editorial-review.json", import.meta.url), "utf8"));
function setup(admit = true) {
  const input = structuredClone(fixture);
  const history = ProjectHistory.fromArchive(input.history);
  let checkpoints = 0;
  const session = new DesktopSession({ history, mediaCapability: { available: false, reason: "runtime-not-configured" }, transcriptionCapability: { available: false, reason: "runtime-not-configured" }, persistence: { state: "local-unsaved", async checkpoint() { checkpoints++; } } });
  if (admit) session.acceptEditorialAnalysis(input.request);
  const lines = [];
  const server = new DesktopHostProtocolServer(session, { writeProtocolLine(line) { lines.push(JSON.parse(line)); }, writeLog() {}, requestShutdown() {} });
  async function call(method, params = {}) { await server.handleLine(JSON.stringify({ protocolVersion: 1, id: "review", method, params })); return lines.at(-1); }
  return { input, history, session, call, checkpoints: () => checkpoints };
}

test("trusted admission and wire query preserve five blocks, evidence, provenance and PARTIAL without history/persistence mutation", async () => {
  const f = setup(); const before = f.history.toArchive();
  const state = (await f.call("editorial.snapshot")).result;
  assert.equal(state.status, "current"); assert.equal(state.draft.blocks.length, 5);
  assert.deepEqual(state.draft.analysis.provenance, fixture.request.analysis.provenance);
  assert.deepEqual(state.draft.analysisReview, fixture.request.analysisReview);
  assert.equal(state.draft.analysisReview.citationSupport, "PARTIAL");
  assert.deepEqual(state.draft.caveatObservationIds, ["observation-2", "observation-5"]);
  assert.equal(state.draft.analysis.candidate.relations.length, 2);
  assert.equal(JSON.stringify(state).includes("file:///"), false);
  assert.equal(state.draft.evidence.some(e => "startMs" in e || "endMs" in e), false);
  state.draft.analysisReview.citationSupport = "PASS";
  f.input.request.analysis.candidate.observations[0].statement = "forged";
  assert.equal(f.session.editorialState().draft.analysisReview.citationSupport, "PARTIAL");
  assert.notEqual(f.session.editorialState().draft.analysis.candidate.observations[0].statement, "forged");
  assert.deepEqual(f.history.toArchive(), before); assert.equal(f.checkpoints(), 0);
});

test("wire revisions use service-owned identity and preserve immutable analysis and redo", async () => {
  const f = setup(); const before = f.history.toArchive(); const original = f.session.editorialState().draft;
  const order = original.blocks.map(b => b.id).reverse();
  const result = await f.call("editorial.revise", { expectedRevision: 0, blockOrder: order, blockEdits: [{ blockId: "observation-2", title: "Condição essencial", userNote: "Preservar junto ao prazo." }] });
  assert.equal(result.result.draft.revision, 1);
  assert.deepEqual(result.result.draft.blocks.map(b => b.id), order);
  assert.equal(result.result.draft.blocks[3].title, "Condição essencial");
  assert.deepEqual(result.result.draft.analysis, original.analysis);
  assert.deepEqual(result.result.draft.evidence, original.evidence);
  assert.deepEqual(result.result.draft.analysisReview, original.analysisReview);
  assert.equal((await f.call("editorial.revise", { expectedRevision: 0 })).error.code, "EDITORIAL_DRAFT_STALE");
  assert.equal(f.session.editorialState().draft.revision, 1);
  assert.deepEqual(f.history.toArchive(), before); assert.equal(f.history.canRedo, true); assert.equal(f.checkpoints(), 0);
});

test("WebView cannot admit an analysis, impersonate a draft, change citations or remove/duplicate blocks", async () => {
  const f = setup(); const original = f.session.editorialState();
  assert.equal((await f.call("editorial.accept", fixture.request)).error.code, "HOST_UNKNOWN_METHOD");
  assert.equal((await f.call("editorial.snapshot", { analysis: fixture.request.analysis })).error.code, "HOST_INVALID_PARAMS");
  for (const params of [
    { expectedRevision: 0, draft: original.draft }, { expectedRevision: 0, commands: [] },
    { expectedRevision: 0, blockOrder: ["observation-1"] },
    { expectedRevision: 0, blockOrder: original.draft.blocks.map(() => "observation-1") },
    { expectedRevision: 0, blockEdits: [{ blockId: "observation-1", evidenceReferences: ["E2"] }] },
    { expectedRevision: 0, blockEdits: [{ blockId: "observation-1", title: " ".repeat(5) }] },
    { expectedRevision: 0, blockEdits: [{ blockId: "observation-1", userNote: "x".repeat(2001) }] }
  ]) assert.ok((await f.call("editorial.revise", params)).error);
  assert.deepEqual(f.session.editorialState(), original); assert.equal(f.checkpoints(), 0);
});

test("empty host and rejected trusted binding cannot acquire editing or analysis authority", async () => {
  const f = setup(false); assert.deepEqual((await f.call("editorial.snapshot")).result, { status: "empty" });
  assert.equal((await f.call("editorial.revise", { expectedRevision: 0 })).error.code, "EDITORIAL_DRAFT_UNAVAILABLE");
  f.input.request.analysis.binding.projectId = "foreign-project";
  assert.throws(() => f.session.acceptEditorialAnalysis(f.input.request), error => error.code === "EDITORIAL_DRAFT_STALE");
  assert.deepEqual(f.session.editorialState(), { status: "empty" });
});

test("one-shot admission prevents a stale revision-0 client from editing a replacement analysis", async () => {
  const f = setup(); const original = f.session.editorialState();
  const other = structuredClone(fixture.request);
  other.analysis.executionId = "other-execution";
  other.analysis.contextId = "other-context";
  other.analysis.candidate.contextId = "other-context";
  assert.throws(() => f.session.acceptEditorialAnalysis(other), error => error.code === "EDITORIAL_DRAFT_ALREADY_ACCEPTED");
  assert.deepEqual(f.session.editorialState(), original);
  const revised = (await f.call("editorial.revise", { expectedRevision: 0, blockEdits: [{ blockId: "observation-1", userNote: "Original-context note" }] })).result;
  assert.equal(revised.draft.analysis.contextId, original.draft.analysis.contextId);
  assert.equal(revised.draft.blocks[0].userNote, "Original-context note");
});

for (const [name, mutate] of [
  ["redo", async f => f.session.redo()],
  ["commit then undo", async f => { f.history.commit({ type: "project.rename", name: "changed" }); await f.session.undo(); }],
  ["transcript removal", async f => f.history.commit({ type: "transcript.remove", sourceId: "source-1", expectedTranscriptDigest: f.history.current.sourceTranscripts[0].transcriptDigest })]
]) test(`draft remains stale after ${name}; refreshing cannot silently re-admit it`, async () => {
  const f = setup(); await mutate(f);
  assert.deepEqual((await f.call("editorial.snapshot")).result, { status: "stale" });
  assert.equal((await f.call("editorial.revise", { expectedRevision: 0 })).error.code, "EDITORIAL_DRAFT_STALE");
  assert.throws(() => f.session.acceptEditorialAnalysis(fixture.request), error => error.code === "EDITORIAL_DRAFT_ALREADY_ACCEPTED");
});
