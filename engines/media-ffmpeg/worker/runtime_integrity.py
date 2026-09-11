from __future__ import annotations

import hashlib
import json
import os
import platform
import re
import stat
import subprocess
import sys
from pathlib import Path
from typing import Any


class RuntimeIntegrityError(RuntimeError):
    pass


SENSITIVE_ENVIRONMENT = frozenset({
    "CEVRA_ALLOW_GPL_DEV_ENCODERS",
    "CEVRA_FFMPEG_SKILL_ROOT",
    "CEVRA_MEDIA_BIN_DIR",
    "CEVRA_MEDIA_RUNTIME_ROOT",
    "CONDA_PREFIX",
    "DYLD_FALLBACK_LIBRARY_PATH",
    "DYLD_INSERT_LIBRARIES",
    "DYLD_LIBRARY_PATH",
    "LD_LIBRARY_PATH",
    "LD_PRELOAD",
    "PYTHONBREAKPOINT",
    "PYTHONCASEOK",
    "PYTHONEXECUTABLE",
    "PYTHONHOME",
    "PYTHONINSPECT",
    "PYTHONPATH",
    "PYTHONPLATLIBDIR",
    "PYTHONSTARTUP",
    "PYTHONUSERBASE",
    "PYTHONWARNINGS",
    "VIRTUAL_ENV",
})

CRITICAL_WORKER_FILES = (
    "worker/cevra_job_control.py",
    "worker/cevra_media_worker.py",
    "worker/cevra_native_tools.py",
    "worker/runtime_integrity.py",
    "worker/runtime_profile.py",
)

REQUIRED_NOTICE_PATHS = {
    "cevra-notice": "NOTICE",
    "third-party-licenses": "THIRD_PARTY_LICENSES.md",
    "ffmpeg-skill-license": "vendor/ffmpeg-skill/LICENSE",
    "ffmpeg-license": "licenses/ffmpeg/COPYING.LGPLv2.1",
    "python-license": "licenses/python/LICENSE.txt",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _entries(root: Path) -> list[Path]:
    entries: list[Path] = []
    for directory, names, files in os.walk(root, followlinks=False):
        base = Path(directory)
        names[:] = sorted(names)
        symlink_directories = [name for name in names if (base / name).is_symlink()]
        for name in symlink_directories:
            path = base / name
            entries.append(path)
        names[:] = [name for name in names if name not in symlink_directories]
        entries.extend(base / name for name in sorted(files))
    return entries


def tree_sha256(root: Path) -> str:
    if not root.is_dir():
        raise RuntimeIntegrityError(f"runtime tree is missing: {root}")
    digest = hashlib.sha256()
    for path in sorted(_entries(root), key=lambda item: item.relative_to(root).as_posix()):
        relative = path.relative_to(root).as_posix().encode("utf-8")
        digest.update(len(relative).to_bytes(4, "big"))
        digest.update(relative)
        if path.is_symlink():
            target = path.resolve(strict=True)
            try:
                target.relative_to(root.resolve(strict=True))
            except ValueError as exc:
                raise RuntimeIntegrityError(f"runtime symlink escapes its bundle: {path}") from exc
            link = os.readlink(path).encode("utf-8")
            digest.update(b"L")
            digest.update(len(link).to_bytes(4, "big"))
            digest.update(link)
        elif path.is_file():
            digest.update(b"F")
            digest.update(bytes.fromhex(sha256(path)))
        else:
            raise RuntimeIntegrityError(f"unsupported runtime entry: {path}")
    return digest.hexdigest()


def sanitize_release_environment(runtime_root: Path) -> None:
    for name in SENSITIVE_ENVIRONMENT:
        os.environ.pop(name, None)
    os.environ.update({
        "CEVRA_MEDIA_RUNTIME_ROOT": str(runtime_root),
        "CEVRA_RELEASE_MODE": "1",
        "PATH": str(runtime_root / "bin"),
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONNOUSERSITE": "1",
    })


def _object(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RuntimeIntegrityError(f"manifest field {name} must be an object")
    return value


def _text(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value:
        raise RuntimeIntegrityError(f"manifest field {name} must be a non-empty string")
    return value


def _digest(value: Any, name: str) -> str:
    text = _text(value, name)
    if re.fullmatch(r"[0-9a-f]{64}", text) is None:
        raise RuntimeIntegrityError(f"manifest field {name} must be a SHA-256 digest")
    return text


def _safe_path(root: Path, relative_value: Any, name: str, *, directory: bool = False) -> Path:
    relative = Path(_text(relative_value, name))
    if relative.is_absolute() or ".." in relative.parts:
        raise RuntimeIntegrityError(f"manifest field {name} escapes the runtime")
    candidate = root / relative
    resolved_root = root.resolve(strict=True)
    try:
        resolved = candidate.resolve(strict=True)
        resolved.relative_to(resolved_root)
    except (OSError, ValueError) as exc:
        raise RuntimeIntegrityError(f"manifest component {name} is missing or outside the runtime") from exc
    if directory:
        if not resolved.is_dir():
            raise RuntimeIntegrityError(f"manifest component {name} is not a directory")
    else:
        mode = candidate.stat().st_mode
        if not stat.S_ISREG(mode):
            raise RuntimeIntegrityError(f"manifest component {name} is not a regular file")
    return candidate


def _check_hash(path: Path, expected: Any, name: str) -> None:
    if sha256(path) != _digest(expected, name):
        raise RuntimeIntegrityError(f"runtime component hash mismatch: {name}")


def _read_json(path: Path, name: str) -> dict[str, Any]:
    try:
        return _object(json.loads(path.read_text(encoding="utf-8")), name)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise RuntimeIntegrityError(f"invalid JSON in {name}") from exc


def _platform() -> str:
    if os.name == "nt":
        return "win32"
    if sys.platform == "darwin":
        return "darwin"
    if sys.platform.startswith("linux"):
        return "linux"
    return "unknown"


def _run_version(path: Path, probe: bool = False) -> str:
    proc = subprocess.run(
        [str(path), "-version"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=10,
        check=True,
        env={"PATH": str(path.parent)},
    )
    product = "ffprobe" if probe else "ffmpeg"
    first = proc.stdout.splitlines()[0] if proc.stdout else ""
    match = re.search(rf"{product} version\s+([^\s]+)", first)
    if match is None:
        raise RuntimeIntegrityError(f"could not identify bundled {product}")
    return match.group(1)


def verify_release_bundle(
    runtime_root: Path,
    python_executable: Path,
    *,
    expected_python: str,
    expected_ffmpeg: str,
    expected_ffmpeg_source: str,
    expected_ffmpeg_signature: str,
    expected_ffmpeg_fingerprint: str,
    expected_worker: str,
    expected_upstream_version: str,
    expected_upstream_commit: str,
    expected_upstream_contract: str,
) -> dict[str, Any]:
    root = runtime_root.absolute()
    if root.is_symlink() or not root.is_dir():
        raise RuntimeIntegrityError("release runtime root is missing or is a symlink")
    manifest_path = _safe_path(root, "manifest.json", "manifest")
    manifest = _read_json(manifest_path, "manifest")
    if manifest.get("format") != "cevra-media-runtime" or manifest.get("formatVersion") != 1:
        raise RuntimeIntegrityError("unsupported or incomplete media runtime manifest")
    required = {"format", "formatVersion", "runtimeVersion", "workerVersion", "platform", "arch", "python", "worker", "upstream", "ffmpeg", "notices"}
    if not required.issubset(manifest):
        raise RuntimeIntegrityError("media runtime manifest is incomplete")
    if manifest.get("runtimeVersion") != expected_worker or manifest.get("workerVersion") != expected_worker:
        raise RuntimeIntegrityError("worker version does not match the release runtime")
    if manifest.get("platform") != _platform() or manifest.get("arch") != (platform.machine() or "unknown"):
        raise RuntimeIntegrityError("media runtime platform does not match this host")

    python = _object(manifest["python"], "python")
    if python.get("root") != "python":
        raise RuntimeIntegrityError("private Python root is invalid")
    python_path = _safe_path(root, python.get("executable"), "python.executable")
    actual_python = Path(python_executable).absolute()
    if actual_python.is_symlink() or python_path.absolute() != actual_python:
        raise RuntimeIntegrityError("release worker is not running under its declared private Python")
    if python.get("version") != expected_python:
        raise RuntimeIntegrityError("private Python version does not match the release pin")
    if platform.python_version() != expected_python:
        raise RuntimeIntegrityError("running CPython version does not match the release pin")
    _check_hash(python_path, python.get("executableSha256"), "python.executableSha256")
    python_root = _safe_path(root, python.get("root"), "python.root", directory=True)
    if tree_sha256(python_root) != _digest(python.get("treeSha256"), "python.treeSha256"):
        raise RuntimeIntegrityError("private Python runtime tree hash mismatch")

    worker = _object(manifest["worker"], "worker")
    if worker.get("root") != "worker" or worker.get("entrypoint") != "worker/cevra_media_worker.py":
        raise RuntimeIntegrityError("worker manifest paths are invalid")
    files = worker.get("files")
    if not isinstance(files, list):
        raise RuntimeIntegrityError("manifest field worker.files must be an array")
    declared: dict[str, Any] = {}
    for index, item in enumerate(files):
        record = _object(item, f"worker.files[{index}]")
        declared[_text(record.get("path"), f"worker.files[{index}].path")] = record.get("sha256")
    if set(declared) != set(CRITICAL_WORKER_FILES):
        raise RuntimeIntegrityError("manifest does not enumerate the exact critical worker files")
    for relative, digest in declared.items():
        _check_hash(_safe_path(root, relative, f"worker:{relative}"), digest, f"worker:{relative}")
    worker_root = _safe_path(root, worker.get("root"), "worker.root", directory=True)
    if tree_sha256(worker_root) != _digest(worker.get("treeSha256"), "worker.treeSha256"):
        raise RuntimeIntegrityError("worker tree hash mismatch")

    upstream = _object(manifest["upstream"], "upstream")
    if (
        upstream.get("id") != "ffmpeg-skill"
        or upstream.get("version") != expected_upstream_version
        or upstream.get("commit") != expected_upstream_commit
        or upstream.get("contractVersion") != expected_upstream_contract
        or upstream.get("root") != "vendor/ffmpeg-skill"
        or upstream.get("package") != "vendor/ffmpeg-skill/package.json"
        or upstream.get("provenance") != "vendor/ffmpeg-skill/CEVRA_PROVENANCE.json"
    ):
        raise RuntimeIntegrityError("ffmpeg-skill manifest provenance does not match the release pin")
    vendor_root = _safe_path(root, upstream.get("root"), "upstream.root", directory=True)
    if tree_sha256(vendor_root) != _digest(upstream.get("treeSha256"), "upstream.treeSha256"):
        raise RuntimeIntegrityError("vendored ffmpeg-skill tree hash mismatch")
    provenance_path = _safe_path(root, upstream.get("provenance"), "upstream.provenance")
    _check_hash(provenance_path, upstream.get("provenanceSha256"), "upstream.provenanceSha256")
    provenance = _read_json(provenance_path, "ffmpeg-skill provenance")
    expected_provenance = {
        "upstream": "kajisho5/ffmpeg-skill",
        "version": expected_upstream_version,
        "commit": expected_upstream_commit,
        "patch": "CEVRA_MEDIA_RUNTIME_PATCH_V1",
    }
    if any(provenance.get(key) != value for key, value in expected_provenance.items()):
        raise RuntimeIntegrityError("vendored ffmpeg-skill provenance content is invalid")
    package_path = _safe_path(root, upstream.get("package"), "upstream.package")
    _check_hash(package_path, upstream.get("packageSha256"), "upstream.packageSha256")
    package = _read_json(package_path, "ffmpeg-skill package")
    if package.get("version") != expected_upstream_version:
        raise RuntimeIntegrityError("vendored ffmpeg-skill package version is invalid")

    ffmpeg = _object(manifest["ffmpeg"], "ffmpeg")
    suffix = ".exe" if os.name == "nt" else ""
    if (
        ffmpeg.get("executable") != f"bin/ffmpeg{suffix}"
        or ffmpeg.get("probeExecutable") != f"bin/ffprobe{suffix}"
        or ffmpeg.get("provenance") != "provenance/ffmpeg.json"
    ):
        raise RuntimeIntegrityError("FFmpeg manifest paths are invalid")
    binary = _safe_path(root, ffmpeg.get("executable"), "ffmpeg.executable")
    probe = _safe_path(root, ffmpeg.get("probeExecutable"), "ffmpeg.probeExecutable")
    _check_hash(binary, ffmpeg.get("sha256"), "ffmpeg.sha256")
    _check_hash(probe, ffmpeg.get("ffprobeSha256"), "ffmpeg.ffprobeSha256")
    actual_ffmpeg = _run_version(binary)
    actual_probe = _run_version(probe, probe=True)
    if ffmpeg.get("version") != actual_ffmpeg or ffmpeg.get("probeVersion") != actual_probe:
        raise RuntimeIntegrityError("FFmpeg/ffprobe version does not match the manifest")
    if not (actual_ffmpeg == expected_ffmpeg or actual_ffmpeg.startswith(expected_ffmpeg + "-")):
        raise RuntimeIntegrityError("bundled FFmpeg version does not match the release pin")
    if not (actual_probe == expected_ffmpeg or actual_probe.startswith(expected_ffmpeg + "-")):
        raise RuntimeIntegrityError("bundled ffprobe version does not match the release pin")
    if ffmpeg.get("license") not in ("LGPL-2.1-or-later", "LGPL-3.0-or-later"):
        raise RuntimeIntegrityError("bundled FFmpeg is not an LGPL-only build")
    flags = ffmpeg.get("configureFlags")
    if not isinstance(flags, list) or any(not isinstance(flag, str) for flag in flags):
        raise RuntimeIntegrityError("FFmpeg configure flags are invalid")
    flags_hash = hashlib.sha256("\n".join(flags).encode("utf-8")).hexdigest()
    if flags_hash != _digest(ffmpeg.get("configureFlagsSha256"), "ffmpeg.configureFlagsSha256"):
        raise RuntimeIntegrityError("FFmpeg configure flags hash mismatch")
    forbidden = ("--enable-gpl", "--enable-nonfree", "--enable-libx264", "--enable-libx265")
    if "--disable-autodetect" not in flags or any(flag.startswith(forbidden) for flag in flags):
        raise RuntimeIntegrityError("FFmpeg configure provenance violates the release policy")
    ffmpeg_provenance_path = _safe_path(root, ffmpeg.get("provenance"), "ffmpeg.provenance")
    _check_hash(ffmpeg_provenance_path, ffmpeg.get("provenanceSha256"), "ffmpeg.provenanceSha256")
    ffmpeg_provenance = _read_json(ffmpeg_provenance_path, "FFmpeg provenance")
    checks = {
        "id": "ffmpeg",
        "version": actual_ffmpeg,
        "probeVersion": actual_probe,
        "license": ffmpeg.get("license"),
        "source": expected_ffmpeg_source,
        "sourceSignature": expected_ffmpeg_signature,
        "signingFingerprint": expected_ffmpeg_fingerprint,
        "verified": True,
        "configureFlags": flags,
        "ffmpegSha256": ffmpeg.get("sha256"),
        "ffprobeSha256": ffmpeg.get("ffprobeSha256"),
        "configureFlagsSha256": ffmpeg.get("configureFlagsSha256"),
    }
    manifest_sources = {
        "source": expected_ffmpeg_source,
        "sourceSignature": expected_ffmpeg_signature,
        "signingFingerprint": expected_ffmpeg_fingerprint,
    }
    if any(ffmpeg.get(key) != value for key, value in manifest_sources.items()):
        raise RuntimeIntegrityError("FFmpeg manifest provenance does not match the release source")
    if any(ffmpeg_provenance.get(key) != value for key, value in checks.items()):
        raise RuntimeIntegrityError("FFmpeg provenance content does not describe the bundled build")
    for field in ("sourceArchiveSha256", "sourceSignatureSha256", "signingKeySha256"):
        value = _digest(ffmpeg.get(field), f"ffmpeg.{field}")
        if ffmpeg_provenance.get(field) != value:
            raise RuntimeIntegrityError(f"FFmpeg provenance content is missing or invalid: {field}")

    notices = manifest["notices"]
    if not isinstance(notices, list):
        raise RuntimeIntegrityError("manifest field notices must be an array")
    notice_records = {_text(_object(item, "notice").get("id"), "notice.id"): _object(item, "notice") for item in notices}
    if set(notice_records) != set(REQUIRED_NOTICE_PATHS):
        raise RuntimeIntegrityError("manifest does not enumerate all required notices and licenses")
    for ident, relative in REQUIRED_NOTICE_PATHS.items():
        record = notice_records[ident]
        if record.get("path") != relative:
            raise RuntimeIntegrityError(f"notice path is invalid: {ident}")
        _check_hash(_safe_path(root, relative, f"notice:{ident}"), record.get("sha256"), f"notice:{ident}")
    return manifest


def release_mode_for(worker_file: Path) -> bool:
    derived_root = worker_file.absolute().parent.parent
    return (derived_root / "manifest.json").is_file() or os.environ.get("CEVRA_RELEASE_MODE", "0") not in ("", "0", "false", "False")
