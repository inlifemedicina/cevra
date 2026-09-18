# CEVRA Product Specification v1

## Product family

CEVRA Orbit is the ecosystem for CEVRA products, Marketplace and future shared platform services. CEVRA Vids is Orbit's first and highest-priority product: an AI-first video editor and creator that can be purchased, installed and used independently.

Marketplace belongs to Orbit and may serve Vids and future CEVRA products. Content Intelligence is an optional provider-neutral domain that may also serve multiple products. Neither is required for Vids to deliver its primary workflow.

## CEVRA Vids product promise

The primary experience is:

```text
open CEVRA Vids
→ import or drag raw videos
→ say what you want
→ AI performs the work through typed CEVRA operations
→ layered editable timeline updates
→ preview
→ approval by default, configurable
→ refine if needed
→ export
```

CEVRA Vids is not a traditional manual editor with a chatbot attached. Manual mode supports refinement, correction, adjustment, fallback and advanced control. It does not make the user perform routine work that the requested automation can complete safely.

Every AI edit is inspectable, editable, journaled and reversible. Project IR remains the audiovisual source of truth for AI-first and manual workflows.

CEVRA Vids also supports approved creation-mode direction beyond footage-first editing: Faceless Explainer, Slideshow and Music-to-video. These are workflows on the same Project IR/timeline/composition foundations, not separate products or runtimes. Faceless may generate a script and provider-neutral TTS narration; Music-to-video remains conditional on validating a proportional local rhythm-analysis capability. Brand Kit is a V1 direction; Figma may later act as an optional importer.

## Independence requirement

CEVRA Vids remains completely usable without:

- Marketplace;
- Orbit services that are not implemented or configured;
- Content Intelligence;
- Claude;
- external Codex;
- paid OpenAI or Anthropic APIs;
- external generative providers;
- future Orbit products.

Local, deterministic and manual paths provide the supported core experience when optional agents or providers are unavailable. Future shared identity, licensing, entitlement, package, update, recommendation and sync services integrate through stable boundaries rather than turning Vids into a monolith.

## Functional baseline: EDVID

The public `fillrochaa/edvid` repository under the MIT license is the initial functional and editorial baseline for CEVRA Vids. The implementation policy is **port what works, adapt it to CEVRA architecture, test parity, then improve it**.

The expected Vids baseline includes:

- ingest and media organization;
- local transcription;
- speech and content analysis;
- automatic take selection;
- silence and error removal;
- word-boundary cuts and configurable cut padding;
- J-cuts and audio fades;
- voice leveling and mastering;
- color correction and grading;
- short-form and long-form workflows;
- captions and headlines;
- zooms and dynamic camera treatments;
- face tracking;
- B-roll and other inserts;
- photos, videos and graphics;
- automatic asset placement;
- preview;
- layered timeline;
- approval and review flow;
- manual refinement;
- export;
- deterministic technical and editorial QA.

Essential baseline capability stays in the Vids core rather than being moved into Marketplace. A future implementation that intentionally differs from proven EDVID behavior records **DIVERGÊNCIA EDVID** and explains why its result is equivalent or better. CEVRA does not copy EDVID branding, trade dress or product names. Source reuse requires exact provenance, license verification and MIT attribution.

## Layered timeline

The conceptual starting layout is:

```text
V4 — motion graphics / overlays
V3 — photos / images / B-roll
V2 — captions / headline
V1 — main video

A3 — SFX
A2 — music
A1 — voice / original audio
```

User imports, automatically found assets, generated assets and provider results become normal editable assets and timeline items in Project IR. Files produced by engines do not become a second project model.

## Non-destructive editing and quality/performance

CEVRA Vids targets a non-destructive editing experience. Users must be able to make aggressive editorial changes without progressively degrading or replacing their original media. The timeline represents editable instructions, while original sources remain immutable.

Preview must remain fast and responsive, so proxies, caches and intermediate renders may use lower-cost derived representations. These artifacts may have appropriate derived metadata or project references, but they never become canonical editable audiovisual state, an alternate source of truth, or the final-quality source. Final export must render from original sources, original assets and the best available generated assets whenever technically applicable, avoiding unnecessary cascades of lossy re-encoding.

Quality and productivity are co-equal product requirements. Higher quality must not make the editor needlessly slow when the perceptual gain is irrelevant, and faster execution must not introduce a silent material downgrade. Future export profiles reserve **Balanced / Equilibrado** as the intended default, with **Maximum Quality / Máxima Qualidade** and **Fast / Rápido** as explicit alternatives. These profiles are a target and are not implemented by this specification update.

Future social-delivery policies will be target-aware for services such as Instagram, TikTok and YouTube, seeking to preserve quality, control file size and reduce destructive downstream recompression without placing provider-specific state in Project IR.

EDVID remains the functional and editorial baseline. The non-destructive quality/performance policy is a CEVRA improvement over that baseline and does not remove proven EDVID cut, audio, timing, composition or automation behavior. [ADR 0013](adr/0013-nondestructive-editing-quality-performance.md) defines the architectural policy.

## AI and Agent Gateway

CEVRA Vids uses an Agent Gateway between the UI and agent hosts. The gateway exposes typed CEVRA application commands, which preserve Project IR validation, journal/history and recovery.

Initial integration paths are embedded Codex through an official supported mechanism when appropriate, external Codex with a CEVRA Skill and external Claude Code with a CEVRA Skill. The product remains prepared for a future official Claude embedded path and local or other agents. Embedded Codex and an external Codex skill are separate product modes. No claim is made that EDVID uses Codex App Server.

The core editor does not require an agent. Manual editing and review functions supported by the UI remain available without one.

## CEVRA-owned skill management

After explicit user authorization, CEVRA Vids may detect supported local agents and install, update, reinstall or remove only CEVRA-owned skills. Claude Code uses `~/.claude/skills/`; Codex uses `$CODEX_HOME/skills/`, normally `~/.codex/skills/`.

Managed skills carry owner, version, hash, minimum and maximum compatibility, provenance and rollback data. CEVRA does not modify third-party skills, follow destructive symlinks, overwrite Git checkouts blindly or remove user settings and secrets. User-scoped installation should avoid administrator privileges. Embedded agents may use an internal control surface without a global skill installation.

## CEVRA update lifecycle

CEVRA-managed executables, runtimes, engines and models are version-pinned, signed/verified and promoted only after compatibility tests. V1 should update first-party executable components through the signed app/runtime release rather than invent a premature hot-plugin updater. Large optional model packs may have managed independent downloads. External user software is never upgraded by CEVRA; adapters negotiate version, health and capabilities. Detailed policy lives in `UPDATE_STRATEGY.md`.

## Workflow and Production Presets

Workflow Presets are versioned application-level orchestration, not Project IR state or executable scripts. They may combine transcription, cleanup, reframing, audio normalization, captions, overlays, composition choices, QA and export profiles through approved typed steps.

Preset execution preserves Project IR, journal/history, cancellation, recovery, capability planning and PT-BR/EN-US metadata. Built-in and user-created presets share one constrained schema and privilege boundary. Presets work without Content Intelligence and Marketplace.

## Composition quality gate

Composition implementations remain behind `CompositionEngineAdapter`. HyperFrames is a preferred candidate only if it reaches or exceeds the Remotion-based behavior documented by the public [`fillrochaa/edvid` `SKILL.md`](https://github.com/fillrochaa/edvid/blob/main/SKILL.md) for captions, headlines, split-screen, cards, images, B-roll, camera movement, zooms, face tracking, motion graphics, SFX, transitions, exact timing, data-driven templates and horizontal and vertical rendering. EDVID's documented Phase 2/3 Remotion path, Phase 2 Remotion-only rule, FFmpeg/Remotion pipeline, `remotion/` layout and `remotion-best-practices` setup provide functional and technical evidence; they do not establish license compatibility for CEVRA.

If HyperFrames does not meet the benchmark, CEVRA may select Remotion or another demonstrably suitable engine behind the adapter. Remotion is neither mandatory nor prohibited and is not currently incorporated. Selection for commercial distribution requires review of the proposed version's then-current license and confirmation of compatibility with CEVRA's proprietary commercial model. The canon does not assume license terms, prices or thresholds, and engine preference does not override quality, automation or editorial capability.

Composition security uses a **typed untrusted boundary**, not one hard-coded domain type per internal effect. Agents, presets and third-party surfaces select registered capabilities/components with validated parameters. First-party registered components may internally use audited engine code behind the Composition Compiler, while engine-native state remains derived. Upstream registries are development inputs only and are never live-executed merely because a user requested an effect.

## 3D and spatial composition

CEVRA may create 2.5D/3D authored scenes through the normal Composition Engine without camera solve. When an effect must remain anchored to the filmed environment, a provider-neutral CameraSolve3DAdapter supplies derived camera trajectory/intrinsics/quality evidence to registered 3D components. Foreground-aware 3D additionally reuses SubjectMaskProvider.

HyperFrames/Three.js is the preferred path to benchmark, not an already selected production dependency. COLMAP/PyCOLMAP is the first camera-solve candidate to evaluate; neural/GPU alternatives are considered only when they offer a material benefit. Agents never submit executable Three.js/shaders/raw solver arguments.

## Caption placement and visual QA

CEVRA V1 preserves the six EDVID caption styles plus None. Extra typographic personalization is deferred to post-V1.

Caption positioning uses a progressive local planner: start with known layout/platform safe areas, escalate to face/person evidence only when needed, then to sampled subject masks for ambiguous occupancy, and reserve full temporal matting for true behind-subject effects. Placement may vary by interval while remaining visually stable; explicit user overrides are preserved.

Luminance/contrast checks serve legibility and do not replace Brand Kit/preset identity. Representative composite snapshots and deterministic Caption QA should detect overflow, clipping, layout conflicts, unsafe positioning and preview/export divergence before expensive final rendering when practical.

HeroEmphasis is an optional registered visual component layered on top of an existing caption style, not a new caption family. Its behind-subject form depends on an abstract SubjectMaskProvider and a later-approved matting implementation.

## External editor handoff

CEVRA V1 supports explicit handoff to professional editors without making them dependencies of the product. The default export is metadata-first to minimize size and duplication.

DaVinci Resolve prioritizes OpenTimelineIO `.otio`, with consolidated media or full bundles only when portability warrants the size. Adobe Premiere uses a lightweight XML route as the first candidate, with AAF benchmarked as a secondary profile.

Features that cannot be represented natively are preserved through selective baked overlays/assets when practical. Every handoff reports native, baked, approximated and unsupported features. Deep Premiere UXP/Resolve bridges and controlled import-back workflows are post-V1; live bidirectional sync is not a V1 requirement.

## Generative assets

Image, video and future audio or creative generation use provider contracts. Asset planning prefers existing project assets, then stock or local resources, host-native generation covered by the user's entitlement, local models, and finally optional external or BYOK providers.

CEVRA Vids works without a paid generative provider. Generated results enter Project IR and the timeline as ordinary editable assets with provenance.

## Creative Intelligence

CEVRA Creative Intelligence uses progressive disclosure:

```text
CEVRA Creative Intelligence
├── Core Editorial Director
├── Editing Director
├── Generative Director
├── Creative Playbooks
└── Providers
```

A router selects only the skills and playbooks relevant to the task. Potential categories include Cinematic, Product, Fashion, Property, Food, Social Hook, Motion Graphics, Music, Anime, Cartoon and 3D/CGI.

External skills require source, version, license and commercial-compatibility review. MIT, Apache and BSD are preferred. Paid or proprietary skills, including BUDOSKILL, are not copied or redistributed without an explicit license. Public descriptions may inform independent implementation.

## Content Intelligence

Content Intelligence preserves technically useful research, source, signal, question, trend, idea, brief, script, future analytics, future publishing and future content-memory concepts. It remains optional, provider-neutral, separate from Project IR and available to Vids or other Orbit products through stable application boundaries.

Disabling or omitting Content Intelligence never blocks Vids import, edit, preview, review or export.

## Account, licensing and Recovery Mode

CEVRA Account, entitlement and billing are separate platform concerns. V1 prefers passwordless identity and a CEVRA-owned signed entitlement layer; a billing provider handles payment/subscription but does not become product-domain truth.

Development builds do not require live account/billing infrastructure and may use a controlled Development Entitlement. Stable/release builds must reject that bypass. Pre-launch staging validates account, entitlement, device activation, offline/grace behavior and billing sandbox before any live commercial dependency is enabled.

Active signed entitlement may be cached for bounded offline use. After expiry/grace, Recovery Mode preserves access needed to recover the project and original assets, but **does not allow generating, exporting or saving a new usable final video**. Login/licensing does not upload or sync projects/media by itself.

Local processing is not metered per render/minute. Usage billing/credits are reserved for capabilities with genuine variable external cost.

## Marketplace

The Vids core is complete and excellent; Marketplace adds specialization and expansion. Marketplace does not sell back baseline features required for the improved EDVID parity target.

Future categories may include advanced Editorial Skills, vertical packs, Workflow Presets, Style Packs, Caption Packs, Composition Packs, Brand Packs, automations, providers and future Orbit applications. Premium examples include Medical Creator Pro, Luxury Property Film, Automotive Commercial, Fashion Editorial, Product Launch Pro, Documentary Director, UGC Conversion and advanced Anime, CGI or Comic packs.

The future `cevra-package` concept supports a manifest plus skill, workflow, composition, style, asset, provider and license areas. Its conceptual manifest includes identity, publisher, semantic version, CEVRA compatibility range, capabilities, permissions, platforms, dependencies, license, signature and entitlement metadata. Built-in, first-party premium and future third-party packages share this technical base while distribution and entitlement differ.

No store, billing or package runtime is implemented in this documentation step.

## Internationalization and versioning

PT-BR is the initial default language. EN-US is selectable by the customer and maintains feature parity. UI, messages, errors, presets, workflows and metadata use translation resources rather than scattered hard-coded strings.

Schemas, packages, skills, presets, engines and product releases use semantic `x.x.x` versions where applicable. Version numbers appear discreetly in About, Settings, diagnostics, logs and support. They are not primary visual branding.

## Roadmap and release focus

- **Track A — CEVRA Vids:** Foundation / Media Runtime → architecture canon → EDVID parity → editorial intelligence → agent integration → UI/timeline → composition benchmark → generative assets core → CEVRA Vids 1.0.
- **Track B — Orbit Platform:** package format → identity/licensing → entitlements → Marketplace → recommendations → future shared services.
- **Track C — Creative Ecosystem:** built-in skills → premium first-party packs → Marketplace → third-party SDK and publisher system.
- **Track D — Expansion:** mobile → additional CEVRA apps → sync, publishing and analytics → broader Orbit.

Orbit, Marketplace, mobile, broad provider coverage and a large playbook catalog must not delay Vids once this primary flow is solid:

```text
import → ask AI → automatic edit → layered editable timeline → preview / review → export
```

## Current scope discipline

This canon reserves architecture and product direction only. It does not implement Orbit services, Marketplace, package runtime, UI, agents, composition engines, generative providers or Content Intelligence.
