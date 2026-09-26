#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
VERSIONS = json.loads((HERE / "versions.json").read_text(encoding="utf-8"))
PIN = VERSIONS["python"]
PROVENANCE_NAME = "CEVRA_PYTHON_PROVENANCE.json"
PRUNING_POLICY = {
    "version": 1,
    "paths": [
        "lib/python3.12/ensurepip", "lib/python3.12/idlelib", "lib/python3.12/lib2to3",
        "lib/python3.12/tkinter", "lib/python3.12/turtledemo", "lib/python3.12/site-packages",
        "lib/tcl9", "lib/tcl9.0", "lib/tk9.0",
    ],
    "globs": [
        "bin/pip*", "bin/idle*", "bin/2to3*", "bin/tclsh*", "bin/wish*",
        "lib/itcl*", "lib/thread*", "lib/libtcl*", "lib/libtk*",
        "lib/python3.12/lib-dynload/_tkinter*", "share/man/man1/pip*", "share/man/man1/idle*", "share/man/man1/2to3*",
    ],
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def platform_key() -> str:
    if os.name == "nt":
        system = "win32"
    elif sys.platform == "darwin":
        system = "darwin"
    elif sys.platform.startswith("linux"):
        system = "linux"
    else:
        raise SystemExit(f"no managed CPython artifact is defined for {sys.platform}")
    machine = platform.machine().lower()
    if machine in ("arm64", "aarch64"):
        arch = "arm64"
    elif machine in ("x86_64", "amd64"):
        arch = "x64"
    else:
        raise SystemExit(f"no managed CPython artifact is defined for {system}/{machine}")
    return f"{system}-{arch}"


def artifact_for_target(key: str) -> dict[str, str]:
    artifact = PIN.get("artifacts", {}).get(key)
    if not isinstance(artifact, dict):
        raise SystemExit(f"managed CPython artifact is not pinned for {key}")
    for field in ("url", "sha256", "executable"):
        if not isinstance(artifact.get(field), str) or not artifact[field]:
            raise SystemExit(f"managed CPython artifact {key} is missing {field}")
    return artifact


def artifact_for_host() -> tuple[str, dict[str, str]]:
    key = platform_key()
    artifact = artifact_for_target(key)
    return key, artifact


def download(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "CEVRA-Media-Runtime-Builder/0.1"})
    with urllib.request.urlopen(request, timeout=120) as response, destination.open("wb") as output:
        shutil.copyfileobj(response, output)


def _version(executable: Path) -> str:
    result = subprocess.run(
        [str(executable), "-I", "-B", "-c", "import platform; print(platform.python_version())"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=30,
        check=True,
    )
    return result.stdout.strip()


def _license_path(root: Path) -> Path | None:
    for relative in ("LICENSE", "LICENSE.txt", f"lib/python{PIN['series']}/LICENSE.txt"):
        candidate = root / relative
        if candidate.is_file():
            return candidate
    return None


def _extract_archive(archive: Path, destination: Path) -> None:
    with tarfile.open(archive, "r:gz") as package:
        destination_root = destination.resolve(strict=True)
        for member in package.getmembers():
            member_path = destination / member.name
            try:
                member_path.resolve(strict=False).relative_to(destination_root)
            except ValueError as exc:
                raise SystemExit(f"managed CPython archive path escapes extraction root: {member.name}") from exc
            if member.issym() or member.islnk():
                link_path = (member_path.parent if member.issym() else destination) / member.linkname
                try:
                    link_path.resolve(strict=False).relative_to(destination_root)
                except ValueError as exc:
                    raise SystemExit(f"managed CPython archive link escapes extraction root: {member.name}") from exc
        if sys.version_info >= (3, 12):
            package.extractall(destination, filter="data")
        else:
            package.extractall(destination)


def _prune(root: Path) -> list[str]:
    removed: list[str] = []
    candidates = [root / relative for relative in PRUNING_POLICY["paths"]]
    for pattern in PRUNING_POLICY["globs"]:
        candidates.extend(root.glob(pattern))
    for path in sorted(set(candidates), key=lambda item: len(item.parts), reverse=True):
        if path.is_symlink() or path.is_file():
            path.unlink()
        elif path.is_dir():
            shutil.rmtree(path)
        else:
            continue
        removed.append(path.relative_to(root).as_posix())
    return sorted(removed)


def _assert_pruned(root: Path) -> None:
    remaining = [relative for relative in PRUNING_POLICY["paths"] if (root / relative).exists()]
    for pattern in PRUNING_POLICY["globs"]:
        remaining.extend(path.relative_to(root).as_posix() for path in root.glob(pattern))
    if remaining:
        raise SystemExit(f"managed CPython pruning is incomplete: {sorted(remaining)}")


def _runtime_components(executable: Path) -> list[dict[str, str]]:
    script = """import ctypes,json,platform,ssl,sqlite3,zlib,lzma,bz2
try:
 process = ctypes.CDLL(None)
except OSError:
 process = None
def native_version(symbol, fallback):
 if process is None:
  return fallback
 try:
  fn = getattr(process, symbol); fn.restype = ctypes.c_char_p
  return fn().decode().split(',')[0]
 except (AttributeError, OSError):
  return fallback
components = [
 {'id':'cpython','version':platform.python_version(),'license':'PSF-2.0'},
 {'id':'openssl','version':ssl.OPENSSL_VERSION.split()[1],'license':'Apache-2.0'},
 {'id':'sqlite','version':sqlite3.sqlite_version,'license':'blessing/public-domain'},
 {'id':'zlib','version':zlib.ZLIB_VERSION,'license':'Zlib'},
 {'id':'liblzma','version':native_version('lzma_version_string','embedded'),'license':'0BSD/LGPL-2.1-or-later'},
 {'id':'bzip2','version':native_version('BZ2_bzlibVersion','1.0.8'),'license':'bzip2-1.0.8'},
 {'id':'libffi','version':'3.4.8','license':'MIT'}]
if platform.system() == 'Darwin': components[3]['providedByPlatform'] = 'true'
print(json.dumps(components))"""
    result = subprocess.run(
        [str(executable), "-I", "-B", "-c", script],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        raise SystemExit(f"managed CPython component inventory failed: {result.stderr.strip()}")
    return json.loads(result.stdout)


def verify_prepared(root: Path) -> Path:
    key, artifact = artifact_for_host()
    provenance_path = root / PROVENANCE_NAME
    try:
        provenance: Any = json.loads(provenance_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise SystemExit("managed CPython provenance is missing or invalid") from exc
    expected = {
        "format": "cevra-managed-python",
        "formatVersion": 1,
        "distribution": PIN["distribution"],
        "release": PIN["release"],
        "version": PIN["version"],
        "platform": key,
        "artifact": artifact["url"],
        "artifactSha256": artifact["sha256"],
        "licenseSha256": PIN["licenseSha256"],
        "verified": True,
    }
    if not isinstance(provenance, dict) or any(provenance.get(field) != value for field, value in expected.items()):
        raise SystemExit("managed CPython provenance does not match the pinned release artifact")
    executable = root / artifact["executable"]
    if executable.is_symlink() or not executable.is_file():
        raise SystemExit("managed CPython executable is missing or is a symlink")
    try:
        executable.resolve(strict=True).relative_to(root.resolve(strict=True))
    except ValueError as exc:
        raise SystemExit("managed CPython executable escapes its runtime root") from exc
    if _version(executable) != PIN["version"]:
        raise SystemExit("managed CPython executable version does not match the pin")
    license_path = _license_path(root)
    if license_path is None:
        raise SystemExit("managed CPython license text is missing")
    if sha256(license_path) != PIN["licenseSha256"]:
        raise SystemExit("managed CPython license text does not match the audited pin")
    _assert_pruned(root)
    components = _runtime_components(executable)
    if provenance.get("pruning") != {"policy": PRUNING_POLICY, "verifiedAbsent": True, "dependencyAudit": "CEVRA worker and ffmpeg-skill 1.4.2 use Python stdlib only and do not import pip, ensurepip, IDLE, lib2to3, tkinter, turtledemo or Tcl/Tk."}:
        raise SystemExit("managed CPython pruning provenance is missing or invalid")
    if provenance.get("nativeComponents") != components:
        raise SystemExit("managed CPython native component provenance does not match the prepared runtime")
    return executable


def prepare(destination: Path, archive: Path | None = None) -> Path:
    if destination.exists():
        raise SystemExit(f"refusing to replace existing managed CPython directory: {destination}")
    key, artifact = artifact_for_host()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="cevra-python-runtime-", dir=destination.parent) as temp_name:
        temp = Path(temp_name)
        downloaded = temp / "python.tar.gz"
        if archive is None:
            download(artifact["url"], downloaded)
        else:
            shutil.copy2(archive, downloaded)
        actual_hash = sha256(downloaded)
        if actual_hash != artifact["sha256"]:
            raise SystemExit(f"managed CPython artifact hash mismatch: {actual_hash}")
        extract = temp / "extract"
        extract.mkdir()
        _extract_archive(downloaded, extract)
        root = extract / "python"
        if not root.is_dir():
            raise SystemExit("managed CPython archive does not contain the expected python/ root")
        removed = _prune(root)
        executable = root / artifact["executable"]
        _assert_pruned(root)
        provenance = {
            "format": "cevra-managed-python",
            "formatVersion": 1,
            "distribution": PIN["distribution"],
            "release": PIN["release"],
            "version": PIN["version"],
            "platform": key,
            "artifact": artifact["url"],
            "artifactSha256": artifact["sha256"],
            "licenseSha256": PIN["licenseSha256"],
            "verified": True,
            "pruning": {
                "policy": PRUNING_POLICY,
                "verifiedAbsent": True,
                "dependencyAudit": "CEVRA worker and ffmpeg-skill 1.4.2 use Python stdlib only and do not import pip, ensurepip, IDLE, lib2to3, tkinter, turtledemo or Tcl/Tk.",
            },
            "removed": removed,
            "nativeComponents": _runtime_components(executable),
        }
        (root / PROVENANCE_NAME).write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
        root.rename(destination)
    return verify_prepared(destination)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("destination", type=Path)
    parser.add_argument("--archive", type=Path, help="pre-downloaded pinned archive")
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    destination = args.destination.resolve()
    if args.verify_only:
        executable = verify_prepared(destination)
    else:
        executable = prepare(destination, args.archive.resolve() if args.archive else None)
    print(executable)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
