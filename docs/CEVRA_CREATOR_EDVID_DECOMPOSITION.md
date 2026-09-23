# CEVRA Creator — EDVID end-to-end decomposition

**Status:** AUDIT EVIDENCE / PRODUCT INPUT — not a new implementation approval by itself  
**Audit date:** 2026-09-23  
**EDVID baseline:** `fillrochaa/edvid@d8e6389db02e8de0b46ee680105c09d4250d4703`  
**License at baseline:** MIT  
**Tracked EDVID files covered by the existing canonical parity audit:** 83 / 83  
**Related CEVRA authority:** `docs/EDVID_PARITY.md`, `docs/CEVRA_MASTER_CONTEXT.md`, `docs/CEVRA_INTEGRATION_DECISIONS.md`, ADRs 0022–0026.

## 1. Purpose

This document re-reads the already-audited EDVID baseline specifically through the lens of the **CEVRA Creator Skill product**.

It does not replace `docs/EDVID_PARITY.md`. The parity audit is the capability/implementation map. This document answers a different question:

> What exactly makes EDVID simple and effective as an agent-native editing product, which parts should CEVRA Creator preserve, where should each behavior live in CEVRA, and which EDVID mechanisms must not become CEVRA architecture?

The required classification vocabulary used here is:

- **HOST** — open-ended reasoning/conversation in Claude Code, Codex or another compatible host.
- **CREATOR SKILL** — host orchestration/playbook/progressive disclosure.
- **CREATIVE INTELLIGENCE** — reusable editorial/directorial knowledge and playbooks.
- **CORE** — typed application/domain/runtime invariant or deterministic capability.
- **VISUAL WORKSPACE** — direct human editing/preview surface over the same canonical project.
- **PROVIDER/ADAPTER** — optional external integration.
- **DO NOT PORT AS ARCHITECTURE** — useful behavior may be preserved, but the EDVID mechanism is rejected.

Current CEVRA state labels in this document are intentionally coarse and refer to the current canonical project state as of this audit:

- **FOUNDATION EXISTS**
- **PARTIAL / NEXT SLICES**
- **NOT IMPLEMENTED**
- **DECISION PENDING**

They are not substitutes for executable acceptance evidence.

---

# 2. Executive finding

The EDVID experience is strong because it combines five properties:

1. **one-command / low-friction entry**;
2. **a capable host model with a detailed editing playbook**;
3. **compact evidence rather than raw machine data**;
4. **a real visual preview/timeline and style chooser, not chat alone**;
5. **an iterative loop: ask → propose → approve → execute → preview → refine → persist**.

CEVRA should preserve all five.

The EDVID implementation is weaker than the target CEVRA architecture in four areas:

1. durable state is spread across multiple loose files;
2. execution depends on host-level scripts, PATH tools and mutable runtime assumptions;
3. agent/provider behavior is entangled with execution mechanics;
4. UI saves edits into intermediate files that the agent later consumes rather than committing through one canonical command/history system.

Therefore the correct CEVRA strategy remains:

```text
PRESERVE EDVID EXPERIENCE
→ DECOMPOSE EDVID INTELLIGENCE
→ MAP TO CEVRA LAYERS
→ REUSE SHARED CORE
→ VERIFY EQUAL OR BETTER USER EXPERIENCE
```

---

# 3. End-to-end EDVID journey → CEVRA Creator mapping

## 3.1 Installation and discovery

| EDVID behavior | Why it works | CEVRA Creator target | Current CEVRA state | Token/cost implication |
|---|---|---|---|---|
| One-command installer | Low setup friction | Creator installer + owner-scoped Skill management | PARTIAL / policy exists | None after install |
| Detects Claude Code/Codex/Gemini skill directories | User does not choose host manually | Provider-neutral host detection/adapters | Policy exists; implementation later | None |
| Installs skill payload plus dependencies | Skill is self-contained enough to work | Standalone Creator distribution with shared CEVRA Core | ADR 0022 approved; implementation later | None |
| Installs Remotion skill dependency | Domain knowledge is modular | Progressive playbook/skill discovery | Architecture approved | Metadata only until used |
| First run verifies FFmpeg/Node/Python environment | Fail early rather than during edit | CEVRA managed runtime capability/healthcheck | FOUNDATIONS EXIST | No model need except compact error |
| Re-running installer updates EDVID | Simple update mental model | Signed/versioned CEVRA update path | Decision/policy exists; implementation later | None |

**Do not port as architecture:** EDVID floating download/update assumptions, global PATH FFmpeg/Node dependence, unpinned external runtime behavior.

---

## 3.2 Starting a project

| EDVID behavior | CEVRA Creator destination | CEVRA treatment |
|---|---|---|
| Put media in a folder and open agent there | CREATOR SKILL + CORE | Preserve exactly as a first-class path |
| User says “edit this into a Reel” | HOST + SKILL | Preserve |
| EDVID creates `edit/` automatically | CORE project lifecycle | Preserve the no-wizard experience, replace loose state with canonical CEVRA project |
| Originals remain untouched | CORE invariant | Already canonical |
| URL ingest available through helper | PROVIDER/ADAPTER | Optional, typed, permissioned |
| Project can resume from `project.md` | CORE + compact project summary | Improve: resume from Project IR/history, not prose memory |
| Single-file/direct attachment workflow is not the central EDVID path | HOST + CREATOR lifecycle | CEVRA should support both folder and direct-media start |

**Creator requirement already approved:** no mandatory wizard; automatic local project; provider conversation is not the project; one-shot fast path remains token-efficient.

---

## 3.3 Context/evidence acquisition

| EDVID behavior | Destination | Preserve / improve |
|---|---|---|
| Probe every source | CORE | Preserve as deterministic evidence |
| Transcribe locally | CORE | Preserve; CEVRA already has local transcription foundation |
| Forced alignment | CORE | Preserve; CEVRA already has alignment foundation |
| Pack transcripts into phrase-level `takes_packed.md` | CORE projection + SKILL | Strongly preserve concept |
| Never load raw transcript JSON into model context | AGENT PROTOCOL + SKILL | Strongly preserve |
| Use visual survey only when transcript is insufficient | SKILL | Preserve as on-demand escalation |
| Long sources may use sub-agent so full transcript avoids main context | SKILL/HOST | Preserve principle; implementation host-specific |
| Machine checks first, subjective inspection only when needed | CORE QA + SKILL | Preserve |

**Token finding:** EDVID's “spend tokens where taste lives” is a core Creator product principle. CEVRA should go further with revision/delta projections, bounded evidence IDs and progressive tool disclosure.

---

## 3.4 Understanding user intent

| EDVID behavior | Destination | CEVRA treatment |
|---|---|---|
| No fixed questionnaire | HOST | Preserve |
| Questions depend on the material | HOST + SKILL | Preserve |
| Determine content type, target length/aspect, pacing, must-keep/must-cut | HOST + CREATIVE INTELLIGENCE | Preserve |
| “Generalize; never assume the kind of video” | SKILL | Preserve |
| Artistic freedom is default | HOST + CREATIVE INTELLIGENCE | Preserve, bounded by user intent and invariants |
| Longform and shortform use different editorial intent | CREATIVE INTELLIGENCE playbooks | Preserve |

**Creator improvement:** allow host reasoning to adapt to niche, user, audience and stated goals; current external trend/platform evidence may inform proposals only through explicit provider/capability boundaries and never becomes canonical state.

---

## 3.5 Strategy gate

| EDVID behavior | Destination | CEVRA treatment |
|---|---|---|
| Propose 4–8 sentence cut strategy | HOST + SKILL | Preserve behavior |
| Wait for confirmation before mutating | SKILL + configurable CEVRA policy | Preserve as default, allow future configurable autonomy |
| Cut/grade direction and estimated length are explained | HOST | Preserve |
| Phase 2 style is chosen after clean cut approval | VISUAL WORKSPACE + SKILL | Preserve concept; exact phase model may later be generalized |

**Do not overfit:** EDVID's strict two-phase architecture is useful evidence, not necessarily the only future Creator workflow shape. The approval boundary is more important than the file/phase implementation.

---

## 3.6 Phase 1 editorial intelligence — clean cut

| EDVID behavior | Destination | CEVRA treatment / state |
|---|---|---|
| Best take per beat, ordered by narrative beat not clip order | HOST + CREATIVE INTELLIGENCE | NOT IMPLEMENTED editorial layer yet |
| Archetypes: launch/tutorial/interview/essay/vlog | CREATIVE PLAYBOOKS | Preserve as useful initial playbooks, not universal hard rules |
| Detect false starts/restarts/mis-speaks | CORE evidence + HOST reasoning | PARTIAL foundations |
| Speech boundaries more trustworthy for cut edges than raw transcript timings | CORE | Preserve |
| Never cut inside a word | CORE invariant + SKILL guidance | Must enforce |
| Prefer silence boundaries | CORE policy + Director | Preserve |
| 30–200 ms padding, trailing slightly longer | CORE/Editing Director | Preserve/improve through measured policy |
| J-cut by default | CORE/Editing Director + Media Runtime | Audio Sequence foundation exists; full editable J-cut path remains later |
| Preserve punchlines/reactions/emphasis | HOST + Director | Preserve |
| Longform keeps breathing room | Creative Playbook | Preserve |
| Shortform compresses more aggressively | Creative Playbook | Preserve |

---

## 3.7 Audio intelligence

| EDVID behavior | Destination | CEVRA treatment / state |
|---|---|---|
| Voice level analysis catches quiet phrases that transcript misses | CORE evidence + Director | Audio Measurement foundation now exists |
| Per-range gain, not blind global compression | CORE/Director | Preserve |
| Voice mastering optional | CORE Audio policy/runtime | PARTIAL / future slice |
| Junction fades | CORE Audio policy/runtime | Preserve |
| Loudness/true peak verification | CORE QA | Measurement foundation exists; mastering/QA verdict later |
| Soundtrack optional | CREATIVE INTELLIGENCE + PROVIDER | Later |
| AI music opt-in, never default signup surprise | PRODUCT/PERMISSION policy | Preserve principle |
| SFX punctuate graphics/captions | Creative Playbook + Composition | Later |

---

## 3.8 Color / image treatment

| EDVID behavior | Destination | CEVRA treatment |
|---|---|---|
| Detect profile instead of asking user measurable question | CORE evidence | Preserve |
| Ask only if confidence is low | SKILL/HOST | Preserve |
| Candidate montage for user choice | VISUAL WORKSPACE + CORE preview | Preserve/improve |
| Grade per segment | CORE typed color capability | Later capability |
| Skin is visual guardrail | Creative Playbook + QA | Preserve as policy/evidence, not hard-coded universal metric |
| Ensure downstream color interpretation matches approved preview | CORE render/QA | Preserve |
| EDVID's specific 8-bit implementation workaround | Engine-specific evidence | Do not freeze into product semantics; benchmark current engine path |

---

## 3.9 Visual preview and direct manipulation

EDVID is **not chat-only**.

Observed interface behaviors include:

- live video preview;
- filmstrip video track;
- waveform audio track;
- playhead scrubbing;
- trim handles;
- take removal;
- caption track;
- insert/text/music tracks;
- J-cut A1/A2 visualization;
- timeline zoom;
- correction-range markers with notes;
- drag of insert/hook chips;
- portrait and landscape adaptive layouts.

| EDVID mechanism | CEVRA Creator target |
|---|---|
| UI writes `preview_edits.json`; agent later applies | Improve: direct typed CEVRA commands → ProjectHistory → Project IR |
| UI never directly edits `edl.json` | Preserve separation between presentation and canonical validation |
| Watcher notifies agent of saved UI edits | Replace with normalized event/revision interface |
| Preview server polls loose `state.json` | Replace with CEVRA project/application state projection |
| Shared immutable preview app across sessions | Preserve reusable UI component concept |

**Full requirement:** Creator Full keeps a real visual workspace. Conversation and manual controls are peers over the same project.

---

## 3.10 Style gate / visible creative choices

EDVID shortform style catalog proves that the user should **see** a choice rather than choose style names blindly in chat.

Observed options:

### Edit layouts
- Limpa
- Tela dividida
- Tela dividida 2

### Headline styles
- Contorno
- Cartão
- Realce
- Misto
- Nenhum

### Caption styles
- Karaokê
- Empilhado
- Disperso
- Simples
- Serifada
- Clássica
- Nenhum

### Edit elements
- tracking
- automatic zoom-in
- zoom changes on cuts
- flash transition
- AI soundtrack opt-in

**Creator mapping:**

- VISUAL WORKSPACE owns selection UI/preview.
- CREATIVE INTELLIGENCE owns style semantics/playbooks.
- CORE owns typed parameters, capability checks and persistence.
- HOST may recommend choices, but should not force users to choose unseen labels when a visual decision is materially easier to judge visually.

This is a high-value EDVID behavior to preserve.

---

## 3.11 Phase 2 shortform composition

| EDVID behavior | Destination | CEVRA treatment |
|---|---|---|
| Data-driven composition | CORE/Composition adapter | Preserve |
| Static visual hook/headline | Creative Playbook + Composition | Preserve |
| Dynamic camera | Creative Playbook + Composition | Preserve |
| Caption animation families | Style/Composition packs | Preserve behavior |
| Split-screen inserts | Composition capability | Preserve |
| Behind-the-subject element | Composition + matting | Optional capability |
| B-roll/image inserts synced to narration | Host/Director + provider + Composition | Preserve |
| Bespoke motion graphics | Creative Intelligence + reviewed components | Preserve outcome; reject arbitrary code surface |
| SFX tied to visual events | Playbook + Composition/Audio | Preserve |
| Soundtrack | Audio/provider | Preserve |
| Verify visual moments with contact sheet | QA/evidence | Preserve principle |

**Rejected mechanism:** arbitrary agent-authored `CustomGraphics.tsx` as a stable end-user surface.

---

## 3.12 Longform behavior

EDVID does not simply stretch shortform.

Observed longform differences:

- 16:9 source resolution/fps;
- retention arc rather than maximum compression;
- gentler silence trimming;
- cold open + chapters + payoff/outro;
- re-hooks/open loops;
- B-roll carries visual variety instead of constant zoom;
- lower-thirds;
- chapter cards;
- callouts;
- SRT/YouTube CC rather than default burned karaoke captions;
- chapters text output;
- last ~20 seconds visually calmer for end cards;
- screen-record/tutorial behavior uses crop-zoom/callouts.

**Creator mapping:** these are Creative Playbook behaviors, not a second engine/product. Shortform/longform should route to the same Core with different editorial policies and composition presets.

---

## 3.13 Asset sourcing and generation

| EDVID behavior | Destination | CEVRA treatment |
|---|---|---|
| Pexels image helper | PROVIDER | Optional, current terms revalidate |
| Wikimedia fallback | PROVIDER | Optional |
| Google image search for brands/people/logos | PROVIDER | Do not assume as safe/default; terms/rights/relevance must be revalidated |
| Local project assets first | CORE/Asset Planner | Strongly preserve |
| AI music via Treblo | PROVIDER | Optional |
| Ask for keys lazily only when feature is selected | Product/permission policy | Preserve |
| No key required for Phase 1 | Product independence | Preserve principle |
| Found/generated assets become edit inputs | Project IR source/provenance | CEVRA improves with canonical provenance |

---

## 3.14 QA and convergence

| EDVID behavior | Destination | CEVRA treatment |
|---|---|---|
| Numeric verification before subjective review | QA Core | Preserve |
| Flagged junctions only for visual inspection | QA + Evidence | Preserve |
| Up to 3 correction loops before surfacing remaining flags | QA/Director policy | Useful reference, not frozen magic number |
| Duration/junction/silence/level/sync checks | QA Core | Preserve |
| Contact-sheet batching | Evidence builder | Preserve |
| Avoid repeated full visual review | Skill/evidence policy | Preserve for token/latency efficiency |

CEVRA improvement: QA findings and correction attempts should link to project revisions/history rather than live as standalone helper output.

---

## 3.15 Refinement loop

EDVID supports two refinement channels:

1. **chat:** user asks for changes;
2. **preview UI:** user trims, removes, drags or marks a correction range.

EDVID then re-reads intermediate files, validates and re-renders.

CEVRA target:

```text
chat request
       \
        → typed change → ProjectHistory → Project IR
       /
direct UI manipulation
```

Both then produce one new revision. The host sees compact deltas, not a parallel state.

This is a direct product improvement and should be preserved as a Creator Full acceptance criterion.

---

## 3.16 Persistence / resume

| EDVID behavior | CEVRA target |
|---|---|
| `project.md` stores session memory | compact project/session summary derived from canonical state |
| `edl.json` stores cut | Project IR |
| `preview_style.json` stores style choice | typed project/style state |
| `state.json` drives UI | application projection |
| `edit-data.json` drives composition | typed composition plan/Project IR-backed state |
| `transcripts/*.json` cache | canonical transcript + separate derived cache |
| `final.mp4` deliverable | user-visible export artifact |

**Key improvement:** provider session history is never required for resume.

---

## 3.17 Render/export

EDVID delivers predictable local artifacts, most importantly `cut.mp4` and `final.mp4`.

CEVRA should preserve:

- local export by default;
- predictable user-visible destination;
- preview versus final distinction;
- final render from best/original sources where applicable;
- no required paid provider;
- clear progress and failure states.

CEVRA should improve:

- managed runtime;
- typed render/export contract;
- version/capability reporting;
- cancellation;
- integrity/provenance;
- no global PATH execution assumptions;
- project-safe cleanup.

---

# 4. What belongs where — Creator intelligence ledger

The following is the working decomposition that future decisions should refine rather than restart.

| Behavior | HOST | SKILL | CREATIVE INTELLIGENCE | CORE | VISUAL UI |
|---|:---:|:---:|:---:|:---:|:---:|
| Understand natural request | ✓ |  |  |  |  |
| Ask material-specific questions | ✓ | ✓ |  |  |  |
| Choose narrative hook/take | ✓ |  | ✓ | evidence |  |
| Choose shortform vs longform strategy | ✓ | ✓ | ✓ |  |  |
| Recommend style | ✓ | ✓ | ✓ | capabilities | ✓ |
| Approve strategy | user interaction | ✓ | policy | revision gate |  |
| Never cut inside word | guidance | ✓ | policy | **enforce** | warn |
| Cut padding |  | ✓ | ✓ | enforce/compile |  |
| J-cut policy |  | ✓ | ✓ | execute/validate | visualize |
| Transcript packing |  | ✓ |  | **project** |  |
| Evidence escalation | ✓ | ✓ |  | bounded interface | preview |
| Color/profile detection |  | ✓ |  | **execute** | show candidates |
| Take leveling | reasoning | ✓ | ✓ | measure/apply | visualize |
| Caption style recommendation | ✓ | ✓ | ✓ | typed style | choose visually |
| Caption timing/layout |  |  | ✓ | compile/validate | edit |
| B-roll concept/query | ✓ | ✓ | ✓ | asset planner | choose/replace |
| Provider selection |  | policy | policy | adapter/capability | settings |
| Motion graphics concept | ✓ | ✓ | ✓ | reviewed components | edit params |
| Numeric QA |  | ✓ | policy | **execute** | show findings |
| Refinement interpretation | ✓ | ✓ |  | typed mutation | direct mutation |
| Resume project |  | ✓ |  | **canonical state** | same state |
| Export |  | ✓ |  | **execute** | user controls |

---

# 5. Token/cost audit findings

EDVID already contains several unusually good context-economy decisions:

1. phrase-level transcript packing instead of raw JSON;
2. no machine JSON in model context;
3. numeric QA before visual inspection;
4. visual inspection only at flagged junctions;
5. batched contact sheets instead of many image reads;
6. longform delegation to avoid placing massive transcripts in the main context;
7. reusing cached transcripts;
8. not re-rendering clean-cut Phase 1 for Phase-2-only changes.

CEVRA should preserve all eight and add:

- capability metadata only at startup;
- specialized tool schemas only when activated;
- revision/delta project summaries;
- evidence IDs/ranges instead of repeated payloads;
- cached deterministic projections;
- no full Project IR in ordinary agent context;
- media/frame/audio evidence only by explicit escalation.

**Audit conclusion:** token efficiency is not an EDVID compromise; it is part of what makes its agent UX viable. CEVRA should treat it as a measurable acceptance dimension.

---

# 6. Mobile/remote implications

EDVID assumes a local terminal/browser-style environment.

CEVRA Creator should preserve the same product loop from mobile/remote hosts by separating control from execution:

```text
mobile host conversation/control
→ Creator Skill / Agent Protocol
→ trusted node with CEVRA Core + media
→ preview/status/result
```

This makes the EDVID-like conversational loop portable without requiring the phone to run Whisper, FFmpeg or composition engines.

Fully cloud-executed editing remains a separate later decision.

---

# 7. Important EDVID mechanisms CEVRA should NOT copy literally

1. `edl.json`, `state.json`, `preview_edits.json`, `preview_style.json`, `edit-data.json` and `project.md` acting together as quasi-state.
2. global/PATH FFmpeg as release runtime.
3. globally assumed Node/Remotion runtime as product core.
4. raw filter strings as a normal product editing representation.
5. arbitrary editable TSX for bespoke graphics as a stable agent surface.
6. arbitrary Premiere ExtendScript as a stable execution surface.
7. host-specific polling/watcher behavior as canonical workflow semantics.
8. project correctness depending on the agent remembering to read/delete synchronization files.
9. provider credentials stored as ad-hoc skill environment state.
10. provider conversation/session as practical project memory.
11. phase/template files as alternate state to the canonical project.
12. existence-only transcript cache semantics.

These are implementation conveniences or limitations, not user-experience requirements.

---

# 8. EDVID behaviors that should become explicit Creator acceptance criteria

The Creator should eventually prove, with real media, that a normal user can:

1. install with minimal friction;
2. provide media or open a folder and ask for an edit in natural language;
3. get automatic local analysis/transcription without required paid API;
4. receive a sensible strategy rather than manually assembling an edit;
5. approve or refine strategy;
6. receive an automatic clean edit;
7. see and scrub a real preview/timeline;
8. directly trim/remove/adjust items;
9. visually choose style/caption/headline/layout options;
10. receive automatic captions/visual layers appropriate to format;
11. request B-roll/assets and replace them easily;
12. get appropriate audio treatment;
13. get numeric QA/correction;
14. refine by conversation without losing manual changes;
15. refine manually without losing AI changes;
16. resume the project later without the original chat;
17. use a compatible different host against the same project;
18. export a local final file predictably;
19. do the common one-shot path without large token overhead;
20. use the control/refinement loop from mobile/remote host surfaces when supported.

---

# 9. Current CEVRA readiness against this journey

## Foundations already present or closed

- Project IR / ProjectHistory and persistence/recovery;
- local source ingest;
- local transcription;
- transcript persistence semantics;
- forced alignment;
- Desktop runtime integration;
- ProjectHistory scalability;
- Audio Sequence Runtime;
- Audio Measurement V1;
- managed Media Runtime principles and typed execution boundaries;
- provider-neutral architecture and Skill/Creator decisions;
- Normal/Advanced progressive-disclosure product direction.

## Partially available / active dependency work

- Transcript Cache V1 remains draft/unmerged pending reconciliation;
- coordinated Media Runtime gate remains active;
- audio mastering/J-cut complete editable workflow remains incomplete.

## Still required for EDVID-like Creator flow

- compact editorial evidence projection;
- editorial analysis;
- strategy/take selection/cut planning;
- typed edit Change Set/compiler path;
- numeric QA engine/convergence;
- native/shared preview/timeline;
- captions pipeline and visual style system;
- composition engine benchmark/selection;
- shortform/longform composition components;
- B-roll/asset planning and provider adapters;
- richer audio/music/SFX;
- Agent Protocol concrete tool surface;
- Creator standalone packaging;
- Creator Full visual workspace packaging;
- Lite/Full final boundary;
- installation/update implementation for Creator;
- permission/security UX;
- mobile/remote-host acceptance tests.

---

# 10. Decisions this audit says should come next

This section is a **decision queue**, not an approval.

1. **Creator Lite vs Full exact product boundary.**
2. **Host experience in Claude Code:** activation, session start, progress, preview/result presentation.
3. **Evidence contract:** what the model sees first, and escalation levels.
4. **Strategy/approval/autonomy policy.**
5. **Creator Full workspace minimum visual surface.**
6. **Media/file/staging lifecycle and cleanup/retention.**
7. **Security/permissions for local files, network/providers and external actions.**
8. **Installation/update/compatibility contract.**
9. **Provider-neutral mobile/remote acceptance contract details.**
10. **Implementation-readiness gate and first Creator slice.**

The composition engine, specific provider choices and pricing remain separate decisions and should not be pulled forward merely to complete this audit.

---

# 11. Final audit conclusion

The Creator should **feel more like EDVID than like a traditional editor with a chatbot**, while internally behaving very differently.

The correct target is:

```text
EDVID-level directness
+ host-level creative reasoning
+ visible direct editing
+ CEVRA shared Core
+ canonical Project IR/history
+ typed tools
+ token-efficient evidence
+ provider neutrality
+ mobile/remote control path
```

No discovered EDVID user-experience behavior requires abandoning the approved CEVRA architecture. The main risk is the opposite: over-engineering the agent surface until the EDVID simplicity is lost. Future Creator decisions should therefore treat **simplicity, token efficiency and direct visual control** as acceptance criteria alongside correctness and reuse.
