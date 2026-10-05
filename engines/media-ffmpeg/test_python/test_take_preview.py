import json
import sys
import unittest
import tempfile
import hashlib
from fractions import Fraction
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "worker"))
import cevra_bounded_preview as preview


class TakePreviewTests(unittest.TestCase):
    common = SimpleNamespace(require_tool=lambda _: "ffprobe")

    def setUp(self):
        preview._clear_inspections()

    def tearDown(self):
        preview._clear_inspections()

    def inspection_fixture(self, directory):
        path = Path(directory) / "original.mov"
        path.write_bytes(b"immutable-inspection-control")
        common = SimpleNamespace(require_tool=lambda name: "/verified/runtime/" + name,
            probe=mock.Mock(return_value={"duration": 2, "video": {"width": 128, "height": 96}}))
        scan = ([Fraction(i, 30) for i in range(60)], [Fraction(1, 30)] * 60, Fraction(1, 60000), {})
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        return path, common, scan, digest

    def test_verified_inspection_reuses_complete_facts_for_new_range_and_returns_isolated_values(self):
        with tempfile.TemporaryDirectory() as directory:
            path, common, scan, digest = self.inspection_fixture(directory)
            with mock.patch.object(preview, "_scan_video", return_value=scan) as frames:
                first = preview._inspect_source(common, path, path.stat(), digest)
                first[0]["video"]["width"] = 999
                first[1][0] = Fraction(9)
                second = preview._inspect_source(common, path, path.stat(), digest)
            self.assertEqual(second[0]["video"]["width"], 128)
            self.assertEqual(second[1][0], 0)
            self.assertEqual(frames.call_count, 1)
            self.assertEqual(common.probe.call_count, 1)
            self.assertLessEqual(preview._inspection_bytes, preview.INSPECTION_MAX_BYTES)

    def test_different_content_or_runtime_tool_identity_requires_a_fresh_inspection(self):
        with tempfile.TemporaryDirectory() as directory:
            path, common, scan, digest = self.inspection_fixture(directory)
            with mock.patch.object(preview, "_scan_video", return_value=scan) as frames:
                preview._inspect_source(common, path, path.stat(), digest)
                path.write_bytes(b"replaced-inspection-control!")
                changed = hashlib.sha256(path.read_bytes()).hexdigest()
                preview._inspect_source(common, path, path.stat(), changed)
                common.require_tool = lambda name: "/another/verified/runtime/" + name
                preview._inspect_source(common, path, path.stat(), changed)
            self.assertEqual(frames.call_count, 3)

    def test_changed_during_scan_and_cancelled_inspections_never_publish(self):
        with tempfile.TemporaryDirectory() as directory:
            path, common, scan, digest = self.inspection_fixture(directory)
            with mock.patch.object(preview, "_scan_video", return_value=scan), mock.patch.object(preview, "_hash_stable", return_value="f" * 64):
                with self.assertRaisesRegex(ValueError, "changed during inspection"):
                    preview._inspect_source(common, path, path.stat(), digest)
            self.assertEqual(len(preview._inspections), 0)
            with mock.patch.object(preview, "_scan_video", return_value=scan), mock.patch.object(preview.jobs, "check_cancelled", side_effect=RuntimeError("cancelled")):
                with self.assertRaisesRegex(RuntimeError, "cancelled"):
                    preview._inspect_source(common, path, path.stat(), digest)
            self.assertEqual(len(preview._inspections), 0)

    def test_corrupted_cached_inspection_is_evicted_and_freshly_measured(self):
        with tempfile.TemporaryDirectory() as directory:
            path, common, scan, digest = self.inspection_fixture(directory)
            with mock.patch.object(preview, "_scan_video", return_value=scan) as frames:
                preview._inspect_source(common, path, path.stat(), digest)
                next(iter(preview._inspections.values()))[0][0]["video"]["width"] = 999
                result = preview._inspect_source(common, path, path.stat(), digest)
            self.assertEqual(frames.call_count, 2)
            self.assertEqual(result[0]["video"]["width"], 128)

    def test_lru_eviction_oversize_and_clear_bound_inspection_memory(self):
        facts = ({"video": {"width": 128}}, (Fraction(0),), (Fraction(1, 30),), Fraction(1, 60000), {}, None)
        for i in range(6):
            preview._remember_inspection((str(i),), facts)
        self.assertEqual(len(preview._inspections), 4)
        self.assertNotIn(("0",), preview._inspections)
        before = preview._inspection_bytes
        preview._remember_inspection(("oversize",), ("x" * preview.INSPECTION_MAX_BYTES,))
        self.assertEqual(preview._inspection_bytes, before)
        preview._clear_inspections()
        self.assertEqual(preview._inspection_bytes, 0)

    def matrix(self, values, rotation=-90):
        lines = [f"{i:08d}: " + " ".join(str(value) for value in values[i * 3:i * 3 + 3]) for i in range(3)]
        return {"width": 1920, "height": 1080, "side_data_list": [{"rotation": rotation, "displaymatrix": "\n".join(lines)}]}

    def test_apple_cardinal_matrix_accepts_only_origin_or_normalized_bounds(self):
        matrix = [0, 65536, 0, -65536, 0, 0, 1080 * 65536, 0, 1073741824]
        self.assertEqual(preview._rotation(self.matrix(matrix), -90), 270)
        matrix[6] = 0
        self.assertEqual(preview._rotation(self.matrix(matrix), -90), 270)

    def test_arbitrary_translation_scale_reflection_shear_perspective_and_wrong_angle_reject(self):
        base = [0, 65536, 0, -65536, 0, 0, 1080 * 65536, 0, 1073741824]
        for index, value in [(6, 100 * 65536), (7, 65536), (1, 32768), (3, 65536), (0, 65536), (2, 1), (8, 65536)]:
            with self.subTest(index=index):
                matrix = base.copy(); matrix[index] = value
                with self.assertRaises(ValueError): preview._rotation(self.matrix(matrix), -90)
        with self.assertRaises(ValueError): preview._rotation(self.matrix(base, 90), 90)

    def packets(self):
        return [{"pts": pts, "flags": "_D_" if pts >= 80 else "___"} for pts in range(0, 120, 20)]

    def verify_tail(self, packets, stream=None):
        result = SimpleNamespace(stdout=json.dumps({"packets": packets}))
        with mock.patch.object(preview.jobs, "run", return_value=result):
            preview._verify_discarded_tail(self.common, "/owned/source.mov", stream or {"nb_frames": 6, "duration_ts": 80}, [Fraction(n, 600) for n in range(0, 80, 20)], Fraction(1, 600))

    def test_two_explicit_discarded_tail_packets_account_for_declared_count(self):
        self.verify_tail(self.packets())

    def test_missing_unflagged_or_interior_frames_incomplete_scan_and_excess_tail_reject(self):
        attacks = []
        packets = self.packets(); packets[-1]["flags"] = "___"; attacks.append(packets)
        packets = self.packets(); packets[2]["flags"] = "_D_"; attacks.append(packets)
        packets = self.packets(); packets[1]["pts"] = 21; attacks.append(packets)
        packets = self.packets(); packets[-1]["pts"] = 141; attacks.append(packets)
        packets = self.packets(); packets[-1].pop("pts"); attacks.append(packets)
        attacks.append(self.packets()[:-1])
        for packets in attacks:
            with self.subTest(packets=packets):
                with self.assertRaises(ValueError): self.verify_tail(packets)
        with self.assertRaises(ValueError): self.verify_tail(self.packets(), {"nb_frames": 7, "duration_ts": 80})

    def test_coarse_quicktime_time_base_is_measured_without_relaxing_cadence(self):
        stream = {"time_base": "1/600", "nb_frames": 2, "sample_aspect_ratio": "1:1"}
        frames = [{"best_effort_timestamp": 0, "duration": 20}, {"best_effort_timestamp": 20, "duration": 20}]
        with mock.patch.object(preview.jobs, "run", return_value=SimpleNamespace(stdout=json.dumps({"streams": [stream], "frames": frames}))):
            times, durations, tick, _ = preview._scan_video(self.common, "/owned/source.mov")
        self.assertEqual(tick, Fraction(1, 600)); self.assertEqual(times, [0, Fraction(1, 30)])
        stream["time_base"] = "1/300"
        with mock.patch.object(preview.jobs, "run", return_value=SimpleNamespace(stdout=json.dumps({"streams": [stream], "frames": frames}))):
            with self.assertRaises(ValueError): preview._scan_video(self.common, "/owned/source.mov")


if __name__ == "__main__": unittest.main()
