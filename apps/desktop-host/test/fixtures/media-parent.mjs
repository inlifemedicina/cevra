import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const [python, repositoryRoot, pidFile] = process.argv.slice(2);
const worker = spawn(python, [resolve(repositoryRoot, "apps/desktop-host/test/fixtures/media-lifecycle-worker.py"), repositoryRoot, pidFile], {
  stdio: ["pipe", "pipe", "inherit"]
});

worker.once("error", (cause) => {
  process.stderr.write(`${cause.message}\n`);
  process.exitCode = 1;
});
worker.stdin.write(`${JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: { jobId: "desktop-host-containment", name: "desktop-host-containment-test", arguments: {} }
})}\n`);

for (;;) {
  try {
    const subprocessPid = (await readFile(pidFile, "utf8")).trim();
    process.stdout.write(`${worker.pid} ${subprocessPid}\n`);
    break;
  } catch (cause) {
    if (cause?.code !== "ENOENT") throw cause;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
}
