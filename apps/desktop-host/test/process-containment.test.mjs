import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const hostRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(hostRoot, "..", "..");
const parentFixture = resolve(hostRoot, "test", "fixtures", "transcription-parent.mjs");
const workerFixture = resolve(hostRoot, "test", "fixtures", "long-transcription-worker.py");
const worker = resolve(repositoryRoot, "engines", "transcription", "python", "cevra_transcription_worker.py");
const mediaParentFixture = resolve(hostRoot, "test", "fixtures", "media-parent.mjs");

test("abrupt Node parent death closes the pipe and terminates the transcription worker", { skip: process.platform === "win32" }, async (context) => {
  const python = process.env.PYTHON ?? "python3";
  const parent = spawn(process.execPath, [parentFixture, python, workerFixture, worker], { stdio: ["ignore", "pipe", "pipe"] });
  context.after(() => { if (parent.exitCode === null && parent.signalCode === null) parent.kill("SIGKILL"); });
  const workerPid = Number(await firstLine(parent));
  assert.ok(Number.isSafeInteger(workerPid) && workerPid > 1);
  await waitForProcess(workerPid, true, 2_000);
  parent.kill("SIGKILL");
  await once(parent, "close");
  await waitForProcess(workerPid, false, 5_000);
  assert.throws(() => process.kill(workerPid, 0), { code: "ESRCH" });
  context.diagnostic(`SIGKILL parent PID ${parent.pid}; transcription worker PID ${workerPid} returned ESRCH`);
});

test("abrupt Node parent death makes the media lifecycle reap its active subprocess", { skip: process.platform === "win32" }, async (context) => {
  const python = process.env.PYTHON ?? "python3";
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), "cevra-media-containment-"));
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const parent = spawn(process.execPath, [mediaParentFixture, python, repositoryRoot, resolve(temporaryRoot, "subprocess.pid")], { stdio: ["ignore", "pipe", "pipe"] });
  context.after(() => { if (parent.exitCode === null && parent.signalCode === null) parent.kill("SIGKILL"); });
  const [workerPid, subprocessPid] = (await firstLine(parent)).split(" ").map(Number);
  assert.ok(Number.isSafeInteger(workerPid) && workerPid > 1);
  assert.ok(Number.isSafeInteger(subprocessPid) && subprocessPid > 1);
  await waitForProcess(workerPid, true, 2_000);
  await waitForProcess(subprocessPid, true, 2_000);
  parent.kill("SIGKILL");
  await once(parent, "close");
  await waitForProcess(workerPid, false, 5_000);
  await waitForProcess(subprocessPid, false, 5_000);
  context.diagnostic(`SIGKILL parent PID ${parent.pid}; media worker PID ${workerPid} and subprocess PID ${subprocessPid} returned ESRCH`);
});

async function firstLine(parent) {
  return new Promise((resolvePromise, reject) => {
    let buffered = "";
    let stderr = "";
    const settle = (cause, line) => {
      clearTimeout(timer);
      parent.stdout.off("data", onData);
      parent.stderr.off("data", onStderr);
      parent.off("error", onError);
      parent.off("close", onClose);
      if (cause) reject(cause); else resolvePromise(line);
    };
    const onData = (chunk) => {
      buffered += chunk.toString("utf8");
      const newline = buffered.indexOf("\n");
      if (newline >= 0) settle(undefined, buffered.slice(0, newline));
    };
    const onStderr = (chunk) => { stderr = (stderr + chunk.toString("utf8")).slice(-8_192); };
    const onError = (cause) => settle(cause);
    const onClose = (code, signal) => settle(new Error(`Parent fixture exited before publishing its child PID (${code ?? signal}): ${stderr}`));
    const timer = setTimeout(() => settle(new Error(`Parent fixture did not publish its child PID within 15 seconds: ${stderr}`)), 15_000);
    parent.stdout.on("data", onData);
    parent.stderr.on("data", onStderr);
    parent.once("error", onError);
    parent.once("close", onClose);
  });
}

async function waitForProcess(pid, expectedAlive, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const alive = processExists(pid);
    if (alive === expectedAlive) return;
    if (Date.now() >= deadline) throw new Error(`PID ${pid} did not become ${expectedAlive ? "alive" : "absent"} within ${timeoutMs} ms.`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
}

function processExists(pid) {
  try { process.kill(pid, 0); return true; } catch (cause) {
    if (cause?.code === "ESRCH") return false;
    throw cause;
  }
}
