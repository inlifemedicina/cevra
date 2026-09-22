# CEVRA Media Runtime Coordinated Plan

**Status:** PROPOSED — PLAN REVIEW; production implementation not started

**Evidence base:** `21e7cce26af6b1bb744fe8f47f9b34461426bd61`

**Research branch:** `spike/media-runtime-coordinated-gate`

**Date:** 2026-09-22

This document reconciles the approved Media Runtime requirements with the
current code, reproducible synthetic experiments, platform evidence, resource
costs, dependencies, compatibility constraints, and a dependency-ordered set
of production slices. It does not approve a new architecture, dependency,
Project IR schema, encoder fallback, tone-mapping preference, Composition
Engine, or product-facing operation name.

## 1. Progress and evidence classification

Completed in this research gate:

- recovered MR-A01–MR-A06, MR-V01–MR-V02 and MR-Q01 from their committed
  historical source without renumbering them;
- traced the current application → typed operation → adapter → worker →
  verified runtime → validated result → ProjectHistory promotion path;
- traced enriched probe metadata and confirmed that local ingest currently
  drops the new color, orientation and exact-rate evidence;
- characterized audio/J-cut feasibility, multi-cut process topology, mux video
  packet identity, SDR/PQ/HLG/VFR/rotation evidence and failure cleanup with
  synthetic fixtures;
- audited Windows H.264 selection and the HDR dependency/build gap;
- reconciled render/composition ownership, artifact ownership and the frozen
  Transcript Cache V1 impact;
- produced one recommended first implementation slice and the Product Owner
  decisions that remain genuinely open.

Explicitly blocked or unavailable:

- **native Windows execution:** NOT RUN; no native Windows host was available;
- **experimental Windows GitHub Actions:** NOT RUN; the repository's remaining
  private-runner allowance/billing could not be verified and the local host has
  no `gh` client, so the no-new-cost condition was not provable;
- **exact sealed FFmpeg rebuild:** NOT RUN; the authoritative source-preparation
  script requires `gpg`, which is absent on this host. The signature requirement
  was not bypassed;
- **HDR→SDR:** NOT RUN; neither the pinned configuration nor the local lab
  binary contains `zscale`, and no unapproved dependency was installed;
- **real iPhone HDR/Dolby Vision and subjective visual acceptance:** NOT RUN;
- **deterministic ENOSPC injection:** NOT RUN; no isolated quota/mount was
  available and a process file-size limit would not faithfully model ENOSPC.

The outcome is therefore **PLAN REVIEW READY WITH EXPLICIT BLOCKED EVIDENCE**.

## 2. Authorities and source chain

Current architectural authorities:

- [Architecture V1](ARCHITECTURE_V1.md), especially the typed Media adapter,
  Project IR authority and non-destructive render boundary;
- [ADR 0003](adr/0003-media-engine.md), [ADR 0008](adr/0008-persistent-media-worker-lifecycle.md),
  [ADR 0012](adr/0012-composition-engine-benchmark.md),
  [ADR 0013](adr/0013-nondestructive-editing-quality-performance.md),
  [ADR 0016](adr/0016-desktop-project-persistence-recovery.md) and
  [ADR 0019](adr/0019-project-history-scalability-v2.md);
- [Editorial decisions](CEVRA_EDITORIAL_DECISIONS.md),
  [Visual decisions](CEVRA_VISUAL_DECISIONS.md),
  [Composition decisions](CEVRA_COMPOSITION_DECISIONS.md),
  [Director decisions](CEVRA_DIRECTOR_DECISIONS.md) and the
  [acceptance catalog](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md);
- the [Fable review](CEVRA_FABLE_AUDIT_REVIEW_2026-09-18.md) and
  [targeted audit](CEVRA_FABLE_TARGETED_AUDIT_MEDIA_HISTORY_PREVIEW_EXPORT_2026-09-18.md).

The exact MR identifiers survive in historical commit
[`40288fbe33d5f2097c9d993e337ddb83218aad28`](https://github.com/inlifemedicina/cevra/blob/40288fbe33d5f2097c9d993e337ddb83218aad28/docs/CEVRA_EDITORIAL_DECISIONS.md#L280-L294),
the closed/unmerged head of PR #26. That record is evidence for the identifiers,
not current branch state or blanket implementation authorization. Current code
and later accepted decisions supersede its old implementation-status claims.

Current concrete sources:

- `packages/contracts/src/media.ts:159-218` — enriched probe result and current
  closed typed operations;
- `packages/contracts/src/media.ts:224-338` — allow-list and boundary validation;
- `engines/media-ffmpeg/src/adapter.ts:64-180` — adapter dispatch;
- `engines/media-ffmpeg/src/adapter.ts:198-326` — probe/result parsing and
  delivery resolution;
- `engines/media-ffmpeg/worker/cevra_native_tools.py:280-410` — fixed internal
  transcode and mux construction;
- `engines/media-ffmpeg/src/process-transport.ts:72-245` — release isolation,
  liveness, timeout, cancellation and worker-exit settlement;
- `packages/application/src/media-service.ts:115-295` — recovery, output
  preflight, stale-project rejection, promotion and cleanup;
- `packages/application/src/local-source-ingest.ts:245-319` — current durable
  ingest mapping;
- `engines/media-ffmpeg/runtime/build_ffmpeg.py:15-55` — sealed configuration;
- `engines/media-ffmpeg/src/runtime.ts:95-180` and
  `engines/media-ffmpeg/worker/runtime_profile.py:9-88` — approved encoder and
  functional-smoke policy.

External primary sources used for feasibility:

- [FFmpeg MediaFoundation encoder documentation](https://www.ffmpeg.org/ffmpeg-codecs.html#MediaFoundation);
- [FFmpeg filter documentation](https://ffmpeg.org/ffmpeg-filters.html);
- [FFmpeg license and distribution guidance](https://www.ffmpeg.org/legal.html);
- [zimg release 3.0.6](https://github.com/sekrit-twc/zimg/releases/tag/release-3.0.6)
  and its [exact release license](https://github.com/sekrit-twc/zimg/blob/release-3.0.6/COPYING);
- [GitHub standard hosted-runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

## 3. Host and experiment safeguards

Host characterization:

| Item | Evidence |
|---|---|
| OS / architecture | macOS 27.0 (`26A428`), Darwin arm64 |
| CPU | Apple M4, 10 logical CPUs |
| RAM | 24 GiB |
| Free disk before labs | approximately 107 GiB |
| Scratch | `/tmp/cevra-media-runtime-gate-21e7cce`, owner mode `0700` |
| Lab binary | Homebrew FFmpeg 9.0.2, SHA-256 `c8173e9755795978bce8e104f8d7044fabe7d6d84044aba37d3648c6f4e4e1a8` |
| Lab output size | 4.0 MiB for the final run |

Safeguards: one heavy process/build at a time, four build jobs maximum, 20 GiB
scratch budget, stop below 60 GiB free disk, 30-minute heavy-command timeout,
and stop on host memory-pressure warning. These are laboratory limits, not
product policy.

The Homebrew binary enables GPL components and differs from the pinned 9.0.1
release configuration. It is used only to characterize fixed synthetic graphs.
It is not release parity, a candidate distribution, or licensing evidence for
CEVRA. The exact sealed rebuild was blocked before compilation because source
signature verification could not run without `gpg`.

## 4. Coordinated capability/gap matrix

Classification vocabulary is the one required by this gate. “FFmpeg has a
filter” never means that CEVRA exposes or safely integrates it.

| ID | Approved behavior and source | Current path and classification | Owner / minimum work | Tests, resources, compatibility | FIX NOW / DEFER |
|---|---|---|---|---|---|
| MR-A01 | Isolated audio processing without unnecessary intermediate recode; appropriate audio/PCM output. Historical source lines 286 and current ADR 0013. | `extract-audio` can produce PCM, while gain/fade/loudness operate as A/V mutations and reject audio-only delivery. **EXISTING PRIMITIVES / INTEGRATION REQUIRED.** | Contracts + adapter + worker. Add one closed audio-only render path reused by later audio planning; do not expose filters. | PCM duration/sample-rate/channel tests; cancellation; original preservation. PCM increases disk/I/O materially (stereo 48 kHz s16 ≈ 192 kB/s). No schema required. | **FIX NOW** as part of the first audio-execution slice; repeated A/V recodes multiply later rework. |
| MR-A02 | Reusable passage/window evidence for levels, peaks and noise; measurement does not choose edits. Historical line 287. | Silence ranges exist; no typed peak/level/noise-window report. **INTERNAL EXTENSION REQUIRED.** | Contract + adapter + fixed worker measurement. Specify windows, integrated/short-term loudness, true/sample peak and clipping evidence; keep policy in Application/QA. | Tones, impulses, silence, clipped and stereo fixtures; bounded report size and CPU. No Project IR migration. | **FIX NOW after A01/A05 executor contract** if the first vertical edit needs automated leveling; otherwise second slice. It must precede automatic processing decisions. |
| MR-A03 | Localized gain with smooth transitions without video cuts. Historical line 288. | `volume` accepts one global gain; `audio-fade` only applies start/end fades to one asset. **INTERNAL EXTENSION REQUIRED.** | Application-resolved audio plan + bounded per-item gain envelope executed inside the same audio pass. | Boundary continuity, exact timing, no progressive shortening, clipping evidence. Negligible state cost; linear filter CPU. | **FIX NOW with the multi-input executor** because emulating it with per-window media edits causes intermediate recodes and drift. |
| MR-A04 | Conventional justified EQ, compression, de-ess, limiting and denoise; no universal treatment. Historical line 289. | No typed operations. Some core filters may exist, but exact bundle capability and quality are not fully evidenced. **UNRESOLVED DECISION** for the allowed initial treatment set; then **INTERNAL EXTENSION REQUIRED**. | Application owns the explicit selected treatment; worker exposes only approved bounded parameters. No ML restoration dependency. | Voice/noise fixtures, bypass equivalence, double-application prevention, listening review, CPU. License unchanged if only LGPL-compatible built-ins are used, but exact filter inventory must be proven. | **DEFER from the first slice.** Adding an unapproved universal chain now creates quality and contract churn; implement only the approved conventional subset after A02 evidence. |
| MR-A05 | Junctions, track mixing, final normalization, independent placement and J-cut timing; mux is not mix. Historical line 290 and decision 8. | Trim/concat/fade/mux exist, but no typed multi-input temporal placement or mix. The synthetic J-cut proved a one-pass path; current operations cannot represent it. **INTERNAL EXTENSION REQUIRED.** | Contracts + adapter + fixed worker compiler for an explicit resolved audio plan. App/Director chooses edits; runtime places/trims/mixes exactly. | Source/timeline timebases, mono/stereo and sample-rate conversion, overlaps, no overlap, fades, peaks, duration drift, cancellation. One pass avoids N process startups and N intermediates. | **FIX NOW — recommended first production slice.** This is the smallest missing runtime primitive blocking a correct J-cut vertical edit. |
| MR-A06 | Editable application delivery; Project IR/Application/compiler/Desktop/UI remain separate; worker is not editorial authority. Historical line 291. | Project IR tracks/clips and application execution/history exist; there is no resolved media-plan compiler or end-to-end J-cut/export integration. **EXISTING PRIMITIVES / INTEGRATION REQUIRED.** | Application compiles existing canonical edit state into a revision-bound proposed resolved plan; adapter validates capabilities; runtime executes. | Stale revision rejection, undo/redo, preview/export correspondence, no hidden mutations. UI/Director remain later consumers. | **FIX NOW incrementally after MR-A05**, not in the runtime-only first PR and not as a new canonical project model. |
| MR-V01 | Preserve color, bit depth/pixel format, orientation/display and exact timing evidence. Historical line 292. | Worker → adapter → `MediaProbeResult` is implemented. Local ingest persists only duration/dimensions/float fps/sample fields and codecs, dropping exact rates, VFR suspicion, rotation and color/HDR. **EXISTING PRIMITIVES / INTEGRATION REQUIRED.** | Application/source metadata authority is the missing layer. Decide a typed versioned durable descriptor or an explicit re-probe policy; do not hide canonical render decisions in arbitrary extensions. | Ingest/open/export round-trip, invalidation on source-byte change, V1 compatibility, 0/0 unavailable semantics. Small storage; probe I/O on cache miss. | **FIX NOW before color/render planning**, but not by opportunistic Project IR change. Product Owner must approve the authority if durability requires a schema/package change. |
| MR-V02 | Execute approved source interpretation/correction/style with preview/export consistency and no double application. Historical line 293; Fable K2. | Metadata parse exists; transcode offers scale/fps only; pinned configuration has no zimg/zscale. **EXTERNAL DEPENDENCY / PLATFORM VALIDATION REQUIRED** plus an **UNRESOLVED DECISION** on quality/profile. | Proposed typed color-transform stage behind adapter after dependency approval. Separate source interpretation, numerical transform and output tags. | SDR bypass, PQ, HLG, iPhone/Dolby Vision decode, range/bit-depth, decoded-signal checks, human review, bundle size and perf on both V1 targets. | **DEFER implementation until dependency/legal/profile approval, but FIX dependency evidence next.** Silent SDR output from common HDR input is a V1 correctness requirement. |
| MR-Q01 | Minimal technical evidence to verify assembly; reuse probe/silence/A02/A05; measurements never order edits. Historical line 294. | Probe and silence exist; no typed black-frame/audio-problem report or assembled-plan QA. **INTERNAL EXTENSION REQUIRED.** | QA policy in Application; only small fixed diagnostics in Media Runtime, reusing A02/A05 results. | Bounded sampling, false-positive fixtures, no mandatory frame-by-frame scan. CPU/I/O proportional to sampled windows. | **DEFER until the A02/A05 report shapes stabilize.** Implementing first would duplicate evidence contracts. |

### Matrix conclusion

The first vertical edit is blocked by MR-A05, not by an entire composition
architecture. MR-A01/A03 can ride the same single-pass audio executor. MR-A02
then provides the evidence needed for automated audio policy. MR-V01 is already
available at the runtime boundary but needs an approved durable authority before
it can safely drive export. MR-V02 and Windows H.264 remain platform/dependency
gates, not reasons to combine all work into one production PR.

## 5. Front A — audio, J-cut and multi-source execution

### Current support

- Audio-only extraction supports `wav`, `m4a` and `mkv` delivery via the typed
  `extract-audio` operation.
- Global fixed gain, whole-asset start/end fades, loudness normalization and
  silence detection exist.
- Audio mutation on an A/V asset copies compatible video and re-encodes audio.
- `mux-audio` copies the selected video stream and encodes/maps a replacement
  audio stream; when `replaceExisting=false`, it maps the old audio as another
  stream. It does not place or mix streams.
- There is no typed channel balance/downmix, phase diagnostic, localized gain,
  EQ/compressor/de-esser/denoise surface, multi-input placement or J-cut.
- The application already provides cancellation, stale-project rejection,
  typed journal promotion and cleanup, but it has no compiler from timeline
  audio placements to a single runtime operation.

### Synthetic J-cut result

The fixed lab graph used two sources: red/440 Hz at 48 kHz and blue/880 Hz at
44.1 kHz. Video cuts at 2.000 s. Source B audio begins at 1.500 s and source A
audio stops at 1.500 s, so the audio leads picture by 500 ms without overlapping
the two tones.

| Check | Result |
|---|---|
| Output duration | 4.000 s, expected 4.000 s — PASS |
| 1.1 s tone | 440 Hz — PASS |
| 1.65 s tone (before picture cut) | 880 Hz — PASS |
| 2.2 s tone | 880 Hz — PASS |
| Resampling | 44.1 kHz source normalized to the 48 kHz output — PASS |
| Candidate wall / peak RSS / bytes | 0.0349 s / 30,343,168 bytes / 404,759 bytes |
| Sequential graph wall / peak RSS / bytes | 0.0376 s / 28,983,296 bytes / 404,735 bytes |

The tiny fixture is a correctness result, not a meaningful speed claim. Both
graphs were one process and one video/audio encode. The important result is
representational: current CEVRA operations cannot independently place/mix the
audio while cutting video at another time.

### Bounded multi-cut comparison

A 24-cut, two-source, 2.4-second workload compared per-cut operation composition
with one internal graph. Each cut was exactly 100 ms (three video frames at
30 fps and 4,800 samples at 48 kHz).

| Topology | Processes | Wall | Max per-process RSS | Intermediates | Output | Duration |
|---|---:|---:|---:|---:|---:|---:|
| Per-cut encode + copy concat | 25 | 0.6003 s | 26,116,096 B | 286,068 B | 255,639 B | 2.400 s |
| One fixed multi-input graph | 1 | 0.0352 s | 32,423,936 B | 0 B | 255,639 B | 2.400 s |

The single pass used more peak memory in its one process but removed 24 process
starts and all cut intermediates. The workload is deliberately short; it does
not establish product-scale memory bounds or subjective quality. It does show
why composing existing per-file mutations is the wrong execution topology for
the first J-cut slice.

### Proposed smallest closed contract

The first slice should introduce one **PROPOSED** internal operation, with final
naming subject to approval, conceptually:

```text
render-audio-sequence
  items[1..bounded]
    sourceUri
    sourceStartMs
    sourceEndMs
    timelineStartMs
    gainDb?                 # explicit, not inferred
    fadeInMs? / fadeOutMs?  # bounded within the item
  outputUri                 # PCM intermediate only in Slice 1
  sampleRate                # approved closed set
  channels                  # mono or stereo
```

It must reject unknown fields, non-finite values, unsafe URIs, invalid ranges,
excess item count/duration, unsupported channel layouts and output overwrite.
The adapter compiles the validated structure to one fixed internal graph. No raw
filtergraph crosses the TypeScript/Python boundary. The runtime neither chooses
cuts nor invents gain/normalization. Slice 1 produces an isolated PCM artifact;
final normalization, treatment policy, video composition and mux remain later
explicit steps.

The output PCM choice avoids another lossy audio generation and permits
measurement before final encoding. The exact PCM depth (`s16le`, `s24le` or
float) and overlap/headroom rule require Product Owner/quality approval; the lab
used s16le only for deterministic measurement and does not select the product
format.

## 6. Front B — Windows H.264 feasibility

Verified source/build facts:

- the pinned FFmpeg is 9.0.1 and its Windows configure flags include
  `--enable-mediafoundation`, `--enable-d3d11va` and `--enable-dxva2`;
- FFmpeg's official documentation lists `h264_mf` as a MediaFoundation wrapper,
  capable of software or hardware operation, with `nv12` the safer input format;
- the CEVRA worker already enumerates encoders, runs a functional eight-frame
  smoke, benchmarks candidates, and records an effective encoder profile;
- **both** current approved-candidate tables leave Windows H.264 empty:
  `engines/media-ffmpeg/src/runtime.ts:95-113` and
  `engines/media-ffmpeg/worker/runtime_profile.py:9-18`;
- current tests intentionally assert that even an enumerated `h264_mf` is not
  selected (`engines/media-ffmpeg/test/runtime.test.mjs:12-16`).

Therefore Windows H.264 is unavailable in current production by policy, even
if the pinned binary enumerates the encoder. The smallest later code change is
to add `h264_mf` to both allow-lists only after a native encode/probe/decode test
passes. Enumeration alone remains insufficient.

Native status: **NOT RUN**. No statement about hardware use, software fallback,
consumer-PC compatibility, output quality, timing or A/V sync is proven. A
future native recipe must:

1. assemble/verify the exact private Windows x64 runtime and root `python.exe`;
2. prove `h264_mf` enumeration and capture `ffmpeg -h encoder=h264_mf`;
3. run the worker functional smoke and a short actual encode using `nv12`;
4. probe and fully decode the result;
5. compare duration/frame count and A/V synchronization;
6. record whether Media Foundation selected hardware or software, when the
   platform exposes trustworthy evidence;
7. run failure behavior with the encoder unavailable;
8. repeat on representative consumer hardware before calling V1 compatible.

No AV1/VP9 substitution, x264/OpenH264 fallback, NVENC/QSV/AMF feature, patent
conclusion or commercial eligibility is selected here. If `h264_mf` fails, the
minimum Product Owner decision is the allowed H.264 fallback strategy and its
license/distribution constraints.

## 7. Front C — HDR, SDR, VFR, rotation and color

### Current state

`MediaProbeResult` and `parseProbe` preserve exact average/nominal rational
strings, a bounded VFR suspicion signal, rotation, pixel format/bit depth,
colorspace/matrix, primaries, transfer, range and HDR classification. Unknown is
absent; `0/0` remains source evidence but is not a usable numeric frame rate.

This evidence survives worker → adapter → contract but not local ingest. The
current source record keeps only duration, dimensions, a floating `frameRate`,
sample information and codecs. Consequently color/render planning cannot rely
on durable MR-V01 evidence yet.

### Synthetic results

| Fixture | Result | Limitation |
|---|---|---|
| SDR BT.709 yuv420p | metadata + full decode PASS | no visual-grade comparison |
| 10-bit BT.2020/PQ ramp | tags, 10-bit pixels + full decode PASS | synthetic code-value ramp, not real HDR footage |
| 10-bit BT.2020/HLG ramp | tags, 10-bit pixels + full decode PASS | same limitation |
| VFR timing | `r_frame_rate=30/1`, `avg_frame_rate=23/1` — evidence PASS | mismatch is not by itself definitive VFR policy |
| Rotation | 90° display matrix preserved and probed — PASS | pixels were not rotated |
| HDR→SDR | **NOT RUN** | `zscale` absent; no approved profile/dependency |

The PQ/HLG fixtures use a deliberate limited-range 10-bit ramp and explicit
BT.2020/transfer semantics. They are not SDR pixels merely relabeled as HDR, but
they do not validate real camera metadata, Dolby Vision enhancement layers,
mastering metadata, or subjective highlight/skin-tone quality.

### zscale/zimg dependency assessment

The sealed build uses `--disable-autodetect` and does not enable zimg. The local
lab FFmpeg exposes `tonemap` but not `zscale`; `tonemap` alone does not provide
the required color-space/transfer conversion path. No tag-only substitute is
acceptable.

The current upstream zimg release is 3.0.6 and its release `COPYING` file uses
WTFPL v2. That is not in CEVRA's preferred permissive set and therefore requires
explicit legal/product review before incorporation. No source revision/hash or
signature has been pinned in CEVRA, no bundle-size/performance measurement
exists, and no isolated build was attempted. An implementation slice must first:

1. approve exact zimg version/license treatment;
2. pin authoritative source URL, revision/archive hash and available signature;
3. extend the provenance and license inventory;
4. build to a separate prefix with `--enable-libzimg`/the exact FFmpeg flag;
5. verify `zscale` and tone-map filters in the exact sealed configuration;
6. measure binary/bundle delta and PQ/HLG conversion CPU/RSS;
7. verify decoded BT.709 signal and output tags on both V1 platforms;
8. pass real reference-footage and human visual acceptance.

SDR pass-through should avoid the transform entirely. VFR policy must preserve
timestamps unless an explicit output profile selects CFR. Rotation must remain
display metadata/source interpretation until a resolved visual plan explicitly
requires pixel transformation.

## 8. Front D — render, preview and composition boundary

K3 remains the recommended ownership split:

```text
Application
  validates project/source revision and resolves explicit placements/policy
      ↓
CompositionEngineAdapter
  produces final visual video from original sources/assets
      ↓
MediaEngineAdapter
  produces final audio and muxes it with copied encoded video when compatible
      ↓
Application
  validates output/effective profile and promotes the exact result
```

The lab mux copied all 60 encoded video packets: source and output packet-hash
sequence SHA-256 both equal
`eed752aba0769fea26bdd69c2a207226527b185d5551d8031d762a5cdecd8433`.
Mux wall time was 0.0405 s, peak RSS 18,710,528 bytes and output 330,841
bytes. Full decode then passed in 0.0250 s with 22,659,072-byte peak RSS. Video
encode generations: zero; new audio encode generations: one. Container hashes
were intentionally not compared.

### PROPOSED resolved-plan boundary

This is a derived execution value, not a new project model:

- plan format/version and required runtime capabilities;
- project ID, Project IR schema version, history revision and head snapshot;
- stable source/asset IDs plus authorized immutable URIs and content identities
  where available;
- one rational project timebase and explicit rounding rule;
- visual placements and audio placements with separate source-relative and
  timeline-relative ranges;
- source interpretation evidence (rotation, range, primaries, transfer,
  matrix, bit depth, rational rates) and its evidence identity/version;
- explicit typed operations only;
- output profile and selected effective capabilities;
- preview/export intent plus the transformations intentionally omitted in a
  proxy preview;
- result binding used to reject stale completion before promotion.

Example, without claiming implementation: a two-source edit retains source A
video until 2.000 s, starts source B audio at timeline 1.500 s from source time
0, starts source B video at 2.000 s from source time 0.500 s, produces final
visual video through `CompositionEngineAdapter`, produces one final PCM audio
sequence through Media Runtime, then muxes audio while copying compatible video.
Application rejects the result if the source identities or project revision no
longer match.

This plan neither selects Remotion/HyperFrames nor creates a Render
Orchestrator. The existing composition benchmark must additionally evaluate
live-preview viability and original-source/generational-loss impact (K4). HEIC,
HEIF/AVIF and fonts are Composition/image-ingest dependencies; they are not
silently moved into Media Runtime by this plan.

## 9. Front E — artifact ownership and lifecycle

| Artifact | Owner / current location | Lifetime and cleanup | Finding / minimum change |
|---|---|---|---|
| Original media | User; external URI referenced by Project IR | Permanent/user-owned; never deleted or rewritten by CEVRA cleanup | Preserved by ADR 0013. Resolved plans reread originals for final quality. |
| Project Store/package and ProjectHistory transcript blobs | Desktop persistence + ProjectHistory under trusted app data | Canonical; checkpoint/recovery/previous-known-good rules; never cache | Preserve ADR 0016/0019. Cleanup must continue using `retainedMediaUris()` metadata only. |
| User exports | Application/Project IR export record; caller-authorized path | User artifact, retained across history and never disposable cache | Existing preflight refuses overwrite; successful promotion protects the URI. |
| Current render output/staging | Media application attempt `outputUris` | New output only; removed on failure/cancel/recovery unless pre-existing or history-retained | Existing code is sound for one output. Multi-artifact slices must persist the complete attempt-owned set before execution. |
| Alignment PCM | Alignment application service, owner-scoped temporary audio | Disposable per execution; bounded cleanup/retry before promotion | Reuse its ownership pattern; do not store PCM in Transcript Cache. Crash-leftover reclamation remains a known separate packaging gate. |
| Future final-audio PCM | Proposed Media application attempt | Disposable until final mux; protected while active; removed after successful mux or terminal cleanup | Add explicit attempt ownership and recovery record in the A05 integration slice; no global GC. |
| Evidence frames/thumbnails | Current `extract-frame` output is an ordinary typed media output | No dedicated cache/quota today | First QA/preview consumer must choose application-owned rebuildable storage and active-use protection. Do not treat generated evidence as canonical. |
| Proxies | Not implemented | Future rebuildable derivative | Composition/preview slice owns policy, source revision binding and cleanup. |
| Composition caches | Not implemented | Future engine-owned rebuildable derivative | Composition benchmark/engine selection owns it; not the first Media slice. |
| Transcript Cache | PR #24 app-cache root, currently draft/unmerged | Disposable bounded derived text cache | Separate from media artifacts and ProjectHistory. Do not share storage/GC. |

Existing production safeguards cover output-exists, symlink refusal, worker
loss, cancellation, configurable render timeout, liveness, bounded settlement,
subprocess reaping and application cleanup. Repository lifecycle tests are the
authoritative evidence. The lab additionally preserved an existing sentinel,
left no final output after cancellation, removed its owner-created partial, and
failed closed on a read-only directory. Low-disk behavior remains unproven and
must be injected at the artifact-store/worker boundary in the slice that adds
multi-artifact staging.

No general cache manager, quota system, updater or garbage collector is
justified by the imminent slices.

## 10. Resource, compatibility and dependency summary

- PCM is the largest predictable new temporary cost: 48 kHz stereo s16 is
  about 11.52 MiB/min; s24 about 17.28 MiB/min; float32 about 23.04 MiB/min.
  Product depth is unresolved.
- One-pass 24-cut assembly removed 286,068 bytes of short-lived intermediates
  in the tiny fixture and reduced process count 25→1. Its single-process peak
  RSS was about 6.4 MiB higher. Longer-source scaling must be measured before a
  product cap is chosen.
- Mux video stream-copy is objectively preserved for the fixture at zero video
  encode generations.
- Current VFR/color/rotation evidence is additive and backward compatible in
  `MediaProbeResult`; durable planning authority is not yet selected.
- Adding zimg changes the sealed build, provenance, notices, bundle and legal
  review. It is not a mechanical filter enablement.
- Enabling `h264_mf` changes two policy allow-lists but is safe only after an
  exact native functional test. The worker's existing smoke/benchmark/profile
  mechanisms should be reused.
- No new dependency, lockfile, runtime pin or production source was changed by
  this research branch.

## 11. Read-only Transcript Cache and Director impact

PR #24 remains frozen at `700bb35a65fe8bf7552ab7621d41455dd463e7f9`.
Its alignment key binds Media Engine ID/version/API, exact `extract-audio`, PCM,
and profile version `alignment-pcm-v1`; the cache stores neither media nor PCM.

Required reconciliation after Media Runtime production changes:

1. Any change to alignment PCM sample rate, channel mapping, sample format,
   decode behavior, trim semantics or normalizer increments
   `AlignmentMediaPreparationIdentity.profileVersion`.
2. Media Runtime engine/API version must change when output semantics change;
   capability-only additions that leave alignment PCM byte semantics identical
   need a test proving the existing identity remains valid.
3. Audio/J-cut and color operations must not enter transcription/alignment keys
   unless they actually produce the cached engine input.
4. Runtime pipeline versions must continue to cover decode/normalization code
   relevant to the result, not hardware encoder selection that cannot affect
   PCM preparation.
5. Cache hits and fresh misses must be revalidated against ProjectHistory V2
   promotion/cleanup without coupling cache entries to history blobs.
6. Rebase/reconciliation must restore current MR-V01 contract fields and the
   current managed-Python/layout fixes, because the frozen branch predates them.

ProjectHistory compatibility: **compatible extension**. The proposed audio
executor returns derived files and promotes only existing typed application
mutations; no history blob or Project IR schema change is required in Slice 1.

Director impact: **compatible extension**. Director/Application may later emit
approved edit decisions that compile into the resolved audio plan. Director
must never supply a raw graph or invoke the worker directly. No Director code is
required for the runtime-only first slice.

## 12. Dependency-ordered production slices

### Slice 1 — typed multi-input audio/J-cut executor (recommended first)

- **Requirements:** MR-A01, MR-A03, core MR-A05; enables later MR-A06.
- **Behavior:** render one bounded explicit audio sequence with independent
  source/timeline timing, optional explicit gain/fades and deterministic sample
  format into one PCM intermediate.
- **Reuse:** URI/field validation, adapter dispatch, persistent worker,
  cancellation/liveness, artifact preflight/cleanup, FFmpeg audio primitives.
- **Extension:** one closed typed operation and one fixed graph compiler.
- **No changes:** Project IR/History/Store schemas, UI, Tauri permissions,
  Director, composition engine, final normalization policy.
- **Tests:** J-cut lead, non-overlap and overlap, mono/stereo, 44.1→48 kHz,
  impulses, fades, gain envelope, clipping evidence, exact duration, 0/0 not
  involved, cancellation, output exists, symlink, worker exit, many-cut bound.
- **Rollback:** operation remains unused by current consumers until Slice 3;
  revert the additive contract/worker surface.
- **Completion:** exact sealed macOS runtime passes; resource scaling is bounded;
  independent review approves the contract and PCM/overlap rules.

### Slice 2 — typed audio measurement

- **Requirements:** MR-A02 and reusable MR-Q01 evidence.
- **Behavior:** bounded windowed integrated/short-term level, sample/true peak,
  clipping and explicitly defined noise evidence; no edit decision.
- **Reuse:** probe/silence and Slice 1 PCM semantics.
- **Extension:** one compact typed report with versioned measurement algorithm.
- **Completion:** deterministic fixtures, bounded result/CPU and no policy in
  worker.

### Slice 3 — application resolved audio planning and final mux

- **Requirements:** MR-A05/MR-A06.
- **Behavior:** compile existing Project IR timing plus explicit approved audio
  choices into Slice 1, run Slice 2 where needed, apply one explicit final
  normalization decision, mux with composition video using stream copy when
  compatible, reject stale results and clean all intermediates.
- **Extension:** derived revision-bound plan, not a second project model.
- **Completion:** first end-to-end editable J-cut, undo/redo, crash recovery,
  packet-identity mux evidence and acceptance catalog cases.

### Slice 4 — durable source technical descriptor

- **Requirements:** MR-V01 downstream integration.
- **Behavior:** preserve trusted normalized probe evidence through ingest/open/
  planning/export with byte/source invalidation and V1 compatibility.
- **Approval:** Product Owner/architecture must choose the durable authority if
  it requires Project IR or Project Package evolution. Arbitrary extension state
  is not an acceptable hidden render authority.

### Slice 5 — native Windows H.264 validation and gated enablement

- **Requirements:** K1 and Windows V1 export.
- **Behavior:** exact runtime build, native encode/probe/decode/sync benchmark,
  then add only `h264_mf` to both allow-lists when passing.
- **Completion:** real Windows evidence plus failure behavior and representative
  consumer-PC validation. Fallback requires a separate decision if it fails.

### Slice 6 — HDR→SDR dependency and transformation

- **Requirements:** MR-V02 and K2.
- **Behavior:** exact approved zimg build, source interpretation, one numerical
  transform, BT.709 output tags, SDR bypass and no double application.
- **Completion:** provenance/license, bundle/performance, PQ/HLG/reference
  footage, VFR/A/V sync and human acceptance on both targets.

### Slice 7 — minimum assembly QA

- **Requirements:** remaining MR-Q01.
- **Behavior:** reuse probe/silence/A02/A05 plus only proven missing diagnostics
  such as bounded black-frame intervals. Application/QA owns severity/action.

### Separate Composition/preview benchmark gate

Composition engine selection, live-preview behavior, HEIC/HEIF/AVIF, fonts,
visual effects and proxy/cache policy remain under ADR 0012/K4. They integrate
through the proposed resolved boundary; they do not belong in Slices 1–7 unless
new evidence demonstrates a narrow dependency.

## 13. Exact first recommendation

Implement **Slice 1: the typed multi-input audio/J-cut executor**, after the
Product Owner approves its PCM depth and overlap/headroom rule.

Why first:

- the lab proves current primitives cannot represent independent J-cut audio;
- the one-pass candidate is deterministic and avoids process/intermediate
  multiplication;
- it uses existing runtime, lifecycle and security boundaries;
- it requires no external dependency, schema, UI, composition choice or Windows
  claim;
- it establishes the narrow execution primitive required by the first testable
  multi-source vertical edit while leaving editorial choices in Application.

Do not start with an all-purpose render plan, universal vocal chain, HDR build,
cache manager or Composition Engine.

## 14. Minimum Product Owner decisions

1. **Slice 1 PCM and overlap policy:** select intermediate depth and explicit
   headroom/clipping behavior; confirm the proposed bounded operation shape/name.
2. **MR-V01 durable authority:** decide whether normalized source technical
   evidence becomes a typed Project IR field, a versioned Project Package
   descriptor, or is always re-probed with an explicit freshness policy.
3. **Windows fallback boundary:** if native `h264_mf` fails quality/availability,
   approve which fallback family may be investigated; none is assumed.
4. **zimg legal/dependency approval:** approve or reject exact zimg incorporation
   after legal review of its non-preferred license and provenance proposal.
5. **HDR output policy:** approve tone-map preference/reference targets and the
   human acceptance set; the plan does not choose a creative grade.
6. **Initial conventional voice-treatment subset:** after MR-A02 evidence,
   approve which of EQ/compression/de-ess/limiting/denoise belongs in V1.

Composition Engine selection and preview proxy quality remain their existing
ADR 0012 decision gate, not a new decision caused by this plan.

## 15. Adversarial self-review

Attempts to disprove the plan found:

- **Existing primitive sufficiency disproved:** mux maps streams but does not
  mix/place them; global operations cannot express the measured J-cut.
- **“No extra encode” qualified:** final mux copied every video packet, but the
  lab audio was encoded once. Per-cut composition performs one encode per cut;
  the proposed audio executor deliberately renders one PCM generation.
- **Single application of transforms:** the plan carries explicit source
  interpretation and operation stages; no color transform exists yet. It must
  be tested for SDR bypass and double-application before MR-V02 closes.
- **A/V sync:** exact 500 ms J-cut timing and 4.000/2.400 s synthetic durations
  passed. Long VFR and real-camera sync remain unproven.
- **Bounded memory:** short labs peaked near 32.4 MB, but long-source/many-track
  scaling is not proven; item/duration bounds need production characterization.
- **Late promotion:** existing app/transport tests reject stale/lost/cancelled
  results and clean outputs. Multi-artifact plan state must be persisted before
  execution in Slice 3.
- **Protected cleanup:** current cleanup uses metadata-only
  `retainedMediaUris()` and tests protect undo/redo. No lab result weakens it.
- **Native Windows:** explicitly NOT RUN; enumeration/configure flags are not
  presented as encode evidence.
- **Commercial suitability:** zimg is not approved; exact legal review remains.
- **New contract need:** supported by a concrete representation gap and the
  25-process versus one-process topology evidence. The proposed name is not
  treated as approved.

Inherited observations not patched here:

- Windows encoder candidate tables are intentionally empty pending evidence;
- local ingest loses enriched probe evidence;
- exact sealed rebuild tooling requires `gpg`;
- low-disk behavior lacks a deterministic isolated test;
- the worker lifecycle and cleanup paths remain current foundations, not
  generalized claims about future multi-artifact renders.

## 16. Reproduction and retained evidence

Tracked laboratory tooling:

- `tools/media-runtime-gate/run_lab.py`
- `tools/media-runtime-gate/README.md`

Final local raw evidence (not committed because it contains generated media and
verbose logs):

- `tools/media-runtime-gate/evidence/2026-09-22-macos-arm64.json` — committed
  concise result summary tied to experiment revision `c6426b40...`;
- `/tmp/cevra-media-runtime-gate-21e7cce/lab-system-ffmpeg-v5/results.json`
  — full local raw report;
- sibling synthetic fixtures under the same owner-only directory.

Reproduce with a chosen binary:

```sh
python3 -m py_compile tools/media-runtime-gate/run_lab.py
python3 tools/media-runtime-gate/run_lab.py \
  --ffmpeg /absolute/path/to/ffmpeg \
  --ffprobe /absolute/path/to/ffprobe \
  --output-dir /empty/owner-scoped/directory
```

The output directory must be empty. The result records exact binary hash,
configuration, fixture hashes, commands, wall/CPU/RSS, output bytes and
classifications. A future run with the sealed CEVRA binary must be recorded
separately rather than overwriting the non-parity result.

## 17. Final gate status

**PLAN REVIEW READY WITH EXPLICIT BLOCKED EVIDENCE**

Production implementation has not started. The coordinated Media Runtime gate
is not closed. Main and the frozen Transcript Cache V1 branch remain outside
this research branch.
