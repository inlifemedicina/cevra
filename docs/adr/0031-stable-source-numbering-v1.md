# ADR 0031 — Stable source numbering V1

**Status:** Owner-approved bounded evolution; IN DEVELOPMENT / NOT MERGED in PR #78
**Date:** 2026-10-03

## Context and approval

The owner approved shared numbered source labels that remain stable across
filtering, removal, undo/redo and project reopening, with original filenames
secondary. A window-only presentation registry cannot preserve retired numbers
after restart. The owner subsequently approved the smallest implementation:
source-ID reservations and a monotonic counter owned by existing ProjectHistory,
serialized by existing ProjectStore, outside the undo cursor. This ADR records
that approval and the explicit versioned format; it does not replace the history
or persistence architecture in [ADR 0019](0019-project-history-scalability-v2.md)
and [ADR 0016](0016-desktop-project-persistence-recovery.md).

## Decision

`SourceNumberingV1` contains `version: 1`, `nextNumber` and source-ID/number
reservations. One counter covers all source kinds within each project. For
example, a video, audio and another video receive Video 1, Audio 2 and Video 3.
The current source kind supplies the localized label; the number identifies the
source ID. Filters can consequently show gaps. This also preserves compatibility
with valid legacy histories that remove an ID and later re-add it with another
kind. Re-adding that ID retains its number.

ProjectHistory initializes reservations for initial sources and reserves a new
ID only after a typed `source.add` passes canonical validation. Allocation occurs
before the successful commit becomes observable. Duplicate/invalid commands and
counter exhaustion do not publish a changed history. Reservations survive
removal, undo, redo, restore and discarded redo branches; the counter never
rewinds. Exported metadata is detached. Strict validation rejects unknown fields,
duplicate IDs or numbers, missing snapshot-source reservations, invalid version,
unsafe/nonpositive integers and counters that would reuse a reserved number.

HistoryArchive V3 retains V2 compact snapshots and transcript blobs and adds the
registry once, outside snapshots. Project Package V3 stores it once in the
existing manifest. Project IR remains schema V2 with its existing audiovisual
shape. No new database, store, dependency, journal command or file type is added.
The host exposes the detached registry in its existing state response; the
backend validates it and the UI renders the shared source labels without
allocating numbers. Existing source actions still resolve canonical source IDs.

## Legacy reads, saves and recovery

HistoryArchive and Project Package V1/V2 remain readable. Initialization walks
validated retained snapshots in revision order, then their source-array order,
reserving each ID once. Opening a valid legacy checkpoint only initializes this
metadata in memory; it does not rewrite current or previous files. An explicit
existing checkpoint/serialization writes V3. Older software that only understands
V1/V2 cannot read V3; no downgrade writer is introduced. A legacy version carrying
the V3-only registry is rejected rather than silently ignoring reservations.

Legacy archives did not store issued labels or discarded branches. Their old
labels cannot be reconstructed, and the deterministic initialization may differ
from numbers previously displayed by a window-only UI. The non-reuse guarantee
starts with the initialized registry and its successful checkpoints. Recovery
preserves the registry of the valid checkpoint recovered under ADR 0016; it
cannot reconstruct reservations present only in an unsaved session or a lost
newer checkpoint. No real owner project is automatically migrated or saved by
this implementation/verification task.

## Scope, risks and validation

Reservations grow linearly with IDs ever allocated in the saved history, including
retired IDs. They are intentionally retained to uphold non-reuse; pruning or a
different durability policy would require a later explicit decision. Transcript
deduplication and the existing checkpoint lifecycle are unchanged.

Offline synthetic tests cover archive/package round trips, actual filesystem
checkpoint/close/reopen, undo/redo/restore, removal/addition, discarded branches,
filters/locales, source-ID reuse across kinds, non-reuse, collisions, malformed
metadata, exhaustion and V1/V2 compatibility. They also verify that opening a
valid V2 file leaves its bytes unchanged. Reuse acceptance IDs X-T1/T2/T5,
I8-T3/T6 and I17-T9; these tests establish this bounded identity/persistence
contract, not complete app editing or human acceptance.

Director impact is a compatible presentation-identity extension: typed commands,
ProjectHistory and Project IR retain execution/state authority. No new permission,
context, provider, engine or editing authority is granted. The designated F-A02
editorial review and its notes remain temporary in-memory state. No real AI,
credential/account request or audiovisual source write is part of this change.

The already reviewed native visual demo at `dd7f1e4` remains separately frozen:
its numbering lasts only for the window. It is visual evidence for that commit,
not native proof of this durable follow-up. Human visual/narrative acceptance and
final typography, colors, logo and icons remain pending.
