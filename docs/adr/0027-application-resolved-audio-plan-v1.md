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
- rejects canonical `musicDuckDb` explicitly because this slice has no approved
  ducking executor; it invents no fade, ducking, repair or normalization decision;
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
weakened codec matrix. Before mux, managed FFprobe proves the selected video
stream duration and PCM duration derived from Audio Sequence's measured sample
count. After mux, it proves video and audio stream durations independently.
Application requires video/PCM evidence within 1 ms and permits the encoded AAC
stream at most 23 ms from the resolved duration; the latter covers one 1024-
sample AAC frame at 48 kHz plus millisecond serialization, not editorial
trimming. Container duration is not substitute stream evidence.

The exact-runtime catalog compares every copied video packet payload hash and
packet timing/order, decodes the final audio, checks the corrected J-cut with an
independent event oracle and requires an actually executed 500 ms wrong-placement
control to fail that same oracle.

## Revision, promotion and ownership

Application snapshots each validated request before its first suspension and
validates closed runtime schemas at both Application boundaries. It validates
the binding before sequence execution, after sequence, before mux, after mux and
again after the `committing` attempt has been saved. From that final state read
through the existing `export.add` ProjectHistory commit there is no asynchronous
suspension.
Only the ProjectHistory command promotes the validated final output. A stale plan
or late result cannot commit an export; undo/redo requires a newly compiled plan.

`render-audio-sequence` and `mux-audio` publish through owner-scoped staging and
exclusive hard links. On POSIX the worker records the owned staging file's
`st_dev` and `st_ino`, creates the exclusive destination link, then confirms that
the destination still has that identity before claiming publication ownership;
worker rollback and Application cleanup re-check the identity with `lstat` and
never follow a replacement symlink. Missing, legacy or platform-
unsupported identity evidence fails safe: ambiguous content is preserved and
cleanup uncertainty remains observable. Known attempt-owned PCM and invalid
final outputs are eligible for bounded cleanup; sources, caller visual media,
pre-existing exports and history-retained URIs remain protected. This narrows,
but cannot eliminate, the residual POSIX `lstat`→`unlink` TOCTOU interval. After
the canonical ProjectHistory export commit, later archive/cleanup failure is a
recovery failure and cannot roll back or delete the canonical export.

Runtime identity becomes `0.3.1`; protocol V1 and third-party pins are unchanged.
Audio Sequence, Audio Measurement, `extract-audio` and Alignment PCM semantics
are unchanged. PR #24 must later reconcile the Media Engine identity change,
without sharing ProjectHistory storage or adding PCM to Transcript Cache.

## Durable Media Execution Recovery V1 — approved direction, implementation pending

The Product Owner-approved canonical direction is a small, versioned operational
Media Execution Archive V1 under the trusted Desktop project root, alongside but
separate from Project Store/ProjectHistory. It is not part of Project IR, the
canonical audiovisual package or another audiovisual source of truth; it stores
no media and is expected to require neither a database nor a new dependency. It
will record only execution/project revision/snapshot binding, stage, child
execution ids, owned-artifact identity, export intent and status needed for
reconciliation.

Recovery is `CRASH → REOPEN → RECONCILE → CLEAN/PRESERVE WITH PROOF → MARK
INTERRUPTED/RECONCILED`. It never auto-replays render, edit or mux. Ambiguous
ownership and a proven persisted canonical export are preserved; a final file
without persisted promotion is not a canonical export. Integration with
`DesktopProjectPersistence.checkpoint`, startup reconciliation and historical
`MediaApplicationService.recoverPending()` semantics remains a future slice.
This archive is **approved direction / implementation pending**; full process-
crash recovery is not claimed here.

## Acceptance and status

Relevant cases are D8-T1/T2, D11-T3, K3-T1/T2 and X-T1/X-T3/X-T5. Passing this
Application/runtime vertical is partial technical evidence only: the complete
Desktop-visible J-cut workflow, Composition output and subjective Product Owner
acceptance remain BLOCKED/NOT RUN.

The companion [evidence record](../CEVRA_APPLICATION_RESOLVED_AUDIO_PLAN_V1_EVIDENCE.md)
separates unit/regression evidence from exact managed macOS arm64 execution. This
ADR remains IN DEVELOPMENT until independent review and merge; the coordinated
Media Runtime gate remains active.
