import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { translate } from "@cevra/i18n";
import { manualTitleLayout, manualTitleHeight, type ManualTitle } from "@cevra/project-ir";
import { ManualTitleOverlay, type TitlePreviewEditing } from "./components/ManualTitleOverlay";
import type { ManualRangeDraftController } from "./components/ManualSequenceControls";
const t = (key: Parameters<typeof translate>[1]) => translate("pt-BR", key);
function pointer(element: Element, type: string, x: number, y = 0, pointerId = 1) {
  const event = new Event(type, { bubbles: true }); for (const [key, value] of Object.entries({ clientX: x, clientY: y, pointerId, button: 0 })) Object.defineProperty(event, key, { value }); fireEvent(element, event);
}
function fixture(aspect: "16:9" | "9:16" = "16:9") {
  const title: ManualTitle = { version: 1, componentId: "cevra.title.lower-third.inter.v1", text: "Ação e café", startFrame: 1, endFrame: 29, aspect };
  const video = document.createElement("video");
  Object.defineProperties(video, { videoWidth: { value: aspect === "16:9" ? 1920 : 1080 }, videoHeight: { value: aspect === "16:9" ? 1080 : 1920 } });
  video.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, toJSON() {} });
  const commit = vi.fn(async (_request: any) => {}), select = vi.fn(), draftRef = { current: null as ManualRangeDraftController | null };
  const editing: TitlePreviewEditing = { title, graphicId: "title", snapshotId: "snap", selected: true, onSelect: select, onCommit: commit, draftRef };
  const view = (active = true) => <ManualTitleOverlay editing={editing} videoRef={{ current: video }} active={active} t={t} />;
  const rendered = render(view()); return { ...rendered, title, commit, select, editing, view, draftRef };
}
it.each(["16:9", "9:16"] as const)("maps %s letterboxing, selects and drags once in picture coordinates, then resizes proportionally", async aspect => {
  const f = fixture(aspect), picture = f.container.querySelector<HTMLElement>(".title-picture")!;
  const width = aspect === "16:9" ? 800 : 337.5, height = aspect === "16:9" ? 450 : 600;
  expect(picture.style.width).toBe(width + "px"); expect(picture.style.height).toBe(height + "px");
  expect(picture.style.left).toBe((800-width)/2+"px"); expect(picture.style.top).toBe((600-height)/2+"px");
  const hit = screen.getByRole("button", { name: t("title.selectPreview") });
  pointer(hit, "pointerdown", 100, 100); pointer(hit, "pointermove", 100 + width * 0.02, 100 - height * 0.3);
  expect(f.select).toHaveBeenCalledOnce(); expect(f.commit).not.toHaveBeenCalled();
  pointer(hit, "pointerup", 100 + width * 0.02, 100 - height * 0.3);
  await waitFor(() => expect(f.commit).toHaveBeenCalledOnce());
  const request = f.commit.mock.calls[0]![0] as any;
  expect(request.expectedSnapshotId).toBe("snap"); expect(request.title.version).toBe(2); expect(request.title.layout.x).toBeCloseTo(.10);
  expect(request.title.layout.y).toBeCloseTo(manualTitleLayout(f.title).y - .3);
  expect(request.title.startFrame).toBe(1); expect(request.title.endFrame).toBe(29);
  f.editing.title = request.title; f.editing.snapshotId = "next"; f.rerender(f.view()); f.commit.mockClear();
  const resize = screen.getByRole("button", { name: t("title.resizePreview") });
  pointer(resize, "pointerdown", 400); pointer(resize, "pointermove", 400-width*.084); pointer(resize, "pointerup", 400-width*.084);
  await waitFor(() => expect(f.commit).toHaveBeenCalledOnce());
  expect((f.commit.mock.calls[0]![0] as any).title.layout.width).toBeCloseTo(.756);
  expect((f.commit.mock.calls[0]![0] as any).title.layout.fontScale).toBeCloseTo(.9);
});
it.each(["escape", "cancel", "capture", "blur", "stale", "inactive"] as const)("retires a %s gesture without a History command", reason => {
  const f = fixture(), hit = screen.getByRole("button", { name: t("title.selectPreview") });
  pointer(hit, "pointerdown", 100); pointer(hit, "pointermove", 130, -20);
  if (reason === "escape") fireEvent.keyDown(window, { key: "Escape" });
  if (reason === "cancel") pointer(hit, "pointercancel", 130);
  if (reason === "capture") pointer(hit, "lostpointercapture", 130);
  if (reason === "blur") fireEvent(window, new Event("blur"));
  if (reason === "stale") { f.editing.snapshotId = "changed"; f.rerender(f.view()); }
  if (reason === "inactive") f.rerender(f.view(false));
  pointer(hit, "pointerup", 130, -20); expect(f.commit).not.toHaveBeenCalled();
});
it("edits text with IME/Delete ownership, Escape cancellation, and settles once before a following action", async () => {
  const f = fixture(); const hit = screen.getByRole("button", { name: t("title.selectPreview") });
  fireEvent.doubleClick(hit); let input = screen.getByLabelText(t("title.editPreview")) as HTMLInputElement;
  expect(document.activeElement).toBe(input); fireEvent.change(input, { target: { value: "Nova ação" } });
  fireEvent.compositionStart(input); fireEvent.keyDown(input, { key: "Enter", isComposing: true }); fireEvent.keyDown(input, { key: "Delete" });
  expect(f.commit).not.toHaveBeenCalled(); fireEvent.compositionEnd(input); fireEvent.keyDown(input, { key: "Escape" }); expect(f.commit).not.toHaveBeenCalled();
  fireEvent.doubleClick(screen.getByRole("button", { name: t("title.selectPreview") })); input = screen.getByLabelText(t("title.editPreview"));
  fireEvent.change(input, { target: { value: "Conexão" } }); await act(async () => { await f.draftRef.current!.settle(); });
  expect(f.commit).toHaveBeenCalledOnce(); expect((f.commit.mock.calls[0]![0] as any).title.text).toBe("Conexão");
});
it("blocks following actions on invalid text and clamps gestures to the final picture", async () => {
  const f = fixture(), hit = screen.getByRole("button", { name: t("title.selectPreview") });
  pointer(hit, "pointerdown", 100); pointer(hit, "pointerup", 4000, -4000);
  await waitFor(() => expect(f.commit).toHaveBeenCalledOnce()); const l = (f.commit.mock.calls[0]![0] as any).title.layout;
  expect(l.x).toBeCloseTo(.16); expect(l.y).toBe(0); expect(l.y + manualTitleHeight("16:9", l.fontScale)).toBeLessThanOrEqual(1);
  fireEvent.doubleClick(hit); fireEvent.change(screen.getByLabelText(t("title.editPreview")), { target: { value: "" } });
  await act(async () => { await expect(f.draftRef.current!.settle()).rejects.toEqual({ code: "MANUAL_TITLE_INVALID" }); });
  expect(f.commit).toHaveBeenCalledOnce(); expect(screen.getByRole("alert")).toBeTruthy();
});

it("retains text on window blur and refuses modified/composing Enter; resize cancels immediately", () => {
 const f=fixture();let hit=screen.getByRole("button",{name:t("title.selectPreview")});
 for (const options of [{metaKey:true},{keyCode:229},{isComposing:true}]) {fireEvent.keyDown(hit,{key:"Enter",...options});expect(screen.queryByLabelText(t("title.editPreview"))).toBeNull();}
 fireEvent.doubleClick(hit);const input=screen.getByLabelText(t("title.editPreview")) as HTMLInputElement;fireEvent.change(input,{target:{value:"Preservado"}});
 fireEvent(window,new Event("blur"));expect((screen.getByLabelText(t("title.editPreview")) as HTMLInputElement).value).toBe("Preservado");
 fireEvent.keyDown(input,{key:"Escape"});hit=screen.getByRole("button",{name:t("title.selectPreview")});pointer(hit,"pointerdown",100);pointer(hit,"pointermove",130,-20);
 fireEvent(window,new Event("resize"));pointer(hit,"pointerup",130,-20);expect(f.commit).not.toHaveBeenCalled();
});
