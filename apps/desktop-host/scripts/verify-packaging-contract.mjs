import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const hostRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(hostRoot, "..", "..");
const tauriRoot = resolve(repositoryRoot, "apps", "desktop", "src-tauri");
const configuration = JSON.parse(await readFile(resolve(tauriRoot, "tauri.conf.json"), "utf8"));
const expectedResources = {
  "../../desktop-host/dist/desktop-host.cjs": "desktop-host/desktop-host.cjs",
  "../../desktop-host/dist/python/cevra_transcription_worker.py": "python/cevra_transcription_worker.py",
  "../../desktop-host/dist/node-runtime-LICENSE.txt": "licenses/node-runtime-LICENSE.txt",
  "../../desktop-host/dist/node-runtime-manifest.json": "provenance/node-runtime-manifest.json"
};
assert.deepEqual(configuration.bundle.externalBin, ["binaries/cevra-node"]);
assert.deepEqual(configuration.bundle.resources, expectedResources);

for (const source of Object.keys(expectedResources)) {
  assert.equal((await stat(resolve(tauriRoot, source))).isFile(), true, `missing packaged resource: ${source}`);
}
const runtimeManifest = JSON.parse(await readFile(resolve(hostRoot, "dist", "node-runtime-manifest.json"), "utf8"));
const inventory = JSON.parse(await readFile(resolve(hostRoot, "runtime", "versions.json"), "utf8"));
const target = inventory.targets[runtimeManifest.target];
assert.ok(target, "prepared runtime target must exist in the pinned inventory");
assert.equal(runtimeManifest.nodeVersion, inventory.nodeVersion);
assert.equal((await stat(resolve(tauriRoot, "binaries", `cevra-node-${target.rustTarget}`))).isFile(), true);

const staged = await mkdtemp(resolve(tmpdir(), "cevra-packaging-contract-"));
try {
  const bundleDir = resolve(staged, "desktop-host");
  const pythonDir = resolve(staged, "python");
  const environmentRoot = resolve(staged, "transcription-runtime");
  const pythonExecutable = resolve(environmentRoot, "bin", "python3");
  await mkdir(bundleDir, { recursive: true });
  await mkdir(pythonDir, { recursive: true });
  await mkdir(dirname(pythonExecutable), { recursive: true });
  await copyFile(resolve(hostRoot, "dist", "packaging-probe.cjs"), resolve(bundleDir, "packaging-probe.cjs"));
  await copyFile(resolve(hostRoot, "dist", "python", "cevra_transcription_worker.py"), resolve(pythonDir, "cevra_transcription_worker.py"));
  await copyFile(process.execPath, pythonExecutable);
  await chmod(pythonExecutable, 0o755);
  const output = JSON.parse(execFileSync(process.execPath, [resolve(bundleDir, "packaging-probe.cjs"), pythonExecutable, environmentRoot], { encoding: "utf8" }));
  assert.equal(output.workerScript, await realpath(resolve(pythonDir, "cevra_transcription_worker.py")));
} finally {
  await rm(staged, { recursive: true, force: true });
}

process.stdout.write(`Verified ${Object.keys(expectedResources).length} fixed resources, one external binary, and bundled worker resolution.\n`);
