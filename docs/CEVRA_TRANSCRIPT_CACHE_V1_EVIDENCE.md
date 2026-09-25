# Transcript Cache V1 — reconciliation evidence

**Status:** IN DEVELOPMENT / RECONCILED — INDEPENDENT REVIEW PENDING  
**Canonical base:** `0cf28cf780e9008c29fb45e7e98b3ccb57b64e68`  
**Historical donor:** `700bb35a65fe8bf7552ab7621d41455dd463e7f9`  
**Reconciled code head:** `22a3b66fe6b43d731410d0332b125d23ffb001b8`

## Scope reconciled

- The derived `@cevra/transcript-cache` storage adapter, closed keys/envelopes,
  atomic writes, private Desktop cache root, budgets and safe eviction are kept.
- Application transcription/alignment caching is adapted to current
  ProjectHistory V2, current result validators and MR-V01 source identity.
- The donor `NodeSourceContentIdentityProvider` and `source-hash.ts` are
  superseded and removed. Desktop shares one `NodeMediaArtifactStore` source
  identity implementation across Media, MR-V01 and Transcript Cache.
- Transcription/alignment HIT performs one full source hash plus a final cheap
  operational recheck. Fresh MISS/refresh performs pre/post full hashes.
- Descriptor-bearing mismatches fail closed; strong legacy sources remain
  cacheable without creating a descriptor. Weak/unavailable identity bypasses
  cache without weakening the existing engine path.
- Alignment HIT skips PCM extraction, worker execution and model-weight hashing.
  Fresh execution retains process-local pinned-model verification before and
  after worker execution.

The cache is derived, disposable and noncanonical. Project IR, ProjectHistory
and Project Store remain authoritative. No cache record, cache deletion or
cache corruption can authorize a project mutation by itself.

## Directed evidence

On the reconciled code head:

- `@cevra/application`: 160/160 PASS, including prefer/refresh/bypass,
  descriptor mismatch, HIT operational recheck, pre/post identity drift,
  invalid payload, request snapshot, idempotent no-op and redo preservation.
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

Full local regression after reconciliation passed:

- monorepo build, including the Desktop frontend: PASS;
- Node/TypeScript: 539/539 PASS across Desktop, Desktop Host, Application,
  contracts, i18n, Project IR, Project Store, Transcript Cache, Media,
  Transcription and Alignment;
- Python 3.12: 77/77 PASS across Media, Transcription and Alignment;
- `npm audit`: 0 vulnerabilities;
- `git diff --check`: PASS;
- 21 changed-document relative Markdown links: PASS;
- local Rust/Tauri: NOT RUN because `cargo` was unavailable; remote Tauri CI is
  the required evidence.

GitHub CI belongs to the final branch head and is recorded here only after its
run. Historical run `35625702675` (5/5 SUCCESS) belongs to donor head
`700bb35a65fe8bf7552ab7621d41455dd463e7f9` and is not evidence for the
reconciled code.

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
Application HIT still pays one full source proof; fresh MISS pays two. Tests
prove Alignment HIT performs zero PCM extraction, zero worker calls and zero
model-weight hashing.

## Remaining gate and limits

- Focused independent review is required before PR #24 can leave draft state.
- Normal CI must pass on the reconciled final SHA; managed ML/runtime evidence
  is reported separately and synthetic engines are not represented as native ML.
- At-rest cache encryption, cache UI, cloud synchronization and permanent audit
  retention remain outside V1.
- Process-local model attestation deliberately does not survive restart and
  falls back to full verification when strong filesystem state is unavailable.
