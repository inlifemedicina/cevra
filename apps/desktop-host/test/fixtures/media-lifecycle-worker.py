import os
import sys
from pathlib import Path


repo_root = sys.argv[1]
pid_file = Path(sys.argv[2])
sys.path.insert(0, os.path.join(repo_root, "engines", "media-ffmpeg", "worker"))

import cevra_job_control as job_control
import cevra_media_worker as media_worker


def controlled_tool(name, arguments):
    if name != "desktop-host-containment-test":
        raise RuntimeError("unexpected controlled test tool")
    child = job_control.popen([sys.executable, "-c", "import time; time.sleep(60)"])
    pid_file.write_text(str(child.pid), encoding="utf-8")
    child.wait()
    return {"completed": True}


media_worker.ALLOWED_TOOLS = media_worker.ALLOWED_TOOLS | {"desktop-host-containment-test"}
media_worker._validate_tool_arguments = lambda _name, _arguments: None
media_worker._call_tool_in_process = controlled_tool
raise SystemExit(media_worker.main())
