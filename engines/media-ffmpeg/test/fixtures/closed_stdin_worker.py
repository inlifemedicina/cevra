import json
import os
import sys
import time

# Confirm initialization only after closing the reader; stay alive until killed.
request = json.loads(sys.stdin.readline())
os.close(0)
print(json.dumps({"jsonrpc": "2.0", "id": request["id"], "result": {"activeJobId": None}}), flush=True)
time.sleep(30)
