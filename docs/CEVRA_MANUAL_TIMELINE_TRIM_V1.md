# Manual timeline trim — bounded V1

Status: IMPLEMENTED / NOT MERGED, 2026-10-04 UTC.
The owner approved direct IN/OUT adjustment after accepting the simple manual
excerpt in PR #80. Related pointer and keyboard controls form one review block.
This record supersedes neither the whole acceptance catalog nor broader preview,
Composition, export or provider gates.

## Behavior and authority

Select the existing simple video clip in Edit. Its two timeline handles adjust
source IN and OUT; the displayed range uses seconds with millisecond precision.
Dragging changes only a temporary visual range. An IN drag keeps the visual OUT
anchored and removes/restores width at the left; release reanchors the new
duration at timeline zero. OUT drags keep the left edge anchored. Release confirms one typed
`clip.trim`; Escape, pointer cancellation/capture loss, window blur, selection,
zoom or snapshot replacement discards the gesture. Arrow keys adjust 100 ms;
Shift plus arrow adjusts 10 ms. Home/End clamp to valid source bounds. Held-key
repeats are ignored. Unchanged ranges create no journal or checkpoint entry.

The clip remains anchored at timeline zero; IN changes its source start and
resulting duration, not its placement. The bounded timeline scale fits the full
source duration so the short fixture is usable; zoom and seek use the measured
content width. Very short clips retain a minimum visual handle width; that width
is not a source-time measurement. Other timelines preserve their existing scale.
Preview changes only after canonical confirmation and reuses verified source
bytes with the new snapshot/range. Undo and redo restore the canonical bounds.

Application resolves the source from the current clip ID, rejects stale snapshots,
unsafe/non-integer/reversed/out-of-source ranges, locked/hidden/muted tracks,
non-default speed/volume/opacity/extensions, multiple clips and captions/graphics.
It reuses the existing size-before-hash and descriptor identity verification,
then rechecks the snapshot after asynchronous work. Originals and durable source
numbering remain unchanged. A no-op performs no media verification because it
records no edit or new verified-content claim.

One closed native `desktop_trim_manual_video_clip` command and
`video.trimManualClip` host method accept only clip ID, expected snapshot and two
source milliseconds. The host shares its existing mutation lock/checkpoint path;
other mutations fail busy during verification. Native error reconciliation is
unchanged. No URI, duration, generic command, speed, file grant, shell/network
permission or new IR/persistence schema is accepted.

## Evidence and limits

Application manual create/trim regressions: 27/27 PASS. Host manual/persistence,
RPC injection, temporary review, concurrent mutation and cache ACL regressions:
11/11 PASS. Desktop UI suite: 80/80 PASS, including source-scale
pointer geometry at 70%/180%, release-only confirmation, keyboard precision,
cancellation, error recovery and preview/undo/redo. The focused edge remains
mounted across confirmation with guarded aria-disabled controls; subsequent
keys work without refocusing. A new selection made during verification is
preserved on success and on an error with reconciled canonical state. A selection
absent from recovered canonical state falls back to a valid item. Focus and both
success/error selection cases have dedicated regressions.
BROWSER/OFFSCREEN: 16 px handles and separated label/range bounds PASS. TypeScript, Vite and native
macOS arm64 offline build PASS. Native schema/ACL and supervisor tests: 27/27 PASS. PT-BR/EN-US catalog parity: 2/2 PASS. Independent review is recorded against the exact tree in the PR; current human acceptance is NOT RUN.

The already admitted owned H.264/AAC synthetic fixture is reused: six seconds,
436,527 bytes, SHA-256
`90741e2ebebc4a7bfee427a5a6b72e5a9857a3a5a259cfbbb5e30438a00a2058`.
Real filesystem verification/preview, trim, checkpoint/reopen and undo/redo PASS;
original bytes and numbering are identical. A bounded 100-trim characterization
in one source/no transcript increased the existing checkpoint from 15,971 to
402,497 bytes; mean/max checkpointed trim were about 20.60/28.12 ms locally.
These are observations, not portable performance thresholds or multi-source/
Cut Compiler scalability acceptance. Every confirmed edit keeps existing history.

The initial one-simple-clip/8 MiB preview constraints remain fixture limits,
not the final product contract. Frame-accurate trim, streaming, multiple clips,
composition/export, release distribution, Windows and native EN-US review remain
separate gates. No provider/AI call, account request, credential access or model
change occurs. F-A02 stays exhausted 1/1; global progress stays 55%.

## One additional owner round

Reuse I4-T1, X-T1/T7 and the simple-clip part of X-T6. The new isolated demo is
prepared with the same synthetic source and an initial 1.500–4.500 s clip;
it is not launched or substituted for the owner's existing session.

1. Select the clip; drag IN and OUT and confirm that the displayed range and
   clip duration change on release. Cancel one tentative drag with Escape.
2. Focus a handle; use arrows and Shift plus arrows to check coarse/fine changes.
3. Play the updated excerpt, then undo and redo the trim and play it again.

Record observed ranges, build commit, locale and any visual/functional issue.
Previous PR #80 original playback/create/undo evidence remains valid; no full
repeat of that human round is requested. These steps were NOT EXECUTED at that
preparation checkpoint; the owner report below supersedes that pending status.
Automated tests do not provide perceptual acceptance.

Director impact: compatible direct-edit consumer of the existing typed
`clip.trim`, canonical Project IR/History and narrow Desktop boundary. No new
Director/provider execution authority, proposal application or engine direction.


## Owner feedback and bounded correction — 2026-10-04

The owner exercised the native PR #82 demo at `1f9389d3fadd3d3b86da4b89f1a86baac99cba2d`.
Cancellation, coarse/fine keyboard adjustment and undo/redo were reported working.
Pointer trimming worked functionally, but IN visually shortened from the right;
that visual behavior is not accepted. Playback of an IN 2.000 / OUT 3.990 s clip
was questioned because the displayed counter read approximately 2:01 to 3:29;
perceptual playback acceptance remains unresolved for that report.

The legacy formatter used `mm:ss:frames` with a fixed 30 fps calculation, without
consulting the source's frame rate. At 3.990 s it displays 00:03:29, while exactly
2.000 s displays 00:02:00. A visible 2:01 is compatible with an observation after
the media clock advanced to about 2.034 s; the owner's report alone cannot establish
when the decoder started or stopped. Floating-point division also displayed frame
14 at exactly 1.500 s. This was a display defect, not evidence that IR bounds changed.
The synthetic original is CFR 30/1, 180 frames, 6.000 s by ffprobe.

An isolated production-component/real-file Chrome headless reproduction, before
and after the display change, loaded the exact IN 2000 / OUT 3990 ms range. It
reported `currentTime` 2.000 s initially and 3.990 s paused finally, with timeline
playhead 1990 ms; the last captured presented-frame sample was 3.966667 s. These
final clock and last sample do not prove that playback stayed inside OUT:
inspection of all callbacks also found 4.000 and 4.033333 s timestamps above
OUT 3.990 before the corrective seek back to the last 3.966667 s frame. The
requestAnimationFrame/timeupdate guard pauses and clamps after observing OUT;
it does not prevent the decoder from presenting ahead of that observation.
This is a reproduced bounded-playback gap, not only counter ambiguity. These
measurements do not identify every displayed frame or certify native WKWebView/
audio timing. Wall-clock harness elapsed time is not clip duration.

The bounded correction keeps OUT visually anchored during IN drag, using the
actual measured visual edge captured at gesture start. That also prevents a jump
when the clip already starts below the 48 px visual minimum. Release alone confirms
the existing typed trim and reanchors the shorter/longer duration at timeline zero.
Escape/cancellation restore the prior view and record no command. Extending IN
before the temporary viewport origin can clip the left handle while capture remains
active; no source-time clamp or canonical placement change is introduced to hide
that viewport limitation. Very short handles retain their documented minimum
visual width, which is not a time measurement.

Local-video marks, source clock and the simple manual timeline clock now show
`mm:ss.SSS`, independent of fps. Preview labels separately show source position/OUT,
excerpt elapsed/duration, and explicit IN/OUT. For 2.000–3.990 s the elapsed
counter starts 00:00.000 and ends 00:01.990. PT-BR and EN-US have matching labels.
Playback/seek logic, project schema, host permissions, verification, history and
checkpoint contracts are unchanged. The UI explicitly labels this as an approximate
excerpt preview. No AI call or human session manipulation occurs.

Only IN drag feedback and the clarified clip playback presentation require a
bounded owner recheck on the corrected build; retain the accepted cancellation,
keyboard and undo/redo observations. This does not close full I4-T1, X-T1/T7,
composition/export, frame-accurate preview or provider gates. Director impact:
compatible presentation correction on the existing typed editing boundary.


Correction validation: 86/86 Desktop tests PASS, including 70%/180% IN geometry,
initially minimum-width clips, source/elapsed millisecond labels, canonical OUT
pause and preserved cancellation/focus/selection/undo/redo cases. PT-BR/EN-US
catalog parity 2/2 PASS. Real-browser measurement preserves visual OUT for
shrink/extend and short-range drafts; an initially 48 px clip remains within
0.02 px of its captured edge (subpixel layout rounding), with no confirmation
on cancel. Only release reanchors the confirmed clip. Evidence files remain
outside the public repository. Native human recheck is still pending.


The same isolated harness tested two browser-native alternatives off-tree:
a temporal media fragment and a hidden metadata cue with pause-on-exit. Neither
eliminated all callback timestamps above OUT in this fixture; neither is added
to production. This does not establish native WKWebView behavior. The playback
case remains OPEN / NOT ACCEPTED after correcting its display, rather than
being promoted to a bounded playback PASS on the final clamped clock alone.

The owner subsequently approved the bounded derived-preview integration below.
The earlier presentation build and its unconfigured Media runtime remain
historical evidence; they do not supply the new preview behavior.

## Approved bounded derived preview — 2026-10-04

PR #82 now implements an ephemeral excerpt through the existing typed
MediaEngineAdapter `trim` operation, with a closed `boundedPreview: true` profile.
The UI sends canonical source/clip/snapshot IDs and an operation ID. The host
resolves the range; no client path, range, raw arguments or filtergraph is
accepted. Original mode keeps verified original bytes. Clip mode requires a
verified derivative and cannot silently admit the full original as the excerpt.
Missing or unsupported runtime/media fails visibly. The separate review bundle
includes the managed runtime; default release distribution remains a separate gate.

The profile admits one simple clip, source/output at most 8 MiB, source at most
60 s, zero-origin CFR at most 60 fps, SDR, no rotation and at most 1920×1080.
Optional audio must be contiguous from zero, cover OUT and use 44.1/48 kHz mono
or stereo. VFR and unsupported inputs are rejected. Source frame PTS are measured
as rational values. The internal filter selects measured frame indices whose
source PTS are in `[IN, OUT)`, then rebases timestamps to zero without seeking or
resynthesizing a CFR sequence. Audio selects sample indices from `ceil(IN×rate)`
through `ceil(OUT×rate)-1`. This is preview re-encoding, never an original asset
replacement or final-quality export source (ADR 0013).

Frame/sample quantization is explicit: an IN between frames advances to the next
admitted source frame. The last admitted picture can remain visible for its frame
period; AAC decoding may add fewer than 1024 padding samples. The encoded
duration can differ from the logical duration within the verified frame/audio
quantization bound. For the requested 2.000–3.990 s interval, exact runtime tests
measured 2.000 s at 30 fps and 2.002 s at `30000/1001`, with source frames 60–119,
60 frames total and 95,520 decoded audio samples (zero padding in these fixtures).
The 2.010–3.990 s cases selected frames 61–119; 0–11 ms selected one frame.
This is verified source-content exclusion, not a claim of exact millisecond
container duration, lossless output or native frame/sample presentation timing.

The host reads originals through a bounded no-follow descriptor and SHA-256,
copies verified bytes into a private owned directory, and verifies the output
descriptor, inode, bounds, video/audio evidence and output hash before serving
bytes. It rechecks original content and canonical source/snapshot/clip after
rendering. Source changes, trim, undo/redo, selection changes, newer previews,
cancellation, timeout and shutdown invalidate stale results. Queue cancellation
does not cancel another operation. Cleanup waits for worker/native retirement
and deletes only its owned directory; if retirement cannot be proved, files are
retained and the operation fails with its primary error preserved. This read-only
profile creates no Project IR source, journal, checkpoint or durable Media execution.

The UI plays the derivative from media time zero to its natural EOF. Source and
excerpt labels project the logical canonical range in milliseconds; these labels
are not decoded-frame identity measurements. Pending preparations are cancelled
on changes, old responses are ignored, and old decoders/Blob URLs are released.
Tauri reconciles cancellation before reuse; an unsettled timeout fails closed.

Runtime worker 0.3.2 retains protocol/runtime format 1 and pins an eight-file
worker inventory. FFmpeg 9.0.1, upstream ffmpeg-skill 1.4.2 and their existing
approved license/provenance/signature checks are retained. No dependency,
framework, permission or engine replacement is introduced. The local release
runtime was assembled with the repository's unchanged signature verification.

Validation: decoded barcode frame identities and PCM audio sentinels PASS for all
six 30/`30000/1001` cases, including nonaligned IN/OUT and a short clip; the
full-original negative control and VFR input are rejected. The real H.264/AAC
owned fixture passes production-host integration with original hash and project
unchanged by preview. Desktop tests 88/88, Rust tests 28/28 and Python Media tests
91/91 PASS. Host/contract/application/Media/i18n regressions pass 527/527 with
managed Python 3.12 and sequential test files. A process-death test failed during
the concurrent native build, then passed isolated and in that full rerun; this
does not establish the cause of the transient failure. At this prepublication
checkpoint, exact-head CI remains PENDING; terminal evidence will be recorded
in the PR. An isolated production-component Chrome headless check
plays the actual derivative at media time 0→2.000 s, naturally paused at EOF,
with last callback timestamp 1.966667 s (source projection 3.966667 s), below OUT.
This complements the decoded-content oracle and does not certify WKWebView or
subjective audio/visual acceptance. IN visual OUT remains anchored in the browser
geometry checks, including the existing minimum-width case.

The separate macOS arm64 review app uses a new application identifier and an
owned fixture checkpoint at IN 2.000 / OUT 3.990 s. It was initially prepared
unopened, then opened for the authorized consolidated round. The owner replied
“perfeito” to the two-point recheck: IN drag with OUT visually fixed and placement
updated on release, and corrected excerpt playback with image/audio and chosen
limits. These two bounded native cases are ACCEPTED by owner report; this is not
an automated native frame/sample timing measurement. Preserve the previous
cancellation, keyboard and undo/redo passes; do not repeat the human round.
Reuse I4-T1, X-T1/T7 and the bounded part of X-T6; no whole catalog, composition,
export, release, Windows or provider gate is promoted. Director impact is a
compatible consumer of typed Media and canonical trim/history; progress stays
55%, F-A02 exhausted 1/1 and real model calls zero.

## Owner acceptance and integration — 2026-10-04

The accepted demo head is `3a685e431c1ff849dbd792a15c006aad5018e0c6`, with
independently reviewed tree `3697c05f6a932cae7597b2ac086395761ba5a2fd`.
Exact-head CI [37212884119](https://github.com/inlifemedicina/cevra/actions/runs/37212884119)
passed 5/5; exact runtime [37212884040](https://github.com/inlifemedicina/cevra/actions/runs/37212884040)
passed 1/1, including the bounded-preview content oracle. The owner subsequently
replied “sim” to explicit authorization to merge PR #82 into main and check
post-merge tests. PR #82 is integrated at
`906eea695836fe2ae2b81ab0b50610b600748995`; its tree exactly matches the reviewed
tree. Post-merge [CI 37227087528](https://github.com/inlifemedicina/cevra/actions/runs/37227087528)
is terminal SUCCESS, 5/5; [exact runtime 37227087529](https://github.com/inlifemedicina/cevra/actions/runs/37227087529)
is terminal SUCCESS, 1/1, including the bounded-preview decoded frame/audio step.
Both are attempt 1 on this exact merge SHA.
Historical Draft/unopened/PENDING observations above describe earlier checkpoints.
The two accepted cases do not close the complete catalog or release/composition/
export/provider gates. Quantization, unsupported-input and small-fixture limits
remain in force; Director-compatible impact, 55% and F-A02 1/1 are unchanged.
