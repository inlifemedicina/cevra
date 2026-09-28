# Windows Media Runtime / h264_mf Feasibility V1 — Evidence

**Status:** SLICE 5A IMPLEMENTED / CLOSED — WINDOWS H264_MF FEASIBILITY VERIFIED — PRODUCT ENABLEMENT NOT STARTED

**Baseline:** `c1b233cc1344a1f0bcd1a55bb5a91f5350b26833`

**Branch:** `feat/windows-media-runtime-evidence-v1`

**Tested code SHA:** `c17aea572e91cc1802e73dba5dad03c6b047f0cd`

**Approved feature HEAD:** `5a0ca42db757530dbd4b8f6aa8071c74b6c4eee6`

**Feature PR / merge:** PR #49, normal merge commit
`660f8cd13f11729d5663e1ff373e9eb91a4bffbb`

## Scope

Slice 5A answers one bounded question: CEVRA's exact, signature-verified
Windows x64 Media Runtime can build and execute real synthetic H.264/AAC
encodes with the approved first candidate, `h264_mf`. It does not enable
Windows in the product, alter the empty Windows encoder allow-lists, certify
representative consumer hardware, or close K1 product enablement/K5.

The historical spike run `35721243478` stopped at `actions/setup-python` before
source verification. The replacement recipe bootstraps the pinned private
CPython artifact directly. The runner Python remains a build tool, not the
product interpreter.

## Exact recipe

The branch-scoped workflow
[`windows-media-runtime-evidence.yml`](../.github/workflows/windows-media-runtime-evidence.yml):

1. downloads the pinned Windows x64 CPython archive and verifies its SHA-256;
2. prepares and re-verifies the private root-level `python.exe`;
3. verifies signed FFmpeg 9.0.1 and zlib 1.3.2 sources plus pinned signer
   fingerprints and prepares the audited `ffmpeg-skill` tree;
4. builds and smoke-tests an x64 `/MT` static `zlib.lib` with upstream
   `win32/Makefile.msc`, including `zlibVersion()` and compress/decompress;
5. proves that the prepared `zlib.lib` is the only active linker candidate,
   disables `pkg-config`, builds FFmpeg under the Visual Studio x64 environment
   with Media Foundation, and applies a file-backed dependency filter to the
   four exact generated MSVC dependency commands;
6. assembles and integrity-verifies the private Media Runtime 0.3.1;
7. validates the generated manifest against its canonical schema, inventories
   `ffmpeg.exe`/`ffprobe.exe` dependencies, runs a final PNG/zlib smoke, records
   `h264_mf` enumeration/options and runs the native fixture matrix;
8. uploads only bounded JSON/provenance/text evidence for 14 days.

The signed FFmpeg archive is unchanged. The dependency-filter adjustment
rewrites four generated `ffbuild/config.mak` commands to invoke the tracked awk
program by file, avoiding the MSYS command-line escape defect documented by
FFmpeg ticket 9360. The exact helper is packaged at
`sources/ffmpeg/CEVRA_MSVC_DEPENDENCIES.awk`; its digest, source-pattern digest,
target file and exact command count are retained in build provenance and
validated by runtime integrity. The packaged `BUILD.md` reproduces the zlib
environment, sealed flags, post-configure adjustment, build and staged install
without runner-specific paths.

The matrix uses a 2 s horizontal 30 fps fixture and a 12.012 s vertical
30000/1001 fixture. Three non-stationary white-flash/audio-click events at
15/50/85% test start/middle/end alignment. Video uses decoded frame PTS with
passthrough extraction; audio amplitude is anchored to the first real decoded
audio-frame PTS after proving a continuous 48 kHz frame timeline. Each stream
is compared both with the planned truth and with the other stream. The same
detector must reject (A) physical click samples delayed 250 ms before encode
and (B) an exact-runtime stream-copy remux with a real audio container offset.
It also validates exactly one H.264 video plus one AAC audio stream, dimensions,
rational rate, sample rate/count, full decode and per-stream durations.
Tolerance is declared before execution as one video frame + one audio sample +
one AAC frame. PSNR remains characterization only.

## Focused review remediation

- **J-1:** the synchronization oracle now preserves real audio PTS, proves
  audio-frame continuity, compares each of exactly three audio/video events to
  the planned truth, and exercises the same detector against two physical
  negative files.
- **J-2:** Windows `ffmpeg.zlib.id` is part of the closed schema and the
  generator validates its own output against that schema before runtime
  integrity verifies the assembled artifact. Darwin forbids the Windows-only
  zlib/adjustment fields.
- **J-3:** the exact MSVC awk adjustment and complete path-independent build
  recipe are packaged and hash-bound to manifest/provenance integrity.
- **J-4:** the native matrix asserts exact stream shape, codecs, dimensions,
  rational frame rate, 48 kHz audio, decoded samples/frames, per-stream
  duration, worker health, empty production H.264 deliveries and event count.
- **J-5:** measured processes write stdout/stderr to temporary files while RSS
  is polled; only bounded output/tails enter memory or error reports.
- **J-6:** static zlib selection is a joint proof: disabled `pkg-config`, unique
  linker-visible prepared library, configure probe, `dumpbin` dependency
  inventory with no zlib DLL/unexpected external dependency, and final FFmpeg
  PNG encode/probe smoke.

## Evidence levels

| Level | Result on `c17aea572e91cc1802e73dba5dad03c6b047f0cd` |
|---|---|
| Exact FFmpeg candidate | **PASS:** signed 9.0.1, `h264_mf` enumerated/options inspected, two real encode/probe/decode/timing cases passed |
| Exact private runtime/worker | **PASS:** CPython 3.12.14, runtime assembly/integrity, worker info/health |
| Typed Application operation | NOT ENABLED / NOT CLAIMED; Windows H.264 allow-lists remain empty |
| Desktop export/promotion | NOT RUN / 5B; POSIX publication identity has no Windows equivalent yet |
| Release compatibility | NOT RUN; hosted Windows Server is not representative consumer hardware or clean-machine release acceptance |

## Pinned zlib build input

- version/source: zlib 1.3.2, official `zlib.net` release tar.xz;
- archive SHA-256:
  `d7a0654783a4da529d1bb793b7ad9c3318020af77667bcae35f95d0e42a792f3`;
- detached-signature SHA-256:
  `03ce710347e2f84fa7ed0a6ae6a93467b08031a3022fc296da40220a83b96667`;
- signer fingerprint: `5ED46A6721D365587791E2AA783FCD8E58BCAFBA`;
- effective armored-key SHA-256:
  `27f818fd93326e4531c6b094f0edc4c331a1c77ec6449675a3929ae3274d85ac`;
- license: Zlib, exact license SHA-256
  `e32ff4e00d9d94930537635291da39e7e612703334bf6fde8c7f1686fe8a45a2`;
- build: upstream `win32/Makefile.msc`, explicit `/MT`, x64 static
  `zlib.lib`, source unmodified;
- resulting library SHA-256 in the authoritative run:
  `6adf8ecf2c903b43fd4134b9f5d3ba13621f3629a6765dca6408657a3aa722f6`;
- smoke: `zlib=1.3.2 roundtrip=29`.

The official Mark Adler page is the audited transport for the armored key, but
its HTML wrapper is not a durable build identity. The extracted key digest,
full fingerprint and detached signature are the pinned authorities. The exact
key, archive, signature, license, build instructions and provenance are carried
as compliance/reproducibility evidence; no zlib DLL is distributed.

## Authoritative Windows run

- workflow run `36442497813`, job `108996300595`, event `push`, SUCCESS;
- tested SHA `c17aea572e91cc1802e73dba5dad03c6b047f0cd`;
- artifact `windows-h264-mf-evidence-c17aea5…`, digest
  `574d1ba34ff6b264a8bffc7e83c4d1ea868395fd4cd78e48a5900472a0a698dc`;
- runner: GitHub-hosted Windows Server 2025, build `10.0.26100`, AMD64;
- toolchain: MSVC `19.51.36257` x64; private CPython `3.12.14`;
- FFmpeg/ffprobe `9.0.1`; FFmpeg SHA-256
  `25ef58df79385771bc060bd24cbf5c740f86996d836778c0b6c04edfb32ea562`;
- sealed build flags include `--disable-autodetect`, `--disable-gpl`,
  `--disable-nonfree`, `--disable-network`, `--enable-zlib`,
  `--enable-mediafoundation` and `--toolchain=msvc`;
- runtime integrity and worker health PASS; generated Windows manifest passed
  the canonical closed schema; production H.264 deliveries `[]`;
- zlib selection PASS: `pkg-config` disabled, one visible prepared `zlib.lib`,
  verified `zlibVersion` configure probe, no dynamic zlib dependency, no
  unexpected external DLL, and final PNG round-trip PASS;
- unavailable-encoder control: nonzero exit, no published output, no silent
  fallback.

### Native fixture results

| Case | Encode/decode | Frames / audio samples | Stream duration | Max A/V error / tolerance | Negative +250 ms | Output | Wall / peak RSS | PSNR |
|---|---|---:|---|---|---|---:|---|---:|
| horizontal 320×180, 30/1, 2 s | PASS | 60 / 96,000 | 2.000 / 2.000 s | <0.001 / 54.688 ms | A: 250.0 ms; B: 253.667 ms, both rejected | 9,941 B | 7.246 s / 41,381,888 B | 78.189 dB |
| vertical 180×320, 30000/1001, 12.012 s | PASS | 360 / 576,576 | 12.012 / 12.012 s | 3.200 / 54.721 ms | A: 253.2 ms; B: 253.467 ms, both rejected | 27,281 B | 0.265 s / 45,445,120 B | 84.866 dB |

`h264_mf` enumerated with `nv12`, `yuv420p` and `d3d11` input formats and
reported its rate-control/scenario/quality/hardware options. The run does not
claim that hardware acceleration was selected; successful execution on a
hosted Server runner is evidence for the candidate, not universal consumer
hardware certification.

## Diagnostic history

Run `36248882110` first reached MSVC configure and stopped at `ERROR: zlib
requested but not found`; it was a build-input blocker, not an encoder result.
Run `36251702637` then proved signed zlib preparation plus static build/smoke,
and exposed FFmpeg's inline MSVC awk escape failure. Runs `36252164130` and
`36252423243` characterized the four generated dependency commands and the
mutable HTML key-wrapper problem. Run `36252636826` remains valid evidence for
build/runtime/encode viability, but its synchronization conclusion is
superseded because the original audio oracle discarded absolute stream PTS and
its negative control altered measured arrays rather than a media file. Remedial
run `36440583561` compiled and installed FFmpeg, then correctly failed the new
dependency inventory because `AVICAP32.dll` had not yet been classified as a
Windows system DLL. Final run `36442497813` is the authoritative end-to-end
PASS for timing, both physical negatives and the tightened provenance contract.

## Regression evidence

- local remediation-directed Python: 28/28 PASS;
- local Media Python: 91/91 PASS under bundled Python 3.12.14;
- local `@cevra/media-ffmpeg`: 91/91 PASS after workspace build prerequisites;
- normal CI `36442497896` on the tested code SHA: 5/5 SUCCESS (Monorepo,
  Tauri, Media Runtime reproducibility, Transcription and Alignment);
- exact managed macOS arm64 runtime `36444659967`, job `109003732523`, event
  `workflow_dispatch`, on the tested code SHA: SUCCESS, including Audio
  Sequence, Audio Measurement and the Application resolved-audio/final-mux
  acceptance catalog. The preceding `36253504626` remains historical.
- final feature-head CI `36445498724` on
  `5a0ca42db757530dbd4b8f6aa8071c74b6c4eee6`: 5/5 SUCCESS;
- PR #49 CI `36455189225`: 5/5 SUCCESS, and PR Exact Runtime
  `36455189151`: SUCCESS, both on the unchanged approved feature HEAD;
- post-merge main CI `36456056888`: 5/5 SUCCESS, and post-merge Exact Runtime
  `36456056825`: SUCCESS, both on merge SHA
  `660f8cd13f11729d5663e1ff373e9eb91a4bffbb`.

The focused independent re-review concluded **APPROVE FOR PR WITH
NON-BLOCKING NOTES — SLICE 5A ONLY**. The approved feature HEAD entered `main`
unchanged. Slice 5A is therefore closed for its bounded feasibility/evidence
scope; this does not enable Windows product behavior.

System Python 3.9 is not equivalent test evidence because these suites use
Python 3.12 language/runtime behavior. No heavyweight ML suite or model was
needed.

## Remaining boundary and next decision

Slice 5A proves the native binary and exact runtime/worker layers only. Product
enablement remains 5B. `NodeMediaArtifactStore.matchesPublication()` currently
returns false on Windows for POSIX `dev`/`inode` evidence; therefore
`MediaApplicationService.assertOwnedOutputPublication()`, cleanup and the
resolved-audio PCM consumer guard fail closed when strong identity is absent.
The smallest correct 5B candidate is a Windows file-identity implementation
bound to the same publication evidence contract plus lifecycle/cancellation,
capability smoke, typed allow-list activation and representative-machine tests.
URI/path/mtime alone is not an acceptable substitute.

Two bounded follow-ups remain non-blocking:

- **W5A-L1:** if the build recipe changes, or before release if still relevant,
  tighten `verify_zlib_configure_probe()` so the summary is derived from and
  correlated to the exact `config.log` zlib check line. Current composite
  evidence remains sufficient because source identity, static-library
  selection, disabled `pkg-config`, `CONFIG_ZLIB`, dependency inventory and
  the PNG smoke are independently closed.
- **W5A-L2:** before or within Windows clean-machine dependency closure, make
  the DLL parser reject or safely recognize unexpected valid DLL filename
  punctuation instead of silently omitting it. The current parser covers the
  exact sealed MSVC build's reachable naming set.

The next gate is a Product Owner / technical-lead decision on whether Slice 5B
is the dependency-optimal next implementation versus another remaining
coordinated Media Runtime prerequisite. Slice 5B remains **NOT STARTED**.

No Director authority changes. The coordinated Media Runtime gate remains
**ACTIVE**, Windows release remains unpromised, and no HDR/editorial/mastering/
Composition work started.
