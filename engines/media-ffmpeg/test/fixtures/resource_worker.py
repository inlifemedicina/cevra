"""Owned offline process fixture; no media, account, model, login or network calls."""
import json
import os
import pathlib
import subprocess
import sys
import threading
import time

if len(sys.argv) > 1 and sys.argv[1] in ("memory-child", "idle-child"):
    allocation = bytearray((270 if sys.argv[1] == "memory-child" else 1) * 1024 * 1024)
    pathlib.Path(sys.argv[2]).write_text(str(os.getpid()))
    time.sleep(30)
    raise SystemExit(0)

if len(sys.argv) > 1 and sys.argv[1] == "orphan-parent":
    pid = os.fork()
    if pid:
        raise SystemExit(0)
    pathlib.Path(sys.argv[2]).write_text(str(os.getpid()))
    allocation = bytearray(32 * 1024 * 1024)
    time.sleep(30)
    raise SystemExit(0)

output_lock = threading.Lock()
active = None
def reply(request, result):
    with output_lock:
        print(json.dumps({"jsonrpc": "2.0", "id": request["id"], "result": result}), flush=True)

def job(request):
    global active
    root = pathlib.Path(request["params"]["root"])
    mode = request["params"].get("mode", "memory")
    if mode == "logical-budget-error":
        active = None
        with output_lock:
            print(json.dumps({"jsonrpc": "2.0", "id": request["id"], "error": {
                "code": request["params"].get("errorCode", -32002), "message": "MEDIA_RENDER_DISK_LIMIT"}}), flush=True)
        return
    children = [subprocess.Popen([sys.executable, "-I", "-B", __file__, "memory-child" if mode == "memory" else "idle-child", str(root / f"child-{i}.pid")]) for i in range(2 if mode == "memory" else 1)]
    for child in children:
        child.wait()
    active = None
    reply(request, {"completed": True})

for line in sys.stdin:
    request = json.loads(line)
    if request["method"] == "ping":
        reply(request, {"activeJobId": active, "jobThreadActive": active is not None})
    elif request["method"] == "tools/call":
        active = request["params"]["jobId"]
        threading.Thread(target=job, args=(request,), daemon=True).start()
    else:
        reply(request, {})
        if request["method"] == "cevra/shutdown":
            break
