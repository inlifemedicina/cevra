from __future__ import annotations

import base64
import json
import subprocess
import sys
import time


def write_split(value: object, needle: str, split_after_bytes: int) -> None:
    encoded = json.dumps({"ok": True, "result": value}, ensure_ascii=False).encode("utf-8")
    marker = needle.encode("utf-8")
    offset = encoded.index(marker) + split_after_bytes
    sys.stdout.buffer.write(encoded[:offset])
    sys.stdout.buffer.flush()
    time.sleep(0.05)
    sys.stdout.buffer.write(encoded[offset:])
    sys.stdout.buffer.flush()


def delayed_tail(encoded_tail: str) -> None:
    time.sleep(0.2)
    sys.stdout.buffer.write(base64.b64decode(encoded_tail))
    sys.stdout.buffer.flush()


def main() -> int:
    if len(sys.argv) == 3 and sys.argv[1] == "--delayed-tail":
        delayed_tail(sys.argv[2])
        return 0

    request = json.loads(sys.stdin.readline())
    scenario = request.get("modelId")
    if scenario == "split-utf8-ptbr":
        write_split({"text": "Ação, saúde e coração"}, "ç", 1)
        return 0
    if scenario == "split-utf8-four-byte":
        write_split({"text": "CEVRA 😀 Orbit"}, "😀", 2)
        return 0
    if scenario == "exit-before-close":
        encoded = json.dumps(
            {"ok": True, "result": {"text": "complete only after stream close"}},
            ensure_ascii=False,
        ).encode("utf-8")
        split_at = encoded.index(b"after")
        sys.stdout.buffer.write(encoded[:split_at])
        sys.stdout.buffer.flush()
        subprocess.Popen(
            [sys.executable, __file__, "--delayed-tail", base64.b64encode(encoded[split_at:]).decode("ascii")],
            stdin=subprocess.DEVNULL,
        )
        return 0
    if scenario == "invalid-json":
        sys.stdout.buffer.write(b"not json")
        return 0
    if scenario == "abnormal-exit":
        sys.stderr.write("fixture failed\n")
        return 7
    if scenario == "output-limit":
        sys.stdout.buffer.write(b"x" * (16 * 1024 * 1024 + 1024))
        sys.stdout.buffer.flush()
        return 0
    sys.stderr.write("unknown transport fixture scenario\n")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
