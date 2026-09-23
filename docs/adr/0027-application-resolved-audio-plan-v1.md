# ADR 0027 — Application Resolved Audio Plan V1

**Status:** Accepted for implementation — IN DEVELOPMENT / independent review pending
**Date:** 2026-09-23

## Context and authority

MR-A05/MR-A06 require Application to derive explicit multi-source audio execution
from canonical Project IR, reject stale work, combine the resulting PCM with a
caller-provided visual render, and promote only a validated export. The preserved
research plan at commit `4cf2e3d6fd74d8a1111b0d8c6ba9e559170f48ef`
provides historical evidence; closed [ADR 0020](0020-audio-sequence-runtime-v1.md)
and [ADR 0021](0021-audio-measurement-v1.md) remain authoritative for the
implemented executor and meter.

This slice does not implement Director, a Cut Compiler, Composition, preview/UI,
mastering, MR-A04/MR-Q01, HDR, Windows H.264 or Transcript Cache. Product progress
remains 48%.

## Decision

Add a reconstructible, revision-bound `ResolvedAudioPlanV1` in
`packages/application`. It is derived from the current Project IR and is not a
second editable project model. Its binding contains project id, Project IR
revision, head snapshot id and journal-entry count. The final field ensures that
a commit followed by undo cannot make an old attempt authoritative again.

The pure compiler:

- reads only canonical audio tracks and source identities/URIs;
- does not infer a second copy of video-track audio;
- treats `track.muted` as mute but does not treat `hidden` as mute;
- supports speed exactly `1`, positive equal source/timeline durations and
  canonical source/timeline bounds;
- excludes explicit zero-volume clips without serializing `-Infinity`;
- converts positive linear `clip.volume` with `20 × log10(volume)` and adds
  `masterGainDb` exactly once;
- rejects a result outside ADR 0020's existing gain bound instead of clamping;
- invents no fade, ducking, overlap, repair or normalization decision;
- produces the existing `render-audio-sequence` V1 operation with explicit
  duration and mono/stereo output;
- rejects projects with no renderable canonical audio instead of fabricating a
  silent mix.

The compiler supports general multi-source lists within ADR 0020 bounds. The
reference J-cut maps B audio source `0..2500 ms` to timeline `1500..4000 ms` and
B picture source `500..2500 ms` to timeline `2000..4000 ms`; therefore both
refer to source 500 ms when B appears. There is no `jCut` special field.

## Normalization

`normalization=NONE` is the only supported decision in this slice. A request or
canonical project with an explicit LUFS target fails with
`AUDIO_PLAN_NORMALIZATION_UNSUPPORTED`; it is never ignored. The existing
`loudness-normalize` primitive is not selected because no accepted policy yet
defines final target, true-peak constraint or acceptable dynamic effects.

## Visual reference and final mux

Application accepts a closed caller visual reference containing an absolute URI,
the exact project binding, duration and producer execution id. The contract makes
the caller responsible for corresponding visual pixels. No current Composition
producer exists to independently attest that correspondence, so this slice does
not claim Composition or preview/export parity delivered.

The final operation reuses typed `mux-audio`, intentionally replaces the source
audio, copies compatible H.264 video and encodes one AAC track under the existing
delivery matrix. It does not use `-shortest`, silent padding, visual recoding or a
weakened codec matrix. Application requires the final duration within 23 ms of
the resolved duration; the bound covers one 1024-sample AAC frame at 48 kHz plus
millisecond serialization, not editorial trimming.

The exact-runtime catalog compares every copied video packet payload hash and
packet timing/order, decodes the final audio, checks the corrected J-cut with an
independent event oracle and requires an actually executed 500 ms wrong-placement
control to fail that same oracle.

## Revision, promotion and ownership

Application validates the binding before sequence execution, after sequence,
before mux, after mux and immediately before the existing `export.add` commit.
Only the ProjectHistory command promotes the validated final output. A stale plan
or late result cannot commit an export; undo/redo requires a newly compiled plan.

`render-audio-sequence` and `mux-audio` publish through owner-scoped staging and
exclusive hard links. Application records output ownership only after a worker
returns successful exclusive-publication evidence. Failure, cancellation or
worker loss before that evidence preserves an unknown/race-winning destination.
Known attempt-owned PCM and invalid final outputs are eligible for bounded
cleanup; source media, caller visual media, pre-existing exports and history-
retained URIs remain protected. Cleanup failure remains observable. After a
durable export commit, PCM cleanup cannot delete the export.

Runtime identity becomes `0.3.1`; protocol V1 and third-party pins are unchanged.
Audio Sequence, Audio Measurement, `extract-audio` and Alignment PCM semantics
are unchanged. PR #24 must later reconcile the Media Engine identity change,
without sharing ProjectHistory storage or adding PCM to Transcript Cache.

## Recovery boundary and pending decision

The existing `MediaExecutionRepository` abstraction can archive attempts, and
bounded tests cover interruption/recovery logic. The Desktop Host currently wires
`InMemoryMediaExecutionRepository`, however. Consequently, full process-crash
recovery for a multi-stage sequence → mux → promotion intent is **not proven or
claimed** by this slice.

**PENDING PRODUCT OWNER DECISION:** choose the bounded integration of execution-
attempt archives with the existing trusted Project Store/recovery boundary (or
another approved durable mechanism) before full Slice 3 crash recovery can be
declared complete. This cannot be hidden in Project IR extensions or solved by
automatic mutation replay, which would conflict with ADR 0016. The implemented
compiler, live revision checks, worker ownership and normal/cancel/failure path
remain independently reviewable.

## Acceptance and status

Relevant cases are D8-T1/T2, D11-T3, K3-T1/T2 and X-T1/X-T3/X-T5. Passing this
Application/runtime vertical is partial technical evidence only: the complete
Desktop-visible J-cut workflow, Composition output and subjective Product Owner
acceptance remain BLOCKED/NOT RUN.

The companion [evidence record](../CEVRA_APPLICATION_RESOLVED_AUDIO_PLAN_V1_EVIDENCE.md)
separates unit/regression evidence from exact managed macOS arm64 execution. This
ADR remains IN DEVELOPMENT until independent review and merge; the coordinated
Media Runtime gate remains active.
