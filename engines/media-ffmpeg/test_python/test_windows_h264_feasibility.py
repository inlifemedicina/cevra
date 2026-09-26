from __future__ import annotations

import importlib.util
import hashlib
import io
import json
import os
import stat
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ENGINE = Path(__file__).resolve().parents[1]


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


feasibility = load(
    "windows_h264_mf_feasibility",
    ENGINE / "test_functional" / "windows_h264_mf_feasibility.py",
)
build_ffmpeg = load("build_ffmpeg", ENGINE / "runtime" / "build_ffmpeg.py")
build_zlib = load("build_zlib", ENGINE / "runtime" / "build_zlib.py")
build_worker = load("build_worker", ENGINE / "runtime" / "build_worker.py")
prepare_zlib = load("prepare_zlib_source", ENGINE / "runtime" / "prepare_zlib_source.py")


class WindowsH264FeasibilityTests(unittest.TestCase):
    def test_timing_oracle_accepts_bound_and_rejects_negative_offset(self) -> None:
        video = [0.5, 2.0, 3.5]
        audio = [0.51, 1.99, 3.52]
        accepted = feasibility.align_events(video, audio, 0.055)
        rejected = feasibility.align_events(
            video,
            [value + feasibility.NEGATIVE_OFFSET_SECONDS for value in audio],
            0.055,
        )
        self.assertTrue(accepted["passed"])
        self.assertFalse(rejected["passed"])

    def test_event_grouping_is_deterministic(self) -> None:
        levels = [0, 2, 2, 0, 0, 3, 0]
        times = [index / 10 for index in range(len(levels))]
        observed = feasibility.event_centers_from_levels(levels, times, 1)
        self.assertEqual(len(observed), 2)
        self.assertAlmostEqual(observed[0], 0.15)
        self.assertAlmostEqual(observed[1], 0.5)

    def test_video_filter_contains_each_declared_flash(self) -> None:
        result = feasibility.video_filter(320, 180, "30000/1001", 2.002, [0.2, 1.0, 1.8])
        self.assertIn("s=320x180:r=30000/1001", result)
        self.assertEqual(result.count("between("), 3)

    def test_managed_python_root_supports_windows_root_executable(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            executable = root / "python.exe"
            executable.write_bytes(b"fixture")
            (root / "CEVRA_PYTHON_PROVENANCE.json").write_text("{}\n", encoding="utf-8")
            self.assertEqual(build_worker._managed_python_root(executable), root)

    def test_managed_python_root_supports_posix_bin_executable(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            executable = root / "bin" / "python3.12"
            executable.parent.mkdir()
            executable.write_bytes(b"fixture")
            (root / "CEVRA_PYTHON_PROVENANCE.json").write_text("{}\n", encoding="utf-8")
            self.assertEqual(build_worker._managed_python_root(executable), root)

    @unittest.skipIf(os.name == "nt", "POSIX fixture script is only needed on non-Windows unit hosts")
    def test_msvc_banner_accepts_cl_style_stderr_and_exit_code(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            compiler = Path(name) / "fake-cl"
            compiler.write_text("#!/bin/sh\necho 'Microsoft (R) C/C++ Optimizing Compiler Version 19.44' >&2\nexit 2\n", encoding="utf-8")
            compiler.chmod(compiler.stat().st_mode | stat.S_IXUSR)
            self.assertEqual(
                build_ffmpeg.compiler_banner("Windows", {**os.environ, "CC": str(compiler)}),
                "Microsoft (R) C/C++ Optimizing Compiler Version 19.44",
            )

    def test_release_flags_keep_windows_candidate_unenabled(self) -> None:
        flags = [*build_ffmpeg.COMMON_FLAGS, *build_ffmpeg.PLATFORM_FLAGS["Windows"]]
        build_ffmpeg.validate_flags(flags)
        self.assertIn("--enable-mediafoundation", flags)
        self.assertNotIn("--enable-libx264", flags)

    def test_zlib_release_pin_is_closed_and_exact(self) -> None:
        pin = prepare_zlib.PIN
        self.assertEqual(pin["version"], "1.3.2")
        self.assertEqual(pin["source"], "https://zlib.net/zlib-1.3.2.tar.xz")
        self.assertEqual(pin["archiveSha256"], "d7a0654783a4da529d1bb793b7ad9c3318020af77667bcae35f95d0e42a792f3")
        self.assertEqual(pin["signingFingerprint"], "5ED46A6721D365587791E2AA783FCD8E58BCAFBA")
        self.assertEqual(pin["license"], "Zlib")
        self.assertRegex(pin["signatureSha256"], r"^[0-9a-f]{64}$")
        self.assertRegex(pin["signingKeySha256"], r"^[0-9a-f]{64}$")
        self.assertRegex(pin["licenseSha256"], r"^[0-9a-f]{64}$")

    def test_zlib_signing_key_extraction_is_single_and_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            source = root / "key.html"
            target = root / "key.asc"
            source.write_text(
                "<pre>\n-----BEGIN PGP PUBLIC KEY BLOCK-----\nfixture\n-----END PGP PUBLIC KEY BLOCK-----\n</pre>\n",
                encoding="utf-8",
            )
            prepare_zlib.extract_signing_key(source, target)
            self.assertEqual(
                target.read_text(encoding="utf-8"),
                "-----BEGIN PGP PUBLIC KEY BLOCK-----\nfixture\n-----END PGP PUBLIC KEY BLOCK-----\n",
            )
            source.write_text(source.read_text(encoding="utf-8") + "-----BEGIN PGP PUBLIC KEY BLOCK-----\nsecond\n", encoding="utf-8")
            with self.assertRaises(SystemExit):
                prepare_zlib.extract_signing_key(source, target)

    def test_zlib_signature_status_requires_the_pinned_fingerprint(self) -> None:
        valid = "[GNUPG:] VALIDSIG 5ED46A6721D365587791E2AA783FCD8E58BCAFBA 2026-01-01 0 4 0 1 10 00 5ED46A6721D365587791E2AA783FCD8E58BCAFBA"
        self.assertTrue(prepare_zlib.signature_matches(valid, prepare_zlib.PIN["signingFingerprint"]))
        self.assertFalse(prepare_zlib.signature_matches(valid, "0" * 40))

    def test_zlib_source_layout_rejects_license_hash_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            source = Path(name)
            (source / "win32").mkdir()
            (source / "zlib.h").write_text('#define ZLIB_VERSION "1.3.2"\n', encoding="utf-8")
            (source / "zconf.h").write_text("fixture\n", encoding="utf-8")
            (source / "LICENSE").write_text("tampered\n", encoding="utf-8")
            (source / "win32/Makefile.msc").write_text("fixture\n", encoding="utf-8")
            with self.assertRaises(SystemExit):
                prepare_zlib.verify_source_layout(source)

    def test_zlib_safe_extraction_rejects_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            archive = root / "bad.tar.xz"
            with tarfile.open(archive, "w:xz") as package:
                payload = b"escape"
                member = tarfile.TarInfo("../escape")
                member.size = len(payload)
                package.addfile(member, io.BytesIO(payload))
            destination = root / "extract"
            destination.mkdir()
            with self.assertRaises(SystemExit):
                prepare_zlib.extract_verified_archive(archive, destination)
            self.assertFalse((root / "escape").exists())

    def test_zlib_static_build_uses_x64_and_static_crt(self) -> None:
        self.assertIn("-MT", build_zlib.STATIC_CFLAGS)
        self.assertNotIn("-MD", build_zlib.STATIC_CFLAGS)
        with tempfile.TemporaryDirectory() as name:
            library = Path(name) / "zlib.lib"
            library.write_bytes(b"fixture")

            def fake_run(argv, **_kwargs):
                if "/headers" in argv:
                    return "8664 machine (x64)\n"
                return "/DEFAULTLIB:LIBCMT\n"

            with patch.object(build_zlib, "run", side_effect=fake_run):
                self.assertEqual(
                    build_zlib.validate_static_library(library, cwd=library.parent, env={}),
                    {"machine": "x64", "crt": "static-mt"},
                )

    def test_zlib_static_build_rejects_dynamic_crt(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            library = Path(name) / "zlib.lib"
            library.write_bytes(b"fixture")

            def fake_run(argv, **_kwargs):
                if "/headers" in argv:
                    return "8664 machine (x64)\n"
                return "/DEFAULTLIB:MSVCRT\n"

            with patch.object(build_zlib, "run", side_effect=fake_run):
                with self.assertRaises(SystemExit):
                    build_zlib.validate_static_library(library, cwd=library.parent, env={})

    def test_windows_ffmpeg_requires_explicit_verified_zlib_prefix(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            for relative in ("include/zlib.h", "include/zconf.h", "lib/zlib.lib"):
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"fixture")
            license_path = root / "licenses/zlib/LICENSE"
            license_path.parent.mkdir(parents=True)
            license_path.write_bytes((ENGINE.parents[1] / "third_party/zlib-1.3.2-LICENSE.txt").read_bytes())
            provenance = {
                "id": "zlib",
                "version": "1.3.2",
                "license": "Zlib",
                "source": build_ffmpeg.ZLIB_PIN["source"],
                "sourceSignature": build_ffmpeg.ZLIB_PIN["signature"],
                "signingKeySource": build_ffmpeg.ZLIB_PIN["signingKey"],
                "signingFingerprint": build_ffmpeg.ZLIB_PIN["signingFingerprint"],
                "verifiedSignerFingerprint": build_ffmpeg.ZLIB_PIN["signingFingerprint"],
                "sourceArchiveSha256": build_ffmpeg.ZLIB_PIN["archiveSha256"],
                "sourceSignatureSha256": build_ffmpeg.ZLIB_PIN["signatureSha256"],
                "signingKeySourceSha256": build_ffmpeg.ZLIB_PIN["signingKeySourceSha256"],
                "signingKeySha256": build_ffmpeg.ZLIB_PIN["signingKeySha256"],
                "licenseSha256": build_ffmpeg.ZLIB_PIN["licenseSha256"],
                "librarySha256": hashlib.sha256(b"fixture").hexdigest(),
                "zlibHeaderSha256": hashlib.sha256(b"fixture").hexdigest(),
                "zconfHeaderSha256": hashlib.sha256(b"fixture").hexdigest(),
                "staticLink": True,
                "sourceModified": False,
                "machine": "x64",
                "crt": "static-mt",
                "buildMethod": "win32/Makefile.msc",
                "licenseFile": "licenses/zlib/LICENSE",
                "toolchain": {},
                "smoke": "zlib=1.3.2 roundtrip=30",
            }
            path = root / "provenance/zlib.json"
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps(provenance), encoding="utf-8")
            with self.assertRaises(SystemExit) as captured:
                build_ffmpeg.validate_zlib_prefix(root)
            self.assertIn("sourceArchive", str(captured.exception))


if __name__ == "__main__":
    unittest.main()
