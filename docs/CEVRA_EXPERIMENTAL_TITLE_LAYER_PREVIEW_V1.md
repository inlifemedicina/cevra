# Experimental static-title preview — 2026-10-15

Status: **isolated experiment; not a default, release, merge or Owner acceptance**.
The Owner approved integrating the previously isolated base-video/PNG experiment
into the existing sequence preview for evaluation. This extends presentation and
the closed media contract; Project IR, ProjectHistory, typed edits, CoreText,
FFmpeg and original-derived final export retain their authorities. No framework,
engine, dependency, persistent project schema or global setting is added.

## Scope and activation

Normal builds leave both `CEVRA_EXPERIMENTAL_TITLE_LAYER` and
`VITE_CEVRA_TITLE_LAYER_EXPERIMENT` disabled. The experimental Mac candidate
compiles both flags as `1`, has its own bundle identifier and store, and exposes
one experimental-preview checkbox within the existing sequence controls.
The checkbox settles pending title edits through the existing action gate.
It does not migrate projects or alter another installed app.

The trial accepts the current static 16:9 title over landscape, unrotated,
explicit BT709/tv/yuv420p SDR sources. Unsupported input, missing native
capability, failed integrity, or failed browser decoding returns to the existing
encoded sequence preview. No unsupported-colour guard is weakened. Portrait,
HDR, arbitrary colour profiles, animation and other composition engines are
outside this experiment.

## Derived boundaries

The prepared base uses a closed V4 preview operation with fixed
`canonical-h-bt709-v1` identity. Its canonical-scale/transparent-overlay/downscale
path follows the measured proof; the existing export operations are unchanged.
The base cache is at most two entries / 16 MiB in the experimental session.
The graphic cache is at most four entries / 16 MiB. UI retention is one base
Blob URL, one canonical PNG bitmap and one 720x404 bitmap; stale pending bitmaps
are closed. IN/OUT is excluded only from graphic identity, while current canonical
bounds, snapshot/journal, runtime, native fonts and source identities are checked
before admission. Trim changes base identity; eviction can require a fresh encode
whose container hash need not equal the prior bytes.

`render-manual-title-preview` is an internal, versioned, closed operation. It
produces a bounded canonical PNG and Lanczos 720x404 PNG in an issued private
workspace. The existing supervised native path enforces the resource limits.
Hash, PNG header/grid, stable file reads and POSIX dev/inode publications are
validated before retention. Cancellation settles the producer before cleanup.
The fixed macOS colour helper calibrates against the admitted base's actual
CoreMedia709 image and produces sRGB PNGs; no system colour profile is bundled.

The existing transport and editable title overlay remain. Snapshot/seek/busy
changes clear and hide the old canvas immediately. Loading is visible, and ready
requires the current packet, hashes, decoded base dimensions/duration and exact
paused frame. Playback uses generation-bound native video-frame callbacks;
obsolete responses, bitmap completions, play failures and frame callbacks cannot
re-admit prior state. Undo/Redo continues through ProjectHistory.

## Measurements and gates

Candidate-only numeric diagnostics distinguish Host preparation, Rust/Host,
Tauri round trip, UI decode/seek and canvas submission. Two animation-frame
opportunities are a separate endpoint. `physicalPaintMs` is always null.
The native diagnostic command accepts only bounded numeric/identifier fields,
requires a compiled experimental flag, and writes at most 100 records to an
exclusive local `0600` file in this candidate's app-data directory. No title,
media path, project contents or network telemetry is recorded.

Mac build, Rust 57, Media Python 168, UI 354 with one existing skip, focused
Host/boundary 15 and native lifecycle/resource 31 checks passed. The initial
broad run with the experimental renderer forced into legacy UI mocks failed;
the default UI suite subsequently passed. The subsequent broad aggregate still
failed: two transcription-fixture failures also reproduce on the clean preserved
baseline; three native process-observation checks failed in the restricted shell
and pass with the approved native scope; one exact RPC allowlist expectation was
updated for the new closed tool and passes. These follow-ups do not rewrite the
failed aggregate or the historical cloud FAIL11 as green CI.

The real CJS/Node/runtime gate, without an experimental environment variable in
the child, passed title duration/Undo/Redo, graphic/base reuse, text/position,
encoded fallback, source mutation rejection, trim and decoded-equivalent Undo,
native cancellation while the colour helper ran, exit 0 and complete private
cleanup. One recorded run measured initial preparation 2.851 s, duration/Undo/Redo
22.6–24.5 ms, text/position about 641 ms, and encoded fallback 2.356 s. A prior
integration run measured initial 4.062 s and text/position 715–772 ms. These are
bounded Host/CJS measurements, not a controlled Tauri/presentation benchmark or
a latency guarantee. The 2.2 s wait is not claimed eliminated.

Final export was independently decoded against the preserved reference: all
300 frames and all 480,000 samples per channel are identical, with the original
1920x1080 CFR30/48 kHz grid. Static independent reviews found no remaining
concrete issue in their examined UI/IPC and Host/worker/contracts boundaries.

**Pending:** the Mac was locked when the native UI tool attempted inventory.
The experimental candidate's real Tauri smoke, actual IPC/decode/presentation
receipts, continuous playback/seek/visual comparison and Owner judgement remain
blocked until manual unlock and execution. Earlier standalone WebKit proof
results do not substitute for these current integration gates. No app adoption
or all-pass claim follows from packaging alone.

Raw fixtures, failed and passing runs, inventories, package, hashes and review
reports are kept outside Git in the owning task's `layered-integration-evidence`
and private `/tmp` test root. The prior apps/runtimes and the separate Localizar
front are preserved. No Take operation, merge, push or publication is included.

Director impact: **compatible presentation/typed-contract extension** in this
trial. The Director gains no new authority or generic tool execution. A future
default or broader composition scope requires a separate Owner decision and
the applicable architectural/benchmark gates.
