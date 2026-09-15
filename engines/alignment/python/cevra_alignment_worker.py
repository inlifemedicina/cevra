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
MAX_ALIGNMENT_WINDOW_MS = 30_000
MAX_CTC_TOKENS_PER_WINDOW = 1_024
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
        language = str(request["language"])
        processor = transformers.AutoProcessor.from_pretrained(
            model_path, local_files_only=True, trust_remote_code=False
        )
        model = transformers.AutoModelForCTC.from_pretrained(
            model_path,
            local_files_only=True,
            trust_remote_code=False,
            use_safetensors=(language == "en"),
        )
        device = str(request["device"])
        model.to(device)
        model.eval()
    except Exception as error:
        raise WorkerError("MODEL_UNAVAILABLE", "The configured local alignment model is unavailable.") from error

    reader = PcmWaveWindowReader(str(request["inputPath"]), 16000)
    vocabulary = processor.tokenizer.get_vocab()
    blank_id = int(getattr(processor.tokenizer, "pad_token_id", 0))

    def infer_window(samples: Sequence[float], sample_rate: int) -> list[list[float]]:
        try:
            inputs = processor(samples, sampling_rate=sample_rate, return_tensors="pt")
            input_values = inputs.input_values.to(str(request["device"]))
            with torch.inference_mode():
                logits = model(input_values).logits[0]
                emissions = logits.log_softmax(dim=-1).cpu().tolist()
            del logits, input_values, inputs
            return emissions
        except Exception as error:
            raise WorkerError("ALIGNMENT_FAILED", "The local CTC model could not produce alignment emissions.") from error

    transcript = _object(request["transcript"], "transcript")
    aligned = align_transcript_windows(transcript, reader, infer_window, vocabulary, blank_id)
    del model, processor
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "transcript": aligned,
        "modelId": request["modelId"],
        "modelRevision": request["modelRevision"],
        "modelDigest": request["modelDigest"],
        "durationMs": reader.duration_ms,
    }


class PcmWaveWindowReader:
    """Seek and normalize only the current canonical segment window."""

    def __init__(self, path: str, target_rate: int) -> None:
        self.path = path
        self.target_rate = target_rate
        try:
            with wave.open(path, "rb") as source:
                self.channels = source.getnchannels()
                self.width = source.getsampwidth()
                self.source_rate = source.getframerate()
                self.frame_count = source.getnframes()
        except Exception as error:
            raise WorkerError("ALIGNMENT_FAILED", "Prepared alignment audio is not a readable PCM WAV.") from error
        if self.channels < 1 or self.width not in {1, 2, 4} or self.source_rate <= 0 or self.frame_count <= 0:
            raise WorkerError("ALIGNMENT_FAILED", "Prepared alignment audio format is unsupported.")
        self.duration_ms = round(self.frame_count * 1000 / self.source_rate)

    def read_window(self, start_ms: int, end_ms: int) -> tuple[list[float], int]:
        if start_ms < 0 or end_ms <= start_ms or start_ms >= self.duration_ms or end_ms > self.duration_ms:
            raise WorkerError("ALIGNMENT_FAILED", "Canonical segment timing exceeds prepared audio.")
        start_frame = (start_ms * self.source_rate) // 1000
        end_frame = min(self.frame_count, math.ceil(end_ms * self.source_rate / 1000))
        if end_frame <= start_frame:
            raise WorkerError("ALIGNMENT_FAILED", "Canonical segment window contains no audio samples.")
        try:
            with wave.open(self.path, "rb") as source:
                source.setpos(start_frame)
                frames = source.readframes(end_frame - start_frame)
        except Exception as error:
            raise WorkerError("ALIGNMENT_FAILED", "Prepared alignment audio window could not be read.") from error
        return normalize_pcm_window(frames, self.channels, self.width, self.source_rate, self.target_rate), self.target_rate


def normalize_pcm_window(frames: bytes, channels: int, width: int, source_rate: int, target_rate: int) -> list[float]:
    """Downmix and linearly resample one bounded PCM window."""
    typecode = {1: "B", 2: "h", 4: "i"}[width]
    values = array(typecode)
    values.frombytes(frames)
    del frames
    if sys.byteorder != "little" and width > 1:
        values.byteswap()
    scale = float(128 if width == 1 else (1 << (width * 8 - 1)))
    offset = 128.0 if width == 1 else 0.0
    mono = [sum((float(values[i + channel]) - offset) / scale for channel in range(channels)) / channels for i in range(0, len(values), channels)]
    del values
    if source_rate == target_rate:
        return mono
    output_count = max(1, round(len(mono) * target_rate / source_rate))
    if len(mono) == 1:
        return [mono[0]] * output_count
    ratio = source_rate / target_rate
    output: list[float] = []
    for index in range(output_count):
        position = min(index * ratio, len(mono) - 1)
        left = int(position)
        right = min(left + 1, len(mono) - 1)
        fraction = position - left
        output.append(mono[left] * (1.0 - fraction) + mono[right] * fraction)
    del mono
    return output


def align_transcript_windows(
    transcript: Mapping[str, object],
    reader: object,
    infer_window: object,
    vocabulary: Mapping[str, int],
    blank_id: int,
) -> dict[str, object]:
    words = [_object(word, "word") for word in transcript["words"]]  # type: ignore[index]
    word_by_id = {str(word["id"]): word for word in words}
    aligned_by_id: dict[str, dict[str, object]] = {}
    aligned_segments: list[dict[str, object]] = []
    uppercase = any(key != key.lower() for key in vocabulary if key.isalpha())
    delimiter = "|" if "|" in vocabulary else None
    previous_segment_end = 0
    for segment_index, raw in enumerate(transcript["segments"]):  # type: ignore[index]
        segment = _object(raw, "segment")
        start_ms = int(segment["startMs"])
        end_ms = int(segment["endMs"])
        if end_ms <= start_ms or (segment_index > 0 and start_ms < previous_segment_end):
            raise WorkerError("ALIGNMENT_FAILED", "Canonical alignment segments must be monotonic and non-overlapping.")
        if end_ms - start_ms > MAX_ALIGNMENT_WINDOW_MS:
            raise WorkerError("ALIGNMENT_FAILED", f"Canonical segment {segment_index} exceeds the bounded alignment window.")
        segment_words = [word_by_id[str(word_id)] for word_id in segment["wordIds"]]  # type: ignore[index]
        if not segment_words:
            raise WorkerError("ALIGNMENT_FAILED", "Every aligned segment must contain words.")
        token_ids, token_word_indexes = tokenize_words(segment_words, vocabulary, uppercase, delimiter)
        if len(token_ids) > MAX_CTC_TOKENS_PER_WINDOW:
            raise WorkerError("ALIGNMENT_FAILED", f"Canonical segment {segment_index} exceeds the bounded CTC token count.")
        samples, sample_rate = reader.read_window(start_ms, end_ms)  # type: ignore[attr-defined]
        if not samples:
            raise WorkerError("ALIGNMENT_FAILED", "Alignment audio window contains no samples.")
        emissions = infer_window(samples, sample_rate)  # type: ignore[operator]
        prepared_emissions, prepared_tokens = add_wildcard_emissions(emissions, token_ids, blank_id)
        points = forced_align(prepared_emissions, prepared_tokens, blank_id)
        ranges: list[list[int]] = [[] for _ in segment_words]
        for token_index, frame_index in points:
            word_index = token_word_indexes[token_index]
            if word_index >= 0:
                ranges[word_index].append(frame_index)
        frame_ms = (end_ms - start_ms) / len(prepared_emissions)
        window_words: list[dict[str, object]] = []
        for word_index, (word, frames) in enumerate(zip(segment_words, ranges)):
            if not frames:
                raise WorkerError("ALIGNMENT_FAILED", f"Canonical word {word_index} was not completely aligned.")
            word_start = max(start_ms, round(start_ms + min(frames) * frame_ms))
            word_end = min(end_ms, max(word_start + 1, round(start_ms + (max(frames) + 1) * frame_ms)))
            if word_end <= word_start:
                raise WorkerError("ALIGNMENT_FAILED", "Aligned word has no positive duration inside its segment window.")
            aligned_word = {**word, "startMs": word_start, "endMs": word_end}
            aligned_by_id[str(word["id"])] = aligned_word
            window_words.append(aligned_word)
        aligned_segments.append({
            **segment,
            "startMs": min(int(word["startMs"]) for word in window_words),
            "endMs": max(int(word["endMs"]) for word in window_words),
        })
        previous_segment_end = end_ms
        del samples, emissions, prepared_emissions, points, ranges, window_words
    aligned_words = [aligned_by_id[str(word["id"])] for word in words]
    return {"language": transcript["language"], "words": aligned_words, "segments": aligned_segments}


def tokenize_words(
    words: Sequence[Mapping[str, object]],
    vocabulary: Mapping[str, int],
    uppercase: bool,
    delimiter: str | None,
) -> tuple[list[int], list[int]]:
    """Preserve every canonical character; -1 denotes an upstream-compatible wildcard."""
    token_ids: list[int] = []
    token_word_indexes: list[int] = []
    for word_index, word in enumerate(words):
        text = str(word.get("text", ""))
        if not text:
            raise WorkerError("ALIGNMENT_FAILED", f"Canonical word {word_index} contains no characters.")
        normalized = text.upper() if uppercase else text.lower()
        if token_ids and delimiter is not None:
            token_ids.append(int(vocabulary[delimiter]))
            token_word_indexes.append(-1)
        for character in normalized:
            token_ids.append(int(vocabulary[character]) if character in vocabulary else -1)
            token_word_indexes.append(word_index)
    return token_ids, token_word_indexes


def add_wildcard_emissions(
    emissions: Sequence[Sequence[float]], tokens: Sequence[int], blank_id: int
) -> tuple[Sequence[Sequence[float]], list[int]]:
    if not emissions or not emissions[0] or blank_id < 0 or blank_id >= len(emissions[0]):
        raise WorkerError("ALIGNMENT_FAILED", "CTC emissions are invalid.")
    width = len(emissions[0])
    if any(len(row) != width for row in emissions):
        raise WorkerError("ALIGNMENT_FAILED", "CTC emissions are ragged.")
    if not any(token == -1 for token in tokens):
        if any(token < 0 or token >= width for token in tokens):
            raise WorkerError("ALIGNMENT_FAILED", "CTC token identity is invalid.")
        return emissions, list(tokens)
    non_blank = [index for index in range(width) if index != blank_id]
    if not non_blank:
        raise WorkerError("ALIGNMENT_FAILED", "CTC vocabulary has no non-blank wildcard candidates.")
    wildcard_id = width
    expanded = [list(row) + [max(float(row[index]) for index in non_blank)] for row in emissions]
    resolved = [wildcard_id if token == -1 else token for token in tokens]
    if any(token < 0 or token > wildcard_id for token in resolved):
        raise WorkerError("ALIGNMENT_FAILED", "CTC token identity is invalid.")
    return expanded, resolved


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
        if changed > stayed:
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
