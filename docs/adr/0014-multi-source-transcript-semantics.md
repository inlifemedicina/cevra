# ADR 0014 — Multi-Source Transcript Semantics

Status: Proposed
Date: 2026-09-14

## Context

Project IR v1 stores many `SourceAsset` records but only one global `TranscriptState`. That shape cannot state which source was transcribed and cannot safely represent projects with multiple videos, audio recordings, takes or retranscription results.

Local Transcription Engine V1 intentionally stops at a validated `TranscriptionResult`. It does not persist transcripts because source association, migration and history semantics must be decided first. Future work also needs to support native model timing, forced alignment, speaker attribution, manual correction, cache reuse and derived editorial reasoning without turning engine files or cache entries into a second source of truth.

EDVID remains the functional baseline for local transcription, word-level editing, safe word-boundary cuts, compact reasoning projections and transcript caching. CEVRA improves on EDVID by using source-scoped canonical state, typed commands, ProjectHistory and content-aware cache validation instead of implicit single-file state or existence-only cache hits.

This ADR proposes the semantic model only. It does not approve or implement Project IR v2.

## Existing constraints

- Project IR is the sole canonical editable audiovisual state.
- Every durable mutation uses typed commands and preserves journal, snapshots, undo, redo and recovery.
- `ProjectIRv1` contains `sources: SourceAsset[]` and one global `transcript: TranscriptState` without `sourceId`.
- `SourceAsset.kind` is `video`, `audio` or `image`; only audio and video can own speech transcripts.
- Transcript word and segment times are integer, non-negative, source-relative milliseconds with `endMs > startMs`.
- Local Transcription Engine V1 returns `wordTiming: "none" | "model"`; model timing is not forced alignment.
- Current engine-generated word and segment IDs are deterministic within one result but may repeat across different sources. Cross-source references therefore require source scope.
- ProjectHistory stores full validated snapshots and journaled commands. Project package loading migrates every snapshot as well as the active project.
- Engine, model and provider names must not define core domain semantics.
- Transcript caches and editorial projections are derived and disposable.

## Alternatives considered

### 1. One `SourceTranscript` record per source in an array

Store source-scoped transcript aggregates in `sourceTranscripts: SourceTranscript[]`, with a uniqueness constraint on `sourceId`.

**Assessment:** recommended. It follows existing Project IR collection conventions, serializes predictably, supports closed validation, and gives each source an independently replaceable aggregate without embedding engine state into `SourceAsset`.

### 2. Dictionary keyed by `sourceId`

Store `sourceTranscripts: Record<Id, SourceTranscript>`.

**Assessment:** rejected for the initial model. Constant-time lookup is not material at expected project sizes and can be added through an in-memory index. Dynamic JSON keys make closed schemas, path-specific validation, deterministic migrations and human-readable diffs less clear. They also duplicate or hide the source identity in the map key.

### 3. Transcript embedded inside `SourceAsset`

Add transcript fields directly to each source.

**Assessment:** rejected. Source identity and probed media facts have a different lifecycle from editable, replaceable transcription. Embedding couples ingest/source metadata to large derived editorial state, makes source updates carry transcript payloads, and blurs the boundary between an immutable original asset and analysis derived from it.

### 4. Multiple canonical transcript variants per source

Persist model, aligned, diarized, manually corrected and alternative-model variants simultaneously in Project IR.

**Assessment:** rejected for v2. It duplicates revision semantics already provided by ProjectHistory, complicates selection and downstream references, and risks making cached candidates competing sources of truth. Candidate results may exist in a derived cache or review attempt until one is explicitly promoted as canonical. A later product requirement for durable named alternatives requires a separate decision.

### 5. One global transcript with `sourceId` on every word and segment

Mix every source into one word/segment collection.

**Assessment:** rejected. It permits mixed language, timing quality, provenance and speaker state inside one aggregate; makes source removal and replacement expensive; and complicates validation of segment-to-word relationships. Cross-source editorial views are projections, not the canonical storage shape.

## Recommended model

If accepted and implemented in a future Project IR version, replace the global v1 transcript with conceptually:

```text
ProjectIR
├── sources[]
└── sourceTranscripts[]
    ├── sourceId
    ├── language?
    ├── wordTiming
    ├── speakerState
    ├── words[]
    ├── segments[]
    ├── provenance
    └── extensions?
```

There is **zero or one canonical `SourceTranscript` per eligible source**. `sourceId` is both the required relationship and the aggregate identity. The first version should not add an independent transcript `id`: it would duplicate the unique `sourceId` key without enabling a required behavior. If durable alternative transcript objects are approved later, those candidates may receive separate result IDs outside this canonical slot.

Word and segment IDs are unique within their source transcript. Any cross-source reference uses a compound semantic reference such as `{ sourceId, wordId }` or `{ sourceId, segmentId }`; IDs are not assumed globally unique across transcripts.

`language` records the resolved transcript language when known. It remains optional so an accepted no-speech result can be represented without inventing a detected language. The presence of a source transcript with empty words and segments plus valid provenance can mean “transcription completed and no speech was found”; the v1 factory's empty global default does not carry that meaning and must not be migrated into such a record.

### Minimum semantic fields

The future aggregate should contain:

- `sourceId`: required and immutable for the aggregate;
- `language?`: resolved provider-neutral language identifier;
- `wordTiming`: semantic timing quality;
- `speakerState`: coverage of speaker attribution;
- `words` and `segments`: validated source-relative transcript state;
- `provenance`: bounded information necessary to identify how the current canonical representation was produced;
- optional namespaced `extensions` for non-core data that is not required to interpret or validate the transcript.

The recommended provenance shape is provider-neutral and describes only the current representation:

```text
sourceChecksum?
stages[]
  kind: transcription | alignment | speaker-attribution | manual-correction | migration
  executionId?
  engineId?
  engineVersion?
  engineApiVersion?
  modelId?
  modelRevision?
  modelDigest?
  createdAt
```

Stage entries are bounded current-state provenance, not an append-only audit log. ProjectHistory owns prior canonical versions and the journal owns mutation history. Backend-specific details belong in namespaced extensions and cannot be required to interpret core semantics.

## Source relationship

- Every canonical source transcript references exactly one existing `SourceAsset` by `sourceId`.
- Video and audio sources may own transcripts. Image sources may not.
- At most one `SourceTranscript` may use a given `sourceId`.
- A transcript for an unknown source, an image source or a duplicate source relationship is invalid.
- Word and segment timestamps are relative to the referenced original source, never to the assembled project timeline.
- When the source has `durationMs`, every word and segment must end at or before that duration. Any backend/container rounding adjustment belongs in a bounded, tested application normalization step before the command; Project IR stores only valid final values.
- When a source checksum exists, transcript provenance must record the same checksum. A mismatch is stale state and fails closed. Persistence may exist without a checksum, but durable cache reuse may not claim content identity from URI alone.
- Removing a source removes its owned transcript atomically as part of the future `source.remove` behavior, after existing clip/graphic/generation reference checks pass. Undo restores both from the prior snapshot. This prevents orphans and avoids a two-command intermediate state.
- Removing only the transcript keeps the source unchanged.

## Timing semantics

The Project IR domain should represent timing quality, not a branded implementation:

```text
wordTiming: none | model | aligned | unknown
```

- `none`: no word-level timing is asserted; `words` is empty.
- `model`: word timing comes directly from a transcription model and has passed CEVRA normalization and validation.
- `aligned`: word timing has passed a dedicated forced-alignment stage and its provenance identifies that stage.
- `unknown`: preserved legacy timing whose origin cannot be proven. Normal application commands must not create this value; it exists only for safe migration of unambiguous v1 content.

`aligned` is independent of WhisperX. WhisperX may become one adapter capable of producing aligned timing, but the domain does not name or require it.

For `model` and `aligned`, words and their segment mappings must satisfy the existing temporal and referential invariants. A project feature that requires alignment, such as an automatic no-cut-inside-word guarantee at aligned precision, must reject or explicitly upgrade `none` and `unknown` rather than silently treating them as aligned.

Speaker attribution is orthogonal to word timing:

```text
speakerState: none | partial | complete
```

The state describes coverage, while optional `speakerId` fields carry assignments. It does not name a diarization engine. `partial` prevents missing assignments from masquerading as complete diarization.

## Command surface

The minimum future command surface is:

```text
transcript.set
  transcript: complete SourceTranscript

transcript.remove
  sourceId
```

`transcript.set` creates the first canonical transcript or atomically replaces the existing transcript for the same source. It covers initial transcription, retranscription, alignment upgrade and whole-result manual correction. Validation occurs before history mutation and rejects unknown/ineligible sources, source mismatches, invalid timing, invalid speaker coverage, duplicate IDs and stale checksum provenance.

`transcript.remove` removes the canonical transcript for an existing source. It rejects an unknown source or missing transcript rather than creating a meaningless journal revision.

Do not initially add separate `add`, `replace`, `patch`, per-word or per-segment commands. A granular patch command may be proposed when actual transcript-editing UX establishes its conflict, payload and reference semantics. Until then, a complete aggregate replacement is simpler and deterministic.

All commands pass through `ProjectHistory.commit`. No engine writes Project IR directly, and no transcript file or cache hit mutates the project without a typed command.

## History, undo and redo

- First transcription: `transcript.set` creates the source's canonical aggregate in one journaled revision.
- Retranscription: a new validated candidate replaces that source's aggregate through another `transcript.set` revision; the prior value remains in history rather than beside it in current Project IR.
- Alignment: a successful aligned candidate replaces the source transcript through `transcript.set`, changes `wordTiming` to `aligned`, and records alignment provenance. A failed alignment leaves current Project IR unchanged.
- Removal: `transcript.remove` creates one revision; source removal atomically includes deletion of the owned transcript.
- Undo and redo restore the complete transcript aggregate and all source relationships from snapshots.
- Future downstream canonical objects that reference word or segment IDs must either remain valid across replacement or be updated in the same application transaction. A replacement that would leave dangling references must fail closed.

Candidate comparison is an application/cache concern. Selecting a candidate is the mutation; generating candidates is not.

## Migration strategy from Project IR v1

The future migration must be deterministic, lossless and applied to every stored snapshot, not only `project.json`. Old journal commands remain preserved. Project package active-snapshot equality and history revision relationships must still validate after migration.

Define a v1 transcript as empty only when `words` and `segments` are empty and `language` is absent. A language-only or otherwise populated value is non-empty data and must be preserved.

### 1. Empty transcript and zero sources

Create `sourceTranscripts: []`. Remove the v1 global field. No transcript record is invented.

### 2. Empty transcript and one source

Create `sourceTranscripts: []` regardless of source kind. The v1 empty factory state is not evidence that transcription ran.

### 3. Empty transcript and multiple sources

Create `sourceTranscripts: []`. There is no content to assign and no ambiguity to guess through.

### 4. Non-empty transcript and exactly one source

If the sole source is video or audio, bind the transcript to that source. Preserve existing word/segment IDs and language. Set `wordTiming` to `none` when there are no words and to migration-only `unknown` when words exist, because v1 cannot prove whether timing was model-native or aligned. Derive `speakerState` from actual assignment coverage and add a `migration` provenance stage. Copy a matching source checksum into provenance when available.

If the sole source is an image, do not bind the transcript. Treat it as unassigned legacy data as described below.

### 5. Non-empty transcript and multiple sources

Never infer the owner from array order, URI, duration, word range or timeline use. Create no canonical source transcript. Preserve the exact v1 payload in a reserved migration quarantine such as `extensions["cevra.migration.v1UnassignedTranscript"]`, with a machine-readable reason and candidate source IDs.

The same quarantine applies to non-empty transcripts with zero sources or only an ineligible sole image source. Quarantined data is loss-preservation evidence, not canonical editable transcript state. Transcript-dependent automation must remain disabled until an explicit future resolution flow binds the payload to an eligible source through validated semantics and removes the quarantine. This is fail-closed without preventing the rest of an existing project from opening.

Migration tests must cover all five cardinality cases, sole-image input, language-only legacy data, each historical snapshot, active undo/redo cursors and package round-trip integrity.

## Project IR and transcription-result cache boundary

The source transcript in Project IR is the accepted editable transcript used by timeline, cuts, captions and history. A transcription-result cache is derived execution infrastructure. It may contain raw or normalized candidates, may be deleted at any time, and never becomes project state merely because a key exists.

A future durable cache key must include every input that can materially change output, at minimum:

- cryptographic source content identity;
- transcription engine and protocol version;
- model ID plus resolved model revision and artifact digest;
- requested language and material language-detection policy;
- word-timestamp request;
- normalization/result-schema version;
- forced-alignment engine/model/configuration when alignment is requested;
- diarization engine/model/configuration when speaker output is requested;
- materially relevant audio/decode or preprocessing parameters.

URI, filename, modification time or cache-file existence alone is insufficient. A cache hit must validate its key, payload schema, integrity and provenance, then pass through the same result validation as a fresh run. Promoting it still requires `transcript.set` and a normal project revision.

## Alignment boundary

Forced alignment produces a candidate upgrade to the same canonical source transcript; it does not create a second canonical transcript. The aligner consumes the referenced source plus the current or newly transcribed text, returns validated source-relative words, sets semantic `wordTiming: aligned`, and records an alignment provenance stage.

If alignment fails, the existing canonical transcript remains unchanged. Model-timed and aligned candidates may coexist temporarily in cache/attempt records for comparison, but only an explicit successful `transcript.set` promotes one. ProjectHistory then preserves the replaced model-timed version for undo/recovery.

Alignment must not silently rewrite manually corrected text. The future application flow must bind alignment to the exact input transcript state and reject stale results if that transcript changed while alignment ran.

## Source transcript and editorial transcript boundary

A source transcript represents speech in one original source and uses that source's timebase. It is canonical editable audiovisual project state once accepted through a command.

An editorial transcript or compact agent projection is derived. It may combine phrases from several source transcripts, silence/visual analysis, take scores and citations. Every citation uses source-scoped references and ranges. The projection supports take selection and cut planning but does not replace or mutate source transcripts and is not a second source of truth.

Editorial projections may be cached, but they must invalidate when an input source transcript or materially relevant analysis changes. A correction discovered in an editorial view must return through a typed source-transcript or future editorial command, not be written only into the projection.

## Consequences

### Benefits

- Multiple audio/video sources gain explicit independent transcript ownership.
- ProjectHistory supplies transcript versions without a second variant system.
- Native model timing, future forced alignment and speaker attribution remain engine-neutral.
- Existing Local Transcription Engine results map into one source-scoped aggregate without changing the engine.
- Cache entries and compact editorial views stay derived and disposable.
- Ambiguous legacy projects open without data loss and without invented source ownership.
- Source removal, transcript replacement, undo and redo have deterministic aggregate semantics.

### Costs and risks

- Project IR v2 and package history migration will require careful snapshot and journal compatibility tests.
- Whole-transcript commands and snapshots may be large; storage optimization must preserve command/history semantics rather than weaken them.
- Migration quarantine needs a later resolution workflow and clear user-facing diagnostics.
- Replacing a transcript can invalidate future word/segment references, so dependent mutations must eventually support atomic validation/update.
- Checksum-optional legacy sources cannot support strong durable cache identity until content identity is established.

## Non-goals

This ADR does not:

- accept or implement Project IR v2;
- implement migrations, commands, persistence or an application service;
- implement transcript-result cache;
- implement WhisperX, forced alignment or diarization;
- implement transcript editing UI;
- implement editorial transcript, agent projections, take selection or cut planning;
- change Local Transcription Engine V1, Media Runtime V1 or ProjectHistory;
- choose the production transcription or alignment model.

## Open questions before acceptance or implementation

1. Final field names, length/count limits and closed validation schema for provenance and migration quarantine.
2. The explicit user/application resolution flow for quarantined ambiguous v1 transcripts.
3. Whether transcript editing UX eventually needs a granular typed patch command; no such command is justified yet.
4. Storage scaling thresholds at which full transcript command payloads/snapshots need an internal persistence optimization that preserves identical domain and history behavior.

These questions do not change the recommended cardinality, source relationship, timing semantics or cache boundary. They must be resolved or bounded in the implementation proposal before ADR acceptance is followed by code.
