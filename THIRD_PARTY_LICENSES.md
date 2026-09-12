# Third-Party Licenses and Provenance

Every incorporated dependency, model, copied permissive source component or redistributed binary must be recorded with project, upstream URL, exact version/commit, license, usage type, modifications and required notices.

## Active / pinned integrations

| Project | Version / commit | Intended role | License | Current status / modifications |
|---|---|---|---|---|
| ffmpeg-skill | 1.4.2 / `58f64f9d9e6a0ced4a4cd6a198d7476dede50d1a` | Typed local media execution and capability/verification reference for `cevra-media-worker` | MIT | The release preparation checks out the exact commit, applies the reviewed CEVRA runtime patch, verifies the audited license digest and vendors the resulting tree. The upstream libx264/libx265 assumptions are replaced by CEVRA's encoder policy. |
| FFmpeg | 9.0.1 | Desktop media processing binary | LGPL-2.1-or-later or LGPL-3.0-or-later, according to build flags | Source URL, detached signature and signing-key fingerprint are pinned. Release builds disable autodetection, GPL and nonfree components; the pipeline records binary hashes and configure provenance and rejects GPL/nonfree output. The LGPL text is shipped in the runtime. |
| CPython | 3.12.14 | Private managed interpreter for the desktop Media Runtime | Python Software Foundation License Version 2 and historical notices | Platform artifacts are pinned by URL and SHA-256. The runtime ships the Python license text and records the executable and complete Python-tree hashes. |
| astral-sh/python-build-standalone | release 20260901 | Reproducible source of the pinned CPython redistributable archives | MPL-2.0 build tooling; produced archives retain their component licenses | CEVRA consumes the prebuilt archive without modifying the upstream build tooling. Each prepared tree records distribution, release, platform, source URL and artifact digest. |

## Planned / under evaluation

| Project | Intended role | License status | Incorporated? |
|---|---|---|---|
| EDVID | Editorial UX/logic reference and selective source reuse | MIT | No |
| HyperFrames | Composition engine | Apache-2.0 | No |
| mcpCut | History/journal reference/selective reuse | MIT | No |
| MaxAzure video-editing-skill | Editorial workflow/QA library | MIT | No |
| OpenTimelineIO | Interchange adapter | Apache-2.0 | No |
| Tauri | Desktop/mobile application shell | MIT / Apache-2.0 | No |
| Auroq OS | Architecture/behavior reference only | UNLICENSED | No |

## Policy

Apache-2.0, MIT and BSD dependencies are preferred. LGPL components may be distributed only with an explicit compliance plan and reproducible provenance. GPL/AGPL, `--enable-nonfree` FFmpeg builds and non-permissive components require explicit architecture/licensing review before incorporation into release artifacts. Model licenses are audited independently from runtime-library licenses.

The release pipeline must fail closed when a runtime manifest, required notice, source version, license classification or configure-flags provenance is missing.
