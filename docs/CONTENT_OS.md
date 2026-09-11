# CEVRA Content OS Architecture Foundation

## Purpose

Content OS is CEVRA's optional Content Intelligence domain. It expands CEVRA from an audiovisual editor into a broader content creation system without making research, ideation, social integrations or publishing prerequisites for editing.

The editor remains the audiovisual core. Content OS is a peer domain that can feed the editor and later learn from content performance.

## Target lifecycle

```text
Sources
  ↓
Normalized content records
  ↓
Signals / questions / topics / trends / objections / opportunities
  ↓
Idea bank
  ↓
Brief / pauta
  ↓
Script
  ↓
Recording / import
  ↓
CEVRA audiovisual project
  ↓
Edit / versions / cuts / captions / cover / metadata
  ↓
Export
  ↓
Future publishing provider
  ↓
Future performance provider
  ↓
Feedback into Content Intelligence
```

## Domain boundary

Project IR remains the canonical source of truth only for editable audiovisual project state.

Content OS owns a separate versioned model for content-oriented records. It must not use Project IR as a generic database for:
- source records;
- comments/questions;
- signals;
- insights;
- ideas;
- briefs;
- scripts before audiovisual handoff;
- performance observations;
- content profiles;
- persistent content memory.

Associations between Content OS and audiovisual projects use stable IDs/references maintained through application services.

## Minimal conceptual model

No concrete persistence schema is implemented in this foundation. The following concepts reserve stable semantic boundaries for later implementation.

### ContentSourceRef
Identifies the origin/provenance of content without embedding a provider-native response schema.

Examples: manual entry, document, URL, imported transcript, comment thread, feed item or future platform API object.

### ContentRecord
Normalized source material available for analysis. May contain text, media references, transcript references, timestamps, locale and provenance metadata.

### ContentSignal
Evidence extracted from one or more records, for example:
- question;
- objection;
- topic;
- trend;
- pain point;
- opportunity;
- recurring phrase;
- audience signal.

Signals retain references back to supporting ContentRecords.

### ContentIdea
An editorial opportunity derived manually or from signals. It may exist independently of any audiovisual project.

### ContentBrief
Structured pauta/creative brief for producing a piece of content.

### ContentScript
Script or structured talking points. It may later be associated with one or more audiovisual projects and versions.

### ContentPerformanceObservation
Future normalized performance evidence imported through analytics providers. Provider-native metrics remain adapter-level data unless promoted into a versioned normalized metric.

### ContentProfileRef
Reference to an optional specialized profile/configuration pack such as health/medical, business or creator. Profile-specific rules are not embedded in generic Content OS entities.

### ContentProjectLink
Association maintained outside Project IR core that links Content OS entities to one or more CEVRA project IDs and records relationship type/provenance.

## Extension points reused from current architecture

### Provider lifecycle
The existing provider lifecycle — configure/connect, healthcheck, capabilities, execute, disconnect — is reused for content-source, intelligence, analytics, publishing and future memory providers.

### Agent Bridge
Agents/skills operate through typed application services. They must not bypass provider adapters, Content OS repositories or Project IR command/history boundaries.

### Project IR / command history
Content OS may request creation/linking of projects, but all audiovisual mutations continue through the existing application command/history system.

### Internationalization
All user-visible Content OS surfaces and profile metadata are PT-BR / EN-US from first implementation.

### Desktop/mobile
Domain types and provider contracts remain platform-neutral. Heavy or provider-specific implementations can differ per platform without changing Content OS semantics.

## Proposed application boundaries

### ContentSourceProvider
Normalizes source material and provenance from manual/local/network sources.

### ContentIntelligenceProvider
Performs provider-agnostic analysis/generation requests. Implementations may be local, OpenAI, Anthropic, Google or future providers.

### ContentRepository
Persistence contract for Content OS semantic entities. No database/storage technology is selected yet.

### ContentMemoryAdapter
Future optional memory/knowledge/index boundary. It may aid retrieval but is not the canonical record store.

### ContentAnalyticsProvider
Future import of performance observations.

### ContentPublishingProvider
Future publication/scheduling capability. Optional and independent from export.

### ContentProfile
Versioned configuration/skill/policy pack applied by application services/agents. Specialized domain logic is outside generic core types.

## AI provider independence

The core domain describes tasks and normalized inputs/outputs, not vendor prompts or SDK objects. AI providers may differ in:
- model family;
- local/cloud execution;
- structured-output implementation;
- cost;
- multimodal support;
- context/memory strategy.

Changing AI provider must not require migrating Content OS semantic records.

## Provenance and evidence

Content Intelligence should prefer evidence-bearing outputs. Derived signals/insights should retain references to supporting source records so future UI/agents can explain why an idea or conclusion exists.

Provider-native metadata may be preserved in namespaced extension metadata but must not become required core fields.

## Optionality

Content OS is feature-gated and optional.

When disabled/unconfigured:
- existing projects open normally;
- manual editing works normally;
- Media/Composition/Transcription/QA continue normally;
- import/edit/export do not require Content OS storage or providers.

## Future publishing

Publishing automation is explicitly not an MVP dependency. Export remains a complete terminal workflow. Future publishing providers consume exported/approved assets and metadata through typed capabilities and scoped credentials.

## Future feedback loop

Performance observations may update rankings, recommendations or future idea generation through application/intelligence services. Historical source, idea and performance records remain auditable; the feedback loop must not silently rewrite prior editorial evidence.

## Security/privacy direction

- credentials remain in OS-backed secure storage;
- providers use minimum required scopes;
- source provenance is retained;
- provider-specific secrets are never written into Project IR or Content OS records;
- future ingestion/publishing must expose clear permission and disconnect/revoke behavior;
- sensitive-domain profiles may impose additional policies without changing generic Content OS core types.

## Licensing/reference policy

CEVRA-owned Content OS implementation remains proprietary.

Permissively licensed source may be reused only after exact repository/version/license/provenance audit and required attribution. Publicly observable product behavior may inform independent implementation. Proprietary/UNLICENSED systems such as Auroq remain clean-room references unless a compatible license is obtained.

## Not implemented in this foundation

- concrete Content OS database/schema;
- scrapers;
- Instagram/YouTube/TikTok adapters;
- external comment ingestion;
- AI prompting pipeline;
- embeddings/vector database;
- specialized medical/business profile implementation;
- full Content OS UI;
- publishing;
- analytics collection.

Those capabilities must build on the boundaries above rather than redefining them.
