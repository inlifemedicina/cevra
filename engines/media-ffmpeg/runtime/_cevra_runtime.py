from __future__ import annotations

import math
import os
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence


def allow_gpl_dev_encoder() -> bool:
    release = os.environ.get("CEVRA_RELEASE_MODE", "0") not in ("", "0", "false", "False")
    enabled = os.environ.get("CEVRA_ALLOW_GPL_DEV_ENCODERS", "0") not in ("", "0", "false", "False")
    return enabled and not release


def require_media_tool(name: str) -> Optional[str]:
    if name not in ("ffmpeg", "ffprobe"):
        raise ValueError(f"unsupported media executable {name}")
    release = os.environ.get("CEVRA_RELEASE_MODE", "0") not in ("", "0", "false", "False")
    bin_override = os.environ.get("CEVRA_MEDIA_BIN_DIR")
    if release:
        module = Path(__file__).absolute()
        expected_tail = ("vendor", "ffmpeg-skill", "scripts", "_cevra_runtime.py")
        runtime_root = module.parents[3] if tuple(module.parts[-4:]) == expected_tail else None
        bin_dir = str(runtime_root / "bin") if runtime_root else None
    else:
        bin_dir = bin_override
    if bin_dir:
        candidates = [os.path.join(bin_dir, f"{name}.exe"), os.path.join(bin_dir, name)] if os.name == "nt" else [os.path.join(bin_dir, name)]
        for candidate in candidates:
            if os.path.isfile(candidate):
                resolved = os.path.realpath(candidate)
                if not release or os.path.commonpath((resolved, os.path.realpath(bin_dir))) == os.path.realpath(bin_dir):
                    return resolved
    return None if release else shutil.which(name)


def _quality_scale(crf: int) -> float:
    # Preserve ffmpeg-skill's CRF-shaped UX while translating it to bitrate-based
    # hardware encoders. Six CRF points roughly represent one bitrate halving/doubling.
    return max(0.25, min(4.0, math.pow(2.0, (18.0 - float(crf)) / 6.0)))


def _target_bitrate(meta: Optional[Dict[str, Any]], crf: int, codec: str) -> int:
    video = (meta or {}).get("video") or {}
    width = int(video.get("width") or 1920)
    height = int(video.get("height") or 1080)
    fps = float(video.get("fps") or 30.0)
    bits_per_pixel = {"h264": 0.080, "h265": 0.052, "av1": 0.044}.get(codec, 0.060)
    estimate = width * height * fps * bits_per_pixel * _quality_scale(crf)
    floor = 1_500_000 if codec == "h264" else 1_000_000
    ceiling = 100_000_000 if codec == "h264" else 80_000_000
    return int(max(floor, min(ceiling, estimate)))


def _preset_args(encoder: str, preset: str) -> List[str]:
    fast = preset in ("ultrafast", "superfast", "veryfast", "faster", "fast")
    if encoder.endswith("_nvenc"):
        return ["-preset", "p3" if fast else "p5"]
    if encoder.endswith("_qsv"):
        return ["-preset", "veryfast" if fast else "medium"]
    if encoder.endswith("_amf"):
        return ["-quality", "speed" if fast else "balanced"]
    return []


def sdr_encoder_args(
    encoder: str,
    crf: int = 18,
    preset: str = "medium",
    meta: Optional[Dict[str, Any]] = None,
    tag_bt709: bool = True,
) -> List[str]:
    bitrate = _target_bitrate(meta, crf, "h264")
    result = [
        "-c:v", encoder,
        *_preset_args(encoder, preset),
        "-b:v", str(bitrate),
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
    ]
    if tag_bt709:
        result += ["-bsf:v", "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1"]
    return result


def hevc_encoder_args(
    encoder: str,
    meta: Optional[Dict[str, Any]],
    crf: int = 20,
    preset: str = "medium",
) -> List[str]:
    video = (meta or {}).get("video") or {}
    hdr = bool(video.get("hdr"))
    bitrate = _target_bitrate(meta, crf, "h265")
    return [
        "-c:v", encoder,
        *_preset_args(encoder, preset),
        "-b:v", str(bitrate),
        "-pix_fmt", "p010le" if hdr else "yuv420p",
        "-tag:v", "hvc1",
        "-movflags", "+faststart",
    ]


def hdr_encoder_args(
    encoder: str,
    meta: Optional[Dict[str, Any]],
    crf: int = 18,
    preset: str = "medium",
) -> List[str]:
    # ffmpeg-skill calls this path only for HDR preservation.
    bitrate = _target_bitrate(meta, crf + 2, "h265")
    return [
        "-c:v", encoder,
        *_preset_args(encoder, preset),
        "-b:v", str(bitrate),
        "-pix_fmt", "p010le",
        "-tag:v", "hvc1",
        "-movflags", "+faststart",
    ]


def av1_encoder_args(
    encoder: str,
    meta: Optional[Dict[str, Any]],
    crf: int = 24,
    preset: str = "medium",
) -> List[str]:
    video = (meta or {}).get("video") or {}
    bitrate = _target_bitrate(meta, crf, "av1")
    return [
        "-c:v", encoder,
        *_preset_args(encoder, preset),
        "-b:v", str(bitrate),
        "-pix_fmt", "p010le" if video.get("hdr") else "yuv420p",
    ]


def with_decode_acceleration(command: Sequence[str]) -> List[str]:
    """Inject CEVRA's selected hardware decoder before the first real media input.

    This remains opt-in because hardware decoding can lose to software decoding when a
    filter-heavy pipeline immediately transfers frames back to system memory. The app may
    set CEVRA_DECODE_ACCELERATION after a capability/benchmark decision.
    """
    acceleration = os.environ.get("CEVRA_DECODE_ACCELERATION", "").strip()
    cmd = list(command)
    if not acceleration or "-hwaccel" in cmd:
        return cmd
    try:
        input_index = cmd.index("-i")
    except ValueError:
        return cmd
    if input_index + 1 >= len(cmd):
        return cmd
    prefix = cmd[:input_index]
    source = cmd[input_index + 1]
    if "-f" in prefix:
        try:
            fmt = prefix[prefix.index("-f") + 1]
            if fmt in ("lavfi", "image2", "rawvideo"):
                return cmd
        except (ValueError, IndexError):
            pass
    if source == "-" or source.startswith("pipe:"):
        return cmd
    return cmd[:input_index] + ["-hwaccel", acceleration] + cmd[input_index:]
