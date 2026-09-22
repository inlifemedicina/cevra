# ADR 0021 — Audio Measurement V1

**Status:** Accepted for implementation — IN DEVELOPMENT / independent remediation review pending
**Date:** 2026-09-22

## Authority and scope

MR-A02 supplies compact acoustic evidence for future MR-Q01 policy. D1 excludes
heavy acoustic analysis from ingest; D11/D12 keep editorial decisions, quality
verdicts and corrective policy outside the worker. The reviewed coordinated
plan is retained on spike commit
`4cf2e3d6fd74d8a1111b0d8c6ba9e559170f48ef`, not merged into this implementation.
[ADR 0020](0020-audio-sequence-runtime-v1.md) remains IMPLEMENTED / CLOSED and
authoritative for the general multi-source executor.

`measure-audio` V1 extends the existing contracts → MediaApplicationService
(`mutation: none`) → adapter → persistent worker → verified managed FFmpeg path.
It measures exactly one local source, an **absolute ffprobe stream index** (not
an audio ordinal), and one explicit `[startMs, endMs)` interval. It creates no
media file, SourceAsset, Project IR command, history entry or cache. Existing
execution records/provenance carry its report; this is not new persistence.

## Signal and time coordinates

Times are safe integer milliseconds on the source's original presentation
timeline. Non-zero audio start is not silently shifted to zero. Stream timing
(`start_pts × time_base`, `duration_ts × time_base`, with the existing bounded
stream-only duration fallback) must prove coverage; container duration is never
a substitute. Unknown coverage fails closed. For native rate `r`, interval
boundaries are `ceil(startMs × r / 1000)` and `ceil(endMs × r / 1000)`, not always
48 samples/ms. The stream origin must be representable on this sample grid.

Input seeking uses at most one second of preroll, with original timestamps
retained. Non-zero seeks use `-noaccurate_seek` so FFmpeg's input seek cannot
apply a second container-start-time adjustment; the typed `atrim` remains the
exact authority. No seek is issued at zero because explicit `-ss 0` can discard
AAC priming-adjacent samples. Trimmed decoded-frame PTS and cumulative native
sample counts independently prove contiguous decoded coverage. Missing/truncated samples,
timestamp gaps/duplicates, format reinitialization or incomplete reduction may
not become planned silence. There is no `apad` or async stretching.

`duration_ts × time_base` remains preferred. The only fallback is the selected
audio stream's validated duration or its explicitly requested Matroska/WebM
`DURATION` tag; container duration and arbitrary tags are never authorities.
Decoded timeline coverage does not, by itself, fully resolve semantic
codec/container priming for ADTS/TS AAC. That ambiguity is explicitly deferred
and is not described as universally rejected by this V1 method.

V1 supports unambiguous mono/stereo at explicitly enumerated common rates
8–192 kHz whose 100 ms meter hop is an integer sample count. Other layouts/rates
are explicitly unsupported, not downmixed or resampled into a supported source.
The normal media bound of seven days and URI limit remain request safeguards,
not project/video limits. This does not promise every codec's priming/tail maps
to semantic source time without ambiguity; decoded coverage validation and
codec-priming interpretation are distinct guarantees.

## Method `cevra.audio-measurement.native-swr4.v1`

The source is converted internally to double precision without gain, channel
remapping, rate change or dual-mono compensation. Fixed native branches provide:

1. `astats`, cumulative/reset disabled: per-channel RMS and sample peak in
   **linear amplitude**, plus NaN/Inf rejection and actual sample-frame counts.
   Its six-decimal dB evidence is converted to linear amplitude with declared
   numerical tolerance; zero is returned only for proven digital silence.
2. `ebur128`, metadata enabled, `dualmono=false`, no peak mode: integrated LUFS
   using its 400 ms blocks/100 ms hop and native gated histogram, plus the maximum
   short-term LUFS over complete 3 s windows and valid observation count. FFmpeg
   9.0.1 can emit an isolated NaN M/S window after non-zero signal falls to exact
   zero because of negative floating-point residue in its moving sum. Such a NaN
   window is unusable and is skipped only for its corresponding M or S update;
   prior valid integrated evidence remains. Infinity is invalid, and decoded
   NaN/Infinity remains rejected independently by `astats`.
3. `aresample`/libswresample at **4× native rate**, double precision, native
   32-tap filter, phase shift 10, exact rational/linear interpolation enabled;
   its input is the requested interval plus up to 50 ms of proven real stream
   context on each side. After full drain, only the oversampled center that maps
   to `[startMs, endMs)` enters `astats`; guard samples never enter the reported
   peak. At a genuine stream boundary, the guard is clipped to real coverage and
   no silence is invented. The output is a declared **true-peak estimate**, not
   sample peak or a certified conformance claim. Its measured center frame count
   must be exactly 4× the requested native frame count. RMS, sample peak,
   full-scale predicates and loudness continue to see only the requested interval.
4. A separate native `aeval` predicate branch tests exact zero, `abs(x) >= 1`
   and `abs(x) > 1` before textual rounding. These are full-scale facts, **not a
   clipping/distortion diagnosis**. `Peak_count` is not used as clipping count.

The initial `ebur128 peak=true` candidate was rejected for this endpoint:
signature-verified FFmpeg 9.0.1 characterization in run **35774039722** showed a
last-sample unit impulse reported as sample peak 0 dBFS but true peak 0 linear.
Its metadata also rounds linear peaks to 0.001, hiding a non-zero 1e-5 signal.
Drained native SWR avoids both problems without a dependency or FFmpeg update.
See [the reproducible feasibility catalog](../../engines/media-ffmpeg/test_functional/audio-measurement-feasibility.py),
[FFmpeg filter documentation](https://ffmpeg.org/ffmpeg-filters.html#ebur128-1),
and pinned `libavfilter/f_ebur128.c` (metadata precision, 192 kHz internal
resampler, histogram -70..+10 LUFS) in the hash/signature-verified 9.0.1 archive.

## Availability and validation

Loudness is `{status: available, value}` or `{status: unavailable, reason}`:

- `digital-silence`: native exact-zero evidence, not a finite loudness sentinel;
- `insufficient-duration`: fewer than 400 ms for integrated or 3 s for short-term;
- `no-eligible-blocks`: no proven absolute-gate-eligible integrated block;
- `meter-range`: quantized gate-edge ambiguity, integrated histogram upper
  range, or values indistinguishable from the short-term meter's numerical floor.

The native -70 integrated initial value and unfilled-window -120.691 value are
never promoted as valid evidence. Non-finite samples, arithmetic failure,
missing/different stream, unproven coverage, incomplete drain/collection,
timeout or decoder failure do not produce a fully valid report. Very short
intervals for which the native resampler cannot prove a full drain fail closed.
Finite source floats above ±1 are valid and retained. There is no NaN/Infinity
JSON, zero substitution, noise-floor/SNR inference, LRA, waveform or series.

The report binds method/version, execution job, exact input URI, stream and
interval. Adapter and Application independently validate exact fields,
correspondence, sample boundaries/counts, channel shape, finite metrics and
availability invariants. `complete` means complete measurement evidence, not
PASS of product quality. The worker never chooses a reference/noise window.

## Bounded execution and ownership

One persistent worker and at most one FFmpeg/ffprobe child run at a time. The
native source is decoded once per analysis, audio only; no extracted WAV, lossy
encode, or complete PCM array is required. Probe JSON is bounded to 16 KiB;
measurement lines to 4 KiB; at most 40 keys per frame and a fixed number of
branch/channel accumulators are retained. Periodic metadata is consumed as it
arrives, not accumulated with `communicate()`. Frame metadata is cleared before
measurement and input/container log metadata is not an evidence authority.

Analysis uses existing configurable/disableable runtime execution timeout,
liveness, active-job process association, cancellation and reaping; probe has a
30 s control bound. Reproduced abrupt-worker-death evidence required a bounded
POSIX transport correction: spawn the worker in its own process group and
terminate that owned group when the worker is lost. Existing-operation tests
protect the same change. Native Windows process-tree death handling is not
validated by macOS/Linux evidence and is not claimed closed here.

No output destination exists to promote or clean. Inputs/canonical history are
never deleted. Stat identity is checked before/after measurement to reject
observed source changes, not advertised as a durable content digest. The
report remains execution evidence, not cached source truth.

At the typed boundary, `truePeakLinear` must not be materially below the largest
channel sample peak, and exact native full-scale predicates must agree with the
text-derived sample peak. A linear tolerance of `2e-6` covers the six-decimal dB
serialization and float fixture quantization around 1.0; it is not a clipping
threshold and does not weaken the native unrounded predicates.

## Validation and status

The [functional catalog](../../engines/media-ffmpeg/test_functional/audio-measurement-runtime.mjs)
includes analytical RMS/peaks, phase-offset intersample peaks, headroom around
and above full scale, signal/fade/clip followed by exact-zero gaps,
silence/gating/short windows, 44.1/48/96 kHz, stereo phase and imbalance,
video/multiple audio streams, MPEG-TS non-zero timestamps, Matroska/WebM stream
duration tags, coverage/truncation, non-finite data,
late compressed excerpts, repeated execution, long measurement, cancellation,
timeout/worker death, unchanged history and Audio Sequence output with a real
500 ms gap → measurement.

Representative guards: ≤2 sampled worker-tree processes, <768 MiB sampled RSS,
<4 KiB reports for catalog inputs, and zero new measurement artifacts. These
have generous regression margin and are not product RAM/video requirements.
Actual measured values and local/exact CI status belong in the companion
[evidence record](../CEVRA_AUDIO_MEASUREMENT_V1_EVIDENCE.md). The existing exact
Audio Sequence catalog runs unchanged in the same managed build workflow.

Runtime identity becomes **0.3.0** (compatible new CEVRA-owned capability), with
protocol V1 and all third-party pins unchanged. `extract-audio`/Alignment's
existing PCM profile remains separate and unchanged. Later PR #24 reconciliation
must account for Media Engine identity invalidation and re-prove PCM profile
identity; no cache work is included. Director impact is a compatible typed
evidence extension without editorial authority.

Acceptance links: D1-T1 remains lightweight ingest; this slice supplies partial
evidence for D11-T1/D11-T3 and MR-Q01/D12-T1, not delivered mastering or QA policy.
Complete D11 workflows remain **BLOCKED** by absent policy/planning/mixing
integration. X-T1/X-T3/X-T5/X-T9 receive focused non-mutation, cancellation,
original-preservation and resource evidence, not blanket workflow PASS.

## FIX NOW / DEFER

- **FIX NOW:** isolated R128 M/S NaN windows, MPEG-TS seek semantics,
  selected-stream duration-tag fallback, real-context true-peak boundaries,
  acoustic report invariants, native peak tail/precision, measured coverage,
  bounded metadata, unrounded full-scale predicates, and worker-death child cleanup. False evidence
  or stranded work affects MR-A02 immediately; correcting before dependent QA
  consumes reports avoids compatibility/review churn. Native filters and the
  existing transport suffice; no engine/dependency/Project IR migration.
- **DEFER:** certified meter conformance, broader layout/rate support,
  semantic ADTS/TS codec priming, tiny-interval error classification, periodic-WAV
  demux auto-detection, stdout/stderr separation, residual low short-term windows,
  timeout/cancel error refinements, gate quantization, native Windows death
  evidence and policy/mastering.
  These require specific new evidence or scope, not guessed values or hidden
  transforms. Closed ADR 0020 LOW/NOTE hardening is not reopened opportunistically.

The coordinated Media Runtime gate remains active. No MR-A04, Cut Compiler,
Composition, HDR/H.264, UI/Tauri, Project IR/History/Store or Transcript Cache
implementation is included. Independent review precedes PR; no merge is claimed.
