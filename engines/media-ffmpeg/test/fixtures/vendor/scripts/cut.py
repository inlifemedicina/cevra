from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from cevra_job_control import run


def main():
    arguments = json.loads(sys.argv[1])
    if arguments["input"] == "__fixture_crash__":
        os._exit(23)
    output = str(Path(arguments["output"]).resolve())
    pid_file = str(Path(arguments["input"]).resolve())
    if os.environ.get("FFMPEG_SKILL_NO_OVERWRITE") == "1" and Path(output).exists():
        print(f"refusing to overwrite existing output: {output}", file=sys.stderr)
        return 2
    helper = str(Path(__file__).with_name("fixture_process.py"))
    proc = run(
        [sys.executable, "-s", "-B", helper, output, pid_file, str(arguments["end"])],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        artifact_paths=[output],
    )
    if proc.returncode != 0:
        return proc.returncode
    print(json.dumps({"status": "completed", "output": output}))
    return 0
