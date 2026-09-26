#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
VERSIONS = json.loads((HERE / "versions.json").read_text(encoding="utf-8"))
PIN = VERSIONS["zlib"]


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


def gpg_path(path: Path, platform_name: str | None = None) -> str:
    if (platform_name or os.name) != "nt":
        return str(path)
    cygpath = shutil.which("cygpath")
    if cygpath is None:
        raise SystemExit("cygpath is required to pass confined paths to GnuPG on Windows")
    proc = subprocess.run(
        [cygpath, "-u", str(path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if proc.returncode != 0 or not proc.stdout.strip():
        raise SystemExit(f"could not translate Windows path for GnuPG: {path}")
    return proc.stdout.strip()


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


def extract_signing_key(source: Path, destination: Path) -> None:
    try:
        text = source.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise SystemExit("invalid zlib signing-key source") from exc
    match = re.search(
        r"-----BEGIN PGP PUBLIC KEY BLOCK-----.*?-----END PGP PUBLIC KEY BLOCK-----",
        text,
        re.DOTALL,
    )
    if match is None:
        raise SystemExit("zlib signing-key source does not contain an armored public key")
    if text.count("-----BEGIN PGP PUBLIC KEY BLOCK-----") != 1:
        raise SystemExit("zlib signing-key source contains an ambiguous public key set")
    with destination.open("w", encoding="utf-8", newline="\n") as output:
        output.write(match.group(0) + "\n")


def extract_verified_archive(archive: Path, destination: Path) -> None:
    with tarfile.open(archive, "r:xz") as package:
        destination_root = destination.resolve(strict=True)
        for member in package.getmembers():
            member_path = destination / member.name
            try:
                member_path.resolve(strict=False).relative_to(destination_root)
            except ValueError as exc:
                raise SystemExit(f"zlib archive path escapes extraction root: {member.name}") from exc
            if member.ischr() or member.isblk() or member.isfifo():
                raise SystemExit(f"zlib archive contains unsupported special file: {member.name}")
            if member.issym() or member.islnk():
                link_path = (member_path.parent if member.issym() else destination) / member.linkname
                try:
                    link_path.resolve(strict=False).relative_to(destination_root)
                except ValueError as exc:
                    raise SystemExit(f"zlib archive link escapes extraction root: {member.name}") from exc
        if sys.version_info >= (3, 12):
            package.extractall(destination, filter="data")
        else:
            package.extractall(destination)


def verify_source_layout(source: Path) -> None:
    required = ("zlib.h", "zconf.h", "LICENSE", "win32/Makefile.msc")
    for relative in required:
        if not (source / relative).is_file():
            raise SystemExit(f"verified zlib archive is missing {relative}")
    header = (source / "zlib.h").read_text(encoding="utf-8", errors="strict")
    if re.search(r'^#define\s+ZLIB_VERSION\s+"1\.3\.2"$', header, re.MULTILINE) is None:
        raise SystemExit("verified zlib source does not declare version 1.3.2")
    if sha256(source / "LICENSE") != PIN["licenseSha256"]:
        raise SystemExit("verified zlib source license does not match the pinned release")


def prepare(destination: Path) -> Path:
    if shutil.which("gpg") is None:
        raise SystemExit("gpg is required to verify the zlib release signature")
    if shutil.which("gpgv") is None:
        raise SystemExit("gpgv is required to verify the zlib release signature")
    destination.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="cevra-zlib-source-") as temp_name:
        temp = Path(temp_name)
        archive = temp / f"zlib-{PIN['version']}.tar.xz"
        signature = archive.with_suffix(archive.suffix + ".asc")
        key_source = temp / "mark-adler-pgp.html"
        key = temp / "mark-adler.asc"
        download(PIN["source"], archive)
        download(PIN["signature"], signature)
        download(PIN["signingKey"], key_source)
        if sha256(key_source) != PIN["signingKeySourceSha256"]:
            raise SystemExit(f"zlib signing-key source SHA-256 mismatch: {sha256(key_source)}")
        extract_signing_key(key_source, key)

        digests = {
            "archive": sha256(archive),
            "signature": sha256(signature),
            "signingKey": sha256(key),
        }
        expected_digests = {
            "archive": PIN["archiveSha256"],
            "signature": PIN["signatureSha256"],
            "signingKey": PIN["signingKeySha256"],
        }
        for name, actual in digests.items():
            if actual != expected_digests[name]:
                raise SystemExit(f"zlib {name} SHA-256 mismatch: {actual}")

        gnupg = temp / "gnupg"
        gnupg.mkdir(mode=0o700)
        env = os.environ.copy()
        env["GNUPGHOME"] = gpg_path(gnupg)
        listing = command(
            ["gpg", "--batch", "--with-colons", "--import-options", "show-only", "--import", gpg_path(key)],
            env=env,
        )
        fingerprints = {
            line.split(":")[9].upper()
            for line in listing.splitlines()
            if line.startswith("fpr:") and len(line.split(":")) > 9
        }
        expected = PIN["signingFingerprint"].upper()
        if expected not in fingerprints:
            raise SystemExit(f"zlib signing key fingerprint mismatch: expected {expected}")
        keyring = temp / "zlib-signing-key.gpg"
        command(["gpg", "--batch", "--yes", "--dearmor", "--output", gpg_path(keyring), gpg_path(key)], env=env)
        verification = command(
            ["gpgv", "--status-fd", "1", "--keyring", gpg_path(keyring), gpg_path(signature), gpg_path(archive)],
            env=env,
        )
        if not signature_matches(verification, expected):
            raise SystemExit(f"zlib release signature was not made by pinned fingerprint {expected}")

        extract_root = temp / "extract"
        extract_root.mkdir()
        extract_verified_archive(archive, extract_root)
        source = extract_root / f"zlib-{PIN['version']}"
        verify_source_layout(source)
        target = destination / f"zlib-{PIN['version']}"
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source, target, symlinks=True)
        shutil.copy2(archive, target / "CEVRA_SOURCE_ARCHIVE.tar.xz")
        shutil.copy2(signature, target / "CEVRA_SOURCE_ARCHIVE.tar.xz.asc")
        shutil.copy2(key, target / "CEVRA_SIGNING_KEY.asc")
        shutil.copy2(key_source, target / "CEVRA_SIGNING_KEY_SOURCE.html")
        provenance = {
            "id": "zlib-source",
            "version": PIN["version"],
            "source": PIN["source"],
            "signature": PIN["signature"],
            "signingKeySource": PIN["signingKey"],
            "signingFingerprint": PIN["signingFingerprint"],
            "verifiedSignerFingerprint": expected,
            "archiveSha256": digests["archive"],
            "signatureSha256": digests["signature"],
            "signingKeySourceSha256": sha256(key_source),
            "signingKeySha256": digests["signingKey"],
            "license": PIN["license"],
            "licenseSha256": sha256(source / "LICENSE"),
            "verified": True,
        }
        (target / "CEVRA_SOURCE_PROVENANCE.json").write_text(
            json.dumps(provenance, indent=2) + "\n",
            encoding="utf-8",
        )
        return target


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare the signed, pinned zlib source release")
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    print(prepare(args.destination.resolve()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
