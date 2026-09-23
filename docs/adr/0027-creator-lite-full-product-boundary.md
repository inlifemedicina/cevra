# ADR 0027 — Creator conversational-first and visual-full product boundary

Status: Accepted

Date: 2026-09-23

## Context

CEVRA Creator has two planned product surfaces currently referred to provisionally as Lite and Full. Prior decisions require both to share one editorial/creative/QA core, one Project IR/ProjectHistory model and one provider-neutral execution architecture. Creator Full must include a directly editable visual workspace and must be able to deliver final video without CEVRA Vids Desktop.

The remaining product boundary is whether Lite is merely a reduced demo or a complete agent-native editing product without the full visual editing workspace.

## Decision

Lite and Full share the same underlying Creator intelligence and execution foundation.

### Creator Lite — conversational-first complete editing

Lite is a complete agent-native editing flow, not a partial editor. It must be able to:

- receive one or more media sources;
- create/open a local CEVRA project automatically;
- analyze/transcribe and reason over bounded evidence;
- propose and apply editorial strategy;
- perform automatic editing through typed CEVRA capabilities;
- use captions, audio, B-roll/assets, composition and other available capabilities when installed/authorized;
- run QA;
- generate preview;
- accept conversational refinements;
- render and export a final local result;
- persist and resume the project;
- work through compatible desktop and mobile/remote host surfaces.

Lite does not include the complete directly editable visual editing workspace.

Lite may expose lightweight preview/review interactions appropriate to the host, including playback, scrub, comments or range marking when supported, but it does not promise the full NLE-like timeline/inspector/Advanced surface.

### Creator Full — conversational plus direct visual editing

Full includes the entire Lite workflow and adds a directly editable visual workspace over the same canonical project state, including as capabilities mature:

- editable layered timeline;
- contextual inspector;
- direct caption/headline/style/layout controls;
- direct asset/B-roll replacement and timing;
- direct audio controls;
- precise trim/move/delete/duplicate and timing adjustments;
- More Controls and Advanced progressive disclosure;
- keyframes/transform/composition-depth controls where supported.

AI and manual edits remain interoperable and reversible through the same typed command/history system.

## Capability and entitlement boundary

This ADR does not define Lite and Full by artificially assigning different underlying engines or intelligence quality.

Availability of expensive or optional capabilities may later depend on hardware, installed packs, provider availability, entitlement or commercial plan. Those are separate decisions and must not create divergent audiovisual semantics or separate editorial brains.

## Naming

`Lite` and `Full` are provisional internal names only. Because Lite remains a complete editing product, final product naming should avoid implying that it is crippled or lower-quality intelligence.

Preferred naming direction for later brand/product decision:

- **CEVRA Creator** — conversational-first product;
- **CEVRA Creator Studio** — conversational + full visual editing workspace.

Other names may be evaluated later without changing this architectural/product boundary.

## Consequences

- users who want a simple agent-native workflow can finish a complete video without learning a visual editor;
- users who want direct control can move to the visual workspace without changing project or intelligence core;
- Creator can likely ship the conversational-first path before the full visual workspace without creating a throwaway product;
- no duplicate Skill tree, QA stack, Project IR or runtime is required;
- commercial packaging remains separable from technical architecture.

## Non-goals

This ADR does not set:

- final commercial names;
- pricing;
- feature entitlements;
- pack/provider availability;
- exact Lite preview UI;
- exact Full workspace layout.