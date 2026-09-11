#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENGINE = HERE.parent
WORKER_DIR = ENGINE / "worker"
WORKER_ENTRY = WORKER_DIR / "cevra_media_worker.py"
VERSIONS = json.loads((HERE / "versions.json").read_text(encoding="utf-8"))


def run(argv: list[str], cwd: Path | None = None, env: dict[str, str] | None = None) -> None:
    proc = subprocess.run(argv, cwd=cwd, env=env)
    if proc.returncode != 0:
        raise SystemExit(proc.returncode)


def build(output_dir: Path, work_dir: Path | None = None) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    own_temp = work_dir is None
    temp_context = tempfile.TemporaryDirectory(prefix="cevra-media-build-") if own_temp else None
    root = Path(temp_context.name) if temp_context else work_dir.resolve()
    root.mkdir(parents=True, exist_ok=True)
    vendor = root / "vendor" / "ffmpeg-skill"
    run([sys.executable, str(HERE / "prepare_vendor.py"), str(vendor)])

    dist = root / "dist"
    build_work = root / "pyinstaller"
    spec = root / "spec"
    data_arg = f"{vendor}{os.pathsep}vendor/ffmpeg-skill"
    env = os.environ.copy()
    env["PYTHONHASHSEED"] = "0"
    run([
        sys.executable, "-m", "PyInstaller",
        "--noconfirm", "--clean", "--onefile", "--console",
        "--name", "cevra-media-worker",
        "--paths", str(WORKER_DIR),
        "--add-data", data_arg,
        "--distpath", str(dist),
        "--workpath", str(build_work),
        "--specpath", str(spec),
        str(WORKER_ENTRY),
    ], cwd=ENGINE, env=env)

    executable_name = "cevra-media-worker.exe" if os.name == "nt" else "cevra-media-worker"
    built = dist / executable_name
    if not built.is_file():
        raise SystemExit(f"PyInstaller did not produce {built}")
    target = output_dir / executable_name
    shutil.copy2(built, target)

    info = subprocess.run([str(target), "--info"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if info.returncode != 0:
        raise SystemExit(f"built worker self-check failed:\n{info.stderr}")
    parsed = json.loads(info.stdout)
    if parsed.get("version") != VERSIONS["mediaRuntime"]:
        raise SystemExit("built worker version does not match versions.json")
    upstream = parsed.get("upstream") or {}
    if upstream.get("commit") != VERSIONS["ffmpegSkill"]["commit"]:
        raise SystemExit("built worker upstream provenance mismatch")

    if temp_context:
        temp_context.cleanup()
    return target


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("output", type=Path)
    ap.add_argument("--work-dir", type=Path)
    args = ap.parse_args()
    result = build(args.output.resolve(), args.work_dir.resolve() if args.work_dir else None)
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
