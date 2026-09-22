#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
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


def signature_matches(status_output: str, expected_fingerprint: str) -> bool:
    expected = expected_fingerprint.upper()
    for line in status_output.splitlines():
        fields = line.split()
        if len(fields) < 11 or fields[:2] != ["[GNUPG:]", "VALIDSIG"]:
            continue
        signer = fields[2].upper()
        primary = fields[11].upper() if len(fields) > 11 else signer
        if expected in (signer, primary):
            return True
    return False


def extract_verified_archive(archive: Path, destination: Path) -> None:
    with tarfile.open(archive, "r:xz") as package:
        destination_root = destination.resolve(strict=True)
        for member in package.getmembers():
            member_path = destination / member.name
            try:
                member_path.resolve(strict=False).relative_to(destination_root)
            except ValueError as exc:
                raise SystemExit(f"FFmpeg archive path escapes extraction root: {member.name}") from exc
            if member.ischr() or member.isblk() or member.isfifo():
                raise SystemExit(f"FFmpeg archive contains unsupported special file: {member.name}")
            if member.issym() or member.islnk():
                link_path = (member_path.parent if member.issym() else destination) / member.linkname
                try:
                    link_path.resolve(strict=False).relative_to(destination_root)
                except ValueError as exc:
                    raise SystemExit(f"FFmpeg archive link escapes extraction root: {member.name}") from exc
        if sys.version_info >= (3, 12):
            package.extractall(destination, filter="data")
        else:
            package.extractall(destination)


def prepare(destination: Path) -> Path:
    if shutil.which("gpg") is None:
        raise SystemExit("gpg is required to verify the FFmpeg release signature")
    if shutil.which("gpgv") is None:
        raise SystemExit("gpgv is required to verify the FFmpeg release signature")
    destination.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="cevra-ffmpeg-source-") as temp_name:
        temp = Path(temp_name)
        archive = temp / f"ffmpeg-{PIN['version']}.tar.xz"
        signature = archive.with_suffix(archive.suffix + ".asc")
        key = temp / "ffmpeg-devel.asc"
        download(PIN["source"], archive)
        download(PIN["signature"], signature)
        download(PIN["signingKey"], key)
        digests = {"archive": sha256(archive), "signature": sha256(signature), "signingKey": sha256(key)}
        expected_digests = {"archive": PIN["archiveSha256"], "signature": PIN["signatureSha256"], "signingKey": PIN["signingKeySha256"]}
        for name, actual in digests.items():
            if actual != expected_digests[name]:
                raise SystemExit(f"FFmpeg {name} SHA-256 mismatch: {actual}")

        gnupg = temp / "gnupg"
        gnupg.mkdir(mode=0o700)
        env = os.environ.copy()
        env["GNUPGHOME"] = str(gnupg)
        listing = command(["gpg", "--batch", "--with-colons", "--import-options", "show-only", "--import", str(key)], env=env)
        fingerprints = {line.split(":")[9].upper() for line in listing.splitlines() if line.startswith("fpr:") and len(line.split(":")) > 9}
        expected = PIN["signingFingerprint"].upper()
        if expected not in fingerprints:
            raise SystemExit(f"FFmpeg signing key fingerprint mismatch: expected {expected}")
        keyring = temp / "ffmpeg-signing-key.gpg"
        command(["gpg", "--batch", "--yes", "--dearmor", "--output", str(keyring), str(key)], env=env)
        verification = command(["gpgv", "--status-fd", "1", "--keyring", str(keyring), str(signature), str(archive)], env=env)
        if not signature_matches(verification, expected):
            raise SystemExit(f"FFmpeg release signature was not made by pinned fingerprint {expected}")

        extract_root = temp / "extract"
        extract_root.mkdir()
        extract_verified_archive(archive, extract_root)
        source = extract_root / f"ffmpeg-{PIN['version']}"
        if not (source / "configure").is_file():
            raise SystemExit("verified FFmpeg archive does not contain the expected source tree")
        target = destination / f"ffmpeg-{PIN['version']}"
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source, target, symlinks=True)
        shutil.copy2(archive, target / "CEVRA_SOURCE_ARCHIVE.tar.xz")
        shutil.copy2(signature, target / "CEVRA_SOURCE_ARCHIVE.tar.xz.asc")
        shutil.copy2(key, target / "CEVRA_SIGNING_KEY.asc")
        provenance = {
            "id": "ffmpeg-source",
            "version": PIN["version"],
            "source": PIN["source"],
            "signature": PIN["signature"],
            "signingFingerprint": PIN["signingFingerprint"],
            "verifiedSignerFingerprint": expected,
            "archiveSha256": digests["archive"],
            "signatureSha256": digests["signature"],
            "signingKeySha256": digests["signingKey"],
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
