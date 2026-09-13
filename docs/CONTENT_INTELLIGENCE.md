# CEVRA Content Intelligence Architecture Foundation

## Position in the product family

Content Intelligence is an optional, provider-neutral domain within CEVRA Orbit. Earlier documents used the name **Content OS**; that name no longer identifies a superior CEVRA layer or product shell.

Content Intelligence may serve CEVRA Vids and future Orbit products. It is not required for Vids to import, edit, preview, review or export, and it never owns audiovisual project state.

## Purpose

The domain preserves research, content signals, questions, topics, trends, objections, opportunities, ideas, briefs, scripts, future analytics and performance feedback, future publishing providers and future content memory. It connects these concepts to product workflows through stable application services without turning Project IR into a general content database.

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
CEVRA Vids project
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

Content Intelligence owns a separate versioned semantic model and does not use Project IR to store:

- source records;
- comments and questions;
- signals and insights;
- trends and opportunities;
- ideas;
- briefs;
- scripts before audiovisual handoff;
- performance observations;
- content profiles;
- persistent content memory.

Associations with audiovisual projects use stable IDs and references maintained through application services. Content Intelligence can be disabled or absent without changing Vids project semantics.

## Minimal conceptual model

No persistence schema is implemented by this foundation. These concepts reserve semantic boundaries for later work.

### ContentSourceRef

Identifies content origin and provenance without embedding a provider-native response schema. Examples include manual entry, document, URL, imported transcript, comment thread, feed item or future platform API object.

### ContentRecord

Normalized source material available for analysis. It may contain text, media references, transcript references, timestamps, locale and provenance metadata.

### ContentSignal

Evidence extracted from one or more records, such as a question, objection, topic, trend, pain point, opportunity, recurring phrase or audience signal. Signals retain references to supporting records.

### ContentIdea

An editorial opportunity derived manually or from signals. It may exist without an audiovisual project.

### ContentBrief

A structured pauta or creative brief for producing content.

### ContentScript

A script or structured talking points that may later be associated with one or more audiovisual projects and versions.

### ContentPerformanceObservation

Future normalized performance evidence imported through analytics providers. Provider-native metrics remain adapter data unless promoted into a versioned normalized metric.

### ContentProfileRef

Reference to an optional specialized configuration, skill or policy pack such as health, medical, business or creator. Profile rules are not embedded in generic Content Intelligence entities.

### ContentProjectLink

An association outside Project IR core that links Content Intelligence entities to one or more product project IDs and records relationship type and provenance.

## Application and provider boundaries

### ContentSourceProvider

Normalizes material and provenance from manual, local or network sources.

### ContentIntelligenceProvider

Executes provider-neutral analysis and generation requests. Implementations may be local, deterministic, OpenAI, Anthropic, Google or future providers.

### ContentRepository

Persistence contract for Content Intelligence entities. No database or storage technology is selected.

### ContentMemoryAdapter

Future optional memory, knowledge or index boundary. It aids retrieval but is not the canonical record store.

### ContentAnalyticsProvider

Future normalized import of performance observations.

### ContentPublishingProvider

Future optional publication and scheduling capability, independent from export.

### ContentProfile

Versioned configuration, skill or policy pack consumed by application services and agents. Specialized domain logic stays outside generic core types.

## Reused architecture boundaries

- Providers follow configure/connect, healthcheck, capabilities, execute and disconnect.
- Agents and skills use typed application services and never bypass providers, repositories or Project IR command/history boundaries.
- Audiovisual mutations continue through the Project IR command and history system.
- PT-BR is the initial default; EN-US is selectable with feature parity.
- Domain types and provider contracts remain platform-neutral.
- Heavy or provider-specific implementations may vary by platform without changing semantics.

## AI provider independence

Core concepts describe tasks and normalized inputs and outputs, not vendor prompts or SDK objects. Providers may differ in model family, local or cloud execution, structured output, cost, multimodal support and context or memory strategy. Changing a provider does not require migrating Content Intelligence records.

CEVRA Vids and manual Content Intelligence workflows remain useful without paid OpenAI, Anthropic or other external APIs.

## Provenance and evidence

Derived signals and insights retain references to supporting source records so future UI and agents can explain their basis. Provider-native metadata may be preserved in namespaced extensions but is not required core state.

## Optionality

When Content Intelligence is disabled or unconfigured:

- existing projects open normally;
- manual editing works normally;
- Media, Composition, Transcription and QA continue normally;
- import, edit, preview, review and export require no Content Intelligence store or provider;
- Workflow Presets continue to execute independently.

## Future publishing and feedback

Publishing is not an MVP dependency. Export remains a complete terminal workflow. Future publishing providers consume approved exports and metadata through typed capabilities and scoped credentials.

Performance observations may update future rankings, recommendations and idea generation through application services. Historical sources, ideas and observations remain auditable; feedback does not silently rewrite prior evidence.

## Security and privacy

- Credentials remain in OS-backed secure storage.
- Providers use minimum required scopes.
- Source provenance is retained.
- Provider secrets never enter Project IR or Content Intelligence records.
- Ingestion and publishing expose clear permission and disconnect or revoke behavior.
- Sensitive profiles may impose additional policies without changing generic domain types.

## Licensing and references

CEVRA-owned Content Intelligence implementation remains proprietary and all rights are reserved. Permissively licensed source requires exact repository, version, license and provenance review plus required attribution. Public product behavior may guide independent implementation. Auroq and other proprietary or unlicensed products remain clean-room references unless separately licensed.

## Not implemented in this foundation

- concrete database or schema;
- scrapers;
- Instagram, YouTube or TikTok adapters;
- external comment ingestion;
- AI prompting pipeline;
- embeddings or vector database;
- specialized medical or business profiles;
- Content Intelligence UI;
- publishing;
- analytics collection.

These capabilities must build on the boundaries above rather than redefining them.
