# ADR 0010 — Workflow / Production Presets

Status: Accepted
Date: 2026-09-11

## Context

CEVRA already reserves visual/style presets, but the product must also support one-click recurring production workflows. A typical use case is importing a newly recorded talking-head clip, selecting a preset, and receiving an edited, captioned, formatted and export-ready result with minimal interaction.

A workflow preset is broader than a style preset. It may orchestrate transcription, silence/retake cleanup, framing, audio normalization, captions, overlays, composition choices, export targets and optional AI-assisted decisions.

## Decision

CEVRA will support versioned Workflow / Production Presets as an application-level orchestration primitive.

A workflow preset:
- is separate from Project IR and does not become an alternate source of truth;
- resolves only into typed, validated CEVRA application commands and approved provider/engine operations;
- must never contain arbitrary shell commands, raw FFmpeg/filtergraph execution or executable user-authored code;
- may reference reusable style presets, caption presets, composition presets and export profiles by stable IDs;
- may expose typed user parameters with defaults, constraints and PT-BR/EN-US labels;
- records the exact preset ID/version and resolved parameters in journal/provenance so results are inspectable and reproducible where practical;
- may include deterministic steps and optional AI-assisted decision steps, but AI providers remain replaceable behind provider contracts;
- must degrade explicitly when an optional capability is unavailable rather than silently changing behavior;
- is usable without Content Intelligence or Marketplace; Content Intelligence may later recommend, create or attach presets but does not own CEVRA Vids preset execution;
- remains platform-neutral at the semantic contract level, while individual steps may declare desktop/mobile capability requirements.

## Preset classes

CEVRA distinguishes:
1. Style presets — appearance only, such as caption typography, colors, spacing and layout.
2. Export profiles — delivery constraints such as aspect ratio, resolution, codec/container and target platform profile.
3. Workflow / Production Presets — ordered orchestration of editing/analysis/export steps that may reference the first two classes.

## Example

A future preset such as `talking-head-street-vertical` may request:
- ingest/import;
- transcription;
- silence/retake cleanup;
- vertical reframing;
- audio cleanup/normalization;
- caption generation using a referenced caption style;
- optional headline and restrained auto-zoom rules;
- optional music according to policy;
- cover/metadata assistance;
- technical QA;
- one or more export profiles.

The preset defines intent and typed configuration. Engines execute only their approved typed operations.

## Consequences

### Benefits
- enables the core one-click daily editing workflow;
- preserves deterministic/reversible editor architecture;
- avoids hard-coding recurring workflows into UI components or AI prompts;
- allows user-created, built-in and future Marketplace/team presets without changing Project IR; Marketplace belongs to CEVRA Orbit and cannot withhold core presets needed for the improved EDVID baseline;
- supports desktop/mobile capability negotiation without duplicating workflow semantics.

### Risks
- preset schemas can become overly broad or turn into a general scripting language;
- AI-assisted steps may reduce reproducibility unless inputs/outputs and provider metadata are recorded;
- versioning/migration is required once user presets are persisted.

### Mitigations
- keep a closed typed step vocabulary;
- no arbitrary code/shell/filtergraph fields;
- version schemas and preset definitions;
- validate capabilities before execution;
- journal resolved execution and failures;
- require ADR approval before introducing a general-purpose scripting mechanism.

## Non-goals for this phase

This ADR does not implement the preset engine, preset UI, cloud preset synchronization, Marketplace, automatic Content Intelligence recommendation, or provider-specific publishing flows. It only establishes the architectural boundary so later implementation does not require structural refactoring.
