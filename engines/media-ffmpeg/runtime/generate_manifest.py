#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import subprocess
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
VERSIONS = json.loads((HERE / "versions.json").read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ffmpeg_metadata(binary: Path) -> dict[str, Any]:
    version_out = subprocess.run([str(binary), "-version"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=True).stdout
    first = version_out.splitlines()[0] if version_out else ""
    match = re.search(r"ffmpeg version\s+([^\s]+)", first)
    version = match.group(1) if match else first
    build_out = subprocess.run([str(binary), "-buildconf"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=True).stdout
    flags = sorted(set(re.findall(r"--[a-zA-Z0-9_-]+(?:=[^\s]+)?", build_out)))
    if any(flag.startswith("--enable-nonfree") for flag in flags):
        license_name = "NONFREE"
    elif any(flag.startswith("--enable-gpl") for flag in flags):
        license_name = "GPL"
    elif any(flag.startswith("--enable-version3") for flag in flags):
        license_name = "LGPL-3.0-or-later"
    else:
        license_name = "LGPL-2.1-or-later"
    canonical_flags = "\n".join(flags).encode("utf-8")
    return {
        "version": version,
        "license": license_name,
        "configureFlags": flags,
        "configureFlagsSha256": hashlib.sha256(canonical_flags).hexdigest(),
    }


def generate(runtime_dir: Path) -> dict[str, Any]:
    exe = ".exe" if os.name == "nt" else ""
    worker = runtime_dir / f"cevra-media-worker{exe}"
    ffmpeg = runtime_dir / "bin" / f"ffmpeg{exe}"
    ffprobe = runtime_dir / "bin" / f"ffprobe{exe}"
    for path in (worker, ffmpeg, ffprobe):
        if not path.is_file():
            raise SystemExit(f"runtime component missing: {path}")

    worker_info = subprocess.run([str(worker), "--info"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
    info = json.loads(worker_info.stdout)
    meta = ffmpeg_metadata(ffmpeg)
    pinned_ffmpeg = VERSIONS["ffmpeg"]["version"]
    if not (meta["version"] == pinned_ffmpeg or str(meta["version"]).startswith(pinned_ffmpeg + "-")):
        raise SystemExit(f"FFmpeg version {meta['version']} does not match pin {pinned_ffmpeg}")
    if meta["license"] not in ("LGPL-2.1-or-later", "LGPL-3.0-or-later"):
        raise SystemExit(f"refusing runtime FFmpeg classified as {meta['license']}")
    forbidden = ("--enable-gpl", "--enable-nonfree", "--enable-libx264", "--enable-libx265")
    if any(flag.startswith(forbidden) for flag in meta["configureFlags"]):
        raise SystemExit("refusing runtime with forbidden FFmpeg configure flags")
    if "--disable-autodetect" not in meta["configureFlags"]:
        raise SystemExit("refusing runtime without --disable-autodetect provenance")

    upstream = info.get("upstream") or {}
    pin = VERSIONS["ffmpegSkill"]
    if upstream.get("version") != pin["version"] or upstream.get("commit") != pin["commit"]:
        raise SystemExit("worker upstream provenance does not match versions.json")

    ffmpeg_sha = sha256(ffmpeg)
    manifest = {
        "format": "cevra-media-runtime",
        "formatVersion": 1,
        "runtimeVersion": VERSIONS["mediaRuntime"],
        "workerVersion": info.get("version"),
        "platform": sys_platform(),
        "arch": platform.machine() or "unknown",
        "workerSha256": sha256(worker),
        "upstream": {
            "id": "ffmpeg-skill",
            "version": pin["version"],
            "contractVersion": pin["contractVersion"],
            "commit": pin["commit"],
        },
        "ffmpeg": {
            "version": meta["version"],
            "license": meta["license"],
            "buildId": ffmpeg_sha[:16],
            "sha256": ffmpeg_sha,
            "ffprobeSha256": sha256(ffprobe),
            "configureFlagsSha256": meta["configureFlagsSha256"],
            "configureFlags": meta["configureFlags"],
            "source": VERSIONS["ffmpeg"]["source"],
            "sourceSignature": VERSIONS["ffmpeg"]["signature"],
            "signingFingerprint": VERSIONS["ffmpeg"]["signingFingerprint"],
        },
    }
    return manifest


def sys_platform() -> str:
    if os.name == "nt":
        return "win32"
    import sys
    if sys.platform == "darwin":
        return "darwin"
    if sys.platform.startswith("linux"):
        return "linux"
    return "unknown"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("runtime", type=Path)
    ap.add_argument("--output", type=Path)
    args = ap.parse_args()
    runtime = args.runtime.resolve()
    manifest = generate(runtime)
    output = args.output.resolve() if args.output else runtime / "manifest.json"
    output.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
