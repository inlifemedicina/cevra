from __future__ import annotations

import sys
import unittest
from pathlib import Path

RUNTIME = Path(__file__).resolve().parents[1] / "runtime"
sys.path.insert(0, str(RUNTIME))

from assemble_runtime import _relative_executable
from prepare_python_runtime import artifact_for_target


class ManagedPythonLayoutTest(unittest.TestCase):
    def test_posix_distributions_use_the_pinned_bin_layout(self) -> None:
        self.assertEqual(artifact_for_target("darwin-arm64")["executable"], "bin/python3.12")
        self.assertEqual(artifact_for_target("linux-x64")["executable"], "bin/python3.12")

    def test_windows_distribution_uses_the_pinned_root_executable(self) -> None:
        self.assertEqual(artifact_for_target("win32-x64")["executable"], "python.exe")

    def test_assembly_override_remains_confined_to_the_private_root(self) -> None:
        self.assertEqual(_relative_executable("python.exe"), Path("python.exe"))
        self.assertEqual(_relative_executable("bin/python3.12"), Path("bin/python3.12"))
        with self.assertRaises(SystemExit):
            _relative_executable("../python.exe")


if __name__ == "__main__":
    unittest.main()
