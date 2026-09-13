# Third-Party Licenses and Provenance

Every incorporated dependency, model, copied permissive source component or redistributed binary must be recorded with project, upstream URL, exact version/commit, license, usage type, modifications and required notices.

## Active / pinned integrations

| Project | Version / commit | Intended role | License | Current status / modifications |
|---|---|---|---|---|
| ffmpeg-skill | 1.4.2 / `58f64f9d9e6a0ced4a4cd6a198d7476dede50d1a` | Typed local media execution and capability/verification reference for `cevra-media-worker` | MIT | The release preparation checks out the exact commit, applies the reviewed CEVRA runtime patch, verifies the audited license digest and vendors the resulting tree. The upstream libx264/libx265 assumptions are replaced by CEVRA's encoder policy. |
| FFmpeg | 9.0.1 | Desktop media processing binary | LGPL-2.1-or-later or LGPL-3.0-or-later, according to build flags | Source archive/signature/key URLs and SHA-256 values are pinned and verified before GPG verification. Release builds disable autodetection, GPL and nonfree components. The runtime ships the exact verified source tarball, detached signature, public key, LGPL v2.1 text, configure flags, toolchain, build instructions and provenance. |
| CPython | 3.12.14 | Private managed interpreter for the desktop Media Runtime | Python Software Foundation License Version 2 and historical notices | Platform artifacts are pinned by URL and SHA-256. The runtime is pruned of pip/ensurepip, IDLE, 2to3, tkinter/turtledemo, Tcl/Tk and dedicated associated components after dependency checks. It ships the Python license and records its complete final tree, pruning policy and native-component inventory. |
| astral-sh/python-build-standalone | release 20260901 | Reproducible source of the pinned CPython redistributable archives | MPL-2.0 build tooling; produced archives retain their component licenses | CEVRA consumes the prebuilt archive without modifying the upstream build tooling. Each prepared tree records distribution, release, platform, source URL and artifact digest. |
| OpenSSL | 3.5.8 | TLS/cryptography component in the validated macOS arm64 private CPython runtime | Apache-2.0 | Exact component version is discovered from the prepared interpreter; audited license text is pinned by SHA-256 and shipped under `licenses/python/components`. |
| XZ Utils / liblzma | 5.4.3 | Compression component in the validated macOS arm64 private CPython runtime | 0BSD / LGPL-2.1-or-later | Exact component version is discovered from the prepared interpreter; copying text is pinned by SHA-256 and shipped under `licenses/python/components`. |
| bzip2 | 1.0.8 | Compression component in the validated macOS arm64 private CPython runtime | bzip2 license | Exact component version is discovered from the prepared interpreter; license text is pinned by SHA-256 and shipped under `licenses/python/components`. |
| libffi | 3.4.8 | Foreign-function interface component in the validated macOS arm64 private CPython runtime | MIT | Version follows the pinned python-build-standalone release inventory; license text is pinned by SHA-256 and shipped under `licenses/python/components`. |
| SQLite | Runtime-discovered | Database library in the validated macOS arm64 private CPython runtime | Public domain dedication | Version and public-domain status are recorded in Python provenance; no invented notice obligation is added. |
| zlib | Runtime-discovered | Compression library used by the validated macOS arm64 private CPython runtime | zlib license; supplied by macOS in the validated bundle | The provenance marks this component as platform-provided. It is not represented as a bundled cross-platform component. |
| @types/node | 22.15.3 | TypeScript development declarations for Node.js APIs | MIT | Pinned root devDependency; build-time only and not included in the Media Runtime bundle. |
| undici-types | 6.21.0 | Transitive TypeScript declarations used by `@types/node` | MIT | Locked development-only transitive dependency; not included in the Media Runtime bundle. |

## Planned / under evaluation

| Project | Intended role | License status | Incorporated? |
|---|---|---|---|
| EDVID (`fillrochaa/edvid`) | Initial functional/editorial parity baseline and potential selective source reuse after exact commit audit | MIT | No |
| HyperFrames | Preferred composition-engine benchmark candidate behind `CompositionEngineAdapter` | Apache-2.0 | No |
| Remotion | Proven EDVID-equivalent composition baseline and benchmark candidate behind `CompositionEngineAdapter` | License/version review required before incorporation | No |
| mcpCut | History/journal reference/selective reuse | MIT | No |
| MaxAzure video-editing-skill | Editorial workflow/QA library | MIT | No |
| OpenTimelineIO | Interchange adapter | Apache-2.0 | No |
| Tauri | Desktop/mobile application shell | MIT / Apache-2.0 | No |
| Auroq OS | Architecture/behavior reference only | UNLICENSED | No |

## Policy

Apache-2.0, MIT and BSD dependencies are preferred. LGPL components may be distributed only with an explicit compliance plan and reproducible provenance. GPL/AGPL, `--enable-nonfree` FFmpeg builds and non-permissive components require explicit architecture/licensing review before incorporation into release artifacts. Model licenses are audited independently from runtime-library licenses.

The release pipeline must fail closed when a runtime manifest, required notice, source artifact/hash, component inventory, source version, license classification or configure-flags provenance is missing. The manifest proves internal consistency of a bundle authenticated by the signed application/installer/update artifact; it is not an independent authenticity signature.
