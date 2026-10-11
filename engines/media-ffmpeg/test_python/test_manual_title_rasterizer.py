import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

@unittest.skipUnless(sys.platform == "darwin", "private CoreText component is macOS-only")
class ManualTitleRasterizerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Require an explicit artifact parent. Local CEVRA runs provide Documents/CEVRA;
        # the isolated CI runner provides RUNNER_TEMP. Never fall back to global /tmp.
        parent = os.environ.get("CEVRA_TEST_ARTIFACTS") or os.environ.get("RUNNER_TEMP")
        if not parent:
            raise RuntimeError("Set CEVRA_TEST_ARTIFACTS to an owned test-artifact directory")
        cls.owned = tempfile.TemporaryDirectory(prefix="cevra-title-raster-test-", dir=parent)
        cls.root = Path(cls.owned.name)
        packaged = os.environ.get("CEVRA_TITLE_RASTERIZER_ROOT")
        cls.component = Path(packaged) if packaged else Path(__file__).resolve().parents[1] / "components" / "manual-title"
        if packaged:
            cls.helper = cls.component / "rasterizer"
        else:
            cls.helper = cls.root / "rasterizer"
            subprocess.run(["/usr/bin/xcrun", "swiftc", "-O", "-module-cache-path", str(cls.root / "modules"),
                            str(cls.component / "rasterizer.swift"), "-o", str(cls.helper)], check=True, capture_output=True)

    @classmethod
    def tearDownClass(cls):
        cls.owned.cleanup()

    def render(self, text, width=1920, height=1080):
        output = self.root / (str(len(list(self.root.iterdir()))) + ".png")
        result = subprocess.run([str(self.helper), str(self.component / "Inter.ttf"), str(width), str(height), text, str(output)],
                                capture_output=True, text=True, timeout=15)
        return result, output

    def test_text_selector_keeps_private_font_and_identical_arrow_pixels(self):
        for width, height in [(1920, 1080), (1080, 1920)]:
            plain, plain_png = self.render("Ação ⬆", width, height)
            marked, marked_png = self.render("Ação ⬆︎", width, height)
            self.assertEqual(plain.returncode, 0, plain.stderr)
            self.assertEqual(marked.returncode, 0, marked.stderr)
            report = json.loads(marked.stdout)
            self.assertEqual(report["text"], "Ação ⬆︎")
            self.assertEqual(report["fontPostScriptName"], "Inter-Regular")
            self.assertTrue(report["allGlyphsAvailable"])
            self.assertFalse(report["globalFontRegistration"])
            self.assertEqual(marked_png.read_bytes(), plain_png.read_bytes())

    def test_unsupported_text_and_selector_sequences_fail_without_publishing(self):
        for text in ["︎", "︎A", "⬆︎︎", "😀", "😀︎", "⬆️", "漢"]:
            with self.subTest(text=text):
                result, output = self.render(text)
                self.assertGreater(result.returncode, 0)  # ordinary rejection, no crash signal
                self.assertFalse(output.exists())
