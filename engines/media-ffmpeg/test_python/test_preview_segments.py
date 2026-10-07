from __future__ import annotations

import copy
import hashlib
import tempfile
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "worker"))
import cevra_preview_segments as segments
import cevra_manual_sequence as manual
import cevra_media_worker as worker
import test_manual_sequence as manual_fixture

GRID = {"version": 1, "frames": 30, "width": 720, "height": 404}


class PreviewSegmentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        self.cache = segments.SegmentCache()
        worker.preview_segments.clear()
        self.addCleanup(worker.preview_segments.clear)

    def stage(self, cache, key=b"identity", payload=b"admitted synthetic segment", receipt=GRID, commit=True):
        path = self.root / hashlib.sha256(key + payload).hexdigest()
        path.write_bytes(payload)
        tx = cache.transaction(); tx.stage(key, path, receipt)
        if commit: tx.commit()
        return tx

    def test_pending_bytes_are_invisible_until_commit_and_share_the_retention_bound(self):
        tx = self.stage(self.cache, commit=False)
        self.assertEqual(self.cache.state()["entries"], 0)
        self.assertEqual(self.cache.state()["pendingEntries"], 1)
        self.assertGreater(self.cache.state()["retainedBytes"], 0)
        self.assertIsNone(tx.get(b"identity", GRID))
        tx.commit()
        self.assertEqual(self.cache.transaction().get(b"identity", GRID), b"admitted synthetic segment")

    def test_payload_digest_private_seal_and_grid_corruption_evict_instead_of_restoring(self):
        for corruption in ("payload", "digest", "seal", "key", "receipt"):
            with self.subTest(corruption=corruption):
                self.cache.clear(); self.stage(self.cache)
                entry = self.cache._entries[b"identity"]
                values = {"payload": b"modified", "digest": "0" * 64, "seal": "0" * 64,
                          "key": b"foreign", "receipt": segments.encode({**GRID, "frames": 29})}
                self.cache._entries[b"identity"] = entry._replace(**{corruption: values[corruption]})
                self.assertIsNone(self.cache.transaction().get(b"identity", GRID))
                self.assertEqual(self.cache.state()["entries"], 0)
        self.stage(self.cache)
        entry = self.cache._entries[b"identity"]
        self.cache._entries[b"identity"] = entry._replace(payload=b"modified", digest=hashlib.sha256(b"modified").hexdigest())
        self.assertIsNone(self.cache.transaction().get(b"identity", GRID))

    def test_expected_grid_change_is_a_miss_and_forged_seal_never_authorizes_bytes(self):
        self.stage(self.cache)
        self.assertIsNone(self.cache.transaction().get(b"identity", {**GRID, "width": 404}))
        self.assertEqual(self.cache.state()["corruptions"], 1)

    def test_lru_eviction_and_cache_full_pending_entries_preserve_byte_and_entry_limits(self):
        cache = segments.SegmentCache(maximum_entries=2)
        self.stage(cache, b"one"); self.stage(cache, b"two")
        self.assertIsNotNone(cache.transaction().get(b"one", GRID))
        self.stage(cache, b"three")
        self.assertEqual(list(cache._entries), [b"one", b"three"])
        tx = cache.transaction()
        for key in (b"four", b"five", b"six"):
            path = self.root / key.decode(); path.write_bytes(b"segment")
            tx.stage(key, path, GRID)
            self.assertLessEqual(len(cache._charges), 2)
            self.assertLessEqual(cache.state()["retainedBytes"], cache.maximum_bytes)
        tx.commit()
        self.assertEqual(list(cache._entries), [b"four", b"five"])
        self.assertGreater(cache.state()["bypasses"], 0)

    def test_default_32MiB_ceiling_counts_pending_and_committed_entries_and_metadata(self):
        payload = b"x" * (7 * 1024 * 1024)
        for index in range(6):
            self.stage(self.cache, str(index).encode(), payload, commit=index != 5)
            state = self.cache.state()
            self.assertLessEqual(state["retainedBytes"], 32 * 1024 * 1024)
            self.assertGreater(state["retainedBytes"], len(self.cache._charges) * len(payload))
        self.assertGreater(self.cache.state()["evictions"], 0)
        self.assertEqual(self.cache.state()["pendingEntries"], 1)

    def test_64_entry_ceiling_oversized_or_disabled_cache_safely_bypasses(self):
        for index in range(67): self.stage(self.cache, str(index).encode())
        self.assertEqual(self.cache.state()["entries"], 64)
        self.assertEqual(self.cache.state()["evictions"], 3)
        for options in ({"maximum_entries": 0}, {"maximum_bytes": 8192}):
            cache = segments.SegmentCache(**options)
            self.stage(cache, payload=b"x" * 8192)
            self.assertEqual(cache.state()["entries"], 0)
        self.stage(self.cache, b"huge", b"x" * (segments.MAX_SEGMENT_BYTES + 1))
        self.assertNotIn(b"huge", self.cache._entries)

    def test_cancel_retirement_and_abort_cannot_repopulate_a_cleared_generation(self):
        tx = self.stage(self.cache, commit=False)
        self.cache.clear()
        with self.assertRaises(InterruptedError): tx.commit()
        self.assertEqual(self.cache.state()["retainedBytes"], 0)

    def test_changed_file_after_grid_validation_is_not_promoted_under_the_old_receipt(self):
        path = self.root / "validated"; path.write_bytes(b"validated grid bytes")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        path.write_bytes(b"modified grid bytes")
        with self.assertRaisesRegex(RuntimeError, "after grid validation"):
            self.cache.transaction().stage(b"identity", path, GRID, expected_digest=digest)
        self.assertEqual(self.cache.state()["retainedBytes"], 0)
        tx = self.stage(self.cache, commit=False)
        with mock.patch.object(segments.jobs, "check_cancelled", side_effect=InterruptedError("cancelled")):
            with self.assertRaises(InterruptedError): tx.commit()
        tx.abort()
        self.assertEqual(self.cache.state()["retainedBytes"], 0)

    def test_symlink_or_source_change_during_stage_cannot_be_admitted(self):
        path = self.root / "bytes"; path.write_bytes(b"admitted")
        alias = self.root / "alias"; alias.symlink_to(path)
        tx = self.cache.transaction(); tx.stage(b"alias", alias, GRID); tx.commit()
        self.assertEqual(self.cache.state()["entries"], 0)
        original_open = segments.os.open
        def replace_before_open(*args, **kwargs):
            path.write_bytes(b"modified")
            return original_open(*args, **kwargs)
        with mock.patch.object(segments.os, "open", side_effect=replace_before_open):
            with self.assertRaisesRegex(RuntimeError, "changed before"):
                self.cache.transaction().stage(b"changed", path, GRID)
        self.assertEqual(self.cache.state()["retainedBytes"], 0)

    def test_restore_reserves_complete_payload_before_open_and_checks_writes(self):
        root = self.root / "job"; root.mkdir(mode=0o700)
        payload = b"x" * 8192; path = root / "segment.mp4"
        budget = manual._LogicalBudget(root, root.lstat(), len(payload) - 1)
        with self.assertRaises(manual.jobs.LogicalFileBudgetError): budget.restore_segment(path, payload)
        self.assertFalse(path.exists())
        budget = manual._LogicalBudget(root, root.lstat(), len(payload))
        budget.restore_segment(path, payload)
        self.assertEqual(path.read_bytes(), payload)
        self.assertEqual(budget.remaining, 0)
        self.assertEqual(budget.peak_reserved, len(payload))

    def test_complete_key_invalidates_content_range_grid_profile_orientation_colour_and_runtime(self):
        item = {"source_content": {"sha256": "a" * 64, "size_bytes": 100}, "source_start_frame": 15,
                "source_end_frame": 60, "audio_selection": "single-source-stream"}
        video = {"width": 1920, "height": 1080, "rotation": 90, "color_space": "bt709"}
        encoder = ["-c:v", "h264_videotoolbox", "-b:v", "700000", "-pix_fmt", "yuv420p"]
        runtime = {"manifest": {"sha256": "b" * 64}, "ffmpeg": {"sha256": "c" * 64}}
        key = manual._segment_key(item, video, 0, encoder, runtime)
        changes = [({**item, "source_start_frame": 16}, video, 0, encoder, runtime),
                   ({**item, "source_end_frame": 59}, video, 0, encoder, runtime),
                   ({**item, "source_content": {"sha256": "d" * 64, "size_bytes": 100}}, video, 0, encoder, runtime),
                   ({**item, "source_content": {"sha256": "a" * 64, "size_bytes": 101}}, video, 0, encoder, runtime),
                   (item, {**video, "rotation": 0}, 0, encoder, runtime), (item, {**video, "color_space": "bt470bg"}, 0, encoder, runtime),
                   (item, video, 1, encoder, runtime), (item, video, 0, [*encoder, "-maxrate", "700k"], runtime),
                   (item, video, 0, encoder, {**runtime, "manifest": {"sha256": "e" * 64}})]
        for change in changes: self.assertNotEqual(key, manual._segment_key(*change))
        self.assertEqual(key, manual._segment_key(copy.deepcopy(item), dict(reversed(list(video.items()))), 0, encoder, runtime))

    def test_pipeline_warm_hit_skips_only_segment_encoding_and_final_export_never_uses_cache(self):
        helper = manual_fixture.ManualSequenceTests()
        original_run = manual.run
        def cached_run(*args, **kwargs): return original_run(*args, **kwargs, retain_segments=True)
        with mock.patch.object(manual, "_segment_runtime_identity", return_value={"fixture": "verified-runtime"}), mock.patch.object(manual, "run", side_effect=cached_run):
            for index in range(2):
                folder = self.root / str(index); folder.mkdir()
                args, common, result, original = helper._pipeline(str(folder), preview=True)
                segment_encodes = [command for command in common.commands if Path(command[-1]).name.startswith("segment-")]
                self.assertEqual(len(segment_encodes), 1 if index == 0 else 0)
                self.assertTrue(any(Path(command[-1]).suffix == ".wav" for command in common.commands))
                self.assertEqual(Path(args["items"][0]["input"]).read_bytes(), original)
                self.assertEqual(list((folder / "job").iterdir()), [folder / "job/published-account.mp4"])
            folder = self.root / "export"; folder.mkdir()
            _, common, _, _ = helper._pipeline(str(folder), preview=False)
            self.assertEqual(len([c for c in common.commands if Path(c[-1]).name.startswith("segment-")]), 1)

    def test_failed_admission_or_cleanup_does_not_publish_segments(self):
        helper = manual_fixture.ManualSequenceTests(); original_run = manual.run
        def cached_run(*args, **kwargs): return original_run(*args, **kwargs, retain_segments=True)
        with mock.patch.object(manual, "_segment_runtime_identity", return_value={"fixture": "verified-runtime"}), mock.patch.object(manual, "run", side_effect=cached_run):
            for failure in ("partial", "source-changed", "late-cancel", "pre-publish-cancel"):
                folder = self.root / failure; folder.mkdir()
                helper._pipeline(str(folder), preview=True, failure=failure)
                self.assertEqual(worker.preview_segments.state()["entries"], 0)
                self.assertEqual(worker.preview_segments.state()["pendingEntries"], 0)
            folder = self.root / "cleanup"; folder.mkdir()
            original_unlink = Path.unlink
            def fail_cleanup(path, *args, **kwargs):
                if path.name == "sequence.ffgraph": raise OSError("owned cleanup failed")
                return original_unlink(path, *args, **kwargs)
            with mock.patch.object(Path, "unlink", fail_cleanup):
                helper._pipeline(str(folder), preview=True, failure="cleanup")
            self.assertEqual(worker.preview_segments.state()["retainedBytes"], 0)

    def test_unguarded_controls_release_retention_but_guarded_health_preserves_it(self):
        self.stage(worker.preview_segments)
        with mock.patch.object(worker, "health", side_effect=lambda: {"entries": worker.preview_segments.state()["entries"]}):
            self.assertEqual(worker.handle("cevra/health", {"ownedPreviewCache": True})["entries"], 1)
            self.assertEqual(worker.handle("cevra/health", {})["entries"], 0)
        self.stage(worker.preview_segments)
        with mock.patch.object(worker, "configure", return_value={}):
            worker.handle("cevra/configure", {"ownedPreviewCache": True, "profile": {}})
        self.assertEqual(worker.preview_segments.state()["entries"], 0)
