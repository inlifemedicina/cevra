import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, symlink, mkdir, truncate, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ManualVideoClipApplicationService } from "@cevra/application";
import { NodeMediaArtifactStore } from "@cevra/media-ffmpeg";
import { DesktopSession, DesktopProjectPersistence, DesktopHostProtocolServer } from "../dist/index.js";
import { readLocalVideoPreview } from "../dist/local-video-preview.js";

const unavailable = { available: false, reason: "runtime-not-configured" };
async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), "cevra-manual-video-")); t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "fixture.mp4");
  // Byte transport fixture; decoder/playback acceptance uses a real MP4 separately.
  const bytes = Buffer.from("owned deterministic transport fixture"); await writeFile(path, bytes);
  const opened = await DesktopProjectPersistence.open(join(root, "store"));
  const source = { id: "video", kind: "video", uri: path, displayName: "fixture.mp4", durationMs: 6000,
    technicalDescriptor: { version: 1, basis: "ingest", content: { sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length },
      method: { profile: "cevra.source-technical.v1", engineId: "test", engineVersion: "1", engineApiVersion: 1 }, video: { codec: "h264" } },
    extensions: { "cevra.ingest": { method: "local", hasVideo: true } } };
  opened.history.commit({ type: "source.add", source }); await opened.persistence.checkpoint(opened.history);
  const session = new DesktopSession({ history: opened.history, persistence: opened.persistence,
    manualVideoClip: new ManualVideoClipApplicationService({ history: opened.history, identity: new NodeMediaArtifactStore() }), mediaCapability: unavailable, transcriptionCapability: unavailable });
  t.after(() => session.close());
  const request = { sourceId: "video", expectedSnapshotId: session.state().project.history.headSnapshotId };
  return { root, path, bytes, source, session, opened, request };
}

test("bounded preview returns only verified bytes and canonical binding; no path leaks or mutations", async (t) => {
  const { session, opened, request, bytes, path } = await setup(t); const before = opened.history.toArchive();
  const preview = await session.previewLocalVideo(request);
  assert.deepEqual(Object.keys(preview).sort(), ["base64", "durationMs", "mimeType", "snapshotId", "sourceId"]);
  assert.deepEqual(Buffer.from(preview.base64, "base64"), bytes); assert.equal(preview.durationMs, 6000);
  assert.doesNotMatch(JSON.stringify(preview), new RegExp(path)); assert.deepEqual(opened.history.toArchive(), before);
});

test("preview rejects replaced content, symlinks, nonregular files and oversized files", async (t) => {
  const { root, path, source, request, session } = await setup(t);
  await writeFile(path, Buffer.alloc(source.technicalDescriptor.content.sizeBytes, 88));
  await assert.rejects(session.previewLocalVideo(request), { code: "MANUAL_VIDEO_SOURCE_CHANGED" });
  await rm(path); await symlink(join(root, "missing"), path);
  await assert.rejects(session.previewLocalVideo(request), { code: "MANUAL_VIDEO_UNAVAILABLE" });
  await rm(path); await mkdir(path);
  await assert.rejects(readLocalVideoPreview(source, request.expectedSnapshotId), { code: "MANUAL_VIDEO_UNSUPPORTED" });
  await rm(path, { recursive: true }); await writeFile(path, "x"); await truncate(path, 8 * 1024 * 1024 + 1);
  await assert.rejects(readLocalVideoPreview(source, request.expectedSnapshotId), { code: "MANUAL_VIDEO_TOO_LARGE" });
});

test("manual clip checkpoint survives close/reopen with undo and redo; original bytes stay unchanged", async (t) => {
  const { root, path, bytes, session, request } = await setup(t);
  const result = await session.createManualVideoClip({ ...request, sourceStartMs: 1000, sourceEndMs: 4000 });
  const clip = result.state.project.timeline.clips[0]; assert.equal(clip.id, result.clipId);
  assert.equal(result.state.status.persistence, "local-saved");
  const undone = await session.undo(); assert.equal(undone.project.timeline.clips.length, 0); assert.equal(undone.canRedo, true);
  await session.close();
  const reopened = await DesktopProjectPersistence.open(join(root, "store"));
  t.after(() => reopened.persistence.close());
  assert.equal(reopened.history.canRedo, true); reopened.history.redo();
  assert.deepEqual(reopened.history.current.timeline.clips, [clip]); assert.deepEqual(await readFile(path), bytes);
});

test("temporary review denies both new commands before file access or canonical mutation", async (t) => {
  const { opened, request } = await setup(t); const before = opened.history.toArchive();
  const session = new DesktopSession({ history: opened.history, temporaryEditorialReview: true, mediaCapability: unavailable, transcriptionCapability: unavailable });
  await assert.rejects(session.previewLocalVideo(request), { code: "EDITORIAL_REVIEW_READ_ONLY" });
  await assert.rejects(session.createManualVideoClip({ ...request, sourceStartMs: 0, sourceEndMs: 1 }), { code: "EDITORIAL_REVIEW_READ_ONLY" });
  assert.deepEqual(opened.history.toArchive(), before);
});

test("RPC rejects arbitrary paths, duration/commands and unsafe range fields", async (t) => {
  const { session, request, opened } = await setup(t); const before = opened.history.toArchive(); const lines = [];
  const server = new DesktopHostProtocolServer(session, { writeProtocolLine(line) { lines.push(JSON.parse(line)); }, writeLog() {}, requestShutdown() {} });
  for (const params of [{ ...request, uri: "/tmp/other" }, { ...request, durationMs: 6000 }]) {
    await server.handleLine(JSON.stringify({ protocolVersion: 1, id: "invalid", method: "video.previewLocal", params }));
  }
  for (const params of [{ ...request, sourceStartMs: 0, sourceEndMs: 1, commands: [] }, { ...request, sourceStartMs: 0.5, sourceEndMs: 2000 }]) {
    await server.handleLine(JSON.stringify({ protocolVersion: 1, id: "invalid", method: "video.createManualClip", params }));
  }
  assert.equal(lines.length, 4); assert.ok(lines.every((line) => line.error.code === "HOST_INVALID_PARAMS")); assert.deepEqual(opened.history.toArchive(), before);
});
