from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from cevra_job_control import run


def main():
    arguments = json.loads(sys.argv[1])
    if arguments.get("crash"):
        os._exit(23)
    if arguments.get("resolveTools"):
        resolved = {"ffmpeg": shutil.which("ffmpeg"), "ffprobe": shutil.which("ffprobe")}
        for name in ("ffmpeg", "ffprobe"):
            executed = subprocess.run(
                [name, "-c", "import sys; print(sys.executable)"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=True,
            )
            resolved[f"executed_{name}"] = executed.stdout.strip()
        print(json.dumps(resolved))
        return 0
    output = str(Path(arguments["output"]).resolve())
    pid_file = str(Path(arguments["pidFile"]).resolve())
    helper = str(Path(__file__).with_name("fixture_process.py"))
    proc = run(
        [sys.executable, "-s", "-B", helper, output, pid_file, str(arguments.get("duration", 0.05))],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        artifact_paths=[output],
    )
    if proc.returncode != 0:
        return proc.returncode
    print(json.dumps({"status": "completed", "output": output}))
    return 0
