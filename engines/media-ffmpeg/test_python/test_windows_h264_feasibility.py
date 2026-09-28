from __future__ import annotations

import importlib.util
import hashlib
import io
import json
import os
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ENGINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE / "runtime"))
sys.path.insert(0, str(ENGINE / "worker"))

import schema_validator
import runtime_integrity


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
        planned = [0.5, 2.0, 3.5]
        accepted = feasibility.align_events(video, audio, planned, 0.055)
        rejected = feasibility.align_events(
            video,
            [value + feasibility.NEGATIVE_OFFSET_SECONDS for value in audio],
            planned,
            0.055,
        )
        self.assertTrue(accepted["passed"])
        self.assertFalse(rejected["passed"])

    def test_timing_oracle_requires_exactly_three_events_and_truth(self) -> None:
        self.assertFalse(feasibility.align_events([0.5, 2.0], [0.5, 2.0], [0.5, 2.0, 3.5], 0.055)["passed"])
        shifted_together = feasibility.align_events(
            [0.75, 2.25, 3.75], [0.75, 2.25, 3.75], [0.5, 2.0, 3.5], 0.055,
        )
        self.assertFalse(shifted_together["passed"])
        self.assertEqual(shifted_together["eventCounts"], {"planned": 3, "video": 3, "audio": 3})

    def test_audio_timeline_uses_real_pts_and_rejects_discontinuity(self) -> None:
        frames = {"frames": [
            {"best_effort_timestamp_time": "0.250000", "nb_samples": 1024},
            {"best_effort_timestamp_time": str(0.25 + 1024 / 48_000), "nb_samples": 1024},
        ]}
        with patch.object(feasibility, "json_output", return_value=frames):
            observed = feasibility.audio_frame_timeline(Path("ffprobe"), Path("fixture.mp4"))
        self.assertAlmostEqual(observed["firstPtsSeconds"], 0.25)
        broken = {"frames": [frames["frames"][0], {"best_effort_timestamp_time": "0.500000", "nb_samples": 1024}]}
        with patch.object(feasibility, "json_output", return_value=broken):
            with self.assertRaisesRegex(RuntimeError, "discontinuous"):
                feasibility.audio_frame_timeline(Path("ffprobe"), Path("fixture.mp4"))

    @unittest.skipIf(os.name == "nt", "portable Python subprocess fixture uses the POSIX test interpreter")
    def test_run_measured_drains_large_output_without_pipe_deadlock(self) -> None:
        result, _, _ = feasibility.run_measured(
            [sys.executable, "-c", "import sys; sys.stdout.write('x' * 2000000); sys.stderr.write('y' * 2000000)"],
            timeout=15,
        )
        self.assertEqual(result.returncode, 0)
        self.assertEqual(len(result.stdout), feasibility.MAX_CAPTURE_BYTES)
        self.assertEqual(len(result.stderr), feasibility.MAX_CAPTURE_BYTES)

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
        self.assertIn("--pkg-config=false", flags)
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

    def test_windows_zlib_schema_requires_closed_id_and_selection(self) -> None:
        schema = json.loads((ENGINE / "runtime/manifest.schema.json").read_text(encoding="utf-8"))
        digest = "a" * 64
        value = {
            "id": "zlib", "version": "1.3.2", "license": "Zlib",
            "source": "source", "sourceSignature": "signature", "signingKeySource": "key",
            "signingFingerprint": "fingerprint", "verifiedSignerFingerprint": "FINGERPRINT",
            "sourceArchiveSha256": digest, "sourceSignatureSha256": digest, "signingKeySha256": digest,
            "licenseSha256": digest, "librarySha256": digest, "zlibHeaderSha256": digest, "zconfHeaderSha256": digest,
            "staticLink": True, "preparedBuildInput": True, "sourceModified": False,
            "machine": "x64", "crt": "static-mt", "buildMethod": "win32/Makefile.msc",
            "provenance": "provenance/zlib.json", "provenanceSha256": digest,
            "sourceArchive": "sources/zlib/zlib.tar.xz", "sourceSignatureFile": "sources/zlib/zlib.tar.xz.asc",
            "signingKeyFile": "sources/zlib/key.asc", "buildInstructions": "sources/zlib/BUILD.md",
            "licenseFile": "licenses/zlib/LICENSE", "smoke": "zlib=1.3.2 roundtrip=30",
            "toolchain": {"host": "Windows", "arch": "AMD64", "compiler": "MSVC", "python": "3.12.14", "sourceDateEpoch": "0"},
            "selection": {
                "method": "msvc-static-lib-search-v1", "pkgConfigDisabled": True,
                "librarySha256": digest, "uniqueVisibleZlibLib": True,
                "configureProbe": {"enabled": True, "probeSymbol": "zlibVersion", "linkArgument": "-lz", "summarySha256": digest, "summary": ["check zlibVersion -lz"]},
                "dynamicZlibDependency": False,
                "binaryDependencies": {
                    "ffmpeg": {"all": ["KERNEL32.dll"], "system": ["KERNEL32.dll"], "bundled": [], "unexpectedExternal": []},
                    "ffprobe": {"all": ["KERNEL32.dll"], "system": ["KERNEL32.dll"], "bundled": [], "unexpectedExternal": []},
                },
                "functionalSmoke": {"kind": "png-roundtrip-v1", "status": "pass", "bytes": 80, "sha256": digest},
            },
        }
        zlib_schema = schema["$defs"]["zlib"]
        schema_validator.validate(value, {**schema, **zlib_schema})
        for mutation in (
            {key: item for key, item in value.items() if key != "id"},
            {**value, "id": "other"},
            {**value, "extra": True},
        ):
            with self.assertRaises(schema_validator.SchemaValidationError):
                schema_validator.validate(mutation, {**schema, **zlib_schema})

    def test_manifest_platform_condition_requires_windows_zlib_and_adjustment_only(self) -> None:
        schema = json.loads((ENGINE / "runtime/manifest.schema.json").read_text(encoding="utf-8"))
        conditional = {
            "type": "object",
            "properties": {"platform": {"type": "string"}, "ffmpeg": {"type": "object"}},
            "required": ["platform", "ffmpeg"],
            "allOf": schema["allOf"],
        }
        schema_validator.validate({"platform": "win32", "ffmpeg": {"zlib": {}, "buildAdjustments": []}}, conditional)
        schema_validator.validate({"platform": "darwin", "ffmpeg": {}}, conditional)
        for invalid in (
            {"platform": "win32", "ffmpeg": {"buildAdjustments": []}},
            {"platform": "win32", "ffmpeg": {"zlib": {}}},
            {"platform": "darwin", "ffmpeg": {"zlib": {}}},
            {"platform": "darwin", "ffmpeg": {"buildAdjustments": []}},
        ):
            with self.assertRaises(schema_validator.SchemaValidationError):
                schema_validator.validate(invalid, conditional)

    def test_unique_zlib_selection_rejects_other_visible_library(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            prepared = root / "prepared"
            other = root / "other"
            (prepared / "lib").mkdir(parents=True)
            other.mkdir()
            (prepared / "lib/zlib.lib").write_bytes(b"prepared")
            evidence = build_ffmpeg.validate_unique_zlib_library(prepared, {"LIB": str(prepared / "lib")})
            self.assertTrue(evidence["uniqueVisibleZlibLib"])
            self.assertEqual(evidence["librarySha256"], hashlib.sha256(b"prepared").hexdigest())
            (other / "zlib.lib").write_bytes(b"runner")
            with self.assertRaisesRegex(SystemExit, "ambiguous"):
                build_ffmpeg.validate_unique_zlib_library(prepared, {"LIB": f"{prepared / 'lib'};{other}"})

    def test_configure_proof_requires_enabled_zlib_symbol_and_link_argument(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            source = Path(name)
            (source / "ffbuild").mkdir()
            (source / "ffbuild/config.log").write_text("check_lib zlib zlib.h zlibVersion -lz\n", encoding="utf-8")
            (source / "config.h").write_text("#define CONFIG_ZLIB 1\n", encoding="utf-8")
            proof = build_ffmpeg.verify_zlib_configure_probe(source)
            self.assertEqual(proof["probeSymbol"], "zlibVersion")
            (source / "ffbuild/config.log").write_text("pkg-config zlib\n", encoding="utf-8")
            with self.assertRaisesRegex(SystemExit, "link probe"):
                build_ffmpeg.verify_zlib_configure_probe(source)

    def test_dumpbin_dependency_inventory_rejects_dynamic_zlib(self) -> None:
        fixture = "Image has the following dependencies:\n    KERNEL32.dll\n    USER32.dll\n"
        with patch.object(build_ffmpeg.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, fixture, "")):
            self.assertEqual(
                build_ffmpeg.binary_dependencies(Path("ffmpeg.exe"), {}),
                {"all": ["KERNEL32.dll", "USER32.dll"], "system": ["KERNEL32.dll", "USER32.dll"], "bundled": [], "unexpectedExternal": []},
            )
        bad = "Image has the following dependencies:\n    zlib1.dll\n"
        with patch.object(build_ffmpeg.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, bad, "")):
            with self.assertRaisesRegex(SystemExit, "dynamic zlib"):
                build_ffmpeg.binary_dependencies(Path("ffmpeg.exe"), {})

    def test_msvc_dependency_filter_replaces_only_the_known_generated_command(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            config = root / "ffbuild/config.mak"
            config.parent.mkdir()
            command = " | awk '/including/ { sub(/^.*file: */, \"\"); gsub(/\\\\/, \"/\"); if (!match($$0, / /)) print \"$@:\", $$0 }' > $(@:.o=.d)"
            config.write_text(
                "".join(f"{variable}=cl -showIncludes{command}\n" for variable in ("CCDEP", "CXXDEP", "OBJCDEP", "ASDEP")),
                encoding="utf-8",
            )
            result = build_ffmpeg.install_msvc_dependency_filter(root)
            adjusted = config.read_text(encoding="utf-8")
            self.assertEqual(result["id"], "cevra-msvc-dependency-filter-v1")
            self.assertEqual(result["generatedCommandCount"], 4)
            self.assertFalse(result["sourceArchiveModified"])
            self.assertEqual(result["helperPath"], "sources/ffmpeg/CEVRA_MSVC_DEPENDENCIES.awk")
            self.assertEqual(result["sourcePatternId"], "ffmpeg-9.0.1-msvc-inline-awk-v1")
            self.assertRegex(str(result["sourcePatternSha256"]), r"^[0-9a-f]{64}$")
            self.assertEqual(result["helperSha256"], build_ffmpeg.sha256(build_ffmpeg.MSVC_DEPENDENCY_FILTER))
            self.assertNotIn("gsub", adjusted)
            self.assertEqual(adjusted.count('awk -v target="$@" -f '), 4)
            self.assertIn("msvc_dependencies.awk", adjusted)

    def test_msvc_dependency_filter_fails_closed_on_upstream_command_drift(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            config = root / "ffbuild/config.mak"
            config.parent.mkdir()
            config.write_text("CCDEP=unexpected\n", encoding="utf-8")
            with self.assertRaises(SystemExit):
                build_ffmpeg.install_msvc_dependency_filter(root)

    def test_runtime_integrity_binds_packaged_msvc_helper(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            helper = root / "sources/ffmpeg/CEVRA_MSVC_DEPENDENCIES.awk"
            helper.parent.mkdir(parents=True)
            helper.write_bytes(b"helper")
            (helper.parent / "BUILD.md").write_text("recipe\n", encoding="utf-8")
            record = [{
                "id": "cevra-msvc-dependency-filter-v1",
                "helperPath": "sources/ffmpeg/CEVRA_MSVC_DEPENDENCIES.awk",
                "helperSha256": hashlib.sha256(b"helper").hexdigest(),
                "generatedFile": "ffbuild/config.mak",
                "sourcePatternId": "ffmpeg-9.0.1-msvc-inline-awk-v1",
                "sourcePatternSha256": "885c5a5b7b551aecab5abe5696f76637374291c48ca2f948555f32a66438686f",
                "generatedCommandCount": 4,
                "sourceArchiveModified": False,
            }]
            runtime_integrity.verify_windows_build_adjustments(root, record, record)
            helper.write_bytes(b"tampered")
            with self.assertRaisesRegex(runtime_integrity.RuntimeIntegrityError, "hash mismatch"):
                runtime_integrity.verify_windows_build_adjustments(root, record, record)
            helper.unlink()
            with self.assertRaises(runtime_integrity.RuntimeIntegrityError):
                runtime_integrity.verify_windows_build_adjustments(root, record, record)
            traversal = [{**record[0], "helperPath": "../escape.awk"}]
            with self.assertRaises(runtime_integrity.RuntimeIntegrityError):
                runtime_integrity.verify_windows_build_adjustments(root, traversal, traversal)

    def test_file_backed_msvc_dependency_filter_normalizes_include_paths(self) -> None:
        awk = shutil.which("awk")
        if awk is None:
            self.skipTest("awk is unavailable")
        observed = subprocess.run(
            [awk, "-v", "target=libavdevice/alldevices.o", "-f", str(build_ffmpeg.MSVC_DEPENDENCY_FILTER)],
            input="Note: including file: C:\\sdk\\include\\header.h\n",
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True,
        ).stdout
        self.assertEqual(observed, "libavdevice/alldevices.o: C:/sdk/include/header.h\n")


if __name__ == "__main__":
    unittest.main()
