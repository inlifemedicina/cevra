# ADR 0028 — Durable Media Execution Archive V1

**Status:** ACCEPTED DIRECTION / IN DEVELOPMENT — independent adversarial review pending
**Date:** 2026-09-23

## Context and authority

[ADR 0016](0016-desktop-project-persistence-recovery.md) makes restored
`ProjectHistory` the only authority after a Desktop restart and prohibits
automatic replay of an interrupted mutation. [ADR 0027](0027-application-resolved-audio-plan-v1.md)
adds an Application execution composed of Audio Sequence, mux and `export.add`,
but its original repository was process-local. A crash therefore lost the
operational evidence needed to preserve or safely clean derived artifacts.

The Product Owner approved a small durable operational archive inside the
trusted Desktop project root. This ADR implements that approved direction; it
does not change Project IR, ProjectHistory, the Project Store payload or any
audiovisual schema.

## Decision

The trusted Desktop root contains two separate authorities:

```text
trusted Desktop project root
├── active-project.current/previous.cevra.json  canonical Project Store checkpoints
└── media-executions.v1.cevra.json              operational archive only
```

The archive is a closed version-1 value containing the active `projectId`,
Media execution records and minimal `resolved-audio-plan` intents. It stores no
Project IR, snapshots, timeline, transcripts or media bytes. It is not a
database, audiovisual journal or second project package.

The Desktop adapter shares the active Project persistence writer lease. The
root never comes from WebView, Project IR, a media request or a new environment
surface. Application owns repository/reconciliation contracts; Node filesystem
implementation remains in Desktop Host.

## Format, integrity and bounds

The canonical file is a private regular file named
`media-executions.v1.cevra.json`. It contains a closed envelope, SHA-256 of the
complete operational payload, and a closed runtime-validated archive. SHA-256
detects accidental corruption and inconsistent writes; it is not authentication
against an actor able to rewrite the trusted root and recompute the digest.
The trusted Desktop root remains the threat boundary, and even a valid digest
never makes a URI cleanup authority. Unknown
versions/keys, malformed records, digest mismatch, project mismatch, symlinks
and oversized content fail closed before paths or publication evidence are
trusted.

V1 permits at most 4,096 execution records, 1,024 composite intents and an
8 MiB encoded archive. Compaction is pressure-triggered and deterministic. It
may remove the oldest unreferenced terminal record only when its latest attempt
has no cleanup uncertainty, or the oldest terminal intent only when it is
`durable-succeeded`/`interrupted` with no cleanup uncertainty. Active,
nonterminal, referenced and recovery-incomplete evidence is never pruned.
Operational evidence is bounded state, not a permanent audit log.

If no safe candidate can make a proposed mutation fit, the repository throws
`MEDIA_EXECUTION_ARCHIVE_FULL` before filesystem persistence. The current
archive remains readable and is not quarantined or write-blocked. By contrast,
a fault during an attempted write, including post-rename/directory-sync
uncertainty, blocks reads and writes on that live instance until reopen.

Each write is serialized and follows:

```text
assert shared Desktop ownership
→ validate detached next state
→ exclusive private temp write
→ file fsync
→ validate temp envelope
→ atomic rename
→ directory fsync where supported
```

The file is never edited in place. A failure before rename preserves the old
archive. A failure after rename may have installed the new valid archive; the
live repository blocks subsequent writes and requires reopen rather than
assuming either state. Regular orphan temps are removed on reopen. Unsafe temp
entries fail closed. Invalid archives are boundedly quarantined and replaced by
an empty degraded operational state without changing canonical ProjectHistory
or deleting media.

`create(record)` and `createIntent(intent)` are atomic inside the serialized
repository. Duplicate IDs fail before an engine/child execution starts.

## Recovery and ordering

Desktop startup order is:

1. acquire trusted Desktop ownership;
2. restore canonical ProjectHistory per ADR 0016;
3. load and validate this archive;
4. initialize Media Application services;
5. reconcile Media records and composite intents without replay;
6. expose the session.

`recoverPending()` retains its historical explicit retry behavior and is not
called by Desktop startup. The new `reconcilePendingWithoutReplay()` methods
never call an engine, retry, worker or new job ID.

| Persisted ordering point | Restored authority | Reconciliation |
|---|---|---|
| intent/record before native output | restored ProjectHistory | interrupted; no replay |
| owned output before canonical mutation | publication identity + restored history | clean only after current identity re-proof; otherwise preserve |
| `committing` before in-memory commit | restored ProjectHistory lacks mutation | interrupted + safe cleanup |
| in-memory commit before Project checkpoint | restored ProjectHistory lacks mutation | interrupted + safe cleanup; no rollback/replay |
| Project checkpoint completed | restored ProjectHistory contains exact mutation/export | reconcile succeeded and preserve canonical output |
| checkpoint completed before intent finalization | restored export identity | finalize intent as reconciled/durable-succeeded |

Archive status, attempt result or a URI never overrides restored ProjectHistory.
Known publication evidence is re-proved through `ArtifactStore.matchesPublication`
before deletion. Missing evidence, identity mismatch, symlink, foreign inode or
unsupported Windows identity causes preservation and observable uncertainty.
Persisted attempt tracking is schema-bound to the exact output URI set derived
from its typed operation; pre-existing/owned/removed/failed/publication lists
cannot introduce an unrelated URI. Restart cleanup for operations without
strong exclusive publication evidence preserves any existing destination and
records uncertainty instead of deleting by path alone. Same-session cleanup
retains its established behavior because it has current execution knowledge.
The residual POSIX `lstat`→`unlink` interval remains; V1 does not claim TOCTOU
elimination.

## Composite intent

`MediaExecutionIntentV1` stores only an ID/kind, project binding, small closed
stage, deterministic `:audio`/`:mux` child IDs, minimal export intent and
timestamps. Stages are `requested`, `audio-running`, `audio-succeeded`,
`mux-running`, `application-committed`, `durable-succeeded`, `interrupted` and
`recovery-incomplete`.

The intent is persisted before its first child. Every risky next stage follows
a successful archive transition. `history.commit(export.add)` establishes a
canonical in-memory commit, not durable success. Only a successful
`DesktopProjectPersistence.checkpoint(history)` permits
`markCheckpointSucceeded()` to write `durable-succeeded`. Checkpoint failure is
not rolled back; restart lets restored ProjectHistory decide authority.

Restart promotion of a composite intent additionally requires its exact mux
child record: matching project, child ID, mux output URI, `export.add` mutation,
export/preset IDs, committing-or-succeeded state and the shared canonical
mutation proof. A pre-existing canonical export with the same identifiers is
not sufficient. A child not yet created is normal empty cleanup, not a URI or
recovery uncertainty.

## Consequences and exclusions

- No Project IR/Project Store format or migration changes.
- No DB, new dependency, worker, Tauri/WebView permission or filesystem API.
- No automatic replay, render, mux, retry or editorial mutation after restart.
- Ambiguous artifacts and proven canonical/undo/redo-retained media are preserved.
- A classified archive failure degrades Media capability while keeping a
  healthy canonical project open; unexpected programming errors still fail
  closed instead of being swallowed.
- Director gains no memory or filesystem authority; this is a compatible typed
  execution/recovery extension only.
- Strong Windows publication identity and removal of the residual POSIX unlink
  race remain deferred.

Technical objective evidence is sufficient for this bounded backend slice;
there is no new subjective Product Owner acceptance surface. The implementation
remains open for independent adversarial review and is not CLOSED on this branch.
