# CEVRA Local Transcription Engine

This workspace implements the first executable local-transcription slice behind the existing `TranscriptionEngineAdapter`.

## Implemented V1

- faster-whisper `1.2.1` local transcription through a closed, versioned one-request worker protocol.
- `auto`, `pt`, and `en` language modes. `auto` propagates the detected language; explicit modes are passed unchanged to faster-whisper.
- Optional faster-whisper native word timestamps, reported as `wordTiming: "model"`. They are not WhisperX forced alignment.
- Deterministic segment and word IDs, strict timestamp/result validation, and fail-closed malformed-result handling.
- Explicit CEVRA-managed Python configuration in release mode, with no PATH or system-Python fallback.
- A transcription-only virtual environment backed by the private CEVRA CPython distribution. Its dependencies do not modify the Media Runtime environment.
- An explicit CEVRA model cache. Model downloads are disabled by default and may be enabled only by trusted profile configuration; user media is never uploaded.
- AbortSignal cancellation that terminates and reaps the per-job worker process.
- One active transcription job per adapter. A concurrent job fails deterministically with `TRANSCRIPTION_BUSY`.
- Stable technical error codes for runtime, worker, model, request, language, result, cancellation, and busy failures.

The default model is `base`, selected as a temporary V1 balance of download size, memory, first-run time, and multilingual quality. This does not claim final EDVID quality parity. The model ID is an allow-listed adapter/profile setting and is always returned in the result.

## Managed Python and dependency isolation

The preferred layout shares the immutable interpreter distribution, not site-packages:

```text
CEVRA private runtime root
├── python/                         private CPython distribution
├── environments/transcription/    transcription-only virtual environment
└── media/                          independently protected Media Runtime V1 bundle
```

Managed mode requires an explicit virtual-environment interpreter below the transcription environment root. That interpreter may resolve back to the private CPython distribution. The adapter rejects missing or escaping paths and starts Python with `-I -B`, a sanitized environment, user-site disabled, and an empty PATH. It never searches for `python` or `python3`.

Developer mode also requires an explicit interpreter path. It exists for tests and local setup only and never becomes a release fallback.

`runtime/requirements.lock.txt` pins the isolated dependency set. Release assembly must build PyAV from source against a separately inventoried LGPL-only FFmpeg library set. The upstream PyPI PyAV wheels bundle GPL codec libraries such as x264/x265 and are therefore not approved CEVRA release inputs. This constraint does not modify or reuse the sealed Media Runtime environment.

## Model and network behavior

After the managed runtime and selected model assets are present, transcription works offline. If trusted configuration enables a first-use model download, only model assets are fetched into the explicit CEVRA cache. The media path is opened locally by PyAV and is never uploaded to Hugging Face or another provider.

Normal CI uses fake runners and a fake Python faster-whisper module. It does not download a model or execute heavy ML inference. A real smoke test remains opt-in for a prepared managed environment and is not part of this slice's default CI.

## Not implemented yet

- WhisperX.
- Forced alignment (`EDV-TRN-002`).
- Diarization.
- Transcript-result cache (`EDV-TRN-006`).
- Project IR transcript persistence or multi-source transcript semantics.
- Batch transcription.
- UI or a complete model manager.
- Production runtime installer/updater and final per-platform runtime manifests.
- Any paid or remote transcription provider.

The engine produces a validated `TranscriptionResult` only. It does not persist transcript JSON or create a second source of truth.
