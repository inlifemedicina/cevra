import type { CreateManualVideoClipRequest } from "@cevra/application";
import type { ProjectIR, TimelineClip } from "@cevra/project-ir";
import { useEffect, useRef, useState } from "react";
import type { DesktopBackend } from "../backend/desktop-backend";
import type { SourcePresentation } from "../source-presentation";
import type { Translate } from "../ui-model";
import { ManualVideoPreview } from "./ManualVideoPreview";
import { floorMsToFrames, framesToMilliseconds } from "../frame-timing";
import type { TimelineSeekPhase } from "../timeline-interactions";

interface Props {
  backend: DesktopBackend;
  project: Readonly<ProjectIR>;
  clips: readonly TimelineClip[];
  presentations: ReadonlyMap<string, SourcePresentation>;
  originalSourceId: string | null;
  originalSelected?: boolean;
  busy: boolean;
  seek: { sequence: number; timelineMs: number; phase?: TimelineSeekPhase };
  t: Translate;
  onPlayheadChange(value: number): void;
  onCreate(request: CreateManualVideoClipRequest): Promise<void>;
}

/** CFR30 montage uses one admitted derivative/decoder; Original keeps its source clock. */
export function ManualSequenceVideoPreview({ backend, project, clips, presentations, originalSourceId, originalSelected = false, busy, seek, t, onPlayheadChange, onCreate }: Props) {
  const durationMs = project.timeline.durationMs;
  const [mode, setMode] = useState<"sequence" | "original">(originalSelected ? "original" : "sequence");
  const [loop, setLoop] = useState(false);
  const [transport, setTransport] = useState({ timelineMs: Math.min(durationMs, Math.max(0, seek.timelineMs)), sequence: 1, resume: false });
  const external = useRef({ sequence: seek.sequence, sourceId: originalSourceId });
  const position = useRef(transport.timelineMs);
  const transportRef = useRef(transport);
  transportRef.current = transport;
  const scrubIntent = useRef<boolean | null>(null);
  const clip = clips.find(item => transport.timelineMs < item.timelineEndMs) ?? clips.at(-1)!;
  function go(value: number, resume = transportRef.current.resume) {
    const grid = project.timeline.timingPolicy === "cfr30";
    if (!(grid ? Number.isFinite(value) : Number.isSafeInteger(value))) return;
    const bounded = Math.min(durationMs, Math.max(0, value));
    const timelineMs = grid ? framesToMilliseconds(floorMsToFrames(bounded)) : bounded;
    position.current = timelineMs;
    setTransport(old => ({ timelineMs, sequence: old.sequence + 1, resume }));
    onPlayheadChange(timelineMs);
  }
  function scrubProgram(value: number, phase: TimelineSeekPhase) {
    if (busy) { scrubIntent.current = null; go(value, false); return; }
    if (phase === "start") scrubIntent.current = transportRef.current.resume;
    const dragging = phase === "start" || phase === "move";
    go(value, dragging ? false : scrubIntent.current ?? transportRef.current.resume);
    if (!dragging) scrubIntent.current = null;
  }
  useEffect(() => { if (busy) scrubIntent.current = null; }, [busy]);
  useEffect(() => {
    const old = external.current;
    external.current = { sequence: seek.sequence, sourceId: originalSourceId };
    if (old.sequence === seek.sequence && old.sourceId === originalSourceId) return;
    if (seek.sequence > 0) {
      setMode("sequence");
      scrubProgram(seek.timelineMs, seek.phase ?? "single");
    } else { scrubIntent.current = null; setMode("original"); setTransport(value => ({ ...value, resume: false })); }
  }, [seek.sequence, originalSourceId]);
  const continuous = mode === "sequence" && project.timeline.timingPolicy === "cfr30";
  const programClip: TimelineClip = continuous ? { ...clips[0]!, id: "continuous-program-preview", sourceStartMs: 0, sourceEndMs: durationMs,
    timelineStartMs: 0, timelineEndMs: durationMs, frameTiming: { version: 1, timelineStartFrame: 0,
      timelineEndFrame: clips.at(-1)!.frameTiming!.timelineEndFrame, sourceStartFrame: 0, sourceEndFrame: clips.at(-1)!.frameTiming!.timelineEndFrame } } : clip;
  const sourceId = mode === "sequence" ? (continuous ? clips[0]!.sourceId : clip.sourceId) : originalSourceId;
  const currentSourceId = continuous ? (clips.find(item => position.current < item.timelineEndMs) ?? clips.at(-1)!).sourceId : sourceId;
  function changeMode(next: "sequence" | "original") {
    if (mode === next) return;
    setTransport(old => ({ timelineMs: position.current, sequence: old.sequence + 1, resume: false }));
    setMode(next);
    scrubIntent.current = null;
  }
  return <div className="manual-sequence-preview">
    <div className="manual-sequence-preview-modes" role="group" aria-label={t("sequence.previewMode")}>
      <button type="button" className="secondary-button" aria-pressed={mode === "sequence"} disabled={busy} onClick={() => changeMode("sequence")}>{t("sequence.preview")}</button>
      <button type="button" className="secondary-button" aria-pressed={mode === "original"} disabled={busy} onClick={() => changeMode("original")}>{t("preview.originalMode")}</button>
      {mode === "sequence" && <label><input type="checkbox" checked={loop} disabled={busy} onChange={event => setLoop(event.target.checked)} />{t("sequence.repeat")}</label>}
    </div>
    <ManualVideoPreview key={`${mode}:${sourceId}:${mode === "sequence" ? continuous ? "continuous" : clip.id : "original"}`} backend={backend}
      source={project.sources.find(source => source.id === sourceId)} sourceLabel={currentSourceId ? presentations.get(currentSourceId)?.label : undefined}
      snapshotId={project.history.headSnapshotId!} clip={mode === "sequence" ? programClip : undefined} sequencePreview={continuous ? clips : undefined}
      timelineOccupied sequenceEditing frameEditing={project.timeline.timingPolicy === "cfr30"} busy={busy} seek={mode === "sequence" ? transport : { sequence: 0, timelineMs: 0 }} t={t}
      onPlayheadChange={value => { if (mode === "sequence") position.current = value; onPlayheadChange(value); }} onCreate={onCreate}
      program={mode === "sequence" ? { durationMs, resume: transport.resume,
        onPlaybackIntent: resume => setTransport(value => ({ ...value, resume })), onSeek: go, onScrub: scrubProgram,
        onClipEnd: () => {
          if (programClip.timelineEndMs < durationMs) go(programClip.timelineEndMs, true);
          else if (loop) go(0, true);
          else { setTransport(value => ({ ...value, timelineMs: durationMs, resume: false })); onPlayheadChange(durationMs); }
        } } : undefined} />
  </div>;
}
