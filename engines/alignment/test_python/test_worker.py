import importlib.util
import io
import json
import math
import os
import struct
import sys
import tempfile
import unittest
import wave
from pathlib import Path

WORKER = Path(__file__).resolve().parents[1] / "python" / "cevra_alignment_worker.py"
SPEC = importlib.util.spec_from_file_location("cevra_alignment_worker", WORKER)
worker = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(worker)


def request(**overrides):
    value = {
        "protocolVersion": 1, "operation": "align", "jobId": "job", "inputPath": "/tmp/audio.wav",
        "language": "pt", "transcript": {
            "language": "pt",
            "words": [{"id": "w1", "text": "a", "startMs": 0, "endMs": 1}],
            "segments": [{"id": "s1", "text": "a", "startMs": 0, "endMs": 1, "wordIds": ["w1"]}],
        },
        "modelPath": "/tmp/model", "modelId": "model", "modelRevision": "revision",
        "modelDigest": "sha256:model", "allowModelDownload": False, "device": "cpu",
    }
    value.update(overrides)
    return value


class AlignmentWorkerTests(unittest.TestCase):
    def test_closed_protocol_accepts_exact_request(self):
        self.assertEqual(worker._validate_message(request())["jobId"], "job")

    def test_protocol_rejects_unknown_fields_and_downloads(self):
        for value in ({**request(), "extra": True}, {**request(), "allowModelDownload": True}):
            with self.assertRaises(worker.WorkerError) as raised:
                worker._validate_message(value)
            self.assertEqual(raised.exception.code, "INVALID_REQUEST")
        nested = request()
        nested["transcript"]["words"][0]["backendField"] = "forbidden"
        with self.assertRaises(worker.WorkerError):
            worker._validate_message(nested)

    def test_protocol_rejects_unsupported_language_and_remote_path(self):
        with self.assertRaises(worker.WorkerError) as language:
            worker._validate_message(request(language="es"))
        self.assertEqual(language.exception.code, "UNSUPPORTED_LANGUAGE")
        with self.assertRaises(worker.WorkerError):
            worker._validate_message(request(inputPath="https://example.test/audio.wav"))

    def test_ctc_viterbi_alignment_is_deterministic_and_complete(self):
        # Vocabulary: blank=0, a=1, b=2. High-probability path emits a then b.
        emissions = [[-0.1, -0.2, -9.0], [-2.0, -0.01, -9.0], [-0.1, -3.0, -3.0], [-2.0, -9.0, -0.01]]
        self.assertEqual(worker.forced_align(emissions, [1, 2], 0), [(0, 1), (0, 2), (1, 3)])

    def test_ctc_alignment_rejects_partial_path(self):
        with self.assertRaises(worker.WorkerError):
            worker.forced_align([[-0.1, -0.2]], [1, 1], 0)

    def test_alignment_preserves_ids_text_mapping_and_speakers(self):
        transcript = {
            "language": "en",
            "words": [{"id": "w1", "text": "a", "startMs": 0, "endMs": 1, "speakerId": "p1"}, {"id": "w2", "text": "b", "startMs": 1, "endMs": 2, "speakerId": "p1"}],
            "segments": [{"id": "s1", "text": "a b", "startMs": 0, "endMs": 2, "wordIds": ["w1", "w2"], "speakerId": "p1"}],
        }
        emissions = [[-0.1, -0.2, -9.0, -9.0], [-2.0, -0.01, -9.0, -9.0], [-0.01, -9.0, -9.0, -9.0], [-2.0, -9.0, -9.0, -0.01]]
        result = worker.align_transcript(transcript, emissions, {"a": 1, "|": 2, "b": 3}, 0, 16000, 16000)
        self.assertEqual([word["id"] for word in result["words"]], ["w1", "w2"])
        self.assertEqual([word["text"] for word in result["words"]], ["a", "b"])
        self.assertEqual(result["segments"][0]["wordIds"], ["w1", "w2"])
        self.assertEqual(result["words"][0]["speakerId"], "p1")
        self.assertGreater(result["words"][0]["endMs"], result["words"][0]["startMs"])

    def test_unalignable_word_is_not_silently_dropped(self):
        with self.assertRaises(worker.WorkerError):
            worker.align_transcript(request()["transcript"], [[-0.1, -0.2]], {"z": 1}, 0, 16000, 16000)

    def test_pcm_wav_downmix_and_resample(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "stereo.wav")
            with wave.open(path, "wb") as target:
                target.setnchannels(2); target.setsampwidth(2); target.setframerate(8000)
                target.writeframes(b"".join(struct.pack("<hh", value, -value) for value in range(100)))
            samples, rate = worker.load_and_normalize_wav(path, 16000)
            self.assertEqual(rate, 16000)
            self.assertEqual(len(samples), 200)
            self.assertTrue(all(math.isfinite(value) for value in samples))

    def test_worker_errors_use_bounded_envelope(self):
        result = worker.process_message({"protocolVersion": 99, "operation": "health"})
        self.assertEqual(result, {"ok": False, "error": {"code": "INVALID_REQUEST", "message": "Unsupported alignment protocol version."}})


if __name__ == "__main__":
    unittest.main()
