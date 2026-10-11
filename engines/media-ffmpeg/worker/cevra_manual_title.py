"""Closed first-party title component. Runtime-owned font/helper only; no caller paths."""
from __future__ import annotations
import hashlib
import math
import os
import platform
import re
import sys
from pathlib import Path

FONT_SHA256 = "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031"
COMPONENT = "cevra.title.lower-third.inter.v1"

def validate(value):
    if not isinstance(value, dict) or set(value) != {"version", "title", "fontSha256", "rasterizerId"}:
        raise ValueError("MANUAL_TITLE_INVALID")
    if value["version"] != 1 or isinstance(value["version"], bool) or value["fontSha256"] != FONT_SHA256 or value["rasterizerId"] != "cevra.coretext.inter.v1":
        raise ValueError("MANUAL_TITLE_INVALID")
    title = value["title"]
    if not isinstance(title, dict) or set(title) != ({"version", "componentId", "text", "startFrame", "endFrame", "aspect"} | ({"layout"} if title.get("version") == 2 else set())):
        raise ValueError("MANUAL_TITLE_INVALID")
    text = title["text"]
    if title["version"] not in (1, 2) or isinstance(title["version"], bool) or title["componentId"] != COMPONENT or title["aspect"] not in ("16:9", "9:16"):
        raise ValueError("MANUAL_TITLE_INVALID")
    if not isinstance(text, str) or not text.strip() or re.search(r"[\x00-\x1f\x7f-\x9f\u2028\u2029\ud800-\udfff]", text) or len(text.encode("utf-16-le")) > 160:
        raise ValueError("MANUAL_TITLE_INVALID")
    if any(not isinstance(title[k], int) or isinstance(title[k], bool) or not 0 <= title[k] <= 18144000 for k in ("startFrame", "endFrame")) or title["startFrame"] >= title["endFrame"]:
        raise ValueError("MANUAL_TITLE_INVALID")
    if title["version"] == 2:
        layout = title["layout"]
        if not isinstance(layout, dict) or set(layout) != {"version", "x", "y", "width", "fontScale"} or type(layout["version"]) is not int or layout["version"] != 1:
            raise ValueError("MANUAL_TITLE_INVALID")
        if any(type(layout[k]) not in (int, float) or not math.isfinite(layout[k]) for k in ("x", "y", "width", "fontScale")):
            raise ValueError("MANUAL_TITLE_INVALID")
        height = (56 / 1080 if title["aspect"] == "16:9" else 48 / 1920) * 1.9 * layout["fontScale"]
        if not 0.2 <= layout["width"] <= 1 or not 0.5 <= layout["fontScale"] <= 2 or layout["x"] < 0 or layout["y"] < 0 or layout["x"] + layout["width"] > 1 + 1e-9 or layout["y"] + height > 1 + 1e-9:
            raise ValueError("MANUAL_TITLE_INVALID")
    return value

def assets():
    root = Path(__file__).resolve().parent.parent / "components" / "manual-title"
    font, helper = root / "Inter.ttf", root / "rasterizer"
    if sys.platform != "darwin" or not font.is_file() or not helper.is_file() or font.is_symlink() or helper.is_symlink():
        raise RuntimeError("MANUAL_TITLE_UNAVAILABLE")
    if hashlib.sha256(font.read_bytes()).hexdigest() != FONT_SHA256:
        raise RuntimeError("MANUAL_TITLE_FONT_INVALID")
    return font, helper

def available():
    try:
        assets()
        return True
    except (OSError, RuntimeError):
        return False

def native_font_identity():
    # macOS owns this sealed collection. Fresh dev/inode/size/mtime/ctime identities
    # invalidate derived bytes on replacement/update; actual shaped faces are hashed
    # by CoreText's raster report. Never scan user-installed fonts.
    root = Path("/System/Library/Fonts")
    digest = hashlib.sha256(repr((platform.mac_ver()[0], os.uname().version)).encode())
    for path in sorted(root.rglob("*")):
        if path.is_dir():
            continue
        resolved = path.resolve(strict=True)
        if not resolved.is_relative_to(root):
            raise RuntimeError("MANUAL_TITLE_FONT_INVALID")
        stamp = resolved.stat()
        digest.update(repr((str(path), str(resolved), stamp.st_dev, stamp.st_ino, stamp.st_size, stamp.st_mtime_ns, stamp.st_ctime_ns)).encode())
    return digest.hexdigest()

def identity():
    font, helper = assets()
    return {"font": FONT_SHA256, "helper": hashlib.sha256(helper.read_bytes()).hexdigest(),
            "nativeFonts": native_font_identity(), "layout": COMPONENT, "rasterizer": "cevra.coretext.inter.v1"}

def local_interval(composition, offset, frames):
    title = composition["title"]
    start, end = max(0, title["startFrame"] - offset), min(frames, title["endFrame"] - offset)
    return (start, end) if start < end else None

def rasterize(common, budget, composition, destination):
    validate(composition)
    font, helper = assets()
    portrait = composition["title"]["aspect"] == "9:16"
    width, height = (1080, 1920) if portrait else (1920, 1080)
    budget.reserve(destination, width * height * 4 + 65536)
    args = [str(helper), str(font), str(width), str(height), composition["title"]["text"]]
    if composition["title"]["version"] == 2:
        layout = composition["title"]["layout"]
        args += [str(layout[k]) for k in ("x", "y", "width", "fontScale")]
    args.append(str(destination))
    budget.run_native(common, args)
    return width, height
