import type { ManualVideoSequenceConformPreview, ManualVideoSequenceEdit } from "@cevra/application";
import type { ProjectIR } from "@cevra/project-ir";
import { useEffect, useRef, useState } from "react";
import type { DesktopBackend } from "../backend/desktop-backend";
import { maximumSourceFrame, frameInput, framesToMilliseconds, isCfr30Frame } from "../frame-timing";
import type { Translate } from "../ui-model";

/** Disposable review drafts; one typed conform command owns canonical conversion. */
export function ManualSequenceConformReview({ backend, project, busy, t, onEdit }: {
  backend?: DesktopBackend; project: Readonly<ProjectIR>; busy: boolean; t: Translate;
  onEdit(request: ManualVideoSequenceEdit): Promise<void>;
}) {
  const [review, setReview] = useState<ManualVideoSequenceConformPreview | null>(null);
  const [drafts, setDrafts] = useState<{ clipId: string; sourceStartFrame: string; sourceEndFrame: string }[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const snapshot = project.history.headSnapshotId!;
  useEffect(() => { ++generation.current; setReview(null); setDrafts([]); setError(false); setPending(false); }, [snapshot]);
  useEffect(() => () => { ++generation.current; }, []);
  async function readReview() {
    if (busy || pending || !backend?.previewManualSequenceConform) return;
    const epoch = ++generation.current;
    setPending(true); setError(false);
    try {
      const value = await backend.previewManualSequenceConform({ version: 1, expectedSnapshotId: snapshot });
      if (epoch !== generation.current) return;
      if (value.version !== 1 || value.expectedSnapshotId !== snapshot || value.clips.length !== project.timeline.clips.length
        || new Set(value.clips.map(clip => clip.clipId)).size !== value.clips.length
        || value.clips.some(clip => !project.timeline.clips.some(original => original.id === clip.clipId))) throw { code: "MANUAL_SEQUENCE_STALE" };
      setReview(value); setDrafts(value.clips.map(clip => ({ clipId: clip.clipId, sourceStartFrame: String(clip.frameTiming.sourceStartFrame), sourceEndFrame: String(clip.frameTiming.sourceEndFrame) })));
    } catch { if (epoch === generation.current) { setError(true); setReview(null); } }
    finally { if (epoch === generation.current) setPending(false); }
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
    if (busy || pending || !canCommit || !rows) return;
    setPending(true);
    try {
      await onEdit({ version: 2, expectedSnapshotId: snapshot, type: "conform", clips: rows.map(row => ({ clipId: row.clip.clipId, sourceStartFrame: row.sourceStartFrame!, sourceEndFrame: row.sourceEndFrame! })) });
      setReview(null);
    } catch { setError(true); }
    finally { setPending(false); }
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
      <button type="button" className="secondary-button" disabled={pending} onClick={() => { ++generation.current; setReview(null); setError(false); }}>{t("sequence.conformCancel")}</button>
    </>}
  </section>;
}
