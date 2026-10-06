import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, readFile, readdir, rm, mkdir, rename, symlink, link, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ManualSequenceExportPreparationApplicationService, ManualVideoSequenceApplicationService } from "@cevra/application";
import { NodeMediaArtifactStore } from "@cevra/media-ffmpeg";
import { DesktopSession, DesktopProjectPersistence, DesktopHostProtocolServer, NativeManualExportDestination } from "../dist/index.js";

async function fixture(t, serviceOverride) {
  const root = await mkdtemp(join(tmpdir(), "cevra-export-preparation-")); t.after(() => rm(root, { recursive: true, force: true }));
  const opened = await DesktopProjectPersistence.open(join(root, "store")); const original = join(root, "original.mp4"), bytes = Buffer.from("synthetic identity fixture; no codec acceptance");
  await writeFile(original, bytes); opened.history.commit({ type: "source.add", source: { id: "s", kind: "video", uri: original, displayName: "original.mp4", durationMs: 1000,
    technicalDescriptor: { version: 1, basis: "ingest", content: { sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length }, method: { profile: "cevra.source-technical.v1", engineId: "test", engineVersion: "1", engineApiVersion: 1 }, video: { codec: "h264" } }, extensions: { "cevra.ingest": { method: "local", hasVideo: true } } } });
  const identity = new NodeMediaArtifactStore(), editor = new ManualVideoSequenceApplicationService({ history: opened.history, identity });
  await editor.edit({ version: 1, expectedSnapshotId: opened.history.current.history.headSnapshotId, type: "append", sourceId: "s", sourceStartMs: 901, sourceEndMs: 908 });
  await opened.persistence.checkpoint(opened.history);
  const service = new ManualSequenceExportPreparationApplicationService({ history: opened.history, identity });
  const unavailable = { available: false, reason: "runtime-not-configured" };
  const session = new DesktopSession({ history: opened.history, persistence: opened.persistence, manualExportPreparation: serviceOverride ?? service, mediaCapability: unavailable, transcriptionCapability: unavailable });
  t.after(() => session.close());
  const request = operationId => ({ version: 1, expectedSnapshotId: opened.history.current.history.headSnapshotId, operationId, locale: "en-US" });
  return { root, opened, original, bytes, session, request };
}

test("production preparation RPC leaves destination, checkpoint and originals untouched and returns no path", async t => {
  const f = await fixture(t); const before = f.opened.history.toArchive(), listing = await readdir(f.root), checkpointPath = join(f.root, "store", "active-project.current.cevra.json"), checkpoint = await readFile(checkpointPath);
  const lines = [], server = new DesktopHostProtocolServer(f.session, { writeProtocolLine(line) { lines.push(JSON.parse(line)); }, writeLog() {}, requestShutdown() {} });
  await server.handleLine(JSON.stringify({ protocolVersion: 1, id: "prep", method: "video.prepareManualExport", params: { ...f.request("prep"), destinationUri: join(f.root, "new.mp4") } }));
  assert.equal(lines[0].result.renderAvailable, false); assert.equal(lines[0].result.durationMs, 7);
  assert.equal(lines[0].result.destinationLabel, "new.mp4"); assert.equal(JSON.stringify(lines[0]).includes(f.root), false);
  assert.deepEqual(f.opened.history.toArchive(), before); assert.deepEqual(await readdir(f.root), listing);
  assert.deepEqual(await readFile(checkpointPath), checkpoint); assert.deepEqual(await readFile(f.original), f.bytes);
});

test("destination refuses existing outputs, original aliases and dangling links without writing", async t => {
  const f = await fixture(t); const prior = join(f.root, "prior.mp4"); await writeFile(prior, "prior output");
  const hard = join(f.root, "hard.mp4"), sym = join(f.root, "sym.mp4"), dangling = join(f.root, "dangling.mp4");
  await link(f.original, hard); await symlink(f.original, sym); await symlink(join(f.root, "absent"), dangling);
  for (const destination of [prior, f.original, hard, sym, dangling]) await assert.rejects(f.session.prepareManualExport(f.request("refuse"), destination), { code: "MANUAL_EXPORT_DESTINATION_EXISTS" });
  assert.equal(await readFile(prior, "utf8"), "prior output"); assert.deepEqual(await readFile(f.original), f.bytes);
});

test("directory replacement, destination race and unavailable space invalidate read-only preparation", async t => {
  const root = await mkdtemp(join(tmpdir(), "cevra-export-destination-")); t.after(() => rm(root, { recursive: true, force: true }));
  const folder = join(root, "destination"); await mkdir(folder);
  const port = new NativeManualExportDestination(join(folder, "new.mp4"), { temporaryRoot: root }); const prepared = await port.prepare(1);
  await rename(folder, join(root, "old")); await mkdir(folder);
  await assert.rejects(port.revalidate(prepared, 1), { code: "MANUAL_EXPORT_DESTINATION_CHANGED" });
  const other = new NativeManualExportDestination(join(folder, "new.mp4"), { temporaryRoot: root }), target = await other.prepare(1);
  await writeFile(join(folder, "new.mp4"), "foreign arrival"); await assert.rejects(other.revalidate(target, 1), { code: "MANUAL_EXPORT_DESTINATION_EXISTS" });
  const info = await statfs(root); const space = new NativeManualExportDestination(join(folder, "space.mp4"), { temporaryRoot: root });
  assert.ok(info.bavail * info.bsize < Number.MAX_SAFE_INTEGER);
  await assert.rejects(space.prepare(Number.MAX_SAFE_INTEGER), { code: "MANUAL_EXPORT_NO_SPACE" });
  assert.equal(await readFile(join(folder, "new.mp4"), "utf8"), "foreign arrival");
});

test("cancel and supersession retire preparation before a replacement starts and close preserves history", async t => {
  let release, started, calls = 0; const begin = new Promise(resolve => { started = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const service = { async prepare(request, _destination, signal) { ++calls; if (calls === 1) { started(); await gate; } signal.throwIfAborted(); return { operationId: request.operationId, renderAvailable: false }; } };
  const f = await fixture(t, service), before = f.opened.history.toArchive();
  const first = f.session.prepareManualExport(f.request("first"), join(f.root, "first.mp4")); const rejected = assert.rejects(first, { name: "AbortError" }); await begin;
  assert.throws(() => f.session.prepareClose("during-prep"), { code: "PROJECT_CLOSE_BUSY" });
  const second = f.session.prepareManualExport(f.request("second"), join(f.root, "second.mp4")); await Promise.resolve(); assert.equal(calls, 1);
  release(); await rejected; assert.equal((await second).operationId, "second"); assert.equal(calls, 2); assert.deepEqual(f.opened.history.toArchive(), before);
});

test("edit/Undo during an uncooperative late Host preparation cannot publish success", async t => {
  let release, started; const begin = new Promise(resolve => { started = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, { async prepare() { started(); await gate; return { renderAvailable: false }; } });
  const preparing = f.session.prepareManualExport(f.request("late"), join(f.root, "late.mp4")); const rejected = assert.rejects(preparing, { code: "MANUAL_EXPORT_STALE" }); await begin;
  f.opened.history.commit({ type: "project.rename", name: "during preparation" }); f.opened.history.undo(); release(); await rejected;
  assert.equal(f.opened.history.canRedo, true);
});
