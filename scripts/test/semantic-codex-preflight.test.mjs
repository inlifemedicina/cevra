import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { JsonLines, MetadataClient, safeConfigSummary, OVERRIDES } from "../semantic-codex-preflight.mjs";

function processFixture({ ignoreTerm = false } = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
  child.writes = []; child.signals = [];
  child.stdin.on("data", data => child.writes.push(JSON.parse(data)));
  child.kill = signal => { child.signals.push(signal); if (!ignoreTerm || signal === "SIGKILL") queueMicrotask(() => child.emit("close", 0)); return true; };
  return child;
}

test("bounded JSONL handles every UTF-8 split and multiple frames", () => {
  const bytes = Buffer.from('{"result":"ação 🧭"}\n{"result":2}\n');
  for (let split = 0; split <= bytes.length; split++) {
    const messages = [], reader = new JsonLines(value => messages.push(value));
    reader.push(bytes.subarray(0, split)); reader.push(bytes.subarray(split)); reader.end();
    assert.deepEqual(messages, [{ result: "ação 🧭" }, { result: 2 }]);
  }
});

test("limits apply before parsing/concatenating a complete response", () => {
  const reader = new JsonLines(() => assert.fail(), { lineBytes: 8 });
  reader.push(Buffer.from('12345'));
  assert.throws(() => reader.push(Buffer.from('6789')), { code: "LINE_LIMIT" });
  assert.throws(() => new JsonLines(() => {}, { totalBytes: 3 }).push(Buffer.from('{}\n{}\n')), { code: "TOTAL_LIMIT" });
  assert.throws(() => new JsonLines(() => {}, { events: 1 }).push(Buffer.from('{}\n{}\n')), { code: "EVENT_LIMIT" });
});

test("malformed JSON, invalid UTF-8, primitives and partial EOF fail closed", () => {
  for (const value of [Buffer.from('x\n'), Buffer.from([0xff, 10]), Buffer.from('null\n'), Buffer.from('[]\n')]) {
    assert.throws(() => new JsonLines(() => {}).push(value));
  }
  const reader = new JsonLines(() => {}); reader.push(Buffer.from('{"a":'));
  assert.throws(() => reader.end(), { code: "PARTIAL_EOF" });
});

test("only explicit metadata methods are allowed; thread/turn/tool/login/config writes never leave stdin", async () => {
  const child = processFixture(), client = new MetadataClient(child);
  for (const method of ["thread/start", "turn/start", "turn/interrupt", "account/login/start", "config/value/write", "mcpServer/tool/call", "command/exec"]) {
    await assert.rejects(client.request(method, {}), { code: "FORBIDDEN_METHOD" });
  }
  assert.equal(child.writes.length, 0); await client.close();
});

test("responses correlate to requests without logging raw account/config data", async () => {
  const child = processFixture(), client = new MetadataClient(child);
  const pending = client.request("account/read", { refreshToken: false });
  child.stdout.write(JSON.stringify({ id: child.writes[0].id, result: { account: { type: "chatgpt" } } }) + "\n");
  assert.deepEqual(await pending, { account: { type: "chatgpt" } });
  await client.close();
});

test("unknown, duplicate and simultaneous error/result responses fail closed", async () => {
  for (const message of [{ id: 999, result: {} }, { id: 1, result: {}, error: {} }]) {
    const child = processFixture(), client = new MetadataClient(child);
    const pending = client.request("config/read", {});
    const rejected = assert.rejects(pending);
    child.stdout.write(JSON.stringify(message) + "\n"); await rejected; await client.close();
  }
  const child = processFixture(), client = new MetadataClient(child);
  const pending = client.request("config/read", {});
  child.stdout.write('{"id":1,"result":{}}\n'); await pending;
  child.stdout.write('{"id":1,"result":{}}\n');
  assert.equal(client.error.code, "UNKNOWN_OR_DUPLICATE_RESPONSE"); await client.close();
});

test("tool/approval/input requests are never answered or authorized", async () => {
  for (const method of ["item/commandExecution/requestApproval", "item/tool/call", "item/tool/requestUserInput", "turn/completed"]) {
    const child = processFixture(), client = new MetadataClient(child);
    child.stdout.write(JSON.stringify({ method, id: 123, params: {} }) + "\n");
    assert.equal(client.error.code, "UNEXPECTED_SERVER_REQUEST_OR_EVENT");
    assert.equal(child.writes.length, 0); await client.close();
  }
});

test("known metadata notices counted without retaining arbitrary content", async () => {
  const child = processFixture(), client = new MetadataClient(child);
  child.stdout.write('{"method":"configWarning","params":{"secret":"not logged"}}\n');
  assert.equal(client.notifications, 1); assert.equal(client.error, undefined); await client.close();
});

test("stderr overflow and unexpected process exit reject outstanding metadata call", async () => {
  for (const fail of [child => child.stderr.write(Buffer.alloc(65537)), child => child.emit("close", 1)]) {
    const child = processFixture(), client = new MetadataClient(child);
    const rejected = assert.rejects(client.request("config/read", {}));
    fail(child); await rejected; await client.close();
  }
});

test("timeout terminates only owned child, escalating if it ignores SIGTERM", async () => {
  const child = processFixture({ ignoreTerm: true }), client = new MetadataClient(child, 5);
  await assert.rejects(client.request("initialize", {}), { code: "PREFLIGHT_TIMEOUT" });
  await client.close(); assert.deepEqual(child.signals, ["SIGTERM", "SIGKILL"]);
});

test("provider errors are sanitized, not echoed", async () => {
  const child = processFixture(), client = new MetadataClient(child);
  const rejected = assert.rejects(client.request("account/read", {}), { message: "RPC_ERROR" });
  child.stdout.write('{"id":1,"error":{"message":"private-email-or-token"}}\n');
  await rejected; await client.close();
});

test("config summary reports inherited enabled MCP but excludes personal settings", () => {
  const summary = safeConfigSummary({ mcp_servers: { privateName: { enabled: true, token: "secret" }, other: { enabled: false } }, plugins: { privatePlugin: {} }, developer_instructions: "personal text", model_instructions_file: "/private/path" });
  assert.equal(summary.enabledMcpCount, 1); assert.equal(summary.inheritedMcpCount, 2);
  assert.equal(summary.developerInstructionsPresent, true);
  for (const secret of ["privateName", "secret", "privatePlugin", "personal text", "/private/path"]) assert.equal(JSON.stringify(summary).includes(secret), false);
  assert.ok(OVERRIDES.includes("features.plugins=false"));
  assert.ok(OVERRIDES.includes("features.shell_tool=false"));
});
