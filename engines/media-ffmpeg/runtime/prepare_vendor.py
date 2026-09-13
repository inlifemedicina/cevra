#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
VERSIONS = json.loads((HERE / "versions.json").read_text(encoding="utf-8"))
PIN = VERSIONS["ffmpegSkill"]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(*argv: str, cwd: Path | None = None) -> str:
    proc = subprocess.run(argv, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise SystemExit(f"command failed ({proc.returncode}): {' '.join(argv)}\n{proc.stderr}")
    return proc.stdout.strip()


def prepare(destination: Path) -> None:
    if destination.exists():
        raise SystemExit(f"refusing to replace existing ffmpeg-skill destination: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    run("git", "clone", "--filter=blob:none", "--no-checkout", PIN["repository"], str(destination))
    run("git", "checkout", "--detach", PIN["commit"], cwd=destination)
    actual = run("git", "rev-parse", "HEAD", cwd=destination)
    if actual != PIN["commit"]:
        raise SystemExit(f"ffmpeg-skill checkout mismatch: {actual} != {PIN['commit']}")
    run(sys.executable, "-I", "-B", str(HERE / "patch_ffmpeg_skill.py"), str(destination))
    verify_prepared(destination)
    shutil.rmtree(destination / ".git", ignore_errors=True)


def verify_prepared(destination: Path) -> None:
    try:
        package = json.loads((destination / "package.json").read_text(encoding="utf-8"))
        provenance = json.loads((destination / "CEVRA_PROVENANCE.json").read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise SystemExit("prepared ffmpeg-skill metadata is missing or invalid") from exc
    if package.get("version") != PIN["version"]:
        raise SystemExit(f"ffmpeg-skill package version mismatch: {package.get('version')!r}")
    expected_provenance = {
        "upstream": "kajisho5/ffmpeg-skill",
        "version": PIN["version"],
        "commit": PIN["commit"],
        "patch": "CEVRA_MEDIA_RUNTIME_PATCH_V1",
    }
    if not isinstance(provenance, dict) or any(provenance.get(key) != value for key, value in expected_provenance.items()):
        raise SystemExit("prepared ffmpeg-skill provenance does not match the pin")
    license_path = destination / "LICENSE"
    if not license_path.is_file() or sha256(license_path) != PIN["licenseSha256"]:
        raise SystemExit("prepared ffmpeg-skill MIT license is missing or does not match the audited text")
    common = destination / "scripts" / "_common.py"
    runtime_module = destination / "scripts" / "_cevra_runtime.py"
    if not common.is_file() or common.read_text(encoding="utf-8").count("# CEVRA_MEDIA_RUNTIME_PATCH_V1") != 1:
        raise SystemExit("prepared ffmpeg-skill does not contain the reviewed CEVRA patch")
    if not runtime_module.is_file() or sha256(runtime_module) != sha256(HERE / "_cevra_runtime.py"):
        raise SystemExit("prepared ffmpeg-skill runtime resolver is missing or modified")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("destination", type=Path)
    ap.add_argument("--verify-only", action="store_true")
    args = ap.parse_args()
    destination = args.destination.resolve()
    if args.verify_only:
        verify_prepared(destination)
    else:
        prepare(destination)
    print(destination)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
