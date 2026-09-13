import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const verifier = path.resolve(here, "..", "runtime", "prepare_ffmpeg_source.py");
const python = process.env.CEVRA_TEST_PYTHON || "python3";
const expected = "FCF986EA15E6E293A5644F10B4322F04D67658D8";
const other = "1111111111111111111111111111111111111111";

function matches(status) {
  const script = [
    "import importlib.util, sys",
    "spec = importlib.util.spec_from_file_location('prepare_ffmpeg_source', sys.argv[1])",
    "module = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(module)",
    "print('yes' if module.signature_matches(sys.argv[2], sys.argv[3]) else 'no')"
  ].join("; ");
  const result = spawnSync(python, ["-I", "-B", "-c", script, verifier, status, expected], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim() === "yes";
}

test("FFmpeg signature verifier accepts only the pinned signer or its signing subkey", () => {
  const fields = "2026-09-12 0 0 4 0 1 10 00";
  assert.equal(matches(`[GNUPG:] VALIDSIG ${expected} ${fields}`), true);
  assert.equal(matches(`[GNUPG:] VALIDSIG ${other} ${fields} ${expected}`), true);
  assert.equal(matches(`[GNUPG:] VALIDSIG ${other} ${fields} ${other}`), false);
  assert.equal(matches(`[GNUPG:] GOODSIG ${expected} Example Signer`), false);
});
