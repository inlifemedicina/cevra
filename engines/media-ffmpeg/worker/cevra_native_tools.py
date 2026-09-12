from __future__ import annotations

import contextlib
import importlib
import io
import json
import math
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

CUSTOM_TOOLS = {"cevra-extract-frame", "cevra-scale", "cevra-overlay-media", "cevra-speed", "cevra-transcode", "cevra-mux-audio"}

DELIVERY_MATRIX: Dict[str, Dict[str, Any]] = {
    "mp4": {"video": {"h264", "h265", "av1"}, "audio": {"aac"}, "default_video": "h264", "default_audio": "aac", "format": "mp4", "audio_only": False},
    "mov": {"video": {"h264", "h265", "av1"}, "audio": {"aac", "pcm"}, "default_video": "h264", "default_audio": "aac", "format": "mov", "audio_only": False},
    "webm": {"video": {"vp9", "av1"}, "audio": {"opus"}, "default_video": "vp9", "default_audio": "opus", "format": "webm", "audio_only": False},
    "mkv": {"video": {"h264", "h265", "vp9", "av1"}, "audio": {"aac", "opus", "mp3", "pcm"}, "default_video": "h264", "default_audio": "aac", "format": "matroska", "audio_only": False},
    "wav": {"video": set(), "audio": {"pcm"}, "default_video": None, "default_audio": "pcm", "format": "wav", "audio_only": True},
    "mp3": {"video": set(), "audio": {"mp3"}, "default_video": None, "default_audio": "mp3", "format": "mp3", "audio_only": True},
    "m4a": {"video": set(), "audio": {"aac"}, "default_video": None, "default_audio": "aac", "format": "ipod", "audio_only": True},
}
VIDEO_CODECS = {"h264", "h265", "vp9", "av1", "copy"}
AUDIO_CODECS = {"aac", "opus", "mp3", "pcm", "copy"}


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
    probe = common.probe(output, role="output")
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
    if value in {"vp9", "vp09"}:
        return "vp9"
    if value in {"av1", "av01"}:
        return "av1"
    return None


def _normalize_audio_codec(codec: Any) -> Optional[str]:
    if not isinstance(codec, str):
        return None
    value = codec.strip().lower()
    if value in {"aac", "opus", "mp3", "mp3float"}:
        return "mp3" if value == "mp3float" else value
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
        return runtime.sdr_encoder_args(encoder, 18, "medium", True, meta)
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
    if codec == "vp9":
        available = set(_ffmpeg_encoders(importlib.import_module("_common")))
        if "libvpx-vp9" not in available:
            raise RuntimeError("VP9 encoder is not available in this CEVRA Media Runtime")
        return ["-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-pix_fmt", "yuv420p"]
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
    mapping = {
        "aac": ["-c:a", "aac", "-b:a", "192k"],
        "opus": ["-c:a", "libopus", "-b:a", "160k"],
        "mp3": ["-c:a", "libmp3lame", "-b:a", "192k"],
        "pcm": ["-c:a", "pcm_s16le"],
        "copy": ["-c:a", "copy"],
    }
    if selected not in mapping:
        raise ValueError(f"unsupported audio codec {selected}")
    if selected != "copy":
        encoder = mapping[selected][1]
        if encoder not in set(_ffmpeg_encoders(common)):
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

    cmd = common.ffmpeg_base() + ["-i", video_path, "-i", audio_path, "-map", "0:v:0", "-c:v", "copy"]
    if not replace_existing and video_meta.get("audio"):
        cmd += ["-map", "0:a:0"]
    cmd += ["-map", "1:a:0"]
    cmd += _audio_args(common, audio_codec, True)
    cmd += _container_args(container)
    common.run(cmd + [output])
    return _file_result(common, output, {"replacedExistingAudio": replace_existing})


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
    except SystemExit as exc:
        code = exc.code if isinstance(exc.code, int) else 1
        text = "\n".join(stderr.getvalue().strip().splitlines()[-12:]) or stdout.getvalue().strip()
        return {"isError": True, "content": [{"type": "text", "text": f"{name} failed (exit {code})\n{text}"}]}
    except Exception as exc:
        return {"isError": True, "content": [{"type": "text", "text": f"{name} failed: {type(exc).__name__}: {exc}"}]}
    return {"isError": True, "content": [{"type": "text", "text": f"{name} failed without a result"}]}
