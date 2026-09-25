# CEVRA Durable Source Technical Descriptor V1 — Evidence

Status: **IN DEVELOPMENT / independent review pending**

Date: 2026-09-24

Base: `b00ad159bc0080c31355c8b59d1d5ba22524b2ff`

Branch: `feat/durable-source-technical-descriptor-v1`

Code checkpoint: `1a24b1b53a52b5f50aede13db40be2c3415c7e45`

Architecture: [ADR 0029](adr/0029-durable-source-technical-descriptor-v1.md)

## Implemented scope

- optional closed `SourceTechnicalDescriptorV1` on Project IR v2 sources;
- no Project IR, History Archive or Project Package version change and no migration;
- one managed probe plus one complete streaming SHA-256/byte-count pass for
  supported local regular files;
- operation-local, 128-entry maximum verification memo;
- ingest adoption in the original `source.add` and explicit guarded post-ingest
  adoption through `source.technicalDescriptor.set`;
- content/stability re-proof for descriptor-bearing sources in the bounded
  resolved-audio vertical, including a trusted guard before `export.add`;
- production Desktop wiring through the existing Node media artifact adapter,
  with no WebView/Tauri command or permission;
- unchanged legacy checksum, transcript/provenance and `cevra.ingest` fields.

The profile uses the managed probe's pinned selection: first video stream that
is not an attached picture and first audio stream. Audio Sequence V1 consumes
the corresponding first audio stream; other stream-specific consumers cannot
use this evidence without proving equivalent selection.

## Directed evidence

The stabilized directed checkpoints passed:

- Project IR domain/validation/command: 53/53;
- Application ingest, post-ingest adoption and resolved-audio: 50/50 before the
  final request-schema additions, followed by 28/28 and 10/10 focused reruns;
- real Node filesystem artifact/identity tests: 8/8;
- Project Store: 11/11;
- Desktop persistence/session: 18/18.

Real filesystem cases cover exact hashing, same-size byte replacement with
restored mtime, inode/path replacement, mid-read mutation, symlink, special
file, offline source, cancellation/handle closure and read denial. Simulated
Application barriers separately cover caller mutation/getters, edit plus undo,
remove plus same-ID add, descriptor replacement, abort before commit and source
change before export promotion.

The resolved-audio guard test proves two distinct sources are each hashed once,
multiple clips do not multiply hashing, every decisive recheck happens while
the canonical export count is zero, source change prevents promotion and
attempt-owned outputs are cleaned through existing publication ownership.

## Compatibility characterization

The exact baseline reader at
`b00ad159bc0080c31355c8b59d1d5ba22524b2ff` was built in an isolated scratch
worktree. It accepted and preserved the additive source field through Project
IR v2, Project Package v2 and undo/redo. It did not execute or understand the
new verification semantics. This proves data preservation only, not equivalent
rollback behavior.

Current checkpoint/reopen tests preserve the descriptor, legacy checksum,
transcript state and redo cursor. A simple Desktop reopen succeeds with an
intentionally offline source URI and performs no media identity read.

## Resource characterization

One bounded run on this development host measured:

| Probe | Result |
|---|---:|
| typical compact descriptor | 501 bytes |
| largest constructed accepted descriptor | 2,046 bytes |
| contract ceiling | 2,048 bytes |
| one-source package delta | 1,707 bytes |
| 100-source, one-snapshot package delta | 170,997 bytes |
| 100 sequential descriptor-adoption commits | 6,315,566-byte package; 101 snapshots; 100 entries |
| serialize / reopen for that sequential fixture | 26.46 ms / 47.26 ms |

The package delta exceeds compact descriptor bytes because the canonical
package includes pretty-printed current state and retained history snapshots.
The 100-sequential-commit result is the required scalability gate: source
deduplication is deferred, but workflows that generate many timeline/Cut
Compiler commits must remeasure descriptor-bearing source repetition before
being accepted.

The first 64 MiB hash characterization exposed an unbounded-looking
`createReadStream` RSS increase of about 68.4 MiB. This was fixed before the
checkpoint by replacing it with positional reads into one reused 1 MiB buffer.
The corrected 64 MiB run read exactly 67,108,864 bytes in one SHA-256 pass in
25.09 ms with approximately 1.39 MiB RSS increase. These are local
characterization values, not platform performance guarantees.

## Limits and non-claims

- Probe still opens the file by path; path/handle/final-state checks reduce but
  do not eliminate the residual probe-versus-hash TOCTOU premise.
- No Windows-native filesystem characterization has been run locally.
- The memo is per operation/execution, not session-wide or persistent.
- Legacy sources continue without a verified-content claim.
- Source hashing does not attest caller-provided Composition pixels.
- There is no multistream inventory/selection feature, generic source
  deduplication, relink, blob registry, UI, migration or new dependency.
- Existing durable execution-archive compaction does not affect canonical
  descriptor retention.

## Validation state

The final local validation on code checkpoint
`1a24b1b53a52b5f50aede13db40be2c3415c7e45` passed:

- repository build and all Node/TypeScript workspace tests: 476/476;
- Media, Transcription and Alignment Python suites on the bundled CPython
  3.12 runtime: 56/56, 10/10 and 11/11;
- `npm audit`: zero vulnerabilities;
- `git diff --check` and changed-Markdown local-link validation: PASS;
- local Rust/Tauri compile: NOT RUN because no local Rust toolchain was
  available; remote Tauri CI remains the release evidence.

An earlier broad local invocation selected the system Python 3.9.6 and failed
only the existing managed-Transcription Python 3.12 requirement. Re-running
the complete repository CI command with the bundled Python 3.12 runtime passed;
the failed portability invocation is not product evidence.

Final remote normal CI and any naturally triggered exact managed runtime run
remain pending until this branch is pushed. ADR 0029 remains **ACCEPTED
DIRECTION / IN DEVELOPMENT** and the product progress baseline remains **48%**
until independent review, PR, merge and closeout.

Implementation environment recorded for traceability: Codex Desktop. The task
requested GPT-5.6 Sol with High reasoning; repository evidence cannot
independently attest or change the host model/effort selection.
