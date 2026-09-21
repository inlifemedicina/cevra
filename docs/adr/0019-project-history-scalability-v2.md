# ADR 0019 — ProjectHistory Scalability V2

**Status:** Accepted by this implementation
**Date:** 2026-09-21

## Context

`ProjectHistory` V1 stored a complete `ProjectIR` in every snapshot. Because the
canonical Project IR embeds exact source-scoped transcripts, unrelated editing
commits repeated every word, segment, confidence value, provenance record and
extension in memory and in every saved snapshot.

A deterministic characterization with three 30-minute sources and 1,800 words
per source grew the serialized project package from 2.84 MiB at the initial
snapshot to 294.98 MiB after 200 unrelated rename commits. At that point the
process RSS was approximately 2.4 GiB. The earlier targeted audit observed the
same growth ending in `RangeError: Invalid string length` around 367 commits.
This is a correctness and recoverability blocker, not a micro-optimization.

Project IR must remain the canonical audiovisual state. ProjectHistory must
retain typed journal evidence, exact undo/redo/restore behavior and Desktop
recovery. Existing HistoryArchive V1 and Project Package V1 data must remain
readable.

## Decision

ProjectHistory V2 stores compact snapshots internally. Each compact snapshot
contains the ordinary Project IR state excluding embedded
`sourceTranscripts`, plus an ordered list of per-source transcript references.
The history owns a durable content-addressed pool containing each unique exact
`SourceTranscript` once. Materializing a snapshot reconstructs the normal,
unchanged Project IR shape and validates it.

The content address is SHA-256 over a deterministic JSON representation of the
complete `SourceTranscript`. Arrays retain order, object keys are sorted, and
unsupported, circular, non-finite or otherwise non-JSON state is rejected
rather than normalized. The namespace is
`sha256-history-transcript-v1-<hex>`.

This history blob digest is deliberately **not** the canonical editorial
`transcriptDigest`. The editorial digest intentionally excludes exact stored
state such as confidence, provenance, source ownership and extensions. Two
transcripts may therefore share `transcriptDigest` while requiring different
history blobs. Exact restoration outranks deduplication ratio.

HistoryArchive V2 contains compact snapshots and the deterministic reachable
blob set. New Project Store output uses Project Package V2 with inspectable
snapshot and transcript-blob entries. `project.json` remains the full current
canonical Project IR and must exactly match the reconstructed active snapshot.
Blob filenames and identities are strictly validated; missing, malformed,
tampered or mismatched blobs fail closed as corruption.

Archive loading validates every compact Project IR snapshot and validates each
immutable transcript blob once per distinct owning-source context. This keeps
the exact source-kind, duration and checksum constraints while avoiding a
second O(snapshots × transcript payload) validation path during checkpoints.

HistoryArchive V1 and Project Package V1 remain readable. A successfully
opened V1 package may be written as V2 at its next checkpoint without changing
the Project IR schema. Existing history IDs, revisions, journal entries and
cursor semantics are preserved.

## Implementation closeout

The implementation merged in PR #30 by normal merge commit
`b6f201afa73aae0aa85f8a3d4187a568ab749e72`. Post-merge CI run
`35668351461` passed all five required jobs.

Compact snapshots plus exact per-source content-addressed transcript blobs are
now the canonical `ProjectHistory` implementation. V1 history archives and
Project Package V1 remain readable, while the next successful checkpoint writes
V2. The Project IR schema remains unchanged.

Before merge, independent Claude review identified a HIGH cleanup
materialization path and a MEDIUM redundant commit path. Both were corrected:
cleanup uses metadata-only retained-URI lookup, and commit compacts and returns
the already-validated detached Project IR without rematerializing it. The
inherited Desktop Host supervisor recovery race was fixed separately in PR #29
before ProjectHistory merged.

## Preserved invariants

- Project IR schema and public `sourceTranscripts` shape are unchanged.
- ProjectHistory remains the only canonical reversible-edit history.
- Typed journal commands, including legitimate `transcript.set` payloads, are
  retained for audit.
- `current`, commit, undo, redo, restore, branch truncation, revisions and head
  pointers preserve their behavior.
- Desktop persistence retains exclusive ownership, durable temporary writes,
  previous-known-good rotation, corruption classification, quarantine and
  crash recovery from ADR 0016.
- ProjectHistory blobs are canonical durable history content and are not the
  disposable Transcript Cache introduced by a separate feature.

For unchanged transcripts, heavy persisted snapshot storage now grows with the
number of unique exact transcript versions, not with history commits multiplied
by transcript size. Commands that actually mutate transcripts may still carry
their legitimate journal evidence.

## Consequences and compatibility

The public `history.snapshots` compatibility accessor may materialize complete
snapshots and is therefore not the persistence path. Project Store uses the
compact `toArchive()` representation directly. Abandoned redo blobs may remain
in the process-local map, but archive generation emits only blobs reachable
from retained snapshots.

Production cleanup obtains retained source and export URIs through a narrow
metadata-only history query rather than materializing full snapshots. The
commit path compacts already-validated Project IR and returns that detached
validated command result without rematerializing the new snapshot. These are
bounded hot-path corrections and do not change the selected architecture.

No database, cloud storage, second history authority, arbitrary filesystem
reference, Project IR migration, new dependency, cache coupling or WebView
permission is introduced.

## Deferred

Abandoned in-memory transcript blob garbage collection and inherited V1 archive
invariant strengthening remain deferred. Incremental checkpoints, journal
replay and periodic snapshots also remain deferred and should be reconsidered
only if post-deduplication evidence demonstrates a new concrete safety or
proportionality problem.
