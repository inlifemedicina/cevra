# ADR 0002 — HyperFrames Composition Adapter

Status: Superseded by ADR 0012

## Historical decision

HyperFrames was selected as the primary composition target behind a CEVRA Composition Engine interface. The lasting part of this decision is the adapter boundary: Project IR and product behavior must not depend on a composition framework's source representation.

ADR 0012 replaces the mandatory engine choice with an evidence-based benchmark. HyperFrames remains a preferred candidate, while Remotion or another proven engine may be selected behind `CompositionEngineAdapter` when it provides better functional or visual parity.
