# ADR 0012 — Composition Engine Adapter and Parity Benchmark

Status: Accepted
Date: 2026-09-13
Supersedes: ADR 0002 engine-selection requirement

## Context

ADR 0002 correctly isolated composition behind an adapter but made HyperFrames the target before CEVRA had measured it against EDVID's proven functional and visual baseline. The public [`fillrochaa/edvid` `SKILL.md`](https://github.com/fillrochaa/edvid/blob/main/SKILL.md) describes Phase 2/3 Remotion visuals and audio, defines Phase 2 as Remotion-only, describes the default pipeline as FFmpeg/Remotion, includes a `remotion/` project directory and references `remotion-best-practices`. This is direct functional and technical provenance for using EDVID's Remotion-based behavior as a benchmark; it does not establish that the current Remotion license is compatible with CEVRA distribution.

Choosing an engine without parity evidence could reduce editorial automation, visual quality or timing precision. Selecting an engine for a proprietary commercial product also requires review of the exact version and license proposed for incorporation.

## Decision

CEVRA composition remains behind `CompositionEngineAdapter`. HyperFrames is a preferred candidate, not a mandatory engine. Before selecting the default, CEVRA benchmarks HyperFrames against the Remotion-based composition behavior documented by EDVID and any other credible candidate.

The benchmark covers:

- karaoke, static and stacked captions;
- headlines, split-screen and cards;
- images, B-roll and asset placement;
- dynamic camera, hard zoom and slow push-in;
- face tracking;
- motion graphics and data-driven templates;
- SFX, transitions and exact timing;
- vertical and horizontal rendering.

If HyperFrames demonstrates equivalent or better functional and visual results, it may become the default. Otherwise CEVRA may select Remotion or another demonstrably suitable engine behind the same adapter.

Remotion is not currently incorporated by CEVRA. It may be selected for commercial distribution only after review of the proposed version's then-current license and confirmation that its terms are compatible with CEVRA's proprietary commercial model. This ADR does not characterize Remotion as permissive or fix license terms, prices or thresholds.

No engine preference may sacrifice quality, automation, timing or editorial capability. Remotion is neither mandatory nor prohibited.

## Consequences

- Project IR and application contracts remain engine-neutral.
- Composition implementation starts with measurable parity criteria.
- License and commercial-compliance review remains required for the exact selected engine and version.
- Engine selection occurs after representative fixtures and repeatable benchmark evidence exist.

## Non-goals

This ADR does not implement, add or benchmark a composition dependency. It defines the decision gate for later implementation work.
