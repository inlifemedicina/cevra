import type { CevraLocale, TranslationKey } from "@cevra/i18n";
import { translate } from "@cevra/i18n";
import type { ProjectIR } from "@cevra/project-ir";
import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { DesktopBackend, DesktopBackendState, DesktopOperationError } from "./backend/desktop-backend";
import { DemoDesktopBackend } from "./backend/demo-desktop-backend";
import { DirectorPanel } from "./components/DirectorPanel";
import { Inspector } from "./components/Inspector";
import { MediaPanel } from "./components/MediaPanel";
import { Timeline } from "./components/Timeline";
import { ToolRail } from "./components/ToolRail";
import { TopBar } from "./components/TopBar";
import { WorkspaceStage } from "./components/WorkspaceStage";
import { capabilityReasonKey, workspaceKeys, type Workspace } from "./ui-model";

const defaultBackend = new DemoDesktopBackend();

export function App({ backend = defaultBackend }: { backend?: DesktopBackend }) {
  const [project, setProject] = useState<Readonly<ProjectIR> | null>(null);
  const [backendState, setBackendState] = useState<DesktopBackendState | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [runtimeNotice, setRuntimeNotice] = useState<TranslationKey | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [transcriptionOperationId, setTranscriptionOperationId] = useState<string | null>(null);
  const [locale, setLocale] = useState<CevraLocale>("pt-BR");
  const [workspace, setWorkspace] = useState<Workspace>("edit");
  const [selectedProjectItemId, setSelectedProjectItemId] = useState<string | null>(null);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [playheadMs, setPlayheadMs] = useState(24300);
  const [playing, setPlaying] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(100);
  const [timelineHeight, setTimelineHeight] = useState(292);
  const [directorDraft, setDirectorDraft] = useState("");
  const [preset, setPreset] = useState("medical-consultation-clean");
  const [reviewing, setReviewing] = useState(false);
  const [activeTool, setActiveTool] = useState("media");
  const [mediaOpen, setMediaOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const t = useMemo(() => (key: TranslationKey, parameters: Readonly<Record<string, string | number>> = {}) => translate(locale, key, parameters), [locale]);

  useEffect(() => {
    let current = true;
    void backend.loadState().then((value) => {
      if (!current) return;
      const initialSourceId = resolveInitialSourceId(value.project);
      setBackendState(value);
      setProject(value.project);
      setSelectedProjectItemId(initialSourceId);
      setActiveSourceId(initialSourceId);
      setPlayheadMs(Math.min(24300, value.project.timeline.durationMs));
    }).catch((cause: unknown) => {
      if (!current) return;
      handleRuntimeError(cause);
    });
    return () => { current = false; };
  }, [backend]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (!playing || !project) return;
    const interval = window.setInterval(() => {
      setPlayheadMs((value) => value >= project.timeline.durationMs ? 0 : Math.min(project.timeline.durationMs, value + 100));
    }, 100);
    return () => window.clearInterval(interval);
  }, [playing, project]);

  function startTimelineResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const startY = event.clientY;
    const startHeight = timelineHeight;
    function move(pointerEvent: PointerEvent) {
      setTimelineHeight(Math.min(420, Math.max(220, startHeight + startY - pointerEvent.clientY)));
    }
    function stop() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function selectProjectItem(id: string) {
    if (!project) return;
    const source = project.sources.find((item) => item.id === id);
    if (source) {
      setSelectedProjectItemId(source.id);
      setActiveSourceId(source.id);
      return;
    }
    const clip = project.timeline.clips.find((item) => item.id === id);
    if (clip) {
      setSelectedProjectItemId(clip.id);
      setActiveSourceId(clip.sourceId);
      return;
    }
    if (project.captions.some((item) => item.id === id) || project.graphics.some((item) => item.id === id)) {
      setSelectedProjectItemId(id);
    }
  }

  function applyBackendState(value: DesktopBackendState, preferredSourceId?: string) {
    setBackendState(value);
    setProject(value.project);
    setRuntimeError(null);
    setPlayheadMs((current) => Math.min(current, value.project.timeline.durationMs));
    const selectedStillExists = selectedProjectItemId !== null && resolvesProjectItem(value.project, selectedProjectItemId);
    const sourceStillExists = activeSourceId !== null && value.project.sources.some((source) => source.id === activeSourceId);
    const nextSourceId = preferredSourceId ?? (sourceStillExists ? activeSourceId : resolveInitialSourceId(value.project));
    setActiveSourceId(nextSourceId);
    setSelectedProjectItemId(preferredSourceId ?? (selectedStillExists ? selectedProjectItemId : nextSourceId));
  }

  async function importMedia() {
    if (importBusy || transcriptionOperationId) return;
    setImportBusy(true);
    setRuntimeError(null);
    setRuntimeNotice(null);
    try {
      const result = await backend.pickAndImportMedia(locale);
      if (result.outcome === "imported") applyBackendState(result.state, result.importedSourceId);
      else setRuntimeNotice("media.pickerCancelled");
    } catch (cause) {
      handleRuntimeError(cause);
    } finally {
      setImportBusy(false);
    }
  }

  async function changeHistory(direction: "undo" | "redo") {
    if (importBusy || transcriptionOperationId) return;
    setRuntimeNotice(null);
    try {
      applyBackendState(await backend[direction]());
    } catch (cause) {
      handleRuntimeError(cause);
    }
  }

  async function transcribeSource() {
    if (!activeSourceId || transcriptionOperationId || importBusy) return;
    const operationId = typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `transcription-${Date.now()}`;
    setTranscriptionOperationId(operationId);
    setRuntimeError(null);
    setRuntimeNotice(null);
    try {
      applyBackendState(await backend.transcribeSource(activeSourceId, operationId, locale), activeSourceId);
    } catch (cause) {
      handleRuntimeError(cause);
    } finally {
      setTranscriptionOperationId(null);
    }
  }

  async function cancelTranscription() {
    if (!transcriptionOperationId) return;
    try {
      const result = await backend.cancelOperation(transcriptionOperationId);
      setRuntimeError(null);
      setRuntimeNotice(result.cancelled ? "runtime.cancellationRequested" : "runtime.operationAlreadyFinished");
    } catch (cause) {
      handleRuntimeError(cause);
    }
  }

  function handleRuntimeError(cause: unknown) {
    const operationError = desktopOperationError(cause);
    const code = operationError.code;
    if (operationError.reconciledState) applyBackendState(operationError.reconciledState);
    if (code === "HOST_RECOVERED") {
      setRuntimeError(null);
      setRuntimeNotice("runtime.sessionRecovered");
      return;
    }
    if (isCancellationCode(code)) {
      setRuntimeError(null);
      setRuntimeNotice("runtime.operationCancelled");
      return;
    }
    setRuntimeNotice(null);
    setRuntimeError(code);
    if (!isTerminalHostCode(code)) return;
    setBackendState((current) => current ? {
      ...current,
      canUndo: false,
      canRedo: false,
      status: "host-unavailable",
      capabilities: Object.fromEntries(Object.keys(current.capabilities).map((key) => [key, { available: false, reason: "host-unavailable" }])) as DesktopBackendState["capabilities"]
    } : current);
  }

  if (!project || !backendState) return <main className="loading-screen"><span className="brand-mark">C</span><p>{runtimeError ? t(runtimeErrorKey(runtimeError)) : t("app.loadingProject")}</p></main>;

  const layoutStyle = { "--timeline-height": `${timelineHeight}px` } as CSSProperties;
  const mutationBusy = importBusy || transcriptionOperationId !== null;
  return (
    <main className={`app-shell workspace-${workspace}${mediaOpen ? " media-open" : " media-closed"}${inspectorOpen ? " inspector-open" : " inspector-closed"}`} style={layoutStyle} data-testid="app-shell" data-project-revision={project.history.revision} data-selected-project-item-id={selectedProjectItemId ?? undefined} data-active-source-id={activeSourceId ?? undefined}>
      <TopBar projectName={project.project.name} workspace={workspace} locale={locale} mediaOpen={mediaOpen} inspectorOpen={inspectorOpen} exportAvailable={backendState.capabilities["project.export"].available} status={backendState.status} canUndo={backendState.canUndo && !mutationBusy} canRedo={backendState.canRedo && !mutationBusy} t={t} onWorkspaceChange={setWorkspace} onLocaleChange={setLocale} onMediaToggle={() => setMediaOpen((value) => !value)} onInspectorToggle={() => setInspectorOpen((value) => !value)} onUndo={() => void changeHistory("undo")} onRedo={() => void changeHistory("redo")} />
      <div className="editor-area">
        <ToolRail selected={activeTool} t={t} onSelect={setActiveTool} />
        {mediaOpen && <MediaPanel sources={project.sources} selectedId={selectedProjectItemId} workspace={workspace} importAvailable={backendState.capabilities["media.import"].available && !transcriptionOperationId} importReason={backendState.capabilities["media.import"].reason} importBusy={importBusy} t={t} onSelect={selectProjectItem} onImport={() => void importMedia()} />}
        <div className="center-stack">
          <div className="workspace-stage" role="tabpanel" aria-label={t(workspaceKeys[workspace])}>
            <WorkspaceStage workspace={workspace} project={project} selectedProjectItemId={selectedProjectItemId} activeSourceId={activeSourceId} playheadMs={playheadMs} playing={playing} previewInteractive={backend.presentationOnly} transcriptionCapability={backendState.capabilities["transcription.transcribe"]} transcriptionBlocked={importBusy} transcriptionOperationId={transcriptionOperationId} t={t} onProjectSelect={selectProjectItem} onPlayingChange={setPlaying} onTranscribe={() => void transcribeSource()} onCancelTranscription={() => void cancelTranscription()} />
          </div>
          {runtimeError && <div className="runtime-alert" role="alert">{t(runtimeErrorKey(runtimeError))}</div>}
          {runtimeNotice && <div className="runtime-notice" role="status">{t(runtimeNotice)}</div>}
          {workspace === "edit" && <DirectorPanel draft={directorDraft} preset={preset} reviewing={reviewing} directorAvailable={backendState.capabilities["director.execute"].available} applyAvailable={backendState.capabilities["changes.apply"].available} t={t} onDraftChange={setDirectorDraft} onPresetChange={setPreset} onReviewToggle={() => setReviewing((value) => !value)} />}
        </div>
        {inspectorOpen && <Inspector project={project} selectedProjectItemId={selectedProjectItemId} workspace={workspace} t={t} />}
      </div>
      <Timeline project={project} selectedId={selectedProjectItemId} playheadMs={playheadMs} zoom={timelineZoom} t={t} onSelect={selectProjectItem} onPlayheadChange={setPlayheadMs} onZoomChange={setTimelineZoom} onResizeStart={startTimelineResize} />
    </main>
  );
}

function resolveInitialSourceId(project: Readonly<ProjectIR>): string | null {
  const mainTrack = project.timeline.tracks.find((track) => track.kind === "video");
  const mainClip = mainTrack ? project.timeline.clips.find((clip) => clip.trackId === mainTrack.id) : undefined;
  if (mainClip && project.sources.some((source) => source.id === mainClip.sourceId)) return mainClip.sourceId;
  return project.sources.find((source) => source.kind === "video" || source.kind === "audio")?.id ?? null;
}

function resolvesProjectItem(project: Readonly<ProjectIR>, id: string): boolean {
  return project.sources.some((item) => item.id === id)
    || project.timeline.clips.some((item) => item.id === id)
    || project.captions.some((item) => item.id === id)
    || project.graphics.some((item) => item.id === id);
}

function desktopOperationError(cause: unknown): DesktopOperationError {
  if (typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string") return cause as DesktopOperationError;
  return { code: "HOST_OPERATION_FAILED" };
}

function isCancellationCode(code: string): boolean {
  return new Set([
    "OPERATION_CANCELLED",
    "MEDIA_OPERATION_CANCELLED",
    "TRANSCRIPTION_APP_CANCELLED",
    "TRANSCRIPTION_CANCELLED"
  ]).has(code);
}

function isTerminalHostCode(code: string): boolean {
  return new Set([
    "HOST_UNAVAILABLE",
    "HOST_START_FAILED",
    "HOST_PROTOCOL_MISMATCH",
    "HOST_MALFORMED_RESPONSE",
    "HOST_MESSAGE_TOO_LARGE",
    "HOST_SUPERVISOR_FAILED",
    "PROJECT_PERSISTENCE_CORRUPT",
    "PROJECT_PERSISTENCE_UNAVAILABLE"
  ]).has(code);
}

function runtimeErrorKey(code: string): TranslationKey {
  if (code === "OPERATION_TIMEOUT" || code === "HOST_TIMEOUT") return "runtime.operationTimedOut";
  if (code === "PROJECT_PERSISTENCE_FAILED") return "runtime.persistenceError";
  if (code === "PROJECT_PERSISTENCE_CORRUPT") return "runtime.persistenceCorrupt";
  if (code === "PROJECT_PERSISTENCE_UNAVAILABLE") return "runtime.persistenceUnavailable";
  if (code === "TRANSCRIPTION_APP_PROJECT_CONFLICT") return "runtime.transcriptionProjectConflict";
  if (code === "LOCAL_SOURCE_PROJECT_CONFLICT" || code === "MEDIA_PROJECT_CONFLICT") return "runtime.importProjectConflict";
  if (code.includes("MEDIA") || code.includes("INGEST")) return "runtime.mediaError";
  if (code.includes("TRANSCRIPTION")) return "runtime.transcriptionError";
  if (code.includes("HOST")) return "runtime.hostUnavailable";
  return "runtime.operationError";
}
