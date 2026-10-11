import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { translate } from "@cevra/i18n";
import { createEmptyProject, ProjectHistory, frameTimingMilliseconds } from "@cevra/project-ir";
import { ManualTitleApplicationService, type ManualTitleEdit } from "@cevra/application";
import { ManualTitleControls } from "./components/ManualTitleControls";
import type { ManualRangeDraftController } from "./components/ManualSequenceControls";
import type { Translate } from "./ui-model";

function fixture(locale: "pt-BR" | "en-US" = "pt-BR", available = true) {
  const history = new ProjectHistory(createEmptyProject({ id: "title-ui" }));
  history.commit({ type: "source.add", source: { id: "source", kind: "video", uri: "/offline.mp4", displayName: "Original", durationMs: 10000,
    technicalDescriptor: { version: 1, basis: "ingest", content: { sha256: "a".repeat(64), sizeBytes: 10 },
      method: { profile: "cevra.source-technical.v1", engineId: "test", engineVersion: "1", engineApiVersion: 1 }, video: { codec: "h264" } },
    extensions: { "cevra.ingest": { method: "local", hasVideo: true } } } });
  const frameTiming = { version: 1 as const, timelineStartFrame: 0, timelineEndFrame: 300, sourceStartFrame: 0, sourceEndFrame: 300 };
  history.commit({ type: "timeline.edit", version: 2, edits: [
    { type: "timeline.timingPolicy.set", timingPolicy: "cfr30" },
    { type: "track.add", track: { id: "v1", kind: "video", name: "V1", hidden: false, locked: false, muted: false } },
    { type: "clip.add", clip: { id: "clip", sourceId: "source", trackId: "v1", ...frameTimingMilliseconds(frameTiming), frameTiming, speed: 1, volume: 1, opacity: 1 } }
  ] });
  const draft = createRef<ManualRangeDraftController>(), service = new ManualTitleApplicationService(history, () => "ui");
  const t: Translate = (key, values) => translate(locale, key, values);
  const commit = vi.fn(async (request: ManualTitleEdit) => { service.edit(request); view.rerender(element()); });
  const element = () => <ManualTitleControls project={history.current} busy={false} available={available} t={t} draft={draft} onCommit={commit} onEdit={commit} />;
  const view = render(element());
  return { history, draft, commit, t, view, rerender: () => view.rerender(element()) };
}

it.each(["pt-BR", "en-US"] as const)("%s title edits preserve History and drafts until an explicit Add", async locale => {
  const f = fixture(locale), before = f.history.entries.length;
  fireEvent.change(screen.getByLabelText(f.t("title.text")), { target: { value: "Ação, café e conexão" } });
  fireEvent.change(screen.getByLabelText(f.t("title.in")), { target: { value: "90" } });
  fireEvent.change(screen.getByLabelText(f.t("title.out")), { target: { value: "210" } });
  await act(async () => { await expect(f.draft.current!.settle()).rejects.toMatchObject({ code: "MANUAL_TITLE_PENDING" }); });
  expect(f.history.entries.length).toBe(before);
  expect(screen.getByRole("alert").textContent).toBe(f.t("title.pending"));
  expect((screen.getByLabelText(f.t("title.text")) as HTMLInputElement).value).toBe("Ação, café e conexão");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: f.t("title.add") })); });
  expect(f.history.entries.length).toBe(before + 1);
  expect(f.history.current.graphics[0]?.text).toBe("Ação, café e conexão");
  fireEvent.change(screen.getByLabelText(f.t("title.aspect")), { target: { value: "9:16" } });
  await act(async () => { await f.draft.current!.settle(); });
  expect(f.history.entries.length).toBe(before + 2);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: f.t("title.remove") })); });
  expect(f.history.current.graphics).toEqual([]);
  f.history.undo(); await act(async () => { f.rerender(); });
  expect(f.history.current.graphics).toHaveLength(1);
  f.history.redo(); await act(async () => { f.rerender(); });
  expect(f.history.current.graphics).toEqual([]);
});

it("invalid ranges and IME block settlement without dispatching an edit; Escape discards", async () => {
  const f = fixture();
  fireEvent.change(screen.getByLabelText(f.t("title.text")), { target: { value: "Title" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: f.t("title.add") })); });
  fireEvent.change(screen.getByLabelText(f.t("title.out")), { target: { value: "301" } });
  await act(async () => { await expect(f.draft.current!.settle()).rejects.toMatchObject({ code: "MANUAL_TITLE_INVALID" }); });
  expect(f.commit).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText(f.t("title.out")), { target: { value: "210" } });
  fireEvent.compositionStart(screen.getByLabelText(f.t("title.text")));
  await act(async () => { await expect(f.draft.current!.settle()).rejects.toMatchObject({ code: "MANUAL_TITLE_INVALID" }); });
  fireEvent.compositionEnd(screen.getByLabelText(f.t("title.text")));
  fireEvent.keyDown(screen.getByLabelText(f.t("title.text")), { key: "Escape" });
  expect(f.draft.current!.settle()).toBeUndefined();
  expect(f.commit).toHaveBeenCalledTimes(1);
});

it("unavailable platform cannot add a title", () => {
  const f = fixture("en-US", false);
  expect(screen.getByLabelText(f.t("title.text")).matches(":disabled")).toBe(true);
  expect(screen.getByText(f.t("title.unavailable"))).toBeTruthy();
  expect(f.commit).not.toHaveBeenCalled();
});
