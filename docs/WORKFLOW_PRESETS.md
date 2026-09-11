# CEVRA Workflow / Production Presets

## Purpose

Workflow Presets turn recurring editing jobs into one-click production flows while preserving the editor's typed, reversible architecture.

The target experience is simple: import a clip, choose a preset, review if desired, and receive a finished result without rebuilding the same edit manually each day.

## Product example

A future preset such as **Vídeo rápido na rua / Quick street talking-head** may orchestrate:

source import
→ transcription
→ silence/retake cleanup
→ vertical reframing
→ audio cleanup and loudness normalization
→ caption generation
→ selected caption/style preset
→ optional headline
→ restrained auto-zoom or cut emphasis
→ optional music policy
→ technical QA
→ cover/metadata assistance
→ one or more export profiles.

## Architectural boundary

Workflow Presets live at the application/orchestration layer. They are not Project IR and do not replace Project IR as source of truth.

A preset is a versioned declarative definition containing:
- stable preset ID and schema version;
- localized PT-BR / EN-US name and description;
- ordered typed steps;
- typed parameters/defaults/constraints;
- references to style presets, caption presets, composition presets and export profiles;
- capability requirements;
- explicit optional/fallback policy;
- provenance/version metadata.

Executing a preset resolves to existing approved CEVRA commands and provider/engine operations. All audiovisual mutations still pass through normal application commands, Project IR validation and journal/history.

## Security and determinism

Preset definitions must never expose:
- arbitrary shell execution;
- raw FFmpeg arguments or filtergraphs;
- arbitrary executable code;
- direct engine bypass;
- provider credentials.

AI-assisted steps are allowed only through typed application/provider contracts. Their resolved decisions and relevant provider/model metadata should be journaled so the result remains inspectable.

## Preset families

### Style presets
Appearance-only configuration: caption typography, colors, spacing, framing style, graphic treatment and similar presentation choices.

### Export profiles
Delivery configuration: aspect ratio, dimensions, codec/container, bitrate/quality policy and named delivery targets.

### Workflow / Production Presets
Full orchestration of reusable editing/analysis/export steps. They may reference style presets and export profiles.

## User-created presets

The architecture must permit users to save a successful workflow as their own preset later. User presets use the same versioned schema as built-in presets and cannot gain broader execution privileges.

## Content OS relationship

Workflow Presets belong to the editor/application domain and work independently from Content OS.

Content OS may later:
- recommend a preset based on content intent;
- create a draft preset configuration;
- associate a preset with a content profile or campaign;
- learn from performance outcomes.

It must not become required for preset execution.

## Desktop/mobile

Preset semantics remain platform-neutral. Each step declares capability requirements. A mobile implementation may execute supported steps locally, omit explicitly optional steps, or delegate heavy work to a trusted desktop node where that product flow is supported.

Silent behavior changes are not allowed: unavailable required capabilities must be reported before execution.

## Future implementation direction

A future preset engine should provide:
- schema validation and migration;
- dry-run/capability planning;
- deterministic step resolution;
- journal/provenance records;
- cancellation and recoverable partial execution;
- preview/review checkpoints;
- preset import/export and duplication;
- built-in and user-created preset libraries.

This foundation does not implement the runtime or UI yet.