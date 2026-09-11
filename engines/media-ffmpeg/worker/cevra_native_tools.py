from __future__ import annotations

import contextlib
import importlib
import io
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

CUSTOM_TOOLS = {"cevra-scale", "cevra-overlay-media", "cevra-speed", "cevra-transcode"}


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
    if not isinstance(value, (int, float)) or isinstance(value, bool) or value <= 0:
        raise ValueError(f"{key} must be greater than 0")
    return float(value)


def _non_negative_number(args: Dict[str, Any], key: str) -> float:
    value = args.get(key)
    if not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0:
        raise ValueError(f"{key} must be 0 or greater")
    return float(value)


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
    width = int(_positive_number(args, "width"))
    height = int(_positive_number(args, "height"))
    meta = common.probe(input_path)
    if not meta.get("video"):
        raise ValueError("input has no video stream")
    vf = f"scale={width}:{height}:flags=lanczos,setsar=1"
    cmd = common.ffmpeg_base() + ["-i", input_path] + _video_audio_maps(meta) + ["-vf", vf]
    cmd += common.video_args(meta) + common.cfr_args(meta)
    cmd += common.aac_args() if meta.get("audio") else ["-an"]
    common.run(cmd + [output])
    return _file_result(common, output)


def _run_overlay(common: Any, args: Dict[str, Any]) -> Dict[str, Any]:
    base = _required_string(args, "base")
    overlay = _required_string(args, "overlay")
    output = _required_string(args, "output")
    start = _non_negative_number(args, "start")
    end = _positive_number(args, "end")
    if end <= start:
        raise ValueError("end must be greater than start")
    x = int(_non_negative_number(args, "x"))
    y = int(_non_negative_number(args, "y"))
    width = int(_positive_number(args, "width"))
    height = int(_positive_number(args, "height"))
    opacity = args.get("opacity", 1.0)
    if not isinstance(opacity, (int, float)) or isinstance(opacity, bool) or not 0 <= opacity <= 1:
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


def _container_args(container: Optional[str]) -> List[str]:
    mapping = {"mp4": "mp4", "mov": "mov", "webm": "webm", "mkv": "matroska", "wav": "wav", "mp3": "mp3", "m4a": "ipod"}
    if not container:
        return []
    if container not in mapping:
        raise ValueError(f"unsupported container {container}")
    return ["-f", mapping[container]]


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


def _audio_args(codec: Optional[str], has_audio: bool) -> List[str]:
    if not has_audio:
        return ["-an"]
    mapping = {
        None: ["-c:a", "aac", "-b:a", "192k"],
        "": ["-c:a", "aac", "-b:a", "192k"],
        "aac": ["-c:a", "aac", "-b:a", "192k"],
        "opus": ["-c:a", "libopus", "-b:a", "160k"],
        "mp3": ["-c:a", "libmp3lame", "-b:a", "192k"],
        "pcm": ["-c:a", "pcm_s16le"],
        "copy": ["-c:a", "copy"],
    }
    if codec not in mapping:
        raise ValueError(f"unsupported audio codec {codec}")
    return mapping[codec]


def _run_transcode(common: Any, runtime: Any, args: Dict[str, Any]) -> Dict[str, Any]:
    input_path = _required_string(args, "input")
    output = _required_string(args, "output")
    meta = common.probe(input_path)
    width = args.get("width")
    height = args.get("height")
    fps = args.get("fps")
    filters: List[str] = []
    if width is not None or height is not None:
        w = int(_positive_number(args, "width")) if width is not None else -2
        h = int(_positive_number(args, "height")) if height is not None else -2
        filters.append(f"scale={w}:{h}:flags=lanczos")
    if fps is not None:
        filters.append(f"fps={_positive_number(args, 'fps'):g}")

    video_codec = args.get("video_codec")
    audio_codec = args.get("audio_codec")
    if video_codec == "copy" and filters:
        raise ValueError("videoCodec=copy cannot be combined with resizing or fps conversion")
    cmd = common.ffmpeg_base() + ["-i", input_path]
    if meta.get("video"):
        cmd += ["-map", "0:v:0"]
        if filters:
            cmd += ["-vf", ",".join(filters)]
        cmd += _explicit_video_args(runtime, meta, video_codec)
    else:
        cmd += ["-vn"]
    if meta.get("audio"):
        cmd += ["-map", "0:a:0"]
    cmd += _audio_args(audio_codec, bool(meta.get("audio")))
    cmd += _container_args(args.get("container"))
    common.run(cmd + [output])
    return _file_result(common, output)


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
            if name == "cevra-scale":
                return _run_scale(common, args)
            if name == "cevra-overlay-media":
                return _run_overlay(common, args)
            if name == "cevra-speed":
                return _run_speed(common, args)
            if name == "cevra-transcode":
                return _run_transcode(common, runtime, args)
    except SystemExit as exc:
        code = exc.code if isinstance(exc.code, int) else 1
        text = "\n".join(stderr.getvalue().strip().splitlines()[-12:]) or stdout.getvalue().strip()
        return {"isError": True, "content": [{"type": "text", "text": f"{name} failed (exit {code})\n{text}"}]}
    except Exception as exc:
        return {"isError": True, "content": [{"type": "text", "text": f"{name} failed: {type(exc).__name__}: {exc}"}]}
    return {"isError": True, "content": [{"type": "text", "text": f"{name} failed without a result"}]}
