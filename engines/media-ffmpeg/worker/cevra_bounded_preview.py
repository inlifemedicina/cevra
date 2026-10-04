"""Closed ephemeral trim profile. All argv/filter expressions are worker-owned."""
from __future__ import annotations

import json
import hashlib
import math
import os
import stat
from fractions import Fraction
from pathlib import Path
from typing import Any

import cevra_job_control as jobs

MAX_BYTES = 8 * 1024 * 1024
MAX_FRAMES = 3600


def frame_times(common: Any, path: str) -> tuple[list[Fraction], Fraction]:
    # Packet ceiling bounds captured probe output even for misleading metadata.
    result = jobs.run([common.require_tool("ffprobe"), "-v", "error", "-select_streams", "v:0",
                       "-read_intervals", "%+#7201", "-show_frames", "-show_streams",
                       "-show_entries", "stream=time_base,avg_frame_rate,r_frame_rate,nb_frames:frame=best_effort_timestamp",
                       "-of", "json", path], stdout=-1, stderr=-1, text=True, timeout=10, check=True)
    if len(result.stdout) > 1024 * 1024:
        raise ValueError("preview frame evidence exceeds budget")
    data = json.loads(result.stdout)
    streams, frames = data.get("streams", []), data.get("frames", [])
    if len(streams) != 1 or not 1 <= len(frames) <= MAX_FRAMES:
        raise ValueError("preview frame count is unsupported")
    stream = streams[0]
    if int(stream.get("nb_frames", 0)) != len(frames):
        raise ValueError("preview frame scan is incomplete")
    rate = Fraction(stream["avg_frame_rate"])
    if rate != Fraction(stream["r_frame_rate"]) or not 1 <= rate <= 60:
        raise ValueError("preview requires a measured CFR stream")
    time_base = Fraction(stream["time_base"])
    if time_base <= 0:
        raise ValueError("preview frame time base is invalid")
    times = []
    for frame in frames:
        pts = frame.get("best_effort_timestamp")
        if not isinstance(pts, int) or isinstance(pts, bool):
            raise ValueError("preview frame timestamp is unavailable")
        times.append(pts * time_base)
    if times[0] != 0 or any(b - a != 1 / rate for a, b in zip(times, times[1:])):
        raise ValueError("preview requires zero-origin CFR timestamps")
    if times[-1] + 1 / rate > 60:
        raise ValueError("preview source exceeds the 60-second budget")
    return times, rate


def audio_samples(common: Any, path: str, sample_rate: int) -> int:
    result = jobs.run([common.require_tool("ffprobe"), "-v", "error", "-select_streams", "a:0",
        "-read_intervals", "%+#7201", "-show_frames", "-show_streams", "-show_entries",
        "stream=time_base,sample_rate,channels:frame=best_effort_timestamp,nb_samples", "-of", "json", path],
        stdout=-1, stderr=-1, text=True, timeout=10, check=True)
    if len(result.stdout) > 1024 * 1024:
        raise ValueError("preview audio evidence exceeds budget")
    data = json.loads(result.stdout)
    streams, frames = data.get("streams", []), data.get("frames", [])
    if len(streams) != 1 or not 1 <= len(frames) <= 3600 or int(streams[0]["sample_rate"]) != sample_rate:
        raise ValueError("preview decoded audio is unsupported")
    time_base, count = Fraction(streams[0]["time_base"]), 0
    for frame in frames:
        pts, samples = frame.get("best_effort_timestamp"), frame.get("nb_samples")
        if not isinstance(pts, int) or not isinstance(samples, int) or isinstance(samples, bool) or samples <= 0 or pts * time_base != Fraction(count, sample_rate):
            raise ValueError("preview requires contiguous zero-origin audio samples")
        count += samples
    if count > 61 * sample_rate:
        raise ValueError("preview audio exceeds budget")
    return count


def run(common: Any, args: dict[str, Any]) -> dict[str, Any]:
    source, output = Path(args["input"]), Path(args["output"])
    if not source.is_absolute() or not output.is_absolute() or output.suffix.lower() != ".mp4" or args["accurate"] is not True:
        raise ValueError("invalid bounded preview profile")
    source_stat = source.lstat()
    if not stat.S_ISREG(source_stat.st_mode) or not 0 < source_stat.st_size <= MAX_BYTES:
        raise ValueError("preview input must be a bounded regular file")
    if output.exists() or output.is_symlink() or output.parent.is_symlink() or not output.parent.is_dir():
        raise ValueError("preview output must be new in an owned directory")
    start, end = Fraction(str(args["start"])), Fraction(str(args["end"]))
    if not 0 <= start < end <= 60:
        raise ValueError("preview range exceeds budget")
    meta = common.probe(str(source))
    video, audio = meta.get("video") or {}, meta.get("audio")
    if not 0 < (meta.get("duration") or 0) <= 60 or not video or video.get("hdr") or video.get("rotation", 0) != 0:
        raise ValueError("preview source format is unsupported")
    if not 0 < video.get("width", 0) <= 1920 or not 0 < video.get("height", 0) <= 1080:
        raise ValueError("preview resolution exceeds budget")
    times, rate = frame_times(common, str(source))
    selected_indexes = [index for index, time in enumerate(times) if start <= time < end]
    selected = [times[index] for index in selected_indexes]
    if not selected:
        raise ValueError("preview range contains no video frame")
    # Select decoded source frames in [IN, OUT), then start their presentation at
    # zero. A non-aligned IN advances the first picture by less than one frame.
    command = common.ffmpeg_base() + ["-threads", "2", "-i", str(source), "-map", "0:v:0",
        "-vf", f"trim=start_frame={selected_indexes[0]}:end_frame={selected_indexes[-1] + 1},setpts=PTS-STARTPTS", "-fps_mode", "passthrough"]
    command += common.video_args(meta)
    if audio:
        sample_rate = audio.get("sample_rate")
        if sample_rate not in (44100, 48000) or audio.get("channels") not in (1, 2):
            raise ValueError("preview audio format is unsupported")
        # Require recorded audio coverage. Never invent silence for missing data.
        from cevra_native_tools import _audio_coverage_ms
        audio_start, audio_end = _audio_coverage_ms(audio, "preview")
        if audio_start != 0 or audio_end < end * 1000:
            raise ValueError("preview audio does not cover the requested range")
        first_sample, final_sample = math.ceil(start * sample_rate), math.ceil(end * sample_rate)
        if audio_samples(common, str(source), sample_rate) < final_sample:
            raise ValueError("preview decoded audio does not cover the requested range")
        command += ["-map", "0:a:0", "-af", f"atrim=start_sample={first_sample}:end_sample={final_sample},asetpts=PTS-STARTPTS"] + common.aac_args()
    else:
        command += ["-an"]
    # -fs bounds render growth (mux overhead can exceed it slightly); admission
    # below still enforces the exact 8 MiB payload ceiling and complete frame set.
    command += ["-threads", "2", "-fs", str(MAX_BYTES), "-movflags", "+faststart", str(output)]
    jobs.run(command, stdout=-1, stderr=-1, text=True, timeout=20, check=True, artifact_paths=[str(output)])
    published = output.lstat()
    if not stat.S_ISREG(published.st_mode) or not 0 < published.st_size <= MAX_BYTES:
        raise ValueError("preview output exceeds admission budget")
    output_times, output_rate = frame_times(common, str(output))
    if output_rate != rate or len(output_times) != len(selected):
        raise ValueError("preview output has missing or duplicated frames")
    probe = common.verify_output(str(output))
    if bool(probe.get("audio")) != bool(audio):
        raise ValueError("preview output stream mismatch")
    audio_evidence = None
    if audio:
        output_audio = probe["audio"]
        if output_audio.get("codec") != "aac" or output_audio.get("sample_rate") != sample_rate or output_audio.get("channels") != audio["channels"]:
            raise ValueError("preview output audio profile mismatch")
        decoded = audio_samples(common, str(output), sample_rate)
        expected = final_sample - first_sample
        if not expected <= decoded < expected + 1024:
            raise ValueError("preview decoded audio is truncated or exceeds AAC padding")
        audio_evidence = {"sampleRate": sample_rate, "channels": audio["channels"], "inputSamples": expected, "decodedSamples": decoded}
    duration = probe.get("duration")
    tolerance = max(float(1 / rate), 1024 / audio["sample_rate"] if audio else 0) + 0.002
    if not isinstance(duration, (int, float)) or not math.isfinite(duration) or abs(duration - float(end - start)) > tolerance:
        raise ValueError("preview duration exceeds frame/codec quantization")
    evidence = {"version": 1, "sourceStartMs": round(float(start * 1000)), "sourceEndMs": round(float(end * 1000)),
                "firstFrameMs": float(selected[0] * 1000), "lastFrameMs": float(selected[-1] * 1000),
                "frameCount": len(selected), "frameRate": float(rate)}
    if audio_evidence:
        evidence["audio"] = audio_evidence
    # Bind admitted bytes to the same file that passed frame/audio probes. A
    # publication inode alone does not detect an in-place rewrite before the host reads.
    with output.open("rb") as handle:
        before = os.fstat(handle.fileno())
        digest = hashlib.sha256(handle.read(MAX_BYTES + 1)).hexdigest()
        after = os.fstat(handle.fileno())
    final = output.lstat()
    def stamp(value: os.stat_result) -> tuple[int, ...]:
        return value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns
    if stamp(published) != stamp(before) or stamp(before) != stamp(after) or stamp(after) != stamp(final) or not stat.S_ISREG(final.st_mode):
        raise ValueError("preview output changed during validation")
    evidence["outputSha256"] = digest
    payload = {"status": "completed", "output": str(output), "probe": probe, "boundedPreview": evidence}
    if os.name == "posix":
        payload["publication"] = {"version": 1, "scheme": "posix-dev-inode", "device": str(published.st_dev), "inode": str(published.st_ino)}
    return {"content": [{"type": "text", "text": json.dumps(payload)}], "structuredContent": payload}
