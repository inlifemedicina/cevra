# ADR 0024 — Creator Tool Interface, progressive disclosure and token efficiency

Status: Accepted

Date: 2026-09-22

## Context

CEVRA Creator must preserve EDVID-level agent ergonomics while avoiding a large low-level tool surface, excessive context consumption and provider-specific execution semantics. Token/context cost is a first-class product concern because Creator is expected to run inside external AI hosts whose usable cost, latency and quota are materially affected by context size and repeated evidence transfer.

The agent tool surface is distinct from the user's visual editing surface. EDVID itself demonstrates that an agent-native product can combine conversation with an interactive preview/timeline and style controls. Creator Full must preserve direct visual editing rather than becoming a chat-only shell.

## Decision

Adopt a **two-layer provider-neutral CEVRA Tool Interface** with progressive disclosure.

### Layer 1 — semantic high-level tools

The default host context exposes a small set of semantic capabilities for normal workflows, covering categories such as:

- project lifecycle;
- media/evidence inspection;
- editorial proposal/planning;
- apply/refine;
- preview;
- QA;
- render/export;
- progress/status;
- cancellation;
- capability/version discovery.

Exact tool names and schemas remain a later contract decision. The principle is stable: normal Creator use should not require the host to assemble dozens of low-level audiovisual mutations manually.

### Layer 2 — specialized typed editing tools

When a task requires precise intervention, the host may discover/load more granular typed capabilities for areas such as timeline, clips, captions, assets, audio, composition and other approved domains.

Specialized tools are loaded progressively and remain capability-gated. They do not expose arbitrary shell, raw FFmpeg/filtergraph/code execution or provider-native canonical state.

Both layers converge to the same validated execution path:

```text
host reasoning
→ Agent Protocol
→ validation / stale-revision and permission checks
→ reviewable Change Set where applicable
→ deterministic compilation
→ typed CEVRA commands / application services
→ ProjectHistory
→ Project IR
```

## Token and context efficiency

Token efficiency is a design requirement, not a later optimization. Creator should maximize editorial value per unit of model context/cost.

Required principles:

- progressive tool disclosure rather than loading a complete tool catalog every turn;
- compact bounded evidence projections rather than raw Project IR or machine JSON;
- phrase/segment-level transcript views for reasoning, with word-level detail fetched only when needed;
- incremental/delta state and revision summaries instead of repeatedly resending whole projects;
- reuse of cached deterministic analysis where valid;
- compact structured tool results with optional drill-down evidence;
- avoid echoing large payloads that the host does not need to reason over;
- batch related evidence requests when that reduces turns without overfetching;
- maintain stable IDs/revisions so the host can refer to known objects without retransmitting their full representation;
- keep visual/media evidence selective and on-demand.

Cost reduction must not silently reduce correctness. The host can escalate to more detailed evidence when needed.

## Capability discovery, progress and errors

The contract includes provider-neutral discovery/versioning so the host does not assume unavailable features. It also includes structured progress, cancellation and stable error classes. Host-facing prose/stdout scraping is not the normal control surface.

Conceptual capability states may include available, unavailable, limited, optional-pack-missing or permission-required. Exact schema is deferred.

## Visual workspace is separate from Agent Tool Interface

The Tool Interface defines what the AI host can call. It does **not** replace the human editing workspace.

Creator Full retains a visual workspace with direct controls over the same project state. At minimum, as capabilities mature, this includes:

- preview;
- directly editable timeline;
- visible caption track and caption/style controls;
- headline/text controls;
- editing/layout choices such as full-frame versus split compositions where supported;
- asset/B-roll controls;
- audio controls;
- contextual inspector and progressive advanced controls;
- immediate reflection of AI edits and human edits in the same project/history.

CEVRA may improve on EDVID's observed workflow, where UI adjustments are saved for the agent to apply, by committing valid direct manipulation through the same CEVRA command/history system. The user should not be forced to ask the chat for every visual adjustment.

Creator Lite may expose a reduced visual surface according to its later product contract, but this ADR does not remove the already-approved Full visual workspace requirement.

## EDVID relationship

Useful EDVID patterns retained behaviorally include:

- simple helper/tool mental model;
- compact transcript/evidence consumption;
- interactive timeline;
- style gate and visual choices;
- caption-style selection;
- preview/refinement loop.

CEVRA replaces EDVID's loose-file/helper execution with typed provider-neutral contracts while preserving or improving the direct user experience.

## Non-goals

This ADR does not yet freeze:

- exact tool names;
- exact JSON schemas;
- exact Creator Full UI layout;
- final Lite UI surface;
- complete caption/editor control catalog;
- provider-specific token pricing or quotas.
