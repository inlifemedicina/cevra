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
from _cevra_runtime import with_decode_acceleration as _cevra_with_decode_acceleration
from _cevra_runtime import allow_gpl_dev_encoder as _cevra_allow_gpl_dev_encoder
from _cevra_runtime import require_media_tool as _cevra_require_media_tool
from cevra_job_control import popen as _cevra_job_popen
from cevra_job_control import run as _cevra_job_run
from cevra_job_control import detach_process as _cevra_detach_process


def require_tool(name: str) -> str:
    if name in ("ffmpeg", "ffprobe"):
        path = _cevra_require_media_tool(name)
        if path:
            return path
        die(f"'{name}' is missing from the CEVRA Media Runtime", code=127, kind="missing_tool")
        return ""
    return _upstream_require_tool(name)


def x264_args(crf: int = 18, preset: str = "medium", keep_bt709: bool = True) -> List[str]:
    encoder = os.environ.get("CEVRA_VIDEO_ENCODER_H264", "").strip()
    if encoder:
        return _cevra_sdr_encoder_args(encoder, crf, preset, None, keep_bt709)
    if _cevra_allow_gpl_dev_encoder():
        return _upstream_x264_args(crf, preset, keep_bt709)
    die("no approved CEVRA H.264 encoder is configured; GPL libx264 fallback is disabled", kind="missing_tool")
    return []


def video_args(meta: Optional[Dict[str, Any]], crf: int = 18, preset: str = "medium") -> List[str]:
    video = (meta or {}).get("video") or {}
    if video.get("hdr"):
        encoder = os.environ.get("CEVRA_VIDEO_ENCODER_HEVC", "").strip()
        if encoder:
            return _cevra_hdr_encoder_args(encoder, meta, crf, preset)
        if _cevra_allow_gpl_dev_encoder():
            return _upstream_video_args(meta, crf, preset)
        die("no approved CEVRA HEVC encoder is configured for HDR preservation; GPL libx265 fallback is disabled", kind="missing_tool")
        return []
    encoder = os.environ.get("CEVRA_VIDEO_ENCODER_H264", "").strip()
    if encoder:
        return _cevra_sdr_encoder_args(encoder, crf, preset, meta)
    if _cevra_allow_gpl_dev_encoder():
        return _upstream_video_args(meta, crf, preset)
    die("no approved CEVRA H.264 encoder is configured; GPL libx264 fallback is disabled", kind="missing_tool")
    return []


def run(cmd: Sequence[str], *, quiet: bool = False, check: bool = True) -> subprocess.CompletedProcess:
    return _upstream_run(_cevra_with_decode_acceleration(cmd), quiet=quiet, check=check)
'''


def patch(source: Path, runtime_module: Path) -> None:
    package = json.loads((source / "package.json").read_text(encoding="utf-8"))
    if package.get("version") != EXPECTED_VERSION:
        raise SystemExit(f"refusing to patch ffmpeg-skill {package.get('version')!r}; expected {EXPECTED_VERSION}")

    common_path = source / "scripts" / "_common.py"
    text = common_path.read_text(encoding="utf-8")
    if MARKER in text:
        raise SystemExit("ffmpeg-skill source is already patched")
    if text.count("def x264_args(") != 1 or text.count("def video_args(") != 1 or text.count("def run(") != 1 or text.count("def require_tool(") != 1:
        raise SystemExit("pinned ffmpeg-skill execution functions changed; review upstream before updating CEVRA patch")
    ffmpeg_base_anchor = 'cmd = [require_tool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-nostdin"]'
    if text.count(ffmpeg_base_anchor) != 1:
        raise SystemExit("pinned ffmpeg-skill ffmpeg_base() lost the required -nostdin invariant")
    timeout_anchor = "DEFAULT_TIMEOUT = 1800.0"
    if text.count(timeout_anchor) != 1:
        raise SystemExit("pinned ffmpeg-skill timeout policy changed; review CEVRA render-timeout patch")
    text = text.replace(timeout_anchor, 'DEFAULT_TIMEOUT = max(0.0, float(os.environ.get("CEVRA_MEDIA_RENDER_TIMEOUT_SECONDS", "0")))', 1)
    env_timeout = 'return max(0.0, float(os.environ.get("FFMPEG_SKILL_TIMEOUT", DEFAULT_TIMEOUT)))'
    if text.count(env_timeout) != 1:
        raise SystemExit("pinned ffmpeg-skill environment timeout hook changed")
    text = text.replace(env_timeout, "return DEFAULT_TIMEOUT", 1)

    text = text.replace("def x264_args(", "def _upstream_x264_args(", 1)
    text = text.replace("def video_args(", "def _upstream_video_args(", 1)
    text = text.replace("def run(", "def _upstream_run(", 1)
    text = text.replace("def require_tool(", "def _upstream_require_tool(", 1)
    version_probe = 'subprocess.run(["ffprobe", "-version"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)'
    if text.count(version_probe) != 1:
        raise SystemExit("pinned ffmpeg-skill version probe changed; review runtime binary isolation patch")
    text = text.replace(
        version_probe,
        'subprocess.run([require_tool("ffprobe"), "-version"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)',
        1,
    )
    captured = "subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=limit)"
    if text.count(captured) != 1:
        raise SystemExit("pinned ffmpeg-skill captured process runner changed; review cancellation patch")
    text = text.replace(captured, "_cevra_job_run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=limit, artifact_paths=[cmd[-1]] if _is_ffmpeg(cmd) else [])", 1)
    progress = "subprocess.Popen(full, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)"
    if text.count(progress) != 1:
        raise SystemExit("pinned ffmpeg-skill progress process runner changed; review cancellation patch")
    text = text.replace(progress, "_cevra_job_popen(full, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, artifact_paths=[cmd[-1]])", 1)
    text = text.replace("return subprocess.CompletedProcess(full, proc.returncode, \"\", err)", "_cevra_detach_process(proc)\n    return subprocess.CompletedProcess(full, proc.returncode, \"\", err)", 1)
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
