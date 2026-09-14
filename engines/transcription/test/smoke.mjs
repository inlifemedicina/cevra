import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  FasterWhisperTranscriptionAdapter,
  ProcessTranscriptionWorkerRunner
} from "../dist/index.js";

if (process.env.CEVRA_TRANSCRIPTION_SMOKE !== "1") {
  throw new Error("Set CEVRA_TRANSCRIPTION_SMOKE=1 to run the opt-in real transcription smoke test.");
}

const pythonExecutable = requiredAbsolutePath("CEVRA_TRANSCRIPTION_SMOKE_PYTHON", true);
const environmentRoot = requiredAbsolutePath("CEVRA_TRANSCRIPTION_SMOKE_ENV_ROOT", true);
const audioPath = requiredAbsolutePath("CEVRA_TRANSCRIPTION_SMOKE_AUDIO", true);
const modelCacheDir = requiredAbsolutePath("CEVRA_TRANSCRIPTION_SMOKE_MODEL_CACHE", true);
const privatePythonRoot = optionalAbsolutePath("CEVRA_TRANSCRIPTION_SMOKE_PRIVATE_PYTHON_ROOT", true);
const protectedRoots = (process.env.CEVRA_TRANSCRIPTION_SMOKE_PROTECTED_ROOTS ?? "")
  .split(path.delimiter)
  .filter(Boolean)
  .map((root) => absolutePath("CEVRA_TRANSCRIPTION_SMOKE_PROTECTED_ROOTS", root, true));
const runtime = privatePythonRoot
  ? { mode: "managed", pythonExecutable, environmentRoot, privatePythonRoot, protectedRoots }
  : { mode: "development", pythonExecutable, environmentRoot };
const profile = {
  modelId: "tiny",
  modelCacheDir,
  allowModelDownload: false,
  device: "cpu",
  computeType: "int8"
};

const runner = new ProcessTranscriptionWorkerRunner({ runtime, stopTimeoutMs: 2000 });
const engine = new FasterWhisperTranscriptionAdapter({ runtime, profile, runner });
const result = await engine.transcribe(
  { inputUri: audioPath, language: "auto", wordTimestamps: true },
  { jobId: "real-smoke-transcription", locale: "en-US" }
);

assert.equal(result.modelId, "tiny");
assert.equal(result.wordTiming, "model");
assert.ok(result.detectedLanguage);
assert.ok(result.durationMs && result.durationMs > 0);
assert.ok(result.transcript.segments.length > 0);
assert.ok(result.transcript.words.length > 0);
const ids = [
  ...result.transcript.segments.map(({ id }) => id),
  ...result.transcript.words.map(({ id }) => id)
];
assert.equal(new Set(ids).size, ids.length);
const wordsById = new Map(result.transcript.words.map((word) => [word.id, word]));
for (const segment of result.transcript.segments) {
  assert.ok(segment.endMs > segment.startMs);
  for (const wordId of segment.wordIds) {
    const word = wordsById.get(wordId);
    assert.ok(word);
    assert.ok(word.endMs > word.startMs);
    assert.ok(word.startMs >= segment.startMs);
    assert.ok(word.endMs <= segment.endMs);
  }
}

const cancellationRunner = new ProcessTranscriptionWorkerRunner({ runtime, stopTimeoutMs: 2000 });
const cancellationEngine = new FasterWhisperTranscriptionAdapter({ runtime, profile, runner: cancellationRunner });
const controller = new AbortController();
const cancelledJob = cancellationEngine.transcribe(
  { inputUri: audioPath, language: "auto", wordTimestamps: true },
  { jobId: "real-smoke-cancellation", locale: "en-US", signal: controller.signal }
);
const deadline = Date.now() + 5000;
while (cancellationRunner.workerPid === undefined && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 10));
}
const cancelledPid = cancellationRunner.workerPid;
assert.equal(typeof cancelledPid, "number");
controller.abort("smoke cancellation");
await assert.rejects(cancelledJob, (error) => error?.code === "TRANSCRIPTION_CANCELLED");
assert.equal(cancellationRunner.workerPid, undefined);
assert.throws(() => process.kill(cancelledPid, 0));

console.log(JSON.stringify({
  status: "PASS",
  modelId: result.modelId,
  detectedLanguage: result.detectedLanguage,
  durationMs: result.durationMs,
  segments: result.transcript.segments.length,
  words: result.transcript.words.length,
  audioSha256: sha256(audioPath),
  runtimeMode: runtime.mode,
  allowModelDownloadDuringTranscription: false,
  cancellationReapedPid: cancelledPid
}, null, 2));

function requiredAbsolutePath(name, mustExist) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return absolutePath(name, value, mustExist);
}

function optionalAbsolutePath(name, mustExist) {
  const value = process.env[name];
  return value ? absolutePath(name, value, mustExist) : undefined;
}

function absolutePath(name, value, mustExist) {
  if (!path.isAbsolute(value)) throw new Error(`${name} must be an explicit absolute path.`);
  if (mustExist && !fs.existsSync(value)) throw new Error(`${name} does not exist.`);
  return value;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
