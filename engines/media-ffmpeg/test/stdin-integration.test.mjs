import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { ProcessMediaWorkerTransport, WorkerProcessExitedError } from "../dist/index.js";

for (const mode of ["event", "callback"]) {
  test(`isolated ${mode} regression (no global uncaught handler)`, () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("fixtures/stdin-failure-probe.mjs", import.meta.url)),
      new URL("../dist/process-transport.js", import.meta.url).href, mode], { encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PASS/);
  });
}

test("real worker closes stdin but remains alive: typed failure, close collected and no live child", async () => {
  const transport = new ProcessMediaWorkerTransport({ mode: "development", pythonExecutable: process.env.CEVRA_TEST_PYTHON || "python3",
    workerScript: fileURLToPath(new URL("fixtures/closed_stdin_worker.py", import.meta.url)), controlTimeoutMs: 1000, shutdownTimeoutMs: 2000 });
  let child;
  try {
    await transport.start();
    child = transport.child;
    const closed = once(child, "close");
    assert.equal(child.exitCode, null); assert.equal(child.signalCode, null);
    await assert.rejects(transport.request("ping"), error => error instanceof WorkerProcessExitedError && error.cause?.code === "EPIPE");
    await transport.stop(); await closed;
    assert.notEqual(child.signalCode, null);
    assert.equal(transport.workerPid, undefined);
    assert.throws(() => process.kill(child.pid, 0), error => error.code === "ESRCH");
  } finally { await transport.stop(); }
});
