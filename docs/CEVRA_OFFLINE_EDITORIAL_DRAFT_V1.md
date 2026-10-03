# Offline Editorial Draft V1

**Status:** Application service INTEGRATED via PR #75 after #74. Offline host/backend/UI review consumer INTEGRATED via PR #77. Designated F-A02 offline admission IN DEVELOPMENT / NOT MERGED; scope below.

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
The Application service is integrated; the owner subsequently approved the
bounded offline consumer described below. Further strategy requires its own decision; timing-backed take/cut planning
retains its existing evidence and typed-command prerequisites. The original Application-only approval authorized no new live scenario, model,
UI surface, engine, quota or merge; the later consumer approval below is separately bounded.

**Director impact:** compatible extension. A future Director/presentation
consumer may request and display/revise this derived proposal; it receives no
additional provider, engine, History or execution authority. Progress remains
55%; the one real F-A02 allocation remains exhausted 1/1 with zero remaining.


<a id="offline-review-consumer"></a>

## Offline host/backend/UI review consumer — 2026-10-03

**Status:** INTEGRATED via PR #77 at `73f8427ac18337f779ceeda9c93f60edf35df33b`, post-merge CI `37127986470` SUCCESS 5/5 and Exact Runtime `37127986468` SUCCESS 1/1 (attempt 1). The owner approved the smallest proposed panel after the morning report. It occupies the existing Director review area, replacing its static 12-change fixture with accepted-analysis review or an honest empty/stale state. Preview and timeline remain the same project surface. PT-BR and EN-US localize controls/status/errors; original analysis text and user content retain their own language.

`DesktopSession.acceptEditorialAnalysis` is a trusted **in-process Application handoff**, not a WebView/JSONL method, file importer, authentication mechanism or persisted record. The caller supplies an already accepted `CreateEditorialDraftRequest` and the matching history. `EditorialDraftService.create` revalidates the original closed contract, source citations, provenance fields and legacy binding. Admission is one-shot per host session: a second handoff is rejected, preventing a previous revision-0 client from editing a replacement context. Another accepted analysis requires a new host session with its matching history. The host keeps the accepted analysis and the exact service-issued revision privately; snapshot queries return a detached presentation copy. The existing first-ingestion limitation remains: no new historical full-journal witness, transport receipt authentication or semantic re-proof is invented.

Only `editorial.snapshot` / `editorial.revise` and their corresponding `desktop_get_editorial_draft` / `desktop_revise_editorial_draft` commands are added to the main-window ACL. There is no generic invoke, admission, provider, shell, filesystem or network permission. Revision accepts the existing expected revision/title/block-order/block-edit contract; service identity never crosses the UI boundary. The same-history binding and service journal witness disable revisions after canonical changes, undo/redo changes or replaced journal branches. Rejected revisions retain the valid prior draft. Draft presentation revisions do not change Project IR, its journal/checkpoints or redo history. No persistent draft undo/recovery format is introduced.

The panel exposes five source-linked blocks, original assertions, justifications, uncertainty, caveat badges, relations/limitations and unchanged prior checks/PARTIAL assessment. Source actions select the existing canonical source; they do not seek to fabricated cut timing. Moving a block preserves unsaved title/note edits in the same revision request. Unsaved fields survive workspace navigation and refresh of the same draft revision; a local discard action restores the current titles/notes without changing the service, project or saved order. Invalid or concurrent revisions require refresh; stale proposals expose no editable blocks. The original analysis/citations/caveats cannot be deleted or rewritten. Session-only retention is visible; apply remains unavailable.

The production host starts empty until a trusted Application producer performs the handoff. The original #77 slice added no saved-analysis picker, disk loading, analysis persistence, provider invocation or automatic recovery of drafts. The subsequent designated admission approval below permits its exact local file pair. These unavailable behaviors must not be implied by the fixture.

### Offline verification and visible fixture

One canonical synthetic fixture is `apps/desktop/src/fixtures/editorial-review.json`; it preserves the prior textual scenario, five observations, two caveats, two relations, explicit PARTIAL assessment and a redo branch. It contains synthetic identities/provenance only, not the private F-A02 result, receipt, ledger or paths. Host protocol tests use this same fixture. The explicit development URL `?editorial-fixture=1` selects a presentation adapter using the original Application service; it is excluded from production builds and is not proof of native saved-result admission. The browser-safe `@cevra/application/editorial-draft` export exposes the existing service without loading Node-only media URI code into this development fixture.

Automated checks cover trusted admission, matching/foreign bindings, detached query copies, closed revisions, unsupported analysis/draft/command fields, immutable citations and prior assessment, title/note/order editing, retained redo, canonical staleness, UI source selection and locale parity. The full native host path and visible browser fixture have distinct evidence; neither calls a provider. Native compile/ACL and supported-Python runtime coverage are required CI gates. Review/CI do not replace subjective owner acceptance of the panel or narrative quality. D4-T2/D5-T1 and D9-T1/T2 inform this bounded source-linked review; strategy/mounting and I1-T1's plan/Change Set remain BLOCKED beyond this consumer.

Local pre-publication verification passed TypeScript and the production Vite build, all 53 desktop tests and all eight new host protocol tests. The combined Application/host suite passed 319/321: two existing managed-transcription availability tests failed with the available Python 3.9 runtime, which does not satisfy the supported Python 3.12 gate. Their expectations were preserved; no runtime was installed or test skipped. Native Rust compilation is unavailable locally and remains a required CI check. The production bundle contains no synthetic-analysis/context markers or fixture selector. Controlled Chrome demonstration passed PT/EN display, five blocks/two caveats/PARTIAL, title/note editing and reorder without project revision changes, source selection, navigation, local discard and stale rejection after canonical redo. Screenshots and detailed local evidence remain outside the repository. Final independent review and remote CI evidence belong in the Draft PR; this record does not claim their completion in advance.

**Director impact:** compatible proposal-review extension. No provider/engine, canonical edit, cut, timing, export or persistent admission authority is added. Progress remains 55%; F-A02 remains closed/exhausted 1/1 with zero remaining.


<a id="designated-fa02-admission"></a>

## Designated F-A02 native offline admission — owner approved 2026-10-03

**Status:** IN DEVELOPMENT / NOT MERGED on `feat/offline-fa02-native-review`, based on integrated #77. This implements the owner-approved local reading of the existing F-A02 result and matching history into a temporary review session. It is deliberately limited to this designated pair, not a general import, analyzer or persistent analysis store.

Native startup accepts exactly `--cevra-fa02-review ROOT RESULT_SHA256 HISTORY_SHA256`. The trusted designation identifies a canonical absolute directory and the previously recorded byte hashes of `first-fa-result.private.json` and `history-archive.json`. Those private paths/hashes are supplied outside the repository and are never WebView arguments. The host validates regular files, bounded bytes, no symlink/alias, stable read identity and exact hashes. It requires the original terminal F-A wrapper and existing analysis contract, then uses `ProjectHistory.fromArchive` and `EditorialDraftService.create` to validate the corresponding project, transcript citations, binding and provenance schema. Hashes identify the selected bytes; they do not authenticate historical provider transport or grant execution permission. The pre-existing first-ingestion full-journal-witness limitation remains explicit. The original producer intentionally records `providerContact: UNKNOWN`; admission preserves that uncertainty instead of rewriting it to confirmed contact.

The host selects this path before opening the active Project Store, runtime, model cache or engines. The session shows **Temporary review · not saved** in PT/EN. Only existing proposal snapshot/revision operations are available; canonical undo/redo, ingest and transcription are unavailable and rejected by the host. Draft edits remain in memory; original artifact bytes and history are retained exactly. Closing loses those proposal edits. Explicitly launching a new session rereads the same pinned pair at revision zero; automatic host recovery cannot re-admit it. A changed, incomplete or invalid designation fails closed without falling back to the ordinary saved project. Ordinary startup behavior is unchanged.

No new Tauri command, WebView filesystem permission, shell permission, CSP exemption, provider call, reservation, timing/cut, apply or export is added. The existing eight command ACL and environment clearing remain. The three new host values come solely from the explicit native startup tuple, without inherited credentials or runtime settings. Private originals, paths, execution/session identifiers and byte hashes are not committed. Tests use the existing canonical synthetic fixture; the actual F-A02 pair is verified only locally. The exact prior PARTIAL assessment and literal helper flags remain separate from schema validation.

Local verification has exercised the actual pair through the real host factory: five blocks, two caveats, PARTIAL, editing/reorder, unchanged project and unchanged original bytes, with zero provider calls. A production-frontend/real-JSONL-host rehearsal also passed PT/EN display, source selection, title/note editing, reorder, workspace navigation, unsaved discard and disabled canonical history controls; only the browser transport substituted the native invoke bridge. Twelve targeted host tests and 54 Desktop tests passed at the original admission checkpoint. Subsequently, private pinned build tools enabled a successful native build and actual window verification. The reviewed visual commit `dd7f1e4` was built and opened as a separate native instance, preserving the older instance and original pair. Screenshots and detailed evidence remain outside the repository. This proves the displayed native visual at that commit; overall Product Owner acceptance remains pending.

**Director impact:** compatible bounded offline admission/review extension. Product Owner visual/narrative acceptance remains pending; strategy/mounting/I1-T1 and other broader capabilities retain their original gates. Progress stays 55%; F-A02 stays closed/exhausted 1/1.


## Subsequent visual and stable-numbering approval — 2026-10-03

[Draft PR #78](https://github.com/inlifemedicina/cevra/pull/78) contains the
owner-approved clearer editorial cards/shared source labels and the subsequent
bounded durable-numbering evolution. The reviewed visual demo at `dd7f1e4`
remains a separate native instance with window-only numbers; the older instance
and original pair were preserved. Final visual identity and human acceptance
remain pending.

The follow-up at `3e9f82e7c4c22a5c0cfa3338d10ee8df5094a7d8` is IN DEVELOPMENT /
NOT MERGED: existing ProjectHistory owns source-ID/number reservations and one
monotonic project counter outside undo, and existing ProjectStore writes V3
while reading V1/V2. It adds no database or audiovisual IR shape. Valid legacy
opening initializes metadata in memory without rewriting saved files; old labels
never persisted cannot be reconstructed. Recovery retains the registry of the
valid recovered checkpoint. The format and approved limits are recorded in
[ADR 0031 in the implementation commit](https://github.com/inlifemedicina/cevra/blob/3e9f82e7c4c22a5c0cfa3338d10ee8df5094a7d8/docs/adr/0031-stable-source-numbering-v1.md).

The implementation tree received independent APPROVE and passed the local
production build plus IR 59/59, Store 15/15, Transcription 50/50, Alignment 33/33,
Host 88/88 and UI 58/58 tests. Exact-head CI remains the implementation PR's
gate. This documentation track adds no feature code or profile implementation.
Editorial review notes remain in memory and no real owner project is migrated
by these tests. Director impact is compatible presentation identity; progress
stays 55%, broader agent gates remain open and F-A02 stays exhausted 1/1.
