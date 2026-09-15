from __future__ import annotations

import importlib.util
import sys
import time
import types
from pathlib import Path


worker_path = Path(sys.argv[1]).resolve()
spec = importlib.util.spec_from_file_location("cevra_containment_worker", worker_path)
worker = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(worker)


class FakeInfo:
    language = "en"
    duration = 1.0


class FakeModel:
    def __init__(self, *_args, **_kwargs):
        pass

    def transcribe(self, *_args, **_kwargs):
        def segments():
            while True:
                time.sleep(60)
                yield None

        return segments(), FakeInfo()


sys.modules["faster_whisper"] = types.SimpleNamespace(__version__="1.2.1", WhisperModel=FakeModel)
raise SystemExit(worker.main())
