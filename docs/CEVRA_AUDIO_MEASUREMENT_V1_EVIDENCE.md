# Audio Measurement V1 — execution evidence

Base: `8aea564b7cdfd7d235fa72964f07eeed961c1bbc`.
Branch: `feat/typed-audio-measurement-v1`.
Status: IN DEVELOPMENT / implementation validated; independent review pending.
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
- On `d40778379d13144893fbc524fdc2349e81d2d498`, normal CI run `35777311294`
  exposed a stale five-file manifest-schema cardinality (the new worker has
  seven files). The Media reproducibility job failed before that run was
  superseded/cancelled by the corrective push. Commit `bca975e` adjusts the exact
  cardinality and tests agreement with both build and integrity inventories;
  hashes/signatures and closed file-set verification remain mandatory.

## Local development evidence (not release proof)

macOS arm64; 10 CPUs; 24 GiB RAM; >100 GiB free scratch space. Safeguards:
one heavy experiment at a time, one filter/decoder thread, generated fixtures
only, <512 MiB scratch budget per catalog, 120 s fixture-generation timeout,
180 s catalog-operation timeout and <768 MiB sampled worker-tree RSS guard.
Python source loops generate short test fixtures only, never production PCM.

The local actual adapter/worker/Application catalog with Homebrew FFmpeg 9.0.2
measured (development evidence, separate from exact CI below):

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
- Representative 30-minute compressed source late 1 s excerpt: ~74–75 ms per
  warm repeated call; long 120 s analysis ~1.11 s; reports ~0.7–0.9 KiB;
  sampled worker-tree RSS ≤57.2 MiB; ≤2 processes; 31,536,682 fixture bytes
  (~30.1 MiB, including the 20 s EBU reference).
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

## Validated implementation checkpoint

Implementation SHA: `bca975e6690c14d560a0881d2fbe1dc7548f5692`.
Subsequent evidence-only documentation does not change this tested code tree.

- [Normal CI 35777894595](https://github.com/inlifemedicina/cevra/actions/runs/35777894595):
  **5/5 SUCCESS** — Monorepo, Tauri desktop shell, Media Runtime reproducibility,
  Transcription, Alignment. The corrected sealed manifest pipeline executed.
- [Exact runtime 35777894541](https://github.com/inlifemedicina/cevra/actions/runs/35777894541):
  **SUCCESS**, macOS arm64, signature/hash-verified FFmpeg 9.0.1 and pinned
  private CPython 3.12.14, CEVRA Media Runtime 0.3.0 / protocol 1. The preserved
  Audio Sequence catalog, native feasibility checks, and measurement catalog
  all actually executed in the same managed build. No Homebrew fallback.
- `npm run ci`: build (including frontend/Desktop Host) and **328 Node + 45
  frontend tests PASS**. `npm run test:python`: **62 PASS** (Media 41,
  Transcription 10, Alignment 11). `npm audit --audit-level=low`: zero findings.
- Tauri CI: **23 Rust supervisor tests PASS**, locked dependency check and
  release shell compilation PASS. No local Rust/native Windows claim.
- `git diff --check`: PASS. Local Markdown destination validation: 19 targets
  PASS. Closed ADR 0020, its functional catalog, Project IR/Store, Alignment,
  Transcription and dependency lockfile remain byte-unchanged from base.

The exact measurement catalog recorded **25 successful reports** plus asserted
rejection/cancellation/timeout/worker-death cases. Successful reports do not
label the acoustic content PASS of quality.

| Exact-runtime check | Measured result / acceptance |
|---|---|
| Sine 0.5, 44.1/48 kHz | RMS 0.353553385298; error <2e-6; 176,400 / 192,000 frames in 4 s |
| Fractional-ms tail 3,991..3,999 | 352 / 384 actual frames, respectively |
| Independent EBU 3341 test 1 | I -23.000; S max -22.993 LUFS; ±0.1 LU tolerance; 171 valid complete windows |
| Analytic intersample fixture | sample peak 0.565685439; true peak 0.800037787; expected continuous amplitude 0.8 ±0.01 |
| Float amplitude 2 | RMS 1.414213569; sample/true peak 2.000000020; unrounded full-scale flags true |
| Digital zero / below gate / 50 ms | distinct silence / no-eligible-blocks / insufficient-duration evidence; no finite sentinel substitution |
| Coverage and malformed signal | long-container/short-audio, partial range, absent/video stream, truncated input, unsupported layout and NaN/±Inf rejected |
| Explicit audio stream / late start | second audio stream and source PTS interval 2,100..2,900 ms passed, without shifting the stream to zero |
| Lifecycle / non-mutation | abort, timeout and abrupt worker death rejected; observed owned child settled; no report promotion or measurement artifact; Project IR/history unchanged |
| Compatibility | derived float32 sequence headroom retained by measurement; legacy `extract-audio` remains `pcm_s16le`; existing Alignment suites pass |

Exact-run resource observations (sampled every 20 ms, not OS peak guarantees):

- 30-minute compressed AAC, late 1 s excerpt: **102.1 / 84.5 / 85.7 ms** for
  three calls in one warmed worker (not a controlled cold-cache benchmark).
- 120 s analysis: **2,720.3 ms**, 5,760,000 actual sample frames, **775-byte**
  report; longest analysis tested is 120 s, not a complete 30-minute analysis.
- Catalog maximum: **70,880 KiB = 69.22 MiB** worker-tree RSS, **2 processes**,
  **898-byte** report, **119.7%** sampled CPU across the tree. Integrated CPU
  time, filesystem I/O and unobserved transient peaks are NOT MEASURED.
- Synthetic fixture storage: **31,536,682 bytes (~30.1 MiB)**. Measurement
  itself creates **zero output/intermediate files**.
- Regression guards: <768 MiB sampled RSS, ≤2 observed processes, <4 KiB
  reports for these fixtures; sampling must actually return observations.
  Fixed metadata/probe bounds and native fixed-window accumulators provide
  structural memory bounds. These are not project duration/video limits.

Remaining limitations are explicit in ADR 0021: common mono/stereo rates only,
conservative ambiguous timeline/tiny-drain rejection, no complete EBU/ITU
certification, and no native Windows process-tree validation. No independent
review has yet approved this implementation.

No claim of independent approval, complete D11-T1/D11-T3 workflow, certified
meter conformity, Windows runtime validation, merge or CLOSED status is made.
