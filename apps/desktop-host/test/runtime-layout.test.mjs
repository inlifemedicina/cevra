import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveMediaRuntimePaths } from "../dist/index.js";

function runtimeFixture(pythonExecutable) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cevra-runtime-layout-"));
  const workerScript = "worker/cevra_media_worker.py";
  for (const relative of [pythonExecutable, workerScript]) {
    const target = path.join(root, ...relative.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "fixture");
  }
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify({
    format: "cevra-media-runtime",
    formatVersion: 1,
    python: { root: "python", executable: pythonExecutable },
    worker: { root: "worker", entrypoint: workerScript }
  }));
  return root;
}

for (const [name, executable] of [
  ["macOS/Linux", "python/bin/python3.12"],
  ["Windows", "python/python.exe"]
]) {
  test(`media runtime resolves the ${name} private Python layout from its manifest`, () => {
    const root = runtimeFixture(executable);
    const resolved = resolveMediaRuntimePaths(root);
    assert.equal(resolved.pythonExecutable, fs.realpathSync(path.join(root, ...executable.split("/"))));
    assert.equal(resolved.workerScript, fs.realpathSync(path.join(root, "worker", "cevra_media_worker.py")));
  });
}

test("media runtime rejects executable paths outside the pinned component root", () => {
  const root = runtimeFixture("python/python.exe");
  const manifestPath = path.join(root, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.python.executable = "python/../worker/cevra_media_worker.py";
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.throws(() => resolveMediaRuntimePaths(root), /Invalid Media Runtime component path/);
});
