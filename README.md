# CEVRA

CEVRA is a proprietary agent-assisted content creation platform with an intuitive video creation/editing application as its audiovisual core and an optional Content Intelligence / Content OS layer.

## Product principles

- Modern, flat and restrained UI; no generic “AI dashboard” aesthetic.
- PT-BR and EN-US from day one, with extensible internationalization.
- Project IR is the canonical source of truth for editable audiovisual project state.
- Content OS is a separate optional domain linked to projects by stable IDs/references.
- Engines, external services, content sources, analytics and publishing systems are isolated behind versioned adapters/providers.
- AI agents decide; deterministic engines execute and validate.
- AI/inference providers remain replaceable: local models and cloud providers are adapter implementations rather than core dependencies.
- Core editing must not require paid OpenAI/Anthropic API usage or Content OS.
- Commercialization-safe dependency and provenance policy.
- Signed in-app updates; no normal reinstall workflow.
- Desktop and mobile share domain semantics and design-system vocabulary where practical.

## Content OS direction

CEVRA is designed to support a future content lifecycle from source signals and idea bank through briefs/scripts, audiovisual production, variants, export, future publication, performance analysis and feedback into content intelligence.

Concrete social-network adapters, scrapers, publishing automation and analytics ingestion are not part of the current foundation.

## Canonical documents

Coding agents must read `AGENTS.md` first and then `docs/ARCHITECTURE_V1.md`. Content OS boundaries are defined in `docs/CONTENT_OS.md` and ADR 0009.

## Licensing

CEVRA-owned code is proprietary and all rights are reserved. No open-source license is granted for CEVRA-owned code. Third-party components retain their respective licenses and are tracked in `THIRD_PARTY_LICENSES.md` and `NOTICE`.
