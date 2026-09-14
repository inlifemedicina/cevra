import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  FasterWhisperTranscriptionAdapter,
  LocalTranscriptionError,
  ProcessTranscriptionWorkerRunner,
  TRANSCRIPTION_PROTOCOL_VERSION
} from "../dist/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const explicitPython = process.env.CEVRA_TEST_PYTHON || process.execPath.replace(/node$/, "python3");
const pythonProbe = spawnSync(explicitPython, ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" });
const python = pythonProbe.status === 0 ? pythonProbe.stdout.trim() : "/usr/bin/python3";
const localInput = path.join(os.tmpdir(), "cevra-transcription-input.wav");
const runtime = { mode: "development", pythonExecutable: python };
const profile = { modelCacheDir: path.join(os.tmpdir(), "cevra-model-cache") };

function validRaw(options = {}) {
  return {
    protocolVersion: TRANSCRIPTION_PROTOCOL_VERSION,
    modelId: "base",
    detectedLanguage: "pt",
    durationSeconds: 1.5,
    segments: [{ startSeconds: 0, endSeconds: 1.5, text: " Olá" }],
    ...options
  };
}

function fakeRunner(result = validRaw()) {
  const calls = [];
  return {
    calls,
    async healthcheck() { return { protocolVersion: 1, status: "ready", fasterWhisperVersion: "1.2.1" }; },
    async transcribe(request, context) { calls.push({ request, context }); return typeof result === "function" ? result(request, context) : result; }
  };
}

function adapter(runner, overrides = {}) {
  return new FasterWhisperTranscriptionAdapter({ runtime, profile: { ...profile, ...overrides }, runner });
}

function context(signal) {
  return { jobId: "job-1", locale: "pt-BR", ...(signal ? { signal } : {}) };
}

test("accepts an absolute local path and returns validated segments without words", async () => {
  const runner = fakeRunner();
  const result = await adapter(runner).transcribe({ inputUri: localInput, language: "pt", wordTimestamps: false }, context());
  assert.equal(result.modelId, "base");
  assert.equal(result.wordTiming, "none");
  assert.deepEqual(result.transcript.words, []);
  assert.deepEqual(result.transcript.segments, [{ id: "segment-000001", startMs: 0, endMs: 1500, text: " Olá", wordIds: [] }]);
  assert.equal(runner.calls[0].request.inputPath, localInput);
});

test("rejects remote inputs before invoking the worker", async () => {
  for (const inputUri of ["https://example.com/a.wav", "rtsp://camera/live", "s3://bucket/a.wav", "-input.wav", "relative.wav"]) {
    const runner = fakeRunner();
    await assert.rejects(
      adapter(runner).transcribe({ inputUri, language: "auto", wordTimestamps: false }, context()),
      (error) => error instanceof LocalTranscriptionError && error.code === "TRANSCRIPTION_INVALID_REQUEST"
    );
    assert.equal(runner.calls.length, 0);
  }
});

test("rejects arbitrary request fields before invoking the worker", async () => {
  const runner = fakeRunner();
  await assert.rejects(
    adapter(runner).transcribe({ inputUri: localInput, wordTimestamps: false, argv: ["--help"] }, context()),
    (error) => error?.code === "TRANSCRIPTION_INVALID_REQUEST"
  );
  assert.equal(runner.calls.length, 0);
});

test("rejects unsupported languages and accepts auto, pt, and en", async () => {
  const invalid = fakeRunner();
  await assert.rejects(
    adapter(invalid).transcribe({ inputUri: localInput, language: "es", wordTimestamps: false }, context()),
    (error) => error?.code === "TRANSCRIPTION_UNSUPPORTED_LANGUAGE"
  );
  assert.equal(invalid.calls.length, 0);
  for (const language of ["auto", "pt", "en"]) {
    const runner = fakeRunner();
    await adapter(runner).transcribe({ inputUri: localInput, language, wordTimestamps: false }, context());
    assert.equal(runner.calls.length, 1);
  }
});

test("maps native word timestamps to deterministic IDs and model timing", async () => {
  const runner = fakeRunner(validRaw({
    segments: [{
      startSeconds: 0,
      endSeconds: 1.5,
      text: " Olá mundo",
      words: [
        { startSeconds: 0, endSeconds: 0.5, text: " Olá", confidence: 0.91 },
        { startSeconds: 0.5, endSeconds: 1.5, text: " mundo", confidence: 0.87 }
      ]
    }]
  }));
  const result = await adapter(runner).transcribe({ inputUri: localInput, language: "auto", wordTimestamps: true }, context());
  assert.equal(result.wordTiming, "model");
  assert.deepEqual(result.transcript.segments[0].wordIds, ["segment-000001-word-000001", "segment-000001-word-000002"]);
  assert.deepEqual(result.transcript.words[0], {
    id: "segment-000001-word-000001", text: " Olá", startMs: 0, endMs: 500, confidence: 0.91
  });
});

test("auto language omits the backend language and propagates detection", async () => {
  const runner = fakeRunner();
  const result = await adapter(runner).transcribe({ inputUri: localInput, language: "auto", wordTimestamps: false }, context());
  assert.equal(Object.hasOwn(runner.calls[0].request, "language"), false);
  assert.equal(result.detectedLanguage, "pt");
  assert.equal(result.transcript.language, "pt");
});

test("explicit pt and en are sent unchanged to the backend", async () => {
  for (const language of ["pt", "en"]) {
    const runner = fakeRunner(validRaw({ detectedLanguage: language }));
    await adapter(runner).transcribe({ inputUri: localInput, language, wordTimestamps: false }, context());
    assert.equal(runner.calls[0].request.language, language);
  }
});

test("fails closed on malformed worker envelopes and timestamps", async () => {
  for (const raw of [
    null,
    { protocolVersion: 999, modelId: "base", segments: [] },
    validRaw({ durationSeconds: Number.NaN }),
    validRaw({ segments: [{ startSeconds: -1, endSeconds: 1, text: "bad" }] }),
    validRaw({ segments: [{ startSeconds: 1, endSeconds: 1, text: "bad" }] })
  ]) {
    await assert.rejects(
      adapter(fakeRunner(raw)).transcribe({ inputUri: localInput, language: "auto", wordTimestamps: false }, context()),
      (error) => error?.code === "TRANSCRIPTION_MALFORMED_RESULT"
    );
  }
});

test("fails closed when requested words are missing or outside their segment", async () => {
  const missing = fakeRunner(validRaw());
  await assert.rejects(
    adapter(missing).transcribe({ inputUri: localInput, language: "auto", wordTimestamps: true }, context()),
    (error) => error?.code === "TRANSCRIPTION_MALFORMED_RESULT"
  );
  const outside = fakeRunner(validRaw({ segments: [{
    startSeconds: 1, endSeconds: 2, text: "bad", words: [{ startSeconds: 0, endSeconds: 1.5, text: "bad" }]
  }] }));
  await assert.rejects(
    adapter(outside).transcribe({ inputUri: localInput, language: "auto", wordTimestamps: true }, context()),
    (error) => error?.code === "TRANSCRIPTION_MALFORMED_RESULT"
  );
});

test("rejects backend IDs and generates unique deterministic IDs from closed indexes", async () => {
  await assert.rejects(
    adapter(fakeRunner(validRaw({ segments: [
      { id: "duplicate", startSeconds: 0, endSeconds: 1, text: "a" },
      { id: "duplicate", startSeconds: 1, endSeconds: 2, text: "b" }
    ] }))).transcribe({ inputUri: localInput, wordTimestamps: false }, context()),
    (error) => error?.code === "TRANSCRIPTION_MALFORMED_RESULT"
  );
  const runner = fakeRunner(validRaw({
    segments: [
      { startSeconds: 0, endSeconds: 1, text: "a", words: [] },
      { startSeconds: 1, endSeconds: 2, text: "b", words: [] }
    ]
  }));
  const result = await adapter(runner).transcribe({ inputUri: localInput, wordTimestamps: true }, context());
  const ids = [...result.transcript.segments.map(({ id }) => id), ...result.transcript.words.map(({ id }) => id)];
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(result.transcript.segments.map(({ id }) => id), ["segment-000001", "segment-000002"]);
});

test("enforces one active transcription job and clears busy state afterward", async () => {
  let release;
  const firstResult = new Promise((resolve) => { release = resolve; });
  const runner = fakeRunner(() => firstResult);
  const engine = adapter(runner);
  const first = engine.transcribe({ inputUri: localInput, wordTimestamps: false }, context());
  await assert.rejects(
    engine.transcribe({ inputUri: localInput, wordTimestamps: false }, { ...context(), jobId: "job-2" }),
    (error) => error?.code === "TRANSCRIPTION_BUSY"
  );
  release(validRaw());
  await first;
  await engine.transcribe({ inputUri: localInput, wordTimestamps: false }, { ...context(), jobId: "job-3" });
  assert.equal(runner.calls.length, 2);
});

test("cancellation terminates and reaps the process worker", async () => {
  const workerScript = path.join(here, "fixtures", "sleep_worker.py");
  const processRunner = new ProcessTranscriptionWorkerRunner({
    runtime: { mode: "development", pythonExecutable: python, workerScript },
    stopTimeoutMs: 200
  });
  const engine = new FasterWhisperTranscriptionAdapter({ runtime, profile, runner: processRunner });
  const controller = new AbortController();
  const job = engine.transcribe({ inputUri: localInput, wordTimestamps: false }, context(controller.signal));
  const deadline = Date.now() + 2000;
  while (!processRunner.workerPid && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
  const pid = processRunner.workerPid;
  assert.equal(typeof pid, "number");
  controller.abort();
  await assert.rejects(job, (error) => error?.code === "TRANSCRIPTION_CANCELLED");
  assert.equal(processRunner.workerPid, undefined);
  assert.throws(() => process.kill(pid, 0));
});

test("managed mode never falls back to system Python when runtime is unavailable", async () => {
  const missing = path.join(os.tmpdir(), "cevra-missing-runtime", "env", "bin", "python3");
  const engine = new FasterWhisperTranscriptionAdapter({
    runtime: {
      mode: "managed",
      pythonExecutable: missing,
      privatePythonRoot: path.join(os.tmpdir(), "cevra-missing-runtime", "python"),
      environmentRoot: path.join(os.tmpdir(), "cevra-missing-runtime", "env")
    },
    profile
  });
  await assert.rejects(
    engine.transcribe({ inputUri: localInput, wordTimestamps: false }, context()),
    (error) => error?.code === "TRANSCRIPTION_RUNTIME_UNAVAILABLE"
  );
});

test("transcription configuration leaves a protected Media Runtime tree untouched", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cevra-transcription-isolation-"));
  const mediaManifest = path.join(root, "media", "manifest.json");
  fs.mkdirSync(path.dirname(mediaManifest), { recursive: true });
  fs.writeFileSync(mediaManifest, "sealed-media-runtime");
  const runner = fakeRunner();
  await adapter(runner).transcribe({ inputUri: localInput, wordTimestamps: false }, context());
  assert.equal(fs.readFileSync(mediaManifest, "utf8"), "sealed-media-runtime");
});

test("health and capabilities distinguish native timing from unavailable forced alignment", async () => {
  const engine = adapter(fakeRunner());
  assert.equal((await engine.healthcheck()).status, "ready");
  const capabilities = await engine.capabilities();
  assert.equal(capabilities.find(({ id }) => id === "transcription.word-timestamps.model").available, true);
  assert.equal(capabilities.find(({ id }) => id === "transcription.forced-alignment").available, false);
});
