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
- Agent hosts: Codex, Claude Code
- Stock media: local files first; optional external stock providers
- Image generation: local provider slot
- Video generation: local provider slot
- Music/audio generation: optional provider slot
- External editor interchange: OpenTimelineIO; reserved adapters for OpenCut/Premiere/Resolve

## Content OS provider categories
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

No AI vendor is mandatory for the Content OS architecture.

### Analytics / performance
Future category for importing performance observations such as reach, retention, engagement and other provider-supported metrics. Provider-native metrics are normalized before entering the Content domain. Analytics is not part of the current MVP implementation.

### Publishing
Future category for platform publication/scheduling actions. Publishing is optional, capability-gated and independent from export. CEVRA editing/export must never require a publishing provider.

### Memory / knowledge
Future adapter boundary for persistent content knowledge, embeddings/indexes or agent memory. The Content Intelligence domain owns semantic records and references; storage/vector/model technology remains replaceable.

## Content profiles
Specialized content profiles such as health/medical, business or creator are not external providers and are not core-domain branches. They are versioned configuration/skill/policy packs consumed by application services and agents. Domain-specific medical/business rules must not be hard-coded into generic Content OS entities.

## Content-to-editor handoff
Content OS may create a brief/script/content item and request creation or association of an audiovisual project through application services. The relationship is represented by stable IDs/references outside Project IR core state. The Content OS must not bypass the editor command/history system to mutate an audiovisual project.

## Credentials
Keys/tokens are never stored in repository files, Project IR or Content Intelligence records. Use OS-backed secure storage. Providers should request the minimum scopes needed for their capability.

## Optional APIs
Any API requiring additional cost must be explicitly optional and clearly identified in onboarding/settings. Core editing remains operational without paid AI API usage. Content OS should also offer provider-independent/manual workflows where practical.

## Reference implementations and source reuse
External products may be studied for workflows and behavior. Code reuse is allowed only after exact license/provenance verification demonstrates compatibility with CEVRA's proprietary commercial distribution and all notice obligations are recorded. Auroq and other proprietary/UNLICENSED references remain clean-room functional references unless separately licensed.
