import type { EditorialDraftState, EditorialDraftV1, ReviseEditorialDraftRequest } from "@cevra/application";
import { useEffect, useState } from "react";
import type { Translate } from "../ui-model";

export function EditorialDraftPanel({ state, busy, error, t, onRefresh, onRevise, onSourceSelect }: {
  state: EditorialDraftState | null; busy: boolean; error: boolean; t: Translate;
  onRefresh(): void; onRevise(request: ReviseEditorialDraftRequest): Promise<void>;
  onSourceSelect(sourceId: string): void;
}) {
  return <section className="editorial-review" aria-labelledby="editorial-review-title">
    <div className="editorial-heading"><h3 id="editorial-review-title">{t("editorialReview.title")}</h3><button type="button" className="text-button" onClick={onRefresh} disabled={busy}>{t("editorialReview.refresh")}</button></div>
    {error && <p role="alert">{t("editorialReview.error")}</p>}
    {!state && <p role="status">{t("editorialReview.loading")}</p>}
    {state?.status === "empty" && <p>{t("editorialReview.empty")}</p>}
    {state?.status === "stale" && <p role="status">{t("editorialDraft.error.stale")}</p>}
    {state?.status === "current" && <DraftContents key={JSON.stringify([state.draft.id, state.draft.analysis.executionId, state.draft.analysis.contextId, state.draft.analysis.binding.projectId])} draft={state.draft} busy={busy} t={t} onRevise={onRevise} onSourceSelect={onSourceSelect} />}
  </section>;
}

function DraftContents({ draft, busy, t, onRevise, onSourceSelect }: { draft: EditorialDraftV1; busy: boolean; t: Translate; onRevise(request: ReviseEditorialDraftRequest): Promise<void>; onSourceSelect(sourceId: string): void }) {
  const [edits, setEdits] = useState(() => draft.blocks.map(({ id, title, userNote }) => ({ blockId: id, title, userNote })));
  useEffect(() => { setEdits(draft.blocks.map(({ id, title, userNote }) => ({ blockId: id, title, userNote }))); }, [draft.id, draft.revision]);
  const valid = edits.every(edit => edit.title.trim().length > 0 && edit.title.length <= 200 && edit.userNote.length <= 2000);
  const changed = edits.some(edit => { const original = draft.blocks.find(block => block.id === edit.blockId)!; return original.title !== edit.title || original.userNote !== edit.userNote; });
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
        return <li key={block.id} data-block-id={block.id}>
          <div className="editorial-block-heading"><span>{t("editorialReview.block", { number: index + 1 })}</span>{draft.caveatObservationIds.includes(block.observationId) && <strong className="editorial-caveat">{t("editorialDraft.block.caveat")}</strong>}</div>
          <label>{t("editorialReview.blockTitle")}<input value={edit.title} maxLength={200} disabled={busy} onChange={event => update("title", event.target.value)} /></label>
          <p className="editorial-statement">{observation.statement}</p>
          <details><summary>{t("editorialReview.sourcesAndReason")}</summary><p>{observation.justification}</p><p>{t("editorialReview.uncertainty")}: {t(`editorialReview.uncertainty.${observation.uncertainty}`)}</p>
            {block.evidenceReferences.map(ref => { const source = draft.evidence.find(item => item.reference === ref)!; return <blockquote key={ref}><button type="button" className="text-button" onClick={() => onSourceSelect(source.sourceId)} aria-label={t("editorialReview.selectSource", { reference: ref })}>{ref}</button><p>{source.text}</p></blockquote>; })}
          </details>
          <label>{t("editorialReview.userNote")}<textarea rows={2} value={edit.userNote} maxLength={2000} disabled={busy} onChange={event => update("userNote", event.target.value)} /></label>
          <div className="editorial-order"><button type="button" disabled={busy || !valid || index === 0} onClick={() => void move(index, -1)} aria-label={t("editorialReview.moveUp", { number: index + 1 })}>{t("editorialReview.up")}</button><button type="button" disabled={busy || !valid || index === draft.blocks.length - 1} onClick={() => void move(index, 1)} aria-label={t("editorialReview.moveDown", { number: index + 1 })}>{t("editorialReview.down")}</button></div>
        </li>;
      })}
    </ol>
    <button type="button" className="secondary-button" disabled={busy || !valid || !changed} onClick={() => void onRevise({ expectedRevision: draft.revision, blockEdits: edits })}>{t("editorialReview.saveNotes")}</button>
    <button type="button" className="text-button" disabled={busy || !changed} onClick={() => setEdits(draft.blocks.map(({ id, title, userNote }) => ({ blockId: id, title, userNote })))}>{t("editorialReview.discardNotes")}</button>
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
