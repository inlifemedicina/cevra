import importlib.util
import math
import os
import struct
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
            "words": [{"id": "w1", "text": "a", "startMs": 0, "endMs": 1000}],
            "segments": [{"id": "s1", "text": "a", "startMs": 0, "endMs": 1000, "wordIds": ["w1"]}],
        },
        "modelPath": "/tmp/model", "modelId": "model", "modelRevision": "revision",
        "modelDigest": "sha256:model", "allowModelDownload": False, "device": "cpu",
    }
    value.update(overrides)
    return value


class FakeReader:
    def __init__(self, duration_ms):
        self.duration_ms = duration_ms
        self.calls = []
        self.largest_sample_count = 0

    def read_window(self, start_ms, end_ms):
        self.calls.append((start_ms, end_ms))
        samples = [0.0] * max(1, end_ms - start_ms)
        self.largest_sample_count = max(self.largest_sample_count, len(samples))
        return samples, 16000


def emissions_for(tokens, width=4):
    rows = []
    for token in tokens:
        row = [-9.0] * width
        row[0] = -2.0
        row[1 if token == -1 else token] = -0.01
        rows.append(row)
    return rows


class QueuedInference:
    def __init__(self, batches):
        self.batches = list(batches)
        self.sample_counts = []

    def __call__(self, samples, _sample_rate):
        self.sample_counts.append(len(samples))
        return self.batches.pop(0)


class AlignmentWorkerTests(unittest.TestCase):
    def test_closed_protocol_accepts_exact_request(self):
        self.assertEqual(worker._validate_message(request())["jobId"], "job")

    def test_protocol_rejects_unknown_fields_downloads_language_and_remote_path(self):
        for value in ({**request(), "extra": True}, {**request(), "allowModelDownload": True}):
            with self.assertRaises(worker.WorkerError) as raised:
                worker._validate_message(value)
            self.assertEqual(raised.exception.code, "INVALID_REQUEST")
        nested = request()
        nested["transcript"]["words"][0]["backendField"] = "forbidden"
        with self.assertRaises(worker.WorkerError):
            worker._validate_message(nested)
        with self.assertRaises(worker.WorkerError) as language:
            worker._validate_message(request(language="es"))
        self.assertEqual(language.exception.code, "UNSUPPORTED_LANGUAGE")
        with self.assertRaises(worker.WorkerError):
            worker._validate_message(request(inputPath="https://example.test/audio.wav"))

    def test_ctc_viterbi_and_repeat_grouping_match_pinned_upstream(self):
        emissions = [[-0.1, -0.2, -9.0], [-2.0, -0.01, -9.0], [-0.1, -3.0, -3.0], [-2.0, -9.0, -0.01]]
        self.assertEqual(worker.forced_align(emissions, [1, 2], 0), [(0, 1), (0, 2), (1, 3)])
        with self.assertRaises(worker.WorkerError):
            worker.forced_align([[-0.1, -0.2]], [1, 1], 0)

    def test_ctc_exact_tie_stays_before_changing_like_whisperx_386(self):
        self.assertEqual(worker.forced_align([[0.0, 0.0], [1.0, 1.0]], [1], 0), [(0, 0), (0, 1)])

    def test_repeated_distant_phrase_uses_exact_windows_and_absolute_times(self):
        vocabulary = {character: index + 1 for index, character in enumerate("obrigadut|")}
        phrase_words = [{"id": "template-1", "text": "obrigado"}, {"id": "template-2", "text": "doutora"}]
        phrase_tokens, _ = worker.tokenize_words(phrase_words, vocabulary, False, "|")
        transcript = {
            "language": "pt",
            "words": [
                {"id": "a1", "text": "obrigado", "startMs": 10_000, "endMs": 10_400, "speakerId": "p1"},
                {"id": "a2", "text": "doutora", "startMs": 10_500, "endMs": 11_000, "speakerId": "p1"},
                {"id": "b1", "text": "obrigado", "startMs": 300_000, "endMs": 300_400},
                {"id": "b2", "text": "doutora", "startMs": 300_500, "endMs": 301_000},
            ],
            "segments": [
                {"id": "s1", "text": "obrigado doutora", "startMs": 10_000, "endMs": 11_000, "wordIds": ["a1", "a2"], "speakerId": "p1"},
                {"id": "s2", "text": "obrigado doutora", "startMs": 300_000, "endMs": 301_000, "wordIds": ["b1", "b2"]},
            ],
        }
        reader = FakeReader(302_000)
        infer = QueuedInference([emissions_for(phrase_tokens, len(vocabulary) + 1), emissions_for(phrase_tokens, len(vocabulary) + 1)])
        result = worker.align_transcript_windows(transcript, reader, infer, vocabulary, 0)
        self.assertEqual(reader.calls, [(10_000, 11_000), (300_000, 301_000)])
        self.assertEqual(len(infer.sample_counts), 2)
        self.assertGreaterEqual(result["words"][0]["startMs"], 10_000)
        self.assertLessEqual(result["words"][1]["endMs"], 11_000)
        self.assertGreaterEqual(result["words"][2]["startMs"], 300_000)
        self.assertEqual([segment["id"] for segment in result["segments"]], ["s1", "s2"])
        self.assertEqual(result["segments"][0]["wordIds"], ["a1", "a2"])

    def test_synthetic_thirty_minute_project_scales_by_window_not_source(self):
        words, segments, batches = [], [], []
        for index in range(180):
            start = index * 10_000
            word_id = f"w{index}"
            words.append({"id": word_id, "text": "a", "startMs": start, "endMs": start + 10_000})
            segments.append({"id": f"s{index}", "text": "a", "startMs": start, "endMs": start + 10_000, "wordIds": [word_id]})
            batches.append(emissions_for([1]))
        reader = FakeReader(1_800_000)
        infer = QueuedInference(batches)
        result = worker.align_transcript_windows({"language": "en", "words": words, "segments": segments}, reader, infer, {"a": 1}, 0)
        self.assertEqual(len(result["segments"]), 180)
        self.assertEqual(len(reader.calls), 180)
        self.assertEqual(reader.largest_sample_count, 10_000)
        self.assertEqual(max(infer.sample_counts), 10_000)
        self.assertNotIn((0, 1_800_000), reader.calls)

    def test_pathological_window_and_token_count_fail_before_inference(self):
        oversized = request()["transcript"]
        oversized["segments"][0]["endMs"] = 10 * 60 * 1000
        oversized["words"][0]["endMs"] = 10 * 60 * 1000
        with self.assertRaises(worker.WorkerError):
            worker.align_transcript_windows(oversized, FakeReader(10 * 60 * 1000), QueuedInference([]), {"a": 1}, 0)
        too_many = request()["transcript"]
        too_many["words"][0]["text"] = "a" * (worker.MAX_CTC_TOKENS_PER_WINDOW + 1)
        with self.assertRaises(worker.WorkerError):
            worker.align_transcript_windows(too_many, FakeReader(2_000), QueuedInference([]), {"a": 1}, 0)

    def test_unknown_characters_use_complete_wildcard_positions(self):
        vocabulary = {"c": 1, "o": 2, "v": 3, "i": 4, "d": 5, "a": 6, "á": 7, "ç": 8, "ã": 9, "|": 10}
        fixtures = ["COVID-19", "2026", "R$500", "SARS-CoV-2", "Dr.", "ação", "áàâãçéêíóôõú", "d'água", "bem-estar", "HbA1c", "7,2%"]
        for text in fixtures:
            tokens, owners = worker.tokenize_words([{"id": "w", "text": text}], vocabulary, False, "|")
            self.assertEqual(len(tokens), len(text), text)
            self.assertEqual(len(owners), len(text), text)
            emissions, resolved = worker.add_wildcard_emissions(emissions_for(tokens, 11), tokens, 0)
            self.assertEqual(len(resolved), len(text), text)
            if any(token == -1 for token in tokens):
                self.assertEqual(len(emissions[0]), 12, text)
                self.assertNotIn(-1, resolved, text)

    def test_numeric_only_word_aligns_through_wildcards_instead_of_being_dropped(self):
        transcript = {
            "language": "pt",
            "words": [{"id": "w1", "text": "2026", "startMs": 0, "endMs": 1000}],
            "segments": [{"id": "s1", "text": "2026", "startMs": 0, "endMs": 1000, "wordIds": ["w1"]}],
        }
        reader = FakeReader(1000)
        result = worker.align_transcript_windows(transcript, reader, QueuedInference([emissions_for([-1, -1, -1, -1], 2)]), {"a": 1}, 0)
        self.assertEqual(result["words"][0]["text"], "2026")
        self.assertGreater(result["words"][0]["endMs"], result["words"][0]["startMs"])

    def test_pcm_wav_reads_only_requested_window_and_resamples(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "stereo.wav")
            with wave.open(path, "wb") as target:
                target.setnchannels(2); target.setsampwidth(2); target.setframerate(8000)
                target.writeframes(b"".join(struct.pack("<hh", value, -value) for value in range(8000)))
            reader = worker.PcmWaveWindowReader(path, 16000)
            samples, rate = reader.read_window(250, 500)
            self.assertEqual(rate, 16000)
            self.assertEqual(len(samples), 4000)
            self.assertTrue(all(math.isfinite(value) for value in samples))

    def test_worker_errors_use_bounded_envelope(self):
        result = worker.process_message({"protocolVersion": 99, "operation": "health"})
        self.assertEqual(result, {"ok": False, "error": {"code": "INVALID_REQUEST", "message": "Unsupported alignment protocol version."}})


if __name__ == "__main__":
    unittest.main()
