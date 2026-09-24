# Durable Media Execution Archive V1 — implementation evidence

**Status:** IN DEVELOPMENT / remediation complete / focused independent re-review pending
**Base:** `9025151f714de08cf9a77c9492df768400b887f5`
**Branch:** `feat/durable-media-execution-archive-v1`
**Reviewed pre-remediation head:** `dcd346f7b9c7a29ed0ef8fd61dcc9d84827bbeb1`
**Remediation code head:** `498cc0ef2320d43098b58bbd32d8a99a0bf05b8b`

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

## Focused adversarial remediation

- **F-1 — restart cleanup authority:** persisted attempt URI lists are now
  exactly bound to the typed operation outputs. Publication evidence cannot
  name another URI. Restart reconciliation deletes exclusive outputs only
  after current publication-identity proof. A non-exclusive persisted output
  without strong identity is preserved and recorded as cleanup uncertainty;
  same-session failure cleanup remains unchanged.
- **F-2 — capacity:** safe terminal evidence is compacted only under records,
  intents or byte pressure. Active, referenced, recovery-incomplete and
  cleanup-uncertain evidence is retained. A mutation that still cannot fit
  fails with `MEDIA_EXECUTION_ARCHIVE_FULL` before I/O and does not poison the
  live repository. Uncertain write failures still block reads/writes until a
  validated reopen. A classified archive failure degrades Media capability but
  does not hide a healthy canonical project.
- **F-3 — missing children:** an execution child not yet created is empty
  cleanup, not a recovery error. `cleanupUncertainUris` contains URIs only.
- **F-4 — canonical export collision:** a matching pre-existing export is not
  proof of this intent. Durable reconciliation requires the exact mux child,
  expected output, matching export mutation/preset, valid terminal boundary
  and the shared canonical mutation proof.

SHA-256 detects accidental corruption and inconsistent payloads. It does not
authenticate the archive against an actor who can rewrite the trusted root and
recompute the digest. Regardless of digest validity, URI/path text alone never
authorizes cleanup.

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

- Focused remediation catalog: 92/92 PASS across Application Media/Resolved
  Audio, archive schema and Desktop archive/reopen/fault tests.
- It covers non-exclusive foreign preservation, URI/publication binding,
  record/intent/byte pressure, no-prunable FULL, no-write-block on FULL,
  post-rename read/write blocking, classified startup degradation, repeated
  FULL reconciliation/reopen, missing children, old-export collision and the
  mux proof matrix.
- Consolidated remediation regression: 446/446 Node/TypeScript and 77/77
  Python tests PASS; all workspace builds, frontend and Desktop Host builds
  pass; npm audit reports zero vulnerabilities; `git diff --check` and changed
  Markdown relative-link validation pass. Rust/Tauri was not run locally
  because the Rust toolchain is unavailable; normal remote CI remains the
  required Tauri evidence.
- Pre-remediation normal CI run `35930005886`, attempt 2, passed 5/5 on
  `dcd346f7b9c7a29ed0ef8fd61dcc9d84827bbeb1`. Attempt 1's EPIPE was transient
  evidence, not a code change request. A new final-head run is required and the
  old run is not proof of this remediation.
- Exact FFmpeg runtime is not required because this remediation changes no
  Media Runtime path and is not being triggered through an unrelated edit.

## Bounded resource characterization

Measured on the local macOS arm64 host with the real V1 envelope and closed
validator. The previous latency characterization remains useful, while the
size samples below use realistic operation/result evidence rather than empty
requested records:

| Sample | Records | Archive bytes |
|---|---:|---:|
| realistic completed probe/ingest-like evidence | 1 | 1,640 |
| representative completed resolved-audio child | 1 | 3,094 |
| probe plus resolved-audio child | 2 | 4,488 |
| realistic completed probes | 100 | 138,446 |

The earlier measured write means were 8.004 ms (1 minimal record), 7.490 ms
(10) and 10.557 ms (100); close/reopen/load of 100 measured 7.611 ms. Each
mutation performs one temp write+file fsync, one rename and one directory fsync
where supported. Count is limiting for small probe records, while richer child
records can reach the 8 MiB byte bound before 4,096 records. Compaction is
pressure-triggered. These are characterization values, not product performance
guarantees; isolated heap delta remains unavailable.

## Limits and deferred work

- V1 bounds: 4,096 records, 1,024 intents and 8 MiB encoded archive. These are
  operational archive safeguards, not project/video limits.
- Terminal evidence is not retained indefinitely: only safe terminal records
  and intents are eligible for deterministic oldest-first pressure compaction.
  If no safe candidate exists, V1 fails closed at its defensive bounds.
- Windows without strong publication identity preserves ambiguous outputs.
- The residual POSIX `lstat`→`unlink` race remains documented.
- No real abrupt-process-kill matrix is claimed; real filesystem reopen and
  deterministic persisted crash states cover the V1 implementation boundary.
- No Project IR, Project Store, Tauri permission, dependency or runtime worker
  changed.

Product progress remains 48%.
