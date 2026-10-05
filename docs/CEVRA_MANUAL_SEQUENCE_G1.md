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
general CI `37371249855` attempt 1 ended with four unacquired/cancelled jobs and
one passing alignment job. After bounded retries, attempt 3 passed four jobs but
still failed when its hosted Transcription runner was not acquired. The detailed
receipt below retains the failure; this is not a complete post-merge CI PASS.
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
with a foreign directory preserved. Corrected head `58531d6` then passed fresh
push and PR CI 5/5, detailed below; cancelled/failed attempts remain preserved.

## M1 independent preparation — 2026-10-05

Separate branch `feat/vids-g1-manual-atomic-consumer`, based on M0 publication
head `60c639a09511df5fafa7dbd7ab8e63dc284f2241`, now includes corrected M0
head `58531d671d7e45931e079e153613962d23f932d7` through local merge `047cbe4`.
The existing first-excerpt
consumer now commits track preparation plus clip as one `timeline.edit`, so one
Undo restores the prior timeline exactly. Create and trim also bind async source
verification to the retained journal, rejecting an intervening edit/Undo even
when the visible snapshot ID returns. Focused automated evidence is 31/31
application and 9/9 Host manual tests, including durable Undo/reopen/Redo and
unchanged original bytes. This is preparation, not continuous montage delivery.

The local M1 preparation now implements closed version-1 append, insert before
selection, duplicate after selection, remove, ripple trim, split and complete
contiguous reorder. Each action compiles to one existing atomic timeline edit.
No-op/invalid/stale work preserves redo; allocated occurrence IDs cannot replace
an existing clip. The shared original-content guard retains the ingest evidence
and full journal binding. Metadata-only remove/reorder require no media read.
One typed Host/Rust/backend route uses the existing mutation/close/checkpoint
gates; it exposes no path, raw command, IR or filtergraph field. Generated ACL
and manifest admit only that specific route. The UI sequence controls and
program preview/export are still unconnected, so this is API preparation.
Application 287/287, Host 143/143, UI 118/118 and offline Rust 36/36 passed;
Host/UI production builds passed. New Host tests drive production RPC through
all intents, checkpoint, Undo/reopen/Redo and immutable original byte fixtures.
The first Host suite run caught the expected ACL list needing the new typed
permission; the corrected complete suite passed. This local branch remains
unpublished pending the complete workflow; no button-sized PR is created.

M0 head `58531d671d7e45931e079e153613962d23f932d7` passed push CI
`37373291877`, 5/5, and PR CI `37373297199` attempt 2, 5/5. PR attempt 1's
unacquired Media runner failure remains preserved. Post-#85 exact-runtime run
`37371249881` passed. General CI `37371249855` attempt 3 passed four jobs;
Transcription was not acquired by a hosted runner and had no execution steps.
GitHub reports internal-server correlation `73bcdb54-c553-45d8-98e5-f86f26522866`
in the [attempt receipt](https://github.com/inlifemedicina/cevra/actions/runs/37371249855/attempts/3).
That run remains FAILURE after bounded retries, not a full post-merge PASS.
These are separate receipts;
remote success on M0 is not CI or functional acceptance for this local M1 tree.

## Original-master export prototype and proposed choices

Private owned synthetic experiments ran with the existing macOS arm64 runtime
artifact 0.3.3. Its profile helper has the same SHA as the current 0.3.4 source,
but this is raw-engine feasibility, not 0.3.4/Application/IPC integration. The
generic `join.py` video path encodes; a closed packet-copy sequence extension is
still needed inside the existing engine. No new engine/dependency is proposed.

The first clock prototype preserved barcode order and video packet payload,
but stronger oracles rejected fractional CFR/VFR at clip heads/tails. Adjusting
only the joined tail was insufficient. A second unapproved policy experiment
selects the actual active frame (`PTS <= IN < PTS + duration`), places that first
sample at local zero, preserves subsequent PTS relative to IN, and normalizes
positive sample durations consecutively through exact OUT in every segment.
The four CFR30/fractional/VFR 360p/1080p cases passed barcode, each-sample
coverage, 7-ms cuts (one frame in CFR cases, two in VFR), exact boundaries and concatenated
payload/PTS/DTS/duration identity against normalized segments. Originals stayed
unchanged. A supplementary independent oracle decoded the original display
frames and used their explicit integer PTS/durations to verify uninterrupted
source coverage through every requested OUT. Missing middle-frame and short-tail
metadata faults were rejected. These sources have no B-frames; the packet-based
experiment is not a general display-order/source-admission proof. Proposed policy
preserves requested IN/OUT; frame-quantizing the
requested ranges is a different alternative requiring explicit approval.

Audio uses source IN and the same cumulative placement, original decoded PCM,
explicit edge silence and one final AAC192k encode. Stereo48k fixtures produced
129600 decoded samples without tail padding, 1024-sample priming skip and exact
2700-ms stream/packet coverage. A final MP4 with an injected 500-ms shift failed
the same diagnostic gate. SNR 33.39 dB/max error 0.111 on synthetic tones and
hard-cut jumps are measurements, not an audio/perceptual quality contract; no
automatic fade/downmix is selected.

A streamed high-motion full-colour 1080p30 program (60 s, four occurrences,
three unique segments, two original sources) confirmed 1800 video samples,
exact 60-s video/2,880,000 audio sample end and payload/PTS/DTS/duration copy.
The forced BT.709 signalling variant showed a large decoded comparison
difference in these fixtures: about 26-dB PSNR; its physical cause is not proved.
Omitting the forced override measured
42.21-dB PSNR/0.99290 SSIM on one 15-s segment at 4.98 Mb/s. The proposed higher
quality candidate, without that override at 20 Mb/s, measured segment means
54.07–54.60-dB PSNR/0.99946–0.99953 SSIM across the complete program. Its output
was 117,009,921 bytes; render stages took 8.666 s and retained owned intermediates
plus master used 342,570,676 bytes, excluding originals/private input copies.
Largest owned child RSS was 136,806,400 bytes and the Python oracle peak was
37,027,840 bytes. These are separate process peaks, not a simultaneous native
process-tree/G5 SLA. The measured lighter profile reduces file size/quality;
neither candidate is lossless or a natural-content subjective PASS.

The complete 60-s higher-quality master also passed independent source-slice
audio oracles: the canonical PCM matched exactly (RMSE 0); final raw AAC decoded
to 2,880,000 samples/channel without padding, with verified priming/packet bounds.
AAC versus original decoded slices measured SNR 45.09 dB and maximum absolute
error 0.20626, including cut-boundary errors; this is no perceptual contract.
Explicit original/final video metadata equality passed for format, bit depth,
colour tags, SAR, dimensions and field order. Colour tags were absent in these
fixtures, so preservation of explicitly tagged source colour is still unproved.
The active-frame video experiment and this full-colour/audio experiment are
complementary fixtures, not one integrated fractional/VFR high-quality export.

Concrete proposal pending owner decision: active-frame exact-range policy;
MP4/H264 VideoToolbox SDR/yuv420p without a forced BT.709 override, with declared
source-colour admission/preservation proved before production,
one original-derived lossy generation per unique segment, copy join/mux and
AAC192k once. Prefer the higher-quality candidate, with bitrate scaling and
canvas/cadence/audio/orientation compatibility explicitly fixed before shipping.
The existing Take source bounds are not silently narrowed or expanded by this
prototype. HDR/4K, rotated/mixed canvases, no-audio/mixed layouts, longer aggregate
programs and other rates require declared compatibility and execution proof.
Candidate operational gates are one render job, streaming I/O, 512 MiB renderer
subtree memory and 2 GiB total owned-job disk with explicit preflight/failure,
rather than truncating ranges or destroying unsaved Host state. These budgets
are proposed, not proved across the envelope or adopted production limits.
Retained owned-file totals are not sampled peak disk; originals and any private
input copies must also be accounted for before enforcing a total-job budget.

Minimum remaining integration: typed Contracts/Runtime plan and packet evidence,
source/display/colour admission and full clock oracle, owned-file publication/
cancel/recovery, Application export journal binding, native/Host/backend/UI
consumers, then grouped automated G1/G5/G6 and independent exact-tree review.
The 0.3.4 integration, Original preview eligibility fallback outside Take and
workload-derived preview deadline also remain FIX NOW prerequisites. No real
AI/provider/account request or human media/app/device action occurred.

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
