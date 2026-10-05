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


def _stamp(value: os.stat_result) -> tuple[int, ...]:
    return value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns


def _hash_stable(path: Path, initial: os.stat_result, limit: int) -> str:
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
    with os.fdopen(fd, "rb") as handle:
        before = os.fstat(handle.fileno())
        if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= limit or _stamp(before) != _stamp(initial):
            raise ValueError("preview file identity changed")
        digest = hashlib.sha256()
        while chunk := handle.read(65536):
            jobs.check_cancelled()
            digest.update(chunk)
        if _stamp(before) != _stamp(os.fstat(handle.fileno())) or _stamp(before) != _stamp(path.lstat()):
            raise ValueError("preview file changed during hashing")
        return digest.hexdigest()


def _scan_video(common: Any, path: str) -> tuple[list[Fraction], list[Fraction], Fraction, dict[str, Any]]:
    result = jobs.run([common.require_tool("ffprobe"), "-v", "error", "-select_streams", "v:0",
        "-read_intervals", "%+#7201", "-show_frames", "-show_streams", "-show_entries",
        "stream=time_base,nb_frames,duration_ts,width,height,sample_aspect_ratio:stream_side_data=rotation,displaymatrix:frame=best_effort_timestamp,duration",
        "-of", "json", path], stdout=-1, stderr=-1, text=True, timeout=10, check=True)
    if len(result.stdout) > 1024 * 1024:
        raise ValueError("preview frame evidence exceeds budget")
    data = json.loads(result.stdout)
    streams, frames = data.get("streams", []), data.get("frames", [])
    if len(streams) != 1 or not 1 <= len(frames) <= MAX_FRAMES:
        raise ValueError("preview frame scan is incomplete")
    stream = streams[0]
    tick = Fraction(stream["time_base"])
    if not 0 < tick <= Fraction(1, 600) or stream.get("sample_aspect_ratio", "1:1") not in ("1:1", "N/A"):
        raise ValueError("preview requires square pixels and a precise time base")
    times, durations = [], []
    for frame in frames:
        pts, duration = frame.get("best_effort_timestamp"), frame.get("duration")
        if not isinstance(pts, int) or isinstance(pts, bool) or not isinstance(duration, int) or isinstance(duration, bool) or duration <= 0:
            raise ValueError("preview requires measured PTS and frame durations")
        times.append(pts * tick)
        durations.append(duration * tick)
    if not 0 <= times[0] <= Fraction(1, 10) or times[-1] + durations[-1] > Fraction(60001, 1000):
        raise ValueError("preview source timestamps exceed budget")
    if any(not Fraction(1, 60) - tick <= b - a <= Fraction(1, 10) for a, b in zip(times, times[1:])) or any(d > Fraction(1, 10) for d in durations):
        raise ValueError("preview frame cadence exceeds budget")
    if int(stream.get("nb_frames", 0)) != len(frames):
        _verify_discarded_tail(common, path, stream, times, tick)
    return times, durations, tick, stream


def _verify_discarded_tail(common: Any, path: str, stream: dict[str, Any], times: list[Fraction], tick: Fraction) -> None:
    # QuickTime edit lists can leave encoded packets beyond the visible track.
    # Admit only an explicitly discarded tail, never an unaccounted decoder loss.
    declared, end = int(stream.get("nb_frames", 0)), stream.get("duration_ts")
    if not len(times) < declared <= MAX_FRAMES or declared - len(times) > 2 or not isinstance(end, int) or end <= 0:
        raise ValueError("preview frame scan is incomplete")
    result = jobs.run([common.require_tool("ffprobe"), "-v", "error", "-select_streams", "v:0", "-read_intervals", "%+#7201",
        "-show_packets", "-show_entries", "packet=pts,flags", "-of", "json", path], stdout=-1, stderr=-1, text=True, timeout=10, check=True)
    if len(result.stdout) > 1024 * 1024:
        raise ValueError("preview packet evidence exceeds budget")
    packets = json.loads(result.stdout).get("packets", [])
    if len(packets) != declared:
        raise ValueError("preview packet scan is incomplete")
    visible, discarded = [], []
    for packet in packets:
        pts = packet.get("pts")
        if not isinstance(pts, int) or isinstance(pts, bool):
            raise ValueError("preview packet timestamps are unavailable")
        if "D" in packet.get("flags", ""):
            if not end <= pts or pts * tick > end * tick + Fraction(1, 10):
                raise ValueError("preview discard is inside the visible track")
            discarded.append(pts * tick)
        else:
            visible.append(pts * tick)
    if len(discarded) != declared - len(times) or sorted(visible) != times or any(time < times[-1] for time in discarded):
        raise ValueError("preview has unaccounted missing frames")


def _scan_audio(common: Any, path: str, sample_rate: int) -> tuple[int, int]:
    result = jobs.run([common.require_tool("ffprobe"), "-v", "error", "-select_streams", "a:0",
        "-read_intervals", "%+#7201", "-show_frames", "-show_streams", "-show_entries",
        "stream=time_base,sample_rate:frame=best_effort_timestamp,nb_samples", "-of", "json", path],
        stdout=-1, stderr=-1, text=True, timeout=10, check=True)
    if len(result.stdout) > 1024 * 1024:
        raise ValueError("preview audio evidence exceeds budget")
    data = json.loads(result.stdout)
    streams, frames = data.get("streams", []), data.get("frames", [])
    if len(streams) != 1 or int(streams[0]["sample_rate"]) != sample_rate or not 1 <= len(frames) <= 3600:
        raise ValueError("preview decoded audio is unsupported")
    tick, first, count = Fraction(streams[0]["time_base"]), None, 0
    for frame in frames:
        pts, samples = frame.get("best_effort_timestamp"), frame.get("nb_samples")
        if not isinstance(pts, int) or isinstance(pts, bool) or not isinstance(samples, int) or isinstance(samples, bool) or samples <= 0:
            raise ValueError("preview audio sample evidence is missing")
        index = pts * tick * sample_rate
        if first is None:
            if index.denominator != 1 or not 0 <= index <= sample_rate / 10:
                raise ValueError("preview audio origin exceeds budget")
            first = int(index)
        if index != first + count:
            raise ValueError("preview audio has a gap or overlap")
        count += samples
    if count > 61 * sample_rate:
        raise ValueError("preview audio exceeds budget")
    return first, count


def _rotation(stream: dict[str, Any], fallback: int) -> int:
    rotation = fallback
    for side in stream.get("side_data_list", []):
        if "rotation" in side:
            value = float(side["rotation"])
            if not math.isfinite(value) or abs(value - round(value / 90) * 90) > 0.001:
                raise ValueError("preview rotation must be a quarter turn")
            rotation = int(round(value))
        if "displaymatrix" in side:
            rows = [line.split(":", 1)[1].split() for line in side["displaymatrix"].strip().splitlines()]
            matrix = [int(value) for row in rows for value in row]
            cardinal = {0: (65536, 0, 0, 65536), 90: (0, -65536, 65536, 0), 180: (-65536, 0, 0, -65536), 270: (0, 65536, -65536, 0)}
            if len(matrix) != 9 or matrix[2] or matrix[5] or matrix[8] != 1073741824 or tuple(matrix[i] for i in (0, 1, 3, 4)) != cardinal.get(rotation % 360):
                raise ValueError("preview display matrix is unsupported")
            width, height = stream.get("width", 0), stream.get("height", 0)
            if not isinstance(width, int) or not isinstance(height, int) or min(width, height) <= 0:
                raise ValueError("preview display geometry is missing")
            tx = -min(matrix[0] * x + matrix[3] * y for x, y in ((0, 0), (width, 0), (0, height), (width, height)))
            ty = -min(matrix[1] * x + matrix[4] * y for x, y in ((0, 0), (width, 0), (0, height), (width, height)))
            if (matrix[6], matrix[7]) not in ((0, 0), (tx, ty)):
                raise ValueError("preview display translation is unsupported")
    if rotation % 90:
        raise ValueError("preview rotation must be a quarter turn")
    return rotation % 360


def run_take(common: Any, args: dict[str, Any]) -> dict[str, Any]:
    """Closed SDR phone profile: immutable source, one clock, bounded proxy."""
    source, output = Path(args["input"]), Path(args["output"])
    if args.get("preview_profile") != "take-v1" or args.get("bounded_preview") is not True or args.get("accurate") is not True or not source.is_absolute() or not output.is_absolute() or output.suffix.lower() != ".mp4":
        raise ValueError("invalid Take preview profile")
    original = source.lstat()
    input_digest = _hash_stable(source, original, 256 * 1024 * 1024)
    if output.exists() or output.is_symlink() or output.parent.is_symlink() or not output.parent.is_dir():
        raise ValueError("preview output must be new in an owned directory")
    start, end = Fraction(str(args["start"])), Fraction(str(args["end"]))
    if not 0 <= start < end <= 60:
        raise ValueError("preview range exceeds budget")
    meta = common.probe(str(source))
    video, audio = meta.get("video") or {}, meta.get("audio")
    duration = Fraction(str(meta.get("duration") or 0))
    if not 0 < duration <= 60 or end > duration + Fraction(1, 1000) or not video or video.get("hdr"):
        raise ValueError("Take preview requires bounded SDR video")
    width, height = video.get("width", 0), video.get("height", 0)
    if not 2 <= min(width, height) <= 1080 or max(width, height) > 1920:
        raise ValueError("preview resolution exceeds Full HD budget")
    times, durations, tick, stream = _scan_video(common, str(source))
    rotation = _rotation(stream, video.get("rotation", 0))
    if abs(times[-1] + durations[-1] - duration) > Fraction(1, 10):
        raise ValueError("preview video coverage is incomplete")
    indexes = [i for i, time in enumerate(times) if start <= time < end]
    if not indexes:
        raise ValueError("preview range contains no video frame")
    selected = [times[i] for i in indexes]
    shown_width, shown_height = (height, width) if rotation in (90, 270) else (width, height)
    scale = min(Fraction(1), Fraction(720, max(shown_width, shown_height)))
    target_width, target_height = int(shown_width * scale) // 2 * 2, int(shown_height * scale) // 2 * 2
    # FFmpeg autorotation is the only orientation transform. -copyts retains
    # the common source/container clock; both streams subtract the same IN.
    filters = f"trim=start_frame={indexes[0]}:end_frame={indexes[-1] + 1},setpts=PTS-{start.numerator}/{start.denominator}/TB,scale={target_width}:{target_height},setsar=1"
    command = common.ffmpeg_base() + ["-copyts", "-threads", "2", "-i", str(source), "-map", "0:v:0", "-vf", filters, "-fps_mode", "passthrough"]
    command += common.video_args(meta) + ["-enc_time_base:v", "1:60000", "-b:v", "700k", "-maxrate", "700k", "-bufsize", "1400k", "-bf", "0", "-pix_fmt", "yuv420p"]
    padding = None
    if audio:
        sr, channels = audio.get("sample_rate"), audio.get("channels")
        if sr not in (44100, 48000) or channels not in (1, 2):
            raise ValueError("preview audio format is unsupported")
        first, count = _scan_audio(common, str(source), sr)
        source_samples = math.ceil(duration * sr)
        tail = max(0, source_samples - first - count)
        if tail > sr // 10 or first + count > source_samples + 1024:
            raise ValueError("preview audio coverage exceeds edge budget")
        begin, finish = math.ceil(start * sr), math.ceil(end * sr)
        leading = max(0, min(finish, first) - begin)
        trailing = max(0, finish - max(begin, first + count))
        if leading + trailing >= finish - begin:
            raise ValueError("preview range contains no recorded audio")
        padding = {"leadingSamples": leading, "trailingSamples": trailing}
        command += ["-map", "0:a:0", "-af", f"asetpts=PTS-STARTPTS,adelay={first}S:all=1,apad=whole_len={max(source_samples, finish)},atrim=start_sample={begin}:end_sample={finish},asetpts=PTS-STARTPTS"] + common.aac_args("96k")
    else:
        command += ["-an"]
    command += ["-threads", "2", "-avoid_negative_ts", "disabled", "-video_track_timescale", "60000", "-fs", str(MAX_BYTES), "-movflags", "+faststart", str(output)]
    jobs.run(command, stdout=-1, stderr=-1, text=True, timeout=20, check=True, artifact_paths=[str(output)])
    published = output.lstat()
    output_times, output_durations, output_tick, output_stream = _scan_video(common, str(output))
    tolerance = output_tick + tick
    if len(output_times) != len(selected) or any(abs(actual - (expected - start)) > tolerance for actual, expected in zip(output_times, selected)):
        raise ValueError("preview changed measured source timestamps")
    probe = common.verify_output(str(output))
    output_video = probe.get("video") or {}
    if output_video.get("codec") != "h264" or output_video.get("width") != target_width or output_video.get("height") != target_height or _rotation(output_stream, output_video.get("rotation", 0)) != 0 or bool(probe.get("audio")) != bool(audio):
        raise ValueError("preview output geometry or streams mismatch")
    audio_evidence = None
    if audio:
        output_audio = probe["audio"]
        if output_audio.get("codec") != "aac" or output_audio.get("sample_rate") != sr or output_audio.get("channels") != channels:
            raise ValueError("preview audio profile mismatch")
        output_first, decoded = _scan_audio(common, str(output), sr)
        expected_samples = finish - begin
        if output_first != 0 or not expected_samples <= decoded < expected_samples + 1024:
            raise ValueError("preview audio is shifted or truncated")
        audio_evidence = {"sampleRate": sr, "channels": channels, "inputSamples": expected_samples, "decodedSamples": decoded}
    measured_gap = max(durations + [b - a for a, b in zip(times, times[1:])])
    duration_tolerance = max(measured_gap, Fraction(1024, sr) if audio else Fraction(0)) + Fraction(2, 1000)
    if not isinstance(probe.get("duration"), (int, float)) or not math.isfinite(probe["duration"]) or abs(Fraction(str(probe["duration"])) - (end - start)) > duration_tolerance:
        raise ValueError("preview duration exceeds measured quantization")
    if _hash_stable(source, original, 256 * 1024 * 1024) != input_digest:
        raise ValueError("preview input changed")
    output_digest = _hash_stable(output, published, MAX_BYTES)
    evidence = {"version": 2, "sourceStartMs": round(start * 1000), "sourceEndMs": round(end * 1000),
        "firstFrameMs": float(selected[0] * 1000), "lastFrameMs": float(selected[-1] * 1000), "frameCount": len(selected),
        "frameRate": float(1 / measured_gap), "inputSha256": input_digest, "outputSha256": output_digest,
        "sourceTimesMs": [float(time * 1000) for time in selected], "outputTimesMs": [float(time * 1000) for time in output_times],
        "timeBaseToleranceMs": float(tolerance * 1000), "durationToleranceMs": float(duration_tolerance * 1000),
        "width": target_width, "height": target_height, "sourceRotation": rotation}
    if audio_evidence:
        evidence["audio"], evidence["audioPadding"] = audio_evidence, padding
    payload = {"status": "completed", "output": str(output), "probe": probe, "boundedPreview": evidence}
    if os.name == "posix":
        payload["publication"] = {"version": 1, "scheme": "posix-dev-inode", "device": str(published.st_dev), "inode": str(published.st_ino)}
    return {"content": [{"type": "text", "text": json.dumps(payload)}], "structuredContent": payload}
