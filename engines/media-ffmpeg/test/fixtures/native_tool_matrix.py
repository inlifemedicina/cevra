from __future__ import annotations

import json
import os
import sys
import tempfile
import struct
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict

WORKER = Path(__file__).resolve().parents[2] / "worker"
sys.path.insert(0, str(WORKER))

import cevra_native_tools as tools
import cevra_media_worker as worker


def write_sparse_float_wav(path: Path, samples: int = 192_000, channels: int = 2) -> None:
    data_bytes = samples * channels * 4
    with path.open("wb") as handle:
        handle.write(b"RIFF" + struct.pack("<I", data_bytes + 36) + b"WAVE")
        handle.write(b"fmt " + struct.pack("<IHHIIHH", 16, 3, channels, 48_000, 48_000 * channels * 4, channels * 4, 32))
        handle.write(b"data" + struct.pack("<I", data_bytes))
        handle.seek(data_bytes - 1, os.SEEK_CUR)
        handle.write(b"\0")


class FakeCommon:
    def __init__(self, metadata: Dict[str, Any], encoders: list[str] | None = None) -> None:
        self.metadata = metadata
        self.command = []
        self.graph = ""
        self.encoders = encoders if encoders is not None else ["aac", "opus", "pcm_s16le"]
        self.write_output = False

    def probe(self, path: str, role: str = "input") -> Dict[str, Any]:
        if role == "output":
            return {"file": path, "duration": 4.0, "size_bytes": 1_536_114, "video": None, "audio": {"codec": "pcm_f32le", "sample_rate": 48000, "channels": 2, "channel_layout": "stereo"}}
        return self.metadata[path]

    def verify_output(self, path: str) -> Dict[str, Any]:
        if Path(path).suffix.lower() == ".wav":
            return self.probe(path, "output")
        return {"file": path, "duration": 4.0, "size_bytes": 10, "video": {"codec": "h264"}, "audio": {"codec": "aac"}}

    def ffmpeg_base(self, overwrite: bool = True) -> list[str]:
        return ["ffmpeg", "-y" if overwrite else "-n"]

    def require_tool(self, name: str) -> str:
        return name

    def run(self, command: list[str], **_: Any) -> Any:
        if "-encoders" in command:
            lines = [f" {'V' if name == 'libvpx-vp9' else 'A'}..... {name}" for name in self.encoders]
            return SimpleNamespace(stdout="\n".join(lines), stderr="", returncode=0)
        self.command = command
        if "-/filter_complex" in command:
            graph_path = Path(command[command.index("-/filter_complex") + 1])
            self.graph = graph_path.read_text(encoding="utf-8")
            write_sparse_float_wav(Path(command[-1]))
        elif self.write_output:
            Path(command[-1]).write_bytes(b"fixture mux")
        return SimpleNamespace(stdout="", stderr="", returncode=0)


class FakeRuntime:
    @staticmethod
    def sdr_encoder_args(*_: Any) -> list[str]:
        return ["-c:v", "h264_test"]

    @staticmethod
    def hevc_encoder_args(*_: Any) -> list[str]:
        return ["-c:v", "h265_test"]

    @staticmethod
    def av1_encoder_args(*_: Any) -> list[str]:
        return ["-c:v", "av1_test"]


def main() -> int:
    request = json.loads(sys.argv[1])
    os.environ["CEVRA_VIDEO_ENCODER_H264"] = "h264_test"
    os.environ["CEVRA_VIDEO_ENCODER_HEVC"] = "h265_test"
    os.environ["CEVRA_VIDEO_ENCODER_AV1"] = "av1_test"
    try:
        if request["operation"] == "matrix":
            matrix = {
                container: {
                    "videoCodecs": sorted(rule["video"]),
                    "audioCodecs": sorted(rule["audio"]),
                    "defaultVideoCodec": rule["default_video"],
                    "defaultAudioCodec": rule["default_audio"],
                    "audioOnly": rule["audio_only"],
                }
                for container, rule in tools.DELIVERY_MATRIX.items()
            }
            print(json.dumps({"matrix": matrix}))
            return 0
        if request["operation"] == "limits":
            print(json.dumps({
                "width": worker.MAX_MEDIA_WIDTH,
                "height": worker.MAX_MEDIA_HEIGHT,
                "fps": worker.MAX_MEDIA_FPS,
                "durationMs": worker.MAX_MEDIA_DURATION_SECONDS * 1000,
                "inputs": worker.MAX_MEDIA_INPUTS,
                "uriLength": worker.MAX_MEDIA_PATH_LENGTH,
                "audioSequenceItems": worker.MAX_AUDIO_SEQUENCE_ITEMS,
                "audioSequenceGainDb": [worker.MIN_AUDIO_SEQUENCE_GAIN_DB, worker.MAX_AUDIO_SEQUENCE_GAIN_DB],
                "audioSequenceVersion": tools.AUDIO_SEQUENCE_VERSION,
                "audioSequenceSampleRate": tools.AUDIO_SEQUENCE_SAMPLE_RATE,
                "audioSequenceSampleFormat": tools.AUDIO_SEQUENCE_SAMPLE_FORMAT,
                "audioSequenceGraphBytes": tools.MAX_AUDIO_SEQUENCE_GRAPH_BYTES,
                "audioSequenceInputArgumentBytes": tools.MAX_AUDIO_SEQUENCE_INPUT_ARGUMENT_BYTES,
                "audioSequenceWavDataBytes": tools.MAX_AUDIO_SEQUENCE_WAV_DATA_BYTES,
            }))
            return 0
        if request["operation"] == "numbers":
            failures = []
            for value in (float("nan"), float("inf"), float("-inf")):
                try:
                    tools._positive_number({"value": value}, "value")
                except ValueError as exc:
                    failures.append(str(exc))
            try:
                tools._positive_integer({"value": 1.5}, "value")
            except ValueError as exc:
                failures.append(str(exc))
            boundary_rejections = [worker._contains_non_finite_number(value) for value in (float("nan"), float("inf"), {"nested": [float("-inf")]})]
            print(json.dumps({"failures": failures, "boundaryRejections": boundary_rejections}))
            return 0

        common = FakeCommon(request["metadata"], request.get("encoders"))
        sys.modules["_common"] = common
        if request["operation"] == "transcode":
            tools._run_transcode(common, FakeRuntime(), request["arguments"])
        elif request["operation"] == "mux":
            with tempfile.TemporaryDirectory(prefix="cevra-mux-fixture-") as directory:
                root = Path(directory)
                arguments = request["arguments"]
                video = root / "video.mp4"
                audio = root / "new.wav"
                output = root / "out.mp4"
                video.write_bytes(b"video fixture")
                audio.write_bytes(b"audio fixture")
                common.metadata = {
                    str(video.resolve()): request["metadata"][str(arguments["video"])],
                    str(audio.resolve()): request["metadata"][str(arguments["audio"])],
                }
                common.write_output = True
                tools._run_mux_audio(common, {
                    **arguments, "video": str(video), "audio": str(audio), "output": str(output),
                })
                print(json.dumps({"command": common.command, "graph": common.graph}))
                return 0
        elif request["operation"] == "extract-frame":
            tools._run_extract_frame(common, request["arguments"])
        elif request["operation"] == "audio-sequence":
            with tempfile.TemporaryDirectory(prefix="cevra-audio-sequence-fixture-") as directory:
                root = Path(directory)
                arguments = request["arguments"]
                metadata: Dict[str, Any] = {}
                sources = []
                for index, source in enumerate(arguments["sources"]):
                    source_path = root / f"source-{index}.wav"
                    source_path.write_bytes(b"fixture")
                    sources.append({"id": source["id"], "uri": str(source_path)})
                    metadata[str(source_path.resolve())] = {
                        "duration": source.get("duration", 10.0),
                        "audio": {"codec": "pcm_f32le", "sample_rate": source.get("sample_rate", 48000), "channels": source.get("channels", 1), "channel_layout": source.get("channel_layout", "mono"), "start_time": "0", "duration": str(source.get("duration", 10.0))},
                    }
                common.metadata = metadata
                output = root / "output.wav"
                result = tools._run_audio_sequence(common, {**arguments, "sources": sources, "output": str(output)})
                print(json.dumps({"command": common.command, "graph": common.graph, "result": result["structuredContent"]}))
                return 0
        else:
            raise ValueError("unknown fixture operation")
        print(json.dumps({"command": common.command, "graph": common.graph}))
    except Exception as exc:
        print(json.dumps({"error": f"{type(exc).__name__}: {exc}"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
