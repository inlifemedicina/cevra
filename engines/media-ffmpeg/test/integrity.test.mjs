import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const engine = path.resolve(here, "..");
const fixture = path.join(here, "fixtures", "runtime_integrity_case.py");
const worker = path.join(engine, "worker", "cevra_media_worker.py");
const python = process.env.CEVRA_TEST_PYTHON || "python3";

for (const scenario of ["ok", "hash", "symlink", "wrong-python", "python-version", "wrong-ffmpeg", "wrong-ffprobe", "vendor", "vendor-provenance", "ffmpeg-provenance", "ffmpeg-signer", "png-capability", "incomplete", "extra-bin", "missing-notice", "source-archive", "environment"]) {
  test(`release integrity: ${scenario}`, () => {
    const result = spawnSync(python, ["-I", "-B", fixture, engine, scenario], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}

test("release worker fails closed before RPC when its manifest is absent", () => {
  const result = spawnSync(python, ["-I", "-B", worker, "--info"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CEVRA_RELEASE_MODE: "1",
      CEVRA_MEDIA_RUNTIME_ROOT: path.dirname(engine),
      CEVRA_MEDIA_BIN_DIR: process.env.PATH,
      PYTHONPATH: path.join(engine, "worker")
    }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /manifest|runtime component/i);
});
