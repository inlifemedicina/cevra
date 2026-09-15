import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DESKTOP_HOST_PROTOCOL_VERSION,
  DesktopHostProtocolServer,
  DesktopSession,
  JsonLineFramer,
  MAX_JSONL_MESSAGE_BYTES,
  parseRequest
} from "../dist/index.js";
import { createEmptyProject, ProjectHistory } from "@cevra/project-ir";

const hostRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const unavailable = { available: false, reason: "runtime-not-configured" };

function createServer() {
  const lines = [];
  let shutdown = false;
  const session = new DesktopSession({
    history: new ProjectHistory(createEmptyProject({ id: "protocol-project", now: "2026-09-14T00:00:00.000Z" })),
    mediaCapability: unavailable,
    transcriptionCapability: unavailable
  });
  const server = new DesktopHostProtocolServer(session, {
    writeProtocolLine(line) { lines.push(JSON.parse(line)); },
    writeLog() {},
    requestShutdown() { shutdown = true; }
  });
  return { server, lines, didShutdown: () => shutdown };
}

test("host.hello returns the exact protocol identity and version", async () => {
  const { server, lines } = createServer();
  await server.handleLine(JSON.stringify({ protocolVersion: 1, id: "hello-1", method: "host.hello", params: {} }));
  assert.deepEqual(lines, [{
    protocolVersion: 1,
    id: "hello-1",
    result: { identity: "cevra.desktop-host", version: "0.1.0", protocolVersion: 1 }
  }]);
});

test("persistence integrity failure is a stable fail-closed hello error", async () => {
  const lines = [];
  const startupError = Object.assign(new Error("sensitive path must not escape"), { code: "PROJECT_PERSISTENCE_CORRUPT" });
  const server = new DesktopHostProtocolServer(null, {
    writeProtocolLine(line) { lines.push(JSON.parse(line)); },
    writeLog() {},
    requestShutdown() {}
  }, startupError);
  await server.handleLine(JSON.stringify({ protocolVersion: 1, id: "hello-corrupt", method: "host.hello", params: {} }));
  assert.deepEqual(lines[0], {
    protocolVersion: 1,
    id: "hello-corrupt",
    error: { code: "PROJECT_PERSISTENCE_CORRUPT", message: "The saved project failed integrity validation." }
  });
  assert.doesNotMatch(JSON.stringify(lines[0]), /sensitive path/u);
});

test("unknown methods are rejected by the closed request schema", () => {
  assert.throws(
    () => parseRequest(JSON.stringify({ protocolVersion: 1, id: "bad-method", method: "engine.call", params: {} })),
    (error) => error.code === "HOST_UNKNOWN_METHOD"
  );
});

test("malformed JSON receives a bounded protocol error", async () => {
  const { server, lines } = createServer();
  await server.handleLine("{not-json}");
  assert.equal(lines[0].id, "invalid");
  assert.equal(lines[0].error.code, "HOST_MALFORMED_REQUEST");
});

test("protocol version mismatches fail closed", () => {
  assert.throws(
    () => parseRequest(JSON.stringify({ protocolVersion: 2, id: "v2", method: "host.hello", params: {} })),
    (error) => error.code === "HOST_PROTOCOL_MISMATCH"
  );
  assert.equal(DESKTOP_HOST_PROTOCOL_VERSION, 1);
});

test("JSONL framing handles partial chunks and multiple responses", () => {
  const framer = new JsonLineFramer();
  assert.deepEqual(framer.push(Buffer.from('{"a":')), []);
  assert.deepEqual(framer.push(Buffer.from('1}\n{"b":2}\n')), ['{"a":1}', '{"b":2}']);
  framer.finish();
});

test("JSONL framing rejects an oversized message without unbounded buffering", () => {
  const framer = new JsonLineFramer(8);
  assert.throws(() => framer.push(Buffer.from("123456789")), RangeError);
  assert.equal(MAX_JSONL_MESSAGE_BYTES, 32 * 1024 * 1024);
});

test("responses retain their request IDs when requests complete out of order", async () => {
  const { server, lines } = createServer();
  await Promise.all([
    server.handleLine(JSON.stringify({ protocolVersion: 1, id: "state-a", method: "project.snapshot", params: {} })),
    server.handleLine(JSON.stringify({ protocolVersion: 1, id: "state-b", method: "host.status", params: {} }))
  ]);
  assert.deepEqual(new Set(lines.map((line) => line.id)), new Set(["state-a", "state-b"]));
});

test("host.shutdown acknowledges before requesting process shutdown", async () => {
  const { server, lines, didShutdown } = createServer();
  await server.handleLine(JSON.stringify({ protocolVersion: 1, id: "shutdown", method: "host.shutdown", params: {} }));
  assert.deepEqual(lines[0].result, { shuttingDown: true });
  assert.equal(didShutdown(), true);
});

test("operation cancellation reaches a live AbortController", async () => {
  let observedAbort = false;
  const history = new ProjectHistory(createEmptyProject({ id: "cancel-project", now: "2026-09-14T00:00:00.000Z" }));
  const session = new DesktopSession({
    history,
    mediaCapability: unavailable,
    transcriptionCapability: { available: true, reason: "available" },
    transcription: {
      transcribeSource(_request, signal) {
        return new Promise((_resolve, reject) => signal.addEventListener("abort", () => {
          observedAbort = true;
          const error = new Error("cancelled");
          error.name = "AbortError";
          reject(error);
        }, { once: true }));
      }
    }
  });
  const active = session.transcribeSource({ sourceId: "source", operationId: "op-cancel", locale: "pt-BR" });
  assert.deepEqual(session.cancel("op-cancel"), { operationId: "op-cancel", cancelled: true });
  await assert.rejects(active, { name: "AbortError" });
  assert.equal(observedAbort, true);
  assert.deepEqual(session.cancel("op-cancel"), { operationId: "op-cancel", cancelled: false });
});

test("session shutdown waits for cancelled long operations to reap", async () => {
  let reaped = false;
  const history = new ProjectHistory(createEmptyProject({ id: "reap-project", now: "2026-09-14T00:00:00.000Z" }));
  const session = new DesktopSession({
    history,
    mediaCapability: unavailable,
    transcriptionCapability: { available: true, reason: "available" },
    transcription: {
      transcribeSource(_request, signal) {
        return new Promise((_resolve, reject) => signal.addEventListener("abort", () => setImmediate(() => {
          reaped = true;
          const error = new Error("cancelled");
          error.name = "AbortError";
          reject(error);
        }), { once: true }));
      }
    }
  });
  const active = session.transcribeSource({ sourceId: "source", operationId: "reap-op", locale: "pt-BR" });
  await session.close();
  await assert.rejects(active, { name: "AbortError" });
  assert.equal(reaped, true);
});

test("the bundled host keeps stdout protocol-only and logs on stderr", async () => {
  const execution = await runHost([
    { protocolVersion: 1, id: "hello", method: "host.hello", params: {} },
    { protocolVersion: 1, id: "bye", method: "host.shutdown", params: {} }
  ]);
  assert.equal(execution.code, 0);
  const responses = execution.stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(responses.length, 2);
  assert.match(execution.stderr, /ready/u);
  assert.doesNotMatch(execution.stdout, /ready/u);
});

test("an externally terminated host exits and cannot leave a network listener", async () => {
  const bundle = resolve(hostRoot, "dist", "desktop-host.cjs");
  const persistenceRoot = await mkdtemp(resolve(tmpdir(), "cevra-host-exit-"));
  const child = spawn(process.execPath, [bundle], { env: { CEVRA_PROJECT_PERSISTENCE_ROOT: persistenceRoot }, stdio: ["pipe", "pipe", "pipe"] });
  try {
    await new Promise((resolvePromise) => child.stderr.once("data", resolvePromise));
    child.kill("SIGTERM");
    const code = await new Promise((resolvePromise) => child.once("exit", resolvePromise));
    assert.equal(code, 0);
  } finally {
    await rm(persistenceRoot, { recursive: true, force: true });
  }
  const sources = await Promise.all(["src/main.ts", "src/server.ts", "src/session.ts"].map((file) => readFile(resolve(hostRoot, file), "utf8")));
  assert.equal(sources.some((source) => /node:(?:net|http|https)|createServer\s*\(/u.test(source)), false);
});

test("method dispatch is an explicit switch and never property lookup", async () => {
  const source = await readFile(resolve(hostRoot, "src", "server.ts"), "utf8");
  assert.match(source, /switch \(request\.method\)/u);
  assert.doesNotMatch(source, /\[request\.method\]/u);
});

async function runHost(requests) {
  const persistenceRoot = await mkdtemp(resolve(tmpdir(), "cevra-host-protocol-"));
  const child = spawn(process.execPath, [resolve(hostRoot, "dist", "desktop-host.cjs")], { env: { CEVRA_PROJECT_PERSISTENCE_ROOT: persistenceRoot }, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  for (const request of requests) child.stdin.write(`${JSON.stringify(request)}\n`);
  const code = await new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", resolvePromise);
  });
  await rm(persistenceRoot, { recursive: true, force: true });
  return { code, stdout, stderr };
}
