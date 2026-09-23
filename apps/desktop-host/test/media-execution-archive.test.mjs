import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  DesktopMediaExecutionArchiveError,
  DesktopProjectPersistence,
  DesktopSession,
  MEDIA_EXECUTION_ARCHIVE_FILE,
  createProductionDesktopSession
} from "../dist/index.js";
import { __openDesktopProjectForTest } from "../dist/persistence.js";
import { MediaApplicationService, ResolvedAudioPlanApplicationService } from "@cevra/application";
import { NodeMediaArtifactStore } from "@cevra/media-ffmpeg";

const now = "2026-09-23T12:00:00.000Z";

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

test("write faults preserve the old authority or leave a valid new authority for reopen", async (t) => {
  for (const point of ["before-temp-write", "during-temp-write", "before-rename", "after-rename", "directory-sync"]) {
    await t.test(point, async (t) => {
      const fixture = await open(t);
      const faulty = await fixture.project.persistence.openMediaExecutionRepository(fixture.projectId, (candidate) => {
        if (candidate === point) throw new Error(point);
      });
      await assert.rejects(() => faulty.create(record(fixture.projectId, `fault-${point}`)), DesktopMediaExecutionArchiveError);
      await assert.rejects(() => faulty.create(record(fixture.projectId, `blocked-${point}`)), DesktopMediaExecutionArchiveError);
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
  await rm(paths.foreign);
  await writeFile(paths.foreign, "foreign replacement", "utf8");
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
