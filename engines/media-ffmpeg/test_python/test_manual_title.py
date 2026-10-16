import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "worker"))
import cevra_manual_title as title

def composition():
    return {"version": 1, "fontSha256": title.FONT_SHA256, "rasterizerId": "cevra.coretext.inter.v1",
            "title": {"version": 1, "componentId": title.COMPONENT, "text": "Ação, café e conexão",
                      "startFrame": 90, "endFrame": 210, "aspect": "16:9"}}

class ManualTitleTests(unittest.TestCase):
    def test_closed_title_contract_and_unicode(self):
        valid = composition()
        self.assertEqual(title.validate(valid), valid)
        for field, value in (("startFrame", 1.5), ("endFrame", True), ("text", "a\nline"),
                             ("text", ""), ("text", "x" * 81), ("aspect", "1:1"),
                             ("componentId", "caller-code"), ("fontPath", "/foreign")):
            bad = copy.deepcopy(valid)
            bad["title"][field] = value
            with self.assertRaises(ValueError): title.validate(bad)
        for field in ("filter", "fontPath", "outputUri", "commands"):
            bad = copy.deepcopy(valid); bad[field] = "injected"
            with self.assertRaises(ValueError): title.validate(bad)

    def test_versioned_normalized_layout_and_closed_bounds(self):
        plan = composition()
        plan["title"].update(version=2, layout={"version": 1, "x": .1, "y": .2, "width": .72, "fontScale": .8})
        self.assertEqual(title.validate(plan), plan)
        for field, value in (("x", float("nan")), ("y", 1), ("width", .1), ("fontScale", 3), ("version", True), ("filter", "arbitrary")):
            bad = copy.deepcopy(plan); bad["title"]["layout"][field] = value
            with self.assertRaises(ValueError): title.validate(bad)

    def test_layout_producer_keeps_owned_destination_last_for_native_budget(self):
        plan = composition(); plan["title"].update(version=2, layout={"version":1,"x":.1,"y":.2,"width":.7,"fontScale":.8})
        events = []
        class Budget:
            def reserve(self, destination, size): events.append(("reserve", destination, size))
            def run_native(self, common, argv): events.append(("native", argv))
        with patch.object(title, "assets", return_value=(Path("/font"),Path("/helper"))):
            title.rasterize(object(), Budget(), plan, Path("/owned/title.png"))
        self.assertEqual(events[0][0],"reserve"); self.assertEqual(events[1][1][-1],"/owned/title.png")
        self.assertEqual(events[1][1][5:9],["0.1","0.2","0.7","0.8"])

    def test_half_open_intersection_depends_on_occurrence_offset(self):
        plan = composition()
        self.assertEqual(title.local_interval(plan, 0, 150), (90, 150))
        self.assertEqual(title.local_interval(plan, 150, 150), (0, 60))
        self.assertIsNone(title.local_interval(plan, 210, 90))
        self.assertIsNone(title.local_interval(plan, 0, 90))

    def test_png_reservation_precedes_supervised_producer_and_has_no_caller_paths(self):
        events = []
        class Budget:
            def reserve(self, destination, size): events.append(("reserve", destination, size))
            def run_native(self, common, argv): events.append(("native", common, argv))
        plan = composition(); plan["title"]["aspect"] = "9:16"
        with patch.object(title, "assets", return_value=(Path("/runtime/font"), Path("/runtime/helper"))):
            self.assertEqual(title.rasterize("supervisor", Budget(), plan, "/owned/title.png"), (1080, 1920))
        self.assertEqual(events[0], ("reserve", "/owned/title.png", 1080 * 1920 * 4 + 65536))
        self.assertEqual(events[1][0], "native")
        self.assertEqual(events[1][2], ["/runtime/helper", "/runtime/font", "1080", "1920", "Ação, café e conexão", "/owned/title.png"])

    def test_non_macos_capability_is_unavailable(self):
        with patch.object(title.sys, "platform", "win32"):
            self.assertFalse(title.available())

if __name__ == "__main__": unittest.main()
