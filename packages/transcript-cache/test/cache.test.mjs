import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  FileTranscriptCache,
  NodeSourceContentIdentityProvider,
  cacheKeyDigest,
  canonicalJson,
  sha256Digest
} from "../dist/index.js";

const source = { algorithm: "sha256", digest: `sha256:${"a".repeat(64)}`, byteLength: 12 };
const execution = {
  engineId: "engine", engineVersion: "1", engineApiVersion: 1, workerProtocolVersion: 1,
  modelId: "model", resultModelId: "model", modelRevision: "revision", modelArtifactDigest: `sha256:${"b".repeat(64)}`,
  languageDetectionPolicyVersion: "auto-v1", devicePolicy: "cpu", effectiveDevice: "cpu",
  computeType: "int8", task: "transcribe", resultNormalizationVersion: "result-v1", runtimePipelineVersion: "pipeline-v1"
};
const key = { schemaVersion: 1, kind: "transcription", source, execution, requestedLanguage: "pt", wordTimestamps: true };
const payload = { transcript: { language: "pt", words: [], segments: [] }, modelId: "model", wordTiming: "none" };
const producer = { producerExecutionId: "producer-1", producedAt: "2026-09-15T12:00:00.000Z", payload };
const alignmentKey = {
  schemaVersion: 1, kind: "alignment", source,
  inputTranscriptDigest: `sha256-v1:${"c".repeat(64)}`, language: "pt",
  execution: {
    engineId: "align", engineVersion: "1", engineApiVersion: 1, workerProtocolVersion: 1,
    modelId: "align-model", modelRevision: "align-revision", modelDigest: `sha256:${"d".repeat(64)}`,
    device: "cpu", pipelineVersion: "window-v1", requiredSampleRate: 16000, maximumWindowMs: 30000,
    maximumTokensPerWindow: 1024, wildcardAlgorithmVersion: "wildcard-v1", resultValidationVersion: "result-v1"
  },
  mediaPreparation: { engineId: "media", engineVersion: "1", engineApiVersion: 1, operation: "extract-audio", audioCodec: "pcm", profileVersion: "alignment-pcm-v1" }
};

test("canonical JSON and SHA-256 are deterministic and closed", () => {
  assert.equal(canonicalJson({ z: 1, a: [true, "ação"] }), '{"a":[true,"ação"],"z":1}');
  assert.equal(sha256Digest("abc"), "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.throws(() => canonicalJson({ bad: Number.NaN }));
  assert.throws(() => canonicalJson({ bad: undefined }));
  assert.throws(() => canonicalJson({ bad: -0 }));
});

test("every material transcription and alignment identity field changes its key digest", () => {
  const transcriptionChanges = [
    { source: { ...source, digest: `sha256:${"e".repeat(64)}` } }, { source: { ...source, byteLength: 13 } },
    ...["engineId", "engineVersion", "modelId", "resultModelId", "modelRevision", "modelArtifactDigest", "languageDetectionPolicyVersion", "devicePolicy", "effectiveDevice", "computeType", "resultNormalizationVersion", "runtimePipelineVersion"].map((field) => ({ execution: { ...execution, [field]: field === "modelArtifactDigest" ? `sha256:${"f".repeat(64)}` : `${execution[field]}-changed` } })),
    { execution: { ...execution, engineApiVersion: 2 } }, { execution: { ...execution, workerProtocolVersion: 2 } },
    { requestedLanguage: "en" }, { wordTimestamps: false }, { schemaVersion: 2 }
  ];
  for (const change of transcriptionChanges) {
    const changed = { ...key, ...change, source: change.source ?? key.source, execution: change.execution ?? key.execution };
    if (change.schemaVersion === 2) assert.throws(() => cacheKeyDigest(changed));
    else assert.notEqual(cacheKeyDigest(changed), cacheKeyDigest(key));
  }
  const alignmentChanges = [
    { inputTranscriptDigest: `sha256-v1:${"e".repeat(64)}` }, { language: "en" },
    { source: { ...source, digest: `sha256:${"f".repeat(64)}` } },
    { execution: { ...alignmentKey.execution, engineVersion: "2" } },
    { execution: { ...alignmentKey.execution, modelRevision: "new" } },
    { execution: { ...alignmentKey.execution, modelDigest: `sha256:${"e".repeat(64)}` } },
    { mediaPreparation: { ...alignmentKey.mediaPreparation, engineVersion: "2" } },
    { mediaPreparation: { ...alignmentKey.mediaPreparation, profileVersion: "alignment-pcm-v2" } },
    { execution: { ...alignmentKey.execution, pipelineVersion: "window-v2" } }
  ];
  for (const change of alignmentChanges) {
    const changed = { ...alignmentKey, ...change };
    if (change.mediaPreparation?.profileVersion === "alignment-pcm-v2") assert.throws(() => cacheKeyDigest(changed));
    else assert.notEqual(cacheKeyDigest(changed), cacheKeyDigest(alignmentKey));
  }
});

test("source identity hashes actual bytes with bounded streaming and ignores path/mtime", async () => withTemp(async (root) => {
  const one = join(root, "one.bin");
  const two = join(root, "renamed.bin");
  const bytes = Buffer.alloc(8 * 1024 * 1024, 0x5a);
  await writeFile(one, bytes); await writeFile(two, bytes);
  let maximumChunk = 0;
  const provider = new NodeSourceContentIdentityProvider({ onChunk: (size) => { maximumChunk = Math.max(maximumChunk, size); } });
  const first = await provider.identify(one);
  const copied = await provider.identify(two);
  assert.deepEqual(first, copied);
  assert.equal(first.digest, `sha256:${createHash("sha256").update(bytes).digest("hex")}`);
  assert.equal(first.byteLength, bytes.length);
  assert.ok(maximumChunk <= 1024 * 1024, "hashing must remain chunk-bounded");
  await utimes(two, new Date(), new Date(Date.now() + 5000));
  assert.deepEqual(await provider.identify(two), first);
  await writeFile(two, Buffer.from("different"));
  assert.notDeepEqual(await provider.identify(two), first);
  const sameNameA = join(root, "a", "same.mov"); const sameNameB = join(root, "b", "same.mov");
  await mkdir(dirname(sameNameA)); await mkdir(dirname(sameNameB));
  await writeFile(sameNameA, "alpha"); await writeFile(sameNameB, "beta");
  assert.notDeepEqual(await provider.identify(sameNameA), await provider.identify(sameNameB));
  const known = join(root, "known.bin"); await writeFile(known, "abc");
  assert.deepEqual(await provider.identify(known), {
    algorithm: "sha256",
    digest: "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    byteLength: 3
  });
}));

test("source identity bypasses symlinks and remote paths and supports cancellation", async () => withTemp(async (root) => {
  const file = join(root, "media.bin"); const link = join(root, "link.bin");
  await writeFile(file, "media"); await symlink(file, link);
  const provider = new NodeSourceContentIdentityProvider();
  assert.equal(await provider.identify(link), undefined);
  assert.equal(await provider.identify("https://example.test/media"), undefined);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => provider.identify(file, controller.signal), { name: "AbortError" });
}));

test("source deletion during streaming hash safely bypasses identity", async () => withTemp(async (root) => {
  const file = join(root, "volatile.bin"); await writeFile(file, Buffer.alloc(3 * 1024 * 1024, 1));
  let removed = false;
  const provider = new NodeSourceContentIdentityProvider({ onChunk: async () => { if (!removed) { removed = true; await rm(file); } } });
  assert.equal(await provider.identify(file), undefined);
}));

test("source hashing cancellation during streaming aborts bounded work", async () => withTemp(async (root) => {
  const file = join(root, "cancel.bin"); await writeFile(file, Buffer.alloc(3 * 1024 * 1024, 1));
  const controller = new AbortController();
  const provider = new NodeSourceContentIdentityProvider({ onChunk: () => controller.abort("stop") });
  await assert.rejects(() => provider.identify(file, controller.signal), { name: "AbortError" });
}));

test("cache round trip uses opaque content addressing and contains no source path", async () => withTemp(async (root) => {
  const cache = new FileTranscriptCache(root);
  assert.equal(await cache.write(key, producer), true);
  assert.deepEqual(await cache.read(key), producer);
  const path = entryPath(root, key);
  const raw = await readFile(path, "utf8");
  assert.equal(raw.includes("/media/"), false);
  assert.equal((await stat(path)).mode & 0o077, 0);
  assert.equal((await stat(root)).mode & 0o077, 0);
}));

test("corrupt, bad-integrity and wrong-key entries degrade to MISS", async () => withTemp(async (root) => {
  const cache = new FileTranscriptCache(root);
  await cache.write(key, producer);
  const path = entryPath(root, key);
  await writeFile(path, "{");
  assert.equal(await cache.read(key), undefined);
  await cache.write(key, producer);
  const envelope = JSON.parse(await readFile(path, "utf8"));
  envelope.payload.modelId = "poisoned";
  await writeFile(path, JSON.stringify(envelope));
  assert.equal(await cache.read(key), undefined);
  await cache.write(key, producer);
  const wrong = JSON.parse(await readFile(path, "utf8"));
  wrong.key.requestedLanguage = "en";
  wrong.payloadDigest = sha256Digest(canonicalJson(wrong.payload));
  await writeFile(path, JSON.stringify(wrong));
  assert.equal(await cache.read(key), undefined);
}));

test("oversized entries skip caching and oversized reads are bounded", async () => withTemp(async (root) => {
  const cache = new FileTranscriptCache(root, { maxEntryBytes: 512, maxTotalBytes: 2048 });
  assert.equal(await cache.write(key, { ...producer, payload: { text: "x".repeat(1000) } }), false);
  const path = entryPath(root, key); await mkdir(dirname(path), { recursive: true }); await writeFile(path, "x".repeat(513));
  assert.equal(await cache.read(key), undefined);
}));

test("symlink roots and entries are never followed", async () => withTemp(async (root) => {
  const real = join(root, "real"); const linked = join(root, "linked"); await mkdir(real); await symlink(real, linked);
  assert.equal(await new FileTranscriptCache(linked).write(key, producer), false);
  const cacheRoot = join(root, "cache"); const cache = new FileTranscriptCache(cacheRoot); await cache.write(key, producer);
  const outside = join(root, "outside"); await writeFile(outside, "private");
  const path = entryPath(cacheRoot, key); await rm(path); await symlink(outside, path);
  assert.equal(await cache.read(key), undefined);
  assert.equal(await readFile(outside, "utf8"), "private");
}));

test("budget enumeration never follows kind-directory symlinks in either direction", async () => withTemp(async (root) => {
  for (const [escapedKind, writtenKey] of [["transcription", alignmentKey], ["alignment", key]]) {
    const cacheRoot = join(root, `cache-${escapedKind}`);
    const external = join(root, `external-${escapedKind}`);
    const prefix = join(external, "aa");
    const foreign = join(prefix, `${"a".repeat(64)}.json`);
    await mkdir(prefix, { recursive: true });
    await writeFile(foreign, "external-private-data");
    await mkdir(cacheRoot, { recursive: true });
    await symlink(external, join(cacheRoot, escapedKind));
    const cache = new FileTranscriptCache(cacheRoot, { maxEntryBytes: 4096, maxTotalBytes: 4096 });
    assert.equal(await cache.write(writtenKey, producer), true);
    assert.equal(await readFile(foreign, "utf8"), "external-private-data");
  }
}));

test("budget enumeration never follows a prefix symlink or deletes foreign content", async () => withTemp(async (root) => {
  const cacheRoot = join(root, "cache");
  const external = join(root, "external");
  const foreign = join(external, `${"b".repeat(64)}.json`);
  await mkdir(join(cacheRoot, "transcription"), { recursive: true });
  await mkdir(external, { recursive: true });
  await writeFile(foreign, "external-private-data");
  await symlink(external, join(cacheRoot, "transcription", "aa"));
  const cache = new FileTranscriptCache(cacheRoot, { maxEntryBytes: 4096, maxTotalBytes: 4096 });
  assert.equal(await cache.write(alignmentKey, producer), true);
  assert.equal(await readFile(foreign, "utf8"), "external-private-data");
}));

test("concurrent same-key writers leave one complete validated entry", async () => withTemp(async (root) => {
  const cache = new FileTranscriptCache(root);
  const values = Array.from({ length: 12 }, (_, index) => ({ ...producer, producerExecutionId: `producer-${index}` }));
  assert.equal((await Promise.all(values.map((value) => cache.write(key, value)))).every(Boolean), true);
  const hit = await cache.read(key);
  assert.ok(values.some((value) => value.producerExecutionId === hit.producerExecutionId));
  assert.deepEqual(hit.payload, payload);
}));

test("small injected budget prunes least-recently-used recognized entry and preserves foreign files", async () => withTemp(async (root) => {
  const cache = new FileTranscriptCache(root, { maxEntryBytes: 4096, maxTotalBytes: 2400 });
  const keyA = key;
  const keyB = { ...key, requestedLanguage: "en" };
  const keyC = { ...key, requestedLanguage: "auto" };
  await cache.write(keyA, producer); await new Promise((resolve) => setTimeout(resolve, 5));
  await cache.write(keyB, producer); await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(await cache.read(keyA));
  const foreign = join(root, "foreign.txt"); await writeFile(foreign, "keep");
  assert.equal(await cache.write(keyC, producer), true);
  assert.ok(await cache.read(keyA));
  assert.equal(await cache.read(keyB), undefined);
  assert.ok(await cache.read(keyC));
  assert.equal(await readFile(foreign, "utf8"), "keep");
}));

test("recognized stale orphan temporaries are cleaned while foreign structures remain untouched", async () => withTemp(async (root) => {
  const now = new Date("2026-09-15T12:00:00.000Z");
  const cache = new FileTranscriptCache(root, { now: () => now }); await cache.write(key, producer);
  const orphan = join(dirname(entryPath(root, key)), `.${"f".repeat(64)}.00000000-0000-4000-8000-000000000000.tmp`);
  await writeFile(orphan, "partial");
  const old = new Date(now.getTime() - 25 * 60 * 60 * 1000);
  await utimes(orphan, old, old);
  await mkdir(join(root, "transcription", "zz"), { recursive: true });
  await writeFile(join(root, "transcription", "zz", `${"c".repeat(64)}.json`), "foreign");
  await cache.write({ ...key, requestedLanguage: "en" }, producer);
  assert.deepEqual(await cache.read(key), producer);
  await assert.rejects(() => stat(orphan), { code: "ENOENT" });
}));

function entryPath(root, cacheKey) {
  const hex = cacheKeyDigest(cacheKey).slice(7);
  return join(root, cacheKey.kind, hex.slice(0, 2), `${hex}.json`);
}
async function withTemp(run) {
  const root = await mkdtemp(join(tmpdir(), "cevra-cache-test-"));
  try { return await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
