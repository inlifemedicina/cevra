# CEVRA Local Transcription Engine

This workspace implements the first executable local-transcription slice behind the existing `TranscriptionEngineAdapter`.

## Implemented V1

- faster-whisper `1.2.1` local transcription through a closed, versioned one-request worker protocol.
- `auto`, `pt`, and `en` language modes. `auto` propagates the detected language; explicit modes are passed unchanged to faster-whisper.
- Optional faster-whisper native word timestamps, reported as `wordTiming: "model"`. They are not WhisperX forced alignment.
- Deterministic segment and word IDs, strict timestamp/result validation, and fail-closed malformed-result handling.
- Deterministic millisecond normalization for sub-millisecond/zero-duration model intervals. Word-boundary drift is clamped only within the backend's 20 ms timestamp-token precision; larger divergence fails closed.
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

Managed mode requires an explicit virtual-environment interpreter below the transcription environment root. The adapter validates `pyvenv.cfg`, requires system site-packages to be disabled, and requires its `home` plus any `executable`/`base-executable` provenance fields to resolve inside the private CPython root. This proves the authorized base for symlink-style and copy-style venvs instead of trusting the copied environment executable. Missing, malformed or contradictory provenance fails closed.

The private Python root and transcription environment are always protected from model-cache writes. The application compositor can add independent protected roots, primarily the Media Runtime bundle, through `protectedRoots`. Cache validation rejects equality, descendants, ancestors and paths whose existing symlink ancestry resolves into a protected root, including when the final cache directory does not exist.

Workers start with `-I -B`, a sanitized environment, user-site disabled, and an empty PATH. When model download is disabled, `HF_HUB_OFFLINE=1` is also set. The runner never searches for `python` or `python3`. Health/capability checks use ephemeral processes and cannot replace the tracked PID of an active transcription job.

Developer mode also requires an explicit interpreter path. It exists for tests and local setup only and never becomes a release fallback.

`runtime/requirements.lock.txt` pins the isolated dependency set, but it is not yet a cryptographically complete artifact lock. Release assembly must add `--require-hashes` or an equivalent verified-artifact mechanism for every dependency.

PyAV 18.1.0 release assembly must use a source build against its own inventoried, compatible FFmpeg 8.x library set configured LGPL-only. The upstream PyPI PyAV wheels bundle GPL codec libraries such as x264/x265 and are not approved release inputs. The transcription FFmpeg libraries remain separate from the sealed FFmpeg 9.0.1 Media Runtime and are not assembled by this slice.

## Model and network behavior

After the managed runtime and selected model assets are present, transcription works offline. If trusted configuration enables a first-use model download, only model assets are fetched into the explicit CEVRA cache. The media path is opened locally by PyAV and is never uploaded to Hugging Face or another provider.

Normal CI uses fake runners and a fake Python faster-whisper module. It does not download a model or execute heavy ML inference.

The real smoke test is opt-in and requires an explicit isolated interpreter, environment, local speech fixture and pre-populated `tiny` model directory. Populate the model directory in a separate trusted step, then run transcription offline:

```bash
CEVRA_TRANSCRIPTION_SMOKE_MODEL_CACHE=/absolute/cache \
  /absolute/transcription/python -c \
  'from faster_whisper.utils import download_model; import os; download_model("tiny", output_dir=os.environ["CEVRA_TRANSCRIPTION_SMOKE_MODEL_CACHE"], revision="d90ca5fe260221311c53c58e660288d3deb8d356")'

CEVRA_TRANSCRIPTION_SMOKE=1 \
CEVRA_TRANSCRIPTION_SMOKE_PYTHON=/absolute/transcription/python \
CEVRA_TRANSCRIPTION_SMOKE_ENV_ROOT=/absolute/transcription/environment \
CEVRA_TRANSCRIPTION_SMOKE_PRIVATE_PYTHON_ROOT=/absolute/private/cevra-python \
CEVRA_TRANSCRIPTION_SMOKE_AUDIO=/absolute/local-speech.flac \
CEVRA_TRANSCRIPTION_SMOKE_MODEL_CACHE=/absolute/cache \
npm run test:smoke -w @cevra/transcription-faster-whisper
```

Providing `CEVRA_TRANSCRIPTION_SMOKE_PRIVATE_PYTHON_ROOT` exercises managed-mode provenance; omitting it is allowed only for an explicit developer smoke. Optional `CEVRA_TRANSCRIPTION_SMOKE_PROTECTED_ROOTS` entries use the platform path delimiter.

The smoke preparation pins `Systran/faster-whisper-tiny` to revision `d90ca5fe260221311c53c58e660288d3deb8d356`. The model remains an external scratch/cache input and is not committed.

The tested adapter call always sets `allowModelDownload: false`; the worker receives `local_files_only=True` and `HF_HUB_OFFLINE=1`. The harness validates native word timestamps, detected language, duration, IDs, temporal invariants and real process cancellation/reaping.

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
