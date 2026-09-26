import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  DesktopMediaExecutionArchiveError,
  DesktopMediaExecutionArchiveFullError,
  DesktopMediaExecutionRepository,
  DesktopProjectPersistence,
  DesktopSession,
  MEDIA_EXECUTION_ARCHIVE_FILE,
  createProductionDesktopSession
} from "../dist/index.js";
import { __openDesktopProjectForTest } from "../dist/persistence.js";
import {
  MAX_MEDIA_EXECUTION_INTENTS,
  MAX_MEDIA_EXECUTION_ARCHIVE_BYTES,
  MAX_MEDIA_EXECUTION_RECORDS,
  MediaApplicationService,
  ResolvedAudioPlanApplicationService
} from "@cevra/application";
import { NodeMediaArtifactStore } from "@cevra/media-ffmpeg";
import { createEmptyProject, ProjectHistory } from "@cevra/project-ir";

const now = "2026-09-23T12:00:00.000Z";
const transcriptionModelRevision = "d90ca5fe260221311c53c58e660288d3deb8d356";

async function root(t) {
  const value = await mkdtemp(resolve(tmpdir(), "cevra-media-archive-"));
  t.after(() => rm(value, { recursive: true, force: true }));
  return value;
}

function record(projectId, id, status = "requested") {
  return {
    id,
    projectId,
    locale: "pt-BR",
    operation: { type: "probe", inputUri: "/tmp/source.mov" },
    mutation: { type: "none" },
    actor: { type: "system" },
    status,
    createdAt: now,
    attempts: []
  };
}

function intent(projectId, id) {
  return {
    version: 1,
    id,
    kind: "resolved-audio-plan",
    projectId,
    projectBinding: { projectId, projectRevision: 0, projectSnapshotId: "snapshot-1", projectJournalEntryCount: 0 },
    status: "requested",
    childExecutionIds: { audio: `${id}:audio`, mux: `${id}:mux` },
    exportIntent: { exportId: `${id}:export`, presetId: "preset", expectedOutputUri: "/tmp/export.mp4" },
    createdAt: now,
    updatedAt: now
  };
}

function envelope(archive) {
  return `${JSON.stringify({
    format: "cevra-media-execution-archive",
    version: 1,
    integrity: { algorithm: "sha256", value: createHash("sha256").update(JSON.stringify(archive)).digest("hex") },
    archive
  })}\n`;
}

async function installArchive(root, archive) {
  await writeFile(resolve(root, MEDIA_EXECUTION_ARCHIVE_FILE), envelope(archive), { mode: 0o600 });
}

async function openLimited(t, limits) {
  const value = await root(t);
  const project = await DesktopProjectPersistence.open(value, { clock: () => now });
  const projectId = project.history.current.project.id;
  const repository = await DesktopMediaExecutionRepository.open({
    root: value, projectId, assertOwned: async () => {}, limits
  });
  return { root: value, project, projectId, repository };
}

function fullPendingArchive(projectId, outputUri) {
  const records = Array.from({ length: MAX_MEDIA_EXECUTION_RECORDS - 1 }, (_, index) => {
    const id = `capacity-uncertain-${String(index).padStart(4, "0")}`;
    const output = `/tmp/${id}.mp4`;
    return {
      ...record(projectId, id, "failed"),
      operation: { type: "trim", inputUri: `/tmp/${"x".repeat(900)}`, outputUri: output, startMs: 0, endMs: 1000 },
      attempts: [{
        number: 1, jobId: `${id}:1`, status: "failed", requestedAt: now, completedAt: now,
        outputUris: [output], preexistingOutputUris: [], ownedOutputUris: [], removedPartialOutputUris: [],
        cleanupFailedOutputUris: [output], projectRevisionBefore: 0, errorCode: "MEDIA_RECOVERY_FAILED"
      }]
    };
  });
  records.push({
    ...record(projectId, "capacity-pending", "running"),
    operation: { type: "trim", inputUri: "/tmp/input.mp4", outputUri, startMs: 0, endMs: 1000 },
    attempts: [{
      number: 1, jobId: "capacity-pending:1", status: "running", requestedAt: now, startedAt: now,
      outputUris: [outputUri], preexistingOutputUris: [], ownedOutputUris: [outputUri],
      removedPartialOutputUris: [], cleanupFailedOutputUris: [], projectRevisionBefore: 0
    }]
  });
  const archive = { version: 1, projectId, records, intents: [] };
  let remaining = MAX_MEDIA_EXECUTION_ARCHIVE_BYTES - Buffer.byteLength(envelope(archive), "utf8");
  assert.ok(remaining > 0);
  for (const candidate of records) {
    if (remaining === 0) break;
    if (candidate.id === "capacity-pending") continue;
    const capacity = 4090 - candidate.operation.inputUri.length;
    const added = Math.min(capacity, remaining);
    candidate.operation.inputUri += "y".repeat(added);
    remaining -= added;
  }
  assert.equal(remaining, 0);
  assert.equal(Buffer.byteLength(envelope(archive), "utf8"), MAX_MEDIA_EXECUTION_ARCHIVE_BYTES);
  return archive;
}

async function installConfiguredMediaRuntime(root) {
  const runtimeRoot = resolve(root, "configured-media-runtime");
  const pythonExecutable = resolve(runtimeRoot, "python", "bin", "python3.12");
  const workerScript = resolve(runtimeRoot, "worker", "cevra_media_worker.py");
  await mkdir(resolve(runtimeRoot, "python", "bin"), { recursive: true });
  await mkdir(resolve(runtimeRoot, "worker"), { recursive: true });
  await writeFile(pythonExecutable, "fixture private Python", "utf8");
  await writeFile(workerScript, "# fixture worker\n", "utf8");
  await writeFile(resolve(runtimeRoot, "manifest.json"), JSON.stringify({
    format: "cevra-media-runtime",
    formatVersion: 1,
    python: { root: "python", executable: "python/bin/python3.12" },
    worker: { root: "worker", entrypoint: "worker/cevra_media_worker.py" }
  }), "utf8");
  return runtimeRoot;
}

async function managedTranscriptionEnvironment(root, modelCacheDir) {
  const sourcePython = process.env.CEVRA_TEST_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
  const environmentRoot = resolve(root, `transcription-env-${createHash("sha256").update(modelCacheDir).digest("hex").slice(0, 8)}`);
  const venv = spawnSync(sourcePython, ["-m", "venv", "--without-pip", environmentRoot], { encoding: "utf8" });
  assert.equal(venv.status, 0, `controlled transcription environment failed: ${venv.stderr}`);
  const pythonExecutable = resolve(environmentRoot, process.platform === "win32" ? "Scripts/python.exe" : "bin/python3");
  const details = spawnSync(pythonExecutable, ["-I", "-c", "import site,sys; print(sys.base_prefix); print(site.getsitepackages()[0])"], { encoding: "utf8" });
  assert.equal(details.status, 0, `controlled transcription probe failed: ${details.stderr}`);
  const [privatePythonRoot, sitePackages] = details.stdout.trim().split(/\r?\n/u);
  const packageRoot = resolve(sitePackages, "faster_whisper");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(resolve(packageRoot, "__init__.py"), "__version__ = \"1.2.1\"\n", "utf8");
  await installHfModelCache(modelCacheDir, "Systran/faster-whisper-base");
  return {
    CEVRA_TRANSCRIPTION_MODE: "managed",
    CEVRA_TRANSCRIPTION_PYTHON: pythonExecutable,
    CEVRA_TRANSCRIPTION_ENV_ROOT: environmentRoot,
    CEVRA_TRANSCRIPTION_MODEL_CACHE: modelCacheDir,
    CEVRA_TRANSCRIPTION_MODEL_ID: "base",
    CEVRA_PRIVATE_PYTHON_ROOT: privatePythonRoot
  };
}

async function installDirectModel(root) {
  await mkdir(root, { recursive: true });
  await writeFile(resolve(root, "config.json"), "{}", "utf8");
  await writeFile(resolve(root, "model.bin"), "model", "utf8");
  await writeFile(resolve(root, "tokenizer.json"), "{}", "utf8");
  await writeFile(resolve(root, "vocabulary.txt"), "vocabulary", "utf8");
}

async function installHfModelCache(root, repositoryId, { placement = "root", includeRef = true } = {}) {
  const repository = resolve(
    root,
    ...(placement === "hub" ? ["hub"] : []),
    `models--${repositoryId.replaceAll("/", "--")}`
  );
  const snapshot = resolve(repository, "snapshots", transcriptionModelRevision);
  await installDirectModel(snapshot);
  if (includeRef) {
    await mkdir(resolve(repository, "refs"), { recursive: true });
    await writeFile(resolve(repository, "refs", "main"), transcriptionModelRevision, "utf8");
  }
}

async function open(t, suppliedRoot) {
  const value = suppliedRoot ?? await root(t);
  let sequence = 0;
  const project = await DesktopProjectPersistence.open(value, {
    historyOptions: { idGenerator: () => `snapshot-${++sequence}`, clock: () => now },
    clock: () => now
  });
  const projectId = project.history.current.project.id;
  const repository = await project.persistence.openMediaExecutionRepository(projectId);
  return { root: value, project, projectId, repository };
}

test("empty first open writes a private integrity envelope and save/reopen is exact", async (t) => {
  const fixture = await open(t);
  const path = resolve(fixture.root, MEDIA_EXECUTION_ARCHIVE_FILE);
  const stat = await lstat(path);
  if (process.platform !== "win32") assert.equal(stat.mode & 0o777, 0o600);
  await fixture.repository.create(record(fixture.projectId, "one"));
  await fixture.repository.createIntent(intent(fixture.projectId, "intent-one"));
  const before = fixture.repository.snapshot();
  await fixture.project.persistence.close();

  const reopenedProject = await DesktopProjectPersistence.open(fixture.root, { clock: () => now });
  const reopened = await reopenedProject.persistence.openMediaExecutionRepository(fixture.projectId);
  assert.deepEqual(reopened.snapshot(), before);
  assert.equal(reopened.health, "healthy");
  await reopenedProject.persistence.close();
});

test("atomic create rejects duplicate execution and intent IDs under concurrency", async (t) => {
  const fixture = await open(t);
  const executionResults = await Promise.allSettled([
    fixture.repository.create(record(fixture.projectId, "duplicate")),
    fixture.repository.create(record(fixture.projectId, "duplicate"))
  ]);
  assert.equal(executionResults.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(executionResults.filter(({ status }) => status === "rejected").length, 1);
  assert.equal(fixture.repository.snapshot().records.length, 1);

  const intentResults = await Promise.allSettled([
    fixture.repository.createIntent(intent(fixture.projectId, "duplicate-intent")),
    fixture.repository.createIntent(intent(fixture.projectId, "duplicate-intent"))
  ]);
  assert.equal(intentResults.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(intentResults.filter(({ status }) => status === "rejected").length, 1);
  assert.equal(fixture.repository.snapshot().intents.length, 1);
  await fixture.project.persistence.close();
});

test("serialized concurrent creates retain every distinct record without temp artifacts", async (t) => {
  const fixture = await open(t);
  await Promise.all(Array.from({ length: 25 }, (_, index) => fixture.repository.create(record(fixture.projectId, `record-${index}`))));
  assert.equal(fixture.repository.snapshot().records.length, 25);
  assert.deepEqual((await readdir(fixture.root)).filter((name) => name.startsWith(".media-execution-archive-")), []);
  await fixture.project.persistence.close();
});

test("record-count pressure compacts only oldest safe terminals at the real V1 bound", async (t) => {
  const fixture = await open(t);
  await fixture.project.persistence.close();
  const records = Array.from({ length: MAX_MEDIA_EXECUTION_RECORDS }, (_, index) =>
    record(fixture.projectId, `terminal-${String(index).padStart(4, "0")}`, "succeeded"));
  await installArchive(fixture.root, { version: 1, projectId: fixture.projectId, records, intents: [] });
  const project = await DesktopProjectPersistence.open(fixture.root, { clock: () => now });
  const repository = await project.persistence.openMediaExecutionRepository(fixture.projectId);
  await repository.create(record(fixture.projectId, "new-active"));
  const snapshot = repository.snapshot();
  assert.equal(snapshot.records.length, MAX_MEDIA_EXECUTION_RECORDS);
  assert.equal(snapshot.records.some(({ id }) => id === "terminal-0000"), false);
  assert.equal(snapshot.records.some(({ id }) => id === "new-active"), true);
  await project.persistence.close();
});

test("record-count FULL with only active state is deterministic and never write-blocks the repository", async (t) => {
  const fixture = await open(t);
  await fixture.project.persistence.close();
  const records = Array.from({ length: MAX_MEDIA_EXECUTION_RECORDS }, (_, index) =>
    record(fixture.projectId, `active-${String(index).padStart(4, "0")}`));
  await installArchive(fixture.root, { version: 1, projectId: fixture.projectId, records, intents: [] });
  const project = await DesktopProjectPersistence.open(fixture.root, { clock: () => now });
  const repository = await project.persistence.openMediaExecutionRepository(fixture.projectId);
  await assert.rejects(() => repository.create(record(fixture.projectId, "does-not-fit")), DesktopMediaExecutionArchiveFullError);
  assert.ok(await repository.get("active-0000"));
  assert.equal((await repository.listByStatus(fixture.projectId, ["requested"])).length, MAX_MEDIA_EXECUTION_RECORDS);
  assert.equal(repository.snapshot().records.length, MAX_MEDIA_EXECUTION_RECORDS);
  assert.deepEqual((await readdir(fixture.root)).filter((name) => name.startsWith(".media-execution-archive-")), []);
  await project.persistence.close();
});

test("intent-count pressure compacts safe terminals without touching pending intents", async (t) => {
  const fixture = await open(t);
  await fixture.project.persistence.close();
  const intents = Array.from({ length: MAX_MEDIA_EXECUTION_INTENTS }, (_, index) => ({
    ...intent(fixture.projectId, `terminal-intent-${String(index).padStart(4, "0")}`), status: "interrupted"
  }));
  await installArchive(fixture.root, { version: 1, projectId: fixture.projectId, records: [], intents });
  const project = await DesktopProjectPersistence.open(fixture.root, { clock: () => now });
  const repository = await project.persistence.openMediaExecutionRepository(fixture.projectId);
  await repository.createIntent(intent(fixture.projectId, "new-pending-intent"));
  const snapshot = repository.snapshot();
  assert.equal(snapshot.intents.length, MAX_MEDIA_EXECUTION_INTENTS);
  assert.equal(snapshot.intents.some(({ id }) => id === "terminal-intent-0000"), false);
  assert.equal(snapshot.intents.some(({ id }) => id === "new-pending-intent"), true);
  await project.persistence.close();
});

test("byte pressure compacts safe terminals and exact/over-limit rejection never blocks reads", async (t) => {
  const fixture = await openLimited(t, { bytes: 64 * 1024 });
  await fixture.repository.create({ ...record(fixture.projectId, "byte-terminal", "succeeded"),
    operation: { type: "probe", inputUri: `/tmp/${"x".repeat(3000)}` } });
  await fixture.repository.create(record(fixture.projectId, "byte-active"));
  const before = (await lstat(resolve(fixture.root, MEDIA_EXECUTION_ARCHIVE_FILE))).size;
  await fixture.project.persistence.close();

  let project = await DesktopProjectPersistence.open(fixture.root, { clock: () => now });
  let repository = await DesktopMediaExecutionRepository.open({
    root: fixture.root, projectId: fixture.projectId, assertOwned: async () => {}, limits: { bytes: before - 1 }
  });
  await repository.save(record(fixture.projectId, "byte-active"));
  assert.equal(repository.snapshot().records.some(({ id }) => id === "byte-terminal"), false);
  assert.ok(await repository.get("byte-active"));
  await project.persistence.close();

  const exactSize = (await lstat(resolve(fixture.root, MEDIA_EXECUTION_ARCHIVE_FILE))).size;
  project = await DesktopProjectPersistence.open(fixture.root, { clock: () => now });
  repository = await DesktopMediaExecutionRepository.open({
    root: fixture.root, projectId: fixture.projectId, assertOwned: async () => {}, limits: { bytes: exactSize }
  });
  await repository.save(record(fixture.projectId, "byte-active"));
  assert.ok(await repository.get("byte-active"));
  await project.persistence.close();

  project = await DesktopProjectPersistence.open(fixture.root, { clock: () => now });
  repository = await DesktopMediaExecutionRepository.open({
    root: fixture.root, projectId: fixture.projectId, assertOwned: async () => {}, limits: { bytes: exactSize - 1 }
  });
  await assert.rejects(() => repository.save(record(fixture.projectId, "byte-active")), DesktopMediaExecutionArchiveFullError);
  assert.ok(await repository.get("byte-active"));
  assert.equal(repository.snapshot().records.length, 1);
  assert.deepEqual((await readdir(fixture.root)).filter((name) => name.startsWith(".media-execution-archive-")), []);
  await project.persistence.close();
});

test("closed schema rejects an extra key without changing the durable archive", async (t) => {
  const fixture = await open(t);
  await assert.rejects(() => fixture.repository.create({ ...record(fixture.projectId, "extra"), unexpected: true }));
  assert.equal(fixture.repository.snapshot().records.length, 0);
  await fixture.project.persistence.close();
});

test("corrupt JSON, digest mismatch, unknown version, and project mismatch are quarantined without touching ProjectHistory", async (t) => {
  for (const [name, mutate, expectedHealth] of [
    ["json", () => "not-json", "recovered-corrupt"],
    ["digest", (envelope) => JSON.stringify({ ...envelope, integrity: { ...envelope.integrity, value: "0".repeat(64) } }), "recovered-corrupt"],
    ["version", (envelope) => { const changed = { ...envelope, archive: { ...envelope.archive, version: 2 } }; changed.integrity = { algorithm: "sha256", value: createHash("sha256").update(JSON.stringify(changed.archive)).digest("hex") }; return JSON.stringify(changed); }, "recovered-corrupt"],
    ["project", (envelope) => { const changed = { ...envelope, archive: { ...envelope.archive, projectId: "other-project" } }; changed.integrity = { algorithm: "sha256", value: createHash("sha256").update(JSON.stringify(changed.archive)).digest("hex") }; return JSON.stringify(changed); }, "recovered-project-mismatch"]
  ]) {
    await t.test(name, async (t) => {
      const fixture = await open(t);
      const archivePath = resolve(fixture.root, MEDIA_EXECUTION_ARCHIVE_FILE);
      const original = JSON.parse(await readFile(archivePath, "utf8"));
      await fixture.project.persistence.close();
      await writeFile(archivePath, `${mutate(original)}\n`, "utf8");
      const reopenedProject = await DesktopProjectPersistence.open(fixture.root, { clock: () => now });
      const reopened = await reopenedProject.persistence.openMediaExecutionRepository(fixture.projectId);
      assert.equal(reopened.health, expectedHealth);
      assert.equal(reopened.snapshot().records.length, 0);
      assert.equal(reopenedProject.history.current.project.id, fixture.projectId);
      assert.equal((await readdir(fixture.root)).filter((entry) => entry.startsWith("media-executions.invalid-")).length, 1);
      await reopenedProject.persistence.close();
    });
  }
});

test("orphan regular temp is removed while a temp symlink fails closed without touching its target", async (t) => {
  const fixture = await open(t);
  await fixture.project.persistence.close();
  await writeFile(resolve(fixture.root, ".media-execution-archive-orphan.tmp"), "partial", "utf8");
  let reopenedProject = await DesktopProjectPersistence.open(fixture.root, { clock: () => now });
  await reopenedProject.persistence.openMediaExecutionRepository(fixture.projectId);
  assert.equal((await readdir(fixture.root)).includes(".media-execution-archive-orphan.tmp"), false);
  await reopenedProject.persistence.close();

  const target = resolve(fixture.root, "foreign-target");
  await writeFile(target, "foreign", "utf8");
  await symlink(target, resolve(fixture.root, ".media-execution-archive-hostile.tmp"));
  reopenedProject = await DesktopProjectPersistence.open(fixture.root, { clock: () => now });
  await assert.rejects(() => reopenedProject.persistence.openMediaExecutionRepository(fixture.projectId), DesktopMediaExecutionArchiveError);
  assert.equal(await readFile(target, "utf8"), "foreign");
  await reopenedProject.persistence.close();
});

test("oversized archive is quarantined without becoming cleanup authority", async (t) => {
  const fixture = await open(t);
  const archivePath = resolve(fixture.root, MEDIA_EXECUTION_ARCHIVE_FILE);
  await fixture.project.persistence.close();
  await writeFile(archivePath, "x".repeat(8 * 1024 * 1024 + 1), "utf8");
  const reopenedProject = await DesktopProjectPersistence.open(fixture.root, { clock: () => now });
  const reopened = await reopenedProject.persistence.openMediaExecutionRepository(fixture.projectId);
  assert.equal(reopened.health, "recovered-corrupt");
  assert.deepEqual(reopened.snapshot().records, []);
  await reopenedProject.persistence.close();
});

test("schema-valid digest with an output URI outside its operation is quarantined before any delete", async (t) => {
  const fixture = await open(t);
  const foreign = resolve(fixture.root, "schema-foreign.mp4");
  await writeFile(foreign, "schema sentinel", "utf8");
  await fixture.project.persistence.close();
  const expected = resolve(fixture.root, "expected.mp4");
  const invalidRecord = {
    ...record(fixture.projectId, "invalid-output-binding", "running"),
    operation: { type: "trim", inputUri: "/tmp/input.mp4", outputUri: expected, startMs: 0, endMs: 1000 },
    attempts: [{
      number: 1, jobId: "invalid-output-binding:1", status: "running", requestedAt: now,
      outputUris: [foreign], preexistingOutputUris: [], ownedOutputUris: [foreign],
      removedPartialOutputUris: [], cleanupFailedOutputUris: [], projectRevisionBefore: 0
    }]
  };
  await installArchive(fixture.root, {
    version: 1, projectId: fixture.projectId, records: [invalidRecord], intents: []
  });
  const reopened = await DesktopProjectPersistence.open(fixture.root, { clock: () => now });
  const repository = await reopened.persistence.openMediaExecutionRepository(fixture.projectId);
  assert.equal(repository.health, "recovered-corrupt");
  assert.equal(await readFile(foreign, "utf8"), "schema sentinel");
  assert.deepEqual(repository.snapshot().records, []);
  await reopened.persistence.close();
});

test("write faults preserve the old authority or leave a valid new authority for reopen", async (t) => {
  for (const point of ["before-temp-write", "during-temp-write", "before-rename", "after-rename", "directory-sync"]) {
    await t.test(point, async (t) => {
      const fixture = await open(t);
      const faulty = await fixture.project.persistence.openMediaExecutionRepository(fixture.projectId, (candidate) => {
        if (candidate === point) throw new Error(point);
      });
      await assert.rejects(() => faulty.create(record(fixture.projectId, `fault-${point}`)), DesktopMediaExecutionArchiveError);
      await assert.rejects(() => faulty.create(record(fixture.projectId, `blocked-${point}`)), DesktopMediaExecutionArchiveError);
      await assert.rejects(() => faulty.get(`fault-${point}`), DesktopMediaExecutionArchiveError);
      await fixture.project.persistence.close();
      const reopenedProject = await DesktopProjectPersistence.open(fixture.root, { clock: () => now });
      const reopened = await reopenedProject.persistence.openMediaExecutionRepository(fixture.projectId);
      const committed = point === "after-rename" || point === "directory-sync";
      assert.equal(Boolean(await reopened.get(`fault-${point}`)), committed);
      await reopenedProject.persistence.close();
    });
  }
});

test("real close/reopen reconciles owned, foreign, ambiguous, canonical, and redo-retained artifacts with zero replay", async (t) => {
  const fixture = await open(t);
  const artifactRoot = resolve(fixture.root, "artifacts");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(artifactRoot));
  const paths = {
    owned: resolve(artifactRoot, "owned.wav"),
    foreign: resolve(artifactRoot, "foreign.wav"),
    ambiguous: resolve(artifactRoot, "ambiguous.wav"),
    canonical: resolve(artifactRoot, "canonical.mp4"),
    redo: resolve(artifactRoot, "redo.wav")
  };
  for (const [name, path] of Object.entries(paths)) await writeFile(path, name, "utf8");
  const evidence = async (path) => {
    const stat = await lstat(path, { bigint: true });
    return { version: 1, scheme: "posix-dev-inode", device: String(stat.dev), inode: String(stat.ino) };
  };
  const sequence = (outputUri) => ({
    type: "render-audio-sequence", version: 1,
    sources: [{ id: "source", uri: resolve(artifactRoot, "source.wav") }],
    items: [{ sourceId: "source", sourceStartMs: 0, sourceEndMs: 1000, timelineStartMs: 0 }],
    outputUri, outputDurationMs: 1000, outputChannelLayout: "mono"
  });
  const running = async (id, outputUri, withEvidence = true) => ({
    ...record(fixture.projectId, id, "running"), operation: sequence(outputUri),
    attempts: [{ number: 1, jobId: `${id}:1`, status: "running", requestedAt: now, startedAt: now,
      outputUris: [outputUri], preexistingOutputUris: [], ownedOutputUris: [outputUri],
      ...(withEvidence ? { ownedOutputPublications: [{ uri: outputUri, evidence: await evidence(outputUri) }] } : {}),
      removedPartialOutputUris: [], cleanupFailedOutputUris: [], projectRevisionBefore: fixture.project.history.current.history.revision }]
  });
  await fixture.repository.create(await running("owned", paths.owned));
  await fixture.repository.create(await running("foreign", paths.foreign));
  await fixture.repository.create(await running("ambiguous", paths.ambiguous, false));

  const canonicalPublication = await evidence(paths.canonical);
  fixture.project.history.commit({ type: "export.add", export: {
    id: "canonical-export", presetId: "fixture", status: "completed", outputUri: paths.canonical, createdAt: now, completedAt: now
  } });
  await fixture.repository.create({
    ...record(fixture.projectId, "canonical", "committing"),
    operation: { type: "mux-audio", videoUri: resolve(artifactRoot, "visual.mp4"), audioUri: resolve(artifactRoot, "audio.wav"), outputUri: paths.canonical, replaceExisting: true },
    mutation: { type: "export.add", exportId: "canonical-export", presetId: "fixture" },
    attempts: [{ number: 1, jobId: "canonical:1", status: "committing", requestedAt: now, startedAt: now,
      outputUris: [paths.canonical], preexistingOutputUris: [], ownedOutputUris: [paths.canonical],
      ownedOutputPublications: [{ uri: paths.canonical, evidence: canonicalPublication }], removedPartialOutputUris: [], cleanupFailedOutputUris: [],
      projectRevisionBefore: 0, result: { type: "file", outputUri: paths.canonical, durationMs: 1000,
        probe: { uri: paths.canonical, durationMs: 1000, hasVideo: true, hasAudio: true, videoCodec: "h264", audioCodec: "aac" },
        effectiveProfile: { container: "mp4", videoCodec: "h264", audioCodec: "aac", videoEncoder: "copy", audioEncoder: "aac" },
        publication: canonicalPublication } }]
  });

  fixture.project.history.commit({ type: "export.add", export: {
    id: "redo-export", presetId: "fixture", status: "completed", outputUri: paths.redo, createdAt: now, completedAt: now
  } });
  fixture.project.history.undo();
  await fixture.repository.create(await running("redo-retained", paths.redo));
  await fixture.repository.createIntent({
    ...intent(fixture.projectId, "canonical-intent"),
    status: "application-committed",
    childExecutionIds: { audio: "owned", mux: "canonical" },
    exportIntent: { exportId: "canonical-export", presetId: "fixture", expectedOutputUri: paths.canonical }
  });
  await fixture.repository.createIntent({
    ...intent(fixture.projectId, "noncanonical-intent"),
    status: "mux-running",
    childExecutionIds: { audio: "ambiguous", mux: "foreign" },
    exportIntent: { exportId: "missing-export", presetId: "fixture", expectedOutputUri: paths.foreign }
  });
  await fixture.project.persistence.checkpoint(fixture.project.history);

  const oldForeignEvidence = await evidence(paths.foreign);
  const foreignReplacement = resolve(artifactRoot, "foreign-replacement.tmp");
  await writeFile(foreignReplacement, "foreign replacement", "utf8");
  await rename(foreignReplacement, paths.foreign);
  assert.notDeepEqual(await evidence(paths.foreign), oldForeignEvidence);
  await fixture.project.persistence.close();

  const reopenedProject = await DesktopProjectPersistence.open(fixture.root, { clock: () => now });
  const repository = await reopenedProject.persistence.openMediaExecutionRepository(fixture.projectId);
  let engineCalls = 0;
  const service = new MediaApplicationService({
    history: reopenedProject.history,
    executions: repository,
    artifacts: new NodeMediaArtifactStore(),
    engine: {
      async identity() { return { id: "never", kind: "media", displayName: "Never", version: "0", apiVersion: 1 }; },
      async healthcheck() { return { status: "unavailable", checkedAt: now, checks: [] }; },
      async capabilities() { return []; },
      async execute() { engineCalls += 1; throw new Error("must not replay"); }
    },
    clock: () => now
  });
  const recovery = await service.reconcilePendingWithoutReplay();
  await service.reconcilePendingWithoutReplay();
  const resolved = new ResolvedAudioPlanApplicationService({ history: reopenedProject.history, media: service, intents: repository, clock: () => now });
  await resolved.reconcilePendingWithoutReplay();
  await resolved.reconcilePendingWithoutReplay();
  assert.equal(recovery.length, 5);
  assert.deepEqual((await repository.get("owned")).attempts[0].removedPartialOutputUris, [paths.owned]);
  await assert.rejects(() => readFile(paths.owned), { code: "ENOENT" });
  assert.equal(await readFile(paths.foreign, "utf8"), "foreign replacement");
  assert.equal(await readFile(paths.ambiguous, "utf8"), "ambiguous");
  assert.equal(await readFile(paths.canonical, "utf8"), "canonical");
  assert.equal(await readFile(paths.redo, "utf8"), "redo");
  assert.equal((await repository.get("canonical")).status, "succeeded");
  assert.equal((await repository.getIntent("canonical-intent")).status, "durable-succeeded");
  assert.equal((await repository.getIntent("noncanonical-intent")).status, "recovery-incomplete");
  assert.equal(engineCalls, 0);
  await reopenedProject.persistence.close();
});

test("application commit followed by checkpoint failure never marks composite intent durable", async (t) => {
  const fixture = await open(t);
  await fixture.project.persistence.close();
  const reopened = await __openDesktopProjectForTest(fixture.root, { clock: () => now }, (point) => {
    if (point === "checkpoint-write") throw new Error("simulated checkpoint failure");
  });
  let durableMarks = 0;
  const resolvedAudioPlan = {
    async execute(request) {
      reopened.history.commit({ type: "export.add", export: {
        id: request.exportId, presetId: request.presetId, status: "completed", outputUri: request.outputUri,
        createdAt: now, completedAt: now
      } });
      return { plan: request.plan, audioExecution: {}, muxExecution: {}, project: reopened.history.current, audioCleanup: { removed: [], failed: [] } };
    },
    async markCheckpointSucceeded() { durableMarks += 1; }
  };
  const session = new DesktopSession({
    history: reopened.history,
    persistence: reopened.persistence,
    resolvedAudioPlan,
    mediaCapability: { available: false, reason: "runtime-not-configured" },
    transcriptionCapability: { available: false, reason: "runtime-not-configured" }
  });
  await assert.rejects(() => session.executeResolvedAudioPlan({
    id: "checkpoint-failure", plan: {}, visual: {}, outputUri: "/tmp/not-durable.mp4",
    exportId: "not-durable", presetId: "fixture"
  }), (error) => error.code === "PROJECT_PERSISTENCE_FAILED");
  assert.equal(reopened.history.current.exports.some(({ id }) => id === "not-durable"), true);
  assert.equal(durableMarks, 0);
  await session.close();

  const restored = await DesktopProjectPersistence.open(fixture.root, { clock: () => now });
  assert.equal(restored.history.current.exports.some(({ id }) => id === "not-durable"), false);
  await restored.persistence.close();
});

test("Desktop checkpoint finalization uses the request ID captured before asynchronous execution", async () => {
  const marked = [];
  const resolvedAudioPlan = {
    async execute(request) {
      request.id = "caller-mutated-after-start";
      return { plan: request.plan, audioExecution: {}, muxExecution: {}, project: {}, audioCleanup: { removed: [], failed: [] } };
    },
    async markCheckpointSucceeded(id) { marked.push(id); }
  };
  const session = new DesktopSession({
    history: new ProjectHistory(createEmptyProject({ id: "captured-id-project", name: "Captured", locale: "pt-BR", now })),
    resolvedAudioPlan,
    mediaCapability: { available: false, reason: "runtime-not-configured" },
    transcriptionCapability: { available: false, reason: "runtime-not-configured" }
  });
  const request = { id: "captured-intent", plan: {}, visual: {}, outputUri: "/tmp/captured.mp4",
    exportId: "captured-export", presetId: "fixture" };
  await session.executeResolvedAudioPlan(request);
  assert.deepEqual(marked, ["captured-intent"]);
  assert.equal(request.id, "captured-intent");
});

test("production startup restores ProjectHistory before archive reconciliation and performs no automatic replay", async (t) => {
  const fixture = await open(t);
  await fixture.repository.create(record(fixture.projectId, "startup-pending"));
  await fixture.project.persistence.close();

  const session = await createProductionDesktopSession({
    CEVRA_PROJECT_PERSISTENCE_ROOT: fixture.root,
    CEVRA_HOST_RECOVERY: "1"
  });
  assert.equal(session.state().project.project.id, fixture.projectId);
  await session.close();

  const reopened = await DesktopProjectPersistence.open(fixture.root, { clock: () => now });
  const repository = await reopened.persistence.openMediaExecutionRepository(fixture.projectId);
  assert.equal((await repository.get("startup-pending")).status, "interrupted");
  assert.equal((await repository.get("startup-pending")).attempts.length, 0);
  await reopened.persistence.close();
});

test("production restart preserves a non-exclusive foreign output and records cleanup uncertainty", async (t) => {
  const fixture = await open(t);
  const foreign = resolve(fixture.root, "foreign-trim.mp4");
  await writeFile(foreign, "foreign sentinel", "utf8");
  await fixture.repository.create({
    ...record(fixture.projectId, "foreign-trim", "running"),
    operation: { type: "trim", inputUri: resolve(fixture.root, "input.mp4"), outputUri: foreign, startMs: 0, endMs: 1000 },
    attempts: [{
      number: 1, jobId: "foreign-trim:1", status: "running", requestedAt: now, startedAt: now,
      outputUris: [foreign], preexistingOutputUris: [], ownedOutputUris: [foreign],
      removedPartialOutputUris: [], cleanupFailedOutputUris: [], projectRevisionBefore: fixture.project.history.current.history.revision
    }]
  });
  await fixture.project.persistence.close();

  const session = await createProductionDesktopSession({
    CEVRA_PROJECT_PERSISTENCE_ROOT: fixture.root,
    CEVRA_HOST_RECOVERY: "1"
  });
  assert.equal(session.state().project.project.id, fixture.projectId);
  assert.equal(await readFile(foreign, "utf8"), "foreign sentinel");
  await session.close();

  const reopened = await DesktopProjectPersistence.open(fixture.root, { clock: () => now });
  const repository = await reopened.persistence.openMediaExecutionRepository(fixture.projectId);
  const recovered = await repository.get("foreign-trim");
  assert.equal(recovered.status, "failed");
  assert.deepEqual(recovered.attempts[0].removedPartialOutputUris, []);
  assert.deepEqual(recovered.attempts[0].cleanupFailedOutputUris, [foreign]);
  await reopened.persistence.close();
});

test("production startup keeps canonical project open when a classified archive failure makes media unavailable", async (t) => {
  const fixture = await open(t);
  const foreign = resolve(fixture.root, "archive-unavailable-foreign");
  await writeFile(foreign, "archive unavailable sentinel", "utf8");
  await fixture.project.persistence.close();
  await symlink(foreign, resolve(fixture.root, ".media-execution-archive-hostile.tmp"));

  const session = await createProductionDesktopSession({
    CEVRA_PROJECT_PERSISTENCE_ROOT: fixture.root,
    CEVRA_HOST_RECOVERY: "1"
  });
  const state = session.state();
  assert.equal(state.project.project.id, fixture.projectId);
  assert.deepEqual(state.capabilities.mediaImport, { available: false, reason: "archive-unavailable" });
  assert.equal(state.capabilities.transcription.reason, "runtime-not-configured");
  assert.equal(await readFile(foreign, "utf8"), "archive unavailable sentinel");
  await session.close();
});

test("Desktop model presence gate mirrors the worker-aligned shared local selection", async (t) => {
  const fixture = await open(t);
  await fixture.project.persistence.close();
  const bootstrapCache = resolve(fixture.root, "transcription-model-bootstrap");
  const environment = await managedTranscriptionEnvironment(fixture.root, bootstrapCache);
  const cases = [
    {
      name: "direct root",
      modelId: "base",
      install: installDirectModel,
      expected: { available: true, reason: "available" }
    },
    {
      name: "root-level Hugging Face",
      modelId: "base",
      install: (root) => installHfModelCache(root, "Systran/faster-whisper-base"),
      expected: { available: true, reason: "available" }
    },
    {
      name: "actual turbo repository",
      modelId: "turbo",
      install: (root) => installHfModelCache(root, "mobiuslabsgmbh/faster-whisper-large-v3-turbo"),
      expected: { available: true, reason: "available" }
    },
    {
      name: "synthetic Systran turbo repository",
      modelId: "turbo",
      install: (root) => installHfModelCache(root, "Systran/faster-whisper-turbo"),
      expected: { available: false, reason: "model-not-available" }
    },
    {
      name: "hub-only repository",
      modelId: "base",
      install: (root) => installHfModelCache(root, "Systran/faster-whisper-base", { placement: "hub" }),
      expected: { available: false, reason: "model-not-available" }
    },
    {
      name: "orphan snapshot",
      modelId: "base",
      install: (root) => installHfModelCache(root, "Systran/faster-whisper-base", { includeRef: false }),
      expected: { available: false, reason: "model-not-available" }
    }
  ];

  for (const [index, value] of cases.entries()) {
    const modelCacheDir = resolve(fixture.root, `model-presence-${index}`);
    await value.install(modelCacheDir);
    const session = await createProductionDesktopSession({
      ...environment,
      CEVRA_PROJECT_PERSISTENCE_ROOT: fixture.root,
      CEVRA_HOST_RECOVERY: "1",
      CEVRA_TRANSCRIPTION_MODEL_CACHE: modelCacheDir,
      CEVRA_TRANSCRIPTION_MODEL_ID: value.modelId
    });
    assert.deepEqual(session.state().capabilities.transcription, value.expected, value.name);
    await session.close();
  }
});

test("degraded Media startup still protects its configured runtime from the Transcription model cache", async (t) => {
  const fixture = await open(t);
  const mediaRuntimeRoot = await installConfiguredMediaRuntime(fixture.root);
  const transcription = await managedTranscriptionEnvironment(
    fixture.root,
    resolve(mediaRuntimeRoot, "overlapping-model-cache")
  );
  const foreign = resolve(fixture.root, "protected-root-overlap-sentinel");
  await writeFile(foreign, "protected root overlap sentinel", "utf8");
  await fixture.project.persistence.close();
  await symlink(foreign, resolve(fixture.root, ".media-execution-archive-hostile.tmp"));

  const session = await createProductionDesktopSession({
    ...transcription,
    CEVRA_PROJECT_PERSISTENCE_ROOT: fixture.root,
    CEVRA_HOST_RECOVERY: "1",
    CEVRA_MEDIA_RUNTIME_ROOT: mediaRuntimeRoot
  });
  const state = session.state();
  assert.equal(state.project.project.id, fixture.projectId);
  assert.deepEqual(state.capabilities.mediaImport, { available: false, reason: "archive-unavailable" });
  assert.deepEqual(state.capabilities.transcription, { available: false, reason: "runtime-invalid" });
  assert.equal(await readFile(foreign, "utf8"), "protected root overlap sentinel");
  await session.close();
});

test("degraded Media startup keeps Transcription available with an isolated model cache", async (t) => {
  const fixture = await open(t);
  const mediaRuntimeRoot = await installConfiguredMediaRuntime(fixture.root);
  const transcription = await managedTranscriptionEnvironment(fixture.root, resolve(fixture.root, "isolated-model-cache"));
  const foreign = resolve(fixture.root, "protected-root-isolated-sentinel");
  await writeFile(foreign, "protected root isolated sentinel", "utf8");
  await fixture.project.persistence.close();
  await symlink(foreign, resolve(fixture.root, ".media-execution-archive-hostile.tmp"));

  const session = await createProductionDesktopSession({
    ...transcription,
    CEVRA_PROJECT_PERSISTENCE_ROOT: fixture.root,
    CEVRA_HOST_RECOVERY: "1",
    CEVRA_MEDIA_RUNTIME_ROOT: mediaRuntimeRoot
  });
  const state = session.state();
  assert.equal(state.project.project.id, fixture.projectId);
  assert.deepEqual(state.capabilities.mediaImport, { available: false, reason: "archive-unavailable" });
  assert.deepEqual(state.capabilities.transcription, { available: true, reason: "available" });
  assert.equal(session.services.transcription.cache, undefined, "fixture config intentionally has no transcript cache");
  assert.ok(session.services.transcription.sourceIdentity instanceof NodeMediaArtifactStore,
    "source integrity capability must remain wired independently of cache availability");
  assert.equal(await readFile(foreign, "utf8"), "protected root isolated sentinel");
  await session.close();
});

test("invalid configured Media root cannot silently remove Transcription isolation during degraded startup", async (t) => {
  const fixture = await open(t);
  const transcription = await managedTranscriptionEnvironment(fixture.root, resolve(fixture.root, "invalid-root-model-cache"));
  const foreign = resolve(fixture.root, "invalid-root-sentinel");
  await writeFile(foreign, "invalid root sentinel", "utf8");
  await fixture.project.persistence.close();
  await symlink(foreign, resolve(fixture.root, ".media-execution-archive-hostile.tmp"));

  const session = await createProductionDesktopSession({
    ...transcription,
    CEVRA_PROJECT_PERSISTENCE_ROOT: fixture.root,
    CEVRA_HOST_RECOVERY: "1",
    CEVRA_MEDIA_RUNTIME_ROOT: resolve(fixture.root, "missing-media-runtime")
  });
  const state = session.state();
  assert.equal(state.project.project.id, fixture.projectId);
  assert.deepEqual(state.capabilities.mediaImport, { available: false, reason: "archive-unavailable" });
  assert.deepEqual(state.capabilities.transcription, { available: false, reason: "runtime-invalid" });
  assert.equal(await readFile(foreign, "utf8"), "invalid root sentinel");
  await session.close();
});

test("production startup keeps canonical project open and degrades media when recovery hits deterministic FULL", async (t) => {
  const fixture = await open(t);
  const foreign = resolve(fixture.root, "capacity-foreign.mp4");
  await writeFile(foreign, "capacity sentinel", "utf8");
  await fixture.project.persistence.close();
  const archive = fullPendingArchive(fixture.projectId, foreign);
  const archivePath = resolve(fixture.root, MEDIA_EXECUTION_ARCHIVE_FILE);
  await installArchive(fixture.root, archive);
  const before = createHash("sha256").update(await readFile(archivePath)).digest("hex");

  const session = await createProductionDesktopSession({
    CEVRA_PROJECT_PERSISTENCE_ROOT: fixture.root,
    CEVRA_HOST_RECOVERY: "1"
  });
  const state = session.state();
  assert.equal(state.project.project.id, fixture.projectId);
  assert.deepEqual(state.capabilities.mediaImport, { available: false, reason: "archive-full" });
  assert.equal(await readFile(foreign, "utf8"), "capacity sentinel");
  assert.equal(createHash("sha256").update(await readFile(archivePath)).digest("hex"), before);
  assert.equal((await readdir(fixture.root)).some((entry) => entry.startsWith("media-executions.invalid-")), false);
  await session.close();

  const secondSession = await createProductionDesktopSession({
    CEVRA_PROJECT_PERSISTENCE_ROOT: fixture.root,
    CEVRA_HOST_RECOVERY: "1"
  });
  const secondState = secondSession.state();
  assert.equal(secondState.project.project.id, fixture.projectId);
  assert.deepEqual(secondState.capabilities.mediaImport, { available: false, reason: "archive-full" });
  assert.equal(await readFile(foreign, "utf8"), "capacity sentinel");
  assert.equal(createHash("sha256").update(await readFile(archivePath)).digest("hex"), before);
  await secondSession.close();

  const reopened = await DesktopProjectPersistence.open(fixture.root, { clock: () => now });
  const repository = await reopened.persistence.openMediaExecutionRepository(fixture.projectId);
  assert.equal((await repository.get("capacity-pending")).status, "running");
  assert.equal(reopened.history.current.project.id, fixture.projectId);
  await reopened.persistence.close();
});
