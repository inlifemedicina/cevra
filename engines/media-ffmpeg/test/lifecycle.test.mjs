import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PersistentMediaWorkerClient, ProcessMediaWorkerTransport, WorkerProcessExitedError } from "../dist/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const engine = path.resolve(here, "..");
const workerScript = path.join(engine, "worker", "cevra_media_worker.py");
const vendor = path.join(here, "fixtures", "vendor");
const python = process.env.CEVRA_TEST_PYTHON || "python3";

function createRuntime() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cevra-media-lifecycle-"));
  const transport = new ProcessMediaWorkerTransport({
    pythonExecutable: python,
    workerScript,
    shutdownTimeoutMs: 2000,
    env: { ...process.env, CEVRA_MEDIA_RUNTIME_ROOT: engine, CEVRA_FFMPEG_SKILL_ROOT: vendor, CEVRA_RELEASE_MODE: "0", PYTHONNOUSERSITE: "1" }
  });
  return { directory, transport, client: new PersistentMediaWorkerClient(transport) };
}

async function waitForFile(file) {
  const deadline = Date.now() + 3000;
  while (!fs.existsSync(file)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${file}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function processExists(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

test("process transport starts once, executes serial jobs and closes the worker", async () => {
  const runtime = createRuntime();
  const firstOutput = path.join(runtime.directory, "first.txt");
  const secondOutput = path.join(runtime.directory, "second.txt");
  const firstPid = path.join(runtime.directory, "first.pid");
  const secondPid = path.join(runtime.directory, "second.pid");
  const first = runtime.client.callTool("fixture-job", { output: firstOutput, pidFile: firstPid, duration: 0.15 }, "serial-1");
  const second = runtime.client.callTool("fixture-job", { output: secondOutput, pidFile: secondPid, duration: 0.01 }, "serial-2");
  await waitForFile(firstPid);
  assert.equal(fs.existsSync(secondPid), false);
  const workerPid = runtime.transport.workerPid;
  await Promise.all([first, second]);
  assert.equal(fs.readFileSync(firstOutput, "utf8"), "completed");
  assert.equal(fs.readFileSync(secondOutput, "utf8"), "completed");
  assert.equal(runtime.transport.workerPid, workerPid);
  await runtime.client.close();
  assert.equal(processExists(workerPid), false);
});

test("cancellation kills only the active subprocess, cleans its new output and keeps worker healthy", async () => {
  const runtime = createRuntime();
  const output = path.join(runtime.directory, "cancelled.txt");
  const pidFile = path.join(runtime.directory, "cancelled.pid");
  const controller = new AbortController();
  const job = runtime.client.callTool("fixture-job", { output, pidFile, duration: 30 }, "cancel-me", controller.signal);
  await waitForFile(pidFile);
  const childPid = Number(fs.readFileSync(pidFile, "utf8"));
  const workerPid = runtime.transport.workerPid;
  assert.deepEqual(await runtime.transport.request("cevra/cancel", { jobId: "different-job" }), { cancelled: false, jobId: "different-job" });
  assert.equal(processExists(childPid), true);
  controller.abort();
  await assert.rejects(job, (error) => error?.name === "AbortError");
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(processExists(childPid), false);
  assert.equal(fs.existsSync(output), false);
  assert.equal(runtime.transport.workerPid, workerPid);
  assert.deepEqual(await runtime.transport.request("ping"), {});

  const nextOutput = path.join(runtime.directory, "next.txt");
  await runtime.client.callTool("fixture-job", { output: nextOutput, pidFile: path.join(runtime.directory, "next.pid"), duration: 0.01 }, "after-cancel");
  assert.equal(fs.readFileSync(nextOutput, "utf8"), "completed");
  await runtime.client.close();
});

test("cancellation never deletes a pre-existing output", async () => {
  const runtime = createRuntime();
  const output = path.join(runtime.directory, "existing.txt");
  const pidFile = path.join(runtime.directory, "existing.pid");
  fs.writeFileSync(output, "original");
  const controller = new AbortController();
  const job = runtime.client.callTool("fixture-job", { output, pidFile, duration: 30 }, "preserve-existing", controller.signal);
  await waitForFile(pidFile);
  controller.abort();
  await assert.rejects(job, (error) => error?.name === "AbortError");
  assert.equal(fs.existsSync(output), true);
  await runtime.client.close();
});

test("unexpected worker crash rejects the job and the next request starts a fresh worker", async () => {
  const runtime = createRuntime();
  await runtime.transport.start();
  const oldPid = runtime.transport.workerPid;
  await assert.rejects(
    runtime.client.callTool("crash-worker", {}, "crash-job"),
    (error) => error instanceof WorkerProcessExitedError
  );
  const info = await runtime.client.info();
  assert.equal(info.name, "cevra-media-worker");
  assert.notEqual(runtime.transport.workerPid, oldPid);
  assert.equal(processExists(oldPid), false);
  await runtime.client.close();
});

test("close cancels and reaps an active subprocess without leaving the worker alive", async () => {
  const runtime = createRuntime();
  const output = path.join(runtime.directory, "closing.txt");
  const pidFile = path.join(runtime.directory, "closing.pid");
  const job = runtime.client.callTool("fixture-job", { output, pidFile, duration: 30 }, "close-job");
  const rejectedJob = assert.rejects(job);
  await waitForFile(pidFile);
  const childPid = Number(fs.readFileSync(pidFile, "utf8"));
  const workerPid = runtime.transport.workerPid;
  await runtime.client.close();
  await rejectedJob;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(processExists(childPid), false);
  assert.equal(processExists(workerPid), false);
  assert.equal(fs.existsSync(output), false);
});
