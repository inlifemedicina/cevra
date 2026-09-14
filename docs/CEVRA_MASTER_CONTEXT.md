# CEVRA ORBIT — MASTER CONTEXT & DECISION LEDGER

**Canonical continuity document**
**Initial consolidation:** 2026-09-14
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

Manual editing remains available for refinement, correction, fallback and advanced control, but routine production work should not be shifted back to the user.

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

# 16. Transcript persistence and multi-source semantics — ACCEPTED / IMPLEMENTATION NOT STARTED

Current Project IR has one global `TranscriptState` and no direct `sourceId` on the transcript object.

CEVRA Vids must support multiple source assets.

Therefore the transcription-engine slice intentionally returns `TranscriptionResult` only and does **not** yet add a global `transcript.replace` command.

ADR 0014 is **Accepted** after independent adversarial review and remediation. It defines one source-scoped canonical transcript per eligible audio/video source, with prior versions preserved by ProjectHistory and candidate results kept outside canonical state until promoted.

The central architecture remains unchanged. The accepted refinements require pure deterministic document-local migration, deterministic `transcriptDigest` state identity, digest-bound references and asynchronous promotion, continued public compatibility of `TranscriptState`, closed speaker-coverage semantics, and a typed bounded migration quarantine. No Project IR version, migration, command, persistence, cache or alignment implementation has started.

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

## Track A — CEVRA Vids

```text
Foundation / Media Runtime       [CLOSED]
→ Architecture Canon             [CLOSED]
→ EDVID parity specification     [CLOSED]
→ Local Source Ingest V1         [CLOSED]
→ Local Transcription Engine V1  [CLOSED]
→ alignment / transcript cache / Project IR multi-source mapping as separate small slices
→ editorial transcript / analysis
→ strategy / take selection / cut planning
→ missing typed Project IR edit commands
→ cut compiler
→ numeric QA
→ native preview + layered timeline
→ captions
→ composition benchmark
→ shortform/longform composition
→ camera/face/B-roll/music/SFX
→ generative asset providers
→ agent integration / AI-first orchestration
→ Vids 1.0 hardening
```

## Track B — Orbit Platform

Package format → identity/licensing → entitlements → Marketplace → recommendations/shared services.

## Track C — Creative Ecosystem

Built-in skills → first-party premium packs → Marketplace → third-party SDK/publisher ecosystem.

## Track D — Expansion

Mobile → additional CEVRA apps → sync/publishing/analytics → broader Orbit.

---

# 24. Current repository state

## 24.1 `main`

After the post-transcription canon merge:

`3098274f8a30a85e4b83e5524fc70664adaa412f`

This is the Git-authoritative current `main` and the base for the active architecture-design branch.

## 24.2 Important merged milestones

| Milestone | PR | Merge SHA | Status |
|---|---:|---|---|
| Media Runtime V1 | #7 | `35a8c81ef83627101d7c97636990c5272856509f` | CLOSED |
| Architecture Canon | #8 | `9387ab3507355bb9c20cd17be7b27754a9059ec0` | CLOSED |
| EDVID parity specification | #9 | `6502afa9092f2be0ebd1d7b259f83dedf3f672d3` | CLOSED |
| Local Source Ingest V1 | #10 | `aa92402cf49cc45f55c961508f66c262a02ce075` | CLOSED |
| Local Transcription Engine V1 | #11 | `d780de370b6a32fa010dedeeb5344bfe12666157` | CLOSED |
| Post-transcription canon / ADR 0013 | #12 | `3098274f8a30a85e4b83e5524fc70664adaa412f` | CLOSED |

## 24.3 Active work

| Branch | Status |
|---|---|
| `arch/multi-source-transcript-semantics` | ADR 0014 accepted after remediation; implementation not started |

No feature implementation branch is active. The next implementation slice has not started.

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
- **PROCESS:** this master document was created specifically because the previous ChatGPT conversation reached maximum length; future decisions must be recorded here.

---

# 26. Explicitly unresolved decisions

Do not guess these in future chats:

1. final composition engine (HyperFrames vs Remotion vs other) — benchmark pending;
2. exact Project IR v2 implementation details for the source-scoped multi-source transcript model accepted in ADR 0014, including digest canonicalization and migration-quarantine resolution;
3. WhisperX/forced-alignment adapter, model and integration details; provider-neutral alignment status semantics are closed by ADR 0014;
4. final transcript cache schema, key and invalidation policy;
5. final transcription model default for production quality;
6. production transcription-runtime assembly/update mechanism;
7. production model-asset identity, update and distribution mechanism;
8. exact generative image/video provider set and entitlement strategy;
9. exact technical editing/composition stack behind the 2026-09-14 reference demo — unverified and non-blocking;
10. which public Creative Intelligence skill candidates will be incorporated vs behavior-ported;
11. final embedded Codex/Claude commercial integration mechanisms;
12. final Marketplace package/runtime security model implementation;
13. mobile implementation timing.

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

1. Prepare a bounded implementation proposal for accepted ADR 0014 and resolve its remaining implementation-level questions before code.
2. Do not reopen the closed Local Transcription Engine V1.
3. Do not start transcript persistence before the bounded Project IR v2 implementation proposal resolves digest canonicalization, deterministic migration and quarantine resolution.
4. Select one small implementation slice from alignment, transcript cache or multi-source Project IR mapping after its own prerequisites are satisfied.
5. Do not combine those three areas automatically into one branch or PR.
6. Preserve the EDVID baseline and dependency-driven implementation order.
7. Apply the quality/performance policy to future preview, render, composition and export work.
8. Keep this document updated after every material decision, merge or completed research finding.

---

# 29. Continuity safeguard

If ChatGPT again reports “maximum conversation length”:

1. open a new chat in the CEVRA project;
2. attach or point to the latest `docs/CEVRA_MASTER_CONTEXT.md`;
3. instruct: “Read this master context in full and continue from CURRENT STATE. Do not reopen closed work.”;
4. provide the latest Codex/Claude return only if it occurred after the last document update;
5. update this document again before the new chat becomes long.

**The project must never rely on a single chat thread as its only memory.**
