# ADR 0017 — Local Forced Alignment Runtime and Application V1

**Status:** Accepted by this implementation
**Date:** 2026-09-15

## Context

ADR 0014 already defines provider-neutral `wordTiming: "aligned"`, consuming
provenance, transcript digests and stale promotion. The next dependency-correct
slice must improve timing for an existing canonical source transcript without
turning a model result, temporary WAV or cache into another source of truth.
CEVRA already owns a sealed Media Runtime and a separate faster-whisper
Transcription Engine; installing the complete WhisperX application would
duplicate both transcription and diarization dependencies.

## Decision

Add the provider-neutral `AlignmentEngineAdapter` engine kind and an
`AlignmentApplicationService`. The adapter returns an untrusted timing
candidate and never receives `ProjectHistory`. The application captures the
current `inputTranscriptDigest`, authorizes the source/transcript/language,
prepares disposable PCM through the existing typed Media Runtime
`extract-audio` operation, invokes the adapter, independently validates complete
identity/text/mapping/timing preservation, re-reads canonical state and promotes
only through guarded `transcript.set` and `ProjectHistory`.

A successful candidate preserves word and segment IDs, text/order/mapping,
language, speaker assignment/state, source checksum and upstream provenance. It
sets `wordTiming: "aligned"`, adds an alignment stage with exact execution,
engine/model identity and consumed digest, and uses existing canonical digest
machinery. Downstream speaker/manual provenance remains ordered and is rebased
to the consumed canonical representation only after its unchanged semantic
annotations are revalidated. Failure, cancellation, invalid output or any
project/revision/source/transcript change produces no promotion or journal entry.
Already-aligned and zero-word transcripts fail deterministically rather than
creating meaningless history.

## Local runtime and upstream provenance

The private alignment runtime is isolated from both the sealed Media Runtime
and the stable transcription dependency environment. It may share the managed
CPython 3.12 distribution, but owns a separate virtual environment. Direct pins
are PyTorch 2.8.0, Transformers 4.57.6 and NumPy 2.2.6. Normal execution sets
Hugging Face and Transformers offline modes and accepts only fixed local model
paths selected by trusted configuration. Model download is always disabled.

CEVRA does not install or claim the full WhisperX package. The closed Python
worker adapts only the CTC trellis, backtracking and word-boundary behavior from
the stable BSD-2-Clause WhisperX v3.8.6 baseline, exact commit
`3ccc17b8de34f305300f8a3fd3c9f76ba820c0d0`. The retained scope corresponds to
`get_trellis`, `backtrack`, repeat/token grouping and word-boundary projection
from `whisperx/alignment.py`; CEVRA rewrites request validation, audio loading,
runtime isolation, model verification, protocol, lifecycle and Project IR
promotion. Required attribution is recorded in `NOTICE` and
`THIRD_PARTY_LICENSES.md`.

V1 pins these Apache-2.0 16 kHz CTC model snapshots and file digests:

- PT: `jonatasgrosman/wav2vec2-large-xlsr-53-portuguese` revision
  `634ac655299bcdc46c83bc01da9bab52d2987e4f`;
- EN: `facebook/wav2vec2-base-960h` revision
  `22aad52d435eb6dbaf354bdad9b0da84ce7d6156`.

Weights are not stored in Git and are not bundled by this slice. Production
capability remains unavailable until a future model/runtime packaging manager
installs every inventoried artifact and its SHA-256 verifies.

## Protocol and lifecycle

The one-request JSON protocol is versioned, closed, bounded to 32 MiB and uses
stdin/stdout with protocol-only stdout. No shell, arbitrary module/path, network
listener, HTTP or WebSocket surface exists. TypeScript validates the worker
candidate again, including exact model identity, UTF-8/finite canonical values,
complete words, unique IDs, mappings and source bounds. One active ML job is
allowed; concurrent jobs return a stable busy error.

Cancellation terminates/reaps the worker and always releases the disposable WAV
workspace. The worker uses stdin as the parent-liveness channel and exits when
its Node parent disappears. The original media is immutable; 16 kHz mono
normalization occurs inside the alignment worker after Media Runtime extraction.

## Scope and deferred work

This ADR adds no Tauri command, WebView permission or UI. It adds no transcript
cache, diarization, speaker registry, model download, cloud alignment, Project
IR schema migration or Media Runtime operation. Transcript Cache V1 remains the
next separate slice. Runtime/model installer assembly and real desktop product
invocation are explicit later gates.
