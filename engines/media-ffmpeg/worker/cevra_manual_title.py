"""Closed first-party title component. Runtime-owned font/helper only; no caller paths."""
from __future__ import annotations
import hashlib
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
    if not isinstance(title, dict) or set(title) != {"version", "componentId", "text", "startFrame", "endFrame", "aspect"}:
        raise ValueError("MANUAL_TITLE_INVALID")
    text = title["text"]
    if title["version"] != 1 or isinstance(title["version"], bool) or title["componentId"] != COMPONENT or title["aspect"] not in ("16:9", "9:16"):
        raise ValueError("MANUAL_TITLE_INVALID")
    if not isinstance(text, str) or not text.strip() or re.search(r"[\x00-\x1f\x7f-\x9f\u2028\u2029\ud800-\udfff]", text) or len(text.encode("utf-16-le")) > 160:
        raise ValueError("MANUAL_TITLE_INVALID")
    if any(not isinstance(title[k], int) or isinstance(title[k], bool) or not 0 <= title[k] <= 18144000 for k in ("startFrame", "endFrame")) or title["startFrame"] >= title["endFrame"]:
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

def identity():
    font, helper = assets()
    return {"font": FONT_SHA256, "helper": hashlib.sha256(helper.read_bytes()).hexdigest(),
            "layout": COMPONENT, "rasterizer": "cevra.coretext.inter.v1"}

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
    budget.run_native(common, [str(helper), str(font), str(width), str(height), composition["title"]["text"], str(destination)])
    return width, height
