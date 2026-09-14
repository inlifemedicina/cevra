# ADR 0014 — Multi-Source Transcript Semantics

Status: Accepted
Date: 2026-09-14

Accepted after independent adversarial review and remediation of deterministic migration, transcript state identity, stale asynchronous promotion, `TranscriptState` public compatibility, speaker coverage and migration-quarantine semantics.

## Context

Project IR v1 stores many `SourceAsset` records but only one global `TranscriptState`. That shape cannot state which source was transcribed and cannot safely represent projects with multiple videos, audio recordings, takes or retranscription results.

Local Transcription Engine V1 intentionally stops at a validated `TranscriptionResult`. It does not persist transcripts because source association, migration and history semantics must be decided first. Future work also needs to support native model timing, forced alignment, speaker attribution, manual correction, cache reuse and derived editorial reasoning without turning engine files or cache entries into a second source of truth.

EDVID remains the functional baseline for local transcription, word-level editing, safe word-boundary cuts, compact reasoning projections and transcript caching. CEVRA improves on EDVID by using source-scoped canonical state, typed commands, ProjectHistory and content-aware cache validation instead of implicit single-file state or existence-only cache hits.

This ADR accepts the semantic model only. It does not implement Project IR v2.

## Existing constraints

- Project IR is the sole canonical editable audiovisual state.
- Every durable mutation uses typed commands and preserves journal, snapshots, undo, redo and recovery.
- `ProjectIRv1` contains `sources: SourceAsset[]` and one global `transcript: TranscriptState` without `sourceId`.
- `SourceAsset.kind` is `video`, `audio` or `image`; only audio and video can own speech transcripts.
- Transcript word and segment times are integer, non-negative, source-relative milliseconds with `endMs > startMs`.
- Local Transcription Engine V1 returns `wordTiming: "none" | "model"`; model timing is not forced alignment.
- Current engine-generated word and segment IDs are deterministic within one result but may repeat across different sources. Cross-source references therefore require source scope.
- ProjectHistory stores full validated snapshots and journaled commands. Project package loading migrates every snapshot as well as the active project.
- Project IR migrations are pure and deterministic functions of the input document. They cannot depend on a clock, random generator, environment, network, filesystem or mutable process state.
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

When implemented in a future Project IR version, replace the global v1 transcript with conceptually:

```text
ProjectIR
├── sources[]
└── sourceTranscripts[]
    ├── sourceId
    ├── transcriptDigest
    ├── language?
    ├── wordTiming
    ├── speakerState
    ├── words[]
    ├── segments[]
    ├── provenance
    └── extensions?
```

There is **zero or one canonical `SourceTranscript` per eligible source**. `sourceId` is both the required relationship and the aggregate identity. The first version does not add an independent transcript object `id`: it would duplicate the unique `sourceId` key without enabling a required behavior. If durable alternative transcript objects are approved later, those candidates may receive separate result IDs outside this canonical slot.

`transcriptDigest` is not an object ID. It is the deterministic cryptographic identity of the current transcript's semantic state. It changes when semantically relevant content changes, including language and timing semantics, text, word/segment IDs and ordering, timings and speaker assignments. Its calculation excludes the digest itself, operational metadata and provenance timestamps or details that do not change transcript semantics. The exact digest algorithm and canonical serialization are fixed by the Project IR v2 implementation proposal and covered by compatibility vectors before implementation.

Word and segment IDs are unique within their source transcript. A durable reference that must verify transcript identity uses `{ sourceId, transcriptDigest, wordId }`, `{ sourceId, transcriptDigest, segmentId }` or `{ sourceId, transcriptDigest, range }`. IDs are not assumed globally unique across transcripts. If the expected digest differs from the current source transcript digest, resolution fails closed instead of silently retargeting a reused word or segment ID.

`language` records the resolved transcript language when known. It remains optional so an accepted no-speech result can be represented without inventing a detected language. The presence of a source transcript with empty words and segments plus valid provenance can mean “transcription completed and no speech was found”; the v1 factory's empty global default does not carry that meaning and must not be migrated into such a record.

### Minimum semantic fields

The future aggregate should contain:

- `sourceId`: required and immutable for the aggregate;
- `transcriptDigest`: required deterministic digest of semantic transcript state;
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
  inputTranscriptDigest? # required when the stage consumes existing transcript state
  createdAt?
  fromSchemaVersion?  # required when kind = migration
  toSchemaVersion?    # required when kind = migration
```

Stage entries are bounded current-state provenance, not an append-only audit log. Real execution stages may record `createdAt`; a migration stage does not invent a timestamp and records deterministic `fromSchemaVersion` and `toSchemaVersion` values instead. ProjectHistory owns prior canonical versions and the journal owns mutation history. Backend-specific details belong in namespaced extensions and cannot be required to interpret core semantics.

## `TranscriptState` public compatibility

`TranscriptState` remains exported and backward-compatible. It is already part of `@cevra/project-ir`, is referenced by `@cevra/contracts`, and is the transcript payload returned by Local Transcription Engine V1.

Project IR v2 changes where accepted transcripts live in a project; it does not break the engine payload:

```text
before: ProjectIR.transcript: TranscriptState
future: ProjectIR.sourceTranscripts: SourceTranscript[]
engine: TranscriptionResult.transcript: TranscriptState
```

`SourceTranscript` composes or reuses the `TranscriptState` payload and adds source relationship, timing/speaker semantics, state identity and bounded provenance. The application associates a validated engine result, including its `wordTiming`, with a source and constructs the complete `SourceTranscript` before invoking a typed command.

## Source relationship

- Every canonical source transcript references exactly one existing `SourceAsset` by `sourceId`.
- Video and audio sources may own transcripts. Image sources may not.
- At most one `SourceTranscript` may use a given `sourceId`.
- A transcript for an unknown source, an image source or a duplicate source relationship is invalid.
- Word and segment timestamps are relative to the referenced original source, never to the assembled project timeline.
- When the source has `durationMs`, every word and segment must end at or before that duration. Any backend/container rounding adjustment belongs in a bounded, tested application normalization step before the command; Project IR stores only valid final values.
- When a source checksum exists, transcript provenance must record the same checksum. A mismatch is stale state and fails closed. Persistence may exist without a checksum, but durable cache reuse may not claim content identity from URI alone.
- Removing a source removes its owned transcript atomically as an explicit part of the future `source.remove` command semantics, after existing clip/graphic/generation reference checks pass. No internal transcript-removal command is emitted for this cascade. The journal and snapshot make the cascade auditable, and undo restores both source and transcript from the prior snapshot. This prevents orphans and avoids a two-command intermediate state.
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

- `none`: no word or segment has a `speakerId`. An empty/no-speech transcript is always `none`.
- `complete`: every relevant word and segment has a `speakerId`, and each segment speaker is coherent with all of its words. A segment containing words assigned to different speakers cannot claim one complete segment speaker.
- `partial`: at least one assignment exists, but the `complete` predicate is not satisfied.

The state describes coverage, while optional `speakerId` fields carry assignments. It does not name a diarization engine, and this ADR does not introduce a speaker registry.

## Command surface

The minimum future command surface is:

```text
transcript.set
  transcript: complete SourceTranscript

transcript.remove
  sourceId
```

`transcript.set` creates the first canonical transcript or atomically replaces the existing transcript for the same source. It covers initial transcription, retranscription, alignment upgrade and whole-result manual correction. Validation occurs before history mutation and rejects unknown/ineligible sources, source mismatches, invalid timing, invalid speaker coverage, duplicate IDs, incorrect `transcriptDigest` and stale checksum provenance.

`transcript.remove` removes the canonical transcript for an existing source. It rejects an unknown source or missing transcript rather than creating a meaningless journal revision.

Do not initially add separate `add`, `replace`, `patch`, per-word or per-segment commands. A granular patch command may be proposed when actual transcript-editing UX establishes its conflict, payload and reference semantics. Until then, a complete aggregate replacement is simpler and deterministic.

All commands pass through `ProjectHistory.commit`. No engine writes Project IR directly, and no transcript file or cache hit mutates the project without a typed command.

## History, undo and redo

- First transcription: `transcript.set` creates the source's canonical aggregate in one journaled revision.
- Retranscription: a new validated candidate replaces that source's aggregate through another `transcript.set` revision; the prior value remains in history rather than beside it in current Project IR.
- Alignment: a successful aligned candidate replaces the source transcript through `transcript.set`, changes `wordTiming` to `aligned`, and records alignment provenance. It carries the `inputTranscriptDigest` it consumed and can be promoted only while that digest still equals the current transcript digest. A failed or stale alignment leaves current Project IR unchanged.
- Removal: `transcript.remove` creates one revision; source removal atomically includes deletion of the owned transcript.
- Undo and redo restore the complete transcript aggregate and all source relationships from snapshots.
- Future downstream canonical objects that reference a word, segment or range carry the source ID and expected transcript digest. They must either remain valid across replacement or be updated in the same application transaction. A digest mismatch or replacement that would leave stale references fails closed.

Candidate comparison is an application/cache concern. Selecting a candidate is the mutation; generating candidates is not.

## Migration strategy from Project IR v1

The future migration must be a pure, deterministic, document-local function. For any input `x`, separate calls to `migrateProject(x)` must produce structurally identical output and identical stable JSON. Migration cannot read a clock, call `new Date()`, use random values, inspect environment variables, access network or filesystem state, or depend on mutable process state.

Migration is applied independently to every stored snapshot, not only `project.json`. Each snapshot uses only evidence contained in that document; ownership is never inferred from another snapshot in the archive. This ADR does not introduce an archive-wide inference or migration system. This deliberately allows an older snapshot with one eligible source to receive a canonical transcript while a later ambiguous snapshot is quarantined. Undo/redo may cross that boundary. This is accepted because it preserves data, invents no ownership, remains deterministic and fails closed. Project IR v1 normally had no typed command capable of producing a non-empty transcript, but migration still preserves any valid legacy payload found.

Old journal commands remain preserved. Project package active-snapshot equality and history revision relationships must still validate after migration. Every v1-to-v2 route removes the legacy top-level `ProjectIR.transcript` field; it must never coexist with `sourceTranscripts`. Tests cover every route with `"transcript" in migratedProject === false` and verify byte-stable canonical serialization across repeated migration.

Define a v1 transcript as empty only when `words` and `segments` are empty and `language` is absent. A language-only or otherwise populated value is non-empty data and must be preserved.

### 1. Empty transcript and zero sources

Create `sourceTranscripts: []`. Remove the v1 global field. No transcript record is invented.

### 2. Empty transcript and one source

Create `sourceTranscripts: []` regardless of source kind. The v1 empty factory state is not evidence that transcription ran.

### 3. Empty transcript and multiple sources

Create `sourceTranscripts: []`. There is no content to assign and no ambiguity to guess through.

### 4. Non-empty transcript and exactly one source

If the sole source is video or audio, bind the transcript to that source. Preserve existing word/segment IDs and language. Set `wordTiming` to `none` when there are no words and to migration-only `unknown` when words exist, because v1 cannot prove whether timing was model-native or aligned. Derive `speakerState` from the closed coverage predicates, compute `transcriptDigest` from the migrated semantic state, and add a deterministic `migration` provenance stage containing `fromSchemaVersion` and `toSchemaVersion` without a clock-derived timestamp. Copy a matching source checksum into provenance when available.

If the sole source is an image, do not bind the transcript. Treat it as unassigned legacy data as described below.

### 5. Non-empty transcript and multiple sources

Never infer the owner from array order, URI, duration, word range or timeline use. Create no canonical source transcript. Preserve the exact v1 payload in the reserved migration-only namespace `extensions["cevra.migration.v1UnassignedTranscript"]` using a closed envelope:

```text
schemaVersion
originalSchemaVersion
reason
payload
eligibleSourceIdsAtMigration
```

`payload` preserves the complete v1 `TranscriptState`; `reason` is a validated machine-readable enum; and `eligibleSourceIdsAtMigration` contains only audio/video source IDs present in that snapshot. The list records available evidence and expresses neither ownership nor probability. The envelope contains no clock-derived timestamp.

The same quarantine applies to non-empty transcripts with zero sources or only an ineligible sole image source. The namespace is reserved by CEVRA, validated specifically, ignored by normal automation and removable only through an explicit resolution flow or a defined future migration. Quarantined data is loss-preservation evidence, not canonical editable transcript state. Transcript-dependent automation remains disabled until an explicit future resolution flow binds the payload to an eligible source through validated semantics and removes the quarantine. This is fail-closed without preventing the rest of an existing project from opening.

Migration tests must cover all five cardinality cases, sole-image input, language-only legacy data, repeated deterministic migration, removal of the legacy field in every route, and a history where a single-source snapshot produces a canonical transcript while a multi-source snapshot produces quarantine. They must also cover every historical snapshot, active undo/redo cursors and package round-trip integrity.

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

An alignment operation carries `inputTranscriptDigest`. Before promotion, the application verifies `candidate.inputTranscriptDigest === current.transcriptDigest`. If alignment fails or the input digest is stale, the existing canonical transcript remains unchanged. Model-timed and aligned candidates may coexist temporarily in cache/attempt records for comparison, but only an explicit successful `transcript.set` promotes one. ProjectHistory then preserves the replaced model-timed version for undo/recovery.

Alignment may improve timing, word-boundary/token mapping, necessary segmentation and alignment metadata. It must not silently introduce materially different semantic text. A result with material textual change is a new transcription/correction candidate rather than a timing-only upgrade. The same `inputTranscriptDigest` rule applies to speaker attribution and any correction/transform stage that consumes existing transcript state.

## Source transcript and editorial transcript boundary

A source transcript represents speech in one original source and uses that source's timebase. It is canonical editable audiovisual project state once accepted through a command.

An editorial transcript or compact agent projection is derived. It may combine phrases from several source transcripts, silence/visual analysis, take scores and citations. Every durable citation uses `{ sourceId, transcriptDigest, wordId | segmentId | range }`. The projection supports take selection and cut planning but does not replace or mutate source transcripts and is not a second source of truth.

Editorial projections may be cached, but a changed source transcript makes its prior digest stale, invalidates affected citations and requires recomputation. Citations are never silently retargeted to coincidentally reused IDs. A correction discovered in an editorial view must return through a typed source-transcript or future editorial command, not be written only into the projection.

## Storage scale

Whole-transcript `transcript.set` is acceptable initially because it gives one deterministic, undoable aggregate mutation. Before long-form scale or release, benchmark real workloads and measure package size, snapshot growth, save/load latency and undo/redo latency. Do not invent a threshold before evidence exists.

Any later storage optimization must preserve exactly the same domain semantics, ProjectHistory behavior, undo/redo and recovery. This ADR does not propose event sourcing, a database rewrite or a replacement persistence architecture.

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

- Project IR v2 and package history migration will require careful deterministic snapshot and journal compatibility tests.
- Whole-transcript commands and snapshots may be large; storage optimization must preserve command/history semantics rather than weaken them.
- Migration quarantine needs a later resolution workflow and clear user-facing diagnostics.
- Replacing a transcript can invalidate future word/segment references, so dependent mutations must use transcript digests and eventually support atomic validation/update.
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

## Open questions for the implementation proposal

1. Exact digest algorithm, canonical semantic serialization, compatibility vectors, final field names, limits and closed validation schema for provenance and migration quarantine.
2. The explicit user/application resolution flow for quarantined ambiguous v1 transcripts.
3. Whether transcript editing UX eventually needs a granular typed patch command; no such command is justified yet.
4. Evidence-based storage scaling thresholds after long-form benchmarks; no persistence redesign is implied.

These questions do not reopen the accepted cardinality, source relationship, timing semantics, deterministic migration, state identity or cache boundary. They must be resolved or bounded in the implementation proposal before code begins.
