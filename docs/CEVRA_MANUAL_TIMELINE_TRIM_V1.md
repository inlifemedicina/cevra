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

A candidate follow-up is a derived, bounded preview generated through the
existing typed MediaEngineAdapter `trim` operation, with source/snapshot/content
verification, cancellation, bounded output admission and isolated temporary
storage; Project IR/source originals/history must remain unchanged. The accurate
trim primitive exists, but its integration into local-video preview and demo
runtime packaging is absent; the current host returns the original's verified
bytes and this demo has no media runtime configured. Integration, runtime/license
validation and decoder/platform/EOF tests are required before that approach can
be claimed available or approved. No arbitrary FFmpeg/host path control is proposed.
This is a concrete next scope decision, not an implemented playback fix or a
silent extension into composition/export. Retain prior accepted human steps.
