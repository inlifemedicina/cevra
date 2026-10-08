import { supportsManualClipExtensions, type ManualVideoSequenceEdit } from "@cevra/application";
import type { ProjectIR, SourceAsset, TimelineClip } from "@cevra/project-ir";
import { useEffect, useLayoutEffect, useId, useRef, useState, type RefObject, type KeyboardEvent } from "react";
import type { SourcePresentation } from "../source-presentation";
import type { Translate } from "../ui-model";
import type { DesktopBackend } from "../backend/desktop-backend";
import { maximumSourceFrame, floorMsToFrames, frameInput, framesToMilliseconds, isCfr30Frame } from "../frame-timing";
import { ManualSequenceConformReview } from "./ManualSequenceConformReview";
import { shortcutProps } from "../keyboard-shortcuts";
import { reorderedTimeline } from "../timeline-interactions";
import type { RangeActionGate } from "../range-activation-guard";

interface Props {
  project: Readonly<ProjectIR>;
  clips: readonly TimelineClip[];
  presentations: ReadonlyMap<string, SourcePresentation>;
  selectedId: string | null;
  selectedClipIds?: readonly string[];
  playheadMs: number;
  busy: boolean;
  t: Translate;
  onEdit(request: ManualVideoSequenceEdit): Promise<void>;
  onCommitRange(request: ManualVideoSequenceEdit): Promise<void>;
  rangeDraft: RefObject<ManualRangeDraftController | null>;
  onAction: RangeActionGate;
  backend?: DesktopBackend;
}
/** One draft settlement is shared by blur, Enter and the next App transition. */
export interface ManualRangeDraftController {
  settle(): Promise<void> | undefined;
}
type Unbound<T> = T extends unknown ? Omit<T, "version" | "expectedSnapshotId"> : never;
type Intent = Unbound<ManualVideoSequenceEdit>;

/** Inputs are disposable drafts; only the typed backend publishes the timeline. */
export function ManualSequenceControls({ project, clips, presentations, selectedId, selectedClipIds, playheadMs, busy, t, onEdit, onCommitRange, rangeDraft, onAction, backend }: Props) {
  const grid = project.timeline.timingPolicy === "cfr30" || clips.length === 0;
  const selected = clips.find(clip => clip.id === selectedId);
  const sources = manualSequenceSources(project);
  const initialSource = sources.find(source => source.id === (selected?.sourceId ?? selectedId)) ?? sources[0];
  const [sourceId, setSourceId] = useState(initialSource?.id ?? "");
  const initialStart = () => String(grid ? selected?.frameTiming?.sourceStartFrame ?? 0 : (selected?.sourceStartMs ?? 0) / 1000);
  const initialEnd = () => String(grid ? selected?.frameTiming?.sourceEndFrame ?? maximumSourceFrame(initialSource?.durationMs ?? 0) : (selected?.sourceEndMs ?? initialSource?.durationMs ?? 0) / 1000);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [draftPhase, setDraftPhase] = useState<"clean" | "editing" | "committing" | "failed">("clean");
  const settlement = useRef<Promise<void> | null>(null);
  const skipBlur = useRef(false);
  const composing = useRef(false);
  const draftOwner = useRef(selectedId);
  const rangeHintId = useId();
  const source = sources.find(item => item.id === sourceId);
  useEffect(() => {
    // App settles the owning draft before changing selection. Failed/stale
    // settlements retain their visible value rather than following a refresh.
    if (draftOwner.current === selectedId && draftPhase !== "clean") return;
    draftOwner.current = selectedId;
    setSourceId(initialSource?.id ?? "");
    setStart(initialStart()); setEnd(initialEnd());
  }, [selectedId, selected?.sourceStartMs, selected?.sourceEndMs, initialSource?.id, initialSource?.durationMs, grid, draftPhase]);
  useLayoutEffect(() => { rangeDraft.current = { settle: settleDraft }; });
  useLayoutEffect(() => () => { rangeDraft.current = null; }, [rangeDraft]);

  const begin = grid ? frameInput(start) : milliseconds(start), finish = grid ? frameInput(end) : milliseconds(end);
  const maximum = source ? grid ? maximumSourceFrame(source.durationMs!) : source.durationMs! : 0;
  const valid = Boolean(source) && begin !== null && finish !== null && begin >= 0 && begin < finish && finish <= maximum;
  const sourceStartMs = grid && begin !== null ? framesToMilliseconds(begin) : begin;
  const sourceEndMs = grid && finish !== null ? framesToMilliseconds(finish) : finish;
  const disabled = busy || pending;
  const fieldsDisabled = disabled || draftPhase === "committing";
  const chosen = clips.filter(clip => (selectedClipIds ?? (selected ? [selected.id] : [])).includes(clip.id)).map(clip => clip.id);
  const firstChosen = clips.findIndex(clip => clip.id === chosen[0]);
  const lastChosen = clips.findIndex(clip => clip.id === chosen.at(-1));
  const splitFrame = grid && Number.isFinite(playheadMs) && playheadMs >= 0 ? floorMsToFrames(playheadMs) : null;
  const canSplit = Boolean(selected && (grid ? splitFrame !== null && selected.frameTiming && splitFrame > selected.frameTiming.timelineStartFrame && splitFrame < selected.frameTiming.timelineEndFrame
    : Number.isSafeInteger(playheadMs) && playheadMs > selected.timelineStartMs && playheadMs < selected.timelineEndMs));
  async function edit(intent: Intent) {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try { await onEdit({ ...intent, version: grid ? 2 : 1, expectedSnapshotId: project.history.headSnapshotId! } as ManualVideoSequenceEdit); }
    catch { /* App reconciles canonical state and displays the operation error. */ }
    finally { inFlight.current = false; setPending(false); }
  }
  function range(type: "append" | "insert" | "trim") {
    if (!valid) return;
    const bounds = grid ? { sourceStartFrame: begin!, sourceEndFrame: finish! } : { sourceStartMs: sourceStartMs!, sourceEndMs: sourceEndMs! };
    if (type === "append") void edit({ type, sourceId, ...bounds });
    else if (type === "insert" && selected) void edit({ type, sourceId, beforeClipId: selected.id, ...bounds });
    else if (type === "trim") confirmDraft();
  }
  function settleDraft(): Promise<void> | undefined {
    if (settlement.current) return settlement.current;
    if (skipBlur.current || composing.current || draftPhase === "clean" || !selected || sourceId !== selected.sourceId) return;
    if (!valid) return Promise.reject({ code: "MANUAL_RANGE_INVALID" });
    if (sourceStartMs === selected.sourceStartMs && sourceEndMs === selected.sourceEndMs) return;
    const bounds = grid ? { sourceStartFrame: begin!, sourceEndFrame: finish! } : { sourceStartMs: sourceStartMs!, sourceEndMs: sourceEndMs! };
    // Capture owner, bounds and expected snapshot before awaiting anything.
    const request = { type: "trim", clipId: selected.id, ...bounds, version: grid ? 2 : 1, expectedSnapshotId: project.history.headSnapshotId! } as ManualVideoSequenceEdit;
    setDraftPhase("committing");
    settlement.current = onCommitRange(request).then(() => { setDraftPhase("clean"); }, cause => {
      setDraftPhase("failed"); throw cause;
    }).finally(() => { settlement.current = null; });
    return settlement.current;
  }
  function confirmDraft() { void settleDraft()?.catch(() => { /* Keep the draft; App owns runtime errors. */ }); }
  function draftKey(event: KeyboardEvent<HTMLInputElement>) {
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); confirmDraft(); }
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); skipBlur.current = true;
      setDraftPhase("clean");
      setStart(String(grid ? selected?.sourceId === sourceId ? selected.frameTiming?.sourceStartFrame ?? 0 : 0 : selected?.sourceId === sourceId ? selected.sourceStartMs / 1000 : 0));
      setEnd(String(grid ? selected?.sourceId === sourceId ? selected.frameTiming?.sourceEndFrame ?? maximum : maximum : selected?.sourceId === sourceId ? selected.sourceEndMs / 1000 : maximum / 1000));
    }
  }
  function move(delta: -1 | 1) {
    const next = (delta < 0 ? firstChosen : lastChosen) + delta;
    if (!chosen.length || next < 0 || next >= clips.length) return;
    void edit({ type: "reorder", clipIds: reorderedTimeline(clips.map(clip => clip.id), chosen, clips[next]!.id, delta > 0) });
  }
  return <section className="manual-sequence-controls" aria-label={t("sequence.controls")} data-draft-phase={draftPhase}>
    <p>{t(grid ? "sequence.frameGrid" : "sequence.legacyTiming")}</p>
    <fieldset>
      <legend>{t("sequence.sourceRange")}</legend>
      <label>{t("sequence.source")}<select disabled={disabled} aria-label={t("sequence.source")} value={sourceId} onChange={event => {
        const next = sources.find(item => item.id === event.target.value);
        void onAction(() => {
          skipBlur.current = false; setDraftPhase("editing");
          setSourceId(next?.id ?? ""); setStart("0"); setEnd(String(grid ? maximumSourceFrame(next?.durationMs ?? 0) : (next?.durationMs ?? 0) / 1000));
        }).catch(() => {});
      }}>{sources.map(item => <option key={item.id} value={item.id}>{presentations.get(item.id)?.label ?? item.displayName}</option>)}</select></label>
      <label>{t(grid ? "sequence.inFrames" : "sequence.inSeconds")}<input disabled={fieldsDisabled} data-manual-range type="number" step={grid ? "1" : "0.001"} min="0" value={start} aria-invalid={!valid} aria-describedby={rangeHintId} onChange={event => { skipBlur.current = false; setDraftPhase("editing"); setStart(event.target.value); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={draftKey} onBlur={confirmDraft} /></label>
      <label>{t(grid ? "sequence.outFrames" : "sequence.outSeconds")}<input disabled={fieldsDisabled} data-manual-range type="number" step={grid ? "1" : "0.001"} min="0" max={grid ? maximum : maximum / 1000} value={end} aria-invalid={!valid} aria-describedby={rangeHintId} onChange={event => { skipBlur.current = false; setDraftPhase("editing"); setEnd(event.target.value); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={draftKey} onBlur={confirmDraft} /></label>
      <button type="button" className="secondary-button" disabled={disabled || !valid} onClick={() => range("append")}>{t("sequence.append")}</button>
      <button type="button" className="secondary-button" disabled={disabled || !valid || !selected} onClick={() => range("insert")}>{t("sequence.insert")}</button>
      <button type="button" className="secondary-button" disabled={disabled || !valid || !selected || sourceId !== selected.sourceId || sourceStartMs === selected.sourceStartMs && sourceEndMs === selected.sourceEndMs} onClick={() => range("trim")}>{t("sequence.trim")}</button>
      <span id={rangeHintId} role="status">{t(!valid ? "preview.rangeInvalid" : selected?.sourceId === sourceId ? "sequence.rangeAutoCommit" : "sequence.rangeDraft")}</span>
    </fieldset>
    <div className="manual-sequence-actions">
      <button {...shortcutProps("duplicate", t)} type="button" className="secondary-button" disabled={disabled || !chosen.length} onClick={() => {
        if (chosen.length > 1) void edit({ type: "duplicate-many", clipIds: chosen });
        else if (chosen[0]) void edit({ type: "duplicate", clipId: chosen[0] });
      }}>{t(chosen.length > 1 ? "sequence.duplicateSelection" : "sequence.duplicate")}</button>
      <button {...shortcutProps("split", t)} type="button" className="secondary-button" disabled={disabled || !canSplit} onClick={() => { if (selected) void edit(grid ? { type: "split", clipId: selected.id, timelineAtFrame: splitFrame! } : { type: "split", clipId: selected.id, timelineAtMs: playheadMs }); }}>{t("sequence.split")}</button>
      <button {...shortcutProps("earlier", t)} type="button" className="secondary-button" disabled={disabled || firstChosen <= 0} onClick={() => move(-1)}>{t("sequence.earlier")}</button>
      <button {...shortcutProps("later", t)} type="button" className="secondary-button" disabled={disabled || lastChosen < 0 || lastChosen >= clips.length - 1} onClick={() => move(1)}>{t("sequence.later")}</button>
      <button {...shortcutProps("remove", t)} type="button" className="secondary-button" disabled={disabled || !chosen.length} onClick={() => {
        if (chosen.length > 1) void edit({ type: "remove-many", clipIds: chosen });
        else if (selected) void edit({ type: "remove", clipId: selected.id });
      }}>{t(chosen.length > 1 ? "sequence.removeSelection" : "sequence.remove")}</button>
      {!chosen.length && <span>{t("sequence.selectClip")}</span>}
    </div>
    {!grid && <ManualSequenceConformReview backend={backend} project={project} busy={disabled} t={t} onEdit={onEdit} onAction={onAction} />}
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
  let endFrame = 0;
  const grid = project.timeline.timingPolicy === "cfr30";
  for (const clip of clips) {
    const source = sources.get(clip.sourceId);
    if (!source || clip.trackId !== track!.id || clip.speed !== 1 || clip.volume !== 1 || clip.opacity !== 1 || !supportsManualClipExtensions(clip)
      || ![clip.timelineStartMs, clip.timelineEndMs, clip.sourceStartMs, clip.sourceEndMs].every(grid ? Number.isFinite : Number.isSafeInteger)
      || clip.timelineStartMs !== end || clip.sourceStartMs < 0 || clip.sourceStartMs >= clip.sourceEndMs || clip.sourceEndMs > source.durationMs!) return undefined;
    if (grid) {
      const timing = clip.frameTiming;
      if (!timing || timing.version !== 1 || ![timing.timelineStartFrame, timing.timelineEndFrame, timing.sourceStartFrame, timing.sourceEndFrame].every(isCfr30Frame)
        || timing.timelineStartFrame !== endFrame || timing.timelineEndFrame - timing.timelineStartFrame !== timing.sourceEndFrame - timing.sourceStartFrame
        || timing.sourceStartFrame >= timing.sourceEndFrame || timing.sourceEndFrame > maximumSourceFrame(source.durationMs!)
        || clip.timelineStartMs !== framesToMilliseconds(timing.timelineStartFrame) || clip.timelineEndMs !== framesToMilliseconds(timing.timelineEndFrame)
        || clip.sourceStartMs !== framesToMilliseconds(timing.sourceStartFrame) || clip.sourceEndMs !== framesToMilliseconds(timing.sourceEndFrame)) return undefined;
      endFrame = timing.timelineEndFrame;
    } else if (clip.frameTiming || clip.timelineEndMs - clip.timelineStartMs !== clip.sourceEndMs - clip.sourceStartMs) return undefined;
    end = clip.timelineEndMs;
  }
  return project.timeline.durationMs === end ? clips : undefined;
}
