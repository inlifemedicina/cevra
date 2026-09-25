import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdtemp, readFile, rename, rm, symlink, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { NodeMediaArtifactStore, NodeSourceContentIdentityError } from "../dist/index.js";

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

test("Node source identity hashes the exact regular file once and revalidates its operational stamp", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cevra-source-identity-"));
  const path = join(directory, "source.bin");
  const uri = pathToFileURL(path).href;
  const bytes = Buffer.from("verified source bytes");
  const store = new NodeMediaArtifactStore();
  try {
    await writeFile(path, bytes);
    const initial = await store.captureSource(uri);
    const identity = await store.identifySource(uri, initial);
    assert.deepEqual(identity.content, {
      sha256: "3c4e8ae60ebb67b2caa0b9773e647e70ddd6ed553600ca3157941af4744d26d9",
      sizeBytes: bytes.length
    });
    assert.equal(identity.bytesRead, bytes.length);
    assert.equal(await store.checkSource(uri, identity.stamp), "match");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Node source identity detects same-size byte changes even when mtime is restored", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cevra-source-same-size-"));
  const path = join(directory, "source.bin");
  const uri = pathToFileURL(path).href;
  const store = new NodeMediaArtifactStore();
  try {
    await writeFile(path, "AAAA");
    const initial = await store.captureSource(uri);
    const metadata = await lstat(path);
    await writeFile(path, "BBBB");
    await utimes(path, metadata.atime, metadata.mtime);
    assert.equal(await store.checkSource(uri, initial), "changed");
    await assert.rejects(
      store.identifySource(uri, initial),
      (error) => error instanceof NodeSourceContentIdentityError && error.code === "SOURCE_IDENTITY_CHANGED"
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Node source identity detects path replacement, symlinks, special files, offline files, and cancellation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cevra-source-boundaries-"));
  const path = join(directory, "source.bin");
  const replacement = join(directory, "replacement.bin");
  const link = join(directory, "link.bin");
  const store = new NodeMediaArtifactStore();
  try {
    await writeFile(path, "source");
    const initial = await store.captureSource(path);
    await writeFile(replacement, "source");
    await rename(replacement, path);
    assert.equal(await store.checkSource(path, initial), "changed");

    await symlink(path, link);
    await assert.rejects(
      store.captureSource(link),
      (error) => error instanceof NodeSourceContentIdentityError && error.code === "SOURCE_IDENTITY_UNSUPPORTED"
    );
    await assert.rejects(
      store.captureSource(directory),
      (error) => error instanceof NodeSourceContentIdentityError && error.code === "SOURCE_IDENTITY_UNSUPPORTED"
    );
    await unlink(path);
    await assert.rejects(
      store.captureSource(path),
      (error) => error instanceof NodeSourceContentIdentityError && error.code === "SOURCE_IDENTITY_OFFLINE"
    );

    await writeFile(path, Buffer.alloc(2 * 1024 * 1024, 7));
    const cancellable = await store.captureSource(path);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      store.identifySource(path, cancellable, controller.signal),
      (error) => error instanceof NodeSourceContentIdentityError && error.code === "SOURCE_IDENTITY_CANCELLED"
    );
    await rename(path, replacement);
    assert.equal((await lstat(replacement)).isFile(), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Node source identity observes cancellation delivered on the final hash chunk and closes the handle", async () => {
  for (const bytes of [Buffer.alloc(512 * 1024, 3), Buffer.alloc(3 * 1024 * 1024, 7)]) {
    const directory = await mkdtemp(join(tmpdir(), "cevra-source-final-abort-"));
    const path = join(directory, "source.bin");
    const controller = new AbortController();
    const store = new NodeMediaArtifactStore({
      onSourceIdentityChunk(bytesRead) {
        if (bytesRead === bytes.length) controller.abort();
      }
    });
    try {
      await writeFile(path, bytes);
      const initial = await store.captureSource(path);
      await assert.rejects(
        store.identifySource(path, initial, controller.signal),
        (error) => error instanceof NodeSourceContentIdentityError && error.code === "SOURCE_IDENTITY_CANCELLED"
      );
      await rename(path, join(directory, "closed.bin"));

      const controlPath = join(directory, "control.bin");
      await writeFile(controlPath, bytes);
      const control = new NodeMediaArtifactStore();
      const controlInitial = await control.captureSource(controlPath);
      const identity = await control.identifySource(controlPath, controlInitial);
      assert.equal(identity.bytesRead, bytes.length);
      assert.equal(identity.content.sha256, createHash("sha256").update(bytes).digest("hex"));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test("Node source identity fails closed when the file changes during the streaming hash", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cevra-source-mid-read-"));
  const path = join(directory, "source.bin");
  const uri = pathToFileURL(path).href;
  let changed = false;
  const store = new NodeMediaArtifactStore({
    async onSourceIdentityChunk() {
      if (changed) return;
      changed = true;
      const metadata = await lstat(path);
      await writeFile(path, Buffer.alloc(3 * 1024 * 1024, 9));
      await utimes(path, metadata.atime, metadata.mtime);
    }
  });
  try {
    await writeFile(path, Buffer.alloc(3 * 1024 * 1024, 3));
    const initial = await store.captureSource(uri);
    await assert.rejects(
      store.identifySource(uri, initial),
      (error) => error instanceof NodeSourceContentIdentityError && error.code === "SOURCE_IDENTITY_CHANGED"
    );
    assert.equal(changed, true);
    await rename(path, join(directory, "closed.bin"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Node source identity maps a real local read denial without mutating the source", async (t) => {
  if (process.platform === "win32") return t.skip("POSIX mode-based read denial is not portable to Windows");
  const directory = await mkdtemp(join(tmpdir(), "cevra-source-read-denied-"));
  const path = join(directory, "source.bin");
  const store = new NodeMediaArtifactStore();
  try {
    await writeFile(path, "preserve-me", { mode: 0o600 });
    await chmod(path, 0o000);
    const initial = await store.captureSource(path);
    await assert.rejects(
      store.identifySource(path, initial),
      (error) => error instanceof NodeSourceContentIdentityError && error.code === "SOURCE_IDENTITY_READ_FAILED"
    );
    await chmod(path, 0o600);
    assert.equal(await readFile(path, "utf8"), "preserve-me");
  } finally {
    await chmod(path, 0o600).catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
});
