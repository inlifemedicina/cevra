import json
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "worker"))
import cevra_audio_measurement as measure
import cevra_media_worker as worker


class AudioMeasurementTests(unittest.TestCase):
    def test_sealed_manifest_cardinality_matches_worker_inventory(self):
        runtime = Path(__file__).resolve().parents[1] / "runtime"
        sys.path.insert(0, str(runtime))
        from build_worker import WORKER_FILES
        from runtime_integrity import CRITICAL_WORKER_FILES
        schema = json.loads((runtime / "manifest.schema.json").read_text())
        files = schema["properties"]["worker"]["properties"]["files"]
        self.assertEqual(files["minItems"], len(WORKER_FILES))
        self.assertEqual(files["maxItems"], len(WORKER_FILES))
        self.assertEqual(set(CRITICAL_WORKER_FILES), {"worker/" + name for name in WORKER_FILES})

    def frame(self, reduction, label, pts, fields):
        reduction.consume(f"frame:0    pts:{pts}    pts_time:0")
        for key, value in fields.items():
            reduction.consume(f"{key}={value}")
        reduction.consume(f"cevra.branch={label}")

    def fixture(self, **overrides):
        r = measure.Reduction(48000, 1, 0, 4800)
        self.frame(r, "coverage", 0, {"lavfi.astats.Overall.Number_of_samples": 4800})
        raw = {"lavfi.astats.Overall.Number_of_samples": 4800, "lavfi.astats.1.Peak_level": "-6.020600", "lavfi.astats.1.RMS_level": "-9.030900",
               "lavfi.astats.1.Number of NaNs": 0, "lavfi.astats.1.Number of Infs": 0}
        raw.update(overrides)
        self.frame(r, "raw", 0, raw)
        self.frame(r, "scale", 0, {"lavfi.astats.Overall.Number_of_samples": 4800, "lavfi.astats.1.Max_level": 1})
        self.frame(r, "truepeak", 0, {"lavfi.astats.Overall.Number_of_samples": 19200, "lavfi.astats.1.Peak_level": "-6.020600"})
        return r

    def test_partial_short_windows_have_no_sentinel_loudness(self):
        result = self.fixture().result()
        self.assertEqual(result["sampleFrames"], 4800)
        self.assertEqual(result["integratedLufs"], {"status": "unavailable", "reason": "insufficient-duration"})
        self.assertEqual(result["shortTermValidObservations"], 0)

    def test_nonfinite_samples_or_metadata_fail_closed(self):
        for key, value in [("lavfi.astats.1.Number of NaNs", 1), ("lavfi.astats.1.Number of Infs", 1), ("lavfi.astats.1.RMS_level", "NaN"), ("lavfi.astats.1.Peak_level", "inf")]:
            with self.assertRaises(measure.MeasurementError):
                self.fixture(**{key: value}).result()

    def test_silent_core_accepts_true_peak_from_real_context(self):
        r = measure.Reduction(48000, 1, 0, 24000)
        self.frame(r, "coverage", 0, {"lavfi.astats.Overall.Number_of_samples": 24000})
        self.frame(r, "raw", 0, {"lavfi.astats.Overall.Number_of_samples": 24000,
                                  "lavfi.astats.1.Peak_level": "-inf", "lavfi.astats.1.RMS_level": "-inf",
                                  "lavfi.astats.1.Number of NaNs": 0, "lavfi.astats.1.Number of Infs": 0})
        self.frame(r, "scale", 0, {"lavfi.astats.Overall.Number_of_samples": 24000,
                                    "lavfi.astats.1.Max_level": 0})
        self.frame(r, "truepeak", 0, {"lavfi.astats.Overall.Number_of_samples": 96000,
                                       "lavfi.astats.1.Peak_level": "-20"})
        result = r.result()
        self.assertEqual(result["channels"][0]["rmsLinear"], 0)
        self.assertEqual(result["channels"][0]["samplePeakLinear"], 0)
        self.assertAlmostEqual(result["truePeakLinear"], 0.1)
        self.assertEqual(result["integratedLufs"], {"status": "unavailable", "reason": "digital-silence"})
        self.assertEqual(result["shortTermMaxLufs"], {"status": "unavailable", "reason": "digital-silence"})
        for invalid in ("NaN", "inf"):
            r.latest["truepeak"]["lavfi.astats.1.Peak_level"] = invalid
            with self.assertRaisesRegex(measure.MeasurementError, "INVALID_METADATA"):
                r.result()

    def test_r128_window_nan_is_skipped_but_infinity_is_invalid(self):
        r = measure.Reduction(48000, 1, 0, 192000)
        valid = {"lavfi.astats.Overall.Number_of_samples": 144000,
                 "lavfi.r128.M": "-10", "lavfi.r128.I": "-12", "lavfi.r128.S": "-11"}
        self.frame(r, "raw", 0, valid)
        r.flush()
        self.assertEqual(r.integrated, -12)
        self.assertEqual((r.short_max, r.short_count), (-11, 1))
        self.frame(r, "raw", 144000, {"lavfi.astats.Overall.Number_of_samples": 148800,
                                      "lavfi.r128.M": "nan", "lavfi.r128.I": "-12", "lavfi.r128.S": "nan"})
        r.flush()
        self.assertEqual(r.integrated, -12)
        self.assertEqual((r.short_max, r.short_count), (-11, 1))
        for key in ("lavfi.r128.M", "lavfi.r128.S"):
            with self.assertRaisesRegex(measure.MeasurementError, "INVALID_METADATA"):
                measure.Reduction.r128_window({key: "inf"}, key)

    def test_missing_count_or_output_drain_is_incomplete(self):
        r = self.fixture()
        r.pending["lavfi.astats.Overall.Number_of_samples"] = "19136"
        with self.assertRaisesRegex(measure.MeasurementError, "INCOMPLETE_COLLECTION"):
            r.result()

    def test_discontinuous_duplicate_and_short_coverage_rejected(self):
        for pts, frames in [(1, 4800), (0, 4801), (0, 0)]:
            r = measure.Reduction(48000, 1, 0, 4800)
            self.frame(r, "coverage", pts, {"lavfi.astats.Overall.Number_of_samples": frames})
            with self.assertRaisesRegex(measure.MeasurementError, "COVERAGE"):
                r.result()
        r = self.fixture(); r.next_pts = 4799
        with self.assertRaisesRegex(measure.MeasurementError, "COVERAGE"):
            r.result()

    def test_metadata_cardinality_and_duplicates_bounded(self):
        r = measure.Reduction(48000, 1, 0, 4800)
        r.consume("frame:0 pts:0 pts_time:0")
        r.consume("lavfi.a=0")
        with self.assertRaises(measure.MeasurementError):
            r.consume("lavfi.a=1")
        for index in range(39):
            r.consume(f"lavfi.{index}=1")
        with self.assertRaises(measure.MeasurementError):
            r.consume("lavfi.extra=1")

    def test_rpc_schema_and_native_validation_agree(self):
        args = dict(version=1, input="/source.wav", stream_index=0, start_ms=1, end_ms=9)
        worker._validate_tool_arguments("cevra-measure-audio", args)
        measure.validate(args)
        for patch in [dict(version=True), dict(stream_index=-1), dict(end_ms=1), dict(start_ms=0.5), dict(input="relative.wav"), dict(argv=[]), dict(end_ms=measure.MAX_MS + 1)]:
            with self.assertRaises(ValueError):
                measure.validate({**args, **patch})
        self.assertEqual(measure.sample_boundary(1, 44100), 45)
        self.assertEqual(measure.sample_boundary(9, 44100), 397)

    def test_no_encoder_profile_is_selected_for_measurement(self):
        args = dict(version=1, input="/source.wav", stream_index=0, start_ms=0, end_ms=100)
        with mock.patch.object(worker, "_ensure_profile", side_effect=AssertionError("video profile")), mock.patch.object(worker, "call_custom_tool", return_value={"structuredContent": {"report": True}}):
            worker._call_tool_in_process("cevra-measure-audio", args)

    def test_fixed_graph_is_audio_only_and_removes_untrusted_metadata(self):
        graph = measure.graph(3, 44100, 2, 45, 397, 0, 4410)
        self.assertTrue(graph.startswith("[0:3]"))
        self.assertIn("ametadata=mode=delete", graph)
        self.assertIn("aresample=176400", graph)
        self.assertNotIn("apad", graph)
        self.assertNotIn("pan=", graph)
        self.assertNotIn("loudnorm", graph)
        self.assertIn("[context]atrim=start_pts=0:end_pts=4410", graph)
        self.assertIn("atrim=start_sample=180:end_sample=1588", graph)


if __name__ == "__main__":
    unittest.main()
