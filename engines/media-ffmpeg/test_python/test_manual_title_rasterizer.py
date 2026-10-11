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

    def test_unicode_clusters_selectors_and_native_color_fonts_are_preserved(self):
        for width, height in [(1920, 1080), (1080, 1920)]:
            for text in ["Ação ↑ ❤️ 👩🏽‍⚕️", "😀 👨‍👩‍👧‍👦 🇧🇷 1️⃣ 漢", "⬆︎ ⬆️ ↑︎ ↑️"]:
                result, output = self.render(text, width, height)
                self.assertEqual(result.returncode, 0, result.stderr)
                report = json.loads(result.stdout)
                self.assertEqual(report["text"], text)
                self.assertEqual(report["renderedText"], text)
                self.assertTrue(report["allGlyphsAvailable"])
                self.assertFalse(report["globalFontRegistration"])
                self.assertEqual(report["substitutedClusters"], 0)
                self.assertEqual(report["presentationSelectorsRemoved"], 0)
                self.assertIn("AppleColorEmoji", report["usedFonts"])
                self.assertTrue(output.is_file())
                for path, digest in report["fontFiles"].items():
                    self.assertTrue(path.startswith("/System/Library/Fonts/") or Path(path).resolve() == (self.component / "Inter.ttf").resolve())
                    self.assertEqual(len(digest), 64)
        text_style, text_png = self.render("♥︎ ⬆︎")
        emoji_style, emoji_png = self.render("♥️ ⬆️")
        self.assertEqual(text_style.returncode, 0, text_style.stderr)
        self.assertEqual(emoji_style.returncode, 0, emoji_style.stderr)
        self.assertNotEqual(text_png.read_bytes(), emoji_png.read_bytes())
        self.assertNotIn("AppleColorEmoji", json.loads(text_style.stdout)["usedFonts"])

    def test_combining_accents_and_render_metacharacters_are_literal(self):
        decomposed = "Ação café: ' \" \\ % ; [ ] &"
        composed = "Ação café: ' \" \\ % ; [ ] &"
        for width, height in [(1920, 1080), (1080, 1920)]:
            result, output = self.render(decomposed, width, height)
            reference, reference_output = self.render(composed, width, height)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(reference.returncode, 0, reference.stderr)
            report = json.loads(result.stdout)
            self.assertEqual(report["text"], decomposed)
            self.assertEqual(report["renderedText"], composed)
            self.assertEqual(report["substitutedClusters"], 0)
            self.assertEqual(output.read_bytes(), reference_output.read_bytes())
            literal, _ = self.render("© € ± ≤ ≥ ∞ ✓ ★ { } $ ` < >", width, height)
            self.assertEqual(literal.returncode, 0, literal.stderr)

    def test_isolated_and_repeated_selectors_remain_bounded(self):
        for text, drawn in [("︎", "□"), ("️", "□"), ("⬆︎︎", "⬆︎︎"), ("⬆️️", "⬆️️")]:
            result, output = self.render(text)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(output.is_file())
            self.assertEqual(json.loads(result.stdout)["renderedText"], drawn)

    def test_invalid_dimensions_and_overflow_still_reject_without_publication(self):
        for text, width, height in [("Title", 720, 404), ("W" * 80, 1080, 1920)]:
            result, output = self.render(text, width, height)
            self.assertGreater(result.returncode, 0)
            self.assertFalse(output.exists())
