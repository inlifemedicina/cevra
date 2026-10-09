import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, symlink, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import test from "node:test";
import { createProductionDesktopSession, DesktopHostProtocolServer } from "../dist/index.js";

const fixture = JSON.parse(await readFile(new URL("../../desktop/src/fixtures/editorial-review.json", import.meta.url), "utf8"));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function pair(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "cevra-fa02-review-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = { state: "FIRST_FA_VALIDATED", result: structuredClone(fixture.request.analysis), invocations: 1,
    reservation: {}, transportMetrics: {}, liveAuthorized: true, providerContact: "UNKNOWN", deadlineMs: 30000 };
  const archive = structuredClone(fixture.history);
  const resultFile = join(root, "first-fa-result.private.json"), historyFile = join(root, "history-archive.json");
  const env = { CEVRA_FA02_REVIEW_ROOT: root };
  async function pin() {
    const r = JSON.stringify(result), h = JSON.stringify(archive);
    await writeFile(resultFile, r); await writeFile(historyFile, h);
    env.CEVRA_FA02_RESULT_SHA256 = hash(r); env.CEVRA_FA02_HISTORY_SHA256 = hash(h);
  }
  await pin();
  return { root, result, archive, resultFile, historyFile, env, pin };
}
function protocol(session) {
  const lines = [];
  const server = new DesktopHostProtocolServer(session, { writeProtocolLine(line) { lines.push(JSON.parse(line)); }, writeLog() {}, requestShutdown() {} });
  return async (method, params = {}) => { await server.handleLine(JSON.stringify({ protocolVersion: 1, id: "review", method, params })); return lines.at(-1); };
}

test("native startup pair creates temporary review without opening or writing the active project store", async t => {
  const p = await pair(t), before = [await readFile(p.resultFile), await readFile(p.historyFile)];
  const session = await createProductionDesktopSession({ ...p.env, CEVRA_PROJECT_PERSISTENCE_ROOT: join(p.root, "never-opened-store"), CEVRA_MEDIA_RUNTIME_ROOT: join(p.root, "never-opened-runtime") });
  t.after(() => session.close()); const call = protocol(session);
  const state = (await call("project.snapshot")).result;
  assert.equal(state.status.persistence, "temporary-review");
  assert.equal(state.canUndo, false); assert.equal(state.canRedo, false);
  assert.deepEqual(state.capabilities, { mediaImport: { available: false, reason: "review-session" }, transcription: { available: false, reason: "review-session" }, manualExport: { available: false, reason: "review-session" } });
  const original = (await call("editorial.snapshot")).result.draft;
  assert.equal(original.blocks.length, 5); assert.equal(original.analysisReview.citationSupport, "PARTIAL");
  assert.equal(original.caveatObservationIds.length, 2); assert.deepEqual(original.analysis.candidate, p.result.result.candidate);
  const revision = await call("editorial.revise", { expectedRevision: 0, blockOrder: original.blocks.map(b => b.id).reverse(), blockEdits: [{ blockId: original.blocks[0].id, title: "Título de revisão", userNote: "Nota local" }] });
  assert.equal(revision.result.draft.revision, 1);
  assert.deepEqual(revision.result.draft.analysis, original.analysis);
  for (const method of ["history.undo", "history.redo"]) assert.equal((await call(method)).error.code, "EDITORIAL_REVIEW_READ_ONLY");
  assert.equal((await call("editorial.accept", p.result)).error.code, "HOST_UNKNOWN_METHOD");
  assert.deepEqual(session.state().project, state.project);
  assert.deepEqual([await readFile(p.resultFile), await readFile(p.historyFile)], before);
  await assert.rejects(readFile(join(p.root, "never-opened-store/current.json")), { code: "ENOENT" });
  await session.close();
  const restarted = await createProductionDesktopSession(p.env);
  assert.equal(restarted.editorialState().draft.revision, 0); await restarted.close();
});

test("partial designation, changed bytes and automatic recovery fail without fallback to project persistence", async t => {
  const p = await pair(t);
  for (const env of [{ CEVRA_FA02_REVIEW_ROOT: p.root }, { ...p.env, CEVRA_FA02_HISTORY_SHA256: "bad" }, { ...p.env, CEVRA_HOST_RECOVERY: "1" }]) {
    await assert.rejects(createProductionDesktopSession(env), e => e.code === "EDITORIAL_REVIEW_UNAVAILABLE" && !e.message.includes(p.root));
  }
  await writeFile(p.resultFile, (await readFile(p.resultFile, "utf8")) + " ");
  await assert.rejects(createProductionDesktopSession(p.env), { code: "EDITORIAL_REVIEW_UNAVAILABLE" });
});

test("pinned bytes do not waive current binding, canonical citations or terminal F-A02 metadata validation", async t => {
  for (const change of [
    p => { p.result.state = "FAILED"; }, p => { p.result.invocations = 2; }, p => { p.result.extra = "not-allowed"; }, p => { p.result.providerContact = false; },
    p => { p.result.result.binding.projectId = "foreign-project"; },
    p => { p.result.result.candidate.observations[0].quote = "fabricated evidence"; }
  ]) {
    const p = await pair(t); change(p); await p.pin();
    await assert.rejects(createProductionDesktopSession(p.env), e => ["EDITORIAL_REVIEW_UNAVAILABLE", "EDITORIAL_DRAFT_STALE", "EDITORIAL_DRAFT_INVALID"].includes(e.code));
  }
});

test("admission rejects oversized files, file symlinks and root aliases", async t => {
  const p = await pair(t);
  await writeFile(p.resultFile, "x".repeat(256 * 1024 + 1));
  await assert.rejects(createProductionDesktopSession(p.env), { code: "EDITORIAL_REVIEW_UNAVAILABLE" });
  await p.pin(); const target = join(p.root, "copy.json"); await writeFile(target, await readFile(p.resultFile));
  await rm(p.resultFile); await symlink(target, p.resultFile);
  await assert.rejects(createProductionDesktopSession(p.env), { code: "EDITORIAL_REVIEW_UNAVAILABLE" });
  const alias = resolve(p.root + "-alias"); await symlink(p.root, alias, process.platform === "win32" ? "junction" : "dir"); t.after(() => rm(alias, { force: true }));
  await assert.rejects(createProductionDesktopSession({ ...p.env, CEVRA_FA02_REVIEW_ROOT: alias }), { code: "EDITORIAL_REVIEW_UNAVAILABLE" });
});
