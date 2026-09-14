# CEVRA

CEVRA Orbit is the ecosystem for CEVRA products, Marketplace and future shared platform services. CEVRA Vids is its first and highest-priority product: an independent AI-first video editor and creator.

## Product hierarchy

```text
CEVRA Orbit
├── CEVRA Vids
├── Marketplace
├── future CEVRA products and apps
└── shared platform services
```

## Product principles

- CEVRA Vids follows an AI-first import → request → automatic edit → editable timeline → review → export flow.
- Project IR is the sole source of truth for editable audiovisual state.
- Vids remains usable without Marketplace, Content Intelligence, unimplemented Orbit services, paid AI APIs or external agents and providers.
- PT-BR is the initial default language; EN-US is selectable with mandatory feature parity.
- Engines, agents, providers and platform services stay behind stable typed adapters.
- AI decisions are inspectable; deterministic execution is journaled, recoverable and reversible.
- The public MIT EDVID project is the initial functional baseline, subject to CEVRA architecture, parity tests and required attribution.
- CEVRA-owned code is proprietary; third-party reuse requires exact provenance and license review.
- Semantic versions remain available in discreet About, Settings, diagnostic, log and support surfaces rather than primary branding.

## Canonical documents

Coding agents read `AGENTS.md` first and then `docs/ARCHITECTURE_V1.md`. Product-family boundaries are defined in `docs/ORBIT.md`; the optional content domain is defined in `docs/CONTENT_INTELLIGENCE.md` and ADR 0009. Workflow boundaries are defined in `docs/WORKFLOW_PRESETS.md` and ADR 0010.

## Licensing

CEVRA-owned code is proprietary and all rights are reserved. No open-source license is granted for CEVRA-owned code. Third-party components retain their licenses and are tracked in `THIRD_PARTY_LICENSES.md` and `NOTICE` when incorporated.
