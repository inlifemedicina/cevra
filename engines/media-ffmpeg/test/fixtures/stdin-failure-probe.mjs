// Separate process: baseline's uncaught stdin event must not be hidden by a handler.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
const { ProcessMediaWorkerTransport, WorkerProcessExitedError } = await import(process.argv[2]);
const mode = process.argv[3];
const child = Object.assign(new EventEmitter(), {
  exitCode: null, signalCode: null, stdout: new EventEmitter(), stderr: new EventEmitter(),
  stdin: Object.assign(new EventEmitter(), { writable: true, destroyed: false, writableEnded: false })
});
const cause = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
child.stdin.write = (_, callback) => {
  queueMicrotask(() => {
    if (mode === "event") child.stdin.emit("error", cause);
    else callback(cause);
  });
  return true;
};
child.kill = () => {
  queueMicrotask(() => { child.signalCode = "SIGKILL"; child.emit("exit", null, "SIGKILL"); child.emit("close"); });
  return true;
};
childProcess.spawn = () => child;
syncBuiltinESMExports();
const transport = new ProcessMediaWorkerTransport({ mode: "development", pythonExecutable: "fixture", workerScript: "/fixture/worker.py", controlTimeoutMs: 100, shutdownTimeoutMs: 100 });
try {
  await assert.rejects(transport.start(), error => error instanceof WorkerProcessExitedError && error.cause === cause);
  await transport.stop();
  console.log(`PASS ${mode}: typed channel failure; child closed`);
} finally {
  if (child.signalCode === null) child.kill();
}
