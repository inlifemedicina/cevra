import { expect, it, vi } from "vitest";
import { ProjectHistory, createEmptyProject } from "@cevra/project-ir";
import { TauriDesktopBackend } from "./backend/tauri-desktop-backend";

it("native relocation receives only source/snapshot/operation IDs and locale, with no UI path or content evidence", async () => {
  const history = new ProjectHistory(createEmptyProject({ id: "relocate-backend" }));
  history.commit({ type: "source.add", source: { id: "s", kind: "video", uri: "/old.mp4", displayName: "Original" } });
  const unavailable = { available: false, reason: "runtime-not-configured" };
  const state = { project: history.current, sourceNumbering: history.sourceNumbering, canUndo: true, canRedo: false,
    status: { hostAvailable: true, persistence: "local-saved" }, capabilities: { mediaImport: unavailable, transcription: unavailable, sourceRelocation: { available: true, reason: "available" } } };
  const invoke = vi.fn(async () => ({ outcome: "located", result: { state, sourceId: "s", changed: true } }));
  const backend = new TauriDesktopBackend(invoke as never);
  const request = { version: 1 as const, sourceId: "s", expectedSnapshotId: history.current.history.headSnapshotId!, operationId: "locate-1", locale: "en-US" as const };
  const result = await backend.locateMedia({ ...request, uri: "/caller.mp4", sha256: "caller" } as typeof request);
  expect(invoke).toHaveBeenCalledWith("desktop_locate_media", { args: request });
  expect(result.outcome).toBe("located");
  if (result.outcome === "located") { expect(result.state.capabilities["media.locate"]?.available).toBe(true); expect(result.sourceId).toBe("s"); }
});

it("native picker cancellation returns without loading or applying another state", async () => {
  const invoke = vi.fn(async () => ({ outcome: "cancelled" })); const backend = new TauriDesktopBackend(invoke as never);
  expect(await backend.locateMedia({ version: 1, sourceId: "s", expectedSnapshotId: "snapshot", operationId: "locate-1", locale: "pt-BR" })).toEqual({ outcome: "cancelled" });
  expect(invoke).toHaveBeenCalledOnce();
});
