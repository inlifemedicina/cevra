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
import tempfile
import time
import wave
from fractions import Fraction
from pathlib import Path
from typing import Any

FORMAT = "cevra-windows-h264-mf-feasibility"
FORMAT_VERSION = 1
AAC_FRAME_SAMPLES = 1024
SAMPLE_RATE = 48_000
NEGATIVE_OFFSET_SECONDS = 0.250
EVENT_FRACTIONS = (0.15, 0.50, 0.85)
EVENT_COUNT = 3
MAX_CAPTURE_BYTES = 1024 * 1024


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
    with tempfile.TemporaryFile(mode="w+b") as stdout_file, tempfile.TemporaryFile(mode="w+b") as stderr_file:
        process = subprocess.Popen(argv, stdout=stdout_file, stderr=stderr_file)
        peak: int | None = None
        while process.poll() is None:
            observed = _peak_working_set(process)
            peak = max(peak or 0, observed or 0) or None
            if time.perf_counter() - started > timeout:
                process.kill()
                process.wait()
                raise RuntimeError(f"command timed out after {timeout:.1f}s: {argv[0]}")
            time.sleep(0.02)
        observed = _peak_working_set(process)
        peak = max(peak or 0, observed or 0) or None

        def bounded_text(handle) -> str:
            handle.flush()
            size = handle.tell()
            handle.seek(max(0, size - MAX_CAPTURE_BYTES))
            return handle.read(MAX_CAPTURE_BYTES).decode("utf-8", errors="replace")

        stdout = bounded_text(stdout_file)
        stderr = bounded_text(stderr_file)
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
    if not times or any(not math.isfinite(value) for value in times) or any(right <= left for left, right in zip(times, times[1:])):
        raise RuntimeError("decoded video frame timestamps are missing, non-finite, or non-monotonic")
    raw = subprocess.run(
        [str(ffmpeg), "-v", "error", "-i", str(output), "-map", "0:v:0", "-vf", "scale=1:1,format=gray", "-fps_mode", "passthrough", "-f", "rawvideo", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120, check=True,
    ).stdout
    levels = [float(value) for value in raw]
    if len(levels) != len(times):
        raise RuntimeError(f"decoded frame/PTS count mismatch: {len(levels)} != {len(times)}")
    return event_centers_from_levels(levels, times, 128.0), len(times), times


def audio_frame_timeline(ffprobe: Path, output: Path) -> dict[str, Any]:
    frames = json_output([
        str(ffprobe), "-v", "error", "-select_streams", "a:0", "-show_frames",
        "-show_entries", "frame=best_effort_timestamp_time,nb_samples", "-of", "json", str(output),
    ]).get("frames") or []
    if not frames:
        raise RuntimeError("decoded audio frame timeline is missing")
    parsed: list[tuple[float, int]] = []
    for frame in frames:
        try:
            pts = float(frame["best_effort_timestamp_time"])
            samples = int(frame["nb_samples"])
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError("decoded audio frame timeline is incomplete") from exc
        if not math.isfinite(pts) or samples <= 0:
            raise RuntimeError("decoded audio frame timeline contains invalid values")
        parsed.append((pts, samples))
    if any(right[0] <= left[0] for left, right in zip(parsed, parsed[1:])):
        raise RuntimeError("decoded audio frame timestamps are non-monotonic")
    continuity_tolerance = (1 / SAMPLE_RATE) + 0.000001
    continuity_errors = [abs(right[0] - (left[0] + left[1] / SAMPLE_RATE)) for left, right in zip(parsed, parsed[1:])]
    if continuity_errors and max(continuity_errors) > continuity_tolerance:
        raise RuntimeError(f"decoded audio frame timeline is discontinuous: {max(continuity_errors)}")
    return {
        "firstPtsSeconds": parsed[0][0],
        "lastEndPtsSeconds": parsed[-1][0] + parsed[-1][1] / SAMPLE_RATE,
        "frameCount": len(parsed),
        "frameSamples": sum(samples for _, samples in parsed),
        "maxContinuityErrorSeconds": max(continuity_errors, default=0.0),
        "continuityToleranceSeconds": continuity_tolerance,
    }


def decoded_audio_events(ffmpeg: Path, ffprobe: Path, output: Path) -> tuple[list[float], int, dict[str, Any]]:
    timeline = audio_frame_timeline(ffprobe, output)
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
        times.append(timeline["firstPtsSeconds"] + (offset + len(part) / 2) / SAMPLE_RATE)
    return event_centers_from_levels(levels, times, 0.10), len(samples), timeline


def align_events(video: list[float], audio: list[float], planned: list[float], tolerance: float) -> dict[str, Any]:
    counts_valid = len(video) == EVENT_COUNT and len(audio) == EVENT_COUNT and len(planned) == EVENT_COUNT
    if not counts_valid:
        return {
            "plannedSeconds": planned, "videoSeconds": video, "audioSeconds": audio,
            "eventCounts": {"planned": len(planned), "video": len(video), "audio": len(audio)},
            "passed": False,
        }
    av_errors = [abs(left - right) for left, right in zip(video, audio, strict=True)]
    video_truth = [abs(observed - truth) for observed, truth in zip(video, planned, strict=True)]
    audio_truth = [abs(observed - truth) for observed, truth in zip(audio, planned, strict=True)]
    maximum = max([*av_errors, *video_truth, *audio_truth])
    return {
        "plannedSeconds": planned,
        "videoSeconds": video,
        "audioSeconds": audio,
        "eventCounts": {"planned": len(planned), "video": len(video), "audio": len(audio)},
        "avErrorsMs": [value * 1000 for value in av_errors],
        "videoTruthErrorsMs": [value * 1000 for value in video_truth],
        "audioTruthErrorsMs": [value * 1000 for value in audio_truth],
        "maxErrorMs": maximum * 1000,
        "passed": maximum <= tolerance,
    }


def stream_map(probe: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for stream in probe.get("streams") or []:
        kind = stream.get("codec_type")
        if isinstance(kind, str) and kind not in result:
            result[kind] = stream
    return result


def psnr_average(ffmpeg: Path, output: Path, source_filter: str, frames: int) -> float | str:
    result = run([
        str(ffmpeg), "-hide_banner", "-i", str(output), "-f", "lavfi", "-i", source_filter,
        "-filter_complex", "[0:v]format=yuv420p[decoded];[1:v]format=yuv420p[reference];[decoded][reference]psnr",
        "-frames:v", str(frames), "-an", "-f", "null", os.devnull,
    ])
    match = re.search(r"average:(inf|[0-9.]+)", result.stderr)
    if match is None:
        raise RuntimeError("FFmpeg PSNR summary is missing")
    return "inf" if match.group(1) == "inf" else float(match.group(1))


def rational(value: Any, label: str) -> Fraction:
    try:
        parsed = Fraction(str(value))
    except (ValueError, ZeroDivisionError) as exc:
        raise RuntimeError(f"invalid {label}: {value}") from exc
    if parsed <= 0:
        raise RuntimeError(f"invalid {label}: {value}")
    return parsed


def encode_fixture(
    ffmpeg: Path,
    output: Path,
    audio: Path,
    source_filter: str,
    frames: int,
    *,
    measured: bool,
) -> tuple[float | None, int | None]:
    command = [
        str(ffmpeg), "-hide_banner", "-nostdin", "-y", "-nostats", "-v", "error",
        "-f", "lavfi", "-i", source_filter, "-i", str(audio),
        "-map", "0:v:0", "-map", "1:a:0", "-frames:v", str(frames),
        "-c:v", "h264_mf", "-pix_fmt", "nv12", "-b:v", "2M",
        "-c:a", "aac", "-ar", str(SAMPLE_RATE), "-ac", "2", "-movflags", "+faststart", str(output),
    ]
    if measured:
        completed, wall, peak_rss = run_measured(command)
    else:
        completed = run(command, check=False, timeout=180)
        wall, peak_rss = None, None
    if completed.returncode != 0:
        detail = "\n".join(completed.stderr.splitlines()[-40:])
        raise RuntimeError(f"h264_mf encode failed for {output.stem}\n{detail}")
    if not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError(f"h264_mf did not publish an output for {output.stem}")
    return wall, peak_rss


def analyze_output(
    ffmpeg: Path,
    ffprobe: Path,
    output: Path,
    planned: list[float],
    tolerance: float,
) -> dict[str, Any]:
    probe = json_output([
        str(ffprobe), "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", str(output),
    ])
    all_streams = probe.get("streams") or []
    video_streams = [stream for stream in all_streams if stream.get("codec_type") == "video"]
    audio_streams = [stream for stream in all_streams if stream.get("codec_type") == "audio"]
    if len(all_streams) != 2 or len(video_streams) != 1 or len(audio_streams) != 1:
        raise RuntimeError(f"unexpected stream shape: total={len(all_streams)} video={len(video_streams)} audio={len(audio_streams)}")
    video = video_streams[0]
    audio = audio_streams[0]
    if video.get("duration") is None or audio.get("duration") is None:
        raise RuntimeError("per-stream duration evidence is required")
    if video.get("codec_name") != "h264" or audio.get("codec_name") != "aac":
        raise RuntimeError(f"unexpected codecs: {video.get('codec_name')}/{audio.get('codec_name')}")
    if int(audio.get("sample_rate") or 0) != SAMPLE_RATE:
        raise RuntimeError(f"unexpected audio sample rate: {audio.get('sample_rate')}")
    run([str(ffmpeg), "-v", "error", "-i", str(output), "-map", "0", "-f", "null", os.devnull])
    video_events, decoded_frames, video_pts = decoded_video_events(ffmpeg, ffprobe, output)
    audio_events, decoded_samples, audio_timeline = decoded_audio_events(ffmpeg, ffprobe, output)
    video_start = float(video.get("start_time"))
    audio_start = float(audio.get("start_time"))
    # Container start_time may reflect AAC priming/edit-list semantics while
    # decoded frame PTS identifies the actual sample timeline.  Compare and
    # retain both, allowing at most one AAC frame plus decimal/sample error.
    start_tolerance = ((AAC_FRAME_SAMPLES + 1) / SAMPLE_RATE) + 0.000001
    if abs(video_start - video_pts[0]) > start_tolerance:
        raise RuntimeError(f"video stream start_time disagrees with first decoded PTS: {video_start}/{video_pts[0]}")
    if abs(audio_start - audio_timeline["firstPtsSeconds"]) > start_tolerance:
        raise RuntimeError(f"audio stream start_time disagrees with first decoded PTS: {audio_start}/{audio_timeline['firstPtsSeconds']}")
    return {
        "probe": probe,
        "video": video,
        "audio": audio,
        "decodedFrames": decoded_frames,
        "decodedAudioSamples": decoded_samples,
        "videoPts": video_pts,
        "audioTimeline": audio_timeline,
        "streamStartSeconds": {"video": video_start, "audio": audio_start},
        "firstDecodedFramePtsSeconds": {"video": video_pts[0], "audio": audio_timeline["firstPtsSeconds"]},
        "streamStartToFirstPtsErrorMs": {
            "video": abs(video_start - video_pts[0]) * 1000,
            "audio": abs(audio_start - audio_timeline["firstPtsSeconds"]) * 1000,
        },
        "timing": align_events(video_events, audio_events, planned, tolerance),
    }


def make_container_offset_negative(ffmpeg: Path, positive: Path, output: Path) -> None:
    result = run([
        str(ffmpeg), "-hide_banner", "-nostdin", "-y", "-nostats", "-v", "error",
        "-i", str(positive), "-itsoffset", f"{NEGATIVE_OFFSET_SECONDS:.3f}", "-i", str(positive),
        "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", "-copyts", "-start_at_zero", str(output),
    ], check=False)
    if result.returncode != 0 or not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError(f"container-offset negative fixture failed: {' '.join(result.stderr.splitlines()[-20:])}")


def execute_case(ffmpeg: Path, ffprobe: Path, scratch: Path, case: dict[str, Any]) -> dict[str, Any]:
    name = str(case["name"])
    rate = str(case["rate"])
    frame_rate = rational(rate, "fixture rate")
    frames = int(case["frames"])
    duration = float(Fraction(frames, 1) / frame_rate)
    planned = [duration * fraction for fraction in EVENT_FRACTIONS]
    tolerance = float((1 / frame_rate) + Fraction(1, SAMPLE_RATE) + Fraction(AAC_FRAME_SAMPLES, SAMPLE_RATE))
    width, height = int(case["width"]), int(case["height"])
    source_filter = video_filter(width, height, rate, duration, planned)

    audio = scratch / f"{name}.wav"
    output = scratch / f"{name}.mp4"
    write_click_track(audio, duration, planned)
    wall, peak_rss = encode_fixture(ffmpeg, output, audio, source_filter, frames, measured=True)
    positive = analyze_output(ffmpeg, ffprobe, output, planned, tolerance)
    if not positive["timing"]["passed"]:
        raise RuntimeError(f"A/V event oracle failed for {name}: {positive['timing']}")
    video = positive["video"]
    audio_stream = positive["audio"]
    if int(video.get("width") or 0) != width or int(video.get("height") or 0) != height:
        raise RuntimeError(f"output dimensions mismatch for {name}")
    if rational(video.get("avg_frame_rate"), "output avg_frame_rate") != frame_rate:
        raise RuntimeError(f"output frame rate mismatch for {name}: {video.get('avg_frame_rate')} != {rate}")
    if positive["decodedFrames"] != frames:
        raise RuntimeError(f"decoded frame count mismatch for {name}: {positive['decodedFrames']} != {frames}")
    expected_samples = round(duration * SAMPLE_RATE)
    if positive["decodedAudioSamples"] != expected_samples:
        raise RuntimeError(f"decoded audio sample count mismatch for {name}: {positive['decodedAudioSamples']} != {expected_samples}")
    stream_durations = {"video": float(video["duration"]), "audio": float(audio_stream["duration"])}
    if any(abs(value - duration) > tolerance for value in stream_durations.values()):
        raise RuntimeError(f"stream duration mismatch for {name}: expected={duration}, actual={stream_durations}")

    negative_a_audio = scratch / f"{name}-negative-sample-offset.wav"
    negative_a_output = scratch / f"{name}-negative-sample-offset.mp4"
    write_click_track(negative_a_audio, duration, [value + NEGATIVE_OFFSET_SECONDS for value in planned])
    encode_fixture(ffmpeg, negative_a_output, negative_a_audio, source_filter, frames, measured=False)
    negative_a = analyze_output(ffmpeg, ffprobe, negative_a_output, planned, tolerance)
    if negative_a["timing"]["passed"]:
        raise RuntimeError(f"real sample-offset negative control was accepted for {name}")

    negative_b_output = scratch / f"{name}-negative-container-offset.mp4"
    make_container_offset_negative(ffmpeg, output, negative_b_output)
    negative_b = analyze_output(ffmpeg, ffprobe, negative_b_output, planned, tolerance)
    observed_offset = negative_b["streamStartSeconds"]["audio"] - negative_b["streamStartSeconds"]["video"]
    if abs(observed_offset - NEGATIVE_OFFSET_SECONDS) > tolerance:
        raise RuntimeError(f"container-offset control did not retain its real timestamp offset for {name}: {observed_offset}")
    if negative_b["timing"]["passed"]:
        raise RuntimeError(f"real container-offset negative control was accepted for {name}")

    return {
        "name": name,
        "dimensions": [width, height],
        "rate": rate,
        "observedRate": video.get("avg_frame_rate"),
        "expectedFrames": frames,
        "decodedFrames": positive["decodedFrames"],
        "expectedAudioSamples": expected_samples,
        "decodedAudioSamples": positive["decodedAudioSamples"],
        "expectedDurationSeconds": duration,
        "streamDurationsSeconds": stream_durations,
        "containerDurationSeconds": float(positive["probe"].get("format", {}).get("duration") or 0),
        "durationToleranceMs": tolerance * 1000,
        "timingToleranceMs": tolerance * 1000,
        "streamStartSeconds": positive["streamStartSeconds"],
        "firstDecodedFramePtsSeconds": positive["firstDecodedFramePtsSeconds"],
        "streamStartToFirstPtsErrorMs": positive["streamStartToFirstPtsErrorMs"],
        "audioFrameTimeline": positive["audioTimeline"],
        "timing": positive["timing"],
        "negativeSampleOffset": {
            "knownOffsetMs": NEGATIVE_OFFSET_SECONDS * 1000,
            "expectedPassed": False,
            "detector": negative_a["timing"],
            "outputBytes": negative_a_output.stat().st_size,
            "outputSha256": sha256(negative_a_output),
        },
        "negativeContainerOffset": {
            "knownOffsetMs": NEGATIVE_OFFSET_SECONDS * 1000,
            "observedStreamOffsetMs": observed_offset * 1000,
            "streamStartSeconds": negative_b["streamStartSeconds"],
            "firstDecodedFramePtsSeconds": negative_b["firstDecodedFramePtsSeconds"],
            "expectedPassed": False,
            "detector": negative_b["timing"],
            "outputBytes": negative_b_output.stat().st_size,
            "outputSha256": sha256(negative_b_output),
        },
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
        required_flags = {"--disable-autodetect", "--disable-gpl", "--disable-nonfree", "--disable-network", "--enable-mediafoundation", "--enable-zlib", "--pkg-config=false"}
        missing_flags = sorted(flag for flag in required_flags if flag not in buildconf)
        if missing_flags:
            raise RuntimeError(f"exact FFmpeg build is missing required flags: {missing_flags}")
        encoders_text = run([str(ffmpeg), "-hide_banner", "-encoders"]).stdout
        enumerated = re.search(r"^\s*V\S*\s+h264_mf\s", encoders_text, re.MULTILINE) is not None
        options = run([str(ffmpeg), "-hide_banner", "-h", "encoder=h264_mf"], check=False)
        worker_info = json_output([str(python), "-I", "-B", str(worker), "--info"])
        worker_health_process = run([str(python), "-I", "-B", str(worker), "--health"], check=False)
        if worker_health_process.returncode != 0:
            raise RuntimeError(f"production worker health failed ({worker_health_process.returncode})")
        try:
            worker_health = json.loads(worker_health_process.stdout)
        except json.JSONDecodeError as exc:
            raise RuntimeError("production worker health returned invalid JSON") from exc
        if not isinstance(worker_health, dict) or worker_health.get("ok") is not True:
            raise RuntimeError("production worker health did not report ok=true")
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
            "zlibSelection": manifest.get("ffmpeg", {}).get("zlib", {}).get("selection"),
            "buildAdjustments": manifest.get("ffmpeg", {}).get("buildAdjustments"),
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
