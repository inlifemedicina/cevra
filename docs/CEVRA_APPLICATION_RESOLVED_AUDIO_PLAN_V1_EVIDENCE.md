# Application Resolved Audio Plan V1 — Evidence

**Status:** IMPLEMENTED / CLOSED — bounded Application vertical

**Base:** `54a49a624f7d9b28145af2692bec4485af08545c`

**Branch:** `feat/application-resolved-audio-plan-v1`

**Progress baseline:** 48%

## Scope and reproducibility

The implementation covers MR-A05/MR-A06's bounded Application-level vertical:
pure planning from current Project IR, existing Audio Sequence execution,
revision-bound caller visual reference, exclusive final mux, validation,
`export.add` promotion and owned PCM cleanup. It does not claim a Desktop-visible
workflow, Composition, mastering or Durable Media Execution Archive V1.

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
| Vertical promotion | sequence → mux → `export.add`; PCM cleaned after canonical ProjectHistory commit | local PASS |
| Foreign output race | unknown mux destination survives engine failure/cancel ambiguity | local PASS |
| Known-owned invalid output | removed without touching sources/caller visual | local PASS |
| Mux staging | non-symlink inputs, owner staging, exclusive link, cleanup | local PASS |
| Corrected J-cut oracle | corrected mapping passes; executed old mapping fails by about 500 ms | local development-runtime PASS; exact runtime PASS at `ddee31c` |
| Video stream-copy | packet payload hashes and packet timing/order identical | local development-runtime PASS; exact runtime PASS at `ddee31c` |
| Per-stream duration | managed FFprobe checks selected input/output video and audio streams; short visual/PCM fail closed; AAC bound applies only after encode | local development-runtime PASS; exact runtime PASS at `ddee31c` |
| Final decode/duration | one video + one audio stream, valid decode, bounded duration | local development-runtime PASS; exact runtime PASS at `ddee31c` |
| Resource envelope | ≤2 sampled worker-tree processes; <768 MiB sampled RSS; zero owned staging leftovers | local development-runtime PASS; exact runtime PASS at `ddee31c` |

The same catalog passed locally on macOS arm64 through the real Application,
adapter and persistent worker using a development-only Homebrew FFmpeg 9.0.2;
this is characterization, **not release-runtime evidence**. Observed values were:

- corrected J-cut maximum error: 4.979 ms against a 25 ms codec-aware bound;
- executed wrong-placement minimum error: 504.979 ms;
- wall time for sequence + mux + promotion: 1,473.288 ms;
- sampled process-tree peak: 2 processes and 66,128 KiB RSS;
- final output: 381,125 bytes; resolved plan JSON: 1,234 bytes;
- owned staging artifacts after success: zero;
- copied video packet payload hashes and timing/order: identical.

The process/RSS ceilings are generous regression guards inherited from the exact
Audio Sequence catalog, not product hardware requirements. The catalog records
wall time, peak sampled RSS/CPU, process count, final bytes, plan bytes, artifact
count and audio/video encode generations.

## Failure and recovery evidence

Unit tests cover invalid ranges/source/speed/gain, explicit ducking and
normalization rejection, closed runtime schemas, immutable request snapshots,
structural plan comparison, stale results, mutation/undo/abort barriers during
the pre-commit archive save, post-commit archive failure, and each input/output
stream-duration failure. Worker and Application tests exercise publication
races, post-link regular-file and symlink replacement, staging failure,
historical records without identity evidence, and prove that only a matching
published POSIX dev/inode is eligible for removal.

Fault injection is simulated. It is not evidence of a real full disk or native
process crash. The execution repository used by the Desktop Host is currently
in-memory; full restart recovery of the composite multi-stage intent is therefore
**BLOCKED pending implementation of the approved Durable Media Execution
Recovery V1 direction recorded in ADR 0027**. No automatic editorial mutation
replay was added.

## Adversarial remediation checkpoint

The independently reviewed pre-remediation head
`038fdc19bde7fa518a3e5609da1a2bc79ebe797c` passed normal CI run `35818228308`
(5/5) and exact managed runtime run `35818228318`. Those runs prove only that old
head, not this remediation.

Confirmed findings were corrected by a suspension-free final binding/abort
check-to-ProjectHistory-commit boundary after saving `committing`; pre-await
request snapshots; closed schemas; explicit `musicDuckDb` rejection; order-
insensitive structural comparison; POSIX publication identity evidence through
worker, adapter and attempt cleanup; managed selected-stream FFprobe duration
checks before and after mux; and recovery-class post-commit errors. The exact
managed macOS arm64 catalog now also requires short visual and short PCM
rejection and records all four stream-duration measurements. At remediation head
`37036a0f31d0f69547facee97f0aed6a0581918f`, normal CI run `35889604895`
passed 5/5 and exact managed runtime run `35889604818` passed.

The final pre-PR micro-remediation derives POSIX publication identity from the
owned staging inode, confirms the linked destination before ownership is
claimed, and snapshots getter-backed Application requests before validating the
captured value. Code head `ddee31c84caedc52e60d2db1d36c5e4575360792`
passed normal CI run `35907517116` (5/5) and exact managed macOS arm64 runtime
run `35907517082`. The `37036a0` runs remain historical evidence and are not
used as proof of the micro-remediation.

## Self-review

- Source and timeline time remain independent; the reference J-cut uses B audio
  `0..2500 → 1500..4000` and B picture `500..2500 → 2000..4000`.
- `clip.volume` is linear, zero is omitted, and `masterGainDb` is applied once.
- Explicit normalization is rejected rather than ignored.
- Final video is copied at mux; the catalog compares packet data, not container
  hashes.
- Project binding includes journal count, so undo cannot resurrect an obsolete
  attempt.
- Ownership follows successful exclusive publication identity, never caller URI
  alone; ambiguous or legacy evidence is preserved and reported.
- The caller visual binding is a contract, not a claim that Composition exists.
- Director impact is a compatible typed execution target only; no editorial
  authority moved into the worker.

`runtime.filters: []` remains NOTE/DEFER because no impact was reproduced.

## Merge and canonical closeout evidence

Final Pre-PR Adversarial Review concluded **APPROVE FOR PR WITH NON-BLOCKING
NOTES**; no BLOCKER, HIGH or MEDIUM finding was reproduced. Feature PR #42
merged reviewed head `b12304af046f36c86a4ee43aa06f19584cb1d550` by normal
merge commit `ff744592e7cf14b40018e3781440fb74b343f7a0` on 2026-09-23.

Feature-branch evidence remains distinct from main integration evidence:

- PR-event CI run `35915963018` passed 5/5 on the feature head;
- PR-event exact-runtime run `35915963002` passed on the feature head;
- post-merge main CI run `35918380631` passed 5/5 on merge SHA `ff744592`;
- post-merge exact managed macOS arm64 runtime run `35918380640` passed on the
  same merge SHA.

The bounded Application Resolved Audio Plan V1 vertical is **IMPLEMENTED /
CLOSED**. Durable Media Execution Recovery V1, Composition attestation, the
complete Desktop-visible workflow and target normalization/mastering remain
outside this closure. The coordinated Media Runtime gate remains active and
product progress remains 48%.
