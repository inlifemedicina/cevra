# CEVRA Orbit

## Definition

CEVRA Orbit is the CEVRA ecosystem and product universe.

```text
CEVRA Orbit
├── CEVRA Vids
├── Marketplace
├── future CEVRA products and apps
└── shared platform services
```

Orbit is not a feature, an editorial-intelligence module or a prerequisite for an application to work. It provides a product-family boundary under which independent domain products and optional shared services can evolve.

## CEVRA Vids

CEVRA Vids is the first and highest-priority Orbit product. It is an AI-first video editor and creator that remains commercially useful as an independent application.

Vids must import, edit, preview, review and export without Marketplace, unimplemented Orbit services, Content Intelligence, Claude, external Codex, paid OpenAI or Anthropic APIs, external generative providers or future Orbit products. Optional platform integrations add value through stable contracts and do not own Vids domain state.

## Shared platform services

Orbit may later provide:

- identity and account;
- licensing;
- entitlements;
- package registry;
- signed updates;
- recommendations;
- sync;
- services shared by multiple products.

These services remain separate from Project IR and product-domain logic. CEVRA Vids and future apps keep independent domain boundaries, capability planning and release paths.

## Marketplace principle

Marketplace belongs to Orbit rather than exclusively to Vids.

```text
CORE = excellent and complete
MARKETPLACE = specialization and expansion
```

Marketplace cannot sell back functionality required for Vids to reach and improve upon its EDVID baseline. Future distribution may include advanced Editorial Skills, vertical packs, Workflow Presets, Style Packs, Caption Packs, Composition Packs, Brand Packs, automations, provider integrations and future Orbit products.

Potential first-party premium specializations include Medical Creator Pro, Luxury Property Film, Automotive Commercial, Fashion Editorial, Product Launch Pro, Documentary Director, UGC Conversion and advanced Anime, CGI or Comic packs.

## Package direction

Orbit reserves one conceptual package family:

```text
cevra-package/
├── manifest
├── skill/
├── workflows/
├── compositions/
├── styles/
├── assets/
├── providers/
└── license/
```

The conceptual manifest includes:

- `id`;
- `publisher`;
- `version`;
- minimum and maximum CEVRA compatibility;
- capabilities;
- permissions;
- platforms;
- dependencies;
- license;
- signature;
- entitlement metadata.

Built-in packages, first-party premium packages and future third-party packages use the same technical foundation. Distribution and entitlement determine access; they do not require separate package systems.

Future packages are signed, semantically versioned and limited to declared capabilities. Third-party packages receive no arbitrary shell, network or filesystem access by default. Package installation preserves configuration and secrets and validates provenance, compatibility and permissions.

This document does not implement a package runtime, Marketplace, store, billing, entitlement service or third-party SDK.

## Content Intelligence

Content Intelligence is an optional provider-neutral Orbit domain for research, signals, questions, trends, ideas, briefs, scripts, future analytics, future publishing providers and future content memory. It may support Vids and other products through stable application boundaries.

Content Intelligence is not Orbit and is not a layer above Vids. It remains separate from Project IR and never blocks the Vids editing flow.

## Creative ecosystem

CEVRA Creative Intelligence organizes built-in and future specialized capabilities through progressive disclosure:

```text
CEVRA Creative Intelligence
├── Core Editorial Director
├── Editing Director
├── Generative Director
├── Creative Playbooks
└── Providers
```

A router loads only task-relevant skills and playbooks. External material requires source, version, license and commercial-compatibility review. Paid or proprietary skills are not copied or redistributed without an explicit license.

## Roadmap relationship

- **Track A — CEVRA Vids:** Foundation / Media Runtime → architecture canon → EDVID parity → editorial intelligence → agent integration → UI/timeline → composition benchmark → generative assets core → CEVRA Vids 1.0.
- **Track B — Orbit Platform:** package format → identity/licensing → entitlements → Marketplace → recommendations → future shared services.
- **Track C — Creative Ecosystem:** built-in skills → premium first-party packs → Marketplace → third-party SDK and publisher system.
- **Track D — Expansion:** mobile → additional CEVRA apps → sync, publishing and analytics → broader Orbit.

Tracks B, C and D must not delay CEVRA Vids after its primary flow is solid:

```text
import
→ ask AI
→ automatic edit
→ layered editable timeline
→ preview / review
→ export
```

## Internationalization and versioning

PT-BR is the initial default language across Orbit products. EN-US is customer-selectable with feature parity. Products, packages, presets, workflows and metadata are prepared for additional locales.

Semantic versions use `x.x.x`. Version information appears discreetly in About, Settings, diagnostics, logs and support surfaces rather than as prominent product branding.
