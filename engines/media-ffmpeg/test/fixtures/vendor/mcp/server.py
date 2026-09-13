from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def specs():
    return {"cut": {}, "redact": {}}


def build_argv(name, arguments):
    return [json.dumps(arguments)]


def tool_list():
    return [
        {"name": "cut", "inputSchema": {"type": "object", "properties": {"output": {"type": "string"}, "argv": {"type": "array"}}, "anyOf": [{"required": ["argv"]}, {"required": ["output"]}]}},
        {"name": "redact", "inputSchema": {"type": "object", "properties": {"input": {"type": "string"}}}},
    ]
