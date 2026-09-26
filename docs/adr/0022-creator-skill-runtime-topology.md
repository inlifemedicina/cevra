# ADR 0022 — Creator Skill standalone with shared headless CEVRA Core

Status: Accepted

Date: 2026-09-22

## Context

CEVRA Creator Skill is an agent-native product surface inspired by the direct conversational experience proven by EDVID, while CEVRA Vids Desktop remains the primary independent editor product. Creator Full must be able to analyze, edit, preview/refine and export a final video without requiring CEVRA Vids Desktop to be installed, open or running.

CEVRA already owns stronger audiovisual foundations than the EDVID reference architecture: Project IR and ProjectHistory, managed Media Runtime, transcription/alignment, typed application services, provider boundaries, Creative Intelligence direction, QA and composition adapters. Duplicating those foundations inside Creator would create a second editor/runtime stack and divergent audiovisual semantics.

At the same time, making Creator a thin remote control for Desktop would violate the approved standalone requirement and make the agent-native product operationally dependent on the Desktop presentation layer.

## Decision

Adopt a **standalone Creator distribution that consumes the same shared CEVRA Core as Vids**, with a headless-capable application/runtime boundary.

```text
Claude Code / Codex / future compatible host
        ↓
CEVRA Creator Skill
        ↓
provider-neutral Agent Protocol
        ↓
shared CEVRA Core — callable without Desktop UI
        ├── application services
        ├── Project IR / ProjectHistory
        ├── Creative Intelligence
        ├── transcription / alignment
        ├── Media Runtime
        ├── captions / audio / QA
        ├── composition adapters
        └── preview / render / export
        ↓
local project + final file
```

CEVRA Vids Desktop is a separate consumer of those same reusable foundations:

```text
CEVRA Vids Desktop UI
        ↓
shared CEVRA Core
```

The Creator therefore:

- does **not** require CEVRA Vids Desktop, Tauri UI or a running Desktop process;
- may ship its own compatible standalone distribution of shared CEVRA Core/runtime components;
- does not introduce a second FFmpeg runtime, alternate Project IR, parallel editorial engine or duplicated audiovisual semantics;
- preserves Project IR as canonical audiovisual source of truth when Project IR is used;
- uses the same typed application/runtime interfaces as Vids wherever technically appropriate;
- keeps provider-specific conversation/session behavior in host adapters and never makes Claude state canonical;
- preserves EDVID-level conversational simplicity while keeping CEVRA-level state, safety, recovery and execution architecture.

“Headless” is an architectural requirement meaning reusable audiovisual/application capabilities cannot require the Desktop presentation layer. This ADR does **not** choose the final process topology. The shared Core may later be packaged as libraries plus a local launcher, a dedicated local process/service, or another measured implementation, provided the observable contract above is preserved.

## EDVID relationship

CEVRA should copy/adapt the useful **behavioral experience** of EDVID:

- media + natural-language request;
- analysis/transcription;
- strategy proposal and approval where policy requires;
- execution;
- preview;
- conversational refinement;
- final local result.

CEVRA must not copy EDVID's weaker architectural assumptions as requirements, including:

- global/PATH FFmpeg as the release execution model;
- multiple loose edit files as competing sources of truth;
- arbitrary shell/filtergraph/code surfaces;
- provider-specific canonical state;
- a runtime stack duplicated independently from CEVRA Vids.

Useful public EDVID behavior may be ported according to existing provenance/license policy. Branding and trade dress remain excluded.

## Consequences

### Positive

- Creator can be installed and used independently of CEVRA Vids Desktop.
- Vids and Creator improve together when shared Core capabilities improve.
- No duplicate audiovisual engine stack is created merely to reach EDVID-like agent-native UX.
- Claude Code can be the first priority host without making Claude an architectural dependency.
- Future Codex, local/self-hosted and other hosts can target the same protocol and Core.
- Current Vids development can prepare reuse early and avoid a large extraction refactor later.

### Constraints on current Vids development

Reusable audiovisual/application capabilities needed by Creator must not become inseparably coupled to:

- React components;
- Tauri window lifecycle;
- Desktop-only UI state;
- provider-native agent state;
- arbitrary shell interfaces.

A capability may still have a Desktop-specific adapter or presentation layer. Only reusable domain/application/runtime behavior must remain callable independently.

### Cost

This requires somewhat more discipline than directly cloning the EDVID helper/runtime structure into a separate Creator stack. The additional near-term cost is accepted because a duplicated stack would create materially larger long-term implementation, QA, migration and maintenance cost.

## Non-goals

This ADR does not yet decide:

- exact Creator installer/package format;
- exact process/IPC topology;
- entitlement or pricing;
- exact Claude Code command/UX;
- final Lite vs Full feature matrix;
- final composition-engine selection;
- whether all Vids UI components are reusable in Creator Full;
- detailed Agent Protocol tool catalog.

Those remain separate product/architecture decisions.
