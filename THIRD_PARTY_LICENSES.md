# Third-Party Licenses and Provenance

Every incorporated dependency, model, copied permissive source component or redistributed binary must be recorded with project, upstream URL, exact version/commit, license, usage type, modifications and required notices.

## Active / pinned integrations

| Project | Version / commit | Intended role | License | Current status / modifications |
|---|---|---|---|---|
| @noble/hashes | 2.4.0 | SHA-256 primitive used by the CEVRA-owned canonical transcript digest in `@cevra/project-ir` | MIT; Copyright (c) 2022 Paul Miller (https://paulmillr.com) | Direct production dependency with zero runtime dependencies; consumed unmodified from https://github.com/paulmillr/noble-hashes via the npm package. CEVRA owns the semantic projection, canonical serialization, digest version and verification; no upstream cryptographic source is copied into CEVRA. Exact npm integrity: `sha512-X5XaVWZIBCT7HHZGm5I7ZQXDwLG+bGXuSrMQAW+7Zvl87h1kmc1ZB1VSRJcpUfoUrGQp4Fkoxm5kZ+Ms+aW+eA==`. |
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
| React / React DOM | 19.3.0 / 19.3.0 | Browser UI runtime for the CEVRA Vids desktop shell | MIT | Exact direct production dependencies, redistributed in the compiled WebView frontend; consumed unmodified from https://github.com/facebook/react. |
| Tauri / tauri-build | 2.11.5 / 2.6.3 | Native desktop window/runtime and Rust build integration | Apache-2.0 OR MIT | Exact direct Rust dependencies for `apps/desktop`; `tauri` is redistributed in the native application and `tauri-build` is build-time only. |
| tauri-plugin-shell / tauri-plugin-dialog | 2.3.6 / 2.7.3 | Rust-only private Node sidecar supervision and native file selection | Apache-2.0 OR MIT | Exact direct Rust dependencies, redistributed in the native application. Neither JavaScript guest package is installed. The WebView capability grants no plugin permission; Rust supplies the fixed executable/script and selected path. |
| serde / serde_json / Tokio | 1.0.229 / 1.0.151 / 1.53.1 | Closed JSONL protocol serialization, bounded response routing, and asynchronous supervisor coordination | Apache-2.0 OR MIT / Apache-2.0 OR MIT / MIT | Exact direct Rust dependencies linked into the desktop application; used by trusted Rust only. Tokio features are limited to macros, runtime, synchronization, and time. |
| Node.js | 22.23.2 LTS | Private persistent runtime for the bundled CEVRA desktop host | MIT plus bundled third-party notices | Official `nodejs.org` darwin-arm64 and linux-x64 archives are pinned in `apps/desktop-host/runtime/versions.json` by URL and SHA-256. Preparation verifies the archive before copying the executable into ignored Tauri external-binary output and copies the complete official distribution LICENSE into packaged resources. No user-installed Node or PATH fallback is used. |
| @tauri-apps/api | 2.11.1 | Core typed `invoke` transport for narrow CEVRA Tauri commands | Apache-2.0 OR MIT | Exact direct WebView dependency redistributed in the frontend bundle. No shell, dialog, filesystem, HTTP, or sidecar JavaScript API is installed. |
| esbuild | 0.28.2 | Deterministic CommonJS bundling of the trusted desktop host | MIT | Exact direct development dependency of `@cevra/desktop-host`; build-time only and not redistributed as application runtime code. |
| @tauri-apps/cli | 2.11.4 | Tauri development and native build command | Apache-2.0 OR MIT | Exact direct development dependency; build-time only and not redistributed as application code. |
| Vite / @vitejs/plugin-react | 8.3.0 / 6.1.1 | Desktop frontend development server and production bundling | MIT / MIT | Exact direct development dependencies; build-time only. |
| Vitest / jsdom | 5.0.0 / 30.0.1 | Deterministic desktop application-shell tests and DOM environment | MIT / MIT | Exact direct development dependencies; test-only and not redistributed. |
| Testing Library React / user-event | 16.3.3 / 14.6.7 | User-centered React rendering and interaction test utilities | MIT / MIT | Exact direct development dependencies; test-only and not redistributed. |
| @types/react / @types/react-dom | 19.3.0 / 19.3.0 | TypeScript declarations for the React UI | MIT / MIT | Exact direct development dependencies; build-time only and not redistributed. |
| faster-whisper | 1.2.1 | Local speech transcription engine behind `TranscriptionEngineAdapter` | MIT | Pinned for the isolated Transcription Engine environment. No EDVID source is copied. |
| CTranslate2 | 4.8.2 | CPU/CUDA inference backend used by faster-whisper | MIT | Pinned for CPython 3.12; wheel availability verified for macOS arm64/x64, Linux x64 and Windows x64 without declaring those CEVRA release targets. |
| PyAV | 18.1.0 | Local media decoding for faster-whisper | BSD-3-Clause; linked FFmpeg retains its own license | Release policy requires a source build against a separate inventoried compatible FFmpeg 8.x LGPL-only library set. It does not reuse the sealed Media Runtime FFmpeg 9.0.1. Upstream PyPI binary wheels bundle GPL codec libraries and are not approved release inputs. |
| Hugging Face Hub | 1.31.0 | Optional model-asset acquisition into the explicit CEVRA cache | Apache-2.0 | Model download is profile-controlled and disabled by default; user media is never uploaded. |
| tokenizers | 0.23.2 | Whisper tokenizer runtime | Apache-2.0 | Pinned in the isolated Transcription Engine environment. |
| ONNX Runtime | 1.23.2 | Runtime dependency of faster-whisper | MIT | Pinned in the isolated Transcription Engine environment. |
| tqdm | 4.70.1 | Progress/runtime dependency of faster-whisper | MPL-2.0 AND MIT | Pinned in the isolated Transcription Engine environment. |
| coloredlogs | 15.0.1 | ONNX Runtime logging dependency | MIT | Pinned transitive dependency of the isolated Transcription Engine environment. |
| humanfriendly | 10.0 | coloredlogs formatting dependency | MIT | Pinned transitive dependency of the isolated Transcription Engine environment. |
| SymPy | 1.14.0 | ONNX Runtime symbolic-math dependency | BSD-3-Clause | Pinned transitive dependency of the isolated Transcription Engine environment. |
| mpmath | 1.3.0 | SymPy arbitrary-precision arithmetic dependency | BSD-3-Clause | Pinned transitive dependency of the isolated Transcription Engine environment. |
| Systran/faster-whisper-base model | resolved asset; not bundled in this slice | Temporary V1 default multilingual model | MIT | Model assets require their own recorded resolved revision/hash before release bundling. |

## Planned / under evaluation

| Project | Intended role | License status | Incorporated? |
|---|---|---|---|
| EDVID (`fillrochaa/edvid`) | Initial functional/editorial parity baseline and potential selective source reuse after exact commit audit | MIT | No |
| HyperFrames | Preferred composition-engine benchmark candidate behind `CompositionEngineAdapter` | Apache-2.0 | No |
| Remotion | Proven EDVID-equivalent composition baseline and benchmark candidate behind `CompositionEngineAdapter` | License/version review required before incorporation | No |
| mcpCut | History/journal reference/selective reuse | MIT | No |
| MaxAzure video-editing-skill | Editorial workflow/QA library | MIT | No |
| OpenTimelineIO | Interchange adapter | Apache-2.0 | No |
| Auroq OS | Architecture/behavior reference only | UNLICENSED | No |

## Policy

Apache-2.0, MIT and BSD dependencies are preferred. LGPL components may be distributed only with an explicit compliance plan and reproducible provenance. GPL/AGPL, `--enable-nonfree` FFmpeg builds and non-permissive components require explicit architecture/licensing review before incorporation into release artifacts. Model licenses are audited independently from runtime-library licenses.

The release pipeline must fail closed when a runtime manifest, required notice, source artifact/hash, component inventory, source version, license classification or configure-flags provenance is missing. The manifest proves internal consistency of a bundle authenticated by the signed application/installer/update artifact; it is not an independent authenticity signature.
