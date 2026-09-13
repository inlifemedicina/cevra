from __future__ import annotations

import os
import io
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ENGINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE / "worker"))
sys.path.insert(0, str(ENGINE / "runtime"))

import cevra_job_control as job_control
import cevra_media_worker as worker
import prepare_python_runtime
import prepare_ffmpeg_source
import prepare_vendor
import schema_validator
import _cevra_runtime as runtime_args


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
        with self.assertRaisesRegex(ValueError, "too many items"):
            worker._validate_tool_arguments("join", {"inputs": ["i"] * (worker.MAX_MEDIA_INPUTS + 1), "output": "o.mp4"})

    def test_empty_encoder_profile_exposes_audio_and_conditional_copy_deliveries(self) -> None:
        deliveries = worker.effective_deliveries({}, ["aac", "opus", "pcm_s16le"])
        self.assertTrue(deliveries)
        self.assertFalse(any(item.get("videoCodec") in {"h264", "h265", "av1"} for item in deliveries))
        self.assertTrue(any(item.get("videoCodec") == "copy" and item.get("audioCodec") == "aac" for item in deliveries))
        self.assertTrue(any(item.get("audioOnly") and item.get("audioCodec") == "opus" for item in deliveries))
        tools: dict[str, dict[str, object]] = {}
        worker._custom_health(tools, {}, True, deliveries)
        self.assertEqual(tools["cevra-mux-audio"]["usable"], "yes")
        empty_tools: dict[str, dict[str, object]] = {}
        worker._custom_health(empty_tools, {}, True, [])
        self.assertEqual(empty_tools["cevra-transcode"]["usable"], "no")

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

    def test_python_pruning_removes_pip_tkinter_and_tcl(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative in ("lib/python3.12/ensurepip", "lib/python3.12/tkinter", "lib/tcl9", "bin/pip3"):
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
            self.assertIn("bin/pip3", removed)

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


if __name__ == "__main__":
    unittest.main()
