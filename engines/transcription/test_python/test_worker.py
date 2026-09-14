import importlib.util
import math
import os
import sys
import types
import unittest
from pathlib import Path


WORKER_PATH = Path(__file__).resolve().parents[1] / "python" / "cevra_transcription_worker.py"
SPEC = importlib.util.spec_from_file_location("cevra_transcription_worker", WORKER_PATH)
worker = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(worker)


class FakeWord:
    def __init__(self, start, end, word, probability=None):
        self.start = start
        self.end = end
        self.word = word
        self.probability = probability


class FakeSegment:
    def __init__(self, start=0.0, end=1.0, text=" hello", words=None):
        self.start = start
        self.end = end
        self.text = text
        self.words = words


class FakeInfo:
    language = "en"
    duration = 1.0


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        calls = self.calls

        class FakeModel:
            def __init__(self, model_id, **options):
                calls.append(("model", model_id, options))

            def transcribe(self, input_path, **options):
                calls.append(("transcribe", input_path, options))
                words = [FakeWord(0.0, 1.0, " hello", 0.9)] if options["word_timestamps"] else None
                return iter([FakeSegment(words=words)]), FakeInfo()

        self.module = types.SimpleNamespace(__version__="1.2.1", WhisperModel=FakeModel)
        self.original = sys.modules.get("faster_whisper")
        sys.modules["faster_whisper"] = self.module

    def tearDown(self):
        if self.original is None:
            sys.modules.pop("faster_whisper", None)
        else:
            sys.modules["faster_whisper"] = self.original

    def request(self, **overrides):
        request = {
            "protocolVersion": 1,
            "operation": "transcribe",
            "jobId": "job-1",
            "inputPath": "/tmp/input.wav",
            "wordTimestamps": False,
            "modelId": "base",
            "modelCacheDir": "/tmp/cevra-models",
            "allowModelDownload": False,
            "device": "cpu",
            "computeType": "int8",
        }
        request.update(overrides)
        return request

    def test_health_reports_runtime_version(self):
        response = worker.process_message({"protocolVersion": 1, "operation": "health"})
        self.assertTrue(response["ok"])
        self.assertEqual(response["result"]["fasterWhisperVersion"], "1.2.1")

    def test_wrong_faster_whisper_version_fails_closed(self):
        self.module.__version__ = "9.9.9"
        response = worker.process_message({"protocolVersion": 1, "operation": "health"})
        self.assertFalse(response["ok"])
        self.assertEqual(response["error"]["code"], "RUNTIME_UNAVAILABLE")

    def test_model_unavailable_has_stable_error_boundary(self):
        class UnavailableModel:
            def __init__(self, *_args, **_kwargs):
                raise RuntimeError("backend diagnostic")

        self.module.WhisperModel = UnavailableModel
        response = worker.process_message(self.request())
        self.assertFalse(response["ok"])
        self.assertEqual(response["error"]["code"], "MODEL_UNAVAILABLE")
        self.assertNotIn("backend diagnostic", response["error"]["message"])

    def test_managed_mode_requires_cpython_312(self):
        previous = os.environ.get("CEVRA_TRANSCRIPTION_MANAGED")
        os.environ["CEVRA_TRANSCRIPTION_MANAGED"] = "1"
        try:
            response = worker.process_message({"protocolVersion": 1, "operation": "health"})
        finally:
            if previous is None:
                os.environ.pop("CEVRA_TRANSCRIPTION_MANAGED", None)
            else:
                os.environ["CEVRA_TRANSCRIPTION_MANAGED"] = previous
        if sys.version_info[:2] == (3, 12):
            self.assertTrue(response["ok"])
        else:
            self.assertFalse(response["ok"])
            self.assertEqual(response["error"]["code"], "RUNTIME_UNAVAILABLE")

    def test_standard_transcription_omits_words_and_network_download(self):
        response = worker.process_message(self.request(language="pt"))
        self.assertTrue(response["ok"])
        result = response["result"]
        self.assertNotIn("words", result["segments"][0])
        model_call = self.calls[0]
        self.assertEqual(model_call[2]["local_files_only"], True)
        transcribe_call = self.calls[1]
        self.assertEqual(transcribe_call[2]["language"], "pt")
        self.assertEqual(transcribe_call[2]["task"], "transcribe")

    def test_native_word_timestamps_are_returned_when_requested(self):
        response = worker.process_message(self.request(wordTimestamps=True))
        words = response["result"]["segments"][0]["words"]
        self.assertEqual(words, [{"startSeconds": 0.0, "endSeconds": 1.0, "text": " hello", "confidence": 0.9}])
        self.assertTrue(self.calls[1][2]["word_timestamps"])

    def test_auto_language_omits_language_argument_and_propagates_detection(self):
        response = worker.process_message(self.request())
        self.assertNotIn("language", self.calls[1][2])
        self.assertEqual(response["result"]["detectedLanguage"], "en")

    def test_closed_schema_rejects_remote_paths_and_extra_fields(self):
        remote = worker.process_message(self.request(inputPath="https://example.com/audio.wav"))
        self.assertFalse(remote["ok"])
        self.assertEqual(remote["error"]["code"], "INVALID_REQUEST")
        extra = worker.process_message(self.request(argv=["--help"]))
        self.assertFalse(extra["ok"])
        self.assertEqual(extra["error"]["code"], "INVALID_REQUEST")
        self.assertEqual(self.calls, [])

    def test_invalid_backend_timestamps_fail_closed(self):
        calls = self.calls

        class InvalidModel:
            def __init__(self, *_args, **_kwargs):
                calls.append("model")

            def transcribe(self, *_args, **_kwargs):
                return iter([FakeSegment(start=math.nan)]), FakeInfo()

        self.module.WhisperModel = InvalidModel
        response = worker.process_message(self.request())
        self.assertFalse(response["ok"])
        self.assertEqual(response["error"]["code"], "TRANSCRIPTION_FAILED")


if __name__ == "__main__":
    unittest.main()
