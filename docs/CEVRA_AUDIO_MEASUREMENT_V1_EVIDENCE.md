# Audio Measurement V1 — execution evidence

Base: `8aea564b7cdfd7d235fa72964f07eeed961c1bbc`.
Branch: `feat/typed-audio-measurement-v1`.
Status: IN DEVELOPMENT / validation and independent review pending.
Contract/method authority: [ADR 0021](adr/0021-audio-measurement-v1.md).

## Feasibility before contract consolidation

Commit `3fa6015128d2cbd41cb6cd41735941f92a0eebb9`, exact managed macOS arm64
run `35774039722`: signature-verified FFmpeg **9.0.1**, private CPython
**3.12.14**, existing Audio Sequence catalog and native measurement
characterization executed successfully. This is not final implementation CI.

| Fixed fixture | Observed native evidence | Interpretation |
|---|---|---|
| 1 kHz sine, amplitude 2, 4 s | sample peak 6.020600 dBFS; RMS 3.010300 dBFS | float headroom retained |
| digital zero, 4 s | RMS `-inf`, integrated sentinel -70 | no finite loudness substitution |
| amplitude 1e-5 | sample peak -100 dBFS; native true-peak text `0.000` | candidate text precision insufficient |
| 50 ms sine | no R128 metadata | no fabricated integrated/short-term value |
| final-sample unit impulse, 100 ms | sample peak 0 dBFS; ebur128 peak `0.000` | candidate tail defect reproduced |
| same impulse through drained SWR | 19,200 frames; peak 2.062211 dBFS | complete native oversampling includes edge ringing |

Failed intermediate checks are retained as causes, not passing evidence:

- An initial video fixture expected AAC to retain amplitude-2 PCM headroom.
  That assumption was false; stream selection now uses sub-full-scale AAC,
  while float-headroom acceptance remains on original/derived float WAV.
- Explicit input `-ss 0` on the 30-minute AAC skipped priming-adjacent samples
  (first observed PTS 1,024). The new operation now omits zero seeking;
  continuity validation rejected the incomplete result before that correction.
- Abrupt worker death left its measurement decoder alive after 3 seconds.
  The owned POSIX process-group correction and regression test address this
  reproduced lifecycle issue; no speculative filter topology rewrite occurred.

## Local development evidence (not release proof)

macOS arm64; 10 CPUs; 24 GiB RAM; >100 GiB free scratch space. Safeguards:
one heavy experiment at a time, one filter/decoder thread, generated fixtures
only, <512 MiB scratch budget per catalog, 120 s fixture-generation timeout,
180 s catalog-operation timeout and <768 MiB sampled worker-tree RSS guard.
Python source loops generate short test fixtures only, never production PCM.

The local actual adapter/worker/Application catalog with Homebrew FFmpeg 9.0.2
measured (development evidence, to be complemented by final exact CI):

- 44.1/48 kHz sine amplitude 0.5: RMS 0.3535533853; tolerance 2e-6 against
  `0.5/sqrt(2)`. 4 s yields 176,400 / 192,000 measured frames.
- 44.1 kHz interval 3,991..3,999 ms: 352 measured frames; 48 kHz: 384.
- Tapered phase-offset 12 kHz sine: sample peak ~0.565685; true peak
  ~0.8000378 against continuous amplitude 0.8 (0.01 tolerance for finite native
  interpolation). It is not a comparison of two instances of the same meter.
- Mono 1 kHz integrated reference ~-9.03 LUFS with 0.06 LU tolerance for native
  histogram/filter startup; 11 valid complete short-term windows in 4 s.
  The catalog also generates [EBU Tech 3341 test 1](https://tech.ebu.ch/docs/tech/tech3341.pdf):
  20 s in-phase stereo 1 kHz, -23 dBFS per-channel peak, I/S expected -23 ±0.1
  LUFS. This independently specified reference is not a second call to the same
  implementation, nor a claim that the entire EBU conformance suite ran.
- Amplitude 2: RMS ~1.41421357 and peak ~2.00000002; no limiter/normalization.
- Native exact predicates distinguish `1-2^-24`, `1`, `1+2^-23`, independently
  of dB rounding. Saturated-signal evidence does not diagnose distortion.
- Representative 30-minute compressed source late 1 s excerpt: ~73 ms per
  warm repeated call; long 120 s analysis ~1.11 s; reports ~0.7–0.9 KiB;
  sampled worker-tree RSS ≤57.2 MiB; ≤2 processes; ~22.7 MiB fixture bytes.
  These are observations, not latency/product guarantees. CPU is sampled
  percent, not integrated CPU time; I/O traffic is not measured.

## Reproduction and final validation checkpoint

Use the same environment variables as the existing Audio Sequence catalog:
`CEVRA_AUDIO_SEQUENCE_RELEASE=1`, `CEVRA_AUDIO_SEQUENCE_RUNTIME_ROOT` pointing
to the assembled sealed runtime, and `CEVRA_AUDIO_SEQUENCE_PYTHON` pointing to
its private interpreter. Then run:

```sh
node engines/media-ffmpeg/test_functional/audio-sequence-runtime.mjs
node engines/media-ffmpeg/test_functional/audio-measurement-runtime.mjs
python3 -I -B -m unittest discover -s engines/media-ffmpeg/test_python
npm run build
npm run test:ci
```

Normal CI and exact-runtime CI are separate gates. The existing exact workflow
builds FFmpeg once and runs both catalogs. Relevant feature pushes, PRs and
main changes remain covered; docs-only changes do not rebuild FFmpeg.

Final implementation suites/CI results will be recorded after execution.
No claim of independent approval, complete D11-T1/D11-T3 workflow, certified
meter conformity, Windows runtime validation, merge or CLOSED status is made.
