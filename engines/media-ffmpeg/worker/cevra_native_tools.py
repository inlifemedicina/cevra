from __future__ import annotations

import contextlib
import importlib
import io
import json
import math
import os
import re
import struct
import sys
import tempfile
from fractions import Fraction
from pathlib import Path
from typing import Any, Dict, List, Optional

import cevra_job_control as job_control

CUSTOM_TOOLS = {"cevra-extract-frame", "cevra-scale", "cevra-overlay-media", "cevra-speed", "cevra-transcode", "cevra-mux-audio", "cevra-render-audio-sequence"}

AUDIO_SEQUENCE_VERSION = 1
AUDIO_SEQUENCE_SAMPLE_RATE = 48_000
AUDIO_SEQUENCE_SAMPLE_FORMAT = "pcm_f32le"
MAX_AUDIO_SEQUENCE_ITEMS = 2_048
MAX_AUDIO_SEQUENCE_GAIN_DB = 24.0
MIN_AUDIO_SEQUENCE_GAIN_DB = -120.0
MAX_AUDIO_SEQUENCE_GRAPH_BYTES = 2 * 1024 * 1024
MAX_AUDIO_SEQUENCE_INPUT_ARGUMENT_BYTES = 24 * 1024
MAX_AUDIO_SEQUENCE_WAV_DATA_BYTES = 0xFFFFFFFF - 256
MAX_MEDIA_DURATION_MS = 7 * 24 * 60 * 60 * 1000
MAX_MEDIA_INPUTS = 128


def _fraction(value: Any, label: str) -> Fraction:
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        raise ValueError(f"{label} is unavailable")
    try:
        result = Fraction(str(value))
    except (ValueError, ZeroDivisionError) as exc:
        raise ValueError(f"{label} is unavailable") from exc
    return result


def _audio_coverage_ms(audio: Dict[str, Any], source_id: str) -> tuple[Fraction, Fraction]:
    time_base_value = audio.get("time_base")
    duration_ts = audio.get("duration_ts")
    start_pts = audio.get("start_pts")
    if isinstance(time_base_value, str) and isinstance(duration_ts, int) and not isinstance(duration_ts, bool):
        time_base = _fraction(time_base_value, f"source {source_id} audio time_base")
        if time_base <= 0 or duration_ts <= 0:
            raise ValueError(f"source {source_id} audio timeline coverage is unavailable")
        if isinstance(start_pts, int) and not isinstance(start_pts, bool):
            start = start_pts * time_base
        elif audio.get("start_time") is None:
            start = Fraction(0)
        else:
            start = _fraction(audio.get("start_time"), f"source {source_id} audio start_time")
        duration = duration_ts * time_base
    else:
        start = Fraction(0) if audio.get("start_time") is None else _fraction(audio.get("start_time"), f"source {source_id} audio start_time")
        duration_value = audio.get("duration")
        if duration_value is None and isinstance(audio.get("duration_tag"), str):
            parts = audio["duration_tag"].split(":")
            if len(parts) == 3:
                duration_value = str(int(parts[0]) * 3600 + int(parts[1]) * 60 + _fraction(parts[2], f"source {source_id} audio duration tag"))
        duration = _fraction(duration_value, f"source {source_id} audio duration")
    if duration <= 0:
        raise ValueError(f"source {source_id} audio timeline coverage is unavailable")
    return start * 1000, (start + duration) * 1000


def _measure_pcm_f32le_wav(path: Path) -> tuple[int, int]:
    file_size = path.stat().st_size
    with path.open("rb") as handle:
        header = handle.read(12)
        if len(header) != 12 or header[:4] != b"RIFF" or header[8:] != b"WAVE":
            raise RuntimeError("audio sequence output is not an ordinary RIFF/WAVE file")
        format_fields: Optional[tuple[int, int, int, int, int]] = None
        data_bytes: Optional[int] = None
        while handle.tell() + 8 <= file_size:
            chunk_header = handle.read(8)
            chunk_id, chunk_size = chunk_header[:4], struct.unpack("<I", chunk_header[4:])[0]
            chunk_start = handle.tell()
            chunk_end = chunk_start + chunk_size
            if chunk_end > file_size:
                raise RuntimeError("audio sequence WAV contains a truncated chunk")
            if chunk_id == b"fmt ":
                if format_fields is not None or chunk_size < 16:
                    raise RuntimeError("audio sequence WAV format chunk is invalid")
                payload = handle.read(chunk_size)
                audio_format, channels, sample_rate, _, block_align, bits = struct.unpack("<HHIIHH", payload[:16])
                if audio_format == 0xFFFE:
                    if chunk_size < 40 or payload[24:26] != b"\x03\x00":
                        raise RuntimeError("audio sequence WAV extensible subtype is not IEEE float")
                    audio_format = 3
                format_fields = (audio_format, channels, sample_rate, block_align, bits)
            elif chunk_id == b"data":
                if data_bytes is not None:
                    raise RuntimeError("audio sequence WAV contains multiple data chunks")
                data_bytes = chunk_size
                handle.seek(chunk_size, os.SEEK_CUR)
            else:
                handle.seek(chunk_size, os.SEEK_CUR)
            if chunk_size & 1:
                handle.seek(1, os.SEEK_CUR)
        if format_fields is None or data_bytes is None:
            raise RuntimeError("audio sequence WAV is missing its format or data chunk")
        audio_format, channels, sample_rate, block_align, bits = format_fields
        if audio_format != 3 or sample_rate != AUDIO_SEQUENCE_SAMPLE_RATE or bits != 32 or block_align != channels * 4:
            raise RuntimeError("audio sequence WAV format does not match interleaved float32/48 kHz")
        if data_bytes <= 0 or data_bytes % block_align:
            raise RuntimeError("audio sequence WAV data size is not sample-frame aligned")
        return data_bytes // block_align, data_bytes

DELIVERY_MATRIX: Dict[str, Dict[str, Any]] = {
    "mp4": {"video": {"h264", "h265", "av1"}, "audio": {"aac"}, "default_video": "h264", "default_audio": "aac", "format": "mp4", "audio_only": False},
    "mov": {"video": {"h264", "h265", "av1"}, "audio": {"aac", "pcm"}, "default_video": "h264", "default_audio": "aac", "format": "mov", "audio_only": False},
    "mkv": {"video": {"h264", "h265", "av1"}, "audio": {"aac", "opus", "pcm"}, "default_video": "h264", "default_audio": "aac", "format": "matroska", "audio_only": False},
    "wav": {"video": set(), "audio": {"pcm"}, "default_video": None, "default_audio": "pcm", "format": "wav", "audio_only": True},
    "m4a": {"video": set(), "audio": {"aac"}, "default_video": None, "default_audio": "aac", "format": "ipod", "audio_only": True},
}
VIDEO_CODECS = {"h264", "h265", "av1", "copy"}
AUDIO_CODECS = {"aac", "opus", "pcm", "copy"}


def _load_common(vendor_root: Path) -> Any:
    scripts = str((vendor_root / "scripts").resolve())
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    return importlib.import_module("_common")


def _load_runtime(vendor_root: Path) -> Any:
    scripts = str((vendor_root / "scripts").resolve())
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    return importlib.import_module("_cevra_runtime")


def _required_string(args: Dict[str, Any], key: str) -> str:
    value = args.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} is required")
    return value


def _positive_number(args: Dict[str, Any], key: str) -> float:
    value = args.get(key)
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value <= 0:
        raise ValueError(f"{key} must be greater than 0")
    return float(value)


def _non_negative_number(args: Dict[str, Any], key: str) -> float:
    value = args.get(key)
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value < 0:
        raise ValueError(f"{key} must be 0 or greater")
    return float(value)


def _positive_integer(args: Dict[str, Any], key: str) -> int:
    value = _positive_number(args, key)
    if not value.is_integer():
        raise ValueError(f"{key} must be a positive integer")
    return int(value)


def _non_negative_integer(args: Dict[str, Any], key: str) -> int:
    value = _non_negative_number(args, key)
    if not value.is_integer():
        raise ValueError(f"{key} must be a non-negative integer")
    return int(value)


def _optional_choice(args: Dict[str, Any], key: str, allowed: set[str]) -> Optional[str]:
    if key not in args:
        return None
    value = args[key]
    if not isinstance(value, str) or value not in allowed:
        raise ValueError(f"{key} is invalid")
    return value


def _optional_boolean(args: Dict[str, Any], key: str, default: bool = False) -> bool:
    value = args.get(key, default)
    if not isinstance(value, bool):
        raise ValueError(f"{key} must be boolean")
    return value


def _file_result(common: Any, output: str, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    probe = common.verify_output(output)
    payload: Dict[str, Any] = {"status": "completed", "output": output, "probe": probe}
    if extra:
        payload.update(extra)
    return {"content": [{"type": "text", "text": json.dumps(payload)}], "structuredContent": payload}


def _video_audio_maps(meta: Dict[str, Any]) -> List[str]:
    result = ["-map", "0:v:0"]
    if meta.get("audio"):
        result += ["-map", "0:a:0"]
    return result


def _run_scale(common: Any, args: Dict[str, Any]) -> Dict[str, Any]:
    input_path = _required_string(args, "input")
    output = _required_string(args, "output")
    width = _positive_integer(args, "width")
    height = _positive_integer(args, "height")
    meta = common.probe(input_path)
    if not meta.get("video"):
        raise ValueError("input has no video stream")
    vf = f"scale={width}:{height}:flags=lanczos,setsar=1"
    cmd = common.ffmpeg_base() + ["-i", input_path] + _video_audio_maps(meta) + ["-vf", vf]
    cmd += common.video_args(meta) + common.cfr_args(meta)
    cmd += common.aac_args() if meta.get("audio") else ["-an"]
    common.run(cmd + [output])
    return _file_result(common, output)


def _run_extract_frame(common: Any, args: Dict[str, Any]) -> Dict[str, Any]:
    input_path = _required_string(args, "input")
    output = _required_string(args, "output")
    at = _non_negative_number(args, "at")
    meta = common.probe(input_path)
    if not meta.get("video"):
        raise ValueError("input has no video stream")
    cmd = common.ffmpeg_base() + [
        "-ss", f"{at:.6f}", "-i", input_path,
        "-map", "0:v:0", "-frames:v", "1", "-c:v", "png", output,
    ]
    common.run(cmd)
    return _file_result(common, output)


def _run_overlay(common: Any, args: Dict[str, Any]) -> Dict[str, Any]:
    base = _required_string(args, "base")
    overlay = _required_string(args, "overlay")
    output = _required_string(args, "output")
    start = _non_negative_number(args, "start")
    end = _positive_number(args, "end")
    if end <= start:
        raise ValueError("end must be greater than start")
    x = _non_negative_integer(args, "x")
    y = _non_negative_integer(args, "y")
    width = _positive_integer(args, "width")
    height = _positive_integer(args, "height")
    opacity = args.get("opacity", 1.0)
    if not isinstance(opacity, (int, float)) or isinstance(opacity, bool) or not math.isfinite(opacity) or not 0 <= opacity <= 1:
        raise ValueError("opacity must be between 0 and 1")

    base_meta = common.probe(base)
    overlay_meta = common.probe(overlay)
    if not base_meta.get("video") or not overlay_meta.get("video"):
        raise ValueError("base and overlay must both contain video")
    alpha = f",colorchannelmixer=aa={float(opacity):.6f}" if float(opacity) < 0.999999 else ""
    graph = (
        f"[1:v:0]scale={width}:{height}:flags=lanczos,format=rgba{alpha}[cevra_ov];"
        f"[0:v:0][cevra_ov]overlay={x}:{y}:eof_action=pass:repeatlast=0:"
        f"enable='between(t,{start:.6f},{end:.6f})'[cevra_v]"
    )
    cmd = common.ffmpeg_base() + ["-i", base, "-i", overlay, "-filter_complex", graph, "-map", "[cevra_v]"]
    if base_meta.get("audio"):
        cmd += ["-map", "0:a:0"]
    cmd += common.video_args(base_meta) + common.cfr_args(base_meta)
    cmd += common.aac_args() if base_meta.get("audio") else ["-an"]
    common.run(cmd + [output])
    return _file_result(common, output)


def _atempo_chain(factor: float) -> str:
    parts: List[str] = []
    remaining = factor
    while remaining < 0.5:
        parts.append("atempo=0.5")
        remaining /= 0.5
    while remaining > 100.0:
        parts.append("atempo=100.0")
        remaining /= 100.0
    parts.append(f"atempo={remaining:.8f}")
    return ",".join(parts)


def _run_speed(common: Any, args: Dict[str, Any]) -> Dict[str, Any]:
    input_path = _required_string(args, "input")
    output = _required_string(args, "output")
    factor = _positive_number(args, "factor")
    if factor < 1 / 16 or factor > 16:
        raise ValueError("factor must be between 0.0625 and 16")
    meta = common.probe(input_path)
    if not meta.get("video"):
        raise ValueError("input has no video stream")
    cmd = common.ffmpeg_base() + ["-i", input_path, "-map", "0:v:0"]
    if meta.get("audio"):
        cmd += ["-map", "0:a:0"]
    cmd += ["-vf", f"setpts={1.0 / factor:.10f}*PTS"]
    if meta.get("audio"):
        cmd += ["-af", _atempo_chain(factor)]
    cmd += common.video_args(meta) + common.cfr_args(meta)
    cmd += common.aac_args() if meta.get("audio") else ["-an"]
    common.run(cmd + [output])
    return _file_result(common, output, {"speed": factor})


def _infer_container(output: str) -> Optional[str]:
    extension = Path(output.split("?", 1)[0].split("#", 1)[0]).suffix.lower().lstrip(".")
    return extension if extension in DELIVERY_MATRIX else None


def _resolve_container(args: Dict[str, Any], output: str) -> str:
    requested = _optional_choice(args, "container", set(DELIVERY_MATRIX))
    inferred = _infer_container(output)
    if requested and inferred and requested != inferred:
        raise ValueError(f"container {requested} does not match output extension .{inferred}")
    container = requested or inferred
    if not container:
        raise ValueError("container is required or must be inferable from output")
    return container


def _container_args(container: str) -> List[str]:
    return ["-f", str(DELIVERY_MATRIX[container]["format"])]


def _normalize_video_codec(codec: Any) -> Optional[str]:
    if not isinstance(codec, str):
        return None
    value = codec.strip().lower()
    if value in {"h264", "avc", "avc1"}:
        return "h264"
    if value in {"h265", "hevc", "hev1", "hvc1"}:
        return "h265"
    if value in {"av1", "av01"}:
        return "av1"
    return None


def _normalize_audio_codec(codec: Any) -> Optional[str]:
    if not isinstance(codec, str):
        return None
    value = codec.strip().lower()
    if value in {"aac", "opus"}:
        return value
    if value.startswith("pcm_"):
        return "pcm"
    return None


def _validate_copy_codec(container: str, kind: str, metadata: Any) -> None:
    normalizer = _normalize_video_codec if kind == "video" else _normalize_audio_codec
    actual = normalizer(metadata.get("codec")) if isinstance(metadata, dict) else None
    if not actual or actual not in DELIVERY_MATRIX[container][kind]:
        raise ValueError(f"input {kind} codec cannot be copied into {container}")


def _resolve_delivery(args: Dict[str, Any], output: str, meta: Dict[str, Any]) -> tuple[str, Optional[str], str, bool]:
    container = _resolve_container(args, output)
    rule = DELIVERY_MATRIX[container]
    requested_video = _optional_choice(args, "video_codec", VIDEO_CODECS)
    requested_audio = _optional_choice(args, "audio_codec", AUDIO_CODECS)
    drop_video = _optional_boolean(args, "drop_video") or bool(rule["audio_only"])
    if bool(rule["audio_only"]) and requested_video is not None:
        raise ValueError(f"{container} is audio-only and cannot contain video")
    if drop_video and requested_video is not None:
        raise ValueError("video_codec cannot be used when video is dropped")
    video_codec = None if drop_video else requested_video or str(rule["default_video"])
    audio_codec = requested_audio or str(rule["default_audio"])
    if video_codec is not None and video_codec != "copy" and video_codec not in rule["video"]:
        raise ValueError(f"video codec {video_codec} is incompatible with {container}")
    if audio_codec != "copy" and audio_codec not in rule["audio"]:
        raise ValueError(f"audio codec {audio_codec} is incompatible with {container}")
    if video_codec == "copy":
        _validate_copy_codec(container, "video", meta.get("video"))
    if audio_codec == "copy":
        _validate_copy_codec(container, "audio", meta.get("audio"))
    return container, video_codec, audio_codec, drop_video


def _explicit_video_args(runtime: Any, meta: Dict[str, Any], codec: Optional[str]) -> List[str]:
    if codec in (None, ""):
        common = importlib.import_module("_common")
        return common.video_args(meta)
    if codec == "copy":
        return ["-c:v", "copy"]
    if codec == "h264":
        encoder = os.environ.get("CEVRA_VIDEO_ENCODER_H264", "").strip()
        if not encoder:
            raise RuntimeError("no approved H.264 encoder is configured")
        return runtime.sdr_encoder_args(encoder, 18, "medium", meta)
    if codec == "h265":
        encoder = os.environ.get("CEVRA_VIDEO_ENCODER_HEVC", "").strip()
        if not encoder:
            raise RuntimeError("no approved HEVC encoder is configured")
        return runtime.hevc_encoder_args(encoder, meta, 20, "medium")
    if codec == "av1":
        encoder = os.environ.get("CEVRA_VIDEO_ENCODER_AV1", "").strip()
        if not encoder:
            raise RuntimeError("no approved AV1 encoder is configured")
        return runtime.av1_encoder_args(encoder, meta, 24, "medium")
    raise ValueError(f"unsupported video codec {codec}")


def _ffmpeg_encoders(common: Any) -> List[str]:
    ffmpeg = common.require_tool("ffmpeg")
    proc = common.run([ffmpeg, "-hide_banner", "-encoders"], quiet=True, check=False)
    values: List[str] = []
    for line in (proc.stdout or "").splitlines():
        pieces = line.split()
        if len(pieces) >= 2 and len(pieces[0]) == 6 and pieces[0][0] in "VAS":
            values.append(pieces[1])
    return values


def _audio_args(common: Any, codec: Optional[str], has_audio: bool) -> List[str]:
    if not has_audio:
        return ["-an"]
    selected = codec or "aac"
    available = set(_ffmpeg_encoders(common))
    opus_encoder = "libopus" if "libopus" in available else "opus"
    mapping = {
        "aac": ["-c:a", "aac", "-b:a", "192k"],
        "opus": ["-c:a", opus_encoder, *(["-strict", "-2"] if opus_encoder == "opus" else []), "-b:a", "160k"],
        "pcm": ["-c:a", "pcm_s16le"],
        "copy": ["-c:a", "copy"],
    }
    if selected not in mapping:
        raise ValueError(f"unsupported audio codec {selected}")
    if selected != "copy":
        encoder = mapping[selected][1]
        if encoder not in available:
            raise RuntimeError(f"{selected.upper()} encoder {encoder} is not available in this CEVRA Media Runtime")
    return mapping[selected]


def _run_transcode(common: Any, runtime: Any, args: Dict[str, Any]) -> Dict[str, Any]:
    input_path = _required_string(args, "input")
    output = _required_string(args, "output")
    meta = common.probe(input_path)
    container, video_codec, audio_codec, drop_video = _resolve_delivery(args, output, meta)
    has_width = "width" in args
    has_height = "height" in args
    has_fps = "fps" in args
    if drop_video and (has_width or has_height or has_fps):
        raise ValueError("video dimensions and fps cannot be used when video is dropped")
    filters: List[str] = []
    if has_width or has_height:
        w = _positive_integer(args, "width") if has_width else -2
        h = _positive_integer(args, "height") if has_height else -2
        filters.append(f"scale={w}:{h}:flags=lanczos")
    if has_fps:
        filters.append(f"fps={_positive_number(args, 'fps'):g}")

    if video_codec == "copy" and filters:
        raise ValueError("videoCodec=copy cannot be combined with resizing or fps conversion")
    cmd = common.ffmpeg_base() + ["-i", input_path]
    if meta.get("video") and not drop_video:
        cmd += ["-map", "0:v:0"]
        if filters:
            cmd += ["-vf", ",".join(filters)]
        cmd += _explicit_video_args(runtime, meta, video_codec)
    else:
        cmd += ["-vn"]
    if meta.get("audio"):
        cmd += ["-map", "0:a:0"]
    elif drop_video:
        raise ValueError("input has no audio stream")
    cmd += _audio_args(common, audio_codec, bool(meta.get("audio")))
    cmd += _container_args(container)
    common.run(cmd + [output])
    return _file_result(common, output)


def _run_mux_audio(common: Any, args: Dict[str, Any]) -> Dict[str, Any]:
    video_path = _required_string(args, "video")
    audio_path = _required_string(args, "audio")
    output = _required_string(args, "output")
    replace_existing = _optional_boolean(args, "replace_existing", True)
    video_meta = common.probe(video_path)
    audio_meta = common.probe(audio_path)
    if not video_meta.get("video"):
        raise ValueError("video input has no video stream")
    if not audio_meta.get("audio"):
        raise ValueError("audio input has no audio stream")
    container = _resolve_container(args, output)
    rule = DELIVERY_MATRIX[container]
    if rule["audio_only"]:
        raise ValueError(f"{container} is audio-only and cannot be used for muxing")
    _validate_copy_codec(container, "video", video_meta.get("video"))
    audio_codec = _optional_choice(args, "audio_codec", AUDIO_CODECS) or str(rule["default_audio"])
    if audio_codec == "copy":
        _validate_copy_codec(container, "audio", audio_meta.get("audio"))
        if not replace_existing and video_meta.get("audio"):
            _validate_copy_codec(container, "audio", video_meta.get("audio"))
    elif audio_codec not in rule["audio"]:
        raise ValueError(f"audio codec {audio_codec} is incompatible with {container}")

    cmd = common.ffmpeg_base() + ["-i", video_path, "-i", audio_path, "-map", "0:v:0", "-c:v", "copy", "-map", "1:a:0"]
    if not replace_existing and video_meta.get("audio"):
        cmd += ["-map", "0:a:0"]
    cmd += _audio_args(common, audio_codec, True)
    cmd += _container_args(container)
    common.run(cmd + [output])
    return _file_result(common, output, {"replacedExistingAudio": replace_existing})


def _absolute_regular_input(raw: str, label: str) -> Path:
    path = Path(raw)
    if not path.is_absolute():
        raise ValueError(f"{label} must be an absolute local media path")
    try:
        metadata = path.lstat()
    except FileNotFoundError as exc:
        raise ValueError(f"{label} does not exist") from exc
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"{label} must be a non-symlink regular file")
    return path.resolve(strict=True)


def _absolute_new_output(raw: str) -> Path:
    path = Path(raw)
    if not path.is_absolute() or path.suffix.lower() != ".wav":
        raise ValueError("output must be an absolute local WAV path")
    parent = path.parent
    if not parent.is_dir() or parent.is_symlink():
        raise ValueError("output parent must be an existing non-symlink directory")
    try:
        path.lstat()
    except FileNotFoundError:
        pass
    else:
        if path.is_symlink():
            raise ValueError("media output path must not be a symlink")
        raise FileExistsError(f"refusing to overwrite existing output: {path}")
    return path.absolute()


def _audio_sequence_graph(args: Dict[str, Any], source_indexes: Dict[str, int], source_metadata: Dict[str, Dict[str, Any]]) -> str:
    output_layout = str(args["output_channel_layout"])
    output_samples = int(args["output_duration_ms"]) * (AUDIO_SEQUENCE_SAMPLE_RATE // 1000)
    uses: Dict[str, List[int]] = {source_id: [] for source_id in source_indexes}
    for item_index, item in enumerate(args["items"]):
        uses[str(item["source_id"])].append(item_index)

    graph: List[str] = []
    item_inputs: Dict[int, str] = {}
    for source_id, input_index in source_indexes.items():
        item_indexes = uses[source_id]
        if len(item_indexes) == 1:
            item_inputs[item_indexes[0]] = f"[{input_index}:a:0]"
            continue
        labels = "".join(f"[cevra_src_{item_index}]" for item_index in item_indexes)
        graph.append(f"[{input_index}:a:0]asplit={len(item_indexes)}{labels}")
        for item_index in item_indexes:
            item_inputs[item_index] = f"[cevra_src_{item_index}]"

    item_outputs: List[str] = []
    for item_index, item in enumerate(args["items"]):
        source_id = str(item["source_id"])
        audio = source_metadata[source_id]["audio"]
        input_layout = str(audio["channel_layout"])
        source_start_ms = int(item["source_start_ms"])
        source_end_ms = int(item["source_end_ms"])
        item_samples = (source_end_ms - source_start_ms) * (AUDIO_SEQUENCE_SAMPLE_RATE // 1000)
        timeline_samples = int(item["timeline_start_ms"]) * (AUDIO_SEQUENCE_SAMPLE_RATE // 1000)
        filters = [
            f"atrim=start={source_start_ms / 1000:.3f}:end={source_end_ms / 1000:.3f}",
            "asetpts=PTS-STARTPTS",
            f"aresample={AUDIO_SEQUENCE_SAMPLE_RATE}:async=0:first_pts=0",
        ]
        if input_layout == "mono" and output_layout == "stereo":
            filters.append("pan=stereo|c0=c0|c1=c0")
        elif input_layout == "stereo" and output_layout == "mono":
            filters.append("pan=mono|c0=0.5*c0+0.5*c1")
        else:
            filters.append(f"aformat=channel_layouts={output_layout}")
        filters.extend([f"atrim=end_sample={item_samples}", "asetpts=N/SR/TB"])
        if "gain_db" in item:
            filters.append(f"volume={float(item['gain_db']):.8g}dB:precision=double")
        fade_in_ms = int(item.get("fade_in_ms", 0))
        fade_out_ms = int(item.get("fade_out_ms", 0))
        if fade_in_ms:
            filters.append(f"afade=t=in:start_sample=0:nb_samples={fade_in_ms * 48}:curve=tri")
        if fade_out_ms:
            fade_samples = fade_out_ms * 48
            filters.append(f"afade=t=out:start_sample={item_samples - fade_samples}:nb_samples={fade_samples}:curve=tri")
        if timeline_samples:
            filters.append(f"adelay={timeline_samples}S:all=1")
        output_label = f"cevra_item_{item_index}"
        graph.append(f"{item_inputs[item_index]}{','.join(filters)}[{output_label}]")
        item_outputs.append(f"[{output_label}]")

    silence = "cevra_silence"
    graph.append(f"anullsrc=r={AUDIO_SEQUENCE_SAMPLE_RATE}:cl={output_layout},atrim=end_sample={output_samples},asetpts=N/SR/TB[{silence}]")
    mixed_inputs = f"[{silence}]" + "".join(item_outputs)
    graph.append(
        f"{mixed_inputs}amix=inputs={len(item_outputs) + 1}:duration=longest:dropout_transition=0:normalize=0,"
        f"atrim=end_sample={output_samples},asetpts=N/SR/TB,"
        f"aformat=sample_rates={AUDIO_SEQUENCE_SAMPLE_RATE}:sample_fmts=flt:channel_layouts={output_layout}[cevra_audio_out]"
    )
    result = ";".join(graph)
    if len(result.encode("utf-8")) > MAX_AUDIO_SEQUENCE_GRAPH_BYTES:
        raise ValueError("render-audio-sequence graph exceeds its bounded compiler size")
    return result


def _validate_audio_sequence_semantics(args: Dict[str, Any]) -> None:
    if args.get("version") != AUDIO_SEQUENCE_VERSION:
        raise ValueError(f"version must be {AUDIO_SEQUENCE_VERSION}")
    output_layout = args.get("output_channel_layout")
    if output_layout not in {"mono", "stereo"}:
        raise ValueError("output_channel_layout must be mono or stereo")
    output_duration_ms = _positive_integer(args, "output_duration_ms")
    if output_duration_ms > MAX_MEDIA_DURATION_MS:
        raise ValueError("output_duration_ms exceeds the media duration boundary")
    channels = 1 if output_layout == "mono" else 2
    output_bytes = output_duration_ms * 48 * channels * 4
    if output_bytes > MAX_AUDIO_SEQUENCE_WAV_DATA_BYTES:
        raise ValueError("output duration exceeds the ordinary RIFF/WAV data-size boundary")

    sources = args.get("sources")
    items = args.get("items")
    if not isinstance(sources, list) or not sources or len(sources) > MAX_MEDIA_INPUTS:
        raise ValueError(f"sources must contain 1-{MAX_MEDIA_INPUTS} entries")
    if not isinstance(items, list) or not items or len(items) > MAX_AUDIO_SEQUENCE_ITEMS:
        raise ValueError(f"items must contain 1-{MAX_AUDIO_SEQUENCE_ITEMS} entries")
    source_ids: set[str] = set()
    source_uris: set[str] = set()
    input_argument_bytes = 0
    for index, source in enumerate(sources):
        source_id = source.get("id") if isinstance(source, dict) else None
        uri = source.get("uri") if isinstance(source, dict) else None
        if not isinstance(source_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", source_id):
            raise ValueError(f"sources[{index}].id is invalid")
        if source_id in source_ids:
            raise ValueError(f"sources[{index}].id is duplicated")
        if not isinstance(uri, str) or uri in source_uris:
            raise ValueError(f"sources[{index}].uri is invalid or duplicated")
        source_ids.add(source_id)
        source_uris.add(uri)
        input_argument_bytes += len(uri.encode("utf-8")) + 3
    if input_argument_bytes > MAX_AUDIO_SEQUENCE_INPUT_ARGUMENT_BYTES:
        raise ValueError("audio sequence input paths exceed the cross-platform command argument boundary")

    used_source_ids: set[str] = set()
    for index, item in enumerate(items):
        source_id = item.get("source_id") if isinstance(item, dict) else None
        if not isinstance(source_id, str) or source_id not in source_ids:
            raise ValueError(f"items[{index}].source_id is unknown")
        used_source_ids.add(source_id)
        source_start_ms = _non_negative_integer(item, "source_start_ms")
        source_end_ms = _positive_integer(item, "source_end_ms")
        timeline_start_ms = _non_negative_integer(item, "timeline_start_ms")
        if source_end_ms > MAX_MEDIA_DURATION_MS or timeline_start_ms > MAX_MEDIA_DURATION_MS:
            raise ValueError(f"items[{index}] exceeds the media duration boundary")
        item_duration_ms = source_end_ms - source_start_ms
        if item_duration_ms <= 0:
            raise ValueError(f"items[{index}] source range must be positive")
        if timeline_start_ms + item_duration_ms > output_duration_ms:
            raise ValueError(f"items[{index}] extends beyond output_duration_ms")
        gain = item.get("gain_db")
        if gain is not None and (not isinstance(gain, (int, float)) or isinstance(gain, bool) or not math.isfinite(gain)
                                 or gain < MIN_AUDIO_SEQUENCE_GAIN_DB or gain > MAX_AUDIO_SEQUENCE_GAIN_DB):
            raise ValueError(f"items[{index}].gain_db is outside its bounded range")
        fade_in_ms = _non_negative_integer(item, "fade_in_ms") if "fade_in_ms" in item else 0
        fade_out_ms = _non_negative_integer(item, "fade_out_ms") if "fade_out_ms" in item else 0
        if fade_in_ms + fade_out_ms > item_duration_ms:
            raise ValueError(f"items[{index}] fades overlap beyond the item duration")
    unused = sorted(source_ids - used_source_ids)
    if unused:
        raise ValueError(f"sources are declared but unused: {', '.join(unused)}")


def _run_audio_sequence(common: Any, args: Dict[str, Any]) -> Dict[str, Any]:
    _validate_audio_sequence_semantics(args)
    output = _absolute_new_output(_required_string(args, "output"))
    output_layout = args.get("output_channel_layout")
    output_duration_ms = _positive_integer(args, "output_duration_ms")
    channels = 1 if output_layout == "mono" else 2
    output_samples = output_duration_ms * (AUDIO_SEQUENCE_SAMPLE_RATE // 1000)
    output_bytes = output_samples * channels * 4
    events: List[tuple[int, int]] = []
    for item in args["items"]:
        start = int(item["timeline_start_ms"])
        end = start + int(item["source_end_ms"]) - int(item["source_start_ms"])
        events.extend(((start, 1), (end, -1)))
    active = 0
    maximum_active = 0
    for _, delta in sorted(events, key=lambda event: (event[0], event[1])):
        active += delta
        maximum_active = max(maximum_active, active)

    sources = args.get("sources")
    items = args.get("items")
    assert isinstance(sources, list)
    assert isinstance(items, list)

    source_indexes: Dict[str, int] = {}
    source_paths: Dict[str, Path] = {}
    source_metadata: Dict[str, Dict[str, Any]] = {}
    source_coverage_ms: Dict[str, tuple[Fraction, Fraction]] = {}
    canonical_source_paths: set[Path] = set()
    for input_index, source in enumerate(sources):
        source_id = str(source["id"])
        canonical = _absolute_regular_input(str(source["uri"]), f"source {source_id}")
        if canonical == output.resolve(strict=False):
            raise ValueError(f"source {source_id} aliases output")
        if canonical in canonical_source_paths:
            raise ValueError(f"source {source_id} aliases another declared source; reuse its source id")
        metadata = common.probe(str(canonical))
        audio = metadata.get("audio")
        if not isinstance(audio, dict):
            raise ValueError(f"source {source_id} has no supported audio stream")
        channels_value = audio.get("channels")
        layout = audio.get("channel_layout")
        if channels_value == 1 and layout in {None, "mono"}:
            audio["channel_layout"] = "mono"
        elif channels_value == 2 and layout in {None, "stereo"}:
            audio["channel_layout"] = "stereo"
        else:
            raise ValueError(f"source {source_id} must have an unambiguous mono or stereo layout")
        coverage = _audio_coverage_ms(audio, source_id)
        source_indexes[source_id] = input_index
        source_paths[source_id] = canonical
        source_metadata[source_id] = metadata
        source_coverage_ms[source_id] = coverage
        canonical_source_paths.add(canonical)

    for item_index, item in enumerate(items):
        source_id = str(item["source_id"])
        coverage_start_ms, coverage_end_ms = source_coverage_ms[source_id]
        source_start_ms = int(item["source_start_ms"])
        source_end_ms = int(item["source_end_ms"])
        if source_start_ms < coverage_start_ms or source_end_ms > coverage_end_ms:
            raise ValueError(
                f"item {item_index} exceeds proven audio timeline coverage for source {source_id} "
                f"[{float(coverage_start_ms):.6f}, {float(coverage_end_ms):.6f}) ms"
            )

    graph = _audio_sequence_graph(args, source_indexes, source_metadata)
    graph_path: Optional[Path] = None
    staging_directory: Optional[Path] = None
    staging_output: Optional[Path] = None
    promoted_output = False
    cleanup_errors: List[str] = []
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", prefix="cevra-audio-sequence-", suffix=".ffgraph", delete=False) as handle:
            handle.write(graph)
            handle.write("\n")
            graph_path = Path(handle.name)
        job_control.register_artifacts([str(graph_path)])
        staging_directory = Path(tempfile.mkdtemp(prefix=".cevra-audio-sequence-", dir=output.parent))
        staging_output = staging_directory / "output.wav"
        cmd = common.ffmpeg_base(overwrite=False) + ["-xerror"]
        for source in sources:
            cmd += ["-i", str(source_paths[str(source["id"])])]
        cmd += [
            "-/filter_complex", str(graph_path),
            "-map", "[cevra_audio_out]",
            "-vn", "-c:a", AUDIO_SEQUENCE_SAMPLE_FORMAT,
            "-ar", str(AUDIO_SEQUENCE_SAMPLE_RATE),
            "-ac", str(channels),
            "-f", "wav", str(staging_output),
        ]
        try:
            common.run(cmd)
            staged_probe = common.verify_output(str(staging_output))
            staged_audio = staged_probe.get("audio") if isinstance(staged_probe, dict) else None
            if not isinstance(staged_audio, dict) or staged_audio.get("codec") != AUDIO_SEQUENCE_SAMPLE_FORMAT \
                    or staged_audio.get("sample_rate") != AUDIO_SEQUENCE_SAMPLE_RATE or staged_audio.get("channels") != channels:
                raise RuntimeError("audio sequence output failed its float32/48 kHz/channel postcondition")
            measured_samples, measured_data_bytes = _measure_pcm_f32le_wav(staging_output)
            if measured_samples != output_samples or measured_data_bytes != output_bytes:
                raise RuntimeError(
                    "audio sequence output failed its measured sample-frame/data-size postcondition"
                )
            os.link(staging_output, output, follow_symlinks=False)
            promoted_output = True
            result = _file_result(common, str(output), {
            "audioSequence": {
                "version": AUDIO_SEQUENCE_VERSION,
                "sampleRate": AUDIO_SEQUENCE_SAMPLE_RATE,
                "sampleFormat": AUDIO_SEQUENCE_SAMPLE_FORMAT,
                "channelLayout": output_layout,
                "distinctSourceCount": len(sources),
                "itemCount": len(items),
                "maximumSimultaneousItemCount": maximum_active,
                "outputSampleCount": measured_samples,
                "estimatedDataBytes": output_bytes,
                "measuredDataBytes": measured_data_bytes,
                "graphBytes": len(graph.encode("utf-8")),
            }
            })
            return result
        except BaseException as execution_error:
            if promoted_output:
                try:
                    output.unlink(missing_ok=True)
                except OSError as output_cleanup_error:
                    raise RuntimeError(
                        f"audio sequence failed and its owned promoted output cleanup failed: {output_cleanup_error}"
                    ) from execution_error
            raise
    finally:
        if graph_path is not None:
            try:
                graph_path.unlink(missing_ok=True)
            except OSError as exc:
                cleanup_errors.append(f"graph cleanup failed: {exc}")
        if staging_output is not None:
            try:
                staging_output.unlink(missing_ok=True)
            except OSError as exc:
                cleanup_errors.append(f"staging output cleanup failed: {exc}")
        if staging_directory is not None:
            try:
                staging_directory.rmdir()
            except OSError as exc:
                cleanup_errors.append(f"staging directory cleanup failed: {exc}")
        if cleanup_errors:
            if promoted_output:
                try:
                    output.unlink(missing_ok=True)
                except OSError as exc:
                    cleanup_errors.append(f"promoted output rollback failed: {exc}")
            raise RuntimeError(f"audio sequence owned artifact cleanup failed: {'; '.join(cleanup_errors)}")


def call_custom_tool(name: str, args: Dict[str, Any], vendor_root: Path) -> Optional[Dict[str, Any]]:
    if name not in CUSTOM_TOOLS:
        return None
    stdout = io.StringIO()
    stderr = io.StringIO()
    try:
        common = _load_common(vendor_root)
        runtime = _load_runtime(vendor_root)
        if hasattr(common, "STATE") and hasattr(common.STATE, "reset"):
            common.STATE.reset()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            if name == "cevra-extract-frame":
                return _run_extract_frame(common, args)
            if name == "cevra-scale":
                return _run_scale(common, args)
            if name == "cevra-overlay-media":
                return _run_overlay(common, args)
            if name == "cevra-speed":
                return _run_speed(common, args)
            if name == "cevra-transcode":
                return _run_transcode(common, runtime, args)
            if name == "cevra-mux-audio":
                return _run_mux_audio(common, args)
            if name == "cevra-render-audio-sequence":
                return _run_audio_sequence(common, args)
    except SystemExit as exc:
        code = exc.code if isinstance(exc.code, int) else 1
        text = "\n".join(stderr.getvalue().strip().splitlines()[-12:]) or stdout.getvalue().strip()
        return {"isError": True, "content": [{"type": "text", "text": f"{name} failed (exit {code})\n{text}"}]}
    except Exception as exc:
        return {"isError": True, "content": [{"type": "text", "text": f"{name} failed: {type(exc).__name__}: {exc}"}]}
    return {"isError": True, "content": [{"type": "text", "text": f"{name} failed without a result"}]}
