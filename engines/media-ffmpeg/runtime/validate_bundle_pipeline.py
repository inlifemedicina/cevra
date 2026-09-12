#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENGINE = HERE.parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ENGINE / "worker"))

from assemble_runtime import assemble
from prepare_python_runtime import verify_prepared as verify_python_runtime
from runtime_integrity import RuntimeIntegrityError, sha256, verify_release_bundle
from schema_validator import SchemaValidationError, validate as validate_schema

VERSIONS = json.loads((HERE / "versions.json").read_text(encoding="utf-8"))
FLAGS = ["--disable-autodetect", "--disable-gpl", "--disable-nonfree", "--enable-zlib"]


def _write(path: Path, content: str, *, executable: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    if executable:
        path.chmod(path.stat().st_mode | stat.S_IXUSR)


def _fake_tool(product: str) -> str:
    version = VERSIONS["ffmpeg"]["version"]
    return (
        "#!/bin/sh\n"
        f"if [ \"$1\" = \"-version\" ]; then echo '{product} version {version}'; "
        f"elif [ \"$1\" = \"-buildconf\" ]; then echo 'configuration: {' '.join(FLAGS)}'; "
        "elif [ \"$2\" = \"-encoders\" ]; then echo ''; "
        "elif [ \"$2\" = \"-hwaccels\" ]; then echo ''; fi\n"
    )


def _ffmpeg_fixture(root: Path) -> Path:
    prefix = root / "ffmpeg-prefix"
    suffix = ".exe" if os.name == "nt" else ""
    if os.name == "nt":
        raise SystemExit("synthetic runtime pipeline currently runs only on POSIX CI")
    ffmpeg = prefix / "bin" / f"ffmpeg{suffix}"
    ffprobe = prefix / "bin" / f"ffprobe{suffix}"
    _write(ffmpeg, _fake_tool("ffmpeg"), executable=True)
    _write(ffprobe, _fake_tool("ffprobe"), executable=True)
    _write(prefix / "licenses/ffmpeg/COPYING.LGPLv2.1", "Synthetic CI fixture for LGPL notice-presence validation.\n")
    flags_hash = hashlib.sha256("\n".join(FLAGS).encode("utf-8")).hexdigest()
    provenance = {
        "id": "ffmpeg",
        "version": VERSIONS["ffmpeg"]["version"],
        "probeVersion": VERSIONS["ffmpeg"]["version"],
        "license": "LGPL-2.1-or-later",
        "source": VERSIONS["ffmpeg"]["source"],
        "sourceSignature": VERSIONS["ffmpeg"]["signature"],
        "signingFingerprint": VERSIONS["ffmpeg"]["signingFingerprint"],
        "verifiedSignerFingerprint": VERSIONS["ffmpeg"]["signingFingerprint"].upper(),
        "sourceArchiveSha256": "a" * 64,
        "sourceSignatureSha256": "b" * 64,
        "signingKeySha256": "c" * 64,
        "verified": True,
        "configureFlags": FLAGS,
        "configureFlagsSha256": flags_hash,
        "ffmpegSha256": sha256(ffmpeg),
        "ffprobeSha256": sha256(ffprobe),
    }
    _write(prefix / "provenance/ffmpeg.json", json.dumps(provenance, indent=2) + "\n")
    return prefix


def _verify(bundle: Path, python_relative: Path) -> None:
    verify_release_bundle(
        bundle,
        bundle / "python" / python_relative,
        expected_python=VERSIONS["python"]["version"],
        expected_ffmpeg=VERSIONS["ffmpeg"]["version"],
        expected_ffmpeg_source=VERSIONS["ffmpeg"]["source"],
        expected_ffmpeg_signature=VERSIONS["ffmpeg"]["signature"],
        expected_ffmpeg_fingerprint=VERSIONS["ffmpeg"]["signingFingerprint"],
        expected_worker=VERSIONS["mediaRuntime"],
        expected_upstream_version=VERSIONS["ffmpegSkill"]["version"],
        expected_upstream_commit=VERSIONS["ffmpegSkill"]["commit"],
        expected_upstream_contract=VERSIONS["ffmpegSkill"]["contractVersion"],
    )


def validate_pipeline(vendor: Path, python_root: Path) -> None:
    python_path = verify_python_runtime(python_root)
    python_relative = python_path.relative_to(python_root)
    with tempfile.TemporaryDirectory(prefix="cevra-runtime-pipeline-") as temp_name:
        temp = Path(temp_name)
        ffmpeg_prefix = _ffmpeg_fixture(temp)
        bundle = temp / "bundle"
        manifest_path = assemble(bundle, python_root, python_relative, ffmpeg_prefix, vendor)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        schema = json.loads((HERE / "manifest.schema.json").read_text(encoding="utf-8"))
        validate_schema(manifest, schema)
        _verify(bundle, python_relative)

        env = {
            **os.environ,
            "CEVRA_RELEASE_MODE": "0",
            "CEVRA_MEDIA_RUNTIME_ROOT": "/untrusted",
            "CEVRA_FFMPEG_SKILL_ROOT": "/untrusted",
            "CEVRA_MEDIA_BIN_DIR": "/untrusted",
            "PYTHONPATH": "/untrusted",
        }
        worker = bundle / "worker" / "cevra_media_worker.py"
        started = subprocess.run(
            [str(bundle / "python" / python_relative), "-I", "-B", str(worker), "--info"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
            timeout=30,
            check=True,
        )
        if json.loads(started.stdout).get("version") != VERSIONS["mediaRuntime"]:
            raise SystemExit("assembled release worker did not report the expected version")

        incomplete = dict(manifest)
        incomplete.pop("notices")
        try:
            validate_schema(incomplete, schema)
        except SchemaValidationError:
            pass
        else:
            raise SystemExit("manifest schema accepted an incomplete runtime")

        original_notice = (bundle / "NOTICE").read_text(encoding="utf-8")
        (bundle / "NOTICE").write_text(original_notice + "tampered\n", encoding="utf-8")
        try:
            _verify(bundle, python_relative)
        except RuntimeIntegrityError:
            pass
        else:
            raise SystemExit("runtime verifier accepted a modified notice")
        (bundle / "NOTICE").write_text(original_notice, encoding="utf-8")

        manifest["ffmpeg"]["license"] = "GPL"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        try:
            _verify(bundle, python_relative)
        except RuntimeIntegrityError:
            pass
        else:
            raise SystemExit("runtime verifier accepted invalid FFmpeg licensing")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--vendor", type=Path, required=True)
    parser.add_argument("--python-root", type=Path, required=True)
    args = parser.parse_args()
    validate_pipeline(args.vendor.resolve(), args.python_root.resolve())
    print("CEVRA Media Runtime pipeline validation PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
