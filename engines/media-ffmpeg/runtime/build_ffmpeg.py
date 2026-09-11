#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
VERSIONS = json.loads((HERE / "versions.json").read_text(encoding="utf-8"))
PIN = VERSIONS["ffmpeg"]

COMMON_FLAGS = [
    "--disable-autodetect",
    "--disable-gpl",
    "--disable-nonfree",
    "--disable-debug",
    "--disable-doc",
    "--disable-ffplay",
    "--disable-network",
    "--enable-ffmpeg",
    "--enable-ffprobe",
]

PLATFORM_FLAGS = {
    "Darwin": [
        "--enable-videotoolbox",
        "--enable-audiotoolbox",
        "--enable-avfoundation",
    ],
    "Windows": [
        "--toolchain=msvc",
        "--enable-mediafoundation",
        "--enable-d3d11va",
        "--enable-dxva2",
    ],
    "Linux": [],
}


def run(argv: list[str], cwd: Path, env: dict[str, str] | None = None) -> None:
    proc = subprocess.run(argv, cwd=cwd, env=env)
    if proc.returncode != 0:
        raise SystemExit(proc.returncode)


def validate_flags(flags: list[str]) -> None:
    forbidden = ("--enable-gpl", "--enable-nonfree", "--enable-libx264", "--enable-libx265")
    bad = [flag for flag in flags if flag.startswith(forbidden)]
    if bad:
        raise SystemExit(f"forbidden FFmpeg configure flags: {bad}")
    if "--disable-autodetect" not in flags:
        raise SystemExit("CEVRA FFmpeg builds must disable external autodetection")


def build(source: Path, prefix: Path, jobs: int) -> None:
    system = platform.system()
    if system not in PLATFORM_FLAGS:
        raise SystemExit(f"unsupported build host {system}")
    configure = source / "configure"
    if not configure.is_file():
        raise SystemExit(f"FFmpeg configure script missing under {source}")
    provenance = source / "CEVRA_SOURCE_PROVENANCE.json"
    if not provenance.is_file():
        raise SystemExit("refusing unverified FFmpeg source: CEVRA_SOURCE_PROVENANCE.json missing")
    source_info = json.loads(provenance.read_text(encoding="utf-8"))
    if source_info.get("version") != PIN["version"] or source_info.get("verified") is not True:
        raise SystemExit("FFmpeg source provenance does not match the pinned verified release")

    prefix.mkdir(parents=True, exist_ok=True)
    flags = [*COMMON_FLAGS, *PLATFORM_FLAGS[system], f"--prefix={prefix}"]
    validate_flags(flags)
    env = os.environ.copy()
    env.setdefault("SOURCE_DATE_EPOCH", "0")

    # configure is a POSIX shell script. On Windows this script is expected to run inside
    # an MSYS2/Git-Bash environment with the MSVC toolchain environment already activated.
    shell = shutil.which("bash")
    if shell is None:
        raise SystemExit("bash is required to configure FFmpeg")
    make = shutil.which("make")
    if make is None:
        raise SystemExit("make is required to build FFmpeg")

    run([shell, str(configure), *flags], cwd=source, env=env)
    run([make, f"-j{max(1, jobs)}"], cwd=source, env=env)
    run([make, "install"], cwd=source, env=env)

    binary = prefix / "bin" / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
    probe = prefix / "bin" / ("ffprobe.exe" if os.name == "nt" else "ffprobe")
    if not binary.is_file() or not probe.is_file():
        raise SystemExit("FFmpeg build did not produce ffmpeg and ffprobe")

    version = subprocess.run([str(binary), "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True).stdout
    first = version.splitlines()[0] if version else ""
    if PIN["version"] not in first:
        raise SystemExit(f"built FFmpeg version mismatch: {first}")
    buildconf = subprocess.run([str(binary), "-buildconf"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=True).stdout
    if "--enable-gpl" in buildconf or "--enable-nonfree" in buildconf or "--enable-libx264" in buildconf or "--enable-libx265" in buildconf:
        raise SystemExit("release FFmpeg contains forbidden GPL/nonfree configuration")
    if "--disable-autodetect" not in buildconf:
        raise SystemExit("release FFmpeg provenance is missing --disable-autodetect")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", type=Path)
    ap.add_argument("prefix", type=Path)
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    args = ap.parse_args()
    build(args.source.resolve(), args.prefix.resolve(), args.jobs)
    print(args.prefix.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
