import assert from "node:assert/strict";
import { access, chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { computeTranscriptDigest } from "@cevra/project-ir";
import { DesktopProjectPersistence, DesktopSession } from "../dist/index.js";

const now = "2026-09-15T12:00:00.000Z";
const unavailable = { available: false, reason: "runtime-not-configured" };
const hostRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function temporaryRoot(t) {
  const root = await mkdtemp(resolve(tmpdir(), "cevra-persistence-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function options() {
  let sequence = 0;
  return {
    initialProject: undefined,
    historyOptions: { idGenerator: () => `persist-${++sequence}`, clock: () => now },
    clock: () => now
  };
}

test("true first run creates one durable canonical ProjectHistory", async (t) => {
  const root = await temporaryRoot(t);
  const opened = await DesktopProjectPersistence.open(root, options());
  assert.equal(opened.firstRun, true);
  assert.equal(opened.persistence.state, "local-saved");
  assert.equal(opened.history.current.sources.length, 0);
  await readFile(resolve(root, "active-project.current.cevra.json"), "utf8");
  await readFile(resolve(root, "active-project.previous.cevra.json"), "utf8");
});

test("save close reopen preserves exact history, IDs, source URI, transcript provenance, and redo cursor", async (t) => {
  const root = await temporaryRoot(t);
  const opened = await DesktopProjectPersistence.open(root, options());
  const history = opened.history;
  history.commit({ type: "source.add", source: {
    id: "source-stable", kind: "video", uri: "/Volumes/Media/source.mov", displayName: "source.mov",
    durationMs: 1234, width: 1920, height: 1080, frameRate: 30, checksum: "sha256:source"
  } });
  const transcript = {
    sourceId: "source-stable",
    wordTiming: "model",
    speakerState: "none",
    transcript: {
      language: "pt",
      words: [{ id: "word-stable", text: "Olá", startMs: 0, endMs: 400 }],
      segments: [{ id: "segment-stable", text: "Olá", startMs: 0, endMs: 400, wordIds: ["word-stable"] }]
    },
    provenance: { sourceChecksum: "sha256:source", stages: [{
      kind: "transcription", executionId: "execution-stable", engineId: "engine", engineVersion: "1.0.0",
      engineApiVersion: "1", modelId: "model", modelRevision: "rev", modelDigest: "sha256:model", createdAt: now
    }] },
    transcriptDigest: ""
  };
  transcript.transcriptDigest = computeTranscriptDigest(transcript);
  history.commit({ type: "transcript.set", transcript });
  history.commit({ type: "project.rename", name: "Durable CEVRA" });
  history.undo();
  await opened.persistence.checkpoint(history);

  const before = { current: history.current, archive: history.toArchive(), canUndo: history.canUndo, canRedo: history.canRedo };
  const reopened = await DesktopProjectPersistence.open(root, options());
  assert.equal(reopened.firstRun, false);
  assert.deepEqual(reopened.history.current, before.current);
  assert.deepEqual(reopened.history.toArchive(), before.archive);
  assert.equal(reopened.history.current.project.id, before.current.project.id);
  assert.equal(reopened.history.current.sources[0].id, "source-stable");
  assert.equal(reopened.history.current.sources[0].uri, "/Volumes/Media/source.mov");
  assert.equal(reopened.history.current.sourceTranscripts[0].transcriptDigest, transcript.transcriptDigest);
  assert.deepEqual(reopened.history.current.sourceTranscripts[0].provenance, transcript.provenance);
  assert.equal(reopened.history.canUndo, true);
  assert.equal(reopened.history.canRedo, true);
  assert.equal(reopened.history.redo().project.name, "Durable CEVRA");
});

test("every session mutation checkpoints before returning success", async (t) => {
  const root = await temporaryRoot(t);
  const opened = await DesktopProjectPersistence.open(root, options());
  const history = opened.history;
  let sourceSequence = 0;
  const session = new DesktopSession({
    history,
    persistence: opened.persistence,
    mediaCapability: { available: true, reason: "available" },
    transcriptionCapability: { available: true, reason: "available" },
    ingest: { async ingest({ uri, displayName }) {
      const source = { id: `source-${++sourceSequence}`, kind: "video", uri, displayName, durationMs: 1000 };
      history.commit({ type: "source.add", source });
      return { source };
    } },
    transcription: { async transcribeSource({ sourceId }) {
      const transcript = {
        sourceId, wordTiming: "model", speakerState: "none",
        transcript: {
          words: [{ id: "word", text: "Teste", startMs: 0, endMs: 300 }],
          segments: [{ id: "segment", text: "Teste", startMs: 0, endMs: 300, wordIds: ["word"] }]
        },
        provenance: { stages: [{ kind: "transcription", executionId: "e", engineId: "test", engineVersion: "1", engineApiVersion: "1", modelId: "test", createdAt: now }] },
        transcriptDigest: ""
      };
      transcript.transcriptDigest = computeTranscriptDigest(transcript);
      history.commit({ type: "transcript.set", transcript });
    } }
  });
  const imported = await session.ingestLocal({ uri: "/media/a.mov", displayName: "a.mov", operationId: "import", locale: "pt-BR" });
  assert.equal(imported.state.status.persistence, "local-saved");
  assert.equal((await DesktopProjectPersistence.open(root)).history.current.sources.length, 1);
  await session.transcribeSource({ sourceId: "source-1", operationId: "transcribe", locale: "pt-BR" });
  assert.equal((await DesktopProjectPersistence.open(root)).history.current.sourceTranscripts.length, 1);
  await session.undo();
  let reopened = await DesktopProjectPersistence.open(root);
  assert.equal(reopened.history.current.sourceTranscripts.length, 0);
  assert.equal(reopened.history.canRedo, true);
  await session.redo();
  reopened = await DesktopProjectPersistence.open(root);
  assert.equal(reopened.history.current.sourceTranscripts.length, 1);
  assert.equal(reopened.history.canRedo, false);
});

test("invalid current recovers previous, quarantines evidence, and surfaces recovery", async (t) => {
  const root = await temporaryRoot(t);
  const opened = await DesktopProjectPersistence.open(root, options());
  opened.history.commit({ type: "project.rename", name: "newer" });
  await opened.persistence.checkpoint(opened.history);
  await writeFile(resolve(root, "active-project.current.cevra.json"), "corrupt-current", "utf8");

  const recovered = await DesktopProjectPersistence.open(root, options());
  assert.equal(recovered.persistence.state, "local-recovered");
  assert.equal(recovered.history.current.project.name, "CEVRA Vids");
  assert.equal(await readFile(resolve(root, "active-project.invalid-current.cevra.json"), "utf8"), "corrupt-current");
  await assert.doesNotReject(() => DesktopProjectPersistence.open(root, options()));
});

test("a supervisor-declared host restart surfaces recovery even when current is valid", async (t) => {
  const root = await temporaryRoot(t);
  const initial = await DesktopProjectPersistence.open(root, options());
  initial.history.commit({ type: "project.rename", name: "Recovered durable project" });
  await initial.persistence.checkpoint(initial.history);
  const recovered = await DesktopProjectPersistence.open(root, { ...options(), recoveredSession: true });
  assert.equal(recovered.history.current.project.name, "Recovered durable project");
  assert.equal(recovered.persistence.state, "local-recovered");
});

test("real Desktop Host process restart restores the same durable project session", async (t) => {
  const root = await temporaryRoot(t);
  const opened = await DesktopProjectPersistence.open(root, options());
  const projectId = opened.history.current.project.id;
  opened.history.commit({ type: "source.add", source: {
    id: "restart-source", kind: "audio", uri: "/media/restart.wav", displayName: "restart.wav", durationMs: 900
  } });
  await opened.persistence.checkpoint(opened.history);

  const first = await runHost(root, false);
  assert.equal(first.snapshot.project.project.id, projectId);
  assert.equal(first.snapshot.project.sources[0].id, "restart-source");
  assert.equal(first.snapshot.project.sources[0].uri, "/media/restart.wav");
  assert.equal(first.snapshot.project.history.revision, 1);
  assert.equal(first.snapshot.status.persistence, "local-saved");

  const recovered = await runHost(root, true);
  assert.deepEqual(recovered.snapshot.project, first.snapshot.project);
  assert.equal(recovered.snapshot.canUndo, true);
  assert.equal(recovered.snapshot.status.persistence, "local-recovered");
});

test("corrupt current and previous fail closed without replacing evidence or creating an empty project", async (t) => {
  const root = await temporaryRoot(t);
  await DesktopProjectPersistence.open(root, options());
  const current = resolve(root, "active-project.current.cevra.json");
  const previous = resolve(root, "active-project.previous.cevra.json");
  await writeFile(current, "bad-current", "utf8");
  await writeFile(previous, "bad-previous", "utf8");
  await assert.rejects(() => DesktopProjectPersistence.open(root, options()), { code: "PROJECT_PERSISTENCE_CORRUPT" });
  assert.equal(await readFile(current, "utf8"), "bad-current");
  assert.equal(await readFile(previous, "utf8"), "bad-previous");
});

test("quarantine evidence without a canonical checkpoint is not mistaken for first run", async (t) => {
  const root = await temporaryRoot(t);
  await writeFile(resolve(root, "active-project.invalid-current.cevra.json"), "evidence", "utf8");
  await assert.rejects(() => DesktopProjectPersistence.open(root, options()), { code: "PROJECT_PERSISTENCE_CORRUPT" });
  assert.equal(await readFile(resolve(root, "active-project.invalid-current.cevra.json"), "utf8"), "evidence");
});

test("orphan temporary checkpoint is ignored on a genuine first run", async (t) => {
  const root = await temporaryRoot(t);
  await writeFile(resolve(root, ".active-project-checkpoint-orphan.next"), "partial", "utf8");
  const opened = await DesktopProjectPersistence.open(root, options());
  assert.equal(opened.firstRun, true);
  assert.equal(opened.history.current.history.revision, 0);
  await assert.rejects(() => access(resolve(root, ".active-project-checkpoint-orphan.next")), { code: "ENOENT" });
});

test("checkpoint failure keeps mutated memory, reports error, and never reports saved", async (t) => {
  const root = await temporaryRoot(t);
  const opened = await DesktopProjectPersistence.open(root, options());
  const history = opened.history;
  const session = new DesktopSession({
    history,
    persistence: opened.persistence,
    mediaCapability: { available: true, reason: "available" },
    transcriptionCapability: unavailable,
    ingest: { async ingest({ uri, displayName }) {
      const source = { id: "memory-only-source", kind: "video", uri, displayName, durationMs: 1000 };
      history.commit({ type: "source.add", source });
      return { source };
    } }
  });
  await chmod(root, 0o500);
  try {
    await assert.rejects(() => session.ingestLocal({
      uri: "/media/memory-only.mov", displayName: "memory-only.mov", operationId: "failed-save", locale: "pt-BR"
    }), (error) => {
      assert.equal(error.code, "PROJECT_PERSISTENCE_FAILED");
      assert.equal(error.details.state.status.persistence, "persistence-error");
      assert.equal(error.details.state.project.sources[0].id, "memory-only-source");
      return true;
    });
    assert.equal(session.state().status.persistence, "persistence-error");
    assert.equal(session.state().project.sources[0].id, "memory-only-source");
  } finally {
    await chmod(root, 0o700);
  }
  const durable = await DesktopProjectPersistence.open(root, options());
  assert.equal(durable.history.current.sources.length, 0);
});

async function runHost(persistenceRoot, recovered) {
  const child = spawn(process.execPath, [resolve(hostRoot, "dist", "desktop-host.cjs")], {
    env: {
      CEVRA_PROJECT_PERSISTENCE_ROOT: persistenceRoot,
      ...(recovered ? { CEVRA_HOST_RECOVERY: "1" } : {})
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  child.stdin.write(`${JSON.stringify({ protocolVersion: 1, id: "state", method: "project.snapshot", params: {} })}\n`);
  child.stdin.write(`${JSON.stringify({ protocolVersion: 1, id: "shutdown", method: "host.shutdown", params: {} })}\n`);
  const code = await new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", resolvePromise);
  });
  assert.equal(code, 0, stderr);
  const messages = stdout.trim().split("\n").map((line) => JSON.parse(line));
  return { snapshot: messages.find((message) => message.id === "state").result };
}
