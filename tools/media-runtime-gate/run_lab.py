#!/usr/bin/env python3
"""Bounded synthetic-media characterization for the CEVRA Media Runtime gate."""

from __future__ import annotations

import argparse
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
from pathlib import Path
from typing import Any


TIME = "/usr/bin/time"
TIME_PATTERNS = {
    "realSeconds": re.compile(r"^real\s+([0-9.]+)$", re.MULTILINE),
    "userSeconds": re.compile(r"^user\s+([0-9.]+)$", re.MULTILINE),
    "systemSeconds": re.compile(r"^sys\s+([0-9.]+)$", re.MULTILINE),
    "peakRssBytes": re.compile(r"^\s*(\d+)\s+maximum resident set size$", re.MULTILINE),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def measured_run(argv: list[str], *, timeout: int = 120, expected: int = 0) -> dict[str, Any]:
    started = time.monotonic()
    proc = subprocess.run(
        [TIME, "-lp", *argv],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=timeout,
    )
    stderr = proc.stderr
    metrics: dict[str, float | int] = {"wallSecondsObserved": round(time.monotonic() - started, 6)}
    for name, pattern in TIME_PATTERNS.items():
        match = pattern.search(stderr)
        if match:
            metrics[name] = int(match.group(1)) if name == "peakRssBytes" else float(match.group(1))
    result = {
        "argv": argv,
        "returnCode": proc.returncode,
        "metrics": metrics,
        "stderrTail": "\n".join(stderr.splitlines()[-12:]),
    }
    if proc.returncode != expected:
        raise RuntimeError(json.dumps(result, indent=2))
    return result


def capture(argv: list[str], *, timeout: int = 30) -> str:
    return subprocess.run(argv, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout).stdout


def probe(ffprobe: str, path: Path) -> dict[str, Any]:
    return json.loads(capture([ffprobe, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]))


def first_video(data: dict[str, Any]) -> dict[str, Any]:
    return next(stream for stream in data["streams"] if stream.get("codec_type") == "video")


def first_audio(data: dict[str, Any]) -> dict[str, Any]:
    return next(stream for stream in data["streams"] if stream.get("codec_type") == "audio")


def dominant_frequency(ffmpeg: str, path: Path, start: float, duration: float, candidates: tuple[int, ...]) -> dict[str, float | int]:
    raw = subprocess.run(
        [ffmpeg, "-v", "error", "-ss", str(start), "-t", str(duration), "-i", str(path), "-map", "0:a:0", "-ac", "1", "-ar", "48000", "-f", "s16le", "-"],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
    ).stdout
    samples = struct.unpack(f"<{len(raw) // 2}h", raw)
    powers: dict[int, float] = {}
    for frequency in candidates:
        omega = 2.0 * math.pi * frequency / 48000.0
        real = sum(sample * math.cos(omega * index) for index, sample in enumerate(samples))
        imag = sum(sample * math.sin(omega * index) for index, sample in enumerate(samples))
        powers[frequency] = round(real * real + imag * imag, 3)
    winner = max(powers, key=powers.get)
    return {"dominantHz": winner, **{f"power{frequency}Hz": powers[frequency] for frequency in candidates}}


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
    source_a = root / "source-a.mov"
    source_b = root / "source-b.mov"
    measured_run([
        ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=320x180:r=30:d=2",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
        "-c:v", "mpeg4", "-q:v", "3", "-c:a", "pcm_s16le", "-shortest", str(source_a),
    ])
    measured_run([
        ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=30:d=2.5",
        "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=44100:duration=2.5",
        "-c:v", "mpeg4", "-q:v", "3", "-c:a", "pcm_s16le", "-shortest", str(source_b),
    ])
    return source_a, source_b


def run_audio_jcut(ffmpeg: str, ffprobe: str, root: Path) -> dict[str, Any]:
    source_a, source_b = generate_sources(ffmpeg, root)
    sequential = root / "sequential.mov"
    candidate = root / "jcut-candidate.mov"
    sequential_run = measured_run([
        ffmpeg, "-y", "-v", "error", "-i", str(source_a), "-i", str(source_b),
        "-filter_complex",
        "[0:v]trim=0:2,setpts=PTS-STARTPTS[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS[v1];"
        "[v0][v1]concat=n=2:v=1:a=0[v];"
        "[0:a]atrim=0:2,asetpts=PTS-STARTPTS,aformat=sample_rates=48000[a0];"
        "[1:a]atrim=0:2,asetpts=PTS-STARTPTS,aformat=sample_rates=48000[a1];"
        "[a0][a1]concat=n=2:v=0:a=1[a]",
        "-map", "[v]", "-map", "[a]", "-c:v", "mpeg4", "-q:v", "3", "-c:a", "pcm_s16le", str(sequential),
    ])
    candidate_run = measured_run([
        ffmpeg, "-y", "-v", "error", "-i", str(source_a), "-i", str(source_b),
        "-filter_complex",
        "[0:v]trim=0:2,setpts=PTS-STARTPTS[v0];[1:v]trim=0:2,setpts=PTS-STARTPTS[v1];"
        "[v0][v1]concat=n=2:v=1:a=0[v];"
        "[0:a]atrim=0:1.5,asetpts=PTS-STARTPTS,aformat=sample_rates=48000[a0];"
        "[1:a]atrim=0:2.5,asetpts=PTS-STARTPTS,aformat=sample_rates=48000,adelay=1500:all=1[a1];"
        "[a0][a1]amix=inputs=2:duration=longest:normalize=0[a]",
        "-map", "[v]", "-map", "[a]", "-c:v", "mpeg4", "-q:v", "3", "-c:a", "pcm_s16le", str(candidate),
    ])
    sequential_probe = probe(ffprobe, sequential)
    candidate_probe = probe(ffprobe, candidate)
    tones = {
        "beforeJCut": dominant_frequency(ffmpeg, candidate, 1.1, 0.2, (440, 880)),
        "afterJCutBeforePictureCut": dominant_frequency(ffmpeg, candidate, 1.65, 0.2, (440, 880)),
        "afterPictureCut": dominant_frequency(ffmpeg, candidate, 2.2, 0.2, (440, 880)),
    }
    duration = float(candidate_probe["format"]["duration"])
    passed = tones["beforeJCut"]["dominantHz"] == 440 and tones["afterJCutBeforePictureCut"]["dominantHz"] == 880 and tones["afterPictureCut"]["dominantHz"] == 880 and abs(duration - 4.0) <= 0.05
    return {
        "classification": "PASS" if passed else "FAIL",
        "existingTypedOperations": "NOT REPRESENTABLE: current operations cannot independently place/mix audio against video cuts",
        "sequential": {"run": sequential_run, "bytes": sequential.stat().st_size, "duration": sequential_probe["format"].get("duration")},
        "fixedTwoInputPrototype": {"run": candidate_run, "bytes": candidate.stat().st_size, "duration": candidate_probe["format"].get("duration"), "toneEvidence": tones},
        "fixtures": {str(path.name): {"sha256": sha256(path), "bytes": path.stat().st_size} for path in (source_a, source_b)},
        "limitations": ["fixed laboratory graph, not a proposed user/agent-facing filtergraph API", "does not implement speech-quality or subjective listening acceptance"],
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
        "muxRun": mux_run,
        "decodeRun": decoded,
        "sourceVideoPacketSequenceSha256": hashlib.sha256("\n".join(source_packets).encode()).hexdigest(),
        "outputVideoPacketSequenceSha256": hashlib.sha256("\n".join(output_packets).encode()).hexdigest(),
        "videoPacketCount": {"source": len(source_packets), "output": len(output_packets)},
        "outputBytes": output.stat().st_size,
        "probe": data,
        "encodeGenerations": {"video": 0, "newAudio": 1},
    }


def run_color_timing(ffmpeg: str, ffprobe: str, root: Path, inventory: dict[str, Any]) -> dict[str, Any]:
    sdr = root / "sdr-bt709.mkv"
    pq = root / "hdr10-pq-ramp.mkv"
    hlg = root / "hlg-ramp.mkv"
    vfr = root / "vfr.mp4"
    rotated_base = root / "rotation-base.mp4"
    rotated = root / "rotated-90.mp4"
    measured_run([ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=1", "-vf", "format=yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-c:v", "ffv1", str(sdr)])
    for transfer, destination in (("smpte2084", pq), ("arib-std-b67", hlg)):
        measured_run([
            ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "nullsrc=s=320x180:r=24:d=1",
            "-vf", f"format=yuv420p10le,geq=lum='64+876*X/W':cb=512:cr=512,setparams=range=limited:color_primaries=bt2020:color_trc={transfer}:colorspace=bt2020nc",
            "-c:v", "ffv1", str(destination),
        ])
    measured_run([
        ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=2",
        "-vf", "setpts='if(lt(N,30),N/(30*TB),1+(N-30)/(15*TB))'", "-fps_mode", "vfr", "-c:v", "mpeg4", "-q:v", "3", str(vfr),
    ])
    measured_run([ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=1", "-c:v", "mpeg4", "-q:v", "3", str(rotated_base)])
    measured_run([ffmpeg, "-y", "-v", "error", "-display_rotation:v:0", "90", "-i", str(rotated_base), "-c", "copy", str(rotated)])
    evidence = {name: probe(ffprobe, path) for name, path in {"sdr": sdr, "pq": pq, "hlg": hlg, "vfr": vfr, "rotated": rotated}.items()}
    decode_runs = {name: measured_run([ffmpeg, "-v", "error", "-i", str(path), "-f", "null", "-"]) for name, path in {"sdr": sdr, "pq": pq, "hlg": hlg, "vfr": vfr, "rotated": rotated}.items()}
    vfr_video = first_video(evidence["vfr"])
    pq_video = first_video(evidence["pq"])
    hlg_video = first_video(evidence["hlg"])
    classifications = {
        "sdrMetadataAndDecode": "PASS",
        "pqMetadataAndDecode": "PASS" if pq_video.get("color_transfer") == "smpte2084" and pq_video.get("pix_fmt") == "yuv420p10le" else "FAIL",
        "hlgMetadataAndDecode": "PASS" if hlg_video.get("color_transfer") == "arib-std-b67" and hlg_video.get("pix_fmt") == "yuv420p10le" else "FAIL",
        "vfrTimingEvidence": "PASS" if vfr_video.get("avg_frame_rate") != vfr_video.get("r_frame_rate") else "WARN",
        "rotationEvidence": "PASS" if any(side.get("rotation") == 90 for side in first_video(evidence["rotated"]).get("side_data_list", [])) else "WARN",
        "hdrToSdr": "NOT RUN" if not inventory["filters"]["zscale"] else "NOT RUN: dependency available but no approved quality policy",
    }
    return {
        "classification": "WARN" if "WARN" in classifications.values() or any(str(value).startswith("NOT RUN") for value in classifications.values()) else "PASS",
        "classifications": classifications,
        "probe": evidence,
        "decodeRuns": decode_runs,
        "fixtures": {str(path.name): {"sha256": sha256(path), "bytes": path.stat().st_size} for path in (sdr, pq, hlg, vfr, rotated)},
        "limitations": ["synthetic signal ramps do not validate real iPhone/Dolby Vision decoding", "metadata/decode evidence is not subjective tone-map acceptance", "rate mismatch is evidence, not definitive VFR classification"],
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
    ], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    time.sleep(0.6)
    proc.send_signal(signal.SIGTERM)
    proc.wait(timeout=10)
    final_absent = not final.exists()
    partial_present_before_owner_cleanup = partial.exists()
    if partial.exists():
        partial.unlink()
    partial_removed = not partial.exists()

    blocked = root / "blocked"
    blocked.mkdir()
    blocked.chmod(0o500)
    permission_target = blocked / "cannot-write.wav"
    permission_proc = subprocess.run([ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "sine=d=0.1", str(permission_target)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
    blocked.chmod(0o700)
    permission_failed = permission_proc.returncode != 0 and not permission_target.exists()
    passed = sentinel_preserved and final_absent and partial_present_before_owner_cleanup and partial_removed and permission_failed
    return {
        "classification": "PASS" if passed else "FAIL",
        "outputExists": {"returnCode": exists_proc.returncode, "sentinelPreserved": sentinel_preserved},
        "cancellation": {"returnCode": proc.returncode, "finalAbsent": final_absent, "partialPresentBeforeOwnerCleanup": partial_present_before_owner_cleanup, "partialRemovedByOwner": partial_removed},
        "permissionFailure": {"returnCode": permission_proc.returncode, "outputAbsent": not permission_target.exists()},
        "lowDisk": {"classification": "NOT RUN", "reason": "no isolated quota/mount was available; process file-size limits do not faithfully model ENOSPC"},
        "limitations": ["validates the laboratory staging discipline; product transport/cancellation remains covered by repository lifecycle tests"],
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
        "schemaVersion": 1,
        "generatedAtUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "baseSha": capture(["git", "rev-parse", "HEAD"]).strip(),
        "platform": {"system": platform.system(), "release": platform.release(), "machine": platform.machine(), "python": platform.python_version()},
        "binary": inventory,
        "safeguards": {"oneHeavyProcessAtATime": True, "commandTimeoutSeconds": 120, "scratchOwnerOnly": True},
    }
    experiments = {
        "audioJCut": lambda: run_audio_jcut(ffmpeg, ffprobe, root),
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
    report_path = root / "results.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(report_path)
    print(json.dumps({name: value["classification"] for name, value in report["experiments"].items()}, indent=2))
    return 1 if any(value["classification"] == "FAIL" for value in report["experiments"].values()) else 0


if __name__ == "__main__":
    raise SystemExit(main())
