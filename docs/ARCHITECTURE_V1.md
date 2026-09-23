# CEVRA Architecture Canon v1

## 1. Product hierarchy

CEVRA Orbit is the CEVRA ecosystem and product universe.

```text
CEVRA Orbit
├── CEVRA Vids
├── Marketplace
├── future CEVRA products and apps
└── shared platform services
```

Orbit is neither a feature nor an editorial-intelligence module. It is not the former name of Content Intelligence and is not required for CEVRA Vids to import, edit, preview or export media.

CEVRA Vids is the first and highest-priority Orbit product: an AI-first video editor and creator that remains commercially useful as an independent application. Marketplace belongs to Orbit and may serve Vids and future products. Future identity, account, licensing, entitlement, package-registry, update, recommendation and sync services are shared platform capabilities; they must not collapse independent product domains into a monolith.

## 2. Architectural invariants

1. Project IR is the only source of truth for editable audiovisual project state.
2. UI, agents, FFmpeg, composition frameworks, transcription engines, OpenTimelineIO and future editors are adapters around Project IR.
3. Engine-specific data must not leak into the stable Project IR core except under explicitly namespaced `extensions`.
4. Every mutating edit creates an auditable journal entry and recoverable state.
5. Engines expose typed capabilities, versions and health checks.
6. External providers implement a common lifecycle: configure/connect, healthcheck, capabilities, execute and disconnect.
7. Project schemas migrate forward explicitly and reversibly where practical.
8. CEVRA Vids core editing works without paid OpenAI or Anthropic APIs.
9. CEVRA Vids remains usable without Marketplace, unimplemented Orbit services, Content Intelligence, Claude, external Codex, paid AI APIs, external generative providers or future Orbit products.
10. PT-BR is the initial default locale. EN-US is selectable and has mandatory feature parity for all user-visible surfaces.
11. Desktop and mobile share Project IR and UX vocabulary; heavy processing may be delegated to a trusted desktop node.
12. The application shell, Project IR and history system remain independent of any single media, composition, transcription or agent engine.
13. Desktop Python-based engines run only inside a private CEVRA-managed runtime; the product does not depend on or modify a user's global or system Python.
14. Content Intelligence is an optional, provider-neutral domain separate from Project IR. Research, sources, signals, questions, trends, ideas, briefs, scripts, performance data and content memory do not become audiovisual state merely because they are associated with a project.
15. Social networks, publishing platforms, analytics services, AI vendors and other external systems are accessed through provider contracts. Provider-specific API models never become core domain models.
16. Workflow / Production Presets are versioned declarative application orchestration. They resolve only to typed validated CEVRA commands and providers and never become an arbitrary scripting, shell or filtergraph mechanism or an alternate source of truth.
17. Orbit platform services and domain products communicate through stable contracts. Vids and future products retain independent domain boundaries and release paths.
18. Semantic versions use `x.x.x`, but version numbers are displayed discreetly in About, Settings, diagnostics, logs and support surfaces rather than as primary branding.
19. CEVRA editing is non-destructive: original media remains immutable; proxies, previews, caches and intermediate renders are derived artifacts rather than canonical sources. Final-quality exports use original sources and assets whenever technically applicable, while render policy balances perceptual quality, throughput, file size and target-delivery constraints.

## 3. CEVRA Vids experience target

The primary AI-first flow is:

```text
open CEVRA Vids
→ import or drag raw video
→ describe the desired result
→ AI plans and executes typed CEVRA operations
→ layered editable timeline updates
→ preview
→ approval by default, configurable
→ refine when needed
→ export
```

CEVRA Vids is not designed as a traditional manual editor with a chatbot attached. Manual mode exists for refinement, correction, adjustment, fallback and advanced control. It does not return routine production work to the user. The same Project IR, command API, journal and recovery system support AI-first and manual interactions.

## 4. EDVID functional baseline

The public `fillrochaa/edvid` project under the MIT license is the initial functional and editorial baseline for CEVRA Vids. Implementation policy is:

```text
PORT WHAT WORKS
→ ADAPT TO CEVRA ARCHITECTURE
→ TEST PARITY
→ IMPROVE
```

The Vids core should contain practically all useful, proven EDVID behavior plus CEVRA improvements. Essential baseline behavior is not withheld for Marketplace. Expected parity includes ingest and media organization; local transcription; speech and content analysis; automatic take selection; silence and error removal; word-boundary cuts and cut padding; J-cuts and audio fades; voice leveling and mastering; color correction and grading; short-form and long-form production; captions and headlines; zooms and dynamic camera; face tracking; B-roll and other inserts; photos, videos and graphics; asset placement; preview; layered timeline; approval and review; manual refinement; export; and deterministic editorial QA.

Future implementation work that intentionally departs from proven EDVID behavior records a **DIVERGÊNCIA EDVID** with evidence that the alternative is equivalent or better. CEVRA does not copy EDVID branding, trade dress or product names. Any source reuse requires exact upstream provenance and MIT attribution.

## 5. Layered timeline concept

The initial conceptual track arrangement is:

```text
V4 — motion graphics / overlays
V3 — photos / images / B-roll
V2 — captions / headline
V1 — main video

A3 — SFX
A2 — music
A1 — voice / original audio
```

Assets imported by users, found automatically, generated automatically or obtained through a provider become ordinary editable Project IR assets and timeline items. Generated files and engine state never become a second source of truth.

## 6. Approved target stack and adapters

### Application shell

- Tauri 2
- React and TypeScript
- Shared responsive design system

### Managed Python runtime

- Private CPython 3.12.x runtime managed by CEVRA desktop releases
- No manual Python installation required for normal users
- Runtime and packages pinned and updated through the CEVRA release/update process
- Preferred redistributable source: an audited pinned `python-build-standalone` artifact or equivalent compatible CPython distribution
- System Python ignored except in explicit developer mode

### Media Engine

- FFmpeg and ffprobe behind `MediaEngineAdapter`
- Typed validated operations only
- Compatible MIT capabilities may be evaluated or imported from `ffmpeg-skill`
- No arbitrary agent-authored filtergraph in the stable execution path
- Python helpers execute inside the CEVRA-managed runtime

### Rendering and derived artifacts

Preview and proxy paths may use fast disposable derivatives to preserve responsiveness. Final-quality export must not use a proxy as its master source when the original source or best available original asset can be read. Render planning avoids cascaded generational re-encoding and will use a quality/performance-balanced default policy in a future export-profile slice. Quality, throughput, file size and target constraints are co-equal inputs; no future optimization may silently violate the selected quality contract. [ADR 0013](adr/0013-nondestructive-editing-quality-performance.md) is the specific authority for this policy.

### Composition Engine

- All composition implementations remain behind `CompositionEngineAdapter`
- HyperFrames and the Remotion-based composition behavior documented by the public [`fillrochaa/edvid` `SKILL.md`](https://github.com/fillrochaa/edvid/blob/main/SKILL.md) must be benchmarked before a default engine is selected
- HyperFrames is the preferred candidate only if it demonstrates parity or superiority for the required visual and editorial matrix
- Remotion is an eligible candidate rather than a current CEVRA dependency; it is neither mandatory nor prohibited
- Engine preference cannot override quality, automation, exact timing or editorial capability

The EDVID evidence is functional and technical: its public `SKILL.md` describes Phase 2/3 Remotion visuals and audio, defines Phase 2 as Remotion-only, describes the default pipeline as FFmpeg/Remotion, includes a `remotion/` project directory and references `remotion-best-practices`. It does not establish license compatibility for CEVRA.

The benchmark covers karaoke, static and stacked captions; headlines; split-screen; cards; images; B-roll; dynamic camera; hard zoom; slow push-in; face tracking; motion graphics; SFX; transitions; exact timing; data-driven templates; and vertical and horizontal rendering. If HyperFrames is not equivalent or better, CEVRA may select Remotion or another demonstrably suitable implementation behind the adapter. Remotion may be incorporated into commercial distribution only after review of the proposed version's then-current license and confirmation of compatibility with CEVRA's proprietary commercial model. The canon does not fix license terms, prices or thresholds.

### Transcription Engine

- faster-whisper for standard local transcription
- WhisperX for word-accurate alignment and diarization when needed
- Python dependencies installed only inside the CEVRA-managed runtime

### QA Engine

- Deterministic technical and editorial checks
- Optional agent-assisted visual and editorial review
- Evidence-bearing PASS, WARN, FAIL or UNKNOWN findings

### Interchange

- OpenTimelineIO adapter for interchange
- Future OpenCut adapter reserved until upstream APIs stabilize
- Future Premiere and Resolve adapters map through Project IR rather than bypassing it

## 7. Application and domain layers

1. Presentation — CEVRA Vids UI, preview, layered timeline, inspector, review and optional Content Intelligence surfaces.
2. Application — use cases, Project services, history, export orchestration, preset planning, agent requests, content workflows and content-to-project handoff.
3. Domains — Project IR, Content Intelligence and future independent product domains, each with typed operations, validation, migrations and capabilities.
4. Infrastructure — media, composition and transcription engines; managed runtimes; filesystem; updater; secure storage; providers and stores.
5. Agent Gateway — provider-neutral coordination for embedded and external agents, exposing typed CEVRA commands rather than direct engine or provider access.
6. Orbit Platform — optional shared identity, licensing, entitlement, package, update, recommendation, sync and future cross-product services.

Project IR and Content Intelligence are separate domains. Neither is the persistence model of the other. Workflow Presets orchestrate application commands but do not own project state. Orbit platform services do not own Vids domain state.

## 8. Agent architecture

```text
CEVRA Vids UI
      ↓
Agent Gateway
  /      |       \
Codex  Claude  Local / future
      ↓
typed CEVRA commands
      ↓
Project IR
```

Initial integration paths are:

1. embedded Codex inside CEVRA Vids when an official supported mechanism, such as Codex App Server or its supported harness, is technically and commercially appropriate;
2. external Codex with a CEVRA Skill;
3. external Claude Code with a CEVRA Skill.

The gateway remains ready for a future official Claude embedded path and other local or remote agents. Embedded Codex and external Codex using a skill are distinct integration modes. CEVRA does not claim that EDVID uses Codex App Server without evidence.

Agents plan and request typed application commands. They do not mutate Project IR directly, bypass journal/history, invoke arbitrary shell commands or access engines through raw arguments.

## 9. CEVRA-owned skills

CEVRA Vids may detect supported local agent installations and, only after explicit user authorization, install, update, reinstall or remove CEVRA-owned skills. Known locations are `~/.claude/skills/` for Claude Code and `$CODEX_HOME/skills/`, normally `~/.codex/skills/`, for Codex.

Skill management uses an owner-scoped manifest with version, hashes, minimum and maximum compatibility, rollback metadata and provenance. It never modifies non-CEVRA skills, follows destructive symlinks, blindly overwrites a Git checkout, removes user configuration or secrets, or requires administrator privileges when user-scoped installation is possible. An embedded agent may use an internal skill or control surface without global installation.

### 9.1 Creator Skill standalone runtime

The Creator Skill is an agent-native product surface, distinct from the Bridge Skill. Creator Full must be able to produce and export a final local video without requiring CEVRA Vids Desktop to be installed, open or running.

Creator is distributed with access to a compatible standalone form of the **same reusable CEVRA Core** consumed by Vids. Reusable application/domain/runtime capabilities needed by Creator must therefore remain callable without React/Tauri presentation state. Desktop and Creator do not own separate audiovisual semantics, Project IR variants, FFmpeg runtimes or editorial engines.

The final local process/IPC packaging is intentionally deferred. “Headless” here is a separation-of-concerns requirement, not a commitment to a daemon or service architecture.

Claude Code is the first priority external Creator host, but the Creator contract and Core are provider-neutral. Codex, local/self-hosted and future compatible hosts target the same Agent Protocol and typed CEVRA capabilities.

The user-facing Creator experience should preserve EDVID-level directness: natural-language request, strategy/approval when applicable, execution, preview, conversational refinement and final local result. CEVRA's internal Project IR, engines, schemas and runtime topology are not exposed unless an advanced diagnostic/developer surface explicitly requires them.

See [ADR 0021](adr/0021-creator-skill-runtime-topology.md).

## 10. Content Intelligence

Content Intelligence is an optional, provider-neutral domain within Orbit. It preserves research, source records, signals, questions, trends, ideas, briefs, scripts, future analytics feedback, future publishing providers and future content memory. It may serve CEVRA Vids and other Orbit products through application services and stable references.

It remains separate from Project IR and never blocks Vids import, edit, preview or export. Specialized profiles such as health, business or creator behavior belong in versioned configuration, skill or policy packs rather than generic domain logic. Storage and provider choices require later implementation decisions.

## 11. Workflow and Production Presets

- Versioned declarative schema at the application and orchestration layer
- Closed typed step vocabulary resolving to approved commands and providers
- Stable references to reusable style, caption, composition and export profiles
- Journal records for preset ID, version, resolved parameters and relevant provenance
- Common validation and privilege boundaries for built-in and user-created presets
- Explicit desktop and mobile capability planning
- No arbitrary code, shell, raw FFmpeg arguments, filtergraphs or credentials
- Independent operation without Content Intelligence or Marketplace

Content Intelligence may later recommend or associate a preset. Marketplace may distribute specialized presets and packs, but neither owns preset execution or removes core Vids capabilities.

## 12. Generative assets

Image, video and future audio or creative generators implement provider contracts. Asset planning prefers, when available:

1. existing project assets;
2. stock or local resources;
3. native host generation covered by the user's entitlement;
4. local models;
5. optional external or BYOK providers.

CEVRA Vids remains useful without a paid generative provider. Generated results enter Project IR and the timeline as ordinary editable assets with provenance.

## 13. Creative Intelligence and progressive disclosure

```text
CEVRA Creative Intelligence
├── Core Editorial Director
├── Editing Director
├── Generative Director
├── Creative Playbooks
└── Providers
```

A router selects only the skills and playbooks relevant to the current task. It does not load every creative capability into the agent context simultaneously. Playbook categories may include Cinematic, Product, Fashion, Property, Food, Social Hook, Motion Graphics, Music, Anime, Cartoon, 3D/CGI and future categories.

Before incorporating an external skill, CEVRA verifies source, version, license and commercial compatibility. MIT, Apache and BSD sources are preferred. Paid or proprietary skills, including BUDOSKILL, are not copied or redistributed without an explicit license. Public descriptions may guide an original implementation; permissive public skills may be studied or reused according to their licenses.

## 14. Marketplace and package direction

Marketplace belongs to Orbit. The Vids core must be excellent and complete; Marketplace provides specialization and expansion. It cannot sell back basic functionality needed to reach the improved EDVID baseline.

Future Marketplace categories may include advanced Editorial Skills, vertical packs, Workflow Presets, Style Packs, Caption Packs, Composition Packs, Brand Packs, automations, provider integrations and future Orbit products. Premium specialization may include Medical Creator Pro, Luxury Property Film, Automotive Commercial, Fashion Editorial, Product Launch Pro, Documentary Director, UGC Conversion and advanced Anime, CGI or Comic packs.

The reserved conceptual package layout is:

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

The conceptual manifest includes `id`, `publisher`, `version`, minimum and maximum CEVRA compatibility, capabilities, permissions, platforms, dependencies, license, signature and entitlement metadata. Built-in packages, first-party premium packages and future third-party packages share this technical foundation; entitlement and distribution differ.

No Marketplace, store, billing or package runtime is implemented by this canon. Future packages are signed, versioned and capability-limited. Third-party packages receive no arbitrary shell, network or filesystem access by default.

## 15. Desktop and mobile

Desktop is the complete local workstation. Mobile supports browsing, preview, review, lightweight edits, presets and platform-compatible local functions. Heavy work may be delegated to a paired trusted desktop node. Domain code never assumes desktop-only filesystem paths, and the desktop Python runtime is not a mobile requirement.

Mobile and Vids remain useful without unimplemented Orbit services. Workflow and package semantics stay platform-neutral, while each operation declares its capability needs. Platform availability must be reported explicitly rather than silently changing results.

## 16. Updates, compatibility and security

- Signed application updates
- Independently versioned, pinned managed-runtime components
- Reviewed dependency updates through pull requests and CI
- Explicit Project IR, Workflow Preset, Content Intelligence and future package migrations
- Secrets in OS-backed secure storage
- No credentials in Project IR, presets, content records, packages or logs
- Allow-listed typed agent and preset actions
- Scoped provider credentials and permissions
- Signed, versioned and capability-limited future packages
- No arbitrary shell access from user or third-party-package surfaces
- Integrity verification for downloaded components

## 17. Licensing and intellectual property

CEVRA-owned source is proprietary and all rights are reserved unless a file states otherwise. Permissive dependencies and source reuse require exact source, version, license, modifications and notices. EDVID MIT source may be reused with required provenance and attribution; its branding and trade dress are not copied. Auroq and other proprietary or unlicensed products remain clean-room behavior references unless separately licensed.

External creative skills follow the same provenance rule. Public capability descriptions do not authorize copying proprietary implementation. Third-party licenses and notices remain tracked in `THIRD_PARTY_LICENSES.md` and `NOTICE` when code or redistributed artifacts are incorporated.

## 18. Roadmap priority

### Track A — CEVRA Vids

Foundation / Media Runtime → architecture canon → EDVID parity → editorial intelligence → agent integration → UI/timeline → composition benchmark → generative assets core → CEVRA Vids 1.0.

### Track B — Orbit Platform

Package format → identity/licensing → entitlements → Marketplace → recommendations → future shared services.

### Track C — Creative Ecosystem

Built-in skills → first-party premium packs → Marketplace → third-party SDK and publisher system.

### Track D — Expansion

Mobile → additional CEVRA apps → sync, publishing and analytics → broader Orbit.

Orbit, Marketplace, mobile, dozens of creative packs and complete provider coverage must not delay CEVRA Vids once its primary flow is solid:

```text
import
→ ask AI
→ automatic edit
→ layered editable timeline
→ preview / review
→ export
```

## 19. Stability policy

External libraries and services may change. Stable contracts are Project IR, command API, history and journal, Workflow Preset semantics, Content Intelligence contracts, package semantics when implemented, provider interfaces, migrations, adapters and observable UX behavior. Upstream changes should require adapter, runtime or provider work rather than product rewrites.
