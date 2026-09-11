#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
VERSIONS = json.loads((HERE / "versions.json").read_text(encoding="utf-8"))
PIN = VERSIONS["ffmpegSkill"]


def run(*argv: str, cwd: Path | None = None) -> str:
    proc = subprocess.run(argv, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise SystemExit(f"command failed ({proc.returncode}): {' '.join(argv)}\n{proc.stderr}")
    return proc.stdout.strip()


def prepare(destination: Path) -> None:
    if destination.exists():
        shutil.rmtree(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    run("git", "clone", "--filter=blob:none", "--no-checkout", PIN["repository"], str(destination))
    run("git", "checkout", "--detach", PIN["commit"], cwd=destination)
    actual = run("git", "rev-parse", "HEAD", cwd=destination)
    if actual != PIN["commit"]:
        raise SystemExit(f"ffmpeg-skill checkout mismatch: {actual} != {PIN['commit']}")
    package = json.loads((destination / "package.json").read_text(encoding="utf-8"))
    if package.get("version") != PIN["version"]:
        raise SystemExit(f"ffmpeg-skill package version mismatch: {package.get('version')!r}")
    if not (destination / "LICENSE").is_file():
        raise SystemExit("ffmpeg-skill LICENSE is missing")
    run(sys.executable, str(HERE / "patch_ffmpeg_skill.py"), str(destination))
    shutil.rmtree(destination / ".git", ignore_errors=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("destination", type=Path)
    args = ap.parse_args()
    prepare(args.destination.resolve())
    print(args.destination.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
