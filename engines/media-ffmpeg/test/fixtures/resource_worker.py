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
    elif request["method"] == "fixture/cache-marker":
        reply(request, {"ownedPreviewCache": request["params"].get("ownedPreviewCache")})
    elif request["method"] == "fixture/cache-pressure":
        # Real production cache objects under the real native RSS observer.
        # Bytes are a synthetic pressure fixture, not admitted/decoded media.
        assert request["params"].get("ownedPreviewCache") is True
        sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "worker"))
        from cevra_preview_segments import SegmentCache, encode
        cache = SegmentCache()
        root = pathlib.Path(request["params"]["root"])
        payload = root / "synthetic-pressure.bin"
        payload.write_bytes(b"p" * (8 * 1024 * 1024 - 4096))
        transaction = cache.transaction()
        for index in range(4):
            transaction.stage(encode({"segment": index}), payload, {"syntheticPressure": True})
        transaction.commit()
        full = cache.state()
        time.sleep(0.25)  # Complete a native RSS sample at the byte ceiling.
        for index in range(4, 8):
            transaction = cache.transaction()
            transaction.stage(encode({"segment": index}), payload, {"syntheticPressure": True})
            transaction.commit()
        evicted = cache.state()
        time.sleep(0.25)
        payload.write_bytes(b"small")
        cache.clear()
        for index in range(65):
            transaction = cache.transaction()
            transaction.stage(encode({"segment": index}), payload, {"syntheticPressure": True})
            transaction.commit()
        entry_pressure = cache.state()
        payload.unlink()
        time.sleep(0.25)  # Ensure at least one complete native sample at retention.
        reply(request, {"full": full, "evicted": evicted, "entryPressure": entry_pressure,
                        "admittedMedia": False})
    elif request["method"] == "tools/call":
        active = request["params"]["jobId"]
        threading.Thread(target=job, args=(request,), daemon=True).start()
    else:
        reply(request, {})
        if request["method"] == "cevra/shutdown":
            break
