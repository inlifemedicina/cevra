import type { ManualVideoSequenceConformPreview, ManualVideoSequenceEdit } from "@cevra/application";
import type { ProjectIR } from "@cevra/project-ir";
import { useEffect, useRef, useState } from "react";
import type { DesktopBackend } from "../backend/desktop-backend";
import { maximumSourceFrame, frameInput, framesToMilliseconds, isCfr30Frame } from "../frame-timing";
import type { Translate } from "../ui-model";
import type { RangeActionGate } from "../range-activation-guard";

/** Disposable review drafts; one typed conform command owns canonical conversion. */
export function ManualSequenceConformReview({ backend, project, busy, t, onEdit, onAction }: {
  backend?: DesktopBackend; project: Readonly<ProjectIR>; busy: boolean; t: Translate;
  onEdit(request: ManualVideoSequenceEdit): Promise<void>;
  onAction: RangeActionGate;
}) {
  const [proposal, setProposal] = useState<ManualVideoSequenceConformPreview | null>(null);
  const [drafts, setDrafts] = useState<{ clipId: string; sourceStartFrame: string; sourceEndFrame: string }[]>([]);
  type Pending = { epoch: number; snapshot: string | null };
  const [pendingState, setPendingState] = useState<Pending | null>(null);
  const pendingFlight = useRef<Pending | null>(null);
  const [errorSnapshot, setErrorSnapshot] = useState<string | null>(null);
  const generation = useRef(0);
  const snapshot = project.history.headSnapshotId!;
  const latestSnapshot = useRef(snapshot); latestSnapshot.current = snapshot;
  // Bind display and confirmation to the immutable proposal, rather than waiting
  // for an effect to clear old values after a canonical snapshot change.
  const review = proposal?.expectedSnapshotId === snapshot ? proposal : null;
  const pending = Boolean(pendingState && (pendingState.snapshot === null || pendingState.snapshot === snapshot));
  const error = errorSnapshot === snapshot;
  useEffect(() => () => { ++generation.current; }, []);
  function setPending(value: Pending | null) { pendingFlight.current = value; setPendingState(value); }
  function finish(epoch: number) {
    if (epoch === generation.current && pendingFlight.current?.epoch === epoch) setPending(null);
  }
  async function readReview() {
    if (busy || pendingFlight.current && (pendingFlight.current.snapshot === null || pendingFlight.current.snapshot === snapshot) || !backend?.previewManualSequenceConform) return;
    const epoch = ++generation.current;
    setPending({ epoch, snapshot: null }); setErrorSnapshot(null);
    let started = false;
    try {
      await onAction(current => { started = true; void readSettled(current, epoch); });
    } catch { if (epoch === generation.current) { setErrorSnapshot(latestSnapshot.current); setProposal(null); } }
    finally { if (!started) finish(epoch); }
  }
  async function readSettled(current: Readonly<ProjectIR>, epoch: number) {
    if (epoch !== generation.current) return;
    const readSnapshot = current.history.headSnapshotId!;
    setPending({ epoch, snapshot: readSnapshot });
    try {
      const value = await backend!.previewManualSequenceConform!({ version: 1, expectedSnapshotId: readSnapshot });
      // The settled snapshot can arrive before React renders its props. Store
      // only that immutable binding; display still requires an exact head match.
      // A newer read/cancel retires this response by generation.
      if (epoch !== generation.current) return;
      if (value.version !== 1 || value.expectedSnapshotId !== readSnapshot || value.clips.length !== current.timeline.clips.length
        || new Set(value.clips.map(clip => clip.clipId)).size !== value.clips.length
        || value.clips.some(clip => !current.timeline.clips.some(original => original.id === clip.clipId))) throw { code: "MANUAL_SEQUENCE_STALE" };
      setProposal(value); setDrafts(value.clips.map(clip => ({ clipId: clip.clipId, sourceStartFrame: String(clip.frameTiming.sourceStartFrame), sourceEndFrame: String(clip.frameTiming.sourceEndFrame) })));
    } catch { if (epoch === generation.current) { setErrorSnapshot(readSnapshot); setProposal(null); } }
    finally { finish(epoch); }
  }
  let nextFrame = 0;
  const rows = review?.clips.map((clip, index) => {
    const draft = drafts[index]!;
    const sourceStartFrame = frameInput(draft.sourceStartFrame), sourceEndFrame = frameInput(draft.sourceEndFrame);
    const source = project.sources.find(source => source.id === clip.sourceId)!;
    const valid = sourceStartFrame !== null && sourceEndFrame !== null && sourceStartFrame < sourceEndFrame && sourceEndFrame <= maximumSourceFrame(source.durationMs!) && isCfr30Frame(nextFrame + (sourceEndFrame - sourceStartFrame));
    const timelineStartFrame = nextFrame;
    if (valid) nextFrame += sourceEndFrame! - sourceStartFrame!;
    const timing = { timelineStart: timelineStartFrame, timelineEnd: nextFrame, sourceStart: sourceStartFrame, sourceEnd: sourceEndFrame };
    return { clip, draft, valid, timing, sourceStartFrame, sourceEndFrame };
  });
  const canCommit = Boolean(rows?.length && rows.every(row => row.valid));
  async function confirm() {
    if (busy || pending || !canCommit || !rows || !review) return;
    const epoch = ++generation.current;
    const reviewedSnapshot = review.expectedSnapshotId;
    setPending({ epoch, snapshot: reviewedSnapshot });
    try {
      await onEdit({ version: 2, expectedSnapshotId: reviewedSnapshot, type: "conform", clips: rows.map(row => ({ clipId: row.clip.clipId, sourceStartFrame: row.sourceStartFrame!, sourceEndFrame: row.sourceEndFrame! })) });
      if (epoch === generation.current) setProposal(null);
    } catch { if (epoch === generation.current) { setErrorSnapshot(latestSnapshot.current); setProposal(null); } }
    finally { finish(epoch); }
  }
  return <section className="manual-sequence-conform" aria-label={t("sequence.conformTitle")}>
    <button type="button" className="secondary-button" disabled={busy || pending || !backend?.previewManualSequenceConform} onClick={() => void readReview()}>{t("sequence.reviewConform")}</button>
    {pending && !review && <p role="status">{t("sequence.conformLoading")}</p>}
    {error && <p role="alert">{t("sequence.conformFailed")}</p>}
    {review && <>
      <p>{t("sequence.conformHint")}</p>
      {rows!.map(({ clip, draft, valid, timing }, index) => <fieldset key={clip.clipId} disabled={busy || pending}>
        <legend>{project.sources.find(source => source.id === clip.sourceId)?.displayName} · {clip.clipId}</legend>
        <label>{t("sequence.inFrames")}<input type="number" step="1" min="0" value={draft.sourceStartFrame} onChange={event => setDrafts(values => values.map((value, i) => i === index ? { ...value, sourceStartFrame: event.target.value } : value))} /></label>
        <label>{t("sequence.outFrames")}<input type="number" step="1" min="1" value={draft.sourceEndFrame} onChange={event => setDrafts(values => values.map((value, i) => i === index ? { ...value, sourceEndFrame: event.target.value } : value))} /></label>
        {(["timelineStart", "timelineEnd", "sourceStart", "sourceEnd"] as const).map(boundary => {
          const frame = timing[boundary];
          if (frame === null || !isCfr30Frame(frame)) return null;
          const projectedMs = framesToMilliseconds(frame);
          const originalMs = clip.boundaries[boundary].originalMs;
          const label = { timelineStart: "sequence.boundaryTimelineStart", timelineEnd: "sequence.boundaryTimelineEnd", sourceStart: "sequence.boundarySourceStart", sourceEnd: "sequence.boundarySourceEnd" } as const;
          return <output key={boundary}>{t("sequence.boundaryDelta", { boundary: t(label[boundary]), original: originalMs.toFixed(3), frame, projected: projectedMs.toFixed(3), delta: (projectedMs - originalMs).toFixed(3) })}</output>;
        })}
        {!valid && <p role="alert">{t("sequence.conformCollapsed")}</p>}
      </fieldset>)}
      <button type="button" className="secondary-button" disabled={busy || pending || !canCommit} onClick={() => void confirm()}>{t("sequence.conformConfirm")}</button>
      <button type="button" className="secondary-button" disabled={pending} onClick={() => { void onAction(() => { ++generation.current; setProposal(null); setErrorSnapshot(null); setPending(null); }).catch(() => {}); }}>{t("sequence.conformCancel")}</button>
    </>}
  </section>;
}
