import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "worker"))
import cevra_job_control as jobs
from cevra_streaming_process import reduce_lines


class StreamingMeasurementTests(unittest.TestCase):
    def setUp(self):
        jobs.begin_job("measurement-test")

    def tearDown(self):
        jobs.finish_job("measurement-test")

    def run_child(self, source, consume=lambda _: None, timeout=5):
        reduce_lines([sys.executable, "-I", "-u", "-c", source], consume, timeout=timeout)

    def test_reduces_without_retaining_series(self):
        count = 0
        def consume(line):
            nonlocal count
            self.assertEqual(line, "evidence")
            count += 1
        self.run_child("for i in range(10000): print('evidence')", consume)
        self.assertEqual(count, 10000)

    def test_failure_is_not_success(self):
        with self.assertRaisesRegex(RuntimeError, "exit 7"):
            self.run_child("print('partial'); raise SystemExit(7)")

    def test_timeout_reaps_owned_child(self):
        with self.assertRaises(TimeoutError):
            self.run_child("import time; time.sleep(20)", timeout=0.1)
        self.assertIsNone(jobs._ACTIVE.process)

    def test_cancel_at_deterministic_barrier(self):
        def consume(_):
            jobs.cancel("measurement-test")
        with self.assertRaisesRegex(RuntimeError, "cancelled"):
            self.run_child("import time; print('ready'); time.sleep(20)", consume)
        self.assertIsNone(jobs._ACTIVE.process)

    def test_oversized_line_and_consumer_failure_reap(self):
        with self.assertRaisesRegex(RuntimeError, "collection boundary"):
            self.run_child("print('x'*5000)")
        self.assertIsNone(jobs._ACTIVE.process)
        def reject(_):
            raise ValueError("invalid evidence")
        with self.assertRaisesRegex(ValueError, "invalid evidence"):
            self.run_child("import time; print('ready'); time.sleep(20)", reject)
        self.assertIsNone(jobs._ACTIVE.process)


if __name__ == "__main__":
    unittest.main()
