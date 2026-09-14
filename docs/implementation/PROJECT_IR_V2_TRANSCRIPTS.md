# Project IR v2 Multi-Source Transcripts — Implementation Plan

Status: Implementation-ready proposal
Date: 2026-09-14
Authority: [ADR 0014](../adr/0014-multi-source-transcript-semantics.md)

## Scope

This document converts accepted ADR 0014 into an exact, bounded implementation plan. It does not replace the ADR and does not implement Project IR v2.

The plan covers the v2 type model, transcript state identity, deterministic migration, validation, commands, source-removal behavior, history/package compatibility and tests. It preserves the current Local Transcription Engine V1 contract and does not add an application persistence service, alignment, cache, diarization, UI or editorial projections.

Implementation must follow:

```text
PRESERVE
→ EXTEND
→ VERIFY
→ MIGRATE ONLY IF NECESSARY
```

EDVID remains the functional/editorial baseline. Project IR remains the sole canonical editable audiovisual state, and ProjectHistory remains the only mutation/history path.

## Accepted dependencies and current constraints

- ADR 0014 is the conceptual authority and is Accepted.
- Project IR v1 has `sources: SourceAsset[]` and one global `transcript: TranscriptState`.
- `TranscriptState` is public through `@cevra/project-ir`, is consumed by `@cevra/contracts`, and is returned by Local Transcription Engine V1.
- The project package format remains version 1. Its manifest already carries a numeric `projectSchemaVersion`; Project IR schema evolution does not require a package-format bump.
- Package loading migrates `project.json` and every stored snapshot independently, then structurally compares the active migrated snapshot with the migrated active project.
- Existing journal entries are stored for audit and are not replayed during package loading.
- Current validators accept unknown top-level properties. V2 will not tighten that unrelated behavior, but it will explicitly forbid the removed legacy `transcript` property and specifically validate the reserved quarantine namespace.

## Exact type model

`TranscriptState` remains unchanged. `SourceTranscript` contains it under `transcript`; it neither extends it nor repeats its fields.

```ts
export const PROJECT_IR_SCHEMA_VERSION_V1 = 1 as const;
export const CURRENT_SCHEMA_VERSION = 2 as const;
export const TRANSCRIPT_DIGEST_VERSION = 1 as const;
export const MAX_TRANSCRIPT_PROVENANCE_STAGES = 5 as const;

export type TranscriptDigest = `sha256-v1:${string}`;
export type TranscriptWordTiming = "none" | "model" | "aligned" | "unknown";
export type TranscriptSpeakerState = "none" | "partial" | "complete";

// Public and backward-compatible.
export interface TranscriptState {
  language?: string;
  words: TranscriptWord[];
  segments: TranscriptSegment[];
}

type OptionalModelIdentity =
  | {
      modelId: string;
      modelRevision?: string;
      modelDigest?: string;
    }
  | {
      modelId?: never;
      modelRevision?: never;
      modelDigest?: never;
    };

type ExecutedTranscriptStageBase = OptionalModelIdentity & {
  executionId: Id;
  engineId: string;
  engineVersion: string;
  engineApiVersion: string;
  createdAt: ISODateTime;
};

export type TranscriptProvenanceStage =
  | (ExecutedTranscriptStageBase & {
      kind: "transcription";
      modelId: string;
    })
  | (ExecutedTranscriptStageBase & {
      kind: "alignment";
      inputTranscriptDigest: TranscriptDigest;
    })
  | (ExecutedTranscriptStageBase & {
      kind: "speaker-attribution";
      inputTranscriptDigest: TranscriptDigest;
    })
  | {
      kind: "manual-correction";
      inputTranscriptDigest: TranscriptDigest;
      createdAt: ISODateTime;
      executionId?: Id;
    }
  | {
      kind: "migration";
      fromSchemaVersion: 1;
      toSchemaVersion: 2;
    };

export interface SourceTranscriptProvenance {
  sourceChecksum?: string;
  stages: TranscriptProvenanceStage[];
}

export interface SourceTranscript {
  sourceId: Id;
  transcriptDigest: TranscriptDigest;
  wordTiming: TranscriptWordTiming;
  speakerState: TranscriptSpeakerState;
  transcript: TranscriptState;
  provenance: SourceTranscriptProvenance;
  extensions?: ExtensionMap;
}

export type V1TranscriptQuarantineReason =
  | "no-eligible-source"
  | "ambiguous-multiple-sources"
  | "incompatible-canonical-transcript";

export interface V1UnassignedTranscriptQuarantine {
  schemaVersion: 1;
  originalSchemaVersion: 1;
  reason: V1TranscriptQuarantineReason;
  payload: TranscriptState;
  eligibleSourceIdsAtMigration: Id[];
}

interface ProjectIRSharedState {
  project: ProjectMetadata;
  sources: SourceAsset[];
  timeline: TimelineState;
  captions: CaptionCue[];
  graphics: GraphicItem[];
  layouts: LayoutDefinition[];
  audio: AudioState;
  style: StyleState;
  generation: GenerationRecord[];
  history: HistoryState;
  qa: QaFinding[];
  exports: ExportRecord[];
  extensions: ExtensionMap;
}

export interface ProjectIRv1 extends ProjectIRSharedState {
  schemaVersion: typeof PROJECT_IR_SCHEMA_VERSION_V1;
  transcript: TranscriptState;
}

export interface ProjectIRv2 extends ProjectIRSharedState {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  sourceTranscripts: SourceTranscript[];
}

export type ProjectIR = ProjectIRv2;
```

`ProjectIRSharedState` is module-internal. `ProjectIRv1.schemaVersion` must stop referring to `CURRENT_SCHEMA_VERSION`, because that constant becomes `2`.

### Why composition is selected

`transcript: TranscriptState` gives the existing engine payload one exact boundary. The application can map `TranscriptionResult.transcript` without copying fields into a second shape. Aggregate metadata cannot collide with transcript content, validation and digest projection stay explicit, and `TranscriptState` remains independently importable. Extending `TranscriptState` would flatten unrelated lifecycle metadata into the payload; repeating `language`, `words` and `segments` would duplicate the public contract.

There is zero or one `SourceTranscript` per eligible source. `sourceId` is the aggregate identity; no separate transcript object ID is introduced.

## Transcript digest specification

### Algorithm and identifier

- Algorithm: SHA-256.
- Input: the canonical UTF-8 bytes defined below.
- Stored form: `sha256-v1:` followed by exactly 64 lowercase hexadecimal characters.
- Canonicalization version: `TRANSCRIPT_DIGEST_VERSION = 1`.
- `sourceId` is not part of the digest. Durable references already scope the digest by `sourceId`, and the digest identifies semantic transcript state rather than asset ownership.

The only implementation of digest construction lives in `@cevra/project-ir`:

```ts
export function computeTranscriptDigest(input: {
  transcript: TranscriptState;
  wordTiming: TranscriptWordTiming;
  speakerState: TranscriptSpeakerState;
}): TranscriptDigest;

export function createSourceTranscript(
  input: Omit<SourceTranscript, "transcriptDigest">
): SourceTranscript;
```

`createSourceTranscript` validates its input and calls `computeTranscriptDigest`. Engines/providers never supply a trusted digest. V2 validation always recalculates the digest and requires an exact match.

The SHA-256 primitive must remain synchronous and platform-neutral because command application and Project IR validation are synchronous shared-domain operations. Slice A adds a small dependency-free TypeScript SHA-256 module implementing FIPS 180-4, verified against standard NIST vectors and independently cross-checked with Node `crypto` and Web Crypto in tests. Production Project IR code does not import `node:crypto`, depend on a host-global API or add a third-party dependency merely for hashing.

### Semantic projection

The digest input is exactly this fixed projection and field order:

```ts
{
  version: 1,
  language: transcript.language ?? null,
  wordTiming,
  speakerState,
  words: transcript.words.map((word) => [
    word.id,
    word.text,
    word.startMs,
    word.endMs,
    word.speakerId ?? null
  ]),
  segments: transcript.segments.map((segment) => [
    segment.id,
    segment.text,
    segment.startMs,
    segment.endMs,
    segment.wordIds,
    segment.speakerId ?? null
  ])
}
```

Array order is semantic and is preserved. Word and segment IDs, text, times, speaker assignments, language, word-timing state and speaker-coverage state all affect the digest.

`confidence` does **not** enter digest v1. Confidence is model-derived diagnostic evidence, not the stable meaning or address of a word. Recalibration must not invalidate a durable word reference when text, timing and speaker meaning are unchanged. Confidence remains persisted and validated. If a future accepted consumer requires confidence to define semantic identity, that is a new digest version rather than a silent change to v1.

The digest excludes `transcriptDigest`, `sourceId`, provenance, timestamps, execution/engine/model identifiers, source checksum and extensions. Operational provenance therefore cannot stale editorial references by itself.

## Canonical serialization v1

The digest helper must build the fixed semantic projection above; it must not canonicalize an arbitrary object supplied by a caller.

Rules:

1. Emit one compact JSON value with no insignificant whitespace and the top-level fields in the order shown above.
2. Encode the resulting scalar stream as UTF-8 without a byte-order mark.
3. Preserve array order. Do not sort words, segments or `wordIds`.
4. Optional semantic values are represented as explicit JSON `null`; `undefined` is never serialized.
5. Times are non-negative safe integers written in base-10 with no leading zeroes. Negative zero, fractions, `NaN` and infinities are invalid before serialization.
6. Digest v1 contains no floating-point field because confidence is excluded.
7. Strings must contain valid Unicode scalar values. Unpaired UTF-16 surrogates are rejected.
8. Unicode normalization is not applied. Exact stored Unicode code points are semantic; changing normalization requires an explicit future digest version.
9. JSON strings escape quotation mark and reverse solidus, use `\b`, `\t`, `\n`, `\f`, `\r` for those control characters, and lowercase `\u00xx` for other U+0000–U+001F controls. Other Unicode scalars, including U+2028/U+2029, are emitted directly. Solidus is not escaped.

The first implementation adds frozen compatibility vectors. The test fixture contains at least:

```text
empty canonical text:
{"version":1,"language":null,"wordTiming":"none","speakerState":"none","words":[],"segments":[]}
sha256-v1:d06d7f6c29c7b410c9629378f02f8a783fb18080c00603842e2e298bcd1b557a

PT-BR canonical text:
{"version":1,"language":"pt","wordTiming":"model","speakerState":"none","words":[["w1","ação",0,500,null]],"segments":[["s1","ação",0,500,["w1"],null]]}
sha256-v1:a5baceec7680861ed2ceb3eac117c9e2c8e6ddc804c5f0f01b2035e9d869597f
```

Tests freeze the literal UTF-8 bytes and independently known `sha256-v1:<hex>` values. They also cover quote/control escaping, four-byte Unicode, order sensitivity and exclusion of confidence/provenance.

## Provenance

Provenance describes only the current canonical representation. It is not an unbounded event log; ProjectHistory owns prior versions.

- `stages` contains 1–5 entries.
- The first stage is exactly one origin: `transcription` or `migration`.
- Each stage kind appears at most once.
- Subsequent stages, when present, are ordered `alignment`, `speaker-attribution`, `manual-correction`.
- When a same-kind operation replaces an earlier stage, the candidate retains only the stage that produced the current representation and discards downstream stages invalidated by that replacement. Prior provenance remains in history.
- Execution stages require execution/engine/version/API-version/time fields. `transcription` additionally requires `modelId`. Alignment and speaker attribution may be deterministic engines without a separately named model, so `modelId`, `modelRevision` and `modelDigest` are optional there. Revision/digest fields require `modelId` and may not be empty when present.
- `alignment` and `speaker-attribution` require `inputTranscriptDigest`.
- `manual-correction` requires `inputTranscriptDigest` and `createdAt`; its optional `executionId` identifies an application execution if one exists. User/agent identity stays in the journal actor.
- `migration` requires exactly `fromSchemaVersion: 1` and `toSchemaVersion: 2`. It does not contain `createdAt`, execution, engine or model fields.
- Static validation verifies shape, order, bounds and digest syntax. Promotion-time command validation verifies that the final consuming stage's `inputTranscriptDigest` equals the current canonical digest.

If the referenced source has `checksum`, `provenance.sourceChecksum` is required and must equal it. If the source has no checksum, provenance omits `sourceChecksum`; URI alone is not promoted into a content-identity claim.

## Word timing invariants

- `none`: `transcript.words` is empty. Segments may be present, enabling segment-only transcription.
- `model`: words are non-empty, the origin is `transcription`, and no alignment stage exists.
- `aligned`: words are non-empty and an `alignment` stage exists.
- `unknown`: migration-only preservation for a legacy transcript with words. The origin is `migration`, no alignment stage exists, and normal application commands cannot create it.
- An empty/no-speech aggregate uses `none`, even if word timestamps were requested during execution; the execution request remains provenance outside timing semantics.
- A feature requiring word precision rejects or upgrades `none`/`unknown`; it never treats either as aligned.

For `model` and `aligned`, every word is referenced exactly once by one segment, every segment `wordIds` list is duplicate-free, and every referenced word interval is within that segment. The migration-only `unknown` state preserves the weaker v1-valid mapping and is not accepted as precision evidence.

## Speaker invariants

Validation derives coverage from actual `speakerId` fields and requires the declared state to equal it.

- `none`: no word or segment has `speakerId`. Empty/no-speech transcripts are always `none`.
- `complete`: the transcript is non-empty; every word has `speakerId`; every segment has `speakerId`; a segment with words has exactly one distinct word speaker and its own speaker matches it. A segment without words is complete only when it has a speaker assignment.
- `partial`: at least one word or segment has `speakerId`, but the complete predicate is false.

Regardless of declared state:

- if a segment has assigned words with different speaker IDs, the segment itself must not claim one `speakerId`;
- if a segment has a `speakerId`, every assigned word speaker in that segment must match it;
- conflicting assignments are invalid rather than merely `partial`;
- `partial`/`complete` requires a `speaker-attribution` or `manual-correction` provenance stage, except migration-only `unknown` timing where legacy speaker fields are preserved and the migration stage explains unknown origin.

No speaker registry is introduced in v2.

## Migration quarantine

The reserved top-level namespace is:

```ts
const V1_UNASSIGNED_TRANSCRIPT_EXTENSION =
  "cevra.migration.v1UnassignedTranscript" as const;
```

Its value must exactly match `V1UnassignedTranscriptQuarantine`; additional envelope keys are rejected. `payload` is validated under v1 transcript rules, not normal v2 timing/provenance rules. `eligibleSourceIdsAtMigration` is a duplicate-free, lexicographically sorted list of audio/video source IDs present in that snapshot. It expresses neither ownership nor probability.

Reasons are:

- `no-eligible-source`: the snapshot has no audio/video source, including zero sources or a sole/multiple image-only project.
- `ambiguous-multiple-sources`: the snapshot has more than one total source and at least one eligible source. This includes multiple sources with exactly one eligible source.
- `incompatible-canonical-transcript`: exactly one eligible source is also the only source, but the legacy payload cannot satisfy source-scoped v2 canonical invariants, for example it exceeds a known source duration or has contradictory speaker assignments that v1 accepted.

The second reason deliberately follows ADR 0014's “exactly one source” rule. One eligible source among several total sources is not proof of legacy ownership; v1 never recorded ownership, and migration remains fail-closed.

The quarantine is non-canonical, ignored by normal transcript automation, preserved by package/history round trips and removed only by a future explicit resolution command or migration. If a v1 input already contains this reserved key, migration fails closed rather than overwriting or trusting it.

## Deterministic v1 → v2 migration

The migration first validates the document as v1 with a version-specific validator. It clones only input data, never reads a clock/RNG/environment/network/filesystem/process state, never mutates its input and never invents `createdAt`.

```text
migrateV1ToV2(v1):
  assertValidProjectIRv1(v1)
  fail if v1 already contains sourceTranscripts
  fail if v1.extensions already owns the reserved quarantine key
  legacy = deepClone(v1.transcript)
  sources = deepClone(v1.sources)
  eligible = sources where kind is audio or video
  output = deepClone(v1), with schemaVersion = 2
  delete output.transcript
  output.sourceTranscripts = []

  if legacy words=[], segments=[], language absent:
    return assertValidProjectIRv2(output)

  if sources.length === 1 and eligible.length === 1:
    candidate = {
      sourceId: eligible[0].id,
      wordTiming: legacy.words.length === 0 ? "none" : "unknown",
      speakerState: deriveSpeakerState(legacy),
      transcript: legacy,
      provenance: {
        ...(eligible[0].checksum
          ? { sourceChecksum: eligible[0].checksum }
          : {}),
        stages: [{ kind: "migration", fromSchemaVersion: 1, toSchemaVersion: 2 }]
      }
    }
    candidate.transcriptDigest = computeTranscriptDigest(candidate)
    if candidate satisfies canonical migrated-v2 validation:
      output.sourceTranscripts = [candidate]
      return assertValidProjectIRv2(output)
    quarantine reason = "incompatible-canonical-transcript"
  else if eligible.length === 0:
    quarantine reason = "no-eligible-source"
  else:
    quarantine reason = "ambiguous-multiple-sources"

  output.extensions[reserved key] = {
    schemaVersion: 1,
    originalSchemaVersion: 1,
    reason,
    payload: legacy,
    eligibleSourceIdsAtMigration: eligible ids sorted lexicographically
  }
  return assertValidProjectIRv2(output)
```

Case disposition:

| V1 input | V2 result |
|---|---|
| Empty transcript + 0/1/N sources | No canonical transcript; no quarantine |
| Non-empty + sole video | Bind to video |
| Non-empty + sole audio | Bind to audio |
| Non-empty + sole image or 0 source | Quarantine: `no-eligible-source` |
| Non-empty + multiple total sources, including exactly one eligible | Quarantine: `ambiguous-multiple-sources` |
| Non-empty + multiple eligible sources | Quarantine: `ambiguous-multiple-sources` |
| Language-only + sole eligible source | Canonical, `wordTiming: none` |
| Segment-only + sole eligible source | Canonical, `wordTiming: none` |
| Words + sole eligible source | Canonical, `wordTiming: unknown` |
| Legacy speaker IDs | Derive state; quarantine only if assignments contradict v2 canonical invariants |
| Source checksum present | Copy exact checksum into provenance |
| Source checksum absent | Omit provenance checksum |

All routes remove the legacy `transcript` field. `project.updatedAt`, history metadata and all unrelated fields remain exactly as supplied.

Migration remains document-local and snapshot-by-snapshot. Consequently, one historical snapshot may bind a transcript while another quarantines the same legacy payload; undo/redo may cross that boundary. This is intentional and deterministic.

## V2 validation model

`validateProjectIR` dispatches by exact schema version. `assertValidProjectIRv1` is retained for migration input; `assertValidProjectIR` returns current `ProjectIRv2`.

V2 adds these checks:

- `sourceTranscripts` is an array and the legacy own property `transcript` is absent.
- Each `sourceId` is unique across source transcripts, references an existing source and names only audio/video.
- Nested `TranscriptState` preserves the public shape; IDs/text/language/speaker fields have their declared runtime types.
- Optional `language` is a trimmed non-empty string of at most 64 Unicode scalar values. Core validation does not restrict it to `pt`/`en`; engine/profile support remains an adapter capability.
- Word and segment IDs are unique within the aggregate. Each segment `wordIds` value exists and is unique within that segment.
- Times are non-negative safe integers, are not negative zero and satisfy `endMs > startMs`.
- If source `durationMs` exists, every word/segment ends at or before it.
- Normal `model`/`aligned` data maps every word to exactly one containing segment. Migration-only `unknown` retains v1's weaker referential rules.
- Declared word timing and speaker state satisfy the predicates above.
- `transcriptDigest` has exact syntax and equals recomputation.
- Provenance has 1–5 correctly ordered, non-duplicate stages with exact per-kind fields.
- Source checksum provenance obeys the source rule.
- The reserved quarantine key, when present, is an exact valid envelope; no canonical automation reads it.

V2 does not globally reject unrelated unknown top-level keys in this slice. Tightening the entire Project IR object would be an independent compatibility change because v1 accepted them. The legacy `transcript` key and the reserved quarantine envelope are checked explicitly. Domain extensions continue to belong under `extensions`.

## Command surface for the second implementation slice

```ts
export type EditCommand =
  | ExistingEditCommands
  | {
      type: "transcript.set";
      transcript: SourceTranscript;
      expectedCurrentTranscriptDigest?: TranscriptDigest;
    }
  | {
      type: "transcript.remove";
      sourceId: Id;
      expectedTranscriptDigest: TranscriptDigest;
    };
```

`transcript.set` behavior:

- The command carries a complete aggregate constructed by `createSourceTranscript`.
- Project IR recalculates and verifies its digest; no engine/provider digest is trusted.
- For first creation, `expectedCurrentTranscriptDigest` must be absent and no current aggregate may exist.
- For replacement, the expected digest is required and must equal the current digest.
- For alignment/speaker/correction promotion, the candidate's final consuming-stage `inputTranscriptDigest` must also equal the current digest.
- `unknown` is rejected for normal commands.
- Exact deep equality with the current aggregate is a no-op error and creates no journal revision.
- Equal semantic digest with changed valid provenance/extensions is a real metadata/provenance update and may be journaled without staling digest-bound references.

`transcript.remove` behavior:

- Source must exist and be audio/video.
- A current transcript must exist.
- `expectedTranscriptDigest` is required and must match.
- Removal never removes the source.
- Missing/stale removal fails before history mutation and creates no revision.

Project IR should expose a technical `ProjectCommandError` with stable codes for application mapping:

```text
PROJECT_TRANSCRIPT_INVALID
PROJECT_TRANSCRIPT_SOURCE_UNKNOWN
PROJECT_TRANSCRIPT_SOURCE_INELIGIBLE
PROJECT_TRANSCRIPT_ALREADY_EXISTS
PROJECT_TRANSCRIPT_MISSING
PROJECT_TRANSCRIPT_DIGEST_MISMATCH
PROJECT_TRANSCRIPT_STALE
PROJECT_TRANSCRIPT_NO_OP
```

The command implementation uses one shared validation/digest helper. `ProjectHistory.commit` must apply/validate the command before truncating a redo branch, then mutate history only after success. Characterization tests must prove all failed old and new commands leave redo intact. This is a minimal correctness reorder, not a history redesign.

## `source.remove` semantics

Existing clip, graphic and generation-reference blockers run first. If removal is permitted and the source exists, the same cloned next project filters both `sources` and `sourceTranscripts` by `sourceId`. It does not emit an internal `transcript.remove` command.

One journal entry and one snapshot make the cascade auditable. Undo restores source and transcript together; redo removes both. An unknown `sourceId` should be rejected as a no-op instead of creating an unrelated revision.

## Stale reference types

Future persistent consumers use these conceptual shapes:

```ts
export interface TranscriptWordRef {
  sourceId: Id;
  transcriptDigest: TranscriptDigest;
  wordId: Id;
}

export interface TranscriptSegmentRef {
  sourceId: Id;
  transcriptDigest: TranscriptDigest;
  segmentId: Id;
}

export interface TranscriptRangeRef {
  sourceId: Id;
  transcriptDigest: TranscriptDigest;
  startWordId: Id;
  endWordId: Id;
}
```

They are documented now but are not added to Project IR until a real durable consumer needs them. Current caption records are not retrofitted. A resolver compares the expected digest before resolving any ID and fails closed on mismatch; it never silently retargets reused IDs.

## Engine compatibility and application mapping

Local Transcription Engine V1 stays closed and unchanged:

```text
TranscriptionResult.transcript: TranscriptState
TranscriptionResult.wordTiming?: "none" | "model"
```

The later application persistence slice performs:

```text
validated TranscriptionResult
→ associate authorized sourceId
→ confirm source/revision still current
→ build current provenance
→ map wordTiming and derive speakerState
→ createSourceTranscript (validate + digest)
→ transcript.set with expected current digest
→ ProjectHistory.commit
```

It does not persist engine JSON/cache as a second source of truth. Neither Local Transcription Engine V1 nor Media Runtime changes in the Project IR v2 core slices.

## First implementation slice

The hypothesis combining schema, migration, commands and history is too broad for the highest-risk schema transition. It is divided into two coherent slices.

### Slice A — Project IR v2 schema and deterministic migration

Implement first:

- v1/v2 types and `CURRENT_SCHEMA_VERSION = 2`;
- nested `SourceTranscript`, timing/speaker/provenance/quarantine types;
- canonical serializer, digest helper and compatibility vectors;
- v1-specific input validation and v2 validation;
- pure v1→v2 migration and migration registration;
- v2 factory with `sourceTranscripts: []`;
- atomic `source.remove` transcript cascade, because migrated projects can already contain transcripts;
- ProjectHistory characterization with v2 snapshots;
- project-store active-project/snapshot migration, round-trip, undo/redo and cursor tests.

Do not implement `transcript.set`/`transcript.remove` in Slice A. Main remains coherent: migrated canonical transcripts can be read, validated, preserved and atomically removed with their source, while no current application path claims transcript persistence.

### Slice B — Transcript commands and history mutation

Immediately afterward, add `transcript.set`, `transcript.remove`, stable command errors, digest concurrency guards and failed-command redo preservation. Complete this before any application persistence service.

This separation isolates migration/package risk from mutation semantics without leaving orphanable state or inventing a partial application workflow.

## File-by-file implementation plan

| Slice | File | Change | Associated verification |
|---|---|---|---|
| A | `packages/project-ir/src/types.ts` | Add fixed v1 constant, v2 types, transcript semantic/provenance/quarantine types; make `ProjectIR` v2 | Compile-time v1/v2 fixtures; public `TranscriptState` import unchanged |
| A | `packages/project-ir/src/sha256.ts` | Small synchronous platform-neutral FIPS 180-4 SHA-256 primitive | NIST vectors; Node/Web Crypto cross-checks in tests |
| A | `packages/project-ir/src/transcript-digest.ts` | Fixed semantic projection, canonical UTF-8 writer, digest format, `createSourceTranscript` | Frozen vectors; Unicode, escaping, order, exclusion and tamper tests |
| A | `packages/project-ir/src/validation.ts` | Version dispatch, v1 validator for migration and complete v2 invariants | Positive/negative invariant matrix |
| A | `packages/project-ir/src/migrations.ts` | Register pure deterministic 1→2 migration and quarantine flow | Cases A–O, repeated equality, no clock/random/environment |
| A | `packages/project-ir/src/factory.ts` | Create v2 with `sourceTranscripts: []`; remove global empty transcript | Factory/schema tests |
| A | `packages/project-ir/src/commands.ts` | Add only atomic transcript filtering to permitted `source.remove` | Cascade/undo/redo tests with migrated transcript |
| A | `packages/project-ir/src/index.ts` | Export new public types/helpers without removing old exports | Consumer compile/import test |
| A | `packages/project-ir/test/project-ir.test.mjs` | Digest, validator, migration, factory, history and cascade cases | Project IR matrix below |
| A | `packages/project-store/test/project-store.test.mjs` | Mixed v1 snapshot migration, active equality, cursor, package round trip | Store/history matrix below |
| A | `packages/project-store/src/codec.ts` | No change expected; change only if tests expose a version-dispatch defect | Existing plus v1→v2 package tests |
| B | `packages/project-ir/src/types.ts` | Add exact command variants | Type/shape checks |
| B | `packages/project-ir/src/commands.ts` | Set/remove semantics and technical typed errors | Command positive/negative tests |
| B | `packages/project-ir/src/history.ts` | Validate/apply before redo truncation | Failed-command redo preservation for old/new commands |
| B | `packages/project-ir/test/project-ir.test.mjs` | Commands, staleness, no-op, replacement, remove, history | Command matrix below |

No change is planned for `packages/contracts`, `engines/transcription`, Media Runtime, Project Store types, package format, application services or i18n in either core slice.

## Bounded test matrix

### Slice A

1. Factory returns v2, has empty `sourceTranscripts`, and has no legacy property.
2. `ProjectIRv1` and unchanged `TranscriptState` remain importable; current `ProjectIR` is v2.
3. Digest frozen vectors: empty, PT-BR, four-byte Unicode and escaping.
4. Digest changes for each included semantic dimension and array order.
5. Digest does not change for confidence/provenance/extensions-only changes.
6. Digest rejects invalid Unicode, negative zero, unsafe/fractional times and malformed digest text.
7. Valid source transcripts cover `none`, `model`, `aligned`, `unknown` migration and no-speech.
8. Validation rejects unknown/image/duplicate source ownership, wrong digest and checksum mismatch.
9. Validation rejects invalid/over-duration times, duplicate IDs, missing/duplicate word references and normal timing mapping failures.
10. Validation covers every speaker predicate, conflicts, mixed-speaker segment and segment-without-words behavior.
11. Provenance tests cover each stage kind, required/prohibited fields, order, duplicate kinds and 1–5 bound.
12. Quarantine tests cover exact schema, reasons, sorted eligible IDs, reserved-key collision and persistence.
13. Migration table A–O, including language-only, segment-only, words, speaker IDs and checksum present/absent.
14. Multiple total sources with exactly one eligible remains quarantined.
15. Every route removes own property `transcript`; empty routes invent no canonical record/quarantine.
16. Same v1 input migrated twice produces deep equality and identical stable JSON, with no invented timestamp.
17. A source-removal cascade removes source/transcript together only after existing blockers pass; undo/redo restores/removes both.
18. Package migrates `project.json` and each historical snapshot independently; active migrated values remain identical.
19. Package round trip preserves quarantine, mixed migrated snapshots, old journal entries and active undo/redo cursor.
20. All existing Project IR/Project Store tests remain green.

### Slice B

1. Initial set, guarded replacement and guarded remove each create exactly one revision.
2. Unknown/ineligible source, malformed aggregate, wrong digest and duplicate ownership fail without mutation.
3. Missing/incorrect expected digest fails stale; aligned/speaker/correction input digest must match current.
4. Normal command cannot set `unknown`.
5. Exact no-op is rejected; same digest with changed valid provenance is journaled without changing reference identity.
6. Remove missing transcript/source fails without a revision.
7. Undo/redo restores complete aggregate and provenance.
8. Failed old and new commands preserve an existing redo branch.

## Backward compatibility

- Valid v1 projects continue opening through the registered deterministic migration.
- `project.json` and every snapshot migrate independently under the same pure function; the active structural comparison remains valid.
- Old journal entries remain readable because they are preserved rather than replayed, and existing command variants remain in the union.
- `TranscriptState` name and structure remain public and unchanged; `TranscriptionResult.transcript` remains compatible.
- The project package format stays at version 1; only `projectSchemaVersion` advances.
- Media Runtime, Local Transcription Engine V1 and the closed EDVID parity specification do not change.

Real risks are migration of malformed-but-previously-under-validated v1 language/speaker data, package growth from whole-transcript snapshots, accidental nondeterminism in canonical Unicode/JSON output, and redo loss if command failure occurs after history truncation. Quarantine, fixed vectors, per-version validation, package fixtures and the Slice B history reorder address these risks without a storage redesign.

## Non-goals

- Application transcript persistence/orchestration.
- Transcript-result cache or cache-key design implementation.
- Alignment/WhisperX, diarization or speaker registry.
- Editorial transcript/agent projection or cut planning.
- UI and transcript patch commands.
- Durable alternate transcript variants.
- New database, event sourcing, archive-wide migration or ProjectHistory replacement.
- Project package-format v2.
- Tightening every unknown Project IR top-level property.
- Media Runtime or transcription-engine changes.

## Implementation-ready decisions and bounded remaining questions

The type shape, digest v1, confidence exclusion, provenance union/bound, timing and speaker predicates, quarantine schema/reasons, migration cases, validation, commands, cascade, slice boundary and tests are closed by this plan.

No conceptual question blocks Slice A. Two implementation-local checks remain deliberately bounded:

1. The compatibility-vector test must calculate and freeze the expected SHA-256 literals using an independent standard implementation before merging Slice A; the canonical input bytes are already fixed here.
2. `packages/project-store/src/codec.ts` is expected to need no production change. Its migration tests decide whether a minimal version-dispatch correction is necessary; no package-format redesign is authorized.

Storage thresholds remain evidence-driven. Whole-transcript snapshots are accepted initially; before long-form release, benchmark package size, snapshot growth, save/load and undo/redo latency. Any later optimization must preserve the exact domain/history/recovery semantics above.
