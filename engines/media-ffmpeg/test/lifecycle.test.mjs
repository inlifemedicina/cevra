import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PersistentMediaWorkerClient, ProcessMediaWorkerTransport, WorkerProcessExitedError } from "../dist/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const engine = path.resolve(here, "..");
const workerScript = path.join(engine, "worker", "cevra_media_worker.py");
const patchScript = path.join(engine, "runtime", "patch_ffmpeg_skill.py");
const runtimeModule = path.join(engine, "runtime", "_cevra_runtime.py");
const vendor = path.join(here, "fixtures", "vendor");
const requestedPython = process.env.CEVRA_TEST_PYTHON || "python3";
const resolvedPython = spawnSync(requestedPython, ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" });
const python = resolvedPython.status === 0 ? resolvedPython.stdout.trim() : requestedPython;

function createRuntime(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cevra-media-lifecycle-"));
  const transport = new ProcessMediaWorkerTransport({
    pythonExecutable: python,
    workerScript,
    shutdownTimeoutMs: 2000,
    env: {
      ...process.env,
      CEVRA_MEDIA_RUNTIME_ROOT: options.runtimeRoot || engine,
      CEVRA_FFMPEG_SKILL_ROOT: vendor,
      CEVRA_RELEASE_MODE: options.releaseMode ? "1" : "0",
      PYTHONNOUSERSITE: "1",
      ...(options.pathValue ? { PATH: options.pathValue } : {})
    }
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
  const first = runtime.client.callTool("cut", { output: firstOutput, pidFile: firstPid, duration: 0.15 }, "serial-1");
  const second = runtime.client.callTool("cut", { output: secondOutput, pidFile: secondPid, duration: 0.01 }, "serial-2");
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
  const job = runtime.client.callTool("cut", { output, pidFile, duration: 30 }, "cancel-me", controller.signal);
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
  await runtime.client.callTool("cut", { output: nextOutput, pidFile: path.join(runtime.directory, "next.pid"), duration: 0.01 }, "after-cancel");
  assert.equal(fs.readFileSync(nextOutput, "utf8"), "completed");
  await runtime.client.close();
});

test("cancellation never deletes a pre-existing output", async () => {
  const runtime = createRuntime();
  const output = path.join(runtime.directory, "existing.txt");
  const pidFile = path.join(runtime.directory, "existing.pid");
  fs.writeFileSync(output, "original");
  const controller = new AbortController();
  const job = runtime.client.callTool("cut", { output, pidFile, duration: 30 }, "preserve-existing", controller.signal);
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
    runtime.client.callTool("cut", { crash: true }, "crash-job"),
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
  const job = runtime.client.callTool("cut", { output, pidFile, duration: 30 }, "close-job");
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

test("RPC publishes only CEVRA allow-listed tools and rejects raw argv", async () => {
  const runtime = createRuntime();
  const tools = await runtime.client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name), ["cut", "cevra-extract-frame", "cevra-mux-audio", "cevra-overlay-media", "cevra-scale", "cevra-speed", "cevra-transcode"]);
  assert.equal(JSON.stringify(tools).includes('"argv"'), false);
  for (const tool of tools.filter((item) => item.name.startsWith("cevra-"))) {
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
  const transcode = tools.find((tool) => tool.name === "cevra-transcode");
  assert.equal(transcode.inputSchema.properties.video_codec.type, "string");
  assert.equal(transcode.inputSchema.properties.width.type, "integer");
  await assert.rejects(runtime.client.callTool("redact", {}, "blocked-tool"), /not allowed by CEVRA/);
  await assert.rejects(runtime.client.callTool("cut", { argv: ["--help"] }, "blocked-argv"), /raw argv execution is not allowed/);
  await assert.rejects(runtime.client.callTool("cut", { nested: { argv: ["--help"] } }, "blocked-nested-argv"), /raw argv execution is not allowed/);
  await runtime.client.close();
});

test("release worker ignores PATH/bin overrides and fails closed without its bundle manifest", async () => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cevra-release-runtime-"));
  const systemBin = fs.mkdtempSync(path.join(os.tmpdir(), "cevra-system-bin-"));
  const runtimeBin = path.join(runtimeRoot, "bin");
  fs.mkdirSync(runtimeBin);
  const suffix = process.platform === "win32" ? ".exe" : "";
  for (const name of ["ffmpeg", "ffprobe"]) {
    for (const directory of [runtimeBin, systemBin]) {
      const executable = path.join(directory, `${name}${suffix}`);
      if (process.platform === "win32") {
        fs.copyFileSync(python, executable);
      } else {
        fs.writeFileSync(executable, `#!/bin/sh\ncase "$1" in\n  -version) echo "${name} version 9.0.1" ;;\n  -buildconf) echo "configuration: --disable-gpl --disable-nonfree" ;;\n  -c) echo "$0" ;;\nesac\n`);
      }
      fs.chmodSync(executable, 0o755);
    }
  }
  const directEnv = {
    ...process.env,
    PYTHONPATH: path.join(engine, "runtime"),
    CEVRA_RELEASE_MODE: "1",
    CEVRA_MEDIA_BIN_DIR: systemBin,
    PATH: `${systemBin}${path.delimiter}${process.env.PATH || ""}`
  };
  delete directEnv.CEVRA_MEDIA_RUNTIME_ROOT;
  const direct = spawnSync(
    python,
    ["-s", "-B", "-c", "from _cevra_runtime import require_media_tool; print(require_media_tool('ffmpeg') or 'none')"],
    { encoding: "utf8", env: directEnv }
  );
  assert.equal(direct.status, 0);
  assert.equal(direct.stdout.trim(), "none");
  const runtime = createRuntime({ releaseMode: true, runtimeRoot, pathValue: `${systemBin}${path.delimiter}${process.env.PATH || ""}` });
  try {
    await assert.rejects(runtime.client.info(), /manifest|runtime component/i);
  } finally {
    await runtime.client.close();
  }
});

test("ffmpeg-skill patch routes its direct ffprobe version call through the CEVRA resolver", () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "cevra-patch-source-"));
  const scripts = path.join(source, "scripts");
  fs.mkdirSync(scripts);
  fs.writeFileSync(path.join(source, "package.json"), JSON.stringify({ version: "1.4.2" }));
  fs.writeFileSync(path.join(scripts, "_common.py"), `
import subprocess
def x264_args(): pass
def video_args(): pass
def run():
    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=limit)
    subprocess.Popen(full, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
def require_tool(name): pass
def ffmpeg_version():
    return subprocess.run(["ffprobe", "-version"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
`);
  const patched = spawnSync(python, ["-s", "-B", patchScript, source, "--runtime-module", runtimeModule], { encoding: "utf8" });
  assert.equal(patched.status, 0, patched.stderr);
  const common = fs.readFileSync(path.join(scripts, "_common.py"), "utf8");
  assert.match(common, /subprocess\.run\(\[require_tool\("ffprobe"\), "-version"\]/);
  assert.doesNotMatch(common, /subprocess\.run\(\["ffprobe", "-version"\]/);
});

test("GPL development encoder override is disabled in release mode", () => {
  const moduleRoot = path.join(engine, "runtime");
  const script = "from _cevra_runtime import allow_gpl_dev_encoder; print('yes' if allow_gpl_dev_encoder() else 'no')";
  const baseEnv = { ...process.env, PYTHONPATH: moduleRoot, CEVRA_ALLOW_GPL_DEV_ENCODERS: "1" };
  const development = spawnSync(python, ["-s", "-B", "-c", script], { encoding: "utf8", env: { ...baseEnv, CEVRA_RELEASE_MODE: "0" } });
  const release = spawnSync(python, ["-s", "-B", "-c", script], { encoding: "utf8", env: { ...baseEnv, CEVRA_RELEASE_MODE: "1" } });
  assert.equal(development.status, 0);
  assert.equal(release.status, 0);
  assert.equal(development.stdout.trim(), "yes");
  assert.equal(release.stdout.trim(), "no");
});
