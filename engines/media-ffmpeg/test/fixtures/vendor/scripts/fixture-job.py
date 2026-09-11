from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from cevra_job_control import run


def main():
    arguments = json.loads(sys.argv[1])
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
