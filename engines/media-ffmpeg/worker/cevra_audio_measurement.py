"""Read-only native audio evidence; no quality verdict, mastering, or output file.

Fixed native branches measure the unchanged signal, drained 4x true peak, and
exact full-scale predicates. Only O(channels) metadata is retained in Python.
"""
from __future__ import annotations

import json
import math
import os
import re
from pathlib import Path
from typing import Any

import cevra_job_control as jobs
from cevra_streaming_process import reduce_lines

METHOD = "cevra.audio-measurement.native-swr4.v1"
MAX_MS = 7 * 24 * 60 * 60 * 1000
TRUE_PEAK_GUARD_MS = 50
# Covers the pinned meter's common native-rate range, with integral 100 ms hops.
RATES = {8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000, 88200, 96000, 176400, 192000}
# ebur128 uses sample_rate / 10 (integer) internally. Do not claim exact 100 ms
# window semantics for rates which cannot represent that hop.
RATES = {rate for rate in RATES if rate % 10 == 0}


class MeasurementError(ValueError):
    def __init__(self, code: str):
        super().__init__(f"AUDIO_MEASUREMENT_{code}")


def integer(value: Any, maximum: int) -> int:
    if type(value) is not int or not 0 <= value <= maximum:
        raise MeasurementError("INVALID_REQUEST")
    return value


def validate(args: dict[str, Any]) -> None:
    if set(args) != {"version", "input", "stream_index", "start_ms", "end_ms"} or type(args.get("version")) is not int or args["version"] != 1:
        raise MeasurementError("INVALID_REQUEST")
    path = args["input"]
    if not isinstance(path, str) or not path or len(path) > 32768 or any(c in path for c in "\x00\r\n") or not Path(path).is_absolute():
        raise MeasurementError("INVALID_REQUEST")
    integer(args["stream_index"], 2**31 - 1)
    start = integer(args["start_ms"], MAX_MS)
    end = integer(args["end_ms"], MAX_MS)
    if end <= start:
        raise MeasurementError("INVALID_REQUEST")


def sample_boundary(ms: int, rate: int) -> int:
    return (ms * rate + 999) // 1000


def graph(index: int, rate: int, channels: int, start: int, end: int,
          guard_start: int, guard_end: int) -> str:
    layout = "mono" if channels == 1 else "stereo"
    raw_stats = "Peak_level+RMS_level+Number_of_NaNs+Number_of_Infs"
    def stats(measures: str, label: str) -> str:
        return (f"astats=metadata=1:reset=0:measure_perchannel={measures}:"
                f"measure_overall=Number_of_samples,ametadata=mode=add:key=cevra.branch:value={label},"
                "ametadata=mode=print:file='pipe\\:1':direct=1")
    # 0 = exact zero; 1 = nonzero; 3 = reaches full scale; 7 = exceeds it.
    # This predicate runs in native double precision, BEFORE any text rounding.
    flags = "|".join(f"not(eq(val({ch}),0))+2*gte(abs(val({ch})),1)+4*gt(abs(val({ch})),1)" for ch in range(channels))
    peak_start = (start - guard_start) * 4
    peak_end = peak_start + (end - start) * 4
    return (
        f"[0:{index}]asettb=1/{rate},aformat=sample_fmts=dbl,asplit=2[core][context];"
        f"[core]atrim=start_pts={start}:end_pts={end},"
        "aformat=sample_fmts=dbl,ametadata=mode=delete," + stats("none", "coverage") + ","
        "ametadata=mode=delete,asetpts=N/SR/TB,asplit=2[r][f];"
        "[r]ebur128=metadata=1:peak=none:dualmono=false," + stats(raw_stats, "raw") + "[measured];"
        f"[f]aeval='{flags}':c={layout}," + stats("Max_level", "scale") + ",anullsink"
        f";[context]atrim=start_pts={guard_start}:end_pts={guard_end},asetpts=N/SR/TB,"
        f"aresample={rate * 4}:resampler=swr:filter_size=32:phase_shift=10:exact_rational=1:linear_interp=1,"
        f"atrim=start_sample={peak_start}:end_sample={peak_end},asetpts=N/SR/TB,"
        + stats("Peak_level+Number_of_NaNs+Number_of_Infs", "truepeak") + ",anullsink"
    )


class Reduction:
    def __init__(self, rate: int, channels: int, start: int, end: int):
        self.rate, self.channels, self.start, self.end = rate, channels, start, end
        self.next_pts = start
        self.sample_frames = 0
        self.frames: dict[str, dict[str, str]] = {k: {} for k in ("raw", "truepeak", "scale")}
        self.latest: dict[str, dict[str, str]] = {}
        self.pending: dict[str, str] = {}
        self.pending_pts: int | None = None
        self.integrated: float | None = None
        self.eligible = 0
        self.gate_ambiguous = False
        self.upper_range = False
        self.short_max: float | None = None
        self.short_count = 0

    def consume(self, line: str) -> None:
        if line.startswith("frame:"):
            self.flush()
            match = re.fullmatch(r"frame:\d+\s+pts:(-?\d+)\s+pts_time:\S+", line)
            if match is None:
                raise MeasurementError("INVALID_METADATA")
            self.pending_pts = int(match[1])
            return
        if line.startswith(("lavfi.", "cevra.branch=")) and "=" in line:
            key, value = line.split("=", 1)
            if key in self.pending or len(self.pending) >= 40 or self.pending_pts is None:
                raise MeasurementError("INVALID_METADATA")
            self.pending[key] = value

    def flush(self) -> None:
        if self.pending_pts is None:
            return
        frame, pts = self.pending, self.pending_pts
        self.pending, self.pending_pts = {}, None
        label = frame.pop("cevra.branch", None)
        if label == "coverage":
            cumulative = self.number(frame, "lavfi.astats.Overall.Number_of_samples")
            count = cumulative - self.sample_frames
            if not cumulative.is_integer() or pts != self.next_pts or count <= 0 or pts + count > self.end:
                raise MeasurementError("INCOMPLETE_COVERAGE")
            self.next_pts += int(count)
            self.sample_frames = int(cumulative)
        elif label in self.frames:
            self.frames[label] = frame
            self.finish_frame(label)
        else:
            raise MeasurementError("INVALID_METADATA")

    def finish_frame(self, label: str) -> None:
        frame = self.frames[label]
        if not frame:
            return
        self.latest[label] = frame
        if label != "raw" or "lavfi.r128.M" not in frame:
            return
        count = self.number(frame, "lavfi.astats.Overall.Number_of_samples")
        momentary = self.r128_window(frame, "lavfi.r128.M")
        if momentary is not None and count >= self.rate * 0.4:
            if momentary > -70:
                self.eligible += 1
                self.integrated = self.number(frame, "lavfi.r128.I")
            if momentary == -70:
                self.gate_ambiguous = True
            if momentary >= 9.999:
                self.upper_range = True  # native integrated histogram ends at +10 LUFS
        if count >= self.rate * 3:
            short = self.r128_window(frame, "lavfi.r128.S")
            if short is not None:
                floor = -0.691 + 10 * math.log10(1e-12 / (3 * self.rate))
                if short > floor + 0.001:
                    self.short_max = short if self.short_max is None else max(self.short_max, short)
                    self.short_count += 1

    @staticmethod
    def r128_window(frame: dict[str, str], key: str) -> float | None:
        """Ignore only FFmpeg's known negative-residue NaN in M/S windows.

        Infinity, malformed metadata, and non-finite decoded samples remain
        fail-closed through this parser and astats respectively.
        """
        try:
            value = float(frame[key])
        except (KeyError, ValueError):
            raise MeasurementError("INVALID_METADATA") from None
        if math.isnan(value):
            return None
        if not math.isfinite(value):
            raise MeasurementError("INVALID_METADATA")
        return value

    @staticmethod
    def number(frame: dict[str, str], key: str) -> float:
        try:
            value = float(frame[key])
        except (KeyError, ValueError):
            raise MeasurementError("INVALID_METADATA") from None
        if not math.isfinite(value):
            raise MeasurementError("INVALID_METADATA")
        return value

    def result(self) -> dict[str, Any]:
        self.flush()
        expected = self.end - self.start
        if self.sample_frames != expected or self.next_pts != self.end:
            raise MeasurementError("INCOMPLETE_COVERAGE")
        for label, multiplier in (("raw", 1), ("scale", 1), ("truepeak", 4)):
            if self.number(self.latest.get(label, {}), "lavfi.astats.Overall.Number_of_samples") != expected * multiplier:
                raise MeasurementError("INCOMPLETE_COLLECTION")
        raw, peaks, flags = (self.latest[k] for k in ("raw", "truepeak", "scale"))
        channels = []
        true_peaks = []
        for ch in range(1, self.channels + 1):
            prefix = f"lavfi.astats.{ch}."
            for key in ("Number of NaNs", "Number of Infs"):
                if self.number(raw, prefix + key) != 0:
                    raise MeasurementError("NON_FINITE_SAMPLES")
                if self.number(peaks, prefix + key) != 0:
                    raise MeasurementError("NON_FINITE_SAMPLES")
            bits = self.number(flags, prefix + "Max_level")
            if bits not in (0, 1, 3, 7):
                raise MeasurementError("INVALID_METADATA")
            silence = bits == 0
            def core_amplitude(frame: dict[str, str], key: str) -> float:
                if silence and frame.get(prefix + key) == "-inf":
                    return 0.0
                db = self.number(frame, prefix + key)
                value = 10 ** (db / 20)
                if not math.isfinite(value) or value <= 0 or silence:
                    raise MeasurementError("NUMERICAL_RANGE")
                return value
            def true_peak_amplitude(frame: dict[str, str], key: str) -> float:
                # Digital silence describes the requested native samples only.
                # Real guard samples may contribute to the band-limited
                # reconstruction inside that interval, so parse SWR4 evidence
                # independently from the core-silence predicate.
                if frame.get(prefix + key) == "-inf":
                    return 0.0
                db = self.number(frame, prefix + key)
                value = 10 ** (db / 20)
                if not math.isfinite(value) or value <= 0:
                    raise MeasurementError("NUMERICAL_RANGE")
                return value
            channels.append({"channelIndex": ch - 1, "rmsLinear": core_amplitude(raw, "RMS_level"),
                             "samplePeakLinear": core_amplitude(raw, "Peak_level"),
                             "reachesFullScale": bits >= 3, "exceedsFullScale": bits == 7})
            true_peaks.append(true_peak_amplitude(peaks, "Peak_level"))
        silent = all(ch["samplePeakLinear"] == 0 for ch in channels)
        def unavailable(reason: str) -> dict[str, str]:
            return {"status": "unavailable", "reason": reason}
        if silent:
            integrated = unavailable("digital-silence")
        elif expected < self.rate * 0.4:
            integrated = unavailable("insufficient-duration")
        elif self.upper_range or self.gate_ambiguous:
            integrated = unavailable("meter-range")
        elif self.integrated is None or self.integrated <= -70:
            integrated = unavailable("no-eligible-blocks")
        else:
            integrated = {"status": "available", "value": self.integrated}
        if silent:
            short = unavailable("digital-silence")
        elif expected < self.rate * 3:
            short = unavailable("insufficient-duration")
        elif self.short_max is None:
            short = unavailable("meter-range")
        else:
            short = {"status": "available", "value": self.short_max}
        return {"sampleFrames": self.sample_frames, "channels": channels,
                "truePeakLinear": max(true_peaks), "integratedLufs": integrated,
                "shortTermMaxLufs": short, "shortTermValidObservations": 0 if silent else self.short_count}


def run(common: Any, args: dict[str, Any]) -> dict[str, Any]:
    from cevra_native_tools import _absolute_regular_input, _audio_coverage_ms
    validate(args)
    try:
        path = _absolute_regular_input(args["input"], "measurement input")
    except (ValueError, OSError):
        raise MeasurementError("INVALID_STREAM") from None
    before = path.stat()
    probe_text: list[str] = []
    probe_bytes = 0
    def collect_probe(line: str) -> None:
        nonlocal probe_bytes
        probe_bytes += len(line.encode("utf-8"))
        if probe_bytes > 16384:
            raise MeasurementError("INVALID_STREAM")
        probe_text.append(line)
    ffmpeg = common.ffmpeg_base()[0]
    ffprobe = str(Path(ffmpeg).with_name("ffprobe.exe" if str(ffmpeg).endswith(".exe") else "ffprobe"))
    try:
        reduce_lines([ffprobe, "-v", "error", "-select_streams", str(args["stream_index"]),
                      "-show_entries", "stream=index,codec_type,sample_rate,channels,channel_layout,start_pts,start_time,time_base,duration_ts,duration:stream_tags=DURATION",
                      "-of", "json", str(path)], collect_probe, timeout=30)
    except MeasurementError:
        raise
    except TimeoutError:
        raise MeasurementError("TIMEOUT") from None
    except (RuntimeError, OSError):
        raise MeasurementError("INVALID_STREAM") from None
    try:
        streams = json.loads("\n".join(probe_text))["streams"]
        audio = streams[0]
        tags = audio.pop("tags", None)
        if tags is not None:
            if not isinstance(tags, dict) or not set(tags).issubset({"DURATION"}):
                raise ValueError()
            if "DURATION" in tags:
                if not isinstance(tags["DURATION"], str):
                    raise ValueError()
                audio["duration_tag"] = tags["DURATION"]
        rate = int(audio["sample_rate"])
        channels = audio["channels"]
        if len(streams) != 1 or audio["index"] != args["stream_index"] or audio["codec_type"] != "audio":
            raise ValueError()
    except (KeyError, IndexError, ValueError, TypeError):
        raise MeasurementError("INVALID_STREAM") from None
    if rate not in RATES or type(channels) is not int or channels not in (1, 2) or audio.get("channel_layout") not in (None, "mono" if channels == 1 else "stereo"):
        raise MeasurementError("UNSUPPORTED_STREAM")
    try:
        coverage_start, coverage_end = _audio_coverage_ms(audio, "measurement")
        # Preserve source PTS rather than silently shifting late-start streams.
        origin_samples = coverage_start * rate / 1000
        if origin_samples.denominator != 1:
            raise ValueError()
        coverage_start_sample = coverage_start * rate / 1000
        coverage_end_sample = coverage_end * rate / 1000
        if args["start_ms"] < coverage_start or args["end_ms"] > coverage_end:
            raise ValueError()
    except (ValueError, KeyError, ZeroDivisionError):
        raise MeasurementError("UNPROVEN_COVERAGE") from None
    start, end = (sample_boundary(args[k], rate) for k in ("start_ms", "end_ms"))
    # Fifty milliseconds exceeds the fixed SWR filter support by a wide margin.
    # Real context is clipped to proven stream coverage; no synthetic padding is
    # invented when the request touches a genuine source boundary.
    guard = rate * TRUE_PEAK_GUARD_MS // 1000
    guard_start = max(math.ceil(coverage_start_sample), start - guard)
    guard_end = min(math.floor(coverage_end_sample), end + guard)
    if guard_start > start or guard_end < end:
        raise MeasurementError("UNPROVEN_COVERAGE")
    reduction = Reduction(rate, channels, start, end)
    # Bounded input preroll; decoding only the selected audio stream. Contiguous
    # actual PTS + frame counts after trim independently prove sample coverage.
    seek_ms = max(0, args["start_ms"] - 1000)
    command = [ffmpeg, "-hide_banner", "-nostdin", "-nostats", "-v", "error", "-xerror",
               "-filter_complex_threads", "1", "-threads", "1", "-copyts",
               *(["-seek_timestamp", "1", "-ss", f"{seek_ms / 1000:.3f}", "-noaccurate_seek"] if seek_ms else []),
               "-i", str(path), "-filter_complex",
               graph(args["stream_index"], rate, channels, start, end, guard_start, guard_end),
               "-map", "[measured]", "-map_metadata", "-1", "-vn", "-sn", "-dn", "-c:a", "pcm_f64le", "-f", "null", "-"]
    timeout = float(os.environ.get("CEVRA_MEDIA_RENDER_TIMEOUT_SECONDS", "0"))
    if not math.isfinite(timeout) or timeout < 0:
        raise MeasurementError("INVALID_REQUEST")
    try:
        reduce_lines(command, reduction.consume, timeout=timeout or None)
    except MeasurementError:
        raise
    except TimeoutError:
        raise MeasurementError("TIMEOUT") from None
    except RuntimeError:
        raise MeasurementError("DECODE_OR_COLLECTION_FAILED") from None
    evidence = reduction.result()
    after = path.stat()
    if any(getattr(before, k) != getattr(after, k) for k in ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")):
        raise MeasurementError("INPUT_CHANGED")
    return {"version": 1, "method": METHOD, "executionId": jobs.active_job_id(),
            "inputUri": args["input"], "streamIndex": args["stream_index"],
            "startMs": args["start_ms"], "endMs": args["end_ms"],
            "sampleRate": rate, "channelLayout": "mono" if channels == 1 else "stereo",
            "coverageStartSample": start, "coverageEndSample": end, "complete": True, **evidence}
