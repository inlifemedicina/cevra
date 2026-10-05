import type { CreateManualVideoClipRequest } from "@cevra/application";
import type { ProjectIR, TimelineClip } from "@cevra/project-ir";
import { useEffect, useRef, useState } from "react";
import type { DesktopBackend } from "../backend/desktop-backend";
import type { SourcePresentation } from "../source-presentation";
import type { Translate } from "../ui-model";
import { ManualVideoPreview } from "./ManualVideoPreview";

interface Props {
  backend: DesktopBackend;
  project: Readonly<ProjectIR>;
  clips: readonly TimelineClip[];
  presentations: ReadonlyMap<string, SourcePresentation>;
  originalSourceId: string | null;
  originalSelected?: boolean;
  busy: boolean;
  seek: { sequence: number; timelineMs: number };
  t: Translate;
  onPlayheadChange(value: number): void;
  onCreate(request: CreateManualVideoClipRequest): Promise<void>;
}

/** One admitted clip/decoder at a time; joins may wait for local preparation. */
export function ManualSequenceVideoPreview({ backend, project, clips, presentations, originalSourceId, originalSelected = false, busy, seek, t, onPlayheadChange, onCreate }: Props) {
  const durationMs = project.timeline.durationMs;
  const [mode, setMode] = useState<"sequence" | "original">(originalSelected ? "original" : "sequence");
  const [loop, setLoop] = useState(false);
  const [transport, setTransport] = useState({ timelineMs: seek.sequence ? Math.min(durationMs, Math.max(0, seek.timelineMs)) : 0, sequence: 1, resume: false });
  const external = useRef({ sequence: seek.sequence, sourceId: originalSourceId });
  const position = useRef(transport.timelineMs);
  const clip = clips.find(item => transport.timelineMs < item.timelineEndMs) ?? clips.at(-1)!;
  function go(value: number, resume = false) {
    if (!Number.isSafeInteger(value)) return;
    const timelineMs = Math.min(durationMs, Math.max(0, value));
    position.current = timelineMs;
    setTransport(old => ({ timelineMs, sequence: old.sequence + 1, resume }));
    onPlayheadChange(timelineMs);
  }
  useEffect(() => {
    const old = external.current;
    external.current = { sequence: seek.sequence, sourceId: originalSourceId };
    if (old.sequence === seek.sequence && old.sourceId === originalSourceId) return;
    if (seek.sequence > 0) { setMode("sequence"); go(seek.timelineMs); }
    else { setMode("original"); setTransport(value => ({ ...value, resume: false })); }
  }, [seek.sequence, originalSourceId]);
  const sourceId = mode === "sequence" ? clip.sourceId : originalSourceId;
  function changeMode(next: "sequence" | "original") {
    if (mode === next) return;
    setTransport(old => ({ timelineMs: position.current, sequence: old.sequence + 1, resume: false }));
    setMode(next);
  }
  return <div className="manual-sequence-preview">
    <div className="manual-sequence-preview-modes" role="group" aria-label={t("sequence.previewMode")}>
      <button type="button" className="secondary-button" aria-pressed={mode === "sequence"} disabled={busy} onClick={() => changeMode("sequence")}>{t("sequence.preview")}</button>
      <button type="button" className="secondary-button" aria-pressed={mode === "original"} disabled={busy} onClick={() => changeMode("original")}>{t("preview.originalMode")}</button>
      {mode === "sequence" && <label><input type="checkbox" checked={loop} disabled={busy} onChange={event => setLoop(event.target.checked)} />{t("sequence.repeat")}</label>}
    </div>
    <ManualVideoPreview key={`${mode}:${sourceId}:${mode === "sequence" ? clip.id : "original"}`} backend={backend}
      source={project.sources.find(source => source.id === sourceId)} sourceLabel={sourceId ? presentations.get(sourceId)?.label : undefined}
      snapshotId={project.history.headSnapshotId!} clip={mode === "sequence" ? clip : undefined}
      timelineOccupied sequenceEditing busy={busy} seek={mode === "sequence" ? transport : { sequence: 0, timelineMs: 0 }} t={t}
      onPlayheadChange={value => { if (mode === "sequence") position.current = value; onPlayheadChange(value); }} onCreate={onCreate}
      program={mode === "sequence" ? { durationMs, resume: transport.resume,
        onPlaybackIntent: resume => setTransport(value => ({ ...value, resume })), onSeek: go,
        onClipEnd: () => {
          if (clip.timelineEndMs < durationMs) go(clip.timelineEndMs, true);
          else if (loop) go(0, true);
          else { setTransport(value => ({ ...value, timelineMs: durationMs, resume: false })); onPlayheadChange(durationMs); }
        } } : undefined} />
  </div>;
}
