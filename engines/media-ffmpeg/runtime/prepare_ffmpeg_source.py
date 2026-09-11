#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
VERSIONS = json.loads((HERE / "versions.json").read_text(encoding="utf-8"))
PIN = VERSIONS["ffmpeg"]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "CEVRA-Media-Runtime-Builder/0.1"})
    with urllib.request.urlopen(request, timeout=120) as response, destination.open("wb") as output:
        shutil.copyfileobj(response, output)


def command(argv: list[str], env: dict[str, str] | None = None) -> str:
    proc = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
    if proc.returncode != 0:
        raise SystemExit(f"command failed ({proc.returncode}): {' '.join(argv)}\n{proc.stderr}")
    return (proc.stdout or "") + (proc.stderr or "")


def prepare(destination: Path) -> Path:
    if shutil.which("gpg") is None:
        raise SystemExit("gpg is required to verify the FFmpeg release signature")
    destination.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="cevra-ffmpeg-source-") as temp_name:
        temp = Path(temp_name)
        archive = temp / f"ffmpeg-{PIN['version']}.tar.xz"
        signature = archive.with_suffix(archive.suffix + ".asc")
        key = temp / "ffmpeg-devel.asc"
        download(PIN["source"], archive)
        download(PIN["signature"], signature)
        download(PIN["signingKey"], key)

        gnupg = temp / "gnupg"
        gnupg.mkdir(mode=0o700)
        env = os.environ.copy()
        env["GNUPGHOME"] = str(gnupg)
        listing = command(["gpg", "--batch", "--with-colons", "--import-options", "show-only", "--import", str(key)], env=env)
        fingerprints = {line.split(":")[9].upper() for line in listing.splitlines() if line.startswith("fpr:") and len(line.split(":")) > 9}
        expected = PIN["signingFingerprint"].upper()
        if expected not in fingerprints:
            raise SystemExit(f"FFmpeg signing key fingerprint mismatch: expected {expected}")
        command(["gpg", "--batch", "--import", str(key)], env=env)
        command(["gpg", "--batch", "--verify", str(signature), str(archive)], env=env)

        extract_root = temp / "extract"
        extract_root.mkdir()
        with tarfile.open(archive, "r:xz") as tar:
            tar.extractall(extract_root, filter="data")
        source = extract_root / f"ffmpeg-{PIN['version']}"
        if not (source / "configure").is_file():
            raise SystemExit("verified FFmpeg archive does not contain the expected source tree")
        target = destination / f"ffmpeg-{PIN['version']}"
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source, target, symlinks=True)
        provenance = {
            "id": "ffmpeg-source",
            "version": PIN["version"],
            "source": PIN["source"],
            "signature": PIN["signature"],
            "signingFingerprint": PIN["signingFingerprint"],
            "archiveSha256": sha256(archive),
            "signatureSha256": sha256(signature),
            "signingKeySha256": sha256(key),
            "verified": True,
        }
        (target / "CEVRA_SOURCE_PROVENANCE.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
        return target


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("destination", type=Path)
    args = ap.parse_args()
    print(prepare(args.destination.resolve()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
