# ADR 0005 — Journaled Reversible Editing

Status: Accepted

Every project mutation is recorded as a typed journal event and results in a recoverable state/snapshot strategy. Undo/redo and crash recovery must not depend on reversing opaque engine commands.
