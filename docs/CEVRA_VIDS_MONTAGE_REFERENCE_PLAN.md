# Vids planning: silent montages and video reference

Status: OWNER-REQUESTED PLANNING / NOT IMPLEMENTED BY THIS CHANGE.
This proposal is separate from first-F-A preparation and does not change
priorities, authorize features/AI calls, select an engine or reopen decisions.

## Sources

- 2026-10-03 00:45:13 UTC, owner request: videos without speech,
  landscapes/travel, aesthetic compilations, clip alternation and more than
  one video simultaneously on screen.
- 2026-10-03 00:50:01 UTC, owner confirmation: include and organize the proposed
  simple “Usar vídeo como referência” option in planning.
- 2026-10-03 00:50:28 UTC, owner confirmation: include the montage request too.
- Durable handoff: [issue #71](https://github.com/inlifemedicina/cevra/issues/71).

## Existing canon and exact limits

| Area | Existing evidence | What remains unproved or missing |
|---|---|---|
| Editable project | Project IR has video/audio/overlay/caption tracks, timed clips, graphic video/layout references, and typed track.add/clip.add commands plus History. | These primitives do not prove integrated aesthetic montage or split-screen rendering. Determine missing typed operations/plan validation; do not duplicate the model. |
| Product composition target | PRODUCT_SPEC already reserves layered timeline, B-roll, photos/video/graphics, music/SFX, color/grading and the composition benchmark's split-screen/transitions/exact timing. | Final engine and integrated composition/preview/export remain subject to existing benchmark and release gates; no delivery claim. |
| Behavioral acceptance | D17 layout/QA, D19-T1/T2 split/continuity/silent media, D20-T2 manual alternative, D21-T1 permitted asset provenance, D22-T1 full/split/B-roll and D23 typed composition safety already exist. | Add silent-travel/alternating/multi-clip/reference variants to the canonical catalog when implementations make them executable; keep BLOCKED elsewhere. No second acceptance catalog. |
| Current semantic boundary | The required real semantic round-trip consumes bounded transcript-derived text. | It does not demonstrate scene understanding, visual similarity, rhythm extraction, music analysis or reference-video interpretation. Evidence/adapters/permissions for those require future bounded design/validation. |
| User experience | Normal, contextual More Controls and Advanced share one editor/project/timeline. | Define the simple reference choice and applicable preset choices through the UX Surface Contract; no new UI is delivered here. |

Checked baseline: PR70 main `c9d96eb63877cc81230693a827b0d1469dd566b0`.
See [Project IR types](../packages/project-ir/src/types.ts),
[typed commands](../packages/project-ir/src/commands.ts),
[PRODUCT_SPEC](PRODUCT_SPEC.md),
[canonical acceptance](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md), and
[roadmap](CEVRA_ORGANOGRAMA.md). Existing acceptance scenarios explicitly remain
BLOCKED when capability/layout/compiler/composition/preview is unavailable.

## Placement within the preserved phases

| Existing phase | Planned work/dependency | Gate preserved |
|---|---|---|
| Editorial Intelligence | Specify permitted visual/temporal/reference evidence for non-speech selection and organization; separate it from transcript-only analysis. | Current real textual round-trip remains required; no implicit strategy/take-selection start or visual/provider choice. |
| Deterministic Edit Execution | Map requested alternation, timing, simultaneous clips and music relationships to validated typed commands/plans, Cut Compiler and numeric QA. | Reuse Project IR/History, capability checks and original-source quality. Identify concrete extensions before implementing. |
| UX Surface Contract | Normal offers direct presets/visual choices and the optional reference-video action; selected pacing/layout/transitions/color/music aspects can be adjusted through contextual controls or Advanced. | Same timeline/history/manual control, PT-BR and EN-US, no implementation internals in default UI. |
| Native Preview / Presentation / Composition | Prove clip alternation, two-or-more simultaneous clips, crop/fit/layout, transitions, color and music sync in preview and exported composite; integrate permitted silent media. | Existing CompositionEngineAdapter benchmark, timing/audio QA and platform/release gates; no mandatory new engine. |
| Director / Workflow Presets | Convert permitted reference intent and selection into capability-checked typed plans with approval, undo and direct edits. | Reference content cannot inject code, grants or canonical state; no workflow starts before its prerequisites. |

## Reference-video scope and future verification

The input is an accessible public link or a user-provided permitted file.
The owner chooses which aspects to reuse on their own footage: pacing,
layout, transitions, color and relationship to music. Accessible does not
mean licensed for copying or upload. No private Instagram login, DRM bypass,
universal downloader, source/music copy or new entitlement is promised.
Do not send user/reference media to a provider without explicit permission
for that disclosure. Prefer permitted local/user-owned material and manual
aspect selection when remote access or analysis is unavailable.

Future fixtures must use synthetic or licensed landscape/travel clips,
include no speech, temporal alternation and at least two simultaneous videos,
and compare preview/export timing, layout, transitions, color, music/audio,
undo and offline reopening. Reference aspect selection must not copy unrelated
media, overwrite manual decisions, claim unsupported visual evidence, or
silently alter source quality. Derive objective cases from existing acceptance
IDs; subjective aesthetic judgment belongs to owner review after the fixture
is demonstrably executable.

No new priority decision is needed to record these requirements. If future
feasibility identifies a new engine/provider, visual-evidence boundary,
license/cost/privacy change or a request to advance these phases, present
that concrete decision to the owner rather than silently selecting a route.
Director impact: compatible planning extension to intent/evidence and typed
composition; no runtime, authority, schema or execution change here.

## Documentation reconciliation

The product-spec addition and this planning record form a separate draft.
Master-context/organogram reconciliation is a separate reviewed documentation
change. Issue #71 retains both owner requests and the phase mapping; no
implementation, priority or execution approval is created by these records.
