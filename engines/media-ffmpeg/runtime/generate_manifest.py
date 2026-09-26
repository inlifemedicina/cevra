#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ENGINE = HERE.parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(ENGINE / "worker"))
from runtime_integrity import CRITICAL_WORKER_FILES, RuntimeIntegrityError, required_notice_paths, sha256, tree_sha256

VERSIONS = json.loads((HERE / "versions.json").read_text(encoding="utf-8"))


def component(runtime: Path, relative: str, *, directory: bool = False) -> Path:
    path = runtime / relative
    try:
        resolved = path.resolve(strict=True)
        resolved.relative_to(runtime.resolve(strict=True))
    except (OSError, ValueError) as exc:
        raise SystemExit(f"runtime component missing or outside bundle: {relative}") from exc
    if directory and not resolved.is_dir():
        raise SystemExit(f"runtime component is not a directory: {relative}")
    if not directory and not resolved.is_file():
        raise SystemExit(f"runtime component is not a file: {relative}")
    return path


def relative_component(runtime: Path, path: Path, name: str) -> str:
    try:
        return path.absolute().relative_to(runtime.absolute()).as_posix()
    except ValueError as exc:
        raise SystemExit(f"{name} must belong to the CEVRA Media Runtime") from exc


def read_json(path: Path, name: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise SystemExit(f"invalid {name}") from exc
    if not isinstance(value, dict):
        raise SystemExit(f"invalid {name}")
    return value


def python_version(binary: Path) -> str:
    proc = subprocess.run(
        [str(binary), "-I", "-B", "-c", "import platform; print(platform.python_version())"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True,
        env={"PATH": str(binary.parent)},
    )
    return proc.stdout.strip()


def executable_version(binary: Path, product: str) -> str:
    output = subprocess.run(
        [str(binary), "-version"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=True,
        env={"PATH": str(binary.parent)}, timeout=10,
    ).stdout
    first = output.splitlines()[0] if output else ""
    match = re.search(rf"{product} version\s+([^\s]+)", first)
    if match is None:
        raise SystemExit(f"could not identify bundled {product}: {first}")
    return match.group(1)


def ffmpeg_metadata(binary: Path, probe: Path) -> dict[str, Any]:
    version = executable_version(binary, "ffmpeg")
    probe_version = executable_version(probe, "ffprobe")
    build_out = subprocess.run(
        [str(binary), "-buildconf"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=True,
        env={"PATH": str(binary.parent)}, timeout=10,
    ).stdout
    flags = sorted(set(re.findall(r"--[a-zA-Z0-9_-]+(?:=[^\s]+)?", build_out)))
    if any(flag.startswith("--enable-nonfree") for flag in flags):
        license_name = "NONFREE"
    elif any(flag.startswith("--enable-gpl") for flag in flags):
        license_name = "GPL"
    elif any(flag.startswith("--enable-version3") for flag in flags):
        license_name = "LGPL-3.0-or-later"
    else:
        license_name = "LGPL-2.1-or-later"
    return {
        "version": version,
        "probeVersion": probe_version,
        "license": license_name,
        "configureFlags": flags,
        "configureFlagsSha256": hashlib.sha256("\n".join(flags).encode("utf-8")).hexdigest(),
    }


def worker_version(worker: Path) -> str:
    match = re.search(r'^WORKER_VERSION\s*=\s*"([^"]+)"', worker.read_text(encoding="utf-8"), re.MULTILINE)
    if match is None:
        raise SystemExit("worker source does not declare WORKER_VERSION")
    return match.group(1)


def windows_zlib_metadata(runtime: Path, ffmpeg_provenance: dict[str, Any]) -> dict[str, Any]:
    pin = VERSIONS["zlib"]
    provenance_path = component(runtime, "provenance/zlib.json")
    provenance = read_json(provenance_path, "Windows zlib provenance")
    expected = {
        "id": "zlib",
        "version": pin["version"],
        "license": pin["license"],
        "source": pin["source"],
        "sourceSignature": pin["signature"],
        "signingKeySource": pin["signingKey"],
        "signingFingerprint": pin["signingFingerprint"],
        "verifiedSignerFingerprint": pin["signingFingerprint"].upper(),
        "sourceArchiveSha256": pin["archiveSha256"],
        "sourceSignatureSha256": pin["signatureSha256"],
        "signingKeySourceSha256": pin["signingKeySourceSha256"],
        "signingKeySha256": pin["signingKeySha256"],
        "licenseSha256": pin["licenseSha256"],
        "staticLink": True,
        "sourceModified": False,
        "machine": "x64",
        "crt": "static-mt",
        "buildMethod": "win32/Makefile.msc",
        "sourceArchive": f"sources/zlib/zlib-{pin['version']}.tar.xz",
        "sourceSignatureFile": f"sources/zlib/zlib-{pin['version']}.tar.xz.asc",
        "signingKeyFile": "sources/zlib/mark-adler.asc",
        "signingKeySourceFile": "sources/zlib/mark-adler-pgp.html",
        "buildInstructions": "sources/zlib/BUILD.md",
        "licenseFile": "licenses/zlib/LICENSE",
    }
    if any(provenance.get(key) != value for key, value in expected.items()):
        raise SystemExit("Windows zlib provenance does not match the pinned static build input")
    for field in ("librarySha256", "zlibHeaderSha256", "zconfHeaderSha256"):
        value = provenance.get(field)
        if not isinstance(value, str) or re.fullmatch(r"[0-9a-f]{64}", value) is None:
            raise SystemExit(f"Windows zlib provenance is missing {field}")
    if not isinstance(provenance.get("toolchain"), dict):
        raise SystemExit("Windows zlib provenance is missing toolchain identification")
    if not isinstance(provenance.get("smoke"), str) or not provenance["smoke"].startswith("zlib=1.3.2 roundtrip="):
        raise SystemExit("Windows zlib provenance is missing its static-link smoke result")
    artifact_hashes = {
        expected["sourceArchive"]: pin["archiveSha256"],
        expected["sourceSignatureFile"]: pin["signatureSha256"],
        expected["signingKeyFile"]: pin["signingKeySha256"],
        expected["signingKeySourceFile"]: pin["signingKeySourceSha256"],
        expected["licenseFile"]: pin["licenseSha256"],
    }
    for relative, digest in artifact_hashes.items():
        path = component(runtime, str(relative))
        if sha256(path) != digest:
            raise SystemExit(f"Windows zlib compliance artifact digest mismatch: {relative}")
    component(runtime, str(expected["buildInstructions"]))
    summary = {
        "version": pin["version"],
        "license": pin["license"],
        "sourceArchiveSha256": pin["archiveSha256"],
        "librarySha256": provenance["librarySha256"],
        "staticLink": True,
        "preparedBuildInput": True,
        "provenance": "provenance/zlib.json",
    }
    if ffmpeg_provenance.get("zlib") != summary:
        raise SystemExit("FFmpeg provenance does not bind the pinned Windows zlib build input")
    return {
        **expected,
        "librarySha256": provenance["librarySha256"],
        "zlibHeaderSha256": provenance["zlibHeaderSha256"],
        "zconfHeaderSha256": provenance["zconfHeaderSha256"],
        "provenance": "provenance/zlib.json",
        "provenanceSha256": sha256(provenance_path),
        "preparedBuildInput": True,
        "smoke": provenance["smoke"],
        "toolchain": provenance["toolchain"],
    }


def generate(runtime_dir: Path, python_binary: Path) -> dict[str, Any]:
    runtime = runtime_dir.absolute()
    if runtime.is_symlink() or not runtime.is_dir():
        raise SystemExit("runtime root must be a real directory")
    exe = ".exe" if os.name == "nt" else ""
    python_relative = relative_component(runtime, python_binary, "private Python")
    if not python_relative.startswith("python/") or python_binary.is_symlink():
        raise SystemExit("private Python executable must be a non-symlink file under runtime/python")
    python_binary = component(runtime, python_relative)
    python_root = component(runtime, "python", directory=True)
    python_provenance_path = component(runtime, "python/CEVRA_PYTHON_PROVENANCE.json")
    python_provenance = read_json(python_provenance_path, "managed Python provenance")
    ffmpeg = component(runtime, f"bin/ffmpeg{exe}")
    ffprobe = component(runtime, f"bin/ffprobe{exe}")
    worker_root = component(runtime, "worker", directory=True)
    worker_entry = component(runtime, "worker/cevra_media_worker.py")
    vendor_root = component(runtime, "vendor/ffmpeg-skill", directory=True)
    vendor_package = component(runtime, "vendor/ffmpeg-skill/package.json")
    vendor_provenance = component(runtime, "vendor/ffmpeg-skill/CEVRA_PROVENANCE.json")
    ffmpeg_provenance_path = component(runtime, "provenance/ffmpeg.json")
    for relative in CRITICAL_WORKER_FILES:
        component(runtime, relative)
    notices_required = required_notice_paths(sys_platform())
    for relative in notices_required.values():
        component(runtime, relative)
    component_notice_metadata: dict[str, dict[str, str]] = {}
    if sys_platform() == "darwin":
        components = {str(item.get("id")): item for item in (python_provenance.get("nativeComponents") or []) if isinstance(item, dict)}
        for notice in VERSIONS["python"].get("componentNotices", []):
            ident = str(notice.get("id") or "")
            component_id = str(notice.get("component") or "")
            version = str(notice.get("version") or "")
            if notices_required.get(ident) != notice.get("path") or sha256(runtime / str(notice.get("path"))) != notice.get("sha256"):
                raise SystemExit(f"managed Python component notice does not match its pin: {ident}")
            if components.get(component_id, {}).get("version") != version:
                raise SystemExit(f"managed Python component version does not match notice metadata: {component_id}")
            component_notice_metadata[ident] = {"component": component_id, "version": version}

    actual_python = python_version(python_binary)
    if actual_python != VERSIONS["python"]["version"]:
        raise SystemExit(f"Python version {actual_python} does not match pin {VERSIONS['python']['version']}")
    actual_worker = worker_version(worker_entry)
    if actual_worker != VERSIONS["mediaRuntime"]:
        raise SystemExit("worker source version does not match the media runtime pin")

    upstream_pin = VERSIONS["ffmpegSkill"]
    package = read_json(vendor_package, "ffmpeg-skill package.json")
    provenance = read_json(vendor_provenance, "ffmpeg-skill provenance")
    expected_vendor = {
        "upstream": "kajisho5/ffmpeg-skill", "version": upstream_pin["version"],
        "commit": upstream_pin["commit"], "patch": "CEVRA_MEDIA_RUNTIME_PATCH_V1",
    }
    if package.get("version") != upstream_pin["version"] or any(provenance.get(key) != value for key, value in expected_vendor.items()):
        raise SystemExit("vendored ffmpeg-skill content/provenance does not match the release pin")

    metadata = ffmpeg_metadata(ffmpeg, ffprobe)
    ffmpeg_pin = VERSIONS["ffmpeg"]
    for product_version in (metadata["version"], metadata["probeVersion"]):
        if not (product_version == ffmpeg_pin["version"] or str(product_version).startswith(ffmpeg_pin["version"] + "-")):
            raise SystemExit(f"FFmpeg component version {product_version} does not match pin {ffmpeg_pin['version']}")
    if metadata["license"] not in ("LGPL-2.1-or-later", "LGPL-3.0-or-later"):
        raise SystemExit(f"refusing runtime FFmpeg classified as {metadata['license']}")
    forbidden = ("--enable-gpl", "--enable-nonfree", "--enable-libx264", "--enable-libx265")
    if "--disable-autodetect" not in metadata["configureFlags"] or "--enable-zlib" not in metadata["configureFlags"] or any(flag.startswith(forbidden) for flag in metadata["configureFlags"]):
        raise SystemExit("refusing FFmpeg configure provenance outside the CEVRA release policy")

    ffmpeg_sha = sha256(ffmpeg)
    ffprobe_sha = sha256(ffprobe)
    ffmpeg_provenance = read_json(ffmpeg_provenance_path, "FFmpeg provenance")
    expected_ffmpeg_provenance = {
        "id": "ffmpeg", "version": metadata["version"], "probeVersion": metadata["probeVersion"],
        "license": metadata["license"], "source": ffmpeg_pin["source"],
        "sourceSignature": ffmpeg_pin["signature"], "signingFingerprint": ffmpeg_pin["signingFingerprint"],
        "verifiedSignerFingerprint": ffmpeg_pin["signingFingerprint"].upper(),
        "verified": True, "configureFlags": metadata["configureFlags"],
        "configureFlagsSha256": metadata["configureFlagsSha256"],
        "ffmpegSha256": ffmpeg_sha, "ffprobeSha256": ffprobe_sha,
    }
    if any(ffmpeg_provenance.get(key) != value for key, value in expected_ffmpeg_provenance.items()):
        raise SystemExit("FFmpeg provenance does not describe the bundled binaries")
    pinned_digests = {"sourceArchiveSha256": ffmpeg_pin["archiveSha256"], "sourceSignatureSha256": ffmpeg_pin["signatureSha256"], "signingKeySha256": ffmpeg_pin["signingKeySha256"]}
    for field, digest in pinned_digests.items():
        if ffmpeg_provenance.get(field) != digest:
            raise SystemExit(f"FFmpeg provenance {field} does not match the pin")
    source_paths = {
        "sourceArchive": f"sources/ffmpeg/ffmpeg-{ffmpeg_pin['version']}.tar.xz",
        "sourceSignatureFile": f"sources/ffmpeg/ffmpeg-{ffmpeg_pin['version']}.tar.xz.asc",
        "signingKeyFile": "sources/ffmpeg/ffmpeg-devel.asc",
        "buildInstructions": "sources/ffmpeg/BUILD.md",
    }
    for field, relative in source_paths.items():
        if ffmpeg_provenance.get(field) != relative:
            raise SystemExit(f"FFmpeg provenance {field} is invalid")
        component(runtime, relative)
    if sha256(runtime / source_paths["sourceArchive"]) != ffmpeg_pin["archiveSha256"] or sha256(runtime / source_paths["sourceSignatureFile"]) != ffmpeg_pin["signatureSha256"] or sha256(runtime / source_paths["signingKeyFile"]) != ffmpeg_pin["signingKeySha256"]:
        raise SystemExit("FFmpeg compliance source artifact digest mismatch")
    if not isinstance(ffmpeg_provenance.get("toolchain"), dict):
        raise SystemExit("FFmpeg provenance is missing toolchain identification")
    zlib_metadata = windows_zlib_metadata(runtime, ffmpeg_provenance) if sys_platform() == "win32" else None

    return {
        "format": "cevra-media-runtime", "formatVersion": 1,
        "runtimeVersion": actual_worker, "workerVersion": actual_worker,
        "platform": sys_platform(), "arch": platform.machine() or "unknown",
        "bundleTreeSha256": tree_sha256(runtime, frozenset({"manifest.json"})),
        "binFiles": [f"bin/ffmpeg{exe}", f"bin/ffprobe{exe}"],
        "python": {
            "version": actual_python, "root": "python", "executable": python_relative,
            "executableSha256": sha256(python_binary), "treeSha256": tree_sha256(python_root),
            "provenance": "python/CEVRA_PYTHON_PROVENANCE.json", "provenanceSha256": sha256(python_provenance_path),
            "pruning": python_provenance.get("pruning"), "nativeComponents": python_provenance.get("nativeComponents"),
        },
        "worker": {
            "root": "worker", "entrypoint": "worker/cevra_media_worker.py",
            "treeSha256": tree_sha256(worker_root),
            "files": [{"path": relative, "sha256": sha256(runtime / relative)} for relative in CRITICAL_WORKER_FILES],
        },
        "upstream": {
            "id": "ffmpeg-skill", "version": provenance["version"],
            "contractVersion": upstream_pin["contractVersion"], "commit": provenance["commit"],
            "root": "vendor/ffmpeg-skill", "treeSha256": tree_sha256(vendor_root),
            "package": "vendor/ffmpeg-skill/package.json", "packageSha256": sha256(vendor_package),
            "provenance": "vendor/ffmpeg-skill/CEVRA_PROVENANCE.json", "provenanceSha256": sha256(vendor_provenance),
        },
        "ffmpeg": {
            **metadata, "buildId": ffmpeg_sha[:16], "executable": f"bin/ffmpeg{exe}",
            "probeExecutable": f"bin/ffprobe{exe}", "sha256": ffmpeg_sha, "ffprobeSha256": ffprobe_sha,
            "provenance": "provenance/ffmpeg.json", "provenanceSha256": sha256(ffmpeg_provenance_path),
            "source": ffmpeg_provenance["source"], "sourceSignature": ffmpeg_provenance["sourceSignature"],
            "signingFingerprint": ffmpeg_provenance["signingFingerprint"],
            "verifiedSignerFingerprint": ffmpeg_provenance["verifiedSignerFingerprint"],
            "sourceArchiveSha256": ffmpeg_provenance["sourceArchiveSha256"],
            "sourceSignatureSha256": ffmpeg_provenance["sourceSignatureSha256"],
            "signingKeySha256": ffmpeg_provenance["signingKeySha256"],
            "sourceArchive": ffmpeg_provenance["sourceArchive"],
            "sourceSignatureFile": ffmpeg_provenance["sourceSignatureFile"],
            "signingKeyFile": ffmpeg_provenance["signingKeyFile"],
            "buildInstructions": ffmpeg_provenance["buildInstructions"],
            "toolchain": ffmpeg_provenance["toolchain"],
            **({"zlib": zlib_metadata} if zlib_metadata is not None else {}),
        },
        "notices": [
            {"id": ident, "path": relative, "sha256": sha256(runtime / relative), **component_notice_metadata.get(ident, {})}
            for ident, relative in notices_required.items()
        ],
    }


def sys_platform() -> str:
    if os.name == "nt":
        return "win32"
    if sys.platform == "darwin":
        return "darwin"
    if sys.platform.startswith("linux"):
        return "linux"
    return "unknown"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("runtime", type=Path)
    parser.add_argument("--python", type=Path, required=True, help="non-symlink executable inside runtime/python")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    runtime = args.runtime.absolute()
    try:
        manifest = generate(runtime, args.python.absolute())
    except RuntimeIntegrityError as exc:
        raise SystemExit(str(exc)) from exc
    output = args.output.absolute() if args.output else runtime / "manifest.json"
    if output != runtime / "manifest.json":
        raise SystemExit("manifest output must be the runtime root manifest.json")
    output.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
