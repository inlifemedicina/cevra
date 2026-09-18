# CEVRA Integrations v1

## Principle
External APIs and local services are providers behind stable CEVRA contracts. Provider changes must not alter Project IR, Content Intelligence core domain types or UI architecture.

No social network, publishing platform, analytics vendor or AI vendor may be represented as a first-class dependency in the core domain. Provider-specific identifiers/metadata belong at adapter boundaries or namespaced extension payloads.

## Provider lifecycle
- configure/connect
- secure credential storage where required
- healthcheck
- capabilities
- execute
- disconnect

## Existing categories
- Distribution/update: signed Tauri updater with static stable/beta/dev manifests; Cloudflare R2 is first production artifact-host candidate
- Crash diagnostics: provider-neutral CrashReporterAdapter; Sentry is first candidate, opt-in only
- Product telemetry: TelemetryAdapter with NoOp default in V1; no mandatory behavioral analytics/session replay
- Identity/account: CEVRA-owned Orbit identity; V1 preference is passwordless email/magic-link or one-time code
- Entitlement/licensing: CEVRA-owned signed entitlement service with device activation and bounded offline operation
- Billing: provider-neutral BillingProviderAdapter; Paddle is first commercial candidate and Lemon Squeezy fallback, both revalidated before live launch
- Agent hosts: embedded Codex through an official supported mechanism when appropriate, external Codex with a CEVRA Skill, external Claude Code with a CEVRA Skill, and future local or remote agents
- Stock media: local files first; optional external stock providers
- Image generation: local provider slot
- Video generation: local provider slot
- Music/audio generation: optional provider slot
- Speech synthesis (TTS): optional local/external provider slot for narrated creation flows; voice cloning/digital-twin identity capabilities remain a separate future decision
- External editor interchange: metadata-first handoff through ExternalEditorHandoffCompiler; Resolve prioritizes OpenTimelineIO (.otio), Premiere prioritizes XML with AAF benchmarked as secondary; consolidation/bundles are optional and live bidirectional sync is post-V1

## Agent Gateway

Agent integrations enter CEVRA Vids through a provider-neutral Agent Gateway:

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

Embedded Codex through Codex App Server or another official supported harness is distinct from external Codex using a CEVRA Skill. External Claude Code uses the same typed application surface through a CEVRA Skill. A future embedded Claude path requires an official, commercially appropriate mechanism. No claim is made that EDVID uses Codex App Server.

Agents never bypass application commands, Project IR validation, journal/history or adapter capability checks.

## CEVRA-owned skill installation

After explicit user authorization, CEVRA Vids may install, update, reinstall or remove only its own skills in supported local-agent directories:

- Claude Code: `~/.claude/skills/`
- Codex: `$CODEX_HOME/skills/`, normally `~/.codex/skills/`

Managed skills use a CEVRA owner manifest with version, hashes, minimum and maximum compatibility, provenance and rollback metadata. Management does not modify non-CEVRA skills, follow destructive symlinks, overwrite a Git checkout blindly or remove user configuration and secrets. User-scoped installation avoids administrator privileges where possible. Embedded agents may use internal skills without global installation.

## Content Intelligence provider categories
These categories are architectural reservations. No network-specific implementation is required by the current foundation.

### Content sources
Purpose: ingest or reference source material used by Content Intelligence.

Potential implementations:
- manual input
- local text/documents
- URLs/pages
- transcripts and imported videos
- comments
- FAQ/question repositories
- feeds
- future APIs
- future Instagram/YouTube/TikTok adapters

A content-source provider returns normalized source records plus provenance. The Content Intelligence domain must not depend on the provider's native response schema.

### Intelligence / inference
Purpose: analyze normalized content and assist with extraction, clustering, ranking, ideation, briefs, scripts and future evaluation.

Implementations may use:
- local models
- OpenAI
- Anthropic
- Google
- future AI providers
- deterministic/non-AI processors where appropriate.

No AI vendor is mandatory for the Content Intelligence architecture or for CEVRA Vids core editing.

### Analytics / performance
Future category for importing performance observations such as reach, retention, engagement and other provider-supported metrics. Provider-native metrics are normalized before entering the Content domain. Analytics is not part of the current MVP implementation.

### Publishing
Future category for platform publication/scheduling actions. Publishing is optional, capability-gated and independent from export. CEVRA editing/export must never require a publishing provider.

### Memory / knowledge
Future adapter boundary for persistent content knowledge, embeddings/indexes or agent memory. The Content Intelligence domain owns semantic records and references; storage/vector/model technology remains replaceable.

## Content profiles
Specialized content profiles such as health/medical, business or creator are not external providers and are not core-domain branches. They are versioned configuration/skill/policy packs consumed by application services and agents. Domain-specific medical/business rules must not be hard-coded into generic Content Intelligence entities.

## Content-to-editor handoff
Content Intelligence may create a brief, script or content item and request creation or association of an audiovisual project through application services. The relationship is represented by stable IDs/references outside Project IR core state. Content Intelligence must not bypass the CEVRA Vids command/history system to mutate an audiovisual project.

## Generative asset planning

Image, video and future audio or creative generators implement provider contracts. Planning prefers, when available:

1. existing project assets;
2. stock or local resources;
3. native host generation covered by the user's entitlement;
4. local models;
5. optional external or BYOK providers.

Speech synthesis follows the same provider-neutral rule. Faceless/narrated creation may use a local TTS engine, a supported user-entitlement path, BYOK or a future managed provider. No voice clone/digital-twin capability is implied by generic TTS.

CEVRA Vids works without a paid generative provider. Every accepted generated result becomes a normal editable Project IR asset and timeline item with provenance.

## Credentials
Keys/tokens are never stored in repository files, Project IR or Content Intelligence records. Use OS-backed secure storage. Providers should request the minimum scopes needed for their capability.

## Optional APIs
Any API requiring additional cost must be explicitly optional and clearly identified in onboarding or settings. Core editing remains operational without paid AI API usage. Content Intelligence should also offer provider-independent and manual workflows where practical.

## Reference implementations and source reuse
External products may be studied for workflows and behavior. Code reuse is allowed only after exact license/provenance verification demonstrates compatibility with CEVRA's proprietary commercial distribution and all notice obligations are recorded. Auroq and other proprietary/UNLICENSED references remain clean-room functional references unless separately licensed.


## External editor handoff

CEVRA exports from canonical Project IR through target-specific handoff adapters. Normal handoff is metadata-first and linked to existing media to minimize size. Portable/consolidated packages reuse the approved asset-consolidation policy.

Features are classified as native, baked, approximated or unsupported; every handoff produces a report. Complex CEVRA-only visual effects should be baked selectively rather than flattening the entire timeline. Resolve uses OTIO as the primary V1 path. Premiere uses XML as the first lightweight candidate with AAF evaluated against real CEVRA fixtures.

Premiere UXP and Resolve scripting/workflow integrations are future bridges, not V1 requirements. External editors never become a second Project IR authority.


## Account, entitlement and billing

Identity, entitlement and billing are separate boundaries.

```text
CEVRA Account → CEVRA Entitlement ← Billing Provider
```

Billing provider events update the CEVRA entitlement projection through verified/idempotent webhook handling. Provider-native subscription objects do not enter Project IR.

Development builds may run on a local Development Entitlement with no billing/backend dependency. Staging introduces account/auth, entitlement service and billing sandbox. Production introduces live account/entitlement/billing.

Stable/release builds must never accept Development Entitlement or licensing bypasses.

Signed entitlement cache permits bounded offline use. On expiry after the configured grace policy, CEVRA enters Recovery Mode: project/source recovery remains possible but no new usable final video may be rendered/exported/saved.

## Distribution, crash diagnostics and telemetry

The installed editor is independent from update/crash services. Tauri's updater handles signed update artifacts behind static channel manifests in V1. Artifact hosting is replaceable; Cloudflare R2 is the first candidate.

The stable installer must satisfy the Core Runtime Closure defined in the approved decision: missing mandatory engines/runtimes/assets/models is a release failure. Optional heavy packs remain separately downloadable.

Crash reporting uses CrashReporterAdapter and is opt-in. Sentry is a candidate implementation only. Product analytics uses TelemetryAdapter and defaults to NoOp in V1. Session replay and project/media content upload are prohibited.