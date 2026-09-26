# Windows Media Runtime / h264_mf Feasibility V1 — Evidence

**Status:** WINDOWS H264_MF FEASIBILITY VERIFIED — PRODUCT ENABLEMENT NOT STARTED

**Baseline:** `c1b233cc1344a1f0bcd1a55bb5a91f5350b26833`

**Branch:** `feat/windows-media-runtime-evidence-v1`

**Tested code SHA:** `c7fa975979ba0fb07fd5a94ff1148d542b457e09`

## Scope

Slice 5A answers one bounded question: CEVRA's exact, signature-verified
Windows x64 Media Runtime can build and execute real synthetic H.264/AAC
encodes with the approved first candidate, `h264_mf`. It does not enable
Windows in the product, alter the empty Windows encoder allow-lists, certify
representative consumer hardware, or close K1/K5.

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
5. builds FFmpeg under the Visual Studio x64 environment with the explicit zlib
   prefix, sealed flags, Media Foundation and a file-backed dependency filter
   for FFmpeg's generated MSVC dependency command;
6. assembles and integrity-verifies the private Media Runtime 0.3.1;
7. records `h264_mf` enumeration/options and runs the native fixture matrix;
8. uploads only bounded JSON/provenance/text evidence for 14 days.

The signed FFmpeg archive is unchanged. The dependency-filter adjustment
rewrites four generated `ffbuild/config.mak` commands to invoke the tracked awk
program by file, avoiding the MSYS command-line escape defect documented by
FFmpeg ticket 9360. The helper digest and exact command count are retained in
build provenance.

The matrix uses a 2 s horizontal 30 fps fixture and a 12.012 s vertical
30000/1001 fixture. Three non-stationary white-flash/audio-click events test
start/middle/end alignment. It validates H.264/AAC, complete decode, frame and
sample counts, monotonic PTS, per-stream duration, A/V alignment and a known
+250 ms negative control. Tolerance is declared before execution as one video
frame + one audio sample + one AAC frame. PSNR is characterization only, not a
human product-quality threshold.

## Evidence levels

| Level | Result on `c7fa975979ba0fb07fd5a94ff1148d542b457e09` |
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
- resulting library SHA-256:
  `bce4ad7fa42626215a5ea07ff075d6cff8c7e6efedb35b3fe9219d5eac802b50`;
- smoke: `zlib=1.3.2 roundtrip=29`.

The official Mark Adler page is the audited transport for the armored key, but
its HTML wrapper is not a durable build identity. The extracted key digest,
full fingerprint and detached signature are the pinned authorities. The exact
key, archive, signature, license, build instructions and provenance are carried
as compliance/reproducibility evidence; no zlib DLL is distributed.

## Authoritative Windows run

- workflow run `36252636826`, job `108433408831`, event `push`, SUCCESS;
- artifact `windows-h264-mf-evidence-c7fa975…`, digest
  `802fa379b597dc223b17931ca44fb04bd226767aacab5a751f2e0e6a8f91faf2`;
- runner: GitHub-hosted Windows Server 2025, build `10.0.26100`, AMD64;
- toolchain: MSVC `19.51.36257` x64; private CPython `3.12.14`;
- FFmpeg/ffprobe `9.0.1`; FFmpeg SHA-256
  `d0b5175d5ca5aaf658569d43ddbf3fcbfee7e183f27460e15ff425b49cccd5df`;
- sealed build flags include `--disable-autodetect`, `--disable-gpl`,
  `--disable-nonfree`, `--disable-network`, `--enable-zlib`,
  `--enable-mediafoundation` and `--toolchain=msvc`;
- runtime integrity and worker health PASS; production H.264 deliveries `[]`;
- unavailable-encoder control: nonzero exit, no published output, no silent
  fallback.

### Native fixture results

| Case | Encode/decode | Frames / audio samples | Stream duration | Max A/V error / tolerance | Negative +250 ms | Output | Wall / peak RSS | PSNR |
|---|---|---:|---|---|---|---:|---|---:|
| horizontal 320×180, 30/1, 2 s | PASS | 60 / 96,000 | 2.000 / 2.000 s | <0.001 / 54.688 ms | correctly rejected, 250 ms | 10,526 B | 0.262 s / 41,566,208 B | 77.446 dB |
| vertical 180×320, 30000/1001, 12.012 s | PASS | 360 / 576,576 | 12.012 / 12.012 s | 4.200 / 54.721 ms | correctly rejected, 254.2 ms max | 27,473 B | 0.270 s / 45,367,296 B | 85.288 dB |

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
mutable HTML key-wrapper problem. Run `36252636826` is the first authoritative
end-to-end PASS. Earlier branch runs remain diagnostic preparation history, not
encoder evidence.

## Regression evidence

- local Media Python: 81/81 PASS under bundled Python 3.12.14;
- local `@cevra/media-ffmpeg`: 91/91 PASS after workspace build prerequisites;
- normal CI `36252636820` on the tested code SHA: 5/5 SUCCESS (Monorepo,
  Tauri, Media Runtime reproducibility, Transcription and Alignment);
- exact managed macOS arm64 runtime `36253504626` on the tested code SHA:
  SUCCESS, including the functional Application resolved-audio/final-mux
  catalog.

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

No Director authority changes. The coordinated Media Runtime gate remains
**ACTIVE**, Windows release remains unpromised, and no HDR/editorial/mastering/
Composition work started.
