# Durable Media Execution Archive V1 — implementation evidence

**Status:** IN DEVELOPMENT / independent adversarial review pending
**Base:** `9025151f714de08cf9a77c9492df768400b887f5`
**Branch:** `feat/durable-media-execution-archive-v1`

## Implemented evidence

- Application repository now has atomic `create()` plus the existing update,
  lookup and status queries. Duplicate concurrent execution/intent IDs produce
  exactly one winner.
- Desktop Host stores a closed `MediaExecutionArchive V1` under the same trusted
  root and writer lease as Project persistence. The SHA-256 envelope, 0600 mode
  on POSIX, exclusive temp, fsync, rename and directory-sync path use only Node
  built-ins.
- Corrupt JSON, unknown version, unknown keys, malformed nested evidence,
  digest mismatch, project mismatch, oversized input and unsafe temp/symlink
  entries never become cleanup authority. Canonical ProjectHistory remains
  intact and ambiguous media is preserved.
- Startup restores ProjectHistory first, then reconciles `requested`, `running`
  and `committing` records and composite intents through explicit no-replay
  methods. Instrumented tests observe zero engine calls, zero retries and no new
  attempt/job IDs. A second reconciliation is inert.
- Real temp-root close/reopen covers owned cleanup, foreign inode replacement,
  missing ownership evidence, canonical export preservation and undo/redo
  retained-media preservation.
- Composite intent is persisted before child work; deterministic child IDs are
  `:audio` and `:mux`. Application commit remains `application-committed` until
  Desktop checkpoint succeeds. A simulated checkpoint failure leaves the
  in-memory mutation present, the restored project unchanged and the intent not
  durable-succeeded.

## Deterministic crash/fault matrix

The tests construct equivalent persisted crash states; they are labeled
**SIMULATED CRASH STATE**, not real process kills.

| Crash/fault point | Evidence exercised | Expected result |
|---|---|---|
| intent created | requested intent | interrupted, no child execution |
| media requested/running | pending record | interrupted, no retry |
| audio output published | publication identity | clean only when current identity matches |
| audio succeeded / mux requested | child refs + intent stage | no replay; reconcile both children |
| mux output published/committing | result + publication evidence | restored history decides authority |
| history commit in memory | checkpoint-failure injection | not durable; previous restored history wins |
| checkpoint temp/canonical replacement | existing ADR 0016 fault suite | old/current valid checkpoint remains authority |
| archive temp / before rename | archive fault seam | old archive remains authority |
| archive rename / directory sync | archive fault seam | reopened valid file decides; live writer blocks |
| checkpoint completed before intent finalization | canonical export + pending intent | reconciled durable-succeeded |

## Directed validation checkpoint

- Application Media/Resolved Audio directed tests: 58/58 PASS after additions.
- Archive schema tests: 3/3 PASS.
- Desktop archive/reopen/fault tests: 21/21 PASS.
- Consolidated local regression: 433/433 Node/TypeScript and 77/77 Python
  tests PASS; frontend and Desktop Host builds PASS; npm audit reports zero
  vulnerabilities. Rust/Tauri was not run locally because the Rust toolchain is
  unavailable; normal remote CI remains the required Tauri evidence.
- Normal remote CI run `35928179816` passed all five required jobs on
  implementation head `373ae2fbaf235fa45284a692afee434447ce1afe`. The exact
  FFmpeg runtime workflow did not trigger because this slice does not change a
  Media Runtime path; it was not forced with an unrelated file change.

## Bounded resource characterization

Measured on the local macOS arm64 host using minimal representative requested
records and a real temp trusted root:

| Records | Archive bytes | Mean create/write latency |
|---:|---:|---:|
| 1 | 539 | 8.004 ms |
| 10 | 3,007 | 7.490 ms |
| 100 | 27,849 | 10.557 ms |

Close/reopen/load of 100 records measured 7.611 ms. Each mutation performs one
temp write+file fsync, one rename and one directory fsync where supported. These
are characterization values, not product performance guarantees. Heap delta was
not isolated reliably and is reported unavailable.

## Limits and deferred work

- V1 bounds: 4,096 records, 1,024 intents and 8 MiB encoded archive. These are
  operational archive safeguards, not project/video limits.
- Terminal-record pruning is deferred until retention semantics can be proven;
  V1 fails closed at its defensive bounds.
- Windows without strong publication identity preserves ambiguous outputs.
- The residual POSIX `lstat`→`unlink` race remains documented.
- No real abrupt-process-kill matrix is claimed; real filesystem reopen and
  deterministic persisted crash states cover the V1 implementation boundary.
- No Project IR, Project Store, Tauri permission, dependency or runtime worker
  changed.

Product progress remains 48%.
