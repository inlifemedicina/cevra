# ADR 0016 — Desktop Project Persistence and Recovery V1

**Status:** Accepted by this implementation
**Date:** 2026-09-15

## Context

ADR 0015 established one authoritative `ProjectHistory` inside the private
Node.js Desktop Host. That memory-only session made an unexpected host exit
terminal. The repository already has the platform-neutral
`@cevra/project-store` codec for Project IR, journal, snapshots and active
history cursor. Desktop persistence must reuse it without granting filesystem
authority to React or creating another audiovisual model.

## Decision

The private Desktop Host owns a small active-session checkpoint component. Rust
derives a deterministic CEVRA directory below Tauri's trusted application-data
directory and passes it to the fixed host process through the sanitized child
environment. The WebView cannot choose or observe this root and receives no
filesystem, shell, sidecar, process or network permission.

`ProjectHistory` remains the live authority and Project IR remains the sole
audiovisual source of truth. Each checkpoint is exactly a serialized
`@cevra/project-store` package wrapped only by JSON transport encoding; the
desktop layer adds no competing project schema, journal, transcript store or
database. Source-scoped transcripts persist naturally inside Project IR.

Every successful ingest, transcript promotion, undo and redo follows one
durability boundary:

```text
canonical ProjectHistory mutation
→ Project Store serialization
→ durable temporary file
→ payload validation
→ previous-known-good rotation
→ atomic current-checkpoint replacement
→ response to caller
```

The file and containing directory are synced where the supported platform
permits it. Temporary files are never canonical and are ignored/removed during
startup. The active root retains one current checkpoint, one previous-known-good
checkpoint and at most two rotated corrupt-current quarantine artifacts.

The previous checkpoint is prepared before current is replaced. A crash can
therefore leave either the old current or the previous checkpoint usable; it
cannot promote a partial temporary payload. Original imported media is not
copied. Project IR continues to retain its authorized URI and provenance.

## Startup and corruption policy

- A valid current checkpoint restores the complete `ProjectHistory`, including
  IDs, Project IR, journal, snapshots, revision, cursor and undo/redo state.
- If current is invalid and previous is valid, current is copied into bounded
  quarantine, previous is restored as current, and the session reports recovery.
- If persisted canonical/recovery artifacts exist but neither validates, startup
  fails closed with a bounded integrity error. Evidence is not overwritten and
  no empty project is created.
- Only genuine absence of both canonical checkpoints is a first run. It creates
  the normal empty project and durably checkpoints it before the host becomes
  ready.

If an in-memory mutation succeeds but its checkpoint fails, the mutation is not
rolled back or falsely reported as saved. The host returns a typed persistence
failure with a reconciled canonical projection and marks the session as having
unsaved changes.

## Host recovery

An otherwise valid unexpected Desktop Host process exit is recoverable once per
application supervisor lifetime. Rust starts the fixed private host again with
the same trusted persistence root, completes the ADR 0015 identity/protocol
handshake, and reconciles the UI from the restored canonical snapshot. The
interrupted operation is never replayed automatically. Whether its mutation is
present depends only on whether its checkpoint completed before process death.

The bounded restart does not apply to protocol mismatch, malformed protocol
data, invalid host identity, unrecoverable persistence corruption, supervisor
integrity failure or an exhausted recovery budget. Those remain terminal and
fail closed.

## Scope and consequences

V1 persists one active local desktop project/session. It deliberately defers a
multiple-project library, recent-project browser, Open Project, Save As,
portable package import/export UX, cloud synchronization, media bundling,
autosave policy controls and automatic operation replay. Preview playback,
Director, Presets and export remain separate milestones.

No new third-party dependency is introduced.
