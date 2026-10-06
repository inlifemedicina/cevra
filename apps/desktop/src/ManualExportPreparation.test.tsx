import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { translate, type CevraLocale } from "@cevra/i18n";
import type { ManualExportPreparationRequest } from "@cevra/application";
import type { DesktopBackend } from "./backend/desktop-backend";
import { TauriDesktopBackend } from "./backend/tauri-desktop-backend";
import { ManualExportPreparationPanel } from "./components/ManualExportPreparationPanel";

const summary = (request: ManualExportPreparationRequest) => ({ version: 1 as const, operationId: request.operationId, snapshotId: request.expectedSnapshotId,
  destinationLabel: "new.mp4", durationMs: 7, clipCount: 1, originalCount: 1, originalCopyBytes: 10, estimatedOwnedBytes: 1000,
  status: "prepared" as const, renderAvailable: false as const, blockingReason: "delivery-timing-unresolved" as const });
const cancelled = vi.fn(async (operationId: string) => ({ operationId, cancelled: true }));
function props(backend: DesktopBackend, locale: CevraLocale = "pt-BR") { return { backend, snapshotId: "snapshot", locale, busy: false, t: (key: Parameters<typeof translate>[1]) => translate(locale, key) }; }

it.each(["pt-BR", "en-US"] as const)("%s prepares a native destination and keeps final file generation unavailable", async locale => {
  const prepare = vi.fn(async (request: ManualExportPreparationRequest) => ({ outcome: "prepared" as const, preparation: summary(request) }));
  render(<ManualExportPreparationPanel {...props({ prepareManualExport: prepare, cancelOperation: cancelled } as unknown as DesktopBackend, locale)} />);
  fireEvent.click(screen.getByRole("button", { name: translate(locale, "export.prepareChoose") }));
  await screen.findByText("new.mp4"); expect(screen.getByText(translate(locale, "export.prepareUnavailable"))).toBeTruthy();
  const request = prepare.mock.calls[0][0]; expect(Object.keys(request).sort()).toEqual(["expectedSnapshotId", "locale", "operationId", "version"]);
  expect(request.locale).toBe(locale); expect(request.expectedSnapshotId).toBe("snapshot");
});

it("cancellation ignores late success and blocks replacement until the pending request settles", async () => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const prepare = vi.fn(async (request: ManualExportPreparationRequest) => { await gate; return { outcome: "prepared" as const, preparation: summary(request) }; });
  const cancel = vi.fn(async (operationId: string) => ({ operationId, cancelled: true }));
  render(<ManualExportPreparationPanel {...props({ prepareManualExport: prepare, cancelOperation: cancel } as unknown as DesktopBackend)} />);
  fireEvent.click(screen.getByRole("button", { name: "Preparar destino" })); fireEvent.click(screen.getByRole("button", { name: "Cancelar preparo" }));
  expect(cancel.mock.calls[0][0]).toBe(prepare.mock.calls[0][0].operationId); expect(screen.getByRole("button", { name: "Preparar destino" }).matches(":disabled")).toBe(true);
  await act(async () => release()); await screen.findByText("Preparo cancelado."); expect(screen.queryByText("new.mp4")).toBeNull();
  expect(screen.getByRole("button", { name: "Preparar destino" }).matches(":disabled")).toBe(false);
});

it("snapshot change and intervening mutation discard late preparation and cancel only its operation", async () => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const prepare = vi.fn(async (request: ManualExportPreparationRequest) => { await gate; return { outcome: "prepared" as const, preparation: summary(request) }; });
  const backend = { prepareManualExport: prepare, cancelOperation: cancelled } as unknown as DesktopBackend;
  const view = render(<ManualExportPreparationPanel {...props(backend)} />); fireEvent.click(screen.getByRole("button", { name: "Preparar destino" }));
  view.rerender(<ManualExportPreparationPanel {...props(backend)} snapshotId="next-snapshot" busy />);
  await act(async () => release()); expect(screen.queryByText("new.mp4")).toBeNull();
  expect(screen.getByRole("button", { name: "Preparar destino" }).matches(":disabled")).toBe(true);
});

it("explicit cancellation retains an unsettled warning instead of claiming retirement", async () => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const backend = { cancelOperation: cancelled, async prepareManualExport() { await gate; throw { code: "MANUAL_EXPORT_PREPARATION_SETTLING" }; } } as unknown as DesktopBackend;
  render(<ManualExportPreparationPanel {...props(backend)} />); fireEvent.click(screen.getByRole("button", { name: "Preparar destino" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancelar preparo" })); await act(async () => release());
  await screen.findByText(translate("pt-BR", "export.prepareSettling")); expect(screen.queryByText("Preparo cancelado.")).toBeNull();
});

it("picker cancellation, collision, settling and forged results have distinct visible outcomes", async () => {
  for (const code of ["picker", "MANUAL_EXPORT_DESTINATION_EXISTS", "MANUAL_EXPORT_PREPARATION_SETTLING", "forged"]) {
    const backend = { cancelOperation: cancelled, async prepareManualExport(request: ManualExportPreparationRequest) {
      if (code === "picker") return { outcome: "cancelled" as const };
      if (code === "forged") return { outcome: "prepared" as const, preparation: { ...summary(request), snapshotId: "foreign" } };
      throw { code };
    } } as unknown as DesktopBackend;
    const view = render(<ManualExportPreparationPanel {...props(backend)} />); fireEvent.click(screen.getByRole("button", { name: "Preparar destino" }));
    const text = code === "picker" ? "Preparo cancelado." : code === "MANUAL_EXPORT_DESTINATION_EXISTS" ? translate("pt-BR", "export.prepareExists")
      : code === "MANUAL_EXPORT_PREPARATION_SETTLING" ? translate("pt-BR", "export.prepareSettling") : translate("pt-BR", "export.prepareFailed");
    await screen.findByText(text); expect(screen.queryByText("new.mp4")).toBeNull(); view.unmount();
  }
});

it("an approved job limit differs from filesystem space and an unavailable original", async () => {
  for (const [code, key] of [["MANUAL_EXPORT_DISK_LIMIT", "export.prepareLimit"], ["MANUAL_EXPORT_NO_SPACE", "export.prepareSpace"], ["MANUAL_VIDEO_SOURCE_OFFLINE", "export.prepareSourceOffline"]] as const) {
    const backend = { cancelOperation: cancelled, async prepareManualExport() { throw { code }; } } as unknown as DesktopBackend;
    const view = render(<ManualExportPreparationPanel {...props(backend)} />); fireEvent.click(screen.getByRole("button", { name: "Preparar destino" }));
    await screen.findByText(translate("pt-BR", key)); view.unmount();
  }
});

it("Tauri routes preparation through the closed native command without adding a destination path", async () => {
  const invoke = vi.fn(async (_command: string, args?: Record<string, unknown>) => ({ outcome: "prepared", preparation: summary(args!.args as ManualExportPreparationRequest) }));
  const backend = new TauriDesktopBackend(invoke as never), request: ManualExportPreparationRequest = { version: 1, expectedSnapshotId: "snapshot", operationId: "prepare", locale: "en-US" };
  expect((await backend.prepareManualExport(request)).outcome).toBe("prepared");
  expect(invoke.mock.calls).toEqual([["desktop_prepare_manual_export", { args: request }]]);
});
