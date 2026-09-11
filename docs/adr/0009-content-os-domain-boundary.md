# ADR 0009 — Content OS Domain Boundary

## Status
Accepted.

## Context
CEVRA is expanding from an AI-assisted audiovisual editor into a broader content creation system. The product must support future ingestion of questions, comments, documents, URLs, transcripts, feeds/APIs and platform data; organize ideas; assist briefs/scripts; hand work into the editor; and later consume performance feedback.

Embedding this state directly into Project IR would mix editorial/research records with audiovisual editing state, couple the editor to external platforms and make Content OS mandatory for users who only need editing.

## Decision
CEVRA will implement Content Intelligence / Content OS as an optional domain separate from Project IR.

- Project IR remains the sole canonical model for editable audiovisual project state.
- Content OS owns its own versioned semantic model and persistence boundary.
- Content OS and audiovisual projects are associated through stable IDs/references managed by application services.
- Social networks, comment systems, feeds, publishing services, analytics services and AI vendors are accessed only through adapters/providers.
- Provider-native response schemas do not become Content OS core-domain models.
- AI analysis/generation is provider-agnostic and may use local models, OpenAI, Anthropic, Google or future providers.
- Specialized profiles such as health/medical, business and creator are external configuration/skill/policy packs rather than branches of generic core logic.
- Future agent/skill and persistent-memory capabilities operate through typed application/domain boundaries.
- Automatic social publishing is future optional integration and not a Content OS MVP dependency.
- The existing editor remains fully usable when Content OS is disabled, unavailable or unconfigured.

## Minimal architecture

```text
Content sources/providers
        ↓
normalized ContentRecords + provenance
        ↓
Content Intelligence domain
(signals → ideas → briefs → scripts)
        ↓
application handoff / ContentProjectLink
        ↓
CEVRA Project IR + editor
        ↓
export
        ↓
future publishing provider
        ↓
future analytics provider
        ↓
performance observations / feedback
```

Content storage technology is deliberately not selected in this ADR. A `ContentRepository`-style persistence contract will precede selection of a concrete database/index implementation.

## Reused extension points
- existing provider lifecycle;
- Agent Bridge with typed tools;
- application-service boundary;
- Project IR commands/history for audiovisual mutations;
- PT-BR / EN-US internationalization rules;
- desktop/mobile adapter separation;
- proprietary/commercial licensing and provenance policy.

## Consequences

### Benefits
- Content OS can evolve without destabilizing Project IR or the editor;
- users can adopt Content OS independently from editing;
- Instagram/YouTube/TikTok/API changes remain adapter-level concerns;
- AI vendors can be swapped without semantic data migration;
- future profiles/memory/analytics/publishing have explicit extension points;
- audiovisual projects can be created from content workflows without making content metadata part of timeline state.

### Risks
- two domain models require clear ownership and association rules;
- premature expansion of Content OS could become a second monolithic core;
- normalized cross-provider metrics/signals will require careful versioning later;
- persistence and memory technology still require future architectural decisions.

### Mitigations
- keep initial Content OS model minimal and evidence/provenance-oriented;
- add provider capabilities only when implementing concrete workflows;
- select persistence technology in a separate ADR only when requirements are measurable;
- prevent provider-specific models from leaking into core types;
- keep all Content OS functionality feature-gated/optional.

## Impact on current architecture
No change to Media Runtime, Project IR schema, editor command/history semantics, approved engines or managed Python runtime.

This ADR only establishes the future Content OS domain boundary and integration contracts. Concrete source adapters, scrapers, UI, AI pipelines, publishing, analytics and storage implementations remain out of scope for this change.
