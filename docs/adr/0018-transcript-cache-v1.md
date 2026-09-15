# ADR 0018 — Transcript Cache V1

**Status:** Proposed by this implementation
**Date:** 2026-09-15

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

Before cache lookup, CEVRA streams the current regular local source file into
SHA-256 using bounded 1 MiB chunks. The identity is
`sha256:<64-lowercase-hex>` plus exact byte length. Symlinks, remote/UNC URIs,
ambiguous file state, replacement during hashing and unavailable storage yield
a safe cache bypass. Path and mtime never enter the durable key. Identical bytes
at different paths/projects can therefore reuse a result.

For a cacheable fresh execution the same strong identity is recomputed after
the engine completes and before cache write or canonical promotion. Execution
identity is also described again. Any proven source or exact-execution change
fails closed as an application conflict with no cache write and no Project IR
mutation. A cache hit needs one fresh identity immediately before lookup because
there is no intervening long ML execution.

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

The FasterWhisper adapter resolves a trusted Hugging Face snapshot revision from
the local refs/snapshot layout. A prepopulated direct CTranslate2 directory is
cacheable only when trusted host configuration explicitly supplies an exact
revision. Its model digest is a SHA-256 over a canonical sorted manifest of
every runtime artifact's relative path, byte length and SHA-256. Cheap
path/size/mtime metadata only invalidates an in-process memo; it never replaces
the cryptographic identity. The reviewed pipeline fingerprint includes the
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
pruned by an atime/mtime least-recently-used approximation. Only recognized
regular cache files are candidates; symlinks, unexpected directories and
foreign files are never followed or removed. Eviction/storage failure skips the
write and cannot block canonical promotion.

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

Cache corruption, absence, deletion, hashing failure, model-identity failure,
write failure and eviction failure default to bypass/miss. They do not make
transcription or alignment unavailable. Cancellation prevents promotion and is
propagated through bounded hashing/cache work without weakening existing worker
termination/reaping.

## Consequences and deferred work

Hits avoid the expensive engine path while miss overhead is one pre-execution
source hash plus a post-execution stability hash. Hashing remains proportional
in time but not memory to source size. The cache is cross-project reusable and
bounded, yet remains strictly subordinate to current application validation and
canonical state.

Cache format evolution uses version invalidation: an old key/envelope becomes a
miss and may later be evicted. It requires no Project IR or Project Store
migration. No Project IR schema/command, Media Runtime operation, cache UI,
model manager, editorial analysis, diarization, cloud cache or synchronization
is part of V1.
