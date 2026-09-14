# ADR 0013 — Non-Destructive Editing and Quality/Performance Policy

Status: Accepted
Date: 2026-09-14

## Context

CEVRA Vids must preserve the quality and relevant characteristics of original media while keeping interaction, preview and rendering productive. Maximum quality does not mean selecting the slowest available path regardless of perceptual benefit. The goal is to avoid unnecessary degradation and generational loss while balancing perceptual quality, render time, file size and the requirements of the delivery target.

EDVID remains the functional and editorial baseline. Useful EDVID behavior, including per-segment extraction and lossless concat when technically appropriate, remains part of that floor. CEVRA improves on the baseline through non-destructive project state and adaptive render policies without discarding proven cut, timing, audio or editorial behavior.

## Decision

### 1. Original sources are immutable

Import and ingest must not modify, overwrite, degrade or replace the user's original media.

### 2. Project IR represents edits

Cuts, crops, zooms, captions, overlays, color treatment, audio treatment, B-roll, motion graphics and other editorial choices are editable state and instructions in Project IR. They do not destructively rewrite the original source.

### 3. Proxies, previews, caches and intermediates are disposable derivatives

Derived artifacts may prioritize low latency, reduced resolution, faster codecs and responsiveness. They never replace the original, become a final-quality source, or become a second source of truth beside Project IR.

### 4. Final export uses original sources and assets

When technically applicable, final rendering and export reread the original media, original assets and the best available versions of generated assets. A preview or proxy must not become the source of a master or final-quality export.

### 5. Avoid generational loss

CEVRA avoids unnecessary chains such as:

```text
original
→ lossy render
→ another lossy render
→ another lossy render
→ export
```

The preferred path is:

```text
original sources + Project IR + original assets
→ final composition
→ one final encode when required
```

### 6. Do not re-encode without a material benefit

When an operation can be represented correctly with stream copy, lossless concat or an equivalent non-recompressing path, CEVRA may use that efficient path. Avoiding an encode must not sacrifice cut precision, audio behavior, fades or proven EDVID behavior.

### 7. Quality is perceptual and technical

A rendered export need not be byte-identical to its inputs. The default target is no unnecessary perceptible visual or audible degradation, with appropriate preservation of resolution, frame rate, aspect ratio, audio, color space, HDR and metadata when the destination supports them and the user has not requested a change.

This policy does not claim that HDR handling or complete color fidelity is already implemented or validated.

### 8. Productivity is a first-class requirement

CEVRA does not automatically select the slowest preset, most expensive encoder, excessive bitrate or multi-pass process when the intended use gains no material visual benefit. Render policy balances:

```text
QUALITY
× RENDER SPEED
× FILE SIZE
× TARGET PLATFORM
```

### 9. The intended future default is Balanced

Future export policy reserves three conceptual modes:

- **Balanced / Equilibrado** — intended default;
- **Maximum Quality / Máxima Qualidade**;
- **Fast / Rápido**.

This ADR does not implement these profiles.

### 10. Delivery is platform-aware

Future export policies for Instagram, TikTok, YouTube and other destinations consider parameters that preserve quality, avoid unnecessarily large files, reduce destructive downstream recompression and respect the capability and delivery matrix. Provider and platform policies remain above the audiovisual core and do not become provider-specific Project IR state.

### 11. Hardware acceleration and encoder selection preserve the selected contract

Future hardware acceleration may improve productivity when it is capability-gated, validated, does not cause a material silent downgrade, preserves the selected quality contract and records the effective execution path when needed.

### 12. EDVID remains the baseline

This policy improves on EDVID's proven baseline. It is not permission to remove useful EDVID behavior. Any material functional departure continues to require `DIVERGÊNCIA EDVID` with evidence that the CEVRA result is equal or better.

## Consequences

- Project IR remains the canonical editable state while sources and high-quality assets remain available for final rendering.
- Preview and proxy paths may optimize responsiveness independently from final-quality delivery.
- Render planning must make quality, throughput, file size and target constraints explicit.
- Future delivery profiles and provider policies remain typed application-level policy rather than source mutation or provider-specific Project IR.

## Non-goals

This ADR does not:

- implement proxies;
- implement export profiles;
- change an encoder or current codec default;
- alter Media Runtime V1;
- select a Composition Engine;
- implement an HDR pipeline;
- change Project IR;
- implement smart rendering.

It records the product and architecture policy that future incremental slices must preserve.
