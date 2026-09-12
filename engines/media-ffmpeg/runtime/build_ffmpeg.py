#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
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
    "--enable-zlib",
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


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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
    if "--enable-zlib" not in flags:
        raise SystemExit("CEVRA FFmpeg builds must enable zlib for typed PNG frame extraction")


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
    required_source = {
        "id": "ffmpeg-source",
        "version": PIN["version"],
        "source": PIN["source"],
        "signature": PIN["signature"],
        "signingFingerprint": PIN["signingFingerprint"],
        "verified": True,
    }
    if any(source_info.get(key) != value for key, value in required_source.items()):
        raise SystemExit("FFmpeg source provenance does not match the pinned verified release")
    for field in ("archiveSha256", "signatureSha256", "signingKeySha256"):
        if re.fullmatch(r"[0-9a-f]{64}", str(source_info.get(field) or "")) is None:
            raise SystemExit(f"FFmpeg source provenance is missing {field}")

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
    version_match = re.search(r"ffmpeg version\s+([^\s]+)", first)
    if version_match is None:
        raise SystemExit(f"could not identify built FFmpeg: {first}")
    actual_version = version_match.group(1)
    buildconf = subprocess.run([str(binary), "-buildconf"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=True).stdout
    if "--enable-gpl" in buildconf or "--enable-nonfree" in buildconf or "--enable-libx264" in buildconf or "--enable-libx265" in buildconf:
        raise SystemExit("release FFmpeg contains forbidden GPL/nonfree configuration")
    if "--disable-autodetect" not in buildconf:
        raise SystemExit("release FFmpeg provenance is missing --disable-autodetect")
    if "--enable-zlib" not in buildconf:
        raise SystemExit("release FFmpeg provenance is missing --enable-zlib")

    probe_version_output = subprocess.run([str(probe), "-version"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=True).stdout
    probe_first = probe_version_output.splitlines()[0] if probe_version_output else ""
    if PIN["version"] not in probe_first:
        raise SystemExit(f"built ffprobe version mismatch: {probe_first}")
    probe_match = re.search(r"ffprobe version\s+([^\s]+)", probe_first)
    if probe_match is None:
        raise SystemExit(f"could not identify built ffprobe: {probe_first}")
    actual_probe_version = probe_match.group(1)
    configure_flags = sorted(set(part for part in buildconf.split() if part.startswith("--")))
    configure_hash = hashlib.sha256("\n".join(configure_flags).encode("utf-8")).hexdigest()
    license_name = "LGPL-3.0-or-later" if "--enable-version3" in configure_flags else "LGPL-2.1-or-later"

    license_source = source / "COPYING.LGPLv2.1"
    if not license_source.is_file():
        raise SystemExit("verified FFmpeg source is missing COPYING.LGPLv2.1")
    license_directory = prefix / "licenses" / "ffmpeg"
    license_directory.mkdir(parents=True, exist_ok=True)
    shutil.copy2(license_source, license_directory / "COPYING.LGPLv2.1")

    provenance_directory = prefix / "provenance"
    provenance_directory.mkdir(parents=True, exist_ok=True)
    build_provenance = {
        "id": "ffmpeg",
        "version": actual_version,
        "probeVersion": actual_probe_version,
        "license": license_name,
        "source": source_info["source"],
        "sourceSignature": source_info["signature"],
        "signingFingerprint": source_info["signingFingerprint"],
        "sourceArchiveSha256": source_info["archiveSha256"],
        "sourceSignatureSha256": source_info["signatureSha256"],
        "signingKeySha256": source_info["signingKeySha256"],
        "verified": True,
        "configureFlags": configure_flags,
        "configureFlagsSha256": configure_hash,
        "ffmpegSha256": sha256(binary),
        "ffprobeSha256": sha256(probe),
    }
    (provenance_directory / "ffmpeg.json").write_text(json.dumps(build_provenance, indent=2) + "\n", encoding="utf-8")


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
