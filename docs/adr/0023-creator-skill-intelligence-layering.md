# ADR 0023 — Creator Skill hybrid intelligence layering

Status: Accepted

Date: 2026-09-22

## Context

CEVRA Creator must preserve the conversational flexibility and editorial reasoning that make an agent-native workflow useful, while remaining provider-neutral and sharing one editorial/creative/QA foundation with Creator Lite, Creator Full and CEVRA Vids.

A pure EDVID-style design that places most product intelligence only in a host skill would be fast to prototype, but would risk making Claude Code the de facto implementation of the CEVRA Editorial Director. Conversely, moving all reasoning into deterministic Core services would underuse the host model's strengths in conversation, interpretation, taste and contextual creative reasoning.

## Decision

Adopt a **three-layer hybrid intelligence model**:

### 1. Host AI

The host AI (Claude Code first, then Codex/local/future compatible hosts) is responsible for conversational and open-ended reasoning, including:

- understanding natural-language intent;
- conversing with the user and resolving material ambiguity;
- reasoning over bounded CEVRA evidence;
- proposing creative/editorial concepts and alternatives;
- adapting recommendations to the user's requested audience, niche, format and stated goals;
- applying contextual taste and explaining strategy;
- interpreting conversational refinements.

Host reasoning is never canonical audiovisual state and cannot bypass typed CEVRA execution.

### 2. Creator Skill

The Creator Skill is the orchestration/playbook layer. It teaches the host how to use CEVRA correctly and preserves an EDVID-level direct experience:

- what evidence to request and when;
- which CEVRA capabilities/tools exist;
- workflow ordering and progressive disclosure;
- when to propose strategy, ask for approval or proceed under configured autonomy;
- how to invoke analysis, editing, preview, QA, refinement and export;
- how to keep large machine data out of agent context;
- how to request only the additional evidence/capabilities relevant to the current task.

The Skill may contain meaningful operational intelligence, but it must not become the sole home of reusable audiovisual invariants or canonical editorial semantics.

### 3. CEVRA Creative Intelligence / Core

Reusable editorial knowledge, invariants, validation and deterministic execution belong in shared CEVRA layers consumed by Creator Lite, Creator Full and Vids, including as capabilities mature:

- Core Editorial Director policies and reusable editing/generative playbooks;
- Project IR / ProjectHistory invariants;
- capability discovery and typed validation;
- non-destructive/source/provenance rules;
- word-boundary and timing safety;
- cut-padding and audio/junction policies;
- captions/layout constraints;
- presets and reusable production semantics;
- deterministic QA and convergence policies;
- provider-neutral asset/composition/export rules;
- typed execution through approved runtimes/adapters.

Important rules may be represented redundantly at two levels for usability plus enforcement: the Skill may instruct the host to follow a rule while Core validation guarantees the invariant.

## EDVID intelligence extraction

CEVRA will perform a detailed clean-room inventory of useful observable EDVID intelligence and classify each behavior deliberately into one or more destinations:

```text
EDVID behavior
      ↓
HOST reasoning
CREATOR SKILL orchestration
CREATIVE INTELLIGENCE / playbook
CORE / runtime invariant
```

The classification must be explicit enough to prevent accidental duplication or omission. Useful EDVID behavior is adapted to CEVRA boundaries rather than copied wholesale into a monolithic SKILL.md.

Examples:

- strategy-before-edit → Skill orchestration plus configurable CEVRA policy;
- selection of the most compelling spoken hook → host reasoning informed by Editorial Director evidence/playbooks;
- never cut inside a word → Skill instruction plus Core validation;
- natural cut padding → Editing Director/Core policy;
- compact transcript reading → Skill + Evidence interface;
- avoid raw machine JSON in model context → Agent Protocol/Skill;
- visual-style choice → host reasoning + Creative Playbook;
- caption application → typed Core/composition capability;
- numeric verification → QA Core;
- preview/refinement loop → Creator runtime + Skill orchestration.

## Contextual external recommendations

The host may, when explicitly supported by available capabilities and user intent, use current external evidence such as platform best practices, trend/context research or audience/niche guidance to inform creative proposals. This is advisory evidence, not canonical audiovisual state. Network/provider access remains permissioned, provider-neutral and subject to provenance, privacy, cost and capability policies.

Generic product behavior must not hard-code one social platform, provider or model's recommendations as universal truth.

## UX invariant

The three layers are an internal architecture only. The user experience remains simple:

```text
natural-language request
→ CEVRA understands/analyzes
→ strategy when useful
→ edit
→ preview
→ conversational refinement
→ final local result
```

Project IDs, revision IDs, Change Sets, engine details, provider internals and schema terminology are not exposed to ordinary users unless an advanced diagnostic/developer workflow explicitly requires them.

## Consequences

- Claude Code can exercise strong creative reasoning without becoming a source of truth.
- The same reusable editorial behavior can serve Vids, Creator Lite, Creator Full and future hosts.
- Codex/local/future hosts can replace Claude without recreating core CEVRA semantics.
- Important invariants remain enforceable even if a host misunderstands or forgets a Skill instruction.
- The Creator Skill can stay direct and useful rather than degenerating into a thin command catalog.
- Detailed EDVID intelligence extraction becomes a required specification task before implementation closure.

## Non-goals

This ADR does not yet define:

- the complete Creator tool catalog;
- the final Lite/Full feature matrix;
- a provider-specific prompt format;
- a mandatory web-research provider;
- a final social-engagement recommendation engine;
- pricing, quotas or managed AI billing.
