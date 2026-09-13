# CEVRA Media Runtime build and CI

## Reproducible inputs

The release bundle is assembled only from inputs pinned in
`engines/media-ffmpeg/runtime/versions.json`:

- a platform-specific `astral-sh/python-build-standalone` CPython archive, with its
  release URL, SHA-256 digest and audited Python license digest;
- the FFmpeg source archive, detached signature, their SHA-256 digests and the
  signing-key fingerprint/digest;
- the exact `ffmpeg-skill` commit, package version and audited MIT license digest;
- the CEVRA worker sources and repository notices.

The assembler refuses an existing output directory. It stages into a temporary
directory, validates the complete release layout, and renames the validated tree
into place only after all checks pass.

FFmpeg is configured with the stable internal prefix `/cevra-media-runtime`,
installed through `DESTDIR`, and then copied into the requested staging location.
The build forces `SOURCE_DATE_EPOCH=0`, so temporary host paths do not enter the
recorded configure flags.

## Preparing a bundle

Run these commands from the repository root with Python 3.12:

```sh
python engines/media-ffmpeg/runtime/prepare_python_runtime.py /tmp/cevra-python
python engines/media-ffmpeg/runtime/prepare_vendor.py /tmp/ffmpeg-skill
python engines/media-ffmpeg/runtime/prepare_ffmpeg_source.py /tmp/ffmpeg-source
python engines/media-ffmpeg/runtime/build_ffmpeg.py \
  /tmp/ffmpeg-source/ffmpeg-9.0.1 /tmp/cevra-ffmpeg
python engines/media-ffmpeg/runtime/assemble_runtime.py /tmp/cevra-media-runtime \
  --python-root /tmp/cevra-python \
  --python-executable bin/python3.12 \
  --ffmpeg-prefix /tmp/cevra-ffmpeg \
  --vendor-source /tmp/ffmpeg-skill
```

On Windows, the pinned Python executable is `python.exe`. FFmpeg source
preparation requires GnuPG. FFmpeg compilation also requires the platform
toolchain described by `build_ffmpeg.py`; installing that toolchain is outside the
assembly script.

Preparation and assembly fail when a download hash, source signature, actual
signature signer, signing-key fingerprint, upstream commit, audited license,
provenance record, notice, runtime component, or manifest field is missing or
invalid. Release assembly accepts the pinned managed CPython provenance and an
LGPL-only FFmpeg build with `--disable-autodetect`, `--disable-gpl`, and
`--disable-nonfree`.

The runtime manifest verifies internal consistency and integrity for the complete
bundle inventory. It does not prove authenticity by itself. Bundle authenticity
comes from the platform-signed CEVRA application, installer or update artifact. If
the runtime is ever downloaded separately, the signed CEVRA updater must
authenticate it. These scripts do not add a second manifest signature or generate
production signing keys.

The prepared CPython tree is pruned after its archive hash is verified. `pip`,
`ensurepip`, IDLE, 2to3, tkinter, turtledemo, Tcl/Tk, itcl/thread and their
dedicated executables/native modules are absent from the release tree. The Python
provenance records the pruning policy, removed paths and observed native component
versions. On macOS arm64, the manifest also hashes the audited OpenSSL, XZ/liblzma,
bzip2 and libffi license texts copied into the bundle.

The FFmpeg distribution area contains `COPYING.LGPLv2.1`, the exact verified
`ffmpeg-9.0.1.tar.xz`, its detached signature, the pinned public key, configure
flags, toolchain identification and build instructions.

The validated macOS arm64 bundle currently publishes MP4, MOV and MKV
audio/video delivery plus WAV and M4A audio-only delivery. Functional smoke tests
select `h264_videotoolbox` and `hevc_videotoolbox` for H.264/H.265, native `aac`
and `opus` for encoded audio, and `pcm_s16le` for PCM. Copy capabilities remain
conditional on the probed input codec and target container. WebM, MP3 and AV1 are
not published by this bundle. SDR H.264 output is checked for BT.709 stream
metadata; HDR output is not claimed as validated.

## npm installation and monorepo checks

The root `package-lock.json` is the installation source of truth. CI and release
validation use:

```sh
npm ci
npm run ci
```

`npm run ci` builds all current workspaces and discovers every workspace `test`
script through npm. `npm run test:python` runs the Media Runtime stdlib unittest
suite.

## Current CI evidence

The GitHub Actions workflow currently proves the following on Ubuntu 24.04 x64:

- Node.js 22 installation through the committed npm lockfile;
- all monorepo TypeScript builds and Node tests;
- syntax validation for the Media Runtime Python sources;
- Media Runtime Python stdlib unit tests, including resource limits, pruning,
  process isolation, lifecycle cleanup and encoder allow-list behavior;
- parsing of the pin file and runtime manifest schema;
- download and GnuPG verification of the pinned FFmpeg source signature, including
  an exact match between the valid signature signer and the pinned fingerprint;
- download, SHA-256 verification, version check, license check and provenance for
  the pinned Linux x64 private CPython archive;
- checkout, patching and verification of the exact `ffmpeg-skill` commit, version
  and audited MIT license;
- assembly of the release directory shape with the real private CPython and
  prepared vendor tree;
- manifest-schema validation, startup under the assembled private interpreter,
  and fail-closed checks for incomplete manifests, modified notices and invalid
  FFmpeg license classification.

The CI assembly check uses deterministic FFmpeg/ffprobe fixtures with the same
release metadata contract. It validates the build pipeline and integrity gates; it
does not prove a native FFmpeg build, hardware encoders, or redistribution on that
runner.

## Platform status

| Platform | Evidence | Release claim |
| --- | --- | --- |
| Ubuntu 24.04 x64 | Monorepo build/tests, pinned CPython and ffmpeg-skill preparation, release-layout assembly and negative integrity/license checks | Native FFmpeg bundle validation still requires a dedicated build runner |
| macOS arm64 | A pinned, pruned CPython 3.12.14 bundle and signed-source FFmpeg 9.0.1 LGPL build are validated locally with manifest/tampering checks, representative real SDR media, cancellation/orphan checks and functional VideoToolbox encoder smoke tests | Media Runtime v1 release target proven on the current macOS arm64 host; dedicated macOS CI remains required to make this evidence continuous |
| macOS x64 | Artifact URL and digest are pinned | Runner and native bundle validation pending |
| Linux arm64 | Artifact URL and digest are pinned | Runner and native bundle validation pending |
| Windows x64 | Planned; artifact URL and digest are pinned | No release claim: runner, real bundle, media execution and lifecycle validation are pending |

Pinned metadata alone is not a platform support claim. A platform becomes a
supported release target only after its CI runner builds the native FFmpeg inputs,
assembles the bundle, runs the integrity verifier, starts the worker, and completes
the media smoke tests on the produced artifact.
