#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENGINE = HERE.parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ENGINE / "worker"))

from build_worker import build as build_worker
from generate_manifest import generate
from prepare_python_runtime import verify_prepared as verify_python_runtime
from runtime_integrity import verify_release_bundle

VERSIONS = json.loads((HERE / "versions.json").read_text(encoding="utf-8"))


def _relative_executable(value: str) -> Path:
    path = Path(value)
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise SystemExit("--python-executable must be a relative path inside --python-root")
    return path


def _copy_file(source: Path, destination: Path, name: str) -> None:
    if not source.is_file():
        raise SystemExit(f"required {name} input is missing: {source}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def assemble(
    output: Path,
    python_root: Path,
    python_executable: Path,
    ffmpeg_prefix: Path,
    vendor_source: Path,
) -> Path:
    output = output.absolute()
    if output.exists():
        raise SystemExit(f"refusing to replace existing runtime output: {output}")
    if not python_root.is_dir():
        raise SystemExit(f"private Python root is missing: {python_root}")
    verified_python = verify_python_runtime(python_root)
    source_python = python_root / python_executable
    if source_python != verified_python:
        raise SystemExit("--python-executable does not identify the pinned managed CPython executable")
    if source_python.is_symlink() or not source_python.is_file():
        raise SystemExit("private Python executable must be a real file inside its source root")
    try:
        source_python.resolve(strict=True).relative_to(python_root.resolve(strict=True))
    except ValueError as exc:
        raise SystemExit("private Python executable escapes its source root") from exc

    suffix = ".exe" if os.name == "nt" else ""
    ffmpeg_inputs = {
        ffmpeg_prefix / "bin" / f"ffmpeg{suffix}": Path("bin") / f"ffmpeg{suffix}",
        ffmpeg_prefix / "bin" / f"ffprobe{suffix}": Path("bin") / f"ffprobe{suffix}",
        ffmpeg_prefix / "provenance" / "ffmpeg.json": Path("provenance/ffmpeg.json"),
        ffmpeg_prefix / "licenses" / "ffmpeg" / "COPYING.LGPLv2.1": Path("licenses/ffmpeg/COPYING.LGPLv2.1"),
    }
    for source in ffmpeg_inputs:
        if not source.is_file():
            raise SystemExit(f"FFmpeg release input is incomplete: {source}")
    ffmpeg_sources = ffmpeg_prefix / "sources" / "ffmpeg"
    if not ffmpeg_sources.is_dir():
        raise SystemExit("FFmpeg release input is missing exact source/compliance artifacts")

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f".{output.name}-", dir=output.parent) as temp_name:
        stage = Path(temp_name) / "runtime"
        stage.mkdir()
        shutil.copytree(python_root, stage / "python", symlinks=True)
        staged_python = stage / "python" / python_executable
        if staged_python.is_symlink() or not staged_python.is_file():
            raise SystemExit("copied private Python executable is invalid")
        for source, relative in ffmpeg_inputs.items():
            _copy_file(source, stage / relative, relative.as_posix())
        shutil.copytree(ffmpeg_sources, stage / "sources" / "ffmpeg", symlinks=False)

        build_worker(stage, staged_python, vendor_source)
        manifest = generate(stage, staged_python)
        (stage / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

        verify_release_bundle(
            stage,
            staged_python,
            require_running_python=False,
            expected_python=VERSIONS["python"]["version"],
            expected_ffmpeg=VERSIONS["ffmpeg"]["version"],
            expected_ffmpeg_source=VERSIONS["ffmpeg"]["source"],
            expected_ffmpeg_signature=VERSIONS["ffmpeg"]["signature"],
            expected_ffmpeg_fingerprint=VERSIONS["ffmpeg"]["signingFingerprint"],
            expected_worker=VERSIONS["mediaRuntime"],
            expected_upstream_version=VERSIONS["ffmpegSkill"]["version"],
            expected_upstream_commit=VERSIONS["ffmpegSkill"]["commit"],
            expected_upstream_contract=VERSIONS["ffmpegSkill"]["contractVersion"],
        )
        stage.rename(output)
    return output / "manifest.json"


def main() -> int:
    parser = argparse.ArgumentParser(description="Assemble a verified CEVRA Media Runtime from prepared release inputs")
    parser.add_argument("output", type=Path)
    parser.add_argument("--python-root", type=Path, required=True)
    parser.add_argument(
        "--python-executable",
        help="optional relative executable override; defaults to the executable verified from the pinned managed-Python inventory",
    )
    parser.add_argument("--ffmpeg-prefix", type=Path, required=True)
    parser.add_argument("--vendor-source", type=Path, required=True)
    args = parser.parse_args()
    python_root = args.python_root.resolve()
    verified_python = verify_python_runtime(python_root)
    python_executable = (
        _relative_executable(args.python_executable)
        if args.python_executable is not None
        else verified_python.relative_to(python_root)
    )
    manifest = assemble(
        args.output,
        python_root,
        python_executable,
        args.ffmpeg_prefix.resolve(),
        args.vendor_source.resolve(),
    )
    print(manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
