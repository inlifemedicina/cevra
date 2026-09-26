#!/usr/bin/env python3
"""Native, exact-runtime feasibility probe for the Windows h264_mf candidate.

This probe is deliberately outside the production encoder allow-list.  It
validates the pinned private runtime and exercises the exact FFmpeg binary
directly; a PASS is evidence for a later typed enablement slice, not enablement.
"""
from __future__ import annotations

import argparse
import array
import ctypes
import hashlib
import json
import math
import os
import platform
import re
import struct
import subprocess
import sys
import time
import wave
from pathlib import Path
from typing import Any

FORMAT = "cevra-windows-h264-mf-feasibility"
FORMAT_VERSION = 1
AAC_FRAME_SAMPLES = 1024
SAMPLE_RATE = 48_000
NEGATIVE_OFFSET_SECONDS = 0.250


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(argv: list[str], *, check: bool = True, timeout: float = 120.0) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout)
    if check and result.returncode != 0:
        detail = "\n".join((result.stderr or result.stdout).splitlines()[-30:])
        raise RuntimeError(f"command failed ({result.returncode}): {argv[0]}\n{detail}")
    return result


def _peak_working_set(process: subprocess.Popen[str]) -> int | None:
    if os.name != "nt" or not hasattr(process, "_handle"):
        return None

    class ProcessMemoryCounters(ctypes.Structure):
        _fields_ = [
            ("cb", ctypes.c_ulong),
            ("PageFaultCount", ctypes.c_ulong),
            ("PeakWorkingSetSize", ctypes.c_size_t),
            ("WorkingSetSize", ctypes.c_size_t),
            ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
            ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
            ("PagefileUsage", ctypes.c_size_t),
            ("PeakPagefileUsage", ctypes.c_size_t),
        ]

    counters = ProcessMemoryCounters()
    counters.cb = ctypes.sizeof(counters)
    get_memory = ctypes.windll.psapi.GetProcessMemoryInfo
    if not get_memory(int(process._handle), ctypes.byref(counters), counters.cb):
        return None
    return int(counters.PeakWorkingSetSize)


def run_measured(argv: list[str], *, timeout: float = 180.0) -> tuple[subprocess.CompletedProcess[str], float, int | None]:
    started = time.perf_counter()
    process = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    peak: int | None = None
    while process.poll() is None:
        observed = _peak_working_set(process)
        peak = max(peak or 0, observed or 0) or None
        if time.perf_counter() - started > timeout:
            process.kill()
            process.communicate()
            raise RuntimeError(f"command timed out after {timeout:.1f}s: {argv[0]}")
        time.sleep(0.02)
    stdout, stderr = process.communicate()
    observed = _peak_working_set(process)
    peak = max(peak or 0, observed or 0) or None
    return subprocess.CompletedProcess(argv, process.returncode, stdout, stderr), time.perf_counter() - started, peak


def write_click_track(path: Path, duration: float, events: list[float]) -> None:
    total = round(duration * SAMPLE_RATE)
    frames = bytearray()
    for index in range(total):
        when = index / SAMPLE_RATE
        active = any(abs(when - event) <= 0.010 for event in events)
        value = int(0.82 * 32767 * math.sin(2 * math.pi * 1000 * when)) if active else 0
        frames.extend(struct.pack("<hh", value, value))
    with wave.open(str(path), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(frames)


def video_filter(width: int, height: int, rate: str, duration: float, events: list[float]) -> str:
    windows = "+".join(f"between(t\\,{event - 0.040:.6f}\\,{event + 0.040:.6f})" for event in events)
    return (
        f"color=c=black:s={width}x{height}:r={rate}:d={duration:.9f},"
        f"drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='{windows}'"
    )


def json_output(argv: list[str], *, timeout: float = 120.0) -> dict[str, Any]:
    result = run(argv, timeout=timeout)
    value = json.loads(result.stdout)
    if not isinstance(value, dict):
        raise RuntimeError("expected JSON object")
    return value


def event_centers_from_levels(levels: list[float], times: list[float], threshold: float) -> list[float]:
    groups: list[list[float]] = []
    current: list[float] = []
    for level, when in zip(levels, times, strict=True):
        if level >= threshold:
            current.append(when)
        elif current:
            groups.append(current)
            current = []
    if current:
        groups.append(current)
    return [sum(group) / len(group) for group in groups if group]


def decoded_video_events(ffmpeg: Path, ffprobe: Path, output: Path) -> tuple[list[float], int, list[float]]:
    frames = json_output([
        str(ffprobe), "-v", "error", "-select_streams", "v:0", "-show_frames",
        "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", str(output),
    ]).get("frames") or []
    times = [float(item["best_effort_timestamp_time"]) for item in frames]
    raw = subprocess.run(
        [str(ffmpeg), "-v", "error", "-i", str(output), "-map", "0:v:0", "-vf", "scale=1:1,format=gray", "-f", "rawvideo", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120, check=True,
    ).stdout
    levels = [float(value) for value in raw]
    if len(levels) != len(times):
        raise RuntimeError(f"decoded frame/PTS count mismatch: {len(levels)} != {len(times)}")
    return event_centers_from_levels(levels, times, 128.0), len(times), times


def decoded_audio_events(ffmpeg: Path, output: Path) -> tuple[list[float], int]:
    raw = subprocess.run(
        [str(ffmpeg), "-v", "error", "-i", str(output), "-map", "0:a:0", "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "s16le", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120, check=True,
    ).stdout
    samples = array.array("h")
    samples.frombytes(raw)
    if sys.byteorder != "little":
        samples.byteswap()
    window = SAMPLE_RATE // 100
    levels: list[float] = []
    times: list[float] = []
    for offset in range(0, len(samples), window):
        part = samples[offset : offset + window]
        if not part:
            continue
        rms = math.sqrt(sum(float(value) * float(value) for value in part) / len(part)) / 32768.0
        levels.append(rms)
        times.append((offset + len(part) / 2) / SAMPLE_RATE)
    return event_centers_from_levels(levels, times, 0.10), len(samples)


def align_events(video: list[float], audio: list[float], tolerance: float) -> dict[str, Any]:
    if len(video) != len(audio) or not video:
        raise RuntimeError(f"event count mismatch: video={video}, audio={audio}")
    errors = [abs(left - right) for left, right in zip(video, audio, strict=True)]
    return {"videoSeconds": video, "audioSeconds": audio, "errorsMs": [value * 1000 for value in errors], "maxErrorMs": max(errors) * 1000, "passed": max(errors) <= tolerance}


def stream_map(probe: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for stream in probe.get("streams") or []:
        kind = stream.get("codec_type")
        if isinstance(kind, str) and kind not in result:
            result[kind] = stream
    return result


def psnr_average(ffmpeg: Path, output: Path, source_filter: str, frames: int) -> float:
    result = run([
        str(ffmpeg), "-hide_banner", "-i", str(output), "-f", "lavfi", "-i", source_filter,
        "-filter_complex", "[0:v]format=yuv420p[decoded];[1:v]format=yuv420p[reference];[decoded][reference]psnr",
        "-frames:v", str(frames), "-an", "-f", "null", os.devnull,
    ])
    match = re.search(r"average:([0-9.]+)", result.stderr)
    if match is None:
        raise RuntimeError("FFmpeg PSNR summary is missing")
    return float(match.group(1))


def execute_case(ffmpeg: Path, ffprobe: Path, scratch: Path, case: dict[str, Any]) -> dict[str, Any]:
    name = str(case["name"])
    rate = str(case["rate"])
    numerator, denominator = (int(value) for value in rate.split("/"))
    frames = int(case["frames"])
    duration = frames * denominator / numerator
    events = [duration * fraction for fraction in (0.10, 0.50, 0.90)]
    audio = scratch / f"{name}.wav"
    output = scratch / f"{name}.mp4"
    write_click_track(audio, duration, events)
    source_filter = video_filter(int(case["width"]), int(case["height"]), rate, duration, events)
    command = [
        str(ffmpeg), "-hide_banner", "-nostdin", "-y", "-v", "info",
        "-f", "lavfi", "-i", source_filter, "-i", str(audio),
        "-map", "0:v:0", "-map", "1:a:0", "-frames:v", str(frames),
        "-c:v", "h264_mf", "-pix_fmt", "nv12", "-b:v", "2M",
        "-c:a", "aac", "-ar", str(SAMPLE_RATE), "-ac", "2", "-movflags", "+faststart", str(output),
    ]
    completed, wall, peak_rss = run_measured(command)
    if completed.returncode != 0:
        detail = "\n".join(completed.stderr.splitlines()[-40:])
        raise RuntimeError(f"h264_mf encode failed for {name}\n{detail}")
    if not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError(f"h264_mf did not publish an output for {name}")
    probe = json_output([
        str(ffprobe), "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", str(output),
    ])
    streams = stream_map(probe)
    video = streams.get("video") or {}
    audio_stream = streams.get("audio") or {}
    if video.get("codec_name") != "h264" or audio_stream.get("codec_name") != "aac":
        raise RuntimeError(f"unexpected codecs for {name}: {video.get('codec_name')}/{audio_stream.get('codec_name')}")
    run([str(ffmpeg), "-v", "error", "-i", str(output), "-map", "0", "-f", "null", os.devnull])
    video_events, decoded_frames, pts = decoded_video_events(ffmpeg, ffprobe, output)
    audio_events, decoded_samples = decoded_audio_events(ffmpeg, output)
    frame_period = denominator / numerator
    tolerance = frame_period + (1 / SAMPLE_RATE) + (AAC_FRAME_SAMPLES / SAMPLE_RATE)
    timing = align_events(video_events, audio_events, tolerance)
    negative = align_events(video_events, [value + NEGATIVE_OFFSET_SECONDS for value in audio_events], tolerance)
    if not timing["passed"]:
        raise RuntimeError(f"A/V event oracle failed for {name}: {timing}")
    if negative["passed"]:
        raise RuntimeError(f"negative A/V timing control did not fail for {name}")
    if decoded_frames != frames:
        raise RuntimeError(f"decoded frame count mismatch for {name}: {decoded_frames} != {frames}")
    if any(right <= left for left, right in zip(pts, pts[1:])):
        raise RuntimeError(f"non-monotonic decoded video timestamps for {name}")
    stream_durations = {
        "video": float(video.get("duration") or probe.get("format", {}).get("duration") or 0),
        "audio": float(audio_stream.get("duration") or probe.get("format", {}).get("duration") or 0),
    }
    duration_tolerance = tolerance
    if abs(stream_durations["video"] - duration) > duration_tolerance or abs(stream_durations["audio"] - duration) > duration_tolerance:
        raise RuntimeError(f"stream duration mismatch for {name}: expected={duration}, actual={stream_durations}")
    return {
        "name": name,
        "dimensions": [int(case["width"]), int(case["height"])],
        "rate": rate,
        "expectedFrames": frames,
        "decodedFrames": decoded_frames,
        "decodedAudioSamples": decoded_samples,
        "expectedDurationSeconds": duration,
        "streamDurationsSeconds": stream_durations,
        "durationToleranceMs": duration_tolerance * 1000,
        "timingToleranceMs": tolerance * 1000,
        "timing": timing,
        "negativeControl": {**negative, "knownOffsetMs": NEGATIVE_OFFSET_SECONDS * 1000, "expectedPassed": False},
        "psnrAverageDb": psnr_average(ffmpeg, output, source_filter, frames),
        "wallSeconds": wall,
        "peakRssBytes": peak_rss,
        "outputBytes": output.stat().st_size,
        "outputSha256": sha256(output),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-root", type=Path, required=True)
    parser.add_argument("--scratch", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    runtime = args.runtime_root.resolve()
    scratch = args.scratch.resolve()
    scratch.mkdir(parents=True, exist_ok=True)
    output_path = args.output.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg = runtime / "bin" / "ffmpeg.exe"
    ffprobe = runtime / "bin" / "ffprobe.exe"
    python = runtime / "python" / "python.exe"
    worker = runtime / "worker" / "cevra_media_worker.py"
    report: dict[str, Any] = {
        "format": FORMAT,
        "formatVersion": FORMAT_VERSION,
        "status": "FAILED",
        "testedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "environment": {"system": platform.system(), "release": platform.release(), "version": platform.version(), "machine": platform.machine()},
        "cases": [],
        "limitations": [
            "Direct exact-binary evidence is not Application/Desktop enablement.",
            "A hosted runner is not representative consumer hardware.",
            "PSNR and synthetic timing do not replace human visual acceptance.",
            "Media Foundation hardware versus software selection is reported only when FFmpeg exposes reliable evidence.",
        ],
    }
    exit_code = 1
    try:
        if platform.system() != "Windows" or platform.machine().lower() not in {"amd64", "x86_64"}:
            raise RuntimeError("native Windows x64 host required")
        for path in (ffmpeg, ffprobe, python, worker, runtime / "manifest.json"):
            if not path.is_file():
                raise RuntimeError(f"runtime component missing: {path}")
        manifest = json.loads((runtime / "manifest.json").read_text(encoding="utf-8"))
        buildconf_process = run([str(ffmpeg), "-buildconf"])
        buildconf = buildconf_process.stdout + buildconf_process.stderr
        required_flags = {"--disable-autodetect", "--disable-gpl", "--disable-nonfree", "--disable-network", "--enable-mediafoundation"}
        missing_flags = sorted(flag for flag in required_flags if flag not in buildconf)
        if missing_flags:
            raise RuntimeError(f"exact FFmpeg build is missing required flags: {missing_flags}")
        encoders_text = run([str(ffmpeg), "-hide_banner", "-encoders"]).stdout
        enumerated = re.search(r"^\s*V\S*\s+h264_mf\s", encoders_text, re.MULTILINE) is not None
        options = run([str(ffmpeg), "-hide_banner", "-h", "encoder=h264_mf"], check=False)
        worker_info = json_output([str(python), "-I", "-B", str(worker), "--info"])
        worker_health_process = run([str(python), "-I", "-B", str(worker), "--health"], check=False)
        worker_health = json.loads(worker_health_process.stdout)
        effective_h264 = [item for item in worker_health.get("effectiveDeliveries") or [] if item.get("videoCodec") == "h264"]
        if effective_h264:
            raise RuntimeError("production worker unexpectedly enabled a Windows H.264 delivery")
        report["runtime"] = {
            "manifestRuntimeVersion": manifest.get("runtimeVersion"),
            "manifestPlatform": manifest.get("platform"),
            "manifestArch": manifest.get("arch"),
            "pythonVersion": manifest.get("python", {}).get("version"),
            "ffmpegVersion": manifest.get("ffmpeg", {}).get("version"),
            "ffmpegSha256": sha256(ffmpeg),
            "ffprobeSha256": sha256(ffprobe),
            "configureFlagsSha256": manifest.get("ffmpeg", {}).get("configureFlagsSha256"),
            "toolchain": manifest.get("ffmpeg", {}).get("toolchain"),
            "sourceArchiveSha256": manifest.get("ffmpeg", {}).get("sourceArchiveSha256"),
            "signingFingerprint": manifest.get("ffmpeg", {}).get("signingFingerprint"),
            "workerInfoPlatform": worker_info.get("runtime", {}).get("platform"),
            "workerHealthOk": worker_health.get("ok"),
            "productionH264Deliveries": effective_h264,
        }
        report["encoder"] = {
            "name": "h264_mf",
            "enumerated": enumerated,
            "optionsExitCode": options.returncode,
            "optionsTail": options.stdout.splitlines()[-80:],
        }
        if not enumerated:
            report["status"] = "ENCODER_NOT_ENUMERATED"
            exit_code = 2
            return exit_code
        if options.returncode != 0:
            raise RuntimeError("h264_mf encoder options could not be queried")
        cases = [
            {"name": "horizontal-short-30", "width": 320, "height": 180, "rate": "30/1", "frames": 60},
            {"name": "vertical-drift-30000-1001", "width": 180, "height": 320, "rate": "30000/1001", "frames": 360},
        ]
        for case in cases:
            report["cases"].append(execute_case(ffmpeg, ffprobe, scratch, case))
        invalid_output = scratch / "invalid-fallback.mp4"
        invalid = run([
            str(ffmpeg), "-hide_banner", "-nostdin", "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=64x64:rate=1:d=1",
            "-c:v", "cevra_nonexistent_h264_encoder", str(invalid_output),
        ], check=False)
        report["unavailableControl"] = {
            "exitCode": invalid.returncode,
            "publishedOutput": invalid_output.is_file() and invalid_output.stat().st_size > 0,
            "silentFallback": invalid.returncode == 0,
        }
        if invalid.returncode == 0 or (invalid_output.is_file() and invalid_output.stat().st_size > 0):
            raise RuntimeError("unavailable encoder control silently produced an output")
        report["status"] = "PASS"
        exit_code = 0
    except Exception as exc:
        report["failure"] = {"type": type(exc).__name__, "message": str(exc)}
        if "h264_mf encode failed" in str(exc):
            report["status"] = "NATIVE_ENCODE_FAILED"
            exit_code = 2
        else:
            exit_code = 1
    finally:
        output_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps({"status": report["status"], "evidence": str(output_path)}, indent=2))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
