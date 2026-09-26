from __future__ import annotations

import sys
import unittest
from pathlib import Path

RUNTIME = Path(__file__).resolve().parents[1] / "runtime"
sys.path.insert(0, str(RUNTIME))

from assemble_runtime import _relative_executable
from prepare_python_runtime import artifact_for_target, license_sha256


class ManagedPythonLayoutTest(unittest.TestCase):
    def test_posix_distributions_use_the_pinned_bin_layout(self) -> None:
        self.assertEqual(artifact_for_target("darwin-arm64")["executable"], "bin/python3.12")
        self.assertEqual(artifact_for_target("linux-x64")["executable"], "bin/python3.12")

    def test_windows_distribution_uses_the_pinned_root_executable(self) -> None:
        artifact = artifact_for_target("win32-x64")
        self.assertEqual(artifact["executable"], "python.exe")
        self.assertEqual(license_sha256(artifact), "886a0ead2d89030ee62dbff52b04e47ab91998341295bb9c56fb952b4e081c7a")

    def test_other_distributions_keep_the_shared_license_pin(self) -> None:
        artifact = artifact_for_target("darwin-arm64")
        self.assertEqual(license_sha256(artifact), "3b2f81fe21d181c499c59a256c8e1968455d6689d269aa85373bfb6af41da3bf")

    def test_assembly_override_remains_confined_to_the_private_root(self) -> None:
        self.assertEqual(_relative_executable("python.exe"), Path("python.exe"))
        self.assertEqual(_relative_executable("bin/python3.12"), Path("bin/python3.12"))
        with self.assertRaises(SystemExit):
            _relative_executable("../python.exe")


if __name__ == "__main__":
    unittest.main()
