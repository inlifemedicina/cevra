import assert from "node:assert/strict";
import { lstat, mkdtemp, readFile, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { NodeMediaArtifactStore } from "../dist/index.js";

test("Node media artifact adapter detects and removes only the requested local file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cevra-artifacts-"));
  const target = join(directory, "partial.mp4");
  const preserved = join(directory, "preserved.mp4");
  await writeFile(target, "partial");
  await writeFile(preserved, "preserved");
  const store = new NodeMediaArtifactStore();
  try {
    assert.equal(await store.exists(pathToFileURL(target).href), true);
    await store.remove(pathToFileURL(target).href);
    assert.equal(await store.exists(target), false);
    assert.equal(await readFile(preserved, "utf8"), "preserved");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Node media artifact adapter distinguishes valid and dangling symlinks without following them", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cevra-artifact-links-"));
  const target = join(directory, "target.mp4");
  const validLink = join(directory, "valid.mp4");
  const danglingLink = join(directory, "dangling.mp4");
  await writeFile(target, "preserve");
  await symlink(target, validLink);
  await symlink(join(directory, "missing.mp4"), danglingLink);
  const store = new NodeMediaArtifactStore();
  try {
    assert.equal(await store.kind(validLink), "symlink");
    assert.equal(await store.kind(danglingLink), "symlink");
    await store.remove(validLink);
    assert.equal(await readFile(target, "utf8"), "preserve");
    assert.equal((await lstat(danglingLink)).isSymbolicLink(), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Node media artifact adapter matches only the exact POSIX publication identity", async (t) => {
  if (process.platform === "win32") return t.skip("POSIX dev/inode evidence is intentionally unavailable on Windows");
  const directory = await mkdtemp(join(tmpdir(), "cevra-artifact-identity-"));
  const output = join(directory, "output.mp4");
  const replacement = join(directory, "replacement.mp4");
  const target = join(directory, "target.mp4");
  const store = new NodeMediaArtifactStore();
  try {
    await writeFile(output, "owned");
    const metadata = await lstat(output, { bigint: true });
    const evidence = { version: 1, scheme: "posix-dev-inode", device: metadata.dev.toString(), inode: metadata.ino.toString() };
    assert.equal(await store.matchesPublication(output, evidence), true);

    await writeFile(replacement, "foreign");
    await rename(replacement, output);
    assert.equal(await store.matchesPublication(output, evidence), false);

    await unlink(output);
    await writeFile(target, "target");
    await symlink(target, output);
    assert.equal(await store.matchesPublication(output, evidence), false);
    assert.equal(await readFile(target, "utf8"), "target");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
