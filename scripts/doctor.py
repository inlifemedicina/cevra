#!/usr/bin/env python3
import json
import shutil
import subprocess
import sys

TOOLS = {
    "git": ["git", "--version"],
    "node": ["node", "--version"],
    "npm": ["npm", "--version"],
    "rustc": ["rustc", "--version"],
    "cargo": ["cargo", "--version"],
    "ffmpeg": ["ffmpeg", "-version"],
    "ffprobe": ["ffprobe", "-version"],
    "python": [sys.executable, "--version"],
}

def check(cmd):
    executable = cmd[0]
    found = shutil.which(executable) if executable != sys.executable else sys.executable
    if not found:
        return {"available": False}
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        output = result.stdout or result.stderr
        first = output.splitlines()[0] if output.splitlines() else ""
        return {"available": result.returncode == 0, "version": first}
    except Exception as exc:
        return {"available": False, "error": str(exc)}

results = {name: check(cmd) for name, cmd in TOOLS.items()}
print(json.dumps({"cevraDoctorVersion": 1, "tools": results}, indent=2, ensure_ascii=False))
