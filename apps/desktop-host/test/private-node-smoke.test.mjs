import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runHostProtocolSmoke } from "../scripts/private-node-smoke.mjs";

test("CI smoke uses the production prepare/shutdown handshake and settles before cleanup", async () => {
  assert.equal(await runHostProtocolSmoke(process.execPath, fileURLToPath(new URL("../dist/desktop-host.cjs", import.meta.url))), 3);
});

test("CI smoke bounds an unresponsive owned child, including one that ignores TERM", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "cevra-smoke-regression-"));
  const stores = resolve(root, "stores");
  await mkdir(stores);
  const bundle = resolve(root, "unresponsive.mjs");
  await writeFile(bundle, 'process.on("SIGTERM", () => {}); process.stdin.resume(); setInterval(() => {}, 10);');
  const started = Date.now();
  try {
    await assert.rejects(runHostProtocolSmoke(process.execPath, bundle, {
      timeoutMs: 500, shutdownGraceMs: 100, persistenceParent: stores
    }), /timed out/);
    assert.ok(Date.now() - started < 5_000);
    assert.deepEqual(await readdir(stores), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("CI smoke rejects an invalid close acknowledgement and cleans only its own store", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "cevra-smoke-regression-"));
  const stores = resolve(root, "stores");
  await mkdir(stores);
  await mkdir(resolve(stores, "foreign"));
  const bundle = resolve(root, "invalid-close.mjs");
  await writeFile(bundle, `
    import { createInterface } from "node:readline";
    createInterface({ input: process.stdin }).on("line", (line) => {
      const request = JSON.parse(line);
      const result = request.method === "host.hello"
        ? { identity: "cevra.desktop-host", protocolVersion: 1 }
        : { ready: true, attemptId: "another-attempt" };
      process.stdout.write(JSON.stringify({ protocolVersion: 1, id: request.id, result }) + "\\n");
    });
  `);
  try {
    await assert.rejects(runHostProtocolSmoke(process.execPath, bundle, {
      timeoutMs: 2_000, shutdownGraceMs: 100, persistenceParent: stores
    }), /did not prepare/);
    assert.deepEqual(await readdir(stores), ["foreign"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
