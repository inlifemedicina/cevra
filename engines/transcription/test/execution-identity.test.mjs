import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
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
