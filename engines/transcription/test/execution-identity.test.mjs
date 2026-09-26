import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rename, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FasterWhisperModelIdentityResolver,
  FASTER_WHISPER_DIRECT_REQUIRED_FILES,
  FASTER_WHISPER_DIRECT_VOCABULARY_FILES,
  FASTER_WHISPER_MODEL_REPOSITORIES,
  FASTER_WHISPER_VERSION,
  fasterWhisperRepositoryDirectory,
  resolveLocalFasterWhisperModel,
  TRANSCRIPTION_RUNTIME_PIPELINE_VERSION
} from "../dist/index.js";

const revision = "d90ca5fe260221311c53c58e660288d3deb8d356";

test("CEVRA model aliases map exhaustively to the pinned Faster-Whisper 1.2.1 repositories", () => {
  assert.equal(FASTER_WHISPER_VERSION, "1.2.1");
  assert.deepEqual(FASTER_WHISPER_MODEL_REPOSITORIES, {
    tiny: "Systran/faster-whisper-tiny",
    base: "Systran/faster-whisper-base",
    small: "Systran/faster-whisper-small",
    medium: "Systran/faster-whisper-medium",
    "large-v3": "Systran/faster-whisper-large-v3",
    turbo: "mobiuslabsgmbh/faster-whisper-large-v3-turbo"
  });
  assert.equal(fasterWhisperRepositoryDirectory("turbo"), "models--mobiuslabsgmbh--faster-whisper-large-v3-turbo");
});

test("Hugging Face snapshot identity resolves exact revision and strong artifact manifest", async () => withTemp(async (root) => {
  const { blobs } = await createHfSnapshot(root, "root", "v1");
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
  await createDirectModel(root);
  assert.equal(await new FasterWhisperModelIdentityResolver({ modelCacheDir: root }, "base").describe(), undefined);
  const exact = await new FasterWhisperModelIdentityResolver({ modelCacheDir: root, trustedModelRevision: revision }, "base").describe();
  assert.equal(exact.modelRevision, revision);
}));

test("a sole root Hugging Face layout is provable", async () => withTemp(async (root) => {
  await createHfSnapshot(root, "root", "root-layout");
  const exact = await new FasterWhisperModelIdentityResolver({ modelCacheDir: root, device: "cpu", computeType: "int8" }, "base").describe();
  assert.equal(exact.modelRevision, revision);
  assert.match(exact.modelArtifactDigest, /^sha256:[0-9a-f]{64}$/);
}));

test("direct prepopulated root has worker-aligned precedence over nested Hugging Face layouts", async () => withTemp(async (root) => {
  await createDirectModel(root, "direct");
  const directOnly = await new FasterWhisperModelIdentityResolver({ modelCacheDir: root, trustedModelRevision: revision, device: "cpu", computeType: "int8" }, "base").describe();
  const { blobs } = await createHfSnapshot(root, "root", "unused-hf");
  const mixedResolver = new FasterWhisperModelIdentityResolver({ modelCacheDir: root, trustedModelRevision: revision, device: "cpu", computeType: "int8" }, "base");
  const mixed = await mixedResolver.describe();
  assert.equal(mixed.modelArtifactDigest, directOnly.modelArtifactDigest);
  await writeFile(join(blobs, "model"), "unused-hf-mutated");
  assert.equal((await mixedResolver.describe()).modelArtifactDigest, mixed.modelArtifactDigest, "unused nested layout must not alter direct execution identity");
}));

test("hub-only Hugging Face layout is not executable by the configured worker contract", async () => withTemp(async (root) => {
  await createHfSnapshot(root, "hub", "hub-layout");
  assert.equal(await new FasterWhisperModelIdentityResolver({ modelCacheDir: root, device: "cpu", computeType: "int8" }, "base").describe(), undefined);
}));

test("an unused hub layout cannot perturb a selected root-level Hugging Face identity", async () => withTemp(async (root) => {
  await createHfSnapshot(root, "root", "selected-root");
  const resolver = new FasterWhisperModelIdentityResolver({ modelCacheDir: root, device: "cpu", computeType: "int8" }, "base");
  const selected = await resolver.describe();
  const { blobs } = await createHfSnapshot(root, "hub", "unused-hub");
  assert.equal((await resolver.describe())?.modelArtifactDigest, selected?.modelArtifactDigest);
  await writeFile(join(blobs, "model"), "unused-hub-mutated");
  assert.equal((await resolver.describe())?.modelArtifactDigest, selected?.modelArtifactDigest);
}));

test("turbo identity resolves the pinned mobiuslabsgmbh repository rather than a synthetic Systran repository", async () => withTemp(async (root) => {
  await createHfSnapshot(root, "root", "turbo", "mobiuslabsgmbh/faster-whisper-large-v3-turbo");
  const identity = await new FasterWhisperModelIdentityResolver({ modelCacheDir: root, device: "cpu", computeType: "int8" }, "turbo").describe();
  assert.equal(identity?.modelId, "mobiuslabsgmbh/faster-whisper-large-v3-turbo");
  assert.equal(identity?.resultModelId, "turbo");
}));

test("a synthetic Systran turbo repository is neither selected nor cacheable", async () => withTemp(async (root) => {
  await createHfSnapshot(root, "root", "fake-turbo", "Systran/faster-whisper-turbo");
  assert.equal(await resolveLocalFasterWhisperModel({ modelCacheDir: root }, "turbo"), undefined);
  assert.equal(await new FasterWhisperModelIdentityResolver({ modelCacheDir: root, device: "cpu", computeType: "int8" }, "turbo").describe(), undefined);
}));

test("an orphan single snapshot without refs/main is not a provable executable alias", async () => withTemp(async (root) => {
  await createHfSnapshot(root, "root", "orphan", "Systran/faster-whisper-base", false);
  assert.equal(await new FasterWhisperModelIdentityResolver({ modelCacheDir: root, device: "cpu", computeType: "int8" }, "base").describe(), undefined);
}));

test("a missing or wrong refs/main target cannot prove local model selection", async () => withTemp(async (root) => {
  const { repository } = await createHfSnapshot(root, "root", "wrong-ref");
  await writeFile(join(repository, "refs", "main"), "a".repeat(40));
  assert.equal(await resolveLocalFasterWhisperModel({ modelCacheDir: root }, "base"), undefined);
  assert.equal(await new FasterWhisperModelIdentityResolver({ modelCacheDir: root, device: "cpu", computeType: "int8" }, "base").describe(), undefined);
}));

test("local selection mirrors direct-root precedence before root-level Hugging Face resolution", async () => withTemp(async (root) => {
  await createHfSnapshot(root, "root", "hf");
  const hf = await resolveLocalFasterWhisperModel({ modelCacheDir: root }, "base");
  assert.equal(hf?.kind, "hugging-face");
  assert.equal(hf?.repositoryId, "Systran/faster-whisper-base");
  assert.equal(hf?.revision, revision);

  await createDirectModel(root, "direct");
  const direct = await resolveLocalFasterWhisperModel({ modelCacheDir: root }, "base");
  assert.equal(direct?.kind, "direct");
  assert.equal(direct?.directory, await realpath(root));
  assert.equal(direct?.repositoryId, "Systran/faster-whisper-base");
  assert.equal(await resolveLocalFasterWhisperModel({ modelCacheDir: root, allowModelDownload: true }, "base"), undefined);
}));

test("model fingerprint memo invalidates same-size restored-mtime writes and reuses unchanged state", async () => withTemp(async (root) => {
  const model = join(root, "model.bin");
  await createDirectModel(root);
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
  await createDirectModel(root);
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
  await createDirectModel(root);
  const profile = { modelCacheDir: root, trustedModelRevision: revision };
  const cpu = await new FasterWhisperModelIdentityResolver({ ...profile, device: "cpu", computeType: "int8" }, "base").describe();
  const cuda = await new FasterWhisperModelIdentityResolver({ ...profile, device: "cuda", computeType: "float16" }, "base").describe();
  assert.equal(cpu.effectiveDevice, "cpu");
  assert.equal(cpu.computeType, "int8");
  assert.equal(cuda.effectiveDevice, "cuda");
  assert.equal(cuda.computeType, "float16");
  assert.equal(await new FasterWhisperModelIdentityResolver({ ...profile, device: "auto", computeType: "int8" }, "base").describe(), undefined);
  assert.equal(await new FasterWhisperModelIdentityResolver({ ...profile, device: "cpu", computeType: "default" }, "base").describe(), undefined);
  assert.equal(await new FasterWhisperModelIdentityResolver({ ...profile, allowModelDownload: true, device: "cpu", computeType: "int8" }, "base").describe(), undefined);
}));

test("snapshot symlink escaping the trusted model repository makes identity unavailable", async () => withTemp(async (root) => {
  const repository = join(root, "models--Systran--faster-whisper-base");
  const snapshot = join(repository, "snapshots", revision); const outside = join(root, "outside");
  await mkdir(snapshot, { recursive: true }); await mkdir(join(repository, "refs")); await writeFile(join(repository, "refs", "main"), revision);
  await writeFile(join(snapshot, "config.json"), "{}");
  await writeFile(join(snapshot, "tokenizer.json"), "{}");
  await writeFile(join(snapshot, "vocabulary.txt"), "vocabulary");
  await writeFile(outside, "outside"); await symlink(outside, join(snapshot, "model.bin"));
  assert.equal(await new FasterWhisperModelIdentityResolver({ modelCacheDir: root }, "base").describe(), undefined);
}));

test("Node and Python characterize the same direct prepopulated model requirement", async () => {
  assert.deepEqual(FASTER_WHISPER_DIRECT_REQUIRED_FILES, ["config.json", "model.bin", "tokenizer.json"]);
  assert.deepEqual(FASTER_WHISPER_DIRECT_VOCABULARY_FILES, ["vocabulary.txt", "vocabulary.json"]);
  const worker = await readFile(new URL("../python/cevra_transcription_worker.py", import.meta.url), "utf8");
  for (const name of [...FASTER_WHISPER_DIRECT_REQUIRED_FILES, ...FASTER_WHISPER_DIRECT_VOCABULARY_FILES]) {
    assert.match(worker, new RegExp("[\"']" + name.replace(".", "\\.") + "[\"']"));
  }
});

test("runtime pipeline fingerprint remains tied to audited output-affecting pins", async () => {
  const audit = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../runtime/dependency-audit.json", import.meta.url), "utf8")));
  for (const [name, version] of [["faster-whisper", "1.2.1"], ["CTranslate2", "4.8.2"], ["PyAV", "18.1.0"]]) {
    assert.equal(audit.packages.find((entry) => entry.name === name).version, version);
    assert.match(TRANSCRIPTION_RUNTIME_PIPELINE_VERSION, new RegExp(version.replaceAll(".", "\\.")));
  }
});

async function withTemp(run) { const root = await mkdtemp(join(tmpdir(), "cevra-model-id-")); try { return await run(root); } finally { await rm(root, { recursive: true, force: true }); } }

async function createDirectModel(root, suffix = "fixture") {
  await writeFile(join(root, "config.json"), JSON.stringify({ fixture: suffix }));
  await writeFile(join(root, "model.bin"), "model-" + suffix);
  await writeFile(join(root, "tokenizer.json"), JSON.stringify({ tokenizer: suffix }));
  await writeFile(join(root, "vocabulary.txt"), "vocabulary-" + suffix);
}

async function createHfSnapshot(root, placement, suffix, repositoryId = "Systran/faster-whisper-base", includeRef = true) {
  const repository = join(root, ...(placement === "hub" ? ["hub"] : []), `models--${repositoryId.replaceAll("/", "--")}`);
  const snapshot = join(repository, "snapshots", revision);
  const blobs = join(repository, "blobs");
  await mkdir(snapshot, { recursive: true }); await mkdir(blobs);
  if (includeRef) {
    await mkdir(join(repository, "refs"));
    await writeFile(join(repository, "refs", "main"), revision);
  }
  for (const [logical, blob] of [["config.json", "config"], ["model.bin", "model"], ["tokenizer.json", "tokenizer"], ["vocabulary.txt", "vocabulary"]]) {
    await writeFile(join(blobs, blob), blob + "-" + suffix);
    await symlink("../../blobs/" + blob, join(snapshot, logical));
  }
  return { repository, snapshot, blobs };
}
