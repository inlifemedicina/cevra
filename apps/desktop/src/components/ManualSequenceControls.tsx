import type { ManualVideoSequenceEdit } from "@cevra/application";
import type { ProjectIR, SourceAsset, TimelineClip } from "@cevra/project-ir";
import { useEffect, useState } from "react";
import type { SourcePresentation } from "../source-presentation";
import type { Translate } from "../ui-model";

interface Props {
  project: Readonly<ProjectIR>;
  clips: readonly TimelineClip[];
  presentations: ReadonlyMap<string, SourcePresentation>;
  selectedId: string | null;
  playheadMs: number;
  busy: boolean;
  t: Translate;
  onEdit(request: ManualVideoSequenceEdit): Promise<void>;
}
type Unbound<T> = T extends unknown ? Omit<T, "version" | "expectedSnapshotId"> : never;
type Intent = Unbound<ManualVideoSequenceEdit>;

/** Inputs are disposable drafts; only the typed backend publishes the timeline. */
export function ManualSequenceControls({ project, clips, presentations, selectedId, playheadMs, busy, t, onEdit }: Props) {
  const selected = clips.find(clip => clip.id === selectedId);
  const sources = manualSequenceSources(project);
  const initialSource = sources.find(source => source.id === (selected?.sourceId ?? selectedId)) ?? sources[0];
  const [sourceId, setSourceId] = useState(initialSource?.id ?? "");
  const [start, setStart] = useState(String((selected?.sourceStartMs ?? 0) / 1000));
  const [end, setEnd] = useState(String((selected?.sourceEndMs ?? initialSource?.durationMs ?? 0) / 1000));
  const [pending, setPending] = useState(false);
  const source = sources.find(item => item.id === sourceId);
  useEffect(() => {
    setSourceId(initialSource?.id ?? "");
    setStart(String((selected?.sourceStartMs ?? 0) / 1000));
    setEnd(String((selected?.sourceEndMs ?? initialSource?.durationMs ?? 0) / 1000));
  }, [selectedId, selected?.sourceStartMs, selected?.sourceEndMs, initialSource?.id, initialSource?.durationMs]);

  const sourceStartMs = milliseconds(start), sourceEndMs = milliseconds(end);
  const valid = Boolean(source) && sourceStartMs !== null && sourceEndMs !== null
    && sourceStartMs >= 0 && sourceStartMs < sourceEndMs && sourceEndMs <= source!.durationMs!;
  const disabled = busy || pending;
  const selectedIndex = selected ? clips.findIndex(clip => clip.id === selected.id) : -1;
  async function edit(intent: Intent) {
    if (disabled) return;
    setPending(true);
    try { await onEdit({ ...intent, version: 1, expectedSnapshotId: project.history.headSnapshotId! } as ManualVideoSequenceEdit); }
    catch { /* App reconciles canonical state and displays the operation error. */ }
    finally { setPending(false); }
  }
  function range(type: "append" | "insert" | "trim") {
    if (!valid) return;
    const bounds = { sourceStartMs: sourceStartMs!, sourceEndMs: sourceEndMs! };
    if (type === "append") void edit({ type, sourceId, ...bounds });
    else if (type === "insert" && selected) void edit({ type, sourceId, beforeClipId: selected.id, ...bounds });
    else if (type === "trim" && selected && sourceId === selected.sourceId) void edit({ type, clipId: selected.id, ...bounds });
  }
  function move(delta: -1 | 1) {
    const next = selectedIndex + delta;
    if (!selected || next < 0 || next >= clips.length) return;
    const ids = clips.map(clip => clip.id);
    [ids[selectedIndex], ids[next]] = [ids[next]!, ids[selectedIndex]!];
    void edit({ type: "reorder", clipIds: ids });
  }
  return <section className="manual-sequence-controls" aria-label={t("sequence.controls")}>
    <fieldset disabled={disabled}>
      <legend>{t("sequence.sourceRange")}</legend>
      <label>{t("sequence.source")}<select aria-label={t("sequence.source")} value={sourceId} onChange={event => {
        const next = sources.find(item => item.id === event.target.value);
        setSourceId(next?.id ?? ""); setStart("0"); setEnd(String((next?.durationMs ?? 0) / 1000));
      }}>{sources.map(item => <option key={item.id} value={item.id}>{presentations.get(item.id)?.label ?? item.displayName}</option>)}</select></label>
      <label>{t("sequence.inSeconds")}<input type="number" step="0.001" min="0" value={start} onChange={event => setStart(event.target.value)} /></label>
      <label>{t("sequence.outSeconds")}<input type="number" step="0.001" min="0" max={(source?.durationMs ?? 0) / 1000} value={end} onChange={event => setEnd(event.target.value)} /></label>
      <button type="button" className="secondary-button" disabled={!valid} onClick={() => range("append")}>{t("sequence.append")}</button>
      <button type="button" className="secondary-button" disabled={!valid || !selected} onClick={() => range("insert")}>{t("sequence.insert")}</button>
      <button type="button" className="secondary-button" disabled={!valid || !selected || sourceId !== selected.sourceId || sourceStartMs === selected.sourceStartMs && sourceEndMs === selected.sourceEndMs} onClick={() => range("trim")}>{t("sequence.trim")}</button>
      {!valid && <span role="status">{t("preview.rangeInvalid")}</span>}
    </fieldset>
    <div className="manual-sequence-actions">
      <button type="button" className="secondary-button" disabled={disabled || !selected} onClick={() => { if (selected) void edit({ type: "duplicate", clipId: selected.id }); }}>{t("sequence.duplicate")}</button>
      <button type="button" className="secondary-button" disabled={disabled || !selected || !Number.isSafeInteger(playheadMs) || playheadMs <= selected.timelineStartMs || playheadMs >= selected.timelineEndMs} onClick={() => { if (selected) void edit({ type: "split", clipId: selected.id, timelineAtMs: playheadMs }); }}>{t("sequence.split")}</button>
      <button type="button" className="secondary-button" disabled={disabled || selectedIndex <= 0} onClick={() => move(-1)}>{t("sequence.earlier")}</button>
      <button type="button" className="secondary-button" disabled={disabled || selectedIndex < 0 || selectedIndex >= clips.length - 1} onClick={() => move(1)}>{t("sequence.later")}</button>
      <button type="button" className="secondary-button" disabled={disabled || !selected} onClick={() => { if (selected) void edit({ type: "remove", clipId: selected.id }); }}>{t("sequence.remove")}</button>
      {!selected && <span>{t("sequence.selectClip")}</span>}
    </div>
  </section>;
}

function milliseconds(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value) * 1000;
  const rounded = Math.round(number);
  return Number.isSafeInteger(rounded) && Math.abs(number - rounded) < 0.000001 ? rounded : null;
}

/** Browser-only affordance checks. Host/Application validate every real request. */
export function manualSequenceSources(project: Readonly<ProjectIR>): SourceAsset[] {
  return project.sources.filter(source => {
    const descriptor = source.technicalDescriptor;
    const ingest = source.extensions?.["cevra.ingest"];
    return source.kind === "video" && Number.isSafeInteger(source.durationMs) && source.durationMs! > 0
      && descriptor?.version === 1 && descriptor.basis === "ingest"
      && descriptor.method.profile === "cevra.source-technical.v1"
      && Number.isSafeInteger(descriptor.content.sizeBytes) && descriptor.content.sizeBytes > 0 && descriptor.content.sizeBytes <= 256 * 1024 * 1024
      && /^[a-f0-9]{64}$/i.test(descriptor.content.sha256)
      && typeof ingest === "object" && ingest !== null && !Array.isArray(ingest)
      && "method" in ingest && ingest.method === "local" && "hasVideo" in ingest && ingest.hasVideo === true;
  });
}

export function manualSequenceClips(project: Readonly<ProjectIR>): TimelineClip[] | undefined {
  if (!project.history.headSnapshotId || project.captions.length || project.graphics.length) return undefined;
  const clips = [...project.timeline.clips].sort((a, b) => a.timelineStartMs - b.timelineStartMs);
  const sources = new Map(manualSequenceSources(project).map(source => [source.id, source]));
  const track = project.timeline.tracks.find(item => item.id === clips[0]?.trackId);
  if (clips.length && (!track || track.kind !== "video" || track.locked || track.hidden || track.muted)) return undefined;
  let end = 0;
  for (const clip of clips) {
    const source = sources.get(clip.sourceId);
    if (!source || clip.trackId !== track!.id || clip.speed !== 1 || clip.volume !== 1 || clip.opacity !== 1 || Object.keys(clip.extensions ?? {}).length
      || ![clip.timelineStartMs, clip.timelineEndMs, clip.sourceStartMs, clip.sourceEndMs].every(Number.isSafeInteger)
      || clip.timelineStartMs !== end || clip.sourceStartMs < 0 || clip.sourceStartMs >= clip.sourceEndMs || clip.sourceEndMs > source.durationMs!
      || clip.timelineEndMs - clip.timelineStartMs !== clip.sourceEndMs - clip.sourceStartMs) return undefined;
    end = clip.timelineEndMs;
  }
  return project.timeline.durationMs === end ? clips : undefined;
}
