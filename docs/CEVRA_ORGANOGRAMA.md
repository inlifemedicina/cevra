# CEVRA ORBIT — ORGANOGRAMA ATUAL

**Updated:** 2026-10-06
**Authority:** compact sequencing reference; `docs/CEVRA_MASTER_CONTEXT.md`, `docs/ARCHITECTURE_V1.md` and accepted ADRs remain the detailed authorities.
**Current global weighted roadmap progress:** 55%.

**Active approved sequence:** foundation → G1 continuous manual montage,
program preview and simple original-master export → identity/composition →
audio/captions/refinement → presets/Director → distribution. G5 fluency and G6
recovery accompany each available flow; automation precedes grouped owner review.
[Milestones and pending material choices](CEVRA_MANUAL_SEQUENCE_G1.md).
After explicit approval of their exact heads, #84→#85 merged at `6e2cce16` and
`60345a7d`. Post-#85 exact runtime passed; general CI attempt 4 completed SUCCESS
5/5 after fresh-runner evidence supported one targeted retry. Earlier failed
attempts remain preserved.
Insert before selection, duplicate
after selection and explicit Retry after failed save are approved.
**Historical M0/M1 checkpoints before the CFR30 implementation:**
M0 is published as [technical Draft #86](https://github.com/inlifemedicina/cevra/pull/86)
now targeting main, with bounded automated/exact-tree-review evidence and a
private-Node CI smoke close-handshake correction recorded in the plan. Corrected
head `58531d6` passed push and PR CI 5/5; continuous editing proceeds while render-profile
choices and sequence/render consumers remain open. Historical R3/Take PASS
remains limited. M1 API is [Draft #87](https://github.com/inlifemedicina/cevra/pull/87),
stacked on #86; UI head `508436e` passed tests/build, twelve owned PT/EN layout
cases, independent reviews and push/PR/exact-runtime CI. Canonical read-only
preview preparation `6b9c737` passed Application 296/296 and review. The bounded
preview follow-up passed Host 145/145, offline Rust 38/38, UI 126/126, i18n/build
and source reviews, preserving unsaved Host on unknown preview retirement and
allowing explicit Retry; recovery head `230c3ff` passed push/PR/exact-runtime CI.
The next bounded consumer connects canonical sequence occurrences to the existing
clip route and production App, with all-source/journal revalidation, seek, repeat,
Original mode and preserved edits/paused position. Host 149/149, Application
296/296, UI 134/134, Rust 38/38, i18n/build and independent source reviews passed.
It uses the existing Take envelope and may wait at joins; native/gapless/sync and
whole-flow acceptance remain open. Publication continues in the same Draft;
export remains open. The owner approved initial MP4/H264/AAC 1080p/30-fps
SDR, 20-Mb/s target, preserved IN/OUT and 512-MiB memory/2-GiB owned temporary-file
limits with clear errors and no silent quality drop. Synthetic export measurements,
proof limits and the exact-cut versus strict-CFR boundary distinction remain in
the same G1 plan; technical temporal admission remains open.
H.264 B-frame fixtures and the 7-ms active-picture feasibility passed under
approved execution outside the sandbox; identical sandbox commands retained the
`-12908` failure. No encoder/profile change was adopted. The same plan recommends
exact project cuts with nominal-30 variable boundary exposure, or explicit
export-only quantization for strict CFR30; owner decision is still required.

Independent destination preparation now spans Application/Host/native/UI without
creating output/history/archive/checkpoint or exposing a WebView path. Picker
cancel/Close, Host supersession and late-result/journal guards preserve unsaved
state; final Export remains unavailable. The existing transport adds a trusted,
generation-bound sampled resource scope for a registered owned POSIX job. Review
corrected lifecycle/restart/empty-group/retirement races and Inspector clipping.
Synthetic 60-s whole-frame quality/resource probes include sealed originals and
candidate/staging; scoped fully tagged BT709 preservation passed. These do not
prove instantaneous 512-MiB/2-GiB ceilings, mixed-colour compatibility, final
pipeline or G1/G5/G6/owner acceptance. Complete live-file registration, sealed
0.3.4 integration and final admission remain engineering work alongside the
temporal decision. A subsequent executor correction keeps Audio Sequence's graph
and PCM inside the existing private staging tree, including partial-write/cancel
cleanup (44 worker / 103 full Media Python tests PASS; filesystem fixtures).
Publication, `export.add`, durable checkpoint and no-replay recovery already exist
under ADR0027/0028 and will be reused. A real cadence-bound visual producer and
explicit audio binding for the video-only G1 sequence remain required; no new
audio admission policy or unused publisher/journal/service was introduced.
The [single grouped G1 script](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md#single-grouped-g1-script)
is prepared, not executed. #86/#87 stay unmerged; progress 55%, F-A02 exhausted 1/1.
Final render/publication/resource-budget integration remains open.
The subsequent Owner decision at 2026-10-06 00:51 UTC supersedes the OPEN temporal
alternatives above: CFR30 visual timeline and matching export, visible frame
edits, shared actual-PTS preview/render sampling, independent audio timing and
explicit reversible review/conversion of legacy cuts. [ADR0033](adr/0033-manual-sequence-cfr30-clock.md)
records the category comparison and actual feasibility. The real path now uses
existing Project IR/History/Media publication/archive and checkpoint/recovery
contracts in Draft #87, including source-master render and explicit source audio.
Local evidence: IR70, Store18, Application314, Contracts25, Host172, UI155,
MediaNode140 (combined native/sandbox), Python121, Rust48 and offline-agent391
tests passed. Current
source-worker fixtures passed B-frame/fractional/VFR/one-frame/repeated cuts and
60-s Full HD final/preview, exact decoded counts, immutable originals and measured
quality/resources. The long preview was 4452793 B; sampled peaks were 178257920 B
RSS and 604991488 B allocated job files. Exact sealed R2 functional passed the
production guard before commit, late NTSC/source-PTS barcode and stereo clocks,
Original with audio offset, persisted reopen/Undo without replay and 60-s output.
Manual failure cleanup preserves the public final. Uncertain uncommitted
publication or unproved retirement also retains account/root; confirmed commit
and proved retirement allow private cleanup with final/`export.add` preserved.
Native timeout reconciliation retains late sanitized publication/commit errors
and their evidence with the current state; Original keeps Take source timing. Independent exact-tree
review and published-head CI receipts accompany the Draft. Sampled supervision
does not establish instantaneous ceilings; broader source/perceptual/gapless/
owner acceptance remains open.
The subsequent isolated native-package preparation adds quiescent aggregate disk
admission before public publication, including projected/actual accounting links.
Python126 and the sealed R3 functional catalog passed; R2 quality receipts retain
their historical binding. Native packaging/Host validation and final-head review/CI
receipts accompany the same Draft. The 100-ms watchdog waits after each scan;
instantaneous RAM/disk ceilings and real-project/perceptual/Owner acceptance stay
open. Two synthetic flash/beep fixtures are prepared; no human app was opened.
The first packaged Host exposed unavailable manual capabilities: FFmpeg9's two
filter flags failed the three-column parser, before any ingest/render/export.
The bounded two/three-column fix passed Python128 and sealed R4 actual health/
manual-capability plus full functional acceptance. The catalog now checks those
capabilities before rendering. Native compilation/resource hashes passed, but
strict signature verification fails in the unchanged pinned Node even before
bundling; that GUI_PACKAGE_BLOCKED_SIGNATURE receipt is retained. A separately
declared ad-hoc signed Node copy passed strict verification/version while the
original pin, official manifests and sealed Media/Python remain unchanged.
Whole-bundle/Host verification is separate. Exact-head package/Host/review/CI
receipts accompany the Draft; no GUI/Owner or hard-cap PASS follows.
Corrected compact-export package `fb346106` is now built offline in the isolated
`vids-g1-compact-export-fb34610` root. Frontend/native builds, resource resolution,
strict/deep signatures, inventory and launcher check-only passed; only Info.plist
and native executable changed. Host/Node/Media/dependency identity supports inherited
backend export/recovery proof without another local render. New launcher and the
redirected previous command target the corrected app; the single human script was
updated. Package review is APPROVE; at this pre-publication checkpoint final source
binding/remote CI are PENDING and will be recorded with Draft #87 and its receipt.
Strict resources remain BLOCKED and human GUI/picker/perception
pending; Director compatible, 55%, F-A02 1/1, no Take/device/AI/merge/release.
[Scoped record](CEVRA_MANUAL_SEQUENCE_G1.md#compact-export-package-refresh-and-inherited-backend-evidence--2026-10-06).
Final grouped-script review found no frozen-package/launcher identity defect;
build/signature/packaged-Host export/recovery PASS remains separate from unexecuted
GUI/picker/Owner. The single acceptance script now defines technical labels,
actual actions/expected/failure, reference restoration and automatic save;
unavailable legacy/save-failure/full resource variants stay BLOCKED. A bounded
source fix reveals Controls when toolbar export starts, preserving Director/project
state; PT/EN regressions, UI157/typecheck and review passed. It is not in the frozen
`22e3c431` app; select Controls before export in compact mode there. No repackage/render/CI/GUI/AI
or merge. [Scoped record](CEVRA_MANUAL_SEQUENCE_G1.md#final-grouped-script-review-and-bounded-ui-correction--2026-10-06).
Director impact compatible presentation correction, progress 55%, F-A02 1/1.
The subsequent read-only resource-feasibility finding against `22e3c431` leaves
the strict gate BLOCKED. Reservation/child file-size limits can contain logical
writes, while allocated blocks and aggregate physical/framework RAM remain
unproved. The
[single decision proposal](CEVRA_MANUAL_SEQUENCE_G1.md#resource-ceiling-feasibility-and-pending-decision--2026-10-06)
compares unchanged strict guarantees with separately approved isolation/quota
research, versus an explicitly weaker operational contract for the present stack.
No guarantee was relaxed or runtime changed; the frozen signed package and its
export/recovery receipts stay preserved. No render proofs were repeated;
focus-isolated UI/picker automation remains NOT_RUN, human Take untouched.
At 10:38:21 UTC the Owner approved the operational route, superseding that pending
choice. [ADR0034](adr/0034-operational-manual-render-resources.md) now has logical
pre-write reservations and sampled memory abort, with initial validation budgets
512 MiB/2 GiB. Sealed R5 synthetic evidence passed: 60-s Full HD sampled peaks
171507712 B RSS and 627486319 B logical files, with 52.512757-dB decoded PSNR.
Controlled RAM excess overshot by 87015424 B before abort; no instantaneous
physical quota or commercial limit is claimed. Independent APPROVE arrived via
coordination for code `26c07e55` / tree `38cab89a`; exact-head CI passed 11/11,
and the isolated arm64 package passed strict/deep signatures plus 29 Host
responses. The bounded technical gate is closed and the package is READY FOR
HUMAN VALIDATION; documentation closeout binds its CI separately without changing
production bytes. Window/picker/perception remain unexecuted. Background opening
is blocked by Tao startup activation, preserving the ongoing session and focus.
The single human script uses the isolated package and synthetic A/B only.
Old R4/fb34610 receipts stay frozen.
Director impact: compatible internal extension; existing
typed/IR/History/provider boundaries and 55%/F-A02 1/1 remain unchanged.
No G1 PASS,
real AI, dependency, human
media/app/device action or release claim is implied. Creator=Lite, Studio=Full,
Vids=Desktop; Lite/Full share core and Full visual output does not require Vids.

**Current gate — 2026-10-07:** `abf862f` received independent APPROVE through
coordination and passed exact-head CI11/11. Representative Full HD preparation
measured 2.153 s for 5.5 s/four clips, 6.853–6.879 s for 60 s/12 unique clips and
22–28 ms for cache/Undo. Program cache misses still prepare the full montage;
edit waits near eight seconds remain a limitation, despite no per-cut render.
Isolated bundle metadata/signatures passed without a window; Foundation preferred
en-US here. A packaged Full HD card exposed the 160-profile/720-filter mismatch,
now corrected with bounded profile/large-source regressions. That narrow delta
requires proportional independent review and its own CI. See the
[scoped record](CEVRA_MANUAL_SEQUENCE_G1.md#representative-preparation-and-large-card-correction--2026-10-07).
No human round/app replacement, IN/OUT change or G1/progress55%/F-A021/1 promotion.

**Current usability work — 2026-10-06:** the coordinated Owner round subsequently
confirmed opening/import, implemented editing buttons and correct A/B/A/A export
in the isolated variant, and reported preview waits at joins, absent thumbnails
and timeline interaction/readability gaps. Human close/reopen remains NOT TESTED.
[Issue #88](https://github.com/inlifemedicina/cevra/issues/88) records the scoped
evidence and pending grouped regression. The new branch
`feat/vids-timeline-usability-preview-continuity` adds offline-tested selection,
drag/seek, atomic group removal, continuous CFR30 program preview and source
thumbnails; [technical scope and limits](CEVRA_MANUAL_SEQUENCE_G1.md#human-findings-and-usability-follow-up--2026-10-06)
remain explicit. The earlier Apply-only IN/OUT checkpoint is superseded by the
Owner's 2026-10-07 00:22:58-UTC approval of valid Enter/blur, Esc cancellation,
one Undo and no duplicate commit;
native picker language and new perceptual acceptance are untested. Independent
review is pending, with no replacement of the app/project in use. This is a
compatible Director extension; progress55%, F-A021/1 and full G1 status are unchanged.

The follow-up `feat/vids-usability-keyboard-audit` is separated from #89's
`2382dae` head. Code `10a66830e56a31e17a22ed6ad10efc7f5814f9fe` passed Desktop
build, UI183/183 and i18n2/2 offline. Existing-function shortcuts, text/IME/focus
guards, transient editorial-draft preservation, truthful unavailable production
composition/audio/Inspector controls, thumbnail retry and bounded accessible
timeline resizing require proportional exact-head review/CI. The complete
[field inventory and latency proposal](CEVRA_VIDS_USABILITY_AUDIT.md) records
all received P1/P2 findings and one grouped regression. External synthetic-worker
segment reuse measured reorder1.249s/trim1.753s, excluding full app delivery.
The proposed 32-MiB/64-entry worker-local segment LRU is **not approved or
implemented in production**; neither the 6.85–8.05-s current wait nor prototype
times are acceptance. No live app/project/media or Take session was operated.

Historical / SUPERSEDED approach — independent #90 review required a P2 correction: range blur consumed the next
button action. Code `3e4397d64a80fdc1687f0e42d10106a7c3f5f741` preserves the
explicit action/snapshot; build, UI194/194 and i18n2/2 pass with real-focus/click
regressions. Exact new-head review/CI are required, with no cache implementation.

Settlement foundation of #90 P2 re-evaluation: code `ba8d5a6b7b5a71d2eb90f76249e88e19117a1b6a`
replaces generic blur suppression with explicit draft settlement before the next
App intent. Enter/blur shares one trim; selection changes only after confirmation;
duplicate/append/insert follows the returned snapshot and preserves OUT29. Two
mutations have two recoverable Undo entries. Focus-only Tab never activates a
button; failure retains the draft and stops the following action. UI207/207,
i18n2/2, build PASS with 13 new App/backend regressions (nine initially RED).
**New-head CI and exact independent review PENDING**; #90 Draft, #89 preserved.
Director compatible, no provider/native-user-app/Take operation. Cache remains
unapproved/unimplemented; progress55%, F-A021/1 and full G1 unaccepted remain.

Current #90 follow-up closes the two P2 observed at57511e1 with code
`63c89c026e4a18b216c69e0dbc2871d632239163`: one activation epoch consumes failed
press/key/drag through release/click/Drop, requiring a new explicit retry; all
action entry points share settlement, including Import/Cmd+I and Inspector export
with actual confirmed snapshot. [Complete routing inventory](CEVRA_VIDS_USABILITY_AUDIT.md#inventário-completo-de-entradas-e-limites)
distinguishes safe navigation/actions from decoder/lifecycle/layout guards.
UI231/231, i18n2/2, build/diff PASS; 24 new regressions. Historical57511e1 CI
finished10/10 PASS after alignment infrastructure retry (monorepo1,452/UI207).
New-head CI and exact independent review PENDING. Draft only; no cache/provider/
native GUI/device/Take/merge. Director compatible, progress55%, F-A021/1 and
full G1 unaccepted unchanged; reuse the same grouped acceptance catalog.

Firstf70c874 CI had PR Monorepo PASS and one push UI failure in the old temporary
editorial test. Synchronize that test with editable/completed UI and verify saved
title; no production change. Preserve failure; fresh head CI/re-review required.

Latest review at900da2a resolved the two prior P2, then found a stale reviewed
legacy conform payload rebound after trim. Code
`f530b1d1b3db86e10f52f85259d8d6d335f35ebb` keeps proposal snapshot immutable,
rejects captured conform if settlement changes head, and routes reading through
the confirmed-IR gate. New review required after trim; async generations and
snapshot binding retire stale replies/UI. UI236, build/i18n2/diff PASS; five new
cases (4RED/1alreadyPASS). Historical900da2a CI10/10 does not cover new delta;
CI/exact re-review pending at publication. [Full contract/inventory](CEVRA_VIDS_USABILITY_AUDIT.md#p2-da-conversão-legada--proposta-vinculada-ao-snapshot-revisado).
Draft/no cache/GUI/merge/IA; Director compatible; same55%/F-A021/1/G1/checklist.

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
labels preview approximate at that historical checkpoint. The subsequently
approved derived-preview integration is implemented below. Draft PR #82 remains unmerged;
Director impact compatible, progress 55%, F-A02 exhausted 1/1, no new AI call.

## PR #82 approved bounded derived preview — 2026-10-04

The existing typed Media trim now supplies a privately prepared, verified
ephemeral excerpt with canonical bounds and cancellation across UI/Tauri/host.
It adds no source/history/checkpoint or durable Media execution. Worker 0.3.2
retains the pinned approved runtime and eight-file integrity inventory. The
profile admits bounded zero-origin CFR/SDR video and covered contiguous audio;
unsupported/missing runtime fails visibly. Decoded frame/audio sentinel tests
PASS in six cases at 30 and `30000/1001` fps, with original bytes unchanged and
no pre-IN/post-OUT source content. Quantization remains explicit: the logical
1.990 s interval may encode 2.000/2.002 s and hold the last admitted frame.
Production-host and separate Chrome EOF evidence PASS; native perceptual
acceptance is PENDING. The new runtime-bearing review app is prepared unopened
under a separate identifier. Preserve accepted cancellation/keyboard/undo results;
group only IN visual drag and new playback into the owner recheck. [Details](CEVRA_MANUAL_TIMELINE_TRIM_V1.md#approved-bounded-derived-preview--2026-10-04).
Director impact: compatible typed Media/manual-edit consumer; no new provider,
proposal or execution authority. Draft #82 not merged, progress 55%, F-A02 1/1.


## Approved Take local preview expansion — 2026-10-04

The owner approved extending local preview for Take recordings after PR #82
merged at `906eea695836fe2ae2b81ab0b50610b600748995`. Media owns the closed ephemeral
proxy/profile and measured timestamps; application/host own source identity,
canonical clip bounds, cancellation/admission and reopen; UI keeps source-clock
marks and labels lightweight quality. Project IR/history, permissions and final
original-source policy remain unchanged. Runtime 0.3.3 preserves the pinned
approved engine and legacy v1 profile.

Synthetic runtime and production-host reopen controls pass. Real Take preflight
and one consolidated new owner round remain BLOCKED by the missing designated
Mac file. The isolated package and Draft PR are tracked in the final receipt;
no session/device access or AI call. Director impact is compatible with unchanged
execution authority; progress 55%, F-A02 exhausted 1/1. Broader composition/export,
acceptance, provider and release gates remain open. [Canonical evidence and limits](CEVRA_MANUAL_TIMELINE_TRIM_V1.md#approved-take-local-preview-expansion--2026-10-04).


### Real Take recording technical validation — 2026-10-04

The designated transferred recording now passes local hash/preflight, production
host import/Original proxy/clip/reopen, with immutable original and unchanged
canonical project/numbering/undo. Media's bounded QuickTime correction preserves
the typed adapter and privilege boundary; packet/PTS and affine-transform
negatives remain closed. No media enters GitHub/external services. Real preflight
is complete; subjective native orientation/voice sync/reopen acceptance stays
PENDING in one new round. Draft #84 final-head/runtime/native receipts record
the correction. Director impact compatible, progress 55%, F-A02 1/1 unchanged;
no AI/device/session operation or `clip.remove` implementation. [Real evidence](CEVRA_MANUAL_TIMELINE_TRIM_V1.md#real-take-technical-validation--2026-10-04).

### 2026-10-05 — Take preview acceptance follow-up

Owner accepted the scoped real Take native round at PR #84 `b57c649`: Original
and excerpt orientation/voice sync, content and save/reopen. A separate blank
initial frame before Play remains under a bounded Desktop correction. Only
selection of Original and the V1 excerpt requires a point-specific recheck.
Director/state boundaries, progress 55% and F-A02 exhausted 1/1 are unchanged.
A neutral visual proposal for a taller preview with lateral Director/context
controls is approved for preparation only; product layout is not implemented.

### 2026-10-05 — Approved editing column follow-up

At Draft #85 `f4ea20f`, the owner-approved Desktop implemented the full-height
right column: Director/editorial draft above contextual controls, independent
scrolling, adjustable divider and 320–480 px width. Open is the default; compact
collapses the whole column and shows an explicit PT/EN reopen button. Preview,
excerpt and IN/OUT stay centrally. Width/source aspect never changes modes.
Local presentation state survives toggling; no project schema, engine, provider,
history or persistence authority changes. Director impact is compatible.

Desktop 98/98 and i18n 2/2 PASS; synthetic WKWebView checks cover geometry,
unsaved text/scroll/selection preservation and paused Original/excerpt initial
frames without Play. The layout Draft depends on reviewed #84 `a36d8ba` and
remains unmerged. The replacement native package stays closed pending one
[grouped owner check](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md#editing-column-and-paused-frame-owner-check--2026-10-05).
The earlier accepted Take orientation/voice/content/save/reopen round remains
valid. Subjective legibility and the real Take initial frame remain PENDING;
progress 55%, F-A02 exhausted 1/1, no new AI call or device/session operation.

### 2026-10-05 — Revised compact and V1 initial-frame follow-up

The owner confirmed Original's initial frame PASS at `f4ea20f`, but rejected
the existing V1 excerpt's paused initial frame: APP/OWNER FAIL. Earlier synthetic
PASS does not override that failure. The bounded follow-up on Draft #85 adds
an ephemeral image of the admitted decoded excerpt frame before Play/seek;
Original keeps its accepted playback path. The exact failure in the human
window has not been reproduced by the isolated technical fixture.

The owner explicitly superseded whole-column collapse with a 286 px compact
column confined to the upper editing area, Director/Controls tabs and a full-width
timeline below. Open retains its full-height adjustable column. Text, selection,
playhead and independent scroll must survive mode/tab changes. Desktop 102/102
and i18n 2/2 PASS; native verification, exact review/CI and a fresh closed package
remain in progress. Recheck only V1's initial frame and the revised layout;
preserve the real Take orientation/voice/content/save/reopen PASS at `b57c649`.
Draft #85 remains unmerged on reviewed parent #84 `a36d8ba`; no AI, device or
human-session operation, project/persistence/provider authority is added.
Director impact is compatible; progress 55%, F-A02 exhausted 1/1 are unchanged.

The overnight WKWebView follow-up confirms the display is asleep/inactive:
messages/timers continue but rendering callbacks are suspended while occluded.
It also reproduced a black premature PNG in the actual Original → existing V1
transition at `ce53f81`. The bounded correction now defers sampling through a
rendering turn and cancels stale/seek/disposed tasks; Original is unchanged.
Desktop 105/105 PASS, including the red-before regression and both queued-stage
cancellations. Awake native painting/scroll and owner acceptance remain PENDING;
no display wake, human-session/device operation or synthetic promotion to PASS.
Final exact review/CI/package identity is PENDING at this checkpoint; results
will be recorded in Draft #85 and its local receipt.

### 2026-10-07 — Approved preview segment reuse

Owner-approved delta `feat/vids-preview-segment-reuse` starts at Draft #90
`278627e`, under ADR0035. The existing Media worker retains admitted immutable
preview segment/grid objects in a shared32MiB/64-entry LRU inside aggregate512MiB;
restoration reserves within the existing2GiB ledger before writing. The current
preview's first PNG receives the same guard. Other worker operations release
retention before unguarded work; failure/cancellation/restart clear it.

Local Python151/11/11, full offline/inert Claude-PoC and exact sealed original-master
runtime catalogs PASS. Real reorder/trim/removal outputs match every decoded
picture and PCM sample against uncached original-derived references. Actual Host
handoff measured2.148/2.794/1.747s; actual packet React/Blob/PNG DOM123–166ms does
not establish native decode, paint or perceived latency. Pressure/corruption,
lease-marker, live-job cancellation/restart and stale UI response gates PASS.

[Canonical record](CEVRA_PREVIEW_SEGMENT_REUSE_V1.md) preserves failures and separates
worker, Host, whole-program warm and UI delivery. Exact-head CI and independent
review remain pending before a new grouped package. Director impact is compatible:
context, permissions/providers and typed IR/History remain authoritative. No new
human/device/AI operation, merge or issue88 body publication; progress55%, F-A021/1
and full G1 unaccepted remain. Reuse the existing single acceptance catalog.

### 2026-10-08 — Approved consolidated basic editing

The Owner's grouped review passed individual edits/shortcuts, removal, IN/OUT,
Undo/Redo, thumbnails/click preview, continuous sequence playback and Portuguese
export/file content. Native close/reopen and measured 60-s edit latency remain
NOT TESTED; full G1 is unaccepted, progress55% and F-A02 exhausted1/1 unchanged.

Approved delta `feat/vids-basic-editing-consolidated`, based on exact `e84424c`
/ Draft #91, follows [ADR0036](adr/0036-consolidated-basic-manual-editing.md):
Finder drop via bounded native receipts and existing ingest, reliable captured
pointer reorder, canonical duplicate-many/one Undo, honest copy/source labels,
stable manual scale/explicit Fit, adaptive ruler/readable cursor and existing
MP4/H.264 identification. Only two closed receipt application commands join the
WebView ACL; no general event/filesystem/shell/plugin access is added. Repeated
registered URI import verifies current original identity/content before reuse.
Final export still uses originals; presentation slack/provenance cannot change
duration, source numbering or media authority.

Domain/history, gesture/focus/shortcut, native ACL, real Host/sealed Media and
payload-UI gates are recorded in the [existing audit](CEVRA_VIDS_USABILITY_AUDIT.md#consolidated-basic-editing--2026-10-08).
Final-tree independent review and exact-head CI precede a Draft handoff and the
same [future grouped script](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md#single-grouped-g1-script).
Director is compatible with the typed extension; no plan/provider/permission
authority migrates to UI or worker. No merge, AI/account request, new human
app/project/window or Take/Xcode/iPhone operation is part of this preparation.

### 2026-10-09 — Approved visual B presentation

The Owner selected the inspected original “B · Áreas com tons suaves · Conceito
visual”; its access blocker is resolved. The separate
`feat/vids-visual-b-soft-panels` delta starts at `a606db1` / Draft #92 and changes
only existing-panel presentation: slate-blue Media, violet draft, petrol Director,
taupe contextual Inspector, neutral Preview/Timeline, rounded borders, gutters
and readable type. Illustrated functions are not added; existing open/compact
modes, tabs/resizers, fields, commands and IR/History remain shared.

Actual compiled-UI comparison, Desktop258/258, i18n2/2, build and95 owned
headless structure/presentation checks PASS. Secondary text on tinted surfaces
measures6.49–6.81:1; compact inner spacing preserves the draft scroller at the
native minimum. This is not native paint/perception, full accessibility or Owner
acceptance. Exact-tree review/CI and the isolated combined package are bound in
the new Draft/receipt; one future grouped functional+B round retains existing
IDs. [Scope/evidence](CEVRA_VIDS_USABILITY_AUDIT.md#approved-visual-b-presentation--2026-10-09).
Director impact compatible presentation only; no IA/provider/device/window
operation or merge. Progress55%, F-A02 exhausted1/1 and full G1 unaccepted remain.

### 2026-10-09 — 60-second Host follow-up, visual B package preserved

The existing Draft #93 package (`41decff` / tree `0d983575`) now has an automated
60-second fixture/method: ten clips, 1,800 CFR30 frames. The initial sandboxed
preview failed because the real resource observer could not query its own
process group. The original FAIL is preserved. The same uninstrumented harness
passed outside that restriction with production monitoring/limits unchanged:
six preview deliveries, 40 Host responses, two exact decoded 60-second outputs,
normal Host close/reopen, exact Project IR and reopened Undo/Redo.

After-reorder preview RPC delivery was 1.920–1.948 s; acknowledgement was measured
separately. These facts do not establish native or perceived latency. No product
code, function, dependency, permission, provider or IR/History change was made;
Draft #93, its package and earlier receipts remain preserved.
[Canonical evidence](CEVRA_VIDS_USABILITY_AUDIT.md#60-second-preview-test-execution-boundary--2026-10-09).
Native window/close-reopen remains unexecuted because interface isolation from
concurrent EDVID testing is not guaranteed by available tools. Reuse the same
single acceptance catalog and IDs; no intermediate human microtests are requested.
Director: no new impact found in this scope. Progress 55%, F-A02 1/1 and full G1
unaccepted remain; no real AI, merge, human project/window or device operation.

### 2026-10-09 — Native visual B accepted; functional continuation prepared

The frozen #93 package at `41decff63de969786b8c3d39831514a04b14a00b` was
subsequently opened under explicit authorization with its exclusive review
identifier; the old app/project was preserved. The Owner saw it and replied
**APROVADO** for visual B. This is the accepted presentation baseline, not full
functional/performance/lifecycle acceptance or generic merge authority. Earlier
not-opened checkpoints remain historical for their own execution scope.

The request to continue Vids prepares the [same single functional block](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md#single-grouped-g1-script)
with verified synthetic fixtures: import, reversible reorder/group duplication,
fields/zoom, preview after edits and normal isolated close/reopen. Exact package
inventory/signature/runtime/fixture checks passed again; unchanged source review
and successful terminal CI are retained, with no repeated Host trial. Dedicated
native tools remain absent; the supported macOS AX path using
existing permissions provided bounded native checks: picker cancellation kept
the empty project unchanged, and a synthetic Director field survived entry to
compact mode. The field was cleared; the window remains compact after an
unresolved selector restoration. No import or edited-project lifecycle is
claimed. GUI work stopped for Take/Xcode; the parent coordinates remaining
window interactions. No functions, engines/providers, IR/History
authority or dependencies changed. Director: no new impact found within this
scope. Progress55%, F-A02 exhausted1/1 and full G1 unaccepted remain; no real AI
or merge is performed by this continuation.

### 2026-10-09 — Current Vids test accepted by owner report

At18:03 UTC the Owner reported **VIDS TESTE OK** for the current test on the
frozen #93 package `41decff`. This closes the bounded communicated owner round
and retains visual B as the accepted baseline; no repeated human round is
requested. Item-level results, measured native performance, normal-window
close/reopen and full G1 are not inferred from that brief report. The automatic
plan prepared during GUI reservation remains unexecuted, with no automatic replay.
Existing source/CI/package/Host/native partial evidence and the original FAIL
remain preserved. [Scoped closeout](CEVRA_VIDS_USABILITY_AUDIT.md#current-owner-test-report-and-bounded-closeout--2026-10-09).
The next integration proposal concerns the open dependency chain
#86 → #87 → #89 → #90 → #91 → #92 → #93 → #94; exact gates and specific merge
authority must be confirmed before integration. No product/provider/history or
GUI action is made by this record. Director: no new impact found in checked scope.
Progress55%, F-A02 exhausted1/1 and broader G1 acceptance remain unchanged.


### Ordered main integration closed — 2026-10-09

The Owner's separate authorization was executed in order: #86 → #87 → #89 → #90 → #91 → #92 → #93 → #94. All eight reviewed incoming heads and resulting trees were preserved under normal merges; final main is `48353df62901aed7f102fc7e186a7c64c92949e3` / tree `9ca35fe4af61741af5b42c9caa25d21852f779ad`. Post-merge CI is terminal PASS, 44/44 checks across twelve runs. #89/#90 proportional reviews closed APPROVE with no P1/P2; #90's original zlib download timeout and single failed-job retry request remain recorded alongside final attempt 2 PASS.

[The canonical integration ledger](CEVRA_MASTER_CONTEXT.md#ordered-main-integration--2026-10-09) owns the exact heads, merge commits, CI links, review provenance and failure limits. Earlier open-Draft/preparation-only entries remain historical and are superseded for these eight integrations. The dedicated follow-up changes only the master context and this organogram.

The current `41decff` review package remains preserved; the accepted visual B and bounded 18:03 UTC **VIDS TESTE OK** owner round stay closed without replay. Individual unreported IDs, native perception/lifecycle and full G1 keep their existing gates. Director impact remains the reviewed compatible typed IR/History extension, with no further planning/provider/context/permission authority. Integration performed no real AI/account request, GUI/user-project or Take/Xcode/iPhone operation. Progress 55% and F-A02 exhausted 1/1 remain; commercial distribution and broader acceptance retain their separate scope.
