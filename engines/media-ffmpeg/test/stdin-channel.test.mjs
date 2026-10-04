import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { ProcessMediaWorkerTransport, WorkerProcessExitedError } from "../dist/index.js";

// No product test callbacks: mock the Node spawn boundary in this isolated test file.
class Worker extends EventEmitter {
  exitCode = null;
  signalCode = null;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = Object.assign(new EventEmitter(), { writable: true, destroyed: false, writableEnded: false });
  writes = [];
  kills = 0;
  autoClose = true;
  constructor() {
    super();
    this.stdin.write = (line, callback) => {
      const request = JSON.parse(line);
      this.writes.push({ ...request, callback });
      if (this.onWrite) this.onWrite(request, callback);
      else if (request.method === "ping" || request.method === "cevra/shutdown") {
        queueMicrotask(() => {
          callback();
          this.reply(request.id, { activeJobId: null });
          if (request.method === "cevra/shutdown") this.finish();
        });
      }
      return true;
    };
  }
  reply(id, result) { this.stdout.emit("data", Buffer.from(JSON.stringify({ id, result }) + "\n")); }
  kill() { this.kills++; if (this.autoClose) queueMicrotask(() => this.finish()); return true; }
  finish() {
    if (this.signalCode !== null) return;
    this.signalCode = "SIGKILL";
    this.emit("exit", null, "SIGKILL");
    this.emit("close", null, "SIGKILL");
  }
}

const tick = () => new Promise(resolve => setImmediate(resolve));
const pipe = () => Object.assign(new Error("fixture broken pipe"), { code: "EPIPE" });
function setup(t, workers = [new Worker()], options = {}) {
  let spawns = 0;
  mock.method(childProcess, "spawn", () => workers[spawns++]);
  syncBuiltinESMExports();
  const transport = new ProcessMediaWorkerTransport({ mode: "development", pythonExecutable: "fixture", workerScript: "/fixture/worker.py",
    controlTimeoutMs: 1000, shutdownTimeoutMs: 100, renderLivenessIntervalMs: 1000, ...options });
  t.after(async () => {
    for (const worker of workers) worker.finish();
    await transport.stop().catch(() => {});
    mock.restoreAll(); syncBuiltinESMExports();
  });
  return { transport, workers, spawns: () => spawns };
}
function typed(error, cause) {
  assert.ok(error instanceof WorkerProcessExitedError);
  assert.equal(error.cause, cause);
  assert.match(error.message, /channel is unavailable/);
  return true;
}

for (const method of ["ping", "cevra/cancel", "cevra/shutdown", "tools/call"]) {
  for (const first of ["callback", "event"]) {
    test(`R1/R2 ${method}: ${first} EPIPE first; late event/callback/exit settle once`, async t => {
      const { transport, workers: [worker] } = setup(t);
      await transport.start();
      worker.autoClose = false;
      worker.onWrite = () => {};
      let settlements = 0;
      const pending = transport.request(method, { jobId: "fixture-job" });
      pending.then(() => settlements++, () => settlements++);
      const cause = pipe();
      const rejected = assert.rejects(pending, error => typed(error, cause));
      await tick();
      const write = worker.writes.at(-1);
      if (first === "callback") write.callback(cause); else worker.stdin.emit("error", cause);
      await rejected;
      // Ownership must remain until real close, even if requests already settled.
      assert.equal(transport.child, worker);
      const stopped = transport.stop();
      write.callback(pipe()); worker.stdin.emit("error", pipe()); worker.emit("error", pipe());
      worker.reply(write.id, "late"); worker.finish();
      await stopped;
      assert.equal(settlements, 1); assert.equal(worker.kills, 1);
      assert.equal(transport.pending.size, 0); assert.equal(transport.child, undefined);
    });
  }
}

for (const property of ["destroyed", "writableEnded", "writable"]) {
  test(`R3 closed channel (${property}) prevents write and settles existing requests`, async t => {
    const { transport, workers: [worker] } = setup(t);
    await transport.start(); worker.onWrite = () => {};
    const active = transport.request("tools/call", { jobId: "active" });
    const activeRejected = assert.rejects(active, WorkerProcessExitedError);
    await tick(); const count = worker.writes.length;
    worker.stdin[property] = property !== "writable";
    await assert.rejects(transport.request("ping"), WorkerProcessExitedError);
    await activeRejected; await transport.stop();
    assert.equal(worker.writes.length, count); assert.equal(transport.pending.size, 0);
  });
}

test("R4/R10 failure while writes pending ends a still-live child and all requests", async t => {
  const { transport, workers: [worker] } = setup(t);
  await transport.start(); worker.onWrite = () => {};
  const first = transport.request("tools/call", { jobId: "one" });
  const second = transport.request("ping");
  const rejections = [assert.rejects(first, WorkerProcessExitedError), assert.rejects(second, WorkerProcessExitedError)];
  await tick(); worker.stdin.emit("error", pipe());
  await Promise.all(rejections); await transport.stop();
  assert.equal(worker.kills, 1); assert.equal(worker.signalCode, "SIGKILL");
  assert.equal(transport.pending.size, 0);
});

for (const code of ["ERR_STREAM_DESTROYED", "FIXTURE_UNKNOWN"]) {
  test(`R5 ${code}: known channel normalized, other original code/cause preserved`, async t => {
    const { transport, workers: [worker] } = setup(t);
    await transport.start(); worker.onWrite = () => {};
    const cause = Object.assign(new Error("fixture" , { cause: new Error("original cause") }), { code });
    const pending = transport.request("ping");
    const rejected = assert.rejects(pending, error => code === "FIXTURE_UNKNOWN" ? (assert.equal(error, cause), true) : typed(error, cause));
    await tick(); worker.writes.at(-1).callback(cause); await rejected; await transport.stop();
  });
}

for (const terminal of ["AbortError", "TimeoutError"]) {
  test(`R6 ${terminal} recorded before failed cancel write retains terminal precedence directly`, async t => {
    if (terminal === "TimeoutError") t.mock.timers.enable({ apis: ["setTimeout"] });
    const { transport, workers: [worker] } = setup(t, undefined, terminal === "TimeoutError" ? { renderTimeoutMs: 10 } : {});
    await transport.start();
    const controller = new AbortController();
    let cancelStarted;
    const cancel = new Promise(resolve => { cancelStarted = resolve; });
    worker.onWrite = request => { if (request.method === "cevra/cancel") cancelStarted(); };
    const job = transport.request("tools/call", { jobId: "terminal" }, controller.signal);
    const rejected = assert.rejects(job, error => error.name === terminal);
    await tick();
    if (terminal === "AbortError") controller.abort(); else t.mock.timers.tick(10);
    await cancel;
    assert.equal(transport.pending.values().next().value.terminalError.name, terminal);
    worker.stdin.emit("error", pipe()); await rejected; await transport.stop();
    assert.equal(transport.pending.size, 0);
  });
}

test("R7 failure before abort/timeout cannot be replaced retroactively", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { transport, workers: [worker] } = setup(t, undefined, { renderTimeoutMs: 10 });
  await transport.start(); worker.onWrite = () => {};
  const controller = new AbortController(); const cause = pipe();
  const job = transport.request("tools/call", { jobId: "first-error" }, controller.signal);
  const rejected = assert.rejects(job, error => typed(error, cause));
  await tick(); worker.stdin.emit("error", cause); controller.abort();
  await rejected; await transport.stop();
  t.mock.timers.tick(20); await tick();
  assert.equal(worker.writes.length, 2);
});

test("R8 shutdown write/channel failure, concurrent stop calls, bounded close", async t => {
  const { transport, workers: [worker] } = setup(t);
  await transport.start();
  worker.onWrite = (_, callback) => { queueMicrotask(() => { callback(pipe()); worker.stdin.emit("error", pipe()); }); };
  await Promise.all([transport.stop(), transport.stop()]);
  assert.equal(worker.kills, 1); assert.equal(transport.pending.size, 0);
  assert.equal(transport.child, undefined);
});

test("R9 restart waits for close; old data/error/callback/exit cannot affect new worker", async t => {
  const old = new Worker(); const next = new Worker();
  const { transport, spawns } = setup(t, [old, next]);
  await transport.start(); old.onWrite = () => {}; old.autoClose = false;
  const pending = transport.request("ping"); const rejected = assert.rejects(pending, WorkerProcessExitedError);
  await tick(); const callback = old.writes.at(-1).callback;
  old.stdin.emit("error", pipe()); await rejected;
  const fresh = transport.request("ping"); await tick(); assert.equal(spawns(), 1);
  old.finish(); await fresh; assert.equal(spawns(), 2);
  old.stdout.emit("data", Buffer.from('{"id":')); old.stderr.emit("data", Buffer.from("foreign tail"));
  old.stdin.emit("error", pipe()); old.emit("error", pipe()); old.emit("exit", 99, null); callback(pipe());
  assert.deepEqual(await transport.request("ping"), { activeJobId: null });
  assert.equal(transport.stderrTail, ""); assert.equal(next.kills, 0);
  await transport.stop();
});

test("initial ping EPIPE is normalized and startup waits for child collection", async t => {
  const worker = new Worker(); const cause = pipe();
  worker.onWrite = (_, callback) => queueMicrotask(() => { callback(cause); worker.stdin.emit("error", cause); });
  const { transport } = setup(t, [worker]);
  await assert.rejects(transport.start(), error => typed(error, cause));
  assert.equal(worker.kills, 1); assert.equal(transport.child, undefined);
});

test("cleanup kill failure remains observable without replacing primary or terminal error", async t => {
  const { transport, workers: [worker] } = setup(t);
  await transport.start(); worker.onWrite = () => {};
  const cleanup = Object.assign(new Error("fixture kill denied"), { code: "EPERM" });
  worker.kill = () => { queueMicrotask(() => worker.finish()); throw cleanup; };
  const pending = transport.request("ping"); const cause = pipe();
  const rejected = assert.rejects(pending, error => { typed(error, cause); assert.equal(error.cleanupError, cleanup); return true; });
  await tick(); worker.stdin.emit("error", cause); await rejected;
  await assert.rejects(transport.stop(), error => error === cleanup);
});

test("liveness ping channel failure settles active operation and removes timers", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { transport, workers: [worker] } = setup(t, undefined, { renderLivenessIntervalMs: 10 });
  await transport.start();
  worker.onWrite = (request, callback) => { if (request.method === "ping") queueMicrotask(() => callback(pipe())); };
  const job = transport.request("tools/call", { jobId: "liveness" });
  const rejected = assert.rejects(job, WorkerProcessExitedError);
  await tick(); t.mock.timers.tick(10); await rejected;
  await transport.stop(); const count = worker.writes.length;
  t.mock.timers.tick(30); await tick();
  assert.equal(worker.writes.length, count); assert.equal(worker.kills, 1);
});

test("owned POSIX group and direct child are terminated; Windows uses only direct child", async t => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform");
  t.after(() => Object.defineProperty(process, "platform", platform));
  for (const target of ["linux", "win32"]) {
    Object.defineProperty(process, "platform", { ...platform, value: target });
    const worker = new Worker(); worker.pid = 123456;
    const groups = [];
    mock.method(process, "kill", (pid, signal) => { groups.push([pid, signal]); return true; });
    const { transport } = setup(t, [worker]);
    await transport.start(); worker.stdin.emit("error", pipe()); await transport.stop();
    assert.deepEqual(groups, target === "win32" ? [] : [[-123456, "SIGKILL"]]);
    assert.equal(worker.kills, 1);
    mock.restoreAll(); syncBuiltinESMExports();
  }
});

test("close timeout is observable, ownership retained, wait listener removed", async t => {
  const { transport, workers: [worker] } = setup(t, undefined, { shutdownTimeoutMs: 10 });
  await transport.start(); worker.autoClose = false; worker.onWrite = () => {};
  const pending = transport.request("ping"); let primary;
  const rejected = assert.rejects(pending, error => { primary = error; return error instanceof WorkerProcessExitedError; });
  await tick(); worker.stdin.emit("error", pipe()); await rejected;
  await assert.rejects(transport.stop(), /close timed out/);
  assert.equal(transport.child, worker);
  assert.match(primary.cleanupError.message, /close timed out/);
  assert.equal(worker.listenerCount("close"), 1); // only the permanent identity-scoped listener
});

for (const observer of ["stop", "start"]) {
  test(`R11/R12 ${observer}: expired retirement blocks restart until actual late close`, async t => {
    const old = new Worker(); const next = new Worker();
    old.pid = 123456; next.pid = 123457;
    mock.method(process, "kill", () => true);
    const { transport, spawns } = setup(t, [old, next], { shutdownTimeoutMs: 10, renderTimeoutMs: 30, renderLivenessIntervalMs: 20 });
    await transport.start();
    t.mock.timers.enable({ apis: ["setTimeout"] });
    old.autoClose = false; old.onWrite = () => {};
    const controller = new AbortController();
    const job = transport.request("tools/call", { jobId: "no-replay" }, controller.signal);
    let primary; let settlements = 0;
    job.then(() => settlements++, () => settlements++);
    const rejected = assert.rejects(job, error => { primary = error; return error instanceof WorkerProcessExitedError; });
    await tick();
    const write = old.writes.at(-1);
    old.stdin.emit("error", pipe()); await rejected;
    const retirement = transport.retirement;
    const observed = transport[observer]();
    let timeout;
    const expired = assert.rejects(observed, error => { timeout = error; return /close timed out/.test(error.message); });
    t.mock.timers.tick(10); await expired;
    assert.equal(primary.cleanupError, timeout);
    assert.equal(transport.child, old); assert.equal(transport.workerPid, old.pid);
    assert.equal(transport.retirement, retirement); assert.equal(transport.closed.has(old), false);
    assert.equal(transport.pending.size, 0); assert.equal(spawns(), 1);
    // A caller before close sees the original timeout, never a replacement worker.
    await assert.rejects(transport.request("ping"), error => error === timeout);
    await assert.rejects(transport.stop(), error => error === timeout);
    assert.equal(transport.child, old); assert.equal(spawns(), 1);
    controller.abort(); t.mock.timers.tick(100); await tick();
    assert.equal(old.writes.length, 2); assert.equal(old.kills, 1); assert.equal(settlements, 1);
    old.finish();
    assert.equal(transport.child, undefined); assert.equal(transport.workerPid, undefined);
    assert.equal(transport.retirement, undefined); assert.equal(transport.pending.size, 0);
    // Captured promises/errors retain their original failure after ownership is released.
    await assert.rejects(retirement, error => error === timeout);
    assert.equal(primary.cleanupError, timeout);
    const fresh = await transport.request("ping");
    assert.deepEqual(fresh, { activeJobId: null }); assert.equal(spawns(), 2);
    old.emit("close", null, "SIGKILL"); old.emit("exit", 99, null);
    old.stdin.emit("error", pipe()); old.emit("error", pipe()); write.callback(pipe());
    old.reply(write.id, "late"); old.stderr.emit("data", Buffer.from("old generation"));
    assert.deepEqual(await transport.request("ping"), { activeJobId: null });
    assert.equal(transport.child, next); assert.equal(next.kills, 0);
    assert.equal(transport.workerPid, next.pid);
    assert.equal(transport.stderrTail, ""); assert.equal(settlements, 1);
    assert.equal(old.writes.length, 2); assert.equal(transport.pending.size, 0);
    await transport.stop();
  });
}

test("R11 close between retirement timer and rejection microtask also releases only the old generation", async t => {
  const old = new Worker(); const next = new Worker();
  const { transport, spawns } = setup(t, [old, next], { shutdownTimeoutMs: 10 });
  await transport.start();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  old.autoClose = false; old.stdin.emit("error", pipe());
  const retirement = transport.retirement;
  const expired = assert.rejects(retirement, /close timed out/);
  t.mock.timers.tick(10); old.finish(); // rejection handler has not run yet
  await expired;
  assert.equal(transport.child, undefined); assert.equal(transport.retirement, undefined);
  assert.equal(spawns(), 1);
  assert.deepEqual(await transport.request("ping"), { activeJobId: null });
  assert.equal(spawns(), 2); assert.equal(transport.child, next);
  await assert.rejects(retirement, /close timed out/);
  await transport.stop();
});

test("NB-3 exit before write callback/stdin error retires once and isolates the next generation", async t => {
  const old = new Worker(); const next = new Worker();
  const groups = [];
  old.pid = 123456;
  mock.method(process, "kill", (pid, signal) => { groups.push([pid, signal]); return true; });
  const { transport, spawns } = setup(t, [old, next]);
  await transport.start(); old.autoClose = false; old.onWrite = () => {};
  const pending = transport.request("ping"); let settlements = 0;
  pending.then(() => settlements++, () => settlements++);
  const rejected = assert.rejects(pending, error => error instanceof WorkerProcessExitedError && /exited \(9\)/.test(error.message));
  await tick(); const write = old.writes.at(-1);
  old.exitCode = 9; old.emit("exit", 9, null);
  await rejected; const retirement = transport.retirement;
  write.callback(pipe()); old.stdin.emit("error", pipe()); old.emit("error", pipe());
  assert.equal(transport.retirement, retirement); assert.equal(settlements, 1);
  assert.equal(transport.child, old); assert.equal(transport.pending.size, 0);
  const fresh = transport.request("ping"); await tick(); assert.equal(spawns(), 1);
  old.emit("close", 9, null); await fresh;
  assert.equal(spawns(), 2); assert.equal(settlements, 1);
  assert.deepEqual(groups, process.platform === "win32" ? [] : [[-123456, "SIGKILL"]]);
  assert.equal(old.kills, 0); // exit is already observed; only its owned POSIX group needs a signal.
  write.callback(pipe()); old.stdin.emit("error", pipe()); old.emit("exit", 9, null); old.emit("close", 9, null);
  assert.deepEqual(await transport.request("ping"), { activeJobId: null });
  assert.equal(transport.child, next); assert.equal(next.kills, 0); assert.equal(transport.pending.size, 0);
  await transport.stop();
});

test("synchronous write throw shares failure path; unrelated frozen error preserved", async t => {
  const { transport, workers: [worker] } = setup(t);
  await transport.start();
  const cause = Object.freeze(Object.assign(new Error("fixture write failure"), { code: "FIXTURE_WRITE" }));
  worker.stdin.write = () => { throw cause; };
  await assert.rejects(transport.request("ping"), error => error === cause);
  await transport.stop(); assert.equal(worker.kills, 1);
});

test("group kill failure still terminates direct child and preserves prior abort", async t => {
  const { transport, workers: [worker] } = setup(t);
  worker.pid = 123456;
  const cleanup = Object.assign(new Error("fixture group denied"), { code: "EPERM" });
  mock.method(process, "kill", () => { throw cleanup; });
  await transport.start(); worker.onWrite = () => {};
  const controller = new AbortController();
  const job = transport.request("tools/call", { jobId: "aborted" }, controller.signal);
  const rejected = assert.rejects(job, error => { assert.equal(error.name, "AbortError"); assert.equal(error.cleanupError, cleanup); return true; });
  await tick(); controller.abort(); worker.stdin.emit("error", pipe()); await rejected;
  await assert.rejects(transport.stop(), error => error === cleanup);
  assert.equal(worker.kills, 1);
});

test('settle observes native failure retirement without stopping a healthy unrelated worker', async t => {
  const { transport, workers: [worker] } = setup(t);
  await transport.start(); await transport.settle(); assert.equal(worker.kills, 0);
  worker.autoClose = false; worker.onWrite = () => {};
  const request = transport.request('tools/call', { jobId: 'preview-drain' }); const failed = assert.rejects(request, WorkerProcessExitedError);
  await tick(); worker.stdin.emit('error', pipe()); await failed;
  let settled = false; const drain = transport.settle().then(() => { settled = true; });
  await tick(); assert.equal(settled, false); worker.finish(); await drain; assert.equal(settled, true);
});
