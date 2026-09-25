import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { CEVRA_ENGINE_API_VERSION } from "@cevra/contracts";
import { TranscriptionApplicationService } from "@cevra/application";
import { createEmptyProject, ProjectHistory } from "@cevra/project-ir";
import { FileTranscriptCache } from "@cevra/transcript-cache";
import { NodeMediaArtifactStore } from "@cevra/media-ffmpeg";
import { DesktopProjectPersistence, DesktopSession } from "../dist/index.js";

const now = "2026-09-15T12:00:00.000Z";

test("cache-derived transcript promotion is checkpointed while cache deletion cannot damage project reopen", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "cevra-host-cache-boundary-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRoot = resolve(root, "project"); const cacheRoot = resolve(root, "cache");
  const mediaPath = resolve(root, "source.mov"); await writeFile(mediaPath, "same-media-bytes");
  const opened = await DesktopProjectPersistence.open(projectRoot, { clock: () => now });
  const history = opened.history;
  history.commit({ type: "source.add", source: { id: "source", kind: "video", uri: mediaPath, displayName: "source.mov", durationMs: 1000 } });
  await opened.persistence.checkpoint(history);
  const cache = new FileTranscriptCache(cacheRoot);
  const exactExecution = {
    engineId: "engine", engineVersion: "1", engineApiVersion: CEVRA_ENGINE_API_VERSION,
    workerProtocolVersion: 1, modelId: "model/exact", resultModelId: "model", modelRevision: "revision",
    modelArtifactDigest: `sha256:${"b".repeat(64)}`, languageDetectionPolicyVersion: "auto-v1",
    devicePolicy: "cpu", effectiveDevice: "cpu", computeType: "int8", task: "transcribe",
    resultNormalizationVersion: "result-v1", runtimePipelineVersion: "pipeline-v1"
  };
  const engineResult = { transcript: { language: "pt", words: [], segments: [] }, modelId: "model", wordTiming: "none" };
  const engineIdentity = { id: "engine", kind: "transcription", displayName: "Cache fixture", version: "1", apiVersion: CEVRA_ENGINE_API_VERSION };
  const sourceIdentity = new NodeMediaArtifactStore();
  const seedProject = createEmptyProject({ id: "seed", name: "Seed", locale: "pt-BR", now });
  seedProject.sources.push({ id: "seed-source", kind: "video", uri: mediaPath, displayName: "copy.mov", durationMs: 1000 });
  const seedHistory = new ProjectHistory(seedProject, { clock: () => now, idGenerator: () => "seed-history" });
  const seedEngine = {
    async identity() { return engineIdentity; }, async healthcheck() {}, async capabilities() {},
    async describeTranscriptionExecution() { return exactExecution; }, async transcribe() { return engineResult; }
  };
  const seed = new TranscriptionApplicationService({ engine: seedEngine, history: seedHistory, cache, sourceIdentity, clock: () => now });
  await seed.transcribeSource({ sourceId: "seed-source", id: "cached-execution" });

  let engineCalls = 0;
  const hitEngine = {
    async identity() { return engineIdentity; }, async healthcheck() {}, async capabilities() {},
    async describeTranscriptionExecution() { return exactExecution; },
    async transcribe() { engineCalls += 1; assert.fail("a valid cache hit must bypass the transcription engine"); }
  };
  const transcription = new TranscriptionApplicationService({ engine: hitEngine, history, cache, sourceIdentity, clock: () => now });
  const session = new DesktopSession({
    history, persistence: opened.persistence,
    mediaCapability: { available: false, reason: "runtime-not-configured" },
    transcriptionCapability: { available: true, reason: "available" },
    transcription
  });
  const state = await session.transcribeSource({ sourceId: "source", operationId: "cache-hit", locale: "pt-BR" });
  assert.equal(engineCalls, 0);
  assert.equal(state.project.sourceTranscripts[0].provenance.stages[0].executionId, "cached-execution");
  assert.equal(JSON.stringify(state).includes(cacheRoot), false);
  await session.close(); await rm(cacheRoot, { recursive: true, force: true });
  const reopened = await DesktopProjectPersistence.open(projectRoot, { clock: () => now });
  assert.equal(reopened.history.current.sourceTranscripts[0].provenance.stages[0].executionId, "cached-execution");
  await reopened.persistence.close();
});

test("trusted cache root stays host-internal and adds no protocol or WebView command", async () => {
  const sessionSource = await readFile(new URL("../src/session.ts", import.meta.url), "utf8");
  const protocolSource = await readFile(new URL("../src/protocol.ts", import.meta.url), "utf8");
  const rustSupervisor = await readFile(new URL("../../desktop/src-tauri/src/supervisor.rs", import.meta.url), "utf8");
  const rustMain = await readFile(new URL("../../desktop/src-tauri/src/main.rs", import.meta.url), "utf8");
  const capability = JSON.parse(await readFile(new URL("../../desktop/src-tauri/capabilities/main-window.json", import.meta.url), "utf8"));
  assert.match(sessionSource, /CEVRA_TRANSCRIPT_CACHE_ROOT/);
  assert.match(rustSupervisor, /app_cache_dir\(\)/);
  assert.match(rustSupervisor, /CEVRA_TRANSCRIPT_CACHE_ROOT/);
  assert.doesNotMatch(protocolSource, /transcript.cache|cacheRoot|cachePath/i);
  assert.doesNotMatch(rustMain, /desktop_.*cache/i);
  assert.deepEqual(capability.permissions.sort(), [
    "allow-desktop-cancel-operation", "allow-desktop-get-state", "allow-desktop-pick-and-ingest-media",
    "allow-desktop-redo", "allow-desktop-transcribe-source", "allow-desktop-undo"
  ].sort());
});
