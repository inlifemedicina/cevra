import type { ManualVideoSequenceEdit, EditorialDraftState, ReviseEditorialDraftRequest, CreateManualVideoClipRequest, TrimManualVideoClipRequest } from "@cevra/application";
import { manualSequenceClips as manualSequence } from "./components/ManualSequenceControls";
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
import { ManualSequenceVideoPreview } from "./components/ManualSequenceVideoPreview";
import { ManualExportPreparationPanel } from "./components/ManualExportPreparationPanel";
import { capabilityReasonKey, workspaceKeys, type Workspace } from "./ui-model";

import { presentSources } from "./source-presentation";
import { nearestMsToFrames, floorMsToFrames, framesToMilliseconds } from "./frame-timing";

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
  const [exportBusy, setExportBusy] = useState(false);
  const [exportRequest, setExportRequest] = useState(0);
  const [checkpointRetryBusy, setCheckpointRetryBusy] = useState(false);
  const [checkpointReconcileTick, setCheckpointReconcileTick] = useState(0);
  const [nativeClosePending, setNativeClosePending] = useState(false);
  const [nativeCloseError, setNativeCloseError] = useState<string | null>(null);
  const checkpointPending = backendState?.checkpoint?.pending === true;
  const closePending = nativeClosePending || backendState?.closePending === true;
  const manualMutationInFlight = useRef(false);
  const selectionEpoch = useRef(0);
  const latestSelection = useRef<{ selectedId: string | null; sourceId: string | null }>({ selectedId: null, sourceId: null });
  const [previewSeek, setPreviewSeek] = useState<{ sequence: number; timelineMs: number; phase?: import("./timeline-interactions").TimelineSeekPhase }>({ sequence: 0, timelineMs: 0 });
  const [transcriptionOperationId, setTranscriptionOperationId] = useState<string | null>(null);
  const [locale, setLocale] = useState<CevraLocale>("pt-BR");
  const [workspace, setWorkspace] = useState<Workspace>("edit");
  const [selectedProjectItemId, setSelectedProjectItemId] = useState<string | null>(null);
  const [selectedTimelineClipIds, setSelectedTimelineClipIds] = useState<string[]>([]);
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
  const [sidebarCompact, setSidebarCompact] = useState(false);
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
    if (!backend.getNativeCloseState) return;
    let current = true;
    let reading = false;
    let lastSequence = 0;
    const timer = window.setInterval(() => {
      if (reading) return;
      reading = true;
      void backend.getNativeCloseState!().then(async (close) => {
        if (!current || close.sequence === lastSequence) return;
        lastSequence = close.sequence;
        setNativeClosePending(close.pending);
        setNativeCloseError(close.errorCode ? (close.pending ? "PROJECT_CLOSE_UNKNOWN" : close.errorCode) : close.pending ? "PROJECT_CLOSE_PENDING" : null);
        try {
          const state = await backend.loadState();
          if (current) applyBackendState(state, undefined, true, false);
        } catch (cause) { if (current) handleRuntimeError(cause, true); }
      }).catch((cause: unknown) => { if (current) handleRuntimeError(cause, true); }).finally(() => { reading = false; });
    }, 1000);
    return () => { current = false; window.clearInterval(timer); };
  }, [backend]);

  useEffect(() => {
    if (!checkpointPending || checkpointRetryBusy || backendState?.status === "host-unavailable") return;
    let current = true;
    // A transport timeout does not stop a save. Only the canonical Host snapshot
    // can reconcile a late result; never issue another editing command to do it.
    const timer = window.setTimeout(() => {
      void backend.loadState().then((state) => {
        if (!current) return;
        applyBackendState(state, undefined, true, false);
        if (state.status === "local-saved" || state.status === "local-recovered") setRuntimeError((value) => value?.startsWith("PROJECT_CLOSE_") ? value : null);
        else if (state.status === "persistence-error") setRuntimeError((value) => value?.startsWith("PROJECT_CLOSE_") ? value : "PROJECT_PERSISTENCE_FAILED");
      }).catch((cause: unknown) => {
        if (current) handleRuntimeError(cause, true);
      }).finally(() => {
        if (current) setCheckpointReconcileTick((value) => value + 1);
      });
    }, 1000);
    return () => { current = false; window.clearTimeout(timer); };
  }, [backend, checkpointPending, checkpointRetryBusy, checkpointReconcileTick, backendState?.status]);

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
    if (editorialBusy || importBusy || transcriptionOperationId || manualMutationInFlight.current || checkpointPending || closePending) return;
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

  function selectProjectItem(id: string, clipSelection?: readonly string[]) {
    if (!project || !resolvesProjectItem(project, id)) return;
    selectionEpoch.current++;
    const source = project.sources.find((item) => item.id === id);
    if (source) {
      setSelectedTimelineClipIds([]);
      setSelectedProjectItemId(source.id);
      setActiveSourceId(source.id);
      setPreviewSeek({ sequence: 0, timelineMs: 0 });
      return;
    }
    const clip = project.timeline.clips.find((item) => item.id === id);
    if (clip) {
      setSelectedTimelineClipIds(clipSelection ? [...clipSelection] : [clip.id]);
      setSelectedProjectItemId(clip.id);
      setActiveSourceId(clip.sourceId);
      setPreviewSeek((current) => ({ sequence: current.sequence + 1, timelineMs: clip.timelineStartMs }));
      return;
    }
    if (project.captions.some((item) => item.id === id) || project.graphics.some((item) => item.id === id)) {
      setSelectedTimelineClipIds([]);
      setSelectedProjectItemId(id);
    }
  }

  function applyBackendState(value: DesktopBackendState, preferredSourceId?: string, preserveSelection = false, clearRuntimeError = true) {
    setSelectedTimelineClipIds(current => current.filter(id => value.project.timeline.clips.some(clip => clip.id === id)));
    setBackendState(value);
    setProject(value.project);
    if (clearRuntimeError) setRuntimeError(null);
    setPlayheadMs((current) => {
      const bounded = Math.min(current, value.project.timeline.durationMs);
      return value.project.timeline.timingPolicy === "cfr30" ? framesToMilliseconds(floorMsToFrames(bounded)) : bounded;
    });
    const selection = preserveSelection ? latestSelection.current : { selectedId: selectedProjectItemId, sourceId: activeSourceId };
    const selectedStillExists = selection.selectedId !== null && resolvesProjectItem(value.project, selection.selectedId);
    const sourceStillExists = selection.sourceId !== null && value.project.sources.some((source) => source.id === selection.sourceId);
    const nextSourceId = preferredSourceId ?? (sourceStillExists ? selection.sourceId : resolveInitialSourceId(value.project));
    setActiveSourceId(nextSourceId);
    setSelectedProjectItemId(preferredSourceId ?? (selectedStillExists ? selection.selectedId : nextSourceId));
  }

  async function importMedia() {
    if (importBusy || transcriptionOperationId || editorialBusy || manualMutationInFlight.current || checkpointPending || closePending) return;
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
    if (importBusy || transcriptionOperationId || editorialBusy || manualMutationInFlight.current || checkpointPending || closePending) return;
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

  async function retryCheckpoint() {
    const token = backendState?.checkpoint?.token;
    if (!token || importBusy || transcriptionOperationId || editorialBusy || manualMutationInFlight.current || checkpointPending || closePending) return;
    manualMutationInFlight.current = true;
    setManualMutationBusy(true);
    setCheckpointRetryBusy(true);
    setBackendState((current) => current?.checkpoint ? { ...current, status: "checkpoint-pending", checkpoint: { ...current.checkpoint, pending: true } } : current);
    setRuntimeNotice(null);
    try {
      applyBackendState(await backend.retryCheckpoint(token), undefined, true, false);
      setRuntimeError((value) => value?.startsWith("PROJECT_CLOSE_") ? value : null);
    } catch (cause) {
      handleRuntimeError(cause, true);
      if (!desktopOperationError(cause).reconciledState) {
        try { applyBackendState(await backend.loadState(), undefined, true, false); } catch (readError) { handleRuntimeError(readError, true); }
      }
    } finally {
      manualMutationInFlight.current = false;
      setManualMutationBusy(false);
      setCheckpointRetryBusy(false);
    }
  }

  async function createManualClip(request: CreateManualVideoClipRequest) {
    if (project && manualSequence(project)) {
      await editManualSequence(project.timeline.timingPolicy === "cfr30" || project.timeline.clips.length === 0
        ? { type: "append", version: 2, sourceId: request.sourceId, expectedSnapshotId: request.expectedSnapshotId, sourceStartFrame: nearestMsToFrames(request.sourceStartMs), sourceEndFrame: nearestMsToFrames(request.sourceEndMs) }
        : { type: "append", version: 1, ...request });
      return;
    }
    if (importBusy || transcriptionOperationId || editorialBusy || manualMutationInFlight.current || checkpointPending || closePending) return;
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
    if (project && manualSequence(project)) {
      try { await editManualSequence(project.timeline.timingPolicy === "cfr30"
        ? { type: "trim", version: 2, clipId: request.clipId, expectedSnapshotId: request.expectedSnapshotId, sourceStartFrame: nearestMsToFrames(request.sourceStartMs), sourceEndFrame: nearestMsToFrames(request.sourceEndMs) }
        : { type: "trim", version: 1, ...request }); } catch { /* Error already reconciled. */ }
      return;
    }
    if (importBusy || transcriptionOperationId || editorialBusy || manualMutationInFlight.current || checkpointPending || closePending) return;
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

  async function editManualSequence(request: ManualVideoSequenceEdit) {
    if (!project || importBusy || transcriptionOperationId || editorialBusy || manualMutationInFlight.current || checkpointPending || closePending) return;
    manualMutationInFlight.current = true;
    setManualMutationBusy(true);
    setRuntimeError(null); setRuntimeNotice(null);
    const startedSelection = selectionEpoch.current;
    const previousIds = new Set(project.timeline.clips.map(clip => clip.id));
    const oldSelectedIndex = [...project.timeline.clips].sort((a, b) => a.timelineStartMs - b.timelineStartMs).findIndex(clip => clip.id === selectedProjectItemId);
    try {
      const result = await backend.editManualVideoSequence(request);
      applyBackendState(result.state, undefined, true);
      if (startedSelection === selectionEpoch.current) {
        const ordered = [...result.state.project.timeline.clips].sort((a, b) => a.timelineStartMs - b.timelineStartMs);
        const added = ordered.find(clip => !previousIds.has(clip.id));
        const next = (request.type === "append" || request.type === "insert" || request.type === "duplicate") && added ? added
          : (request.type === "remove" && request.clipId === selectedProjectItemId || request.type === "remove-many" && request.clipIds.includes(selectedProjectItemId ?? "")) ? ordered[Math.min(oldSelectedIndex, ordered.length - 1)]
          : ordered.find(clip => clip.id === selectedProjectItemId);
        if (next) {
          if (request.type !== "reorder") setSelectedTimelineClipIds([next.id]);
          setSelectedProjectItemId(next.id); setActiveSourceId(next.sourceId); setPlayheadMs(next.timelineStartMs);
          setPreviewSeek({ sequence: 0, timelineMs: next.timelineStartMs });
        }
      }
    } catch (cause) {
      handleRuntimeError(cause, startedSelection !== selectionEpoch.current);
      throw cause;
    } finally {
      manualMutationInFlight.current = false;
      setManualMutationBusy(false);
    }
  }

  function seekTimeline(value: number, phase?: import("./timeline-interactions").TimelineSeekPhase) {
    if (!backend.presentationOnly && project?.timeline.clips.length === 1 && selectedProjectItemId !== project.timeline.clips[0]!.id) selectProjectItem(project.timeline.clips[0]!.id);
    setPlayheadMs(value);
    setPreviewSeek((current) => ({ sequence: current.sequence + 1, timelineMs: value, phase }));
  }

  async function transcribeSource() {
    if (!activeSourceId || transcriptionOperationId || importBusy || editorialBusy || manualMutationInFlight.current || checkpointPending || closePending) return;
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

  const visibleRuntimeError = nativeCloseError ?? runtimeError;
  if (!project || !backendState) return <main className="loading-screen"><span className="brand-mark">C</span><p>{visibleRuntimeError ? t(runtimeErrorKey(visibleRuntimeError)) : t("app.loadingProject")}</p></main>;

  const layoutStyle = { "--timeline-height": `${timelineHeight}px`, "--sidebar-width": `${sidebarCompact ? 286 : sidebarWidth}px` } as CSSProperties;
  const editingBusy = importBusy || transcriptionOperationId !== null || editorialBusy || manualMutationBusy || checkpointPending || closePending;
  const mutationBusy = editingBusy || exportBusy;
  const realPreview = !backend.presentationOnly && backendState.status !== "temporary-review" && backendState.status !== "host-unavailable" && workspace === "edit";
  const sequenceClips = realPreview ? manualSequence(project) : undefined;
  const exportClips = !backend.presentationOnly && backendState.status !== "temporary-review" && backendState.status !== "host-unavailable" ? manualSequence(project) : undefined;
  const exportAvailable = Boolean(exportClips?.length && project.timeline.timingPolicy === "cfr30" && backendState.capabilities["project.export"].available && backend.exportManualSequence);
  const selectedPreviewClip = project.timeline.clips.find((clip) => clip.id === selectedProjectItemId);
  const previewClip = selectedPreviewClip && supportsManualClipPreview(project, selectedPreviewClip) ? selectedPreviewClip : undefined;
  return (
    <main className={`app-shell workspace-${workspace}${mediaOpen ? " media-open" : " media-closed"}${sidebarCompact ? " sidebar-compact" : " sidebar-open"}`} style={layoutStyle} data-testid="app-shell" data-project-revision={project.history.revision} data-selected-project-item-id={selectedProjectItemId ?? undefined} data-active-source-id={activeSourceId ?? undefined}>
      <TopBar projectName={project.project.name} workspace={workspace} locale={locale} mediaOpen={mediaOpen} sidebarCompact={sidebarCompact} exportAvailable={exportAvailable && !mutationBusy} status={backendState.status} retryAvailable={Boolean(backendState.checkpoint) && (backendState.status === "persistence-error" || backendState.status === "local-unsaved")} retryBusy={mutationBusy} canUndo={backendState.canUndo && !mutationBusy} canRedo={backendState.canRedo && !mutationBusy} t={t} onWorkspaceChange={setWorkspace} onLocaleChange={setLocale} onMediaToggle={() => setMediaOpen((value) => !value)} onSidebarToggle={() => setSidebarCompact((value) => !value)} onUndo={() => void changeHistory("undo")} onRedo={() => void changeHistory("redo")} onRetryCheckpoint={() => void retryCheckpoint()} onExport={() => setExportRequest(value => value + 1)} />
      <div className="editor-area">
        <ToolRail selected={activeTool} t={t} onSelect={setActiveTool} />
        {mediaOpen && <MediaPanel backend={!backend.presentationOnly && backendState.status !== "temporary-review" && backendState.status !== "host-unavailable" ? backend : undefined} snapshotId={project.history.headSnapshotId ?? undefined} thumbnailBusy={mutationBusy} sources={project.sources} presentations={sourcePresentations} selectedId={selectedProjectItemId} workspace={workspace} importAvailable={backendState.capabilities["media.import"].available && !mutationBusy} importReason={backendState.capabilities["media.import"].reason} importBusy={importBusy} t={t} onSelect={selectProjectItem} onImport={() => void importMedia()} />}
        <div className="center-stack">
          <div className="workspace-stage" role="tabpanel" aria-label={t(workspaceKeys[workspace])}>
            {realPreview ? sequenceClips && (sequenceClips.length > 1 || project.timeline.timingPolicy === "cfr30" && sequenceClips.length > 0)
              ? <ManualSequenceVideoPreview key={project.history.headSnapshotId} backend={backend} project={project} clips={sequenceClips} presentations={sourcePresentations} originalSourceId={activeSourceId} originalSelected={selectedProjectItemId === activeSourceId} busy={mutationBusy} seek={previewSeek} t={t} onPlayheadChange={setPlayheadMs} onCreate={createManualClip} />
              : <ManualVideoPreview key={`${project.history.headSnapshotId}:${activeSourceId}:${previewClip?.id ?? "source"}`} backend={backend} source={project.sources.find((source) => source.id === activeSourceId)} sourceLabel={activeSourceId ? sourcePresentations.get(activeSourceId)?.label : undefined} snapshotId={project.history.headSnapshotId!} clip={previewClip} unsupportedClip={Boolean(selectedPreviewClip && !previewClip)} timelineOccupied={project.timeline.clips.length > 0 || project.captions.length > 0 || project.graphics.length > 0} sequenceEditing={sequenceClips !== undefined} frameEditing={sequenceClips !== undefined && (project.timeline.timingPolicy === "cfr30" || sequenceClips.length === 0)} busy={mutationBusy} seek={previewSeek} t={t} onPlayheadChange={setPlayheadMs} onCreate={createManualClip} /> : <WorkspaceStage presentations={sourcePresentations} workspace={workspace} project={project} selectedProjectItemId={selectedProjectItemId} activeSourceId={activeSourceId} playheadMs={playheadMs} playing={playing} previewInteractive={backend.presentationOnly} transcriptionCapability={backendState.capabilities["transcription.transcribe"]} transcriptionBlocked={mutationBusy} transcriptionOperationId={transcriptionOperationId} t={t} onProjectSelect={selectProjectItem} onPlayingChange={setPlaying} onTranscribe={() => void transcribeSource()} onCancelTranscription={() => void cancelTranscription()} />}
          </div>
          {visibleRuntimeError && <div className="runtime-alert" role="alert">{t(runtimeErrorKey(visibleRuntimeError))}</div>}
          {runtimeNotice && <div className="runtime-notice" role="status">{t(runtimeNotice)}</div>}
        </div>
      </div>
      <EditingSidebar compact={sidebarCompact} width={sidebarWidth} editorialVisible={workspace === "edit"} controlsRequest={exportRequest} t={t} onWidthChange={setSidebarWidth} onModeToggle={() => setSidebarCompact((value) => !value)}
        directorPanel={<DirectorPanel editorialPanel={<EditorialDraftPanel state={editorialState} presentations={sourcePresentations} busy={editorialBusy || mutationBusy} error={editorialError} t={t} onRefresh={() => void refreshEditorial()} onRevise={reviseEditorial} onSourceSelect={selectProjectItem} />} draft={directorDraft} preset={preset} directorAvailable={backendState.capabilities["director.execute"].available} t={t} onDraftChange={setDirectorDraft} onPresetChange={setPreset} />}
        contextualPanel={<Inspector presentations={sourcePresentations} project={project} selectedProjectItemId={selectedProjectItemId} workspace={workspace} t={t}
          exportPreparation={exportClips && exportClips.length > 0 && <ManualExportPreparationPanel key={project.project.id} backend={backend} snapshotId={project.history.headSnapshotId!} locale={locale} busy={editingBusy} available={exportAvailable} exportRequest={exportRequest} t={t} onBusyChange={value => { manualMutationInFlight.current = value; setExportBusy(value); }} onExported={result => applyBackendState(result.state, undefined, true)} onReconciled={(state, code) => handleRuntimeError({ code, reconciledState: state }, true)} />} />} />
      <Timeline backend={backend} presentations={sourcePresentations} project={project} selectedId={selectedProjectItemId} selectedClipIds={selectedTimelineClipIds} onSelectClips={(ids, primary) => {
        if (primary && primary !== selectedProjectItemId) selectProjectItem(primary, ids);
        else { selectionEpoch.current++; setSelectedTimelineClipIds(ids); setSelectedProjectItemId(primary); }
      }} playheadMs={playheadMs} zoom={timelineZoom} t={t} onSelect={selectProjectItem} onPlayheadChange={seekTimeline} onZoomChange={setTimelineZoom} onResizeStart={startTimelineResize} trimAvailable={realPreview} trimBusy={mutationBusy} onTrim={trimManualClip} sequenceClips={sequenceClips} onSequenceEdit={editManualSequence} />
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
  if (code === "MANUAL_EXPORT_COMMITTED_ERROR") return "export.committedError";
  if (code === "MANUAL_EXPORT_PUBLICATION_UNVERIFIED") return "export.publicationUnverified";
  if (code === "MANUAL_EXPORT_CLEANUP_FAILED") return "export.cleanupFailed";
  if (code === "PROJECT_CHECKPOINT_PENDING") return "export.checkpointFailed";
  if (code === "MANUAL_SEQUENCE_STALE") return "preview.localChanged";
  if (code === "MANUAL_SEQUENCE_INVALID_RANGE") return "preview.rangeInvalid";
  if (code.startsWith("MANUAL_SEQUENCE_")) return "sequence.unavailable";
  if (code === "MANUAL_VIDEO_INVALID_RANGE") return "preview.rangeInvalid";
  if (code === "MANUAL_VIDEO_TOO_LARGE") return "preview.localTooLarge";
  if (code === "MANUAL_VIDEO_STALE" || code === "MANUAL_VIDEO_SOURCE_CHANGED") return "preview.localChanged";
  if (code.startsWith("MANUAL_VIDEO_")) return "preview.localUnavailable";
  if (code === "OPERATION_TIMEOUT" || code === "HOST_TIMEOUT") return "runtime.operationTimedOut";
  if (code === "PROJECT_PERSISTENCE_FAILED") return "runtime.persistenceError";
  if (code === "PROJECT_CHECKPOINT_STALE") return "runtime.checkpointStale";
  if (code === "PROJECT_CLOSE_UNSAVED") return "runtime.closeUnsaved";
  if (code === "PROJECT_CLOSE_BUSY") return "runtime.closeBusy";
  if (code === "PROJECT_CLOSE_PENDING" || code === "PROJECT_CLOSE_UNKNOWN") return "runtime.closePending";
  if (code === "PROJECT_PERSISTENCE_CORRUPT") return "runtime.persistenceCorrupt";
  if (code === "PROJECT_PERSISTENCE_UNAVAILABLE") return "runtime.persistenceUnavailable";
  if (code === "TRANSCRIPTION_APP_PROJECT_CONFLICT") return "runtime.transcriptionProjectConflict";
  if (code === "LOCAL_SOURCE_PROJECT_CONFLICT" || code === "MEDIA_PROJECT_CONFLICT") return "runtime.importProjectConflict";
  if (code.includes("MEDIA") || code.includes("INGEST")) return "runtime.mediaError";
  if (code.includes("TRANSCRIPTION")) return "runtime.transcriptionError";
  if (code.includes("HOST")) return "runtime.hostUnavailable";
  return "runtime.operationError";
}
