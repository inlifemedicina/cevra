#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

WORKER_VERSION = "0.1.0"
PROTOCOL_VERSION = 1
UPSTREAM_VERSION = "1.4.2"
UPSTREAM_COMMIT = "58f64f9d9e6a0ced4a4cd6a198d7476dede50d1a"
UPSTREAM_CONTRACT = "1.0"


def _default_root() -> Path:
    frozen = getattr(sys, "_MEIPASS", None)
    if frozen:
        return Path(str(frozen)).resolve()
    return Path(__file__).resolve().parent.parent


RUNTIME_ROOT = Path(os.environ.get("CEVRA_MEDIA_RUNTIME_ROOT", str(_default_root()))).resolve()
BIN_DIR = Path(os.environ.get("CEVRA_MEDIA_BIN_DIR", str(RUNTIME_ROOT / "bin"))).resolve()
VENDOR_ROOT = Path(os.environ.get("CEVRA_FFMPEG_SKILL_ROOT", str(RUNTIME_ROOT / "vendor" / "ffmpeg-skill"))).resolve()
RELEASE_MODE = os.environ.get("CEVRA_RELEASE_MODE", "0") not in ("", "0", "false", "False")
_UPSTREAM: Any = None


def _prepare_path() -> None:
    if BIN_DIR.is_dir():
        os.environ["PATH"] = str(BIN_DIR) + os.pathsep + os.environ.get("PATH", "")


def _tool(name: str) -> Optional[str]:
    _prepare_path()
    return shutil.which(name)


def _is_within(path: str, parent: Path) -> bool:
    try:
        Path(path).resolve().relative_to(parent.resolve())
        return True
    except (ValueError, OSError):
        return False


def _run(argv: List[str], timeout: float = 10.0) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout)


def _ffmpeg_build() -> Dict[str, Any]:
    ffmpeg = _tool("ffmpeg")
    if not ffmpeg:
        return {"path": None, "version": None, "license": None, "configure": []}
    version_proc = _run([ffmpeg, "-version"])
    version_line = (version_proc.stdout or version_proc.stderr).splitlines()[0] if (version_proc.stdout or version_proc.stderr) else ""
    m = re.search(r"ffmpeg version\s+([^\s]+)", version_line)
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
    return {"path": ffmpeg, "version": m.group(1) if m else version_line, "license": license_name, "configure": flags}


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
    values = []
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


def _load_upstream() -> Any:
    global _UPSTREAM
    if _UPSTREAM is not None:
        return _UPSTREAM
    server = VENDOR_ROOT / "mcp" / "server.py"
    scripts = VENDOR_ROOT / "scripts"
    if not server.is_file() or not scripts.is_dir():
        raise RuntimeError(f"vendored ffmpeg-skill is missing under {VENDOR_ROOT}")
    sys.path.insert(0, str(scripts))
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
        _check(checks, "ffmpeg", "FAIL", "FFmpeg is missing")
    if ffprobe:
        bundled = _is_within(ffprobe, BIN_DIR)
        status = "PASS" if bundled or not RELEASE_MODE else "FAIL"
        _check(checks, "ffprobe", status, "ffprobe available", path=ffprobe, bundled=bundled)
    else:
        _check(checks, "ffprobe", "FAIL", "ffprobe is missing")

    license_name = build.get("license")
    if license_name in ("GPL", "NONFREE"):
        _check(checks, "ffmpeg-license", "FAIL" if RELEASE_MODE else "WARN", f"FFmpeg build classified as {license_name}", configure=build.get("configure", []))
    elif license_name:
        _check(checks, "ffmpeg-license", "PASS", f"FFmpeg build classified as {license_name}")
    else:
        _check(checks, "ffmpeg-license", "UNKNOWN", "FFmpeg license classification unavailable")

    tools: Dict[str, Dict[str, Any]] = {}
    try:
        upstream = _load_upstream()
        contract = upstream._contract.build(detect=True)
        caps = contract.get("capabilities") or {}
        available = set(caps.get("available") or [])
        missing = set(caps.get("missing") or [])
        for spec in contract.get("tools") or []:
            required = set(((spec.get("capabilities") or {}).get("required") or []))
            missing_known = sorted(required & missing)
            unknown = sorted(required - available - missing)
            if missing_known:
                tools[spec["name"]] = {"usable": "no", "missing": missing_known}
            elif unknown:
                tools[spec["name"]] = {"usable": "unknown", "missing": unknown}
            else:
                tools[spec["name"]] = {"usable": "yes"}
        _check(checks, "ffmpeg-skill", "PASS", "Vendored ffmpeg-skill loaded", version=UPSTREAM_VERSION, commit=UPSTREAM_COMMIT)
    except Exception as exc:
        _check(checks, "ffmpeg-skill", "FAIL", str(exc))

    ok = not any(item["status"] == "FAIL" for item in checks)
    return {"ok": ok, "checkedAt": _now_iso(), "checks": checks, "tools": tools, "runtime": runtime_capabilities()}


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
            raise ValueError(f"encoder {value!r} for {key} is not available in the bundled runtime")
        os.environ[env_name] = value
    accel = profile.get("decodeAcceleration")
    if accel is None or accel == "":
        os.environ.pop("CEVRA_DECODE_ACCELERATION", None)
    else:
        if not isinstance(accel, str) or accel not in hwaccels:
            raise ValueError(f"decode acceleration {accel!r} is not available")
        os.environ["CEVRA_DECODE_ACCELERATION"] = accel
    return {"configured": True}


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
            "-frames:v", "120", "-an", "-c:v", encoder, "-f", "null", "-"
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
        profile = params.get("profile") or {}
        if not isinstance(profile, dict):
            raise ValueError("profile must be an object")
        return configure(profile)
    if method == "cevra/benchmark":
        encoders = params.get("encoders") or []
        if not isinstance(encoders, list):
            raise ValueError("encoders must be an array")
        return benchmark(str(params.get("codec") or ""), encoders)
    upstream = _load_upstream()
    if method == "tools/list":
        return {"tools": upstream.tool_list()}
    if method == "tools/call":
        return upstream.call_tool(str(params.get("name") or ""), params.get("arguments") or {})
    raise KeyError(method)


def main() -> int:
    _prepare_path()
    if "--info" in sys.argv:
        print(json.dumps(info(), indent=2))
        return 0
    if "--health" in sys.argv:
        print(json.dumps(health(), indent=2))
        return 0
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
        try:
            result = handle(str(req.get("method") or ""), req.get("params") or {})
            response = {"jsonrpc": "2.0", "id": req["id"], "result": result}
        except KeyError as exc:
            response = {"jsonrpc": "2.0", "id": req["id"], "error": {"code": -32601, "message": f"method not found: {exc}"}}
        except Exception as exc:
            response = {"jsonrpc": "2.0", "id": req["id"], "error": {"code": -32000, "message": str(exc)}}
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
