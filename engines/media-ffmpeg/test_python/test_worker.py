from __future__ import annotations

import os
import io
import json
import sys
import tarfile
import tempfile
import unittest
import struct
from fractions import Fraction
from pathlib import Path
from unittest import mock

ENGINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE / "worker"))
sys.path.insert(0, str(ENGINE / "runtime"))

import cevra_job_control as job_control
import cevra_media_worker as worker
import cevra_native_tools as native_tools
import prepare_python_runtime
import prepare_ffmpeg_source
import prepare_vendor
import schema_validator
import _cevra_runtime as runtime_args
from runtime_integrity import required_notice_paths


def write_sparse_float_wav(path: Path, samples: int, channels: int = 2) -> None:
    data_bytes = samples * channels * 4
    with path.open("wb") as handle:
        handle.write(b"RIFF" + struct.pack("<I", data_bytes + 36) + b"WAVE")
        handle.write(b"fmt " + struct.pack("<IHHIIHH", 16, 3, channels, 48_000, 48_000 * channels * 4, channels * 4, 32))
        handle.write(b"data" + struct.pack("<I", data_bytes))
        handle.seek(data_bytes - 1, os.SEEK_CUR)
        handle.write(b"\0")


class JobControlTests(unittest.TestCase):
    def tearDown(self) -> None:
        active = job_control.active_job_id()
        if active:
            job_control.finish_job(active)

    def test_subprocess_stdin_is_devnull_by_default(self) -> None:
        job_control.begin_job("stdin")
        result = job_control.run([sys.executable, "-I", "-B", "-c", "print('ok')"], stdout=-1, text=True, check=True)
        self.assertEqual(result.stdout.strip(), "ok")

    def test_artifact_preexistence_is_checked_before_popen(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "target"
            output = Path(directory) / "output"
            target.write_text("preserve", encoding="utf-8")
            output.symlink_to(target)
            job_control.begin_job("preexistence")
            with mock.patch.object(job_control.subprocess, "Popen") as popen:
                with self.assertRaisesRegex(RuntimeError, "must not be a symlink"):
                    job_control.popen([sys.executable, "-c", "pass"], artifact_paths=[str(output)])
                popen.assert_not_called()
            self.assertEqual(target.read_text(encoding="utf-8"), "preserve")


class WorkerContractTests(unittest.TestCase):
    def tearDown(self) -> None:
        active = job_control.active_job_id()
        if active:
            job_control.finish_job(active)
        worker._JOB_THREAD = None
        for name in ("CEVRA_VIDEO_ENCODER_H264", "CEVRA_VIDEO_ENCODER_HEVC", "CEVRA_VIDEO_ENCODER_AV1", "CEVRA_DECODE_ACCELERATION"):
            os.environ.pop(name, None)

    def test_resource_limits_are_explicit_in_rpc_schemas(self) -> None:
        transcode = worker._schema_for_tool("cevra-transcode")
        self.assertEqual(transcode["properties"]["width"]["maximum"], worker.MAX_MEDIA_WIDTH)
        self.assertEqual(transcode["properties"]["height"]["maximum"], worker.MAX_MEDIA_HEIGHT)
        self.assertEqual(transcode["properties"]["fps"]["maximum"], worker.MAX_MEDIA_FPS)
        self.assertEqual(worker._schema_for_tool("join")["properties"]["inputs"]["maxItems"], worker.MAX_MEDIA_INPUTS)
        self.assertEqual(worker._schema_for_tool("probe")["properties"]["inputs"]["items"]["maxLength"], worker.MAX_MEDIA_PATH_LENGTH)
        audio_sequence = worker._schema_for_tool("cevra-render-audio-sequence")
        self.assertEqual(audio_sequence["properties"]["sources"]["maxItems"], worker.MAX_MEDIA_INPUTS)
        self.assertEqual(audio_sequence["properties"]["items"]["maxItems"], worker.MAX_AUDIO_SEQUENCE_ITEMS)
        self.assertFalse(audio_sequence["properties"]["items"]["items"]["additionalProperties"])
        with self.assertRaisesRegex(ValueError, "too many items"):
            worker._validate_tool_arguments("join", {"inputs": ["i"] * (worker.MAX_MEDIA_INPUTS + 1), "output": "o.mp4"})

    def test_empty_encoder_profile_exposes_audio_and_conditional_copy_deliveries(self) -> None:
        deliveries = worker.effective_deliveries({}, ["aac", "opus", "pcm_s16le"])
        self.assertTrue(deliveries)
        self.assertFalse(any(item.get("videoCodec") in {"h264", "h265", "av1"} for item in deliveries))
        self.assertTrue(any(item.get("videoCodec") == "copy" and item.get("audioCodec") == "aac" for item in deliveries))
        self.assertTrue(any(item.get("audioOnly") and item.get("audioCodec") == "opus" for item in deliveries))
        filters = ["afade", "aformat", "adelay", "amix", "anullsrc", "aresample", "asetpts", "asplit", "atrim", "pan", "volume"]
        with mock.patch.object(worker, "_filters", return_value=filters), mock.patch.object(worker, "_encoders", return_value=["pcm_f32le"]):
            tools: dict[str, dict[str, object]] = {}
            worker._custom_health(tools, {}, True, deliveries)
            self.assertEqual(tools["cevra-mux-audio"]["usable"], "yes")
            self.assertEqual(tools["cevra-render-audio-sequence"]["usable"], "yes")
            empty_tools: dict[str, dict[str, object]] = {}
            worker._custom_health(empty_tools, {}, True, [])
            self.assertEqual(empty_tools["cevra-transcode"]["usable"], "no")
            self.assertEqual(empty_tools["cevra-render-audio-sequence"]["usable"], "yes")

    def test_audio_sequence_rpc_schema_rejects_nested_extras_before_execution(self) -> None:
        arguments = {
            "version": 1,
            "sources": [{"id": "a", "uri": "/media/a.wav"}],
            "items": [{"source_id": "a", "source_start_ms": 0, "source_end_ms": 1000, "timeline_start_ms": 0}],
            "output": "/media/out.wav", "output_duration_ms": 1000, "output_channel_layout": "mono",
        }
        worker._validate_tool_arguments("cevra-render-audio-sequence", arguments)
        with self.assertRaisesRegex(ValueError, "unexpected fields: filtergraph"):
            worker._validate_tool_arguments("cevra-render-audio-sequence", {
                **arguments, "items": [{**arguments["items"][0], "filtergraph": "evil"}],
            })
        with self.assertRaisesRegex(ValueError, "outside its allowed values"):
            worker._validate_tool_arguments("cevra-render-audio-sequence", {**arguments, "output_channel_layout": "surround"})

    def test_mux_duration_rpc_schema_is_closed_and_bounded(self) -> None:
        arguments = {
            "video": "/media/video.mp4", "audio": "/media/audio.wav", "output": "/media/out.mp4",
            "duration_validation": {"version": 1, "video_duration_ms": 4000, "audio_duration_ms": 4000,
                                    "input_tolerance_ms": 1, "output_audio_tolerance_ms": 23},
        }
        worker._validate_tool_arguments("cevra-mux-audio", arguments)
        with self.assertRaisesRegex(ValueError, "unexpected fields: future"):
            worker._validate_tool_arguments("cevra-mux-audio", {
                **arguments, "duration_validation": {**arguments["duration_validation"], "future": True},
            })

    def test_configure_rejects_gpl_encoder_outside_runtime_allowlist(self) -> None:
        caps = {"platform": "darwin", "arch": "arm64", "encoders": ["libx264", "h264_videotoolbox"], "hwaccels": ["videotoolbox"]}
        with mock.patch.object(worker, "runtime_capabilities", return_value=caps):
            with self.assertRaisesRegex(ValueError, "not allowed"):
                worker.configure({"h264Encoder": "libx264"})
            configured = worker.configure({"h264Encoder": "h264_videotoolbox", "decodeAcceleration": "videotoolbox"})
        self.assertEqual(configured["profile"]["h264"], "h264_videotoolbox")

    def test_thread_start_failure_clears_active_state(self) -> None:
        failed_thread = mock.Mock()
        failed_thread.start.side_effect = RuntimeError("cannot start")
        with mock.patch.object(worker.threading, "Thread", return_value=failed_thread):
            with self.assertRaisesRegex(RuntimeError, "cannot start"):
                worker._start_job(1, {"jobId": "start-failure", "name": "probe", "arguments": {"inputs": ["input.mp4"]}})
        self.assertIsNone(job_control.active_job_id())
        self.assertIsNone(worker._JOB_THREAD)


class AudioSequenceNativeToolTests(unittest.TestCase):
    def arguments(self, root: Path, source_count: int = 3, item_count: int = 3) -> dict[str, object]:
        sources = []
        metadata: dict[str, dict[str, object]] = {}
        for index in range(source_count):
            path = root / f"source-{index}.wav"
            path.write_bytes(b"fixture")
            sources.append({"id": f"s{index}", "uri": str(path)})
            metadata[str(path.resolve())] = {
                "duration": 60.0,
                "audio": {"codec": "pcm_f32le", "channels": 1 if index % 2 == 0 else 2, "channel_layout": "mono" if index % 2 == 0 else "stereo", "sample_rate": 44_100 if index % 2 else 48_000, "start_time": "0", "duration": "60.0"},
            }
        items = []
        for index in range(item_count):
            items.append({
                "source_id": f"s{index % source_count}",
                "source_start_ms": index * 10,
                "source_end_ms": index * 10 + 100,
                "timeline_start_ms": index * 100,
            })
        return {
            "version": 1, "sources": sources, "items": items,
            "output": str(root / "output.wav"),
            "output_duration_ms": item_count * 100,
            "output_channel_layout": "stereo",
            "_metadata": metadata,
        }

    def test_compiler_scales_structurally_without_embedding_paths(self) -> None:
        source_count = 32
        for item_count in (256, native_tools.MAX_AUDIO_SEQUENCE_ITEMS):
            with self.subTest(item_count=item_count):
                sources = {f"s{index}": index for index in range(source_count)}
                metadata = {source_id: {"audio": {"channel_layout": "mono" if index % 2 == 0 else "stereo"}} for source_id, index in sources.items()}
                args = {
                    "output_channel_layout": "stereo", "output_duration_ms": item_count * 10,
                    "items": [{"source_id": f"s{index % source_count}", "source_start_ms": 0, "source_end_ms": 10, "timeline_start_ms": index * 10} for index in range(item_count)],
                }
                graph = native_tools._audio_sequence_graph(args, sources, metadata)
                self.assertLess(len(graph.encode("utf-8")), native_tools.MAX_AUDIO_SEQUENCE_GRAPH_BYTES)
                self.assertEqual(graph.count("[cevra_item_"), item_count * 2)
                self.assertNotIn(".wav", graph)

    def test_semantics_reject_unused_sources_and_ordinary_riff_overflow(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            args = self.arguments(Path(directory))
            metadata = args.pop("_metadata")
            self.assertIsInstance(metadata, dict)
            with self.assertRaisesRegex(ValueError, "declared but unused"):
                native_tools._validate_audio_sequence_semantics({**args, "items": args["items"][:1]})
            with self.assertRaisesRegex(ValueError, "RIFF/WAV"):
                native_tools._validate_audio_sequence_semantics({**args, "output_duration_ms": 4 * 60 * 60 * 1000})

    def test_canonical_source_alias_and_short_source_fail_before_render(self) -> None:
        class ProbeOnlyCommon:
            def __init__(self, metadata: dict[str, object]) -> None:
                self.metadata = metadata

            def probe(self, path: str, role: str = "input") -> dict[str, object]:
                return self.metadata[path]

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "alias-component").mkdir()
            args = self.arguments(root, source_count=1, item_count=1)
            metadata = args.pop("_metadata")
            source = Path(str(args["sources"][0]["uri"]))
            alias = root / "alias-component" / ".." / source.name
            args["sources"].append({"id": "alias", "uri": str(alias)})
            args["items"].append({"source_id": "alias", "source_start_ms": 0, "source_end_ms": 100, "timeline_start_ms": 0})
            with self.assertRaisesRegex(ValueError, "aliases another declared source"):
                native_tools._run_audio_sequence(ProbeOnlyCommon(metadata), args)

            args = self.arguments(root, source_count=1, item_count=1)
            metadata = args.pop("_metadata")
            metadata[str(Path(str(args["sources"][0]["uri"])).resolve())]["audio"]["duration"] = "0.099"
            with self.assertRaisesRegex(ValueError, "exceeds proven audio timeline coverage"):
                native_tools._run_audio_sequence(ProbeOnlyCommon(metadata), args)

    def test_audio_coverage_never_falls_back_to_container_duration(self) -> None:
        class ProbeOnlyCommon:
            def __init__(self, metadata: dict[str, object]) -> None:
                self.metadata = metadata
            def probe(self, path: str, role: str = "input") -> dict[str, object]:
                return self.metadata[path]

        with tempfile.TemporaryDirectory() as directory:
            args = self.arguments(Path(directory), source_count=1, item_count=1)
            metadata = args.pop("_metadata")
            source_metadata = metadata[str(Path(str(args["sources"][0]["uri"])).resolve())]
            source_metadata["duration"] = 10.0
            source_metadata["audio"]["duration"] = "2.0"
            args["items"][0]["source_start_ms"] = 7_000
            args["items"][0]["source_end_ms"] = 8_000
            args["output_duration_ms"] = 1_000
            with self.assertRaisesRegex(ValueError, "proven audio timeline coverage"):
                native_tools._run_audio_sequence(ProbeOnlyCommon(metadata), args)
            source_metadata["audio"].pop("duration")
            with self.assertRaisesRegex(ValueError, "audio duration is unavailable"):
                native_tools._run_audio_sequence(ProbeOnlyCommon(metadata), args)

    def test_audio_coverage_accepts_only_a_well_formed_stream_duration_tag(self) -> None:
        audio = {"start_time": "1.250", "duration_tag": "00:00:03.500000000"}
        self.assertEqual(native_tools._audio_coverage_ms(audio, "tagged"), (Fraction(1250), Fraction(4750)))
        for malformed in ("03.500", "00:00:not-a-duration", "00:00:-1"):
            with self.subTest(malformed=malformed), self.assertRaisesRegex(ValueError, "audio (duration|timeline coverage)"):
                native_tools._audio_coverage_ms({"start_time": "0", "duration_tag": malformed}, "tagged")

    def test_measured_wav_samples_are_read_from_chunks_not_a_fixed_header(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            wav = Path(directory) / "measured.wav"
            data_bytes = 480 * 2 * 4
            junk = b"evidence"
            with wav.open("wb") as handle:
                riff_size = 4 + (8 + 16) + (8 + len(junk)) + (8 + data_bytes)
                handle.write(b"RIFF" + struct.pack("<I", riff_size) + b"WAVE")
                handle.write(b"fmt " + struct.pack("<IHHIIHH", 16, 3, 2, 48_000, 384_000, 8, 32))
                handle.write(b"JUNK" + struct.pack("<I", len(junk)) + junk)
                handle.write(b"data" + struct.pack("<I", data_bytes))
                handle.seek(data_bytes - 1, os.SEEK_CUR)
                handle.write(b"\0")
            self.assertEqual(native_tools._measure_pcm_f32le_wav(wav), (480, data_bytes))

    def test_measured_wav_sample_mismatch_fails_before_publication(self) -> None:
        class ShortOutputCommon:
            def __init__(self, metadata: dict[str, object]) -> None:
                self.metadata = metadata
            def probe(self, path: str, role: str = "input") -> dict[str, object]:
                if role == "output":
                    return {"file": path, "duration": 0.3, "audio": {"codec": "pcm_f32le", "sample_rate": 48_000, "channels": 2}}
                return self.metadata[path]
            def verify_output(self, path: str) -> dict[str, object]:
                return self.probe(path, "output")
            def ffmpeg_base(self, overwrite: bool = True) -> list[str]:
                return ["ffmpeg", "-n"]
            def run(self, command: list[str]) -> None:
                write_sparse_float_wav(Path(command[-1]), 14_399)

        with tempfile.TemporaryDirectory() as directory:
            args = self.arguments(Path(directory))
            metadata = args.pop("_metadata")
            with self.assertRaisesRegex(RuntimeError, "measured sample-frame"):
                native_tools._run_audio_sequence(ShortOutputCommon(metadata), args)
            self.assertFalse(Path(str(args["output"])).exists())

    def test_eacces_and_enospc_are_fail_closed_at_the_custom_tool_boundary(self) -> None:
        class FailingCommon:
            def __init__(self, metadata: dict[str, object], message: str) -> None:
                self.metadata = metadata
                self.message = message

            def probe(self, path: str, role: str = "input") -> dict[str, object]:
                return self.metadata[path]

            def ffmpeg_base(self, overwrite: bool = True) -> list[str]:
                return ["ffmpeg", "-n"]

            def run(self, command: list[str]) -> None:
                Path(command[-1]).write_bytes(b"partial")
                raise OSError(self.message)

        for message in ("EACCES: injected permission failure", "ENOSPC: injected no-space failure"):
            with self.subTest(message=message), tempfile.TemporaryDirectory() as directory:
                args = self.arguments(Path(directory))
                metadata = args.pop("_metadata")
                common = FailingCommon(metadata, message)
                with mock.patch.object(native_tools, "_load_common", return_value=common), mock.patch.object(native_tools, "_load_runtime", return_value=object()):
                    result = native_tools.call_custom_tool("cevra-render-audio-sequence", args, Path(directory))
                self.assertTrue(result["isError"])
                self.assertIn(message, result["content"][0]["text"])
                self.assertFalse(Path(args["output"]).exists())

    def test_partial_output_cleanup_failure_is_reported(self) -> None:
        class FailingCommon:
            def __init__(self, metadata: dict[str, object]) -> None:
                self.metadata = metadata

            def probe(self, path: str, role: str = "input") -> dict[str, object]:
                return self.metadata[path]

            def ffmpeg_base(self, overwrite: bool = True) -> list[str]:
                return ["ffmpeg", "-n"]

            def run(self, command: list[str]) -> None:
                Path(command[-1]).write_bytes(b"partial")
                raise OSError("injected render failure")

        with tempfile.TemporaryDirectory() as directory:
            args = self.arguments(Path(directory))
            metadata = args.pop("_metadata")
            common = FailingCommon(metadata)
            original_unlink = Path.unlink

            def fail_output_cleanup(path: Path, *call_args: object, **call_kwargs: object) -> None:
                if path.name == "output.wav" and path != Path(str(args["output"])):
                    raise OSError("injected output cleanup failure")
                original_unlink(path, *call_args, **call_kwargs)

            with mock.patch.object(Path, "unlink", fail_output_cleanup):
                with self.assertRaisesRegex(RuntimeError, "owned artifact cleanup failed"):
                    native_tools._run_audio_sequence(common, args)

    def test_output_created_during_render_is_preserved_and_blocks_promotion(self) -> None:
        class RacingCommon:
            def __init__(self, metadata: dict[str, object], requested_output: Path) -> None:
                self.metadata = metadata
                self.requested_output = requested_output

            def probe(self, path: str, role: str = "input") -> dict[str, object]:
                if role == "output":
                    return {"file": path, "duration": 0.3, "size_bytes": 115_314, "audio": {"codec": "pcm_f32le", "sample_rate": 48_000, "channels": 2}}
                return self.metadata[path]

            def verify_output(self, path: str) -> dict[str, object]:
                return self.probe(path, "output")

            def ffmpeg_base(self, overwrite: bool = True) -> list[str]:
                return ["ffmpeg", "-n"]

            def run(self, command: list[str]) -> None:
                write_sparse_float_wav(Path(command[-1]), 14_400)
                self.requested_output.write_bytes(b"foreign race winner")

        with tempfile.TemporaryDirectory() as directory:
            args = self.arguments(Path(directory))
            metadata = args.pop("_metadata")
            requested_output = Path(str(args["output"]))
            common = RacingCommon(metadata, requested_output)
            with self.assertRaises(FileExistsError):
                native_tools._run_audio_sequence(common, args)
            self.assertEqual(requested_output.read_bytes(), b"foreign race winner")
            self.assertEqual(list(Path(directory).glob(".cevra-audio-sequence-*")), [])

    def test_audio_sequence_confirms_staging_identity_after_link_before_claiming_ownership(self) -> None:
        if os.name != "posix":
            self.skipTest("POSIX dev/inode identity is not available")

        class SuccessfulCommon:
            def __init__(self, metadata: dict[str, object]) -> None:
                self.metadata = metadata

            def probe(self, path: str, role: str = "input") -> dict[str, object]:
                if role == "output":
                    return {"file": path, "duration": 0.3, "size_bytes": 115_314,
                            "audio": {"codec": "pcm_f32le", "sample_rate": 48_000, "channels": 2}}
                return self.metadata[path]

            def verify_output(self, path: str) -> dict[str, object]:
                return self.probe(path, "output")

            def ffmpeg_base(self, overwrite: bool = True) -> list[str]:
                return ["ffmpeg", "-n"]

            def run(self, command: list[str]) -> None:
                write_sparse_float_wav(Path(command[-1]), 14_400)

        with tempfile.TemporaryDirectory() as directory:
            args = self.arguments(Path(directory))
            metadata = args.pop("_metadata")
            output = Path(str(args["output"]))
            common = SuccessfulCommon(metadata)
            original_link = os.link

            def replace_after_link(source: object, destination: object, **kwargs: object) -> None:
                original_link(source, destination, **kwargs)
                Path(destination).unlink()
                Path(destination).write_bytes(b"foreign post-link replacement")

            with mock.patch.object(os, "link", replace_after_link):
                with self.assertRaisesRegex(RuntimeError, "publication identity changed"):
                    native_tools._run_audio_sequence(common, args)
            self.assertEqual(output.read_bytes(), b"foreign post-link replacement")
            self.assertEqual(list(Path(directory).glob(".cevra-audio-sequence-*")), [])

    def test_graph_cleanup_failure_is_reported(self) -> None:
        class SuccessfulCommon:
            def __init__(self, metadata: dict[str, object]) -> None:
                self.metadata = metadata

            def probe(self, path: str, role: str = "input") -> dict[str, object]:
                if role == "output":
                    return {"file": path, "duration": 0.3, "size_bytes": 115_314, "audio": {"codec": "pcm_f32le", "sample_rate": 48_000, "channels": 2}}
                return self.metadata[path]

            def verify_output(self, path: str) -> dict[str, object]:
                return self.probe(path, "output")

            def ffmpeg_base(self, overwrite: bool = True) -> list[str]:
                return ["ffmpeg", "-n"]

            def run(self, command: list[str]) -> None:
                write_sparse_float_wav(Path(command[-1]), 14_400)

        with tempfile.TemporaryDirectory() as directory:
            args = self.arguments(Path(directory))
            metadata = args.pop("_metadata")
            common = SuccessfulCommon(metadata)
            original_unlink = Path.unlink

            def fail_graph_cleanup(path: Path, *call_args: object, **call_kwargs: object) -> None:
                if path.suffix == ".ffgraph":
                    raise OSError("injected graph cleanup failure")
                original_unlink(path, *call_args, **call_kwargs)

            with mock.patch.object(Path, "unlink", fail_graph_cleanup):
                with self.assertRaisesRegex(RuntimeError, "graph cleanup failed"):
                    native_tools._run_audio_sequence(common, args)


class MuxAudioNativeToolTests(unittest.TestCase):
    class Common:
        def __init__(self, video: Path, audio: Path, output: Path, race: bool = False) -> None:
            self.video = video.resolve()
            self.audio = audio.resolve()
            self.output = output
            self.race = race
            self.commands: list[list[str]] = []

        def probe(self, path: str, role: str = "input") -> dict[str, object]:
            resolved = Path(path).resolve()
            if role == "output" or resolved == self.output.resolve(strict=False):
                return {"file": path, "duration": 4.0, "video": {"codec": "h264"}, "audio": {"codec": "aac"}}
            if resolved == self.video:
                return {"duration": 4.0, "video": {"codec": "h264"}, "audio": {"codec": "aac"}}
            if resolved == self.audio:
                return {"duration": 4.0, "video": None, "audio": {"codec": "pcm_f32le"}}
            raise AssertionError(f"unexpected probe path: {path}")

        def verify_output(self, path: str) -> dict[str, object]:
            return {"file": path, "duration": 4.0, "video": {"codec": "h264"}, "audio": {"codec": "aac"}}

        def ffmpeg_base(self, overwrite: bool = True) -> list[str]:
            return ["ffmpeg", "-y" if overwrite else "-n"]

        def require_tool(self, name: str) -> str:
            return name

        def run(self, command: list[str], **_: object) -> object:
            if "-encoders" in command:
                return mock.Mock(stdout=" A..... aac", stderr="", returncode=0)
            self.commands.append(command)
            Path(command[-1]).write_bytes(b"owned staged mux")
            if self.race:
                self.output.write_bytes(b"foreign race winner")
            return mock.Mock(stdout="", stderr="", returncode=0)

    @staticmethod
    def arguments(root: Path) -> tuple[dict[str, object], Path, Path, Path]:
        video = root / "picture.mp4"
        audio = root / "mix.wav"
        output = root / "final.mp4"
        video.write_bytes(b"video fixture")
        audio.write_bytes(b"audio fixture")
        return ({"video": str(video), "audio": str(audio), "output": str(output), "replace_existing": True}, video, audio, output)

    def test_mux_publishes_exclusively_and_cleans_owned_staging(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            args, video, audio, output = self.arguments(Path(directory))
            common = self.Common(video, audio, output)
            result = native_tools._run_mux_audio(common, args)
            self.assertEqual(result["structuredContent"]["output"], str(output))
            self.assertEqual(result["structuredContent"]["publication"]["scheme"], "posix-dev-inode")
            self.assertEqual(output.read_bytes(), b"owned staged mux")
            self.assertEqual(len(common.commands), 1)
            self.assertIn("-c:v", common.commands[0])
            self.assertEqual(list(Path(directory).glob(".cevra-mux-audio-*")), [])

    def test_mux_preserves_a_foreign_race_winner(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            args, video, audio, output = self.arguments(Path(directory))
            common = self.Common(video, audio, output, race=True)
            with self.assertRaises(FileExistsError):
                native_tools._run_mux_audio(common, args)
            self.assertEqual(output.read_bytes(), b"foreign race winner")
            self.assertEqual(list(Path(directory).glob(".cevra-mux-audio-*")), [])

    def test_mux_confirms_staging_identity_after_link_before_claiming_ownership(self) -> None:
        if os.name != "posix":
            self.skipTest("POSIX dev/inode identity is not available")
        with tempfile.TemporaryDirectory() as directory:
            args, video, audio, output = self.arguments(Path(directory))
            common = self.Common(video, audio, output)
            original_link = os.link

            def replace_after_link(source: object, destination: object, **kwargs: object) -> None:
                original_link(source, destination, **kwargs)
                Path(destination).unlink()
                Path(destination).write_bytes(b"foreign post-link replacement")

            with mock.patch.object(os, "link", replace_after_link):
                with self.assertRaisesRegex(RuntimeError, "publication identity changed"):
                    native_tools._run_mux_audio(common, args)
            self.assertEqual(output.read_bytes(), b"foreign post-link replacement")
            self.assertEqual(list(Path(directory).glob(".cevra-mux-audio-*")), [])

    def test_mux_file_result_failure_preserves_a_post_link_foreign_replacement(self) -> None:
        class ReplacementCommon(self.Common):
            verify_calls = 0
            def verify_output(inner_self, path: str) -> dict[str, object]:
                inner_self.verify_calls += 1
                if inner_self.verify_calls == 2:
                    replacement = inner_self.output.with_suffix(".foreign")
                    replacement.write_bytes(b"foreign replacement")
                    os.replace(replacement, inner_self.output)
                    raise RuntimeError("injected file result failure")
                return super().verify_output(path)

        with tempfile.TemporaryDirectory() as directory:
            args, video, audio, output = self.arguments(Path(directory))
            common = ReplacementCommon(video, audio, output)
            with self.assertRaisesRegex(RuntimeError, "publication identity changed"):
                native_tools._run_mux_audio(common, args)
            self.assertEqual(output.read_bytes(), b"foreign replacement")

    def test_mux_staging_cleanup_failure_rolls_back_only_the_exact_published_inode(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            args, video, audio, output = self.arguments(Path(directory))
            common = self.Common(video, audio, output)
            original_unlink = Path.unlink

            def fail_staging_cleanup(path: Path, *call_args: object, **call_kwargs: object) -> None:
                if path.name == "output.mp4" and path.parent.name.startswith(".cevra-mux-audio-"):
                    raise OSError("injected mux staging cleanup failure")
                original_unlink(path, *call_args, **call_kwargs)

            with mock.patch.object(Path, "unlink", fail_staging_cleanup):
                with self.assertRaisesRegex(RuntimeError, "staging output cleanup failed"):
                    native_tools._run_mux_audio(common, args)
            self.assertFalse(output.exists())

    def test_mux_rejects_symlink_inputs_and_preexisting_outputs_before_execution(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            args, video, audio, output = self.arguments(root)
            linked = root / "linked.mp4"
            linked.symlink_to(video)
            common = self.Common(video, audio, output)
            with self.assertRaisesRegex(ValueError, "video input must be a non-symlink regular file"):
                native_tools._run_mux_audio(common, {**args, "video": str(linked)})
            output.write_bytes(b"preexisting")
            with self.assertRaises(FileExistsError):
                native_tools._run_mux_audio(common, args)
            self.assertEqual(output.read_bytes(), b"preexisting")
            self.assertEqual(common.commands, [])

    def test_published_identity_guard_preserves_foreign_file_and_symlink_replacements(self) -> None:
        if os.name != "posix":
            self.skipTest("POSIX dev/inode identity is not available")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "output.mp4"
            output.write_bytes(b"owned")
            evidence = native_tools._publication_evidence(output)
            self.assertIsNotNone(evidence)

            replacement = root / "replacement"
            replacement.write_bytes(b"foreign")
            os.replace(replacement, output)
            with self.assertRaisesRegex(RuntimeError, "identity changed"):
                native_tools._unlink_published(output, evidence, "mux output")
            self.assertEqual(output.read_bytes(), b"foreign")

            output.unlink()
            target = root / "target"
            target.write_bytes(b"target")
            output.symlink_to(target)
            with self.assertRaisesRegex(RuntimeError, "identity changed"):
                native_tools._unlink_published(output, evidence, "mux output")
            self.assertTrue(output.is_symlink())
            self.assertEqual(target.read_bytes(), b"target")

    def test_published_identity_guard_removes_only_the_exact_published_inode(self) -> None:
        if os.name != "posix":
            self.skipTest("POSIX dev/inode identity is not available")
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "output.mp4"
            output.write_bytes(b"owned")
            evidence = native_tools._publication_evidence(output)
            native_tools._unlink_published(output, evidence, "mux output")
            self.assertFalse(output.exists())

    def test_selected_stream_duration_uses_managed_ffprobe_and_never_container_duration(self) -> None:
        class ProbeCommon:
            @staticmethod
            def require_tool(name: str) -> str:
                self.assertEqual(name, "ffprobe")
                return "/managed/ffprobe"

        payload = {"streams": [{"index": 0, "time_base": "1/48000", "duration_ts": 192000, "duration": "9.0"}]}
        with mock.patch.object(job_control, "run", return_value=mock.Mock(stdout=json.dumps(payload))):
            self.assertEqual(native_tools._selected_stream_duration_ms(ProbeCommon(), Path("input"), "a:0", "audio"), 4000)
        with mock.patch.object(job_control, "run", return_value=mock.Mock(stdout=json.dumps({"format": {"duration": "4.0"}, "streams": [{}]}))):
            with self.assertRaisesRegex(RuntimeError, "duration is unavailable"):
                native_tools._selected_stream_duration_ms(ProbeCommon(), Path("input"), "v:0", "video")


class RuntimeBuildTests(unittest.TestCase):
    def test_sdr_encoder_bt709_tagging_honors_compatibility_flag(self) -> None:
        tagged = runtime_args.sdr_encoder_args("h264_videotoolbox")
        untagged = runtime_args.sdr_encoder_args("h264_videotoolbox", tag_bt709=False)
        self.assertIn("h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1", tagged)
        self.assertNotIn("-bsf:v", untagged)

    def test_schema_validator_enforces_maximum_max_items_and_finite_values(self) -> None:
        schema = {"type": "object", "additionalProperties": False, "properties": {
            "value": {"type": "number", "maximum": 10},
            "items": {"type": "array", "maxItems": 2, "items": {"type": "integer"}},
        }, "required": ["value", "items"]}
        schema_validator.validate({"value": 10, "items": [1, 2]}, schema)
        for invalid in ({"value": 11, "items": []}, {"value": 1, "items": [1, 2, 3]}, {"value": float("inf"), "items": []}):
            with self.assertRaises(schema_validator.SchemaValidationError):
                schema_validator.validate(invalid, schema)

    def test_schema_validator_enforces_platform_conditional_and_not(self) -> None:
        schema = {
            "type": "object",
            "properties": {"platform": {"type": "string"}, "zlib": {"type": "object"}},
            "required": ["platform"],
            "allOf": [{
                "if": {"properties": {"platform": {"const": "win32"}}, "required": ["platform"]},
                "then": {"required": ["zlib"]},
                "else": {"not": {"required": ["zlib"]}},
            }],
        }
        schema_validator.validate({"platform": "win32", "zlib": {}}, schema)
        schema_validator.validate({"platform": "darwin"}, schema)
        for invalid in ({"platform": "win32"}, {"platform": "darwin", "zlib": {}}):
            with self.assertRaises(schema_validator.SchemaValidationError):
                schema_validator.validate(invalid, schema)

    def test_windows_runtime_requires_static_zlib_license_notice_only_on_windows(self) -> None:
        self.assertEqual(required_notice_paths("win32")["zlib-license"], "licenses/zlib/LICENSE")
        self.assertNotIn("zlib-license", required_notice_paths("darwin"))

    def test_python_pruning_removes_pip_tkinter_and_tcl(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative in ("lib/python3.12/ensurepip", "lib/python3.12/tkinter", "lib/tcl9", "lib/thread2.8", "bin/pip3"):
                path = root / relative
                if path.suffix or path.name.startswith("pip"):
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text("unused", encoding="utf-8")
                else:
                    path.mkdir(parents=True, exist_ok=True)
            removed = prepare_python_runtime._prune(root)
            prepare_python_runtime._assert_pruned(root)
            self.assertIn("lib/python3.12/ensurepip", removed)
            self.assertIn("lib/python3.12/tkinter", removed)
            self.assertIn("lib/tcl9", removed)
            self.assertIn("lib/thread2.8", removed)
            self.assertIn("bin/pip3", removed)

    def test_python_pruning_preserves_windows_threading_module(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            threading = root / "Lib" / "threading.py"
            threading.parent.mkdir(parents=True)
            threading.write_text("# standard library fixture\n", encoding="utf-8")
            prepare_python_runtime._prune(root)
            self.assertTrue(threading.is_file())

    def test_ffmpeg_digest_failure_happens_before_gpg(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "source"
            def fake_download(_url: str, target: Path) -> None:
                target.write_bytes(b"tampered")
            with mock.patch.object(prepare_ffmpeg_source.shutil, "which", return_value="/usr/bin/gpg"), \
                 mock.patch.object(prepare_ffmpeg_source, "download", side_effect=fake_download), \
                 mock.patch.object(prepare_ffmpeg_source, "command") as command:
                with self.assertRaisesRegex(SystemExit, "SHA-256 mismatch"):
                    prepare_ffmpeg_source.prepare(destination)
                command.assert_not_called()

    def test_ffmpeg_signature_verifier_requires_gpgv(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "source"
            with mock.patch.object(
                prepare_ffmpeg_source.shutil,
                "which",
                side_effect=lambda executable: "/usr/bin/gpg" if executable == "gpg" else None,
            ), mock.patch.object(prepare_ffmpeg_source, "download") as download:
                with self.assertRaisesRegex(SystemExit, "gpgv is required"):
                    prepare_ffmpeg_source.prepare(destination)
                download.assert_not_called()
                self.assertFalse(destination.exists())

    def test_ffmpeg_gpg_path_uses_cygpath_on_windows(self) -> None:
        conversion = mock.Mock(returncode=0, stdout="/d/scratch/source.tar.xz\n", stderr="")
        with mock.patch.object(prepare_ffmpeg_source.shutil, "which", return_value="C:/Program Files/Git/usr/bin/cygpath.exe"), \
             mock.patch.object(prepare_ffmpeg_source.subprocess, "run", return_value=conversion) as run:
            converted = prepare_ffmpeg_source.gpg_path(Path("D:/scratch/source.tar.xz"), platform_name="nt")
        self.assertEqual(converted, "/d/scratch/source.tar.xz")
        run.assert_called_once_with(
            ["C:/Program Files/Git/usr/bin/cygpath.exe", "-u", "D:/scratch/source.tar.xz"],
            stdout=prepare_ffmpeg_source.subprocess.PIPE,
            stderr=prepare_ffmpeg_source.subprocess.PIPE,
            text=True,
        )

    def test_ffmpeg_gpg_path_preserves_posix_path(self) -> None:
        path = Path("/tmp/source.tar.xz")
        with mock.patch.object(prepare_ffmpeg_source.shutil, "which") as which:
            self.assertEqual(prepare_ffmpeg_source.gpg_path(path, platform_name="posix"), str(path))
        which.assert_not_called()

    def test_ffmpeg_archive_extraction_rejects_path_escape(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "source.tar.xz"
            payload = b"escape"
            member = tarfile.TarInfo("../outside")
            member.size = len(payload)
            with tarfile.open(archive, "w:xz") as package:
                package.addfile(member, io.BytesIO(payload))
            destination = root / "extract"
            destination.mkdir()
            with self.assertRaisesRegex(SystemExit, "escapes extraction root"):
                prepare_ffmpeg_source.extract_verified_archive(archive, destination)
            self.assertFalse((root / "outside").exists())

    def test_vendor_preparation_refuses_to_erase_existing_destination(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "vendor"
            destination.mkdir()
            marker = destination / "preserve"
            marker.write_text("keep", encoding="utf-8")
            with self.assertRaisesRegex(SystemExit, "refusing to replace"):
                prepare_vendor.prepare(destination)
            self.assertEqual(marker.read_text(encoding="utf-8"), "keep")

    def test_vendor_checkout_disables_line_ending_rewrites(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "vendor"
            calls: list[tuple[tuple[str, ...], Path | None]] = []

            def fake_run(*argv: str, cwd: Path | None = None) -> str:
                calls.append((argv, cwd))
                if argv[:2] == ("git", "clone"):
                    destination.mkdir()
                if argv == ("git", "rev-parse", "HEAD"):
                    return prepare_vendor.PIN["commit"]
                return ""

            with mock.patch.object(prepare_vendor, "run", side_effect=fake_run), \
                 mock.patch.object(prepare_vendor, "verify_prepared"), \
                 mock.patch.object(prepare_vendor.shutil, "rmtree"):
                prepare_vendor.prepare(destination)

            self.assertIn(
                (("git", "-c", "core.autocrlf=false", "checkout", "--detach", prepare_vendor.PIN["commit"]), destination),
                calls,
            )


if __name__ == "__main__":
    unittest.main()
