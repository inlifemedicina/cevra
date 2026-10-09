import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { translate, type CevraLocale } from "@cevra/i18n";
import { createEmptyProject, ProjectHistory } from "@cevra/project-ir";
import type { ManualExportPreparationRequest } from "@cevra/application";
import type { DesktopBackend, DesktopBackendState } from "./backend/desktop-backend";
import { TauriDesktopBackend } from "./backend/tauri-desktop-backend";
import { ManualExportPreparationPanel } from "./components/ManualExportPreparationPanel";

const history = new ProjectHistory(createEmptyProject({ id: "export-ui-fixture" }));
const available = { available: true, reason: "available" as const };
const unavailable = { available: false, reason: "desktop-runtime-deferred" as const };
const state: DesktopBackendState = { project: history.current, sourceNumbering: history.sourceNumbering, canUndo: false, canRedo: false, status: "local-saved",
  capabilities: { "media.import": unavailable, "transcription.transcribe": unavailable, "director.execute": unavailable, "changes.apply": unavailable, "project.export": available } };
const exported = { outcome: "exported" as const, state, executionId: "execution", exportId: "export", destinationLabel: "new.mp4" };
const cancelled = vi.fn(async (operationId: string) => ({ operationId, cancelled: true }));
function props(backend: DesktopBackend, locale: CevraLocale = "pt-BR") { return { backend, snapshotId: "snapshot", locale, busy: false, available: true, t: (key: Parameters<typeof translate>[1]) => translate(locale, key) }; }

it.each(["pt-BR", "en-US"] as const)("%s exports once through a closed Save workflow and reconciles canonical state", async locale => {
  const exportManualSequence = vi.fn(async (_request: ManualExportPreparationRequest) => exported), onExported = vi.fn();
  render(<ManualExportPreparationPanel {...props({ exportManualSequence, cancelOperation: cancelled } as unknown as DesktopBackend, locale)} onExported={onExported} />);
  fireEvent.click(screen.getByRole("button", { name: translate(locale, "export.choose") }));
  await screen.findByText("new.mp4");
  expect(onExported).toHaveBeenCalledExactlyOnceWith(exported);
  const request = exportManualSequence.mock.calls[0][0];
  expect(Object.keys(request).sort()).toEqual(["expectedSnapshotId", "locale", "operationId", "version"]);
  expect(request.locale).toBe(locale); expect(request.expectedSnapshotId).toBe("snapshot");
});

it("does not advertise an export until the Host capability and real backend are available", () => {
  render(<ManualExportPreparationPanel {...props({ exportManualSequence: vi.fn(), cancelOperation: cancelled } as unknown as DesktopBackend)} available={false} />);
  expect(screen.getByRole("button", { name: translate("pt-BR", "export.choose") }).matches(":disabled")).toBe(true);
  expect(screen.getByText(translate("pt-BR", "export.unavailable"))).toBeTruthy();
});

it("cancellation keeps replacement blocked until retirement and retains a confirmed late publication", async () => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const exportManualSequence = vi.fn(async (_request: ManualExportPreparationRequest) => { await gate; return exported; });
  const cancel = vi.fn(async (operationId: string) => ({ operationId, cancelled: true })), onExported = vi.fn();
  render(<ManualExportPreparationPanel {...props({ exportManualSequence, cancelOperation: cancel } as unknown as DesktopBackend)} onExported={onExported} />);
  fireEvent.click(screen.getByRole("button", { name: translate("pt-BR", "export.choose") }));
  fireEvent.click(screen.getByRole("button", { name: translate("pt-BR", "export.cancel") }));
  expect(screen.getByRole("progressbar").hasAttribute("value")).toBe(false);
  expect(cancel.mock.calls[0][0]).toBe(exportManualSequence.mock.calls[0][0].operationId);
  expect(screen.getByRole("button", { name: translate("pt-BR", "export.choose") }).matches(":disabled")).toBe(true);
  await act(async () => release()); await screen.findByText("new.mp4");
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(onExported).toHaveBeenCalledExactlyOnceWith(exported);
  expect(screen.queryByText(translate("pt-BR", "export.cancelled"))).toBeNull();
  expect(exportManualSequence).toHaveBeenCalledTimes(1);
});

it("snapshot change cancels the old operation and cannot replace the newer canonical state", async () => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const exportManualSequence = vi.fn(async () => { await gate; return exported; }), onExported = vi.fn();
  const backend = { exportManualSequence, cancelOperation: cancelled } as unknown as DesktopBackend;
  const view = render(<ManualExportPreparationPanel {...props(backend)} onExported={onExported} />);
  fireEvent.click(screen.getByRole("button", { name: translate("pt-BR", "export.choose") }));
  view.rerender(<ManualExportPreparationPanel {...props(backend)} snapshotId="next" busy onExported={onExported} />);
  await act(async () => release()); expect(onExported).not.toHaveBeenCalled(); expect(await screen.findByText("new.mp4")).toBeTruthy();
});

it("disposing the project view cannot apply a late export result to a replacement view", async () => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const onExported = vi.fn(), cancel = vi.fn(async (operationId: string) => ({ operationId, cancelled: true }));
  const backend = { exportManualSequence: async () => { await gate; return exported; }, cancelOperation: cancel } as unknown as DesktopBackend;
  const view = render(<ManualExportPreparationPanel {...props(backend)} onExported={onExported} />);
  fireEvent.click(screen.getByRole("button", { name: translate("pt-BR", "export.choose") }));
  view.unmount(); await act(async () => release());
  expect(cancel).toHaveBeenCalledTimes(1); expect(onExported).not.toHaveBeenCalled();
});

it("picker cancellation, settling and failed frame admission have distinct truthful outcomes", async () => {
  for (const [code, key] of [["picker", "export.cancelled"], ["MANUAL_EXPORT_SETTLING", "export.settling"], ["MANUAL_EXPORT_ADMISSION_FAILED", "export.admissionFailed"], ["MANUAL_EXPORT_DISK_LIMIT", "export.diskLimit"], ["MANUAL_EXPORT_MEMORY_LIMIT", "export.memoryLimit"], ["MANUAL_EXPORT_NO_SPACE", "export.prepareSpace"], ["MANUAL_VIDEO_SOURCE_OFFLINE", "export.prepareSourceOffline"], ["MANUAL_EXPORT_RESOURCE_UNAVAILABLE", "export.resourceUnavailable"], ["MANUAL_EXPORT_CLEANUP_FAILED", "export.cleanupFailed"], ["MANUAL_EXPORT_PUBLICATION_UNVERIFIED", "export.publicationUnverified"], ["MANUAL_EXPORT_CONFORM_REQUIRED", "export.gridRequired"], ["MANUAL_EXPORT_SOURCE_UNVERIFIED", "export.sourceUnverified"]] as const) {
    const backend = { cancelOperation: cancelled, async exportManualSequence() { if (code === "picker") return { outcome: "cancelled" as const }; throw { code }; } } as unknown as DesktopBackend;
    const view = render(<ManualExportPreparationPanel {...props(backend)} />);
    fireEvent.click(screen.getByRole("button", { name: translate("pt-BR", "export.choose") }));
    await screen.findByText(translate("pt-BR", key)); expect(screen.queryByText("new.mp4")).toBeNull(); view.unmount();
  }
});

it("a committed checkpoint failure reconciles state without replaying the renderer", async () => {
  const reconciled = { ...state, status: "persistence-error" as const }, onReconciled = vi.fn();
  const exportManualSequence = vi.fn(async () => { throw { code: "PROJECT_PERSISTENCE_FAILED", reconciledState: reconciled }; });
  render(<ManualExportPreparationPanel {...props({ exportManualSequence, cancelOperation: cancelled } as unknown as DesktopBackend)} onReconciled={onReconciled} />);
  fireEvent.click(screen.getByRole("button", { name: translate("pt-BR", "export.choose") }));
  await screen.findByText(translate("pt-BR", "export.checkpointFailed"));
  expect(onReconciled).toHaveBeenCalledExactlyOnceWith(reconciled, "PROJECT_PERSISTENCE_FAILED"); expect(exportManualSequence).toHaveBeenCalledTimes(1);
});

it("Tauri uses closed export and V2 frame/conform routes and maps explicit Host capability", async () => {
  const host = { ...state, status: { hostAvailable: true, persistence: "local-saved" }, capabilities: { mediaImport: unavailable, transcription: unavailable, manualExport: available } };
  const invoke = vi.fn(async (command: string) => command === "desktop_export_manual_sequence" ? { ...exported, state: host }
    : command === "desktop_edit_manual_video_sequence" ? { state: host, changedClipIds: ["clip"] } : host);
  const backend = new TauriDesktopBackend(invoke as never), request: ManualExportPreparationRequest = { version: 1, expectedSnapshotId: "snapshot", operationId: "export", locale: "en-US" };
  expect(await backend.exportManualSequence(request)).toEqual(exported);
  await backend.editManualVideoSequence({ version: 2, expectedSnapshotId: "snapshot", type: "trim", clipId: "clip", sourceStartFrame: 27, sourceEndFrame: 28 });
  await backend.editManualVideoSequence({ version: 2, expectedSnapshotId: "snapshot", type: "conform", clips: [{ clipId: "clip", sourceStartFrame: 27, sourceEndFrame: 28 }] });
  expect(invoke.mock.calls).toEqual([
    ["desktop_export_manual_sequence", { args: request }],
    ["desktop_edit_manual_video_sequence", { args: { version: 2, expectedSnapshotId: "snapshot", action: { type: "trim", clipId: "clip", sourceStartFrame: 27, sourceEndFrame: 28 } } }],
    ["desktop_edit_manual_video_sequence", { args: { version: 2, expectedSnapshotId: "snapshot", action: { type: "conform", clips: [{ clipId: "clip", sourceStartFrame: 27, sourceEndFrame: 28 }] } } }]
  ]);
});

it("a late post-publication memory failure preserves the closed resource reason and destination warning without false success or raw causes", async () => {
  const before = history.toArchive();
  const host = { ...state, status: { hostAvailable: true, persistence: "local-saved" }, capabilities: { mediaImport: unavailable, transcription: unavailable, manualExport: available } };
  for (const locale of ["pt-BR", "en-US"] as const) {
    for (const causeCode of ["MANUAL_EXPORT_MEMORY_LIMIT", "/injected/private/cause"] as const) {
      let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
      const invoke = vi.fn(async (command: string) => {
        if (command === "desktop_cancel_operation") return { operationId: "cancel", cancelled: true };
        await gate;
        throw { code: "MANUAL_EXPORT_PUBLICATION_UNVERIFIED", details: { state: host, causeCode, rawCause: "/injected/private/raw", path: "/injected/private/output.mp4" } };
      });
      const backend = new TauriDesktopBackend(invoke as never), onExported = vi.fn(), onReconciled = vi.fn();
      const exportSequence = backend.exportManualSequence.bind(backend);
      let normalized: unknown;
      backend.exportManualSequence = async request => {
        try { return await exportSequence(request); } catch (cause) { normalized = cause; throw cause; }
      };
      const view = render(<ManualExportPreparationPanel {...props(backend, locale)} onExported={onExported} onReconciled={onReconciled} />);
      fireEvent.click(screen.getByRole("button", { name: translate(locale, "export.choose") }));
      fireEvent.click(screen.getByRole("button", { name: translate(locale, "export.cancel") }));
      await act(async () => release());
      const status = screen.getByRole("status");
      expect(status.textContent).toContain(translate(locale, "export.publicationUnverified"));
      if (causeCode === "MANUAL_EXPORT_MEMORY_LIMIT") {
        expect(status.textContent).toContain(translate(locale, "export.memoryLimit"));
        expect(normalized).toEqual({ code: "MANUAL_EXPORT_PUBLICATION_UNVERIFIED", causeCode, reconciledState: state });
      } else {
        expect(status.textContent).not.toContain(translate(locale, "export.memoryLimit"));
        expect(normalized).toEqual({ code: "MANUAL_EXPORT_PUBLICATION_UNVERIFIED", reconciledState: state });
      }
      expect(status.textContent).not.toContain("/injected/");
      expect(screen.queryByText(translate(locale, "export.cancelled"))).toBeNull();
      expect(screen.queryByText(translate(locale, "export.complete"), { exact: false })).toBeNull();
      expect(onExported).not.toHaveBeenCalled();
      expect(onReconciled).toHaveBeenCalledExactlyOnceWith(state, "MANUAL_EXPORT_PUBLICATION_UNVERIFIED");
      expect(invoke.mock.calls.filter(([command]) => command === "desktop_export_manual_sequence")).toHaveLength(1);
      expect(history.toArchive()).toEqual(before); expect(state.project.exports).toHaveLength(0);
      view.unmount();
    }
  }
});
