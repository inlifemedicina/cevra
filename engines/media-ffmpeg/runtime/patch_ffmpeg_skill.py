#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

EXPECTED_VERSION = "1.4.2"
EXPECTED_COMMIT = "58f64f9d9e6a0ced4a4cd6a198d7476dede50d1a"
MARKER = "# CEVRA_MEDIA_RUNTIME_PATCH_V1"

WRAPPERS = r'''

# CEVRA_MEDIA_RUNTIME_PATCH_V1
from _cevra_runtime import hdr_encoder_args as _cevra_hdr_encoder_args
from _cevra_runtime import sdr_encoder_args as _cevra_sdr_encoder_args


def x264_args(crf: int = 18, preset: str = "medium", keep_bt709: bool = True) -> List[str]:
    encoder = os.environ.get("CEVRA_VIDEO_ENCODER_H264", "").strip()
    if encoder:
        return _cevra_sdr_encoder_args(encoder, crf, preset, keep_bt709)
    return _upstream_x264_args(crf, preset, keep_bt709)


def video_args(meta: Optional[Dict[str, Any]], crf: int = 18, preset: str = "medium") -> List[str]:
    video = (meta or {}).get("video") or {}
    if video.get("hdr"):
        encoder = os.environ.get("CEVRA_VIDEO_ENCODER_HEVC", "").strip()
        if encoder:
            return _cevra_hdr_encoder_args(encoder, meta, crf, preset)
    else:
        encoder = os.environ.get("CEVRA_VIDEO_ENCODER_H264", "").strip()
        if encoder:
            return _cevra_sdr_encoder_args(encoder, crf, preset, True, meta)
    return _upstream_video_args(meta, crf, preset)
'''


def patch(source: Path, runtime_module: Path) -> None:
    package = json.loads((source / "package.json").read_text(encoding="utf-8"))
    if package.get("version") != EXPECTED_VERSION:
        raise SystemExit(f"refusing to patch ffmpeg-skill {package.get('version')!r}; expected {EXPECTED_VERSION}")

    common_path = source / "scripts" / "_common.py"
    text = common_path.read_text(encoding="utf-8")
    if MARKER in text:
        raise SystemExit("ffmpeg-skill source is already patched")
    if text.count("def x264_args(") != 1 or text.count("def video_args(") != 1:
        raise SystemExit("pinned encoder functions changed; review upstream before updating CEVRA patch")

    text = text.replace("def x264_args(", "def _upstream_x264_args(", 1)
    text = text.replace("def video_args(", "def _upstream_video_args(", 1)
    text += WRAPPERS
    common_path.write_text(text, encoding="utf-8")
    shutil.copy2(runtime_module, source / "scripts" / "_cevra_runtime.py")

    provenance = {
        "upstream": "kajisho5/ffmpeg-skill",
        "version": EXPECTED_VERSION,
        "commit": EXPECTED_COMMIT,
        "patch": "CEVRA_MEDIA_RUNTIME_PATCH_V1"
    }
    (source / "CEVRA_PROVENANCE.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", type=Path)
    ap.add_argument("--runtime-module", type=Path, default=Path(__file__).with_name("_cevra_runtime.py"))
    args = ap.parse_args()
    patch(args.source.resolve(), args.runtime_module.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
