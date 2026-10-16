# Experimental static-title preview — 2026-10-15

Status: **experimental flags remain off by default; two bounded Owner judgments
APPROVED and repository integration explicitly AUTHORIZED on2026-10-16, pending
full-combination review and merge gates; no default adoption, release or app
installation**. Earlier pending-acceptance/route entries below are historical.

## Real Tauri fallback diagnosis — 2026-10-15

### Isolated square-pixel correction

The real diagnostic receipt reports `decode/base-grid`, with ResizeObserver,
video-frame callbacks, ImageBitmap and WebCrypto available. The prepared V4
base has coded dimensions 720x404 but SAR 404:405: its last downscale preserves
the preceding 16:9 display ratio after changing the encoded grid. Native
AVFoundation measures natural width 718.222 instead of 720, while duration is
exactly 10 seconds. A metadata-only square-pixel control yields natural 720x404.

The isolated runtime 0.3.13 adds `setsar=1` after that final V4 downscale and
requires SAR 1:1 when admitting experimental segments, concatenation and final
publication. Existing V1/V2/V3 previews and final-export graphs retain their
paths; the UI's strict geometry/frame guard remains intact. No source media is
rewritten. Runtime identity changes invalidate retained derived cache identities.

Before/after production Host requests using the exact diagnostic checkpoint
produce SAR 404:405 and 1:1 respectively. Native natural size becomes 720x404;
all 300 decoded frames, 480000 decoded audio samples per channel, and canonical
and preview PNG bytes are equal. The new square-pixel postcondition rejects
missing, invalid and non-unit SAR and retains exact frame coverage. All 169
Media Python tests pass. Only the worker entry/version, manual worker and runtime
manifest differ in the isolated runtime; native components and dependencies are
unchanged. The first verification helper's URL-argument failure is retained;
the corrected verifier checks existing artifacts without replaying rendering.

The successor still needs the coordinated real Tauri run to close fallback,
canvas/IPC, continuous playback/loop, picker export, source relocation and
physical app-reopen gates. No visual-latency or human-acceptance claim follows
from Host, CoreMedia, pixel equality or unit evidence alone.

The consolidated candidate at `5f82ef1` opened in a real CUA-operated Tauri
session. Import, the continuous 300-frame sequence, Unicode title bounds/layout
and Undo/Redo were observed, but the experimental renderer selected encoded
fallback after title creation and one deliberate remount. No canvas receipt was
produced. This is not experimental presentation acceptance. A subsequent offline
request using the exact saved checkpoint and packaged Host/runtime successfully
prepared the layer in native scope; that result does not identify the browser
failure or establish Tauri/paint latency. Restricted-shell capability failures
remain separate from the real graphical result.

An isolated continuation extends the existing diagnostic command with a closed
fallback receipt: current operation/snapshot/epoch, preparation stage, allowlisted
reason and native error code, elapsed time, and four browser-capability booleans.
It never stores exception messages, title text, media paths, user-agent strings or
project payloads. `endpoint: encoded-fallback` cannot be mistaken for a canvas
submission. Existing successful presentation receipts remain unchanged; both
shapes retain the compiled experiment gate, native validation, private local
`0600` file and maximum 100 records per process. No IPC command or ACL is added.
Starting a new model clears prior pending timing so a request failure cannot be
paired with the previous operation's clock. Stale/unmounted failures are ignored;
diagnostic failure cannot prevent encoded fallback.

The cause and minimum product correction remain pending a coordinated real
Tauri run of the distinct diagnostic candidate. No browser script injection,
runtime change, new framework, policy relaxation, default promotion, AI call or
additional editing authority is involved. Ordinary flags remain off. The current
manual sequence supports video clips and the approved static title; arbitrary
still-image timeline composition is not established by this proof.
The Owner approved integrating the previously isolated base-video/PNG experiment
into the existing sequence preview for evaluation. This extends presentation and
the closed media contract; Project IR, ProjectHistory, typed edits, CoreText,
FFmpeg and original-derived final export retain their authorities. No framework,
engine, dependency, persistent project schema or global setting is added.

## Scope and activation

Normal builds leave both `CEVRA_EXPERIMENTAL_TITLE_LAYER` and
`VITE_CEVRA_TITLE_LAYER_EXPERIMENT` disabled. The experimental Mac candidate
compiles both flags as `1`, has its own bundle identifier and store, and exposes
one experimental-preview checkbox within the existing sequence controls.
The checkbox settles pending title edits through the existing action gate.
It does not migrate projects or alter another installed app.

The trial accepts the current static 16:9 title over landscape, unrotated,
explicit BT709/tv/yuv420p SDR sources. Unsupported input, missing native
capability, failed integrity, or failed browser decoding returns to the existing
encoded sequence preview. No unsupported-colour guard is weakened. Portrait,
HDR, arbitrary colour profiles, animation and other composition engines are
outside this experiment.

## Derived boundaries

The prepared base uses a closed V4 preview operation with fixed
`canonical-h-bt709-v1` identity. Its canonical-scale/transparent-overlay/downscale
path follows the measured proof; the existing export operations are unchanged.
The base cache is at most two entries / 16 MiB in the experimental session.
The graphic cache is at most four entries / 16 MiB. UI retention is one base
Blob URL, one canonical PNG bitmap and one 720x404 bitmap; stale pending bitmaps
are closed. IN/OUT is excluded only from graphic identity, while current canonical
bounds, snapshot/journal, runtime, native fonts and source identities are checked
before admission. Trim changes base identity; eviction can require a fresh encode
whose container hash need not equal the prior bytes.

`render-manual-title-preview` is an internal, versioned, closed operation. It
produces a bounded canonical PNG and Lanczos 720x404 PNG in an issued private
workspace. The existing supervised native path enforces the resource limits.
Hash, PNG header/grid, stable file reads and POSIX dev/inode publications are
validated before retention. Cancellation settles the producer before cleanup.
The fixed macOS colour helper calibrates against the admitted base's actual
CoreMedia709 image and produces sRGB PNGs; no system colour profile is bundled.

The existing transport and editable title overlay remain. Snapshot/seek/busy
changes clear and hide the old canvas immediately. Loading is visible, and ready
requires the current packet, hashes, decoded base dimensions/duration and exact
paused frame. Playback uses generation-bound native video-frame callbacks;
obsolete responses, bitmap completions, play failures and frame callbacks cannot
re-admit prior state. Undo/Redo continues through ProjectHistory.

## Measurements and gates

Candidate-only numeric diagnostics distinguish Host preparation, Rust/Host,
Tauri round trip, UI decode/seek and canvas submission. Two animation-frame
opportunities are a separate endpoint. `physicalPaintMs` is always null.
The native diagnostic command accepts only bounded numeric/identifier fields,
requires a compiled experimental flag, and writes at most 100 records to an
exclusive local `0600` file in this candidate's app-data directory. No title,
media path, project contents or network telemetry is recorded.

Mac build, Rust 57, Media Python 168, UI 354 with one existing skip, focused
Host/boundary 15 and native lifecycle/resource 31 checks passed. The initial
broad run with the experimental renderer forced into legacy UI mocks failed;
the default UI suite subsequently passed. The subsequent broad aggregate still
failed: two transcription-fixture failures also reproduce on the clean preserved
baseline; three native process-observation checks failed in the restricted shell
and pass with the approved native scope; one exact RPC allowlist expectation was
updated for the new closed tool and passes. These follow-ups do not rewrite the
failed aggregate or the historical cloud FAIL11 as green CI.

The real CJS/Node/runtime gate, without an experimental environment variable in
the child, passed title duration/Undo/Redo, graphic/base reuse, text/position,
encoded fallback, source mutation rejection, trim and decoded-equivalent Undo,
native cancellation while the colour helper ran, exit 0 and complete private
cleanup. One recorded run measured initial preparation 2.851 s, duration/Undo/Redo
22.6–24.5 ms, text/position about 641 ms, and encoded fallback 2.356 s. A prior
integration run measured initial 4.062 s and text/position 715–772 ms. These are
bounded Host/CJS measurements, not a controlled Tauri/presentation benchmark or
a latency guarantee. The 2.2 s wait is not claimed eliminated.

Final export was independently decoded against the preserved reference: all
300 frames and all 480,000 samples per channel are identical, with the original
1920x1080 CFR30/48 kHz grid. Static independent reviews found no remaining
concrete issue in their examined UI/IPC and Host/worker/contracts boundaries.

**Pending:** the Mac was locked when the native UI tool attempted inventory.
The experimental candidate's real Tauri smoke, actual IPC/decode/presentation
receipts, continuous playback/seek/visual comparison and Owner judgement remain
blocked until manual unlock and execution. Earlier standalone WebKit proof
results do not substitute for these current integration gates. No app adoption
or all-pass claim follows from packaging alone.

Raw fixtures, failed and passing runs, inventories, package, hashes and review
reports are kept outside Git in the owning task's `layered-integration-evidence`
and private `/tmp` test root. The prior apps/runtimes and the separate Localizar
front are preserved. No Take operation, merge, push or publication is included.

Director impact: **compatible presentation/typed-contract extension** in this
trial. The Director gains no new authority or generic tool execution. A future
default or broader composition scope requires a separate Owner decision and
the applicable architectural/benchmark gates.

## Offline broad-test triage and capability correction — 2026-10-15

A later directed review identified a **new P2 in the experimental renderer**:
`ResizeObserver` was constructed without a capability check, including during
fallback. Its absence could throw before the existing encoded preview appeared.
This path does not exist on the base. The original 28 forced-experiment UI
failures therefore cannot all be dismissed as fixture limitations.

The isolated continuation guards observer construction, skips it after fallback
or canvas removal, and selects encoded fallback when the API is absent. Two
new tests fail on the prior implementation and pass with the correction, with
and without a video-frame callback. All 15 layer regressions pass. Completing
three partial Canvas mocks with the real `clearRect` method and admitting the
current decoder after Undo/remount fixes the remaining test-fixture assumptions;
no assertions were relaxed. The affected files pass 44 tests with the experiment
on (29 existing workflows plus 15 layer cases) and 29 workflows with it off.
No full UI or workspace suite was repeated for this bounded change.

The last aggregate's six failures were also compared directly with the base:
- The two transcription fixtures use Xcode Python 3.9.6 unless
  `CEVRA_TEST_PYTHON` is set. The unchanged managed worker requires Python 3.12.
  The two cases pass on both base and experimental head with the isolated test
  Python 3.12. They are inherited executor configuration failures.
- The three native process-observation cases fail in the restricted executor on
  the base as well. Both base and experimental head pass all three with the
  approved native process scope. Resource enforcement was not weakened.
- The exact RPC list expectation was a new intermediate test mismatch, already
  corrected in 9ac2c71 for the one closed internal tool. It passes on both heads.

The historical aggregates remain FAIL; these targeted comparisons do not turn
those runs into green CI. The correction is built as a separate second candidate;
the first 9ac2c71 app/archive and source remain frozen. Runtime/Host bytes and
contracts are unchanged by this UI correction. Current Tauri/visual/IPC gates
remain unexecuted: GUI access is explicitly reserved by the coordinating parent
and must stay untouched even after unlock until that parent releases it.


## PR104 reconciliation and stale decoder completion — 2026-10-15

The isolated local continuation combines PR104 `5261b42` with `821a1bd`; both
original trees/apps remain frozen. Product changes merged automatically; only
two append-only documentation sections conflicted and both records were retained.
New PR104 errors/cancellation ownership and source.relocate coexist with the
existing V4 base/cache path; no ordinary-build flag is enabled by this merge.

A separately reproduced P2 in the prior layer's ended handler is corrected:
finish requires real ended state, current playback intent, no busy state,
current admitted snapshot/epoch and successful final-frame draw. Four negatives
fail before/pass after; two real loops and duplicate suppression pass. This
changes presentation gating only. The directed combined checks pass 106 Node,
153 UI in each mode and 58 Rust; no broad suite is repeated.

Production CJS with byte-identical runtime 0.3.12 confirms actual moved-file
relocation and reused graphic identity; Undo cannot hide the absent original
behind a warm cache, Redo succeeds, source mutation is rejected and physical
Host reopen preserves edits. Experimental admission of an untagged source
refuses, then the encoded path/export report PR104's specific colour codes.
Ordinary CJS remains disabled even if its child's environment requests the flag.

Single CJS request+refresh samples: initial 2740.58 ms, relocated 831.31 ms,
Redo 20.30 ms. They do not measure Tauri, decode/canvas submission or physical
paint. Existing native final-export/pixel gates belong to unchanged renderer
bytes and their earlier scope; no new final-quality matrix is asserted here.

The first combined native harness used Documents as TMPDIR and failed with
worker ValueError `preview file identity changed`; a diagnostic copy of frozen
821 reproduces it. The same uninstrumented combined CJS/runtime/fixture proof
passes with an owned /private/tmp root. The external metadata actor is unknown;
no worker/runtime or identity guard was changed and File Provider is not fixed.
Source, evidence/scripts and the old CUA failure disposition are recorded in the
external integration evidence directory. New graphical/IPC gates require a new
isolated package and explicit parent release; no default promotion or Owner
acceptance follows from this technical integration.

## Real Tauri square-pixel result and offline draw guard — 2026-10-15

The coordinated official CUA run of frozen `694d6c3`/runtime0.3.13 admits the
experimental canvas, with 15 canvas-submit receipts and no fallback receipt.
Title boundaries89/90 and239/240 and cut149/150 were observed in real images.
One initial request records3617ms request-to-canvas,88ms UI decode,3507.10ms
Host and3520ms Tauri; physicalPaintMs remains null. This is one sample, not a
latency promise. The later30ms cached refresh follows an export-history snapshot
change and is not a measured title-edit operation.

The native picker export completes and persists. Read-only analysis of that
actual output confirms H2641920x1080/BT709tv/SAR1/CFR30,300 fully decoded frames
on the exact PTS grid and480000 decoded AAC48k stereo samples per channel.
The exact title plan's alpha region has negligible source-relative luma
difference at89/240 and a strong title signal at90/239; subjective glyph,
colour and audible fidelity remain unaccepted. Native Locate of the own moved
fixture changes only URI plus audited History/updatedAt; all other project
content is identical. No Host replay substitutes for either GUI action.

Two complete playback cycles did not pass. Native accessibility observations
record the first299→3 return and a second apparent retention at218/7.27s,
also seen in a later image while the UI still displayed Pause. The operator
paused explicitly. There was no fallback receipt. No cause or attribution to
product versus environment is established. A subsequent official CUA lock error
blocked physical close/reopen before closing; the own app was left paused/Saved
with no export or CUA call pending, and the GUI reservation was released.

Independent source review and three isolated characterizations explain why the
existing indicators cannot resolve the cause: the button follows playback
intent, while the displayed frame follows successful canvas drawing. Absent
frame callbacks, native pause with retained intent, or a synchronous canvas
exception can retain those indicators. The historical two-loop unit check
directly injects ended events and is not a continuous native playback proof.

A separate bounded source successor protects canvas work in the shared draw
function. A synchronous current draw failure during a frame callback, ResizeObserver
or final-frame completion now enters the existing decode/unexpected encoded
fallback and returns false before frame admission or sequence completion. The
existing local receipt excludes raw exception messages; existing URL/bitmap
cleanup owns release. Three new cases fail before and pass after the guard.
This fixes a demonstrated failure mechanism; it does not prove or claim to fix
the real frame218 retention. No watchdog, clock/CSS change, replay or new native
diagnostic schema is introduced.

Validation of the source-only successor: the27 layer cases pass, including the
three new failing-before regressions. Six affected UI suites pass267 tests in
each flag mode; one opt-in actual-Host receipt consumer is skipped because no
CEVRA_PREVIEW_SEGMENT_UI_RECEIPT is designated for this source-only round. Full
default build and experimental UI build pass. Independent review reruns27/27
and reports no P1/P2 within the bounded guard. No Rust/runtime test is repeated
for unchanged Rust/worker bytes, and historical broad FAILs remain unchanged.

The tested `694d6c3` app/store and runtime0.3.13 remain frozen. This source-only
successor has no new GUI designation. A future discriminating observation needs
correlated native currentTime/paused/ended/seeking/readyState, frame-callback
receipt/scheduling and mediaTime, and the draw outcome under the same snapshot
and epoch. GUI/Owner gates and historical broad CI failures remain separate.
Director impact: compatible presentation guard only; typed execution, Project IR,
History, permissions, dependencies and existing engine boundaries are unchanged.

## Bounded playback observations — 2026-10-15

The approved offline continuation starts at `e5b06c8`; it neither attributes nor
claims to fix the real frame218 retention. A third closed variant of the existing
candidate-only `desktop_record_layer_presentation` argument records playback
observations. No new command, ACL, telemetry destination, filesystem access,
dependency, engine or provider is added. Ordinary build flags remain off.

An interval observes at1Hz only while the current admitted snapshot/epoch has
playback intent, ready state and no busy/fallback state. It does not issue play,
pause, seek, retry, fallback-on-silence or other recovery. Each renderer mount
has23 sample attempts and one additional draw-failure attempt across all its
seeks and snapshots. This is separate from the unchanged native ceiling of100
rows per process and exclusive0600 JSONL file. A full native file can still
omit later observations; the local reservation does not promise persistence.

Each row contains only IDs/epoch, elapsed time, playback intent, admitted frame
or null, pendingSeek, decoder time/paused/ended/seeking/readyState/networkState
and a closed media error code, callback count/pending flag/last media time/age,
successful and failed canvas draw counts/last success age, and a closed document
visibility value. It has endpoint `playback-observation`, never a paint or
playback-success claim. Unobserved event times are null. Numeric values and
strings are bounded at the native boundary; unknown fields, including nested
path/text/error-message/paint fields, are rejected.

Epoch/snapshot/reference ownership precedes counter updates and observation
emission. Old callbacks, canceled timers and old cleanup cannot pollute a new
scope. The per-mount attempt budget is not reset by a seek. Timers are cleared
on pause, busy state, fallback and unmount. A current canvas exception emits a
best-effort draw-failure observation before the existing bounded fallback;
writer rejection never blocks fallback, cleanup or transport.

Directed evidence:35 layer cases and63 Rust cases pass, including eight new UI
diagnostic cases and three new native closed-schema cases. Independent UI review
reruns35/35 and both UI/native reviewers approve the limited scope. The original
no-diagnostic base fails five selected observation assertions. An early numeric
assertion used exact floating-point milliseconds; a close comparison corrects
that test invocation without changing the observation values or product guards.

The optional actual-Host React delivery consumer is executable in this round:
two fresh runtime0.3.13 production Host sequence packets come from an isolated
copy of the saved square1 checkpoint and a byte-identical own source. Only that
own History is relocated and title-duration-edited. The real Host closes
normally, copied inputs and original source remain unchanged, and the consumer
confirms current Blob/PNG delivery, stale-response rejection and native readiness
remaining disabled. This does not prove native decode, paint or fluency. These
packets replace the prior round's missing optional input rather than rewriting
its historical SKIP. Seven affected UI suites pass276 tests in each flag mode.

The package includes the existing draw guard and unchanged sealed runtime0.3.13.
It has an exclusive bundle/store and fresh own fixture; no prior app/store is
updated or used as a seed. Building/verifying it does not authorize GUI use.
The next coordinated CUA round should create the minimal own fixture/two clips/
Unicode title, confirm canvas, and observe one continuous two-cycle attempt
without seeks or repeated remounting. If apparent retention occurs, leave2–3s
for consecutive observations, pause normally and preserve the receipt. Correlate
same-scope clock, callback and draw progress; missing rows alone are inconclusive
because collection conditions, budgets or the UI event loop may prevent them.
The remaining physical Tauri reopen needs verified manual access and coordination.

Original square1 receipts, failure observations, apps and baselines remain frozen.
No current GUI, Take, security/energy/network setting, default adoption, real AI,
merge, push, publication or Owner acceptance occurs. Historical broad FAILs remain
unchanged. Director impact remains a compatible observation/diagnostic extension;
typed execution, Project IR and History retain their existing authority.

## Continuous native playback and recovery continuation — 2026-10-16

The coordinated official CUA operator completed the short script on frozen
`55d36db` / runtime0.3.13, archive SHA256
`00361b2d679092a2b8d60a665801b1afe901bc9fbf8bbc8381df284dd5a9a6d9`.
The exclusive playback1 store was absent before launch. The operator created
two clips0..150 and150..300 and the Unicode title90..240 on the own tagged
BT709 fixture. One continuous attempt had no user seeks or remounts:23 native
playback observations span epochs2/3/4 under one snapshot, with two clock/frame
returns. Decoder time, callback counts and successful draws advance; all rows
report readyState4, paused=false, errorCode=null and draw.failed=0. There is no
fallback. Turning Repeat off then reaches the natural300/300 end and Play.
The23-sample ceiling explains collection ending during epoch4; it does not
establish that playback stopped. Independent receipt review confirms the
correlation and its limits.

Normal Quit is confirmed by absence from the app inventory, followed by a
physical CUA reopen of the same app. Project, media, two clips, Unicode title,
10-second sequence and Saved state return. The checkpoint before close and
after reopen is byte-identical, SHA256
`9dfa718649e9105f9bfd6053db84fefe60cd293cd71e002a5836ba38ac2e7f21`.
The preserved square1 checkpoint is also byte-identical. This attempt does not
reproduce the historical frame218 retention. Its cause and a fix remain
unestablished: the draw guard never triggers in these observations. The square1
failure remains historical evidence, not a newly passing run. Export and Locate
were not repeated in this short CUA script.

The initial native canvas receipt records3308ms request-to-canvas,58ms UI decode,
3225.01ms Host and3242ms Tauri. Physical paint is null. This is one technical
sample, not a latency distribution, human fluency verdict or elimination of2.2s.
Receipt SHA256 is
`e99f7e7baee48d0d56c914de5815f6cc36541cb646733fef66398c39fa0189e3`;
the original file remains0600. No Owner acceptance follows automatically.

New offline work on a separate test/documentation branch adds one continuous
React regression. It drives900 frame callbacks in separate `act` commits,
crosses title89/90/239/240 and cut149/150, checks two natural-event returns,
rejects callbacks retained from each old epoch, and ends at300 after Repeat off.
The decoder URL, load count, one preparation and unchanged History are checked.
The decoder and Canvas are mocked: draw-call counts do not prove cut pixels,
native decoding, actual decoder pause or physical paint. This complements the
real CUA receipts. Seven directed UI suites pass277 tests in each flag mode,
including the opt-in consumer of the two previously prepared real Host packets;
those packet-delivery tests are not new native rendering runs. Independent
review prompted the per-frame React commits and approves the bounded claims.

A new packaged-Host proof copies the playback checkpoint into an owned system
temporary root and copies the immutable fixture. It never edits a GUI store.
Four normal Host sessions exit0. Fourteen checks cover this combined sequence:
baseline export, warm layer, disappearance of only the own source, missing-source
preview/export refusal, same-size wrong-byte Locate refusal, correct Locate,
Undo/refusal, Redo, fresh Host reopen, second export, existing-destination refusal,
and recovery from an invalid current checkpoint in another copied store.
Missing source returns `MANUAL_VIDEO_SOURCE_CHANGED` even with a retained base;
the wrong file returns `SOURCE_RELOCATION_CONTENT_MISMATCH`. Refusals preserve
Project IR/History and create no missing-source output. Correct Locate changes
only URI plus audited History/update metadata, preserving IDs, numbering, cuts,
title and prior export. Undo/Redo restores the exact respective projects.
Normal reopen retains both successful exports and leaves the execution ledger
byte-identical; no automatic rendering/replay is observed.

Baseline and post-Locate/normal-reopen exports both decode300
H2641080p/BT709tv/SAR1 frames at
exact CFR30 PTS0..9.966667 and480000 AAC48k stereo samples per channel. Every
decoded frame hash, every PTS and the entire decoded PCM match. MP4 container
bytes differ; no container identity or subjective glyph/audio verdict is claimed.
An existing output returns `MANUAL_EXPORT_DESTINATION_EXISTS` and its bytes
remain unchanged. The separately corrupted copy opens as `local-recovered`,
restoring exactly previous revision7 with one export, versus latest revision8
with two. The invalid bytes are quarantined exactly. Recovery intentionally
does not synthesize the lost current revision or replay its successful export.
Both exports precede deliberate checkpoint corruption; the second follows
media-location recovery and normal reopen. No export in the `local-recovered`
session is measured here.

Evidence is external at `overnight-five-blocks-evidence` in the Mac task2
workspace, with scripts, raw reports, read-only CUA copies, stream/frame/PCM
comparisons, checkpoints, independent reviews and SHA256 bindings. The eight
preserved app inventories still match every byte and file mode; playback55d's
1028-file archive and deep/strict signature are reverified. This continuation
changes only a test and canonical documentation, so the physically tested55d
app remains the designated experimental candidate; no replacement app is built
or installed. Ordinary flags remain off. No new architecture, engine, runtime,
provider, permission, cost, merge, push or publication. Historical broad/cloud
FAILs remain unchanged. Director: no new impact within this test/documentation
scope; typed execution, Project IR and History remain authoritative. Owner
visual/editorial judgment and broader variants remain open.

## Technical closeout and aggregate CI classification — 2026-10-16

The four-path test/documentation closeout is committed at `7f1ec2f` on top of
frozen candidate source55d36db. PR104 `5261b42` and current main `48353df` are
ancestors; no remote main commit is missing from this integration. PR101–104
remain draft/unmerged. The local experimental chain has not inherited their
remote CI results. Ordinary compilation still disables both experimental flags.

One fresh local `npm run ci` at7f1ec2f passes the build,1305 Node tests and397 UI
tests. One opt-in actual-Host UI consumer is skipped in the ordinary aggregate;
the earlier directed277-per-flag runs supply its legitimate input and pass it.
The new aggregate uses Node22.23.2 and an explicit CPython3.12.14 test executable
in the unrestricted Mac executor. It is a new local result, not all GitHub jobs
or a rewrite of a failed historical invocation. Runtime assembly, Rust and
Python unit results remain separately bound to their prior checks.

| Recorded run or group | Evidence and disposition |
|---|---|
| Original cloud aggregate:11 failures | Historical reports record seven exited workers left as Z under container PID1; three UI and one RPC case passed unchanged repeats with causes unproven. The original aggregate log and PID observations are absent from this Mac transfer. This closeout verifies those recorded claims as records, without independently revalidating individual PIDs or classifying every cloud failure as environmental. The historical run remains FAIL. |
| Intermediate Mac aggregate:2 Host model-gate failures | Raw TAP and preserved directed base/head logs identify inherited Python selection. Correct3.12 passes both on base1e0 and head9ac. Current7f aggregate passes both named cases. The seven inherited source/test files retain identical bytes through1e0/9ac/821/55d/7f. |
| Intermediate Mac aggregate:3 native process-observer failures | Raw TAP records `MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED`. Preserved base/head native runs pass3/3; the restricted base run fails3/3 with unchanged sources. Current unrestricted aggregate passes all three named cases. This supports a scope-sensitive observation limitation; it does not establish a memory/disk overshoot or explain the cloud PID evidence. Directed TAP lacks argv/env and raw denied-ps stderr, so environment attribution also relies on the recorded execution receipt. |
| Intermediate Mac aggregate:1 RPC expected-list failure | The raw expected list omits the closed media tool `cevra-render-manual-title-preview`.9ac corrects that intermediate test expectation; base/head directed checks and the current aggregate pass. The native diagnostic-command ACL is a separate check. No production permission broadening is introduced by this closeout. |
| Initial forced-experiment UI failures | Raw `ResizeObserver is not defined`, two failing-before regressions, the821 guard and passing-after runs establish an actual experimental product defect that was corrected. Other incomplete Canvas fixtures/current-decoder admission were reconciled separately. Current ordinary aggregate and directed experimental tests pass; these earlier FAILs remain retained. |

The historical Mac aggregate has exactly six TAP failures, not eleven. Hashes
of its raw log, fourteen directed logs and seven inherited source files were
checked independently. No new current product defect is demonstrated by this
triage, so no speculative product or candidate change is made. Frame218 remains
unreproduced with cause/fix unknown. A future original-cloud audit requires the
original log and process observations; a successful Mac run cannot supply them.

The [single remaining human checklist](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md#remaining-human-judgment-for-the-experimental-candidate--2026-10-16)
contains only perceived fidelity/fluency judgments on the saved fixture and
existing exports. Import, boundary checks, two technical returns, native picker
actions, export decode and physical reopen are already evidenced and are not
requested again. This does not promote the experiment or broaden acceptance.

## Bounded Owner approval and final integration review — 2026-10-16

The parent supplied the Owner's direct **“TUDO OK”** reply to the two requested
checks: image/audio/synchrony in Sequence with Experimental preview checked,
then responsiveness and playback continuity after title OUT00:08,00→00:08,50.
The parent explicitly confirms both judgments are approved. The
[existing checklist](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md#remaining-human-judgment-for-the-experimental-candidate--2026-10-16)
records that exact scope. This is a human report, without an independent capture,
measured wait, separate export inspection or broader H/V/colour matrix.

One additional isolated packaged-Host proof closes the previously explicit
post-checkpoint-export gap. A copied store with invalid current opens
`local-recovered` at exact previous revision7/one export, while the two-record
execution ledger is preserved. The first canonical editing/render request is
one explicit export. It adds a new revision8/export and one succeeded attempt;
the lost old revision8 export is neither restored nor replayed. Undo restores
the exact recovered project; Redo and normal fresh-Host reopen restore the new
project. Checkpoint/ledger bytes remain equal across close/reopen; both Host
processes exit normally. Independent read-only review and decode confirm all300
frames/PTS and480000 PCM samples/channel match the prior reference. Container
bytes differ. This is not crash/power-loss or interrupted-job recovery evidence.

The old temporary candidate and old temporary export locators were absent
before this proof. The pinned archive and durable outputs remain intact. Both
new extractions match1028 frozen files/modes; the Documents copy fails strict
codesign with resource/Finder metadata, and the own system-temporary copy passes.
The failed copy/receipts remain preserved. No attributes are removed, no signing
or security policy changes, and no GUI/app installation occurs. Only the own
synthetic source locator is restored with its exact adopted bytes before testing.

PR105 atfdf2689 passes all11 remote jobs at attempt1. It still targets PR104's
branch; PR96–98 and101–105 form an unmerged implementation chain above main,
while PR99/100 are a separate documentary chain. The approved recorded plan is
an isolated integration for evaluation, with ordinary experimental flags off;
it does not specify a repository merge route for that chain. Closing the two
human judgments does not silently choose a main consolidation, merge other
drafts, enable defaults or replace an installed application. A concrete merge
route must be authorized before those mutations. No new product defect is
identified by this final proof. Historical FAILs, missing original cloud raws
and the unknown frame218 cause/fix remain unchanged. Director impact: no new
impact in this verification/acceptance record; typed operations, IR and History
remain the same execution/state authorities.

## Explicit repository integration authorization — 2026-10-16

The parent supplied the Owner's direct **“SIM”** to integrating the approved
set into main after full review, keeping experimental features disabled by
default and preserving installed apps and projects. The authorized route is
now PR105→main. This supersedes only the earlier undecided merge route; the
two bounded human judgments and all their limits retain their recorded scope.

Main48353df is an ancestor of pre-record head618b51b. The complete combination
has34 commits/120 changed paths, including PR96–98/101–105. Independent reviews
cover domain/Host/media and UI/native/workflow boundaries; a46-path review over
PR104 alone would not satisfy this scope. This new authorization record changes
only documentation. Both ordinary experimental flags remain off, and no new
product/default/engine/provider/security behavior is introduced in this step.

Retargeting is complete. Merge remains conditional on full-combination reviews,
actual applicable requirements and exact final-head/main checks, using expected
head SHA through the normal merge API without bypass. Then main CI must reach
a terminal result and the canonical ledger must record the actual merge state.
No installed app or personal project is replaced. PR99/100's separate documentary
chain is not incorporated or silently decided. Historical FAILs stay FAIL, the
original cloud raws remain absent and frame218 cause/fix remain unknown.

Full-combination review reproduced a separate P2 in the opt-in native title
harness: it demanded another render on Undo even though the admitted title bytes
remain reusable across metadata snapshots. The unmodified harness fails exactly
5!=6. Only its oracle is corrected: Undo/Redo must reuse the respective T1/T2
bytes without an extra render, while each packet carries the current snapshot.
The complete native H/V harness then passes, including12 quality cases and the
colour/overflow/cancellation/deadline cases. Fixture pins and all1028 own-copy
app/runtime files/modes remain unchanged; deep/strict signature verification
passes. The failing invocation is preserved. No product/default/runtime or
historical-frame218 correction is attributed to this test-only adjustment.
