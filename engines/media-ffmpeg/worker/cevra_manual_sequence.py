"""Closed CFR30 original-master renderer; no caller-authored commands or filters.

Original/source clock and canonical program clock are distinct. fps rounds source
PTS to the 30-Hz grid with FFmpeg's explicit near rule, before trimming indices.
Publication accounting remains through Host admission or uncertain-state recovery.
Post-publication failures preserve the public destination rather than path-unlink it.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import tempfile
from fractions import Fraction
from pathlib import Path
from typing import Any

import cevra_bounded_preview as inspection
import cevra_job_control as jobs
from cevra_streaming_process import reduce_lines

CFR30_SOURCE_SAMPLER = "fps=30:start_time=0:round=near:eof_action=pass"
SAMPLING_POLICY = "source-pts-fps30-near-v1"
MAX_ITEMS = 2048
MAX_FRAMES = 7 * 24 * 60 * 60 * 30
SOURCE_BYTES = 256 * 1024 * 1024
OWNED_BYTES = 2 * 1024 * 1024 * 1024
COLOUR_KEYS = ("color_primaries", "color_transfer", "color_space", "color_range", "pix_fmt")


def _closed(value: Any, keys: set[str], label: str) -> dict:
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError(f"{label} must contain exactly its closed fields")
    return value


def _integer(value: Any, minimum: int, maximum: int, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not minimum <= value <= maximum:
        raise ValueError(f"{label} is outside its integer bound")
    return value


def validate(args: dict, preview: bool) -> tuple[list[dict], int]:
    _closed(args, {"version", "items", "output", "owned_workspace"}, "manual operation")
    if args["version"] not in ((1, 2) if preview else (1,)) or isinstance(args["version"], bool):
        raise ValueError("manual operation version is invalid")
    items = args["items"]
    if not isinstance(items, list) or not 1 <= len(items) <= (1 if preview and args["version"] == 1 else MAX_ITEMS):
        raise ValueError("manual item count exceeds its bound")
    identities, total = {}, 0
    for item in items:
        _closed(item, {"input", "source_start_frame", "source_end_frame", "source_content", "audio_selection"}, "manual item")
        if item["audio_selection"] != "single-source-stream":
            raise ValueError("manual audio selection requires explicit single-source-stream admission")
        _path(item["input"])
        start = _integer(item["source_start_frame"], 0, MAX_FRAMES, "source start frame")
        end = _integer(item["source_end_frame"], 1, MAX_FRAMES, "source end frame")
        if end <= start:
            raise ValueError("manual source frame range must be positive")
        content = _closed(item["source_content"], {"sha256", "size_bytes"}, "source content")
        if not isinstance(content["sha256"], str) or not re.fullmatch("[a-f0-9]{64}", content["sha256"]):
            raise ValueError("manual source SHA-256 is invalid")
        _integer(content["size_bytes"], 1, 2**53 - 1, "source size")
        identity = (content["sha256"], content["size_bytes"])
        if item["input"] in identities and identities[item["input"]] != identity:
            raise ValueError("repeated original identity is inconsistent")
        identities[item["input"]] = identity
        total += end - start
    _integer(total, 1, MAX_FRAMES, "program frames")
    if len(identities) > 128:
        raise ValueError("manual sequence has too many originals")
    if sum(size for _, size in identities.values()) > OWNED_BYTES:
        raise ValueError("mandatory original copies exceed the owned job disk requirement")
    if total * 1600 * 8 > 0xFFFFFFFF - 256:
        raise ValueError("manual PCM exceeds the existing WAV data boundary")
    return items, total


def _path(raw: Any) -> Path:
    if not isinstance(raw, str) or not raw or len(raw) > 32768 or any(c in raw for c in "\0\r\n"):
        raise ValueError("manual path is invalid")
    path = Path(raw)
    if not path.is_absolute():
        raise ValueError("manual path must be absolute")
    return path


def _workspace(raw: str, output: Path, sources: list[Path]) -> tuple[Path, os.stat_result]:
    root = _path(raw)
    metadata = root.lstat()
    if os.name != "posix" or not stat.S_ISDIR(metadata.st_mode) or root.is_symlink() or root.resolve() != root or stat.S_IMODE(metadata.st_mode) != 0o700:
        raise ValueError("manual workspace must be a canonical private POSIX 0700 directory")
    if root.parent != output.parent.resolve() or output.is_relative_to(root) or metadata.st_dev != output.parent.stat().st_dev:
        raise ValueError("manual workspace must be separate from final output under the same destination parent")
    for source in sources:
        canonical = source.resolve()
        if canonical == output.resolve(strict=False) or canonical.is_relative_to(root):
            raise ValueError("manual workspace/output overlaps an original")
    return root, metadata


def _root_current(root: Path, expected: os.stat_result) -> None:
    current = root.lstat()
    if not stat.S_ISDIR(current.st_mode) or (current.st_dev, current.st_ino) != (expected.st_dev, expected.st_ino) or root.is_symlink() or stat.S_IMODE(current.st_mode) != 0o700:
        raise RuntimeError("manual owned workspace identity changed")


def _owned_disk_bytes(root: Path, expected: os.stat_result, prospective_account: Path | None = None) -> tuple[int, int]:
    """Quiescent pre-publication admission; not a quota on earlier writes.

    Count each name, including hardlinks, like the Host watchdog. The projected
    accounting link adds the candidate's logical and allocated size once more.
    Directory descriptors prevent following a replaced directory or symlink.
    """
    _root_current(root, expected)
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    logical, allocated, entries = 0, 0, 0

    def stable(metadata: os.stat_result) -> tuple:
        return (metadata.st_dev, metadata.st_ino, metadata.st_mode, metadata.st_size,
                metadata.st_mtime_ns, metadata.st_ctime_ns, metadata.st_blocks)

    def visit(descriptor: int, depth: int) -> None:
        nonlocal logical, allocated, entries
        if depth > 32:
            raise RuntimeError("manual owned disk observation exceeds depth bound")
        initial = os.fstat(descriptor)
        if not stat.S_ISDIR(initial.st_mode) or initial.st_dev != expected.st_dev:
            raise RuntimeError("manual owned disk directory identity changed")
        with os.scandir(descriptor) as contents:
            for entry in contents:
                entries += 1
                if entries > 100_000:
                    raise RuntimeError("manual owned disk observation exceeds entry bound")
                metadata = entry.stat(follow_symlinks=False)
                if metadata.st_dev != expected.st_dev:
                    raise RuntimeError("manual owned disk entry crossed its filesystem")
                if stat.S_ISDIR(metadata.st_mode):
                    child = os.open(entry.name, flags, dir_fd=descriptor)
                    try:
                        if stable(os.fstat(child)) != stable(metadata):
                            raise RuntimeError("manual owned disk directory changed during observation")
                        visit(child, depth + 1)
                    finally:
                        os.close(child)
                elif stat.S_ISREG(metadata.st_mode):
                    if metadata.st_size < 0 or metadata.st_blocks < 0:
                        raise RuntimeError("manual owned disk file accounting is invalid")
                    logical += metadata.st_size
                    allocated += metadata.st_blocks * 512
                else:
                    raise RuntimeError("manual owned disk observation rejects symlinks and special files")
                if stable(os.stat(entry.name, dir_fd=descriptor, follow_symlinks=False)) != stable(metadata):
                    raise RuntimeError("manual owned disk entry changed during observation")
        if stable(os.fstat(descriptor)) != stable(initial):
            raise RuntimeError("manual owned disk directory changed during observation")

    descriptor = os.open(root, flags)
    try:
        current = os.fstat(descriptor)
        if (current.st_dev, current.st_ino) != (expected.st_dev, expected.st_ino):
            raise RuntimeError("manual owned workspace identity changed")
        visit(descriptor, 0)
    finally:
        os.close(descriptor)
    if prospective_account is not None:
        if not prospective_account.is_relative_to(root):
            raise RuntimeError("manual accounting candidate escaped its workspace")
        metadata = prospective_account.lstat()
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_dev != expected.st_dev or metadata.st_size < 0 or metadata.st_blocks < 0:
            raise RuntimeError("manual accounting candidate is invalid")
        logical += metadata.st_size
        allocated += metadata.st_blocks * 512
    _root_current(root, expected)
    return logical, allocated


def _admit_owned_disk(root: Path, expected: os.stat_result, prospective_account: Path | None = None) -> None:
    if max(_owned_disk_bytes(root, expected, prospective_account)) > OWNED_BYTES:
        raise jobs.LogicalFileBudgetError()


class _LogicalBudget:
    """One job's closed producers; logical reservations, not allocated-block quotas."""
    def __init__(self, root: Path, expected: os.stat_result, maximum: int):
        self.root, self.expected, self.maximum = root, expected, maximum
        self.baseline = _owned_disk_bytes(root, expected)[0]
        self.charges: dict[Path, tuple[int, int]] = {}
        self.peak_reserved = self.baseline
        self.producers = 0
        if self.baseline > maximum:
            raise jobs.LogicalFileBudgetError()

    @property
    def remaining(self) -> int:
        return self.maximum - self.baseline - sum(size * names for size, names in self.charges.values())

    def _path_current(self, path: Path) -> None:
        _root_current(self.root, self.expected)
        if not path.is_relative_to(self.root) or path.parent.resolve() != path.parent or path.parent.stat().st_dev != self.expected.st_dev:
            raise RuntimeError("MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED")

    def reserve(self, path: Path, maximum: int, *, names: int = 1) -> None:
        self._path_current(path)
        if path in self.charges or path.exists() or path.is_symlink() or not isinstance(maximum, int) or isinstance(maximum, bool) or maximum < 1 or names not in (1, 2):
            raise RuntimeError("MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED")
        if maximum * names > self.remaining:
            raise jobs.LogicalFileBudgetError()
        self.charges[path] = (maximum, names)
        self.peak_reserved = max(self.peak_reserved, self.maximum - self.remaining)

    def reserve_available(self, path: Path, *, names: int = 1) -> None:
        available = self.remaining // names
        if available < 1:
            raise jobs.LogicalFileBudgetError()
        self.reserve(path, available, names=names)

    def check_write(self, path: Path, offset: int, count: int) -> None:
        self._path_current(path)
        if path not in self.charges or offset < 0 or count < 0 or offset + count > self.charges[path][0]:
            raise jobs.LogicalFileBudgetError()

    def settle(self, path: Path) -> None:
        self._path_current(path)
        metadata = path.lstat()
        maximum, names = self.charges[path]
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_dev != self.expected.st_dev:
            raise RuntimeError("MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED")
        if metadata.st_size > maximum:
            raise jobs.LogicalFileBudgetError()
        self.charges[path] = (metadata.st_size, names)

    def write_text(self, path: Path, text: str) -> None:
        data = text.encode("utf-8")
        self.reserve(path, len(data))
        self.check_write(path, 0, len(data))
        self.producers += 1
        with path.open("xb") as handle:
            if handle.write(data) != len(data):
                raise RuntimeError("manual instruction write was incomplete")
        self.settle(path)

    def run_native(self, common: Any, command: list[str], *, names: int = 1, **kwargs):
        path = Path(command[-1])
        if path not in self.charges:
            self.reserve_available(path, names=names)
        elif self.charges[path][1] != names:
            raise RuntimeError("MEDIA_RENDER_RESOURCE_OBSERVATION_FAILED")
        maximum = self.charges[path][0]
        self._path_current(path)
        self.producers += 1
        with jobs.native_file_budget(maximum, path.parent) as scope:
            try:
                result = common.run(command, **kwargs)
            except BaseException:
                scope.assert_not_exceeded()
                raise
            scope.assert_not_exceeded()
        self.settle(path)
        return result

    def evidence(self) -> dict:
        return {"version": 1, "enforcement": "reserved-logical-space", "budgetBytes": self.maximum,
                "peakReservedBytes": self.peak_reserved, "producerCount": self.producers,
                "accountingOverlapReserved": True, "allocatedBlockQuota": False}


class _BudgetMuxCommon:
    """Only the existing mux producer writes through this internal projection."""
    def __init__(self, common: Any, budget: _LogicalBudget):
        self.common, self.budget = common, budget

    def __getattr__(self, name):
        return getattr(self.common, name)

    def run(self, command, **kwargs):
        if command == [self.common.require_tool("ffmpeg"), "-hide_banner", "-encoders"]:
            return self.common.run(command, **kwargs)
        # Candidate and retained accounting name coexist before publication.
        return self.budget.run_native(self.common, command, names=2, **kwargs)


def _seal(source: Path, target: Path, content: dict, budget: _LogicalBudget | None = None) -> os.stat_result:
    initial = source.lstat()
    if content["size_bytes"] > SOURCE_BYTES or not stat.S_ISREG(initial.st_mode) or initial.st_size != content["size_bytes"]:
        raise ValueError("manual original is outside existing admitted source byte bounds")
    descriptor = os.open(source, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
    digest, copied = hashlib.sha256(), 0
    with os.fdopen(descriptor, "rb") as original, target.open("xb") as private:
        if inspection._stamp(os.fstat(original.fileno())) != inspection._stamp(initial):
            raise RuntimeError("manual original changed before sealing")
        while chunk := original.read(min(65536, content["size_bytes"] - copied + 1)):
            jobs.check_cancelled()
            if copied + len(chunk) > content["size_bytes"] or copied + len(chunk) > SOURCE_BYTES:
                raise RuntimeError("manual original grew beyond its sealed content bound")
            if budget is not None:
                budget.check_write(target, copied, len(chunk))
            digest.update(chunk); private.write(chunk); copied += len(chunk)
        if copied != content["size_bytes"]:
            raise RuntimeError("manual original ended before its sealed content bound")
        if inspection._stamp(os.fstat(original.fileno())) != inspection._stamp(initial) or inspection._stamp(source.lstat()) != inspection._stamp(initial):
            raise RuntimeError("manual original changed while sealing")
    if digest.hexdigest() != content["sha256"] or inspection._hash_stable(target, target.lstat(), SOURCE_BYTES) != content["sha256"]:
        raise RuntimeError("manual original/sealed-copy SHA-256 mismatch")
    return initial


def _streams(common: Any, path: Path) -> list[dict]:
    streams: list[dict] = []; collected = 0
    integers = {"index", "channels", "start_pts", "duration_ts", "width", "height"}
    def consume(line: str) -> None:
        nonlocal collected
        collected += len(line.encode("utf-8"))
        if collected > 256 * 1024 or len(streams) >= 128:
            raise ValueError("manual stream evidence exceeds its collection boundary")
        values = _fields(line)
        if not values or "index" not in values or "codec_type" not in values:
            raise ValueError("manual stream descriptor is unavailable")
        streams.append({key: int(value) if key in integers and re.fullmatch(r"-?[0-9]+", value) else value for key, value in values.items()})
    fields = "index,codec_type,codec_name,sample_rate,channels,channel_layout,time_base,duration_ts,start_pts,nb_frames,width,height,pix_fmt,avg_frame_rate,r_frame_rate,color_space,color_transfer,color_primaries,color_range"
    reduce_lines([common.require_tool("ffprobe"), "-v", "error", "-show_streams", "-show_entries", "stream=" + fields,
                  "-of", "compact=p=0:nk=0", str(path)], consume, timeout=30)
    if not streams:
        raise ValueError("manual stream evidence is unavailable")
    return streams


def _stream_duration(stream: dict) -> Fraction:
    ticks = _integer(stream.get("duration_ts"), 1, 2**53 - 1, "stream duration ticks")
    tick = Fraction(stream["time_base"])
    if tick <= 0:
        raise ValueError("stream time base is invalid")
    return ticks * tick


def _fields(line: str) -> dict[str, str]:
    aliases = {"side_datum/skip_samples:skip_samples": "skip_samples",
               "side_datum/skip_samples:discard_padding": "discard_padding"}
    values: dict[str, str] = {}
    for piece in line.split("|"):
        if "=" not in piece:
            continue
        key, value = piece.split("=", 1)
        key = aliases.get(key, key)
        if key in values:
            raise ValueError("manual compact evidence contains duplicate field names")
        values[key] = value
    return values


def _video_clock(common: Any, path: Path, expected_frames: int, width: int, height: int) -> Fraction:
    streams = [s for s in _streams(common, path) if s.get("codec_type") == "video"]
    if len(streams) != 1:
        raise RuntimeError("manual video must contain exactly one video stream")
    stream = streams[0]
    if stream.get("codec_name") != "h264" or stream.get("width") != width or stream.get("height") != height or stream.get("pix_fmt") != "yuv420p" \
            or Fraction(stream.get("avg_frame_rate", "0")) != 30 or Fraction(stream.get("r_frame_rate", "0")) != 30:
        raise RuntimeError("manual encoded video profile postcondition failed")
    tick, count = Fraction(stream["time_base"]), 0
    def consume(line: str) -> None:
        nonlocal count
        values = _fields(line)
        if not values:
            return
        if "best_effort_timestamp" not in values or "duration" not in values:
            raise RuntimeError("manual decoded frame timing is missing")
        pts, duration = int(values["best_effort_timestamp"]), int(values["duration"])
        if pts * tick != Fraction(count, 30) or duration * tick != Fraction(1, 30) or count >= expected_frames:
            raise RuntimeError("manual decoded frame grid/count postcondition failed")
        count += 1
    reduce_lines([common.require_tool("ffprobe"), "-v", "error", "-threads", "2", "-select_streams", "v:0", "-show_frames", "-show_entries", "frame=best_effort_timestamp,duration", "-of", "compact=p=0:nk=0", str(path)], consume, timeout=None)
    duration = _stream_duration(stream)
    if count != expected_frames or int(stream.get("nb_frames", "0")) != count or duration != Fraction(expected_frames, 30):
        raise RuntimeError("manual video terminal coverage/count is incomplete")
    return duration


def _audio_clock(common: Any, path: Path, expected_samples: int, channels: int) -> Fraction:
    streams = [s for s in _streams(common, path) if s.get("codec_type") == "audio"]
    if len(streams) != 1:
        raise RuntimeError("manual output must contain exactly one audio stream")
    stream = streams[0]
    if stream.get("codec_name") != "aac" or int(stream.get("sample_rate", "0")) != 48000 or stream.get("channels") != channels:
        raise RuntimeError("manual AAC profile postcondition failed")
    tick = Fraction(stream["time_base"]); end, packets, terminal_padding, last_duration = None, 0, 0, None
    def consume(line: str) -> None:
        nonlocal end, packets, terminal_padding, last_duration
        values = _fields(line)
        if not values:
            return
        if "pts" not in values or "duration" not in values:
            raise RuntimeError("manual AAC packet timing is missing")
        pts, duration = int(values["pts"]) * tick * 48000, int(values["duration"]) * tick * 48000
        if pts.denominator != 1 or duration.denominator != 1 or not 0 < duration <= 1024:
            raise RuntimeError("manual AAC sample clock is invalid")
        skip = int(values.get("skip_samples", "0"))
        discard = int(values.get("discard_padding", "0"))
        if skip < 0 or discard < 0 or discard > 1023 or skip > duration or terminal_padding or (packets and last_duration != 1024):
            raise RuntimeError("manual AAC skip/discard padding is invalid or nonterminal")
        if packets == 0:
            if pts + skip != 0 or not 0 <= skip <= 1024:
                raise RuntimeError("manual AAC priming/origin is unproved")
        elif pts != end or skip:
            raise RuntimeError("manual AAC has a packet gap/overlap or unexpected skip")
        end = pts + duration; terminal_padding = discard; last_duration = duration; packets += 1
    reduce_lines([common.require_tool("ffprobe"), "-v", "error", "-select_streams", "a:0", "-show_packets", "-show_entries", "packet=pts,duration:packet_side_data=skip_samples,discard_padding", "-of", "compact=p=0:nk=0", str(path)], consume, timeout=None)
    duration = _stream_duration(stream)
    # FFprobe 9 may already clip packet.duration to the MP4 visible interval
    # while retaining discard_padding for the coded AAC 1024-sample frame.
    # Older packet representations may instead expose its full coded duration.
    # Bind both representations to the exact measured visible stream endpoint;
    # never subtract the same terminal discard twice.
    clipped_terminal = end == expected_samples and (terminal_padding == 0 or last_duration + terminal_padding == 1024)
    raw_terminal = last_duration == 1024 and terminal_padding > 0 and end - terminal_padding == expected_samples
    if not packets or not (clipped_terminal or raw_terminal) or duration * 48000 != expected_samples or int(stream.get("start_pts", 0)) != 0:
        raise RuntimeError("manual AAC edited sample count/terminal coverage is incomplete")
    decoded_samples = 0
    def consume_decoded(line: str) -> None:
        nonlocal decoded_samples
        values = _fields(line)
        if not values:
            return
        if not all(key in values for key in ("best_effort_timestamp", "nb_samples", "duration")):
            raise RuntimeError("manual decoded AAC sample timing is missing")
        pts = int(values["best_effort_timestamp"]) * tick * 48000
        sample_count, sample_duration = int(values["nb_samples"]), int(values["duration"]) * tick * 48000
        if pts != decoded_samples or not 1 <= sample_count <= 1024 or sample_duration != sample_count or decoded_samples + sample_count > expected_samples:
            raise RuntimeError("manual decoded AAC samples have a gap/overlap or invalid terminal coverage")
        decoded_samples += sample_count
    # This final program may exceed the per-original 60-second source envelope.
    # Stream the decoder facts with O(1) state and stop on the requested count;
    # no captured JSON, source frame ceiling, or hidden duration truncation.
    reduce_lines([common.require_tool("ffprobe"), "-v", "error", "-threads", "2", "-select_streams", "a:0", "-show_frames",
                  "-show_entries", "frame=best_effort_timestamp,nb_samples,duration", "-of", "compact=p=0:nk=0", str(path)], consume_decoded, timeout=None)
    if decoded_samples != expected_samples:
        raise RuntimeError("manual decoded AAC sample count is incomplete")
    return duration


def _colour_args(video: dict) -> list[str]:
    result = []
    flags = {"color_primaries": "-color_primaries", "color_transfer": "-color_trc", "color_space": "-colorspace", "color_range": "-color_range"}
    for key, flag in flags.items():
        value = video.get(key)
        if value not in (None, "unknown", "unspecified"):
            if not isinstance(value, str) or not re.fullmatch("[a-zA-Z0-9_-]{1,32}", value):
                raise ValueError("manual source colour signalling is unsupported")
            result.extend([flag, value])
    return result


def _video_filter(start: int, end: int, width: int, height: int) -> str:
    return f"{CFR30_SOURCE_SAMPLER},trim=start_frame={start}:end_frame={end},setpts=N/(30*TB),scale={width}:{height}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1"


def run(common: Any, runtime: Any, args: dict, *, preview: bool = False) -> dict:
    import cevra_native_tools as tools
    items, total = validate(args, preview)
    output = tools._absolute_new_mux_output(args["output"])
    if output.suffix.lower() != ".mp4":
        raise ValueError("manual delivery must be MP4")
    originals = list(dict.fromkeys(_path(item["input"]) for item in items))
    root, root_stamp = _workspace(args["owned_workspace"], output, originals)
    width, height, bitrate = (720, 404, 700_000) if preview else (1920, 1080, 20_000_000)
    encoder = os.environ.get("CEVRA_VIDEO_ENCODER_H264", "").strip()
    if not encoder:
        raise RuntimeError("manual render requires the existing approved H.264 encoder")
    directory = Path(tempfile.mkdtemp(prefix="manual-render-", dir=root))
    directory_stamp = directory.lstat()
    owned_files: list[Path] = []
    sources, metadata, segments, original_stamps, receipts = {}, {}, {}, {}, []
    accounting = root / "published-account.mp4"
    publication = None
    try:
        budget = _LogicalBudget(root, root_stamp, OWNED_BYTES)
        source_targets = {}
        # Admit all mandatory copies and the conservative stereo PCM allowance
        # before copying/encoding. Encoder targets are not file-size bounds.
        for index, original in enumerate(originals):
            item = next(item for item in items if item["input"] == str(original))
            sealed = directory / f"source-{index}{original.suffix.lower()}"
            budget.reserve(sealed, item["source_content"]["size_bytes"])
            source_targets[original] = sealed; owned_files.append(sealed)
        pcm = directory / "sequence.wav"
        budget.reserve(pcm, total * 1600 * 8 + 1024 * 1024)
        owned_files.append(pcm)
        colour = None
        for index, original in enumerate(originals):
            item = next(item for item in items if item["input"] == str(original))
            sealed = source_targets[original]
            budget.producers += 1
            stamp = _seal(original, sealed, item["source_content"], budget); original_stamps[original] = stamp
            budget.settle(sealed)
            meta, times, durations, _, _, coverage = inspection._inspect_source(common, sealed, sealed.lstat(), item["source_content"]["sha256"])
            streams = _streams(common, sealed)
            videos, audios = [s for s in streams if s.get("codec_type") == "video"], [s for s in streams if s.get("codec_type") == "audio"]
            if len(videos) != 1 or len(audios) != 1 or coverage is None:
                raise ValueError("manual source requires exactly one measured video and one audio stream")
            video, audio = meta["video"], meta["audio"]
            if video.get("hdr") or video.get("bit_depth", 8) > 8:
                raise ValueError("manual source requires admitted 8-bit SDR")
            signature = tuple(video.get(key) for key in COLOUR_KEYS)
            if colour is not None and signature != colour:
                raise ValueError("manual sources have mixed colour/pixel signalling; explicit admission is required")
            colour = signature
            first, count = coverage
            layout = "mono" if audio["channels"] == 1 else "stereo"
            if audio.get("channel_layout") not in (None, layout):
                raise ValueError("manual source audio channel layout is unsupported")
            # Source sampling uses measured display PTS. A VFR picture may be
            # held until the next PTS even when its nominal packet duration is
            # shorter; do not invent a CFR requirement for the original.
            source_id = f"s{index}"; sources[str(original)] = (source_id, sealed, times[-1] + durations[-1], first, count, audio["sample_rate"])
            metadata[source_id] = meta; metadata[source_id]["audio"] = {**audio, "channel_layout": layout, "index": int(audios[0]["index"])}
            receipts.append({"inputUri": str(original), "sha256": item["source_content"]["sha256"], "sizeBytes": stamp.st_size,
                "videoStreamIndex": int(videos[0]["index"]), "audioStreamIndex": int(audios[0]["index"]), "audioStreamCount": 1,
                "sampleRate": audio["sample_rate"], "channelLayout": layout, "sourceVideoFrameCount": len(times),
                "sourceVideoEndMs": float((times[-1] + durations[-1]) * 1000), "sourceAudioFirstSample": first, "sourceAudioSampleCount": count})
        layout = "stereo" if any(meta["audio"]["channel_layout"] == "stereo" for meta in metadata.values()) else "mono"
        channels = 2 if layout == "stereo" else 1
        pcm_items, occurrences = [], []
        for item in items:
            source_id, sealed, source_end, first, count, sr = sources[item["input"]]
            start, end = item["source_start_frame"], item["source_end_frame"]
            if Fraction(end, 30) > source_end or Fraction(start, 30) < Fraction(first, sr) or Fraction(end, 30) > Fraction(first + count, sr):
                raise ValueError("manual requested frame range exceeds measured video/audio clock coverage")
            pcm_items.append({"source_id": source_id, "source_start_sample": start * 1600, "source_end_sample": end * 1600})
            key = (source_id, start, end)
            if key not in segments:
                segment = directory / f"segment-{len(segments)}.mp4"; owned_files.append(segment)
                profile = runtime.sdr_encoder_args(encoder, 18, "medium", {"video": {"width": width, "height": height, "fps": 30}}, tag_bt709=False)
                profile[profile.index("-b:v") + 1] = str(bitrate)
                if preview:
                    profile += ["-maxrate", "700k", "-bufsize", "1400k"]
                budget.run_native(common, common.ffmpeg_base(overwrite=False) + ["-threads", "2", "-filter_threads", "2", "-copyts", "-i", str(sealed), "-map", f"0:{receipts[int(source_id[1:])]['videoStreamIndex']}", "-an", "-vf", _video_filter(start, end, width, height), *profile, *_colour_args(metadata[source_id]["video"]), "-bf", "0", "-fps_mode", "passthrough", "-video_track_timescale", "30000", "-metadata:s:v:0", "rotate=0", str(segment)])
                _video_clock(common, segment, end - start, width, height)
                segments[key] = segment
            occurrences.append(segments[key])
        graph_path = directory / "sequence.ffgraph"; owned_files.append(graph_path)
        graph = tools._audio_sequence_graph({}, {source_id: index for index, (source_id, *_rest) in enumerate(sources.values())}, metadata,
            sample_plan={"items": pcm_items, "output_channel_layout": layout})
        budget.write_text(graph_path, graph)
        command = common.ffmpeg_base(overwrite=False) + ["-copyts"]
        for _id, sealed, *_rest in sources.values():
            command += ["-i", str(sealed)]
        budget.run_native(common, command + ["-/filter_complex", str(graph_path), "-map", "[cevra_audio_out]", "-vn", "-c:a", "pcm_f32le", "-ar", "48000", "-ac", str(channels), "-f", "wav", str(pcm)])
        samples, data_bytes = tools._measure_pcm_f32le_wav(pcm)
        if samples != total * 1600 or data_bytes != samples * channels * 4:
            raise RuntimeError("manual measured PCM count is not exactly 1600 samples per frame")
        listing, video = directory / "sequence.ffconcat", directory / "sequence.mp4"; owned_files.extend([listing, video])
        # Generated relative names contain no caller text or quoting surface.
        budget.write_text(listing, "ffconcat version 1.0\n" + "".join(f"file {segment.name}\n" for segment in occurrences))
        budget.run_native(common, common.ffmpeg_base(overwrite=False) + ["-f", "concat", "-safe", "1", "-auto_convert", "0", "-i", str(listing), "-map", "0:v:0", "-c:v", "copy", "-an", "-video_track_timescale", "30000", str(video)])
        _video_clock(common, video, total, width, height)
        measured = {}
        def admit(candidate: Path, probe: dict) -> None:
            nonlocal publication
            _root_current(root, root_stamp)
            if preview and not 0 < candidate.stat().st_size <= inspection.MAX_BYTES:
                raise ValueError("manual disposable preview exceeds the inherited 8 MiB admission bound")
            measured["video"] = _video_clock(common, candidate, total, width, height)
            measured["audio"] = _audio_clock(common, candidate, samples, channels)
            for original, stamp in original_stamps.items():
                expected = next(item["source_content"]["sha256"] for item in items if item["input"] == str(original))
                if inspection._hash_stable(original, stamp, SOURCE_BYTES) != expected:
                    raise RuntimeError("manual original changed before publication")
            for source_id, sealed, *_rest in sources.values():
                expected = next(r["sha256"] for r in receipts if r["inputUri"] == originals[int(source_id[1:])].as_posix())
                if inspection._hash_stable(sealed, sealed.lstat(), SOURCE_BYTES) != expected:
                    raise RuntimeError("manual sealed original changed during render")
            candidate_stream = next(s for s in _streams(common, candidate) if s.get("codec_type") == "video")
            for key in COLOUR_KEYS[:-1]:
                expected = metadata["s0"]["video"].get(key)
                actual = candidate_stream.get(key)
                if expected in (None, "unknown", "unspecified"):
                    if actual not in (None, "unknown", "unspecified"):
                        raise RuntimeError("manual output invented source colour signalling")
                elif actual != expected:
                    raise RuntimeError("manual output did not preserve common source colour signalling")
            measured["sha256"] = inspection._hash_stable(candidate, candidate.lstat(), OWNED_BYTES)
            # All media producers have settled. Admit the complete owned tree,
            # including the future accounting name, before any public link.
            _admit_owned_disk(root, root_stamp, candidate)
            # Keep this identity-bound hard link through Host final budget check.
            # It adds no payload allocation, and never grants authority over final.
            os.link(candidate, accounting, follow_symlinks=False)
            publication = tools._publication_evidence(accounting)
            _admit_owned_disk(root, root_stamp)
            jobs.check_cancelled()
        result = tools._run_mux_audio(_BudgetMuxCommon(common, budget), {"video": str(video), "audio": str(pcm), "output": str(output), "container": "mp4", "audio_codec": "aac", "replace_existing": True}, owned_staging_parent=directory, before_publish=admit,
            owned_aac_bits_per_second=96_000 if preview else None, retain_published_on_error=True)
        if publication is None or not tools._matches_publication(output, publication) or not tools._matches_publication(accounting, publication):
            raise RuntimeError("manual final/accounting publication identity is unproved")
        if inspection._hash_stable(output, output.lstat(), OWNED_BYTES) != measured["sha256"]:
            raise RuntimeError("manual final publication bytes changed")
        jobs.check_cancelled()
        evidence = {"version": 1, "outputSha256": measured["sha256"], "profile": "manual-cfr30-preview-v1" if preview else "manual-cfr30-export-v1", "samplingPolicy": SAMPLING_POLICY,
            "frameRate": {"numerator": 30, "denominator": 1}, "container": "mp4", "videoCodec": "h264", "audioCodec": "aac", "dynamicRange": "sdr",
            "width": width, "height": height, "targetVideoBitsPerSecond": bitrate, "totalFrames": total, "outputFrameCount": total,
            "totalPcmSamples": samples, "outputAudioSampleCount": int(measured["audio"] * 48000), "audioSampleRate": 48000, "audioChannelLayout": layout,
            "durationMs": total * 1000 / 30, "muxVideoDurationMs": float(measured["video"] * 1000), "muxAudioDurationMs": float(measured["audio"] * 1000),
            "itemCount": len(items), "uniqueSegmentCount": len(segments), "sources": receipts,
            "logicalBudget": budget.evidence()}
        result["structuredContent"]["manualSequence"] = evidence
        result["content"] = [{"type": "text", "text": json.dumps(result["structuredContent"])}]
        return result
    except BaseException as execution_error:
        if publication is not None or accounting.exists():
            raise RuntimeError(f"manual render failed; public destination and accounting link retained for recovery: {execution_error}") from execution_error
        raise
    finally:
        errors = []
        # A replaced root cannot confer cleanup authority over its new contents.
        _root_current(root, root_stamp)
        _root_current(directory, directory_stamp)
        # Never path-unlink a public manual destination after publication.
        # Its retained private accounting link permits conservative recovery;
        # only normal successful Host settlement removes that issued workspace.
        for path in reversed(owned_files):
            try:
                path.unlink(missing_ok=True)
            except OSError as error:
                errors.append(str(error))
        try:
            directory.rmdir()
        except OSError as error:
            errors.append(str(error))
        if errors:
            # A failure to remove private inputs/intermediates prevents admission.
            preservation = "; public destination and accounting link retained for recovery" if publication is not None or accounting.exists() else ""
            raise RuntimeError("manual owned artifact cleanup incomplete: " + "; ".join(errors) + preservation)
