# CEVRA Product Specification v1

## Product
CEVRA is a proprietary agent-assisted content creation system with an intuitive video creation/editing application as its audiovisual core and an optional Content Intelligence / Content OS layer for research, ideation, planning and performance feedback.

## Primary editor experience
A user can import media, request an edit in natural language, review the deterministic result in a modern visual editor, make manual or conversational adjustments, undo/redo any operation and export a validated final file.

The editor remains fully usable without Content OS, external social integrations or a paid AI provider.

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
- Autosave, crash recovery, history/journal and snapshots
- Technical QA before export
- PT-BR and EN-US parity
- Signed in-app updates
- Codex and Claude-compatible agent bridge

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
- Content OS must be discoverable but optional; users who only want the editor should not be forced through research/ideation workflows
