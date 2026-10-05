import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** CI fixture only: owns this child and an empty store, with no worker/provider environment. */
export async function runHostProtocolSmoke(executable, bundle, {
  timeoutMs = 30_000, shutdownGraceMs = 1_000, persistenceParent = tmpdir()
} = {}) {
  const persistenceRoot = await mkdtemp(resolve(persistenceParent, "cevra-private-node-smoke-"));
  const child = spawn(executable, [bundle], {
    env: { CEVRA_PROJECT_PERSISTENCE_ROOT: persistenceRoot },
    stdio: ["pipe", "pipe", "pipe"]
  });
  let settled = false;
  let pending;
  let stdout = "";
  let stdoutBytes = 0;
  let stderr = "";
  let responses = 0;
  let rejectFailure;
  const failure = new Promise((_, reject) => { rejectFailure = reject; });
  const fail = (cause) => { rejectFailure(cause); };
  const closed = new Promise((resolveClose) => {
    child.once("close", (code, signal) => {
      settled = true;
      resolveClose({ code, signal });
      if (pending) fail(new Error("Private Node host exited before its protocol response."));
      if (stdout.length) fail(new Error("Private Node host returned an incomplete protocol line."));
    });
  });
  child.once("error", fail);
  child.stdin.on("error", fail);
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString("utf8")).slice(-8_192); });
  child.stdout.on("data", (chunk) => {
    stdoutBytes += chunk.length;
    if (stdoutBytes > 65_536) return fail(new Error("Private Node host smoke output exceeded its limit."));
    stdout += chunk.toString("utf8");
    let newline;
    while ((newline = stdout.indexOf("\n")) >= 0) {
      const line = stdout.slice(0, newline);
      stdout = stdout.slice(newline + 1);
      try {
        const response = JSON.parse(line);
        if (!pending || response?.protocolVersion !== 1 || response.id !== pending.id
          || !Object.hasOwn(response, "result") || Object.hasOwn(response, "error")) {
          throw new Error("Private Node host smoke returned an invalid protocol response.");
        }
        const request = pending;
        pending = undefined;
        responses += 1;
        request.resolve(response.result);
      } catch (cause) { fail(cause); }
    }
  });
  const timer = setTimeout(() => fail(new Error("Private Node host smoke timed out.")), timeoutMs);
  const exchange = (id, method, params) => new Promise((resolveResponse) => {
    pending = { id, resolve: resolveResponse };
    child.stdin.write(`${JSON.stringify({ protocolVersion: 1, id, method, params })}\n`);
  });
  const waitForClose = async (ms) => {
    let deadline;
    try { await Promise.race([closed, new Promise((done) => { deadline = setTimeout(done, ms); })]); }
    finally { clearTimeout(deadline); }
  };
  try {
    await Promise.race([failure, (async () => {
      const hello = await exchange("smoke-hello", "host.hello", {});
      if (hello?.identity !== "cevra.desktop-host" || hello.protocolVersion !== 1) {
        throw new Error("Private Node host smoke returned an invalid identity.");
      }
      const attemptId = "private-node-smoke-close";
      const prepared = await exchange("smoke-prepare-close", "host.prepareClose", { attemptId });
      if (prepared?.ready !== true || prepared.attemptId !== attemptId) {
        throw new Error("Private Node host smoke did not prepare its close attempt.");
      }
      const shutdown = await exchange("smoke-shutdown", "host.shutdown", { attemptId });
      if (shutdown?.shuttingDown !== true) throw new Error("Private Node host smoke did not acknowledge shutdown.");
      const exit = await closed;
      if (exit.code !== 0 || exit.signal) throw new Error(`Private Node host smoke failed (${exit.code}): ${stderr}`);
    })()]);
    return responses;
  } finally {
    clearTimeout(timer);
    if (!settled) {
      child.kill("SIGTERM");
      await waitForClose(shutdownGraceMs);
      if (!settled) {
        child.kill("SIGKILL");
        await waitForClose(2_000);
      }
    }
    // Never remove a fixture store while its process can still write it.
    if (!settled) throw new Error("Private Node host smoke child did not settle; fixture store retained.");
    await rm(persistenceRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hostRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const manifest = JSON.parse(await readFile(resolve(hostRoot, "dist", "node-runtime-manifest.json"), "utf8"));
  const privateNode = resolve(hostRoot, "..", "desktop", "src-tauri", "binaries", manifest.preparedBinaryName);
  const protocolResponses = await runHostProtocolSmoke(privateNode, resolve(hostRoot, "dist", "desktop-host.cjs"));
  process.stdout.write(`${JSON.stringify({ privateNode: manifest.nodeVersion, target: manifest.target, protocolResponses })}\n`);
}
