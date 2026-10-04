# Manual timeline trim — bounded V1

Status: IMPLEMENTED / NOT MERGED, 2026-10-04 UTC.
The owner approved direct IN/OUT adjustment after accepting the simple manual
excerpt in PR #80. Related pointer and keyboard controls form one review block.
This record supersedes neither the whole acceptance catalog nor broader preview,
Composition, export or provider gates.

## Behavior and authority

Select the existing simple video clip in Edit. Its two timeline handles adjust
source IN and OUT; the displayed range uses seconds with millisecond precision.
Dragging changes only a temporary visual range. Release confirms one typed
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
repeat of that human round is requested. These steps remain NOT EXECUTED until
an actual owner report. Automated tests do not provide perceptual acceptance.

Director impact: compatible direct-edit consumer of the existing typed
`clip.trim`, canonical Project IR/History and narrow Desktop boundary. No new
Director/provider execution authority, proposal application or engine direction.
