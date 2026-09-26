#!/usr/bin/env python3
from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import math
import os
import platform
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

WORKER_FILE = Path(__file__).absolute()
WORKER_DIRECTORY = WORKER_FILE.parent
if str(WORKER_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(WORKER_DIRECTORY))

from runtime_integrity import release_mode_for, sanitize_release_environment, verify_release_bundle

WORKER_VERSION = "0.3.1"
PROTOCOL_VERSION = 1
UPSTREAM_VERSION = "1.4.2"
UPSTREAM_COMMIT = "58f64f9d9e6a0ced4a4cd6a198d7476dede50d1a"
UPSTREAM_CONTRACT = "1.0"
EXPECTED_FFMPEG_VERSION = "9.0.1"
EXPECTED_FFMPEG_SOURCE = "https://ffmpeg.org/releases/ffmpeg-9.0.1.tar.xz"
EXPECTED_FFMPEG_SIGNATURE = "https://ffmpeg.org/releases/ffmpeg-9.0.1.tar.xz.asc"
EXPECTED_FFMPEG_FINGERPRINT = "FCF986EA15E6E293A5644F10B4322F04D67658D8"
EXPECTED_WINDOWS_ZLIB = {
    "version": "1.3.2",
    "source": "https://zlib.net/zlib-1.3.2.tar.xz",
    "archiveSha256": "d7a0654783a4da529d1bb793b7ad9c3318020af77667bcae35f95d0e42a792f3",
    "signature": "https://zlib.net/zlib-1.3.2.tar.xz.asc",
    "signatureSha256": "03ce710347e2f84fa7ed0a6ae6a93467b08031a3022fc296da40220a83b96667",
    "signingKey": "https://madler.net/madler/pgp.html",
    "signingKeySourceSha256": "939bc34e71648cb70793c711d86a58c302a624f84c8600cfa62f2fdd3c925022",
    "signingKeySha256": "27f818fd93326e4531c6b094f0edc4c331a1c77ec6449675a3929ae3274d85ac",
    "signingFingerprint": "5ED46A6721D365587791E2AA783FCD8E58BCAFBA",
    "license": "Zlib",
    "licenseSha256": "e32ff4e00d9d94930537635291da39e7e612703334bf6fde8c7f1686fe8a45a2",
}
EXPECTED_PYTHON_VERSION = "3.12.14"


def _external_runtime_root() -> Path:
    configured = os.environ.get("CEVRA_MEDIA_RUNTIME_ROOT")
    if configured:
        return Path(configured).resolve()
    return WORKER_DIRECTORY.parent.resolve()


RELEASE_MODE = release_mode_for(WORKER_FILE)
RUNTIME_ROOT = WORKER_DIRECTORY.parent.absolute() if RELEASE_MODE else _external_runtime_root()
if RELEASE_MODE:
    if not sys.flags.isolated:
        raise RuntimeError("release media worker requires CPython isolated mode (-I)")
    sanitize_release_environment(RUNTIME_ROOT)
else:
    os.environ["CEVRA_MEDIA_RUNTIME_ROOT"] = str(RUNTIME_ROOT)
VENDOR_ROOT = (RUNTIME_ROOT / "vendor" / "ffmpeg-skill") if RELEASE_MODE else Path(os.environ.get("CEVRA_FFMPEG_SKILL_ROOT", str(RUNTIME_ROOT / "vendor" / "ffmpeg-skill"))).resolve()
BIN_DIR = (RUNTIME_ROOT / "bin").resolve() if RELEASE_MODE else Path(os.environ.get("CEVRA_MEDIA_BIN_DIR", str(RUNTIME_ROOT / "bin"))).resolve()

if RELEASE_MODE:
    verify_release_bundle(
        RUNTIME_ROOT,
        Path(sys.executable),
        expected_python=EXPECTED_PYTHON_VERSION,
        expected_ffmpeg=EXPECTED_FFMPEG_VERSION,
        expected_ffmpeg_source=EXPECTED_FFMPEG_SOURCE,
        expected_ffmpeg_signature=EXPECTED_FFMPEG_SIGNATURE,
        expected_ffmpeg_fingerprint=EXPECTED_FFMPEG_FINGERPRINT,
        expected_worker=WORKER_VERSION,
        expected_upstream_version=UPSTREAM_VERSION,
        expected_upstream_commit=UPSTREAM_COMMIT,
        expected_upstream_contract=UPSTREAM_CONTRACT,
        expected_windows_zlib=EXPECTED_WINDOWS_ZLIB if sys.platform == "win32" else None,
    )

from cevra_native_tools import AUDIO_CODECS as DELIVERY_AUDIO_CODECS
from cevra_native_tools import CUSTOM_TOOLS, DELIVERY_MATRIX, VIDEO_CODECS as DELIVERY_VIDEO_CODECS, call_custom_tool
import cevra_job_control as job_control
from runtime_profile import adapt_required_capabilities, candidates, configured_profile, ensure_functional_profile, invalidate_cache as invalidate_profile_cache

_UPSTREAM: Any = None
_RUNTIME_CAPABILITIES_CACHE: Optional[tuple[tuple[Any, ...], Dict[str, Any]]] = None
_AUDIO_SMOKE_CACHE: Dict[tuple[Any, ...], bool] = {}
_CONTROL_STDOUT = sys.stdout
_CONTROL_WRITE_LOCK = threading.Lock()
_JOB_THREAD: Optional[threading.Thread] = None
MAX_MEDIA_WIDTH = 16_384
MAX_MEDIA_HEIGHT = 16_384
MAX_MEDIA_FPS = 240
MAX_MEDIA_DURATION_SECONDS = 7 * 24 * 60 * 60
MAX_MEDIA_INPUTS = 128
MAX_MEDIA_PATH_LENGTH = 32_768
MAX_AUDIO_SEQUENCE_ITEMS = 2_048
MAX_AUDIO_SEQUENCE_GAIN_DB = 24
MIN_AUDIO_SEQUENCE_GAIN_DB = -120
ALLOWED_UPSTREAM_TOOLS = frozenset({
    "audio", "crop", "cut", "fit", "join", "loudness", "probe", "silence",
})
ALLOWED_TOOLS = ALLOWED_UPSTREAM_TOOLS | CUSTOM_TOOLS
DELIVERY_CONTAINERS = frozenset(DELIVERY_MATRIX)


def _object_schema(properties: Dict[str, Any], required: List[str]) -> Dict[str, Any]:
    return {"type": "object", "additionalProperties": False, "properties": properties, "required": required}


_PATH_SCHEMA = {"type": "string", "minLength": 1, "maxLength": MAX_MEDIA_PATH_LENGTH, "cevraMediaPath": True}
_NUMBER_SCHEMA = {"type": "number"}
_POSITIVE_SCHEMA = {"type": "number", "exclusiveMinimum": 0, "maximum": MAX_MEDIA_DURATION_SECONDS}
_NON_NEGATIVE_SCHEMA = {"type": "number", "minimum": 0, "maximum": MAX_MEDIA_DURATION_SECONDS}
_POSITIVE_INTEGER_SCHEMA = {"type": "integer", "minimum": 1}
_NON_NEGATIVE_INTEGER_SCHEMA = {"type": "integer", "minimum": 0}
_WIDTH_SCHEMA = {"type": "integer", "minimum": 1, "maximum": MAX_MEDIA_WIDTH}
_HEIGHT_SCHEMA = {"type": "integer", "minimum": 1, "maximum": MAX_MEDIA_HEIGHT}
_UPSTREAM_TOOL_SCHEMAS: Dict[str, Dict[str, Any]] = {
    "audio": _object_schema({
        "input": _PATH_SCHEMA, "output": _PATH_SCHEMA, "gain": _NUMBER_SCHEMA,
        "fade_in": _NON_NEGATIVE_SCHEMA, "fade_out": _NON_NEGATIVE_SCHEMA,
    }, ["input", "output"]),
    "crop": _object_schema({
        "input": _PATH_SCHEMA, "output": _PATH_SCHEMA, "x": _NON_NEGATIVE_INTEGER_SCHEMA,
        "y": _NON_NEGATIVE_INTEGER_SCHEMA, "width": _WIDTH_SCHEMA,
        "height": _HEIGHT_SCHEMA,
    }, ["input", "output", "x", "y", "width", "height"]),
    "cut": _object_schema({
        "input": _PATH_SCHEMA, "output": _PATH_SCHEMA, "start": _NON_NEGATIVE_SCHEMA,
        "end": _POSITIVE_SCHEMA, "accurate": {"type": "boolean"},
    }, ["input", "output", "start", "end", "accurate"]),
    "fit": _object_schema({
        "input": _PATH_SCHEMA, "output": _PATH_SCHEMA, "width": _WIDTH_SCHEMA,
        "height": _HEIGHT_SCHEMA, "fit": {"type": "string", "enum": ["pad", "crop"]},
        "pad_color": _PATH_SCHEMA,
    }, ["input", "output", "width", "height", "fit"]),
    "join": _object_schema({
        "inputs": {"type": "array", "minItems": 1, "maxItems": MAX_MEDIA_INPUTS, "items": _PATH_SCHEMA}, "output": _PATH_SCHEMA,
    }, ["inputs", "output"]),
    "loudness": _object_schema({
        "input": _PATH_SCHEMA, "output": _PATH_SCHEMA, "lufs": _NUMBER_SCHEMA, "tp": _NUMBER_SCHEMA,
    }, ["input", "output", "lufs"]),
    "probe": _object_schema({
        "inputs": {"type": "array", "minItems": 1, "maxItems": MAX_MEDIA_INPUTS, "items": _PATH_SCHEMA},
    }, ["inputs"]),
    "silence": _object_schema({
        "input": _PATH_SCHEMA, "threshold": _NUMBER_SCHEMA, "min_silence": _POSITIVE_SCHEMA,
        "list": {"type": "boolean"},
    }, ["input", "threshold", "min_silence", "list"]),
}


def _binary_candidates(name: str) -> List[Path]:
    values = [BIN_DIR / name]
    if os.name == "nt":
        values.insert(0, BIN_DIR / f"{name}.exe")
    return values


def _prepare_path() -> None:
    os.environ["FFMPEG_SKILL_NO_OVERWRITE"] = "1"
    if RELEASE_MODE:
        os.environ["PATH"] = str(BIN_DIR)
    elif BIN_DIR.is_dir():
        os.environ["PATH"] = str(BIN_DIR) + os.pathsep + os.environ.get("PATH", "")


def _tool(name: str) -> Optional[str]:
    for candidate in _binary_candidates(name):
        if candidate.is_file():
            resolved = candidate.resolve()
            if not RELEASE_MODE or _is_within(str(resolved), BIN_DIR):
                return str(resolved)
    if RELEASE_MODE:
        return None
    _prepare_path()
    return shutil.which(name)


def _is_within(path: str, parent: Path) -> bool:
    try:
        Path(path).resolve().relative_to(parent.resolve())
        return True
    except (ValueError, OSError):
        return False


def _run(argv: List[str], timeout: float = 10.0) -> subprocess.CompletedProcess[str]:
    active = job_control.active_job_id()
    if active is None:
        return subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout)
    result = job_control.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout)
    if job_control.is_cancelled(active):
        raise InterruptedError(f"media job {active} was cancelled")
    return result


def _ffmpeg_build() -> Dict[str, Any]:
    ffmpeg = _tool("ffmpeg")
    if not ffmpeg:
        return {"path": None, "version": None, "license": None, "configure": []}
    version_proc = _run([ffmpeg, "-version"])
    version_text = (version_proc.stdout or version_proc.stderr or "").strip()
    version_line = version_text.splitlines()[0] if version_text else ""
    match = re.search(r"ffmpeg version\s+([^\s]+)", version_line)
    build_proc = _run([ffmpeg, "-buildconf"])
    text = (build_proc.stdout or "") + "\n" + (build_proc.stderr or "")
    flags = sorted(set(re.findall(r"--[a-zA-Z0-9_-]+(?:=[^\s]+)?", text)))
    if any(flag.startswith("--enable-nonfree") for flag in flags):
        license_name = "NONFREE"
    elif any(flag.startswith("--enable-gpl") for flag in flags):
        license_name = "GPL"
    elif any(flag.startswith("--enable-version3") for flag in flags):
        license_name = "LGPL-3.0-or-later"
    else:
        license_name = "LGPL-2.1-or-later"
    return {
        "path": ffmpeg,
        "version": match.group(1) if match else version_line,
        "license": license_name,
        "configure": flags,
    }


def _encoders() -> List[str]:
    ffmpeg = _tool("ffmpeg")
    if not ffmpeg:
        return []
    proc = _run([ffmpeg, "-hide_banner", "-encoders"])
    result: List[str] = []
    for line in (proc.stdout or "").splitlines():
        match = re.match(r"^\s*[VAS][A-Z\.]{5}\s+(\S+)", line)
        if match and match.group(1) != "=":
            result.append(match.group(1))
    return sorted(set(result))


def _filters() -> List[str]:
    ffmpeg = _tool("ffmpeg")
    if not ffmpeg:
        return []
    proc = _run([ffmpeg, "-hide_banner", "-filters"])
    result: List[str] = []
    for line in (proc.stdout or "").splitlines():
        match = re.match(r"^\s*[TSC\.]{3}\s+(\S+)\s", line)
        if match and match.group(1) != "=":
            result.append(match.group(1))
    return sorted(set(result))


def _hwaccels() -> List[str]:
    ffmpeg = _tool("ffmpeg")
    if not ffmpeg:
        return []
    proc = _run([ffmpeg, "-hide_banner", "-hwaccels"])
    values: List[str] = []
    for line in (proc.stdout or "").splitlines():
        value = line.strip()
        if value and not value.lower().startswith("hardware acceleration"):
            values.append(value)
    return sorted(set(values))


def _platform() -> str:
    if sys.platform == "darwin":
        return "darwin"
    if sys.platform.startswith("win"):
        return "win32"
    if sys.platform.startswith("linux"):
        return "linux"
    return "unknown"


def runtime_capabilities() -> Dict[str, Any]:
    global _RUNTIME_CAPABILITIES_CACHE
    ffmpeg = _tool("ffmpeg")
    signature: tuple[Any, ...] = (_platform(), ffmpeg)
    if ffmpeg:
        try:
            metadata = Path(ffmpeg).stat()
            signature += (metadata.st_size, metadata.st_mtime_ns)
        except OSError:
            signature += (None, None)
    if _RUNTIME_CAPABILITIES_CACHE is not None and _RUNTIME_CAPABILITIES_CACHE[0] == signature:
        return dict(_RUNTIME_CAPABILITIES_CACHE[1])
    build = _ffmpeg_build()
    result = {
        "platform": _platform(),
        "arch": platform.machine() or "unknown",
        "ffmpegVersion": build.get("version"),
        "ffmpegLicense": build.get("license"),
        "encoders": _encoders(),
        "filters": _filters(),
        "hwaccels": _hwaccels(),
    }
    _RUNTIME_CAPABILITIES_CACHE = (signature, result)
    return dict(result)


def _invalidate_runtime_capabilities() -> None:
    global _RUNTIME_CAPABILITIES_CACHE
    _RUNTIME_CAPABILITIES_CACHE = None
    _AUDIO_SMOKE_CACHE.clear()


def _audio_encoder(codec: str, available: set[str]) -> Optional[str]:
    if codec == "opus":
        return "libopus" if "libopus" in available else ("opus" if "opus" in available else None)
    mapping = {"aac": "aac", "pcm": "pcm_s16le"}
    selected = mapping.get(codec)
    return selected if selected in available else None


def _audio_encoder_functional(ffmpeg: str, encoder: str) -> bool:
    try:
        metadata = Path(ffmpeg).stat()
        key: tuple[Any, ...] = (str(Path(ffmpeg).resolve()), metadata.st_size, metadata.st_mtime_ns, encoder)
    except OSError:
        return False
    if key in _AUDIO_SMOKE_CACHE:
        return _AUDIO_SMOKE_CACHE[key]
    command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-f", "lavfi", "-i", "sine=frequency=1000:duration=0.05", "-frames:a", "1", "-c:a", encoder]
    if encoder == "opus":
        command.extend(["-strict", "-2"])
    command.extend(["-f", "null", "-"])
    try:
        functional = _run(command, timeout=5.0).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        functional = False
    _AUDIO_SMOKE_CACHE[key] = functional
    return functional


def effective_deliveries(profile: Dict[str, str], available_values: List[str], ffmpeg: Optional[str] = None) -> List[Dict[str, str]]:
    available = set(available_values)
    audio = {
        codec: encoder
        for codec in ("aac", "opus", "pcm")
        if (encoder := _audio_encoder(codec, available)) and (ffmpeg is None or _audio_encoder_functional(ffmpeg, encoder))
    }
    result: List[Dict[str, str]] = []
    for container, rule in DELIVERY_MATRIX.items():
        audio_capabilities = [(codec, audio[codec]) for codec in sorted(rule["audio"]) if codec in audio]
        audio_capabilities.append(("copy", "copy"))
        for audio_codec, audio_encoder in audio_capabilities:
            result.append({"container": container, "audioOnly": True, "audioCodec": audio_codec, "audioEncoder": audio_encoder})
            if rule["audio_only"]:
                continue
            video_capabilities = [(codec, profile[codec]) for codec in sorted(rule["video"]) if codec in profile]
            video_capabilities.append(("copy", "copy"))
            for video_codec, video_encoder in video_capabilities:
                result.append({
                    "container": container,
                    "audioOnly": False,
                    "videoCodec": video_codec,
                    "audioCodec": audio_codec,
                    "videoEncoder": video_encoder,
                    "audioEncoder": audio_encoder,
                })
    return result


def _ensure_profile() -> Dict[str, str]:
    return ensure_functional_profile(_tool("ffmpeg"), runtime_capabilities())


def _read_vendor_provenance() -> Dict[str, Any]:
    package_path = VENDOR_ROOT / "package.json"
    provenance_path = VENDOR_ROOT / "CEVRA_PROVENANCE.json"
    if not package_path.is_file():
        raise RuntimeError("vendored ffmpeg-skill package.json is missing")
    package = json.loads(package_path.read_text(encoding="utf-8"))
    if package.get("version") != UPSTREAM_VERSION:
        raise RuntimeError(f"vendored ffmpeg-skill version {package.get('version')!r} does not match pinned {UPSTREAM_VERSION}")
    if not provenance_path.is_file():
        raise RuntimeError("vendored ffmpeg-skill CEVRA_PROVENANCE.json is missing; build patch was not applied")
    provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
    if (
        provenance.get("upstream") != "kajisho5/ffmpeg-skill"
        or provenance.get("version") != UPSTREAM_VERSION
        or provenance.get("commit") != UPSTREAM_COMMIT
        or provenance.get("patch") != "CEVRA_MEDIA_RUNTIME_PATCH_V1"
    ):
        raise RuntimeError("vendored ffmpeg-skill provenance does not match CEVRA pin")
    return provenance


def _load_upstream() -> Any:
    global _UPSTREAM
    if _UPSTREAM is not None:
        return _UPSTREAM
    _read_vendor_provenance()
    server = VENDOR_ROOT / "mcp" / "server.py"
    scripts = VENDOR_ROOT / "scripts"
    if not server.is_file() or not scripts.is_dir():
        raise RuntimeError(f"vendored ffmpeg-skill is incomplete under {VENDOR_ROOT}")
    scripts_str = str(scripts)
    if scripts_str not in sys.path:
        sys.path.insert(0, scripts_str)
    spec = importlib.util.spec_from_file_location("cevra_ffmpeg_skill_mcp", server)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load vendored ffmpeg-skill MCP server")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    _UPSTREAM = module
    return module


def info() -> Dict[str, Any]:
    return {
        "name": "cevra-media-worker",
        "version": WORKER_VERSION,
        "protocolVersion": PROTOCOL_VERSION,
        "upstream": {
            "id": "ffmpeg-skill",
            "version": UPSTREAM_VERSION,
            "contractVersion": UPSTREAM_CONTRACT,
            "commit": UPSTREAM_COMMIT,
        },
        "runtime": runtime_capabilities(),
    }


def _check(checks: List[Dict[str, Any]], ident: str, status: str, message: str, **evidence: Any) -> None:
    item: Dict[str, Any] = {"id": ident, "status": status, "message": message}
    if evidence:
        item["evidence"] = evidence
    checks.append(item)


def _custom_health(tools: Dict[str, Dict[str, Any]], profile: Dict[str, str], ffmpeg_present: bool, deliveries: List[Dict[str, str]]) -> None:
    h264 = profile.get("h264")
    hevc = profile.get("h265")
    for name in ("cevra-scale", "cevra-overlay-media", "cevra-speed"):
        if not ffmpeg_present:
            tools[name] = {"usable": "no", "missing": ["ffmpeg"]}
        elif not h264:
            tools[name] = {"usable": "no", "missing": ["approved H.264 encoder"]}
        else:
            detail = f"SDR encoder {h264}"
            if not hevc:
                detail += "; no functional HEVC encoder"
            tools[name] = {"usable": "yes", "detail": detail}
    tools["cevra-transcode"] = {"usable": "yes" if deliveries else "no", **({"detail": f"{len(deliveries)} effective delivery combinations"} if deliveries else {"missing": ["functional delivery encoder profile"]})}
    mux_usable = any(not item.get("audioOnly", False) and item.get("videoCodec") == "copy" and item.get("audioCodec") != "copy" for item in deliveries)
    tools["cevra-mux-audio"] = {"usable": "yes" if mux_usable else "no", **({} if mux_usable else {"missing": ["functional video/audio delivery combination"]})}
    png_available = ffmpeg_present and "png" in _encoders()
    tools["cevra-extract-frame"] = {
        "usable": "yes" if png_available else "no",
        **({} if png_available else {"missing": ["PNG encoder" if ffmpeg_present else "ffmpeg"]}),
    }
    required_audio_sequence_filters = {"afade", "aformat", "adelay", "amix", "anullsrc", "aresample", "asetpts", "asplit", "atrim", "pan", "volume"}
    available_filters = set(_filters()) if ffmpeg_present else set()
    available_encoders = set(_encoders()) if ffmpeg_present else set()
    missing_audio_sequence = sorted(required_audio_sequence_filters - available_filters)
    if "pcm_f32le" not in available_encoders:
        missing_audio_sequence.append("encoder:pcm_f32le")
    if not ffmpeg_present:
        missing_audio_sequence.extend(["ffmpeg", "ffprobe"])
    tools["cevra-render-audio-sequence"] = {
        "usable": "no" if missing_audio_sequence else "yes",
        **({"missing": sorted(set(missing_audio_sequence))} if missing_audio_sequence else {"detail": "pcm_f32le/48000 with fixed bounded audio graph"}),
    }
    required_measurement = {"astats", "ebur128", "aeval", "aresample", "aformat", "asplit", "asettb", "atrim", "asetpts", "ametadata", "anullsink"}
    missing_measurement = sorted(required_measurement - available_filters)
    if "pcm_f64le" not in available_encoders:
        missing_measurement.append("encoder:pcm_f64le")
    tools["cevra-measure-audio"] = {
        "usable": "no" if missing_measurement else "yes",
        **({"missing": missing_measurement} if missing_measurement else {"detail": "native-rate read-only astats/ebur128 with drained SWR 4x peak evidence"}),
    }


def health() -> Dict[str, Any]:
    checks: List[Dict[str, Any]] = []
    ffmpeg = _tool("ffmpeg")
    ffprobe = _tool("ffprobe")
    build = _ffmpeg_build()
    if ffmpeg:
        bundled = _is_within(ffmpeg, BIN_DIR)
        status = "PASS" if bundled or not RELEASE_MODE else "FAIL"
        _check(checks, "ffmpeg", status, "FFmpeg available", path=ffmpeg, bundled=bundled, version=build.get("version"))
    else:
        _check(checks, "ffmpeg", "FAIL", "FFmpeg is missing from the CEVRA Media Runtime" if RELEASE_MODE else "FFmpeg is missing")
    if ffprobe:
        bundled = _is_within(ffprobe, BIN_DIR)
        status = "PASS" if bundled or not RELEASE_MODE else "FAIL"
        _check(checks, "ffprobe", status, "ffprobe available", path=ffprobe, bundled=bundled)
    else:
        _check(checks, "ffprobe", "FAIL", "ffprobe is missing from the CEVRA Media Runtime" if RELEASE_MODE else "ffprobe is missing")

    version = str(build.get("version") or "")
    if version:
        version_ok = version == EXPECTED_FFMPEG_VERSION or version.startswith(EXPECTED_FFMPEG_VERSION + "-")
        status = "PASS" if version_ok else ("FAIL" if RELEASE_MODE else "WARN")
        _check(checks, "ffmpeg-version", status, f"FFmpeg {version}", expected=EXPECTED_FFMPEG_VERSION)
    else:
        _check(checks, "ffmpeg-version", "UNKNOWN", "FFmpeg version unavailable")

    license_name = build.get("license")
    if license_name in ("GPL", "NONFREE"):
        _check(checks, "ffmpeg-license", "FAIL" if RELEASE_MODE else "WARN", f"FFmpeg build classified as {license_name}", configure=build.get("configure", []))
    elif license_name:
        _check(checks, "ffmpeg-license", "PASS", f"FFmpeg build classified as {license_name}")
    else:
        _check(checks, "ffmpeg-license", "UNKNOWN", "FFmpeg license classification unavailable")

    tools: Dict[str, Dict[str, Any]] = {}
    profile = _ensure_profile() if ffmpeg else {}
    if profile:
        _check(checks, "encoder-profile", "PASS", "Functional encoder profile selected", profile=profile)
    elif ffmpeg:
        _check(checks, "encoder-profile", "WARN", "No approved H.264/H.265/AV1 encoder passed the local smoke test")

    try:
        upstream = _load_upstream()
        contract = upstream._contract.build(detect=True)
        caps = contract.get("capabilities") or {}
        available = set(caps.get("available") or [])
        missing = set(caps.get("missing") or [])
        for spec in contract.get("tools") or []:
            if spec.get("name") not in ALLOWED_UPSTREAM_TOOLS:
                continue
            required = set(((spec.get("capabilities") or {}).get("required") or []))
            normal_required, cevra_missing = adapt_required_capabilities(required)
            missing_known = sorted(normal_required & missing) + cevra_missing
            unknown = sorted(normal_required - available - missing)
            if missing_known:
                tools[spec["name"]] = {"usable": "no", "missing": missing_known}
            elif unknown:
                tools[spec["name"]] = {"usable": "unknown", "missing": unknown}
            else:
                tools[spec["name"]] = {"usable": "yes"}
        _check(checks, "ffmpeg-skill", "PASS", "Vendored ffmpeg-skill loaded", version=UPSTREAM_VERSION, commit=UPSTREAM_COMMIT)
    except Exception as exc:
        _check(checks, "ffmpeg-skill", "FAIL", str(exc))

    runtime = runtime_capabilities()
    deliveries = effective_deliveries(profile, runtime.get("encoders") or [], ffmpeg) if ffmpeg else []
    runtime["effectiveDeliveries"] = deliveries
    _custom_health(tools, profile, bool(ffmpeg and ffprobe), deliveries)
    ok = not any(item["status"] == "FAIL" for item in checks)
    return {
        "ok": ok,
        "checkedAt": _now_iso(),
        "checks": checks,
        "tools": tools,
        "runtime": runtime,
        "effectiveDeliveries": deliveries,
    }


def configure(profile: Dict[str, Any]) -> Dict[str, Any]:
    caps = runtime_capabilities()
    encoders = set(caps["encoders"])
    hwaccels = set(caps["hwaccels"])
    mappings = {
        "h264Encoder": ("h264", "CEVRA_VIDEO_ENCODER_H264"),
        "hevcEncoder": ("h265", "CEVRA_VIDEO_ENCODER_HEVC"),
        "av1Encoder": ("av1", "CEVRA_VIDEO_ENCODER_AV1"),
    }
    expected_fields = {*mappings, "decodeAcceleration"}
    extras = sorted(set(profile) - expected_fields)
    if extras:
        raise ValueError(f"profile contains unexpected fields: {', '.join(extras)}")
    for key, (codec, env_name) in mappings.items():
        value = profile.get(key)
        if value is None or value == "":
            os.environ.pop(env_name, None)
            continue
        allowed = candidates(str(caps.get("platform") or "unknown"), codec, encoders)
        if not isinstance(value, str) or value not in allowed:
            raise ValueError(f"encoder {value!r} for {key} is not allowed and available in this runtime")
        os.environ[env_name] = value
    accel = profile.get("decodeAcceleration")
    if accel is None or accel == "":
        os.environ.pop("CEVRA_DECODE_ACCELERATION", None)
    else:
        allowed_acceleration = {"darwin": {"videotoolbox"}, "win32": set(), "linux": set(), "unknown": set()}.get(str(caps.get("platform")), set())
        if not isinstance(accel, str) or accel not in hwaccels or accel not in allowed_acceleration:
            raise ValueError(f"decode acceleration {accel!r} is not available")
        os.environ["CEVRA_DECODE_ACCELERATION"] = accel
    _invalidate_runtime_capabilities()
    invalidate_profile_cache()
    return {"configured": True, "profile": configured_profile()}


def benchmark(codec: str, requested: List[str]) -> Dict[str, Any]:
    if codec not in ("h264", "h265", "av1"):
        raise ValueError(f"unsupported benchmark codec {codec}")
    available = set(_encoders())
    ffmpeg = _tool("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("FFmpeg is missing")
    results: List[Dict[str, Any]] = []
    for encoder in requested:
        if not isinstance(encoder, str) or encoder not in available:
            results.append({"encoder": str(encoder), "codec": codec, "success": False, "detail": "encoder unavailable"})
            continue
        cmd = [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
            "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=60",
            "-frames:v", "120", "-an", "-c:v", encoder, "-f", "null", "-",
        ]
        start = time.perf_counter()
        try:
            proc = _run(cmd, timeout=20.0)
            elapsed = max(0.001, time.perf_counter() - start)
            if proc.returncode == 0:
                fps = 120.0 / elapsed
                results.append({"encoder": encoder, "codec": codec, "success": True, "fps": round(fps, 2), "realtimeFactor": round(fps / 60.0, 3)})
            else:
                detail = "\n".join((proc.stderr or "").splitlines()[-4:])
                results.append({"encoder": encoder, "codec": codec, "success": False, "detail": detail})
        except (subprocess.TimeoutExpired, OSError) as exc:
            results.append({"encoder": encoder, "codec": codec, "success": False, "detail": str(exc)})
    return {"benchmarks": results}


def _attach_effective_profile(result: Dict[str, Any], name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    payload = result.get("structuredContent")
    if not isinstance(payload, dict) or not isinstance(payload.get("output"), str) or not isinstance(payload.get("probe"), dict):
        return result
    probe = payload["probe"]
    output = str(payload["output"])
    container = Path(output.split("?", 1)[0].split("#", 1)[0]).suffix.lower().lstrip(".")
    profile: Dict[str, str] = {"container": "png" if container == "png" else container}
    video = probe.get("video")
    audio = probe.get("audio")
    configured = configured_profile()
    if isinstance(video, dict) and isinstance(video.get("codec"), str):
        codec = str(video["codec"]).lower()
        normalized = "h265" if codec in {"hevc", "h265"} else ("h264" if codec in {"h264", "avc"} else ("av1" if codec == "av1" else ("png" if codec == "png" else codec)))
        profile["videoCodec"] = normalized
        copied_video = arguments.get("video_codec") == "copy" or name in {"audio", "loudness", "cevra-mux-audio"}
        if copied_video:
            profile["videoEncoder"] = "copy"
        elif normalized in configured:
            profile["videoEncoder"] = configured[normalized]
        elif normalized == "png":
            profile["videoEncoder"] = "png"
        else:
            profile["videoEncoder"] = "copy"
    if isinstance(audio, dict) and isinstance(audio.get("codec"), str):
        codec = str(audio["codec"]).lower()
        normalized = "pcm" if codec.startswith("pcm_") else codec
        profile["audioCodec"] = normalized
        available = set(runtime_capabilities().get("encoders") or [])
        copied_audio = arguments.get("audio_codec") == "copy"
        profile["audioEncoder"] = "copy" if copied_audio else ("pcm_f32le" if name == "cevra-render-audio-sequence" else (_audio_encoder(normalized, available) or "unknown"))
    payload["effectiveProfile"] = profile
    result["structuredContent"] = payload
    return result


def _call_tool_in_process(name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    if name not in ALLOWED_TOOLS:
        return {"isError": True, "content": [{"type": "text", "text": f"tool {name} is not allowed by CEVRA"}]}
    try:
        _validate_tool_arguments(name, arguments)
    except (PermissionError, ValueError) as exc:
        return {"isError": True, "content": [{"type": "text", "text": str(exc)}]}
    if name != "cevra-measure-audio":
        _ensure_profile()
    custom = call_custom_tool(name, arguments or {}, VENDOR_ROOT)
    if custom is not None:
        return _attach_effective_profile(custom, name, arguments)

    upstream = _load_upstream()
    specs = upstream.specs()
    script = VENDOR_ROOT / "scripts" / f"{name}.py"
    if name not in specs or not script.is_file():
        return {"isError": True, "content": [{"type": "text", "text": f"unknown tool {name}"}]}

    argv = upstream.build_argv(name, arguments or {})
    module_name = f"_cevra_ffmpeg_tool_{name}_{time.time_ns()}"
    spec = importlib.util.spec_from_file_location(module_name, script)
    if spec is None or spec.loader is None:
        return {"isError": True, "content": [{"type": "text", "text": f"cannot load tool {name}"}]}
    module = importlib.util.module_from_spec(spec)
    old_argv = sys.argv
    stdout = io.StringIO()
    stderr = io.StringIO()
    exit_code = 0
    try:
        common = sys.modules.get("_common")
        if common is not None and hasattr(common, "STATE") and hasattr(common.STATE, "reset"):
            common.STATE.reset()
        sys.argv = [str(script), *argv]
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            spec.loader.exec_module(module)
            returned = module.main() if hasattr(module, "main") else 0
            if isinstance(returned, int):
                exit_code = returned
    except SystemExit as exc:
        if isinstance(exc.code, int):
            exit_code = exc.code
        elif exc.code in (None, False):
            exit_code = 0
        else:
            exit_code = 1
    except Exception as exc:
        exit_code = 1
        stderr.write(f"{type(exc).__name__}: {exc}\n")
    finally:
        sys.argv = old_argv
        sys.modules.pop(module_name, None)

    out = stdout.getvalue().strip()
    err = stderr.getvalue().strip()
    structured: Any = None
    if out.startswith("{") or out.startswith("["):
        try:
            structured = json.loads(out)
        except ValueError:
            structured = None
    if exit_code != 0:
        tail = "\n".join(err.splitlines()[-12:]) or out
        return {"isError": True, "content": [{"type": "text", "text": f"{name} failed (exit {exit_code})\n{tail}"}]}
    text = out or "\n".join(err.splitlines()[-5:])
    result: Dict[str, Any] = {"content": [{"type": "text", "text": text}]}
    if structured is not None:
        result["structuredContent"] = structured if isinstance(structured, dict) else {"result": structured}
    return _attach_effective_profile(result, name, arguments)


def _custom_tool_specs() -> List[Dict[str, Any]]:
    path = _PATH_SCHEMA
    positive = {"type": "number", "exclusiveMinimum": 0, "maximum": MAX_MEDIA_DURATION_SECONDS}
    non_negative = {"type": "number", "minimum": 0, "maximum": MAX_MEDIA_DURATION_SECONDS}
    positive_integer = {"type": "integer", "minimum": 1}
    non_negative_integer = {"type": "integer", "minimum": 0}
    millisecond = {"type": "integer", "minimum": 0, "maximum": MAX_MEDIA_DURATION_SECONDS * 1000}
    positive_millisecond = {"type": "integer", "minimum": 1, "maximum": MAX_MEDIA_DURATION_SECONDS * 1000}
    audio_source = {
        "type": "object", "additionalProperties": False,
        "properties": {
            "id": {"type": "string", "minLength": 1, "maxLength": 128},
            "uri": path,
        },
        "required": ["id", "uri"],
    }
    audio_item = {
        "type": "object", "additionalProperties": False,
        "properties": {
            "source_id": {"type": "string", "minLength": 1, "maxLength": 128},
            "source_start_ms": millisecond,
            "source_end_ms": positive_millisecond,
            "timeline_start_ms": millisecond,
            "gain_db": {"type": "number", "minimum": MIN_AUDIO_SEQUENCE_GAIN_DB, "maximum": MAX_AUDIO_SEQUENCE_GAIN_DB},
            "fade_in_ms": millisecond,
            "fade_out_ms": millisecond,
        },
        "required": ["source_id", "source_start_ms", "source_end_ms", "timeline_start_ms"],
    }
    mux_duration_validation = {
        "type": "object", "additionalProperties": False,
        "properties": {
            "version": {"type": "integer", "enum": [1]},
            "video_duration_ms": positive_millisecond,
            "audio_duration_ms": positive_millisecond,
            "input_tolerance_ms": {"type": "integer", "minimum": 0, "maximum": 1000},
            "output_audio_tolerance_ms": {"type": "integer", "minimum": 0, "maximum": 1000},
        },
        "required": ["version", "video_duration_ms", "audio_duration_ms", "input_tolerance_ms", "output_audio_tolerance_ms"],
    }
    schemas = {
        "cevra-measure-audio": {
            "properties": {"version": {"type": "integer", "enum": [1]}, "input": path,
                           "stream_index": {"type": "integer", "minimum": 0, "maximum": 2147483647},
                           "start_ms": millisecond, "end_ms": positive_millisecond},
            "required": ["version", "input", "stream_index", "start_ms", "end_ms"],
        },
        "cevra-extract-frame": {
            "properties": {"input": path, "output": path, "at": non_negative},
            "required": ["input", "output", "at"],
        },
        "cevra-scale": {
            "properties": {"input": path, "output": path, "width": {"type": "integer", "minimum": 1, "maximum": MAX_MEDIA_WIDTH}, "height": {"type": "integer", "minimum": 1, "maximum": MAX_MEDIA_HEIGHT}},
            "required": ["input", "output", "width", "height"],
        },
        "cevra-overlay-media": {
            "properties": {"base": path, "overlay": path, "output": path, "start": {"type": "number", "minimum": 0, "maximum": MAX_MEDIA_DURATION_SECONDS}, "end": {"type": "number", "exclusiveMinimum": 0, "maximum": MAX_MEDIA_DURATION_SECONDS}, "x": non_negative_integer, "y": non_negative_integer, "width": {"type": "integer", "minimum": 1, "maximum": MAX_MEDIA_WIDTH}, "height": {"type": "integer", "minimum": 1, "maximum": MAX_MEDIA_HEIGHT}, "opacity": {"type": "number", "minimum": 0, "maximum": 1}},
            "required": ["base", "overlay", "output", "start", "end", "x", "y", "width", "height"],
        },
        "cevra-speed": {
            "properties": {"input": path, "output": path, "factor": {"type": "number", "minimum": 0.0625, "maximum": 16}},
            "required": ["input", "output", "factor"],
        },
        "cevra-transcode": {
            "properties": {"input": path, "output": path, "container": {"type": "string", "enum": sorted(DELIVERY_CONTAINERS)}, "video_codec": {"type": "string", "enum": sorted(DELIVERY_VIDEO_CODECS)}, "audio_codec": {"type": "string", "enum": sorted(DELIVERY_AUDIO_CODECS)}, "width": {"type": "integer", "minimum": 1, "maximum": MAX_MEDIA_WIDTH}, "height": {"type": "integer", "minimum": 1, "maximum": MAX_MEDIA_HEIGHT}, "fps": {"type": "number", "exclusiveMinimum": 0, "maximum": MAX_MEDIA_FPS}, "drop_video": {"type": "boolean"}},
            "required": ["input", "output"],
        },
        "cevra-mux-audio": {
            "properties": {"video": path, "audio": path, "output": path, "container": {"type": "string", "enum": sorted(DELIVERY_CONTAINERS)}, "audio_codec": {"type": "string", "enum": sorted(DELIVERY_AUDIO_CODECS)}, "replace_existing": {"type": "boolean"}, "duration_validation": mux_duration_validation},
            "required": ["video", "audio", "output"],
        },
        "cevra-render-audio-sequence": {
            "properties": {
                "version": {"type": "integer", "enum": [1]},
                "sources": {"type": "array", "minItems": 1, "maxItems": MAX_MEDIA_INPUTS, "items": audio_source},
                "items": {"type": "array", "minItems": 1, "maxItems": MAX_AUDIO_SEQUENCE_ITEMS, "items": audio_item},
                "output": path,
                "output_duration_ms": positive_millisecond,
                "output_channel_layout": {"type": "string", "enum": ["mono", "stereo"]},
            },
            "required": ["version", "sources", "items", "output", "output_duration_ms", "output_channel_layout"],
        },
    }
    return [
        {"name": name, "description": f"CEVRA typed media operation: {name}", "inputSchema": {"type": "object", "additionalProperties": False, **schemas[name]}}
        for name in sorted(CUSTOM_TOOLS)
    ]


def _schema_for_tool(name: str) -> Dict[str, Any]:
    if name in _UPSTREAM_TOOL_SCHEMAS:
        return _UPSTREAM_TOOL_SCHEMAS[name]
    for spec in _custom_tool_specs():
        if spec["name"] == name:
            return spec["inputSchema"]
    raise PermissionError(f"tool {name} is not allowed by CEVRA")


def _validate_schema_value(value: Any, schema: Dict[str, Any], location: str) -> None:
    expected = schema.get("type")
    valid_type = {
        "object": isinstance(value, dict),
        "array": isinstance(value, list),
        "string": isinstance(value, str),
        "integer": isinstance(value, int) and not isinstance(value, bool),
        "number": isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value),
        "boolean": isinstance(value, bool),
    }
    if expected is not None and not valid_type.get(expected, False):
        raise ValueError(f"{location} must be {expected}")
    if "enum" in schema and value not in schema["enum"]:
        raise ValueError(f"{location} is outside its allowed values")
    if isinstance(value, str) and len(value) < int(schema.get("minLength", 0)):
        raise ValueError(f"{location} must not be empty")
    if isinstance(value, str) and "maxLength" in schema and len(value) > int(schema["maxLength"]):
        raise ValueError(f"{location} exceeds its maximum length")
    if isinstance(value, str) and schema.get("cevraMediaPath"):
        if value.startswith("-") or "\x00" in value or "\r" in value or "\n" in value:
            raise ValueError(f"{location} contains an unsafe media path")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            raise ValueError(f"{location} is below its minimum")
        if "maximum" in schema and value > schema["maximum"]:
            raise ValueError(f"{location} exceeds its maximum")
        if "exclusiveMinimum" in schema and value <= schema["exclusiveMinimum"]:
            raise ValueError(f"{location} must be greater than its minimum")
    if isinstance(value, list):
        if len(value) < int(schema.get("minItems", 0)):
            raise ValueError(f"{location} has too few items")
        if "maxItems" in schema and len(value) > int(schema["maxItems"]):
            raise ValueError(f"{location} has too many items")
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(value):
                _validate_schema_value(item, item_schema, f"{location}[{index}]")
    if isinstance(value, dict):
        properties = schema.get("properties") or {}
        required = schema.get("required") or []
        missing = [key for key in required if key not in value]
        if missing:
            raise ValueError(f"{location} is missing required fields: {', '.join(missing)}")
        if schema.get("additionalProperties") is False:
            extras = sorted(set(value) - set(properties))
            if extras:
                raise ValueError(f"{location} contains unexpected fields: {', '.join(extras)}")
        for key, child in value.items():
            child_schema = properties.get(key)
            if isinstance(child_schema, dict):
                _validate_schema_value(child, child_schema, f"{location}.{key}")


def _validate_tool_arguments(name: str, arguments: Dict[str, Any]) -> None:
    if _contains_raw_argv(arguments):
        raise PermissionError("raw argv execution is not allowed by CEVRA")
    if _contains_non_finite_number(arguments):
        raise ValueError("tool arguments must contain only finite numbers")
    _validate_schema_value(arguments, _schema_for_tool(name), f"tool {name} arguments")
    output = arguments.get("output")
    if isinstance(output, str) and Path(output).absolute().is_symlink():
        raise ValueError("media output path must not be a symlink")


def _contains_raw_argv(value: Any) -> bool:
    if isinstance(value, list):
        return any(_contains_raw_argv(item) for item in value)
    if not isinstance(value, dict):
        return False
    return "argv" in value or any(_contains_raw_argv(child) for child in value.values())


def _contains_non_finite_number(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, float):
        return not math.isfinite(value)
    if isinstance(value, list):
        return any(_contains_non_finite_number(item) for item in value)
    if isinstance(value, dict):
        return any(_contains_non_finite_number(child) for child in value.values())
    return False


def _allowed_tool_specs(upstream: Any) -> List[Dict[str, Any]]:
    available = set(upstream.specs())
    return [
        {
            "name": name,
            "description": f"CEVRA typed media operation: {name}",
            "inputSchema": _UPSTREAM_TOOL_SCHEMAS[name],
        }
        for name in sorted(ALLOWED_UPSTREAM_TOOLS)
        if name in available and (VENDOR_ROOT / "scripts" / f"{name}.py").is_file()
    ]


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def handle(method: str, params: Dict[str, Any]) -> Any:
    if method == "initialize":
        return {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": {"name": "cevra-media-worker", "version": WORKER_VERSION}}
    if method == "ping":
        return {"activeJobId": job_control.active_job_id()}
    if method == "cevra/info":
        return info()
    if method == "cevra/health":
        return health()
    if method == "cevra/configure":
        profile = params.get("profile", {})
        if not isinstance(profile, dict):
            raise ValueError("profile must be an object")
        return configure(profile)
    if method == "cevra/benchmark":
        encoders = params.get("encoders", [])
        if not isinstance(encoders, list):
            raise ValueError("encoders must be an array")
        codec = params.get("codec")
        if not isinstance(codec, str) or codec not in {"h264", "h265", "av1"}:
            raise ValueError("codec must be h264, h265 or av1")
        if any(not isinstance(encoder, str) or not encoder for encoder in encoders):
            raise ValueError("encoders must contain non-empty strings")
        return benchmark(codec, encoders)
    if method == "tools/list":
        upstream = _load_upstream()
        return {"tools": _allowed_tool_specs(upstream) + _custom_tool_specs()}
    raise KeyError(method)


def _write_response(response: Dict[str, Any]) -> None:
    with _CONTROL_WRITE_LOCK:
        _CONTROL_STDOUT.write(json.dumps(response) + "\n")
        _CONTROL_STDOUT.flush()


def _job_response(request_id: Any, job_id: str, name: str, arguments: Dict[str, Any]) -> None:
    global _JOB_THREAD
    response: Dict[str, Any]
    try:
        result = _call_tool_in_process(name, arguments)
        cancelled = job_control.finish_job(job_id)
        if cancelled:
            response = {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32800, "message": f"media job {job_id} was cancelled"}}
        else:
            response = {"jsonrpc": "2.0", "id": request_id, "result": result}
    except BaseException as exc:
        cancelled = job_control.finish_job(job_id)
        code = -32800 if cancelled else -32000
        message = f"media job {job_id} was cancelled" if cancelled else str(exc)
        response = {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}
    finally:
        _JOB_THREAD = None
    _write_response(response)


def _start_job(request_id: Any, params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    global _JOB_THREAD
    job_id = params.get("jobId")
    name = params.get("name")
    arguments = params.get("arguments", {})
    if not isinstance(job_id, str) or not job_id.strip():
        raise ValueError("jobId must be a non-empty string")
    if not isinstance(name, str) or not name:
        raise ValueError("tool name must be a non-empty string")
    if not isinstance(arguments, dict):
        raise ValueError("tool arguments must be an object")
    if name not in ALLOWED_TOOLS:
        raise PermissionError(f"tool {name} is not allowed by CEVRA")
    _validate_tool_arguments(name, arguments)
    if _JOB_THREAD is not None or job_control.active_job_id() is not None:
        return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32001, "message": "media worker is busy"}}
    job_control.begin_job(job_id)
    thread = threading.Thread(target=_job_response, args=(request_id, job_id, name, arguments), name=f"cevra-media-job-{job_id}")
    _JOB_THREAD = thread
    try:
        thread.start()
    except BaseException:
        _JOB_THREAD = None
        job_control.finish_job(job_id)
        raise
    return None


def _control_response(request_id: Any, control_id: str, method: str, params: Dict[str, Any]) -> None:
    global _JOB_THREAD
    try:
        result = handle(method, params)
        cancelled = job_control.finish_job(control_id)
        response = {"jsonrpc": "2.0", "id": request_id, **({"error": {"code": -32800, "message": "control request cancelled"}} if cancelled else {"result": result})}
    except BaseException as exc:
        cancelled = job_control.finish_job(control_id)
        response = {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32800 if cancelled else -32000, "message": "control request cancelled" if cancelled else str(exc)}}
    finally:
        _JOB_THREAD = None
    _write_response(response)


def _start_control(request_id: Any, method: str, params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    global _JOB_THREAD
    if _JOB_THREAD is not None or job_control.active_job_id() is not None:
        return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32001, "message": "media worker is busy"}}
    control_id = f"control:{request_id}"
    job_control.begin_job(control_id)
    thread = threading.Thread(target=_control_response, args=(request_id, control_id, method, params), name=f"cevra-media-control-{request_id}")
    _JOB_THREAD = thread
    try:
        thread.start()
    except BaseException:
        _JOB_THREAD = None
        job_control.finish_job(control_id)
        raise
    return None


def main() -> int:
    _prepare_path()
    if "--info" in sys.argv:
        print(json.dumps(info(), indent=2))
        return 0
    if "--health" in sys.argv:
        report = health()
        print(json.dumps(report, indent=2))
        return 0 if report.get("ok") else 1
    shutting_down = False
    try:
        for raw in sys.stdin.buffer:
            line = raw.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            try:
                req = json.loads(line)
            except ValueError:
                continue
            if not isinstance(req, dict) or "id" not in req:
                continue
            response: Optional[Dict[str, Any]] = None
            try:
                params = req.get("params", {})
                if not isinstance(params, dict):
                    raise ValueError("params must be an object")
                method = req.get("method", "")
                if not isinstance(method, str):
                    raise ValueError("method must be a string")
                if method == "tools/call":
                    response = _start_job(req["id"], params)
                elif method in {"cevra/info", "cevra/health", "cevra/benchmark"}:
                    response = _start_control(req["id"], method, params)
                elif method == "cevra/cancel":
                    job_id = params.get("jobId")
                    if not isinstance(job_id, str) or not job_id:
                        raise ValueError("jobId must be a non-empty string")
                    response = {"jsonrpc": "2.0", "id": req["id"], "result": {"cancelled": job_control.cancel(job_id), "jobId": job_id}}
                elif method == "cevra/shutdown":
                    active = job_control.active_job_id()
                    if active:
                        job_control.cancel(active)
                    shutting_down = True
                    response = {"jsonrpc": "2.0", "id": req["id"], "result": {"shuttingDown": True}}
                elif job_control.active_job_id() is not None and method not in ("ping",):
                    response = {"jsonrpc": "2.0", "id": req["id"], "error": {"code": -32001, "message": "media worker is busy"}}
                else:
                    response = {"jsonrpc": "2.0", "id": req["id"], "result": handle(method, params)}
            except KeyError as exc:
                response = {"jsonrpc": "2.0", "id": req["id"], "error": {"code": -32601, "message": f"method not found: {exc}"}}
            except Exception as exc:
                response = {"jsonrpc": "2.0", "id": req["id"], "error": {"code": -32000, "message": str(exc)}}
            if response is not None:
                _write_response(response)
            if shutting_down:
                break
    finally:
        active = job_control.active_job_id()
        if active:
            job_control.cancel(active)
        thread = _JOB_THREAD
        if thread is not None:
            thread.join(timeout=5.0)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
