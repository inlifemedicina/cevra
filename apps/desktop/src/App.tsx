import type { CevraLocale, TranslationKey } from "@cevra/i18n";
import { translate } from "@cevra/i18n";
import type { ProjectIR } from "@cevra/project-ir";
import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { DesktopBackend } from "./backend/desktop-backend";
import { DemoDesktopBackend } from "./backend/demo-desktop-backend";
import { DirectorPanel } from "./components/DirectorPanel";
import { Inspector } from "./components/Inspector";
import { MediaPanel } from "./components/MediaPanel";
import { Timeline } from "./components/Timeline";
import { ToolRail } from "./components/ToolRail";
import { TopBar } from "./components/TopBar";
import { WorkspaceStage } from "./components/WorkspaceStage";
import { workspaceKeys, type Workspace } from "./ui-model";

const defaultBackend = new DemoDesktopBackend();

export function App({ backend = defaultBackend }: { backend?: DesktopBackend }) {
  const [project, setProject] = useState<Readonly<ProjectIR> | null>(null);
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
    void backend.loadProjectProjection().then((value) => {
      if (!current) return;
      const initialSourceId = resolveInitialSourceId(value);
      setProject(value);
      setSelectedProjectItemId(initialSourceId);
      setActiveSourceId(initialSourceId);
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

  if (!project) return <main className="loading-screen"><span className="brand-mark">C</span><p>{t("app.loadingProject")}</p></main>;

  const layoutStyle = { "--timeline-height": `${timelineHeight}px` } as CSSProperties;
  return (
    <main className={`app-shell workspace-${workspace}${mediaOpen ? " media-open" : " media-closed"}${inspectorOpen ? " inspector-open" : " inspector-closed"}`} style={layoutStyle} data-testid="app-shell" data-project-revision={project.history.revision} data-selected-project-item-id={selectedProjectItemId ?? undefined} data-active-source-id={activeSourceId ?? undefined}>
      <TopBar projectName={project.project.name} workspace={workspace} locale={locale} mediaOpen={mediaOpen} inspectorOpen={inspectorOpen} exportAvailable={backend.capability("project.export").available} presentationOnly={backend.presentationOnly} t={t} onWorkspaceChange={setWorkspace} onLocaleChange={setLocale} onMediaToggle={() => setMediaOpen((value) => !value)} onInspectorToggle={() => setInspectorOpen((value) => !value)} />
      <div className="editor-area">
        <ToolRail selected={activeTool} t={t} onSelect={setActiveTool} />
        {mediaOpen && <MediaPanel sources={project.sources} selectedId={selectedProjectItemId} workspace={workspace} importAvailable={backend.capability("media.import").available} t={t} onSelect={selectProjectItem} />}
        <div className="center-stack">
          <div className="workspace-stage" role="tabpanel" aria-label={t(workspaceKeys[workspace])}>
            <WorkspaceStage workspace={workspace} project={project} selectedProjectItemId={selectedProjectItemId} activeSourceId={activeSourceId} playheadMs={playheadMs} playing={playing} t={t} onProjectSelect={selectProjectItem} onPlayingChange={setPlaying} />
          </div>
          {workspace === "edit" && <DirectorPanel draft={directorDraft} preset={preset} reviewing={reviewing} directorAvailable={backend.capability("director.execute").available} applyAvailable={backend.capability("changes.apply").available} t={t} onDraftChange={setDirectorDraft} onPresetChange={setPreset} onReviewToggle={() => setReviewing((value) => !value)} />}
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
