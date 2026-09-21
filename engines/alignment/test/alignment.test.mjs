import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import { mkdtemp, mkdir, readFile, rename, rm, stat, symlink, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ALIGNMENT_MODELS,
  CtcForcedAlignmentAdapter,
  LocalAlignmentError,
  NodeAlignmentAudioWorkspace,
  PinnedAlignmentModelVerifier,
  ProcessAlignmentWorkerRunner,
  assertModelRootIsolated,
  normalizeAlignmentRequest,
  normalizeAlignmentWorkerResult,
  verifyPinnedModel
} from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureWorker = resolve(here, "fixtures/transport_worker.py");
const productionWorker = resolve(here, "../python/cevra_alignment_worker.py");
const python = process.env.PYTHON ?? "/usr/bin/python3";
function transcript() { return { language: "pt", words: [{ id: "w1", text: "olá", startMs: 0, endMs: 100 }], segments: [{ id: "s1", text: "olá", startMs: 0, endMs: 100, wordIds: ["w1"] }] }; }
function raw(request, overrides = {}) { return { protocolVersion: 1, transcript: structuredClone(request.transcript), modelId: request.modelId, modelRevision: request.modelRevision, modelDigest: request.modelDigest, durationMs: 100, ...overrides }; }
function runner(impl = async (request) => raw(request)) { return { calls: [], async healthcheck() { return { protocolVersion: 1, status: "ready", alignmentVersion: "0.1.0" }; }, async align(request, context) { this.calls.push({ request, context }); return impl(request, context); } }; }
function adapter(fake = runner(), verify = async () => undefined) { return new CtcForcedAlignmentAdapter({ runtime: { mode: "development", pythonExecutable: python }, profile: { modelRoot: "/models", allowModelDownload: false }, runner: fake, modelVerifier: verify }); }
function workerRequest(jobId) { const pin = ALIGNMENT_MODELS.pt; return { protocolVersion: 1, operation: "align", jobId, inputPath: "/tmp/audio.wav", language: "pt", transcript: transcript(), modelPath: "/tmp/model", modelId: pin.modelId, modelRevision: pin.revision, modelDigest: pin.modelDigest, allowModelDownload: false, device: "cpu" }; }
function processRunner() { return new ProcessAlignmentWorkerRunner({ runtime: { mode: "development", pythonExecutable: python, environmentRoot: dirname(python), workerScript: fixtureWorker }, stopTimeoutMs: 200 }); }
function controlledPython(delay = false) {
  const root = fs.mkdtempSync(join(tmpdir(), "cevra-alignment-python-")); const environmentRoot = join(root, "environment");
  const made = spawnSync(python, ["-m", "venv", "--without-pip", environmentRoot], { encoding: "utf8" }); assert.equal(made.status, 0, made.stderr);
  const pythonExecutable = join(environmentRoot, process.platform === "win32" ? "Scripts/python.exe" : "bin/python3");
  const site = spawnSync(pythonExecutable, ["-I", "-c", "import sysconfig; print(sysconfig.get_paths()['purelib'])"], { encoding: "utf8" }); assert.equal(site.status, 0, site.stderr);
  fs.writeFileSync(join(site.stdout.trim(), "torch.py"), `${delay ? "import time; time.sleep(30)\n" : ""}__version__ = "2.8.0"\n`, "utf8");
  fs.writeFileSync(join(site.stdout.trim(), "transformers.py"), `__version__ = "4.57.6"\n`, "utf8");
  return { root, environmentRoot, pythonExecutable };
}

async function preparedModel(context, language = "pt", root) {
  const modelRoot = root ?? await mkdtemp(join(tmpdir(), "cevra-attested-model-"));
  if (!root) context.after(() => fs.rmSync(modelRoot, { recursive: true, force: true }));
  const pin = ALIGNMENT_MODELS[language];
  const modelPath = join(modelRoot, pin.directoryName);
  await mkdir(modelPath, { recursive: true });
  const fixtureHashes = {};
  for (const name of Object.keys(pin.files)) {
    const bytes = Buffer.from(`fixture:${language}:${name}:verified-content`, "utf8");
    await writeFile(join(modelPath, name), bytes);
    fixtureHashes[name] = createHash("sha256").update(bytes).digest("hex");
  }
  return { modelRoot, modelPath, pin, fixtureHashes };
}

function fixtureVerifier(expectedByPath, counters = { strong: 0, state: 0, memo: 0, weightBytesHashed: 0 }, options = {}) {
  const verifier = new PinnedAlignmentModelVerifier({
    async strongVerifier(modelPath, pin) {
      counters.strong += 1;
      const files = expectedByPath.get(modelPath);
      assert.ok(files, `missing fixture inventory for ${modelPath}`);
      await verifyPinnedModel(modelPath, files);
      const principalDigest = pin.modelDigest.replace(/^sha256:/, "");
      const principalWeight = Object.entries(files).find(([, digest]) => digest === principalDigest)?.[0]
        ?? Object.keys(files).find((name) => name.endsWith(".bin") || name.endsWith(".safetensors"));
      if (principalWeight) counters.weightBytesHashed += Number((await stat(join(modelPath, principalWeight))).size);
    },
    disableMemoization: options.disableMemoization,
    onStateCheck() { counters.state += 1; },
    onMemoHit() { counters.memo += 1; }
  });
  return { counters, verify: verifier.ensureVerified.bind(verifier) };
}

test("provider-neutral adapter identity and capability IDs use alignment kind", async () => {
  const value = adapter();
  assert.deepEqual(await value.identity(), { id: "cevra.alignment.ctc", kind: "alignment", displayName: "CEVRA Local Forced Alignment", version: "0.1.0", apiVersion: 1 });
  assert.deepEqual((await value.capabilities()).map(({ id, available }) => ({ id, available })), [{ id: "alignment.local.ctc.pt", available: true }, { id: "alignment.local.ctc.en", available: true }]);
});

test("adapter sends a closed local-only protocol request and propagates pinned identity", async () => {
  const fake = runner(); const value = adapter(fake); const result = await value.align({ inputUri: "/tmp/audio.wav", language: "pt", transcript: transcript() }, { jobId: "job", locale: "pt-BR" });
  assert.equal(fake.calls[0].request.allowModelDownload, false);
  assert.equal(fake.calls[0].request.modelId, ALIGNMENT_MODELS.pt.modelId);
  assert.equal(fake.calls[0].request.modelRevision, ALIGNMENT_MODELS.pt.revision);
  assert.equal(fake.calls[0].request.modelDigest, ALIGNMENT_MODELS.pt.modelDigest);
  assert.equal(result.modelRevision, ALIGNMENT_MODELS.pt.revision);
});

test("alignment execution identity is immutable and model-free while execution verifies before and after", async () => {
  let verificationCalls = 0;
  const value = adapter(runner(), async () => { verificationCalls++; });
  const request = { inputUri: "/tmp/audio.wav", language: "pt", transcript: transcript() };
  for (const language of ["pt", "en"]) {
    const identity = await value.describeAlignmentExecution({ ...request, language, transcript: { ...transcript(), language } });
    assert.equal(identity.modelId, ALIGNMENT_MODELS[language].modelId);
    assert.equal(identity.modelRevision, ALIGNMENT_MODELS[language].revision);
    assert.equal(identity.modelDigest, ALIGNMENT_MODELS[language].modelDigest);
  }
  assert.equal(verificationCalls, 0, "cache identity description must not read or hash local model artifacts");
  await value.align(request, { jobId: "job", locale: "pt-BR" });
  assert.equal(verificationCalls, 2, "align() verifies immediately before and after execution");
  assert.ok(await value.describeAlignmentExecution(request));
  assert.equal(verificationCalls, 2, "identity description remains independent of local model availability");
});

test("execution identity remains available when the pinned local model is missing or corrupt", async () => {
  let verificationCalls = 0;
  const value = adapter(runner(), async () => { verificationCalls += 1; throw new LocalAlignmentError("ALIGNMENT_MODEL_UNAVAILABLE", "injected"); });
  const request = { inputUri: "/tmp/audio.wav", language: "pt", transcript: transcript() };
  const identity = await value.describeAlignmentExecution(request);
  assert.equal(identity.modelId, ALIGNMENT_MODELS.pt.modelId);
  assert.equal(identity.modelRevision, ALIGNMENT_MODELS.pt.revision);
  assert.equal(identity.modelDigest, ALIGNMENT_MODELS.pt.modelDigest);
  assert.equal(verificationCalls, 0);
  await assert.rejects(value.align(request, { jobId: "fresh-miss", locale: "pt-BR" }), (error) => error.code === "ALIGNMENT_MODEL_UNAVAILABLE");
  assert.equal(verificationCalls, 1, "a fresh execution still fails closed before worker launch");
});

test("process-local attestation performs one full hash then reuses exact unchanged model state", async (context) => {
  const fixture = await preparedModel(context);
  const attestation = fixtureVerifier(new Map([[fixture.modelPath, fixture.fixtureHashes]]));
  const fake = runner();
  const value = new CtcForcedAlignmentAdapter({ runtime: { mode: "development", pythonExecutable: python }, profile: { modelRoot: fixture.modelRoot, allowModelDownload: false }, runner: fake, modelVerifier: attestation.verify });
  const request = { inputUri: "/tmp/audio.wav", language: "pt", transcript: transcript() };
  assert.ok(await value.describeAlignmentExecution(request));
  assert.equal(attestation.counters.strong, 0);
  assert.equal(attestation.counters.weightBytesHashed, 0, "cache identity description hashes zero model-weight bytes");
  await value.align(request, { jobId: "first", locale: "pt-BR" });
  assert.equal(attestation.counters.strong, 1, "post-execution check must reuse the first cryptographic proof");
  assert.ok(attestation.counters.weightBytesHashed > 0, "the first real execution hashes the fixture weight once");
  await value.align(request, { jobId: "second", locale: "pt-BR" });
  assert.equal(attestation.counters.strong, 1, "unchanged process-local state must not rehash weights");
  assert.equal(fake.calls.length, 2);
  assert.ok(attestation.counters.memo >= 3);
});

test("weak filesystem metadata fallback disables memoization and repeats full verification", async (context) => {
  const fixture = await preparedModel(context);
  const attestation = fixtureVerifier(new Map([[fixture.modelPath, fixture.fixtureHashes]]), undefined, { disableMemoization: true });
  await attestation.verify(fixture.modelPath, fixture.pin);
  await attestation.verify(fixture.modelPath, fixture.pin);
  assert.equal(attestation.counters.strong, 2, "a non-memoizable filesystem state must establish cryptographic proof every time");
  assert.equal(attestation.counters.memo, 0);
});

test("a new verifier process-equivalent instance must establish a new cryptographic proof", async (context) => {
  const fixture = await preparedModel(context);
  let full = 0;
  const strongVerifier = async (modelPath) => { full += 1; await verifyPinnedModel(modelPath, fixture.fixtureHashes); };
  const first = new PinnedAlignmentModelVerifier({ strongVerifier });
  await first.ensureVerified(fixture.modelPath, fixture.pin);
  await first.ensureVerified(fixture.modelPath, fixture.pin);
  assert.equal(full, 1);
  const restarted = new PinnedAlignmentModelVerifier({ strongVerifier });
  await restarted.ensureVerified(fixture.modelPath, fixture.pin);
  assert.equal(full, 2, "attestation must not survive process/verifier lifetime");
});

test("attestation detects same-size content replacement even when mtime is restored", async (context) => {
  const fixture = await preparedModel(context);
  const attestation = fixtureVerifier(new Map([[fixture.modelPath, fixture.fixtureHashes]]));
  const fake = runner();
  const value = new CtcForcedAlignmentAdapter({ runtime: { mode: "development", pythonExecutable: python }, profile: { modelRoot: fixture.modelRoot }, runner: fake, modelVerifier: attestation.verify });
  const request = { inputUri: "/tmp/audio.wav", language: "pt", transcript: transcript() };
  await value.align(request, { jobId: "baseline", locale: "pt-BR" });
  const weight = join(fixture.modelPath, "pytorch_model.bin");
  const before = await stat(weight);
  const original = await readFile(weight);
  await writeFile(weight, Buffer.alloc(original.length, 0x78));
  await utimes(weight, before.atime, before.mtime);
  await assert.rejects(value.align(request, { jobId: "tampered", locale: "pt-BR" }), (error) => error.code === "ALIGNMENT_MODEL_UNAVAILABLE");
  assert.equal(attestation.counters.strong, 2);
  assert.equal(fake.calls.length, 1);
});

test("attestation detects atomic expected-file replacement even with matching size and mtime", async (context) => {
  const fixture = await preparedModel(context);
  const attestation = fixtureVerifier(new Map([[fixture.modelPath, fixture.fixtureHashes]]));
  const fake = runner();
  const value = new CtcForcedAlignmentAdapter({ runtime: { mode: "development", pythonExecutable: python }, profile: { modelRoot: fixture.modelRoot }, runner: fake, modelVerifier: attestation.verify });
  const request = { inputUri: "/tmp/audio.wav", language: "pt", transcript: transcript() };
  await value.align(request, { jobId: "baseline", locale: "pt-BR" });
  const weight = join(fixture.modelPath, "pytorch_model.bin");
  const before = await stat(weight);
  const original = await readFile(weight);
  const replacement = join(fixture.modelRoot, "replacement.bin");
  await writeFile(replacement, Buffer.alloc(original.length, 0x79));
  await utimes(replacement, before.atime, before.mtime);
  await rename(replacement, weight);
  await assert.rejects(value.align(request, { jobId: "replaced", locale: "pt-BR" }), (error) => error.code === "ALIGNMENT_MODEL_UNAVAILABLE");
  assert.equal(attestation.counters.strong, 2);
  assert.equal(fake.calls.length, 1);
});

test("model directory identity replacement invalidates attestation and requires a new full proof", async (context) => {
  const fixture = await preparedModel(context);
  const attestation = fixtureVerifier(new Map([[fixture.modelPath, fixture.fixtureHashes]]));
  const fake = runner();
  const value = new CtcForcedAlignmentAdapter({ runtime: { mode: "development", pythonExecutable: python }, profile: { modelRoot: fixture.modelRoot }, runner: fake, modelVerifier: attestation.verify });
  const request = { inputUri: "/tmp/audio.wav", language: "pt", transcript: transcript() };
  await value.align(request, { jobId: "baseline", locale: "pt-BR" });
  const previous = `${fixture.modelPath}-previous`;
  await rename(fixture.modelPath, previous);
  await mkdir(fixture.modelPath);
  for (const name of Object.keys(fixture.pin.files)) await writeFile(join(fixture.modelPath, name), await readFile(join(previous, name)));
  await value.align(request, { jobId: "replacement-directory", locale: "pt-BR" });
  assert.equal(attestation.counters.strong, 2, "a new directory identity must not inherit the old proof");
  assert.equal(fake.calls.length, 2);
});

test("post-execution attestation rejects a model mutated while the worker runs", async (context) => {
  const fixture = await preparedModel(context);
  const attestation = fixtureVerifier(new Map([[fixture.modelPath, fixture.fixtureHashes]]));
  const weight = join(fixture.modelPath, "pytorch_model.bin");
  const fake = runner(async (request) => {
    const original = await readFile(weight);
    await writeFile(weight, Buffer.alloc(original.length, 0x7a));
    return raw(request);
  });
  const value = new CtcForcedAlignmentAdapter({ runtime: { mode: "development", pythonExecutable: python }, profile: { modelRoot: fixture.modelRoot }, runner: fake, modelVerifier: attestation.verify });
  await assert.rejects(value.align({ inputUri: "/tmp/audio.wav", language: "pt", transcript: transcript() }, { jobId: "mutated-during-worker", locale: "pt-BR" }), (error) => error.code === "ALIGNMENT_MODEL_UNAVAILABLE");
  assert.equal(attestation.counters.strong, 2);
  assert.equal(fake.calls.length, 1);
});

test("state mutation during full cryptographic verification is never attested", async (context) => {
  const fixture = await preparedModel(context);
  const weight = join(fixture.modelPath, "pytorch_model.bin");
  let full = 0;
  const verifier = new PinnedAlignmentModelVerifier({
    async strongVerifier(modelPath) {
      full += 1;
      await verifyPinnedModel(modelPath, fixture.fixtureHashes);
      const original = await readFile(weight);
      await writeFile(weight, Buffer.alloc(original.length, 0x7b));
    }
  });
  await assert.rejects(verifier.ensureVerified(fixture.modelPath, fixture.pin), (error) => error.code === "ALIGNMENT_MODEL_UNAVAILABLE");
  assert.equal(full, 1);
});

test("attested inventory fails closed for unexpected files, missing files, and symlinks", async (context) => {
  for (const attack of ["unexpected", "alternate-weight", "missing", "symlink"]) {
    const fixture = await preparedModel(context);
    const attestation = fixtureVerifier(new Map([[fixture.modelPath, fixture.fixtureHashes]]));
    await attestation.verify(fixture.modelPath, fixture.pin);
    const config = join(fixture.modelPath, "config.json");
    if (attack === "unexpected") await writeFile(join(fixture.modelPath, "injected.json"), "{}");
    if (attack === "alternate-weight") await writeFile(join(fixture.modelPath, "model.safetensors"), "unverified alternate weight");
    if (attack === "missing") await unlink(config);
    if (attack === "symlink") {
      const target = join(fixture.modelRoot, "external-config.json");
      await writeFile(target, await readFile(config));
      await unlink(config);
      await symlink(target, config);
    }
    await assert.rejects(attestation.verify(fixture.modelPath, fixture.pin), (error) => error.code === "ALIGNMENT_MODEL_UNAVAILABLE", attack);
  }
});

test("capability checks reuse process-local attestations while retaining exact integrity", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "cevra-capability-models-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pt = await preparedModel(context, "pt", root);
  const en = await preparedModel(context, "en", root);
  const attestation = fixtureVerifier(new Map([[pt.modelPath, pt.fixtureHashes], [en.modelPath, en.fixtureHashes]]));
  const value = new CtcForcedAlignmentAdapter({ runtime: { mode: "development", pythonExecutable: python }, profile: { modelRoot: root }, runner: runner(), modelVerifier: attestation.verify });
  assert.deepEqual((await value.capabilities()).map(({ available }) => available), [true, true]);
  assert.equal(attestation.counters.strong, 2);
  assert.deepEqual((await value.capabilities()).map(({ available }) => available), [true, true]);
  assert.equal(attestation.counters.strong, 2);
});

test("unsupported language, remote URI, missing context and unexpected request fields fail closed", async () => {
  const cases = [
    () => normalizeAlignmentRequest({ inputUri: "/tmp/a.wav", language: "es", transcript: transcript() }),
    () => normalizeAlignmentRequest({ inputUri: "https://host/a.wav", language: "pt", transcript: transcript() }),
    () => normalizeAlignmentRequest({ inputUri: "/tmp/a.wav", language: "pt", transcript: transcript(), extra: true })
  ];
  for (const run of cases) assert.throws(run, LocalAlignmentError);
  await assert.rejects(adapter().align({ inputUri: "/tmp/a.wav", language: "pt", transcript: transcript() }, { jobId: "", locale: "pt-BR" }), (e) => e.code === "ALIGNMENT_INVALID_REQUEST");
});

test("strict worker result rejects unknown fields, model mismatch, negative zero, and broken mapping", () => {
  const request = { protocolVersion: 1, operation: "align", jobId: "j", inputPath: "/a", language: "pt", transcript: transcript(), modelPath: "/m", modelId: ALIGNMENT_MODELS.pt.modelId, modelRevision: ALIGNMENT_MODELS.pt.revision, modelDigest: ALIGNMENT_MODELS.pt.modelDigest, allowModelDownload: false, device: "cpu" };
  const values = [
    raw(request, { extra: true }), raw(request, { modelId: "wrong" }),
    raw(request, { transcript: { ...transcript(), words: [{ ...transcript().words[0], startMs: -0 }] } }),
    raw(request, { transcript: { ...transcript(), segments: [{ ...transcript().segments[0], wordIds: ["missing"] }] } })
  ];
  for (const value of values) assert.throws(() => normalizeAlignmentWorkerResult(value, request, ALIGNMENT_MODELS.pt), (e) => e.code === "ALIGNMENT_MALFORMED_RESULT");
});

test("single-active-job gate rejects uncontrolled ML concurrency", async () => {
  let release; const pending = new Promise((resolvePromise) => { release = resolvePromise; }); const fake = runner(async (request) => { await pending; return raw(request); }); const value = adapter(fake);
  const first = value.align({ inputUri: "/tmp/a.wav", language: "pt", transcript: transcript() }, { jobId: "one", locale: "pt-BR" }); await new Promise(setImmediate);
  await assert.rejects(value.align({ inputUri: "/tmp/a.wav", language: "pt", transcript: transcript() }, { jobId: "two", locale: "pt-BR" }), (e) => e.code === "ALIGNMENT_BUSY");
  release(); await first;
});

test("adapter cancellation remains typed", async () => {
  const controller = new AbortController(); controller.abort("stop");
  await assert.rejects(adapter().align({ inputUri: "/tmp/a.wav", language: "pt", transcript: transcript() }, { jobId: "j", locale: "pt-BR", signal: controller.signal }), (e) => e.code === "ALIGNMENT_CANCELLED");
});

test("model verifier checks every artifact hash and rejects tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "cevra-model-")); await writeFile(join(root, "config.json"), "model"); const digest = createHash("sha256").update("model").digest("hex");
  await verifyPinnedModel(root, { "config.json": digest });
  await writeFile(join(root, "config.json"), "tampered");
  await assert.rejects(verifyPinnedModel(root, { "config.json": digest }), (e) => e.code === "ALIGNMENT_MODEL_UNAVAILABLE");
});

test("prepared model directory rejects every unexpected file and alternate weight", async () => {
  for (const injected of ["model.safetensors", "pytorch_model.bin", "unexpected-tokenizer.json"]) {
    const root = await mkdtemp(join(tmpdir(), "cevra-model-closed-"));
    await writeFile(join(root, "config.json"), "model");
    const digest = createHash("sha256").update("model").digest("hex");
    await writeFile(join(root, injected), "unverified");
    await assert.rejects(verifyPinnedModel(root, { "config.json": digest }), (e) => e.code === "ALIGNMENT_MODEL_UNAVAILABLE", injected);
    await rm(root, { recursive: true, force: true });
  }
  const directoryRoot = await mkdtemp(join(tmpdir(), "cevra-model-directory-"));
  await mkdir(join(directoryRoot, "unexpected-directory"));
  await assert.rejects(verifyPinnedModel(directoryRoot, {}), (e) => e.code === "ALIGNMENT_MODEL_UNAVAILABLE");
  await rm(directoryRoot, { recursive: true, force: true });

  const symlinkRoot = await mkdtemp(join(tmpdir(), "cevra-model-symlink-"));
  await writeFile(join(symlinkRoot, "target"), "model");
  await symlink(join(symlinkRoot, "target"), join(symlinkRoot, "config.json"));
  const digest = createHash("sha256").update("model").digest("hex");
  await assert.rejects(verifyPinnedModel(symlinkRoot, { "config.json": digest, target: digest }), (e) => e.code === "ALIGNMENT_MODEL_UNAVAILABLE");
  await rm(symlinkRoot, { recursive: true, force: true });
});

test("temporary PCM workspace cleans complete job directory idempotently", async () => {
  const root = await mkdtemp(join(tmpdir(), "cevra-audio-")); const workspace = new NodeAlignmentAudioWorkspace(root); const lease = await workspace.acquire("ignored/path"); await mkdir(dirname(lease.outputUri), { recursive: true }); await writeFile(lease.outputUri, "pcm"); assert.equal((await readFile(lease.outputUri, "utf8")), "pcm"); await lease.release(); await lease.release(); await assert.rejects(stat(lease.outputUri));
});

test("temporary PCM release remains retryable after a deletion failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "cevra-audio-retry-"));
  let attempts = 0;
  const workspace = new NodeAlignmentAudioWorkspace(root, async (path, options) => {
    attempts += 1;
    if (attempts === 1) throw new Error("injected deletion failure");
    await rm(path, options);
  });
  const lease = await workspace.acquire("job");
  await writeFile(lease.outputUri, "sensitive-pcm");
  await assert.rejects(lease.release(), /injected deletion failure/);
  assert.equal((await readFile(lease.outputUri, "utf8")), "sensitive-pcm");
  await lease.release();
  assert.equal(attempts, 2);
  await assert.rejects(stat(lease.outputUri));
});

test("process runner performs JSON protocol health round-trip without network", async () => {
  const run = processRunner();
  assert.deepEqual(await run.healthcheck(), { protocolVersion: 1, status: "ready", alignmentVersion: "0.1.0" });
});

test("process runner preserves UTF-8 and rejects malformed and oversized output", async () => {
  assert.deepEqual(await processRunner().align(workerRequest("utf8"), { jobId: "utf8", locale: "pt-BR" }), { text: "Ação, saúde e coração 😀" });
  await assert.rejects(processRunner().align(workerRequest("invalid-json"), { jobId: "invalid-json", locale: "pt-BR" }), (e) => e.code === "ALIGNMENT_MALFORMED_RESULT");
  await assert.rejects(processRunner().align(workerRequest("output-limit"), { jobId: "output-limit", locale: "pt-BR" }), (e) => e.code === "ALIGNMENT_FAILED" && e.message.includes("output limit"));
});

test("process runner rejects an oversized request before worker launch", async () => {
  const request = workerRequest("oversized-input"); request.transcript.words[0].text = "x".repeat(33 * 1024 * 1024);
  const run = processRunner(); await assert.rejects(run.align(request, { jobId: "oversized-input", locale: "en-US" }), (e) => e.code === "ALIGNMENT_INVALID_REQUEST" && e.message.includes("limit")); assert.equal(run.workerPid, undefined);
});

test("process cancellation terminates and reaps the alignment worker", async () => {
  const run = processRunner(); const controller = new AbortController(); const job = run.align(workerRequest("sleep"), { jobId: "sleep", locale: "pt-BR", signal: controller.signal });
  const deadline = Date.now() + 2000; while (!run.workerPid && Date.now() < deadline) await new Promise((resolveWait) => setTimeout(resolveWait, 5)); const pid = run.workerPid; assert.equal(typeof pid, "number");
  controller.abort(); await assert.rejects(job, (e) => e.code === "ALIGNMENT_CANCELLED"); assert.equal(run.workerPid, undefined); assert.throws(() => process.kill(pid, 0));
});

test("real production worker health exits normally with protocol-only stdout", async (context) => {
  const fixture = controlledPython(); context.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const run = new ProcessAlignmentWorkerRunner({ runtime: { mode: "development", pythonExecutable: fixture.pythonExecutable, environmentRoot: fixture.environmentRoot, workerScript: productionWorker } });
  assert.deepEqual(await run.healthcheck(), { protocolVersion: 1, status: "ready", alignmentVersion: "0.1.0" }); assert.equal(run.workerPid, undefined);
  context.diagnostic("production alignment worker health: exit 0 inferred from parsed response after close; no stderr protocol contamination");
});

test("abrupt Node parent death closes stdin and contains the real alignment worker", { skip: process.platform === "win32" }, async (context) => {
  const fixture = controlledPython(true); context.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const parentScript = join(fixture.root, "parent.mjs");
  fs.writeFileSync(parentScript, `import { ProcessAlignmentWorkerRunner } from ${JSON.stringify(new URL("../dist/index.js", import.meta.url).href)};\nconst r=new ProcessAlignmentWorkerRunner({runtime:{mode:"development",pythonExecutable:${JSON.stringify(fixture.pythonExecutable)},environmentRoot:${JSON.stringify(fixture.environmentRoot)},workerScript:${JSON.stringify(productionWorker)}}});\nr.align(${JSON.stringify(workerRequest("parent-containment"))},{jobId:"parent-containment",locale:"pt-BR"}).catch(()=>{});\nconst t=setInterval(()=>{if(r.workerPid){console.log(r.workerPid);clearInterval(t)}},5);\nsetInterval(()=>{},1000);\n`, "utf8");
  const parent = spawn(process.execPath, [parentScript], { stdio: ["ignore", "pipe", "pipe"] }); context.after(() => { if (parent.exitCode === null && parent.signalCode === null) parent.kill("SIGKILL"); });
  let line = ""; for await (const chunk of parent.stdout) { line += chunk.toString(); if (line.includes("\n")) break; }
  const workerPid = Number(line.trim()); assert.equal(Number.isSafeInteger(workerPid), true); parent.kill("SIGKILL"); await once(parent, "close");
  const deadline = Date.now() + 3000; let alive = true; while (alive && Date.now() < deadline) { try { process.kill(workerPid, 0); await new Promise((resolveWait) => setTimeout(resolveWait, 20)); } catch { alive = false; } }
  assert.equal(alive, false, `alignment worker ${workerPid} survived parent SIGKILL`); context.diagnostic(`Node SIGKILL contained alignment worker PID ${workerPid}`);
});

test("model download enablement is rejected at construction", () => {
  assert.throws(() => new CtcForcedAlignmentAdapter({ runtime: { mode: "development", pythonExecutable: python }, profile: { modelRoot: "/models", allowModelDownload: true } }), (e) => e.code === "ALIGNMENT_INVALID_REQUEST");
});

test("tracked model inventory exactly matches the runtime pins", async () => {
  const inventory = JSON.parse(await readFile(resolve(here, "../runtime/models.json"), "utf8"));
  assert.equal(inventory.downloadsAllowedByDefault, false);
  for (const model of inventory.models) {
    const pin = ALIGNMENT_MODELS[model.language]; assert.equal(model.modelId, pin.modelId); assert.equal(model.revision, pin.revision); assert.equal(`sha256:${model.weight.sha256}`, pin.modelDigest); assert.equal(model.license, "Apache-2.0");
  }
});

test("production worker has no network listener or implicit download path", async () => {
  const source = await readFile(productionWorker, "utf8");
  assert.doesNotMatch(source, /http\.server|socket\.listen|websocket|requests\.|urlopen/u);
  assert.match(source, /local_files_only=True/u);
  assert.match(source, /allowModelDownload.*False/u);
  assert.match(source, /os\.read\(0, 1\)/u);
  assert.match(source, /trust_remote_code=False/u);
  assert.match(source, /use_safetensors=\(language == "en"\)/u);
  assert.doesNotMatch(source, /readframes\(source\.getnframes\(\)\)/u);
});

test("PT and EN pins select only their verified principal weight formats", () => {
  assert.equal(Object.hasOwn(ALIGNMENT_MODELS.pt.files, "pytorch_model.bin"), true);
  assert.equal(Object.hasOwn(ALIGNMENT_MODELS.pt.files, "model.safetensors"), false);
  assert.equal(Object.hasOwn(ALIGNMENT_MODELS.en.files, "model.safetensors"), true);
  assert.equal(Object.hasOwn(ALIGNMENT_MODELS.en.files, "pytorch_model.bin"), false);
  assert.equal(Object.hasOwn(ALIGNMENT_MODELS.en.files, "feature_extractor_config.json"), true);
  assert.equal(ALIGNMENT_MODELS.en.files["feature_extractor_config.json"], "d3de0c797bf9b65f90bc65c30cb7b303ebeda341f6fc80af33628c4b26b95632");
});

test("managed alignment model root stays isolated from Python, engine, and Media Runtime roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "cevra-alignment-isolation-"));
  const runtime = { mode: "managed", pythonExecutable: join(root, "alignment", "bin", "python"), privatePythonRoot: join(root, "python"), environmentRoot: join(root, "alignment"), protectedRoots: [join(root, "media"), join(root, "transcription")] };
  for (const directory of [runtime.privatePythonRoot, runtime.environmentRoot, ...runtime.protectedRoots, join(root, "models")]) await mkdir(directory, { recursive: true });
  assert.doesNotThrow(() => assertModelRootIsolated(join(root, "models"), runtime));
  for (const rejected of [runtime.privatePythonRoot, join(runtime.environmentRoot, "models"), runtime.protectedRoots[0], root]) assert.throws(() => assertModelRootIsolated(rejected, runtime), (e) => e.code === "ALIGNMENT_RUNTIME_UNAVAILABLE");
});
