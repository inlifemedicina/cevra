# Manual sequence — foundation and G1

Status: APPROVED BLOCK DIRECTION / IN DEVELOPMENT, 2026-10-06 UTC.
No whole-product or owner PASS is recorded by this plan.

**Current decision, 2026-10-06 00:51 UTC:** the Owner approved a fixed CFR30
visual timeline and export, visible frame-aligned editing, the same PTS sampling
in preview/export, independent audio timing and explicit reversible conversion of
old projects. [ADR0033](adr/0033-manual-sequence-cfr30-clock.md) records the
category comparison, actual baseline feasibility and integration contract.
The real implementation is in the same Draft #87; #86/#87 remain unmerged.
Earlier OPEN temporal alternatives and seven-millisecond experiments below are
historical evidence, superseded for this workflow. This approval does not prove
every source, strict resource ceilings or product/owner acceptance gates.

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
still failed when its hosted Transcription runner was not acquired. After fresh
M1 Transcription runners executed successfully, one targeted retry was requested.
Attempt 4 completed SUCCESS, 5/5; prior failures remain preserved below.
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

Baseline preview guards rejected multi-clip; the bounded consumer below now
admits canonical occurrences through the existing clip route. Generic trim/concat does not express
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
and manifest admit only that specific route. Program preview/export consumers
remain unconnected; the subsequent UI preparation is recorded below.
Application 287/287, Host 143/143, UI 118/118 and offline Rust 36/36 passed;
Host/UI production builds passed. New Host tests drive production RPC through
all intents, checkpoint, Undo/reopen/Redo and immutable original byte fixtures.
The first Host suite run caught the expected ACL list needing the new typed
permission; the corrected complete suite passed. API head `711a6ff963937de1c59c3d6e70366ee646d95732`,
tree `5670030031bba2371bb65e19222b3baf9b2ef7bd`, is published as
[Draft #87](https://github.com/inlifemedicina/cevra/pull/87), stacked on #86's
foundation branch/head `58531d6`; later UI work continues in this same Draft.
PR CI `37377661842` and exact runtime `37377661645` passed. Push CI
`37377581988` failed one existing editorial UI fixture while four jobs passed.
The fixture attempted title edits before inputs became editable; its bounded
correction waits for editable state, with no production editorial change.

The working UI now connects all seven intents, reusable source-clock IN/OUT and
numeric source ranges, insert before selection, adjacent moves and ripple trim
handles on the selected montage clip. It uses the existing mutation/close/save
gates, preserves newer selections on late confirmation and reconciles committed
save errors without replay. PT/EN have the same controls. At that UI checkpoint
montage playback was explicitly pending; multi-clip selection showed Original.
The later consumer below expands playback within its existing Take envelope.
Seven focused UI tests passed using the production Application service
with controlled offline identity/transport fixtures; the complete Desktop suite
passed 125/125, i18n 2/2 and the production build passed. Both independent
read-only reviews approved UI tree `71c7ceb96883ef163e08752b54314af6dd15389b`.
Twelve owned headless layout cases passed at 900/1120/1440 px, PT/EN and
open/compact sidebar, checking hit targets, clip-row visibility and overflow.
An initial browser failure from a value import of Application's Node utilities
was fixed with type-only imports and browser-only affordance checks; authoritative
validation remains in Host/Application. UI publication proceeds in the same Draft.

UI head `508436ed199d99522a0eebd93246541d12e11770`, tree
`a4753313dfcbe4ebe3bffbf6c3f5030b0b961ad7`, is now published in Draft #87;
its exact-head remote checks are being monitored separately from local proof.
The next read-only Application preparation resolves the canonical ordered clips
and only their unique original sources, verifies every original and rechecks all
operational stamps after the last hash. It binds the immutable ephemeral plan to
the retained journal, rejecting edit/Undo ABA and forged/foreign plans. Program
joins select the following occurrence; exact program OUT returns no source frame
position. Cancellation reaches identity work. Application 296/296 and Host
143/143 regressions passed; the first new fixture omitted required displayName
and was corrected before the complete passing run. This is canonical preparation,
not decoded playback, rendered-byte/source admission or frame-policy adoption.
It writes no IR, history, persistent source, export or cache record.
Independent review caught an intermediate numeric overflow near MAX_SAFE_INTEGER;
the clock now computes source IN plus the bounded local offset, with one- and
four-millisecond near-MAX head/tail oracles passing. Desktop 125/125 and the
production build also passed against this preparation.

The independently reviewed canonical preparation is now published at `6b9c737`,
tree `85f6c60c5b84c19a6a4bfb9b32358560d1f47e8c`, in the same Draft. UI head
`508436e` passed push CI `37381516705`, PR CI `37381522054` and exact runtime
`37381522040`, all attempt 1. Later heads require their own receipts.
At `6b9c737`, PR CI `37382806573` and exact runtime `37382806557` passed;
push CI `37382801295` passed four jobs but its Media release-signature step
failed: the zlib signing-key source contained no armored public key. This remains
a failure, even though the same head's PR job passed. No release pin, signature
verification or model/provider behavior was weakened; the next head receives
fresh exact-head checks rather than inheriting those PASS receipts.

The next bounded preview prerequisites preserve the existing Take derivative
route while Original outside known Take metadata bounds can use the existing
verified ≤8-MiB byte transport. Known duration/resolution/HDR/audio exclusions
never silently fall through to an unadmitted proxy; browser decoding still decides
playability, and transport tests do not prove those formats playable. Named-file
identity is checked again after the original read.
The Host deadline accounts for full-source inspection, selected-range encoding
and four conservative I/O passes, bounded to six minutes; native preparation has
a seven-minute ceiling. These are cancellation allowances, not latency promises.
A concrete recovery fault was fixed: unknown preview retirement formerly failed
and killed the Host. The new path keeps canonical memory alive, retains a bounded
receiver per unsettled request to discard its late result and blocks new previews
until actual settlement. Canonical reads/save remain available; Host active-task
and saved-state guards still govern close. PT/EN expose a truthful settling error
and explicit read-only Retry; no automatic retries or audiovisual edits occur.
Host 145/145, offline Rust 38/38, UI 126/126, focused preview UI 46/46, i18n 2/2
and production build passed. Independent review found a race between admission
and marking unknown retirement; both now use one short mutex without awaits,
with a forced-interleaving regression. Native and Host/UI reviews approved source
tree `ff7017e10063683e0f08de275a68aa54690293cb`. These prerequisites
are separate from sequence decoding, export timing and product acceptance.

M0 head `58531d671d7e45931e079e153613962d23f932d7` passed push CI
`37373291877`, 5/5, and PR CI `37373297199` attempt 2, 5/5. PR attempt 1's
unacquired Media runner failure remains preserved. Post-#85 exact-runtime run
`37371249881` passed. General CI `37371249855` attempt 3 passed four jobs;
Transcription was not acquired by a hosted runner and had no execution steps.
GitHub reports internal-server correlation `73bcdb54-c553-45d8-98e5-f86f26522866`
in the [attempt receipt](https://github.com/inlifemedicina/cevra/actions/runs/37371249855/attempts/3).
Attempt 4 later completed SUCCESS, 5/5, after a single targeted retry supported
by fresh successful M1 runner execution. Main's actual Transcription job executed
its nine steps and passed; this is a terminal post-merge receipt, distinct from
the equivalent unchanged contracts passed on M0. Attempts 1–3 remain failures.
These are separate receipts;
remote success on M0 is not CI or functional acceptance for this local M1 tree.

## Canonical sequence playback — 2026-10-05 technical preparation

The production app now exposes Sequence and Original on the same manual surface.
Sequence walks canonical occurrences through the existing closed
video.previewLocal command. The Host resolves the whole contiguous sequence,
prepares an immutable plan bound to full journal identity and verifies every
unique original before and after asynchronous clip preparation. Edit/Undo ABA,
other-source replacement, cancellation and superseding seeks cannot publish the
old result. No IR/history/checkpoint/export record is written by playback.

The UI owns one admitted clip Blob/decoder at a time. Program seek selects the
following occurrence at a join; exact program OUT hides the picture and stops.
Play can continue into the next prepared clip, explicit repeat returns to zero,
and Original remains available for reusable source-clock marks. Preparing joins
may wait: this is sequential bounded playback, not proved gapless/synchronized
montage delivery. A mutation/close/save gate clears playback intent, pending
operations cancel on a snapshot/mode change and late responses/events are
ignored. A paused mode round-trip preserves its actual program position; fresh
snapshots respect a selected Original. Only the existing Take source/decoded
frame/AAC envelope is admitted. No new exact-edge policy, export profile,
dependency, native route or ACL is introduced. The existing frame/AAC
quantization and native decoding/perceptual limits still apply.

UNIT/FAKE: Host 149/149, Application 296/296, Desktop 134/134, offline Rust 38/38
and i18n 2/2 passed; Host and Desktop builds passed. Eight new UI cases cover
joins/OUT, seek, repeat, snapshot edits, gating, mode round-trip, active-mode
clicks, late ended events and production App exposure. Four new Host cases
drive real sequence RPC/identity with controlled transport/engine fixtures,
including original continuity, retained redo, other-source replacement and
retirement. The first full UI run failed one obsolete assertion that sequence
playback was pending; that assertion now checks the available mode controls.
Independent reviews requested fixes for lost paused position, false pause
intent and late ended clocks. Both approved corrected source tree
047206a0671aa2ee550669d8bc1437398f4830b8 with regressions. Current-head CI is
separate; prior recovery head 230c3ff passed push 37383941620 (5/5), PR
37383945568 (5/5) and exact runtime 37383945606 (1/1), attempt 1.
Twelve owned headless layout cases passed at 900/1120/1440 pixels, PT/EN and
open/compact inspector: Sequence/Original, repeat, retry, play and seek controls
remain visible and hit-testable, with video space and timeline clips retained.
These controlled transport fixtures exercise layout, not native media playback.
No APP/OWNER, native decoder, end-to-end G1/G5/G6 or export acceptance follows.

### B-frame fixture diagnosis and temporal recommendation

Owned fixture diagnosis isolated the earlier VideoToolbox -12908 failure.
Identical bounded commands for H.264 with and without B-frames failed inside
the execution sandbox and succeeded under approved execution outside it; the
specific blocked platform service was not inspected. The available software
MPEG-4 fixture also succeeded inside the sandbox. No installation, dependency,
production encoder fallback or profile change was made. Failed receipts remain
retained outside the tracked repository.

The H.264 B-frame fixture has 60 decoded pictures and reports has_b_frames=2,
monotonic display PTS and packet/display timestamp bijection; packet order
differs from display order. The active picture at source IN901 ms begins at
900000 us and covers OUT908 ms. A separately labelled technical 1080p H.264
experiment emits one picture at PTS0 with 7000-us exposure, compressed payload
unchanged by duration normalization and original hash intact. Its measured rate
is 1000/7, not strict 30 fps. This proves that bounded display-order/active-frame
handling is feasible; it does not adopt production cuts, prove colour/audio
quality or complete export admission. Private evidence:
bframe-diagnosis-zzv6ws9l/receipt.json (sandbox),
bframe-diagnosis-b6hrbpoq/receipt.json (approved execution), and
bframe-clock-lflcvn12/receipt.json under the owned prototype directory.

Recommendation for owner decision: keep every canonical IN/OUT exact in Project
IR; prioritize those approved editorial cuts in the initial output by using
nominal 30-fps cadence with clipped boundary picture exposures, clearly described
as variable boundary durations. That option needs explicit approval and
compatibility/quality admission before production. If strict CFR30 delivery is
required, use a separately reviewed disposable export mapping to the global
1/30-second grid, disclose changed joins and reject a collapsed subframe clip
instead of silently dropping or stretching it. Never rewrite Project IR for
either export option.

| Real output alternative | Exact requested cuts | Perceptible/compatibility consequence |
|---|---|---|
| Nominal 30-fps interior with variable boundary exposure | Preserves arbitrary millisecond joins/OUT within the admitted output clock | A 7-ms occurrence remains 7 ms; very short pictures may be difficult to perceive. The file is VFR at boundaries and strict-CFR workflows need separate validation. |
| Strict CFR30 with explicit export-only quantization | Project stays exact; file joins move to the output frame grid | Nearest rounding alone moves a boundary by at most 16.667 ms; an interval's duration can change by 33.333 ms. Enforcing one picture per tiny clip can exceed those bounds. Present/reject that conflict rather than silently modifying cuts. |
| Exact container terminal duration only | Can address final duration; cannot express every arbitrary internal join on one fixed picture grid | Does not solve the multi-clip/subframe conflict; no portable edit-list solution is proved. |

A 7-ms cut cannot contain an integer number of constant 1/30-second exposures.
For the proposed exact-edge option, display the picture already active at IN
until the next source picture or OUT; OUT is half-open and contributes no later
source content. For strict CFR, frame-grid quantization belongs to the output
mapping, while source IN/OUT and undo/redo remain unchanged in the project.
This is a recommendation and mathematical/fixture finding, not owner consent.
FFmpeg documents CFR duplication/drop and timestamp-preserving passthrough in
its [video synchronization options](https://ffmpeg.org/ffmpeg.html#Advanced-video-options);
the [fps filter](https://ffmpeg.org/ffmpeg-filters.html#fps) exposes explicit
rounding. These mechanisms do not resolve the product choice automatically.

Director impact: compatible read-only consumer on the same typed operations,
Project IR and History. Remaining work includes whole-flow latency/resource
proof, source/display/colour/audio admission, final export/publication and the
grouped human tests. The owner-approved 512-MiB/2-GiB render limits are still
requirements awaiting enforcement/whole-process measurement, not PASS receipts.

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

The owner approved the initial simple-export profile on 2026-10-05:
MP4/H264/AAC, 1920×1080, 30 fps, SDR and a 20-Mb/s target, preserving requested
IN/OUT; 512 MiB renderer memory and 2 GiB owned temporary job files, with a clear
error rather than silent quality reduction. This authorizes bounded implementation
and automatic validation, not other formats/resolutions, HDR or a source-cut change.
Technical admission and temporal feasibility remain required before adoption.

The boundary-cadence distinction is concrete: an owned 1080p H264 fixture for
IN 901/OUT 908 has one packet at zero with exactly 7,000 μs duration. Its reported
rate is 1000/7, not constant 30 Hz. Exact arbitrary millisecond cuts require
shortened first/last picture exposure; strict 30-Hz frame exposures cannot also
represent a 7-ms program. Do not infer approval to snap cuts or silently describe
variable boundary timing as strict CFR30. The affected cadence interpretation
must be reconciled with the owner-approved profile before production admission;
independent UI and canonical preview-plan preparation continue.

The active-frame implementation proposal remains under that temporal check:
MP4/H264 VideoToolbox SDR/yuv420p without a forced BT.709 override, with declared
source-colour admission/preservation proved before production,
one original-derived lossy generation per unique segment, copy join/mux and
AAC192k once. Prefer the higher-quality candidate, with bitrate scaling and
canvas/cadence/audio/orientation compatibility explicitly fixed before shipping.
The existing Take source bounds are not silently narrowed or expanded by this
prototype. HDR/4K, rotated/mixed canvases, no-audio/mixed layouts, longer aggregate
programs and other rates require declared compatibility and execution proof.
Approved initial operational gates are one render job, streaming I/O, 512 MiB renderer
subtree memory and 2 GiB total owned-job disk with explicit preflight/failure,
rather than truncating ranges or destroying unsaved Host state. These budgets
are approved targets, not proved across the envelope or adopted production limits.
Retained owned-file totals are not sampled peak disk; preflight must account for
source sizes and any private input copies before enforcing a total-job budget.

The proposed temporal choice and approved initial profile/resource requirements,
with their proof limits, remain in this same plan:

- **Proposed off-grid cuts, pending owner decision:** show the original frame already active at requested IN,
  beginning at local zero, preserve later frame times and end exactly at OUT.
  For a 30-fps frame spanning 900–933.333 ms, IN 901/OUT 908 displays that active
  picture for exactly 7 ms; audio uses the requested source range. The alternative
  is snapping requested boundaries to a frame grid, which changes timing and can
  expand or empty a sub-frame excerpt. The proposed implementation would use
  decoded display-frame coverage, including B-frame order, and reject unproved
  gaps/tails visibly. No production temporal policy is adopted by this prototype.
- **Default quality/size:** the approved initial requirements are MP4/H264/AAC,
  SDR, 20 Mb/s target and 1920×1080/30 fps. Whether that cadence permits variable
  boundary exposures or requires strict CFR is the pending temporal decision. The measured
  candidate uses VideoToolbox, 8-bit yuv420p and one AAC192k encode; those
  implementation details still require technical admission.
  The alternative 4.98-Mb/s candidate makes smaller files at the measured lower
  fidelity. This test selects no HDR/4K or Windows export promise. Other admitted
  canvases/cadences/rotation/colour/audio layouts need measured compatibility;
  bitrate scaling is engineering work under the chosen quality priority.
- **Approved resource requirements:** one streaming render job, 512 MiB
  resident memory for its owned renderer subtree and 2 GiB of owned job files,
  including private input copies, intermediates and the new output. Existing
  original files outside the job remain immutable. These numbers give headroom
  over the measured ~137-MB single-child peak and ~491-MB retained files plus
  originals, but whole-subtree/peak-disk evidence is still required. There is no
  new fixed aggregate-duration limit: duration is the sum of canonical ranges;
  longer programs consume more resources. Preflight rejects an over-budget plan
  visibly; a measured overrun cancels only the owned render, preserves project/
  unsaved Host/originals/prior final output and reports the limit, without silently
  truncating ranges or lowering quality. The approved thresholds still require
  enforcement and measured proof across the full envelope.

Packet timescales, flags, sampling, copy checks and exact threshold tuning are
technical validation, not separate owner protocols. Approval of the initial
profile/resource requirements does not approve the proposed temporal choice,
certify the unmeasured envelope or close G1/G5/G6.

Minimum remaining integration: typed Contracts/Runtime plan and packet evidence,
source/display/colour admission and full clock oracle, owned-file publication/
cancel/recovery, Application export journal binding, native/Host/backend/UI
consumers, then grouped automated G1/G5/G6 and independent exact-tree review.
The 0.3.4 integration remains a prerequisite. Original preview eligibility
fallback outside Take and the workload-derived preview deadline were integrated
on recovery head 230c3ff in Draft #87; their bounded technical evidence does not
close final export admission. No real AI/provider/account request or human
media/app/device action occurred.

## Independent export preparation — 2026-10-06

This continuation stays in stacked Draft #87; #86/#87 are not authorized for
merge. It delivers read-only destination preparation while the boundary-cadence
decision stays OPEN. Final Export remains unavailable. Preparation neither
renders nor creates an output, export record, execution archive intent or
checkpoint. It does not admit source compatibility for final delivery. Exact
canonical cuts, including seven-millisecond ranges, remain intact.

The closed Application service reuses canonical sequence/original identity
checks, binds the complete journal and rechecks every original after destination
I/O. Its immutable summary has `renderAvailable:false`. The native save picker
supplies the path privately; WebView arguments contain only version/snapshot/
operation/locale. Host checks an absent MP4 target, canonical directory dev/inode,
writable destination/temporary volumes and free bytes without a write probe or
reservation. Existing outputs, original aliases, hard links and dangling links
are refused. Only proved mandatory-copy impossibility is rejected; bitrate
estimates are not a VBR bound, duration restriction or promise that render fits.

A native picker lease participates in Close before a Host operation exists.
Cancellation and Host admission are serialized; late success is discarded.
Host supersession waits for settlement and checks full journal identity,
including edit/Undo ABA. Native timeout retains unsaved Host memory and unknown
retirement receivers. The UI holds the request through cancellation, retains
unsettled warnings and ignores stale/unmounted results. The panel is inside the
existing Inspector scroll area in PT/EN. Collision, original availability, job
limit and filesystem space have distinct errors; no prior output is replaced.

### Resource and integrity infrastructure, with proof limits

The existing Process Media transport offers one trusted owned-job budget scope.
Its captured generation cannot restart within a terminal scope; every abnormal
exit retires/settles that generation before releasing admission or observation.
Success requires the same healthy worker and no descendant left in its private
POSIX group. Aggregate RSS and all files in a registered owned tree are counted,
including copies, graphs, intermediates and staging. Hard links count per name;
both logical and allocated bytes are checked. Symlinks, directory replacement or
measurement failure stop the scope. Streamed candidate SHA and POSIX publication
ownership remain separate; matching bytes never grant deletion authority.

This is a **sampled watchdog**: 100-ms delay plus observation time, not a proved
instantaneous hard cap. A negative native fixture observed aggregate 623673344 B
against the approved 536870912-B requirement; its largest member was 302219264 B.
The owned group was interrupted and settled. Reparented group membership was
observed. Sparse staging plus input copies crossed 2147483648 logical B and was
refused while originals/prior output stayed intact. Production export must
register every live allocation and retain the lease through admission/publication.
The Audio Sequence graph-location correction below closes one concrete allocation
gap; it does not establish complete job registration. Open-unlinked
allocations, processes escaping that group and OS/GPU/service memory are not
proved by this observer. The approved requirements have not been weakened.

Review found early observation release on caller validation failure, respawn
after overrun, empty-group success and restart racing retirement. Generation
binding/abnormal retirement were corrected with regressions. The first complete
Host run found a stale exact ACL expectation; only the approved preparation
command was added. Initial layout fixtures used an ambiguous tab selector and
ran during build reloads; corrected stable receipts remain separate. Historical
failures are retained rather than promoted to PASS.

Complete offline checks passed: Application 300/300, Host 154/154, Media 136/136
(including ten resource/lifecycle cases), Desktop 142/142, Rust 42/42 and i18n
2/2; Host/Desktop builds passed. Twelve owned headless App cases at 900/1120/
1440 px, PT/EN and open/compact passed: preparation, cancel and status are
reachable/hit-testable inside Inspector scroll, with preview/timeline retained.
These are UNIT/FAKE/browser/native-process fixtures, not APP/OWNER acceptance.
Publication/exact-head CI is recorded separately in the Draft and local receipt.

### Isolated quality/resource measurements

An owned whole-frame-aligned fixture uses two synthetic 1080p30 originals,
four occurrences/three unique ranges and 60 s at the approved 20-Mb/s target.
Sealed input copies, float32 PCM, intermediates, candidate and publication
staging coexist in the owned job. Across 155 live/phase-boundary observations,
peak aggregate renderer RSS was 159744000 B; logical/allocated job bytes peaked
at 608503930/609619968. Staging matched the streamed candidate hash, actual
original hashes stayed intact and video packet payload/PTS/DTS/duration matched
through concat/final mux. Video ended at 60000000 us with 1800 pictures; audio
at 2880000 samples. The encoded ranges measured mean PSNR 54.07–54.60 dB and
mean SSIM 0.99946–0.99953 against decoded originals. These are synthetic technical
measurements, not perceptual acceptance, natural-content coverage, arbitrary-edge
proof, a latency SLA or a general source envelope.

The first two live-budget attempts stopped on observer failure before encoding:
macOS pgrep omits ancestors when the observer runs inside the synthetic renderer.
That fixture now includes its known own PID; the production observer runs outside
the renderer. Both failures remain retained. Successful receipt:
`quality20-live-budget-_0ew17dl/quality-results.json` in the owned prototype folder.
Separate per-source range/matrix preservation passed for BT709 and SMPTE170M
fixtures whose transfer/primaries were absent. A fully tagged BT709 fixture
then verified all four source signalling fields under the unforced profile,
unchanged original hash and unchanged decoded frames after optional packet-copy
VUI carry. Receipts: `tagged-colour-kpq9gi13/receipt.json` and
`full-tag-preservation-ba8eyol5/receipt.json`. Mixed signalling/HDR and perceptual
admission remain unproved. Probes use the available pinned 0.3.3 runtime; sealed
0.3.4 export integration is separate. No fallback encoder, provider or install.

### Ready, temporal-dependent and remaining engineering closure

| Area | Current boundary |
|---|---|
| Destination/state/errors/cancel | Implemented read-only; final file generation unavailable. |
| Exact project cuts and originals | Preserved; preparation does not quantize or edit them. |
| Resource/integrity primitives | Tested for a registered private POSIX job; not a complete pipeline or hard-cap proof. |
| Delivery cadence/active boundary exposures | Owner approved CFR30 timeline/export on 2026-10-06; visible frame edits and explicit reversible legacy conversion are implemented under ADR0033. |
| Final pipeline, source envelope, colour/audio admission | Engineering integration/oracles required; no silent compatibility or profile downgrade. |
| Live allocations/publication/resource ceiling | Complete runtime/Host integration/proof required; sampled excess interruption does not meet a strict no-overshoot ceiling. |
| APP/OWNER, native montage decoding/sync, G1/G5/G6 | Pending/BLOCKED; unit/browser/isolated encoder evidence does not promote these IDs. |

The [single grouped G1 human script](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md#single-grouped-g1-script)
is prepared for a coordinated future build, reusing existing IDs. No new owner
round or saved human/Take session operation is requested. Director impact is
compatible; progress stays 55%, F-A02 stays exhausted 1/1.

### Existing execution reuse and owned Audio Sequence allocation correction

The next independent continuation fixes the actual Audio Sequence executor,
rather than adding another preparatory service. Its instruction graph previously
used the global temporary directory, outside the PCM output's staging tree, and
its cleanup path was captured only after writing. It now creates the existing
private operation staging directory first, assigns the graph path before an
exclusive write, and keeps graph and PCM in that directory. Existing `finally`
cleanup therefore covers a partial graph write as well as render cancellation.
The graph will be included in owned-tree accounting when the caller's output
parent is registered; that caller integration and strict resource proof remain
open. No audio samples, cadence, delivery profile or admission rules change.

Worker regressions passed 44/44 and the complete Media Python suite 103/103.
The new live-allocation test was deliberately run against `80ee7c8`'s executor:
both success/cancellation cases failed at the out-of-tree graph assertion.
Corrected filesystem fixtures verify graph/PCM coexistence under private POSIX
`0700` staging, original preservation, cleanup after cancellation and an injected
partial-write ENOSPC error. FFmpeg is simulated in these tests; this does not
claim real storage exhaustion, native process cancellation or full export limits.
At this local correction checkpoint, sealed-runtime execution of the corrected
commit is pending; the Draft/receipt separately records its terminal CI gates.

Publication/history/recovery are existing approved primitives, not absent
infrastructure: ADR0027's `render-audio-sequence`/`mux-audio` use exclusive
owner-scoped staging links with POSIX identity re-proof; Media Application commits
`export.add`, and ADR0028's operational archive reconciles against restored
ProjectHistory without replay. Desktop marks durable success only after the
canonical checkpoint. These contracts will be reused; a new parallel publisher,
journal, archive or generic preparatory export service was not added.

The real manual-export caller still needs a validated visual producer. The
existing final mux requires explicit same-binding visual and PCM durations;
choosing strict CFR grid mapping versus exact boundary exposure changes that
producer's clock proof. Existing `ResolvedAudioPlan` compiles only canonical
audio tracks and deliberately refuses to infer audio from a video track. The
current G1 manual sequence is a video track, so it cannot simply be passed to
that compiler. Final integration must explicitly bind source audio to the
canonical occurrences through the approved typed Audio Sequence contract, or
report a material unsupported source/mapping decision. It must not invent
silence, stream selection, fades, normalization, ducking or a second editable
timeline. Apart from the concrete graph correction, connecting resources,
publication and recovery without that actual producer would be unused
infrastructure. The accepted CFR30 decision now drives the real end-to-end path,
explicit single-source audio admission and reuse of those existing contracts.
Final Export was unavailable on the preceding preparation head `4e6f58d`.
The subsequent CFR30 implementation is described in the current checkpoint below.

## Current CFR30 implementation and technical evidence — 2026-10-06

Project IR schema 3 preserves v1/v2 retained snapshots, journal, cursor and redo
with `legacy-milliseconds` timing. Its explicit `cfr30` policy makes integer,
half-open frame ranges authoritative and strictly validates the existing
millisecond projections. New manual edits use typed V2 commands; an old sequence
requires a visible, reviewed, reversible conform action. Audio clip timing stays
independent. No opening-time or export-only rounding changes old edits.

The actual Normal editing surface and closed native/Host path now connect frame
editing, reviewed conform, original/sequence preview and the native Save picker
to `ManualSequenceExportApplicationService`, existing durable Media execution,
`export.add` and checkpoint/recovery. UI sends no filesystem path, filter graph,
resource override or provider instruction. A mutation gate retires and awaits
prior previews before admitting the final resource scope. Post-commit execution
archive failure carries trusted canonical evidence and checkpoints once; explicit
save retry does not rerender. Lost publication proof preserves the owned root,
accounting link and possible final, reporting uncertainty without `export.add`.
Manual-final failure handling never checks an inode and then unlinks the public
name: a concurrent replacement could race those separate operations. Possible
post-publication failures conservatively preserve the public destination. An
uncertain publication without a confirmed canonical commit, or unproved process
retirement, also retains the accounting link and private root. After a confirmed
commit and proved retirement, Host may remove those private artifacts while
preserving the final and `export.add`. Errors report a sanitized resource reason
when relevant. Explicit failure cleanup also preserves that public name. Private
intermediates remain independently owned and cleaned after retirement; legacy
mux rollback is unchanged. Native mutation timeout reconciliation preserves a late
Host publication/commit error and its sanitized details, replaces only the state
with the current snapshot, and never dispatches a second export.

The original-master worker seals and revalidates each original, samples actual
source PTS with the shared preview/final CFR30 rule, encodes each unique interval
once and packet-concatenates occurrences. It renders explicitly admitted source
audio to 48000-Hz float PCM, exactly 1600 samples per output frame, then uses the
existing exclusive MP4/H264/AAC publisher. Final video stays SDR 1920×1080 at a
20-Mb/s target. Disposable preview inherits the 720-side/8-MiB transport envelope
(720×404, H264 700-kb/s target, AAC 96-kb/s), with a measured pre-publication size
gate. It never substitutes for the final original inputs. AAC priming, edit-list
and terminal padding are checked against contiguous decoded frame PTS and actual
sample counts, including FFmpeg 9's already-clipped terminal packet duration.

Admission is deliberately bounded by the existing source inspector: each source
is at most 60 s/256 MiB, admitted SDR8 video with exactly one measured video and
one mono/stereo 44100/48000-Hz audio stream. Requested ranges must be covered by
both clocks; no silence is invented. Missing/ambiguous audio, HDR, unsupported
layout, mixed source colour/pixel signalling or uncovered ranges fail clearly.
All copies, graphs, segments, PCM, candidates and the final accounting hard link
stay in the issued private job tree through the final sampled resource check.
Original retains the existing Take source-clock route, including its existing
bounded leading/trailing preview padding. A source with a 30-ms audio origin can
remain visible and markable in Original while only actually covered canonical
cuts enter the final renderer. This preview allowance does not invent silence in
final output. Sequence/excerpt previews and final share the CFR30 sampler;
Original retains actual source picture cadence and PTS.

Local offline evidence: all workspace builds passed; IR 70/70, Store 18/18,
Application 314/314 (including final export 9/9), Contracts 25/25, Host 172/172,
UI 155/155 and i18n 2/2 passed. Media Node passed 138 inside the sandbox plus two
native observer tests in the approved own-process context (140/140 combined);
Media Python passed 121/121. Rust passed 48/48, including late native timeout
publication/resource and committed-error reconciliation. Offline agent regressions passed
391/391 with no live provider execution. The first whole-workspace run
retained four environment failures: system Python 3.9 failed two model-fixture
checks and sandbox-denied `ps` blocked two observer checks. The pinned Python
3.12 Host run and scoped native observer rerun resolved those exact failures.
These are offline/fixture results, not owner playback or release acceptance.
The first final UI run retained a corrected fixture-accessor failure and one
existing unsaved-refresh assertion failure; the corrected-tree complete rerun
passed 155/155. No unrelated product source was changed to hide that result.

The current-source native worker, using already verified pinned tools, passed
CFR24/B-frame, 30000/1001 and VFR original fixtures; 31-frame and one-frame cuts,
repeated intervals and a 60-s Full HD sequence. Independent decoded comparisons
against originals measured mean PSNR 49.90–51.23 dB on the short ranges and
58.18 dB (minimum 50.41 dB) on 1800 Full HD frames. Each final and the 60-s preview
had exact frame/decoded-AAC counts and unchanged original hashes; preview measured
4,452,793 bytes, 1800 frames and 2,880,000 samples. This probe is current source
plus pinned tools, not by itself a sealed current-bundle or subjective PASS.

The final R2 run made 436 resource observations: peak aggregate owned-process RSS
178,257,920 B, logical job files 583,955,456 B and allocated job files
604,991,488 B. These bounded observations fit 512 MiB/2 GiB; they do not establish
an instantaneous ceiling. The deliberate observer regression detected aggregate
RSS 623,558,656 B before retiring its owned group, explicitly disproving a
no-overshoot claim. VBR target estimates are not reservations or global maxima.

The checked-in `manual-sequence-runtime.mjs` separately passed the exact sealed
0.3.4 R2 runtime (manifest SHA256
`aa9f8bc1fc52a085551d4623e842822a4d56a3da6f3f601d8a3072fb73e5b844`). All nine
sealed worker module hashes match current source. It drives production ingest,
V2 edits, the actual Host guard before `export.add`, Application/Media/artifact
identity and persisted ProjectStore/execution archives. Independent rational PTS
barcode oracles verify CFR24/B frames, late NTSC frames 1000–1031 (with a naive
index negative control), VFR, a one-frame occurrence and repeated ranges. Actual
44100-Hz stereo with 30-ms origin verifies channel pulses and cut exclusions;
AAC/PCM counts are exact, with a declared 6-ms lossy-waveform localization window.
The real `DerivedVideoPreview` verifies Original's 72 pictures/24fps/source PTS,
whole-source audio pulses, initial PNG, unchanged histories and cache without
replay. Save/reopen/Undo/Redo preserves sources, receipts and output without new
render. Its 60-s flat-barcode stress measured 11.246 s final render, sampled RSS
133,627,904 B and logical/allocated job files 39,407,529/39,481,344 B. This smaller
entropy fixture complements the separate Full HD quality/allocation probe;
neither measurement proves worst-case resource use or subjective playback.

The existing exact-runtime workflow now includes that catalog and its existing
Host/Store build dependencies, without a new engine or dependency. Historical
setup failures, first AAC failure (priming-field parsing/terminal double-discard)
and R1 receipts remain retained; final R2 checks do not rewrite those outcomes.

Strict resource-ceiling proof, broader source/envelope and native perceptual/
gapless/owner acceptance remain open. G1/G5/G6, NATIVE and OWNER stay unpromoted;
progress 55%, F-A02 exhausted 1/1. No AI, dependency, merge or human media/app/device
action occurred. The exact-tree review, sealed functional catalog and terminal
published-head CI receipts accompany the same Draft publication.

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

## Subsequent isolated native-package preparation — 2026-10-06

The preceding CFR30 implementation was published at
`cb774cad53e6cdf3ac535d08bc4e12d9e9122391`, with all 11 push/PR/exact-runtime CI
jobs successful on attempt 1. The next bounded preparation fixes a concrete
publication-admission gap: the original callback checked the candidate alone,
while the Host aggregate check followed public publication. The callback now
scans the full private tree through no-follow directory descriptors, counts
logical/allocated bytes per name, projects the accounting hardlink, and scans
again after linking account and before the existing public publisher. Persistent
aggregate excess prevents publication. Identity changes, symlinks, special files,
filesystem crossing and bounded-scan failures reject admission. No engine,
publisher, DTO, preset, resource requirement or editing/history policy changes.

Python 126/126 passed, including sparse/logical and allocated boundaries,
hardlink projection, rejected aliases/replaced roots, complete pipeline rejection
before account/publication, and post-account rejection preserving private evidence.
Exact sealed R3 native functional acceptance passed the existing CFR/B-frame/
late-NTSC/VFR barcodes, independent stereo audio, Original source clock, audited
export/reopen/Undo/Redo without replay and 60-s output. All nine sealed modules
match source; R3 manifest SHA-256 is
`ac2663fe25458970b153557b7255fe35f48a8152f533ca84f811112ec4e73cf0`.
The R3 long flat-barcode final sampled 133562368 B RSS, 39407529 B logical and
39481344 B allocated. The separate higher-entropy Full HD PSNR and resource
measurements above remain their R2 receipts; they are not a repeated R3 stress test.

The package uses an isolated native identifier, project root and copied runtimes;
build/packaged-Host validation and exact-head review/CI receipts accompany Draft #87.
Two original authored flash/beep fixtures have recorded hashes and explicit SDR
BT709 signalling: A 8 s/CFR24 and B 6.006 s/30000/1001, both 1080p/AAC48k stereo.
The grouped script's reference sequence totals 165 frames/5.5 s/264000 samples per
channel. These inputs support bounded order/timing/UX review, not voice/lip or
arbitrary-content acceptance. No app/window/device or human Take session is operated.

The existing watchdog waits 100 ms after a completed scan, so observation gaps
include filesystem/process enumeration and scheduling. It covers the private
worker group and owned file tree, not Host/UI or external OS services. Real
projects can exceed RSS or disk between scans; source limits and target-bitrate
estimates do not prove total job bounds. The new check is quiescent publication
admission, not an instantaneous quota on writes or RSS. Strict 512-MiB/2-GiB and
full G1/OWNER/NATIVE readiness remain OPEN. On Apple XNU, RLIMIT_RSS aliases
RLIMIT_AS and limits each process's virtual map; it does not supply aggregate
renderer RSS enforcement ([header](https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/bsd/sys/resource.h),
[implementation](https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/bsd/kern/kern_resource.c)).
Treating it as equivalent would require a different policy/proof and is not part
of this bounded fix. Director impact remains a compatible internal extension.

### Packaged capability admission correction

The first packaged-Host smoke at `cac53b31` stopped after hello/snapshot:
manual export was unavailable and no ingest/render/export occurred. Its retained
health receipt showed the pinned FFmpeg 9.0.1 emits two filter flags, whereas the
worker inventory parser required three. Earlier service/guard functional PASS
therefore did not prove the Host's actual capability admission. The bounded fix
accepts both supported two/three-column forms and continues rejecting legends and
malformed columns. Python 128/128 passed. The checked-in functional catalog now
requires real ready health and both manual preview/export capabilities before
any render, so an unavailable native Host cannot be hidden by lower-level PASS.

Exact sealed R4 functional acceptance passed that new admission and the complete
existing picture/audio/Original/archive/60-s catalog. Nine source modules match;
manifest SHA-256 `08b4091a295b3835be5368153157756b7eebc4270cd301fad17a50d622a7898d`,
entrypoint SHA-256 `e62db9b657634ab3242a8c865642db4fd1ae7b0deaa5c4bc8641fdd1f88420d3`.
The long final sampled RSS 136445952 B and logical/allocated 39407529/39481344 B.
R2 quality and R3 execution retain their historical bindings; neither is relabeled
as packaged UI acceptance. A fresh exact-head package/Host receipt accompanies
the same Draft; no new dependency, engine, filtergraph authority or preset.

The original pinned Node executable also fails strict macOS signature verification
before packaging. The first bundle retains its exact official pinned bytes and
is `GUI_PACKAGE_BLOCKED_SIGNATURE`, despite native compilation and sealed-runtime
hashes passing. That attempt did not re-sign nested binaries or rewrite official
hashes to hide the failure. A separate local ad-hoc signing probe now passed
strict verification and Node v22.23.2: the original input stays SHA-256
`18e387c90ab8a8400183e8bdd396376e1e875b91b4c874b894dcade7b35bf572`, while the signed
copy is `4f191ec5bfd680bc806226c193ba7f48594836a09ba1bbb9d800f9e325eac0af`.
This declared packaging transformation uses no credential and leaves official
pins/manifests and sealed Media/Python bytes intact. Fresh whole-bundle signature
and packaged-Host results are separate receipts; a Node-only probe is not their
PASS. Tauri platform resource resolution passed in the canonical
`/private/tmp` path; AppHandle/WebView/picker and human perception remain untested.
No GUI opening or full READY follows from a headless Host result. Existing resource
ceilings, broader source and Owner/native gates remain open.

## Exact-head CI and test synchronization — 2026-10-06

Publication of `bbbb0dcde73e16ef396018879e85eaa901d4f45a` triggered attempt 1 of
push CI ([37412753257](https://github.com/inlifemedicina/cevra/actions/runs/37412753257)),
PR CI ([37412755773](https://github.com/inlifemedicina/cevra/actions/runs/37412755773))
and exact macOS runtime ([37412755742](https://github.com/inlifemedicina/cevra/actions/runs/37412755742)).
The two monorepo jobs failed different existing manual-sequence UI cases: the
four-range assembly saw an initial OUT reset, and the committed-save-failure
case saw an action suppressed during initialization. Each had 156 passes and
one failure; the new PT/EN compact-export regressions passed in both. All other
jobs, including the exact macOS runtime, completed successfully. The failed head
is retained as failed evidence, not relabeled as a full CI PASS.

Independent static review supports a race in the test harness: `mount()` waited
for an enabled source field while asynchronous load and passive editorial effects
could still reset the drafts or transition the controls to busy. The helpers now
await async React `act` around mounting and completed clicks. Assertions on
history entries, request count and enabled controls remain, and deliberately
pending-operation clicks are unchanged. Full UI157 and typecheck passed locally.
This is a supported synchronization diagnosis, not an executed reproduction or
proof of a production defect. App/Sidebar production code is unchanged.

The completion commit requires fresh exact-head CI, PENDING at this checkpoint.
The isolated native build remains `fb346106`; its final binding explicitly permits
only the test-harness and documentation delta. Host/Rust, worker/runtime assets,
package dependencies and production frontend bytes remain identical, so no local
native render or bundle rebuild is warranted for this test-only change. Terminal
remote state will be recorded in Draft #87 and the new consolidated package
receipt. Strict resource guarantees stay BLOCKED and human/native acceptance
stays pending. No GUI, Take/device, real AI or merge action occurred.

## Compact-export package refresh and inherited backend evidence — 2026-10-06

The reviewed local UI correction was authorized for the existing Draft #87 and
an updated isolated package. The new app is `CEVRA Vids G1 Review fb34610.app` in
`/private/tmp/vids-g1-compact-export-fb34610`, built offline from functional source
`fb346106d5a70daed85a8401c8c79a7c7449453c` / tree
`a6b19c5f15a44e9d959fafeef4a6373dc7e81bc9`. UI157/typecheck and the independent
source review remain bound to the identical reviewed code blobs. The new frontend
build contains the export counter; the native build embeds it. Both builds, actual
Tauri resource resolution, top-level/deep strict signatures and the gated launcher
`--check-only` passed without opening a window.

Fresh inventory differs from the old app only in `Contents/Info.plist` and the
native executable. New app tree:
`bfd6a26e3a672cec69c0a32050ef32b8f876f86a6c172f3412a3b9cb0b8d056b`;
native SHA-256:
`629bca14a984d33f776c91b0f323a583fca8925f5892b307d542d70ef9052f3f`.
Host, Node, sealed Media/Python, worker bindings and every other packaged entry
retain the baseline bytes. Git objects for Host, Rust, engines, packages and
dependency pins also match `22e3c431`; the previous 29-response packaged-Host
export/checkpoint/reopen proof is inherited backend evidence, not a fresh render
or UI acceptance. No local native media render was repeated.

The sole future entrypoint is `launch-fb34610.command`; the previously delivered
`launch-22e3c43.command` forwards to it, including `--check-only`. Original launcher
bytes are archived outside the repo; old app/receipts remain historical and intact.
The [single grouped script](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md#single-grouped-g1-script)
now targets the corrected package. A documentation-only completion commit may
follow the functional build: the final source-binding receipt records both heads
and proves identical execution components. Independent package review is APPROVE.
At this pre-publication checkpoint, final source binding and remote exact-head CI
are PENDING; their terminal results will be recorded in Draft #87 and the new
package's consolidated receipt. Prior `22e3c431` CI is historical, not a claim for
the new remote head.

Strict 512-MiB/2-GiB instantaneous resource guarantees stay BLOCKED; no weaker
contract was accepted. AppHandle/WebView/picker and grouped human/perceptual G1
acceptance remain NOT_RUN/BLOCKED as applicable. Director impact is a compatible
presentation correction; typed operations, IR and History retain their boundaries.
Progress 55%, F-A02 1/1; no Take/device/AI/merge action or release promotion.

## Final grouped-script review and bounded UI correction — 2026-10-06

The frozen `22e3c431` package/launcher received a final read-only review against
the grouped Owner script. No package/launcher identity defect was found. The
script had concrete delivery gaps: unexplained R2/R4/frame notation, English
operation names instead of real PT-BR labels, no restored reference after edits,
an ambiguous promise of cursor persistence and human steps with no UI route.
The [single grouped script](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md#single-grouped-g1-script)
now defines terms, gives actual actions/expected/failure per stage, supplies the
four A/B ranges, explains automatic checkpoint and distinguishes History from
the visual playhead. Human legacy import, injected save failure and full resource
acceptance stay BLOCKED. Current build/strict-signature/packaged-Host evidence is
reconciled separately from still-unexecuted AppHandle/WebView/picker/perception.
The outer package README points to that same catalog and retains a pre-review
copy outside the repository; no second acceptance catalog was created.

A concrete independent UI defect was found: in compact mode with Director active,
the toolbar could start export while Controls hid feedback/Cancel. App now sends
the existing export-request counter to the existing sidebar, which selects Controls
without focus, remount, a second operation or canonical edit. Two PT/EN App workflow
regressions failed before at inaccessible Cancel; the three affected test files
passed 31/31 after the fix, and the full UI suite passed 157/157 with typecheck.
The tests prove one operation/cancel plus retained project/archive, selection and
Director draft; they do not prove native geometry, picker or media. Independent
source review approved the bounded change. No native render/resource proof was
repeated and no CI/merge was requested.

This source correction is not in the frozen app: its source/runtime/receipt
bindings remain `22e3c431`/sealed R4. The human instructions therefore require
selecting Controls before export in compact mode in that package. A newly built package is required
before claiming the corrected toolbar behavior in the app; none was created during
this final review. Resource policy was untouched. Director impact is a compatible
presentation correction with typed execution/IR/History intact; the separate
resource-guarantee choice below still needs Owner decision. Progress 55%, F-A02
exhausted 1/1, Draft #86/#87 unmerged, no human session/device/AI action.

## Resource-ceiling feasibility and pending decision — 2026-10-06

Read-only source and primary-documentation review against
`22e3c43142cbdd28d8d600e658cc65864629bab2` found no demonstrated mechanism within
the current stack/scope that prevents both approved instantaneous ceilings from
being exceeded. The strict gate remains **BLOCKED**. No budget, metric, preset,
runtime or publication policy has been changed. The frozen signed package and
its packaged export/recovery receipts retain their source binding to that head;
this finding does not repeat their render/resource tests or promote GUI/Owner
acceptance. AppHandle/WebView/native-picker automation remains **NOT_RUN**: no
supported automation with proved focus isolation was available, so the app was
not launched. The human Take session and media remain untouched.

### Disk: viable logical containment, allocated-byte proof still absent

The explicit producers are sequential, but their outputs accumulate: sealed
original copies, unique encoded segments, graph/list files, sequence WAV,
concatenated video and final mux candidate survive until cleanup. Repeated clips
expand the concatenated payload. The existing 20-Mb/s target is not a byte cap.
Publication temporarily adds a second name for the candidate inside the owned
tree; the existing accounting sums both names even though they share an inode.

A scoped internal extension is technically plausible: an exclusive job ledger
reserves every output before creation; Python copies/text writes consume only
their reservation; a fresh pinned-Python wrapper sets soft/hard `RLIMIT_FSIZE`
and `RLIMIT_CORE=0`, restores normal `SIGXFSZ` handling, then `execve`s the
validated FFmpeg binary without changing its private group. Unknown encoded
outputs receive reserved caps, and reservations are reconciled only after the
child is reaped and output identity/cleanup proved. If existing logical bytes
plus other reservations are `L`, the mux cap must be at most
`floor((2147483648 - L) / 2)` from its start, accounting for staging plus the
future account name. Exact PCM data is `frames * 1600 * channels * 4`; headers
and metadata must also fit a reservation. Limits must reject incomplete output,
never publish a silently shortened or lower-quality export. This mechanism is
**proposed, not implemented or proved**.

Darwin's regular-file write path clips writes at the file-size boundary, but
this is a per-file logical limit, not a filesystem allocation quota.
[XNU write implementation](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/vfs/vfs_vnops.c#L1323).
FFmpeg's `-fs` explicitly permits output beyond the requested value, so it is
not an equivalent hard limit.
[FFmpeg options](https://ffmpeg.org/ffmpeg.html#Main-options).
The threaded worker must not use `preexec_fn` for this change; Python documents
the possibility of deadlock before exec.
[Python 3.12 subprocess](https://docs.python.org/3.12/library/subprocess.html#subprocess.Popen).

The writer inventory also needs closing. The current worker environment can
inherit `FFREPORT`; whether it is actually set was not inspected. That option
can create an extra report at an independently chosen path and enable debug
logging. A logical-containment implementation must cover FFmpeg and ffprobe,
remove this option in each child
environment, use owned cwd/temp paths, disable core files, and prevent additional
unregistered writers. The current captured probe/diagnostic output also needs
incremental byte limits before collection, rather than a check after allocation.
[FFmpeg reporting](https://ffmpeg.org/ffmpeg.html#Generic-options),
[Python capture semantics](https://docs.python.org/3.12/library/subprocess.html#subprocess.Popen.communicate).
No real environment, credentials or account configuration was read.

The approved current disk test uses the maximum of aggregate logical size and
aggregate `st_blocks * 512`, counted per name. `st_size` and allocated blocks are
different fields; file-size limits do not establish a bound for allocations on
an arbitrary destination filesystem. Checking blocks after a write permits an
earlier excess. [Apple stat](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/stat.2.html).
Apple exposes an allocation quota for an **APFS volume**, not this existing job
directory. A separate quota volume/image would require lifecycle/placement and
same-filesystem publication redesign; its physical quota also does not directly
prove this per-name accounting metric. It was not created or mounted.
[Apple APFS allocation options](https://support.apple.com/guide/disk-utility/add-delete-or-erase-apfs-volumes-dskua9e6a110/mac).

### RAM: current controls do not supply a shared physical quota

XNU `RLIMIT_RSS` aliases `RLIMIT_AS`; the implementation applies the limit to
the current process's virtual map. Applying 512 MiB independently to Python and
FFmpeg would not limit their sum to 512 MiB, and partitioning virtual budgets
could reject library/framework mapping without proving the required physical
coverage. `RLIMIT_DATA` and `RLIMIT_MEMLOCK` also do not create a shared group
quota. This is a source-level finding against XNU `main`, not a measurement of
the installed kernel.
[Apple resource definitions](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/resource.h#L486),
[Apple limit setter](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_resource.c#L1560).

FFmpeg `-max_alloc` checks each allocation, not the accumulated total.
[FFmpeg allocation source](https://github.com/FFmpeg/FFmpeg/blob/n9.0.1/libavutil/mem.c#L68).
Threads and filter queue controls bound concurrency/queues, not all bytes.
[FFmpeg threads and filter queues](https://ffmpeg.org/ffmpeg-all.html).
VideoToolbox uses CoreVideo pools and a default framework allocator. From that
code we infer that complete memory coverage cannot be proved by `-max_alloc`.
[FFmpeg VideoToolbox implementation](https://github.com/FFmpeg/FFmpeg/blob/n9.0.1/libavcodec/videotoolboxenc.c).
Privileged footprint/Jetsam controls are per task and react to exceeded limits;
they do not provide the requested public, unprivileged aggregate guarantee.
[Apple memory-status authorization](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_memorystatus.c),
[Apple task footprint](https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/kern/task.c).
Observed group RSS also does not prove coverage of external OS services/GPU
allocations, and shared mapped pages can be counted more than once. The watchdog's
100-ms wait follows the completed scan; scheduling and enumeration delay prevent
a promised maximum reaction time or overshoot bound.

### Concrete choice for the Product Owner

| Unapproved route | Mechanism and minimum work | Impact and risk |
| --- | --- | --- |
| Retain both instantaneous guarantees | Keep G1 resource acceptance BLOCKED; authorize a separate bounded architecture feasibility effort for kernel/OS isolation and quota-backed storage, defining exact process/framework and per-name versus physical metrics before implementation. | Current per-process limits or polling cannot close the gate. Storage changes affect placement/publication/recovery; whole-renderer memory containment may affect hardware acceleration and runtime/distribution. No feasible complete design, new dependency/license or cost is assumed approved. |
| Explicitly adopt an operational resource contract for the current stack | Retain the numeric thresholds; implement the reservation/wrapper/writer/capture work above for hard logical admission, retain sampled group RSS/allocated-block supervision and quiescent publication checks, and report cancellation/error on excess or failed observation. | This changes the guarantee: allocated blocks and group RSS can exceed thresholds between observations, and framework memory outside the group is not covered. No bound on overshoot/reaction time is proved. Targets/quality, original immutability, IR/History and exclusive publication remain required. This route needs explicit acceptance, targeted kernel-boundary/cancellation/publication tests and a new sealed runtime/package after implementation. |

The practical recommendation for the present stack is the second route **only
if the Owner explicitly accepts its weaker guarantee**; otherwise retain the
first route and the blocked gate. No implementation was started that could be
misrepresented as closing the approved contract. This is a scope/feasibility
conclusion, not a proof that every future architecture is impossible.
For category context, Premiere exposes available/reserved RAM and Adobe's shared
memory balancer manages registered application requirements cooperatively; those
documents do not establish a 512-MiB instantaneous whole-renderer quota.
[Premiere memory preferences](https://helpx.adobe.com/premiere/desktop/get-started/preferences-and-settings/memory-preferences.html),
[Adobe shared memory](https://helpx.adobe.com/after-effects/desktop/memory-storage-performance/memory-and-storage/memory-storage1.html).

FIX NOW/DEFER: logical hardening is a bounded existing-runtime extension, but it
does not close the requested allocated-disk/global-RAM blocker. Its acceptance
metric and required proof depend on the choice above; quota/isolation changes
cannot be added as an unapproved workaround. Director impact is **Product Owner
decision required** for the resource guarantee; typed commands, IR/History and
provider authority remain unchanged. Progress stays 55%, F-A02 exhausted 1/1;
Draft #86/#87 stay unmerged. No further native proof run, real AI, device, account,
GUI or human-session action occurred during this investigation.

## Approved operational resources and bounded measurements — 2026-10-06

The Owner approved the operational route at 10:38:21 UTC; the preceding pending
choice is historical. [ADR0034](adr/0034-operational-manual-render-resources.md)
records its contract. Initial validation settings remain 512 MiB sampled group
RSS and 2 GiB per-name logical owned space. They are not adopted commercial
limits, an allocated-block quota, all-framework/GPU coverage or an instantaneous
RAM ceiling. A material budget-value change must be explicitly recommended
before adoption; these measured workloads do not justify one.

The closed pipeline now reserves copies/PCM before producers and reserves graphs,
segments, concatenation and mux output before each write. Candidate/accounting
overlap counts twice. Native producers use a fresh managed-Python exec wrapper
with a per-file size limit; the persistent worker's limit is unchanged. Read-only
encoder inventory bypasses producer reservation. Closed disk faults propagate
through native dispatch/RPC into recoverable Host failures. Source immutability,
quality targets, safe partial cleanup, existing publication recovery and History
remain mandatory; no automatic retry is added.

The new sealed R5 release-mode catalog passed rational CFR24/NTSC/VFR sampling,
single-frame/repeated ranges, stereo offset/pulses, 60-second preview/final and
History archive reopen/Undo/Redo without replay. Its worker hashes match the new
source; the old R4/fb34610 runtime/app/receipts remain frozen. R5 manifest:
`72384edf213936bc93bf891dbc8729110ac9521d4cf2e8206179a22c81cb2898`.

| Measured workload | Sampled RSS peak (B) | Logical / allocated peak (B) | Other evidence |
| --- | ---: | ---: | --- |
| 60-s flat barcode final | 132628480 | 39407529 / 39481344 | 11.086 s; exact decoded clock |
| 60-s 1080p moving synthetic final | 171507712 | 627486319 / 633491456 | 25.702 s; 1800 pictures; 2880000 effective audio samples/channel; 52.512757-dB whole-program decoded PSNR |
| Controlled aggregate RSS excess | 623886336 | 10 / 8192 | Abort/retirement; observed RSS overshoot 87015424 B; longest completed-sample interval 115.577 ms |

These are observations on macOS arm64, with no maximum overshoot/reaction promise
or arbitrary-source/perceptual acceptance. `peakReservedBytes` can equal 2 GiB
because an unknown encoded producer reserves available capacity; it is not disk
usage. Real partial-writer size enforcement was tested at a scaled 4096 B bound;
exact 2-GiB observation separately rejected owned sparse-file/name excess.
Python136/Media142/Host173/UI157 passed. The production Host guard now supervises
manual frame preview as well as final render, with an explicit fault/retry/routing
regression; Original/Take retains its existing path. A failed first functional attempt found
and fixed encoder inventory routing; tests also caught native dispatch swallowing
the typed fault. Failed receipts are preserved. The bounded technical gate is now
closed as recorded below; native/human acceptance remains pending. Director
impact compatible internal extension; progress55%, F-A021/1.

### Technical closeout and human handoff — 2026-10-06

Coordination supplied independent APPROVE for code head
`26c07e55f2b1b633d8163bbfe9a93a144422ae5a` / tree
`38cab89a68bca7cb1029c23165f8b68dfd4009db`; exact provenance and the reviewed
diff digest are recorded in [ADR0034](adr/0034-operational-manual-render-resources.md#technical-closeout-and-human-handoff--2026-10-06).
This records the unsigned handoff rather than inventing a signed review receipt.
All 11 exact-head jobs passed in push `37456482760`, PR `37456490354` and macOS
runtime `37456490357`; the temporary PR checkout has the same tree. The current
isolated package is `CEVRA Vids G1 Resources 26c07e5.app`, arm64, namespace
`com.cevra.vids.g1.resources.review`, with strict/deep signatures verified. Its
native SHA256 is `33391e191a98d25e482b90ef1dc6c58fd03771f960614d1431ccfe7564ab3e2c`;
app tree SHA256 is `9b988049c56eba0b231906fd5ddf6c82b2c342b2865d4e1c84eb6e9bd788ad31`.
Packaged Host passed 29 responses, actual manual frame preview/final export,
165 frames/264000 audio samples per channel, original hashes, save recovery and
checkpoint reopen/Undo/Redo without replay. Closeout documentation does not
change the reviewed production bytes; its final published-head CI is bound
separately in the package handoff.

The package is **READY FOR HUMAN VALIDATION**. The
[single Portuguese human script](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md#single-grouped-g1-script)
uses a disposable project, synthetic A/B and a separate export directory.
Automatic background opening is BLOCKED: pinned Tao 0.35.3 activates the app and
makes visible windows key/front at startup. The application was not launched;
no active session or iPhone/Take/Xcode was operated. A metadata-only check found
no review-namespace project directory. A human may open it during the coordinated
validation window, stopping if any unexpected project appears. Window/picker,
perception, voice/lip-sync, legacy UI conversion and prepared UI fault variants
remain unexecuted/BLOCKED by their concrete dependencies. This does not promote
full G1, commercial limits, progress, F-A02 or merge authorization.

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
