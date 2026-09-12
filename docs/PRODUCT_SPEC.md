# CEVRA Product Specification v1

## Product
CEVRA is a proprietary agent-assisted content creation system with an intuitive video creation/editing application as its audiovisual core and an optional Content Intelligence / Content OS layer for research, ideation, planning and performance feedback.

## Primary editor experience
A user can import media, request an edit in natural language, review the deterministic result in a modern visual editor, make manual or conversational adjustments, undo/redo any operation and export a validated final file.

The editor remains fully usable without Content OS, external social integrations or a paid AI provider.

A second primary path is one-click recurring production: a user imports media, selects a versioned Workflow / Production Preset and receives a completed edit using approved typed operations, with review remaining available rather than mandatory.

## Content OS vision
Content OS extends CEVRA from editing into the full content lifecycle:

external/internal sources
→ signals, questions, topics, trends, objections and opportunities
→ organized idea bank
→ brief/pauta assistance
→ script
→ recording/import
→ CEVRA editing
→ versions/cuts
→ captions/covers/metadata
→ export and future publishing
→ performance analysis
→ feedback into content intelligence.

The Content OS is optional and must not become a prerequisite for audiovisual editing.

## Core launch capabilities
- Import common video/audio/image formats
- Local transcription with word timing when required
- Silence/retake/repetition-aware editing workflows
- Multi-track timeline and preview
- Captions with reusable styles and positioning rules
- Headlines, overlays, split-screen and layout presets
- Typed media operations
- Style presets separated from content decisions
- Versioned Workflow / Production Presets for reusable one-click editing flows
- User-created presets using the same constrained schema as built-in presets
- Autosave, crash recovery, history/journal and snapshots
- Technical QA before export
- PT-BR and EN-US parity
- Signed in-app updates
- Codex and Claude-compatible agent bridge

## Workflow / Production Presets
Workflow Presets are application-level declarative orchestration, not Project IR state and not executable scripts.

They may combine typed steps such as transcription, cleanup, reframing, audio normalization, captions, overlays, composition choices, QA and export profiles. They may reference reusable style/caption/composition presets and expose validated user parameters.

Preset execution must:
- resolve only to approved typed application commands and provider/engine operations;
- preserve Project IR as the audiovisual source of truth;
- journal the preset ID/version and resolved parameters/provenance;
- remain inspectable, cancelable and recoverable;
- support PT-BR and EN-US metadata;
- work without Content OS;
- never expose arbitrary shell, raw FFmpeg/filtergraph execution or arbitrary executable code.

The canonical boundary is documented in `docs/WORKFLOW_PRESETS.md` and ADR 0010.

## Content OS architecture reserved from this phase
- Content-source provider adapters for manual input, URLs, text/documents, transcripts, comments, feeds/APIs and future platform integrations
- Provider-neutral intelligence for clustering, question/objection extraction, trend/opportunity detection, idea generation, briefs and scripts
- Separate Content Intelligence domain/store linked to audiovisual projects by IDs/references
- Idea bank and content lifecycle state independent from Project IR
- Specialized content profiles such as health/medical, business and creator as optional configuration/skill packs, never hard-coded into the core
- Persistent content memory/knowledge through a future storage/memory adapter
- Future performance/analytics providers that feed observations back into the Content domain
- Future publishing providers; automatic publication is not an MVP requirement
- Future agent/skill workflows operating through typed application services

## Extensibility reserved from v1
- Image generation providers
- Video generation providers
- Stock-media providers
- OpenTimelineIO interchange
- OpenCut adapter
- Premiere/Resolve adapters
- Creator-workflow agents beyond editing
- Content-source providers
- Content analytics providers
- Content publishing providers
- Specialized content intelligence profiles
- Preset sharing/synchronization and future team/marketplace distribution

## Out of scope for current Content OS foundation
- Social-network scrapers
- Instagram/YouTube/TikTok implementations
- Full Content OS UI
- Automatic publishing
- Analytics ingestion implementation
- Selection of a concrete Content OS database
- Medical/business domain rules inside the CEVRA core

## UX principles
- Flat, modern, professional visual language
- AI is a capability, not the visual identity
- No required terminal use for normal end users
- Manual control always remains available
- AI edits must be inspectable and reversible
- One-click preset workflows must not remove the ability to inspect or manually refine the resulting edit
- Content OS must be discoverable but optional; users who only want the editor should not be forced through research/ideation workflows
