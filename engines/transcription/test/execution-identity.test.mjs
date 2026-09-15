import assert from "node:assert/strict";
import { mkdtemp, mkdir, rename, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FasterWhisperModelIdentityResolver,
  TRANSCRIPTION_RUNTIME_PIPELINE_VERSION
} from "../dist/index.js";

const revision = "d90ca5fe260221311c53c58e660288d3deb8d356";

test("Hugging Face snapshot identity resolves exact revision and strong artifact manifest", async () => withTemp(async (root) => {
  const repository = join(root, "hub", "models--Systran--faster-whisper-base");
  const snapshot = join(repository, "snapshots", revision);
  const blobs = join(repository, "blobs");
  await mkdir(snapshot, { recursive: true }); await mkdir(blobs); await mkdir(join(repository, "refs"));
  await writeFile(join(repository, "refs", "main"), revision);
  await writeFile(join(blobs, "config"), "config-v1"); await writeFile(join(blobs, "model"), "model-v1");
  await symlink("../../blobs/config", join(snapshot, "config.json"));
  await symlink("../../blobs/model", join(snapshot, "model.bin"));
  const resolver = new FasterWhisperModelIdentityResolver({ modelCacheDir: root, device: "cpu", computeType: "int8" }, "base");
  const first = await resolver.describe();
  assert.equal(first.modelRevision, revision);
  assert.equal(first.modelId, "Systran/faster-whisper-base");
  assert.equal(first.resultModelId, "base");
  assert.match(first.modelArtifactDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(first.runtimePipelineVersion, TRANSCRIPTION_RUNTIME_PIPELINE_VERSION);
  await writeFile(join(blobs, "model"), "model-v2");
  assert.notEqual((await resolver.describe()).modelArtifactDigest, first.modelArtifactDigest);
}));

test("direct model directories require an explicit trusted revision", async () => withTemp(async (root) => {
  await writeFile(join(root, "config.json"), "{}"); await writeFile(join(root, "model.bin"), "model");
  assert.equal(await new FasterWhisperModelIdentityResolver({ modelCacheDir: root }, "base").describe(), undefined);
  const exact = await new FasterWhisperModelIdentityResolver({ modelCacheDir: root, trustedModelRevision: revision }, "base").describe();
  assert.equal(exact.modelRevision, revision);
}));

test("model fingerprint memo invalidates same-size restored-mtime writes and reuses unchanged state", async () => withTemp(async (root) => {
  const model = join(root, "model.bin");
  await writeFile(join(root, "config.json"), "{}");
  await writeFile(model, "model-v1");
  const beforeMetadata = await stat(model);
  const hashed = [];
  const resolver = new FasterWhisperModelIdentityResolver(
    { modelCacheDir: root, trustedModelRevision: revision, device: "cpu", computeType: "int8" },
    "base",
    { onArtifactHashed: (path) => hashed.push(path) }
  );
  const first = await resolver.describe();
  const firstHashCount = hashed.length;
  assert.ok(firstHashCount > 0);
  assert.equal((await resolver.describe()).modelArtifactDigest, first.modelArtifactDigest);
  assert.equal(hashed.length, firstHashCount, "unchanged artifacts must reuse the strong memo");
  await writeFile(model, "model-v2");
  await utimes(model, beforeMetadata.atime, beforeMetadata.mtime);
  const changed = await resolver.describe();
  assert.notEqual(changed.modelArtifactDigest, first.modelArtifactDigest);
  assert.equal(hashed.length, firstHashCount * 2, "changed metadata must trigger a complete strong rehash");
}));

test("model fingerprint memo invalidates atomic same-size replacement with restored mtime", async () => withTemp(async (root) => {
  const model = join(root, "model.bin");
  const replacement = join(root, "replacement.bin");
  await writeFile(join(root, "config.json"), "{}");
  await writeFile(model, "model-v1");
  const beforeMetadata = await stat(model);
  const resolver = new FasterWhisperModelIdentityResolver({ modelCacheDir: root, trustedModelRevision: revision, device: "cpu", computeType: "int8" }, "base");
  const first = await resolver.describe();
  await writeFile(replacement, "model-v2");
  await utimes(replacement, beforeMetadata.atime, beforeMetadata.mtime);
  await rename(replacement, model);
  const changed = await resolver.describe();
  assert.notEqual(changed.modelArtifactDigest, first.modelArtifactDigest);
}));

test("only fixed device and compute profiles produce an exact cache identity", async () => withTemp(async (root) => {
  await writeFile(join(root, "config.json"), "{}");
  await writeFile(join(root, "model.bin"), "model");
  const profile = { modelCacheDir: root, trustedModelRevision: revision };
  const cpu = await new FasterWhisperModelIdentityResolver({ ...profile, device: "cpu", computeType: "int8" }, "base").describe();
  const cuda = await new FasterWhisperModelIdentityResolver({ ...profile, device: "cuda", computeType: "float16" }, "base").describe();
  assert.equal(cpu.effectiveDevice, "cpu");
  assert.equal(cpu.computeType, "int8");
  assert.equal(cuda.effectiveDevice, "cuda");
  assert.equal(cuda.computeType, "float16");
  assert.equal(await new FasterWhisperModelIdentityResolver({ ...profile, device: "auto", computeType: "int8" }, "base").describe(), undefined);
  assert.equal(await new FasterWhisperModelIdentityResolver({ ...profile, device: "cpu", computeType: "default" }, "base").describe(), undefined);
}));

test("snapshot symlink escaping the trusted model repository makes identity unavailable", async () => withTemp(async (root) => {
  const repository = join(root, "models--Systran--faster-whisper-base");
  const snapshot = join(repository, "snapshots", revision); const outside = join(root, "outside");
  await mkdir(snapshot, { recursive: true }); await mkdir(join(repository, "refs")); await writeFile(join(repository, "refs", "main"), revision);
  await writeFile(outside, "outside"); await symlink(outside, join(snapshot, "model.bin"));
  assert.equal(await new FasterWhisperModelIdentityResolver({ modelCacheDir: root }, "base").describe(), undefined);
}));

test("runtime pipeline fingerprint remains tied to audited output-affecting pins", async () => {
  const audit = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../runtime/dependency-audit.json", import.meta.url), "utf8")));
  for (const [name, version] of [["faster-whisper", "1.2.1"], ["CTranslate2", "4.8.2"], ["PyAV", "18.1.0"]]) {
    assert.equal(audit.packages.find((entry) => entry.name === name).version, version);
    assert.match(TRANSCRIPTION_RUNTIME_PIPELINE_VERSION, new RegExp(version.replaceAll(".", "\\.")));
  }
});

async function withTemp(run) { const root = await mkdtemp(join(tmpdir(), "cevra-model-id-")); try { return await run(root); } finally { await rm(root, { recursive: true, force: true }); } }
