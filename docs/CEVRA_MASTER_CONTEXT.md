# CEVRA ORBIT — MASTER CONTEXT & DECISION LEDGER

**Canonical continuity document**
**Initial consolidation:** 2026-09-14
**Last decision reconciliation:** 2026-09-30, PRs #57/#58 merged and post-merge validated; bounded offline Claude CLI transport/evidence PoC V1 is IMPLEMENTED / CLOSED. PR #56 is CLOSED / MERGED and post-merge validated; INT-CLOUD-01–05 are incorporated into planning only. Slice A remains closed; real semantic round-trip is NOT DEMONSTRATED; the historical experiment remains terminal (8/8 used, zero balance). Codex diagnosis remains preserved and blocked.
**Scope:** decisions, architecture, implementation state, research references, skills/product investigations, roadmap and operational workflow for CEVRA Orbit / CEVRA Vids.
**Purpose:** prevent loss of project context when a ChatGPT/Codex/Claude conversation reaches its length limit and provide one durable source that a new chat can read before proposing changes.

---

## 0. How to use this document

This file is the project continuity anchor. Before any substantial CEVRA implementation, architecture change, review, or competitive-product analysis, read this document first.

### Repository authority and storage

- The tracked canonical copy is `docs/CEVRA_MASTER_CONTEXT.md`.
- `AGENTS.md` is the authoritative agent-policy entry point. `docs/ARCHITECTURE_V1.md` and accepted ADRs remain authoritative for architecture. This ledger records and connects those decisions; it does not silently replace them.
- A DOCX export may be retained outside the repository for reading or sharing, but it is not a second editable source. Regenerate it from the tracked Markdown when a human-readable export is needed.
- Statements in this ledger are context and recorded decisions, not standing permission to push, merge, publish, delete, contact third parties, or perform other external actions. Current user instructions and repository policy still govern each task.
- Do not place secrets, credentials, private model data, temporary paths, or unverified claims in this document.

### Status labels

- **CANONICAL** — accepted product/architecture decision. Do not change casually.
- **IMPLEMENTED / CLOSED** — merged and considered finished at the stated scope.
- **IN DEVELOPMENT** — active branch; not yet merged.
- **PENDING DECISION** — explicitly unresolved.
- **RESEARCH BACKLOG** — investigation agreed but not completed.
- **SUPERSEDED** — historical decision retained for traceability but no longer authoritative.

### Update protocol for future decisions

1. Never silently delete a prior decision. Mark it **SUPERSEDED** and record the replacement.
2. After every merged implementation slice, update:
   - current `main` SHA;
   - branch/PR status;
   - capabilities completed/advanced;
   - tests and important release constraints.
3. Add every material product or architecture decision to the **Decision Ledger** with date and status.
4. Add every external product, skill, repository, video, or competitor reference to the **Research Register**, including what was observed and what remains to investigate.
5. Keep hypotheses distinct from facts. If a product behavior was inferred from a demo rather than verified from code/docs, mark it **INFERRED**.
6. This document must remain usable even if all prior chat history is unavailable.
7. Update it after a material merge, approved decision, review outcome, active-work transition, or completed research finding. Do not add routine command logs or transient debugging details that do not affect future work.
8. Before a long conversation ends or approaches its context limit, reconcile the current branch/PR state, decisions and unresolved items here.
9. Prefer a dedicated documentation change when updating this ledger would pollute the scope of an active feature branch.

### Bootstrap instruction for a new chat

> Read `docs/CEVRA_MASTER_CONTEXT.md` in full before proposing or implementing anything for CEVRA Orbit. Treat entries marked CANONICAL and IMPLEMENTED/CLOSED as binding unless the user explicitly changes them. Resume from CURRENT STATE, do not redo closed audits, and preserve the policy `PRESERVE → EXTEND → VERIFY → MIGRATE ONLY IF NECESSARY`.

---

# 1. Product identity and hierarchy

## 1.1 CANONICAL — CEVRA Orbit

**CEVRA Orbit** is the complete ecosystem/platform/universe, not the content-intelligence layer and not a single editor feature.

```text
CEVRA Orbit
├── CEVRA Vids
├── Marketplace
├── future CEVRA products/apps
└── shared platform services
```

Future shared services may include identity/account, licensing, entitlements, billing, package registry, updates, recommendations and sync. They must remain shared platform capabilities rather than collapsing all products into one monolith.

## 1.2 CANONICAL — CEVRA Vids

**CEVRA Vids** is the first and highest-priority independent product in Orbit.

It is an **AI-first video editor and creator**, not a traditional editor with a chatbot attached.

Primary target experience:

```text
import raw media
→ describe desired result
→ AI understands the material
→ AI plans and executes typed CEVRA operations
→ layered editable timeline
→ preview/review
→ approval by default (configurable)
→ refinement if needed
→ export
```

Direct manual editing is first-class and remains available in the Normal surface for adjustment, refinement, correction and creative control. AI editing and direct manipulation operate on the same project/timeline; routine production work should not be shifted back to the user.

## 1.3 CANONICAL — independence requirements

CEVRA Vids must remain useful without:

- Marketplace;
- unimplemented Orbit services;
- Content Intelligence;
- Claude;
- external Codex;
- paid OpenAI/Anthropic API usage;
- external generative providers;
- mobile;
- Premiere integration;
- a final HyperFrames/Remotion choice.

PT-BR is the initial default language. EN-US must have parity. Version numbers use SemVer but remain discreet in About/Settings/diagnostics/logs/support rather than primary branding.

---

# 2. Non-negotiable architecture

## 2.1 CANONICAL — Project IR

Project IR is the **single canonical audiovisual source of truth**.

UI state, transcript files, EDL projections, render plans, caches, provider results, generated files and agent state may be derived inputs/artifacts, but cannot become an alternate source of truth.

Durable audiovisual mutations must go through typed commands and preserve:

- journal/history;
- snapshots;
- undo/redo;
- recovery;
- versioning/migrations;
- backward compatibility with existing projects.

## 2.2 CANONICAL — change philosophy

Mandatory implementation order:

```text
PRESERVE
→ EXTEND
→ VERIFY
→ MIGRATE ONLY IF NECESSARY
```

`MELHORAR` never means “rewrite stable foundations”.

Replacing a stable component requires:

1. explicit technical reason;
2. alternatives evaluated;
3. characterization tests first;
4. compatibility/migration plan;
5. rollback plan;
6. proof of no capability/guarantee loss.

No big-bang parity branch.

## 2.3 CANONICAL — Media Runtime boundary

Media Runtime V1 is a completed foundation. New editorial features should normally follow:

```text
editorial/application policy
        ↓
typed operation/compiler
        ↓
existing MediaEngineAdapter
        ↓
existing Media Runtime
```

Do not introduce:

- second FFmpeg runtime;
- global/PATH FFmpeg in release;
- arbitrary shell;
- arbitrary filtergraphs;
- second worker merely for parity;
- regressions in cancellation, process reaping, integrity, delivery validation, cleanup or retry/recovery.

A new Media Runtime operation is allowed only if no existing primitive can correctly represent the requirement, and must remain typed, allow-listed and tested.

## 2.4 CANONICAL — Python policy

Python is permitted **inside CEVRA-managed engines**.

The prohibition is dependence on Python installed by the user/system.

Target pattern:

```text
CEVRA Desktop / UI / Project IR / Application
→ TypeScript + Tauri/Rust

CEVRA-managed private Python distribution
├── Media Runtime environment
└── Transcription/other ML environments
```

Prefer sharing the private CPython distribution when safe, while isolating dependency environments per engine. Never contaminate the sealed Media Runtime dependency environment with ML packages.

## 2.5 CANONICAL — security surfaces

Do not expose arbitrary:

- shell commands;
- raw argv;
- raw FFmpeg filtergraphs;
- arbitrary TSX/React code;
- arbitrary ExtendScript;
- arbitrary Python/modules;
- unrestricted package filesystem/network access.

Agents and presets operate through typed validated CEVRA commands and providers.

## 2.6 CANONICAL — non-destructive editing and quality/performance

CEVRA uses non-destructive editing. Original media is immutable, while cuts, crops, captions, color, audio treatment, overlays and other editorial choices remain editable Project IR instructions. Proxies, previews, caches and intermediate renders are disposable derived artifacts; they never replace an original, become a final-quality source or become a second source of truth.

Final rendering uses original sources, original assets and the best available generated assets whenever technically applicable. Render planning avoids unnecessary generational re-encoding and balances perceptual quality, throughput, file size and target-platform constraints. **Balanced / Equilibrado** is the intended future default; **Maximum Quality / Máxima Qualidade** and **Fast / Rápido** are reserved future profiles. These profiles are not implemented yet.

EDVID remains the functional/editorial floor. This policy improves on that baseline and does not authorize loss of proven EDVID behavior. [ADR 0013](adr/0013-nondestructive-editing-quality-performance.md) is the specific authority.

---

# 3. UI and product experience decisions

## 3.1 CANONICAL — editor UX

- Preserve useful EDVID-style usability and automation, but not EDVID branding/trade dress.
- CEVRA visual identity should feel sophisticated, native and deliberate — not generically “AI-generated”.
- Entire workflow should happen inside CEVRA where possible.
- Imported, found or generated media/assets should appear automatically as ordinary editable assets/timeline items.
- Approval/review is default behavior, but configurable.

## 3.2 CANONICAL — layered timeline concept

```text
V4 — motion graphics / overlays
V3 — photos / images / B-roll
V2 — captions / headline
V1 — main video

A3 — SFX
A2 — music
A1 — voice / original audio
```

Generated/found/imported assets become normal Project IR sources/items with provenance.

## 3.3 CANONICAL — Normal / More Controls / Advanced

CEVRA Vids uses **one editor, one Project IR, one project and one timeline** with progressive disclosure of controls. There are not separate Normal and Advanced project states.

### Normal — default editing surface

The Normal surface must be approximately as direct and easy to understand as the observed EDVID editing surface while retaining original CEVRA visual identity and avoiding EDVID branding/trade dress.

Normal keeps the timeline visible and directly editable. The user may freely touch and edit it from the start.

Default Normal characteristics:

- large preview;
- clear compact timeline;
- direct trim, move, delete, duplicate and drag/drop interactions;
- simple visible categories such as media, captions, text, images/B-roll, audio and effects;
- contextual inspector exposing only relevant controls for the selected item;
- presets and visual choices;
- natural-language CEVRA command field available in the same editing experience;
- immediate visible result in the same preview/timeline;
- no requirement to understand Project IR, Director internals, provider choice, engine choice, QA internals or technical track structures.

### More Controls

Contextual progressive disclosure may expose additional controls for the selected element without forcing the full Advanced surface.

### Advanced — optional full exposure

Advanced exposes the deeper editing complexity available for the same project/timeline, including as capabilities mature:

- expanded/separated tracks;
- precise timing;
- keyframes;
- transform/crop/position/opacity;
- detailed caption properties;
- layered audio controls;
- transitions/effect parameters;
- B-roll/overlay details;
- animation/composition controls;
- deeper technical project/render controls where appropriate.

Advanced capability must never force Advanced complexity onto the Normal surface.

## 3.4 CANONICAL — unified AI + direct editing interaction

CEVRA must not force a choice between “automatic” and “manual” editing.

Target interaction:

```text
CEVRA edits
→ user directly adjusts
→ user asks by natural language
→ CEVRA changes the same project
→ user refines again
```

All paths mutate the same validated Project IR through the same typed command/history system.

Product constraint:

> Internal sophistication must not leak into default UX complexity. A new feature should either improve the resulting video or direct user control; if it mainly adds visible complexity, keep it behind contextual/progressive disclosure or defer it.

---

# 4. AI-first editing: what “the AI edited the video” means

## 4.1 CANONICAL interpretation

When an AI product says a model “generated the edit”, the intended architecture is generally:

```text
raw media
↓
transcription + audio/visual understanding
↓
editorial AI / reasoning model
↓
structured editorial decisions
├── take selection
├── cut points
├── pacing
├── captions/headlines
├── zooms/camera treatment
├── B-roll/inserts
├── graphics
├── music/SFX
└── style/layout
↓
typed edit plan / timeline / composition description
↓
deterministic media/composition engines
↓
rendered video
```

The reasoning model does not need to synthesize every final frame itself. It may act as editor/director while FFmpeg/composition engines execute the plan.

This is the same paradigm targeted by CEVRA Vids.

## 4.2 CANONICAL — model-independent editorial brain

The same Project IR and command API should allow different AI brains to create alternative edits of the same source material, e.g.:

- embedded Codex;
- external Codex + CEVRA skill;
- external Claude Code + CEVRA skill;
- future local/other agent;
- future embedded Claude if an official suitable mechanism exists.

Different models may produce distinct editorial interpretations while the CEVRA infrastructure, Project IR and render engines remain stable.

---

# 5. Generative AI assets

## 5.1 CANONICAL — required capability

Generative assets are an intended CEVRA Vids capability, not an unrelated future experiment.

The editorial AI may decide that an edit needs an asset and request generation of:

- image;
- B-roll/video;
- illustration;
- background;
- motion graphic;
- future audio/music/voice where appropriate.

Conceptual flow:

```text
editorial AI
↓
“this moment needs an insert / graphic / B-roll”
↓
asset planner
↓
image/video/audio generation provider
↓
generated asset + provenance
↓
ordinary Project IR source/timeline item
```

The product must not require a paid generative provider for basic usefulness.

## 5.2 CANONICAL — asset planner preference order

Prefer, when available:

1. existing project assets;
2. stock/local resources;
3. host-native generation covered by the user’s entitlement;
4. local models;
5. optional external/BYOK providers.

## 5.3 CANONICAL — separation of responsibilities

Keep distinct:

- **Editorial AI:** decides what the edit needs.
- **Generative provider/model:** synthesizes an asset when needed.
- **Composition engine:** places/animates/composites the asset.
- **Project IR:** owns the editable resulting state.

---

# 6. Creative Intelligence and skill architecture

## 6.1 CANONICAL — structure

```text
CEVRA Creative Intelligence
├── Core Editorial Director
├── Editing Director
├── Generative Director
├── Creative Playbooks
│   ├── Cinematic
│   ├── Product
│   ├── Fashion
│   ├── Property
│   ├── Food
│   ├── Social Hook
│   ├── Motion Graphics
│   ├── Music
│   ├── Anime
│   ├── Cartoon
│   ├── 3D/CGI
│   └── future categories
└── Providers
```

Use progressive disclosure: only relevant skills/playbooks should be loaded for a task, avoiding unnecessary context/token consumption.

## 6.2 CANONICAL — clean IP policy

- Public permissive skills may be studied/reused according to license.
- Proprietary/paid skill packs may guide original clean-room behavior only unless separately licensed.
- Do not copy BUDOSKILL proprietary skill contents.
- Do not copy branding/trade dress of EDVID or other products.
- Auroq and other proprietary/unlicensed references are clean-room behavior references only.

---

# 7. Agent architecture and operating modes

## 7.1 CANONICAL — Agent Gateway target

```text
CEVRA Vids UI
  ├─ Agent panel
  ├─ Preview
  ├─ Timeline
  ├─ Inspector
  └─ Assets
        ↓
     Agent Gateway
     /    |     \
  Codex Claude Local/Future
        ↓
 typed CEVRA commands
        ↓
     Project IR
```

## 7.2 CANONICAL — integration modes

Maintain three initial modes:

1. embedded Codex in CEVRA when an official supported commercial mechanism is appropriate (e.g. Codex App Server/harness if suitable);
2. external Codex + CEVRA skill;
3. external Claude Code + CEVRA skill.

Prepare the architecture for a future embedded Claude path, but do not assume an unsupported mechanism.

EDVID does **not** provide evidence of using Codex App Server; its public `agents/openai.yaml` is skill metadata for an external host.

## 7.3 CANONICAL — skill installation policy

After Vids install, CEVRA may detect supported agent installations and, only with explicit user authorization, manage CEVRA-owned skills.

Known locations:

- Claude Code: `~/.claude/skills/`
- Codex: `$CODEX_HOME/skills/` or `~/.codex/skills/`

Rules:

- owner-scoped directories only;
- manifest/version/hash/min-max compatibility/rollback;
- never overwrite foreign git checkout;
- never follow destructive symlinks;
- preserve config/secrets;
- no admin when user-scoped install is possible.

---

# 8. Model/agent usage policy for development

## 8.1 CANONICAL — optimize quality per quota/token cost

As of 2026-09-14 the user upgraded to ChatGPT Pro specifically to increase Codex capacity during the CEVRA build.

Do **not** use the most expensive reasoning mode by default.

Operational rule:

- small/mechanical edits, Git, tests, obvious documentation: economical capable model;
- normal focused implementation within known architecture: intermediate model/effort;
- runtime, ML, concurrency, persistence, migrations, difficult debugging, security-sensitive architectural changes: strong model such as Sol High;
- maximum/extra-high effort only when materially justified;
- Claude is used as an independent adversarial reviewer only when a second model adds real value, not for every PR.

Prompts should minimize repeated context and rely on canonical repo documents where possible.

---

# 9. EDVID baseline

## 9.1 CANONICAL — role

EDVID is the initial functional/editorial floor, not the ceiling.

Policy:

```text
PORT WHAT WORKS
→ ADAPT TO CEVRA ARCHITECTURE
→ TEST PARITY
→ IMPROVE
```

User requirement: CEVRA Vids should ultimately deliver practically everything useful EDVID already delivers, plus improvements.

## 9.2 Pinned public reference

Repository: `fillrochaa/edvid`
URL: `https://github.com/fillrochaa/edvid`
Pinned baseline SHA: `d8e6389db02e8de0b46ee680105c09d4250d4703`
License at baseline: MIT
Tracked files reviewed in parity audit: 83.

Secondary repository observed: `fillrochaa/edvid-lt`; it is not the primary parity baseline.

## 9.3 Verified EDVID facts

- host-agent skill + Python helpers + Remotion templates;
- supports Claude Code, Codex and Gemini/Antigravity skill installation;
- Phase 1 uses FFmpeg CLI;
- Phase 2/3 composition is Remotion-based;
- Hard Rule 10 in public skill: Phase 2 is Remotion-only;
- local transcription uses WhisperX / alignment behavior;
- preview server uses `helpers/preview_server.py` + `assets/preview/`;
- public Codex integration is external skill metadata, not Codex App Server;
- `transcribe.py` actual default is `large-v3`, despite surrounding prose mentioning/recommending `large-v3-turbo`;
- `num_speakers` is accepted but unused for real diarization;
- transcript cache is unsafe existence-only cache;
- Pexels helper code covers photos; broader video-search behavior is not implemented at the pinned revision;
- upstream assumes PATH FFmpeg/yt-dlp and must not replace CEVRA managed runtime;
- custom Remotion TSX is an arbitrary-code escape hatch and is not acceptable as a CEVRA stable surface;
- Premiere MCP alternate execution includes arbitrary ExtendScript, also rejected as a stable CEVRA arbitrary-script surface.

## 9.4 EDVID hard rules preserved as parity requirements

1. real phase gate;
2. per-segment extract → lossless concat, explicit J-cut assembly;
3. 30 ms fades at every boundary;
4. never cut inside a word;
5. 30–200 ms cut padding; trail slightly longer; prefer silence;
6. cache transcript;
7. per-segment grade;
8. strategy confirmation;
9. outputs under edit directory in EDVID behavior, adapted so generated folders are not CEVRA source of truth;
10. Phase 2 Remotion-only in EDVID baseline (functional evidence, not CEVRA mandate);
11. data-driven template; custom graphics bespoke;
12. numeric QA first;
13. do not load large machine JSON directly into agent context; use compact transcript/helper output.

---

# 10. EDVID parity specification — CLOSED

## 10.1 Final audit state

PR #9 merged.
Merge commit: `6502afa9092f2be0ebd1d7b259f83dedf3f672d3`.

Final specification counts:

- capabilities: **174**;
- current state: EXISTENTE 8 / PARCIAL 53 / AUSENTE 113;
- target: PORTAR 100 / MELHORAR 68 / NÃO APLICÁVEL 6;
- priority: P0 67 / P1 80 / P2 27;
- hard rules: 13;
- `DIVERGÊNCIA EDVID`: 3;
- UNKNOWN: 0.

## 10.2 Dependency-driven implementation sequence

```text
1. Source ingest application service and canonical asset registration
   ↓
2. Local transcription engine, alignment, cache integrity, and Project IR mapping
   ↓
3. Compact editorial transcript model plus acoustic/visual analysis projections
   ↓
4. Editorial strategy, approval gate, take selection, and typed cut plan
   ↓
5. Missing Project IR commands needed for cut order, layered audio, review, and style
   ↓
6. Cut compiler using existing Media Runtime primitives
   ↓
7. Numeric QA Engine and correction/retry convergence
   ↓
8. Native preview and layered timeline over Project IR/history
   ↓
9. Caption cue compiler, SRT export, text-layout fixtures
   ↓
10. CompositionEngineAdapter benchmark with EDVID visual/function fixtures
   ↓
11. Shortform and longform typed composition components
   ↓
12. Face/camera analysis, B-roll/asset placement, music/SFX, richer QA
   ↓
13. Optional stock/generative providers and external/embedded Agent Gateway adapters
   ↓
14. Future skill/package management and NLE interchange
```

The first usable vertical flow is:

```text
ingest
→ local transcription/alignment
→ editorial transcript/analysis
→ strategy + take selection + cut planning
→ Project IR typed commands
→ existing Media Runtime
→ numeric QA
→ native preview/layered timeline
→ approve/refine
→ export
```

---

# 11. Media Runtime V1 — IMPLEMENTED / CLOSED

## 11.1 Final status

PR #7 merged.
Merge commit: `35a8c81ef83627101d7c97636990c5272856509f`.

Final remediation commit cited in closeout: `67a084867c639c3ef387a604da27881101945cb0`.

Core final characteristics:

- persistent `cevra-media-worker`;
- private CPython 3.12.14;
- FFmpeg 9.0.1;
- ffmpeg-skill 1.4.2 pinned to commit `58f64f9d9e6a0ced4a4cd6a198d7476dede50d1a`;
- one worker / one active media job;
- typed allow-listed media operations;
- cancellation/control/process reaping/timeouts;
- artifact safety/cleanup;
- retry/recovery;
- provenance/integrity;
- LGPL-only FFmpeg configuration target;
- macOS arm64 validated in the closed V1 scope;
- no global FFmpeg in release;
- Project IR/history integration.

Tests at closeout: Node 110/110, Python 12/12.

## 11.2 Non-blocking backlog retained

1. volume/loudness/audio-fade do not support WAV/M4A in the current surface;
2. Python pruning hardcodes python3.12;
3. `mux-audio replaceExisting=false` can place new audio first/default;
4. future encoder wording in ADR is broader than current reality.

Do not reopen Media Runtime V1 generically to solve unrelated parity work.

---

# 12. Architecture Canon — IMPLEMENTED / CLOSED

PR #8 merge commit: `9387ab3507355bb9c20cd17be7b27754a9059ec0`.

Correction commit before merge: `83879281ffd318bb970904e0f0437f718cfc3580`.

Key locked decisions include:

- Orbit/Vids hierarchy;
- Project IR sole source of truth;
- AI-first Vids flow;
- EDVID as baseline;
- agent modes;
- progressive skills;
- PT-BR/EN-US parity;
- composition behind adapter;
- generative assets/provider architecture;
- Creative Intelligence;
- Marketplace ownership by Orbit;
- mobile later, not blocking desktop Vids.

Historical `Content OS` wording may remain in historical ADR/context. Canonical current naming is Content Intelligence.

---

# 13. Composition strategy

## 13.1 CANONICAL — adapter boundary

All composition engines remain behind `CompositionEngineAdapter`.

## 13.2 PENDING DECISION — HyperFrames vs Remotion

- HyperFrames is the preferred candidate **only if measured equal/better** than the required EDVID composition behavior.
- Remotion is an eligible candidate/fallback, not a current mandatory dependency and not prohibited.
- Final selection must not sacrifice visual quality, automation, exact timing or editorial capability for licensing preference alone.
- Any commercial Remotion incorporation requires exact-version/current-license review at decision time.

Benchmark must cover at least:

- karaoke/static/stacked captions;
- headlines;
- split screen;
- cards/images/B-roll;
- dynamic camera;
- hard zoom / slow push-in;
- face tracking;
- motion graphics;
- SFX;
- transitions;
- exact timing;
- data-driven templates;
- vertical and horizontal output.

No product-facing claim should state that CEVRA already “uses Remotion” until selected and incorporated.

---

# 14. Local Source Ingest V1 — IMPLEMENTED / CLOSED

PR #10 merge commit / current main after merge:
`aa92402cf49cc45f55c961508f66c262a02ce075`.

Capabilities:

- `EDV-ING-001` implemented in this scope;
- `EDV-ING-006` partially advanced;
- `EDV-ING-007` partially advanced.

Final behavior:

```text
local media path / file URI
→ MediaApplicationService
→ existing managed probe
→ normalized source metadata
→ typed source.add
→ ProjectHistory
```

Scope:

- video + audio;
- original URI preserved;
- no copy/move/rename/transcode;
- remote/provider URIs rejected before probe;
- static image ingest intentionally not supported in V1;
- image-like probe results fail closed rather than being silently recorded as video;
- source mutation uses `ProjectHistory.commit(source.add)`;
- conflict/cancellation/undo/redo/provenance tested;
- Media Runtime and Project IR schema/commands unchanged.

Conservative V1 side effect accepted: some unusual legitimate formats such as MJPEG may be rejected until format support is expanded with evidence.

---

# 15. Local Transcription Engine V1 — IMPLEMENTED / CLOSED

## 15.1 Final merged state

PR #11 merged.
Merge commit: `d780de370b6a32fa010dedeeb5344bfe12666157`.
Closed branch: `feat/local-transcription-engine`.

Architecture implemented:

```text
TranscriptionEngineAdapter
→ typed protocol V1
→ closed one-request Python worker
→ faster-whisper
→ strict TranscriptionResult validation
```

Implementation choices:

- faster-whisper 1.2.1;
- private CEVRA CPython 3.12.14 distribution + isolated transcription dependency environment;
- no system-Python fallback in managed/release mode;
- default model `base` / `Systran/faster-whisper-base` as temporary V1 balance, not final EDVID-quality claim;
- languages: auto, pt, en;
- native faster-whisper word timestamps supported and labeled `wordTiming: "model"`;
- closed, versioned typed protocol and fail-closed validation;
- deterministic segment and word IDs;
- deterministic temporal normalization with a maximum 20 ms tolerance only for the backend's declared timestamp precision;
- `pyvenv.cfg` and base-Python provenance validated, including copy-style and symlink-style environments;
- model cache protected from the private Python distribution, transcription environment and externally supplied protected roots;
- health/capability workers do not replace the PID of the active transcription worker;
- real cancellation and process reaping;
- UTF-8-safe response transport across chunk boundaries;
- response parsing only after process streams close;
- response output bounded and counted in bytes;
- one active transcription job per adapter; concurrent work fails deterministically with `TRANSCRIPTION_BUSY`;
- model downloads disabled by default;
- user media remains local and is never uploaded to Hugging Face;
- model assets may be downloaded only when trusted configuration explicitly allows it.

Final validation:

- Node/TypeScript: 155/155 PASS;
- Python: 22/22 PASS;
- total automated: 177/177 PASS;
- build/typecheck: PASS;
- PR CI: PASS;
- post-merge CI: PASS;
- lint: not configured;
- real offline smoke: PASS.

Real smoke evidence:

- model: `Systran/faster-whisper-tiny`;
- revision: `d90ca5fe260221311c53c58e660288d3deb8d356`;
- `allowModelDownload: false` during the transcribe operation;
- `wordTimestamps: true`;
- result: 1 segment, 22 words, detected language `en`, duration 11,000 ms;
- fixture: `faster-whisper/tests/data/jfk.flac`;
- fixture SHA-256: `63a4b1e4c1dc655ac70961ffbf518acd249df237e5a0152faae9a4a836949715`;
- real cancellation/reaping confirmed;
- fixture and model cache remained external scratch artifacts and were not committed.

Not implemented in this V1 scope:

- WhisperX: not implemented;
- forced alignment: not implemented;
- diarization: not implemented;
- transcript-result cache: not implemented;
- Project IR persistence: not implemented;
- multi-source transcript semantics: not implemented;
- batch transcription: not implemented;
- final UI/model manager: not implemented.

Pinned notable dependencies:

- CTranslate2 4.8.2 — MIT;
- PyAV 18.1.0 — BSD-3-Clause;
- huggingface-hub 1.31.0 — Apache-2.0;
- tokenizers 0.23.2 — Apache-2.0;
- ONNX Runtime 1.23.2 — MIT;
- tqdm 4.70.1 — MPL-2.0 AND MIT.

## 15.2 Independent review and release gates

The independent review and functional remediations are complete. It verified managed-Python provenance, model-cache isolation, timestamp normalization, PID isolation, cancellation/reaping, UTF-8 response integrity and `close`-before-parse behavior. These findings are closed within the functional V1 scope.

The following remain explicit release/packaging gates rather than reasons to reopen the functional V1:

1. complete dependency lock with cryptographic hashes and artifact verification;
2. production model-asset identity, revision and hashes;
3. final production runtime assembly;
4. PyAV 18.1.0 built from source against a separate compatible, audited, LGPL-only FFmpeg 8.x inventory;
5. final model manager/updater and model distribution;
6. final per-platform manifests.

The transcription FFmpeg inventory must remain separate from the sealed Media Runtime V1 FFmpeg 9.0.1 bundle.

---

# 16. Transcript persistence and multi-source semantics — IMPLEMENTED / CLOSED

Project IR v2 stores zero or one canonical source-scoped `SourceTranscript` per eligible audio/video source. The public `TranscriptState` remains structurally unchanged as the nested transcript payload and as the Local Transcription Engine V1 result contract.

CEVRA Vids must support multiple source assets.

Therefore the transcription-engine slice intentionally returns `TranscriptionResult` only and does **not** yet add a global `transcript.replace` command.

ADR 0014 is **Accepted** after independent adversarial review and remediation. It defines one source-scoped canonical transcript per eligible audio/video source, with prior versions preserved by ProjectHistory and candidate results kept outside canonical state until promoted.

The central architecture remains unchanged. The accepted refinements require pure deterministic document-local migration, deterministic `transcriptDigest` state identity, digest-bound references and asynchronous promotion, continued public compatibility of `TranscriptState`, closed speaker-coverage semantics, and a typed bounded migration quarantine.

PR #14 merged the bounded implementation proposal at `525add125d040f7d0071c70d09fd2ab392fc0b8b`; the proposal is **CLOSED** and its temporary branch was removed. Slice A merged in PR #15 at `edb98184c144ea1f8b7b834ebd6a427198e5a68f`, is **CLOSED**, and `feat/project-ir-v2-transcript-core` was removed locally and remotely. That merge SHA is the exact `main` base before Slice B.

Implemented and closed in Slice A:

- Project IR schema v2 with explicit v1 types and unchanged public `TranscriptState`;
- source-scoped composed `SourceTranscript` aggregates;
- CEVRA-owned canonical transcript serialization and `sha256-v1` digest using exact `@noble/hashes@2.4.0` only as the SHA-256 primitive;
- frozen historical v1 validation, separate v2 validation and pure deterministic v1→v2 migration;
- raw legacy transcript quarantine for ambiguous or incompatible ownership/content, validated as immutable migration-time evidence rather than reinterpreted against later source changes;
- v2 factory and atomic `source.remove` transcript cascade;
- ProjectHistory and Project Store v1-package/snapshot/cursor/round-trip compatibility without changing package format or `packages/project-store/src/codec.ts`;
- `NOTICE` and `THIRD_PARTY_LICENSES.md` provenance/licensing for the direct MIT dependency.

Slice B merged in PR #16 at `900112f88e85a59ae57541a2f2faf5997ad8f908`, is **CLOSED**, and `feat/project-ir-v2-transcript-commands` was removed locally and remotely. It implements whole-aggregate `transcript.set`, guarded `transcript.remove`, optimistic digest concurrency, final consuming-stage provenance guards, eight stable `ProjectCommandError` codes and transactional `ProjectHistory.commit` ordering that preserves redo and all observable history state after any failed command. The consuming-stage guard rejects an initial consumer without a canonical predecessor and, for an existing transcript, checks `inputTranscriptDigest` only when semantic identity changes; same-digest metadata updates preserve historical predecessor provenance.

Application Transcript Persistence / Orchestration V1 merged in PR #17 at `aaecd62647b49c1090f961a3f872dff0ebc9889c`, is **CLOSED**, and `feat/application-transcript-persistence` was removed locally and remotely. Its provider-neutral application flow is `authorized source → TranscriptionEngineAdapter → validated TranscriptionResult → createSourceTranscript → transcript.set → ProjectHistory`. It adds no transcription execution repository or cache: failed/cancelled candidate generation leaves Project IR unchanged, while promoted provenance retains execution, engine, model and optional source-checksum identity. The application rejects project changes during execution, supports first transcription and guarded retranscription, normalizes no-speech timing to `none`, and maps exact transcript no-op to `TRANSCRIPTION_APP_COMMIT_FAILED` without history mutation.

Boundary hardening preserves raw engine numeric values through canonical `createSourceTranscript` validation (including rejection of negative zero), while application language normalization accepts only the literal runtime strings `auto`, `pt` and `en` without coercion. Defensive cloning remains after canonical validation for the returned outcome. Merge validation passed 207 Node/TypeScript tests, including 48 Application, 40 Project IR and 5 Project Store tests; 22 Python tests passed, including the unchanged Media Runtime V1 and Local Transcription Engine V1 suites.

---

# 16A. CEVRA Vids Desktop Visual V0.1 — IMPLEMENTED / CLOSED

The approved visual/product direction is **Adaptive Hybrid**, with **Editar as
preview-first**, Director CEVRA integrated directly into the workspace,
one-click Workflow Preset access, the canonical layered timeline and a
contextual inspector. The specialized workspaces are Editar, Transcrição,
Composição, Legendas and Áudio. They retain one demo/canonical project context,
selection, playhead and timeline rather than creating workspace-specific
sources of truth.

Desktop UI Shell V0.1 merged in PR #18 at
`6c6d0bd64590daffed962ecf64f84405e39f9606`, is **CLOSED**, and
`feat/desktop-ui-shell-v0-1` was removed locally and remotely. The slice establishes the real
Tauri 2 + React + TypeScript window, reusable visual tokens, PT-BR/EN-US UI,
adaptive presentation workspaces, isolated Project IR-shaped demo projection,
typed `DesktopBackend` presentation boundary and deterministic UI tests.

This slice intentionally does **not** connect the WebView to Node-only engines
or application services. Media ingest, transcript execution, preview rendering,
Director execution, Workflow Preset orchestration, real Change Set application,
timeline mutation and export remain deferred to the next typed desktop-runtime
integration slice. No localhost server, sidecar, broad filesystem, network or
shell capability is approved for the UI shell.

Current active-branch validation preserves the 207-test Node/TypeScript baseline
and adds 20 deterministic desktop shell tests for 227 total; the unchanged 22
Python tests pass. Frontend production build and responsive visual checks at
1440×900 and 1920×1080 pass. `cargo check --locked`, the optimized Tauri build
without installer bundling, and a native-process launch smoke test pass with a
checksum-verified isolated Rust toolchain; the host profile remains unchanged.
The Linux CI job independently compiles the same Tauri shell.

## 16A.1 Desktop Runtime Integration V1 — IMPLEMENTED / CLOSED

Desktop Runtime Integration V1 merged in PR #19 at
`1c6e512e54e49bbec18b8b1afee6f96afc544d7c`, is **CLOSED**, and
`feat/desktop-runtime-integration-v1` was removed locally and remotely.

ADR 0015 records the accepted runtime boundary:

```text
React/WebView
→ narrow typed Tauri application commands
→ Rust Desktop Host Supervisor
→ private persistent Node.js desktop host
→ existing TypeScript Application Services
→ ProjectHistory / Project IR
→ Media / Transcription engines
```

Rust owns native file selection, the fixed private host lifecycle, closed JSONL
IPC, cancellation routing and child-process reaping. The WebView receives no
shell, dialog, generic filesystem, network or sidecar permission. Its Tauri
capability grants only the six explicit generated `desktop_*` application-command
permissions, guarded against drift from registration/build manifest. The Node
host owns the one authoritative in-memory `ProjectHistory` session and composes
the existing media ingest and transcription application services without
duplicating Project IR or engine behavior.

Abnormal lifecycle hardening does not claim process-tree reaping from a direct
Node kill. The transcription worker now treats its private stdin as a parent-life
pipe, and the Media worker uses its existing EOF cancellation/reaping path;
native-process tests prove both descendant chains terminate after abrupt parent
death. Supervisor handshake is fail-closed, startup is single-flight, and at
this milestone host failure was terminal for the memory-only session. Mutating
timeouts reconcile a fresh canonical snapshot after cancellation or permanently
fail the session when settlement cannot be proven.

The slice adds real local ingest when the trusted Media Runtime is available,
optional real local transcription only when an explicit trusted runtime and
already-local model are configured, and host-derived undo/redo. Model download
remains disabled. Project persistence and bounded crash recovery moved to the
subsequently completed ADR 0016 slice. Real preview playback, Director execution, Workflow
Preset execution and mobile remote-control or delegation remain deferred.

V1 packages the pinned private Node runtime and fixed host/worker resources, but
does not yet distribute the Media Runtime bundle, private Python distribution,
transcription environment, or model cache. Release capabilities therefore remain
truthfully unavailable without those fixed trusted resources. The model snapshot
presence check is not an integrity claim; the existing adapter healthcheck remains
authoritative and fail-closed. CI verifies both Node target archives, the exact
Tauri resource/external-binary contract, and bundled worker-path resolution.
Final pre-PR lifecycle hardening moves the transcription parent-liveness watchdog
to raw file-descriptor reads, proves normal real-worker completion and abnormal
parent-death containment, closes command-ACL and mutation-timeout test gaps, and
keeps real empty Composition/Audio workspaces free of presentation fixtures.
Local validation was 266/266 Node/TypeScript tests, 22/22 Python tests, and 22/22
Rust tests.

## 16A.2 Project Persistence V1 — IMPLEMENTED / CLOSED

Project Persistence V1 merged in PR #20 at
`a36c5c56d5b0791cf4732550aac7f6adffed2bfa`. The implementation and
post-merge CI both completed all four expected jobs successfully; post-merge
run: `34980502753`. The feature branch was removed locally and remotely.
ADR 0016 accepts one active-project persistence and recovery boundary owned by
the private Desktop Host. Rust derives the trusted Tauri app-data root; the
WebView receives no path or filesystem privilege. The host serializes its sole
canonical `ProjectHistory` with `@cevra/project-store`, atomically rotates
current and previous-known-good checkpoints, quarantines an invalid current
artifact before recovery, and fails closed when no valid checkpoint exists.
Successful ingest, transcription promotion, undo and redo are reported only
after checkpoint completion. A bounded one-time supervisor restart may restore
durable state after unexpected host process loss; protocol and integrity faults
remain terminal, and interrupted operations are never replayed automatically.
The active root admits one PID/token owner at a time: live or ambiguous owner
contention fails closed, while a demonstrably dead host lock may be reclaimed by
the authorized recovery startup. Storage/I/O unavailability is kept distinct
from proven checkpoint corruption and raw platform errno values are never host
protocol error codes.

Original media is not copied, and source-scoped transcripts remain canonical
Project IR state inside the Project Store package. The runtime performs no
automatic replay of an interrupted mutation. Final validation retained 287/287
Node/TypeScript, 22/22 Python and 22/22 Rust tests. The non-blocking post-V1
backlog remains: F5 supervisor write/termination race; F6 post-rename
false-unsaved possibility; F7 retry after runtime corruption; F8 checkpoint
validation cost proportional to project size; and F9 future Windows filesystem
semantics.

## 16A.3 Local Forced Alignment V1 — IMPLEMENTED / CLOSED

PR #22 merged by normal merge commit at
`45913175b30c42a2758820a2937fe9a0126ab739`; post-merge CI run
`35005561921` passed all five jobs, and `feat/local-forced-alignment-v1` was
removed locally and remotely. ADR 0017 selects a provider-neutral alignment
engine contract and an isolated managed CPython 3.12 CTC environment. The
application prepares a disposable PCM WAV through the existing Media Runtime
`extract-audio` operation, treats the engine output only as an untrusted
candidate, cleans the PCM before canonical promotion, and promotes a complete
aligned source transcript through the existing digest-guarded `transcript.set`
and `ProjectHistory` path.

The behavior baseline is WhisperX v3.8.6 exact commit
`3ccc17b8de34f305300f8a3fd3c9f76ba820c0d0` under BSD-2-Clause. CEVRA adapts
only its forced-alignment trellis/backtracking/word-boundary behavior and does
not install the full WhisperX application, faster-whisper, pyannote,
torchvision or torchcodec in the Alignment Runtime. PT and EN CTC model
snapshots are exact revision/hash pins under Apache-2.0. Model download remains
disabled, weights remain outside Git, and packaged capability remains gated on
future audited runtime/model assembly. No transcript cache, diarization,
Project IR schema change, Media Runtime surface change or Tauri/WebView command
is part of this slice.

Execution is per canonical transcript segment rather than per complete source:
each seek-read PCM window is limited to 30 seconds and 1,024 CTC tokens, unknown
vocabulary characters retain their position through wildcard emissions, and
the prepared model directory is an exact allow-list with every file SHA-256
verified. Alignment is appended as the newest provenance stage without
rewriting existing history, and its `inputTranscriptDigest` stale guard prevents
promotion against a replacement transcript. Alignment V1 additionally requires
monotonic, non-overlapping word and segment output while preserving canonical
IDs, text and mappings.

The real offline EN smoke measured approximately 2.74 seconds worker time and
1.52 GiB peak RSS for a representative 25-second window. Local ML work must
balance useful quality, predictable RAM/CPU, ordinary desktop/notebook
usability, bounded incremental processing and later cache reuse. Resource use
therefore scales with the loaded model plus the active segment window, not the
complete source duration. Full PT-weight smoke remains a packaging/release gate;
safe crash-leftover PCM reclamation and the non-blocking cleanup-retry behavior
(a successful second cleanup attempt still fails that alignment attempt closed)
remain deferred. Transcript Cache V1 is implemented and closed; editorial
transcript/analysis is the next planned step, still gated by the active
coordinated Media Runtime work.

## 16A.4 Transcript Cache V1 — IMPLEMENTED / CLOSED

Work began from canonical `main`
`099a88ceed9a274254d0ffc7e9fd457f7d63d5ae` on
`feat/transcript-cache-v1`. ADR 0018 proposes a derived, disposable local
filesystem cache for normalized transcription and forced-alignment candidates.
Project IR remains the only canonical audiovisual source of truth, and cache
data is excluded from Project Store packages, history and UI state.

Keys use cryptographically verified current local source bytes (streamed
SHA-256 plus byte length), never source URI/path/name/ID, project ID or mtime.
They also require exact provider-neutral engine, worker, model, request,
normalization and runtime-pipeline identity. Unprovable source/model identity
causes a safe cache bypass, never a weak hit. Fresh cacheable execution verifies
source and execution identity again before write/promotion to reject source or
model replacement races.

The trusted native app-cache root is privately passed by Rust to the Desktop
Host. Entries use closed integrity-checked envelopes, atomic writes, opaque
content-addressed names, a 32 MiB entry limit, a 256 MiB global budget and
recognized-entry-only recency pruning. Cache corruption/unavailability/write or
eviction failure degrades to miss/bypass and cannot invalidate Project IR or
block a valid fresh promotion. Cache hits preserve original producer execution
metadata and still traverse current application validation, stale guards and
normal `transcript.set`/`ProjectHistory`; a semantically identical canonical
result creates no revision. No editorial transcript/analysis work has started.

The historical donor at `700bb35a65fe8bf7552ab7621d41455dd463e7f9`
has now been reconciled onto canonical main
`0cf28cf780e9008c29fb45e7e98b3ccb57b64e68`; reconciled code head is
`22a3b6616f0844622048dad5ef1beb8c313badfb`; the preceding remediation code
head is `0b5df56f3db677553825d630eeb4e09ee048bd54`, and the final model-selection
code head is `20d91f556e77b4e9abb71681cb08b5848cd9a7ac`. The donor file hasher was removed
in favor of the shared MR-V01 `SourceContentIdentityPort` and Desktop
`NodeMediaArtifactStore`. Descriptor integrity now applies independently of
cache policy or availability; legacy bypass/no-cache retains zero added source
hashes, while descriptor-bearing fresh execution uses pre/post proof.
PRE/POST source continuity includes the MR-V01 operational stamp to reject
reproduced A→B→A mutation without a third full hash. FasterWhisper identity and
Desktop presence now share the pinned 1.2.1 model map and local selection:
direct root first, then only the exact root-level mapped Hugging Face repository
with resolvable `refs/main`. `turbo` is
`mobiuslabsgmbh/faster-whisper-large-v3-turbo`; hub-only, orphan and synthetic
Systran turbo layouts do not prove availability or identity. Known optional
`undefined` request fields normalize as absent without weakening the closed
request schema. Current ProjectHistory V2 remains canonical and the cache
remains disposable.

Normal PR CI `36186823219`, push CI `36186819057` and Exact Runtime
`36186823479` passed on preceding reviewed head
`52a778b5e7f902cb67f4bfe6074641956f6bc513`; they are historical, not proof of
the later remediation. Preceding remediation code head
`0b5df56f3db677553825d630eeb4e09ee048bd54` passed PR CI `36236680016`
(5/5), push CI `36236678600` (5/5) and managed Exact Runtime `36236680022`.
Final independent review concluded **APPROVE TO UNDRAFT WITH NON-BLOCKING
NOTES**. Approved feature head `005f5e87cf47c9a717cefd374b3dc43de2984466`
merged through PR #24 by normal merge commit
`86c1f88d19f04c1fb919eafed0b9409e2fe726eb`. Post-merge main CI
`36245088430` passed 5/5 and managed Exact Runtime `36245088427` passed on the
merge SHA. Transcript Cache V1 is implemented and closed; at that milestone,
the then-current progress value was **48%**.
See [ADR 0018](adr/0018-transcript-cache-v1.md) and the
[reconciliation evidence](CEVRA_TRANSCRIPT_CACHE_V1_EVIDENCE.md).

---

# 17. Competitive/product research register

This section exists specifically to prevent the videos, products and skills shared in chat from being forgotten when a conversation hits its maximum length.

## 17.1 EDVID — researched baseline

Status: **CANONICAL functional baseline / extensively audited**.

Primary public repo: `fillrochaa/edvid` pinned as described above.

Secondary repo: `fillrochaa/edvid-lt` observed and considered, but not selected as the primary baseline.

## 17.2 BUDOSKILL — clean-room creative capability map

Status: **RESEARCHED AT CATEGORY LEVEL / DO NOT COPY PAID PRIVATE SKILLS**.

Public categories observed:

- Anime Action;
- Brand Story;
- Cartoon;
- 3D CGI;
- Cinematic;
- Comic to Video;
- Fashion Look;
- Fight Scene;
- Food & Beverage;
- Motion Design;
- Music Video;
- Product 360;
- Product Ad;
- Real Estate;
- Seedance Base;
- Social Hook.

Decision: use these public categories/behaviors as a map for original CEVRA playbooks. Full paid/private skill files are not to be copied or redistributed without explicit license.

## 17.3 Auroq / proprietary products

Status: **clean-room behavior reference only** unless licensed.

Useful public behavior may inspire requirements, but proprietary implementation/code/skills are not copied.

## 17.4 2026-09-14 AI-editing demo video

Reference file retained in current work environment:

`ScreenRecording_09-14-2026 10-35-37_1.mp4`

Status: **REFERENCE IDENTIFICATION COMPLETE / TECHNICAL STACK UNVERIFIED**.

Identified and observed facts:

- the profile shown is `@tiagolemosx`, associated with the “Mestres da IA” ecosystem/campaign;
- the material compares results labeled “Fable 5.1” and “GPT 6 Astra”;
- the same type of source material receives different editorial visual treatments;
- composition changes with the meaning of the spoken passage, including expressive text, cards, dates/numbers, presenter windows, varied layouts, explanatory inserts and reframing/composition changes.

CEVRA disposition:

- classification: **BEHAVIOR REFERENCE / CLEAN-ROOM VISUAL BENCHMARK**, not an implementation source;
- retain the behavior as evidence for Creative Intelligence and the `CompositionEngineAdapter` benchmark;
- different editorial brains may produce distinct interpretations of the same material through Project IR and typed edit plans;
- the video does not prove which composition engine or framework produced the result;
- do not attribute Remotion, HyperFrames or another stack without direct evidence;
- there is no evidence that every visual requires generative video; much of the behavior is compatible with editorial planning plus deterministic composition;
- generative assets remain optional when editorially useful.

The exact technical editing/composition stack remains unverified and non-blocking.

## 17.5 Other reference screen recordings shared during the research period

The following files were present in the working context during the 2026-09-12 to 2026-09-14 research window and must be treated as retained research references rather than discarded:

- `ScreenRecording_09-12-2026 18-58-50_1.mp4`
- `ScreenRecording_09-12-2026 19-07-06_1.mp4`
- `ScreenRecording_09-12-2026 21-53-31_1.mp4`
- `ScreenRecording_09-13-2026 12-24-42_1.mp4`
- `ScreenRecording_09-14-2026 10-35-37_1.mp4`

Where exact product/file mapping has not yet been written into the canonical record, **do not guess**. Re-open/analyze the media or recover the associated chat before assigning a product name.

## 17.6 2026-09-19 EDVID usability recording

Reference: `ScreenRecording_09-19-2026 18-54-47_1.mp4`

Status: **CANONICAL usability reference / observed behavior**.

Observed product lesson:

- EDVID presents a direct editing surface where preview, timeline and simple action categories coexist;
- AI interaction and direct visual editing coexist instead of being separate workflows;
- substantial internal complexity is hidden from the default user.

Decision derived from this reference:

- EDVID remains the functional/usability floor, not a visual identity to copy;
- CEVRA Normal must meet or improve this level of directness;
- CEVRA may be substantially more sophisticated internally without becoming more confusing externally;
- the full editing depth remains available through progressive disclosure / Advanced over the same Project IR and timeline.

---

# 18. Public skills / repositories to evaluate

Status: **RESEARCH BACKLOG — candidates, not automatic dependencies**.

The following candidates were identified for investigation as building blocks or references for Creative Intelligence, motion graphics, generative assets and composition:

1. `fillrochaa/edvid` — MIT; baseline already deeply audited.
2. `fillrochaa/edvid-lt` — secondary associated repository; investigate only where it adds distinct useful behavior.
3. `pexoai/pexo-skills` — reported MIT candidate; verify exact revision/license before reuse.
4. `docusphere/claude-skill-motion-graphics` — reported MIT candidate; verify exact revision/license before reuse.
5. Seedance 2 Skill OS / public Seedance skill resources — investigate exact source/license and useful generative-video workflows.
6. HyperFrames skills — investigate public skill surface and composition quality.
7. Remotion Agent Skills / best-practices resources — investigate behavior; commercial Remotion use remains license-review gated.
8. OpenAI image-generation skill/resources — investigate integration patterns for generated image assets.
9. Higgsfield MCP/skills/provider surfaces — investigate as optional generative provider/integration; do not make core Vids dependent on it.

For every candidate, record:

- exact repository/source URL;
- pinned revision/version;
- license;
- commercial redistribution compatibility;
- capabilities worth porting;
- direct reuse vs behavior port vs clean-room implementation;
- whether it belongs in core Vids, an optional provider, or a future Marketplace package.

---

# 19. Marketplace and package direction

## 19.1 CANONICAL

Marketplace belongs to **Orbit**, not to Vids.

Marketplace provides specialization/expansion, not missing fundamentals. Core capabilities needed for the improved EDVID baseline must not be paywalled back to the user through Marketplace.

Conceptual package shape:

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

Future packages should be signed, versioned, capability-limited and publisher-identified. No arbitrary shell/network/filesystem by default.

---

# 20. Mobile direction

Mobile is later and must not delay desktop Vids.

Target principles:

- same Project IR and command vocabulary;
- native/on-device capabilities where practical;
- paired trusted desktop node for heavy processing;
- optional BYOK/provider paths;
- no desktop CPython assumption on iOS.

## 20.1 Approved ChatGPT/cloud/mobile planning — 2026-09-30

The Product Owner approved adding official ChatGPT/cloud/mobile planning to
the roadmap on 2026-09-30. [Issue #55](https://github.com/inlifemedicina/cevra/issues/55)
retains the dated research/evidence and open questions;
[CEVRA_INTEGRATION_DECISIONS.md](CEVRA_INTEGRATION_DECISIONS.md) records the
direction, and [CEVRA_ORGANOGRAMA.md](CEVRA_ORGANOGRAMA.md) owns the sequencing
of INT-CLOUD-01–05. PR #56 is CLOSED / MERGED after independent documentary
approval, by normal merge commit `9728f865dfc035d980a7071f1c6bb0421157e5a9`.
Post-merge CI `36790864159` passed 5/5 on that exact SHA. INT-CLOUD-01–05
are incorporated into planning, not implemented capabilities. Issue #55
remains OPEN; its findings still require revalidation.

INT-CLOUD-01 official eligibility/capability/auth/privacy/quota/deployment
review and INT-CLOUD-02 authorized official transport evaluation belong
within the next real-agent semantic round-trip gate, not in place of it.
The bounded offline Claude PoC is CLOSED; its old experiment remains CLOSED
at 8/8, zero balance. An accepted real semantic round-trip is still NOT
DEMONSTRATED. Any new experiment needs explicit scope, ID and budget approval;
ADR 0030 stays ACCEPTED DIRECTION / IN DEVELOPMENT and complete Semantic
Editorial Analysis remains NOT DELIVERED. No Claude/ChatGPT/Codex route is
commercially approved by this planning.

Identity/entitlement is not an audiovisual runtime. Subscriber inference is
not render, upload, transcription or a cloud runner. Provider capabilities,
terms, eligibility and official mechanisms in issue #55 are dated findings,
not future guarantees, and must be revalidated at experiment and release.
INT-CLOUD-03 is an isolated cloud-skill pilot only after environment, test
media and budget are defined. INT-CLOUD-04 preserves the paired Desktop
companion as the first mobile path after a usable editing vertical; Desktop
remains the initial executor. INT-CLOUD-05 computer-off/cloud/BYOC execution
requires a separate future architecture/privacy/cost/commercialization
decision. No spending, commercial media upload or deployment is authorized.
Director impact is compatible planning only: no new execution authority.
Global tracking progress remains **55%**.

---

# 21. Operational development workflow

## 21.1 CANONICAL — one step at a time

The user prefers sequential execution rather than giant checklists.

Normal flow:

1. assistant defines one coherent implementation slice;
2. user runs Codex Desktop;
3. Codex implements/tests/commits/pushes;
4. user pastes Codex return here;
5. assistant reviews branch/diff/CI;
6. if risk justifies it, assistant explicitly says **CLAUDE AGORA** and supplies a focused independent-review prompt;
7. corrections happen before PR when needed;
8. PR is opened only after review gate;
9. merge uses normal merge commit unless explicitly decided otherwise;
10. branch is deleted local/remote and main synchronized;
11. master context is updated.

Do not repeatedly re-audit closed foundations.

## 21.2 Codex authorization behavior

Prompts may explicitly pre-authorize listed Git/GitHub mutations to reduce conversational interruptions, but prompt text cannot override environment-enforced approval dialogs.

When Codex requires an environment approval, request the minimum approval once and continue through the authorized steps.

## 21.3 Repository hygiene

Repository housekeeping follows **CLEAN + TRACEABLE + MINIMAL + NO DUPLICATE SOURCE OF TRUTH** without encouraging aggressive deletion.

- Keep the tracked tree intentional. Do not commit scratch files, dumps, logs, temporary exports, local caches, generated comparison files, backups or investigation artifacts without an explicit canonical reason.
- Keep heavy research files, videos, screenshots, scratch assets and exports outside the repository unless they are necessary versioned inputs.
- Avoid duplicate documents or artifacts that can become competing sources of truth. Do not retain obsolete tracked files merely “for safety” when Git already preserves their history.
- Before removing a tracked file, verify references, provenance, license/legal obligations, compatibility and architectural or historical value. Accepted ADRs, required provenance, relevant audits, notices/licenses and necessary evidence are not removed merely because they are old.
- When older material has historical value but does not belong in the active tree, evaluate an archive or external storage.
- Remove temporary branches locally and remotely after merge or closeout unless retention has an explicit purpose. A historical branch fully incorporated by a successor is a deletion candidate only after confirming that it contains no useful unique material.
- Do not perform opportunistic destructive cleanup inside an unrelated feature.

PR #12 closeout completed this housekeeping policy: `docs/post-transcription-canon` was removed after merge, and the historical `docs/master-context` branch was removed locally and remotely after a final comparison confirmed that it contained no useful exclusive content. Repository hygiene passed without deleting unrelated refs or evidence.

---

# 22. 30-day execution objective (from 2026-09-14)

The realistic 30-day goal is **not** the entire polished commercial CEVRA Vids 1.0 with Marketplace/mobile/all providers.

The goal is a first genuinely usable AI-first Vids 0.x capable of:

```text
import media
→ transcribe locally
→ understand content
→ select takes / plan cuts
→ execute automatic clean edit
→ build layered editable timeline
→ preview/review/refine
→ captions/basic composition
→ export
```

Approximate execution emphasis discussed:

- Week 1: local transcription, alignment, cache, canonical integration;
- Week 2: editorial intelligence, take selection, cut plan/compiler;
- Week 3: QA, preview, layered timeline, captions;
- Week 4: composition/shortform, audio refinement, AI-first flow integration and end-to-end stabilization.

This schedule is directional, not a promise. Architecture correctness and a working vertical slice take priority over artificial calendar completion.

---

# 23. Roadmap

Compact sequencing reference: `docs/CEVRA_ORGANOGRAMA.md`.

## Track A — CEVRA Vids

```text
Foundation / Media Runtime       [CLOSED]
→ Architecture Canon             [CLOSED]
→ EDVID parity specification     [CLOSED]
→ Local Source Ingest V1         [CLOSED]
→ Local Transcription Engine V1  [CLOSED]
→ Project IR v2 transcripts      [CLOSED]
→ App transcript persistence     [CLOSED]
→ Desktop UI Shell V0.1          [CLOSED]
→ Desktop Runtime Integration V1 [CLOSED]
→ Project Persistence V1         [CLOSED]
→ Local Forced Alignment V1      [CLOSED]
→ decision/document reconciliation [CLOSED]
→ ProjectHistory Scalability V2  [CLOSED]
→ small cross-platform/runtime correctness prerequisites [CLOSED]
→ pre-editorial correctness prerequisites [CLOSED]
→ coordinated Media Runtime adjustment gate [ACTIVE IN PARALLEL: DOWNSTREAM / PLATFORM / EXPORT / RELEASE]
→ Transcript Cache V1 [CLOSED]
→ Editorial Transcript Projection V1 [CLOSED]
→ Semantic Editorial Analysis V1 — Slice A analysis boundary [IMPLEMENTED / CLOSED]
→ bounded offline Claude CLI transport/evidence PoC V1 [IMPLEMENTED / CLOSED — PR #57]
→ real-agent semantic round-trip [NEXT REQUIRED GATE / NOT DEMONSTRATED; OLD EXPERIMENT CLOSED 8/8]
→ strategy / take selection / cut planning [NOT STARTED / NOT AUTHORIZED IMPLICITLY]
→ missing typed Project IR edit commands
→ cut compiler
→ numeric QA
→ UX Surface Contract: Normal / More Controls / Advanced
→ native preview + one shared layered timeline
→ captions
→ composition benchmark
→ shortform/longform composition
→ camera/face/B-roll/music/SFX
→ generative asset providers
→ agent integration / AI-first orchestration
→ Vids 1.0 hardening
```

ADR 0019 and PR #30 closed the measured ProjectHistory failure with exact
per-`SourceTranscript` content-addressed deduplication and compact snapshots.
The history blob digest covers complete stored state and remains explicitly
distinct from the editorial `transcriptDigest`; journal, undo/redo, recovery,
version identity and V1 compatibility are preserved. Transcript Cache remains a
separate disposable derived-data system and is not history storage.

## Track B — Orbit Platform

Package format → identity/licensing → entitlements → Marketplace → recommendations/shared services.

## Track C — Creative Ecosystem

Built-in skills → first-party premium packs → Marketplace → third-party SDK/publisher ecosystem.

## Track D — Expansion

Mobile → additional CEVRA apps → sync/publishing/analytics → broader Orbit.

---

## 23.1 Canonical decision records and technical evidence

Detailed approved product direction lives in dedicated records rather than being copied into this ledger:

- [CEVRA Director decisions](CEVRA_DIRECTOR_DECISIONS.md) — coordination, context, providers, permissions, plan validation, bidirectional impact and early round-trip proof.
- [Editorial decisions](CEVRA_EDITORIAL_DECISIONS.md) — D1–D13: ingest/editorial-start, evidence, takes, meaning, duration, pacing, junctions, strategy, color, audio, QA and version-linked review.
- [Visual decisions](CEVRA_VISUAL_DECISIONS.md) — D14–D18: presets, captions, placement/QA, EDVID styles and post-V1 personalization boundary.
- [Composition decisions](CEVRA_COMPOSITION_DECISIONS.md) — D19–D23: split, supporting media, external assets, B-roll and registered first-party components.
- [Integration decisions](CEVRA_INTEGRATION_DECISIONS.md) — I1–I19, Creation Modes, provider-neutral boundaries, assets, distribution/update/account and Bridge versus Creator Skill.
- [Update Strategy v3](UPDATE_STRATEGY.md) — canonical managed-update authority: controller, component classes/manifests, compatibility, promotion/rollback, distribution, diagnostics and resilience.
- [Product Owner acceptance catalog](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md) — stable behavioral cases, future status and division between automation and human review.
- [Fable adversarial audit](CEVRA_FABLE_AUDIT_REVIEW_2026-09-18.md) and [targeted audit](CEVRA_FABLE_TARGETED_AUDIT_MEDIA_HISTORY_PREVIEW_EXPORT_2026-09-18.md) — technical evidence, blocker wording and approved K1–K5 directions.
- [PR #25/#26 reconciliation inventory](CEVRA_RECONCILIATION_INVENTORY_2026-09.md) — first and final residual audits, including closure criteria for the superseded evidence branches.

Architecture authority remains `ARCHITECTURE_V1.md` and accepted ADRs. The records above do not claim implementation merely because a direction is approved.

### Current cross-cutting decisions

- **Product simplicity:** POWER INSIDE → SIMPLE BY DEFAULT → DIRECT MANUAL CONTROL AVAILABLE → FULL COMPLEXITY WHEN THE USER ASKS. Normal, More Controls and Advanced use the same project, Project IR, timeline, selection/playhead, history and command system.
- **Multi-source:** source-scoped evidence/transcripts support semantic comparison, narrative organization and best-take selection into one final project/timeline; this is approved direction, not completed behavior.
- **Provider boundary:** consumer subscription, official embedded mechanism, coding agent, SDK and API are distinct until verified. No provider-native schema becomes core domain state.
- **Fix-now/defer:** minimize total rework using impact, current bounded risk and future migration/compatibility/test/integration cost; do not justify speculative optimization.
- **Fable K1–K5:** first Windows H.264 candidate `h264_mf`; validated automatic HDR→SDR for SDR targets; V1 render ownership split between Composition visual output and Media Runtime audio/mux; two added composition benchmark criteria; official V1 targets macOS arm64 and Windows x64.

---

# 24. Current repository state

## 24.1 `main`

Verified canonical base after the PR #59 planning closeout:
`847504ada6c6f8b9f6fccbd590008f690152cc0f` (parents
`9728f865dfc035d980a7071f1c6bb0421157e5a9` and
`50c8b1502a9c1c9b86d51a610ca0a3038c0a1321`). PRs #56–#59 remain
incorporated; INT-CLOUD-01–05 are planning only. Post-merge push CI
`36794046368` FAILED in Monorepo: the original POSIX worker-death test
raised uncaught `write EPIPE` in the production Media stdin transport.

**Active correction / independent review pending:**
`fix/media-worker-stdin-channel-failure`, based on that exact main. The
bounded transport patch handles stdin event/write-callback failures together,
preserves earlier abort/timeout, owns cleanup until child close, and isolates
late events before a new request restarts the worker (no operation retry).
Controlled baseline probes reproduce both unhandled stdin error and raw EPIPE
propagation. The independent reviewer's earlier 1/100 finding is reported
evidence, not a local measurement. Local deterministic/real-fixture evidence
and current CI are recorded in the correction PR; this fix is not CLOSED.
Real-agent V2 design/execution is PAUSED for this production blocker. No new
experiment/ledger is created; the old Claude experiment remains CLOSED, 8/8,
zero balance. Director impact: no new authority or command/state contract;
transport-only lifecycle hardening. Progress remains **55%**.

Historical canonical main after PR #56:
`9728f865dfc035d980a7071f1c6bb0421157e5a9`, the baseline for this minimal
documentary closeout. PR #56 is CLOSED / MERGED; its parents are
`be1e0e99fd189a1c976b44ec3a72e66d5fa5608c` and approved planning head
`bbfb56ffece4683f40619185ebc7fb442609458d`. Post-merge push CI
`36790864159` passed 5/5 on the exact merge SHA. Exact Runtime was not
triggered by the docs-only path filters; no execution success is implied.

The preceding canonical main after PR #58 was
`be1e0e99fd189a1c976b44ec3a72e66d5fa5608c`. PR #58 merged the docs-only closeout head
`9da286cf98fe19a14d13fa8409f3042bde6af99c`; post-merge push CI
`36782216081` passed 5/5 on that canonical SHA.

The preceding implementation merge of PR #57 is
`862e33f9e687579059d51269abdb4195b86bbd79`. It incorporated approved head
`79327e8d951e31962af2c5d7915a38abcb0c8a4c` by normal merge commit.
Its first parent is the historical Claude PoC baseline after PR #54,
`a58ca419c2a0db2c416db83d84c432fcae23d830`; its second parent is that
approved feature head. Post-merge push CI `36774947802` passed 5/5 and
Exact Runtime `36774947781` passed on the exact merge SHA.
PRs #57/#58 close only the bounded offline transport/evidence PoC, not real
semantic analysis. PR #56 incorporates planning only; PR #59 closes its
temporal documentary follow-up, not any provider capability.

The older `360bf60d4ed4b0a985c0c254a109fac2d6bc0d64` value remains historical:
it was the canonical main after PR #50 and the feature base for PR #51.

## 24.2 Important merged milestones

| Milestone | PR | Merge SHA | Status |
|---|---:|---|---|
| Media Runtime V1 | #7 | `35a8c81ef83627101d7c97636990c5272856509f` | CLOSED |
| Architecture Canon | #8 | `9387ab3507355bb9c20cd17be7b27754a9059ec0` | CLOSED |
| EDVID parity specification | #9 | `6502afa9092f2be0ebd1d7b259f83dedf3f672d3` | CLOSED |
| Local Source Ingest V1 | #10 | `aa92402cf49cc45f55c961508f66c262a02ce075` | CLOSED |
| Local Transcription Engine V1 | #11 | `d780de370b6a32fa010dedeeb5344bfe12666157` | CLOSED |
| Post-transcription canon / ADR 0013 | #12 | `3098274f8a30a85e4b83e5524fc70664adaa412f` | CLOSED |
| Multi-source transcript semantics / ADR 0014 | #13 | `3be19a4caa7e40d2dbcc878e1f7fdb663247f2e9` | CLOSED |
| Project IR v2 transcript implementation proposal | #14 | `525add125d040f7d0071c70d09fd2ab392fc0b8b` | CLOSED |
| Project IR v2 transcript core — Slice A | #15 | `edb98184c144ea1f8b7b834ebd6a427198e5a68f` | CLOSED |
| Project IR v2 transcript commands — Slice B | #16 | `900112f88e85a59ae57541a2f2faf5997ad8f908` | CLOSED |
| Application Transcript Persistence / Orchestration V1 | #17 | `aaecd62647b49c1090f961a3f872dff0ebc9889c` | CLOSED |
| Desktop UI Shell V0.1 | #18 | `6c6d0bd64590daffed962ecf64f84405e39f9606` | CLOSED |
| Desktop Runtime Integration V1 | #19 | `1c6e512e54e49bbec18b8b1afee6f96afc544d7c` | CLOSED |
| Project Persistence V1 | #20 | `a36c5c56d5b0791cf4732550aac7f6adffed2bfa` | CLOSED |
| Local Forced Alignment V1 | #22 | `45913175b30c42a2758820a2937fe9a0126ab739` | CLOSED |
| ProjectHistory Scalability V2 | #30 | `b6f201afa73aae0aa85f8a3d4187a568ab749e72` | IMPLEMENTED / CLOSED |
| Audio Sequence Runtime V1 | #36 | `a18f19a06b33669c149c58f57bc74f385c0a02f2` | IMPLEMENTED / CLOSED |
| Audio Measurement V1 | #38 | `282d29ec2252f5f488050b3b4efba4ec2cfcfe76` | IMPLEMENTED / CLOSED |
| Application Resolved Audio Plan V1 | #42 | `ff744592e7cf14b40018e3781440fb74b343f7a0` | IMPLEMENTED / CLOSED |
| Durable Media Execution Archive V1 | #44 | `f5518102ace30d54659334d995712b36d0a4f6b7` | IMPLEMENTED / CLOSED |
| Durable Source Technical Descriptor V1 / MR-V01 | #46 | `0c8a09c185d1496faa4783f8b9495cd90dff9a21` | IMPLEMENTED / CLOSED |
| Transcript Cache V1 | #24 | `86c1f88d19f04c1fb919eafed0b9409e2fe726eb` | IMPLEMENTED / CLOSED |
| Native Windows Media Runtime / `h264_mf` feasibility — Slice 5A | #49 | `660f8cd13f11729d5663e1ff373e9eb91a4bffbb` | IMPLEMENTED / CLOSED |
| Editorial Transcript Projection V1 | #51 | `56161b2af44c9e2de008bb33bc1706d4e2beaf7e` | IMPLEMENTED / CLOSED |
| Semantic Editorial Analysis Boundary V1 — Slice A only | #53 | `0cde0d29cfe3f3d417955e20e5ad672b3e02ceba` | IMPLEMENTED / CLOSED |
| Claude CLI transport/evidence PoC V1 — bounded offline scope only | #57 | `862e33f9e687579059d51269abdb4195b86bbd79` | IMPLEMENTED / CLOSED |
| Bounded offline Claude PoC documentary closeout | #58 | `be1e0e99fd189a1c976b44ec3a72e66d5fa5608c` | CLOSED |

## 24.3 Active work

**ProjectHistory Scalability V2 — IMPLEMENTED / CLOSED.** PR #30 merged at
`b6f201afa73aae0aa85f8a3d4187a568ab749e72`. Compact snapshots plus exact
per-source transcript blobs removed the measured O(commits × transcript
payload) failure: the representative package fell from approximately 294.98
MiB to 3.15 MiB and no longer produced the observed `RangeError`. Retained-media
cleanup uses the metadata-only path, and the corrected commit hot path avoids
redundant rematerialization. Project IR schema is unchanged; V1 read → V2 write
compatibility, journal, undo/redo and recovery are preserved.

**Cross-platform/runtime correctness prerequisites — CLOSED.** PR #32 merged by
normal merge commit `13dc11a869fdb103be609a66d312ea49966cc0df`.
Post-merge CI run `35679529464` passed all five required jobs. Platform-aware
runtime path contracts are implemented from pinned runtime metadata, including
the Windows x64 private-root `python.exe` and Windows venv
`Scripts/python.exe` layouts, while preserving private-root confinement,
venv-provenance and isolation controls. The media probe contract now preserves
bounded rotation, pixel-depth, color/HDR and exact average/nominal frame-rate
evidence already emitted by the pinned worker; Project IR remains unchanged.
The render watchdog prerequisite was audited with no production code change:
the existing configurable timeout, liveness, cancellation, settlement,
worker-exit and artifact-cleanup mechanisms satisfy this bounded prerequisite.
Real Windows runtime/export execution remains a later validation gate. Windows
H.264/export, HDR-to-SDR and the coordinated Media Runtime gate are not closed.

**Pre-editorial correctness prerequisites — CLOSED.** Project IR v2
source-scoped transcripts, local transcription, alignment, ProjectHistory
Scalability V2, MR-V01 source-content verification, Transcript Cache V1 and the
bounded audio evidence/execution primitives are implemented. The coordinated
Media Runtime gate remains **ACTIVE IN PARALLEL** for its actual downstream,
platform, export and release consumers: Slice 5B Windows product enablement,
MR-A04 conventional audio policy, residual MR-A05/A06 editable execution,
MR-V02 HDR/export, MR-Q01 assembled-plan QA, K3/K4 Composition/preview and K5
release closure. Those items no longer form a serial prerequisite for deriving
a read-only transcript reasoning projection from canonical Project IR.

**Editorial Transcript Projection V1 — IMPLEMENTED / CLOSED.**
Initial code checkpoint `76c5b1ea1dbbd909b0943a4c0aa0234a5fbb6b67` adds a read-only
Application projection with profile `cevra.editorial-transcript.v1`. It binds
to project ID/revision/snapshot and per-source transcript digests, groups
canonical words at a versioned 500 ms gap or known speaker change, falls back
truthfully to segments/no-speech status, preserves exact source/word/segment
references and emits deterministic UTF-8-bounded pages with stale-safe cursors.
The projection stores no state, creates no ProjectHistory mutation, exposes no
source URI/path/raw transcript JSON and invokes no Media Runtime, provider or
AI. Independent review initially identified two bounded LOWs and the final
review concluded **APPROVE FOR PR WITH NON-BLOCKING NOTES**. Remediation code checkpoint
`ff37555f451f21fadc20b7aff09503915330b0e8` tracks the last known speaker within
a partially attributed phrase, so `A → unknown → B` splits before B while
unknown words remain unattributed. This is a **CEVRA NATIVE IMPROVEMENT** over
the pinned EDVID helper, not a diarization claim. The same remediation replaces
quadratic repeated prefix rendering with exact incremental UTF-8 accounting
and a proven monotonic lower bound while retaining the single canonical
renderer. Local directed evidence is 15/15 and the full Application suite is
184/184;
the generated 5/30/60-minute and 3×30-minute fixtures measured respectively
75/450/900/1,350 phrases, 9,076/58,531/118,948/175,829 rendered UTF-8 bytes,
1/1/2/3 default-size pages and approximately 1.5/8.9/31.2/62.6 ms on the local
host. Practical observed heap growth peaked near 8.1 MiB in that run and is
GC-sensitive; these are characterization figures, not a product benchmark. A
continuous 10,000-word phrase reduced measured UTF-8 sizing input from about
195.9 MB / 929 ms before remediation to about 1.31 MB / 95 ms after remediation
in directed local runs. A separate 40,000-word first-page characterization
completed in approximately 125 ms. Timings are local evidence, not portable CI
thresholds.
Director impact is a **compatible extension**: the projection supplies bounded
evidence, not decisions or execution authority. Approved feature head
`844ceac821cf3feabafc236cad3d15f9375fa38b` merged through PR #51 as normal
merge commit `56161b2af44c9e2de008bb33bc1706d4e2beaf7e`. PR CI `36487114791`
passed 5/5 and naturally triggered Exact Runtime `36487114771` passed; on the
merge SHA, CI `36487922851` passed 5/5 and Exact Runtime `36487922834` passed.
Semantic editorial analysis with a real analyzer, strategy, take selection and
cut planning have not started. A bounded non-blocking performance note remains: an extremely
pathological uninterrupted phrase spanning many tiny pages may re-evaluate its
remaining fragment once per page; no current product fixture reproduces a
blocker. Global weighted roadmap progress at that projection closeout was
**54%**; the current adopted tracking value is **55%**.

**Semantic Editorial Analysis Boundary V1 — Slice A — IMPLEMENTED / CLOSED.**
ADR 0030 records a provider-neutral Application service and specialized
analyzer port. Independent review of head
`05462c442f40414299dc6d7c78a2fce53ad948ff` returned **CHANGES REQUIRED BEFORE
PR**; code/test checkpoint `cc61dc3e205a88a08f2700f6d82ab5cd9d2ba74a`
remediated F-1 through F-6. Focused re-review then concluded **APPROVE WITH
NON-BLOCKING NOTES — ANALYSIS BOUNDARY ONLY** at approved feature head
`0e3d9fa10db076f920d084b6582faf576aa50687`. PR #53 merged that frozen head by
normal merge commit `0cde0d29cfe3f3d417955e20e5ad672b3e02ceba` on
2026-09-29. PR CI `36575808711` passed 5/5 and Exact Runtime `36575808713`
passed; post-merge CI `36576763557` passed 5/5 and Exact Runtime `36576763666`
passed. The service consumes only the
closed Editorial Transcript Projection V1, builds compact context-local source
and fragment aliases, measures the complete UTF-8 JSON payload, and treats the
analyzer response as untrusted. Application validates its closed schema,
context identity, supplied citations/quotes, computed coverage and current
project/revision/snapshot/journal/transcript binding before returning a deeply
immutable in-memory result.
[The boundary evidence record](CEVRA_SEMANTIC_EDITORIAL_ANALYSIS_BOUNDARY_V1_EVIDENCE.md)
separates reviewed-head history, local remediation tests, characterization and
new remote evidence.

The initial context is bounded to 64 KiB; the 256 KiB total caps the sum of
complete UTF-8 envelopes actually delivered, including repeated context and
metadata. Response size is checked by Application before parse, and at most two
invocations are allowed. Initial disclosure is deterministically distributed
across sources when it fits; per-source cursors then support bounded on-demand
collection without exhausting a prior source. Prepared but unsent evidence is
not supplied, collection/budget barriers remain partial `context-limit`, and
`NO_PROGRESS` is reserved for a genuinely non-advancing request. Exact
non-coercive enums and one closed identifier rule protect parser/service
agreement.

One monotonic deadline starts at `analyze()` entry and is checked around
projection, analyzer, parsing, continuation and final acceptance. Cooperative
page yields allow timers/cancellation to run; synchronous JavaScript cannot be
preempted, but late work cannot authorize another call or accepted result. One
additional authorized text-context exchange is supported; visual/acoustic
requests remain explicitly unsupported and invoke no Media Runtime. Ignored
late responses fail closed, and a service instance accepts only one active
execution until any cancellation-ignoring adapter settles. There is no
Project IR/History/Store/cache/archive mutation, provider, transport, model,
download, billing path, retry or analyzer switch.

Scripted analyzer fixtures in tests exercise PT-BR/EN-US canonical transcripts,
multi-source coverage, continuation, invalid references, stale commit→undo,
transcript replacement, cancellation/timeout and prompt-injection containment.
They prove the boundary, not semantic intelligence. Semantic Editorial Analysis
V1 as a product capability remains **NOT DELIVERED**; EDT-001/004/005 and the
relevant D2/D3/D4/D5/I1/I5 acceptance cases are not marked complete. The
**NEXT REQUIRED GATE** is a real round-trip through an officially supported
analyzer, with quality, disclosure, latency, cost and failure evidence. The
response bound begins after a `Promise<string>` reaches Application; a future
adapter must also bound transport receipt. Global weighted roadmap progress is
**55%**.

ADR 0030 remains **ACCEPTED DIRECTION / IN DEVELOPMENT** because complete
Semantic Editorial Analysis V1 is not delivered. The next required gate is an
official and authorized real-agent round-trip; it is **ATTEMPTED / NOT DEMONSTRATED**. Retained
non-blocking notes are the potential dominance of `history.current` or one
projector call at extreme scale, deterministic but not quantitatively balanced
initial disclosure, incidental ID-before-busy/`AbortError` behavior, and the
mandatory future adapter receipt limit before `Promise<string>` materialization.

**Real-agent gate attempts — ACTIVE / BLOCKED BEFORE ACCEPTED RESULT.** The preserved
Codex App Server diagnostic branch
`feat/semantic-codex-roundtrip-poc-v1` at
`788e9c0dd5b3f66a4b531ce70853a82ff5f0cfd1` remains **BLOCKED —
CONTAINMENT**, with zero threads and zero turns. That result is not a reproduced
escape or a universal provider verdict. The next bounded private candidate is
the official Claude Code CLI under
`feat/semantic-claude-roundtrip-poc-v1`. Its first preflight stopped **BLOCKED
— VERSION** before auth, adapter implementation, semantic payload, or model
inference: this macOS host had Claude Desktop 2.16120.0 and an internal
Linux/aarch64 Claude Code payload labelled 2.1.270, but no host-executable
`claude` CLI. That historical executable blocker is now resolved by an
explicitly authorized, version-fixed local installation of official
**Claude Code 2.1.280 / darwin-arm64** in the CEVRA DeveloperTools directory,
outside the repo. Signed-manifest verification (including a negative control),
exact binary hash, native publisher signature, notarization assessment and
native version/help passed. No global install, PATH/profile change, personal
config edit or Gatekeeper bypass occurred. The historical AUTH blocker was
resolved by the user's official subscription login: sanitized status now reports
logged-in Claude.ai / first-party / Pro. Documented controls and local policy
preflight permitted a minimal canary after deterministic adapter tests.
The earlier stage was **BLOCKED — BUILT-IN INIT METADATA / NO PROVEN SESSION DISABLE**.
Canary #1 failed generically on the first `system/init` event (1/8); its exact
field was not retained. After closed, non-content diagnostic tests, exactly one
additional canary with the same controls identified `INIT_PLUGINS_NONEMPTY`:
the event reports two plugins, while tools/MCP/skills are empty and bypass is
false. Both processes were reaped; no final answer was accepted. The shared
ledger is now **2 / 8**, six remaining. No tool execution or escape was
observed, and the plugins' identities/function are not inferred from a count.
Subsequent read-only official plugin inventory from the same CLI/environment
returned zero entries; documented local plugin/skills directories and
`enabledPlugins` entries are absent. With an explicitly authorized refinement,
operator-only capture stopped real attempt #3 at its first init. Both entries
reported virtual `path: builtin` and `source` of the form `<name>@builtin`,
which agrees with the official built-in source label; neither supplied a
filesystem path, separate ID, version, component inventory or required status.
The private identifiers remain outside Git/normal metrics. The apparent
inventory/init mismatch is now attributable to different observed categories,
not to a demonstrated third-party installation. Exact component activation
and this version's loader semantics remain unproven. No documented session-only
disablement for built-ins was established at that checkpoint; the conditional
fourth attempt had not yet run. The ledger then stood at **3/8**. Subsequently,
the Product Owner authorized a restrictive empirical override: the two exact
private `@builtin` source IDs from the existing receipt were set to `false` in
an owned, temporary `--settings` file used only by the child process. The
original containment validator was unchanged. Deterministic Claude tests
passed **38/38** and Application **210/210**. Real corrective canary #4 passed
the unchanged `system/init` gate, but its next assistant event failed
`MODEL_UNAVAILABLE`; no final response was accepted. The child closed, history
and redo were unchanged, and neither the pinned binary nor personal settings
changed. The assistant's exact model-field shape was not retained, so the
failure cannot yet be attributed to a specific alias/ID. The ledger is now
**4/8** at that checkpoint, with **4** remaining; PT-BR, EN-US and real cancellation were not run.
This is not proof of plugin execution, escape, universal isolation or a real
semantic round-trip. The next decision is focused on the assistant-event model
contract; no retry or gate relaxation is authorized by this finding.
Subsequent directed study of the official Agent SDK contracts and pinned public
Python parser showed that `assistant.error` is distinct from
`assistant.message.model`, and `result.subtype=success` may still report
`is_error=true`. A focused reader/test change preserves capability checks,
requires proven Opus generation for semantic success, classifies explicit
provider errors first, and retains only bounded private wire metadata outside
Git. Deterministic PoC tests passed **60/60**, Application **210/210**. Under
the same pinned CLI, Opus/Medium request and restrictive per-process settings,
real canary #5 again passed the unchanged init gate; its `assistant` declared
`authentication_failed` with `<synthetic>` as message model, and its final
`result` reported `is_error=true`, `terminal_reason=api_error`. CEVRA rejected
it as `PROVIDER_AUTH_ERROR`; no Opus response or semantic result was accepted.
The exact cause of #4 remains unproven because its fields were not retained.
Ledger **5/8**, with **3** remaining; PT-BR, EN-US and cancellation are NOT RUN.
The next bounded investigation compared official read-only authentication
status under the login-equivalent and exact child environments. With the same
UID, HOME and config directory, the login-equivalent environment reported
Claude.ai/Pro while the child lacking `USER`/`LOGNAME` reported logged out.
Adding only the effective OS username as those two non-secret variables made
the child status report the same authenticated Claude.ai/Pro profile. This
locates a child-environment status defect; it does **not** prove an Opus request
will be accepted. Code/test checkpoint
`822262bce5f6b332d1dc656208a22b4ab43668c6` also adds closed auth-error
explanation categories without retaining raw error text or relaxing
containment. Local transport tests passed 70/70 and Application 210/210;
push CI `36660806889` passed 5/5 on that checkpoint without real Claude.
The historical private `/tmp` ledger and diagnostic #3 plugin-ID receipt are
no longer available at the exact recorded path or bounded own-prefix temp
locations. No replacement ledger or #6 inference was created: **5/8 remain
historically used**, three nominal slots remain unavailable for safe execution
until the original evidence is recovered or an explicit evidence-control
decision is made. The next gate is this specific private-evidence recovery or
decision, followed by the still-unproved real canary; no model bypass, retry or
editorial matrix run is implied.
Effective effort, real transport success and editorial quality remain
unproven. The adapter/test harness is private infrastructure, not Desktop
integration. No API key, extra usage, fallback or audiovisual mutation was
introduced; remote consumption of the failed attempt is unknown. See
[the Claude attempt evidence](CEVRA_SEMANTIC_CLAUDE_ROUNDTRIP_POC_V1_EVIDENCE.md).

**2026-09-30 continuation:** explicit Product Owner authorization resolved the
*operational* evidence-control impasse without pretending the original five
private receipts were restored. A private persistent checkpoint records those
five as debited and unavailable, with an eight-process ceiling, exclusive
fsynced pre-spawn reservations and no automatic quota reset. Attempt #6
recaptured the two current virtual builtin source IDs only at `system/init`,
then stopped and reaped the child. The same session-only restrictive override
made the normal #7 init pass, but a second `system` event of unknown subtype
triggered the unchanged `CONTAINMENT` gate before any accepted Opus generation
or semantic response. The bounded public diagnostic cannot identify its exact
subtype or declare it harmless, tool use, or an escape. Application left
ProjectHistory/redo intact. **7/8 processes are consumed; #8, EN-US,
continuation and cancellation are NOT RUN.** The next decision concerns the
specific 2.1.280 post-init event contract, not another ledger reconstruction
or automatic model/provider switch. The five old receipts remain historically
recorded but currently unverifiable in raw form. Director I1/I3/I5 impact is
still a compatible feasibility investigation with no new execution authority.
The Claude choice is only the next private proof candidate; it neither replaces
the historical Codex preference nor approves commercial integration. Complete
Semantic Editorial Analysis remains not delivered and global progress remains
**55%**.

**2026-09-30 transport-contract follow-up:** official TypeScript Agent SDK
`v0.3.280` (tag `58d2e4b81bdca2c6ce10e6e5db22ad7acdc1d58c`) declares parity with
Claude Code 2.1.280 and distinguishes block-wise assistant output, final result,
`api_retry`, bounded status and `thinking_tokens` progress. The no-tools reader
now has a closed event policy and bounded private exact-subtype trace; it stops
on retry, rejects tools/hooks/context-changing events and does not promote
operational metadata to analysis. Attempt #8 ran from pre-correction code
`793d634` with the same isolated CLI and synthetic PT-BR Application path:
init passed, but `system/thinking_tokens` was rejected as
`CONTAINMENT / FORBIDDEN_SYSTEM_EVENT` before any assistant/result. The process
closed, history/redo were unchanged, and no semantic output was accepted.
The versioned contract classifies this as approximate progress, so the later
bounded parser correction is offline-tested only; it is **not** a demonstrated
real round-trip. The durable ledger is **8/8 consumed, zero remaining**; #7's
actual subtype remains unknown and five older raw receipts remain unavailable.
Further real execution requires a separate decision, not an automatic ninth
attempt. Slice A remains CLOSED, ADR 0030 remains IN DEVELOPMENT, complete
Semantic Editorial Analysis is NOT DELIVERED and progress remains **55%**.

**2026-09-30 offline F-1–F-5 remediation:** code/test checkpoint
`0fd4fba8e4b0f595c3abfadbb9743aeb7e2de13e` makes the old Claude experiment
terminal independently of local files: recovery/reservation/write setup return
`EXPERIMENT_CLOSED`, and operational harness modes fail before Claude or auth
invocation. Read-only inspection distinguishes file integrity from the closed
8/8 policy, detects orphan/mismatched receipts and never refunds unresolved
reservations. The reader requires explicit empty plugins at normal init,
exact allowed final stop reasons, immediate preservation of a result provider
error through late events/timeout/cancel, and correct unsupported/refusal/MCP
classification for the versioned system event families. PoC tests passed
115/115, semantic Application 26/26, full Application 210/210 and Node/TS build.
All validation is **offline**, using synthetic records/processes; the real
private ledger was unchanged. Independent micro-review subsequently approved
`de0aee79b0ed66b16b5434efad953da855ce0df0` with non-blocking notes. N-1 alone
was corrected offline at `1aa4324d9bcb4e404919d0af17c3b4d072abdbd5`: a
recognized provider error now precedes an oversized tail in the same chunk.
The baseline failed both positive reader/controlled-data regressions; all four
directed tests now pass, as do PoC 119/119, semantic Application 26/26 and the
Node/TS build. Final independent verification at
`ea72f831c29aecc1e4017f6504d6f072a076ebcb` concluded **N-1 VERIFIED — OFFLINE
CLAUDE POC REMEDIATION APPROVED FOR ITS BOUNDED SCOPE**. Branch push CI
`36758958057` passed 5/5 on that exact SHA; this is pre-PR evidence, not CI for
the subsequent documentary closeout. N-2–N-4 remain deferred in the existing
[evidence record](CEVRA_SEMANTIC_CLAUDE_ROUNDTRIP_POC_V1_EVIDENCE.md).
Additional real proof requires explicit authorization of a **new ID, budget
and scope**, not recovery of this terminal experiment. Director impact is a
compatible correction; no product/provider authority changed. There remains
no accepted round-trip, and progress remains **55%**.

**2026-09-30 bounded offline PoC implementation closeout — IMPLEMENTED /
CLOSED.** PR #57 merged the frozen feature head
`79327e8d951e31962af2c5d7915a38abcb0c8a4c` as
`862e33f9e687579059d51269abdb4195b86bbd79`; post-merge CI
`36774947802` passed 5/5 and Exact Runtime `36774947781` passed.
F-1–F-5 retain independent offline approval, N-1 is VERIFIED / FIXED, and
N-2–N-4 remain DEFERRED in the existing evidence record. Closure covers only
bounded offline transport, containment, validation and evidence. The old
experiment remains CLOSED, 8/8, zero balance; five original receipts remain
unavailable and zero real semantic round-trips were accepted. ADR 0030 remains
ACCEPTED DIRECTION / IN DEVELOPMENT; complete analysis is NOT DELIVERED.
The real-agent gate remains required before strategy; strategy/take selection/
cut planning are NOT STARTED and not implicitly authorized. Director impact:
no new authority. Progress remains **55%**.

**Audio Sequence Runtime V1 — IMPLEMENTED / CLOSED.** PR #36 merged by normal
merge commit `a18f19a06b33669c149c58f57bc74f385c0a02f2`. Post-merge normal CI run
`35762551155` passed all five required jobs, and exact managed macOS arm64
runtime run `35762551203` passed the functional catalog on the merge SHA. The
general typed `render-audio-sequence` executor produces explicit-duration,
48 kHz interleaved float32 mono/stereo WAV with independent source/timeline
timing, supplied gain/fades and linear overlap. Runtime identity is `0.2.1`.

This is not a two-video project limitation. One request is bounded to 128
distinct sources and 2,048 items; exact-runtime execution covered 3, 8, 16 and
32 distinct sources, 64 and 256 items, and 2, 4 and 8 simultaneous items. Source
audio coverage fails closed from selected-stream timing evidence rather than
being replaced by the global silence base. Output sample/data counts are
measured from actual RIFF/WAV chunks. Owner-scoped staging, exclusive
publication and Application ownership evidence preserve race-winning or
crash-ambiguous foreign destinations. [ADR 0020](adr/0020-audio-sequence-runtime-v1.md)
records the closed scope and the research lineage at
`4cf2e3d6fd74d8a1111b0d8c6ba9e559170f48ef`.

Resource-sampler no-measurement fail-closed hardening, conservative
negative-start/codec-priming tail behavior and stricter
`WAVE_FORMAT_EXTENSIBLE` GUID validation remain non-blocking LOW/NOTE work.
No current correctness failure is reproduced, dependent work is not blocked,
and later correction needs no Project IR or runtime-semantic migration. The
complete editable J-cut workflow, mastering, Composition, Windows
H.264, HDR and other coordinated Media Runtime slices remain open; the
coordinated Media Runtime adjustment gate is not closed.

**Audio Measurement V1 (MR-A02) — IMPLEMENTED / CLOSED.** PR #38 merged the
independently reviewed feature head `6ca81b3709c703884e4ff4104b52ae5bb9487c2d`
by normal merge commit `282d29ec2252f5f488050b3b4efba4ec2cfcfe76`.
Post-merge normal CI run `35805137771` passed all five required jobs, and exact
managed macOS arm64 runtime run `35805137702` passed the pinned FFmpeg 9.0.1
build, Audio Sequence catalog, measurement characterization and final Audio
Measurement catalog. The delivered read-only typed Media execution path has one
explicitly selected stream/interval, native-rate
RMS/sample peak, eligible loudness, drained true-peak estimate and unrounded
full-scale evidence. No mastering, QA verdict, editorial mutation or cache.
[ADR 0021](adr/0021-audio-measurement-v1.md) records the method/coverage/lifecycle
contract; the [evidence record](CEVRA_AUDIO_MEASUREMENT_V1_EVIDENCE.md) separates
local characterization from exact managed runtime CI. CEVRA worker identity is
0.3.0; third-party pins and Alignment's existing PCM profile remain
unchanged. Director receives compatible evidence, not worker editorial authority.

Initial implementation checkpoint `bca975e6690c14d560a0881d2fbe1dc7548f5692`:
normal CI `35777894595` passed 5/5 and exact managed macOS arm64 run
`35777894541` passed both catalogs. Independent review then reproduced bounded
R128 signal→silence, MPEG-TS seek, Matroska/WebM duration-tag, true-peak excerpt
edge and report-invariant defects. The same feature branch applied the
bounded remediations with no dependency, Project IR, runtime-identity or method-
identity change. Remediation code `45a89c76e3f78bcaf79bbdb06e60d2edbe0fa29f`
passed normal CI `35786488724` 5/5 and exact managed macOS arm64 run
`35786488665`; the latter rebuilt the signed/pinned FFmpeg 9.0.1 runtime once
and passed the preserved Audio Sequence, feasibility and expanded Audio
Measurement catalogs. Final focused re-review then found that a digitally silent
requested core with real neighboring signal could be rejected because its core
silence flag was incorrectly reused while parsing the contextual SWR4 true peak.
The bounded correction separates native sample-silence evidence from continuous
reconstruction evidence; exact/inner Audio Sequence gaps and a non-stationary
MPEG-TS temporal oracle now cover the distinction. Final bounded hardening also
requires per-channel NaN/Infinity evidence from the consumed SWR4 true-peak
center, so non-finite guard context cannot hide behind a finite maximum. Semantic
ADTS/TS codec priming and Matroska/WebM seek granularity remain explicitly
deferred despite internally coherent decoded PTS/counts. The approximately
eight-sample shift independently observed in one 48 kHz fixture is not a bound:
at nominal 1 ms granularity, ±0.5 ms corresponds to ±24 samples at 48 kHz and
±96 at 192 kHz, as scale rather than a guaranteed maximum. Revisit before
sample-exact transient/boundary policy. These limitations remain
**DEFERRED / non-blocking** together with tiny-interval error classification,
periodic WAV/M2TS autodetection, stdout/stderr separation, residual ultra-low
short-term windows, timeout/cancel refinements, relative-gate quantization,
native Windows process-tree validation and complete EBU/ITU certification.

**SUPERSEDED — 2026-09-28 — former permanent progress-prompt rule:** CEVRA Vids
progress toward a fully usable functional version had Product Owner baseline
**48%** and was limited to accepted user-visible capability evidence. This
paragraph is retained as the historical reporting rule; it is no longer the
current progress authority.

**CANONICAL — global weighted progress rule:** CEVRA Vids progress represents
weighted execution of the complete currently planned roadmap, including
architecture, runtime, security, Project IR/history, persistence, tests/gates,
platform, editorial intelligence, UI/preview, composition, integrations,
hardening and release. Weight reflects each block's role in the roadmap. Do not
increase progress for commit count, test count, repetition of already counted
work or correction of an error already included in the estimate. The current
Product Owner value is **55%**. Historical 48% and 54% entries remain valid only as
records of earlier reporting moments.

**Application Resolved Audio Plan V1 (bounded MR-A05/MR-A06 vertical) —
IMPLEMENTED / CLOSED.** PR #42 merged reviewed feature head
`b12304af046f36c86a4ee43aa06f19584cb1d550` by normal merge commit
`ff744592e7cf14b40018e3781440fb74b343f7a0` on 2026-09-23. Post-merge main CI
run `35918380631` passed 5/5 and exact managed macOS arm64 runtime run
`35918380640` passed on that merge SHA. [ADR 0027](adr/0027-application-resolved-audio-plan-v1.md)
defines a reconstructible Application plan compiled from canonical audio tracks,
bound to project revision/snapshot/journal state and resolved through closed
Audio Sequence V1. The bounded `normalization=NONE` vertical accepts a caller-
provided visual result with the same binding, performs an exclusive staged
`mux-audio`, validates duration/packet-copy evidence, promotes only through
`export.add` and cleans only known-owned PCM. Explicit LUFS targets reject rather
than being ignored; Composition, UI, mastering and the full editable J-cut
workflow remain outside this slice.

Durable recovery of the bounded composite sequence → mux → promotion intent is
now provided by the operational archive closed in ADR 0028. This does not claim
full CEVRA product crash recovery or automatic adoption by future workflows.
Runtime identity remains 0.3.1 with protocol and third-party pins unchanged.
Audio Sequence/Measurement, Alignment and `extract-audio` semantics remain
preserved. At that milestone, the then-current progress value was **48%**.

The adversarial remediation on the same feature branch closes the confirmed
pre-review gaps: final state is rechecked after the `committing` archive save
with no suspension before ProjectHistory commit; requests and schemas are
snapshotted/closed; `musicDuckDb` fails closed; plan comparison is structural;
publication cleanup requires POSIX dev/inode identity evidence; and managed
FFprobe proves selected input/output stream durations instead of container
duration. The caller visual remains an assertion, not independent pixel proof.
Pre-remediation runs `35818228308` and `35818228318` apply only to head
`038fdc19bde7fa518a3e5609da1a2bc79ebe797c`. Remediation head
`37036a0f31d0f69547facee97f0aed6a0581918f` passed normal CI run `35889604895`
(5/5) and exact managed runtime run `35889604818`. Final pre-PR micro-remediation
now derives publication identity from owned staging before confirming the linked
destination and snapshots getter-backed requests before validating them. Code
head `ddee31c84caedc52e60d2db1d36c5e4575360792` passed normal CI run
`35907517116` (5/5) and exact managed macOS arm64 runtime run `35907517082`.
Final Pre-PR Adversarial Review concluded **APPROVE FOR PR WITH NON-BLOCKING
NOTES**, with no reproduced BLOCKER, HIGH or MEDIUM finding. This closes only
the bounded vertical; Slice 3 in full and the coordinated Media Runtime gate
remain active. At that milestone, the then-current progress value was **48%**.

**Durable Media Execution Archive V1 — IMPLEMENTED / CLOSED.** PR #44 merged
reviewed feature head `16bf0cb347b9738b9ca84194e67a2cba5056127b`
by normal merge commit `f5518102ace30d54659334d995712b36d0a4f6b7`
on 2026-09-24. Pull-request CI run `36024597615` passed 5/5 and exact managed
macOS arm64 runtime run `36024597609` passed; post-merge main CI run
`36026252042` passed 5/5 and exact managed runtime run `36026251971` passed on
the merge SHA. Independent adversarial review, focused verification of F-1
through F-4 and the N-1 protected-root micro-review concluded **APPROVE FOR PR
WITH NON-BLOCKING NOTES**, with no reproduced BLOCKER, HIGH or MEDIUM finding.

The existing Application execution repository is now a small versioned
operational archive under the trusted Desktop root and the same active-project
writer lease.
[ADR 0028](adr/0028-durable-media-execution-archive-v1.md) records the approved
no-auto-replay architecture: ProjectHistory is restored first; closed/integrity-
checked records and minimal resolved-audio intents are then reconciled; cleanup
requires current publication-identity proof; ambiguity, foreign replacements,
canonical exports and undo/redo-retained media are preserved. Atomic duplicate-ID
creation, serialized fsync+rename writes, bounded corruption quarantine,
checkpoint-aware durable-success finalization and idempotent zero-engine startup
reconciliation are implemented on the feature branch. Focused remediation now
binds every persisted attempt URI to its typed operation, preserves non-exclusive
restart outputs without strong current ownership evidence, requires the exact
applied mux child before promoting a composite intent, treats not-yet-created
children as empty cleanup, and adds deterministic pressure compaction plus a
distinct `MEDIA_EXECUTION_ARCHIVE_FULL` path that does not permanently block
the repository. Classified archive failures degrade Media while a healthy
canonical project remains available. SHA-256 detects accidental corruption but
does not authenticate against an actor able to rewrite the trusted root; URI
text never authorizes deletion. Project IR and Project
Store formats, Tauri/WebView permissions, third-party dependencies and media
runtimes are unchanged. The configured Media Runtime root also remains a
protected Transcription root when archive recovery degrades Media. **Durable
Media Execution Recovery V1 is IMPLEMENTED / CLOSED for this bounded ADR 0028
archive and restart-reconciliation scope only.** Strong Windows publication
identity, removal of the residual POSIX `lstat`→`unlink` interval, hostile-writer
authentication, a complete abrupt process-kill matrix and permanent audit
retention remain unclaimed. Application Resolved Audio Plan V1 remains closed,
but the full Slice 3 editable J-cut product experience and the coordinated Media
Runtime gate remain active. At that milestone, the then-current progress value
was **48%**.

**Durable Source Technical Descriptor V1 / MR-V01 — IMPLEMENTED / CLOSED.**
The Product Owner approved the bounded authority decision in
[ADR 0029](adr/0029-durable-source-technical-descriptor-v1.md): an optional,
own-versioned descriptor extends `SourceAsset` while Project IR, History Archive
and Project Package remain version 2 with no migration. PR #46 merged feature
head `f6df275d0bb30cede04ceaf13223933d4b8e4194` normally as
`0c8a09c185d1496faa4783f8b9495cd90dff9a21`. The closed scope implements
adopted SHA-256/byte-size
identity, supported normalized selected-stream evidence, one bounded streaming
hash coordinated with probe, guarded post-ingest adoption and operation-scoped
verification for the resolved-audio export vertical. Reopen performs no media
read; legacy sources remain valid without a verified-content claim. The
[code checkpoint](../packages/application/src/source-technical-descriptor.ts)
initially landed at `1a24b1b53a52b5f50aede13db40be2c3415c7e45`. Post-review
remediation checkpoints `5f57dcc1ae3fe0da2fed3b2f341cb8d66a1358fa` and
`9cbb1d0a9f3cddcdc3ea525e6d44396fb5fbd748`
refuses unsafe isolated retries of validated mux operations, validates descriptor
adoption inputs before deriving locale/IDs, observes final-chunk cancellation and
re-proves the original Audio Sequence PCM publication before mux consumption and
export promotion. A controlled comparison confirmed that the former P-PCM gap
could promote replacement bytes; the protected path now fails before mux and
preserves the foreign file. The managed-runtime catalog includes real descriptor
acquisition plus positive and changed-source cases. PR CI `36153512241` and PR
Exact Runtime `36153512395` passed on the feature head; post-merge CI
`36161031848` and Exact Runtime `36161031859` passed on the merge commit. The
[evidence record](CEVRA_DURABLE_SOURCE_TECHNICAL_DESCRIPTOR_V1_EVIDENCE.md)
separates data preservation from semantic compatibility and records the
required pre-Cut-Compiler/history scalability gate. Same-inode PCM in-place
mutation, strong Windows publication identity, residual probe/hash TOCTOU and
optimized composite recovery remain explicit bounded limits. At that milestone,
the then-current progress value was **48%**.

**Product-owner technical delegation:** within an explicitly approved slice,
the technical lead may choose and implement the solution with the best total
quality/cost benefit without per-detail ratification. Final audiovisual
correctness, file safety, user time, performance, compatibility, maintenance and
future rework are weighed together; simplicity is preferred when guarantees and
results are equivalent. Concrete evidence may justify revisiting an earlier
choice, while out-of-scope corrections are reported rather than silently added.
New material cost, privacy exposure, destructive behavior or objective/architecture
change still requires explicit treatment. Independent review and merge gates
remain mandatory; this clarification narrows no prior safety policy.

**Transcript Cache V1 — IMPLEMENTED / CLOSED.** PR #24 merged approved feature head `005f5e87cf47c9a717cefd374b3dc43de2984466` by normal merge commit `86c1f88d19f04c1fb919eafed0b9409e2fe726eb`. Historical donor head `700bb35a65fe8bf7552ab7621d41455dd463e7f9`, reconciled checkpoint `22a3b6616f0844622048dad5ef1beb8c313badfb`, preceding remediation code `0b5df56f3db677553825d630eeb4e09ee048bd54` and final model-selection code `20d91f556e77b4e9abb71681cb08b5848cd9a7ac` preserve the reviewed lineage while reusing MR-V01 source identity and current ProjectHistory V2. A valid Alignment HIT performs zero PCM extraction, worker execution or model-weight hashing; fresh execution retains authoritative pre/post-worker verification.

For legacy sources, identity failure may bypass the cache and preserve the
normal engine path. For descriptor-bearing sources, identity failure is a
source-integrity conflict regardless of cache policy or availability.
Alignment Cache V1 is implemented/tested at Application and engine level but
is not a production Desktop-exposed workflow. The first provable
Transcription execution identity in a process may read/hash the complete local
model manifest; its process-local strong detector avoids repeated reads while
filesystem state remains unchanged. Future latency optimization must retain
equally strong executed-model identity.

Historical GitHub Actions run `35625702675`, attempt 2, completed 5/5
SUCCESS on the old donor only. The immediately preceding reviewed head
`52a778b5e7f902cb67f4bfe6074641956f6bc513` passed normal PR CI
`36186823219`, push CI `36186819057` and Exact Runtime `36186823479`;
these are historical rather than current model-selection evidence. Preceding
remediation code head `0b5df56f3db677553825d630eeb4e09ee048bd54` passed PR CI
`36236680016` (5/5), push CI `36236678600` (5/5) and managed Exact Runtime
`36236680022`. Final model-selection code head
`20d91f556e77b4e9abb71681cb08b5848cd9a7ac` passed push CI `36243443422`
(5/5), PR CI `36243446501` (5/5) and managed Exact Runtime `36243446485`.
The final independent micro-review concluded **APPROVE TO UNDRAFT WITH
NON-BLOCKING NOTES**. Post-merge main CI `36245088430` passed 5/5 and managed
Exact Runtime `36245088427` passed on the feature merge SHA.

Current dependency boundaries:

1. pre-editorial correctness prerequisites are **CLOSED**;
2. Editorial Transcript Projection V1 and Semantic Editorial Analysis Boundary
   V1 — Slice A are **IMPLEMENTED / CLOSED**, while
   complete semantic analysis remains **NOT DELIVERED** and the real-agent
   round-trip is the **NEXT REQUIRED GATE / ATTEMPTED, NOT DEMONSTRATED**;
3. the coordinated Media Runtime gate remains **ACTIVE IN PARALLEL** for its
   named downstream/platform/export/release consumers.

### Coordinated Media Runtime residual matrix — reconciled 2026-09-26

This table updates the historical spike against merged code. It is a residual
map, not a new authority and not a claim that the global gate is closed.

| ID | Current state / evidence | Remaining gap and dependent consumer | Acceptance / next action |
|---|---|---|---|
| MR-A01 | **IMPLEMENTED / CLOSED** by Audio Sequence Runtime V1 (ADR 0020). | None for its bounded PCM primitive; broader product flow remains under A05/A06. | Preserve exact-runtime audio catalog. |
| MR-A02 | **IMPLEMENTED / CLOSED** by Audio Measurement V1 (ADR 0021). | Measurement does not approve a treatment/mastering policy. | Use its evidence only in an explicitly approved consumer. |
| MR-A03 | **IMPLEMENTED / CLOSED in the bounded sequence executor**: per-item gain/fades and deterministic placement. | No claim of a universal voice chain. | Preserve executor bounds and continuity tests. |
| MR-A04 | **NOT IMPLEMENTED.** | Approved conventional EQ/compression/de-ess/limiting/denoise subset and listening evidence; future audio-policy consumer. | Delimit after measurement evidence; no default mastering chain. |
| MR-A05 | **PARTIAL:** audio sequence, final mux and resolved plan are implemented; normalization is intentionally `NONE`. | Remaining normalization/treatment choices and full editable J-cut consumer. | Separate typed consumer acceptance from already-closed primitives. |
| MR-A06 | **PARTIAL:** Application orchestration, history promotion and durable recovery exist for the bounded resolved-audio vertical. | End-to-end editable experience, preview/Composition integration and UI. | Build consumers without moving editorial authority into the worker. |
| MR-V01 | **IMPLEMENTED / CLOSED** by ADR 0029 / PR #46. | Source/history scale must be remeasured before many-commit timeline/Cut Compiler flows. | Preserve descriptor authority and critical-consumption verification. |
| MR-V02 | **NOT IMPLEMENTED.** | Approved HDR→SDR dependency/profile, real footage, both targets and human acceptance; export consumer. | Dependency/legal/profile decision before implementation. |
| MR-Q01 | **PARTIAL:** probe, silence and audio-measurement evidence exist. | Bounded assembled-plan QA such as missing black-frame diagnostics and Application severity policy. | Stabilize consumer/report requirements before extending runtime. |
| K1 | **Slice 5A IMPLEMENTED / CLOSED for bounded feasibility evidence; PRODUCT ENABLEMENT NOT STARTED.** PR #49 merged approved head `5a0ca42db757530dbd4b8f6aa8071c74b6c4eee6` as `660f8cd13f11729d5663e1ff373e9eb91a4bffbb` after focused approval. Native run `36442497813` on `c17aea572e91cc1802e73dba5dad03c6b047f0cd` built the signed FFmpeg 9.0.1 candidate with uniquely selected pinned static zlib 1.3.2, schema/integrity-verified the private runtime, enumerated `h264_mf` and passed real horizontal plus vertical 30000/1001 encode/probe/decode/timing fixtures. One sample-offset and one real container-offset negative per case were both rejected by the same PTS-aware detector. Post-merge CI `36456056888` and Exact Runtime `36456056825` passed. Production Windows allow-lists remain empty. | Decide whether 5B typed enablement is the dependency-optimal next implementation versus another coordinated prerequisite. If selected, 5B must cover Windows publication identity/lifecycle, capability smoke, Application/Desktop integration, clean-machine closure and representative hardware. | Binary/runtime feasibility is not Windows export, Desktop or release acceptance; URI/path/mtime alone cannot replace strong publication identity. W5A-L1 configure-log correlation and W5A-L2 broader DLL-name parsing remain bounded non-blocking follow-ups. |
| K2 | **PARTIAL:** K2-T3 durable source evidence is implemented by MR-V01. | K2-T1/T2/T4 HDR→SDR numerical transform, failure policy and human review remain open. | Execute only after MR-V02 dependency/profile approval. |
| K3 | **PARTIAL:** resolved audio/mux ownership and stream-copy evidence exist. | Composition-produced visual output and full preview/export correspondence. | Composition consumer must pass its own typed integration evidence. |
| K4 | **PENDING.** | Composition candidates still need live-preview/shared-path and original-source quality criteria. | ADR 0012 benchmark gate; not part of Windows 5A. |
| K5 | **PARTIAL release gate.** macOS exact runtime paths are evidenced; Windows product export and clean-machine closure are not. | Full core/import/edit/preview/export/HDR/update closure on both promised targets. | 5A informs Windows feasibility; it does not homologate Windows release. |

[Windows H.264 feasibility evidence](CEVRA_WINDOWS_MEDIA_RUNTIME_H264_MF_V1_EVIDENCE.md)
records the exact Slice 5A recipe and result. The coordinated gate remains
**ACTIVE**. These rows distinguish implementation prerequisites, consumer
acceptance and release/platform closure; they do not require the complete
editable product before building its bounded prerequisites.

Slice 5A is **IMPLEMENTED / CLOSED** only for native Windows runtime and
`h264_mf` feasibility evidence. K5 remains **PARTIAL**, Slice 5B remains **NOT
STARTED**, and Windows product support remains unclaimed. Slice 5B and the
remaining coordinated Media Runtime requirements continue under their actual
consumer/platform dependencies in parallel. They do not serially block the
closed Editorial Transcript Projection V1. The provider-neutral Semantic
Editorial Analysis Boundary V1 — Slice A is implemented and closed after PR
#53, remediation of F-1–F-6, focused approval, and green PR/post-merge CI plus
Exact Runtime.
Real-agent semantic analysis remains the next required gate and is not
delivered by scripted fixtures.

---

# 25. Decision Ledger — recent critical decisions

## 2026-09-12 / 2026-09-13

- **CANONICAL:** CEVRA must be AI-first, autonomous and reduce user work.
- **CANONICAL:** EDVID is the functional floor to port/adapt/improve, not a product identity to copy.
- **CANONICAL:** HyperFrames may replace Remotion behavior only with measured parity/superiority.
- **CANONICAL:** entire workflow should be available in CEVRA; assets become editable timeline layers.
- **CANONICAL:** UI may preserve good EDVID usability but must have original sophisticated CEVRA visual identity.
- **CANONICAL:** keep embedded Codex, external Codex+skill and external Claude Code+skill modes; prepare future embedded Claude without assuming unsupported APIs.
- **CANONICAL:** protect proprietary CEVRA IP; permissive third-party reuse requires provenance/license; proprietary skill behavior is clean-room.
- **CANONICAL:** CEVRA Orbit is ecosystem; CEVRA Vids is first independent priority product; Marketplace belongs to Orbit.
- **CANONICAL:** PT-BR default, EN-US parity; SemVer discreet.

## 2026-09-14

- **IMPLEMENTED/CLOSED:** EDVID parity specification merged in PR #9.
- **CANONICAL:** implementation continues as small dependency-aware vertical slices; no big-bang parity rewrite.
- **IMPLEMENTED/CLOSED:** Local Source Ingest V1 merged in PR #10.
- **CANONICAL:** image ingest remains outside Local Source Ingest V1; ambiguous formats fail closed.
- **CANONICAL:** Python is allowed internally only as CEVRA-managed private engine runtime; no user/system Python dependency.
- **CANONICAL:** prefer shared private CPython distribution + isolated per-engine dependencies when safe; separate runtime if required for isolation.
- **IMPLEMENTED/CLOSED:** Local Transcription Engine V1 merged in PR #11 at `d780de370b6a32fa010dedeeb5344bfe12666157`.
- **CANONICAL:** CEVRA uses non-destructive editing and original-source final rendering whenever technically applicable. Preview, proxy and cache paths may optimize responsiveness; final rendering avoids unnecessary generational loss and balances perceptual quality, throughput, file size and target platform. Balanced is the intended default policy, while Maximum Quality and Fast remain reserved future profiles. See ADR 0013.
- **CANONICAL:** development-model selection should optimize problem-solving quality per quota/token cost rather than defaulting to maximum reasoning.
- **CANONICAL:** generative AI assets are desired and part of the CEVRA direction; editorial AI and generative provider are separate roles, generated outputs become editable Project IR assets.
- **RESEARCH:** the 2026-09-14 AI-editing demo was identified at profile/campaign level; its technical stack remains unverified, and its behavior is retained as a clean-room visual benchmark.
- **IMPLEMENTED/CLOSED:** PR #12 merged the post-transcription canon and ADR 0013 at `3098274f8a30a85e4b83e5524fc70664adaa412f`; both temporary documentation branches were removed after comparison and repository hygiene passed.
- **ACCEPTED:** independent adversarial review of ADR 0014 completed without changing its central architecture. Deterministic migration, `transcriptDigest` identity, stale alignment/reference protection, `TranscriptState` compatibility, speaker-state predicates and typed migration quarantine are closed. No Project IR or persistence implementation has started.
- **IMPLEMENTED/CLOSED:** PR #13 merged accepted ADR 0014 at `3be19a4caa7e40d2dbcc878e1f7fdb663247f2e9`; its temporary architecture branch was removed and repository hygiene passed.
- **PROPOSAL FINALIZED / IMPLEMENTATION NOT STARTED:** review preserved the central Project IR v2 design and incorporated two final hardenings: the SHA-256 primitive is an exact pinned audited external dependency while CEVRA retains canonicalization/version authority; and the v1 migration validator freezes historical acceptance while incompatible raw legacy transcript JSON is preserved in quarantine. No implementation code has started.
- **IMPLEMENTED/CLOSED:** PR #14 merged the bounded Project IR v2 transcript implementation proposal at `525add125d040f7d0071c70d09fd2ab392fc0b8b`; `arch/project-ir-v2-transcript-proposal` was removed.
- **IMPLEMENTED/CLOSED:** Project IR v2 transcript core Slice A merged in PR #15 at `edb98184c144ea1f8b7b834ebd6a427198e5a68f`. Schema v2, explicit v1 compatibility, source-scoped transcript digest/validation/migration/quarantine, factory, source-removal cascade and package/history compatibility are implemented. Quarantine evidence remains historical across later source changes. `feat/project-ir-v2-transcript-core` was removed locally and remotely.
- **IMPLEMENTED/CLOSED:** Project IR v2 transcript command Slice B merged in PR #16 at `900112f88e85a59ae57541a2f2faf5997ad8f908`. Whole-aggregate set/remove commands, stable transcript command errors, digest/provenance concurrency guards, consumer-promotion hardening and failure-safe redo preservation are implemented. `feat/project-ir-v2-transcript-commands` was removed locally and remotely.
- **IMPLEMENTED/CLOSED:** Application Transcript Persistence / Orchestration V1 merged in PR #17 at `aaecd62647b49c1090f961a3f872dff0ebc9889c`. The application service authorizes a current Project IR source, invokes `TranscriptionEngineAdapter`, performs non-coercing runtime boundary checks, passes raw transcript values into canonical `createSourceTranscript` validation, and promotes only through guarded `transcript.set` and `ProjectHistory`. Defensive outcome cloning occurs only after canonical validation. No execution repository, cache, UI or engine change was introduced. Merge validation retained 207 Node/TypeScript and 22 Python tests.
- **CANONICAL:** Desktop Visual V0.1 uses Adaptive Hybrid workspaces: Editar is preview-first; Transcrição, Composição, Legendas and Áudio specialize the center workspace while preserving one project, selection, playhead and layered timeline. Director CEVRA is integrated into the editor with Workflow Preset quick access and a reviewable AI Change Set model. The inspector is contextual. The visual language is dark graphite, neutral, compact and restrained with configurable-accent-ready tokens and no glass/neon/SaaS-dashboard trade dress.
- **IMPLEMENTED/CLOSED:** Desktop UI Shell V0.1 merged in PR #18 at `6c6d0bd64590daffed962ecf64f84405e39f9606`. The approved Adaptive Hybrid shell, source-scoped transcript presentation, separated project/workspace selection, truthful demo status and least-privilege Tauri window are implemented; `feat/desktop-ui-shell-v0-1` was removed locally and remotely.
- **IMPLEMENTED/CLOSED:** Desktop Runtime Integration V1 merged in PR #19 at `1c6e512e54e49bbec18b8b1afee6f96afc544d7c`. ADR 0015, the narrow Tauri ACL, supervised private Node host, native ingest, configured local transcription, cancellation and real ProjectHistory undo/redo are closed; the feature branch was removed.
- **IMPLEMENTED/CLOSED:** Project Persistence V1 merged in PR #20 at `a36c5c56d5b0791cf4732550aac7f6adffed2bfa`. ADR 0016 is implemented through trusted app-data ownership, one exclusive live PID/token writer, canonical Project Store current/previous checkpoints, strict I/O-versus-corruption classification, bounded quarantine/fail-closed recovery and one bounded host-process restart without operation replay. Original media is not copied, the WebView privilege boundary is unchanged, post-merge CI run `34980502753` passed 4/4 jobs, and `feat/project-persistence-v1` was removed. Non-blocking findings F5–F9 remain explicit post-V1 backlog.
- **IMPLEMENTED/CLOSED:** Local Forced Alignment V1 merged in PR #22 at `45913175b30c42a2758820a2937fe9a0126ab739`; post-merge CI run `35005561921` passed 5/5 jobs and the feature branch was removed. ADR 0017 adds a provider-neutral `AlignmentEngineAdapter`, isolated per-canonical-segment CTC runtime and application-owned stale-digest promotion through existing `transcript.set`/`ProjectHistory`. Alignment is bounded to 30-second/1,024-token windows, preserves unknown characters through wildcard emissions, appends provenance without rewriting history, verifies a closed exact model-file allow-list and surfaces disposable-audio cleanup failures before promotion. It adapts only forced-alignment behavior from BSD-2-Clause WhisperX v3.8.6 commit `3ccc17b8de34f305300f8a3fd3c9f76ba820c0d0`, pins Apache-2.0 PT/EN model revisions and hashes, keeps downloads disabled, and adds no cache, diarization, Project IR migration, Media Runtime operation or UI/Tauri permission. Runtime/model packaging, full PT-weight smoke, safe crash-leftover temp reclamation and the non-blocking cleanup-retry behavior remain later gates.
- **PROCESS:** this master document was created specifically because the previous ChatGPT conversation reached maximum length; future decisions must be recorded here.

## 2026-09-19 — editing-surface simplification

- **CANONICAL:** Normal is the default CEVRA Vids editing surface and should be approximately as direct/simple as the observed EDVID editor behavior.
- **CANONICAL:** the timeline remains visible and directly editable in Normal; it is not hidden behind an expert-only mode.
- **CANONICAL:** “More Controls” and Advanced use progressive disclosure over the same project, Project IR, timeline, history and typed command system; no duplicate editor state.
- **CANONICAL:** Advanced exposes the full available editing complexity when requested by the user.
- **CANONICAL:** natural-language AI editing and direct timeline manipulation coexist and mutate the same project.
- **CANONICAL:** internal sophistication must not leak into default UX complexity.
- **CANONICAL:** this decision does not require an architecture reset or restart of the dependency roadmap; it adds an explicit UX Surface Contract before Native Preview + Timeline is considered complete.
- **RESEARCH:** `ScreenRecording_09-19-2026 18-54-47_1.mp4` is retained as an EDVID usability reference for this decision.

## 2026-09-21 — decision/governance reconciliation

- **CANONICAL:** PR #25 Director direction is incorporated in the dedicated Director record without its stale branch handoff.
- **CANONICAL:** PR #26 decision families D1–D23 and I1–I19 are reconciled into dedicated editorial, visual, composition and integration records; provider-specific claims remain implementation-time verification gates.
- **CANONICAL:** Bridge Skill supports Vids through the typed Agent Protocol; Creator Skill is a standalone agent-native product surface. Lite/Full share one editorial core, and Creator Full must deliver final output without Desktop.
- **CANONICAL:** the fix-now/defer, execution-feasibility, Product Owner pause, coordinated Media Runtime, acceptance-catalog and Director-impact rules are permanent agent policy in `AGENTS.md`.
- **IMPLEMENTED/CLOSED:** ADR 0019 and PR #30 implement compact ProjectHistory snapshots with exact content-addressed per-source transcript blobs, explicitly not editorial `transcriptDigest` and not Transcript Cache. Merge commit `b6f201afa73aae0aa85f8a3d4187a568ab749e72` preserves Project IR, journal, undo/redo/restore, ADR 0016 recovery and V1 compatibility; post-merge CI run `35668351461` passed 5/5.
- **TECHNICAL DIRECTION:** Fable K1–K5 are retained with their benchmark/license/platform gates; no runtime code or dependency was changed by the reconciliation.
- **CANONICAL:** Update Strategy v3 is the dedicated authority for one Update Controller, component classes/manifests, compatibility negotiation, transactional promotion/rollback, model/component reproducibility, Core Runtime Closure, signed updater/distribution, diagnostics and resilience. It does not implement those systems.
- **IMPLEMENTED/CLOSED:** Transcript Cache V1 merged through PR #24 at `86c1f88d19f04c1fb919eafed0b9409e2fe726eb`. Historical reconciled checkpoint `22a3b6616f0844622048dad5ef1beb8c313badfb` and preceding remediation head `0b5df56f3db677553825d630eeb4e09ee048bd54` are superseded by final model-selection code head `20d91f556e77b4e9abb71681cb08b5848cd9a7ac` and approved feature head `005f5e87cf47c9a717cefd374b3dc43de2984466`; post-merge CI and Exact Runtime passed. Historical run `35625702675` remains donor-only evidence.
- **PROCESS:** PR #25 and PR #26 were retained after PR #27 because Update Strategy v3 remained unique. The final residual reconciliation incorporates that strategy and its update-adjacent distribution/security rules; closure still requires the final post-merge semantic comparison.

## 2026-09-28 — projection remediation and global progress

- **CANONICAL:** CEVRA Vids progress is now the weighted execution of the complete currently planned roadmap, not only user-visible capability acceptance. The current Product Owner value is 55%; 54% remains the immediately preceding historical estimate, and commits, test counts, repeated work and corrections already represented in the estimate do not independently increase it.
- **IMPLEMENTED/CLOSED:** Editorial Transcript Projection V1 merged through PR #51 at `56161b2af44c9e2de008bb33bc1706d4e2beaf7e`. Its approved read-only contract, last-known-speaker remediation and exact incremental UTF-8 fitting passed final independent review plus PR and post-merge CI.
- **IMPLEMENTED / CLOSED — SLICE A ONLY:** Semantic Editorial Analysis Boundary V1 merged through PR #53 at `0cde0d29cfe3f3d417955e20e5ad672b3e02ceba`. Independent review of head `05462c442f40414299dc6d7c78a2fce53ad948ff` required F-1–F-6 changes; code/test checkpoint `cc61dc3e205a88a08f2700f6d82ab5cd9d2ba74a` remediated them, and focused re-review approved feature head `0e3d9fa10db076f920d084b6582faf576aa50687` for the bounded analysis boundary. Scripted test analyzers remain non-functional-AI fixtures; ADR 0030 remains in development, complete Semantic Editorial Analysis is not delivered, and the real-agent round-trip is the next required gate.
- **CEVRA NATIVE IMPROVEMENT:** partial speaker evidence separates different known speakers even when unattributed words occur between them. Unknown words remain unknown, and this is not a diarization claim.

## 2026-09-29 — real-agent gate attempts

- **PRESERVED DIAGNOSTIC:** the Codex App Server PoC remains **BLOCKED — CONTAINMENT** at `788e9c0dd5b3f66a4b531ce70853a82ff5f0cfd1`, with zero threads and zero turns. It is not reclassified as a demonstrated escape or universal impossibility.
- **BOUNDED CANDIDATE DECISION:** official Claude Code CLI is the next private proof candidate under the same provider-neutral Application port. This does not replace the historical Codex preference or approve product/commercial integration.
- **HISTORICAL / RESOLVED — VERSION:** the first preflight found only Claude Desktop and its internal Linux/aarch64 2.1.270 payload. The subsequent explicitly authorized installation verified official macOS arm64 Claude Code 2.1.280 with signed manifest, binary checksum, native publisher signature and notarization. No global configuration was changed.
- **HISTORICAL — BUILT-IN INIT METADATA:** subscription login is verified. Canaries #1/#2 failed the init gate; #2 identified two plugin entries and zero tools/MCP/skills, no bypass. Official installed-plugin inventory was empty. Authorized diagnostic attempt #3 captured only bounded metadata and stopped at its first init: both entries are virtual `builtin` with `<name>@builtin` source identifiers, not paths to personal plugin directories. No components, hooks, instructions or execution were proven. At that checkpoint, no effective session disablement was known and the ledger was **3/8**.
- **HISTORICAL — ASSISTANT MODEL GATE:** an explicitly authorized session-only `--settings` file set the two private built-in IDs to `false`. Corrective canary #4 passed the unchanged init gate but its next assistant event failed `MODEL_UNAVAILABLE`; no final result was accepted. The exact assistant model-field value was not retained, so #4's provider cause remains unproven. The ledger then stood at **4/8**.
- **HISTORICAL — EXPLICIT AUTH ERROR:** the reader now separates `assistant.error` from generated-model evidence, without relaxing containment or model requirements. Canary #5 used the same settings and passed init, then received `authentication_failed` with synthetic message model; final result had `is_error=true` and `terminal_reason=api_error`. No final semantic result was accepted. History/redo, pinned binary and personal settings were unchanged. Ledger **5/8**; PT-BR, EN-US and cancellation were not run.
- **HISTORICAL — CHILD STATUS CORRECTED / PRIVATE EVIDENCE LOST:** official `auth status` was positive under the login-equivalent environment, negative under the former child environment and positive again when the child supplied only OS-derived `USER`/`LOGNAME`; config directory and effective UID matched. At that checkpoint, canary #6 was NOT RUN because the original five-attempt ledger and private plugin-ID receipt were unavailable. This did not prove model auth acceptance.

## 2026-09-30 — authorized experiment recovery

The entry below records the checkpoint before attempt #8; its balance and
"CURRENT" wording apply to that historical moment. The terminal 8/8 state and
offline remediation are recorded in §24.3 and the immediate next action below.

- **CURRENT — 7/8 USED / POST-INIT CONTAINMENT:** the Product Owner authorized a private persistent recovery checkpoint, explicitly debiting the five historical attempts without fabricating their lost receipts. The checkpoint and new pre-spawn reservations are owner-only and survive process restart. Attempt #6 recaptured current private builtin identifiers at the first init and stopped without analysis. PT-BR attempt #7 applied their session-only restrictive override; the original init gate passed, but the next event was `system` with an unretained subtype outside the closed reader contract. The reader failed `CONTAINMENT`, the child closed, and Application accepted no semantic result or mutation. One of eight slots remains; it was not spent on EN-US/continuation/cancellation after the material containment failure. Review the precise post-init event semantics before another authorized process; do not call this tool execution or a proven escape.

---

# 26. Explicitly unresolved decisions

Do not guess these in future chats:

1. final composition engine (HyperFrames vs Remotion vs other) — benchmark pending;
2. **SUPERSEDED / RESOLVED by PR #14:** the finalized bounded Project IR v2 implementation plan merged before Slice A began;
3. **RESOLVED by ADR 0017 and PR #22:** provider-neutral local CTC forced-alignment adapter, PT/EN model pins and stale-digest application integration; packaging/model-manager distribution remains unresolved;
4. **RESOLVED by ADR 0018 and PR #24:** Transcript Cache V1 is implemented and closed after dependency reconciliation, focused review and post-merge evidence;
5. final transcription model default for production quality;
6. production transcription-runtime assembly/update mechanism;
7. production model-asset identity, update and distribution mechanism;
8. exact generative image/video provider set and entitlement strategy;
9. exact technical editing/composition stack behind the 2026-09-14 reference demo — unverified and non-blocking;
10. which public Creative Intelligence skill candidates will be incorporated vs behavior-ported;
11. final embedded Codex/Claude commercial integration mechanisms;
12. final Marketplace package/runtime security model implementation;
13. mobile implementation timing.
14. **RESOLVED by ADR 0019 and PR #30:** ProjectHistory Scalability V2 is implemented and closed;
15. exact Windows fallback if validated `h264_mf` is materially inadequate;
16. exact HDR→SDR dependency/build and quality/performance profile;
17. Preview V1 ADR and final resolved composition-plan boundary;
18. final provider mechanisms, entitlements and commercial terms for every external integration.

---

# 27. Rules for future competitive-product analysis

When the user shows a new video/product:

1. register the source in the Research Register immediately;
2. distinguish observed behavior from inferred architecture;
3. identify product/profile exactly where possible;
4. search official/public docs, repositories, skill files, MCP integrations and license terms;
5. inspect full public repo when implementation reuse is contemplated;
6. compare capabilities against CEVRA architecture and EDVID parity matrix;
7. decide DIRECT REUSE / BEHAVIOR PORT / CEVRA NATIVE / CLEAN-ROOM / NOT APPLICABLE;
8. add useful planned capabilities to this master document before the chat ends.

---

# 28. Immediate next actions

1. Independently review and validate the bounded Media Worker stdin correction on `fix/media-worker-stdin-channel-failure` before resuming real-agent V2 design. PR #59 incorporated the minimal temporal closeout of PR #56; the new main's production EPIPE blocker is recorded in §24.1. INT-CLOUD-01–05 are incorporated into planning only. PRs #57/#58 closed the bounded offline Claude CLI transport/evidence PoC; F-1–F-5 retain independent approval, N-1 is VERIFIED / FIXED and N-2–N-4 remain DEFERRED. **The old ID is CLOSED, 8/8 consumed, zero balance; real semantic round-trip is NOT DEMONSTRATED and remains required before strategy.** INT-CLOUD-01/02 support that next gate through official eligibility review and conditional authorized transport evaluation; they do not replace it or authorize execution. A future real proof requires explicit authorization of a new ID, budget and scope. The five original receipts remain unavailable and attempt #8's historical failure is preserved. Do not loosen capability/model controls or implicitly start strategy/takes/cut planning. INT-CLOUD-03–05 remain future planning under their own prerequisites; progress stays 55%.
2. Keep the coordinated Media Runtime gate active in parallel for Slice 5B, HDR/export, audio policy, assembled-plan QA, Composition/preview and release consumers; do not treat those residual items as a serial blocker for semantic editorial analysis.
3. Preserve Editorial Transcript Projection V1 as the closed bounded evidence boundary; semantic analysis must consume it without making the projection a new canonical authority.
4. Re-run the descriptor/source history scalability gate before accepting timeline/Cut Compiler workflows that create many commits.
5. Preserve the provider-neutral flow, EDVID baseline, one Project IR/timeline and Normal/Advanced progressive disclosure throughout.
6. Keep this ledger and `docs/CEVRA_ORGANOGRAMA.md` synchronized after material decision, merge, blocker transition or completed research finding.

---

# 29. Continuity safeguard

If ChatGPT again reports “maximum conversation length”:

1. open a new chat in the CEVRA project;
2. attach or point to the latest `docs/CEVRA_MASTER_CONTEXT.md`;
3. instruct: “Read this master context in full and continue from CURRENT STATE. Do not reopen closed work.”;
4. provide the latest Codex/Claude return only if it occurred after the last document update;
5. update this document again before the new chat becomes long.

**The project must never rely on a single chat thread as its only memory.**
