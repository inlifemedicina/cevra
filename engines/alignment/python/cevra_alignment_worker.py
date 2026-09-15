"""Closed local CTC forced-alignment worker for CEVRA.

The trellis/backtracking structure is adapted from WhisperX v3.8.6
(m-bain/whisperX commit 3ccc17b8de34f305300f8a3fd3c9f76ba820c0d0,
BSD-2-Clause). CEVRA keeps only the provider-neutral forced-alignment behavior.
"""

from __future__ import annotations

import json
import math
import os
import sys
import threading
import wave
from array import array
from typing import Any, Mapping, Sequence

PROTOCOL_VERSION = 1
ALIGNMENT_VERSION = "0.1.0"
PINNED_TORCH_VERSION = "2.8.0"
PINNED_TRANSFORMERS_VERSION = "4.57.6"
MAX_REQUEST_CHARACTERS = 32 * 1024 * 1024
ALIGN_FIELDS = {
    "protocolVersion", "operation", "jobId", "inputPath", "language", "transcript",
    "modelPath", "modelId", "modelRevision", "modelDigest", "allowModelDownload", "device",
}


class WorkerError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def process_message(message: object) -> dict[str, object]:
    try:
        request = _validate_message(message)
        if request["operation"] == "health":
            _load_runtime()
            return {"ok": True, "result": {"protocolVersion": 1, "status": "ready", "alignmentVersion": ALIGNMENT_VERSION}}
        return {"ok": True, "result": _align(request)}
    except WorkerError as error:
        return {"ok": False, "error": {"code": error.code, "message": str(error)}}
    except Exception as error:
        return {"ok": False, "error": {"code": "ALIGNMENT_FAILED", "message": "Local forced alignment failed."}}


def _validate_message(message: object) -> Mapping[str, object]:
    request = _object(message, "request")
    if request.get("protocolVersion") != PROTOCOL_VERSION:
        raise WorkerError("INVALID_REQUEST", "Unsupported alignment protocol version.")
    operation = request.get("operation")
    if operation == "health":
        if set(request) != {"protocolVersion", "operation"}:
            raise WorkerError("INVALID_REQUEST", "Unexpected health request fields.")
        return request
    if operation != "align" or set(request) != ALIGN_FIELDS:
        raise WorkerError("INVALID_REQUEST", "Invalid alignment request fields.")
    for field in ("jobId", "modelId", "modelRevision", "modelDigest"):
        if not isinstance(request[field], str) or not str(request[field]).strip() or len(str(request[field])) > 512:
            raise WorkerError("INVALID_REQUEST", f"{field} must be a non-empty string.")
    for field in ("inputPath", "modelPath"):
        value = request[field]
        if not isinstance(value, str) or not value or len(value) > 4096 or not os.path.isabs(value) or "://" in value or "\x00" in value:
            raise WorkerError("INVALID_REQUEST", f"{field} must be an absolute local path.")
    if request["language"] not in {"pt", "en"}:
        raise WorkerError("UNSUPPORTED_LANGUAGE", "Supported alignment languages are pt and en.")
    if request["allowModelDownload"] is not False:
        raise WorkerError("INVALID_REQUEST", "Alignment model downloads are disabled.")
    if request["device"] not in {"cpu", "cuda"}:
        raise WorkerError("INVALID_REQUEST", "Alignment device is not allow-listed.")
    _validate_transcript(request["transcript"], str(request["language"]))
    return request


def _validate_transcript(value: object, language: str) -> None:
    transcript = _object(value, "transcript")
    if set(transcript) - {"language", "words", "segments"} or transcript.get("language") != language:
        raise WorkerError("INVALID_REQUEST", "Transcript language or fields are invalid.")
    words = transcript.get("words")
    segments = transcript.get("segments")
    if not isinstance(words, list) or not words or not isinstance(segments, list) or not segments:
        raise WorkerError("INVALID_REQUEST", "Transcript must contain words and segments.")
    word_ids: set[str] = set()
    for index, raw in enumerate(words):
        word = _object(raw, f"word {index}")
        if set(word) - {"id", "text", "startMs", "endMs", "confidence", "speakerId"}:
            raise WorkerError("INVALID_REQUEST", "Transcript word fields are invalid.")
        if not _bounded_string(word.get("id"), 256) or word["id"] in word_ids or not isinstance(word.get("text"), str):
            raise WorkerError("INVALID_REQUEST", "Transcript word identity is invalid.")
        word_ids.add(str(word["id"]))
        _time(word.get("startMs"), "word start")
        _time(word.get("endMs"), "word end")
        if "confidence" in word and (isinstance(word["confidence"], bool) or not isinstance(word["confidence"], (int, float)) or not math.isfinite(float(word["confidence"])) or not 0 <= float(word["confidence"]) <= 1):
            raise WorkerError("INVALID_REQUEST", "Transcript word confidence is invalid.")
        if "speakerId" in word and not _bounded_string(word["speakerId"], 256):
            raise WorkerError("INVALID_REQUEST", "Transcript word speaker is invalid.")
    segment_ids: set[str] = set()
    mapped: set[str] = set()
    for index, raw in enumerate(segments):
        segment = _object(raw, f"segment {index}")
        if set(segment) - {"id", "text", "startMs", "endMs", "wordIds", "speakerId"}:
            raise WorkerError("INVALID_REQUEST", "Transcript segment fields are invalid.")
        if not _bounded_string(segment.get("id"), 256) or segment["id"] in segment_ids or not isinstance(segment.get("text"), str) or not isinstance(segment.get("wordIds"), list):
            raise WorkerError("INVALID_REQUEST", "Transcript segment identity is invalid.")
        segment_ids.add(str(segment["id"]))
        _time(segment.get("startMs"), "segment start")
        _time(segment.get("endMs"), "segment end")
        for word_id in segment["wordIds"]:
            if word_id not in word_ids or word_id in mapped:
                raise WorkerError("INVALID_REQUEST", "Transcript word mapping is invalid.")
            mapped.add(str(word_id))
        if "speakerId" in segment and not _bounded_string(segment["speakerId"], 256):
            raise WorkerError("INVALID_REQUEST", "Transcript segment speaker is invalid.")
    if mapped != word_ids:
        raise WorkerError("INVALID_REQUEST", "Every transcript word must be mapped exactly once.")


def _time(value: object, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0 or value > 2**53 - 1:
        raise WorkerError("INVALID_REQUEST", f"{name} is invalid.")
    return value


def _bounded_string(value: object, maximum: int) -> bool:
    return isinstance(value, str) and bool(value) and len(value) <= maximum


def _align(request: Mapping[str, object]) -> dict[str, object]:
    torch, transformers = _load_runtime()
    model_path = str(request["modelPath"])
    if not os.path.isdir(model_path):
        raise WorkerError("MODEL_UNAVAILABLE", "The configured local alignment model is unavailable.")
    try:
        processor = transformers.AutoProcessor.from_pretrained(model_path, local_files_only=True)
        model = transformers.AutoModelForCTC.from_pretrained(model_path, local_files_only=True)
        device = str(request["device"])
        model.to(device)
        model.eval()
    except Exception as error:
        raise WorkerError("MODEL_UNAVAILABLE", "The configured local alignment model is unavailable.") from error

    samples, sample_rate = load_and_normalize_wav(str(request["inputPath"]), 16000)
    if not samples:
        raise WorkerError("ALIGNMENT_FAILED", "Alignment audio contains no samples.")
    try:
        inputs = processor(samples, sampling_rate=sample_rate, return_tensors="pt")
        input_values = inputs.input_values.to(str(request["device"]))
        with torch.inference_mode():
            emissions = model(input_values).logits[0].log_softmax(dim=-1).cpu().tolist()
        vocabulary = processor.tokenizer.get_vocab()
        blank_id = getattr(processor.tokenizer, "pad_token_id", 0)
    except Exception as error:
        raise WorkerError("ALIGNMENT_FAILED", "The local CTC model could not produce alignment emissions.") from error

    transcript = _object(request["transcript"], "transcript")
    aligned = align_transcript(transcript, emissions, vocabulary, int(blank_id), len(samples), sample_rate)
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "transcript": aligned,
        "modelId": request["modelId"],
        "modelRevision": request["modelRevision"],
        "modelDigest": request["modelDigest"],
        "durationMs": round(len(samples) * 1000 / sample_rate),
    }


def load_and_normalize_wav(path: str, target_rate: int) -> tuple[list[float], int]:
    """Read PCM WAV, downmix, and linearly resample without another media runtime."""
    try:
        with wave.open(path, "rb") as source:
            channels = source.getnchannels()
            width = source.getsampwidth()
            rate = source.getframerate()
            frames = source.readframes(source.getnframes())
    except Exception as error:
        raise WorkerError("ALIGNMENT_FAILED", "Prepared alignment audio is not a readable PCM WAV.") from error
    if channels < 1 or width not in {1, 2, 4} or rate <= 0:
        raise WorkerError("ALIGNMENT_FAILED", "Prepared alignment audio format is unsupported.")
    typecode = {1: "B", 2: "h", 4: "i"}[width]
    values = array(typecode)
    values.frombytes(frames)
    if sys.byteorder != "little" and width > 1:
        values.byteswap()
    scale = float(128 if width == 1 else (1 << (width * 8 - 1)))
    offset = 128.0 if width == 1 else 0.0
    mono = [sum((float(values[i + c]) - offset) / scale for c in range(channels)) / channels for i in range(0, len(values), channels)]
    if rate == target_rate:
        return mono, target_rate
    output_count = max(1, round(len(mono) * target_rate / rate))
    if len(mono) == 1:
        return [mono[0]] * output_count, target_rate
    ratio = rate / target_rate
    output: list[float] = []
    for index in range(output_count):
        position = min(index * ratio, len(mono) - 1)
        left = int(position)
        right = min(left + 1, len(mono) - 1)
        fraction = position - left
        output.append(mono[left] * (1.0 - fraction) + mono[right] * fraction)
    return output, target_rate


def align_transcript(transcript: Mapping[str, object], emissions: Sequence[Sequence[float]], vocabulary: Mapping[str, int], blank_id: int, sample_count: int, sample_rate: int) -> dict[str, object]:
    words = [_object(word, "word") for word in transcript["words"]]  # type: ignore[index]
    token_ids: list[int] = []
    token_word_indexes: list[int] = []
    uppercase = any(key != key.lower() for key in vocabulary if key.isalpha())
    delimiter = "|" if "|" in vocabulary else None
    for word_index, word in enumerate(words):
        text = str(word.get("text", ""))
        normalized = text.upper() if uppercase else text.lower()
        accepted = [int(vocabulary[char]) for char in normalized if char in vocabulary]
        if not accepted:
            raise WorkerError("ALIGNMENT_FAILED", f"Canonical word {word_index} has no alignable CTC tokens.")
        if token_ids and delimiter is not None:
            token_ids.append(int(vocabulary[delimiter]))
            token_word_indexes.append(-1)
        token_ids.extend(accepted)
        token_word_indexes.extend([word_index] * len(accepted))
    points = forced_align(emissions, token_ids, blank_id)
    ranges: list[list[int]] = [[] for _ in words]
    for token_index, frame_index in points:
        word_index = token_word_indexes[token_index]
        if word_index >= 0:
            ranges[word_index].append(frame_index)
    duration_seconds = sample_count / sample_rate
    frame_seconds = duration_seconds / len(emissions)
    aligned_words: list[dict[str, object]] = []
    for index, (word, frames) in enumerate(zip(words, ranges)):
        if not frames:
            raise WorkerError("ALIGNMENT_FAILED", f"Canonical word {index} was not completely aligned.")
        start_ms = max(0, round(min(frames) * frame_seconds * 1000))
        end_ms = max(start_ms + 1, round((max(frames) + 1) * frame_seconds * 1000))
        aligned_words.append({**word, "startMs": start_ms, "endMs": end_ms})
    word_by_id = {word["id"]: word for word in aligned_words}
    aligned_segments: list[dict[str, object]] = []
    for raw in transcript["segments"]:  # type: ignore[index]
        segment = _object(raw, "segment")
        segment_words = [word_by_id[word_id] for word_id in segment["wordIds"]]  # type: ignore[index]
        if not segment_words:
            raise WorkerError("ALIGNMENT_FAILED", "Every aligned segment must contain words.")
        aligned_segments.append({**segment, "startMs": min(int(word["startMs"]) for word in segment_words), "endMs": max(int(word["endMs"]) for word in segment_words)})
    return {"language": transcript["language"], "words": aligned_words, "segments": aligned_segments}


def forced_align(emissions: Sequence[Sequence[float]], tokens: Sequence[int], blank_id: int) -> list[tuple[int, int]]:
    """CTC Viterbi trellis/backtrack adapted from WhisperX 3.8.6."""
    if not emissions or not tokens or len(emissions) < len(tokens):
        raise WorkerError("ALIGNMENT_FAILED", "Audio emissions cannot cover the complete transcript.")
    negative = float("-inf")
    trellis = [[negative] * (len(tokens) + 1) for _ in range(len(emissions) + 1)]
    trellis[0][0] = 0.0
    for time in range(len(emissions)):
        trellis[time + 1][0] = trellis[time][0] + float(emissions[time][blank_id])
        upto = min(time + 1, len(tokens))
        for token_index in range(1, upto + 1):
            stayed = trellis[time][token_index] + float(emissions[time][blank_id])
            changed = trellis[time][token_index - 1] + float(emissions[time][tokens[token_index - 1]])
            trellis[time + 1][token_index] = max(stayed, changed)
    end_time = max(range(1, len(emissions) + 1), key=lambda t: trellis[t][len(tokens)])
    if not math.isfinite(trellis[end_time][len(tokens)]):
        raise WorkerError("ALIGNMENT_FAILED", "No complete CTC alignment path exists.")
    points: list[tuple[int, int]] = []
    token_index = len(tokens)
    time = end_time
    while token_index > 0 and time > 0:
        stayed = trellis[time - 1][token_index] + float(emissions[time - 1][blank_id])
        changed = trellis[time - 1][token_index - 1] + float(emissions[time - 1][tokens[token_index - 1]])
        if changed >= stayed:
            token_index -= 1
            points.append((token_index, time - 1))
        else:
            # Repeated CTC frames belong to the current token span. Retaining
            # them is the equivalent of WhisperX merge_repeats and avoids
            # collapsing every aligned token to a single emission frame.
            points.append((token_index - 1, time - 1))
        time -= 1
    if token_index != 0:
        raise WorkerError("ALIGNMENT_FAILED", "CTC backtracking did not cover every transcript token.")
    points.reverse()
    return points


def _load_runtime() -> tuple[Any, Any]:
    if os.environ.get("CEVRA_ALIGNMENT_MANAGED") == "1" and sys.version_info[:2] != (3, 12):
        raise WorkerError("RUNTIME_UNAVAILABLE", "Managed alignment requires the pinned CPython 3.12 runtime.")
    try:
        import torch
        import transformers
    except Exception as error:
        raise WorkerError("RUNTIME_UNAVAILABLE", "The isolated CTC alignment runtime is unavailable.") from error
    if torch.__version__.split("+")[0] != PINNED_TORCH_VERSION or transformers.__version__ != PINNED_TRANSFORMERS_VERSION:
        raise WorkerError("RUNTIME_UNAVAILABLE", "The isolated alignment dependency versions do not match CEVRA pins.")
    return torch, transformers


def _start_parent_watchdog() -> None:
    def watch() -> None:
        try:
            while os.read(0, 1):
                pass
        except (OSError, ValueError):
            pass
        os._exit(70)
    threading.Thread(target=watch, name="cevra-alignment-parent-watchdog", daemon=True).start()


def _object(value: object, name: str) -> Mapping[str, object]:
    if not isinstance(value, dict):
        raise WorkerError("INVALID_REQUEST", f"{name} must be an object.")
    return value


def main() -> int:
    line = sys.stdin.readline(MAX_REQUEST_CHARACTERS + 1)
    if not line or len(line) > MAX_REQUEST_CHARACTERS:
        response = {"ok": False, "error": {"code": "INVALID_REQUEST", "message": "A bounded typed request is required."}}
    else:
        try:
            message = json.loads(line)
            _validate_message(message)
            _start_parent_watchdog()
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
