# Application Resolved Audio Plan V1 — Evidence

**Status:** implementation in development; independent review pending

**Base:** `54a49a624f7d9b28145af2692bec4485af08545c`

**Branch:** `feat/application-resolved-audio-plan-v1`

**Progress baseline:** 48%

## Scope and reproducibility

The implementation covers MR-A05/MR-A06's bounded Application-level vertical:
pure planning from current Project IR, existing Audio Sequence execution,
revision-bound caller visual reference, exclusive final mux, validation,
`export.add` promotion and owned PCM cleanup. It does not claim a Desktop-visible
workflow, Composition, mastering or durable crash recovery.

Local deterministic suites:

```sh
node --test packages/application/test/*.test.mjs
python3 -m unittest discover -s engines/media-ffmpeg/test_python -p 'test_*.py'
```

The exact managed catalog is executed by
`.github/workflows/audio-sequence-runtime.yml` after the existing signature/hash-
verified FFmpeg 9.0.1 build, preserved Audio Sequence catalog, measurement
characterization and Audio Measurement catalog:

```sh
node engines/media-ffmpeg/test_functional/application-audio-plan-runtime.mjs
```

It uses synthetic float WAV sources, a caller-provided H.264 visual fixture and
the real contracts → Application → adapter → persistent worker → managed runtime
path. No Homebrew/PATH result is release evidence.

## Evidence catalog

| Evidence | Required result | Current status |
|---|---|---|
| Pure compiler | deterministic, detached, no Project IR mutation | local PASS |
| Track/source selection | audio tracks only; hidden ≠ mute; muted/zero excluded; no video-audio duplication | local PASS |
| Gain/timing | speed 1; equal exact ranges; volume conversion + master gain once; no clamp | local PASS |
| Normalization | NONE executes; explicit target rejects | local PASS |
| Revision binding | late edit and commit→undo reject old plan | local PASS |
| Vertical promotion | sequence → mux → `export.add`; PCM cleaned after durable export | local PASS |
| Foreign output race | unknown mux destination survives engine failure/cancel ambiguity | local PASS |
| Known-owned invalid output | removed without touching sources/caller visual | local PASS |
| Mux staging | non-symlink inputs, owner staging, exclusive link, cleanup | local PASS |
| Corrected J-cut oracle | corrected mapping passes; executed old mapping fails by about 500 ms | exact runtime pending |
| Video stream-copy | packet payload hashes and packet timing/order identical | exact runtime pending |
| Final decode/duration | one video + one audio stream, valid decode, bounded duration | exact runtime pending |
| Resource envelope | ≤2 sampled worker-tree processes; <768 MiB sampled RSS; zero owned staging leftovers | exact runtime pending |

The same catalog passed locally on macOS arm64 through the real Application,
adapter and persistent worker using a development-only Homebrew FFmpeg 9.0.2;
this is characterization, **not release-runtime evidence**. Observed values were:

- corrected J-cut maximum error: 4.979 ms against a 25 ms codec-aware bound;
- executed wrong-placement minimum error: 504.979 ms;
- wall time for sequence + mux + promotion: 1,288.014 ms;
- sampled process-tree peak: 2 processes and 71,632 KiB RSS;
- final output: 381,125 bytes; resolved plan JSON: 1,234 bytes;
- owned staging artifacts after success: zero;
- copied video packet payload hashes and timing/order: identical.

The process/RSS ceilings are generous regression guards inherited from the exact
Audio Sequence catalog, not product hardware requirements. The catalog records
wall time, peak sampled RSS/CPU, process count, final bytes, plan bytes, artifact
count and audio/video encode generations.

## Failure and recovery evidence

Unit tests cover invalid ranges/source/speed/gain, no renderable audio, explicit
normalization target, stale results, commit followed by undo, final-duration
failure, cleanup failure after export, pre-existing/symlink destinations and
foreign race winners. Worker tests inject publication races and verify that only
owned staging/output is removed.

Fault injection is simulated. It is not evidence of a real full disk or native
process crash. The execution repository used by the Desktop Host is currently
in-memory; full restart recovery of the composite multi-stage intent is therefore
**BLOCKED pending the durable integration decision recorded in ADR 0027**. No
automatic editorial mutation replay was added.

## Self-review

- Source and timeline time remain independent; the reference J-cut uses B audio
  `0..2500 → 1500..4000` and B picture `500..2500 → 2000..4000`.
- `clip.volume` is linear, zero is omitted, and `masterGainDb` is applied once.
- Explicit normalization is rejected rather than ignored.
- Final video is copied at mux; the catalog compares packet data, not container
  hashes.
- Project binding includes journal count, so undo cannot resurrect an obsolete
  attempt.
- Ownership follows successful exclusive publication, never caller URI alone.
- The caller visual binding is a contract, not a claim that Composition exists.
- Director impact is a compatible typed execution target only; no editorial
  authority moved into the worker.

Exact runtime and remote CI run/SHA evidence will be recorded after the scoped
branch is pushed. Independent review remains required before any PR may open.
