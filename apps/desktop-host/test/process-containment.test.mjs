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
  const workerPid = Number(await firstLine(parent.stdout));
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
  const [workerPid, subprocessPid] = (await firstLine(parent.stdout)).split(" ").map(Number);
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

async function firstLine(stream) {
  let buffered = "";
  for await (const chunk of stream) {
    buffered += chunk.toString("utf8");
    const newline = buffered.indexOf("\n");
    if (newline >= 0) return buffered.slice(0, newline);
  }
  throw new Error("Parent fixture exited before publishing its child PID.");
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
