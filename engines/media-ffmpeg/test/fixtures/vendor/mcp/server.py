from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def specs():
    return {"fixture-job": {}, "crash-worker": {}}


def build_argv(name, arguments):
    return [json.dumps(arguments)]


def tool_list():
    return [
        {"name": "fixture-job", "inputSchema": {"type": "object"}},
        {"name": "crash-worker", "inputSchema": {"type": "object"}},
    ]
