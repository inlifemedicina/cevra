# ADR 0003 — Typed Media Engine and CEVRA Media Runtime

Status: Accepted

## Decision
FFmpeg remains the primary desktop media processor, but agents invoke only typed validated CEVRA operations. Project IR and UI never depend on FFmpeg command lines, ffmpeg-skill arguments, Python, encoder names or platform-specific runtime details.

Desktop media execution is packaged as one versioned **CEVRA Media Runtime** containing a persistent `cevra-media-worker`, CEVRA's audited/adapted ffmpeg-skill execution layer, and CEVRA-controlled FFmpeg/ffprobe binaries.

## Performance policy
- The worker is long-lived; it is not restarted for every edit operation.
- Runtime capability detection inventories encoders and hardware acceleration.
- H.264/H.265/AV1 encoder selection prefers platform-native or hardware implementations such as VideoToolbox, Media Foundation, NVENC, QSV, AMF and VAAPI when present.
- When multiple compatible encoders are available, CEVRA may run a short local benchmark and cache the fastest healthy choice for the current hardware/driver/runtime fingerprint.
- Decode acceleration is selected independently from encode acceleration.
- CPU fallback must remain explicit and licensing-compatible; `libx264`/`libx265` are not implicit fallbacks in the CEVRA-distributed runtime.

## Licensing policy
CEVRA's redistributed FFmpeg build must remain redistributable with the proprietary application. The default build must not enable GPL-only components such as libx264/libx265. Exact FFmpeg version, build ID, configure flags and applicable license are recorded in the Media Runtime manifest and third-party notices. The manifest verifies internal bundle consistency; authenticity comes from the platform-signed application, installer or update artifact that contains it. A separately downloaded runtime must be authenticated by the signed CEVRA updater.

ffmpeg-skill is MIT and may be reused/adapted, but CEVRA owns its adapter contract and maintains a small compatibility layer so upstream encoder assumptions do not dictate CEVRA's distribution license or hardware policy.

## Mobile
The desktop worker is not a mobile architectural requirement. iOS and Android implement the same `MediaEngineAdapter` through platform-compatible native media APIs for local/light operations. Heavy desktop execution is an optional capability, not a prerequisite for the mobile app.

## Consequence
The Media Runtime may be replaced or rewritten later (for example with a Rust worker) without changing Project IR, commands, UI, project files or agent-facing tools.
