import { useEffect, useRef, useState } from "react";
import type { CevraLocale } from "@cevra/i18n";
import type { DesktopBackend, DesktopBackendState, ManualSequenceExportResult } from "../backend/desktop-backend";
import { isManualExportResourceCauseCode, type ManualExportResourceCauseCode } from "../backend/desktop-backend";
import type { Translate } from "../ui-model";

type Exported = Extract<ManualSequenceExportResult, { outcome: "exported" }>;
type Status = "idle" | "exporting" | "cancelling" | "cancelled" | "exported" | "error";

/** A closed native Save picker and one Host operation own publication/history. */
export function ManualExportPreparationPanel({ backend, snapshotId, locale, busy, available = false, exportRequest = 0, t, onBusyChange, onExported, onReconciled }: {
  backend: DesktopBackend; snapshotId: string; locale: CevraLocale; busy: boolean; available?: boolean; t: Translate;
  exportRequest?: number;
  onBusyChange?(value: boolean): void; onExported?(result: Exported): void; onReconciled?(state: DesktopBackendState, code: string): void;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [destination, setDestination] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [resourceCause, setResourceCause] = useState<ManualExportResourceCauseCode | null>(null);
  const [pending, setPending] = useState(false);
  const alive = useRef(true);
  const active = useRef<string | null>(null);
  const current = useRef({ busy, snapshotId });
  const observedRequest = useRef(exportRequest);
  current.current = { busy, snapshotId };
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (observedRequest.current === exportRequest) return;
    observedRequest.current = exportRequest;
    void exportSequence();
  }, [exportRequest]);
  useEffect(() => () => {
    if (active.current) void backend.cancelOperation(active.current).catch(() => undefined);
  }, [backend, snapshotId]);
  useEffect(() => {
    if (busy && active.current) {
      setStatus("cancelling");
      void backend.cancelOperation(active.current).catch(() => undefined);
    }
  }, [backend, busy]);

  async function exportSequence() {
    if (busy || active.current || !available || !backend.exportManualSequence) return;
    const operationId = `manual-export-${crypto.randomUUID()}`;
    active.current = operationId;
    setPending(true); onBusyChange?.(true); setStatus("exporting"); setDestination(""); setErrorCode(""); setResourceCause(null);
    try {
      const result = await backend.exportManualSequence({ version: 1, expectedSnapshotId: snapshotId, operationId, locale });
      if (!alive.current) return;
      if (result.outcome === "cancelled") { setStatus("cancelled"); return; }
      if (typeof result.executionId !== "string" || !result.executionId || typeof result.exportId !== "string" || !result.exportId
        || typeof result.destinationLabel !== "string" || !result.destinationLabel || result.destinationLabel.length > 255 || !result.state?.project) throw { code: "MANUAL_EXPORT_INVALID_RESULT" };
      // Confirmed publication stays canonical even if Cancel crossed its reply.
      // Never replay the renderer or hide a journaled export as cancelled.
      setDestination(result.destinationLabel); setStatus("exported");
      if (current.current.snapshotId === snapshotId) onExported?.(result);
    } catch (cause) {
      const error = cause as { code?: unknown; causeCode?: unknown; reconciledState?: DesktopBackendState } | null;
      const code = error && typeof error.code === "string" ? error.code : "HOST_OPERATION_FAILED";
      if (!alive.current) return;
      if (error?.reconciledState && current.current.snapshotId === snapshotId) onReconciled?.(error.reconciledState, code);
      if (code === "OPERATION_CANCELLED") setStatus("cancelled");
      else {
        setResourceCause((code === "MANUAL_EXPORT_PUBLICATION_UNVERIFIED" || code === "MANUAL_EXPORT_CLEANUP_FAILED") && isManualExportResourceCauseCode(error?.causeCode) ? error.causeCode : null);
        setErrorCode(code); setStatus("error");
      }
    } finally {
      if (active.current === operationId) active.current = null;
      if (alive.current) setPending(false);
      onBusyChange?.(false);
    }
  }
  function cancel() {
    if (!active.current || status === "cancelling") return;
    setStatus("cancelling");
    void backend.cancelOperation(active.current).catch(() => undefined);
  }
  const message = errorCode === "MANUAL_EXPORT_DESTINATION_EXISTS" ? "export.prepareExists"
    : errorCode === "MANUAL_EXPORT_DISK_LIMIT" ? "export.diskLimit"
    : errorCode === "MANUAL_EXPORT_MEMORY_LIMIT" ? "export.memoryLimit"
    : errorCode === "MANUAL_EXPORT_NO_SPACE" ? "export.prepareSpace"
    : errorCode === "MANUAL_VIDEO_SOURCE_OFFLINE" ? "export.prepareSourceOffline"
    : errorCode.includes("STALE") || errorCode === "MANUAL_VIDEO_SOURCE_CHANGED" ? "export.prepareChanged"
    : errorCode === "MANUAL_EXPORT_PREPARATION_SETTLING" || errorCode === "MANUAL_EXPORT_SETTLING" ? "export.settling"
    : errorCode === "PROJECT_CHECKPOINT_PENDING" || errorCode === "PROJECT_PERSISTENCE_FAILED" ? "export.checkpointFailed"
    : errorCode === "MANUAL_EXPORT_COMMITTED_ERROR" ? "export.committedError"
    : errorCode === "MANUAL_EXPORT_PUBLICATION_UNVERIFIED" ? "export.publicationUnverified"
    : errorCode === "MANUAL_EXPORT_CLEANUP_FAILED" ? "export.cleanupFailed"
    : errorCode === "MANUAL_EXPORT_RESOURCE_UNAVAILABLE" ? "export.resourceUnavailable"
    : errorCode === "MANUAL_EXPORT_SOURCE_UNVERIFIED" ? "export.sourceUnverified"
    : errorCode === "MANUAL_EXPORT_FRAME_GRID_REQUIRED" || errorCode === "MANUAL_EXPORT_CONFORM_REQUIRED" ? "export.gridRequired"
    : errorCode === "MANUAL_EXPORT_ADMISSION_FAILED" || errorCode === "MANUAL_EXPORT_CLOCK_INVALID" ? "export.admissionFailed" : "export.failed";
  const resourceMessage = resourceCause === "MANUAL_EXPORT_MEMORY_LIMIT" ? "export.memoryLimit" : resourceCause === "MANUAL_EXPORT_DISK_LIMIT" ? "export.diskLimit" : "export.resourceUnavailable";
  return <section className="manual-export-preparation" aria-label={t("export.title")}>
    <h3>{t("export.title")}</h3>
    <p>{t(available && backend.exportManualSequence ? "export.profile" : "export.unavailable")}</p>
    <button type="button" disabled={busy || pending || !available || !backend.exportManualSequence} onClick={() => void exportSequence()}>{t("export.choose")}</button>
    {pending && <button type="button" disabled={status === "cancelling"} onClick={cancel}>{t("export.cancel")}</button>}
    {(status === "exporting" || status === "cancelling") && <progress aria-label={t("export.running")} />}
    <div role="status" aria-live="polite">
      {status === "exporting" && t("export.running")}
      {status === "cancelling" && t("export.prepareCancelling")}
      {status === "cancelled" && t("export.cancelled")}
      {status === "exported" && <>{t("export.complete")} <strong>{destination}</strong></>}
      {status === "error" && <>{resourceCause && <>{t(resourceMessage)}{" "}</>}{t(message)}</>}
    </div>
  </section>;
}
