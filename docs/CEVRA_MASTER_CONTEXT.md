# CEVRA ORBIT — MASTER CONTEXT & DECISION LEDGER

**Canonical continuity document**
**Initial consolidation:** 2026-09-14
**Last decision reconciliation:** 2026-10-03 UTC, bounded offline Editorial Draft V1 integrated by PR #75 after #74; its smallest offline host/backend/UI consumer is integrated through PR #77 at `73f8427ac18337f779ceeda9c93f60edf35df33b`, with post-merge CI 5/5 and Exact Runtime 1/1. The owner subsequently approved bounded offline admission of the designated existing F-A02 result/history into a temporary native review session; that addition is IN DEVELOPMENT / NOT MERGED (see the offline draft document). Wider strategy/takes/cuts remain outside this slice.  PR #70 diagnostic persistence and PR #72 isolated-attempt preparation are IMPLEMENTED / CLOSED, with exact-head integration and successful post-merge CI. The owner subsequently performed the one authorized F-A02 in a genuine local TTY: FIRST_FA_VALIDATED, one invocation, accepted textual analysis candidate, correlated success receipt and closed child. Direct PT-BR scenario evidence is now demonstrated; citation support is PARTIAL at one observation and the unchanged literal fixture helper passes only its complement check. The whole real-agent gate remains OPEN, complete analysis NOT DELIVERED, strategy/takes/cut planning NOT STARTED, progress 55%. F-A02 is exhausted at 1/1; earlier failed F-A and historical V1 remain preserved and closed to replay.
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
at 8/8, zero balance. The later F-A02 accepted a direct PT-BR textual candidate
for its limited scenario; the whole real-agent gate remains open (§24.1).
Any new experiment needs explicit scope, ID and budget approval;
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
→ real-agent semantic round-trip [F-A02 DIRECT PT-BR OBSERVED; WHOLE GATE OPEN; V1 CLOSED 8/8 / F-A02 EXHAUSTED 1/1]
→ offline evidence-linked editorial draft [APPLICATION #75 / OFFLINE REVIEW #77 INTEGRATED; DESIGNATED F-A02 ADMISSION IN DEVELOPMENT]
→ broader strategy / take selection / cut planning [NOT STARTED / NOT AUTHORIZED IMPLICITLY]
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

**Offline Editorial Draft V1 — APPLICATION AND OFFLINE REVIEW CONSUMER INTEGRATED; DESIGNATED F-A02 ADMISSION IN DEVELOPMENT:**
The owner explicitly approved reusing the saved F-A02 candidate to create a
source-linked editorial proposal offline. `EditorialDraftService` adds a
process-local immutable proposal in Application, retaining all observations,
caveats, relationships, uncertainty and prior review. Users may revise sequence,
titles and notes, with expected-revision and project/transcript/journal staleness
guards; no take selection, cut timing, command, Change Set or export is produced.
The existing private result/history were used in a pure local demonstration:
five blocks, E1/E2 links, both caveats, preserved history/redo and result hash,
zero new analyzer/provider invocations. Citation support stays PARTIAL and the
prior literal helper stays false/true/false/false. Details and limits:
[Offline Editorial Draft V1](CEVRA_OFFLINE_EDITORIAL_DRAFT_V1.md).
Context PR #74 and Application service PR #75 are merged; the service is integrated
at `d8d93b7678e4b74a7b3ce034b60d7e2105b6a361`. The separately approved offline
review consumer is integrated through PR #77 at `73f8427ac18337f779ceeda9c93f60edf35df33b`; its tree
`1166fc3f9979a18171cb6aeb7ee08073bc83748b` equals the reviewed tree. Post-merge push CI
`37127986470` passed 5/5 and Exact Runtime `37127986468` passed 1/1, both attempt 1.
The later approved designated F-A02 admission is in development on `feat/offline-fa02-native-review`. Whole-gate completion and broader strategy/take/cut
implementation remain unclaimed.
Director impact is a compatible Application proposal extension; typed commands,
Project IR, History, provider and engine authority are preserved. Progress 55%.

**First-F-A V2 diagnostic correction — IMPLEMENTED / CLOSED, 2026-10-03:**
PR #70 integrated exact reviewed head `c3b0960b8dd7ea37cd8387151667b60f20201dbb`
by SHA-guarded normal merge `c9d96eb63877cc81230693a827b0d1469dd566b0`.
Its tree `fe11a76875da3926d17a2e905d929ff5b08b63f0` equals the reviewed tree.
Independent review approved; 375 deterministic PoC tests and 31 Application
semantic tests passed. Post-merge push CI `37082549743`, attempt 1, passed
5/5. Exact Runtime/Windows did not trigger under these changed-path filters.
The following previous attempt evidence remains intact:

PR #69 integrated reviewed wiring head
`17e01a8e427a31c9d11864d050e9f640a7ba1a13` by normal merge at
`f80f423e997ddc6728d00016c5ed7b167d3e6d40`. Post-merge push CI
`37071736766` passed 5/5 and Exact Runtime `37071736903` passed 1/1
on that exact merge. A separate local invocation harness rehydrated the
reviewed synthetic inputs and called the integrated entrypoint once, with
genuine owner TTY consent; it duplicated no containment/admission/transport
authority. Its independent review and five negative offline tests passed.

The one separately authorized real first F-A on 2026-10-02 committed
reservation 1 and a correlated failure receipt. Bindings and record digests
are intact, the owned child started and closed, and no semantic result was
accepted. Transport observed one event, 911 stdout bytes, zero stderr bytes
and approximately 1.353 seconds. Application reported
`SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE`; transport reported `CONTAINMENT`.
One event plus the unchanged reader identifies rejection at `system/init`,
but the rejected field/reason was not persisted and is **INDETERMINATE**.
No plugin, skill, authentication or model cause is established. Provider
contact remains `UNKNOWN`; observed model, tokens, remote cancellation and
absence of billing are unproved. Scratch is empty, no lock remains, and the
original inputs, local launcher and real records are preserved. The unique
first-F-A slot is consumed without refund or replay; nominal remaining ledger
capacity grants no new F-A authority.

Branch `fix/first-fa-transport-diagnostics` corrects only the demonstrated
loss of non-content evidence. The transport already keeps a closed reason
and sanitized last-event summary in memory; the operational receipt discarded
them. The correction adds optional strictly validated diagnostic metadata:
closed transport code/reason, event type/subtype, capability presence/type/count
and permission-bypass boolean. Unknown values stay unproven; no raw event,
prompt, secret, private plugin identifier, path or reasoning content is retained.
The same immutable diagnostic reaches the primary error and receipt, without
replacing the Application error. Old receipts remain readable without rewrite;
the historical failure cannot be retrospectively assigned a reason.
Deterministic fake-only regressions cover all init containment reasons,
post-init rejection, primary-error preservation, strict corruption/privacy,
backward compatibility and no refund/replay. The independent review and CI
gates are completed as recorded above. No provider/CLI invocation, new operational
experiment, reservation, retry or fallback is part of this correction.
Containment/admission/model/cost rules and historical V1 remain unchanged.
Director impact is a compatible diagnostic extension, with no change to
Director/IR/History authority or the provider-neutral Application contract.
At this diagnostic-only closeout, no semantic result had been accepted. The
later F-A02 result is recorded below; complete analysis remains **NOT DELIVERED**
and progress **55%**. Any additional real F-A requires a separate Product Owner
decision and exact local TTY consent. Neither correction nor preparation
resurrects the original consumed allocation.

**Isolated candidate 02 preparation — IMPLEMENTED / CLOSED, 2026-10-03:**
[PR #72](https://github.com/inlifemedicina/cevra/pull/72) integrated exact reviewed
head `83c1e1215bfd01183ef9d737e14aca5e99d79521` by SHA-guarded normal merge
`363e70bf1c4f9e21c29df5906b861e4bba664a1c`. Its tree
`9b765458aff10f0a5adb31df153383e8d4287ead` equals the independently approved tree.
391 deterministic PoC tests, 31 Application semantic tests and five instrumented
negative-TTY cases passed offline. Push CI `37084826500` and PR CI
`37084861261` passed 5/5; post-merge push CI `37085879662`, attempt 1, passed
5/5 on the exact merge. Exact Runtime/Windows did not trigger for these paths;
NOT TRIGGERED is not PASS.

The fixed ID `semantic-real-agent-roundtrip-v2-poc-02` has **one operation /
one reservation**, one child invocation, 30000ms total, zero retries and zero
fallbacks. `SECOND_FA_POLICY` is a closed immutable singleton; the original
policy, digests and consumed ledger remain unchanged. Admission initializes a
distinct private root and correlates reservation/receipt. Public inert APIs and
fake seams accept synthetic identities only. The approved Phase A synthetic
text fixture and history remain the inputs. Genuine TTY confirmation of the
immutable scope grants authority; files, digests, arguments and environment
variables do not. See the
[preparation record](CEVRA_FIRST_FA_ISOLATED_ATTEMPT_02_PREPARATION.md), whose
pre-execution wording describes that historical preparation checkpoint.

**F-A02 owner-TTY result — LIMITED DIRECT PT-BR SCENARIO OBSERVED, 2026-10-03:**
After separate owner authorization and manual CONFIRM, the owner reported
`FIRST_FA_VALIDATED`, **one invocation**, `analysis-candidate`, locally saved
result and no automatic retry. Read-only inspection and proportional independent
review confirmed the closed Application parser, response digest, reservation /
receipt correlation, context/history binding, complete E1/E2 coverage and exact
ProjectHistory archive round-trip with redo preserved. Receipt outcome is
`success`, execution mode `OWNED_CLI_ATTEMPT`, requested and observed model
`claude-opus-5-5`, requested effort medium, latency approximately **16.143 s**,
`processStarted:true`, `childClosed:true`, stderr zero and no failure diagnostic.
Effective effort is not separately established. Request/response sizes are
1711/4259 bytes. Reported input/output tokens (2/1738) are observational;
`providerContact` remains `UNKNOWN` in the receipt. These fields are not proof
of full remote token/cost enforcement, a remote hard cap or guaranteed R$0.
No new authentication/account check was performed for this closeout; the earlier
subscription-auth observations below retain their original date and scope.

The useful textual content preserves the next-day-delivery condition of material
availability, the label-for-accompaniment complement, possible E1/E2 repetition
and uncertainty about material for future orders. It does not claim audiovisual
perception, select takes, rank alternatives or propose precise cuts. Source
`timingBasis:none` is not alignment or permission to infer cut boundaries.

Independent documentary rubric review found semantic fidelity, caveat preservation,
complement, possible repetition and appropriate uncertainty **PASS**; citation
support is **PARTIAL**: the label observation says that information is absent
from E1 but cites E2 alone, while the complementary relation cites both sources.
The existing literal fixture helper was run **unchanged** and returned
`condition:false`, `complement:true`, `repetition:false`, `uncertainty:false`.
Equivalent wording does not match its condition/repetition regexes; future-material
uncertainty is in a caveat observation rather than the helper's searched
uncertainties array. This is recorded separately from the documentary semantic
assessment; neither oracle nor candidate was rewritten to obtain a PASS.

Private result, ledger and raw event content remain outside the public repository.
The isolated budget is **1/1 consumed, zero remaining**; watermark 1 and legacy
terminal label `CLOSED_OFFLINE` describe exhausted durable accounting, not denial
that live execution occurred. Scratch is empty and no lock remains. No replay,
refund, additional reservation, provider diagnostic, continuation or automatic
retry is authorized. The earlier failed first-F-A artifacts remain unchanged.

This demonstrates one integrated direct PT-BR textual scenario, **not WHOLE
REAL-AGENT GATE COMPLETE**, complete Semantic Editorial Analysis, I1-T1's plan /
Change Set, editing, preview or export. EN-US, live continuation, cancellation and
timeout were not exercised by F-A02. ADR 0030 remains IN DEVELOPMENT; progress
remains **55%**. Strategy, take selection and cut planning remain NOT STARTED /
NOT AUTHORIZED IMPLICITLY. The next bounded proposal is to reuse this result in
an offline, evidence-linked logical editorial draft under D9, retaining the
condition, complement and uncertainty and leaving take choice unresolved;
implementation requires its own scope decision and timing-backed cuts their
existing prerequisites. No new feature or live work is authorized by this record.
Director impact is a compatible evidence closeout: no change to Director,
provider-neutral Application, typed-command, Project IR or History authority.

**Historical first-F-A V2 end-to-end wiring review checkpoint, 2026-10-02:** PR #68
integrated the reviewed offline preparation at
`46b62d37461bb039a64264ae1c29284a1dd8ea91`; post-merge push CI
`37052463808` passed 5/5 and Exact Runtime `37052463706` passed 1/1
on that exact merge. Branch `feat/semantic-v2-first-fa-admission` adds
the private `runPrivateFirstFa` composition: immutable request/history/runtime
binding → local per-run TTY consent → ephemeral issuer → one-shot capability →
gated ledger init/open → committed reservation → closed transport/Application →
correlated receipt. Authorization is not candidate recognition,
ledger/anchor existence or a persisted record. The capability is consumed before
I/O; F-A uses one durable operation key, one slot/invocation and the entry-to-final
30s deadline, without retry/fallback or refund. All persistence uses explicit
synthetic fixture IDs/roots in this validation. The session issuer, operational
facade and owned closed-spawn binder are implemented but NOT executed live;
default/missing/denied/non-TTY consent fails before ledger mutation/contact.
The public inert ledger API still rejects real IDs; its core/anchor/lock/fsync
and four-operation ceiling are reused, not duplicated. Receipt digests and
observed process/usage metadata are accounting, never permission or proof of
final acceptance after deadline. The prior binding-only approval at `46ed082`
does not cover this new PR #69 delta: focused independent re-review is pending.
The end-to-end review of `fd7f168` required B-1: synchronous binding work
could expose cancellation/deadline expiry before spawn without a post-work
check. The same branch adds that check and two zero-spawn regressions while
retaining the committed slot/receipt; independent verification is still pending.
The existing [acceptance catalog](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md), §F,
now sequences essential future app flows without changing A–E IDs/expectations
or claiming functional execution/approval from CI/fake evidence.
Real ID activation, reservation and inference remain NOT RUN / NOT AUTHORIZED;
future execution still requires explicit human approval of one exact F-A scope,
fixture digests and validated explicit root/runtime inputs (canonical private
ledger root, pinned binary, correct home, owned scratch parent, and the private
plugin-override receipt with the exact two observed IDs). None of these external
inputs was read/activated with a real candidate in this offline validation.
The local consent message preserves PT-BR/EN-US. No persisted grant,
account service, default path, implicit preflight, replay or new live quota.
Remote 32k/4k hard enforcement, exact HTTP contacts, absolute R$0 and immediate
server cancellation remain unproved. No Director/IR/History authority changes;
historical V1 stays CLOSED / 8/8 / zero, real semantic round-trip stays
NOT DEMONSTRATED, complete analysis NOT DELIVERED and progress **55%**.

**Historical first-F-A V2 preparation checkpoint — 2026-10-02:** based on
`66fea7db04590a7d013fe63fb8cd66bc57287c80`, the Product Owner approved
**LOCAL CONTAINMENT FOR PREPARATION OF FIRST F-A; LIVE CONSUMPTION NOT
AUTHORIZED**. Branch `feat/semantic-v2-first-fa-preparation` prepares one
invocation, one total 30,000 ms deadline and zero CEVRA retry/fallback.
The 64/256/64 KiB budgets respectively bound the first Application envelope,
cumulative Application envelopes and final response; JSONL/stdout/stderr have
separate bounds. Remote 32k input / 4k output hard enforcement remains
**NOT DEMONSTRATED**; local controls are not equivalent and do not prove HTTP
counts, absolute R$0 or immediate server cancellation. Exact requested
`claude-opus-5-5` / Medium is grounded in official model documentation and
read-only help from pinned CLI 2.1.280, not generation or entitlement proof.
Synthetic ledger regressions and the new fake-only Application integration
preserve reservation-before-callback and no refund. Candidate ID recognition
does not initialize persistence or grant authority:
`LIVE_AUTHORIZATION_PRIMITIVE_MISSING`; activation, real reservations and
inference remain absent. Review was pending at this checkpoint; subsequent
independent approval and integration are recorded above. No account metadata is
published by this preparation. Historical V1 remains CLOSED / 8/8 / zero;
real semantic round-trip remains NOT DEMONSTRATED and progress stays **55%**.

**Historical Phase A checkpoint on main — 2026-10-01:**
PR #62 merged as `9c6d9b8484d1c1e1be6f19c080baf22a42c9fc7f`; its parents
are `aea53160b8f5af5124e461b0bcb44d60987454f3` and
`b5780170a03306c69baf0e02f1803a24381af43d`. Post-merge push CI
`36884965482` is COMPLETED / SUCCESS, 5/5, attempt 1 on that SHA.
Exact Runtime was NOT TRIGGERED by the documentary path filter, not PASS.
**Real-Agent Round-trip V2 Phase A offline preparation: CLOSED.** The
[documentary specification](CEVRA_SEMANTIC_REAL_AGENT_ROUNDTRIP_V2_PHASE_A.md)
retains the final independent approval and B-1/B-2 VERIFIED FIXED. Temporal
NB-1 is reconciled; NB-2 ledger correlation/implementation and NB-3 executable
F-B materialization remain Phase B prerequisites. At that 2026-10-01 checkpoint,
live V2 was PAUSED / NOT AUTHORIZED, real semantic round-trip NOT DEMONSTRATED
and the proposed ID/ledger inert/not created. Later F-A02 evidence is in §24.1.
This SHA is a dated material checkpoint:
later documentary continuity commits may naturally advance `main` without
changing the recorded functional state.

Historical canonical main after PR #61:
`aea53160b8f5af5124e461b0bcb44d60987454f3`. PR #61 is CLOSED / MERGED;
its parents are `9fa9101ffe1c43431b2701a0c8243b586f1f283e` and
`38cdebf4d1603bb030a053dc4a5e899f3dff0a4e`. Post-merge push CI
`36854827180` is SUCCESS 5/5 on this exact SHA. Exact Runtime was NOT TRIGGERED
by the documentary path filter. The minimal PR #60 documentary closeout is closed.

Historical canonical main after PR #60:
`9fa9101ffe1c43431b2701a0c8243b586f1f283e`. PR #60 is CLOSED / MERGED;
its normal merge parents are the preceding main
`847504ada6c6f8b9f6fccbd590008f690152cc0f` and approved feature head
`7ca73afc2d9d5f0c2ab2ae1e33c8e431de215f96`. Post-merge push CI
`36847059964` passed 5/5 and Audio Sequence Exact Runtime `36847059943`
passed on that exact merge SHA, without rerun. The Media Worker stdin/lifecycle
fix is **IMPLEMENTED / CLOSED** after independent patch and NB-1 delta approval
and green post-merge validation.

Historical baseline after the PR #59 planning closeout:
`847504ada6c6f8b9f6fccbd590008f690152cc0f` (parents
`9728f865dfc035d980a7071f1c6bb0421157e5a9` and
`50c8b1502a9c1c9b86d51a610ca0a3038c0a1321`). PRs #56–#59 remain
incorporated; INT-CLOUD-01–05 are planning only. Post-merge push CI
`36794046368` FAILED in Monorepo: the original POSIX worker-death test
raised uncaught `write EPIPE` in the production Media stdin transport.

**Closed correction — PR #60:**
`fix/media-worker-stdin-channel-failure` was based on that historical main. The
bounded transport patch handles stdin event/write-callback failures together,
preserves earlier abort/timeout, owns cleanup until child close, and isolates
late events before a new request restarts the worker (no operation retry).
Controlled baseline probes reproduce both unhandled stdin error and raw EPIPE
propagation. The independent reviewer's earlier 1/100 finding is reported
evidence, not a local measurement. Local deterministic/real-fixture evidence
and review/CI evidence remain recorded in PR #60. The approved NB-1 delta
preserves late-close recovery, blocks restart until real close, and does not
replay failed operations.

NB-A, NB-2, NB-4 and NB-5 remain **DEFERRED / NON-BLOCKING**: respectively,
the remaining 100 ms test margin, ECONNRESET classification without evidence,
the pre-existing PersistentMediaWorkerClient microtask window, and stress
health latency/timeout without a proven root cause. NB-B was resolved earlier
in PR metadata only. Ubuntu/Linux is validated by CI; macOS arm64 has local
evidence plus Exact Runtime. **Windows native: NOT RUN** for this correction;
V1 targets remain macOS arm64 and Windows x64.

At that Media Worker closeout, real-agent V2 live execution was **PAUSED /
NOT AUTHORIZED** and a real semantic round-trip was NOT DEMONSTRATED. The later
limited F-A02 result is recorded at the start of §24.1. The production blocker
was closed without creating a new experiment/ledger; the old Claude experiment
remains CLOSED, 8/8, zero balance. Director impact: no new authority or command/state contract;
compatible Media Runtime lifecycle hardening, with no change to Project IR,
ProjectHistory, typed commands, Director authority, provider architecture or
the semantic analysis boundary. Approved Vids/mobile functionality, including
I15 / INT-CLOUD-04, is preserved. Progress remains **55%**.

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
| Real-Agent Round-trip V2 — Phase A offline preparation | #62 | `9c6d9b8484d1c1e1be6f19c080baf22a42c9fc7f` | CLOSED |
| First-F-A V2 diagnostic persistence | #70 | `c9d96eb63877cc81230693a827b0d1469dd566b0` | IMPLEMENTED / CLOSED |
| Isolated first-F-A candidate 02 offline preparation | #72 | `363e70bf1c4f9e21c29df5906b861e4bba664a1c` | IMPLEMENTED / CLOSED; later owner-run F-A02 limited result in §24.1 |

## 24.3 Active work

**Current semantic checkpoint:** F-A02's integrated direct PT-BR textual result
is observed; citation support is PARTIAL and the literal helper remains unchanged.
The whole real-agent gate remains open; the accepted result does not authorize
strategy, take selection or cut planning. Current evidence, exhausted budget and
PR #70/#72 integration are in §24.1. The dated checkpoints below preserve their
original evidence and are superseded only where §24.1 explicitly records later
facts; their historical NOT DEMONSTRATED wording is not the current F-A02 status.

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
At that projection closeout, real-analyzer analysis, strategy, take selection and
cut planning had not started. A bounded non-blocking performance note remains: an extremely
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
relevant D2/D3/D4/D5/I1/I5 acceptance cases are not marked complete. At Slice A
closeout, the **NEXT REQUIRED GATE** was a real round-trip through an officially
supported analyzer, with quality, disclosure, latency, cost and failure evidence.
The later limited F-A02 scenario is recorded in §24.1; the whole gate remains open. The
response bound begins after a `Promise<string>` reaches Application; a future
adapter must also bound transport receipt. Global weighted roadmap progress is
**55%**.

ADR 0030 remains **ACCEPTED DIRECTION / IN DEVELOPMENT** because complete
Semantic Editorial Analysis V1 is not delivered. At that Slice A checkpoint,
the real-agent round-trip was **ATTEMPTED / NOT DEMONSTRATED**. F-A02 later
accepted one limited direct PT-BR candidate (§24.1), without completing the
whole gate. Retained
non-blocking notes are the potential dominance of `history.current` or one
projector call at extreme scale, deterministic but not quantitatively balanced
initial disclosure, incidental ID-before-busy/`AbortError` behavior, and the
mandatory future adapter receipt limit before `Promise<string>` materialization.

**Historical real-agent gate attempts — BLOCKED BEFORE ACCEPTED RESULT AT THAT CHECKPOINT.** The preserved
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
   complete semantic analysis remains **NOT DELIVERED**; F-A02 demonstrates
   one direct PT-BR textual scenario, with PARTIAL citation support, while the
   **WHOLE REAL-AGENT GATE REMAINS OPEN** (§24.1);
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

## 2026-10-03 — F-A02 integrated result and public continuity

- **IMPLEMENTED / CLOSED:** PR #70 diagnostic persistence and PR #72 isolated
  preparation merged with independently approved trees and green post-merge CI.
- **OBSERVED LIMITED RESULT:** the owner performed one authorized F-A02;
  Application accepted a direct PT-BR textual candidate. Semantic content is
  useful, citation support PARTIAL, and the literal fixture helper remains
  unchanged with only its complement check true. Full evidence and limits: §24.1.
- **PRESERVED AUTHORITY:** F-A02 is exhausted 1/1; previous failure and V1 8/8
  remain preserved. Whole-gate completion, analysis delivery, strategy, take
  selection and cuts are not inferred. No additional provider run is authorized.
- **PUBLIC DISCLOSURE AUTHORIZED:** the owner explicitly authorized publication
  of the technical test/model/provider/subscription-auth history in these two
  canonical documents on 2026-10-03. Credentials, tokens, private component or
  session identifiers, local paths and raw private artifacts are excluded from
  this update. This publication decision does not grant provider or merge authority.

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

**Approved UI decision and completed investigation — 2026-10-07:** the Owner
approved Enter/blur confirmation of valid selected-clip IN/OUT at 00:22:58 UTC,
Escape cancellation, one Undo and no duplicate Enter-plus-blur commit. This
supersedes the earlier Apply-only pending decision; append/insert and legacy
timing-policy conversion still have explicit confirmation. Approved existing
function shortcuts and a complete field/surface audit are prepared separately
on `feat/vids-usability-keyboard-audit`, based on `2382dae` / Draft #89. Code
checkpoint `10a66830e56a31e17a22ed6ad10efc7f5814f9fe` passed Desktop build,
Desktop183/183 and i18n2/2 offline. The central catalogue uses guarded existing
handlers, preserves text/IME/modal/system ownership and keeps browser shortcuts.
The independent audit's P1 transient editorial-text loss and fabricated
production composition/audio fixtures are corrected; P2 property/availability,
tabs/labels/thumbnail retry and timeline resize gaps are covered. Exact-head CI
and proportional independent review remain required; no new human package is
installed/opened or claimed accepted.

The measured 6.85–8.05-s whole-program edit wait does not meet the Owner request.
Two external synthetic-worker proofs reuse validated segments and preserve all
decoded video-frame hashes and PCM bytes versus uncached references. A bounded
in-memory proof measured reorder1.249s, one-frame trim1.753s and delete1.016s,
versus uncached reorder6.755s/trim6.629s; it excludes Host/IPC/PNG/UI and does not
prove instantaneous response, production RSS admission or perceptual acceptance.
The concrete proposal is a worker-local 32-MiB/64-entry LRU of immutable segment
bytes/grid receipts, with full-program/fresh-origin validation and existing
resource reservations, in a separate technical delta. **Proposal approval is
pending; no production cache/pipeline change is implemented.** Alternatives,
costs, risks, estimates, proof hashes and the 33-row field inventory are in the
[canonical audit/proposal](CEVRA_VIDS_USABILITY_AUDIT.md). Issue #88 and the
existing grouped I4-T1/X-T1/T7/X-T6 acceptance record remain authoritative;
native perception, picker, minimum-layout and human close/reopen are pending.
Director impact compatible on the same typed commands/IR/History, no provider
execution; progress55%, F-A02 exhausted1/1 and full G1 unaccepted remain recorded.

Historical / SUPERSEDED approach — the independent #90 review then required one P2 focus correction: leaving dirty
IN/OUT for Append/Insert or another button sent an implicit trim and disabled the
intended button before click. Code `3e4397d64a80fdc1687f0e42d10106a7c3f5f741`
preserves the explicit action at the visible snapshot, with no preceding queued
trim. Append/Insert use the range draft; other controls keep canonical selection
semantics. Normal valid blur, Enter dedup and Escape cancellation remain covered.
Real focused-input/user.click regressions were red for seven cases at the former
head; the corrected source passes UI194/194, i18n2/2 and build offline, including
null-relatedTarget pointer intent with no mutation until click. Exact new-head
CI/re-review are required; earlier 10/10 CI applies to `8bd9463`, not this delta.
The incremental-cache proposal remains unapproved and unimplemented.

The first `ba90d4d` CI exposed a legacy Enter/blur Undo-test synchronization race:
History changed before the UI released its pending guard. Both tests now use real
focus/click and await enabled Undo while retaining exact restoration/count checks.
Build/UI194 pass again; no further production change. Failed CI logs are preserved
and fresh exact-head CI remains mandatory, rather than relabeling the failed runs.

**Current P2 re-evaluation correction — 2026-10-07:** review of `5f9266c`
confirmed that generic button priority discarded a dirty range on selection or
duplicate, and Tab focus was mistaken for activation. Code `ba8d5a6b7b5a71d2eb90f76249e88e19117a1b6a`
supersedes that approach with an explicit draft state (clean/editing/committing/
failed) and one settlement Promise shared by Enter, every valid blur and the App's
next captured intent. The old owner/value stays visible until settlement succeeds;
selection/duplicate/append/insert proceeds only against the actual returned IR/head.
Failure retains the draft and stops the next action; no automatic replay. Focus and
pointer press are not activation. A pending trim leaves action buttons available
for the first captured intent, then normal guards block repeated mutation. The
established ability to select Original while a submitted action completes remains.

OUT30→29 then Duplicate produces trim + duplicate OUT29; Append/Insert produce trim
+ creation with that range; selection confirms the old clip before showing OUT60.
Each typed mutation has its own Journal/Undo: action Undo preserves the trim, a
second Undo restores OUT30. Undo after blur first reverses the confirmed trim.
Esc cancels; Original/other-source ranges keep explicit creation. This restores the
approved Enter/blur contract without a new product decision or IR/engine change.
Desktop build/UI207/207, i18n2/2, diff check PASS. Thirteen new full App/backend/
Application/History regressions cover pointer, focus-only Tab, Enter/Space/Cmd+D,
selection, next actions, failure/retry and exact restoration; nine were RED at the
prior head before implementation. **Exact new-head CI and re-review PENDING**;
5f9266c's 10/10 CI is historical. Draft #90 only, #89 and native packages preserved;
no native GUI/user media/Take/device/provider operation. Cache still unapproved and
unimplemented. [Canonical evidence/contract](CEVRA_VIDS_USABILITY_AUDIT.md).
Director compatible; progress55%, F-A02 exhausted1/1, full G1 unaccepted and the
single grouped acceptance catalog remain unchanged.

**Earlier follow-up — 2026-10-07:** coordination supplied independent APPROVE
for `abf862f` and its exact-head CI passed 11/11. Representative Full HD program
preparation measured 2.153 s for four clips/5.5 s and 6.853–6.879 s for 12 unique
clips/60 s; cache/Undo took 22–28 ms. A new montage cache miss still renders the
whole program, with a focused cancellation/new-delivery case near eight seconds.
There is no per-cut preparation on the loaded CFR30 program, but editing latency
is an explicit remaining limitation. The isolated bundle's localization/MP4
metadata passed; Foundation preferred en-US here and no picker was opened or Mac
language changed. Packaged Full HD card validation found a retained 720-pixel
filter behind the 160-pixel request. A narrow filter/postcondition correction and
large-source regressions follow; this delta needs proportional independent review
and its own CI before readiness. [Measured record and scope](CEVRA_MANUAL_SEQUENCE_G1.md#representative-preparation-and-large-card-correction--2026-10-07).
IN/OUT, live app/project/export, progress55% and F-A021/1 remain preserved.

**Active usability follow-up — 2026-10-06:** the Owner's coordinated G1 round
reported opening/import, the implemented editing buttons and A/B/A/A export as
working within that variant. In-app preview paused at joins; source cards lacked
thumbnails; selection affected timeline scale and duration/ruler readability was
insufficient. Human close/reopen persistence was **NOT TESTED**. The evidence and
pending grouped regression are recorded in [issue #88](https://github.com/inlifemedicina/cevra/issues/88).
Branch `feat/vids-timeline-usability-preview-continuity`, based on Draft #87 head
`a6c099a5e37c669ed881443dd52b5aab7e2ce7d2`, now has offline-tested timeline
interaction, atomic group removal, one continuous CFR30 program preview and
automatic identity-bound thumbnails. See the [scoped technical record](CEVRA_MANUAL_SEQUENCE_G1.md#human-findings-and-usability-follow-up--2026-10-06).
Seek follows the approved play/pause/drag/cancel policy. At this earlier
checkpoint IN/OUT retained Apply; the 2026-10-07 decision above supersedes that
pending state for selected-clip trim. Native bundle
localization metadata is prepared, but the resulting picker language is untested.
Independent review of this new diff and a coordinated future human round remain
pending. The open app/project/export and earlier package receipts stay preserved;
no new package has been installed or launched. Director impact compatible typed
editing/ephemeral-preview extension; progress55%, F-A021/1, full G1 unaccepted.

**Active resource decision — 2026-10-06 10:38:21 UTC:** the Owner approved the
proposed operational contract: reserve logical space before each producer writes,
and supervise renderer RAM with interruption after observed excess. Initial
512-MiB/2-GiB values are validation budgets, not proved commercial limits or
instantaneous physical/GPU guarantees. Material value changes require an explicit
recommendation before adoption. [ADR0034](adr/0034-operational-manual-render-resources.md)
records the accepted direction, mechanisms and bounded validation plan. Its
implementation now has bounded offline validation: logical reservations cover
declared producers and candidate/accounting overlap; fresh exec wrappers limit
native output file size; closed budget failures reach the Host without committing
an export or replay. Sealed R5 synthetic release-mode validation passed, including
60 s Full HD: 171507712 B sampled RSS, 627486319 B logical/633491456 B allocated,
25.702 s render and 52.512757-dB decoded-original/final PSNR. The controlled RAM
fault overshot by 87015424 B before observed abort; latency/overshoot have no
guaranteed bound. Python136, Media142, Host173 and UI157 passed. The Host guard
also covers manual frame preview; Original/Take retains its existing path.
Independent APPROVE was received via coordination for code head `26c07e55` /
tree `38cab89a`, with 28 artifacts and 470 source files verified as reported in
[ADR0034](adr/0034-operational-manual-render-resources.md#technical-closeout-and-human-handoff--2026-10-06).
Exact-head CI passed 11/11 and the current isolated arm64 package passed strict/deep
signatures and 29 packaged-Host responses. Documentation closeout retains those
production bytes and binds its own published-head CI separately. The bounded
technical gate is closed; the package is READY FOR HUMAN VALIDATION. Native
window/picker and human perception remain unexecuted. Background opening is
blocked by pinned Tao startup activation; no GUI/session was opened or replaced.
Use the single coordinated Portuguese script; this does not promote full G1.
Earlier strict
blocked evidence and the `a7a0003` offline package/CI PASS remain historical.
Use only synthetic/authorized fixtures, preserve originals and retained History,
keep failures recoverable and report observed peaks/overshoot honestly. No merge,
real AI, private project access or foreground GUI action is included. Human/native
acceptance remains pending. Director impact compatible; progress55%, F-A02 1/1.

**Current priority — 2026-10-05:** after the complete code/EDVID/market audit,
the Product Owner approved complete workflow blocks. Foundation and manual G1
(continuous multi-clip edit, sequence preview and simple original-master export)
are IN DEVELOPMENT, with automated G1/G5/G6 before grouped subjective review.
The [G1 plan](CEVRA_MANUAL_SEQUENCE_G1.md) records baselines, milestones, pending
material choices and gates. It grants no advanced catalog, dependency/provider
or app/human-media/device action. The owner explicitly approved the two exact
heads; #84 then #85 merged at `6e2cce16a8506bb5a3816aeb04281a7698abc471` and
`60345a7db3fcfc1b78e6cc878cdbb217b1dac7a4`. That new approval resolved the earlier
automatic-review rejection. Post-#85 exact runtime passed; general CI attempt 4
completed SUCCESS 5/5 after a single targeted retry supported by fresh runner
execution. The plan preserves attempts 1–3's infrastructure failures.
Insert before selection,
duplicate after selection and explicit Retry after failed save are also approved.
Preserve all
scoped R3/Take evidence. The plan records the isolated technical M0 implementation,
published as [Draft #86](https://github.com/inlifemedicina/cevra/pull/86) now targeting
main, bounded tests/exact-tree reviews, the corrected private-Node CI close
handshake and remaining sequence/render prerequisites. #86 is not authorized
for merge; corrected head `58531d6` passed push CI 5/5 and PR CI attempt 2 5/5.
The M1 API (seven intents, one action per Undo) is published as
[stacked Draft #87](https://github.com/inlifemedicina/cevra/pull/87), based on #86.
The UI is published in that Draft at `508436e`: Desktop 125/125, i18n 2/2,
production build, twelve owned PT/EN responsive layout cases, both independent
exact-tree reviews and push/PR/exact-runtime CI passed. Read-only canonical preview
preparation is published at `6b9c737`, with Application 296/296 and independent
review; it binds exact ranges and unique originals without decoded playback.
The next bounded preview preparation passed Host 145/145, offline Rust 38/38,
UI 126/126, i18n/build and independent source reviews: verified limited Original
fallback outside known Take bounds, workload-based deadlines and preservation of
unsaved Host memory on unknown preview retirement, with explicit Retry. The same
G1 plan retains both review findings and fixes. The next bounded sequence consumer
now connects canonical occurrences to the production App through existing clip
RPC, with all-original/full-journal revalidation, seek, repeat, Original mode,
snapshot cancellation and preserved paused position. Host 149/149, Application
296/296, Desktop 134/134, offline Rust 38/38, i18n/build and both independent
reviews passed at source tree `047206a0671aa2ee550669d8bc1437398f4830b8`.
This uses the existing Take envelope and may wait at a join; gapless/native
decoder, sync/perceptual and G1/G5/G6 acceptance remain open. Recovery head
`230c3ff` passed push/PR/exact-runtime CI attempt 1; later publication needs its
own receipts. Selected Original and unsaved changes remain authoritative.
The G1 plan records measured
original-master clock/copy/audio and colour/quality experiments, including exact
60-s source-slice PCM/AAC coverage and absent-tag metadata equality, plus the exact
range/profile/budget proposal. The owner approved initial MP4/H264/AAC,
1080p/30-fps SDR at a 20-Mb/s target, exact requested IN/OUT and initial
512-MiB memory/2-GiB temporary-file limits with a clear error and no silent quality
drop. This is not a new functional PASS or a proved export envelope. The same plan explains off-grid
cuts, measured quality/size and provisional bounded-failure policy for owner
decision, separate from technical tuning. A 7-ms source range proves that strict
30-Hz frame exposure and arbitrary exact cuts cannot both hold; the profile's
boundary-cadence interpretation remains open before production admission.
General display-order admission and combined active-frame/export integration
remain open; later scoped colour measurements are not general source admission.
Owned B-frame diagnosis proved the earlier `-12908` error sandbox-dependent:
identical H.264 commands passed under approved execution outside the sandbox;
software MPEG-4 passed inside. H.264 reordered display-clock/7-ms active-picture
feasibility passed without a product encoder/profile change. The G1 plan records
failed receipts and a recommendation for explicit owner decision: preserve exact
Project IR cuts; prefer nominal 30-fps output with variable boundary durations,
or disclose export-only quantization if strict CFR30 is required. No policy was
adopted and final render/publication/resource-budget integration remains open.
Naming: Creator=Lite, Studio=Full, Vids=Desktop; I19's Full visual workspace/final
output remains independent of Vids. No G1 PASS is implied; F-A02 and progress
remain unchanged. Historical actions below retain their scope and evidence.

The 2026-10-06 independent continuation adds read-only Application/Host/native/UI
destination preparation in Draft #87. Exact cuts, journal/ABA, original identity,
redo and checkpoint remain authoritative; final Export stays unavailable with
temporal choice OPEN. Native picker cancel/Close precedes Host admission; timeout
and unknown retirement preserve unsaved memory. Existing targets/original aliases
are refused without writing/reserving bytes; WebView receives no path or render
authority. The existing transport adds a generation-bound sampled owned-job
resource scope, with aggregate POSIX-group RSS and conservative logical/allocated
file accounting. Review corrected abnormal release, respawn, empty-group success,
retirement races and Inspector clipping, with regressions.

The resource watchdog is not an instantaneous cap: a native excessive group was
observed at 623673344 B and interrupted, so the approved 512-MiB requirement is not
proved as a no-overshoot ceiling. Complete live-allocation registration,
publication and sealed 0.3.4 integration remain export work. The next independent
fix keeps Audio Sequence's instruction graph beside its PCM under the existing
private staging tree and captures cleanup authority before writing, covering
partial graph writes and render cancellation. Worker tests 44/44 and the full
Media Python suite 103/103 PASS; the new live-location regression fails against
`80ee7c8`. These are filesystem fixtures with simulated FFmpeg, not a strict
resource ceiling or final pipeline proof. Caller registration remains necessary.
A synthetic whole-frame 60-s/1080p30/H264/AAC/20-Mb/s fixture included sealed copies
and candidate/staging: 155 observations, peak RSS 159744000 B, logical/allocated
files 608503930/609619968 B, unchanged originals and packet/time identity. Mean
PSNR 54.07–54.60 dB and SSIM 0.99946–0.99953 are measurements, not perceptual PASS.
Per-source colour probes also preserved absent tags/range/matrix and all four
fields on fully tagged BT709; mixed signalling/HDR/source-envelope admission
remains unproved. Failures/corrected receipts and the ready/temporal/engineering
boundaries are in the [G1 plan](CEVRA_MANUAL_SEQUENCE_G1.md#independent-export-preparation--2026-10-06).
One grouped human script is prepared, not executed. #86/#87 stay unmerged; no
human session/app/device, real AI/provider/account or install occurred. Director
impact compatible, progress 55%, F-A02 exhausted 1/1.

Existing ADR0027/0028 contracts already provide exclusive publication identity,
`export.add`, post-checkpoint durable success and restart reconciliation without
replay; the final manual-export path will reuse them. The missing real visual
producer must bind its duration/clock to the pending temporal policy before mux.
Existing Resolved Audio Plan reads canonical audio tracks only; G1's manual
video track cannot silently become an inferred audio mix. Explicit source-audio
mapping through the approved typed executor, or a material admission decision,
is required. No new publisher/journal/intent/preparatory service, silent audio
policy or temporal adoption was introduced for this continuation.

**Active superseding decision — 2026-10-06 00:51 UTC:** after comparing the
official Premiere/Final Cut project-timebase and audio-editing behavior, the Owner
approved the conventional CFR30 picture timeline and matching export. Edits show
their alignment before commitment; preview and export share actual-source-PTS
sampling. Audio keeps an independent clock. Old projects retain exact historical
times until an explicit reviewed, reversible History conversion; opening and
export never silently round them. [ADR0033](adr/0033-manual-sequence-cfr30-clock.md)
records the accepted approach and actual feasibility check. The preceding OPEN
choice, variable-boundary recommendation and 7-ms experiment remain historical,
superseded for G1. Implementation now covers the canonical schema/migrations,
typed frame edits, preview, original-source visual/audio production and existing
publication/archive/`export.add`/checkpoint/recovery integration in Draft #87.
No new engine/dependency/AI, merge or human-session action is included. The
sampled resource watchdog still does not prove instantaneous 512-MiB/2-GiB
ceilings. Current local evidence is IR 70/70, Store 18/18, Application 314/314,
Contracts 25/25, Host 172/172, UI 155/155, Media Node 140/140 combined across
sandbox/approved native contexts, Media Python 121/121, Rust 48/48 and offline
agent regressions 391/391. Existing
environment failures are retained with their targeted successful reruns. The
current-source native render passed B-frame/fractional/VFR, repeated and one-frame
ranges plus 60-s Full HD final/preview with exact decoded frames/audio, unchanged
original hashes and mean PSNR 58.18 dB for the long final. Sampled owned peaks were
178257920 B RSS, 583955456 B logical and 604991488 B allocated; the 60-s preview
was 4452793 B. These bounded source-worker measurements do not by themselves prove
a sealed current bundle, strict ceilings, perceptual/gapless or owner acceptance.
The exact sealed 0.3.4 R2 catalog separately passed production ingest/edit/export,
actual Host resource admission before commit, independent CFR/B-frame/late-NTSC/
VFR barcode and audio clocks, whole-source Original with 30-ms audio origin, and
persisted reopen/Undo without replay. Its 60-s flat-barcode case sampled RSS
133627904 B and 39407529 B logical files; nine sealed modules match source.
Manual-final post-publication errors preserve the public name, eliminating
check-then-unlink replacement races from this new path. Uncertain uncommitted
publication or unproved retirement also retains the accounting link/private root;
confirmed commit and proved retirement allow private cleanup while retaining the
final and `export.add`. Native timeout reconciliation preserves late sanitized
Host publication/commit errors and their evidence with the current state. Original
keeps its existing source-clock/padding contract; final audio requires actual
covered ranges. Existing legacy rollback and human Take history remain unchanged.
The [current G1 checkpoint](CEVRA_MANUAL_SEQUENCE_G1.md#current-cfr30-implementation-and-technical-evidence--2026-10-06)
and Draft #87 hold final-tree review, sealed functional and published-head CI
receipts. G1/OWNER/NATIVE remain unpromoted, progress 55%, F-A02 1/1.

**Native grouped G1 preparation — 2026-10-06:** the preceding implementation
was published at `cb774cad53e6cdf3ac535d08bc4e12d9e9122391`; its push/PR/exact
runtime CI passed 11/11 jobs, attempt 1. The isolated human-validation package
adds a bounded internal fix: before public publication, scan all owned files
without following symlinks, project the accounting hardlink's logical/allocated
bytes, and check again after creating that link. Excess blocks publication.
This is quiescent admission, not a quota intercepting earlier writes. Python
126/126 and the exact sealed R3 manual functional catalog passed; manifest SHA
`ac2663fe25458970b153557b7255fe35f48a8152f533ca84f811112ec4e73cf0` binds the
then-current R3 worker modules. R3 again proved actual decoded picture/audio counts,
source identity, Original timing and checkpoint/archive reopen without replay.
Its 60-s flat-barcode final sampled 133562368 B RSS and 39407529 B logical files.
The earlier R2 Full HD PSNR/resource measurements remain their own historical
receipts. Two authored flash/beep fixtures prepare the existing grouped script;
they do not prove voice/lip perception. Native build/packaged-Host receipts and
final-head review/CI accompany Draft #87. No app was opened or human Take session
touched during preparation. A real project can exceed resources between scans;
the 100-ms delay follows each scan and is not a maximum observation interval.
Instantaneous 512-MiB/2-GiB, arbitrary-source/perceptual and Owner gates stay open.
Director impact is a compatible internal extension: existing typed operations,
IR/History and preset boundaries remain authoritative, with no new AI authority.

The first packaged Host at `cac53b31` exposed a real admission gap: hello/snapshot
passed, but manual export stayed unavailable because FFmpeg 9.0.1's two filter
flags were rejected by a three-column inventory parser. No ingest/render/export
occurred in that failed attempt. The minimal parser correction supports both
formats with negative regressions; Python128 passed. Exact sealed R4 passed real
health/manual-capability admission plus the existing complete functional catalog;
manifest SHA `08b4091a295b3835be5368153157756b7eebc4270cd301fad17a50d622a7898d`,
nine modules bound to source. R4's 60-s final sampled RSS136445952 B and owned
logical39407529 B; this is not an instantaneous ceiling. The catalog now checks
capabilities before rendering. The initial package is also explicitly blocked by
strict signature failure of the unchanged officially pinned Node executable,
reproduced before bundling. A separate copied Node signed locally ad hoc passed
strict verification/version; input SHA18e387c90ab8a8400183e8bdd396376e1e875b91b4c874b894dcade7b35bf572
remains intact and the declared derivative is SHA4f191ec5bfd680bc806226c193ba7f48594836a09ba1bbb9d800f9e325eac0af.
Official pins/manifests and sealed Media/Python are unchanged; no signing key or
credential is used. Node-only signing does not prove whole-bundle/Host acceptance;
do not declare GUI READY based on headless tests. Fresh exact-head package/Host/review/CI
receipts accompany the Draft; actual GUI/Owner and strict resource gates stay open.

**Exact-head CI and test synchronization — 2026-10-06:** the first published
`bbbb0dcde73e16ef396018879e85eaa901d4f45a` attempt completed: both monorepo CI
runs failed one existing manual-sequence UI case each; the PT/EN compact-export
regressions passed, and every other job, including exact macOS runtime, passed.
Independent static review supports a test-harness race: an enabled DOM predicate
does not settle the asynchronous load/editorial effects before range typing or
the next action. The test helpers now await async React `act` for mounting and
completed actions, retaining journal/request/enabled assertions and deliberately
pending clicks. Full UI157/typecheck passed locally; no production defect was
demonstrated and no production/runtime bytes changed. Fresh exact-head CI is
PENDING for this completion commit. Its source binding must describe both test
and documentation deltas from the native build, rather than claim a docs-only
delta. [Scoped record](CEVRA_MANUAL_SEQUENCE_G1.md#exact-head-ci-and-test-synchronization--2026-10-06).
Strict resource and human/native gates remain unchanged; no local render/GUI/AI.

**Corrected compact-export package — 2026-10-06:** the reviewed source fix was
authorized for Draft #87 and isolated packaging. Functional build `fb346106`
(tree `a6b19c5f15a44e9d959fafeef4a6373dc7e81bc9`) now exists as
`/private/tmp/vids-g1-compact-export-fb34610/package/CEVRA Vids G1 Review fb34610.app`.
Offline frontend/native builds, actual resource resolution, strict/deep signatures,
full inventory and launcher check-only passed. Only Info.plist and the native
executable differ from the previous app; Host/Node/Media and dependencies are
identical, so backend export/recovery proof is inherited without another local
render. The new launcher is the future entrypoint; the old command redirects to it
with original bytes archived. The single human script targets the corrected app.
Independent package review is APPROVE. At this pre-publication checkpoint, final
documentation-only source binding and exact remote CI are PENDING; terminal results
will be recorded in Draft #87 and its new consolidated receipt. Old22 CI stays
historical. [Scoped record](CEVRA_MANUAL_SEQUENCE_G1.md#compact-export-package-refresh-and-inherited-backend-evidence--2026-10-06).
Strict resource contract unchanged/BLOCKED, human GUI/picker/perception pending.
Director compatible, 55%, F-A02 1/1; no Take/device/AI/merge/release action.

**Final grouped-script review — 2026-10-06:** the frozen `22e3c431` package/launcher
had no identity defect in the read-only check. Its final build/signature/packaged
Host export/recovery PASS remains separate from unexecuted GUI/picker/Owner proof.
The [single script](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md#single-grouped-g1-script)
now uses actual buttons, defines R2/R4/CFR30/IN/OUT/timecode, restores the four
reference clips after edits and explains automatic save. It removes the visual
cursor-persistence promise and marks unavailable human legacy/save-failure/full
resource variants BLOCKED. An independent compact-export UI defect was fixed in
source: the toolbar reveals Controls rather than hiding feedback/Cancel behind
Director. Two PT/EN regressions failed before; UI157/typecheck and independent
review passed after. The fix is not in the frozen app, whose instructions say
select Controls before export in compact mode; new packaging is required before claiming the
corrected behavior there. [Scoped record](CEVRA_MANUAL_SEQUENCE_G1.md#final-grouped-script-review-and-bounded-ui-correction--2026-10-06).
No native render, CI, GUI, human media/session, AI or merge action occurred. Director
impact compatible presentation fix; resources unchanged, 55% and F-A02 1/1.

**Resource-ceiling feasibility — 2026-10-06:** source/official-document review of
`22e3c43142cbdd28d8d600e658cc65864629bab2` found no proved in-scope mechanism for
instantaneous aggregate 512-MiB physical renderer memory and 2-GiB owned logical/
allocated files. An exclusive reservation ledger plus per-child `RLIMIT_FSIZE`
wrapper and closed writers can limit logical files, including the temporary
account name; it does not establish an allocated-block quota. Darwin per-process
virtual limits and FFmpeg per-allocation controls do not establish aggregate
physical/framework coverage. The
[single decision proposal](CEVRA_MANUAL_SEQUENCE_G1.md#resource-ceiling-feasibility-and-pending-decision--2026-10-06)
records exact mechanisms, source findings, category comparison and impacts:
retain the strict blocked gate with separately approved isolation/quota research,
or explicitly accept an operational contract with hard logical admission plus
sampled RSS/allocated supervision. The latter is recommended for the current
stack only after explicit acceptance of its weaker guarantee. No policy or
runtime change was made, test proofs were not repeated, and the frozen signed
`22e3c43` package/export/recovery evidence remains preserved. Focus-isolated native
UI/picker automation is NOT_RUN; no human Take session was touched. Resource
acceptance stays BLOCKED; Director impact requires Owner decision for the
guarantee, with typed boundaries unchanged, progress 55% and F-A02 1/1.

1. Preserve the accepted F-A02 direct PT-BR textual result and its limits (§24.1): citation support PARTIAL, literal helper unchanged, budget exhausted 1/1. The whole real-agent gate remains open; complete analysis, I1-T1 plan/Change Set and strategy/takes/cuts are not delivered or implicitly authorized. The bounded offline evidence-linked Application draft service is integrated through #75; the owner-approved offline review consumer under D9 is integrated through #77. The subsequently approved admission of the designated F-A02 result/history into a temporary native session is implemented on the current branch, with review/integration pending. Do not infer broader strategy authority, invent alignment or spend another provider slot. PR #70/#72 and their green post-merge CI close the diagnostic/preparation work. Phase A and the bounded V1 transport remain closed; V1 remains terminal 8/8, original lost receipts and prior failures preserved. Any further live scenario requires a separately approved scope, allocation and genuine consent. INT-CLOUD-01–05 retain their existing prerequisites; progress stays 55%.
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


### Historical offline editorial review consumer — owner approval and implementation checkpoint, 2026-10-03

**Status:** IN DEVELOPMENT / NOT MERGED on `feat/offline-editorial-panel`, based on integrated `main` `d8d93b7678e4b74a7b3ce034b60d7e2105b6a361`. PR #76 remains a separate Draft containing roadmap proposals; it is not a prerequisite or merged by this slice.

After the morning recommendation, the owner authorized the smallest offline panel to inspect the existing five-block proposal, consult sources/justifications/caveats, reorder blocks and edit presentation titles/user notes. The host admits one accepted analysis per session and owns it and its service-issued draft in memory, bound to the same ProjectHistory; the closed backend permits only query/revision. UI PT-BR/EN-US shares the existing Director surface and canonical project/timeline. This acceptance authorizes the two narrow local query/revision commands and does not grant provider, arbitrary filesystem/network, persistent admission, import, cut/timing or export authority.

The [offline draft document](CEVRA_OFFLINE_EDITORIAL_DRAFT_V1.md#offline-review-consumer) is the single implementation/validation record for this consumer. Trusted Application handoff must supply the already accepted candidate and its matching history; the UI cannot submit a replacement analysis or serialized draft identity. Existing provenance, PARTIAL citation assessment and first-ingestion binding limitations remain unchanged. A session with no handoff is empty; a stale draft is unavailable for revision. Development demonstration uses an explicit synthetic fixture; it does not claim a production saved-analysis importer or restore a draft after restart.

**Director impact:** compatible extension of proposal review, with no new provider/execution authority. Progress stays 55%; F-A02 stays closed/exhausted at 1/1. Broader strategy/take/cut planning, Change Set application, preview and export remain separate gates. No new live inference, diagnostic, model/configuration change or quota reservation is part of this work.


### Designated F-A02 native offline admission — approved bounded implementation, 2026-10-03

PR #77 is integrated at `73f8427ac18337f779ceeda9c93f60edf35df33b`; post-merge CI `37127986470` (5/5) and Exact Runtime `37127986468` (1/1) are SUCCESS, attempt 1. This supersedes the earlier unmerged consumer checkpoint above. Subjective visual/narrative acceptance remains pending.

The owner explicitly approved local reading of the already obtained F-A02 result and its corresponding history on 2026-10-03 at 14:33 UTC. The bounded addition on `feat/offline-fa02-native-review` is IN DEVELOPMENT / NOT MERGED: a native startup designation supplies one directory and two previously pinned hashes; the host reads only the two designated artifact names and creates a temporary in-memory review session. It uses existing history/draft validation, preserves PARTIAL and original assertions, and disables canonical project operations. The ordinary project store, engines, credentials and provider are not opened by this mode; no durable proposal or automatic recovery/import path is added. The historical `providerContact: UNKNOWN` stays unknown. This approval grants the designated offline admission, not a general importer or authority from serialized flags.

Implementation and validation details are in [Offline Editorial Draft V1](CEVRA_OFFLINE_EDITORIAL_DRAFT_V1.md#designated-fa02-admission). Director impact: compatible review/admission extension; no provider, engine, timing/cut or execution authority. Progress stays 55%; F-A02 remains exhausted 1/1.

### Shared stable source labels — approved bounded follow-up, 2026-10-03

PR #78 is integrated at `182081e6a9e6c1b7849a099ebd3f6bba13663415`, from approved head `3e9f82e7c4c22a5c0cfa3338d10ee8df5094a7d8`; post-merge CI `37151631882` is SUCCESS, 5/5, attempt 1. The owner accepted the bounded native card/source-label review on frozen visual commit `dd7f1e4`; that demo used window-only numbering. Durable numbering is the integrated follow-up below. The older native instance and original F-A02 pair were preserved. Final typography, colors, logo and icons remain pending.

The owner subsequently approved the smallest durable evolution: a versioned
source-ID/number registry and one monotonic per-project counter in existing
ProjectHistory, outside its undo cursor, serialized in existing ProjectStore.
The current follow-up writes HistoryArchive/Project Package V3 while reading
V1/V2 deterministically without rewriting a valid legacy checkpoint on open.
Project IR audiovisual schema, journal commands, compact transcript storage and
persistence/recovery architecture remain unchanged. Reservations survive removal,
undo/redo/restore and branch replacement; new IDs never reuse stored numbers.
Kinds supply localized labels and filtered views can show gaps. Legacy labels or
discarded reservations that were never stored cannot be reconstructed; recovery
preserves the registry in the valid checkpoint actually recovered.

[ADR 0031](adr/0031-stable-source-numbering-v1.md) is the format/compatibility
record; [Offline Editorial Draft V1](CEVRA_OFFLINE_EDITORIAL_DRAFT_V1.md) remains
the review implementation/evidence record. Reuse X-T1/T2/T5, I8-T3/T6 and I17-T9
for bounded automated persistence evidence and later app acceptance. This is a
compatible Director presentation-identity extension with no new execution,
provider or permission authority. Editorial notes stay in memory; no real owner
projects were migrated/saved by this task. Progress remains 55%, the wider agent
gate stays open and F-A02 remains exhausted 1/1.


### Manual first-video excerpt — approved implementation, 2026-10-03

**Status:** IN DEVELOPMENT / NOT MERGED on `feat/manual-inout-preview`, based on integrated #78 `182081e6a9e6c1b7849a099ebd3f6bba13663415`. The owner approved the bounded original local video → real playback/manual IN/OUT → one visible timeline clip → undo/redo package. No real AI call, automatic selection/alignment, multi-clip composition, export or brief/profile implementation is included. F-A02 has `timingBasis: none`; its text supplies no invented cutting times.

The Application service resolves a canonical admitted video by source ID/current snapshot and verified ingest evidence. It validates safe millisecond bounds against probed source duration, checks current file size before hashing and revalidates identity/snapshot before typed `track.add`/`clip.add` commits. Both candidates are preflighted before recording; track preparation is a separate existing journal step, so one undo removes the clip and leaves an empty track, and redo restores the same clip. Checkpoints and stable source numbering use existing ProjectHistory/ProjectStore; Project IR schema is unchanged and originals are read only.

Two narrow native commands expose bounded verified bytes and the closed manual range request. The preview response contains no path; these requests admit no filesystem path or grant. Existing project snapshots still contain canonical source URIs. A regular file descriptor supplies the exact bytes whose hash is checked, then a local Blob URL is revoked on source/snapshot change or failure. Marking uses the media clock after metadata/seek readiness, never the demo clock. The clip mode supports only a single simple speed-1/default-volume/default-opacity excerpt on an enabled video track; older complex clips explicitly fall back to Original. Unsupported decoders/duration disagreement fail visibly. **The 8 MiB cap and one-clip limit are constraints of this initial fixture test, not the final product contract.** Streaming/composition and larger media remain separate work.

Automated baseline evidence: 346 Application/host tests and 66 UI tests PASS; independent code review APPROVE after size/zoom/legacy-preview corrections. PR #80 remains Draft / NOT MERGED. On 2026-10-04 UTC the owner tested the isolated macOS arm64 PT-BR demo built from `1855c445687eb22102bfb870773f74fca7d315e3` and confirmed original playback, manual IN/OUT, one visible clip, playback limited to the excerpt and undo/redo working. This closes the functional acceptance of that bounded variant, not the wider case catalog. The owner reported that the create-clip button looked inactive after OUT despite accepting the click; the scoped follow-up uses a dedicated enabled/disabled style without changing range validation or mutation behavior. Its 54 relevant UI tests and offscreen browser render PASS; the running owner session is preserved and the updated native demo is prepared separately, not substituted during testing. The [acceptance catalog](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md#manual-inout-macos-2026-10-04) records the fixture, narrow results and remaining visual/release limits. General composition/export, complete save/reopen, production distribution and real-agent gates remain open.

**Director impact:** compatible manual-edit execution extension on the same canonical history/timeline. Director provider/context/permission responsibilities are unchanged; no command, engine or provider authority is admitted through a proposal or serialized result. Global roadmap progress stays 55%; F-A02 remains exhausted 1/1.

### Direct timeline IN/OUT — approved bounded block, 2026-10-04

PR #80 is integrated at `ddf1448f3c32bdd9f8c35c9ad25b668e00be4856`;
post-merge CI `37166055533` SUCCESS 5/5 and Exact Runtime `37166055565`
SUCCESS 1/1, attempt 1, supersede its earlier unmerged wording above.
Its bounded original/manual excerpt functional owner acceptance remains valid.
The owner approved the next block: pointer and keyboard IN/OUT controls on the
same simple timeline clip, verified `clip.trim`, preview and undo/redo. The block
on `feat/manual-timeline-trim` is IMPLEMENTED / NOT MERGED;
one new isolated demo and one additional human round are prepared without
activating a window. The scoped contract, automation/scale evidence and open
limits are in [Manual Timeline Trim V1](CEVRA_MANUAL_TIMELINE_TRIM_V1.md).
Director impact is compatible direct editing through existing typed history;
no IR/storage/engine direction or AI/provider authority changes. Global progress
remains 55%; F-A02 remains exhausted 1/1.


### PR #82 owner feedback — bounded trim presentation correction, 2026-10-04

The owner tested native head `1f9389d3fadd3d3b86da4b89f1a86baac99cba2d` and
confirmed cancellation, coarse/fine keyboard edits and undo/redo. Pointer trim
worked functionally but IN shrank visually from the right; playback's fixed-30-fps
counter was questioned for IN 2.000 / OUT 3.990 s. These supersede the prior
NOT RUN checkpoint; visual IN and perceptual playback remain pending recheck.
The bounded fix anchors measured visual OUT during IN drag until release and
shows milliseconds, separately labeling source position and excerpt elapsed/
duration. It changes no IR placement, trim/history/checkpoint or decoder logic.
An isolated real-fixture Chrome headless check reports media clock 2.000→3.990 s,
paused at OUT with playhead 1990 ms; the last frame sample is 3.966667 s. That
explains the old 3:29 display but is not native/frame-accuracy certification.
Inspection of all frame callbacks also found 4.000/4.033333 s beyond OUT before
the final corrective seek. Bounded playback therefore remains OPEN, beyond the
corrected display; browser-native fragment/cue experiments did not close it.
That presentation build labeled the excerpt preview approximate. The owner then
approved the typed derived-preview integration; its implemented checkpoint is
below. The old full-original polling path does not establish bounded playback.
[Scoped diagnosis and limits](CEVRA_MANUAL_TIMELINE_TRIM_V1.md#owner-feedback-and-bounded-correction--2026-10-04).
PR #82 remains Draft / NOT MERGED. No AI call, credentials, human-session change
or broader acceptance; Director impact is compatible presentation correction,
progress 55%, F-A02 exhausted 1/1. Recheck only the two reported presentation cases.

### PR #82 approved bounded derived preview — 2026-10-04

The approved integration now prepares a verified ephemeral excerpt through the
existing MediaEngineAdapter typed `trim` profile, with source/clip/snapshot IDs
and cancellable operation ID across UI/Tauri/host. The host resolves canonical
bounds, privately copies descriptor/hash-verified originals, admits bounded
frame/audio/hash evidence, rechecks source and snapshot, and waits for native
retirement before owned cleanup. No Project IR source, history/checkpoint or
durable Media execution is created. Stale/cancelled results cannot be admitted;
missing/unsupported runtime fails visibly. Original mode remains available.

The bounded profile covers zero-origin CFR ≤60 fps, ≤60 s, SDR/no rotation,
≤1080p, source/output ≤8 MiB and optional contiguous 44.1/48 kHz mono/stereo audio.
It selects only source frames in `[IN, OUT)` and the corresponding audio sample
indices, rebases to zero and uses natural file EOF. Quantization is explicit:
2.000–3.990 s produces 2.000 s at 30 fps or 2.002 s at `30000/1001`; the last
admitted picture can remain for one frame, AAC padding is bounded below 1024
samples. Six exact-runtime decoded frame/audio sentinel cases PASS, including
nonaligned IN and 0–11 ms; full-original negative control and VFR are rejected.
The original hash and canonical project remain unchanged in production-host
integration. Chrome headless plays the real derivative 0→2.000 s with last frame
callback 1.966667 s; this is separate from pending native perceptual acceptance.

Worker 0.3.2 has an eight-file integrity inventory and retains approved pinned
FFmpeg/upstream/provenance/license checks. The separate review app includes this
managed runtime and is prepared unopened under a new identifier with an owned
fixture checkpoint. Default release packaging, WKWebView/audio presentation and
broader composition/export remain open. Desktop 88/88, Rust 28/28 and Python
Media 91/91 and affected Node/i18n regressions 527/527 PASS;
independent exact-tree review and exact-head CI are
tracked in Draft PR #82. [Profile, measurements and limits](CEVRA_MANUAL_TIMELINE_TRIM_V1.md#approved-bounded-derived-preview--2026-10-04).
Only IN visual drag and new excerpt playback require the consolidated owner
recheck; preserve the accepted cancellation/keyboard/undo results. Director
impact is a compatible typed Media/trim/history consumer, no additional provider
or execution authority. Progress stays 55%, F-A02 exhausted 1/1, no real AI call.


## Approved Take local preview expansion — 2026-10-04

After merged PR #82 (`906eea695836fe2ae2b81ab0b50610b600748995`) and its accepted
IN/playback round, the owner approved real Take video preview preparation. The
existing typed Media adapter now prepares a cancellable ephemeral proxy for
Original and a canonical single clip: source ≤256 MiB/60 s/SDR Full HD in either
orientation; output ≤8 MiB/720-side H.264/AAC. Measured CFR/VFR PTS and quarter-turn
rotation are verified, with input/output hashes and decoded audio evidence.
Original marks use logical source duration. Legacy v1 remains tested; no proxy
becomes a Project IR source or durable execution.

Synthetic exact-runtime tests and production-host import/preview/close/reopen
pass, including a 40,370,307-byte portrait MOV. Real Take preflight and human
acceptance remain BLOCKED until the authorized transferred Mac file is designated.
The isolated review package and Draft PR are tracked in the final receipt; no
human sessions or device are touched, no real AI call. One new owner round covers
real-file orientation/voice sync and save/reopen; preserve prior accepted checks.
Director impact compatible, progress 55%, F-A02 1/1 unchanged. Full composition,
export, release and provider gates remain open. [Canonical profile, measurements,
limits and acceptance status](CEVRA_MANUAL_TIMELINE_TRIM_V1.md#approved-take-local-preview-expansion--2026-10-04).


### Real Take recording technical validation — 2026-10-04

The owner designated the transferred 45,593,687-byte Take MOV; its identity was
verified locally. Preflight/import/Original proxy/5–10 s clip/close/reopen PASS
with unchanged original/project/numbering/undo. Three real QuickTime metadata
cases required a bounded correction: 1/600 time base, exact bounds-normalizing
cardinal matrix translation, and two explicitly discarded packets beyond track
end. Visible packet PTS must exactly account for decoded frames; arbitrary
transforms and unaccounted frame loss remain rejected. New negative Python tests
and a synthetic exact-runtime edit-list regression PASS. Decoded pixels and PCM
confirm orientation and zero measured audio lag; this is technical evidence, not
subjective native acceptance. No media leaves the Mac or enters the repository.
Real-file preflight is no longer blocked; the consolidated human round stays
PENDING. Draft #84/head CI/native receipt track the correction. Director impact
compatible; 55%/F-A02 1/1 unchanged, no AI/device/session operation or next-block
implementation. [Canonical real evidence](CEVRA_MANUAL_TIMELINE_TRIM_V1.md#real-take-technical-validation--2026-10-04).

### 2026-10-05 — Real Take native acceptance and initial paused-frame correction

APP/OWNER accepted the requested real Take preview round at PR #84 head
`b57c649`: Original/excerpt orientation and voice sync, excerpt content and
save/close/reopen. A distinct initial-frame-before-Play defect remains FAIL at
that head. The authorized bounded Desktop correction eagerly requests frame data
and waits for validated metadata/current-frame readiness while remaining paused
at zero. It is IN DEVELOPMENT / NOT MERGED; only Original/V1 selection before
Play requires a point-specific owner recheck. Prior accepted steps remain valid.
No Media worker, typed commands, Project IR/history, provider or permission changes.
Director impact is compatible; progress 55% and exhausted F-A02 1/1 unchanged.

The owner separately approved preparation of a visual layout proposal, not its
implementation. Measured native window: 1435×900; video area: 781×192. A 9:16
source therefore occupies about 108×192. A stable layout with a taller central
preview and lateral Director/context controls is a presentation proposal for
comparison in both orientations. Selected-media aspect does not set project or
export aspect. No layout code, new output behavior or identity redesign is authorized
by that proposal approval. The visual artifact uses neutral synthetic content.

### 2026-10-05 — Approved editing sidebar implementation

After reviewing the synthetic open/compact proposals, the owner approved the
full-height right editing column: Director and editorial draft above contextual
controls, an adjustable height divider, independent scrolling and adjustable
width. Open is the default. The final compact mode collapses the entire column
and exposes an explicit reopen button; the earlier narrow-column/tabs mockup is
superseded. Width dragging or source aspect never changes modes automatically.
Preview, excerpt and IN/OUT remain together centrally; text, selection and scroll
positions must survive collapse/reopen. This is authorized presentation work,
with no Project IR/history, engine, provider, permission or persistence change.

Implementation is prepared on `feat/vids-right-sidebar`, based on Draft #84 head
`a36d8ba` (the independently reviewed initial-frame correction, with PR/push CI
5/5 and exact runtime 1/1 SUCCESS). The new Draft is stacked on #84 so its diff
contains only the approved layout. It remains unmerged pending final review/CI
and one consolidated owner layout/initial-frame check. Preserve the accepted Take orientation/voice/excerpt/save/reopen
round; no full repeated acceptance, human-session manipulation, personal-media
publication or real AI call. Director impact: compatible presentation extension;
execution/state boundaries, progress 55% and exhausted F-A02 1/1 are unchanged.

Local Desktop 98/98 and i18n 2/2 PASS, including five new sidebar cases for
unsaved text, independent scroll, selection/playhead, explicit PT/EN reopening,
resize limits and the divider after a reduced window. Independent review found
one bounded divider issue: dragging now starts from its visible clamped height,
with Escape restoring the initial proportion. Native WKWebView synthetic checks
confirm the whole column collapses, timeline width changes from 1075 to 1435 px
at a 1435×868 client, and text/scroll/selection/history survive. The Original
video box is 707×359 px with the column open, versus the previous 781×192 px;
portrait content is fitted, never used to select a mode or export aspect.
Both synthetic Original and excerpt paint their initial frame paused at zero,
with zero Play events. These checks do not certify subjective legibility or
the point-specific real Take check. The replacement native package is prepared
closed; the accepted human session and its project are preserved. Canonical
owner steps: [grouped sidebar/first-frame check](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md#editing-column-and-paused-frame-owner-check--2026-10-05).

### 2026-10-05 — Owner V1 failure and revised compact approval

At Draft #85 `f4ea20f`, the owner confirmed the Original initial frame PASS,
but the existing V1 excerpt still has no initial frame before Play: APP/OWNER
FAIL. Synthetic technical PASS does not supersede that failure. The authorized
follow-up diagnoses/corrects this exact behavior while preserving the saved
project and accepted orientation/voice/content/save/reopen round.

The owner explicitly replaced whole-column collapse with a revised compact
mode: a 286 px column (the measured original width) confined to the upper editing
area, with Director/Controls tabs; the timeline spans the entire lower width.
Open keeps the approved full-height adjustable column. Preview/excerpt/IN/OUT
stay centrally; tab/mode transitions preserve text, selection and scroll.
Implementation and exact review/CI are active on Draft #85. No merge, AI call,
provider/engine/project schema/persistence extension or Take device operation
is authorized. Director impact is a compatible presentation/lifecycle extension.

The bounded correction admits one decoded excerpt frame as an in-memory PNG
(maximum 720 px on its longer side), waits for image decoding before enabling
controls, and hides it during Play/seek. It is released with preview identity or
failure; no image/media enters history, storage or external services. Original
retains its accepted video path. Isolated raw WKWebView Original/excerpt media
decoded and painted at zero without Play, so the exact failure in the human
window remains unreproduced; this follow-up must not claim a proven native
compositor cause or an APP/OWNER V1 PASS.

Desktop 102/102 and i18n 2/2 PASS, including delayed compact-clamp/layout scroll
restoration, tab keyboard/selection/text preservation, bounded image admission
and image error/Play/seek lifecycle. Independent review and exact CI remain
pending. Initial native layout measurements confirm compact width 286 px and a
1435 px timeline at a 1435×868 client. The follow-up native probe then expired
three times in its background window; final scroll and actual-UI V1 image checks
remain BLOCKED/PENDING, not PASS. The saved human project, existing review app
and Take testing are preserved. The owner asked to continue approved technical
work overnight and accumulate one reviewed package/minimal shared Vids/Take
round for the morning, with no intermediate human tests or app installation/open.

### 2026-10-05 — WKWebView environment and premature image correction

Further isolated diagnosis distinguishes two concrete findings. The Mac display
is asleep/inactive; a nonpersistent WKWebView continues native messages/timers
but executes zero rendering callbacks while occluded. No display wake, human
session operation, screenshot or recording was performed. Native painting and
render-dependent scroll verification remain BLOCKED by that environment.

At reviewed Draft #85 `ce53f81`, the actual Original → existing 5–10 s V1
transition also exposed a premature canvas capture: the initially admitted PNG
was black (mean 0), whereas the same paused clip at time zero was later readable
(mean 0.489). The early image correction therefore cannot be treated as native
PASS, even though Chromium passed. The bounded follow-up waits through a
rendering turn before sampling, rechecks media identity/data/seek/time, cancels
both callbacks on selection, seek, failure or disposal, and still requires image
decoding before controls. It never auto-plays, advances time or rejects legitimate
black content by brightness. Original's accepted path remains unchanged.

Desktop 105/105 PASS includes a regression red against `ce53f81`'s immediate
capture and cancellation of both queued stages after selecting Original. The
full offline compact audit also preserves context-only workspace/tab memory,
unsaved fields, intentional user scroll after clamping, expanded width and
minimum-window geometry. Final exact review/CI/package outcomes are PENDING at
this checkpoint; results will be recorded in Draft #85 and its local technical
receipt. Awake native image/painting and
owner acceptance remain pending; this does not claim the exact human-window
cause fully reproduced. Director impact remains compatible; no engine/provider,
history, schema or persistence extension, progress 55%, F-A02 exhausted 1/1.


### 2026-10-05 — Approved bounded preview fluency and first-frame admission

The R2 owner round accepted compact/tabs/fields/scroll at 12:34 UTC; its V1
initial-frame FAIL is preserved as historical evidence. Earlier
orientation/voice/content/save/reopen and Original initial-frame acceptance
are preserved. The owner-directed normal R3 transition then enabled only the
corrected V1 first-frame recheck, with no repeated layout round.

The owner approved measured exact-range session reuse plus a PNG extracted
from the admitted derivative, then bounded reuse of verified independent source
inspection. Host LRU is four entries / 32 MiB; PNG ≤2 MiB/720 px; worker LRU is
four entries / 1 MiB counted resident facts. Source/runtime/range identity,
fresh source hashes, sealed copies, complete output PTS/audio/orientation/hash
admission, cancellation/temp cleanup and shutdown remain mandatory. Runtime
0.3.4 keeps the pinned provenance/licenses and adds no provider, dependency,
command, WebView permission or IR/History/Package migration. The UI remains
paused at zero and accepts legitimate black frames without a brightness gate.

Complete local CI, Python 101/101, Rust 28/28 and ten exact-runtime functional
controls PASS; independent review found no code blocker. Current host first V1
fell from 6.041 s to 1.528 s; another new range from 6.542 s to 2.089 s. Retained
V1 host samples are 25.1–27.8 ms, explicitly not full UI latency. Native complete-IPC control PASS: retained V1 PNG present in 56–150 ms and
Play ready in 197–325 ms; cold Original 9.878 s and first V1 2.226 s to readiness.
A separate sampled budget/eviction/close control PASS. Exact commit CI and the
review package are verified at `7d4e66776fbfc112429d333e5d8883221c2851fb`;
Drafts #84/#85 remain unmerged. The owner explicitly authorized normal R2
retirement and R3 opening, preserving the saved Original/V1 project. The R3
owner reported that both first frames appeared, the first V1 took approximately
two seconds, and subsequent Original↔V1 switches appeared immediate. This is
limited APP/OWNER PASS for first frame and observed switching, not a latency
guarantee or product READY. Preserve earlier accepted layout and real Take
behavior without repeating those rounds.

The owner's separate question about absent IN/OUT buttons remains a
discoverability observation. Read-only current-window inspection found both
enabled V1 trim handles inside the visible central timeline, IN 5.037 s and
OUT 9.928 s. Creation buttons are omitted once the timeline contains an item;
that condition predates R3. No trim, selection, scroll, Play, capture or focus
action was performed, and no new layout or editing behavior was introduced.
[Current location and limits](CEVRA_MANUAL_TIMELINE_TRIM_V1.md#r3-inout-location-check--2026-10-05).
[Canonical decision](adr/0032-bounded-preview-session-reuse.md) and
[measurements/limits](CEVRA_MANUAL_TIMELINE_TRIM_V1.md#approved-preview-fluency-and-admitted-png--2026-10-05).
Director impact compatible, official progress stays 55%, F-A02 remains exhausted
1/1. No real AI, human store inspection/copy, Take/iPhone/Xcode operation or
merge is part of this approved follow-up.
