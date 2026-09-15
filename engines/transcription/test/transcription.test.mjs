import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import {
  FasterWhisperTranscriptionAdapter,
  LocalTranscriptionError,
  MODEL_TIMESTAMP_TOLERANCE_MS,
  ProcessTranscriptionWorkerRunner,
  TRANSCRIPTION_PROTOCOL_VERSION,
  assertModelCacheIsolated,
  resolveRuntimePaths
} from "../dist/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const explicitPython = process.env.CEVRA_TEST_PYTHON || process.execPath.replace(/node$/, "python3");
const pythonProbe = spawnSync(explicitPython, ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" });
const python = pythonProbe.status === 0 ? pythonProbe.stdout.trim() : "/usr/bin/python3";
const localInput = path.join(os.tmpdir(), "cevra-transcription-input.wav");
const runtime = { mode: "development", pythonExecutable: python };
const profile = { modelCacheDir: path.join(os.tmpdir(), "cevra-model-cache") };
const transportWorkerScript = path.join(here, "fixtures", "transport_worker.py");
const productionWorkerScript = path.resolve(here, "..", "python", "cevra_transcription_worker.py");
let realWorkerFixture;

test.after(() => {
  if (realWorkerFixture) fs.rmSync(realWorkerFixture.root, { recursive: true, force: true });
});

function controlledRealWorkerFixture() {
  if (realWorkerFixture) return realWorkerFixture;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cevra-real-transcription-worker-"));
  const environmentRoot = path.join(root, "environment");
  const venv = spawnSync(python, ["-m", "venv", "--without-pip", environmentRoot], { encoding: "utf8" });
  assert.equal(venv.status, 0, `controlled Python environment failed: ${venv.stderr}`);
  const pythonExecutable = path.join(environmentRoot, process.platform === "win32" ? "Scripts/python.exe" : "bin/python3");
  const siteProbe = spawnSync(pythonExecutable, ["-I", "-c", "import site; print(site.getsitepackages()[0])"], { encoding: "utf8" });
  assert.equal(siteProbe.status, 0, `site-packages probe failed: ${siteProbe.stderr}`);
  const packageRoot = path.join(siteProbe.stdout.trim(), "faster_whisper");
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, "__init__.py"), `
import os
import time
from types import SimpleNamespace

__version__ = "1.2.1"

class WhisperModel:
    def __init__(self, model_source, *, device, compute_type, download_root, local_files_only):
        if not local_files_only:
            raise RuntimeError("downloads must remain disabled")

    def transcribe(self, input_path, **options):
        delay = float(os.environ.get("CEVRA_TEST_FAKE_DELAY", "0"))
        if delay:
            time.sleep(delay)
        word = SimpleNamespace(start=0.0, end=0.5, word=" teste", probability=0.99)
        segment = SimpleNamespace(start=0.0, end=0.5, text=" teste controlado", words=[word])
        info = SimpleNamespace(language="pt", duration=0.5)
        return [segment], info
`, "utf8");
  const modelCacheDir = path.join(root, "model-cache");
  fs.mkdirSync(modelCacheDir);
  realWorkerFixture = { root, environmentRoot, pythonExecutable, modelCacheDir };
  return realWorkerFixture;
}

function productionRunner() {
  const fixture = controlledRealWorkerFixture();
  return new ProcessTranscriptionWorkerRunner({
    runtime: {
      mode: "development",
      pythonExecutable: fixture.pythonExecutable,
      environmentRoot: fixture.environmentRoot,
      workerScript: productionWorkerScript
    },
    stopTimeoutMs: 200
  });
}

function productionRequest() {
  const fixture = controlledRealWorkerFixture();
  return {
    protocolVersion: TRANSCRIPTION_PROTOCOL_VERSION,
    operation: "transcribe",
    jobId: "real-worker-normal-completion",
    inputPath: localInput,
    language: "pt",
    modelId: "base",
    modelCacheDir: fixture.modelCacheDir,
    device: "cpu",
    computeType: "int8",
    wordTimestamps: true,
    allowModelDownload: false
  };
}

async function runProductionWorkerMain(request, { closeStdin = false, delay = false } = {}) {
  const fixture = controlledRealWorkerFixture();
  const child = spawn(fixture.pythonExecutable, ["-I", "-B", productionWorkerScript], {
    cwd: fixture.environmentRoot,
    env: {
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      PYTHONNOUSERSITE: "1",
      PYTHONDONTWRITEBYTECODE: "1",
      VIRTUAL_ENV: fixture.environmentRoot,
      PATH: "",
      CEVRA_TRANSCRIPTION_MANAGED: "0",
      ...(delay ? { CEVRA_TEST_FAKE_DELAY: "1" } : {}),
      HF_HOME: fixture.modelCacheDir,
      HUGGINGFACE_HUB_CACHE: fixture.modelCacheDir,
      HF_HUB_OFFLINE: "1"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  child.stdin.on("error", () => undefined);
  const line = `${JSON.stringify(request)}\n`;
  if (closeStdin) child.stdin.end(line);
  else child.stdin.write(line);
  const [code, signal] = await once(child, "close");
  return { code, signal, stdout, stderr };
}

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

function transportRunner(runtimeOverride = {}) {
  return new ProcessTranscriptionWorkerRunner({
    runtime: { mode: "development", pythonExecutable: python, workerScript: transportWorkerScript, ...runtimeOverride },
    stopTimeoutMs: 200
  });
}

function transportRequest(modelId) {
  return {
    protocolVersion: TRANSCRIPTION_PROTOCOL_VERSION,
    operation: "transcribe",
    inputPath: localInput,
    modelId,
    modelCacheDir: profile.modelCacheDir,
    device: "cpu",
    computeType: "int8",
    wordTimestamps: false,
    allowModelDownload: false
  };
}

function managedRuntimeFixture({ copyExecutable = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cevra-transcription-managed-"));
  const privatePythonRoot = path.join(root, "private-python");
  const privateBin = path.join(privatePythonRoot, "bin");
  const baseExecutable = path.join(privateBin, "python3.12");
  const environmentRoot = path.join(root, "transcription-env");
  const environmentBin = path.join(environmentRoot, "bin");
  const pythonExecutable = path.join(environmentBin, "python3.12");
  const mediaRuntimeRoot = path.join(root, "media-runtime");
  fs.mkdirSync(privateBin, { recursive: true });
  fs.mkdirSync(environmentBin, { recursive: true });
  fs.mkdirSync(mediaRuntimeRoot, { recursive: true });
  fs.writeFileSync(baseExecutable, "authorized-private-python");
  if (copyExecutable) fs.copyFileSync(baseExecutable, pythonExecutable);
  else fs.symlinkSync(baseExecutable, pythonExecutable);
  fs.writeFileSync(path.join(environmentRoot, "pyvenv.cfg"), [
    `home = ${privateBin}`,
    "include-system-site-packages = false",
    "version = 3.12.14",
    `executable = ${baseExecutable}`,
    `base-executable = ${baseExecutable}`,
    ""
  ].join("\n"));
  return {
    root,
    privatePythonRoot,
    privateBin,
    baseExecutable,
    environmentRoot,
    pythonExecutable,
    mediaRuntimeRoot,
    runtime: {
      mode: "managed",
      pythonExecutable,
      privatePythonRoot,
      environmentRoot,
      protectedRoots: [mediaRuntimeRoot]
    }
  };
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
    validRaw({ segments: [{ startSeconds: Number.NaN, endSeconds: 1, text: "bad" }] }),
    validRaw({ segments: [{ startSeconds: 1, endSeconds: 0.999, text: "bad" }] })
  ]) {
    await assert.rejects(
      adapter(fakeRunner(raw)).transcribe({ inputUri: localInput, language: "auto", wordTimestamps: false }, context()),
      (error) => error?.code === "TRANSCRIPTION_MALFORMED_RESULT"
    );
  }
});

test("normalizes collapsed and zero-duration model intervals to one millisecond", async () => {
  const result = await adapter(fakeRunner(validRaw({
    segments: [
      { startSeconds: 0.0003, endSeconds: 0.0004, text: "quantized" },
      { startSeconds: 0.5, endSeconds: 0.5, text: "zero" }
    ]
  }))).transcribe({ inputUri: localInput, language: "auto", wordTimestamps: false }, context());
  assert.deepEqual(
    result.transcript.segments.map(({ startMs, endMs }) => ({ startMs, endMs })),
    [{ startMs: 0, endMs: 1 }, { startMs: 500, endMs: 501 }]
  );
});

test("clamps model word boundary drift within the explicit 20 ms precision", async () => {
  assert.equal(MODEL_TIMESTAMP_TOLERANCE_MS, 20);
  const result = await adapter(fakeRunner(validRaw({
    segments: [
      {
        startSeconds: 1,
        endSeconds: 2,
        text: "near",
        words: [{ startSeconds: 0.995, endSeconds: 2.005, text: "near" }]
      },
      {
        startSeconds: 3,
        endSeconds: 4,
        text: "boundary",
        words: [{ startSeconds: 2.98, endSeconds: 4.02, text: "boundary" }]
      }
    ]
  }))).transcribe({ inputUri: localInput, language: "auto", wordTimestamps: true }, context());
  assert.deepEqual(
    result.transcript.words.map(({ startMs, endMs }) => ({ startMs, endMs })),
    [{ startMs: 1000, endMs: 2000 }, { startMs: 3000, endMs: 4000 }]
  );
  for (const segment of result.transcript.segments) {
    assert.ok(segment.endMs > segment.startMs);
    for (const wordId of segment.wordIds) {
      const word = result.transcript.words.find(({ id }) => id === wordId);
      assert.ok(word);
      assert.ok(word.endMs > word.startMs);
      assert.ok(word.startMs >= segment.startMs);
      assert.ok(word.endMs <= segment.endMs);
    }
  }
});

test("rejects model word boundary drift beyond 20 ms", async () => {
  const runner = fakeRunner(validRaw({ segments: [{
    startSeconds: 1,
    endSeconds: 2,
    text: "far",
    words: [{ startSeconds: 0.979, endSeconds: 2, text: "far" }]
  }] }));
  await assert.rejects(
    adapter(runner).transcribe({ inputUri: localInput, language: "auto", wordTimestamps: true }, context()),
    (error) => error?.code === "TRANSCRIPTION_MALFORMED_RESULT"
  );
});

test("fails closed when requested words are missing, reversed, invalid, or materially outside their segment", async () => {
  const missing = fakeRunner(validRaw());
  await assert.rejects(
    adapter(missing).transcribe({ inputUri: localInput, language: "auto", wordTimestamps: true }, context()),
    (error) => error?.code === "TRANSCRIPTION_MALFORMED_RESULT"
  );
  for (const word of [
    { startSeconds: 0, endSeconds: 1.5, text: "outside" },
    { startSeconds: 1.5, endSeconds: 1.4, text: "reversed" },
    { startSeconds: -0.001, endSeconds: 1.5, text: "negative" },
    { startSeconds: Number.NaN, endSeconds: 1.5, text: "nan" }
  ]) {
    const runner = fakeRunner(validRaw({ segments: [{ startSeconds: 1, endSeconds: 2, text: "bad", words: [word] }] }));
    await assert.rejects(
      adapter(runner).transcribe({ inputUri: localInput, language: "auto", wordTimestamps: true }, context()),
      (error) => error?.code === "TRANSCRIPTION_MALFORMED_RESULT"
    );
  }
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

test("real production worker health completes normally without SIGABRT", async (context) => {
  const runner = productionRunner();
  assert.deepEqual(await runner.healthcheck(), {
    protocolVersion: 1,
    status: "ready",
    fasterWhisperVersion: "1.2.1"
  });
  assert.equal(runner.workerPid, undefined);
  const completed = await runProductionWorkerMain({ protocolVersion: 1, operation: "health" });
  assert.equal(completed.code, 0);
  assert.equal(completed.signal, null);
  assert.equal(JSON.parse(completed.stdout).ok, true);
  assert.doesNotMatch(completed.stderr, /Py_FatalError|SIGABRT|_enter_buffered_busy/);
  context.diagnostic("real worker health parsed after process close: exit code 0, signal null, no Py_FatalError/SIGABRT");
});

test("real production worker transcription completes normally without SIGABRT", async (context) => {
  const runner = productionRunner();
  const result = await runner.transcribe(productionRequest(), context.signal ? { jobId: "real-worker", locale: "pt-BR", signal: context.signal } : { jobId: "real-worker", locale: "pt-BR" });
  assert.deepEqual(result, {
    protocolVersion: 1,
    modelId: "base",
    detectedLanguage: "pt",
    durationSeconds: 0.5,
    segments: [{
      startSeconds: 0,
      endSeconds: 0.5,
      text: " teste controlado",
      words: [{ startSeconds: 0, endSeconds: 0.5, text: " teste", confidence: 0.99 }]
    }]
  });
  assert.equal(runner.workerPid, undefined);
  const completed = await runProductionWorkerMain(productionRequest());
  assert.equal(completed.code, 0);
  assert.equal(completed.signal, null);
  const envelope = JSON.parse(completed.stdout);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.result.segments[0].text, " teste controlado");
  assert.doesNotMatch(completed.stderr, /Py_FatalError|SIGABRT|_enter_buffered_busy/);
  context.diagnostic("real worker transcription envelope parsed after process close: exit code 0, signal null, no Py_FatalError/SIGABRT");
});

test("closing stdin after the request deterministically violates the parent-liveness contract", { skip: process.platform === "win32" }, async (context) => {
  const completed = await runProductionWorkerMain(productionRequest(), { closeStdin: true, delay: true });
  assert.equal(completed.code, 70);
  assert.equal(completed.signal, null);
  assert.doesNotMatch(completed.stderr, /Py_FatalError|SIGABRT|_enter_buffered_busy/);
  context.diagnostic("intentional early stdin EOF produced deterministic contract-violation exit code 70, signal null");
});

test("process transport preserves PT-BR UTF-8 split across stdout chunks", async () => {
  const result = await transportRunner().transcribe(transportRequest("split-utf8-ptbr"), context());
  assert.deepEqual(result, { text: "Ação, saúde e coração" });
});

test("process transport preserves four-byte Unicode split across stdout chunks", async () => {
  const result = await transportRunner().transcribe(transportRequest("split-utf8-four-byte"), context());
  assert.deepEqual(result, { text: "CEVRA 😀 Orbit" });
});

test("process transport waits for stream close after worker exit before parsing JSON", async () => {
  const runner = transportRunner();
  let settled = false;
  const job = runner.transcribe(transportRequest("exit-before-close"), context()).then((result) => {
    settled = true;
    return result;
  });
  const startDeadline = Date.now() + 2000;
  while (!runner.workerPid && Date.now() < startDeadline) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(typeof runner.workerPid, "number");
  const exitDeadline = Date.now() + 2000;
  while (runner.workerPid && Date.now() < exitDeadline) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(runner.workerPid, undefined, "the parent worker must exit before its inherited stdout closes");
  assert.equal(settled, false, "the response must remain pending until stdout closes");
  assert.deepEqual(await job, { text: "complete only after stream close" });
});

test("process transport fails closed for invalid JSON", async () => {
  await assert.rejects(
    transportRunner().transcribe(transportRequest("invalid-json"), context()),
    (error) => error?.code === "TRANSCRIPTION_MALFORMED_RESULT"
  );
});

test("process transport preserves typed abnormal-exit errors and stderr evidence", async () => {
  await assert.rejects(
    transportRunner().transcribe(transportRequest("abnormal-exit"), context()),
    (error) => error?.code === "TRANSCRIPTION_FAILED" && error.cause?.message.includes("fixture failed")
  );
});

test("process transport enforces the bounded worker output limit", async () => {
  const runner = transportRunner();
  await assert.rejects(
    runner.transcribe(transportRequest("output-limit"), context()),
    (error) => error?.code === "TRANSCRIPTION_FAILED" && error.message.includes("output limit")
  );
  assert.equal(runner.workerPid, undefined);
});

test("process transport preserves typed spawn errors", { skip: process.platform === "win32" }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cevra-transcription-spawn-error-"));
  const invalidExecutable = path.join(root, "not-executable");
  fs.writeFileSync(invalidExecutable, "not an executable");
  fs.chmodSync(invalidExecutable, 0o644);
  await assert.rejects(
    transportRunner({ pythonExecutable: invalidExecutable, workerScript: transportWorkerScript }).transcribe(
      transportRequest("split-utf8-ptbr"),
      context()
    ),
    (error) => error?.code === "TRANSCRIPTION_WORKER_START_FAILED" && error.cause instanceof Error
  );
});

test("healthcheck and capabilities never replace the active transcription PID", async () => {
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
  const transcriptionPid = processRunner.workerPid;
  assert.equal(typeof transcriptionPid, "number");

  assert.equal((await engine.healthcheck()).status, "ready");
  const capabilities = await engine.capabilities();
  assert.equal(capabilities.find(({ id }) => id === "transcription.local.faster-whisper").available, true);
  assert.equal(processRunner.workerPid, transcriptionPid);
  assert.doesNotThrow(() => process.kill(transcriptionPid, 0));

  controller.abort();
  await assert.rejects(job, (error) => error?.code === "TRANSCRIPTION_CANCELLED");
  assert.equal(processRunner.workerPid, undefined);
  assert.throws(() => process.kill(transcriptionPid, 0));
});

test("managed mode accepts copy-style and symlink venvs only when pyvenv.cfg proves the private base", () => {
  for (const copyExecutable of [true, false]) {
    const fixture = managedRuntimeFixture({ copyExecutable });
    const resolved = resolveRuntimePaths(fixture.runtime);
    assert.equal(resolved.environmentRoot, fs.realpathSync(fixture.environmentRoot));
    assert.equal(resolved.pythonExecutable, fixture.pythonExecutable);
  }

  const unrelated = managedRuntimeFixture();
  const systemRoot = path.join(unrelated.root, "unrelated-system-python");
  const systemBin = path.join(systemRoot, "bin");
  const systemPython = path.join(systemBin, "python3.12");
  fs.mkdirSync(systemBin, { recursive: true });
  fs.writeFileSync(systemPython, "unrelated-python");
  fs.copyFileSync(systemPython, unrelated.pythonExecutable);
  fs.writeFileSync(path.join(unrelated.environmentRoot, "pyvenv.cfg"), [
    `home = ${systemBin}`,
    "include-system-site-packages = false",
    `executable = ${systemPython}`,
    ""
  ].join("\n"));
  assert.throws(
    () => resolveRuntimePaths(unrelated.runtime),
    (error) => error?.code === "TRANSCRIPTION_RUNTIME_UNAVAILABLE"
  );
});

test("managed mode fails closed for absent, malformed, contradictory, or system-enabled pyvenv.cfg", () => {
  const cases = [
    { name: "absent", contents: undefined },
    { name: "malformed", contents: "this is not configuration\n" },
    { name: "missing provenance", contents: "include-system-site-packages = false\n" },
    { name: "system packages", contents: "home = /tmp\ninclude-system-site-packages = true\n" }
  ];
  for (const candidate of cases) {
    const fixture = managedRuntimeFixture();
    const config = path.join(fixture.environmentRoot, "pyvenv.cfg");
    if (candidate.contents === undefined) fs.unlinkSync(config);
    else fs.writeFileSync(config, candidate.contents);
    assert.throws(
      () => resolveRuntimePaths(fixture.runtime),
      (error) => error?.code === "TRANSCRIPTION_RUNTIME_UNAVAILABLE",
      candidate.name
    );
  }

  const contradiction = managedRuntimeFixture();
  fs.writeFileSync(path.join(contradiction.environmentRoot, "pyvenv.cfg"), [
    `home = ${contradiction.privateBin}`,
    "include-system-site-packages = false",
    "executable = /usr/bin/python3",
    ""
  ].join("\n"));
  assert.throws(
    () => resolveRuntimePaths(contradiction.runtime),
    (error) => error?.code === "TRANSCRIPTION_RUNTIME_UNAVAILABLE"
  );
});

test("managed mode never searches PATH when its explicit interpreter is unavailable", () => {
  const fixture = managedRuntimeFixture();
  const previousPath = process.env.PATH;
  process.env.PATH = path.dirname(python);
  try {
    assert.throws(
      () => resolveRuntimePaths({ ...fixture.runtime, pythonExecutable: path.join(fixture.environmentRoot, "bin", "missing-python") }),
      (error) => error?.code === "TRANSCRIPTION_RUNTIME_UNAVAILABLE"
    );
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
});

test("managed model cache accepts an independent sibling and rejects every protected overlap", () => {
  const fixture = managedRuntimeFixture();
  const { protectedRoots } = resolveRuntimePaths(fixture.runtime);
  assert.doesNotThrow(() => assertModelCacheIsolated(path.join(fixture.root, "model-cache"), protectedRoots));

  for (const rejected of [
    fixture.privatePythonRoot,
    path.join(fixture.privatePythonRoot, "models"),
    path.join(fixture.environmentRoot, "models"),
    path.join(fixture.mediaRuntimeRoot, "models"),
    fixture.root
  ]) {
    assert.throws(
      () => assertModelCacheIsolated(rejected, protectedRoots),
      (error) => error?.code === "TRANSCRIPTION_RUNTIME_UNAVAILABLE"
    );
  }
});

test("managed model cache canonicalizes symlink ancestors and rejects protected targets", () => {
  const fixture = managedRuntimeFixture();
  const { protectedRoots } = resolveRuntimePaths(fixture.runtime);
  const link = path.join(fixture.root, "model-cache-link");
  fs.symlinkSync(fixture.privatePythonRoot, link);
  assert.throws(
    () => assertModelCacheIsolated(path.join(link, "future-cache"), protectedRoots),
    (error) => error?.code === "TRANSCRIPTION_RUNTIME_UNAVAILABLE"
  );
});

test("health and capabilities distinguish native timing from unavailable forced alignment", async () => {
  const engine = adapter(fakeRunner());
  assert.equal((await engine.healthcheck()).status, "ready");
  const capabilities = await engine.capabilities();
  assert.equal(capabilities.find(({ id }) => id === "transcription.word-timestamps.model").available, true);
  assert.equal(capabilities.find(({ id }) => id === "transcription.forced-alignment").available, false);
});
