from __future__ import annotations

import os
import sys
import time
from pathlib import Path

output = Path(sys.argv[1])
pid_file = Path(sys.argv[2])
duration = float(sys.argv[3])
pid_file.write_text(str(os.getpid()), encoding="utf-8")
output.write_text("partial", encoding="utf-8")
time.sleep(duration)
output.write_text("completed", encoding="utf-8")
