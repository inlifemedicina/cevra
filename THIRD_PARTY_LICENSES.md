# Third-Party Licenses and Provenance

Every incorporated dependency, model, copied permissive source component or redistributed binary must be recorded with project, upstream URL, exact version/commit, license, usage type, modifications and required notices.

## Active / pinned integrations

| Project | Version / commit | Intended role | License | Current status / modifications |
|---|---|---|---|---|
| ffmpeg-skill | 1.4.2 / `58f64f9d9e6a0ced4a4cd6a198d7476dede50d1a` | Typed local media execution and capability/verification reference for `cevra-media-worker` | MIT | Adapter and runtime contract implemented. CEVRA will vendor/audit the required execution layer for build packaging and replace upstream libx264/libx265 assumptions with CEVRA's encoder policy before redistribution. MIT notice must accompany substantial reused source. |
| FFmpeg | build version to be pinned before first redistributed runtime | Desktop media processing binary | LGPL 2.1+ by default; configuration can change effective license | CEVRA-distributed build policy is LGPL-only by default. Exact source version, configure flags, build ID, notices and source-offer/compliance materials must be recorded for every shipped runtime. GPL/nonfree builds must not be substituted into release artifacts. |

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
