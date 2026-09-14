# ADR 0011 — CEVRA Orbit and CEVRA Vids Product Boundary

Status: Accepted
Date: 2026-09-13

## Context

Earlier documentation described CEVRA as one content-creation system with a video editor at its center and used Content OS as a broad expansion layer. That language blurred product, ecosystem and optional domain boundaries. It also left Marketplace positioned mainly as an editor extension rather than a service that may support multiple products.

CEVRA needs a stable product hierarchy before EDVID parity, Agent Gateway, UI/timeline, Marketplace and additional applications are implemented.

## Decision

CEVRA Orbit is the CEVRA ecosystem and product universe. It contains CEVRA Vids, Marketplace, future CEVRA products and shared platform services.

CEVRA Vids is the first and highest-priority Orbit product. It is an AI-first video editor and creator that remains commercially usable as an independent application. Vids import, edit, preview, review and export do not depend on Marketplace, unimplemented Orbit services, Content Intelligence, external Codex or Claude, paid OpenAI or Anthropic APIs, external generative providers or future Orbit products.

Content Intelligence is the current name of the optional provider-neutral domain for research, signals, questions, trends, ideas, briefs, scripts, future analytics feedback, publishing providers and content memory. It is not Orbit, is not a layer above Vids and remains separate from Project IR.

Marketplace belongs to Orbit. Its role is specialization and expansion. It must not withhold baseline functionality that CEVRA Vids needs to meet and improve upon the public MIT EDVID baseline.

Future shared Orbit services may include identity, accounts, licensing, entitlements, package registry, updates, recommendations and sync. Products access them through stable contracts and retain independent domain boundaries and release paths.

## Consequences

- Product documentation distinguishes Orbit, Vids, Content Intelligence and Marketplace.
- Vids can ship before the wider Orbit platform and ecosystem are complete.
- Marketplace and future shared services can support multiple products.
- Content Intelligence retains its useful technical domain boundary without acting as a product shell.
- Package format, entitlement, store, billing and shared services remain future work.

## Non-goals

This ADR does not implement Orbit services, Marketplace, packages, UI, agents, Content Intelligence, Workflow Presets or product runtime behavior. It changes architecture and product documentation only.
