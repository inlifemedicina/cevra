from __future__ import annotations

import hashlib
import os
import struct
import sys
import tempfile
import unittest
from fractions import Fraction
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "worker"))
import cevra_manual_sequence as manual
import cevra_native_tools as tools
import cevra_media_worker as worker


def item(path: str = "/original.mp4", start: int = 1, end: int = 2) -> dict:
    return {"input": path, "source_start_frame": start, "source_end_frame": end,
            "source_content": {"sha256": "a" * 64, "size_bytes": 100}, "audio_selection": "single-source-stream"}


class Common:
    @staticmethod
    def require_tool(name: str) -> str:
        return name


class PipelineCommon(Common):
    def __init__(self, workspace: Path, samples: int, *, failure: str | None = None, original: Path | None = None, preview: bool = False):
        self.workspace, self.samples, self.failure, self.original = workspace, samples, failure, original
        self.width, self.height = (720, 404) if preview else (1920, 1080)
        self.commands, self.graph = [], ""

    @staticmethod
    def ffmpeg_base(overwrite: bool = True):
        return ["ffmpeg", "-y" if overwrite else "-n"]

    def probe(self, path: str, **_kwargs):
        return {"file": path, "duration": self.samples / 48000,
                "video": {"codec": "h264", "width": self.width, "height": self.height, "fps": 30},
                "audio": {"codec": "pcm_f32le" if path.endswith(".wav") else "aac", "sample_rate": 48000, "channels": 2}}

    def verify_output(self, path: str):
        if self.failure == "post-publication-foreign" and path == str(self.workspace.parent / "final.mp4"):
            replacement = self.workspace.parent / "replacement.mp4"
            replacement.write_bytes(b"foreign post-publication destination")
            replacement.replace(path)
            raise RuntimeError("simulated final result verification failure")
        return self.probe(path)

    def run(self, command):
        self.commands.append(command)
        path = Path(command[-1])
        if not path.is_relative_to(self.workspace):
            raise AssertionError("renderer allocation escaped the issued workspace")
        if "-/filter_complex" in command:
            self.graph = Path(command[command.index("-/filter_complex") + 1]).read_text()
        if path.suffix == ".wav":
            data = b"\0" * (self.samples * 8)
            path.write_bytes(b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE" +
                             b"fmt " + struct.pack("<IHHIIHH", 16, 3, 2, 48000, 384000, 8, 32) +
                             b"data" + struct.pack("<I", len(data)) + data)
        else:
            path.write_bytes(b"owned synthetic encoded bytes")
        if self.failure == "partial" and path.name.startswith("segment-"):
            raise RuntimeError("simulated cancelled partial encoder output")
        if path.name == "output.mp4":
            if self.failure == "foreign":
                (self.workspace.parent / "final.mp4").write_bytes(b"foreign destination")
            elif self.failure == "source-changed":
                assert self.original is not None
                self.original.write_bytes(b"changed outside renderer")
            elif self.failure == "preview-size":
                with path.open("r+b") as handle:
                    handle.truncate(manual.inspection.MAX_BYTES + 1)


class Runtime:
    @staticmethod
    def sdr_encoder_args(encoder, *_args, **_kwargs):
        return ["-c:v", encoder, "-b:v", "1", "-pix_fmt", "yuv420p"]


class ManualSequenceTests(unittest.TestCase):
    def test_closed_native_boundary_matches_typed_frame_and_identity_contract(self) -> None:
        args = {"version": 1, "items": [item(), item()], "output": "/final.mp4", "owned_workspace": "/private-job"}
        self.assertEqual(manual.validate(args, False)[1], 2)
        worker._validate_tool_arguments("cevra-render-manual-video-sequence", args)
        for bad in ({**args, "fps": 60}, {**args, "version": True}, {**args, "items": [{**item(), "source_end_frame": 1}]},
                    {**args, "items": [{**item(), "source_content": {"sha256": "bad", "size_bytes": 100}}]},
                    {**args, "items": [{**item(), "audio_selection": "first"}]}, {**args, "items": [{**item(), "source_start_frame": 0.5}]}):
            with self.assertRaises(ValueError):
                manual.validate(bad, False)
        with self.assertRaises(ValueError):
            manual.validate(args, True)
        with self.assertRaises(ValueError):
            worker._validate_tool_arguments("cevra-render-manual-video-preview", args)

    def test_preview_and_export_share_source_pts_sampling_before_frame_trim(self) -> None:
        for width, height in ((1920, 1080), (720, 404)):
            vf = manual._video_filter(1, 2, width, height)
            self.assertTrue(vf.startswith("fps=30:start_time=0:round=near:eof_action=pass,trim=start_frame=1:end_frame=2,setpts=N/(30*TB),"))
            self.assertNotIn("STARTPTS", vf)
            self.assertIn("force_original_aspect_ratio=decrease", vf)

    def test_frame_audio_ranges_are_sample_exact_and_use_observed_absolute_stream_index(self) -> None:
        plan = {"items": [{"source_id": "s", "source_start_sample": 1600, "source_end_sample": 3200},
                          {"source_id": "s", "source_start_sample": 3200, "source_end_sample": 4800}], "output_channel_layout": "stereo"}
        graph = tools._audio_sequence_graph({}, {"s": 0}, {"s": {"audio": {"index": 3, "channel_layout": "mono"}}}, sample_plan=plan)
        self.assertIn("[0:3]asplit=2", graph)
        self.assertIn("atrim=start_sample=1600:end_sample=3200", graph)
        self.assertIn("pan=stereo|c0=c0|c1=c0", graph)
        self.assertIn("concat=n=2:v=0:a=1", graph)
        for forbidden in ("amix", "anullsrc", "apad", "afade", "volume", "normalize", "STARTPTS"):
            self.assertNotIn(forbidden, graph)

    def test_decoded_video_oracle_rejects_phase_missing_frame_short_tail_and_wrong_cadence(self) -> None:
        stream = {"codec_type": "video", "codec_name": "h264", "width": 1920, "height": 1080, "pix_fmt": "yuv420p",
                  "time_base": "1/30000", "avg_frame_rate": "30/1", "r_frame_rate": "30/1", "duration_ts": 2000, "nb_frames": "2"}
        def reduce(lines: list[str]):
            return lambda _command, consume, **_kwargs: [consume(line) for line in lines]
        good = ["best_effort_timestamp=0|duration=1000", "best_effort_timestamp=1000|duration=1000"]
        with mock.patch.object(manual, "_streams", return_value=[stream]), mock.patch.object(manual, "reduce_lines", reduce(good)):
            self.assertEqual(manual._video_clock(Common(), Path("video"), 2, 1920, 1080), Fraction(1, 15))
        for lines in (["best_effort_timestamp=1|duration=1000", good[1]], good[:1], [good[0], "best_effort_timestamp=1000|duration=999"]):
            with mock.patch.object(manual, "_streams", return_value=[stream]), mock.patch.object(manual, "reduce_lines", reduce(lines)):
                with self.assertRaises(RuntimeError):
                    manual._video_clock(Common(), Path("video"), 2, 1920, 1080)
        with mock.patch.object(manual, "_streams", return_value=[{**stream, "avg_frame_rate": "30000/1001"}]):
            with self.assertRaises(RuntimeError):
                manual._video_clock(Common(), Path("video"), 2, 1920, 1080)

    def test_aac_effective_sample_oracle_requires_measured_clock_and_priming(self) -> None:
        stream = {"codec_type": "audio", "codec_name": "aac", "sample_rate": "48000", "channels": 2,
                  "time_base": "1/48000", "duration_ts": 1600, "start_pts": 0}
        good = ["pts=-1024|duration=1024|skip_samples=1024|discard_padding=0", "pts=0|duration=1024", "pts=1024|duration=576"]
        decoded = ["best_effort_timestamp=0|duration=1024|nb_samples=1024", "best_effort_timestamp=1024|duration=576|nb_samples=576"]
        def reduce(lines: list[str]):
            return lambda command, consume, **_kwargs: [consume(line) for line in (decoded if "-show_frames" in command else lines)]
        with mock.patch.object(manual, "_streams", return_value=[stream]), mock.patch.object(manual, "reduce_lines", reduce(good)):
            self.assertEqual(manual._audio_clock(Common(), Path("aac"), 1600, 2), Fraction(1, 30))
        ffmpeg9 = ["pts=-1024|duration=1024|side_datum/skip_samples:skip_samples=1024|side_datum/skip_samples:discard_padding=0"] + good[1:]
        with mock.patch.object(manual, "_streams", return_value=[stream]), mock.patch.object(manual, "reduce_lines", reduce(ffmpeg9)):
            self.assertEqual(manual._audio_clock(Common(), Path("aac"), 1600, 2), Fraction(1, 30))
        for collision in ("pts=-1024|pts=0|duration=1024", "skip_samples=0|side_datum/skip_samples:skip_samples=1024",
                          "discard_padding=0|side_datum/skip_samples:discard_padding=0"):
            with self.assertRaisesRegex(ValueError, "duplicate"):
                manual._fields(collision)
        padded = good[:-1] + ["pts=1024|duration=1024|discard_padding=448"]
        with mock.patch.object(manual, "_streams", return_value=[stream]), mock.patch.object(manual, "reduce_lines", reduce(padded)):
            self.assertEqual(manual._audio_clock(Common(), Path("aac"), 1600, 2), Fraction(1, 30))
        clipped_padding = good[:-1] + ["pts=1024|duration=576|side_datum/skip_samples:discard_padding=448"]
        with mock.patch.object(manual, "_streams", return_value=[stream]), mock.patch.object(manual, "reduce_lines", reduce(clipped_padding)):
            self.assertEqual(manual._audio_clock(Common(), Path("aac"), 1600, 2), Fraction(1, 30))
        for lines in (["pts=-1024|duration=1024"] + good[1:], good[:-1], good[:-1] + ["pts=1024|duration=1024"], [good[0], "pts=1|duration=1024", good[2]]):
            with mock.patch.object(manual, "_streams", return_value=[stream]), mock.patch.object(manual, "reduce_lines", reduce(lines)):
                with self.assertRaises(RuntimeError):
                    manual._audio_clock(Common(), Path("aac"), 1600, 2)
        with mock.patch.object(manual, "_streams", return_value=[{**stream, "duration_ts": 1599}]), mock.patch.object(manual, "reduce_lines", reduce(good)):
            with self.assertRaises(RuntimeError):
                manual._audio_clock(Common(), Path("aac"), 1600, 2)
        for lines in ([good[0], "pts=0|duration=1024|discard_padding=1", good[2]], good[:-1] + ["pts=1024|duration=576|discard_padding=-1"],
                      good[:-1] + ["pts=1024|duration=576|discard_padding=577"], good[:-1] + ["pts=1024|duration=1024|discard_padding=447"],
                      good[:-1] + ["pts=1024|duration=576|discard_padding=447"], good[:-1] + ["pts=1024|duration=1600"]):
            with mock.patch.object(manual, "_streams", return_value=[stream]), mock.patch.object(manual, "reduce_lines", reduce(lines)):
                with self.assertRaises(RuntimeError):
                    manual._audio_clock(Common(), Path("aac"), 1600, 2)
        for frames in (decoded[:-1], [decoded[0], "best_effort_timestamp=1025|duration=576|nb_samples=576"],
                       [decoded[0], "best_effort_timestamp=1024|duration=576|nb_samples=1024"],
                       [decoded[0], "best_effort_timestamp=1024|duration=575|nb_samples=576"]):
            def wrong_decode(command, consume, **_kwargs):
                for line in (frames if "-show_frames" in command else good):
                    consume(line)
            with mock.patch.object(manual, "_streams", return_value=[stream]), mock.patch.object(manual, "reduce_lines", wrong_decode):
                with self.assertRaisesRegex(RuntimeError, "decoded AAC"):
                    manual._audio_clock(Common(), Path("aac"), 1600, 2)

    def test_growing_original_cannot_write_beyond_sealed_size_and_partial_copy_is_owned(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); source, sealed = root / "original", root / "copy"
            content = b"x" * 100; source.write_bytes(content)
            appended = False
            def grow():
                nonlocal appended
                if not appended:
                    with source.open("ab") as handle:
                        handle.write(b"unexpected growing tail")
                    appended = True
            with mock.patch.object(manual.jobs, "check_cancelled", grow):
                with self.assertRaisesRegex(RuntimeError, "grew beyond"):
                    manual._seal(source, sealed, {"sha256": hashlib.sha256(content).hexdigest(), "size_bytes": len(content)})
            self.assertLessEqual(sealed.stat().st_size, len(content))

    def test_stream_descriptor_collection_stops_during_read_and_excludes_metadata_tags(self) -> None:
        observed = []
        def flood(command, consume, **_kwargs):
            observed.extend(command)
            for index in range(129):
                consume(f"index={index}|codec_type=audio|codec_name=aac")
        with mock.patch.object(manual, "reduce_lines", flood):
            with self.assertRaisesRegex(ValueError, "collection boundary"):
                manual._streams(Common(), Path("original"))
        self.assertNotIn("stream_tags", " ".join(observed))
        self.assertIn("-show_entries", observed)

    @unittest.skipUnless(os.name == "posix", "private POSIX publication scope")
    def test_workspace_is_private_separate_and_never_adopts_original_or_foreign_alias(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve(); workspace = root / "job"; workspace.mkdir(mode=0o700)
            original = root / "original.mp4"; original.write_bytes(b"immutable")
            self.assertEqual(manual._workspace(str(workspace), root / "final.mp4", [original])[0], workspace)
            for output, inputs in ((workspace / "final.mp4", [original]), (original, [original]), (root / "final.mp4", [workspace / "original.mp4"])):
                with self.assertRaises(ValueError):
                    manual._workspace(str(workspace), output, inputs)
            workspace.chmod(0o755)
            with self.assertRaises(ValueError):
                manual._workspace(str(workspace), root / "final.mp4", [original])

    def test_extract_frame_closed_dimension_schema_and_native_filter(self) -> None:
        base = {"input": "/preview.mp4", "output": "/frame.png", "at": 0}
        worker._validate_tool_arguments("cevra-extract-frame", {**base, "max_dimension": 720})
        for value in (0, 719, 721, True, "720"):
            with self.assertRaises(ValueError):
                worker._validate_tool_arguments("cevra-extract-frame", {**base, "max_dimension": value})

    @unittest.skipUnless(os.name == "posix", "identity-bound bounded PNG cleanup")
    def test_extract_frame_measures_bounded_png_and_removes_only_owned_failed_output(self) -> None:
        class FrameCommon(Common):
            width = 720
            foreign = False
            command = None
            @staticmethod
            def ffmpeg_base():
                return ["ffmpeg", "-n"]
            def probe(self, path):
                return {"file": path, "video": {"codec": "h264", "width": 1920, "height": 1080}}
            def run(self, command):
                self.command = command; Path(command[-1]).write_bytes(b"owned png")
            def verify_output(self, path):
                if self.foreign:
                    replacement = Path(path).with_suffix(".foreign")
                    replacement.write_bytes(b"foreign png"); replacement.replace(path)
                return {"file": path, "video": {"codec": "png", "width": self.width, "height": 404}}
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "frame.png"; common = FrameCommon()
            args = {"input": "/preview.mp4", "output": str(output), "at": 0, "max_dimension": 720}
            tools._run_extract_frame(common, args)
            self.assertIn("min(720,iw)", common.command[common.command.index("-vf") + 1])
            self.assertEqual(output.read_bytes(), b"owned png")
            output.unlink(); common.width = 721
            with self.assertRaisesRegex(RuntimeError, "dimension postcondition"):
                tools._run_extract_frame(common, args)
            self.assertFalse(output.exists())
            common.foreign = True
            with self.assertRaisesRegex(RuntimeError, "identity changed"):
                tools._run_extract_frame(common, args)
            self.assertEqual(output.read_bytes(), b"foreign png")

    def _pipeline(self, directory: str, *, failure: str | None = None, preview: bool = False):
        from contextlib import ExitStack
        root = Path(directory).resolve(); workspace = root / "job"; workspace.mkdir(mode=0o700)
        original = root / "original.mp4"; content = b"original immutable bytes"; original.write_bytes(content)
        one = {**item(str(original)), "source_content": {"sha256": hashlib.sha256(content).hexdigest(), "size_bytes": len(content)}}
        args = {"version": 1, "items": [one] if preview else [one, one], "output": str(root / "final.mp4"), "owned_workspace": str(workspace)}
        frames = len(args["items"]); common = PipelineCommon(workspace, frames * 1600, failure=failure, original=original, preview=preview)
        meta = {"duration": 1, "video": {"codec": "h264", "width": 1920, "height": 1080, "bit_depth": 8, "pix_fmt": "yuv420p"},
                "audio": {"codec": "aac", "sample_rate": 48000, "channels": 2, "channel_layout": "stereo"}}
        clock = [Fraction(index, 30) for index in range(30)]
        def check_cancelled():
            if failure == "late-cancel" and Path(args["output"]).exists():
                raise RuntimeError("simulated cancellation after publication")
            if failure == "pre-publish-cancel" and (workspace / "published-account.mp4").exists() and not Path(args["output"]).exists():
                raise RuntimeError("simulated cancellation after accounting before publication")
        with ExitStack() as stack:
            stack.enter_context(mock.patch.dict(os.environ, {"CEVRA_VIDEO_ENCODER_H264": "h264_videotoolbox"}))
            stack.enter_context(mock.patch.object(manual.inspection, "_inspect_source", return_value=(meta, clock, [Fraction(1, 30)] * 30, Fraction(1, 30000), {}, (0, 48000))))
            stack.enter_context(mock.patch.object(manual, "_streams", return_value=[{"index": 0, "codec_type": "video"}, {"index": 3, "codec_type": "audio"}]))
            stack.enter_context(mock.patch.object(manual, "_video_clock", side_effect=lambda _common, _path, count, *_dimensions: Fraction(count, 30)))
            stack.enter_context(mock.patch.object(manual, "_audio_clock", side_effect=lambda _common, _path, count, _channels: Fraction(count, 48000)))
            stack.enter_context(mock.patch.object(tools, "_ffmpeg_encoders", return_value=["aac"]))
            stack.enter_context(mock.patch.object(manual.jobs, "check_cancelled", check_cancelled))
            if failure in ("late-cancel", "pre-publish-cancel", "foreign", "post-publication-foreign"):
                stack.enter_context(mock.patch.object(tools, "_unlink_published", side_effect=AssertionError("manual failure must not path-unlink public destination or accounting")))
            if failure:
                with self.assertRaises((RuntimeError, ValueError, FileExistsError)):
                    manual.run(common, Runtime(), args, preview=preview)
                result = None
            else:
                result = manual.run(common, Runtime(), args, preview=preview)
        return args, common, result, content

    @unittest.skipUnless(os.name == "posix", "private POSIX publication scope")
    def test_complete_orchestrator_reuses_repeated_segment_and_retains_only_same_inode_accounting(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            args, common, result, content = self._pipeline(directory)
            root = Path(args["owned_workspace"]); output = Path(args["output"])
            self.assertEqual([path.name for path in root.iterdir()], ["published-account.mp4"])
            self.assertEqual(output.stat().st_ino, (root / "published-account.mp4").stat().st_ino)
            self.assertEqual(Path(args["items"][0]["input"]).read_bytes(), content)
            self.assertEqual(result["structuredContent"]["manualSequence"]["uniqueSegmentCount"], 1)
            self.assertEqual(result["structuredContent"]["manualSequence"]["outputSha256"], hashlib.sha256(output.read_bytes()).hexdigest())
            self.assertEqual(sum(Path(command[-1]).name.startswith("segment-") for command in common.commands), 1)
            self.assertIn("[0:3]asplit=2", common.graph)
            self.assertNotIn("-shortest", sum(common.commands, []))
            self.assertTrue(all(not path.name.startswith("manual-render-") for path in root.iterdir()))

    @unittest.skipUnless(os.name == "posix", "private POSIX publication scope")
    def test_partial_render_and_pre_admission_failure_remove_every_private_intermediate(self) -> None:
        for failure in ("partial", "source-changed"):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:
                args, _common, _result, content = self._pipeline(directory, failure=failure)
                self.assertFalse(Path(args["output"]).exists())
                self.assertEqual(list(Path(args["owned_workspace"]).iterdir()), [])
                if failure != "source-changed":
                    self.assertEqual(Path(args["items"][0]["input"]).read_bytes(), content)

    @unittest.skipUnless(os.name == "posix", "private POSIX publication scope")
    def test_publication_collision_preserves_foreign_destination_and_retains_accounting_for_recovery(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            args, _common, _result, content = self._pipeline(directory, failure="foreign")
            self.assertEqual(Path(args["output"]).read_bytes(), b"foreign destination")
            accounting = Path(args["owned_workspace"]) / "published-account.mp4"
            self.assertEqual(list(Path(args["owned_workspace"]).iterdir()), [accounting])
            self.assertNotEqual(accounting.stat().st_ino, Path(args["output"]).stat().st_ino)
            self.assertEqual(Path(args["items"][0]["input"]).read_bytes(), content)

    @unittest.skipUnless(os.name == "posix", "private POSIX publication scope")
    def test_late_cancel_and_final_replacement_never_path_unlink_destination_or_accounting(self) -> None:
        for failure in ("late-cancel", "post-publication-foreign", "pre-publish-cancel"):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:
                args, _common, _result, content = self._pipeline(directory, failure=failure)
                output = Path(args["output"]); accounting = Path(args["owned_workspace"]) / "published-account.mp4"
                self.assertEqual(list(Path(args["owned_workspace"]).iterdir()), [accounting])
                self.assertEqual(accounting.read_bytes(), b"owned synthetic encoded bytes")
                self.assertEqual(Path(args["items"][0]["input"]).read_bytes(), content)
                if failure == "pre-publish-cancel":
                    self.assertFalse(output.exists())
                elif failure == "post-publication-foreign":
                    self.assertEqual(output.read_bytes(), b"foreign post-publication destination")
                    self.assertNotEqual(output.stat().st_ino, accounting.stat().st_ino)
                else:
                    self.assertEqual(output.stat().st_ino, accounting.stat().st_ino)

    @unittest.skipUnless(os.name == "posix", "private POSIX publication scope")
    def test_private_cleanup_failure_after_success_retains_final_and_accounting(self) -> None:
        original_unlink = Path.unlink
        def fail_graph_cleanup(path, *args, **kwargs):
            if path.name == "sequence.ffgraph":
                raise OSError("simulated private graph cleanup failure")
            if path.name == "final.mp4":
                raise AssertionError("manual cleanup rollback must never unlink public final")
            return original_unlink(path, *args, **kwargs)
        with tempfile.TemporaryDirectory() as directory:
            with mock.patch.object(Path, "unlink", fail_graph_cleanup):
                with self.assertRaisesRegex(RuntimeError, "accounting link retained for recovery"):
                    self._pipeline(directory)
            root = Path(directory).resolve(); output = root / "final.mp4"; accounting = root / "job" / "published-account.mp4"
            self.assertEqual(output.stat().st_ino, accounting.stat().st_ino)
            retained = list((root / "job").glob("manual-render-*/sequence.ffgraph"))
            self.assertEqual(len(retained), 1)
            self.assertEqual(list(retained[0].parent.iterdir()), retained)

    @unittest.skipUnless(os.name == "posix", "private POSIX publication scope")
    def test_preview_keeps_inherited_720_side_bitrates_and_rejects_oversize_before_publication(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            _args, common, result, _content = self._pipeline(directory, preview=True)
            evidence = result["structuredContent"]["manualSequence"]
            self.assertEqual((evidence["width"], evidence["height"], evidence["targetVideoBitsPerSecond"]), (720, 404, 700000))
            segment = next(command for command in common.commands if Path(command[-1]).name.startswith("segment-"))
            self.assertEqual(segment[segment.index("-maxrate") + 1], "700k")
            self.assertEqual(segment[segment.index("-bufsize") + 1], "1400k")
            mux = next(command for command in common.commands if Path(command[-1]).name == "output.mp4")
            self.assertEqual(mux[mux.index("-b:a") + 1], "96000")
        with tempfile.TemporaryDirectory() as directory:
            args, _common, _result, _content = self._pipeline(directory, preview=True, failure="preview-size")
            self.assertFalse(Path(args["output"]).exists())
            self.assertEqual(list(Path(args["owned_workspace"]).iterdir()), [])


if __name__ == "__main__":
    unittest.main()
