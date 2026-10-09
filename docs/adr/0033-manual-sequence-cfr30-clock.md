# ADR 0033 — Manual sequence CFR30 clock

Status: **ACCEPTED / IMPLEMENTED IN DRAFT / ACCEPTANCE LIMITS OPEN**

Date: 2026-10-06

## Context and approval

The first manual sequence stored integer milliseconds. Thirty frames per second
requires thirds of milliseconds; rounding each clip independently causes drift.
The earlier seven-millisecond synthetic cut establishes this arithmetic conflict,
not a requirement for sub-frame video editing.

The Product Owner approved the conventional project-frame approach on
2026-10-06 at 00:51 UTC, answering “Sim. Sempre vamos observar o que os apps da
categoria fazem e vamos adaptar ao nosso.” The preceding concrete proposal was
visible CFR30 picture cuts, matching preview/export, an independent audio clock,
and explicit reversible conversion of old projects. The initial approved export
remains MP4/H264/AAC, 1920×1080, SDR, 20 Mb/s target. This decision replaces the
earlier open variable-boundary/export-only-rounding alternatives for G1.

[Premiere's sequence settings](https://helpx.adobe.com/nz/premiere/desktop/edit-projects/change-clip-sequence/sequence-settings-reference.html)
describe a project timebase and finer audio display/editing precision.
[Final Cut Pro's rate-conform options](https://support.apple.com/en-kg/guide/final-cut-pro/ver3363b44e/mac)
describe sampling sources with different frame rates to the project clock, and
warn that changing the project rate can move edits. Those behaviors inform this
bounded Vids choice; they do not establish that every editor requires export and
project rates to match.

## Decision and execution feasibility

Project IR remains the sole editable authority. Schema 3 explicitly
distinguishes legacy millisecond timing and a CFR30 visual timeline. Visual clips
in the latter store integer, half-open source and timeline frame ranges. Existing
millisecond fields become strictly validated projections of those frame values;
they are not independently editable. Derive positions from absolute frame counts
at 30/1, never by summing rounded millisecond durations. Audio retains its own
timing representation; the manual render aligns each picture frame to exactly
1600 output samples at the existing 48000-Hz PCM rate.

The schema migration preserves legacy times, every retained snapshot, journal,
cursor and redo branch. Opening does not conform edits. The user reviews changed
boundaries and placements, resolves collapsed/out-of-range ranges, and commits
conversion as one typed reversible History action. New manual sequences choose
the visual grid on their first explicit frame edit. Export rejects legacy timing
until that conversion; it never rounds an old project's cuts secretly.

The source clock is distinct from the project clock. Both derived grid preview
and final render use one explicit actual-PTS sampler: preserve source timestamps,
`fps=30:start_time=0:round=near:eof_action=pass`, trim canonical source frame
indices, then assign `N/(30*TB)` to the selected pictures. FFmpeg's
[fps filter](https://ffmpeg.org/ffmpeg-filters.html#fps) duplicates/drops pictures
to produce constant cadence; this adds no interpolation, optical flow, AI or
assumption that average source frame rate gives the actual PTS table. Measured
coverage and exact frame counts must admit the result. Source files remain
immutable; previews and proxies never become final inputs.

Closed Media operations extend the existing adapter/worker. The bounded manual
export explicitly requests each source's single audio stream; absent or ambiguous
audio is rejected rather than selecting an unproved default. Its measured index
and channel mapping belong in execution evidence. Existing float32 PCM rendering,
stream-duration checks, final mux, exclusive inode-identified publication,
Media execution archive, `export.add`, Desktop checkpoint and restart
reconciliation remain the boundaries. No new publisher, database or second
journal is introduced. Restart does not replay a lost render, and isolated retry
cannot reuse transient workspace/source guards.

All source copies, instruction graphs, segments, PCM and publication candidates
belong to one private, issued job directory on the destination filesystem.
Generation-bound resource supervision must finish before Media may commit an
export. The existing sampled watchdog does not prove an instantaneous 512-MiB or
2-GiB ceiling; implementation and bounded native measurements must retain that
limitation until stronger evidence exists. No changed budget, silent quality
drop, install or external dependency is approved by this ADR.

## Consequences and verification

Affected components are Project IR/migrations and retained History, Application
manual edit/preview/export, existing Media contracts/worker, Desktop Host/native
admission and the PT-BR/EN-US Normal editing surface. The simpler alternative was
keeping arbitrary millisecond cuts and variable boundary durations; the Owner
selected the conventional CFR30 route. The change uses existing engines/toolchains
and adds no commercial or license dependency.

Required evidence includes no-drift frame edits; explicit conversion plus
Undo/reopen/redo preservation; stale/ABA/original replacement rejection; shared
preview/export picture sampling; exact video/PCM counts and per-stream durations;
original-content and decoded-quality checks; owned allocation/retirement and
publication races; checkpoint/restart behavior; final-tree independent review and
published-head CI. Current offline and synthetic technical evidence is recorded
in the [G1 checkpoint](../CEVRA_MANUAL_SEQUENCE_G1.md#current-cfr30-implementation-and-technical-evidence--2026-10-06)
and the same Draft #87. The accepted implementation does not constitute G1,
NATIVE, OWNER, resource-ceiling or release PASS; strict ceilings, broader source
and native perceptual/owner gates remain open.

Director impact is a compatible typed extension. Existing legacy operations stay
decodable, and an agent must select the explicit CFR30 operation rather than
submitting off-grid millisecond mutations to a grid project. F-A02 remains
exhausted 1/1; overall progress remains 55%.
