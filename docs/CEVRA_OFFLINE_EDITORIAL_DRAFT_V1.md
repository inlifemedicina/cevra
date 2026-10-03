# Offline Editorial Draft V1

**Status:** IMPLEMENTED / IN REVIEW; not integrated or a delivered editing UI.

The owner explicitly approved the smallest offline passage from the existing
F-A02 analysis candidate to a source-linked, user-reviewable editorial proposal.
This is a bounded Application extension of D9, not a declaration that the whole
real-agent gate is complete or that strategy/take selection/cut planning is
generally delivered. Architecture Canon §7 and ADR 0030 retain their boundaries.

## Contract and behavior

`EditorialDraftService` consumes an existing `SemanticEditorialAnalysisCandidateV1`
and an explicit caller-supplied prior assessment. It calls no analyzer, adapter,
provider, CLI, engine, reservation, command or persistence API. It returns a
deeply immutable, process-local `cevra.editorial-draft.v1` proposal, always
`review-required`. This is not a stored project, approved Change Set or execution
permission. No Project IR schema or History mutation is introduced.

The principal initial sequence follows the existing observation order, one block
per observation. This is a transparent starting proposal, not new semantic
reasoning, ranking, best-take selection or deduplication. Every observation,
caveat, relation, uncertainty, original limitation and prior assessment remains
available. Source links retain E1/E2 references, canonical source/transcript
identity, text and word/segment links; source intervals are omitted from the
draft because they are evidence metadata rather than planned cuts.

`revise` permits title, user-note and complete sequence changes with an expected
draft revision. It cannot remove/duplicate blocks, rewrite original assertions,
hide caveats, change citations or convert prose into commands. Editing a title
or user note is distinguished from altering the original analysis. Failed edits
leave the usable draft and project untouched; unchanged revisions are no-ops.
PT-BR and EN-US have the same contract and localized proposal labels/errors.

Creation revalidates the closed analysis/candidate schema, current binding,
coverage/reference consistency, canonical transcript fragments and quotes.
Evidence uses the same whitespace/punctuation rendering as the transcript
projector. Coverage classifications match canonical source availability;
complete coverage cannot omit an available source, and omitted partial evidence
must remain explicitly outstanding. These checks do not re-prove full pagination.
Revision and `assertCurrent` also detect project/transcript changes, superseded
draft revisions and commit→undo/redo-branch replacement by journal identity,
even when entry count and visible snapshot are unchanged. A context already
seen by the service cannot be reused against a changed journal.

The service does not authenticate a saved file or re-prove its transport receipt,
provider identity or semantic correctness. On first ingestion it has the legacy
analysis binding (revision/snapshot/journal count/transcript digests), not a
historical full-journal witness. The caller must supply the accepted analysis
and its matching history. No new durable storage/recovery format is introduced;
serialized draft objects cannot impersonate service-issued revision objects.

## Concrete F-A02 demonstration

The implementation was run locally against the existing private F-A02 result
and its matching history archive; no analyzer was invoked. Original candidate
and prior review remained unchanged, the original result hash was unchanged,
history/archive and redo were preserved. The proposal was revised with these
presentation titles, without changing any original statement:

| Order | Reviewable block title | Evidence |
|---|---|---|
| 1 | Oficina sob encomenda | E1 |
| 2 | Condição essencial do prazo | E1 |
| 3 | Entrega com material disponível | E2 |
| 4 | Etiqueta de acompanhamento | E2 |
| 5 | Ressalva sobre pedidos futuros | E2 |

The availability condition stays explicit; label accompaniment is retained as
a complement; future-material uncertainty stays explicit. Possible equivalence
between E1/E2 remains unresolved. Both caveat observations and both relations
remain present. All source timing bases are `none`; no duration, precise cut,
take choice, applied command, Change Set, preview or export is produced.

Citation support remains **PARTIAL**: the label observation compares absence in
E1 but cites only E2, while its relation cites both. The prior literal helper
remains `condition:false, complement:true, repetition:false, uncertainty:false`.
This implementation preserves that assessment; it does not rewrite, rerun or
reinterpret the old oracle as a new PASS. The public test fixture is a synthetic
equivalent with synthetic identities, not the private result/receipt/ledger.

## Validation and next gate

The functional criterion is a reviewable block sequence with source links,
explicit caveats/uncertainty and honest limits, plus fail-closed revisions and
staleness detection. Targeted tests exercise preservation, editing, invalid
references/quotes/source text, coverage, forbidden edits, stale project/transcript
or draft revisions, redo replacement and locale parity. Existing semantic-boundary
and Application tests retain their original criteria. CI and independent review
are recorded in the draft PR; they do not constitute Product Owner acceptance
of editing or subjective narrative quality.

D5-T1/D4-T2/D3-T2 inform preservation; D9-T1/T2 inform the reviewable proposal.
The existing acceptance catalog remains the authority: integrated mounting and
I1-T1's plan/Change Set remain blocked beyond this Application-only slice.
The next gate is review/integration of this bounded proposal, followed by a
separately scoped consumer/strategy decision; timing-backed take/cut planning
retains its existing evidence and typed-command prerequisites. No new live
scenario, model, feature, UI surface, engine, quota or merge is authorized here.

**Director impact:** compatible extension. A future Director/presentation
consumer may request and display/revise this derived proposal; it receives no
additional provider, engine, History or execution authority. Progress remains
55%; the one real F-A02 allocation remains exhausted 1/1 with zero remaining.
