from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import stat
import sys
import tempfile
from pathlib import Path

ENGINE = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(ENGINE / "worker"))
from runtime_integrity import CRITICAL_WORKER_FILES, RuntimeIntegrityError, required_notice_paths, sanitize_release_environment, sha256, tree_sha256, verify_release_bundle

FFMPEG_SOURCE = "https://ffmpeg.org/releases/ffmpeg-9.0.1.tar.xz"
FFMPEG_SIGNATURE = FFMPEG_SOURCE + ".asc"
FFMPEG_FINGERPRINT = "FCF986EA15E6E293A5644F10B4322F04D67658D8"
UPSTREAM_COMMIT = "58f64f9d9e6a0ced4a4cd6a198d7476dede50d1a"
FLAGS = ["--disable-autodetect", "--disable-gpl", "--disable-nonfree", "--enable-zlib"]
FLAGS_HASH = hashlib.sha256("\n".join(FLAGS).encode()).hexdigest()
SOURCE_HASH = "a" * 64
SIGNATURE_HASH = "b" * 64
KEY_HASH = "c" * 64
PYTHON_VERSION = platform.python_version()
PLATFORM = "win32" if os.name == "nt" else ("darwin" if sys.platform == "darwin" else "linux")
NOTICE_COMPONENTS = {
    "python-openssl-license": ("openssl", "3.5.8"),
    "python-liblzma-license": ("liblzma", "5.4.3"),
    "python-bzip2-license": ("bzip2", "1.0.8"),
    "python-libffi-license": ("libffi", "3.4.8"),
}


def write(path: Path, content: str, executable: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    if executable:
        path.chmod(path.stat().st_mode | stat.S_IXUSR)


def executable(product: str, version: str) -> str:
    return f"#!/bin/sh\nif [ \"$1\" = \"-version\" ]; then echo '{product} version {version}'; else echo 'configuration: {' '.join(FLAGS)}'; fi\n"


def fixture(version: str = "9.0.1", probe_version: str | None = None) -> tuple[Path, Path, dict]:
    root = Path(tempfile.mkdtemp(prefix="cevra-integrity-"))
    python = root / "python" / "bin" / "python3"
    write(python, "private-python", executable=True)
    components = [
        {"id": "cpython", "version": PYTHON_VERSION, "license": "PSF-2.0"},
        {"id": "openssl", "version": "3.5.8", "license": "Apache-2.0"},
        {"id": "sqlite", "version": "3.53.1", "license": "blessing/public-domain"},
        {"id": "zlib", "version": "1.2.12", "license": "Zlib", "providedByPlatform": "true"},
        {"id": "liblzma", "version": "5.4.3", "license": "0BSD/LGPL-2.1-or-later"},
        {"id": "bzip2", "version": "1.0.8", "license": "bzip2-1.0.8"},
        {"id": "libffi", "version": "3.4.8", "license": "MIT"},
    ]
    pruning = {"policy": {"version": 1, "paths": [], "globs": []}, "verifiedAbsent": True, "dependencyAudit": "fixture"}
    python_provenance = root / "python/CEVRA_PYTHON_PROVENANCE.json"
    write(python_provenance, json.dumps({"pruning": pruning, "nativeComponents": components}))
    for relative in CRITICAL_WORKER_FILES:
        write(root / relative, f"critical:{relative}\n")
    write(root / "vendor/ffmpeg-skill/package.json", json.dumps({"name": "ffmpeg-skill", "version": "1.4.2"}))
    write(root / "vendor/ffmpeg-skill/CEVRA_PROVENANCE.json", json.dumps({
        "upstream": "kajisho5/ffmpeg-skill", "version": "1.4.2", "commit": UPSTREAM_COMMIT,
        "patch": "CEVRA_MEDIA_RUNTIME_PATCH_V1",
    }))
    notices_required = required_notice_paths(PLATFORM)
    for relative in notices_required.values():
        if not (root / relative).exists():
            write(root / relative, f"notice:{relative}\n")
    suffix = ".exe" if os.name == "nt" else ""
    ffmpeg = root / "bin" / f"ffmpeg{suffix}"
    ffprobe = root / "bin" / f"ffprobe{suffix}"
    write(ffmpeg, executable("ffmpeg", version), executable=True)
    probe_version = probe_version or version
    write(ffprobe, executable("ffprobe", probe_version), executable=True)
    provenance = {
        "id": "ffmpeg", "version": version, "probeVersion": probe_version,
        "license": "LGPL-2.1-or-later", "source": FFMPEG_SOURCE,
        "sourceSignature": FFMPEG_SIGNATURE, "signingFingerprint": FFMPEG_FINGERPRINT,
        "verifiedSignerFingerprint": FFMPEG_FINGERPRINT,
        "sourceArchiveSha256": SOURCE_HASH, "sourceSignatureSha256": SIGNATURE_HASH,
        "signingKeySha256": KEY_HASH, "verified": True, "configureFlags": FLAGS,
        "configureFlagsSha256": FLAGS_HASH, "ffmpegSha256": sha256(ffmpeg), "ffprobeSha256": sha256(ffprobe),
        "sourceArchive": "sources/ffmpeg/ffmpeg-9.0.1.tar.xz",
        "sourceSignatureFile": "sources/ffmpeg/ffmpeg-9.0.1.tar.xz.asc",
        "signingKeyFile": "sources/ffmpeg/ffmpeg-devel.asc",
        "buildInstructions": "sources/ffmpeg/BUILD.md",
        "toolchain": {"host": PLATFORM, "arch": platform.machine() or "unknown", "compiler": "fixture-cc", "python": PYTHON_VERSION, "sourceDateEpoch": "0"},
    }
    write(root / provenance["sourceArchive"], "source")
    write(root / provenance["sourceSignatureFile"], "signature")
    write(root / provenance["signingKeyFile"], "key")
    write(root / provenance["buildInstructions"], "reproducible fixture\n")
    provenance["sourceArchiveSha256"] = sha256(root / provenance["sourceArchive"])
    provenance["sourceSignatureSha256"] = sha256(root / provenance["sourceSignatureFile"])
    provenance["signingKeySha256"] = sha256(root / provenance["signingKeyFile"])
    provenance_path = root / "provenance/ffmpeg.json"
    write(provenance_path, json.dumps(provenance))
    manifest = {
        "format": "cevra-media-runtime", "formatVersion": 1, "runtimeVersion": "0.1.0", "workerVersion": "0.1.0",
        "platform": PLATFORM,
        "arch": platform.machine() or "unknown",
        "binFiles": [f"bin/ffmpeg{suffix}", f"bin/ffprobe{suffix}"],
        "python": {"version": PYTHON_VERSION, "root": "python", "executable": "python/bin/python3", "executableSha256": sha256(python), "treeSha256": tree_sha256(root / "python"), "provenance": "python/CEVRA_PYTHON_PROVENANCE.json", "provenanceSha256": sha256(python_provenance), "pruning": pruning, "nativeComponents": components},
        "worker": {"root": "worker", "entrypoint": "worker/cevra_media_worker.py", "treeSha256": tree_sha256(root / "worker"), "files": [{"path": relative, "sha256": sha256(root / relative)} for relative in CRITICAL_WORKER_FILES]},
        "upstream": {"id": "ffmpeg-skill", "version": "1.4.2", "contractVersion": "1.0", "commit": UPSTREAM_COMMIT, "root": "vendor/ffmpeg-skill", "treeSha256": tree_sha256(root / "vendor/ffmpeg-skill"), "package": "vendor/ffmpeg-skill/package.json", "packageSha256": sha256(root / "vendor/ffmpeg-skill/package.json"), "provenance": "vendor/ffmpeg-skill/CEVRA_PROVENANCE.json", "provenanceSha256": sha256(root / "vendor/ffmpeg-skill/CEVRA_PROVENANCE.json")},
        "ffmpeg": {"version": version, "probeVersion": probe_version, "license": "LGPL-2.1-or-later", "buildId": sha256(ffmpeg)[:16], "executable": f"bin/ffmpeg{suffix}", "probeExecutable": f"bin/ffprobe{suffix}", "sha256": sha256(ffmpeg), "ffprobeSha256": sha256(ffprobe), "configureFlags": FLAGS, "configureFlagsSha256": FLAGS_HASH, "provenance": "provenance/ffmpeg.json", "provenanceSha256": sha256(provenance_path), "source": FFMPEG_SOURCE, "sourceSignature": FFMPEG_SIGNATURE, "signingFingerprint": FFMPEG_FINGERPRINT, "verifiedSignerFingerprint": FFMPEG_FINGERPRINT, "sourceArchiveSha256": provenance["sourceArchiveSha256"], "sourceSignatureSha256": provenance["sourceSignatureSha256"], "signingKeySha256": provenance["signingKeySha256"], "sourceArchive": provenance["sourceArchive"], "sourceSignatureFile": provenance["sourceSignatureFile"], "signingKeyFile": provenance["signingKeyFile"], "buildInstructions": provenance["buildInstructions"], "toolchain": provenance["toolchain"]},
        "notices": [{"id": ident, "path": relative, "sha256": sha256(root / relative), **({"component": NOTICE_COMPONENTS[ident][0], "version": NOTICE_COMPONENTS[ident][1]} if ident in NOTICE_COMPONENTS else {})} for ident, relative in notices_required.items()],
    }
    manifest["bundleTreeSha256"] = tree_sha256(root, frozenset({"manifest.json"}))
    write(root / "manifest.json", json.dumps(manifest))
    return root, python, manifest


def verify(root: Path, python: Path) -> None:
    verify_release_bundle(
        root, python, require_running_python=False, expected_python=PYTHON_VERSION, expected_ffmpeg="9.0.1",
        expected_ffmpeg_source=FFMPEG_SOURCE, expected_ffmpeg_signature=FFMPEG_SIGNATURE,
        expected_ffmpeg_fingerprint=FFMPEG_FINGERPRINT, expected_worker="0.1.0",
        expected_upstream_version="1.4.2", expected_upstream_commit=UPSTREAM_COMMIT,
        expected_upstream_contract="1.0",
    )


def run(scenario: str) -> None:
    root, python, manifest = fixture(
        "8.0" if scenario == "wrong-ffmpeg" else "9.0.1",
        "8.0" if scenario == "wrong-ffprobe" else None,
    )
    try:
        if scenario == "hash":
            manifest["python"]["executableSha256"] = "0" * 64
            write(root / "manifest.json", json.dumps(manifest))
        elif scenario == "symlink":
            target = root.parent / f"external-ffmpeg-{root.name}"
            shutil.copy2(root / manifest["ffmpeg"]["executable"], target)
            (root / manifest["ffmpeg"]["executable"]).unlink()
            (root / manifest["ffmpeg"]["executable"]).symlink_to(target)
        elif scenario == "wrong-python":
            external_python = root.parent / f"external-python-{root.name}"
            write(external_python, "system-python", executable=True)
            python = external_python
        elif scenario == "python-version":
            manifest["python"]["version"] = "0.0.0"
            write(root / "manifest.json", json.dumps(manifest))
        elif scenario == "vendor":
            with (root / "vendor/ffmpeg-skill/package.json").open("a", encoding="utf-8") as handle:
                handle.write("tampered")
        elif scenario == "vendor-provenance":
            provenance_path = root / "vendor/ffmpeg-skill/CEVRA_PROVENANCE.json"
            bad = json.loads(provenance_path.read_text())
            bad["patch"] = "UNAPPROVED"
            write(provenance_path, json.dumps(bad))
            manifest["upstream"]["provenanceSha256"] = sha256(provenance_path)
            manifest["upstream"]["treeSha256"] = tree_sha256(root / "vendor/ffmpeg-skill")
            write(root / "manifest.json", json.dumps(manifest))
        elif scenario == "ffmpeg-provenance":
            provenance_path = root / "provenance/ffmpeg.json"
            bad = json.loads(provenance_path.read_text())
            bad["source"] = "https://invalid.example/ffmpeg.tar.xz"
            write(provenance_path, json.dumps(bad))
            manifest["ffmpeg"]["provenanceSha256"] = sha256(provenance_path)
            write(root / "manifest.json", json.dumps(manifest))
        elif scenario == "ffmpeg-signer":
            provenance_path = root / "provenance/ffmpeg.json"
            bad = json.loads(provenance_path.read_text())
            bad["verifiedSignerFingerprint"] = "0" * 40
            write(provenance_path, json.dumps(bad))
            manifest["ffmpeg"]["verifiedSignerFingerprint"] = "0" * 40
            manifest["ffmpeg"]["provenanceSha256"] = sha256(provenance_path)
            write(root / "manifest.json", json.dumps(manifest))
        elif scenario == "png-capability":
            provenance_path = root / "provenance/ffmpeg.json"
            provenance = json.loads(provenance_path.read_text())
            flags = [flag for flag in FLAGS if flag != "--enable-zlib"]
            flags_hash = hashlib.sha256("\n".join(flags).encode()).hexdigest()
            provenance["configureFlags"] = flags
            provenance["configureFlagsSha256"] = flags_hash
            write(provenance_path, json.dumps(provenance))
            manifest["ffmpeg"]["configureFlags"] = flags
            manifest["ffmpeg"]["configureFlagsSha256"] = flags_hash
            manifest["ffmpeg"]["provenanceSha256"] = sha256(provenance_path)
            write(root / "manifest.json", json.dumps(manifest))
        elif scenario == "incomplete":
            del manifest["notices"]
            write(root / "manifest.json", json.dumps(manifest))
        elif scenario == "extra-bin":
            write(root / "bin/ffplay", "undeclared", executable=True)
        elif scenario == "missing-notice":
            (root / manifest["notices"][0]["path"]).unlink()
        elif scenario == "source-archive":
            with (root / manifest["ffmpeg"]["sourceArchive"]).open("a", encoding="utf-8") as handle:
                handle.write("tampered")
        elif scenario == "environment":
            for name in ("PATH", "PYTHONPATH", "PYTHONHOME", "PYTHONUSERBASE", "DYLD_FRAMEWORK_PATH", "LD_AUDIT", "CEVRA_MEDIA_BIN_DIR", "CEVRA_FFMPEG_SKILL_ROOT", "CEVRA_ALLOW_GPL_DEV_ENCODERS"):
                os.environ[name] = "/untrusted"
            sanitize_release_environment(root)
            assert os.environ["PATH"] == str(root / "bin")
            assert os.environ["CEVRA_MEDIA_RUNTIME_ROOT"] == str(root)
            assert os.environ["PYTHONNOUSERSITE"] == "1"
            assert all(name not in os.environ for name in ("PYTHONPATH", "PYTHONHOME", "PYTHONUSERBASE", "DYLD_FRAMEWORK_PATH", "LD_AUDIT", "CEVRA_MEDIA_BIN_DIR", "CEVRA_FFMPEG_SKILL_ROOT", "CEVRA_ALLOW_GPL_DEV_ENCODERS"))
            return

        if scenario == "ok":
            verify(root, python)
            return
        try:
            verify(root, python)
        except RuntimeIntegrityError:
            return
        raise AssertionError(f"scenario did not fail closed: {scenario}")
    finally:
        if scenario == "wrong-python":
            python.unlink(missing_ok=True)
        shutil.rmtree(root, ignore_errors=True)


run(sys.argv[2])
