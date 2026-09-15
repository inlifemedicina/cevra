import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryMediaExecutionRepository,
  LocalSourceIngestService,
  MediaApplicationService,
  TranscriptionApplicationService
} from "@cevra/application";
import { CEVRA_ENGINE_API_VERSION } from "@cevra/contracts";
import { createEmptyProject, ProjectHistory } from "@cevra/project-ir";
import { DesktopSession } from "../dist/index.js";

test("real application services compose ingest, transcription, undo, and redo", async () => {
  let sequence = 0;
  const nextId = () => `vertical-${++sequence}`;
  const history = new ProjectHistory(
    createEmptyProject({ id: "vertical-project", name: "Vertical", now: "2026-09-14T00:00:00.000Z" }),
    { idGenerator: nextId, clock: () => "2026-09-14T00:00:00.000Z" }
  );
  const media = new MediaApplicationService({
    engine: {
      async identity() { return { id: "test.media", kind: "media", displayName: "Test Media", version: "1.0.0", apiVersion: CEVRA_ENGINE_API_VERSION }; },
      async healthcheck() { return { status: "ready", checkedAt: "2026-09-14T00:00:00.000Z" }; },
      async capabilities() { return []; },
      async execute(operation) {
        assert.equal(operation.type, "probe");
        return { type: "probe", probe: { uri: operation.inputUri, durationMs: 4000, width: 1920, height: 1080, frameRate: 30, hasVideo: true, hasAudio: true, videoCodec: "h264", audioCodec: "aac" } };
      }
    },
    history,
    executions: new InMemoryMediaExecutionRepository(),
    artifacts: { async kind() { return "missing"; }, async exists() { return false; }, async remove() {} },
    idGenerator: nextId,
    clock: () => "2026-09-14T00:00:00.000Z"
  });
  const ingest = new LocalSourceIngestService({ media, history, idGenerator: nextId });
  const transcription = new TranscriptionApplicationService({
    history,
    idGenerator: nextId,
    clock: () => "2026-09-14T00:00:00.000Z",
    engine: {
      async identity() { return { id: "test.transcription", kind: "transcription", displayName: "Test Transcription", version: "1.0.0", apiVersion: CEVRA_ENGINE_API_VERSION }; },
      async healthcheck() { return { status: "ready", checkedAt: "2026-09-14T00:00:00.000Z" }; },
      async capabilities() { return []; },
      async transcribe() {
        return {
          transcript: {
            language: "pt-BR",
            words: [{ id: "word-1", text: "Olá", startMs: 0, endMs: 500 }],
            segments: [{ id: "segment-1", text: "Olá", startMs: 0, endMs: 500, wordIds: ["word-1"] }]
          },
          detectedLanguage: "pt",
          modelId: "test-model",
          durationMs: 4000,
          wordTiming: "model"
        };
      }
    }
  });
  const session = new DesktopSession({
    history,
    ingest,
    transcription,
    mediaCapability: { available: true, reason: "available" },
    transcriptionCapability: { available: true, reason: "available" }
  });

  const ingested = await session.ingestLocal({ uri: "/tmp/vertical.mp4", displayName: "vertical.mp4", operationId: "ingest-1", locale: "pt-BR" });
  let state = ingested.state;
  assert.equal(state.project.sources.length, 1);
  assert.equal(state.project.history.revision, 1);
  const sourceId = state.project.sources[0].id;
  state = await session.transcribeSource({ sourceId, operationId: "transcribe-1", locale: "pt-BR" });
  assert.equal(state.project.sourceTranscripts[0].sourceId, sourceId);
  assert.equal(state.project.history.revision, 2);

  state = session.undo();
  assert.equal(state.project.sources.length, 1);
  assert.equal(state.project.sourceTranscripts.length, 0);
  state = session.undo();
  assert.equal(state.project.sources.length, 0);
  state = session.redo();
  assert.equal(state.project.sources.length, 1);
  assert.equal(state.project.sourceTranscripts.length, 0);
  state = session.redo();
  assert.equal(state.project.sourceTranscripts.length, 1);
});
