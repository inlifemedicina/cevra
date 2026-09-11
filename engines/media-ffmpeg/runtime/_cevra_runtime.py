from __future__ import annotations

import math
from typing import Any, Dict, List, Optional


def _quality_scale(crf: int) -> float:
    # Preserve ffmpeg-skill's CRF-shaped UX while translating it to bitrate-based
    # hardware encoders. Six CRF points roughly represent one bitrate halving/doubling.
    return max(0.25, min(4.0, math.pow(2.0, (18.0 - float(crf)) / 6.0)))


def _target_bitrate(meta: Optional[Dict[str, Any]], crf: int, codec: str) -> int:
    video = (meta or {}).get("video") or {}
    width = int(video.get("width") or 1920)
    height = int(video.get("height") or 1080)
    fps = float(video.get("fps") or 30.0)
    bits_per_pixel = 0.080 if codec == "h264" else 0.052
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
    keep_bt709: bool = True,
    meta: Optional[Dict[str, Any]] = None,
) -> List[str]:
    del keep_bt709  # Tagging is handled separately after CEVRA colour-pipeline validation.
    bitrate = _target_bitrate(meta, crf, "h264")
    return [
        "-c:v", encoder,
        *_preset_args(encoder, preset),
        "-b:v", str(bitrate),
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
    ]


def hdr_encoder_args(
    encoder: str,
    meta: Optional[Dict[str, Any]],
    crf: int = 18,
    preset: str = "medium",
) -> List[str]:
    bitrate = _target_bitrate(meta, crf + 2, "h265")
    return [
        "-c:v", encoder,
        *_preset_args(encoder, preset),
        "-b:v", str(bitrate),
        "-pix_fmt", "p010le",
        "-tag:v", "hvc1",
        "-movflags", "+faststart",
    ]
