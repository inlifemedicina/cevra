from __future__ import annotations

import importlib.util
import os
import stat
import tempfile
import unittest
from pathlib import Path

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
build_worker = load("build_worker", ENGINE / "runtime" / "build_worker.py")


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


if __name__ == "__main__":
    unittest.main()
