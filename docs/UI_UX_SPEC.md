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

## CEVRA Vids Desktop Visual V0.1 — approved

The approved desktop model is **Adaptive Hybrid**: one canonical project,
selection, playhead and layered timeline persist while the central workspace
adapts to the job at hand. Workspaces do not create alternate projects or
alternate transcript sources of truth.

- **Editar** is the default, preview-first workspace: compact media navigation
  and library on the left, a visually dominant preview in the center, a
  contextual inspector on the right, Director CEVRA directly below the preview,
  and the shared layered timeline at the bottom.
- **Transcrição** makes the source-linked Project IR transcript dominant while
  retaining a synchronized preview and the same timeline, project, selection
  and playhead.
- **Composição** prioritizes assets, overlays, B-roll, graphics, preview and
  relevant inspector controls.
- **Legendas** prioritizes transcript-derived caption cues, style controls,
  preview and the V2 timeline context.
- **Áudio** prioritizes voice, music and SFX tracks, waveform hierarchy, mix
  controls, preview and the same timeline context.

Director CEVRA is a first-class editor surface rather than a chatbot panel. It
combines an optional natural-language instruction with obvious one-click
Workflow Preset access. The product model remains:

```text
preset + optional Director instruction
→ typed orchestration
→ reviewable changes
```

AI output is contextual and represented as an explicit Change Set (for example
cuts, captions and pacing adjustments) with Review and Apply affordances. No
project mutation may be implied before a real typed backend produces and commits
reviewable Project IR changes through history/journal boundaries.

The inspector is contextual rather than a permanently expanded properties
form. The shell uses a dark graphite, neutral, restrained professional visual
language with compact editor density, subtle radii, strong typography, an
accent-ready token architecture initially set to blue, sufficient contrast and
visible keyboard focus. It explicitly avoids glassmorphism, glow-heavy AI
treatment, gratuitous gradients, SaaS-dashboard framing and other editors'
trade dress.

At narrower desktop widths the inspector and then the expanded media panel may
collapse while preview and timeline remain usable. The primary verification
viewports are 1440×900 and 1920×1080. This V0.1 direction is presentation-only:
real ingest, preview rendering, Director execution, preset orchestration,
Change Set application and export remain visibly unavailable until the typed
desktop runtime is connected.

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
