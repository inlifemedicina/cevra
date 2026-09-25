# CEVRA Durable Source Technical Descriptor V1 — Evidence

Status: **IMPLEMENTED / CLOSED**

Date: 2026-09-25

Base: `b00ad159bc0080c31355c8b59d1d5ba22524b2ff`

Branch: `feat/durable-source-technical-descriptor-v1`

Feature PR: [#46](https://github.com/inlifemedicina/cevra/pull/46)

Feature head: `f6df275d0bb30cede04ceaf13223933d4b8e4194`

Feature merge: `0c8a09c185d1496faa4783f8b9495cd90dff9a21`

Initial code checkpoint: `1a24b1b53a52b5f50aede13db40be2c3415c7e45`

Post-review remediation code checkpoint: `5f57dcc1ae3fe0da2fed3b2f341cb8d66a1358fa`

Final guard-error checkpoint: `9cbb1d0a9f3cddcdc3ea525e6d44396fb5fbd748`

Architecture: [ADR 0029](adr/0029-durable-source-technical-descriptor-v1.md)

## Closeout evidence

- Pull-request CI run `36153512241` passed 5/5 on feature head
  `f6df275d0bb30cede04ceaf13223933d4b8e4194`.
- Pull-request Audio Sequence Exact Runtime run `36153512395`, job
  `108132378246`, passed on the same head. It executed managed FFmpeg 9.0.1 and
  the Application resolved-audio/final-mux catalog, including successful real
  descriptor acquisition/export and changed-source rejection.
- PR #46 merged normally as
  `0c8a09c185d1496faa4783f8b9495cd90dff9a21` with parents
  `b00ad159bc0080c31355c8b59d1d5ba22524b2ff` and
  `f6df275d0bb30cede04ceaf13223933d4b8e4194`.
- Post-merge CI run `36161031848` passed 5/5 on the merge commit.
- Post-merge Audio Sequence Exact Runtime run `36161031859` passed on the
  merge commit and reran the descriptor-bearing managed-runtime catalog.
- Independent adversarial re-review concluded **APPROVE FOR PR WITH
  NON-BLOCKING NOTES** after the F-1/F-2/F-3 and P-PCM remediations.

This closes MR-V01 at the bounded ADR 0029 scope. It does not remove the limits
recorded below, close the coordinated Media Runtime gate, or claim full visual
Composition attestation.

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

## Post-review remediation

Three confirmed review findings and the directly related PCM boundary were
addressed in code checkpoint `5f57dcc1ae3fe0da2fed3b2f341cb8d66a1358fa`:

- isolated retry of a duration-validated mux now fails with
  `MEDIA_OPERATION_NOT_RETRYABLE` before any new attempt, job or engine call;
  `recoverPending()` reaches the same policy, while unrelated retry contracts
  remain characterized;
- post-ingest descriptor adoption snapshots once and validates request shape,
  locale, actor and identifiers before deriving execution values or translating
  an error. Malformed values and a throwing getter return a typed
  `SOURCE_DESCRIPTOR_INVALID_REQUEST` with zero probe/hash/mutation;
- Node identity observes cancellation after the last read and after final
  asynchronous stability checks. One-chunk and multi-chunk real-file tests
  prove cancellation and handle closure; an uncancelled control preserves the
  exact digest and byte count;
- the historical P-PCM hypothesis was **confirmed** in a controlled comparison:
  replacing the published sequence PCM by atomic rename before mux caused the
  unguarded control to consume the foreign bytes and promote them. Production
  now re-proves the original child publication before mux and before export
  promotion. The protected case makes zero mux engine calls, creates no export
  and preserves the foreign replacement. Device/inode proof does not detect
  hostile in-place rewriting of the same inode.

Follow-up checkpoint `9cbb1d0a9f3cddcdc3ea525e6d44396fb5fbd748`
preserves the typed `MEDIA_INPUT_ARTIFACT_CHANGED` guard failure in the mux
attempt record instead of collapsing it to a generic engine failure; the
Application suite remained **135/135**.

The Application and Media Node directed suites passed **135/135** and **91/91**
on this checkpoint. The existing functional catalog now includes a real managed
probe + Node identity descriptor acquisition, positive sequence/mux/export and
changed-source rejection using separate synthetic sources. The script builds
and parses locally; the exact managed FFmpeg runtime was not available in this
local workspace, so native execution is **NOT RUN** here and remains required
before merge. The required managed-native execution subsequently passed in PR
and post-merge runs recorded above.

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
- Same-inode in-place mutation of the ephemeral, execution-private sequence PCM
  is not cryptographically detected. A second full-content hash is deferred as
  disproportionate I/O for V1; revisit an expanded operational stamp or a
  demonstrably superior equivalent before cross-execution reuse, shared or
  user-visible staging, Windows publication identity, or after a real
  corrupted-export report.
- No Windows-native filesystem characterization has been run locally.
- The memo is per operation/execution, not session-wide or persistent.
- Legacy sources continue without a verified-content claim.
- Source hashing does not attest caller-provided Composition pixels.
- There is no multistream inventory/selection feature, generic source
  deduplication, relink, blob registry, UI, migration or new dependency.
- Existing durable execution-archive compaction does not affect canonical
  descriptor retention.

## Validation state

The pre-review local validation on initial code checkpoint
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

Historical normal CI run `36084236839` on documentation head
`0750473cc29e8333fa67dd7c7baafad9b9654321` passed 5/5 jobs; it is not evidence
for the remediation checkpoint. The final broad local regression over remediation
code `5f57dcc1ae3fe0da2fed3b2f341cb8d66a1358fa` passed all workspace builds and
**481/481** Node/TypeScript tests when the documented bundled Python 3.12.14 was
provided to managed Desktop fixtures. The Python suites passed **56/56 Media**,
**10/10 Transcription** and **11/11 Alignment**; `npm audit` reported zero
vulnerabilities, `git diff --check` passed and 21 changed-document local links
resolved. A first broad invocation with the shell's Python 3.9.6 reproduced only
the known managed-Transcription version gate; the directed Desktop Host rerun
with Python 3.12.14 passed **70/70**. Local Rust/Tauri remains NOT RUN because
`cargo` is unavailable. At that local-validation checkpoint, remote normal CI
had not yet completed. The feature push allowlist
does not naturally run the exact workflow; the future pull-request path filter
does include the changed Application/Media files. That gate passed in PR run
`36153512395` and again post-merge in run `36161031859`. ADR 0029 is
**IMPLEMENTED / CLOSED** at the bounded V1 scope and product progress remains
**48%**.

Remote normal CI run `36090798711` (`push`) completed **5/5 SUCCESS** on
implementation/documentation head `2cf0e1afaddd991562f17f60de9cec0b0f5c9cda`:
Monorepo, Tauri, Media Runtime reproducibility, Transcription and Alignment.
The exact managed runtime workflow was not triggered by the feature-push branch
allowlist; this is **NOT RUN**, not a pass, and the pull-request path gate remains
required for the new descriptor-bearing functional catalog. That later gate is
recorded in the closeout evidence above.

Implementation environment recorded for traceability: Codex Desktop. The task
requested GPT-5.6 Sol with High reasoning; repository evidence cannot
independently attest or change the host model/effort selection.
