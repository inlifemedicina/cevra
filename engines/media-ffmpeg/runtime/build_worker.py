#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENGINE = HERE.parent
WORKER_SOURCE = ENGINE / "worker"
VERSIONS = json.loads((HERE / "versions.json").read_text(encoding="utf-8"))

WORKER_FILES = ("cevra_media_worker.py", "cevra_native_tools.py", "runtime_profile.py")


def run(argv: list[str], env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
    if proc.returncode != 0:
        raise SystemExit(f"command failed ({proc.returncode}): {' '.join(argv)}\n{proc.stderr}")
    return proc


def python_version(python_executable: Path) -> str:
    proc = run([str(python_executable), "-I", "-c", "import platform; print(platform.python_version())"])
    return proc.stdout.strip()


def build(output_dir: Path, python_executable: Path) -> Path:
    """Stage the persistent worker for CEVRA's private managed CPython runtime.

    The worker is intentionally not frozen with PyInstaller. Desktop CEVRA already owns a
    private CPython runtime (ADR 0007), which is also shared by faster-whisper/WhisperX.
    Keeping one managed interpreter avoids duplicate runtimes and lets ffmpeg-skill tools run
    in-process instead of spawning a Python child process for every media operation.
    """
    expected_python = VERSIONS["python"]["version"]
    actual_python = python_version(python_executable)
    if actual_python != expected_python:
        raise SystemExit(f"managed Python version {actual_python} does not match pin {expected_python}")

    output_dir.mkdir(parents=True, exist_ok=True)
    worker_dir = output_dir / "worker"
    vendor_dir = output_dir / "vendor" / "ffmpeg-skill"
    if worker_dir.exists():
        shutil.rmtree(worker_dir)
    worker_dir.mkdir(parents=True)

    for name in WORKER_FILES:
        source = WORKER_SOURCE / name
        if not source.is_file():
            raise SystemExit(f"worker source missing: {source}")
        shutil.copy2(source, worker_dir / name)

    run([sys.executable, str(HERE / "prepare_vendor.py"), str(vendor_dir)])

    entry = worker_dir / "cevra_media_worker.py"
    env = os.environ.copy()
    env.update({
        "CEVRA_MEDIA_RUNTIME_ROOT": str(output_dir.resolve()),
        "CEVRA_FFMPEG_SKILL_ROOT": str(vendor_dir.resolve()),
        "CEVRA_RELEASE_MODE": "0",
        "PYTHONNOUSERSITE": "1",
        "PYTHONDONTWRITEBYTECODE": "1",
    })
    info = run([str(python_executable), "-I", str(entry), "--info"], env=env)
    parsed = json.loads(info.stdout)
    if parsed.get("version") != VERSIONS["mediaRuntime"]:
        raise SystemExit("staged worker version does not match versions.json")
    upstream = parsed.get("upstream") or {}
    if upstream.get("commit") != VERSIONS["ffmpegSkill"]["commit"]:
        raise SystemExit("staged worker upstream provenance mismatch")
    return entry


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("output", type=Path)
    ap.add_argument("--python", type=Path, default=Path(sys.executable), help="CEVRA-managed CPython executable; current interpreter is allowed only when it matches the release pin")
    args = ap.parse_args()
    python_executable = args.python.resolve()
    if not python_executable.is_file():
        raise SystemExit(f"Python executable missing: {python_executable}")
    result = build(args.output.resolve(), python_executable)
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
