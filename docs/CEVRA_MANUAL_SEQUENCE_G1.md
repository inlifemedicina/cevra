# Manual sequence — foundation and G1

Status: APPROVED BLOCK DIRECTION / IN DEVELOPMENT, 2026-10-05 UTC.
No new functional PASS or product-ready claim is recorded by this plan.

The Product Owner approved evolving the application by complete workflow blocks
after the code/EDVID/market audit. Current scope is foundation plus continuous
manual montage, sequence preview and simple local export. Automation precedes
grouped subjective owner review. No advanced catalog, new Composition engine,
dependency/download, real AI/provider/account request or paid API is included.
Do not install/open an app or use human media/Take/devices without coordination.

## Baseline and preparation

Main before preparation was `906eea695836fe2ae2b81ab0b50610b600748995`.
After the owner explicitly answered SIM to integration of the two exact reviewed
heads, PR #84 `a36d8ba4d85ab103d96cfa6309a5c53c7eb6d5c4` merged normally at
`6e2cce16a8506bb5a3816aeb04281a7698abc471`; #85
`370e86b18599cd78c8dee3e4325caf9a0d05d6d3` was retargeted to that main and merged
normally at `60345a7db3fcfc1b78e6cc878cdbb217b1dac7a4`. Each exact feature head had
11 successful checks and independent review; each merge tree equals its reviewed
feature tree. The earlier automatic approval rejection is retained in history;
the new explicit authorization resolved it. Post-#84 runs were cancelled when
#85 advanced main. Post-#85 Audio Sequence Exact Runtime `37371249881` passed;
general CI `37371249855` ended with four unacquired/cancelled jobs and one passing
alignment job; a failed-job rerun was requested. This is not a complete CI PASS.
Running R3 product `7d4e66776fbfc112429d333e5d8883221c2851fb` and its limited owner
acceptance remain historical evidence, not G1 PASS. M0 Draft #86 now targets main;
its feature history preserves the reviewed baseline. No #86 merge is authorized.

## Milestones

1. **M0 — foundation:** import/source/history accessible at 900–1120 px;
   persistent unsaved/error visibility; coherent focus/resize/navigation.
   Explicit checkpoint retry makes no audiovisual edit. Native close admits
   only confirmed-saved canonical state under the same mutation gate;
   timeout/unknown must not destroy unsaved memory. Preserve current/previous
   recovery, ownership and originals.
2. **M1 — useful continuous edit:** reusable source IN/OUT; repeat ranges from
   one source and include compatible other sources; append/insert/split/trim/
   reorder/delete/duplicate/ripple. One action gives one journal/snapshot/Undo.
   G1 V1 is contiguous from zero; do not impose this on general Project IR.
   Keep source IDs/numbers and unique clip occurrence IDs. Video and its embedded
   audio share one canonical temporal plan. Actual sequence preview and simple
   original-master export close the workflow.
3. **M2 — whole-flow evidence:** automated G1 plus accompanying G5/G6,
   independent exact-tree review and effective CI; then commit/push/Draft PR
   with capability/envelope/proof limits. No owner microtest per button or
   automatic product READY.

## Feasibility and pending material choices

Existing typed commands, ProjectHistory, Project Store and Media adapter remain
the boundaries. A closed nonrecursive `timeline.edit` aggregate over track.add,
clip.add/remove/trim can apply to one candidate and commit once. Validate child
effects and full journal identity before committing; no-op/failure preserve
redo. Prove archive compatibility and history/transcript scaling. No generic
IR, paths, scripts or arbitrary command endpoint is exposed to WebView.

Current preview guards reject multi-clip. Generic trim/concat does not express
a proved sequence clock/profile; owned intermediates and final artifact admission
need bounded extensions. Do not create fake source/export records for those
intermediates. Preview remains disposable; export reads originals and avoids
unnecessary generational encoding. Video/audio use source IN and cumulative
canonical placement, not independently reset stream clocks.

The owner also answered SIM to insert before the selected clip, duplicate
immediately after it, and failed save keeping the app open with explicit Retry
and a new close request. No automatic discard or automatic close follows retry.
These choices are approved, alongside the initial continuous track, append at
the end, ripple delete/trim, contiguous reorder and one action per Undo.

Before affected render implementation, resolve:

- Fix simple-export quality/profile, compatible-source envelope, frame/sample
  mapping/tolerances (fractional CFR/VFR included), canvas/orientation/audio
  coverage/no-audio and aggregate budgets against real runtime feasibility.
  No implicit 4K/HDR/platform promise or silent G1 scope restriction.

The approved M1 direction already fixes one initial continuous track, append at
the end, ripple delete/trim with no gap, contiguous reorder, one action per Undo
and immutable originals. These decisions are not pending. Independent M1 work
may continue while unresolved choices pause only the affected behavior.
Safe M0/M1 editing work proceeds while render choices remain pending. Independent source
reviews establish feasibility boundaries, not runtime execution.

## M0 technical checkpoint — 2026-10-05

Published technical Draft: [PR #86](https://github.com/inlifemedicina/cevra/pull/86),
now targeting main after #84/#85 integration. The independently reviewed implementation commit is
`1566d83a60983951815ddbf8f37699e144db76ca`, tree
`691f3a216361361bbbd14b1aeeb2fb236a9bc6e6`. The PR records remote checks for its
current head; publication is not merge or functional acceptance.

The technical M0 work is isolated on `feat/vids-g1-foundation`, based on exact head
`370e86b18599cd78c8dee3e4325caf9a0d05d6d3`. The implementation adds responsive
history/import/save controls and real tab focus, plus the closed atomic
`timeline.edit` primitive. General IR gaps/overlaps and legacy archive readers
are preserved. The existing single-clip application remains the consumer;
continuous G1 montage, sequence playback and final export are not implemented
by this checkpoint.

The deterministic command ACL files follow the existing tracked Tauri manifest
pattern, completing its declared command set. Only checkpoint retry and close
status are new commands; the other generated files describe already-declared
commands and grant no additional WebView capabilities.

Explicit checkpoint retry binds the full V3 archive, keeps pending/error state
truthful, confirms matching current with file/directory sync without rotation,
and creates no editing command. Cache invalidation includes a private per-instance
publication generation, so legal reuse of discarded-branch IDs cannot return a
stale token. The generation is absent from both archive and canonical SHA.
Tests cover redo/ABA, stale/concurrent/repeated
requests, failure after rename, corrupt current, newer memory and V2 retry
without rewriting legacy bytes. Native Close and Exit share an attempt-scoped
handshake: saved/recovered state and all active operations are checked before
freezing mutation admission. Unknown or uncommitted timeout preserves the Host;
only positively committed shutdown permits bounded process reaping. A terminal
latch prevents a polling/startup race from relaunching the Host before app exit.
Rejected close preserves selection and its explanation despite late mutation
success or rejection. No autosave/discard policy is introduced.

Current bounded automated evidence: Project IR 66/66, Project Store 16/16,
Desktop Host 137/137, Desktop UI 117/117 and Rust supervisor/boundary/manifest
35/35. Production Host/UI builds passed. A separate synthetic headless fixture
passed 16 PT/EN geometry cases at 900, 1120, 1121, 1200, 1320 and 1440 px, with
Retry, unsaved status and Undo/Redo visible, plus 900 px compact/media variants.
Host fixture tests use the already available private CPython 3.12.14; no model
download, inference, account/provider request or human app/device action occurs.
Complete local `npm run ci` passed on the current code after the generation fix,
including 391/391 controlled offline harness tests. The first attempt timed out
on one unchanged sub-100-ms deadline case (390/391); its isolated rerun and the
complete rerun passed, with the initial failure retained in disposable logs.
No provider/engine change was made for that transient failure. This does not
constitute remote CI or a functional owner PASS.

A synthetic scaling probe retained 12 sources, 12,000 words and 1,001 snapshots
at 1,000 commits. Archive size was 4,961,751 bytes; full token computation took
44.22 ms, cached median 1.12 ms and p95 1.65 ms after the generation fix.
Whole probe peak RSS was 228,786,176 bytes, including history construction;
it is neither token-only
memory nor whole application/process-tree memory or a G5 SLA. Metadata identity
still scales with retained history. Measurements and disposable logs remain
outside the tracked repository.

Independent read-only reviews APPROVE the atomic IR and Host persistence/close
paths. Launcher review found startup/exit and feedback/selection races; those
were fixed and its final reading APPROVE covers retry/native close. These are
scoped source reviews. Final independent readings APPROVE the exact implementation
tree above for IR/Store, Host persistence/close and native/UI integration; they
do not establish grouped G1/G5/G6 approval. This closeout documentation changes
no code, test, permission or generated manifest from that validated tree.
Unavailable acceptance variants remain BLOCKED on pending material choices and
actual sequence/render consumers; independent approved M1 edits may proceed.
Preserve R3/Take evidence, F-A02 allocation 1/1 and roadmap 55%. A technical Draft
publication does not authorize merging #86 or establish a functional G1 PASS.

Remote M0 PR CI `37369117129`, attempt 1, failed because hosted jobs were not
acquired (GitHub's annotation also reports an internal server error); a rerun
was requested. Push run `37369112248` acquired its desktop runner and exposed a
separate harness regression: the old private-Node smoke sent bare shutdown,
which the new production close guard correctly rejects. The smoke now performs
sequential hello → prepareClose → shutdown with one attempt ID, validates each
acknowledgement and zero exit, bounds total waiting/output and reaps only its
owned empty-store child before removing that store. Production close admission
is unchanged. Targeted smoke regression tests cover the actual bundled Host,
an unresponsive child that ignores TERM and a mismatched close acknowledgement
with a foreign directory preserved. Fresh exact-head remote checks remain
required; cancelled/failed attempts are not reclassified as passing.

## Automated acceptance package

Reuse I4-T1, D14-T2, D8-T2, I19-T1, I8-T3/T6/T11, I17-T8/T9 and
X-T1/T2/T3/T4/T5/T6/T7/T9/T10 at scoped delivered variants; G labels organize
execution and do not duplicate the acceptance catalog. Synthetic numbered/
barcoded frames and known PCM events have pinned hashes, profiles/tolerances.
Drive production application/IPC, not direct fixture IR edits.

- **G1:** import compatible sources; retain four source ranges; all montage
  operations; one-action undo/redo; program preview; save/reopen; original-master
  export; independent frame/audio/order/bounds/duration/codec oracles; immutable
  originals and stable IDs. Missing consumers/profile remain BLOCKED.
- **G5:** whole owned process tree, UI-ready/cold/warm/seek, cancel/eviction and
  realistic high-commit/multi-source history. Retained cache is not total memory.
- **G6:** fault→retry→reopen preserves full cursor/journal/redo/numbering;
  concurrent/stale/repeated retry does not duplicate edits or rotate previous
  unnecessarily; close/error/timeout never force-stops unsaved memory; close and
  mutation admission cannot race. Render/checkpoint stage faults and process
  death in disposable fixtures preserve originals, last output and foreign/
  ambiguous/redo-retained assets. No automatic replay or empty replacement over
  corruption; crash restores only a proved checkpoint.

## Product and Director boundaries

Creator=Lite; Studio=Full; Vids=Desktop. I19's technical label “Creator Skill
Lite/Full” describes their shared editorial/creative/QA core. Full/Studio has a
visual workspace and final output independent of Desktop Vids; standalone does
not prohibit UI. Handoff/Bridge are optional and retain typed boundaries.
Director impact: compatible editing/history extension without new proposal,
agent/provider execution or approval authority. Serialized actors/ledgers are
data, not grants. F-A02 stays exhausted 1/1; roadmap progress stays 55%.

Later identity/composition, audio/caption refinement, presets/Director and
distribution blocks remain planned. Full EDVID baseline stays in core; staged
dependencies do not make six styles+None, headlines/splits/B-roll, speech cuts,
J-cuts/audio finishing or QA optional Marketplace features.
