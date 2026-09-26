# Transcript Cache V1 — reconciliation evidence

**Status:** IN DEVELOPMENT / FINAL REMEDIATION — FOCUSED MICRO-REVIEW PENDING
**Canonical base:** `0cf28cf780e9008c29fb45e7e98b3ccb57b64e68`
**Historical donor:** `700bb35a65fe8bf7552ab7621d41455dd463e7f9`
**Historical reconciled code checkpoint:** `22a3b6616f0844622048dad5ef1beb8c313badfb`
**Final remediation code head:** `0b5df56f3db677553825d630eeb4e09ee048bd54`

## Scope reconciled

- The derived `@cevra/transcript-cache` storage adapter, closed keys/envelopes,
  atomic writes, private Desktop cache root, budgets and safe eviction are kept.
- Application transcription/alignment caching is adapted to current
  ProjectHistory V2, current result validators and MR-V01 source identity.
- The donor `NodeSourceContentIdentityProvider` and `source-hash.ts` are
  superseded and removed. Desktop shares one `NodeMediaArtifactStore` source
  identity implementation across Media, MR-V01 and Transcript Cache.
- Transcription/alignment HIT performs one full source hash plus a final cheap
  operational recheck. Fresh cacheable MISS/refresh performs pre/post full
  hashes and requires portable identity plus operational continuity.
- Descriptor-bearing source integrity is independent of cache policy and cache
  availability: HIT, MISS, refresh, bypass and no-cache execution all fail
  closed on unavailable/mismatched proof. Expensive descriptor-bearing
  execution performs pre/post full hashes. Legacy bypass/no-cache execution
  keeps its existing zero-added-hash path; unavailable identity may safely
  bypass only the cache optimization for a legacy source.
- PRE/POST operational continuity compares URI, canonical path, device, inode,
  size, nanosecond mtime and nanosecond ctime in addition to SHA-256 and byte
  size. This rejects reproduced A→B→A source ABA around expensive execution
  without adding a third full hash. The stamp is process-local anti-ABA
  evidence, not a cryptographic identity or protection from a privileged actor
  able to restore all kernel-controlled evidence.
- FasterWhisper execution identity follows the worker's actual selection:
  a valid direct prepopulated root has precedence; otherwise exactly one
  provable Hugging Face layout is required. Multiple plausible layouts or an
  untrusted direct revision bypass the cache rather than guessing. A
  download-enabled profile also bypasses because local bytes cannot prove the
  model that may be resolved.
- Known optional request fields explicitly set to `undefined` are normalized as
  absent after one getter read; unknown fields remain rejected by the closed
  request boundary.
- Alignment HIT skips PCM extraction, worker execution and model-weight hashing.
  Fresh execution retains process-local pinned-model verification before and
  after worker execution.

The cache is derived, disposable and noncanonical. Project IR, ProjectHistory
and Project Store remain authoritative. No cache record, cache deletion or
cache corruption can authorize a project mutation by itself.

## Directed evidence

On final remediation code head `0b5df56f3db677553825d630eeb4e09ee048bd54`:

- Focused Transcription + Alignment Application: 68/68 PASS, including
  descriptor enforcement under prefer/refresh/bypass/no-cache, exact hash
  counts, source ABA continuity, optional-`undefined` snapshots, HIT/MISS,
  invalid payload, idempotent no-op and redo preservation.
- Transcription model execution identity: 11/11 PASS for direct root, both
  supported Hugging Face layouts, mixed-layout ambiguity, actual/unused
  candidate mutation, trusted revision and Node/Python required-file parity.
- Transcription worker Python: 11/11 PASS, including direct-root precedence and
  incomplete-direct fallback to the hub-layout contract.
- Desktop real filesystem: A→B→A same-size source mutation with restored mtime
  fails before canonical promotion; production composition retains the shared
  `NodeMediaArtifactStore` even when no transcript cache is configured.
- `@cevra/transcript-cache`: 12/12 PASS, including closed canonical data,
  corruption/digest mismatch, unknown fields, bounds, cancellation, symlink
  containment, atomic/concurrent writes, eviction, orphan cleanup and deletion
  degrading to MISS.
- Desktop focused real-filesystem boundary: cache-derived promotion survives
  checkpoint/reopen and cache deletion; no cache path enters Project IR or the
  WebView protocol. Managed-runtime isolation passes with controlled Python
  3.12.
- MR-V01 source hashing tests remain owned by `@cevra/media-ffmpeg`; the cache
  package contains no duplicate filesystem hasher.

Full local regression passed on remediation checkpoint
`61cae5e8fa79e215b1b37018cac2b0a373e2a7ce`. Final code head
`0b5df56f3db677553825d630eeb4e09ee048bd54` then added only the fail-safe
`allowModelDownload` identity bypass found in self-review; the directly
affected Transcription identity suite was rerun 11/11 PASS:

- monorepo build, including the Desktop frontend: PASS;
- Node/TypeScript: 553/553 PASS across Desktop, Desktop Host, Application,
  contracts, i18n, Project IR, Project Store, Transcript Cache, Media,
  Transcription and Alignment;
- Python 3.12: 78/78 PASS across Media, Transcription and Alignment;
- `npm audit`: 0 vulnerabilities;
- `git diff --check`: PASS;
- 21 changed-document relative Markdown links: PASS;
- local Rust/Tauri: NOT RUN because `cargo` was unavailable; remote Tauri CI is
  the required evidence.

The immediately preceding reviewed head
`52a778b5e7f902cb67f4bfe6074641956f6bc513` completed normal PR CI
`36186823219`, push CI `36186819057` and managed Exact Runtime
`36186823479` successfully. These runs are historical evidence only and do not
prove the final remediation code. Final remediation code head
`0b5df56f3db677553825d630eeb4e09ee048bd54` passed PR CI `36236680016`
(5/5), push CI `36236678600` (5/5) and managed Exact Runtime `36236680022`.
Historical run `35625702675` (5/5 SUCCESS) belongs to donor head
`700bb35a65fe8bf7552ab7621d41455dd463e7f9` and is not evidence for the
reconciled implementation.

## Bounded performance characterization

Local macOS characterization used a 64 MiB regular file, the production
`NodeMediaArtifactStore`, and a representative 1,000-word transcription entry:

| Measure | Result |
|---|---:|
| source bytes read per full proof | 67,108,864 |
| SHA-256 wall time | 28.348 ms |
| observed hashing throughput | 2,257.6 MiB/s |
| observed RSS delta | 1,327,104 bytes |
| representative cache entry | 76,836 bytes |
| raw cache MISS | 0.692 ms |
| raw cache write | 11.891 ms |
| raw cache HIT | 2.445 ms |

These are bounded characterization numbers, not a cross-machine benchmark.
Application HIT still pays one full source proof; fresh cacheable execution
pays two. Descriptor-bearing bypass/no-cache also pays two because adopted
content integrity is mandatory. Legacy bypass/no-cache adds zero hashes. Tests
prove Alignment HIT performs zero PCM extraction, zero worker calls and zero
model-weight hashing.

## Remaining gate and limits

- One focused independent micro-review of remediation R1–R4 is required before
  PR #24 can leave draft state.
- Managed runtime evidence covers the existing exact catalog; synthetic
  Application tests are not represented as native transcription/alignment ML.
- At-rest cache encryption, cache UI, cloud synchronization and permanent audit
  retention remain outside V1.
- Process-local model attestation deliberately does not survive restart and
  falls back to full verification when strong filesystem state is unavailable.
- Alignment Cache V1 Application/engine behavior is implemented and tested,
  but `AlignmentApplicationService` is not exposed through the production
  Desktop user workflow.
- The first provable Transcription execution identity in a process may hash the
  complete local model artifact manifest, potentially gigabytes for large
  models. Later calls reuse a process-local strong detector while filesystem
  state remains unchanged. A future optimization must retain equally strong
  immutable model/package identity.
