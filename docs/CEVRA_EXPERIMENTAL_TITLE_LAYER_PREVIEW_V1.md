# Experimental static-title preview — 2026-10-15

Status: **isolated experiment; not a default, release, merge or Owner acceptance**.

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
