from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict

WORKER = Path(__file__).resolve().parents[2] / "worker"
sys.path.insert(0, str(WORKER))

import cevra_native_tools as tools
import cevra_media_worker as worker


class FakeCommon:
    def __init__(self, metadata: Dict[str, Any]) -> None:
        self.metadata = metadata
        self.command = []

    def probe(self, path: str, role: str = "input") -> Dict[str, Any]:
        if role == "output":
            return {"file": path, "duration": 1.0, "video": {"codec": "h264"}, "audio": {"codec": "aac"}}
        return self.metadata[path]

    def ffmpeg_base(self) -> list[str]:
        return ["ffmpeg"]

    def require_tool(self, name: str) -> str:
        return name

    def run(self, command: list[str], **_: Any) -> Any:
        if "-encoders" in command:
            return SimpleNamespace(stdout=" V..... libvpx-vp9\n", stderr="", returncode=0)
        self.command = command
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

        common = FakeCommon(request["metadata"])
        sys.modules["_common"] = common
        if request["operation"] == "transcode":
            tools._run_transcode(common, FakeRuntime(), request["arguments"])
        elif request["operation"] == "mux":
            tools._run_mux_audio(common, request["arguments"])
        elif request["operation"] == "extract-frame":
            tools._run_extract_frame(common, request["arguments"])
        else:
            raise ValueError("unknown fixture operation")
        print(json.dumps({"command": common.command}))
    except Exception as exc:
        print(json.dumps({"error": f"{type(exc).__name__}: {exc}"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
