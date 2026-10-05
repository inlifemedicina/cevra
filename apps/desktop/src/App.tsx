import type { EditorialDraftState, ReviseEditorialDraftRequest, CreateManualVideoClipRequest, TrimManualVideoClipRequest } from "@cevra/application";
import type { CevraLocale, TranslationKey } from "@cevra/i18n";
import { translate } from "@cevra/i18n";
import type { ProjectIR } from "@cevra/project-ir";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { DesktopBackend, DesktopBackendState, DesktopOperationError } from "./backend/desktop-backend";
import { DemoDesktopBackend } from "./backend/demo-desktop-backend";
import { EditorialDraftPanel } from "./components/EditorialDraftPanel";
import { DirectorPanel } from "./components/DirectorPanel";
import { EditingSidebar } from "./components/EditingSidebar";
import { Inspector } from "./components/Inspector";
import { MediaPanel } from "./components/MediaPanel";
import { Timeline } from "./components/Timeline";
import { ToolRail } from "./components/ToolRail";
import { TopBar } from "./components/TopBar";
import { WorkspaceStage } from "./components/WorkspaceStage";
import { ManualVideoPreview, supportsManualClipPreview } from "./components/ManualVideoPreview";
import { capabilityReasonKey, workspaceKeys, type Workspace } from "./ui-model";

import { presentSources } from "./source-presentation";

const defaultBackend = new DemoDesktopBackend();

export function App({ backend = defaultBackend }: { backend?: DesktopBackend }) {
  const [editorialState, setEditorialState] = useState<EditorialDraftState | null>(null);
  const [editorialBusy, setEditorialBusy] = useState(false);
  const [editorialError, setEditorialError] = useState(false);
  const editorialGeneration = useRef(0);
  const [project, setProject] = useState<Readonly<ProjectIR> | null>(null);
  const [backendState, setBackendState] = useState<DesktopBackendState | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [runtimeNotice, setRuntimeNotice] = useState<TranslationKey | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [manualMutationBusy, setManualMutationBusy] = useState(false);
  const manualMutationInFlight = useRef(false);
  const selectionEpoch = useRef(0);
  const latestSelection = useRef<{ selectedId: string | null; sourceId: string | null }>({ selectedId: null, sourceId: null });
  const [previewSeek, setPreviewSeek] = useState({ sequence: 0, timelineMs: 0 });
  const [transcriptionOperationId, setTranscriptionOperationId] = useState<string | null>(null);
  const [locale, setLocale] = useState<CevraLocale>("pt-BR");
  const [workspace, setWorkspace] = useState<Workspace>("edit");
  const [selectedProjectItemId, setSelectedProjectItemId] = useState<string | null>(null);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  latestSelection.current = { selectedId: selectedProjectItemId, sourceId: activeSourceId };
  const [playheadMs, setPlayheadMs] = useState(24300);
  const [playing, setPlaying] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(100);
  const [timelineHeight, setTimelineHeight] = useState(292);
  const [directorDraft, setDirectorDraft] = useState("");
  const [preset, setPreset] = useState("medical-consultation-clean");
  const [activeTool, setActiveTool] = useState("media");
  const [mediaOpen, setMediaOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const t = useMemo(() => (key: TranslationKey, parameters: Readonly<Record<string, string | number>> = {}) => translate(locale, key, parameters), [locale]);

  const sourcePresentations = useMemo(() => project && backendState ? presentSources(project.sources, backendState.sourceNumbering, t) : new Map(), [project, backendState, t]);

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
    if (!backend.presentationOnly || !playing || !project) return;
    const interval = window.setInterval(() => {
      setPlayheadMs((value) => value >= project.timeline.durationMs ? 0 : Math.min(project.timeline.durationMs, value + 100));
    }, 100);
    return () => window.clearInterval(interval);
  }, [backend.presentationOnly, playing, project]);

  useEffect(() => {
    if (!project) return;
    void refreshEditorial();
    return () => { editorialGeneration.current++; };
  }, [backend, project, backendState?.status]);

  async function refreshEditorial() {
    const generation = ++editorialGeneration.current;
    setEditorialBusy(true);
    setEditorialError(false);
    try {
      const state = await backend.loadEditorialDraft();
      if (generation === editorialGeneration.current) setEditorialState(state);
    } catch {
      if (generation === editorialGeneration.current) { setEditorialState({ status: "empty" }); setEditorialError(true); }
    } finally {
      if (generation === editorialGeneration.current) setEditorialBusy(false);
    }
  }

  async function reviseEditorial(request: ReviseEditorialDraftRequest) {
    if (editorialBusy || importBusy || transcriptionOperationId || manualMutationInFlight.current) return;
    const generation = ++editorialGeneration.current;
    setEditorialBusy(true);
    setEditorialError(false);
    try {
      const state = await backend.reviseEditorialDraft(request);
      if (generation === editorialGeneration.current) setEditorialState(state);
    } catch {
      if (generation === editorialGeneration.current) { setEditorialState({ status: "stale" }); setEditorialError(true); }
    } finally {
      if (generation === editorialGeneration.current) setEditorialBusy(false);
    }
  }

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
    if (!project || !resolvesProjectItem(project, id)) return;
    selectionEpoch.current++;
    const source = project.sources.find((item) => item.id === id);
    if (source) {
      setSelectedProjectItemId(source.id);
      setActiveSourceId(source.id);
      setPreviewSeek({ sequence: 0, timelineMs: 0 });
      return;
    }
    const clip = project.timeline.clips.find((item) => item.id === id);
    if (clip) {
      setSelectedProjectItemId(clip.id);
      setActiveSourceId(clip.sourceId);
      setPreviewSeek((current) => ({ sequence: current.sequence + 1, timelineMs: clip.timelineStartMs }));
      return;
    }
    if (project.captions.some((item) => item.id === id) || project.graphics.some((item) => item.id === id)) {
      setSelectedProjectItemId(id);
    }
  }

  function applyBackendState(value: DesktopBackendState, preferredSourceId?: string, preserveSelection = false) {
    setBackendState(value);
    setProject(value.project);
    setRuntimeError(null);
    setPlayheadMs((current) => Math.min(current, value.project.timeline.durationMs));
    const selection = preserveSelection ? latestSelection.current : { selectedId: selectedProjectItemId, sourceId: activeSourceId };
    const selectedStillExists = selection.selectedId !== null && resolvesProjectItem(value.project, selection.selectedId);
    const sourceStillExists = selection.sourceId !== null && value.project.sources.some((source) => source.id === selection.sourceId);
    const nextSourceId = preferredSourceId ?? (sourceStillExists ? selection.sourceId : resolveInitialSourceId(value.project));
    setActiveSourceId(nextSourceId);
    setSelectedProjectItemId(preferredSourceId ?? (selectedStillExists ? selection.selectedId : nextSourceId));
  }

  async function importMedia() {
    if (importBusy || transcriptionOperationId || editorialBusy || manualMutationInFlight.current) return;
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
    if (importBusy || transcriptionOperationId || editorialBusy || manualMutationInFlight.current) return;
    manualMutationInFlight.current = true;
    setManualMutationBusy(true);
    setRuntimeNotice(null);
    try {
      applyBackendState(await backend[direction]());
    } catch (cause) {
      handleRuntimeError(cause);
    } finally {
      manualMutationInFlight.current = false;
      setManualMutationBusy(false);
    }
  }

  async function createManualClip(request: CreateManualVideoClipRequest) {
    if (importBusy || transcriptionOperationId || editorialBusy || manualMutationInFlight.current) return;
    manualMutationInFlight.current = true;
    setManualMutationBusy(true);
    setRuntimeError(null); setRuntimeNotice(null);
    try {
      const result = await backend.createManualVideoClip(request);
      applyBackendState(result.state, request.sourceId);
      setSelectedProjectItemId(result.clipId);
      setPlayheadMs(0);
      setPreviewSeek({ sequence: 0, timelineMs: 0 });
    } catch (cause) {
      handleRuntimeError(cause);
      throw cause;
    } finally {
      manualMutationInFlight.current = false;
      setManualMutationBusy(false);
    }
  }

  async function trimManualClip(request: TrimManualVideoClipRequest) {
    if (importBusy || transcriptionOperationId || editorialBusy || manualMutationInFlight.current) return;
    manualMutationInFlight.current = true;
    setManualMutationBusy(true);
    setRuntimeError(null); setRuntimeNotice(null);
    const startedSelection = selectionEpoch.current;
    try {
      const result = await backend.trimManualVideoClip(request);
      const selectionChanged = startedSelection !== selectionEpoch.current;
      applyBackendState(result.state, undefined, selectionChanged);
      if (!selectionChanged) {
        setSelectedProjectItemId(result.clipId);
        setPlayheadMs(0);
        setPreviewSeek({ sequence: 0, timelineMs: 0 });
      }
    } catch (cause) {
      handleRuntimeError(cause, startedSelection !== selectionEpoch.current);
    } finally {
      manualMutationInFlight.current = false;
      setManualMutationBusy(false);
    }
  }

  function seekTimeline(value: number) {
    if (!backend.presentationOnly && project?.timeline.clips.length === 1) selectProjectItem(project.timeline.clips[0]!.id);
    setPlayheadMs(value);
    setPreviewSeek((current) => ({ sequence: current.sequence + 1, timelineMs: value }));
  }

  async function transcribeSource() {
    if (!activeSourceId || transcriptionOperationId || importBusy || editorialBusy || manualMutationInFlight.current) return;
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

  function handleRuntimeError(cause: unknown, preserveSelection = false) {
    const operationError = desktopOperationError(cause);
    const code = operationError.code;
    if (operationError.reconciledState) applyBackendState(operationError.reconciledState, undefined, preserveSelection);
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

  const layoutStyle = { "--timeline-height": `${timelineHeight}px`, "--sidebar-width": `${sidebarWidth}px` } as CSSProperties;
  const mutationBusy = importBusy || transcriptionOperationId !== null || editorialBusy || manualMutationBusy;
  const realPreview = !backend.presentationOnly && backendState.status !== "temporary-review" && backendState.status !== "host-unavailable" && workspace === "edit";
  const selectedPreviewClip = project.timeline.clips.find((clip) => clip.id === selectedProjectItemId);
  const previewClip = selectedPreviewClip && supportsManualClipPreview(project, selectedPreviewClip) ? selectedPreviewClip : undefined;
  return (
    <main className={`app-shell workspace-${workspace}${mediaOpen ? " media-open" : " media-closed"}${inspectorOpen ? " inspector-open" : " inspector-closed"}`} style={layoutStyle} data-testid="app-shell" data-project-revision={project.history.revision} data-selected-project-item-id={selectedProjectItemId ?? undefined} data-active-source-id={activeSourceId ?? undefined}>
      <TopBar projectName={project.project.name} workspace={workspace} locale={locale} mediaOpen={mediaOpen} inspectorOpen={inspectorOpen} exportAvailable={backendState.capabilities["project.export"].available} status={backendState.status} canUndo={backendState.canUndo && !mutationBusy} canRedo={backendState.canRedo && !mutationBusy} t={t} onWorkspaceChange={setWorkspace} onLocaleChange={setLocale} onMediaToggle={() => setMediaOpen((value) => !value)} onInspectorToggle={() => setInspectorOpen((value) => !value)} onUndo={() => void changeHistory("undo")} onRedo={() => void changeHistory("redo")} />
      <div className="editor-area">
        <ToolRail selected={activeTool} t={t} onSelect={setActiveTool} />
        {mediaOpen && <MediaPanel sources={project.sources} presentations={sourcePresentations} selectedId={selectedProjectItemId} workspace={workspace} importAvailable={backendState.capabilities["media.import"].available && !transcriptionOperationId && !editorialBusy && !manualMutationBusy} importReason={backendState.capabilities["media.import"].reason} importBusy={importBusy} t={t} onSelect={selectProjectItem} onImport={() => void importMedia()} />}
        <div className="center-stack">
          <div className="workspace-stage" role="tabpanel" aria-label={t(workspaceKeys[workspace])}>
            {realPreview ? <ManualVideoPreview key={`${project.history.headSnapshotId}:${activeSourceId}:${previewClip?.id ?? "source"}`} backend={backend} source={project.sources.find((source) => source.id === activeSourceId)} sourceLabel={activeSourceId ? sourcePresentations.get(activeSourceId)?.label : undefined} snapshotId={project.history.headSnapshotId!} clip={previewClip} unsupportedClip={Boolean(selectedPreviewClip && !previewClip)} timelineOccupied={project.timeline.clips.length > 0 || project.captions.length > 0 || project.graphics.length > 0} busy={mutationBusy} seek={previewSeek} t={t} onPlayheadChange={setPlayheadMs} onCreate={createManualClip} /> : <WorkspaceStage presentations={sourcePresentations} workspace={workspace} project={project} selectedProjectItemId={selectedProjectItemId} activeSourceId={activeSourceId} playheadMs={playheadMs} playing={playing} previewInteractive={backend.presentationOnly} transcriptionCapability={backendState.capabilities["transcription.transcribe"]} transcriptionBlocked={importBusy || editorialBusy || manualMutationBusy} transcriptionOperationId={transcriptionOperationId} t={t} onProjectSelect={selectProjectItem} onPlayingChange={setPlaying} onTranscribe={() => void transcribeSource()} onCancelTranscription={() => void cancelTranscription()} />}
          </div>
          {runtimeError && <div className="runtime-alert" role="alert">{t(runtimeErrorKey(runtimeError))}</div>}
          {runtimeNotice && <div className="runtime-notice" role="status">{t(runtimeNotice)}</div>}
        </div>
      </div>
      <EditingSidebar open={inspectorOpen} width={sidebarWidth} editorialVisible={workspace === "edit"} t={t} onWidthChange={setSidebarWidth} onCollapse={() => setInspectorOpen(false)}
        directorPanel={<DirectorPanel editorialPanel={<EditorialDraftPanel state={editorialState} presentations={sourcePresentations} busy={editorialBusy || mutationBusy} error={editorialError} t={t} onRefresh={() => void refreshEditorial()} onRevise={reviseEditorial} onSourceSelect={selectProjectItem} />} draft={directorDraft} preset={preset} directorAvailable={backendState.capabilities["director.execute"].available} t={t} onDraftChange={setDirectorDraft} onPresetChange={setPreset} />}
        contextualPanel={<Inspector presentations={sourcePresentations} project={project} selectedProjectItemId={selectedProjectItemId} workspace={workspace} t={t} />} />
      <Timeline presentations={sourcePresentations} project={project} selectedId={selectedProjectItemId} playheadMs={playheadMs} zoom={timelineZoom} t={t} onSelect={selectProjectItem} onPlayheadChange={seekTimeline} onZoomChange={setTimelineZoom} onResizeStart={startTimelineResize} trimAvailable={realPreview} trimBusy={mutationBusy} onTrim={trimManualClip} />
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
  if (code === "MANUAL_VIDEO_INVALID_RANGE") return "preview.rangeInvalid";
  if (code === "MANUAL_VIDEO_TOO_LARGE") return "preview.localTooLarge";
  if (code === "MANUAL_VIDEO_STALE" || code === "MANUAL_VIDEO_SOURCE_CHANGED") return "preview.localChanged";
  if (code.startsWith("MANUAL_VIDEO_")) return "preview.localUnavailable";
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
