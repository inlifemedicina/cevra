import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const hostRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(hostRoot, "dist", "node-runtime-manifest.json"), "utf8"));
const privateNode = resolve(hostRoot, "..", "desktop", "src-tauri", "binaries", manifest.preparedBinaryName);
const persistenceRoot = await mkdtemp(resolve(tmpdir(), "cevra-private-node-smoke-"));
const child = spawn(privateNode, [resolve(hostRoot, "dist", "desktop-host.cjs")], {
  env: { CEVRA_PROJECT_PERSISTENCE_ROOT: persistenceRoot },
  stdio: ["pipe", "pipe", "pipe"]
});
let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
child.stdin.write(`${JSON.stringify({ protocolVersion: 1, id: "smoke-hello", method: "host.hello", params: {} })}\n`);
child.stdin.write(`${JSON.stringify({ protocolVersion: 1, id: "smoke-shutdown", method: "host.shutdown", params: {} })}\n`);
const exitCode = await new Promise((resolvePromise, reject) => {
  child.once("error", reject);
  child.once("exit", resolvePromise);
});
await rm(persistenceRoot, { recursive: true, force: true });
if (exitCode !== 0) throw new Error(`Private Node host smoke failed (${exitCode}): ${stderr}`);
const responses = stdout.trim().split("\n").map((line) => JSON.parse(line));
if (responses.length !== 2 || responses[0]?.result?.identity !== "cevra.desktop-host" || responses[1]?.result?.shuttingDown !== true) {
  throw new Error("Private Node host smoke returned an invalid protocol response.");
}
process.stdout.write(`${JSON.stringify({ privateNode: manifest.nodeVersion, target: manifest.target, protocolResponses: responses.length })}\n`);
