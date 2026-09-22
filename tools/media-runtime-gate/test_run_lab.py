#!/usr/bin/env python3
"""Deterministic tests for the Media Runtime gate laboratory helpers."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from run_lab import aggregate_classifications, evaluate_sync_events, simulate_staged_write


class ClassificationTests(unittest.TestCase):
    def test_fail_precedes_warn_and_not_run(self) -> None:
        result = aggregate_classifications({"ok": "PASS", "bad": "FAIL", "missing": "NOT RUN", "caution": "WARN"})
        self.assertEqual(result["classification"], "FAIL")
        self.assertEqual(result["failed"], ["bad"])
        self.assertEqual(result["notRun"], ["missing"])

    def test_not_run_is_visible_without_broad_pass(self) -> None:
        result = aggregate_classifications({"ok": "PASS", "missing": "NOT RUN: unavailable"})
        self.assertEqual(result["classification"], "WARN")
        self.assertEqual(result["passed"], ["ok"])
        self.assertEqual(result["notRun"], ["missing"])

    def test_unknown_result_fails_closed(self) -> None:
        result = aggregate_classifications({"unexpected": "SKIPPED"})
        self.assertEqual(result["classification"], "FAIL")


class SynchronizationOracleTests(unittest.TestCase):
    AUDIO = [0.4, 0.9, 1.4, 1.75, 2.2, 2.7, 3.2, 3.7]

    def test_correct_source_mapping_passes(self) -> None:
        result = evaluate_sync_events([0.4, 0.9, 1.4, 2.2, 2.7, 3.2, 3.7], self.AUDIO, mapping="correct")
        self.assertEqual(result["classification"], "PASS")
        self.assertLessEqual(result["maxVisibleBAvErrorSeconds"], result["toleranceSeconds"])

    def test_old_mapping_negative_control_fails_by_half_second(self) -> None:
        result = evaluate_sync_events([0.4, 0.9, 1.4, 2.7, 3.2, 3.7], self.AUDIO, mapping="old")
        self.assertEqual(result["classification"], "FAIL")
        self.assertGreaterEqual(result["maxVisibleBAvErrorSeconds"], 0.49)


class FailureInjectionTests(unittest.TestCase):
    def test_simulated_enospc_does_not_promote_or_touch_unrelated_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            unrelated = root / "unrelated"
            unrelated.write_bytes(b"keep")
            result = simulate_staged_write(root / "result.wav", failure="enospc")
            self.assertFalse(result["finalPromoted"])
            self.assertTrue(result["cleanupAttempted"])
            self.assertEqual(result["error"]["errno"], 28)
            self.assertEqual(unrelated.read_bytes(), b"keep")

    def test_cleanup_failure_remains_visible_then_harness_reclaims_owned_partial(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = simulate_staged_write(Path(directory) / "result.wav", failure="permission", cleanup_failure=True)
            self.assertTrue(result["cleanupFailureVisible"])
            self.assertTrue(result["partialObservedAfterFailure"])
            self.assertTrue(result["partialRemovedByHarnessAfterObservation"])


if __name__ == "__main__":
    unittest.main()
