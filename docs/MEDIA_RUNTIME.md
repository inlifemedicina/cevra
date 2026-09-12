# CEVRA Media Runtime v1

## Purpose
The CEVRA Media Runtime is the complete desktop media-execution unit distributed with CEVRA. End users do not install Python, ffmpeg-skill, FFmpeg or ffprobe separately.

## Logical composition

```text
CEVRA UI / agent bridge
        ↓
MediaEngineAdapter
        ↓
PersistentMediaWorkerClient
        ↓
cevra-media-worker (persistent sidecar)
        ↓
CEVRA-adapted ffmpeg-skill execution layer
        ↓
CEVRA-controlled FFmpeg + ffprobe
        ↓
platform hardware / CPU
```

## Runtime requirements
- Worker stays alive for the desktop session and is restarted only after failure/update.
- JSON-RPC is the process boundary; the application never sends arbitrary shell commands or raw FFmpeg filtergraphs.
- Runtime paths are supplied by the signed application package; release execution must not silently fall back to arbitrary binaries from the user's PATH.
- Every release carries a runtime manifest with exact worker/upstream/FFmpeg versions, build provenance and license classification.
- Experimental or optional codecs are capability-gated.

The pinned assembly commands, CI coverage and current platform evidence are
documented in [Media Runtime build and CI](MEDIA_RUNTIME_BUILD.md).

## Encoder selection
CEVRA discovers the actual encoders exposed by its bundled FFmpeg build and the current system. Static platform ordering is only a fallback.

When more than one compatible hardware encoder is healthy, CEVRA may run a short synthetic local benchmark and cache the result using a fingerprint derived from platform, architecture, FFmpeg build, GPU/driver identity and available encoder set. A cache miss or changed driver/runtime triggers a new benchmark.

Baseline H.264 preference families:
- macOS: VideoToolbox
- Windows: NVENC / QSV / AMF / Media Foundation according to availability and benchmark
- Linux: NVENC / QSV / VAAPI / AMF according to availability and benchmark

H.265/AV1 use equivalent platform-native/hardware families when present.

## Decode acceleration
Decode acceleration is selected independently from the encoder. Examples include VideoToolbox, D3D11VA, QSV, CUDA and VAAPI. Filters that require CPU frames may intentionally use software decode or explicit transfers when that is faster or more reliable end-to-end.

## Licensing boundary
The default redistributed FFmpeg runtime is built without `--enable-gpl` and without `--enable-nonfree`. CEVRA release tooling must reject a runtime whose manifest or configure provenance shows otherwise.

`libx264` and `libx265` are therefore not default redistributable fallbacks. A developer-local or separately licensed build must never be substituted into signed production artifacts by accident.

## Mobile boundary
The desktop sidecar is not shipped as the mobile execution model. iOS/iPadOS and Android implement the same CEVRA media contract with platform-compatible native adapters. Heavy rendering may optionally delegate to a paired desktop, but core mobile utility cannot depend on that pairing.

## Failure behavior
If no compatible encoder exists for a requested delivery format, the runtime reports a typed capability failure. It does not silently choose an unapproved binary, GPL-only encoder or online service.
