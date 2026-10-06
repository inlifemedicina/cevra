import { useEffect, useRef, useState } from "react";
import type { ManualExportPreparation } from "@cevra/application";
import type { CevraLocale } from "@cevra/i18n";
import type { DesktopBackend } from "../backend/desktop-backend";
import type { Translate } from "../ui-model";

let operationSequence = 0;
type Status = "idle" | "preparing" | "cancelling" | "cancelled" | "prepared" | "error";

export function ManualExportPreparationPanel({ backend, snapshotId, locale, busy, t }: {
  backend: DesktopBackend; snapshotId: string; locale: CevraLocale; busy: boolean; t: Translate;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [preparation, setPreparation] = useState<ManualExportPreparation | null>(null);
  const [errorCode, setErrorCode] = useState("");
  const [pending, setPending] = useState(false);
  const generation = useRef(0);
  const active = useRef<string | null>(null);
  const inFlight = useRef(false);
  const explicitCancellation = useRef<string | null>(null);
  const current = useRef({ busy, snapshotId });
  current.current = { busy, snapshotId };

  useEffect(() => () => {
    ++generation.current;
    explicitCancellation.current = null;
    if (active.current) void backend.cancelOperation(active.current).catch(() => undefined);
  }, [backend, snapshotId]);
  useEffect(() => {
    if (!busy) return;
    ++generation.current;
    explicitCancellation.current = null;
    if (active.current) void backend.cancelOperation(active.current).catch(() => undefined);
    setPreparation(null); setStatus("idle");
  }, [backend, busy]);

  const prepare = async () => {
    if (busy || inFlight.current || !backend.prepareManualExport) return;
    const epoch = ++generation.current;
    const operationId = `manual-export-${Date.now()}-${++operationSequence}`;
    inFlight.current = true; active.current = operationId;
    explicitCancellation.current = null;
    setPending(true); setStatus("preparing"); setPreparation(null); setErrorCode("");
    try {
      const result = await backend.prepareManualExport({ version: 1, expectedSnapshotId: snapshotId, operationId, locale });
      if (epoch !== generation.current || current.current.busy || current.current.snapshotId !== snapshotId) return;
      if (result.outcome === "cancelled") { setStatus("cancelled"); return; }
      const value = result.preparation;
      if (value.operationId !== operationId || value.snapshotId !== snapshotId || value.version !== 1
        || value.renderAvailable !== false || value.status !== "prepared" || value.blockingReason !== "delivery-timing-unresolved"
        || typeof value.destinationLabel !== "string" || !value.destinationLabel || value.destinationLabel.length > 255) throw { code: "MANUAL_EXPORT_INVALID_RESULT" };
      setPreparation(value); setStatus("prepared");
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "HOST_OPERATION_FAILED";
      if (epoch !== generation.current || current.current.busy || current.current.snapshotId !== snapshotId) {
        if (explicitCancellation.current === operationId && !current.current.busy && current.current.snapshotId === snapshotId && code === "MANUAL_EXPORT_PREPARATION_SETTLING") { setErrorCode(code); setStatus("error"); }
        return;
      }
      if (code === "OPERATION_CANCELLED") setStatus("cancelled");
      else { setErrorCode(code); setStatus("error"); }
    } finally {
      if (active.current === operationId) active.current = null;
      inFlight.current = false; setPending(false);
      if (epoch !== generation.current) setStatus(previous => previous === "cancelling" ? "cancelled" : previous);
    }
  };
  const cancel = () => {
    if (!active.current || status === "cancelling") return;
    ++generation.current; setPreparation(null); setStatus("cancelling");
    explicitCancellation.current = active.current;
    void backend.cancelOperation(active.current).catch(() => undefined);
  };
  const message = errorCode === "MANUAL_EXPORT_DESTINATION_EXISTS" ? "export.prepareExists"
    : errorCode === "MANUAL_EXPORT_DISK_LIMIT" ? "export.prepareLimit"
    : errorCode === "MANUAL_EXPORT_NO_SPACE" ? "export.prepareSpace"
    : errorCode === "MANUAL_VIDEO_SOURCE_OFFLINE" ? "export.prepareSourceOffline"
    : errorCode.includes("STALE") || errorCode === "MANUAL_VIDEO_SOURCE_CHANGED" ? "export.prepareChanged"
    : errorCode === "MANUAL_EXPORT_PREPARATION_SETTLING" ? "export.prepareSettling" : "export.prepareFailed";

  return <section className="manual-export-preparation" aria-label={t("export.prepareTitle")}>
    <h3>{t("export.prepareTitle")}</h3>
    <p>{t("export.prepareUnavailable")}</p>
    <button type="button" disabled={busy || pending} onClick={() => void prepare()}>{t("export.prepareChoose")}</button>
    {pending && <button type="button" disabled={status === "cancelling"} onClick={cancel}>{t("export.prepareCancel")}</button>}
    <div role="status" aria-live="polite">
      {status === "preparing" && t("export.preparing")}
      {status === "cancelling" && t("export.prepareCancelling")}
      {status === "cancelled" && t("export.prepareCancelled")}
      {status === "prepared" && preparation && <>{t("export.prepareReady")} <strong>{preparation.destinationLabel}</strong></>}
      {status === "error" && t(message)}
    </div>
  </section>;
}
