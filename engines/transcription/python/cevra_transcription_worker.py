"""Closed one-request worker for the CEVRA faster-whisper engine."""

from __future__ import annotations

import json
import math
import os
import sys
import threading
from typing import Any, Mapping

PROTOCOL_VERSION = 1
PINNED_FASTER_WHISPER_VERSION = "1.2.1"
ALLOWED_MODELS = {"tiny", "base", "small", "medium", "large-v3", "turbo"}
ALLOWED_LANGUAGES = {None, "pt", "en"}
ALLOWED_DEVICES = {"auto", "cpu", "cuda"}
ALLOWED_COMPUTE_TYPES = {"default", "int8", "int8_float16", "float16", "float32"}
TRANSCRIBE_FIELDS = {
    "protocolVersion",
    "operation",
    "jobId",
    "inputPath",
    "language",
    "wordTimestamps",
    "modelId",
    "modelCacheDir",
    "allowModelDownload",
    "device",
    "computeType",
}


class WorkerError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def process_message(message: object) -> dict[str, object]:
    try:
        if os.environ.get("CEVRA_TRANSCRIPTION_MANAGED") == "1" and sys.version_info[:2] != (3, 12):
            raise WorkerError("RUNTIME_UNAVAILABLE", "Managed transcription requires the pinned CPython 3.12 runtime.")
        request = _object(message, "request")
        if request.get("protocolVersion") != PROTOCOL_VERSION:
            raise WorkerError("INVALID_REQUEST", "Unsupported transcription protocol version.")
        operation = request.get("operation")
        if operation == "health":
            if set(request) != {"protocolVersion", "operation"}:
                raise WorkerError("INVALID_REQUEST", "Unexpected health request fields.")
            return {"ok": True, "result": _health()}
        if operation != "transcribe":
            raise WorkerError("INVALID_REQUEST", "Unsupported transcription operation.")
        return {"ok": True, "result": _transcribe(_validate_transcribe(request))}
    except WorkerError as error:
        return {"ok": False, "error": {"code": error.code, "message": str(error)}}
    except Exception as error:  # The stable envelope hides tracebacks from the product surface.
        return {"ok": False, "error": {"code": "TRANSCRIPTION_FAILED", "message": str(error)}}


def _validate_initial_message(message: object) -> None:
    """Validate the one request before arming parent-pipe containment."""
    request = _object(message, "request")
    if request.get("protocolVersion") != PROTOCOL_VERSION:
        raise WorkerError("INVALID_REQUEST", "Unsupported transcription protocol version.")
    operation = request.get("operation")
    if operation == "health":
        if set(request) != {"protocolVersion", "operation"}:
            raise WorkerError("INVALID_REQUEST", "Unexpected health request fields.")
        return
    if operation != "transcribe":
        raise WorkerError("INVALID_REQUEST", "Unsupported transcription operation.")
    _validate_transcribe(request)


def _start_parent_pipe_watchdog() -> None:
    """Watch raw fd 0 as a parent-liveness channel and exit immediately on EOF.

    The parent writes exactly one request but deliberately keeps stdin open until
    this process exits. EOF while the worker is active therefore means that the
    supervising Node process is gone or has violated the worker lifecycle contract.
    """
    def watch_parent_pipe() -> None:
        try:
            while os.read(0, 1):
                pass
        except (OSError, ValueError):
            pass
        os._exit(70)

    threading.Thread(target=watch_parent_pipe, name="cevra-parent-pipe-watchdog", daemon=True).start()


def _health() -> dict[str, object]:
    faster_whisper = _load_faster_whisper()
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "status": "ready",
        "fasterWhisperVersion": str(getattr(faster_whisper, "__version__", "unknown")),
    }


def _transcribe(request: Mapping[str, object]) -> dict[str, object]:
    faster_whisper = _load_faster_whisper()
    model_id = str(request["modelId"])
    model_cache_dir = str(request["modelCacheDir"])
    model_source = model_id
    if not bool(request["allowModelDownload"]) and _is_prepopulated_model(model_cache_dir):
        # Passing the verified local directory avoids a Hugging Face lookup entirely.
        model_source = model_cache_dir
    try:
        model = faster_whisper.WhisperModel(
            model_source,
            device=str(request["device"]),
            compute_type=str(request["computeType"]),
            download_root=model_cache_dir,
            local_files_only=not bool(request["allowModelDownload"]),
        )
    except Exception as error:
        raise WorkerError("MODEL_UNAVAILABLE", "The configured faster-whisper model is unavailable.") from error

    options: dict[str, object] = {"word_timestamps": bool(request["wordTimestamps"]), "task": "transcribe"}
    language = request.get("language")
    if language is not None:
        options["language"] = language
    try:
        segments_iterable, info = model.transcribe(str(request["inputPath"]), **options)
        segments = [_segment_payload(segment, bool(request["wordTimestamps"])) for segment in segments_iterable]
    except WorkerError:
        raise
    except Exception as error:
        raise WorkerError("TRANSCRIPTION_FAILED", "Local transcription failed.") from error

    result: dict[str, object] = {
        "protocolVersion": PROTOCOL_VERSION,
        "modelId": model_id,
        "segments": segments,
    }
    detected_language = getattr(info, "language", None)
    if isinstance(detected_language, str) and detected_language:
        result["detectedLanguage"] = detected_language
    duration = getattr(info, "duration", None)
    if duration is not None:
        result["durationSeconds"] = _finite_non_negative(duration, "duration")
    return result


def _is_prepopulated_model(model_cache_dir: str) -> bool:
    required = ("config.json", "model.bin", "tokenizer.json")
    vocabulary = ("vocabulary.txt", "vocabulary.json")
    return all(os.path.isfile(os.path.join(model_cache_dir, name)) for name in required) and any(
        os.path.isfile(os.path.join(model_cache_dir, name)) for name in vocabulary
    )


def _segment_payload(segment: object, include_words: bool) -> dict[str, object]:
    result: dict[str, object] = {
        "startSeconds": _finite_non_negative(getattr(segment, "start", None), "segment start"),
        "endSeconds": _finite_non_negative(getattr(segment, "end", None), "segment end"),
        "text": _string(getattr(segment, "text", None), "segment text"),
    }
    if include_words:
        raw_words = getattr(segment, "words", None)
        if raw_words is None:
            raise WorkerError("TRANSCRIPTION_FAILED", "faster-whisper omitted requested word timestamps.")
        result["words"] = [_word_payload(word) for word in raw_words]
    return result


def _word_payload(word: object) -> dict[str, object]:
    result: dict[str, object] = {
        "startSeconds": _finite_non_negative(getattr(word, "start", None), "word start"),
        "endSeconds": _finite_non_negative(getattr(word, "end", None), "word end"),
        "text": _string(getattr(word, "word", None), "word text"),
    }
    probability = getattr(word, "probability", None)
    if probability is not None:
        value = _finite_non_negative(probability, "word confidence")
        if value > 1:
            raise WorkerError("TRANSCRIPTION_FAILED", "Word confidence must be between 0 and 1.")
        result["confidence"] = value
    return result


def _validate_transcribe(request: Mapping[str, object]) -> Mapping[str, object]:
    if set(request) - TRANSCRIBE_FIELDS:
        raise WorkerError("INVALID_REQUEST", "Unexpected transcription request fields.")
    required = TRANSCRIBE_FIELDS - {"language"}
    if not required.issubset(request):
        raise WorkerError("INVALID_REQUEST", "Required transcription request fields are missing.")
    if not isinstance(request["jobId"], str) or not request["jobId"].strip():
        raise WorkerError("INVALID_REQUEST", "jobId is required.")
    path = request["inputPath"]
    if not isinstance(path, str) or not path or len(path) > 4096 or path.startswith("-") or not os.path.isabs(path):
        raise WorkerError("INVALID_REQUEST", "inputPath must be an absolute local path.")
    if "://" in path or "\x00" in path:
        raise WorkerError("INVALID_REQUEST", "Remote or malformed input paths are not allowed.")
    language = request.get("language")
    if language not in ALLOWED_LANGUAGES:
        raise WorkerError("UNSUPPORTED_LANGUAGE", "Supported languages are auto, pt, and en.")
    if type(request["wordTimestamps"]) is not bool or type(request["allowModelDownload"]) is not bool:
        raise WorkerError("INVALID_REQUEST", "Timestamp and download flags must be booleans.")
    if request["modelId"] not in ALLOWED_MODELS:
        raise WorkerError("INVALID_REQUEST", "The model is not allow-listed.")
    cache = request["modelCacheDir"]
    if not isinstance(cache, str) or not os.path.isabs(cache) or "://" in cache or "\x00" in cache:
        raise WorkerError("INVALID_REQUEST", "modelCacheDir must be an absolute local path.")
    if request["device"] not in ALLOWED_DEVICES or request["computeType"] not in ALLOWED_COMPUTE_TYPES:
        raise WorkerError("INVALID_REQUEST", "The device or compute type is not allow-listed.")
    return request


def _load_faster_whisper() -> Any:
    try:
        import faster_whisper
    except Exception as error:
        raise WorkerError("RUNTIME_UNAVAILABLE", "The isolated faster-whisper runtime is unavailable.") from error
    if getattr(faster_whisper, "__version__", None) != PINNED_FASTER_WHISPER_VERSION:
        raise WorkerError("RUNTIME_UNAVAILABLE", "The isolated faster-whisper version does not match the CEVRA pin.")
    return faster_whisper


def _finite_non_negative(value: object, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise WorkerError("TRANSCRIPTION_FAILED", f"{name} must be numeric.")
    number = float(value)
    if not math.isfinite(number) or number < 0:
        raise WorkerError("TRANSCRIPTION_FAILED", f"{name} must be finite and non-negative.")
    return number


def _string(value: object, name: str) -> str:
    if not isinstance(value, str):
        raise WorkerError("TRANSCRIPTION_FAILED", f"{name} must be a string.")
    return value


def _object(value: object, name: str) -> Mapping[str, object]:
    if not isinstance(value, dict):
        raise WorkerError("INVALID_REQUEST", f"{name} must be an object.")
    return value


def main() -> int:
    line = sys.stdin.readline()
    if not line:
        response = {"ok": False, "error": {"code": "INVALID_REQUEST", "message": "A single typed request is required."}}
    else:
        try:
            message = json.loads(line)
            _validate_initial_message(message)
            _start_parent_pipe_watchdog()
            response = process_message(message)
        except json.JSONDecodeError:
            response = {"ok": False, "error": {"code": "INVALID_REQUEST", "message": "Request JSON is invalid."}}
        except WorkerError as error:
            response = {"ok": False, "error": {"code": error.code, "message": str(error)}}
    sys.stdout.write(json.dumps(response, ensure_ascii=False, allow_nan=False) + "\n")
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
