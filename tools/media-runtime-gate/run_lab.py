#!/usr/bin/env python3
"""Bounded synthetic-media characterization for the CEVRA Media Runtime gate."""

from __future__ import annotations

import argparse
import errno
import hashlib
import json
import math
import os
import platform
import re
import shutil
import signal
import struct
import subprocess
import sys
import time
import wave
from pathlib import Path
from typing import Any


DARWIN_TIME_PATTERNS = {
    "realSeconds": re.compile(r"^real\s+([0-9.]+)$", re.MULTILINE),
    "userSeconds": re.compile(r"^user\s+([0-9.]+)$", re.MULTILINE),
    "systemSeconds": re.compile(r"^sys\s+([0-9.]+)$", re.MULTILINE),
    "peakRssBytes": re.compile(r"^\s*(\d+)\s+maximum resident set size$", re.MULTILINE),
}
GNU_TIME_PATTERNS = {
    "userSeconds": re.compile(r"^\s*User time \(seconds\):\s*([0-9.]+)$", re.MULTILINE),
    "systemSeconds": re.compile(r"^\s*System time \(seconds\):\s*([0-9.]+)$", re.MULTILINE),
    "peakRssKiB": re.compile(r"^\s*Maximum resident set size \(kbytes\):\s*(\d+)$", re.MULTILINE),
}


def aggregate_classifications(values: dict[str, str]) -> dict[str, Any]:
    """Summarize leaf results without allowing unavailable checks to mask FAIL."""
    groups: dict[str, list[str]] = {"passed": [], "warnings": [], "failed": [], "notRun": []}
    for name, raw in values.items():
        value = raw.strip().upper()
        if value.startswith("FAIL"):
            groups["failed"].append(name)
        elif value.startswith("WARN"):
            groups["warnings"].append(name)
        elif value.startswith("NOT RUN"):
            groups["notRun"].append(name)
        elif value.startswith("PASS"):
            groups["passed"].append(name)
        else:
            groups["failed"].append(name)
    if groups["failed"]:
        classification = "FAIL"
    elif groups["warnings"] or groups["notRun"]:
        classification = "WARN"
    else:
        classification = "PASS"
    return {"classification": classification, **groups}


def _process_options() -> dict[str, Any]:
    if os.name == "nt":
        return {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
    return {"start_new_session": True}


def _terminate_owned_tree(proc: subprocess.Popen[Any]) -> None:
    if proc.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)


def _cancel_owned_tree(proc: subprocess.Popen[Any]) -> None:
    if proc.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(proc.pid), "/T"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    else:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            return
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        _terminate_owned_tree(proc)


def _communicate(argv: list[str], *, timeout: int, text: bool = True) -> tuple[int, Any, Any]:
    proc = subprocess.Popen(
        argv,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=text,
        **_process_options(),
    )
    try:
        stdout, stderr = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        _terminate_owned_tree(proc)
        raise
    return proc.returncode, stdout, stderr


def _measurement_command(argv: list[str]) -> tuple[list[str], str]:
    time_binary = Path("/usr/bin/time")
    if not time_binary.is_file():
        return argv, "unavailable"
    if platform.system() == "Darwin":
        return [str(time_binary), "-lp", *argv], "darwin-time"
    if platform.system() == "Linux":
        return [str(time_binary), "-v", *argv], "gnu-time"
    return argv, "unavailable"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def measured_run(argv: list[str], *, timeout: int = 120, expected: int = 0) -> dict[str, Any]:
    started = time.monotonic()
    command, measurement = _measurement_command(argv)
    return_code, _stdout, stderr = _communicate(command, timeout=timeout)
    metrics: dict[str, float | int | str] = {
        "wallSecondsObserved": round(time.monotonic() - started, 6),
        "measurementSource": measurement,
    }
    patterns = DARWIN_TIME_PATTERNS if measurement == "darwin-time" else GNU_TIME_PATTERNS if measurement == "gnu-time" else {}
    for name, pattern in patterns.items():
        match = pattern.search(stderr)
        if match:
            value: float | int = int(match.group(1)) if name in {"peakRssBytes", "peakRssKiB"} else float(match.group(1))
            if name == "peakRssKiB":
                metrics["peakRssBytes"] = int(value) * 1024
            else:
                metrics[name] = value
    result = {
        "argv": argv,
        "returnCode": return_code,
        "metrics": metrics,
        "stderrTail": "\n".join(stderr.splitlines()[-12:]),
    }
    if return_code != expected:
        raise RuntimeError(json.dumps(result, indent=2))
    return result


def capture(argv: list[str], *, timeout: int = 30) -> str:
    return_code, stdout, stderr = _communicate(argv, timeout=timeout)
    if return_code != 0:
        raise RuntimeError(f"command failed ({return_code}): {argv!r}\n{stderr}")
    return stdout


def probe(ffprobe: str, path: Path) -> dict[str, Any]:
    return json.loads(capture([ffprobe, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]))


def first_video(data: dict[str, Any]) -> dict[str, Any]:
    return next(stream for stream in data["streams"] if stream.get("codec_type") == "video")


def first_audio(data: dict[str, Any]) -> dict[str, Any]:
    return next(stream for stream in data["streams"] if stream.get("codec_type") == "audio")


def write_tone_click_wav(path: Path, *, sample_rate: int, duration: float, tone_hz: int, events: list[float]) -> None:
    sample_count = round(sample_rate * duration)
    click_samples = max(1, round(sample_rate * 0.002))
    event_samples = {round(event * sample_rate) for event in events}
    frames = bytearray()
    for index in range(sample_count):
        value = 0.08 * math.sin(2.0 * math.pi * tone_hz * index / sample_rate)
        if any(start <= index < start + click_samples for start in event_samples):
            value = 0.92
        frames.extend(struct.pack("<h", round(max(-1.0, min(1.0, value)) * 32767)))
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        output.writeframes(frames)


def decode_audio_samples(ffmpeg: str, path: Path, *, sample_rate: int = 48000) -> tuple[int, ...]:
    return_code, raw, stderr = _communicate(
        [ffmpeg, "-v", "error", "-i", str(path), "-map", "0:a:0", "-ac", "1", "-ar", str(sample_rate), "-f", "s16le", "-"],
        timeout=30,
        text=False,
    )
    if return_code != 0:
        raise RuntimeError(f"audio decode failed: {stderr.decode(errors='replace')}")
    return struct.unpack(f"<{len(raw) // 2}h", raw)


def detect_clicks(samples: tuple[int, ...], sample_rate: int, *, threshold: int = 20_000) -> list[float]:
    detected: list[float] = []
    index = 0
    minimum_gap = round(sample_rate * 0.01)
    while index < len(samples):
        if abs(samples[index]) < threshold:
            index += 1
            continue
        start = index
        end = min(len(samples), start + round(sample_rate * 0.006))
        peak = max(range(start, end), key=lambda candidate: abs(samples[candidate]))
        detected.append(peak / sample_rate)
        index = start + minimum_gap
    return detected


def detect_video_flashes(ffmpeg: str, path: Path, *, width: int = 320, height: int = 180, frame_rate: int = 30) -> list[float]:
    return_code, raw, stderr = _communicate(
        [ffmpeg, "-v", "error", "-i", str(path), "-map", "0:v:0", "-pix_fmt", "gray", "-f", "rawvideo", "-"],
        timeout=30,
        text=False,
    )
    if return_code != 0:
        raise RuntimeError(f"video decode failed: {stderr.decode(errors='replace')}")
    frame_bytes = width * height
    if len(raw) % frame_bytes:
        raise RuntimeError("decoded video byte count is not frame aligned")
    flashes: list[float] = []
    was_flash = False
    for index in range(len(raw) // frame_bytes):
        frame = raw[index * frame_bytes:(index + 1) * frame_bytes]
        is_flash = sum(frame) / frame_bytes >= 220
        if is_flash and not was_flash:
            flashes.append(index / frame_rate)
        was_flash = is_flash
    return flashes


def tone_powers(samples: tuple[int, ...], sample_rate: int, start: float, duration: float, candidates: tuple[int, ...]) -> dict[int, float]:
    begin = max(0, round(start * sample_rate))
    end = min(len(samples), round((start + duration) * sample_rate))
    window = samples[begin:end]
    powers: dict[int, float] = {}
    for frequency in candidates:
        omega = 2.0 * math.pi * frequency / sample_rate
        real = sum(sample * math.cos(omega * index) for index, sample in enumerate(window))
        imag = sum(sample * math.sin(omega * index) for index, sample in enumerate(window))
        powers[frequency] = real * real + imag * imag
    return powers


def dominant_frequency(ffmpeg: str, path: Path, start: float, duration: float, candidates: tuple[int, ...]) -> dict[str, float | int]:
    samples = decode_audio_samples(ffmpeg, path)
    powers = tone_powers(samples, 48000, start, duration, candidates)
    winner = max(powers, key=powers.get)
    return {"dominantHz": winner, **{f"power{frequency}Hz": round(powers[frequency], 3) for frequency in candidates}}


def evaluate_sync_events(visual: list[float], audio: list[float], *, mapping: str) -> dict[str, Any]:
    sample_rate = 48_000
    frame_rate = 30
    sample_tolerance = 1 / sample_rate
    frame_tolerance = 1 / frame_rate
    tolerance = frame_tolerance + sample_tolerance
    expected_visual = [0.4, 0.9, 1.4, 2.2, 2.7, 3.2, 3.7]
    expected_audio = [0.4, 0.9, 1.4, 1.75, 2.2, 2.7, 3.2, 3.7]
    visible_audio = audio[4:]
    visible_visual = visual[3:]
    av_errors = [round(abs(a - v), 6) for a, v in zip(visible_audio, visible_visual)]
    count_ok = len(visual) == len(expected_visual) and len(audio) == len(expected_audio)
    visual_schedule_ok = count_ok and all(abs(actual - expected) <= tolerance for actual, expected in zip(visual, expected_visual))
    audio_schedule_ok = count_ok and all(abs(actual - expected) <= tolerance for actual, expected in zip(audio, expected_audio))
    sync_ok = len(av_errors) == 4 and max(av_errors, default=999.0) <= tolerance
    return {
        "classification": "PASS" if count_ok and visual_schedule_ok and audio_schedule_ok and sync_ok else "FAIL",
        "mapping": mapping,
        "visualEventSeconds": visual,
        "audioEventSeconds": audio,
        "expectedVisualEventSeconds": expected_visual,
        "expectedAudioEventSeconds": expected_audio,
        "visibleBAvErrorSeconds": av_errors,
        "maxVisibleBAvErrorSeconds": max(av_errors, default=None),
        "toleranceSeconds": round(tolerance, 9),
        "toleranceBasis": "one 30 fps frame interval plus one 48 kHz sample interval",
        "frameCount": round(4 * frame_rate),
        "countOk": count_ok,
        "visualScheduleOk": visual_schedule_ok,
        "audioScheduleOk": audio_schedule_ok,
        "syncOk": sync_ok,
    }


def synchronization_oracle(ffmpeg: str, path: Path, *, mapping: str) -> dict[str, Any]:
    visual = detect_video_flashes(ffmpeg, path, frame_rate=30)
    samples = decode_audio_samples(ffmpeg, path, sample_rate=48_000)
    audio = detect_clicks(samples, 48_000)
    return {**evaluate_sync_events(visual, audio, mapping=mapping), "sampleCount": len(samples)}


def packet_hashes(ffprobe: str, path: Path) -> list[str]:
    output = capture([
        ffprobe, "-v", "error", "-select_streams", "v:0", "-show_packets",
        "-show_entries", "packet=data_hash", "-show_data_hash", "sha256", "-of", "csv=p=0", str(path),
    ])
    return [line.strip() for line in output.splitlines() if line.strip()]


def encoder_and_filter_inventory(ffmpeg: str) -> dict[str, Any]:
    version = capture([ffmpeg, "-version"]).splitlines()[0]
    buildconf = capture([ffmpeg, "-buildconf"])
    encoders = capture([ffmpeg, "-hide_banner", "-encoders"])
    filters = capture([ffmpeg, "-hide_banner", "-filters"])
    return {
        "version": version,
        "binarySha256": sha256(Path(ffmpeg)),
        "buildConfiguration": [part for part in buildconf.split() if part.startswith("--")],
        "encoders": {name: bool(re.search(rf"\b{re.escape(name)}\b", encoders)) for name in ("h264_mf", "h264_videotoolbox", "libx264", "aac")},
        "filters": {name: bool(re.search(rf"\b{re.escape(name)}\b", filters)) for name in ("zscale", "tonemap", "loudnorm", "acrossfade", "amix")},
    }


def generate_sources(ffmpeg: str, root: Path) -> tuple[Path, Path]:
    source_a = root / "source-a.mkv"
    source_b = root / "source-b.mkv"
    audio_a = root / "source-a.wav"
    audio_b = root / "source-b.wav"
    write_tone_click_wav(audio_a, sample_rate=48_000, duration=2.0, tone_hz=440, events=[0.4, 0.9, 1.4])
    write_tone_click_wav(audio_b, sample_rate=44_100, duration=2.5, tone_hz=880, events=[0.25, 0.7, 1.2, 1.7, 2.2])
    measured_run([
        ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=320x180:r=30:d=2",
        "-i", str(audio_a), "-vf", "drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='eq(n,12)+eq(n,27)+eq(n,42)'",
        "-c:v", "ffv1", "-c:a", "pcm_s16le", "-shortest", str(source_a),
    ])
    measured_run([
        ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=30:d=2.5",
        "-i", str(audio_b), "-vf", "drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='eq(n,21)+eq(n,36)+eq(n,51)+eq(n,66)'",
        "-c:v", "ffv1", "-c:a", "pcm_s16le", "-shortest", str(source_b),
    ])
    return source_a, source_b


def run_audio_jcut(ffmpeg: str, ffprobe: str, root: Path) -> dict[str, Any]:
    source_a, source_b = generate_sources(ffmpeg, root)
    candidate = root / "jcut-corrected.mkv"
    negative = root / "jcut-old-mapping-negative-control.mkv"
    audio_only = root / "jcut-audio-only.wav"
    common_audio = (
        "[0:a]atrim=0:1.5,asetpts=PTS-STARTPTS,aformat=sample_rates=48000[a0];"
        "[1:a]atrim=0:2.5,asetpts=PTS-STARTPTS,aformat=sample_rates=48000,adelay=1500:all=1[a1];"
        "[a0][a1]amix=inputs=2:duration=longest:normalize=0[a]"
    )
    candidate_run = measured_run([
        ffmpeg, "-y", "-v", "error", "-i", str(source_a), "-i", str(source_b),
        "-filter_complex",
        "[0:v]trim=0:2,setpts=PTS-STARTPTS[v0];[1:v]trim=0.5:2.5,setpts=PTS-STARTPTS[v1];"
        "[v0][v1]concat=n=2:v=1:a=0[v];" + common_audio,
        "-map", "[v]", "-map", "[a]", "-c:v", "ffv1", "-c:a", "pcm_s16le", str(candidate),
    ])
    negative_run = measured_run([
        ffmpeg, "-y", "-v", "error", "-i", str(source_a), "-i", str(source_b),
        "-filter_complex",
        "[0:v]trim=0:2,setpts=PTS-STARTPTS[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS[v1];"
        "[v0][v1]concat=n=2:v=1:a=0[v];" + common_audio,
        "-map", "[v]", "-map", "[a]", "-c:v", "ffv1", "-c:a", "pcm_s16le", str(negative),
    ])
    audio_only_run = measured_run([
        ffmpeg, "-y", "-v", "error", "-i", str(source_a), "-i", str(source_b),
        "-filter_complex",
        "[0:a]atrim=0:1.5,asetpts=PTS-STARTPTS,aformat=sample_rates=48000,volume=0.8,afade=t=out:st=1.45:d=0.05[a0];"
        "[1:a]atrim=0:2.5,asetpts=PTS-STARTPTS,aformat=sample_rates=48000,volume=0.7,afade=t=in:st=0:d=0.05,adelay=1500:all=1[a1];"
        "[a0][a1]amix=inputs=2:duration=longest:normalize=0[a]",
        "-map", "[a]", "-vn", "-c:a", "pcm_f32le", str(audio_only),
    ])
    candidate_probe = probe(ffprobe, candidate)
    audio_only_probe = probe(ffprobe, audio_only)
    positive_oracle = synchronization_oracle(ffmpeg, candidate, mapping="B picture source 0.5..2.5 at timeline 2..4")
    negative_oracle = synchronization_oracle(ffmpeg, negative, mapping="SUPERSEDED old mapping: B picture source 0..2 at timeline 2..4")
    output_samples = decode_audio_samples(ffmpeg, candidate)
    before = tone_powers(output_samples, 48_000, 1.1, 0.15, (440, 880))
    after = tone_powers(output_samples, 48_000, 1.9, 0.15, (440, 880))
    no_overlap = before[880] <= before[440] * 0.01 and after[440] <= after[880] * 0.01
    duration = float(candidate_probe["format"]["duration"])
    audio_duration = float(audio_only_probe["format"]["duration"])
    audio_only_clicks = detect_clicks(decode_audio_samples(ffmpeg, audio_only), 48_000)
    audio_only_timing = len(audio_only_clicks) == 8 and all(
        abs(actual - expected) <= (1 / 48_000 + 0.002)
        for actual, expected in zip(audio_only_clicks, [0.4, 0.9, 1.4, 1.75, 2.2, 2.7, 3.2, 3.7])
    )
    passed = positive_oracle["classification"] == "PASS" and negative_oracle["classification"] == "FAIL" and no_overlap and abs(duration - 4.0) <= 1 / 30 and abs(audio_duration - 4.0) <= 1 / 48_000 and audio_only_timing
    return {
        "classification": "PASS" if passed else "FAIL",
        "evidenceLevel": "standalone laboratory A/V synchronization oracle plus separate audio-only prototype; not CEVRA end-to-end execution",
        "existingTypedOperations": "NOT REPRESENTABLE: current operations cannot independently place/mix audio against video cuts",
        "mapping": {
            "aPicture": {"sourceSeconds": [0.0, 2.0], "timelineSeconds": [0.0, 2.0]},
            "aAudio": {"sourceSeconds": [0.0, 1.5], "timelineSeconds": [0.0, 1.5]},
            "bAudio": {"sourceSeconds": [0.0, 2.5], "timelineSeconds": [1.5, 4.0]},
            "bPicture": {"sourceSeconds": [0.5, 2.5], "timelineSeconds": [2.0, 4.0]},
        },
        "correctedAvPrototype": {"run": candidate_run, "bytes": candidate.stat().st_size, "durationSeconds": duration, "oracle": positive_oracle},
        "mandatoryNegativeControl": {"run": negative_run, "classification": "PASS" if negative_oracle["classification"] == "FAIL" else "FAIL", "expectedOracleResult": "FAIL", "oracle": negative_oracle},
        "noUnintendedOverlap": {
            "classification": "PASS" if no_overlap else "FAIL",
            "beforeAuthorizedBPlacementPowerRatio": before[880] / max(before[440], 1.0),
            "afterAuthorizedAEndPowerRatio": after[440] / max(after[880], 1.0),
            "authorizedWindows": {"aOnly": [1.1, 1.25], "bOnly": [1.9, 2.05]},
        },
        "audioOnlyPrototype": {
            "classification": "PASS" if audio_only_timing and abs(audio_duration - 4.0) <= 1 / 48_000 else "FAIL",
            "run": audio_only_run,
            "bytes": audio_only.stat().st_size,
            "durationSeconds": audio_duration,
            "sampleRate": int(first_audio(audio_only_probe)["sample_rate"]),
            "sampleFormat": first_audio(audio_only_probe).get("sample_fmt"),
            "channels": first_audio(audio_only_probe).get("channels"),
            "eventSeconds": audio_only_clicks,
            "videoEncodeGenerations": 0,
            "behavior": "explicit source trims/placements, per-item gain/fade, 44.1/48 kHz resampling, PCM output",
        },
        "fixtures": {str(path.name): {"sha256": sha256(path), "bytes": path.stat().st_size} for path in (source_a, source_b)},
        "supersededEvidence": "80d260b dominant-frequency-only result did not prove source-time A/V synchronization",
        "limitations": ["fixed laboratory graphs, not a proposed user/agent-facing filtergraph API", "synthetic events validate timing but not speech-quality or subjective listening acceptance"],
    }


def run_many_cut_scaling(ffmpeg: str, ffprobe: str, root: Path) -> dict[str, Any]:
    sources: list[Path] = []
    for index, (color, frequency) in enumerate((("yellow", 330), ("green", 550))):
        path = root / f"many-cut-source-{index}.mov"
        measured_run([
            ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", f"color=c={color}:s=320x180:r=30:d=3",
            "-f", "lavfi", "-i", f"sine=frequency={frequency}:sample_rate=48000:duration=3",
            "-c:v", "mpeg4", "-q:v", "3", "-c:a", "pcm_s16le", "-shortest", str(path),
        ])
        sources.append(path)

    cut_count = 24
    cut_seconds = 0.1
    intermediates = root / "many-cut-intermediates"
    intermediates.mkdir()
    legacy_runs: list[dict[str, Any]] = []
    cut_paths: list[Path] = []
    for index in range(cut_count):
        source = sources[index % len(sources)]
        start = (index // len(sources)) * cut_seconds
        path = intermediates / f"cut-{index:02d}.mov"
        legacy_runs.append(measured_run([
            ffmpeg, "-y", "-v", "error", "-ss", f"{start:.3f}", "-i", str(source), "-t", f"{cut_seconds:.3f}",
            "-c:v", "mpeg4", "-q:v", "3", "-c:a", "pcm_s16le", str(path),
        ]))
        cut_paths.append(path)
    concat_list = intermediates / "concat.txt"
    concat_list.write_text("".join(f"file '{path}'\n" for path in cut_paths), encoding="utf-8")
    legacy_output = root / "many-cut-composed.mov"
    legacy_concat = measured_run([ffmpeg, "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(concat_list), "-c", "copy", str(legacy_output)])

    filters: list[str] = []
    concat_inputs: list[str] = []
    for index in range(cut_count):
        source_index = index % len(sources)
        start = (index // len(sources)) * cut_seconds
        end = start + cut_seconds
        filters.append(f"[{source_index}:v]trim={start:.3f}:{end:.3f},setpts=PTS-STARTPTS[v{index}]")
        filters.append(f"[{source_index}:a]atrim={start:.3f}:{end:.3f},asetpts=PTS-STARTPTS[a{index}]")
        concat_inputs.extend((f"[v{index}]", f"[a{index}]"))
    filters.append("".join(concat_inputs) + f"concat=n={cut_count}:v=1:a=1[v][a]")
    single_output = root / "many-cut-single-pass.mov"
    single_run = measured_run([
        ffmpeg, "-y", "-v", "error", "-i", str(sources[0]), "-i", str(sources[1]),
        "-filter_complex", ";".join(filters), "-map", "[v]", "-map", "[a]",
        "-c:v", "mpeg4", "-q:v", "3", "-c:a", "pcm_s16le", str(single_output),
    ])

    legacy_duration = float(probe(ffprobe, legacy_output)["format"]["duration"])
    single_duration = float(probe(ffprobe, single_output)["format"]["duration"])
    expected_duration = cut_count * cut_seconds
    intermediate_bytes = sum(path.stat().st_size for path in cut_paths)
    legacy_wall = sum(float(run["metrics"]["wallSecondsObserved"]) for run in [*legacy_runs, legacy_concat])
    legacy_cpu = sum(float(run["metrics"].get("userSeconds", 0)) + float(run["metrics"].get("systemSeconds", 0)) for run in [*legacy_runs, legacy_concat])
    passed = abs(legacy_duration - expected_duration) <= 0.05 and abs(single_duration - expected_duration) <= 0.05
    return {
        "classification": "PASS" if passed else "FAIL",
        "evidenceLevel": "standalone laboratory A/V process-topology demonstration; not CEVRA end-to-end execution",
        "fixture": {"cutCount": cut_count, "cutDurationSeconds": cut_seconds, "expectedDurationSeconds": expected_duration},
        "operationComposition": {
            "processCount": cut_count + 1,
            "encodeGenerationsPerOutputSegment": 1,
            "aggregateWallSecondsObserved": round(legacy_wall, 6),
            "aggregateCpuSeconds": round(legacy_cpu, 6),
            "peakRssBytesMaxProcess": max(int(run["metrics"].get("peakRssBytes", 0)) for run in [*legacy_runs, legacy_concat]),
            "intermediateBytes": intermediate_bytes,
            "outputBytes": legacy_output.stat().st_size,
            "durationSeconds": legacy_duration,
        },
        "singlePassPrototype": {
            "processCount": 1,
            "encodeGenerations": 1,
            "run": single_run,
            "intermediateBytes": 0,
            "outputBytes": single_output.stat().st_size,
            "durationSeconds": single_duration,
        },
        "limitations": ["short synthetic workload; not a product-scale or quality benchmark", "operation-composition topology models per-cut encoding plus copy concat and is not application end-to-end time"],
    }


def run_audio_only_scaling(ffmpeg: str, ffprobe: str, root: Path) -> dict[str, Any]:
    sources = [root / "audio-scale-a.wav", root / "audio-scale-b.wav"]
    write_tone_click_wav(sources[0], sample_rate=48_000, duration=2.0, tone_hz=330, events=[])
    write_tone_click_wav(sources[1], sample_rate=44_100, duration=2.0, tone_hz=550, events=[])
    item_count = 64
    item_seconds = 0.04
    per_source = item_count // 2
    filters = [
        "[0:a]asplit=" + str(per_source) + "".join(f"[s0_{index}]" for index in range(per_source)),
        "[1:a]asplit=" + str(per_source) + "".join(f"[s1_{index}]" for index in range(per_source)),
    ]
    outputs: list[str] = []
    source_uses = [0, 0]
    for index in range(item_count):
        source = index % 2
        use = source_uses[source]
        source_uses[source] += 1
        start = use * item_seconds
        end = start + item_seconds
        filters.append(
            f"[s{source}_{use}]atrim={start:.3f}:{end:.3f},asetpts=PTS-STARTPTS,"
            f"aformat=sample_rates=48000,volume={0.9 if source == 0 else 0.8}[o{index}]"
        )
        outputs.append(f"[o{index}]")
    filters.append("".join(outputs) + f"concat=n={item_count}:v=0:a=1[a]")
    output = root / "audio-only-64-items.wav"
    run = measured_run([
        ffmpeg, "-y", "-v", "error", "-i", str(sources[0]), "-i", str(sources[1]),
        "-filter_complex", ";".join(filters), "-map", "[a]", "-vn", "-c:a", "pcm_f32le", str(output),
    ])
    data = probe(ffprobe, output)
    expected = item_count * item_seconds
    duration = float(data["format"]["duration"])
    audio = first_audio(data)
    passed = abs(duration - expected) <= 1 / 48_000 and int(audio["sample_rate"]) == 48_000 and audio.get("channels") == 1
    return {
        "classification": "PASS" if passed else "FAIL",
        "evidenceLevel": "standalone bounded audio-only laboratory graph; not CEVRA end-to-end execution",
        "itemCount": item_count,
        "sourceCount": 2,
        "itemDurationSeconds": item_seconds,
        "expectedDurationSeconds": expected,
        "observedDurationSeconds": duration,
        "processCount": 1,
        "videoEncodeGenerations": 0,
        "audioPcmGenerations": 1,
        "intermediateBytes": 0,
        "outputBytes": output.stat().st_size,
        "sampleRate": int(audio["sample_rate"]),
        "sampleFormat": audio.get("sample_fmt"),
        "channels": audio.get("channels"),
        "run": run,
        "supportedInference": "64 sequential items completed under this short fixture; this is a proposed initial item cap, not unlimited track scalability",
    }


def run_mux_copy(ffmpeg: str, ffprobe: str, root: Path) -> dict[str, Any]:
    video = root / "mux-video.mp4"
    audio = root / "mux-audio.m4a"
    output = root / "mux-output.mp4"
    measured_run([ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30000/1001:d=2", "-an", "-c:v", "mpeg4", "-q:v", "3", str(video)])
    measured_run([ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=2", "-vn", "-c:a", "aac", "-b:a", "128k", str(audio)])
    mux_run = measured_run([ffmpeg, "-y", "-v", "error", "-i", str(video), "-i", str(audio), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", str(output)])
    source_packets = packet_hashes(ffprobe, video)
    output_packets = packet_hashes(ffprobe, output)
    decoded = measured_run([ffmpeg, "-v", "error", "-i", str(output), "-f", "null", "-"])
    data = probe(ffprobe, output)
    passed = source_packets == output_packets and first_video(data)["codec_name"] == "mpeg4" and first_audio(data)["codec_name"] == "aac"
    return {
        "classification": "PASS" if passed else "FAIL",
        "evidenceLevel": {
            "A_standaloneLaboratoryCommand": "PASS",
            "B_exactPinnedCevraBinary": "NOT RUN",
            "C_realCevraAdapterWorkerOperation": "NOT RUN",
            "D_applicationPromotionLifecycle": "NOT RUN",
        },
        "deliveryCompatibility": "fixture MPEG-4 Part 2 video is outside CEVRA's closed H.264/H.265/AV1 delivery matrix and proves only FFmpeg stream-copy mechanics",
        "muxRun": mux_run,
        "decodeRun": decoded,
        "sourceVideoPacketSequenceSha256": hashlib.sha256("\n".join(source_packets).encode()).hexdigest(),
        "outputVideoPacketSequenceSha256": hashlib.sha256("\n".join(output_packets).encode()).hexdigest(),
        "videoPacketCount": {"source": len(source_packets), "output": len(output_packets)},
        "outputBytes": output.stat().st_size,
        "probe": data,
        "encodeGenerations": {"videoAtMuxStage": 0, "audioAtMuxStage": 1, "audioCumulativeFixtureToOutput": 2},
    }


def video_frame_timestamps(ffprobe: str, path: Path) -> list[float]:
    data = json.loads(capture([
        ffprobe, "-v", "error", "-select_streams", "v:0", "-show_frames",
        "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", str(path),
    ]))
    return [float(frame["best_effort_timestamp_time"]) for frame in data.get("frames", []) if "best_effort_timestamp_time" in frame]


def run_color_timing(ffmpeg: str, ffprobe: str, root: Path, inventory: dict[str, Any]) -> dict[str, Any]:
    sdr = root / "sdr-bt709.mkv"
    pq = root / "hdr10-pq-ramp.mkv"
    hlg = root / "hlg-ramp.mkv"
    vfr = root / "vfr.mp4"
    rotated_base = root / "rotation-base.mp4"
    rotated = root / "rotated-90.mp4"
    measured_run([ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=1", "-vf", "format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709", "-c:v", "ffv1", str(sdr)])
    for transfer, destination in (("smpte2084", pq), ("arib-std-b67", hlg)):
        measured_run([
            ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "nullsrc=s=320x180:r=24:d=1",
            "-vf", f"format=yuv420p10le,geq=lum='64+876*X/W':cb=512:cr=512,setparams=range=limited:color_primaries=bt2020:color_trc={transfer}:colorspace=bt2020nc",
            "-c:v", "ffv1", str(destination),
        ])
    measured_run([
        ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=1",
        "-f", "lavfi", "-i", "testsrc2=s=320x180:r=15:d=2",
        "-f", "lavfi", "-i", "sine=frequency=600:sample_rate=48000:duration=3",
        "-filter_complex", "[0:v]setpts=PTS-STARTPTS[v0];[1:v]setpts=PTS-STARTPTS[v1];[v0][v1]concat=n=2:v=1:a=0,settb=1/30000[v]",
        "-map", "[v]", "-map", "2:a:0", "-fps_mode", "vfr",
        "-c:v", "mpeg4", "-q:v", "3", "-c:a", "aac", str(vfr),
    ])
    measured_run([ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=1", "-c:v", "mpeg4", "-q:v", "3", str(rotated_base)])
    measured_run([ffmpeg, "-y", "-v", "error", "-display_rotation:v:0", "90", "-i", str(rotated_base), "-c", "copy", str(rotated)])
    evidence = {name: probe(ffprobe, path) for name, path in {"sdr": sdr, "pq": pq, "hlg": hlg, "vfr": vfr, "rotated": rotated}.items()}
    decode_runs = {name: measured_run([ffmpeg, "-v", "error", "-i", str(path), "-f", "null", "-"]) for name, path in {"sdr": sdr, "pq": pq, "hlg": hlg, "vfr": vfr, "rotated": rotated}.items()}
    vfr_video = first_video(evidence["vfr"])
    vfr_audio = first_audio(evidence["vfr"])
    sdr_video = first_video(evidence["sdr"])
    pq_video = first_video(evidence["pq"])
    hlg_video = first_video(evidence["hlg"])
    timestamps = video_frame_timestamps(ffprobe, vfr)
    expected_timestamps = [index / 30 if index < 30 else 1 + (index - 30) / 15 for index in range(60)]
    timestamp_tolerance = 1 / 30
    monotonic = all(current > previous for previous, current in zip(timestamps, timestamps[1:]))
    schedule_matches = len(timestamps) == len(expected_timestamps) and all(
        abs(actual - expected) <= timestamp_tolerance for actual, expected in zip(timestamps, expected_timestamps)
    )
    intervals = [current - previous for previous, current in zip(timestamps, timestamps[1:])]
    first_intervals = intervals[:29]
    second_intervals = intervals[30:]
    intervals_match = bool(first_intervals and second_intervals) and all(abs(value - 1 / 30) <= 0.002 for value in first_intervals) and all(abs(value - 1 / 15) <= 0.002 for value in second_intervals)
    vfr_duration = timestamps[-1] + (intervals[-1] if intervals else 0.0) if timestamps else 0.0
    audio_duration = float(vfr_audio.get("duration") or evidence["vfr"]["format"]["duration"])
    av_duration_error = abs(vfr_duration - audio_duration)
    sdr_metadata = sdr_video.get("pix_fmt") == "yuv420p" and sdr_video.get("color_space") == "bt709" and sdr_video.get("color_primaries") == "bt709" and sdr_video.get("color_transfer") == "bt709" and sdr_video.get("color_range") == "tv"
    pq_metadata = pq_video.get("color_transfer") == "smpte2084" and pq_video.get("pix_fmt") == "yuv420p10le" and pq_video.get("color_space") == "bt2020nc" and pq_video.get("color_primaries") == "bt2020" and pq_video.get("color_range") == "tv"
    hlg_metadata = hlg_video.get("color_transfer") == "arib-std-b67" and hlg_video.get("pix_fmt") == "yuv420p10le" and hlg_video.get("color_space") == "bt2020nc" and hlg_video.get("color_primaries") == "bt2020" and hlg_video.get("color_range") == "tv"
    classifications = {
        "sdrMetadata": "PASS" if sdr_metadata else "FAIL",
        "sdrDecode": "PASS" if decode_runs["sdr"]["returnCode"] == 0 else "FAIL",
        "pqMetadata": "PASS" if pq_metadata else "FAIL",
        "pqDecode": "PASS" if decode_runs["pq"]["returnCode"] == 0 else "FAIL",
        "hlgMetadata": "PASS" if hlg_metadata else "FAIL",
        "hlgDecode": "PASS" if decode_runs["hlg"]["returnCode"] == 0 else "FAIL",
        "vfrFrameCount": "PASS" if len(timestamps) == 60 else "FAIL",
        "vfrMonotonicPts": "PASS" if monotonic else "FAIL",
        "vfrExpectedSchedule": "PASS" if schedule_matches and intervals_match else "FAIL",
        "vfrAudioDurationSync": "PASS" if av_duration_error <= timestamp_tolerance else "FAIL",
        "vfrRateEvidence": "PASS" if vfr_video.get("avg_frame_rate") != vfr_video.get("r_frame_rate") else "WARN",
        "rotationEvidence": "PASS" if any(side.get("rotation") == 90 for side in first_video(evidence["rotated"]).get("side_data_list", [])) else "WARN",
        "hdrToSdr": "NOT RUN" if not inventory["filters"]["zscale"] else "NOT RUN: dependency available but no approved quality policy",
        "realDolbyVision": "NOT RUN",
        "subjectiveVisualQuality": "NOT RUN",
    }
    summary = aggregate_classifications(classifications)
    return {
        **summary,
        "classifications": classifications,
        "vfrTimestampEvidence": {
            "frameCount": len(timestamps),
            "timestampsSeconds": timestamps,
            "expectedTimestampsSeconds": expected_timestamps,
            "monotonic": monotonic,
            "observedIntervalsSeconds": sorted({round(value, 6) for value in intervals}),
            "expectedIntervalsSeconds": [round(1 / 30, 6), round(1 / 15, 6)],
            "timestampToleranceSeconds": timestamp_tolerance,
            "formatDurationSeconds": vfr_duration,
            "audioDurationSeconds": audio_duration,
            "avDurationErrorSeconds": av_duration_error,
            "avgFrameRate": vfr_video.get("avg_frame_rate"),
            "rFrameRate": vfr_video.get("r_frame_rate"),
        },
        "probe": evidence,
        "decodeRuns": decode_runs,
        "fixtures": {str(path.name): {"sha256": sha256(path), "bytes": path.stat().st_size} for path in (sdr, pq, hlg, vfr, rotated)},
        "limitations": ["synthetic signal ramps do not validate real iPhone/Dolby Vision decoding", "metadata and decode are separate from numerical transformation and subjective quality", "timestamp validation does not choose a product CFR/VFR policy"],
    }


def simulate_staged_write(target: Path, *, failure: str, cleanup_failure: bool = False) -> dict[str, Any]:
    partial = target.with_name(target.name + ".partial")
    existing_before = target.read_bytes() if target.exists() else None
    cleanup_attempted = False
    cleanup_error: str | None = None
    try:
        if target.exists():
            raise FileExistsError(errno.EEXIST, "refusing to replace existing artifact", str(target))
        partial.write_bytes(b"OWNED-PARTIAL")
        if failure == "permission":
            raise PermissionError(errno.EACCES, "SIMULATED permission denial", str(partial))
        if failure == "enospc":
            raise OSError(errno.ENOSPC, "SIMULATED no space left on device", str(partial))
        raise ValueError(f"unknown simulated failure: {failure}")
    except OSError as exc:
        error = {"type": type(exc).__name__, "errno": exc.errno, "message": str(exc), "simulated": True}
        cleanup_attempted = partial.exists()
        if partial.exists():
            if cleanup_failure:
                cleanup_error = "SIMULATED owned-partial cleanup failure"
            else:
                partial.unlink()
    finally:
        partial_observed_after_failure = partial.exists()
        if partial.exists():
            partial.unlink()
    return {
        "classification": "PASS",
        "error": error,
        "finalPromoted": False,
        "existingArtifactUnchanged": existing_before is None or target.read_bytes() == existing_before,
        "cleanupAttempted": cleanup_attempted,
        "cleanupFailureVisible": cleanup_error is not None,
        "cleanupError": cleanup_error,
        "partialObservedAfterFailure": partial_observed_after_failure,
        "partialRemovedByHarnessAfterObservation": cleanup_failure and not partial.exists(),
    }


def run_failure_lifecycle(ffmpeg: str, root: Path) -> dict[str, Any]:
    existing = root / "already-exists.wav"
    existing.write_bytes(b"OWNER-SENTINEL")
    exists_proc = subprocess.run([ffmpeg, "-n", "-v", "error", "-f", "lavfi", "-i", "sine=d=1", str(existing)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
    sentinel_preserved = existing.read_bytes() == b"OWNER-SENTINEL"

    final = root / "cancelled-final.mov"
    partial = root / "cancelled-final.mov.partial"
    proc = subprocess.Popen([
        ffmpeg, "-y", "-v", "error", "-re", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=20",
        "-c:v", "mpeg4", "-q:v", "3", "-f", "mov", str(partial),
    ], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, **_process_options())
    time.sleep(0.6)
    _cancel_owned_tree(proc)
    final_absent = not final.exists()
    partial_present_before_owner_cleanup = partial.exists()
    if partial.exists():
        partial.unlink()
    partial_removed = not partial.exists()

    unrelated = root / "unrelated-owner-file"
    unrelated.write_bytes(b"UNRELATED")
    permission = simulate_staged_write(root / "simulated-permission.wav", failure="permission")
    enospc = simulate_staged_write(root / "simulated-enospc.wav", failure="enospc")
    cleanup_failure = simulate_staged_write(root / "simulated-cleanup-failure.wav", failure="enospc", cleanup_failure=True)
    unrelated_preserved = unrelated.read_bytes() == b"UNRELATED"
    passed = sentinel_preserved and final_absent and partial_present_before_owner_cleanup and partial_removed and unrelated_preserved and all(result["classification"] == "PASS" for result in (permission, enospc, cleanup_failure))
    return {
        "classification": "PASS" if passed else "FAIL",
        "outputExists": {"returnCode": exists_proc.returncode, "sentinelPreserved": sentinel_preserved},
        "cancellation": {"returnCode": proc.returncode, "finalAbsent": final_absent, "partialPresentBeforeOwnerCleanup": partial_present_before_owner_cleanup, "partialRemovedByOwner": partial_removed},
        "simulatedPermissionFailure": permission,
        "simulatedEnospcFailure": enospc,
        "simulatedCleanupFailure": cleanup_failure,
        "unrelatedPathPreserved": unrelated_preserved,
        "realFilesystemPermissionFailure": {"classification": "NOT RUN", "reason": "chmod denial is user/platform dependent and is not deterministic under root"},
        "realFilesystemEnospc": {"classification": "NOT RUN", "reason": "no disk fill, mount or quota was used"},
        "limitations": ["SIMULATED injection validates only laboratory error propagation and staging discipline", "product-boundary low-disk and crash durability remain unproved"],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ffmpeg", required=True, type=Path)
    parser.add_argument("--ffprobe", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    ffmpeg = str(args.ffmpeg.resolve(strict=True))
    ffprobe = str(args.ffprobe.resolve(strict=True))
    root = args.output_dir.resolve()
    if root.exists() and any(root.iterdir()):
        raise SystemExit(f"output directory must be empty: {root}")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(root, 0o700)

    inventory = encoder_and_filter_inventory(ffmpeg)
    report: dict[str, Any] = {
        "schemaVersion": 2,
        "generatedAtUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "baseSha": capture(["git", "rev-parse", "HEAD"]).strip(),
        "platform": {"system": platform.system(), "release": platform.release(), "machine": platform.machine(), "python": platform.python_version()},
        "binary": inventory,
        "safeguards": {"oneHeavyProcessAtATime": True, "commandTimeoutSeconds": 120, "scratchOwnerOnly": True},
    }
    experiments = {
        "audioJCut": lambda: run_audio_jcut(ffmpeg, ffprobe, root),
        "audioOnlyScaling": lambda: run_audio_only_scaling(ffmpeg, ffprobe, root),
        "manyCutScaling": lambda: run_many_cut_scaling(ffmpeg, ffprobe, root),
        "muxVideoCopy": lambda: run_mux_copy(ffmpeg, ffprobe, root),
        "colorTiming": lambda: run_color_timing(ffmpeg, ffprobe, root, inventory),
        "failureLifecycle": lambda: run_failure_lifecycle(ffmpeg, root),
    }
    report["experiments"] = {}
    for name, experiment in experiments.items():
        try:
            report["experiments"][name] = experiment()
        except Exception as exc:  # preserve failed evidence instead of hiding it
            report["experiments"][name] = {"classification": "FAIL", "error": str(exc)}
    report["summary"] = aggregate_classifications({name: value["classification"] for name, value in report["experiments"].items()})
    report_path = root / "results.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(report_path)
    print(json.dumps({name: value["classification"] for name, value in report["experiments"].items()}, indent=2))
    return 1 if report["summary"]["classification"] == "FAIL" else 0


if __name__ == "__main__":
    raise SystemExit(main())
