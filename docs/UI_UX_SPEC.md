# CEVRA UI/UX Specification v1

## Visual direction
- Flat, modern, restrained and professional
- Neutral surfaces with one configurable accent color
- Strong typography and spacing hierarchy
- No glassmorphism, gratuitous gradients, glow-heavy AI aesthetic or decorative dashboards
- Dense enough for video editing while understandable to non-editors

## Desktop information architecture
- Top bar: project, history, export, status
- Media/library panel
- Large central preview
- Layered multi-track timeline
- Context inspector
- Editing modes: AI, Style, Captions, Media, Properties

## Primary CEVRA Vids flow

```text
open CEVRA Vids
→ import or drag raw video
→ describe the desired result
→ AI performs the work
→ layered editable timeline updates
→ preview
→ approval by default, configurable
→ refine if needed
→ export
```

CEVRA Vids is designed around this AI-first production flow rather than a manual editor with a chatbot attached. Manual controls remain available for refinement, correction, adjustment, fallback and advanced control.

## Layered timeline convention

```text
V4 — motion graphics / overlays
V3 — photos / images / B-roll
V2 — captions / headline
V1 — main video

A3 — SFX
A2 — music
A1 — voice / original audio
```

Imported, discovered, generated and provider-supplied assets appear as normal editable Project IR items.

## Mobile information architecture
- Preview-first layout
- Bottom navigation
- Sheet-based inspector
- Simplified timeline gestures
- Same terminology, presets and Project IR as desktop

## Interaction principle
Every AI action produces a visible deterministic project change that can be inspected, adjusted and undone.

Approval/review is present by default and may be configured for trusted workflows. A user can complete supported manual editing and review tasks without an AI agent.

## Language and version display

PT-BR is the initial default language. EN-US is customer-selectable with feature parity. UI copy, messages, errors, presets, workflows and metadata use localization resources.

Semantic version information remains discreet in About, Settings, diagnostics, logs and support surfaces. It is not primary visual branding.

## Accessibility
Keyboard navigation, visible focus states, scalable type, sufficient contrast and screen-reader labels must be considered from the first production UI implementation.
