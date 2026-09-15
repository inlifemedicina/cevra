# CEVRA Local Forced Alignment V1

Provider-neutral CTC forced alignment behind `AlignmentEngineAdapter`.

The engine consumes a trusted local PCM WAV plus an existing semantic
transcript and returns an untrusted complete timing candidate. It never mutates
Project IR. `AlignmentApplicationService` owns authorization, stale-digest
checking and promotion through `transcript.set` / `ProjectHistory`.

Runtime rules:

- isolated CPython 3.12 environment; never Media Runtime or transcription env;
- exact dependencies in `runtime/requirements.lock.txt`;
- exact PT/EN model inventory in `runtime/models.json`;
- model download disabled; both Hugging Face offline flags are forced;
- one worker request per process, one active adapter job, bounded output;
- stdin remains open as a parent-liveness channel until worker termination;
- no network listener, arbitrary module/script/model selection, or UI path.

Model weights are intentionally absent from Git. Until a future audited
runtime/model manager assembles and verifies all pinned platform artifacts,
production capability must report unavailable. A developer may prepare the
exact model revisions outside the repository and point trusted host-side
configuration at that root; this does not change the no-download production
policy.

The CTC trellis/backtracking behavior is adapted from BSD-2-Clause WhisperX
v3.8.6 commit `3ccc17b8de34f305300f8a3fd3c9f76ba820c0d0` as recorded in ADR 0017,
`NOTICE`, and `THIRD_PARTY_LICENSES.md`. Full WhisperX is not installed.
