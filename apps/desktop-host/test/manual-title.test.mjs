import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEmptyProject, frameTimingMilliseconds, MANUAL_TITLE_COMPONENT } from "@cevra/project-ir";
import { DesktopSession } from "../dist/index.js";
import { __openDesktopProjectForTest } from "../dist/persistence.js";
test("typed host title mutation checkpoints and physically reopens with Undo/Redo, old project remains readable", async t => {
  const root = await mkdtemp(join(tmpdir(), "cevra-title-persist-")); t.after(() => rm(root, { recursive: true, force: true }));
  const opened = await __openDesktopProjectForTest(root, { initialProject: createEmptyProject({ id: "physical-title" }) });
  const history = opened.history, unavailable = { available: false, reason: "runtime-not-configured" };
  history.commit({ type: "source.add", source: { id: "s", kind: "video", uri: "/synthetic.mp4", displayName: "Original", durationMs: 1000,
    technicalDescriptor: { version: 1, basis: "ingest", content: { sha256: "a".repeat(64), sizeBytes: 10 }, method: { profile: "cevra.source-technical.v1", engineId: "test", engineVersion: "1", engineApiVersion: 1 }, video: { codec: "h264" } },
    extensions: { "cevra.ingest": { method: "local", hasVideo: true } } } });
  const frameTiming = { version: 1, timelineStartFrame: 0, timelineEndFrame: 30, sourceStartFrame: 0, sourceEndFrame: 30 };
  history.commit({ type: "timeline.edit", version: 2, edits: [{ type: "timeline.timingPolicy.set", timingPolicy: "cfr30" },
    { type: "track.add", track: { id: "v1", kind: "video", name: "V1", muted: false, hidden: false, locked: false } },
    { type: "clip.add", clip: { id: "c", sourceId: "s", trackId: "v1", frameTiming, ...frameTimingMilliseconds(frameTiming), speed: 1, volume: 1, opacity: 1 } }] });
  const session = new DesktopSession({ history, persistence: opened.persistence, mediaCapability: unavailable, transcriptionCapability: unavailable, manualTitleCapability: { available: true, reason: "available" } });
  await session.editManualTitle({ version: 1, type: "set", expectedSnapshotId: history.current.history.headSnapshotId,
    title: { version: 1, componentId: MANUAL_TITLE_COMPONENT, text: "Ação e café", startFrame: 1, endFrame: 29, aspect: "9:16" } });
  const current = history.current; assert.equal(session.state().status.persistence, "local-saved"); await session.close();
  const reopened = await __openDesktopProjectForTest(root, {}); assert.deepEqual(reopened.history.current, current);
  reopened.history.undo(); assert.equal(reopened.history.current.graphics.length, 0);
  reopened.history.redo(); assert.deepEqual(reopened.history.current, current);
});
