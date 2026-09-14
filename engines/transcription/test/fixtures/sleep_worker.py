import json
import sys
import time

request = json.loads(sys.stdin.readline())
if request.get("operation") == "health":
    result = {"protocolVersion": 1, "status": "ready", "fasterWhisperVersion": "1.2.1"}
else:
    time.sleep(30)
    result = {"protocolVersion": 1, "modelId": request["modelId"], "segments": []}
print(json.dumps({"ok": True, "result": result}), flush=True)
