import type { EditorialDraftState, EditorialDraftV1, ReviseEditorialDraftRequest } from "@cevra/application";
import { useEffect, useId, useRef, useState } from "react";
import type { Translate } from "../ui-model";
import type { SourcePresentation } from "../source-presentation";

export function EditorialDraftPanel({ state, presentations, busy, error, t, onRefresh, onRevise, onSourceSelect }: {
  state: EditorialDraftState | null; busy: boolean; error: boolean; t: Translate;
  presentations: ReadonlyMap<string, SourcePresentation>;
  onRefresh(): void; onRevise(request: ReviseEditorialDraftRequest): Promise<void>;
  onSourceSelect(sourceId: string): void;
}) {
  const retained = useRef<EditorialDraftV1 | null>(null);
  if (state?.status === "current") retained.current = state.draft;
  else if (state?.status === "empty" && !error) retained.current = null;
  const draft = state?.status === "current" ? state.draft : state?.status === "stale" ? retained.current : null;
  return <section className="editorial-review" aria-labelledby="editorial-review-title">
    <div className="editorial-heading"><h3 id="editorial-review-title">{t("editorialReview.title")}</h3><button type="button" className="text-button" onClick={onRefresh} disabled={busy}>{t("editorialReview.refresh")}</button></div>
    {error && <p role="alert">{t("editorialReview.error")}</p>}
    {!state && !error && <p role="status">{t("editorialReview.loading")}</p>}
    {state?.status === "empty" && <p>{t("editorialReview.empty")}</p>}
    {state?.status === "stale" && <p role="status">{t("editorialDraft.error.stale")}</p>}
    {draft && <DraftContents key={JSON.stringify([draft.id, draft.analysis.executionId, draft.analysis.contextId, draft.analysis.binding.projectId])} draft={draft} presentations={presentations} busy={busy || error || state?.status !== "current"} t={t} onRevise={onRevise} onSourceSelect={onSourceSelect} />}
  </section>;
}

function DraftContents({ draft, presentations, busy, t, onRevise, onSourceSelect }: { draft: EditorialDraftV1; presentations: ReadonlyMap<string, SourcePresentation>; busy: boolean; t: Translate; onRevise(request: ReviseEditorialDraftRequest): Promise<void>; onSourceSelect(sourceId: string): void }) {
  const [edits, setEdits] = useState(() => draft.blocks.map(({ id, title, userNote }) => ({ blockId: id, title, userNote })));
  const hintId = useId();
  useEffect(() => { setEdits(draft.blocks.map(({ id, title, userNote }) => ({ blockId: id, title, userNote }))); }, [draft.id, draft.revision]);
  const valid = edits.every(edit => edit.title.trim().length > 0 && edit.title.length <= 200 && edit.userNote.length <= 2000);
  const changed = edits.some(edit => { const original = draft.blocks.find(block => block.id === edit.blockId)!; return original.title !== edit.title || original.userNote !== edit.userNote; });
  const editingHint = busy ? t("editorialReview.updating") : !valid ? t("editorialReview.titleRequired") : changed ? t("editorialReview.pendingNotes") : t("editorialReview.noPendingNotes");
  async function move(index: number, delta: number) {
    const order = draft.blocks.map(block => block.id);
    [order[index], order[index + delta]] = [order[index + delta], order[index]];
    // Preserve unsaved text when a user also changes the sequence.
    await onRevise({ expectedRevision: draft.revision, blockOrder: order, blockEdits: edits });
  }
  return <>
    <p className="editorial-status">{t("editorialReview.reviewRequired")}</p>
    <p>{t("editorialReview.citationSupport")} <strong>{t(`editorialReview.support.${draft.analysisReview.citationSupport}`)}</strong></p>
    <ol className="editorial-blocks">
      {draft.blocks.map((block, index) => {
        const observation = draft.analysis.candidate.observations.find(item => item.id === block.observationId)!;
        const edit = edits.find(item => item.blockId === block.id)!;
        function update(field: "title" | "userNote", value: string) { setEdits(current => current.map(item => item.blockId === block.id ? { ...item, [field]: value } : item)); }
        return <li key={block.id} data-block-id={block.id} className="editorial-card">
          <div className="editorial-block-heading"><strong className="editorial-block-number">{t("editorialReview.block", { number: index + 1 })}</strong>{draft.caveatObservationIds.includes(block.observationId) && <strong className="editorial-caveat">{t("editorialDraft.block.caveat")}</strong>}</div>
          <label>{t("editorialReview.blockTitle")}<input aria-label={t("editorialReview.titleForBlock", { number: index + 1 })} aria-invalid={!edit.title.trim() || edit.title.length > 200} aria-describedby={hintId} value={edit.title} maxLength={200} disabled={busy} onChange={event => update("title", event.target.value)} /></label>
          <p className="editorial-section-label">{t("editorialReview.originalAnalysis")}</p>
          <p className="editorial-statement">{observation.statement}</p>
          <label>{t("editorialReview.userNote")}<textarea aria-label={t("editorialReview.noteForBlock", { number: index + 1 })} aria-invalid={edit.userNote.length > 2000} aria-describedby={hintId} rows={2} value={edit.userNote} maxLength={2000} disabled={busy} onChange={event => update("userNote", event.target.value)} /></label>
          <details><summary>{t("editorialReview.sourcesAndReason")}</summary><p>{observation.justification}</p><p>{t("editorialReview.uncertainty")}: {t(`editorialReview.uncertainty.${observation.uncertainty}`)}</p>
            {block.evidenceReferences.map(ref => {
              const evidence = draft.evidence.find(item => item.reference === ref)!;
              const presentation = presentations.get(evidence.sourceId);
              const source = presentation?.label ?? t("editorialReview.sourceUnavailable");
              return <blockquote key={ref} className="editorial-source">
                <strong>{presentation ? t(presentation.kind === "image" ? "editorialReview.imageExcerpt" : "editorialReview.sourceExcerpt", { source }) : source}</strong>
                <p>{evidence.text}</p>
                <small>{t("editorialReview.analysisReference", { reference: ref })}</small>
                {presentation && <small>{t("editorialReview.sourceFile", { filename: presentation.fileName })}</small>}
                <button type="button" className="editorial-source-button" disabled={!presentation || busy} onClick={() => onSourceSelect(evidence.sourceId)}>{presentation ? t(presentation.kind === "image" ? "editorialReview.viewImageSource" : "editorialReview.viewSource", { source }) : source}</button>
              </blockquote>;
            })}
          </details>
          <div className="editorial-order"><button type="button" disabled={busy || !valid || index === 0} title={busy || !valid ? editingHint : index === 0 ? t("editorialReview.firstBlock") : undefined} onClick={() => void move(index, -1)} aria-label={t("editorialReview.moveUp", { number: index + 1 })}>{t("editorialReview.up")}</button><button type="button" disabled={busy || !valid || index === draft.blocks.length - 1} title={busy || !valid ? editingHint : index === draft.blocks.length - 1 ? t("editorialReview.lastBlock") : undefined} onClick={() => void move(index, 1)} aria-label={t("editorialReview.moveDown", { number: index + 1 })}>{t("editorialReview.down")}</button></div>
        </li>;
      })}
    </ol>
    <p id={hintId} className="editorial-editing-hint" role="status">{editingHint}</p>
    {changed && <p role="status">{t("editorialReview.reorderSavesNotes")}</p>}
    <button type="button" className="secondary-button" disabled={busy || !valid || !changed} title={busy || !valid || !changed ? editingHint : undefined} onClick={() => void onRevise({ expectedRevision: draft.revision, blockEdits: edits })}>{t("editorialReview.saveNotes")}</button>
    <button type="button" className="text-button" disabled={busy || !changed} title={busy || !changed ? editingHint : undefined} onClick={() => setEdits(draft.blocks.map(({ id, title, userNote }) => ({ blockId: id, title, userNote })))}>{t("editorialReview.discardNotes")}</button>
    <details className="editorial-limitations"><summary>{t("editorialReview.assessment")}</summary>
      {draft.analysisReview.notes.map((note, i) => <p key={i}>{note}</p>)}
      {draft.analysisReview.priorChecks.map(check => <p key={check.id}><strong>{check.id}: {t(`editorialReview.support.${check.outcome}`)}</strong> — {check.detail}</p>)}
      {draft.analysis.candidate.relations.map(relation => <p key={relation.id}>{relation.statement} — {relation.justification} ({[...new Set([...relation.leftEvidenceReferences, ...relation.rightEvidenceReferences])].join(", ")}); {t("editorialReview.uncertainty")}: {t(`editorialReview.uncertainty.${relation.uncertainty}`)}</p>)}
      {draft.analysis.candidate.uncertainties.map((uncertainty, i) => <p key={i}>{uncertainty.statement} — {uncertainty.reason} ({uncertainty.evidenceReferences?.join(", ")})</p>)}
      <ul>{draft.limitations.map((limit, i) => <li key={i}>{limit}</li>)}</ul>
    </details>
    <small>{t("editorialReview.memoryOnly")}</small>
  </>;
}
