# ADR 0012 — Composition Engine Adapter and Parity Benchmark

Status: Accepted
Date: 2026-09-13
Supersedes: ADR 0002 engine-selection requirement

## Context

ADR 0002 correctly isolated composition behind an adapter but made HyperFrames the target before CEVRA had measured it against the proven functional and visual baseline used by EDVID and Remotion. A permissive license is valuable, but choosing an engine without parity evidence could reduce editorial automation, visual quality or timing precision.

## Decision

CEVRA composition remains behind `CompositionEngineAdapter`. HyperFrames is a preferred candidate, not a mandatory engine. Before selecting the default, CEVRA benchmarks HyperFrames against the proven EDVID-equivalent Remotion baseline and any other credible candidate.

The benchmark covers:

- karaoke, static and stacked captions;
- headlines, split-screen and cards;
- images, B-roll and asset placement;
- dynamic camera, hard zoom and slow push-in;
- face tracking;
- motion graphics and data-driven templates;
- SFX, transitions and exact timing;
- vertical and horizontal rendering.

If HyperFrames demonstrates equivalent or better functional and visual results, it may become the default. Otherwise CEVRA keeps Remotion or selects another demonstrably superior engine behind the same adapter.

No engine preference may sacrifice quality, automation, timing or editorial capability. Remotion is not prohibited.

## Consequences

- Project IR and application contracts remain engine-neutral.
- Composition implementation starts with measurable parity criteria.
- License and commercial-compliance review remains required for the selected engine.
- Engine selection occurs after representative fixtures and repeatable benchmark evidence exist.

## Non-goals

This ADR does not implement, add or benchmark a composition dependency. It defines the decision gate for later implementation work.
