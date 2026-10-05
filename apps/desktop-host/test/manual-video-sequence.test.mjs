import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ManualVideoSequenceApplicationService } from "@cevra/application";
import { NodeMediaArtifactStore } from "@cevra/media-ffmpeg";
import { DesktopSession, DesktopProjectPersistence, DesktopHostProtocolServer } from "../dist/index.js";

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), "cevra-manual-sequence-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const opened = await DesktopProjectPersistence.open(join(root, "store"));
  const sources = [];
  for (const id of ["s0", "s1"]) {
    const path = join(root, `${id}.mp4`);
    const bytes = Buffer.from(`owned ${id} transport fixture, no playback claim`);
    await writeFile(path, bytes); sources.push({ path, bytes });
    opened.history.commit({ type: "source.add", source: { id, kind: "video", uri: path, displayName: `${id}.mp4`, durationMs: 6000,
      technicalDescriptor: { version: 1, basis: "ingest", content: { sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length },
        method: { profile: "cevra.source-technical.v1", engineId: "test", engineVersion: "1", engineApiVersion: 1 }, video: { codec: "h264" } },
      extensions: { "cevra.ingest": { method: "local", hasVideo: true } } } });
  }
  await opened.persistence.checkpoint(opened.history);
  let occurrence = 0;
  const service = new ManualVideoSequenceApplicationService({ history: opened.history, identity: new NodeMediaArtifactStore(), idGenerator: () => String(++occurrence) });
  const unavailable = { available: false, reason: "runtime-not-configured" };
  const session = new DesktopSession({ history: opened.history, persistence: opened.persistence, manualVideoSequence: service,
    mediaCapability: unavailable, transcriptionCapability: unavailable });
  t.after(() => session.close());
  const lines = [];
  const server = new DesktopHostProtocolServer(session, { writeProtocolLine(line) { lines.push(JSON.parse(line)); }, writeLog() {}, requestShutdown() {} });
  const edit = async (intent) => {
    await server.handleLine(JSON.stringify({ protocolVersion: 1, id: `request-${lines.length}`, method: "video.editManualSequence",
      params: { version: 1, expectedSnapshotId: opened.history.current.history.headSnapshotId, ...intent } }));
    return lines.at(-1);
  };
  return { root, opened, session, service, sources, edit };
}

test("production sequence RPC checkpoints all intents as one action and reopens the Undo/Redo branch", async t => {
  const f = await setup(t); const numbering = f.opened.history.sourceNumbering;
  const actions = [
    { type: "append", sourceId: "s0", sourceStartMs: 0, sourceEndMs: 700 },
    { type: "append", sourceId: "s0", sourceStartMs: 900, sourceEndMs: 1500 },
    { type: "insert", beforeClipId: "clip-2", sourceId: "s1", sourceStartMs: 300, sourceEndMs: 1000 },
    { type: "duplicate", clipId: "clip-1" },
    { type: "trim", clipId: "clip-3", sourceStartMs: 400, sourceEndMs: 800 },
    { type: "split", clipId: "clip-2", timelineAtMs: 2000 },
    { type: "reorder", clipIds: ["clip-5", "clip-2", "clip-3", "clip-4", "clip-1"] },
    { type: "remove", clipId: "clip-4" }
  ];
  for (const action of actions) {
    const before = f.opened.history.current; const entries = f.opened.history.entries.length;
    const response = await f.edit(action);
    assert.equal(response.error, undefined);
    assert.equal(response.result.state.status.persistence, "local-saved");
    assert.equal(f.opened.history.entries.length, entries + 1);
    assert.equal(f.opened.history.entries.at(-1).command.type, "timeline.edit");
    assert.deepEqual(f.opened.history.sourceNumbering, numbering);
    const after = f.opened.history.current;
    assert.deepEqual((await f.session.undo()).project, before);
    assert.deepEqual((await f.session.redo()).project, after);
  }
  const final = f.opened.history.current;
  await f.session.undo(); await f.session.close();
  const reopened = await DesktopProjectPersistence.open(join(f.root, "store"));
  t.after(() => reopened.persistence.close());
  assert.equal(reopened.history.canRedo, true);
  reopened.history.redo(); assert.deepEqual(reopened.history.current, final);
  assert.deepEqual(reopened.history.sourceNumbering, numbering);
  for (const source of f.sources) assert.deepEqual(await readFile(source.path), source.bytes);
});

test("closed sequence RPC rejects paths, nested commands, stale and overlong bindings without mutation", async t => {
  const f = await setup(t); const before = f.opened.history.toArchive();
  for (const injected of [{ path: "/tmp/foreign" }, { edits: [] }, { type: "timeline.edit" }, { expectedSnapshotId: "stale" }, { sourceId: "x".repeat(129) }]) {
    const response = await f.edit({ type: "append", sourceId: "s0", sourceStartMs: 0, sourceEndMs: 700, ...injected });
    assert.ok(response.error);
  }
  assert.deepEqual(f.opened.history.toArchive(), before);
});

test("native close freeze rejects sequence mutation and no-op does not rotate checkpoints", async t => {
  const f = await setup(t);
  await f.edit({ type: "append", sourceId: "s0", sourceStartMs: 0, sourceEndMs: 700 });
  const currentPath = join(f.root, "store", "active-project.current.cevra.json");
  const saved = await readFile(currentPath);
  const before = f.opened.history.toArchive();
  const noOp = await f.edit({ type: "trim", clipId: "clip-1", sourceStartMs: 0, sourceEndMs: 700 });
  assert.deepEqual(noOp.result.changedClipIds, []);
  assert.deepEqual(await readFile(currentPath), saved);
  assert.deepEqual(f.opened.history.toArchive(), before);
  f.session.prepareClose("sequence-close");
  assert.equal((await f.edit({ type: "duplicate", clipId: "clip-1" })).error.code, "PROJECT_CLOSE_PENDING");
  assert.deepEqual(f.opened.history.toArchive(), before);
  f.session.cancelClose("sequence-close");
});
