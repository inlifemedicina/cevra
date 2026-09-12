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

WORKER_VERSION = "0.1.0"
PROTOCOL_VERSION = 1
UPSTREAM_VERSION = "1.4.2"
UPSTREAM_COMMIT = "58f64f9d9e6a0ced4a4cd6a198d7476dede50d1a"
UPSTREAM_CONTRACT = "1.0"
EXPECTED_FFMPEG_VERSION = "9.0.1"
EXPECTED_FFMPEG_SOURCE = "https://ffmpeg.org/releases/ffmpeg-9.0.1.tar.xz"
EXPECTED_FFMPEG_SIGNATURE = "https://ffmpeg.org/releases/ffmpeg-9.0.1.tar.xz.asc"
EXPECTED_FFMPEG_FINGERPRINT = "FCF986EA15E6E293A5644F10B4322F04D67658D8"
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
    )

from cevra_native_tools import AUDIO_CODECS as DELIVERY_AUDIO_CODECS
from cevra_native_tools import CUSTOM_TOOLS, DELIVERY_MATRIX, VIDEO_CODECS as DELIVERY_VIDEO_CODECS, call_custom_tool
import cevra_job_control as job_control
from runtime_profile import adapt_required_capabilities, configured_profile, ensure_functional_profile

_UPSTREAM: Any = None
_CONTROL_STDOUT = sys.stdout
_CONTROL_WRITE_LOCK = threading.Lock()
_JOB_THREAD: Optional[threading.Thread] = None
ALLOWED_UPSTREAM_TOOLS = frozenset({
    "audio", "crop", "cut", "fit", "join", "loudness", "probe", "silence",
})
ALLOWED_TOOLS = ALLOWED_UPSTREAM_TOOLS | CUSTOM_TOOLS
DELIVERY_CONTAINERS = frozenset(DELIVERY_MATRIX)


def _object_schema(properties: Dict[str, Any], required: List[str]) -> Dict[str, Any]:
    return {"type": "object", "additionalProperties": False, "properties": properties, "required": required}


_PATH_SCHEMA = {"type": "string", "minLength": 1, "cevraMediaPath": True}
_NUMBER_SCHEMA = {"type": "number"}
_POSITIVE_SCHEMA = {"type": "number", "exclusiveMinimum": 0}
_NON_NEGATIVE_SCHEMA = {"type": "number", "minimum": 0}
_POSITIVE_INTEGER_SCHEMA = {"type": "integer", "minimum": 1}
_NON_NEGATIVE_INTEGER_SCHEMA = {"type": "integer", "minimum": 0}
_UPSTREAM_TOOL_SCHEMAS: Dict[str, Dict[str, Any]] = {
    "audio": _object_schema({
        "input": _PATH_SCHEMA, "output": _PATH_SCHEMA, "gain": _NUMBER_SCHEMA,
        "fade_in": _NON_NEGATIVE_SCHEMA, "fade_out": _NON_NEGATIVE_SCHEMA,
    }, ["input", "output"]),
    "crop": _object_schema({
        "input": _PATH_SCHEMA, "output": _PATH_SCHEMA, "x": _NON_NEGATIVE_INTEGER_SCHEMA,
        "y": _NON_NEGATIVE_INTEGER_SCHEMA, "width": _POSITIVE_INTEGER_SCHEMA,
        "height": _POSITIVE_INTEGER_SCHEMA,
    }, ["input", "output", "x", "y", "width", "height"]),
    "cut": _object_schema({
        "input": _PATH_SCHEMA, "output": _PATH_SCHEMA, "start": _NON_NEGATIVE_SCHEMA,
        "end": _POSITIVE_SCHEMA, "accurate": {"type": "boolean"},
    }, ["input", "output", "start", "end", "accurate"]),
    "fit": _object_schema({
        "input": _PATH_SCHEMA, "output": _PATH_SCHEMA, "width": _POSITIVE_INTEGER_SCHEMA,
        "height": _POSITIVE_INTEGER_SCHEMA, "fit": {"type": "string", "enum": ["pad", "crop"]},
        "pad_color": _PATH_SCHEMA,
    }, ["input", "output", "width", "height", "fit"]),
    "join": _object_schema({
        "inputs": {"type": "array", "minItems": 1, "items": _PATH_SCHEMA}, "output": _PATH_SCHEMA,
    }, ["inputs", "output"]),
    "loudness": _object_schema({
        "input": _PATH_SCHEMA, "output": _PATH_SCHEMA, "lufs": _NUMBER_SCHEMA, "tp": _NUMBER_SCHEMA,
    }, ["input", "output", "lufs"]),
    "probe": _object_schema({
        "inputs": {"type": "array", "minItems": 1, "items": _PATH_SCHEMA},
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
        return subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout)
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
    build = _ffmpeg_build()
    return {
        "platform": _platform(),
        "arch": platform.machine() or "unknown",
        "ffmpegVersion": build.get("version"),
        "ffmpegLicense": build.get("license"),
        "encoders": _encoders(),
        "hwaccels": _hwaccels(),
    }


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


def _custom_health(tools: Dict[str, Dict[str, Any]], profile: Dict[str, str], ffmpeg_present: bool) -> None:
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
                detail += "; HDR output requires an approved HEVC encoder"
            tools[name] = {"usable": "yes", "detail": detail}
    for name in ("cevra-transcode", "cevra-mux-audio"):
        tools[name] = {"usable": "yes" if ffmpeg_present else "no", **({} if ffmpeg_present else {"missing": ["ffmpeg"]})}
    png_available = ffmpeg_present and "png" in _encoders()
    tools["cevra-extract-frame"] = {
        "usable": "yes" if png_available else "no",
        **({} if png_available else {"missing": ["PNG encoder" if ffmpeg_present else "ffmpeg"]}),
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

    _custom_health(tools, profile, bool(ffmpeg and ffprobe))
    ok = not any(item["status"] == "FAIL" for item in checks)
    return {
        "ok": ok,
        "checkedAt": _now_iso(),
        "checks": checks,
        "tools": tools,
        "runtime": runtime_capabilities(),
    }


def configure(profile: Dict[str, Any]) -> Dict[str, Any]:
    caps = runtime_capabilities()
    encoders = set(caps["encoders"])
    hwaccels = set(caps["hwaccels"])
    mappings = {
        "h264Encoder": "CEVRA_VIDEO_ENCODER_H264",
        "hevcEncoder": "CEVRA_VIDEO_ENCODER_HEVC",
        "av1Encoder": "CEVRA_VIDEO_ENCODER_AV1",
    }
    for key, env_name in mappings.items():
        value = profile.get(key)
        if value is None or value == "":
            os.environ.pop(env_name, None)
            continue
        if not isinstance(value, str) or value not in encoders:
            raise ValueError(f"encoder {value!r} for {key} is not available in this runtime")
        os.environ[env_name] = value
    accel = profile.get("decodeAcceleration")
    if accel is None or accel == "":
        os.environ.pop("CEVRA_DECODE_ACCELERATION", None)
    else:
        if not isinstance(accel, str) or accel not in hwaccels:
            raise ValueError(f"decode acceleration {accel!r} is not available")
        os.environ["CEVRA_DECODE_ACCELERATION"] = accel
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


def _call_tool_in_process(name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    if name not in ALLOWED_TOOLS:
        return {"isError": True, "content": [{"type": "text", "text": f"tool {name} is not allowed by CEVRA"}]}
    try:
        _validate_tool_arguments(name, arguments)
    except (PermissionError, ValueError) as exc:
        return {"isError": True, "content": [{"type": "text", "text": str(exc)}]}
    _ensure_profile()
    custom = call_custom_tool(name, arguments or {}, VENDOR_ROOT)
    if custom is not None:
        return custom

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
    return result


def _custom_tool_specs() -> List[Dict[str, Any]]:
    path = _PATH_SCHEMA
    positive = {"type": "number", "exclusiveMinimum": 0}
    non_negative = {"type": "number", "minimum": 0}
    positive_integer = {"type": "integer", "minimum": 1}
    non_negative_integer = {"type": "integer", "minimum": 0}
    schemas = {
        "cevra-extract-frame": {
            "properties": {"input": path, "output": path, "at": non_negative},
            "required": ["input", "output", "at"],
        },
        "cevra-scale": {
            "properties": {"input": path, "output": path, "width": positive_integer, "height": positive_integer},
            "required": ["input", "output", "width", "height"],
        },
        "cevra-overlay-media": {
            "properties": {"base": path, "overlay": path, "output": path, "start": non_negative, "end": positive, "x": non_negative_integer, "y": non_negative_integer, "width": positive_integer, "height": positive_integer, "opacity": {"type": "number", "minimum": 0, "maximum": 1}},
            "required": ["base", "overlay", "output", "start", "end", "x", "y", "width", "height"],
        },
        "cevra-speed": {
            "properties": {"input": path, "output": path, "factor": {"type": "number", "minimum": 0.0625, "maximum": 16}},
            "required": ["input", "output", "factor"],
        },
        "cevra-transcode": {
            "properties": {"input": path, "output": path, "container": {"type": "string", "enum": sorted(DELIVERY_CONTAINERS)}, "video_codec": {"type": "string", "enum": sorted(DELIVERY_VIDEO_CODECS)}, "audio_codec": {"type": "string", "enum": sorted(DELIVERY_AUDIO_CODECS)}, "width": positive_integer, "height": positive_integer, "fps": positive, "drop_video": {"type": "boolean"}},
            "required": ["input", "output"],
        },
        "cevra-mux-audio": {
            "properties": {"video": path, "audio": path, "output": path, "container": {"type": "string", "enum": sorted(DELIVERY_CONTAINERS)}, "audio_codec": {"type": "string", "enum": sorted(DELIVERY_AUDIO_CODECS)}, "replace_existing": {"type": "boolean"}},
            "required": ["video", "audio", "output"],
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
        return {}
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
    thread.start()
    return None


def main() -> int:
    _prepare_path()
    if "--info" in sys.argv:
        print(json.dumps(info(), indent=2))
        return 0
    if "--health" in sys.argv:
        print(json.dumps(health(), indent=2))
        return 0
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
