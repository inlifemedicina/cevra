# ADR 0020 — Audio Sequence Runtime V1

**Status:** Accepted for implementation — IN DEVELOPMENT
**Date:** 2026-09-22

## Context

The approved editorial directions D8 and D11 require explicit audio decisions
and J-cut timing, while MR-A01, MR-A03 and MR-A05 require audio-only execution,
placement/mixing and final assembly primitives. Existing Media Runtime
operations can extract or mutate audio, but cannot render several independently
trimmed and placed sources into one PCM intermediate without unnecessary video
encoding or repeated lossy generations.

The corrected coordinated research at
`spike/media-runtime-coordinated-gate` commit
`4cf2e3d6fd74d8a1111b0d8c6ba9e559170f48ef` established a source-time oracle,
made the old 500 ms J-cut mapping fail that oracle, and demonstrated a bounded
single-pass audio-only candidate. Its suggested two-source restriction is
explicitly superseded: a project may contain many videos, and this operation is
not a two-file special case.

## Decision

Media Runtime adds versioned typed operation `render-audio-sequence` V1. The
operation contains a source table and an ordered item list. Every item names a
source and supplies integer `sourceStartMs`, `sourceEndMs` and
`timelineStartMs`, plus optional explicit `gainDb`, `fadeInMs` and `fadeOutMs`.
The request also supplies an explicit `outputDurationMs`, mono or stereo output,
and an authorized absent local WAV output path.

The output is ordinary RIFF/WAV containing interleaved `pcm_f32le` at 48 kHz.
Integer milliseconds therefore map to exactly 48 output samples. The output
timeline is `[0, outputDurationMs)`: uncovered intervals are deliberate
silence, and an item that would cross the explicit end is rejected rather than
truncated. Container duration is not proof of audio coverage. The selected
audio stream's `start_pts`/`time_base` and `duration_ts`, with bounded stream
timestamp/duration fallback, must prove every requested source interval; when
stream coverage cannot be proven, execution fails closed. Recorded zero-valued
samples inside proven coverage remain valid audio.

Channel semantics are fixed:

- mono to mono and stereo to stereo preserve their channels;
- mono to stereo duplicates the channel;
- stereo to mono computes `0.5L + 0.5R`;
- other or ambiguous layouts fail closed.

Items are resampled to 48 kHz without asynchronous time stretching, reset to a
sample-derived timestamp origin, converted according to the explicit channel
rule, and placed on the output sample timeline. Gain and triangular fades are
applied only when supplied. Simultaneously active items are added linearly with
no implicit normalization, limiter, compressor, dropout gain change or global
headroom attenuation. Values above nominal full scale remain finite float
evidence for a later explicitly approved mastering step.

The typed worker builds the closed FFmpeg graph; callers cannot supply argv,
expressions or filtergraph text. URI strings remain input arguments and never
enter graph expressions. One input decoder is opened per distinct source and a
source reused by several non-contiguous items is split inside the graph.

## Source, item and concurrency boundaries

Distinct source count, total item count and maximum simultaneous items are
separate facts and are returned as execution evidence. V1 reuses the Media
Runtime's existing operation-level maximum of 128 distinct inputs, permits up
to 2,048 items, and does not add a separate low overlap ceiling. The worker
also bounds URI/request argument bytes and the generated graph to 24 KiB and
2 MiB respectively.

These are fail-fast execution safeguards for one render request, not a limit on
videos in a project or a license to discard later items. Larger project plans
may require a future deterministic decomposition which preserves sample timing,
float headroom and lossless intermediates; that orchestration is not selected
by this ADR.

The ordinary RIFF data limit is checked before execution. V1 does not claim
RF64 support. The tighter of the duration and RIFF checks is authoritative, and
write failures remain possible even after size estimation.

## Ownership and lifecycle

The operation produces a derived PCM artifact through the existing Media
Application execution, cancellation, recovery and artifact-cleanup boundary.
It accepts only mutation `none`; neither the worker nor the mechanical
Application dispatch edits Project IR, ProjectHistory or editorial state.
Successful artifact creation is therefore distinct from later canonical
project promotion.

The output must not already exist and must not alias an input. Symlinked inputs,
outputs and output parents fail closed. Rendering occurs in an owner-scoped
temporary directory beside the requested output. After probe/postcondition
validation, a same-filesystem hard link publishes the staged file atomically
and fails if another writer created the destination. On worker failure or
cancellation, only the staged file, a successfully promoted output known to be
owned by the attempt, and the owned graph file may be removed. Application
cleanup treats a destination as attempt-owned only after the worker returns a
matching successful file result. A destination observed after engine failure,
cancellation, or a crash before that evidence is persisted is ambiguous and is
preserved. Future recovery may flag such a leftover rather than destroy it;
cleanup failure for known-owned artifacts is reported rather than hidden.

Output verification parses the actual RIFF chunks instead of assuming a fixed
header size. Measured sample-frame and data-byte counts must equal the explicit
duration, sample rate, channel count and estimated data size before publication.
`outputSampleCount` is measured artifact evidence; `estimatedDataBytes` remains
a request-derived preflight value.

Runtime identity advances with this CEVRA-owned operation. The pinned FFmpeg,
private Python, signature, manifest-integrity, release isolation, one-active-job,
liveness, cancellation and subprocess-reaping boundaries remain unchanged.
Existing `extract-audio` and Alignment PCM preparation semantics are unchanged.

## Implementation and validation status

Implementation is in development on `feat/audio-sequence-runtime-v1` from
canonical main `21e7cce26af6b1bb744fe8f47f9b34461426bd61`.

The production-path acceptance catalog exercises distinct source counts 3, 8,
16 and 32; 64 and 256 items; 2, 4 and 8 simultaneous items; 44.1/48 kHz input;
all four mono/stereo mappings; explicit gain/fades; above-full-scale float
overlap; source reuse/reordering; late excerpts from three 30-minute sources;
a 120-second output with leading/trailing silence; audio-bearing video input;
and cancellation without output publication. The compiler is also tested at
the 2,048-item structural bound.

Local macOS arm64 characterization uses a development Homebrew FFmpeg and is
not release proof. A dedicated path-filtered CI workflow builds FFmpeg 9.0.1 from
the pinned signature-verified source, assembles the exact managed private
runtime and runs the same catalog on the standard macOS arm64 runner. It runs
for relevant pull requests, the implementation branch, and relevant changes
merged to `main`; unrelated docs-only changes do not rebuild FFmpeg. The
remediation advances the CEVRA Media Worker identity to 0.2.1 because source
coverage and artifact-evidence semantics changed. Final remediation CI evidence
is recorded on the feature branch before re-review. The slice remains in
development until independent review and merge.

## Consequences and compatibility

No Project IR, ProjectHistory, Project Store, transcript/cache, UI, Director or
Composition schema changes. No new third-party dependency, encoder, database,
worker, arbitrary graph API or permission surface. The operation is a
compatible typed execution primitive; it does not by itself deliver the full
editable J-cut workflow or final mastering.

Later Transcript Cache reconciliation must confirm that this operation and its
Media Runtime identity do not alter the existing Alignment `extract-audio`
identity/profile. Generated PCM is not Transcript Cache or history content.

## Deferred broader Media Runtime gates

- Application/Director planning and the complete editable J-cut workflow;
- final-audio measurement, normalization, mastering and mux policy;
- revision-bound render orchestration and Composition integration;
- Windows H.264 enablement or fallback and native Windows validation;
- HDR/VFR/rotation interpretation, transformation and tone mapping;
- project-scale deterministic decomposition beyond one bounded operation;
- general cache, quota, crash-leftover or garbage-collection systems.

None of these broader gates is closed by this ADR.
