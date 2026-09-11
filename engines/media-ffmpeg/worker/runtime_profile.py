from __future__ import annotations

import os
import subprocess
from typing import Any, Dict, Iterable, List, Optional

APPROVED: Dict[str, Dict[str, List[str]]] = {
    "darwin": {
        "h264": ["h264_videotoolbox"],
        "h265": ["hevc_videotoolbox"],
        "av1": ["av1_videotoolbox"],
    },
    "win32": {
        "h264": ["h264_nvenc", "h264_qsv", "h264_amf", "h264_mf"],
        "h265": ["hevc_nvenc", "hevc_qsv", "hevc_amf", "hevc_mf"],
        "av1": ["av1_nvenc", "av1_qsv", "av1_amf", "av1_mf"],
    },
    "linux": {
        "h264": ["h264_nvenc", "h264_qsv", "h264_amf"],
        "h265": ["hevc_nvenc", "hevc_qsv", "hevc_amf"],
        "av1": ["av1_nvenc", "av1_qsv"],
    },
    "unknown": {"h264": [], "h265": [], "av1": []},
}

_ENV = {
    "h264": "CEVRA_VIDEO_ENCODER_H264",
    "h265": "CEVRA_VIDEO_ENCODER_HEVC",
    "av1": "CEVRA_VIDEO_ENCODER_AV1",
}

_SMOKE_CACHE: Dict[str, bool] = {}


def candidates(platform_name: str, codec: str, available: Iterable[str]) -> List[str]:
    allowed = APPROVED.get(platform_name, APPROVED["unknown"]).get(codec, [])
    present = set(available)
    return [encoder for encoder in allowed if encoder in present]


def _smoke(ffmpeg: str, encoder: str) -> bool:
    if encoder in _SMOKE_CACHE:
        return _SMOKE_CACHE[encoder]
    cmd = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30",
        "-frames:v", "8", "-an", "-c:v", encoder, "-f", "null", "-",
    ]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, timeout=8.0)
        ok = proc.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        ok = False
    _SMOKE_CACHE[encoder] = ok
    return ok


def ensure_functional_profile(ffmpeg: Optional[str], runtime: Dict[str, Any]) -> Dict[str, str]:
    if not ffmpeg:
        return {}
    result: Dict[str, str] = {}
    platform_name = str(runtime.get("platform") or "unknown")
    available = runtime.get("encoders") or []
    for codec, env_name in _ENV.items():
        configured = os.environ.get(env_name, "").strip()
        if configured and configured in available:
            result[codec] = configured
            continue
        for encoder in candidates(platform_name, codec, available):
            if _smoke(ffmpeg, encoder):
                os.environ[env_name] = encoder
                result[codec] = encoder
                break
        else:
            os.environ.pop(env_name, None)
    return result


def configured_profile() -> Dict[str, str]:
    return {codec: value for codec, env_name in _ENV.items() if (value := os.environ.get(env_name, "").strip())}


def adapt_required_capabilities(required: Iterable[str]) -> tuple[set[str], List[str]]:
    """Replace upstream GPL encoder assumptions with CEVRA's configured encoder policy.

    Returns normal capabilities still handled by ffmpeg-skill Doctor and CEVRA-specific
    missing reasons that Doctor cannot express itself.
    """
    normal: set[str] = set()
    missing: List[str] = []
    profile = configured_profile()
    for capability in required:
        if capability == "encoder:libx264":
            if "h264" not in profile:
                missing.append("approved H.264 encoder")
            continue
        if capability == "encoder:libx265":
            if "h265" not in profile:
                missing.append("approved HEVC encoder")
            continue
        normal.add(capability)
    return normal, missing
