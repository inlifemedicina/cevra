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

WORKER_FILES = ("cevra_media_worker.py", "cevra_native_tools.py", "cevra_job_control.py", "runtime_integrity.py", "runtime_profile.py")


def run(argv: list[str], env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
    if proc.returncode != 0:
        raise SystemExit(f"command failed ({proc.returncode}): {' '.join(argv)}\n{proc.stderr}")
    return proc


def python_version(python_executable: Path) -> str:
    proc = run([str(python_executable), "-I", "-B", "-c", "import platform; print(platform.python_version())"])
    return proc.stdout.strip()


def build(output_dir: Path, python_executable: Path, vendor_source: Path | None = None) -> Path:
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

    if vendor_source is None:
        run([str(python_executable), "-I", "-B", str(HERE / "prepare_vendor.py"), str(vendor_dir)])
    else:
        run([str(python_executable), "-I", "-B", str(HERE / "prepare_vendor.py"), str(vendor_source), "--verify-only"])
        shutil.copytree(vendor_source, vendor_dir, symlinks=True)

    repository_root = ENGINE.parents[1]
    for name in ("NOTICE", "THIRD_PARTY_LICENSES.md"):
        source = repository_root / name
        if not source.is_file():
            raise SystemExit(f"required release notice missing: {source}")
        shutil.copy2(source, output_dir / name)
    python_root = python_executable.parent.parent
    python_license = next((candidate for candidate in (
        python_root / "LICENSE.txt",
        python_root / "LICENSE",
        python_root / "lib" / f"python{VERSIONS['python']['series']}" / "LICENSE.txt",
    ) if candidate.is_file()), None)
    if python_license is None:
        raise SystemExit("managed Python license text is missing")
    license_dir = output_dir / "licenses" / "python"
    license_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(python_license, license_dir / "LICENSE.txt")

    entry = worker_dir / "cevra_media_worker.py"
    env = os.environ.copy()
    env.update({
        "CEVRA_MEDIA_RUNTIME_ROOT": str(output_dir.resolve()),
        "CEVRA_FFMPEG_SKILL_ROOT": str(vendor_dir.resolve()),
        "CEVRA_RELEASE_MODE": "0",
        "PYTHONNOUSERSITE": "1",
        "PYTHONDONTWRITEBYTECODE": "1",
    })
    info = run([str(python_executable), "-I", "-B", str(entry), "--info"], env=env)
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
    ap.add_argument("--vendor-source", type=Path, help="already prepared and verified ffmpeg-skill tree")
    args = ap.parse_args()
    python_executable = args.python.resolve()
    if not python_executable.is_file():
        raise SystemExit(f"Python executable missing: {python_executable}")
    vendor_source = args.vendor_source.resolve() if args.vendor_source else None
    result = build(args.output.resolve(), python_executable, vendor_source)
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
