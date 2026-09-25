# ADR 0029 — Durable Source Technical Descriptor V1

Status: **IMPLEMENTED / CLOSED**

Date: 2026-09-24

## Context

The managed Media Runtime already returns bounded probe evidence for exact
frame-rate ratios, orientation, pixel format and color signaling. Local ingest
currently retains only the older basic `SourceAsset` fields and a small ingest
provenance extension. Planning and export therefore cannot distinguish adopted
technical evidence from a current verification of the source bytes.

MR-V01 needs durable evidence associated with the canonical source, plus an
operational verification boundary, without creating a second audiovisual
authority, a persistent media cache, or a Project Package sidecar.

## Decision

`SourceAsset` in Project IR v2 gains an optional
`technicalDescriptor: SourceTechnicalDescriptorV1`. Project IR remains schema
version 2; History Archive and Project Package remain version 2. Projects
without the field remain valid and no migration is added.

The descriptor is adopted project evidence, not current filesystem state and
not render policy. Its closed V1 shape contains:

- `version: 1` and `basis: "ingest" | "post-ingest"`;
- a portable content identity: lowercase SHA-256 plus exact byte size;
- producer identity under profile `cevra.source-technical.v1`;
- bounded, supported video evidence: codec, pixel format, exact normalized
  average/nominal frame-rate ratios, rotation and color signaling;
- bounded supported audio codec evidence.

The profile selects the first video stream that is not an attached picture and
the first audio stream. A consumer may rely on stream-specific evidence only
when its own stream selection is proved to match this profile. Unknown or
sentinel evidence is absent; `0/0` is unavailable. Equivalent positive ratios
are reduced by their integer greatest common divisor. Values are never inferred
from HDR/VFR/bit-depth heuristics: V1 intentionally omits `bitDepth`, `hdr`,
`hdrFormat`, `variableFrameRateSuspected` and Dolby Vision.

The compact UTF-8 JSON encoding is limited to 2 KiB. Nested objects are closed;
unknown version/profile/fields fail validation. Technical strings are trimmed,
control-free and bounded. Absence of video or audio means absence of selected
stream evidence, not a default technical interpretation.

`SourceAsset.checksum`, transcript provenance and `cevra.ingest` remain
unchanged. The new content identity does not replace or reinterpret those
historical fields.

## Acquisition and verification

For supported local regular files, Application coordinates one managed probe
with one complete bounded-memory streaming SHA-256 pass. A Node adapter records
an operation-local stamp, rejects symlinks and special files, verifies the
opened handle against the initial path state, checks `fstat` before/after the
read and re-checks the final path state. The persisted descriptor contains none
of the operational path, inode or timestamp evidence.

Probe still opens by path, so V1 assumes media is not modified during the
operation; it does not claim absolute TOCTOU elimination. Observable
instability, unavailable strong local-file evidence, cancellation, read error
or content mismatch fails closed without Project IR mutation.

Verification memoization is bounded to one operation/execution. Reuse requires
the same source, URI, expected descriptor identity and a matching current
operational stamp. There is no session-wide or persistent identity cache.
Simply reopening a project performs no media-byte read.

## Promotion and consumption

New ingest adopts basic metadata and the descriptor in one `source.add` commit
with `basis: "ingest"`. An explicit post-ingest application operation uses the
guarded `source.technicalDescriptor.set` command with source URI and prior-value
preconditions. The command is pure, rejects content replacement, preserves the
original basis, and reports a semantic no-op without a journal entry or redo
loss.

Critical Application consumers must verify the expected content before using
descriptor evidence and re-check observable source stability before canonical
promotion. The resolved-audio vertical verifies unique descriptor-bearing
sources once per execution and uses a trusted internal pre-commit guard before
`export.add`. Legacy sources without a descriptor continue explicitly without
a `source-content-verified` claim. Source hashing does not attest that a
caller-provided visual represents the same edit.

The resolved-audio vertical also binds the Audio Sequence child execution, its
typed output URI, file result and original publication evidence. It re-proves
that publication immediately before the mux consumes the PCM and again before
canonical export promotion. A renamed/replaced inode therefore fails before
promotion and is preserved as foreign. POSIX device/inode evidence does not
cryptographically prove immutability of bytes written in place; that residual
threat boundary remains explicit.

A standalone retry of `mux-audio` carrying `durationValidation` is refused
before creating an attempt/job or invoking an engine. Such operations can rely
on transient source and intermediate-publication guards that are intentionally
not serialized. A new composite resolved-audio execution must instead rebuild
and re-run those guards under a new ID. Historical independent retries and mux
operations without that validation marker retain their existing contract. This
closes an unsafe shortcut; it does not provide optimized reuse of completed
composite stages after failure.

## Compatibility and exclusions

The extension is additive to Project IR v2 and is preserved by current
ProjectHistory/Project Store serialization. Older binaries may preserve the
unknown source field where characterized, but they do not execute MR-V01
verification; this is not semantic rollback equivalence.

V1 adds no Project IR/History/Package version bump, migration, generic source
deduplication, persistent identity cache, blob registry, relink system, UI,
Tauri/WebView API, Composition authority, color transform, HDR policy or new
dependency. A scalability gate must be revisited before workflows that create
many timeline/Cut Compiler commits; provenance is not removed to conceal
history growth.

## Closeout

PR [#46](https://github.com/inlifemedicina/cevra/pull/46) merged the approved
feature head `f6df275d0bb30cede04ceaf13223933d4b8e4194` by normal merge commit
`0c8a09c185d1496faa4783f8b9495cd90dff9a21` on 2026-09-25. Post-merge CI run
`36161031848` passed all five jobs and post-merge Audio Sequence Exact Runtime
run `36161031859` passed on that merge commit, including the real
descriptor-bearing Application audio-plan/final-mux catalog. Independent
adversarial review concluded **APPROVE FOR PR WITH NON-BLOCKING NOTES** after
the bounded retry, request-validation, final-chunk cancellation and PCM
publication-consumption remediations.

The following remain deliberate V1 limits:

- same-inode in-place mutation of the CEVRA-owned PCM intermediate is not
  cryptographically detected. An additional full-content hash is deferred as
  disproportionate I/O for this ephemeral, execution-private intermediate;
  revisit an expanded operational stamp or a demonstrably superior equivalent
  when intermediates are reused beyond the live execution, become
  shared/synchronized/user-visible, Windows publication identity is
  implemented, or a real corrupted-export report occurs;
- publication identity is POSIX-only and unsupported strong identity fails
  closed; Windows export support is not claimed by this slice;
- probe-versus-hash TOCTOU is reduced, not eliminated;
- descriptor/source repetition must be remeasured before high-commit-volume
  timeline or Cut Compiler workflows and deduplicated only if evidence warrants;
- optimized composite recovery that reuses validated completed stages is not
  delivered.

## Product-owner delegation

The Product Owner approved the authority and bounded implementation decisions
above. Mechanical technical decisions inside this scope do not require
per-detail ratification. Material cost, privacy, destructive behavior or
objective changes remain explicit approval boundaries, and independent review
plus merge gates remain mandatory.
