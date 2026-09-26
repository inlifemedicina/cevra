# ADR 0018 — Transcript Cache V1

**Status:** IMPLEMENTED / CLOSED
**Date:** 2026-09-25
**Closed:** 2026-09-26

## Context

Local transcription and forced alignment are expensive derived computations.
Project IR and its `SourceTranscript` aggregates remain the only canonical
audiovisual state, while Project Store remains the durable project/history
codec. A reusable cache can avoid repeating identical local ML work, but a weak
cache identity or a trusted cache payload could silently promote a result made
for different bytes, model code, request settings or transcript input.

`SourceAsset.checksum` is not automatically suitable for this purpose: it is
optional and its current contract does not prove that CEVRA cryptographically
verified the current local file bytes. URI, path, name, source/project ID and
mtime are likewise not content identities.

## Decision

Add a disposable provider-neutral application cache port and a Node filesystem
implementation in `@cevra/transcript-cache`. The cache stores normalized
transcription or alignment engine results plus their original producer
execution ID/time. It never stores a canonical `SourceTranscript`, Project IR,
ProjectHistory, source path, media, PCM, model weight or Python environment.
Deleting the cache therefore cannot invalidate or alter a project.

Both cached and fresh results converge through the existing application result
validator, canonical `createSourceTranscript` construction, stale guards and
`transcript.set`/`ProjectHistory` promotion. A hit is untrusted derived input,
not a mutation. Only a different valid candidate is promoted. If the rebuilt
candidate already has the current canonical transcript digest, the request
succeeds idempotently without a new history revision and preserves the richer
canonical aggregate/provenance already present.

Cache policy is closed and typed:

- `prefer`: read; on miss execute; best-effort write;
- `refresh`: skip read; execute; best-effort replace/write;
- `bypass`: neither read nor write.

The desktop's normal transcription path uses `prefer`. No UI or Tauri command
is added.

## Strong source and execution identity

Before cache lookup, Application reuses the MR-V01 `SourceContentIdentityPort`
and Desktop `NodeMediaArtifactStore`; Transcript Cache owns no second media
hasher. The shared implementation captures the regular local source, streams a
bounded SHA-256 proof, and returns lowercase hexadecimal `sha256` plus exact
`sizeBytes` with a non-persisted operational stamp. Symlinks, remote/UNC URIs,
ambiguous file state, replacement during hashing and unavailable storage yield
a safe cache bypass for legacy sources. Path, mtime and inode never enter the
durable key. Identical bytes at different paths/projects can therefore reuse a
result. `SourceAsset.checksum` remains legacy provenance and is not cache
identity.

When `SourceAsset.technicalDescriptor` exists, the freshly verified content
must equal its adopted SHA-256 and size regardless of `prefer`, `refresh`,
`bypass` or cache availability. A mismatch or unavailable identity capability
fails closed before engine execution or canonical mutation; bypass disables
cache use, not canonical source integrity. A legacy source without a descriptor
may still use a strong current content proof without creating or changing a
descriptor. Identity failure for that legacy source may bypass only the cache
optimization and preserve the existing engine path.

For a cacheable fresh execution—and for any expensive execution against a
descriptor-bearing source—the same strong identity is recomputed after the
engine completes and before cache write or canonical promotion. Execution
identity is also described again when cacheable. Portable SHA-256/size equality
and continuity of the non-persisted operational stamp are both required across
the expensive execution: URI, canonical path, device, inode, byte size,
nanosecond mtime and nanosecond ctime. This anti-ABA condition closes reproduced
A→B→A replacement without adding a third full hash, but is not cryptographic
identity and does not claim protection from a privileged actor capable of
restoring every kernel-controlled field. Any source or exact-execution change
fails closed as an application conflict with no cache write and no Project IR
mutation. A cache hit performs one full current content proof before lookup and
a cheap operational stamp recheck immediately before promotion. Fresh
cacheable or descriptor-bearing execution performs full source proof before and
after engine execution. The cache never persists URI or operational metadata in
its portable content identity.

Caching is additive. Engines may implement provider-neutral execution identity
provider interfaces. If exact identity cannot be proven, the application
bypasses the cache and executes the existing engine normally; it never creates
a weak key or invents a model revision/digest.

### Transcription key V1

The closed transcription key contains:

- actual source SHA-256 and byte length;
- engine ID, version and API version;
- worker protocol version;
- exact model ID, result model ID, resolved revision and runtime-artifact
  manifest digest;
- requested language (`auto`, `pt`, `en`) and auto-detection policy version;
- word-timestamp setting;
- device policy/effective device and compute type;
- transcription task;
- result-normalization version;
- reviewed runtime/decode pipeline version.

The FasterWhisper adapter and Desktop presence gate share one closed local-model
selection helper tied to the pinned FasterWhisper 1.2.1 alias map. `tiny`,
`base`, `small`, `medium` and `large-v3` resolve to their exact Systran
repositories, while `turbo` resolves to
`mobiuslabsgmbh/faster-whisper-large-v3-turbo`; future FasterWhisper pin
changes require explicit map review. When the model cache root itself satisfies
the worker's closed direct CTranslate2 file predicate, that root has precedence
and is cacheable only when trusted host configuration supplies an exact
revision. Otherwise only the root-level Hugging Face cache repository for the
mapped identity is eligible. It must have a valid `refs/main` whose exact
revision names a complete snapshot. `hub/`, orphan snapshots and synthetic
repository names are not executable candidates for this worker contract and
cannot satisfy Desktop presence. Unprovable selection safely bypasses cache. A
profile that permits model download also bypasses cache identity because local
bytes do not prove which model execution may resolve. The model digest is a
SHA-256 over a canonical sorted manifest of every selected runtime artifact's
relative path, byte length and SHA-256. A strong,
cheap in-process change detector uses canonical logical/resolved identity plus
`dev`, `ino`, byte size, nanosecond mtime and nanosecond ctime to decide whether
that manifest must be rehashed. Filesystems that cannot prove unchanged state
must rehash. This metadata never enters the durable key or replaces the
cryptographic identity. Canonical manifest ordering uses deterministic
code-unit ordering rather than locale collation. Automatic device policy and
runtime-default compute profiles bypass caching because they do not prove an
effective execution identity; fixed profiles such as the desktop default
`cpu` + `int8` remain cacheable. The reviewed pipeline fingerprint includes the
pinned FasterWhisper, CTranslate2 and PyAV/decode versions plus CEVRA result
normalization. Drift tests bind it to the dependency audit.

### Alignment key V1

The closed alignment key contains:

- actual source SHA-256 and byte length;
- exact consumed `inputTranscriptDigest` and language;
- alignment engine ID/version/API and worker protocol version;
- pinned model ID/revision/principal-weight digest and device;
- pipeline/config, 16 kHz, maximum-window, maximum-token, wildcard and result
  validation versions;
- Media Engine ID/version/API;
- exact `extract-audio` + PCM preparation profile.

A hit still requires the current canonical transcript digest, source/project
state and current result validation to pass. It bypasses Media Runtime PCM
extraction and alignment engine execution, but never the stale digest guard or
canonical promotion path.

Alignment execution identity and installed-model integrity are intentionally
separate. The adapter describes the existing cache-key identity fields from
immutable CEVRA pins and constants—engine, protocol, model
ID/revision/principal-weight digest and algorithm versions—without reading the
local model directory. A valid cache hit therefore hashes zero model bytes and
remains usable when that model is not installed or is corrupt, because no local
model code or weight is executed. A fresh miss still fails closed unless the
installed prepared model verifies.

Actual alignment execution calls a process-local pinned-model attestor before
and after the worker. The first execution performs the existing exact
allow-list and per-file SHA-256 verification. Reuse is allowed only while a
cheap exact-state detector remains unchanged: logical path, canonical resolved
identity, device/inode, byte size, nanosecond mtime and nanosecond ctime for the
directory and every expected file, bound to the complete expected pin,
inventory and hashes. Every check still enumerates the exact directory and
rejects missing/unexpected files, directories and symlinks. A detector change,
atomic replacement or same-size mutation forces another complete hash pass;
state mutation during that pass fails closed. Filesystems that cannot provide
all strong detector fields receive no memoized attestation and perform full
verification every time. Attestation exists only in the current process,
survives neither restart nor pin change, and is also used by capability checks.

## Envelope, storage and corruption

The closed JSON envelope uses format `cevra-transcript-cache`, format version 1,
entry kind, exact key, SHA-256 of canonical key JSON, normalized payload,
SHA-256 of canonical payload JSON, and original producer execution ID/time.
Canonical JSON recursively sorts object keys and rejects undefined, non-finite,
negative-zero, cyclic and non-plain values. Filenames contain only the opaque
key digest under kind/two-hex-prefix directories.

Reads are bounded before allocation and reject symlinks, unknown envelope
fields, wrong keys/digests/kinds, malformed JSON and invalid application
results. Invalid derived data becomes a miss, is removed best-effort and causes
normal fresh execution. It is never a project/persistence failure.

Writes create a private same-directory temporary file, write/sync/close it and
atomically rename it. Orphan temporaries are not valid entries; recognized
stale temporaries are removed after a bounded age. Concurrent same-key writers
may race, but every winner is a complete independently validated envelope.

The default per-entry limit is 32 MiB and global budget is 256 MiB. Over-limit
results remain valid but are not cached. Before a write, recognized entries are
pruned by an atime/mtime least-recently-used approximation. The canonical root,
kind directory, two-hex prefix and regular entry are independently revalidated
before enumeration and again before destructive eviction. Intermediate
symlinks/junctions and canonical paths outside the root are skipped;
unexpected directories and foreign files are never followed or removed.
Eviction/storage failure skips the write and cannot block canonical promotion.

## Privacy and desktop trust boundary

Cached transcript text is sensitive local data. Rust derives a fixed
application-owned cache location from Tauri's trusted app-cache directory and
passes it privately to the Node Desktop Host as
`CEVRA_TRANSCRIPT_CACHE_ROOT`. React cannot provide or observe the path. The
cache root/files use restrictive current-user modes where supported. There is
no cache network access, telemetry, upload, localhost service, WebView
filesystem permission, new frontend command or source pathname in an entry.
At-rest encryption is deferred; users may delete cache data safely without
affecting projects.

Cache corruption, absence, deletion, model-identity failure, write failure and
eviction failure default to bypass/miss. Source hashing failure also bypasses
cache for a legacy source. It fails closed for a descriptor-bearing source,
because adopted content equivalence is mandatory independently of caching.
Cancellation prevents promotion and is propagated through bounded
hashing/cache work without weakening existing worker termination/reaping.

## Consequences and deferred work

Hits avoid the expensive engine path, but an application-level hit still pays
for strong source hashing, immutable execution identity, filesystem lookup and
current application validation. Raw cache-file lookup latency is therefore not
the complete hit latency. Source hashing remains proportional in time but not
memory to source size. An alignment hit reads/hashes zero local model bytes;
fresh execution pays one complete model verification per unchanged process
state and cheap exact-state checks immediately before and after the worker.
Legacy bypass/no-cache execution adds zero source hashes; cache HIT uses one
full source hash plus a cheap operational check; cache MISS/refresh uses two
full source hashes. Descriptor-bearing HIT uses the same one-plus-check pattern,
while descriptor-bearing fresh execution—including bypass/no-cache—uses two
full hashes around the engine.
This avoids repeated 377 MiB/1.26 GiB weight hashing without weakening the
closed allow-list or cryptographic proof. The cache is cross-project reusable
and bounded, yet remains strictly subordinate to current application
validation and canonical state.

The first provable Transcription execution identity in a process may hash the
complete selected local model artifact manifest; for large models this can mean
gigabytes of reads. Subsequent descriptions reuse a process-local strong
detector only while model filesystem state is unchanged. Reducing that initial
cost requires an equally strong immutable package/model identity and may not
weaken exact executed-model proof merely to improve startup latency.

Alignment Cache V1 Application/engine behavior is implemented and tested, but
`AlignmentApplicationService` is not yet exposed through the production
Desktop user workflow.

Cache format evolution uses version invalidation: an old key/envelope becomes a
miss and may later be evicted. It requires no Project IR or Project Store
migration. No Project IR schema/command, Media Runtime operation, cache UI,
model manager, editorial analysis, diarization, cloud cache or synchronization
is part of V1.

The pre-reconciliation development cache used a different source-identity
shape. Transcript Cache V1 was never released, so those disposable entries are
intentionally invalidated rather than migrated. Current ProjectHistory V2,
compact transcript blobs, undo/redo and Desktop checkpoint/reopen remain the
canonical persistence path; cache deletion or corruption cannot affect them.

## Implementation closure

Feature PR #24 merged approved head
`005f5e87cf47c9a717cefd374b3dc43de2984466` by normal merge commit
`86c1f88d19f04c1fb919eafed0b9409e2fe726eb` on 2026-09-26. Post-merge main
CI `36245088430` passed all five jobs and managed Audio Sequence Exact Runtime
`36245088427` passed on the same merge SHA. Independent review concluded
**APPROVE TO UNDRAFT WITH NON-BLOCKING NOTES** with no remaining BLOCKER, HIGH,
MEDIUM or LOW finding.

The closed V1 guarantees a derived, disposable and noncanonical cache; shared
MR-V01 source identity with no duplicate source hasher; mandatory descriptor
integrity and process-local source anti-ABA continuity; exact executed-model
identity including Mobius `turbo`; one local-model selector shared by execution
identity and Desktop presence; direct-root precedence; root-level Hugging Face
resolution through `refs/main`; untrusted HIT payload validation; typed
Transcription policies; Alignment HIT avoidance of PCM extraction, worker
execution and model hashing; and bounded integrity-checked private storage.
Project IR, ProjectHistory and Project Store remain authoritative and unchanged.

Alignment cache behavior is implemented and tested at Application/engine level,
not exposed as a production Desktop user workflow. Encryption at rest, cache
UI/configuration, cloud/sync, permanent retention, first-fingerprint
optimization, Model Manager work, bounded O(n) eviction enumeration and cleanup
of irrecoverable development envelopes remain outside this closed V1.
