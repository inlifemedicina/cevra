import json
import sys
import time

request = json.loads(sys.stdin.readline())
if request.get("operation") == "health":
    response = {"ok": True, "result": {"protocolVersion": 1, "status": "ready", "alignmentVersion": "0.1.0"}}
elif request.get("jobId") == "sleep":
    time.sleep(30)
    response = {"ok": True, "result": {}}
elif request.get("jobId") == "invalid-json":
    sys.stdout.write("not-json\n"); sys.stdout.flush(); raise SystemExit(0)
elif request.get("jobId") == "output-limit":
    sys.stdout.write("x" * (33 * 1024 * 1024)); sys.stdout.flush(); raise SystemExit(0)
elif request.get("jobId") == "utf8":
    response = {"ok": True, "result": {"text": "Ação, saúde e coração 😀"}}
else:
    response = {"ok": True, "result": {"echo": request}}
sys.stdout.write(json.dumps(response) + "\n")
sys.stdout.flush()
