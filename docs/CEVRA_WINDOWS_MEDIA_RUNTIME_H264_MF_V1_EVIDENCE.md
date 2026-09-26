# Windows Media Runtime / h264_mf Feasibility V1 — Evidence

**Status:** BLOCKED BY BUILD INPUT — exact Windows build did not reach encoder execution

**Baseline:** `c1b233cc1344a1f0bcd1a55bb5a91f5350b26833`

**Branch:** `feat/windows-media-runtime-evidence-v1`

## Scope

Slice 5A asks one bounded question: can CEVRA's exact, signature-verified
Windows x64 Media Runtime build and actually encode acceptable synthetic H.264
with the approved first candidate, `h264_mf`? It does not enable Windows in the
product, alter the two empty Windows encoder allow-lists, certify consumer
hardware, or close K1/K5.

The historical spike run `35721243478` reached a standard Windows host but
stopped at `actions/setup-python` before source verification, runtime assembly
or encoder execution. The replacement recipe bootstraps the already-pinned
private CPython artifact from `runtime/versions.json`; the runner Python is only
a build/bootstrap tool and is not the product interpreter.

## Exact recipe

The branch-scoped workflow
[`windows-media-runtime-evidence.yml`](../.github/workflows/windows-media-runtime-evidence.yml):

1. downloads the pinned Windows x64 CPython archive and verifies its SHA-256;
2. prepares and re-verifies the private root-level `python.exe`;
3. downloads FFmpeg 9.0.1, verifies archive/key/signature hashes and the pinned
   signing fingerprint, and prepares the pinned `ffmpeg-skill` vendor tree;
4. builds with the Visual Studio x64 toolchain and CEVRA's sealed flags,
   including `--disable-autodetect`, `--disable-gpl`, `--disable-nonfree`,
   `--disable-network` and `--enable-mediafoundation`;
5. assembles and integrity-verifies the exact private Media Runtime;
6. records encoder enumeration/options and runs native `h264_mf` fixtures;
7. uploads only bounded JSON/provenance/text evidence for 14 days.

The native probe uses a horizontal short 30 fps fixture and a longer vertical
30000/1001 fixture. Each contains three non-stationary white-flash/audio-click
events. It validates H.264/AAC streams, full decode, frame count, monotonic
video PTS, per-stream duration, A/V event alignment and a known +250 ms negative
control. The positive tolerance is declared before execution as one video frame
+ one audio sample + one AAC frame. Output bytes, wall time, peak working set
and PSNR are characterized; PSNR is not a product-quality threshold and does
not replace human review.

## Evidence levels

| Level | Slice 5A target | Result on `c057f5adb19dc6c9d8c3e2951037794e4491670c` |
|---|---|---|
| Exact FFmpeg candidate | enumerate/options + real encode/probe/decode/timing | **BLOCKED BEFORE BUILD:** canonical `--enable-zlib` input is absent from the MSVC environment |
| Exact private runtime/worker | pinned Python, assembly, integrity, info/health | **PARTIAL:** private Python verified; FFmpeg assembly/worker execution not reached |
| Typed Application operation | Windows allow-list and capability smoke | NOT ENABLED / NOT CLAIMED |
| Desktop export/promotion | ownership, lifecycle, cleanup, UI | NOT RUN / 5B |
| Release compatibility | clean machine and representative consumer hardware | NOT RUN / K5 |

## Predeclared interpretation

- **PASS:** exact runtime and native matrix pass; recommend 5B typed enablement
  with Windows publication identity/lifecycle and representative hardware.
- **RUNNER BLOCKED:** bootstrap/build/platform component prevents the matrix;
  retain the reproducible recipe and do not call Windows incompatible.
- **CANDIDATE FAILED:** exact binary reaches `h264_mf` but material encode,
  decode or timing criteria fail; a fallback family requires a later Product
  Owner decision.

No AV1/VP9, x264/x265/OpenH264, NVENC/QSV/AMF or silent codec substitution is
authorized. The production Windows H.264 allow-lists remain empty throughout
this evidence slice.

## Native result

### Authoritative run

- code SHA: `c057f5adb19dc6c9d8c3e2951037794e4491670c`;
- workflow run: `36248882110`, event `push`;
- runner: GitHub-hosted Windows Server 2025 Datacenter, build `26100`, x64,
  image `windows-2025-vs2026` version `20260922.246.2`;
- toolchain: Visual Studio 2026 Developer Command Prompt `18.10.1`, MSVC
  `19.51.36257` for x64;
- exact private bootstrap: pinned CPython `3.12.14` / AMD64 / 64-bit archive
  hash verified, prepared and re-verified with its own root-level
  `python.exe`;
- exact FFmpeg input: FFmpeg `9.0.1` archive, detached signature, signing key
  and signer fingerprint all verified; pinned `ffmpeg-skill` commit and
  audited MIT license verified from repository blobs without Windows CRLF
  rewriting;
- result: `configure` failed with `ERROR: zlib requested but not found` while
  preserving the canonical `--enable-zlib` flag.

The run therefore proves that the replacement bootstrap no longer depends on
`actions/setup-python`, that the distributed private Python pin is usable on
the native runner, and that the exact signed FFmpeg/vendor inputs reach the
MSVC configure boundary. It does **not** prove FFmpeg compilation, runtime
assembly, `h264_mf` enumeration, encode/decode/timing, worker execution,
Application promotion, Desktop export or Windows release compatibility.

This is a **build-input/environment blocker**, not evidence that `h264_mf` is
inadequate or that Windows is incompatible. Disabling zlib would make the
candidate diverge from the canonical runtime profile. Pulling an unpinned
runner library or redistributing a new zlib build would introduce a dependency
and license/distribution decision outside this slice's authorization. The next
decision is to approve and pin an audited Windows-compatible zlib build input
(preferably static for the sealed runtime), then rerun this exact matrix before
considering 5B.

### Diagnostic progression

Earlier branch runs reproduced and fixed Windows-only preparation assumptions
before reaching the authoritative blocker: `36248075374` (Visual Studio path),
`36248169021`/`36248269152` (POSIX process-component probe), `36248335736`
(artifact-specific Python license), `36248430293` (case-insensitive pruning),
`36248516306` (MSYS GnuPG paths), and `36248733439` (checkout line endings).
They are diagnostic history, not encoder evidence and not repeated as PASS.

### Regression evidence

- local media Python suite: 68/68 PASS under Python 3.12;
- local `@cevra/media-ffmpeg` Node suite: 91/91 PASS after its workspace build
  prerequisites;
- normal CI run `36248882134` on the code SHA: 5/5 SUCCESS (Monorepo,
  Tauri, Alignment, Media Runtime reproducibility and Transcription);
- existing exact-runtime workflow dispatched on the same code SHA to cover the
  shared preparation/build changes: run `36249105616`, job `108423681141`,
  macOS arm64, SUCCESS.

The Windows result remains a failure by design until the missing approved build
input is resolved; the green normal and macOS runs do not convert it into an
encoder PASS.

## Director impact

This evidence changes no Director authority. A future typed capability may
report whether Windows H.264 export is available, but the Director receives no
filesystem, codec-policy or raw worker authority; while K1 remains blocked,
Windows H.264 stays unavailable rather than silently selecting another codec.
