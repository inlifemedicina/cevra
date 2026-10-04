# CEVRA ORBIT — ORGANOGRAMA ATUAL

**Updated:** 2026-10-03
**Authority:** compact sequencing reference; `docs/CEVRA_MASTER_CONTEXT.md`, `docs/ARCHITECTURE_V1.md` and accepted ADRs remain the detailed authorities.
**Current global weighted roadmap progress:** 55%.

```text
CEVRA VIDS
│
├─ 1. CLOSED / PRESERVED FOUNDATIONS
│   ├─ Media Runtime / Architecture Canon / EDVID parity
│   ├─ Project IR + transcript architecture
│   ├─ Desktop shell/runtime integration
│   ├─ persistence / recovery
│   ├─ forced alignment
│   └─ ProjectHistory Scalability V2
│
├─ 2. CORRECTNESS / PARALLEL RUNTIME GATES
│   ├─ pre-editorial correctness prerequisites [CLOSED]
│   ├─ approved coordinated Media Runtime adjustment gate [ACTIVE IN PARALLEL]
│   │   ├─ MR-V01 Durable Source Technical Descriptor V1 [IMPLEMENTED / CLOSED]
│   │   ├─ Slice 5A Native Windows Media Runtime / h264_mf feasibility [IMPLEMENTED / CLOSED]
│   │   └─ Slice 5B Windows H.264 product enablement [NOT STARTED / DECISION GATE]
│   └─ Transcript Cache V1 [IMPLEMENTED / CLOSED]
│
├─ 3. EDITORIAL INTELLIGENCE [ACTIVE]
│   ├─ Editorial Transcript Projection V1 [IMPLEMENTED / CLOSED]
│   ├─ Semantic Editorial Analysis V1
│   │   ├─ Slice A validated analysis boundary [IMPLEMENTED / CLOSED]
│   │   ├─ bounded offline Claude CLI transport/evidence PoC V1 [IMPLEMENTED / CLOSED — PR #57]
│   │   └─ real-agent semantic round-trip [F-A02 DIRECT PT-BR OBSERVED / WHOLE GATE OPEN]
│   │       ├─ INT-CLOUD-01 official ChatGPT eligibility/capability review [RESEARCH / SCHEDULED]
│   │       └─ INT-CLOUD-02 authorized official transport PoC [CONDITIONAL / NOT IMPLEMENTED]
│   ├─ offline evidence-linked editorial draft [APPLICATION #75 / OFFLINE REVIEW #77 INTEGRATED; DESIGNATED ADMISSION IN DEVELOPMENT]
│   ├─ broader strategy [NOT STARTED / NOT AUTHORIZED IMPLICITLY]
│   ├─ take selection [NOT STARTED / NOT AUTHORIZED IMPLICITLY]
│   └─ cut planning [NOT STARTED / NOT AUTHORIZED IMPLICITLY]
│
├─ 4. DETERMINISTIC EDIT EXECUTION
│   ├─ missing typed Project IR edit commands
│   ├─ Cut Compiler
│   └─ Numeric QA / correction loop
│
├─ 5. UX SURFACE CONTRACT
│   ├─ NORMAL
│   │   ├─ EDVID-level directness/simplicity
│   │   ├─ preview — first-video manual IN/OUT [APPROVED / IN DEVELOPMENT; HUMAN ROUND PENDING]
│   │   ├─ visible directly editable timeline
│   │   ├─ contextual inspector
│   │   ├─ presets / visual choices
│   │   └─ natural-language CEVRA field
│   │
│   ├─ MORE CONTROLS
│   │   └─ contextual progressive disclosure
│   │
│   └─ ADVANCED
│       └─ full available editing complexity over the SAME project/timeline
│
├─ 6. NATIVE PREVIEW + SHARED LAYERED TIMELINE
│   └─ Normal and Advanced are exposure levels, not separate editors
│
├─ 7. PRESENTATION / COMPOSITION
│   ├─ captions / conventional audio
│   ├─ composition benchmark
│   ├─ shortform / longform
│   └─ B-roll / overlays / camera / music / SFX
│
├─ 8. CEVRA DIRECTOR / WORKFLOW PRESETS / AI ORCHESTRATION
│   ├─ AI decisions → validated typed plan
│   ├─ direct user intervention at any time
│   └─ one Project IR / one timeline
│
├─ 9. INTEGRATIONS / EXPANSION
│   ├─ agent protocol / external AI surfaces
│   ├─ INT-CLOUD-03 isolated cloud skill feasibility pilot [SCHEDULED / NOT RUN]
│   ├─ remote desktop workflow
│   ├─ INT-CLOUD-04 mobile companion after usable vertical flow [PLANNED / I15 PRESERVED]
│   └─ INT-CLOUD-05 computer-off cloud execution [EVALUATION / FUTURE DECISION GATE]
│       └─ no mandatory cloud renderer, commercial access or V1 delivery implied
│
└─ 10. HARDENING / RELEASE
    ├─ cross-platform validation
    ├─ render/export correctness
    ├─ licensing / entitlement / distribution
    └─ release gate
```

## Product rule

```text
POWER INSIDE
↓
SIMPLE BY DEFAULT
↓
DIRECT MANUAL CONTROL AVAILABLE
↓
FULL COMPLEXITY WHEN THE USER ASKS FOR IT
```

## Change introduced on 2026-09-19

The dependency roadmap was **not reset**. The explicit new checkpoint is **UX Surface Contract**, inserted before Native Preview + Timeline is considered complete. This contract defines Normal, contextual More Controls and Advanced over the same underlying editor state.

## Reconciliation note — 2026-09-21

ProjectHistory Scalability V2 is closed and preserved as a foundation after PR #30. The measured O(commits × transcript payload) failure was removed with compact snapshots and exact transcript blobs while preserving Project IR and V1 compatibility. The cross-platform/runtime correctness prerequisites are also closed. The current active gate remains the approved coordinated Media Runtime adjustment gate. Transcript Cache V1 is closed and remains separate from canonical history/storage.

MR-V01 is closed as the bounded Slice 4 implementation within that gate after
PR #46 and successful post-merge CI plus Exact Runtime. It keeps Project
IR/History/Package at V2, adds no migration and does not start Cut Compiler.
Transcript Cache V1 is implemented and closed by PR #24 on the current
MR-V01/ProjectHistory V2 baseline. Its final implementation binds cache identity
to the actually selected Transcription model, adds source anti-ABA continuity,
normalizes known optional `undefined` inputs without opening the schema, and
enforces adopted descriptor integrity independently of cache policy. Independent
review and post-merge CI plus Exact Runtime passed.

**Slice 5A — Native Windows Media Runtime / h264_mf feasibility — IMPLEMENTED /
CLOSED** by PR #49 and normal merge commit
`660f8cd13f11729d5663e1ff373e9eb91a4bffbb`. Native
run `36442497813` on `c17aea572e91cc1802e73dba5dad03c6b047f0cd` used the
pinned private Python, signed FFmpeg 9.0.1 and uniquely selected signed/static
zlib 1.3.2, schema/integrity-verified the private runtime, and passed the real
horizontal/vertical encode/decode/timing matrix plus sample-offset and
container-offset negative controls. Post-merge CI `36456056888` and Exact
Runtime `36456056825` passed. Windows product enablement remains a separate 5B
decision because typed allow-lists,
publication identity/lifecycle, Application/Desktop integration and
representative hardware acceptance are not delivered by 5A.
Slice 5B is **NOT STARTED**. The coordinated Media Runtime gate remains active
for downstream audio policy, Windows/HDR export, assembled-plan QA,
Composition/preview and release closure, but those residual consumers are not a
serial prerequisite for read-only transcript reasoning. The pre-editorial
correctness prerequisites are closed. **Editorial Transcript Projection V1 is
IMPLEMENTED / CLOSED** by PR #51 and normal merge commit
`56161b2af44c9e2de008bb33bc1706d4e2beaf7e`. Its bounded final remediation
tracks known speaker transitions through partial attribution and removes
quadratic prefix fitting while preserving the approved projection contract.
PR CI `36487114791`, PR Exact Runtime `36487114771`, post-merge CI
`36487922851` and post-merge Exact Runtime `36487922834` passed. **Semantic
Editorial Analysis Boundary V1 — Slice A is IMPLEMENTED / CLOSED** by PR #53
and normal merge commit `0cde0d29cfe3f3d417955e20e5ad672b3e02ceba`.
Independent review required F-1–F-6 changes and then approved the remediated
boundary with non-blocking notes. The closed slice uses exact enum/ID
validation, one entry-to-return deadline, per-source on-demand collection,
distributed initial evidence and a cumulative transmitted-envelope budget. It
still exchanges only bounded text projection evidence through a
provider-neutral Application port, validates untrusted structured responses
and returns no project mutation. PR CI `36575808711` and Exact Runtime
`36575808713` passed; post-merge CI `36576763557` and Exact Runtime
`36576763666` passed. Its scripted test analyzers are not a production AI
capability. These scripted fixtures did not demonstrate a real-agent round-trip.
The subsequent direct F-A02 scenario and the still-open whole gate are recorded
in the current checkpoint below; the following V1 account/attempt narrative is
historical evidence, not a new auth/model check. The preserved Codex App Server
attempt is blocked on containment with zero turns; the bounded Claude CLI attempt
now has official macOS arm64 Claude Code 2.1.280 installed and verified in a
versioned CEVRA-owned developer-tools directory outside the repo. The earlier
executable blocker is resolved and official subscription authentication now
passes (Claude.ai / first-party / Pro). The isolated adapter passed deterministic
fake-process tests. The first real canary failed an initialization containment
assertion without a retained field; the sole diagnostic follow-up identified
`INIT_PLUGINS_NONEMPTY`: two plugins reported, no tools/MCP/skills and no
bypass. Read-only CLI inventory under the same environment reports zero
installed plugins. A separately authorized diagnostic process #3 stopped at
its first init and identified two virtual built-in source labels, not local
plugin paths. Components and execution remain unproven; at that point no
documented session-only disablement had been established (ledger 3/8). An
explicitly authorized empirical attempt then applied a private, restrictive
`--settings` override with both exact built-in source IDs set to `false` only
for the child. Corrective canary #4 passed the original `system/init` gate but
failed `MODEL_UNAVAILABLE` at the following assistant event; the child closed,
no answer was accepted and history/redo were intact. Ledger was **4/8** at
that checkpoint. The
validator still fails closed on any nonempty plugin list. PT-BR, EN-US and
real cancellation are **NOT RUN**. The next focused decision concerns the
assistant-event model contract, not a containment exception.
Directed official-contract review then separated `assistant.error` from
generated-model evidence without weakening the init or Opus requirements.
Canary #5 passed the same init gate but declared `authentication_failed` with
synthetic message model; its final result had `is_error=true` and
`terminal_reason=api_error`. The child closed, no semantic result was accepted,
and ProjectHistory/redo were unchanged. Ledger **5/8**. The cause of #4 remains
unproven; #5 establishes a current explicit authentication failure. PT-BR,
EN-US and cancellation remain **NOT RUN**. The separately authorized
official-client authentication investigation did not retry or change provider,
model, billing or containment. It found
the former child environment lacking `USER`/`LOGNAME`: official read-only
status was logged out there, but logged in as Claude.ai/Pro both in the
login-equivalent profile and after adding only the OS-derived user identity.
This is not proof that inference now works. Canary #6 remains **NOT RUN**
because the original private five-attempt ledger and plugin override receipt
are absent from their recorded temporary location; they were not recreated.
That was the historical 5/8 checkpoint. The Product Owner subsequently
authorized recovery without fabricating the lost originals: five remain
debited in a persistent private checkpoint. Diagnostic #6 recaptured current
builtin IDs at init and stopped. PT-BR #7 used the restrictive session override;
its init passed, but a subsequent `system` event of unknown subtype failed the
unchanged containment gate. No final Opus or semantic result was accepted;
ProjectHistory/redo were unchanged. **7/8** attempts are used, with one slot
unspent. EN-US, continuation and cancellation remain NOT RUN. The next focused
decision is the exact post-init event contract, not automatic use of #8.
Effective end-to-end Opus/Medium, real transport success and editorial matrix remain unproven.
The version-matched official TypeScript SDK `v0.3.280` identifies
`system/thinking_tokens` as approximate progress. A closed no-tools transport
policy and bounded private event trace were added; real PT-BR attempt #8 ran
from pre-correction code `793d634` and passed init, then stopped on that
documented event under the earlier `CONTAINMENT` rule, before assistant/result.
This is a CEVRA transport-policy mismatch, not observed tool use or escape.
The subsequent shape-validated correction has offline tests only. History/redo
remain unchanged; **8/8** attempts are consumed, with no accepted semantic
round-trip and no automatic ninth execution. Focused review and a separate
decision on any further real proof are required. EN-US, continuation and real
cancellation remain NOT RUN.
Claude remains the next private proof candidate, not a replacement of the
provider-neutral core or an approved commercial integration. Complete Semantic
Editorial Analysis V1, strategy, take selection and cut planning remain not
delivered. Progress remains 55%.
Offline F-1–F-5 remediation at `0fd4fba8e4b0f595c3abfadbb9743aeb7e2de13e`
closes this experiment ID in code independently of ledger availability and
corrects result completion/error precedence, required empty plugins and system
event classifications. PoC 115/115, semantic Application 26/26, full Application
210/210 and Node/TS build passed with controlled fixtures only. No real Claude
or private-ledger change occurred. Independent review approved `de0aee7` with
non-blocking notes; the minimal N-1 oversized-tail correction at `1aa4324`
passed four directed regressions, PoC 119/119, semantic Application 26/26 and
Node/TS build. Final independent verification at `ea72f83` found N-1
VERIFIED / FIXED and approved the bounded offline remediation. PR #57 subsequently
merged frozen head `79327e8d951e31962af2c5d7915a38abcb0c8a4c` as
`862e33f9e687579059d51269abdb4195b86bbd79`. Post-merge CI
`36774947802` passed 5/5 and Exact Runtime `36774947781` passed on that SHA.
**Claude CLI transport/evidence PoC V1 is IMPLEMENTED / CLOSED only for its
bounded offline transport, containment, validation and evidence scope.**
Deferred N-2–N-4 and separate CI/review evidence remain in the existing record.
A new real proof
requires explicit authorization of a new ID, budget and scope. Slice A stays
CLOSED; full semantic analysis is NOT DELIVERED; progress remains 55%.
ADR 0030 remains ACCEPTED DIRECTION / IN DEVELOPMENT. At that V1 closeout,
the real semantic round-trip was NOT DEMONSTRATED.
The later F-A02 direct scenario is recorded below; the whole gate remains open
before strategy. No new Director authority or implicit strategy/take-selection/
cut-planning authorization follows. The old experiment stays CLOSED at 8/8, zero balance,
and five original receipts remain unavailable.
Before future timeline/Cut Compiler workflows create many commits, remeasure
descriptor/source repetition and decide deduplication only if evidence warrants.

## Offline editorial proposal — explicitly approved bounded scope

The owner approved reuse of the existing F-A02 result for an offline source-linked
reviewable proposal. Application now implements a process-local draft with all
observations/caveats, E1/E2 links, relationships, uncertainty and prior assessment.
Users can revise sequence, titles and notes; current-project/transcript/journal
and expected-revision guards protect review. The real saved-result demonstration
produced five blocks with history/redo and original artifact preserved, zero new
analyzer invocations, citations still PARTIAL and literal helper unchanged.
No timing, take selection, applied commands, Change Set, preview or export.
This remains IMPLEMENTED / IN REVIEW on the branch dependent on draft PR #74,
not merged or a delivered editing UI. Wider strategy/take/cut authority and whole
real-agent gate completion are not inferred. See
[Offline Editorial Draft V1](CEVRA_OFFLINE_EDITORIAL_DRAFT_V1.md) and
[master §24.1](CEVRA_MASTER_CONTEXT.md#241-main). Director impact: compatible
Application proposal extension only; progress 55%, F-A02 exhausted 1/1.

## Current first-F-A V2 checkpoint — 2026-10-03

PR #69 wiring is integrated at `f80f423e997ddc6728d00016c5ed7b167d3e6d40`,
with successful post-merge CI and Exact Runtime. The one separately authorized
owner-TTY first F-A on 2026-10-02 failed at the first `system/init`
containment gate, with one durable consumed slot and no accepted semantic
result. The specific reason is **INDETERMINATE** because the receipt did not
retain it; provider contact/consumption remains `UNKNOWN`. Original evidence
is preserved and the same F-A cannot be replayed. Historical V1 remains CLOSED
at 8/8, zero balance.

PR #70 diagnostic persistence is **IMPLEMENTED / CLOSED** at
`c9d96eb63877cc81230693a827b0d1469dd566b0`, equal to the reviewed tree;
independent review and post-merge push CI `37082549743` passed 5/5.
Exact Runtime/Windows did not trigger for this path set. Old receipts remain
readable and the lost historical rejection reason stays INDETERMINATE.

[PR #72](https://github.com/inlifemedicina/cevra/pull/72) isolated preparation is
**IMPLEMENTED / CLOSED** at `363e70bf1c4f9e21c29df5906b861e4bba664a1c`,
with tree `9b765458aff10f0a5adb31df153383e8d4287ead` matching independently
approved head `83c1e1215bfd01183ef9d737e14aca5e99d79521`.
391 deterministic PoC tests, 31 Application semantic tests and five negative-TTY
cases passed. Post-merge push CI `37085879662`, attempt 1, passed 5/5;
Exact Runtime/Windows did not trigger for this path set.

The owner subsequently supplied genuine local-TTY CONFIRM for fixed candidate
`semantic-real-agent-roundtrip-v2-poc-02`: **FIRST_FA_VALIDATED**, one invocation,
accepted `analysis-candidate`, correlated success receipt, observed model
`claude-opus-5-5` and closed child in approximately **16.143 s**. Pure read-only
validation and independent review confirmed result/receipt/digest/history binding,
complete E1/E2 coverage and preserved history/redo. Requested effort is medium;
effective effort is not separately proved. Provider-contact and token/cost
telemetry do not prove a remote hard cap or guaranteed R$0. No new account or
authentication check is part of this closeout.

The candidate preserves material availability as the next-day-delivery condition,
label accompaniment as a complement, possible repetition and future-material
uncertainty. Documentary semantic dimensions pass; **citations PARTIAL** because
one label observation compares against E1 but cites only E2, while the relation
cites both. The unchanged literal fixture helper returns condition false,
complement true, repetition false and uncertainty false; wording/field placement
explain the differences, and neither criteria nor response were rewritten.

The isolated allocation is **1/1 consumed, zero remaining**: no replay/refund,
automatic retry, continuation or new live authority. Earlier failed F-A and V1
8/8 remain preserved. Raw private result/ledger/event content is not published.
This is a **limited direct PT-BR textual result / WHOLE GATE OPEN**, not complete
analysis, I1-T1 plan/Change Set, editing, preview or export. EN-US, live continuation,
cancellation and timeout were not exercised. With `timingBasis:none`, source
intervals are not cut alignment. Strategy/takes/cut planning remain NOT STARTED /
NOT AUTHORIZED IMPLICITLY; an evidence-linked offline logical draft is the next
bounded proposal under D9 and a separate scope decision. Progress remains **55%**.

See [master context §24.1](CEVRA_MASTER_CONTEXT.md#241-main) and the
[preparation record](CEVRA_FIRST_FA_ISOLATED_ATTEMPT_02_PREPARATION.md), whose
pre-execution wording remains historical. The owner explicitly authorized public
publication of the technical test/model/provider/subscription-auth history on
2026-10-03; this update excludes credentials, tokens, private component/session
identifiers, local paths and raw private files. Director impact is a compatible
evidence closeout, preserving the existing typed authority and provider-neutral
boundary. No feature, merge or additional provider authority follows.

## Scheduling addition — 2026-09-30: official ChatGPT integration and cloud/mobile feasibility

Research and dependency scheduling were requested by the Product Owner. Detailed dated findings, official sources, unresolved questions and proposed experiment checks are tracked in [issue #55](https://github.com/inlifemedicina/cevra/issues/55). These planning IDs are not a second behavioral acceptance catalog; implementation must reuse or extend the canonical Product Owner acceptance catalog explicitly.

- **INT-CLOUD-01 — planning within the next real-agent gate:** verify official commercial eligibility, authentication, capabilities, privacy/retention, quotas and allowed deployment. Issue #55 records dated research, not commercial approval; revalidate its findings when the experiment and release are authorized. No external enrollment is authorized by this entry.
- **INT-CLOUD-02 — conditional transport evaluation within that next gate:** evaluate the official App Server/direct Responses options only where authorized. Preserve ADR 0030's read-only bounded textual evidence, validation, deadlines, invocation budget and no-mutation boundary. Transport must bound response receipt before materialization. An unavailable new route must not block a different officially authorized route or justify billing/access circumvention.
- **INT-CLOUD-03 — isolated parallel feasibility:** after defining environment, test media and budget, assess cloud-hosted skills using a short synthetic/licensed fixture. Verify dependencies, CPU/RAM/disk, media transfer, transcription, render, mobile preview/download, quota and recovery. No core dependency installation or desktop delay is implied.
- **INT-CLOUD-04 — after a usable editing vertical:** preserve I15's paired Desktop companion path for media/preset/request, progress/cancellation, review and result delivery. Being away from the computer is different from the computer being unavailable.
- **INT-CLOUD-05 — later conditional decision:** evaluate a cloud/BYOC runner for computer-off use only after real technical, commercial, privacy and cost evidence. Any new execution/storage architecture requires its own approval/ADR. No mandatory cloud runtime, storage service or V1 mobile deadline is approved here.

Identity sign-in, permission to consume a subscriber's AI allowance, an agent execution environment and audiovisual rendering are distinct capabilities. New provider features do not authorize widening end-user shell/MCP access, sending complete media by default, replacing Project IR/History or silently falling back to paid API billing. Preserve provider independence, original-source quality, the existing desktop release targets and the current **55%** progress value.

Reconciled over canonical main `be1e0e99fd189a1c976b44ec3a72e66d5fa5608c`
after PRs #57/#58: Slice A and the bounded offline Claude PoC stay CLOSED.
The historical experiment stays CLOSED at 8/8 with zero balance. F-A02 now
provides limited direct PT-BR scenario evidence; the whole real-agent gate
remains open. INT-CLOUD-01/02 support, not replace, that remaining gate. It
requires separately authorized new experiment scope, ID and budget. None of INT-CLOUD-01–05 is implemented or
authorizes inference, spending, commercial upload or deployment.

**Director impact:** compatible provider/transport investigation only. The current typed boundaries and canonical project authority are unchanged. A commercial cloud runner remains a separate future decision.


## Offline review integration and designated admission — current 2026-10-03

This supersedes the earlier unmerged offline-draft checkpoint: Application #75 and offline host/backend/UI #77 are integrated. PR #77 merged at `73f8427ac18337f779ceeda9c93f60edf35df33b`, with post-merge CI `37127986470` SUCCESS 5/5 and Exact Runtime `37127986468` SUCCESS 1/1, attempt 1.

The owner subsequently approved only the designated existing F-A02 result/history admission into a temporary native review session; this bounded addition is IN DEVELOPMENT / NOT MERGED. The ordinary saved project is preserved, PARTIAL/uncertainty remain visible, and canonical editing/provider/timing/cut/export authority is not added. Details: [offline admission](CEVRA_OFFLINE_EDITORIAL_DRAFT_V1.md#designated-fa02-admission). Subjective acceptance remains pending. Director impact: compatible review extension; progress 55%, F-A02 exhausted 1/1. PR #76 remains a separate Draft.

PR #78 also contains the owner-approved shared source labels and editorial card
clarity. The reviewed `dd7f1e4` visual has a separate verified native window, with
the older instance preserved; its numbers remain window-only. The approved
durable follow-up is integrated through #78: existing ProjectHistory owns
source-ID/number reservations and one monotonic project counter outside undo;
existing ProjectStore writes V3 and reads V1/V2. No new database or audiovisual
IR shape is introduced. Explicit save/reopen retains retired/abandoned-branch
reservations; legacy initialization cannot recover labels that were never saved.
Details and recovery limits: [ADR 0031](adr/0031-stable-source-numbering-v1.md).
Reuse X-T1/T2/T5, I8-T3/T6 and I17-T9 rather than duplicating acceptance cases.
The draft/notes remain in memory; the bounded card/source-label review was accepted, while final visual identity remains pending. Director impact is compatible presentation identity; progress and
provider gates are unchanged. PR #76 remains the separate documentation track.


Manual first-video excerpt is now an approved active slice on `feat/manual-inout-preview`, based on integrated #78 `182081e6a9e6c1b7849a099ebd3f6bba13663415` (post-merge CI `37151631882`, SUCCESS 5/5). Real local original playback, manual IN/OUT, one canonical clip and existing undo/redo are implemented for an initial small-fixture test; the 8 MiB/one-clip limits are not the final product contract. Application/host 346 and UI 66 tests PASS, code review APPROVE; native playback/Owner acceptance remain NOT EXECUTED pending one consolidated round. No AI, invented F-A02 timing, automatic alignment, composition/export or brief/profile implementation. Director impact is a compatible execution extension on the same history/timeline; progress stays 55%. Details are the scoped manual-excerpt checkpoint in the master and existing acceptance IDs, not a new acceptance catalog.

## Direct timeline IN/OUT — approved block, 2026-10-04

PR #80 is integrated at `ddf1448f3c32bdd9f8c35c9ad25b668e00be4856`,
with post-merge CI 5/5 and Exact Runtime 1/1 SUCCESS on that SHA. Its bounded
functional owner round passed; the preceding pending-native statement is historical.
The approved next block on `feat/manual-timeline-trim` adds pointer/keyboard
handles through existing `clip.trim`, source verification, checkpoint, preview
and undo/redo. IMPLEMENTED / NOT MERGED; current owner trim
acceptance NOT RUN, isolated demo prepared without launching a window.
[Contract and evidence](CEVRA_MANUAL_TIMELINE_TRIM_V1.md). Reuse I4-T1, X-T1/T7
and simple-clip X-T6; no duplicate acceptance IDs. Director impact is compatible
direct editing. Progress stays 55%, F-A02 exhausted 1/1; composition/export,
streaming/multi-clip and provider gates remain separate.


## PR #82 owner feedback — 2026-10-04

Owner cancellation, keyboard and undo/redo observations passed on the initial
trim demo. IN drag feedback and confusing source/elapsed time display require
bounded correction and recheck; previous NOT RUN wording is historical.
[Diagnosis and scoped follow-up](CEVRA_MANUAL_TIMELINE_TRIM_V1.md#owner-feedback-and-bounded-correction--2026-10-04).
The correction is presentation-only on existing typed trim/history: OUT remains
visually fixed during IN drag, then the confirmed duration reanchors at zero;
source and excerpt clocks use milliseconds. Real-file headless evidence does
not certify native/frame-accurate preview. It also reveals callback timestamps
above OUT before corrective seek; bounded playback remains OPEN. The current UI
labels preview approximate. Derived-preview integration is a separate proposed
scope/runtime decision, not a completed fix. Draft PR #82 remains unmerged;
Director impact compatible, progress 55%, F-A02 exhausted 1/1, no new AI call.
