# EDVID parity audit

Status: implementation specification

CEVRA baseline: `9387ab3507355bb9c20cd17be7b27754a9059ec0`

EDVID upstream: [`fillrochaa/edvid@d8e6389db02e8de0b46ee680105c09d4250d4703`](https://github.com/fillrochaa/edvid/tree/d8e6389db02e8de0b46ee680105c09d4250d4703)

Audit date: 2026-09-13

## Scope and method

This document is the operational map for reaching the proven public EDVID baseline without importing EDVID's product identity or bypassing CEVRA's architecture. The audited EDVID revision is immutable. It was cloned outside the CEVRA repository, its full 83-file Git tree was enumerated, and every tracked source, helper, test, reference, template, data fixture, and media asset was inspected. `LICENSE` at that revision is the MIT License, copyright 2026 Creator Factory.

Evidence priority is executable code and tests, followed by the pinned `SKILL.md`, reference documents, and README. When prose and code differ, this audit records the implemented behavior. CEVRA credit requires executable code in the audited baseline. A type, interface, README, ADR, or planned package alone is not `EXISTENTE`.

The classification has two independent axes:

- **Estado atual CEVRA:** `EXISTENTE`, `PARCIAL`, or `AUSENTE`.
- **Tratamento alvo:** `PORTAR`, `MELHORAR`, or `NÃO APLICÁVEL`.

Reuse labels are planning classifications only. No EDVID source is copied by this audit:

- `DIRECT MIT`: direct or adapted reuse may be evaluated later with exact provenance, copyright notice, MIT attribution, tests, and compatibility review.
- `BEHAVIOR PORT`: preserve the observed behavior or heuristic while implementing it through CEVRA boundaries.
- `CEVRA NATIVE`: use existing CEVRA infrastructure or a native implementation that is at least equivalent.
- `N/A`: do not bring the behavior or artifact into CEVRA.

## Baseline facts and important discrepancies

- EDVID is a host-agent skill and collection of Python helpers plus Remotion templates. It is not an integrated desktop editor and does not use Codex App Server. [`agents/openai.yaml`](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/agents/openai.yaml) only supplies Codex skill metadata.
- EDVID Phase 1 renders through command-line FFmpeg. Phase 2/3 composition is Remotion-only by Hard Rule 10 in the pinned [`SKILL.md`](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/SKILL.md). This is functional evidence, not a conclusion about current Remotion licensing for CEVRA.
- `transcribe.py` defaults to `large-v3`, although surrounding help text recommends or mentions `large-v3-turbo`. Its `num_speakers` argument is accepted but not used for diarization.
- Transcript cache validity is only output-file existence. Source hash, modification time, model, language, and alignment configuration are not checked, despite prose that implies changed sources are retranscribed.
- Pexels helper code searches photos. References mention broader video insert behavior, but no Pexels video-search implementation exists at this revision.
- URL ingestion and rendering use executables from `PATH`; transcription extraction explicitly requests `libmp3lame`. Those mechanisms must not replace CEVRA's managed, integrity-checked Media Runtime.
- EDVID's installer downloads floating branches by default, has no archive digest/signature, no package manifest, no rollback, and no uninstall flow. Its older-Python tar extraction fallback lacks the Python 3.12 extraction filter.
- Preview state, edit JSON, style JSON, EDL, transcript Markdown, and `project.md` are separate files rather than one transactional model. CEVRA must map useful behavior to Project IR, typed commands, journal, snapshots, and recovery.
- Custom Remotion TSX is an intentional escape hatch in EDVID. It cannot become an arbitrary-code surface in CEVRA.

## Current CEVRA implementation inventory

The audited CEVRA baseline has real implementation in these areas:

- `packages/project-ir`: versioned audiovisual model, typed mutations, validation, journal entries, snapshots, undo/redo, and recovery.
- `packages/project-store`: persistence codecs and store behavior for the canonical model.
- `packages/contracts`: typed media, transcription, QA, composition, editor, and provider boundaries. Contracts without adapters remain scaffolding.
- `engines/media-ffmpeg`: managed private CPython worker, allow-listed RPC tools, FFmpeg/ffprobe delivery matrix, runtime-derived capabilities, cancellation, process reaping, release integrity, provenance, and macOS arm64 bundle preparation.
- `packages/application`: Media Runtime application service with request/attempt records, failure/cancellation cleanup, retry/recovery, output verification, postconditions, and Project IR/history integration for relevant mutations.
- `packages/i18n`: actual PT-BR and EN-US catalog parity, including stable media error codes.

The transcription, QA, and composition directories define adapters or direction but have no production implementation. `packages/ui` and `packages/agents` are scaffolding. Workflow presets and provider contracts are architectural preparation, not working EDVID parity.

## Capability matrix

Each row is independently implementable and testable. A destination names the expected boundary, not approval to change its architecture.

### A. Ingest and sources

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-ING-001 | ingest | Local file intake | Treats local video paths as source inputs and keeps originals outside generated edit output. | `SKILL.md`; `helpers/render.py` | PARCIAL | `packages/project-ir/src/types.ts`; no ingest service/UI | PORTAR | application ingest service | CEVRA NATIVE | Project IR, desktop filesystem | P0 | Import creates a source through a typed command without modifying the original. | Preserve URI identity and provenance. |
| EDV-ING-002 | ingest | Source discovery and organization | Scans a user media directory, groups outputs under an `edit` directory, and names derived artifacts predictably. | `SKILL.md`; `helpers/transcribe_batch.py` | AUSENTE | No source discovery implementation | PORTAR | ingest application service | BEHAVIOR PORT | desktop UI, Project IR | P0 | Supported media can be discovered, reviewed, and imported with deterministic names. | Do not make a generated folder a source of truth. |
| EDV-ING-003 | ingest | URL intake | Downloads a URL with yt-dlp and records metadata JSON. | `helpers/ingest_url.py` | AUSENTE | Provider contracts only | PORTAR | source provider adapter | BEHAVIOR PORT | network permission, yt-dlp provider | P1 | Authorized URL import yields a local Project IR source plus provenance and failure codes. | Optional provider; local editing must work without it. |
| EDV-ING-004 | ingest | URL range selection | Passes one or more download sections and forces keyframes at cuts. | `helpers/ingest_url.py` | AUSENTE | No URL provider | PORTAR | source provider adapter | BEHAVIOR PORT | URL ingest, Media Runtime | P1 | Requested ranges are exact within documented tolerance and retain source metadata. | Validate timestamps with shared limits. |
| EDV-ING-005 | ingest | Resolution-limited download | Selects best video up to a configurable height, default 1080, plus best audio. | `helpers/ingest_url.py` | AUSENTE | No URL provider | MELHORAR | source provider policy | BEHAVIOR PORT | URL ingest, capability policy | P1 | Import policy chooses a supported bounded rendition and records the chosen streams. | No silent codec assumptions. |
| EDV-ING-006 | ingest | Metadata probe | Uses ffprobe/yt-dlp metadata to expose duration, streams, dimensions, and source facts. | `helpers/ingest_url.py`; `helpers/render.py` | EXISTENTE | `packages/contracts/src/media.ts`; `engines/media-ffmpeg/src/adapter.ts` | MELHORAR | existing MediaEngineAdapter | CEVRA NATIVE | Media Runtime | P0 | Every imported source is probed through managed binaries and facts enter Project IR provenance. | Existing primitive is stronger; connect it to ingest. |
| EDV-ING-007 | ingest | Original preservation | Creates downloaded/source media separately and writes edits to derived paths. | `SKILL.md`; `helpers/ingest_url.py` | PARCIAL | Artifact safety in `packages/application/src/media-service.ts` | MELHORAR | artifact store and ingest service | CEVRA NATIVE | Project IR, artifact store | P0 | Operations never overwrite source media and protect pre-existing outputs and symlinks. | Existing Media service protection should be reused. |
| EDV-ING-008 | ingest | Batch source preparation | Transcribes multiple supported extensions serially with per-file failure isolation. | `helpers/transcribe_batch.py` | AUSENTE | No batch ingest/transcription workflow | PORTAR | workflow/application layer | BEHAVIOR PORT | ingest, transcription | P1 | Batch reports each source success/failure and can resume without repeating valid work. | Use CEVRA job records, not loose sentinel files. |

### B. Transcription

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-TRN-001 | transcription | Local WhisperX transcription | Loads WhisperX locally and transcribes extracted mono 16 kHz audio. | `helpers/transcribe.py`; `pyproject.toml` | AUSENTE | `engines/transcription/README.md` is adapter-only | PORTAR | TranscriptionEngineAdapter implementation | BEHAVIOR PORT | managed model/runtime policy | P0 | Local media produces transcript segments and words without a paid provider. | Must not reuse global Python/FFmpeg assumptions. |
| EDV-TRN-002 | transcription | Forced alignment | Runs language alignment and emits word-level start/end timing. | `helpers/transcribe.py` | AUSENTE | Transcript word types only in `packages/project-ir/src/types.ts` | PORTAR | transcription adapter | BEHAVIOR PORT | model assets, language support | P0 | Supported speech yields aligned word boundaries with measured confidence/status. | Essential for safe cuts and captions. |
| EDV-TRN-003 | transcription | Unaligned fallback | Marks alignment failure and approximates missing word boundaries from neighbors. | `helpers/transcribe.py` | AUSENTE | No transcription adapter | MELHORAR | transcription adapter | BEHAVIOR PORT | transcript validation | P0 | Alignment failure remains explicit; usable fallback never masquerades as aligned timing. | Preserve `/UNALIGNED` meaning as typed status. |
| EDV-TRN-004 | transcription | Language selection | Accepts explicit language or lets Whisper detect it. | `helpers/transcribe.py` | PARCIAL | Language fields/contracts exist; no engine | PORTAR | transcription adapter | CEVRA NATIVE | i18n, model capability | P0 | User-selected and detected language are both supported and provenance records which occurred. | UI labels require PT-BR/EN-US. |
| EDV-TRN-005 | transcription | Model selection | Supports model/device/compute configuration; actual default is `large-v3`. | `helpers/transcribe.py` | PARCIAL | `packages/contracts/src/transcription.ts`; no implementation | MELHORAR | transcription profile | CEVRA NATIVE | capability discovery, model manager | P1 | Available model profiles are capability-derived, validated, and recorded per attempt. | Do not reproduce documentation/default mismatch. |
| EDV-TRN-006 | transcription | Transcript cache | Skips work when the output JSON path exists. | `helpers/transcribe.py` | AUSENTE | No transcript cache | MELHORAR | transcription artifact cache | CEVRA NATIVE | content hashes, model provenance | P0 | Cache key includes source digest, model, language, alignment version, and schema; stale entries invalidate. | EDVID existence-only cache is unsafe. |
| EDV-TRN-007 | transcription | Batch transcription | Iterates media files, writes per-source transcripts, and continues after individual errors. | `helpers/transcribe_batch.py` | AUSENTE | No implementation | PORTAR | transcription workflow | BEHAVIOR PORT | ingest, job model | P1 | Batch is resumable, cancellable, and reports deterministic per-source state. | Serial execution is acceptable initially. |
| EDV-TRN-008 | transcription | Speaker count input | CLI accepts number of speakers but current code does not diarize or use it. | `helpers/transcribe.py` | AUSENTE | No diarization implementation | NÃO APLICÁVEL | future transcription capability | N/A | diarization provider/model | P2 | No parity claim is made for behavior EDVID does not actually implement. | UI must not expose a no-op option. |
| EDV-TRN-009 | transcription | Normalized transcript artifact | Writes structured source, language, segments, and words for later packing/rendering. | `helpers/transcribe.py` | PARCIAL | Project IR transcript shapes exist; no producer | PORTAR | transcription to Project IR mapper | CEVRA NATIVE | Project IR commands/history | P0 | Validated transcript enters Project IR through typed commands and survives persistence/recovery. | Project IR stays canonical. |

### C. Transcript intelligence

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-TXI-001 | transcript intelligence | Packed transcript | Converts verbose transcript JSON into compact Markdown with timestamps and source identity. | `helpers/pack_transcripts.py`; `SKILL.md` | AUSENTE | No transcript reasoning view | PORTAR | editorial context projector | BEHAVIOR PORT | transcript model | P0 | Agent receives a deterministic compact view without raw machine JSON. | Derived view, never source of truth. |
| EDV-TXI-002 | transcript intelligence | Phrase grouping | Groups adjacent words into readable phrases. | `helpers/pack_transcripts.py` | AUSENTE | No phrase model | PORTAR | editorial transcript model | BEHAVIOR PORT | word timestamps | P0 | Phrase boundaries are stable for the same transcript and preserve every word. | Record algorithm/version. |
| EDV-TXI-003 | transcript intelligence | Silence-based boundaries | Starts a phrase after a gap of at least about 0.5 seconds. | `helpers/pack_transcripts.py` | AUSENTE | Silence primitive only | MELHORAR | transcript segmentation service | BEHAVIOR PORT | transcript, detect-silence | P0 | Boundaries combine aligned timing and measured silence with tested tolerances. | Threshold should be configurable/profiled. |
| EDV-TXI-004 | transcript intelligence | Speaker boundaries | Separates phrases on speaker changes when speaker labels exist. | `helpers/pack_transcripts.py` | AUSENTE | Transcript types can carry segments but no diarization | PORTAR | transcript segmentation service | BEHAVIOR PORT | diarized transcript | P1 | Speaker change always creates a distinct reasoning unit without losing timing. | Capability-gated until diarization exists. |
| EDV-TXI-005 | transcript intelligence | Token-efficient agent interface | Hard rule forbids loading raw transcript JSON into agent context. | `SKILL.md`; `helpers/pack_transcripts.py` | AUSENTE | Agent Gateway not implemented | MELHORAR | Agent Gateway context API | CEVRA NATIVE | Project IR projections, permissions | P0 | Typed/projected context stays bounded, traceable, and sufficient to cite source ranges. | Stronger than filesystem Markdown handoff. |

### D. Speech and audio analysis

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-AUD-001 | speech analysis | Acoustic speech regions | Uses FFmpeg `silencedetect` to derive non-silent speech intervals. | `helpers/speech_regions.py` | PARCIAL | `detect-silence` exists in Media Runtime | MELHORAR | analysis service over MediaEngineAdapter | CEVRA NATIVE | Media Runtime | P0 | Typed silence output deterministically maps to speech intervals and Project IR source time. | Reuse existing managed primitive. |
| EDV-AUD-002 | speech analysis | Windowed voice levels | Measures RMS in roughly 21 ms windows from decoded PCM. | `helpers/voice_levels.py` | AUSENTE | No voice-level analyzer | PORTAR | QA/audio analysis adapter | BEHAVIOR PORT | managed decode, numpy-equivalent | P1 | Emits time-indexed levels with fixtures for quiet, normal, and clipped speech. | Avoid global ffmpeg and unbounded arrays. |
| EDV-AUD-003 | speech analysis | Noise-floor estimation | Estimates background floor before classifying speech activity. | `helpers/voice_levels.py` | AUSENTE | No implementation | PORTAR | QA/audio analysis adapter | BEHAVIOR PORT | level windows | P1 | Stable noise-floor estimate prevents quiet-room noise from becoming speech. | Validate varied noise fixtures. |
| EDV-AUD-004 | speech analysis | Phrase/run loudness | Computes phrase and contiguous-run levels rather than relying only on whole-file loudness. | `helpers/voice_levels.py` | AUSENTE | Loudness normalization primitive only | PORTAR | audio analysis service | BEHAVIOR PORT | transcript ranges, PCM analysis | P1 | Reports phrase/run loudness with source ranges and confidence. | Needed for targeted correction. |
| EDV-AUD-005 | speech analysis | EDL range gain suggestions | Compares selected ranges to speaker median and suggests gain capped at +12 dB. | `helpers/voice_levels.py` | AUSENTE | Volume operation exists but no planner | MELHORAR | editorial audio planner | CEVRA NATIVE | analysis, Media Runtime volume | P1 | Planner proposes bounded per-range gain and requires explicit policy before mutation. | Use typed operations, not raw filters. |
| EDV-AUD-006 | speech analysis | Low-run protection | Uses the worst audible run in a range to avoid hiding a quiet phrase behind an average. | `helpers/voice_levels.py` | AUSENTE | No implementation | PORTAR | audio analysis service | BEHAVIOR PORT | phrase/run levels | P1 | Fixtures prove isolated quiet phrases are detected inside otherwise normal clips. | Evidence should identify offending time range. |
| EDV-AUD-007 | audio analysis | Clipping and headroom facts | Verification detects peak clipping and abnormal flat samples. | `helpers/verify_cut.py` | AUSENTE | QA contract only | PORTAR | QA Engine | BEHAVIOR PORT | decoded PCM | P0 | QA reports clipping with measured peak, flat ratio, and exact interval. | Numeric evidence, not subjective-only labels. |

### E. Visual and source analysis

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-VIS-001 | visual analysis | Contact sheet | Extracts requested timestamps and tiles labeled frames into a review image. | `helpers/contact_sheet.py` | PARCIAL | Extract-frame primitive exists; no sheet builder | PORTAR | visual analysis service | CEVRA NATIVE | Media Runtime, image compositor | P1 | Deterministic sheet preserves requested source timestamps and labels. | Generated review artifact is derived. |
| EDV-VIS-002 | visual analysis | Scene-based sampling | Detects scene changes at a default threshold and samples representative frames. | `helpers/watch_video.py` | AUSENTE | No scene detector | PORTAR | visual analysis adapter | BEHAVIOR PORT | managed FFmpeg or CV | P1 | Fixtures produce stable scene boundaries with configurable sensitivity. | Capability must be typed. |
| EDV-VIS-003 | visual analysis | Keyframe/uniform fallback | Supports keyframe and uniform sampling; falls back when scene detection yields too few frames. | `helpers/watch_video.py` | AUSENTE | No orchestration | PORTAR | visual inspection planner | BEHAVIOR PORT | scene detector, probe | P1 | Sparse-scene media still yields bounded representative coverage. | Record chosen sampling mode. |
| EDV-VIS-004 | visual analysis | Perceptual frame deduplication | Reduces near-duplicate samples using 16x16 grayscale mean-difference comparison. | `helpers/watch_video.py` | AUSENTE | No implementation | MELHORAR | visual analysis adapter | BEHAVIOR PORT | frame extraction | P1 | Duplicate suppression has tested recall and never removes all coverage of a scene. | Consider stronger hash behind interface. |
| EDV-VIS-005 | visual analysis | Transcript-cued inspection | Pins visual samples around transcript phrases/terms. | `helpers/watch_video.py` | AUSENTE | No transcript/visual coordinator | PORTAR | editorial analysis service | BEHAVIOR PORT | transcript, frame extraction | P1 | A phrase citation can request nearby frames while retaining source timing. | Useful for take selection. |
| EDV-VIS-006 | visual analysis | Timeline view | Produces filmstrip, waveform, transcript, silence, and selection context for a range. | `helpers/timeline_view.py` | AUSENTE | UI/timeline not implemented | PORTAR | timeline projection | BEHAVIOR PORT | waveform, thumbnails, transcript | P0 | Timeline projection aligns all modalities to one Project IR time basis. | Native UI should supersede the static helper. |
| EDV-VIS-007 | visual analysis | LOG/color signal detection | Combines metadata and sampled pixel statistics to identify Rec.709, Apple Log, HLG, PQ, or wide-gamut SDR with confidence/evidence. | `helpers/detect_color.py` | AUSENTE | Media probe lacks editorial color classifier | PORTAR | color analysis adapter | BEHAVIOR PORT | probe, frame sampling | P1 | Classifier returns typed profile, confidence, and evidence; uncertain cases remain explicit. | Do not claim HDR/color correctness without metadata validation. |

### F. Editorial reasoning

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-EDT-001 | editorial reasoning | Material analysis before edit | Requires transcripts and visual/audio inspection before proposing an edit. | `SKILL.md` | AUSENTE | Agent Gateway/editorial intelligence not implemented | PORTAR | Editorial Director workflow | BEHAVIOR PORT | ingest, transcript, analysis | P0 | Plan cites analyzed sources and cannot skip required evidence silently. | Rules become typed workflow gates. |
| EDV-EDT-002 | editorial reasoning | Strategy proposal | Produces an editorial strategy before timeline mutation. | `SKILL.md`; `references/shortform.md`; `references/longform.md` | AUSENTE | Workflow docs only | PORTAR | Editorial Director | BEHAVIOR PORT | context projection, commands | P0 | Strategy records goal, audience, format, constraints, and selected evidence. | Persist as operation intent/provenance. |
| EDV-EDT-003 | editorial reasoning | User confirmation gate | Requires confirmation of strategy before the first edit by default. | `SKILL.md` Hard Rules 1 and 8 | AUSENTE | Product canon describes approval; no UI/service | MELHORAR | approval workflow | CEVRA NATIVE | UI, journal, agent | P0 | Configurable policy defaults to approval and logs approval/bypass reason. | Must also support user-configured autonomy. |
| EDV-EDT-004 | editorial reasoning | Take selection | Selects strongest deliveries based on meaning, delivery, and visual quality. | `SKILL.md`; preview take controls | AUSENTE | No editorial selector | PORTAR | Editorial Director | BEHAVIOR PORT | transcript, visual/audio analysis | P0 | Selected takes cite source intervals and score/reason; user can override. | No opaque destructive deletion. |
| EDV-EDT-005 | editorial reasoning | Retake/repetition removal | Identifies repeated attempts and keeps the strongest complete take. | `SKILL.md` | AUSENTE | No semantic analyzer | PORTAR | Editorial Director | BEHAVIOR PORT | packed transcript, source views | P0 | Repeated phrases are grouped and chosen/rejected ranges remain auditable. | Preserve alternatives for undo/review. |
| EDV-EDT-006 | editorial reasoning | Error and dead-space removal | Removes mistakes, false starts, and unnecessary silence while protecting speech. | `SKILL.md`; `helpers/speech_regions.py` | PARCIAL | Detect-silence and trim exist; no planner | MELHORAR | clean-edit planner | CEVRA NATIVE | transcript, silence, Media Runtime | P0 | Generated cut plan removes targets without clipped words and passes QA. | Existing runtime executes typed plan. |
| EDV-EDT-007 | editorial reasoning | Shortform strategy | Optimizes hook, pace, vertical composition, and retention. | `references/shortform.md` | AUSENTE | Canon/workflow documents only | PORTAR | shortform playbook | BEHAVIOR PORT | editorial model, composition | P1 | Test fixture yields justified hook, pacing, and composition decisions. | Avoid copying EDVID wording/identity. |
| EDV-EDT-008 | editorial reasoning | Longform strategy | Preserves natural pacing, structure, chapters, and source format. | `references/longform.md` | AUSENTE | Canon/workflow documents only | PORTAR | longform playbook | BEHAVIOR PORT | editorial model, composition | P1 | Longform fixture preserves narrative structure and produces chapter/subtitle plan. | Different profile from shortform. |

### G. Cut semantics

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-CUT-001 | cut semantics | EDL representation | Uses ordered source/start/end entries plus optional grade/gain/J-cut metadata. | `helpers/render.py`; template `edit-data.json` files | PARCIAL | Project IR clips/tracks exist; no editorial EDL mapper | MELHORAR | Project IR cut-plan projection | CEVRA NATIVE | Project IR commands | P0 | Cut plan maps losslessly to canonical clips and can be regenerated from Project IR. | Do not add a second canonical EDL. |
| EDV-CUT-002 | cut semantics | Word-boundary cuts | Hard rule forbids cuts inside a word. | `SKILL.md` Hard Rule 4 | AUSENTE | Word timestamps exist; no cut planner invariant | PORTAR | cut planner validation | BEHAVIOR PORT | aligned transcript | P0 | Every speech cut lands outside aligned word interiors or records an explicit justified override. | Core editorial invariant. |
| EDV-CUT-003 | cut semantics | Speech-boundary cuts | Combines transcript and acoustic speech regions to find safe boundaries. | `helpers/speech_regions.py`; `SKILL.md` | AUSENTE | Silence primitive only | PORTAR | cut planner | BEHAVIOR PORT | alignment, silence analysis | P0 | Cut candidates include evidence from word and acoustic boundaries. | Prefer actual silence when available. |
| EDV-CUT-004 | cut semantics | Lead/trail padding | Adds roughly 30–200 ms padding, generally more trail than lead. | `SKILL.md` Hard Rule 5 | AUSENTE | Trim supports times but no padding policy | PORTAR | cut policy | BEHAVIOR PORT | aligned transcript | P0 | Profiled padding survives frame snapping and does not overlap invalid source ranges. | Test fast and slow speech. |
| EDV-CUT-005 | cut semantics | Exact time/frame mapping | Snaps segment durations upward to frame boundaries and carries exact timeline timing. | `helpers/render.py` | PARCIAL | Media contracts validate timestamps; no editorial frame mapper | MELHORAR | cut compiler | CEVRA NATIVE | probe fps, rational time | P0 | Source and output times remain within one-frame tolerance without cumulative drift. | Prefer rational/frame units over float mutation. |
| EDV-CUT-006 | cut semantics | Multi-source cuts | Resolves relative/absolute source paths and concatenates segments from multiple files. | `helpers/render.py` | PARCIAL | Project IR sources/clips and concat operation exist | MELHORAR | cut compiler and Media Runtime | CEVRA NATIVE | Project IR, concat | P0 | Ordered clips from multiple sources render with correct offsets and provenance. | Existing runtime should execute. |
| EDV-CUT-007 | cut semantics | Take ordering | Preserves EDL order independently from source order. | `helpers/render.py`; preview UI | PARCIAL | Track clip ordering exists; no auto planner | PORTAR | Editorial Director/commands | CEVRA NATIVE | Project IR timeline | P0 | Reordered takes persist through journal, preview, undo/redo, and export. | Use typed reorder command if absent. |
| EDV-CUT-008 | cut semantics | J-cut intent | Marks a boundary whose next audio begins before its video, default about five frames. | `helpers/render.py`; preview UI | PARCIAL | Layered audio/video model can represent it; no J-cut command/compiler | PORTAR | cut compiler/timeline commands | BEHAVIOR PORT | multitrack Project IR, render | P1 | J-cut overlap is explicit, editable, sample-accurate, and QA-verified. | Do not hide it in opaque render metadata. |

### H. Render and cut engine

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-RND-001 | render | Per-segment extraction | Extracts each EDL segment before assembly, up to four in parallel. | `helpers/render.py`; Hard Rule 2 | EXISTENTE | Typed trim and concat in Media Runtime | MELHORAR | cut compiler over MediaEngineAdapter | CEVRA NATIVE | Media Runtime, job orchestration | P0 | Compiled Project IR clips produce verified segment artifacts without bypassing worker policy. | Keep one job per worker; concurrency belongs above it. |
| EDV-RND-002 | render | Lossless concat | Concatenates normalized extracted segments with stream copy when no J-cut requires mixing. | `helpers/render.py`; Hard Rule 2 | EXISTENTE | `concat` and copy compatibility validation | MELHORAR | existing Media Runtime | CEVRA NATIVE | delivery capabilities | P0 | Compatible segments concatenate via explicit copy; incompatible inputs fail or transcode explicitly. | CEVRA matrix is stronger. |
| EDV-RND-003 | render | Boundary fades | Applies about 30 ms audio fades to extracted boundaries. | `helpers/render.py`; Hard Rule 3 | EXISTENTE | `audio-fade` typed operation | MELHORAR | cut compiler | CEVRA NATIVE | Media Runtime | P0 | Planner applies fades to required cut boundaries and QA detects residual pops. | Existing primitive needs workflow integration. |
| EDV-RND-004 | render | J-cut assembly | Splits video/audio, trims tail, delays next audio at sample precision, and mixes overlap. | `helpers/render.py` | PARCIAL | Mux/audio primitives exist; no J-cut compiler | PORTAR | cut compiler and composition/audio timeline | BEHAVIOR PORT | multitrack render, QA | P1 | Output overlap duration matches Project IR and remains lip-synchronized within tolerance. | Avoid arbitrary filtergraph exposure. |
| EDV-RND-005 | render | Shortform fps rule | Uses 30 fps when source is at least 29.5 fps, otherwise 24 fps. | `helpers/render.py` | PARCIAL | Transcode supports fps; no editorial rule | MELHORAR | delivery profile | CEVRA NATIVE | probe, export profile | P1 | Explicit profile chooses supported fps and records conversion; no hidden threshold. | Preserve source cadence where better. |
| EDV-RND-006 | render | Longform source format | Keeps source resolution/fps unless a delivery profile says otherwise. | `helpers/render.py`; `references/longform.md` | PARCIAL | Typed fit/transcode and export model exist | PORTAR | export planner | CEVRA NATIVE | Project IR export, capabilities | P0 | Default longform export preserves source format within a documented delivery profile. | Capability-gated. |
| EDV-RND-007 | render | Portrait rotation/scaling | Accounts for rotation metadata and fits/scales output dimensions. | `helpers/render.py` | EXISTENTE | Probe, fit, crop, transcode operations | MELHORAR | Media Runtime adapter | CEVRA NATIVE | runtime capabilities | P0 | Rotated fixtures produce correct display orientation and dimensions. | Add end-to-end fixture at workflow level. |
| EDV-RND-008 | render | Codec/container delivery | Encodes H.264/AAC outputs and organizes phase artifacts. | `helpers/render.py` | EXISTENTE | Explicit effective delivery matrix and postconditions | MELHORAR | export service | CEVRA NATIVE | Media Runtime capability | P0 | Export is accepted only when runtime capability and resulting streams match requested delivery. | Never copy EDVID PATH/libx264 fallback. |
| EDV-RND-009 | render | Built subtitle overlay | Can burn generated SRT through FFmpeg subtitle filtering in Phase 1. | `helpers/render.py` | AUSENTE | No caption renderer; arbitrary filters forbidden | PORTAR | CompositionEngineAdapter or typed caption operation | CEVRA NATIVE | captions, composition benchmark | P1 | Captions render from typed Project IR data with timing/style tests and no arbitrary filtergraph. | Choose engine after benchmark/license review. |
| EDV-RND-010 | render | Output organization | Writes phase artifacts, segments, manifests, and final media under `<videos>/edit`. | `SKILL.md`; `helpers/render.py` | PARCIAL | Media request/attempt/output records exist | MELHORAR | project artifact store | CEVRA NATIVE | project store, recovery | P0 | Every derived artifact has project ownership, provenance, lifecycle, and safe cleanup. | Folder convention is not canonical state. |

### I. Audio finishing

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-AFN-001 | audio finishing | Voice mastering chain | Applies high-pass, low-mid reduction, compression, presence/air EQ, de-essing, and limiting. | `helpers/render.py`; `references/shortform.md` | PARCIAL | Volume/loudness/fade primitives exist; no approved mastering profile | PORTAR | audio finishing planner | BEHAVIOR PORT | Media Runtime typed DSP surface | P1 | A versioned typed profile meets objective speech level/clarity fixtures without clipping. | Do not expose raw filter strings. |
| EDV-AFN-002 | audio finishing | Per-range gain | Applies planned gain only to selected EDL ranges. | `helpers/render.py`; `helpers/voice_levels.py` | PARCIAL | Volume operation exists; no range planner/compiler | MELHORAR | audio timeline compiler | CEVRA NATIVE | Project IR audio automation | P1 | Gain automation is editable, journaled, and sample/time aligned to selected clips. | Use canonical automation data. |
| EDV-AFN-003 | audio finishing | Two-pass loudness normalization | Measures then applies EBU-style loudnorm near -14 LUFS, -1 dBTP, LRA 11. | `helpers/render.py` | EXISTENTE | Typed `loudness-normalize` operation | MELHORAR | Media Runtime/application service | CEVRA NATIVE | runtime capability, QA | P0 | Output loudness and true peak meet profile tolerance and measured values enter provenance. | Confirm whether runtime implementation is one/two pass per profile. |
| EDV-AFN-004 | audio finishing | Loudnorm fallback | Falls back to a one-pass chain when measurement/apply fails. | `helpers/render.py` | AUSENTE | Runtime fails explicitly; no fallback policy | MELHORAR | audio finishing policy | CEVRA NATIVE | capability/error policy | P1 | Any fallback is explicit, capability-gated, recorded, and reverified; no silent quality downgrade. | Intentional CEVRA improvement. |
| EDV-AFN-005 | audio finishing | Music mixing | Mixes a chosen soundtrack with voice and applies fades/volume. | `assets/shortform/src/Main.tsx`; `references/shortform.md` | PARCIAL | Mux/volume/fade primitives and audio tracks exist | PORTAR | audio timeline/composition | CEVRA NATIVE | asset provider, Project IR, render | P1 | Music is an editable A2 asset with timing, level, fades, and verified final mix. | Preserve voice intelligibility. |
| EDV-AFN-006 | audio finishing | Sound-effect placement | Places packaged or generated SFX at editorial events. | template `public/sfx/**`; `generate_sfx.py` | PARCIAL | A3 conceptual track; no placement/render workflow | PORTAR | audio timeline/composition | BEHAVIOR PORT | asset registry, composition | P1 | SFX are normal licensed assets with editable cues and deterministic timing. | Do not copy EDVID brand assets by default. |
| EDV-AFN-007 | audio finishing | Boundary pop prevention | Combines fades and numeric junction QA to prevent audible clicks. | `helpers/render.py`; `helpers/verify_cut.py` | PARCIAL | Fade primitive exists; QA absent | MELHORAR | cut compiler plus QA Engine | CEVRA NATIVE | audio fade, QA | P0 | Every butt cut is checked and failing junctions block acceptance with evidence. | Close the loop after correction. |
| EDV-AFN-008 | audio finishing | Automatic ducking | No general speech-keyed music ducking implementation was found. | full helper/template search | AUSENTE | No ducking implementation | NÃO APLICÁVEL | future audio feature | N/A | audio analysis | P2 | Parity does not claim a behavior absent upstream. | May be a later CEVRA improvement. |

### J. Color

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-COL-001 | color | LOG/normal detection | Infers color profile from stream metadata and sampled image statistics. | `helpers/detect_color.py` | AUSENTE | Probe exists; classifier absent | PORTAR | color analysis adapter | BEHAVIOR PORT | probe, frames | P1 | Known fixtures return profile, confidence, and evidence; ambiguity stays unknown. | Never infer support from metadata alone. |
| EDV-COL-002 | color | HDR transfer detection | Recognizes HLG and PQ metadata and proposes conversion. | `helpers/detect_color.py`; `helpers/render.py` | PARCIAL | Runtime handles typed media but HDR is not validated | MELHORAR | color pipeline capability | CEVRA NATIVE | validated FFmpeg filters/hardware | P2 | Only claim HDR when metadata, transforms, and output measurements are validated end to end. | Current CEVRA canon does not claim HDR. |
| EDV-COL-003 | color | Per-segment grade | Applies grade during each segment extraction before concat. | `helpers/render.py`; Hard Rule 7 | AUSENTE | No typed color-grade media operation | PORTAR | color operation/CompositionEngineAdapter | CEVRA NATIVE | Project IR style, runtime extension approval | P1 | Different source segments can carry editable typed grades and render deterministically. | Architectural extension may need ADR approval. |
| EDV-COL-004 | color | Grade presets | Supplies named looks and automatic grade suggestions. | `helpers/grade.py`; `references/log-grade.md` | AUSENTE | Style types only | PORTAR | color profile registry | BEHAVIOR PORT | color analysis, i18n | P1 | Versioned presets have bounded parameters, localized labels, and visual/reference tests. | No raw filter input. |
| EDV-COL-005 | color | Candidate comparison montage | Renders the same frame under multiple grade candidates for review. | `helpers/grade.py` | AUSENTE | No comparison UI/service | PORTAR | review/composition service | BEHAVIOR PORT | frame extraction, color profiles | P1 | Reviewer compares identical timestamps with labeled, reproducible candidates. | Useful approval surface. |
| EDV-COL-006 | color | Output color tagging | Emits Rec.709 color primaries, transfer, matrix, and TV-range tags after SDR conversion. | `helpers/render.py` | PARCIAL | Media postconditions do not establish editorial color correctness | MELHORAR | delivery postcondition | CEVRA NATIVE | probe, color pipeline | P1 | Output metadata and measured pixels match the chosen delivery profile. | Tagging alone is insufficient. |

### K. QA

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-QA-001 | QA | Numeric-first verification | Requires objective checks before subjective review. | `SKILL.md` Hard Rule 12; `helpers/verify_cut.py` | AUSENTE | `engines/qa/README.md`; contract only | PORTAR | QA Engine implementation | BEHAVIOR PORT | Media Runtime, Project IR | P0 | Export acceptance runs a versioned objective suite and stores evidence. | Contract alone receives no parity credit. |
| EDV-QA-002 | QA | Duration consistency | Compares rendered duration to EDL expectation within about 0.5 seconds. | `helpers/verify_cut.py` | AUSENTE | Media file postcondition exists, timeline-duration QA absent | MELHORAR | QA Engine | CEVRA NATIVE | cut plan, probe | P0 | Duration difference is bounded by frame/sample-derived tolerance and cites values. | Avoid fixed tolerance across all formats. |
| EDV-QA-003 | QA | Junction analysis | Inspects windows around every butt cut for pops, hot heads, and hot tails. | `helpers/verify_cut.py` | AUSENTE | No QA implementation | PORTAR | QA Engine | BEHAVIOR PORT | cut map, PCM decode | P0 | Synthetic bad junctions fail with boundary index, time, and measured level discontinuity. | J-cuts need separate logic. |
| EDV-QA-004 | QA | J-cut continuity | Verifies overlap continuity rather than treating a J-cut as a butt junction. | `helpers/verify_cut.py` | AUSENTE | No J-cut QA | PORTAR | QA Engine | BEHAVIOR PORT | J-cut metadata, PCM | P1 | Known valid/invalid overlaps classify correctly and cite overlap range. | Preserve explicit timeline semantics. |
| EDV-QA-005 | QA | Dead-air detection | Flags unexpected silence in the final edit. | `helpers/verify_cut.py` | PARCIAL | Detect-silence primitive exists | MELHORAR | QA Engine over Media Runtime | CEVRA NATIVE | silence detector, editorial allowances | P0 | QA distinguishes intentional pauses from unexpected dead air using timeline annotations. | Primitive alone is not editorial QA. |
| EDV-QA-006 | QA | Black-frame detection | Detects unexpected black frames in output. | `helpers/verify_cut.py` | AUSENTE | No black-frame operation | PORTAR | QA Engine/media analysis | BEHAVIOR PORT | managed FFmpeg analysis | P0 | Injected black frames fail with exact ranges; intentional black is allow-listed by timeline intent. | Requires typed analysis operation. |
| EDV-QA-007 | QA | Audio clipping and balance | Checks clipping/flat samples and range-to-range voice level balance. | `helpers/verify_cut.py` | AUSENTE | QA contract only | PORTAR | QA Engine | BEHAVIOR PORT | voice-level analysis | P0 | Bad fixtures fail with peak and relative-level evidence; good fixture passes. | Use measured thresholds per profile. |
| EDV-QA-008 | QA | Correction convergence | Workflow expects failures to drive corrections and verification to rerun. | `SKILL.md`; `helpers/verify_cut.py` | AUSENTE | Journal/retry exists for media execution, not editorial QA loop | MELHORAR | application workflow/QA Engine | CEVRA NATIVE | typed commands, history, approval | P0 | Each correction attempt links issue, mutation, result, and recheck until pass or explicit waiver. | No endless agent loop. |

### L. Preview and editor interaction

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-PRV-001 | preview | Local preview server | Serves a loopback web UI, project media, state API, save API, and HTTP range requests. | `helpers/preview_server.py` | AUSENTE | Desktop UI scaffold only | MELHORAR | native desktop preview service | CEVRA NATIVE | Tauri UI, artifact resolver | P0 | Integrated preview streams project media without a separately managed ad-hoc server. | Keep path confinement and range support. |
| EDV-PRV-002 | preview | Safe path serving | Resolves requested paths and rejects traversal outside the preview root. | `helpers/preview_server.py` | PARCIAL | Artifact store has symlink/path protections | MELHORAR | desktop asset protocol | CEVRA NATIVE | filesystem permissions | P0 | Traversal, external symlink, and malformed paths fail closed. | Apply CEVRA release threat model. |
| EDV-PRV-003 | preview | Player/playhead | Provides video playback, synchronized playhead, seeking, and time display. | `assets/preview/app.js`; `index.html` | AUSENTE | `packages/ui/README.md` only | PORTAR | CEVRA Vids UI | BEHAVIOR PORT | player, Project IR projection | P0 | Playhead seeks and tracks canonical timeline within one frame. | Do not copy EDVID trade dress. |
| EDV-PRV-004 | preview | Waveform and filmstrip | Generates/caches waveform and thumbnails and aligns them with the timeline. | `helpers/preview_server.py`; `assets/preview/app.js` | AUSENTE | No UI/projection | PORTAR | timeline media cache/UI | BEHAVIOR PORT | Media Runtime extraction | P0 | Waveform/filmstrip cache invalidates by source identity and aligns under zoom. | Improve mtime-only caching. |
| EDV-PRV-005 | preview | Timeline zoom and navigation | Supports wheel/pinch zoom, scroll, seeking, and selected ranges. | `assets/preview/app.js` | AUSENTE | No timeline UI | PORTAR | CEVRA Vids timeline | BEHAVIOR PORT | design system, player | P0 | User can navigate frame-accurately across tested short and long projects. | Native interaction design. |
| EDV-PRV-006 | preview | Per-take trim/remove/reset | Edits take in/out, removes takes, and resets changes in Phase 1 preview. | `assets/preview/app.js`; `preview_edits.json` | PARCIAL | Typed clip trim/remove and undo exist; UI absent | MELHORAR | timeline UI using command API | CEVRA NATIVE | Project IR commands/history | P0 | Every action is a typed command with undo/redo and immediate preview update. | Stronger than separate JSON. |
| EDV-PRV-007 | preview | J-cut controls | Exposes linked video/audio lanes and editable J-cut overlap. | `assets/preview/app.js` | AUSENTE | Project IR layers exist; no command/UI | PORTAR | timeline UI and cut commands | BEHAVIOR PORT | J-cut model/compiler | P1 | User edits overlap without desynchronizing source references; undo/redo works. | A1/V1 semantics must be explicit. |
| EDV-PRV-008 | preview | Notes with IN/OUT | Captures a note over marked range for host-agent revision. | `assets/preview/app.js`; `helpers/watch_edits.py` | AUSENTE | No review-note model | PORTAR | review workflow | CEVRA NATIVE | Project IR extension or review domain | P0 | Range note has author, source/timeline coordinates, status, and audit trail. | Schema decision may require approval. |
| EDV-PRV-009 | preview | Phase tabs and gate | Separates Phase 1 cut, style approval, and Phase 2 result. | `assets/preview/app.js`; `SKILL.md` | AUSENTE | Workflow docs only | MELHORAR | approval workflow UI | CEVRA NATIVE | application service, journal | P0 | Configurable gates prevent downstream render before required approval and record transitions. | Avoid rigid filesystem phase coupling. |
| EDV-PRV-010 | preview | Style controls | Chooses layout, headline, caption style, accent, tracking, zooms, flash cut, and music. | `assets/preview/app.js`; `preview_style.json` | PARCIAL | Project IR style/caption/layout/audio fields exist; no UI/compiler | PORTAR | style inspector and composition plan | CEVRA NATIVE | Project IR, composition | P1 | Controls mutate typed project state and preview deterministically. | Localized labels and accessible controls. |
| EDV-PRV-011 | preview | Insert track editing | Drags, trims, removes, and positions hook/image/video insert items. | `assets/preview/app.js` | PARCIAL | Layered clips/assets model exists; no UI | MELHORAR | layered timeline UI | CEVRA NATIVE | Project IR commands, providers | P1 | Inserts are ordinary editable timeline items with source provenance and undo/redo. | CEVRA should provide true layered timeline. |
| EDV-PRV-012 | preview | Save/host notification | Atomically writes preview JSON; polling watcher tells Claude immediately while Codex notices on the next turn. | `helpers/preview_server.py`; `helpers/watch_edits.py`; `SKILL.md` | AUSENTE | Agent Gateway absent | MELHORAR | application events and Agent Gateway | CEVRA NATIVE | event stream, host adapters | P0 | Save commits typed commands transactionally and emits a host-neutral event with recovery. | No polling file protocol as primary integration. |
| EDV-PRV-013 | preview | Project refresh | Rebuilds browser state and cached thumbnails/waveform when project artifacts change. | `helpers/preview_server.py`; `assets/preview/app.js` | AUSENTE | No UI | MELHORAR | reactive Project IR projection | CEVRA NATIVE | project store/eventing | P0 | UI reflects committed revision and rejects stale mutations with user-visible recovery. | One canonical revision. |
| EDV-PRV-014 | preview | EDVID visual identity | Ships EDVID logos, styling, copy, and product-specific trade dress. | `assets/preview/**` | AUSENTE | CEVRA has its own product identity | NÃO APLICÁVEL | none | N/A | none | P2 | No EDVID logo, branded copy, or trade dress is copied. | Functional interaction may be behavior-ported. |

### M. Shortform composition

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-SHF-001 | shortform | Vertical canvas | Uses a fixed 1080x1920, 9:16 Remotion composition. | `assets/shortform/src/Root.tsx`; `references/shortform.md` | PARCIAL | Project IR layout/export types; no renderer | PORTAR | CompositionEngineAdapter | CEVRA NATIVE | composition benchmark | P1 | Vertical output is exactly 1080x1920 or selected valid profile and passes visual bounds tests. | Engine remains undecided. |
| EDV-SHF-002 | shortform | Visual hook | Places a timed opening headline/hook over the video. | `assets/shortform/src/Main.tsx` | AUSENTE | Headline/style types only | PORTAR | composition plan | BEHAVIOR PORT | captions/text layout | P1 | Hook timing/content/style is editable and appears in tested safe area. | Data-driven component. |
| EDV-SHF-003 | shortform | Headline fitting | Measures text and forces the headline into exactly two fitted lines. | `assets/shortform/src/Main.tsx` | AUSENTE | No text fitter | PORTAR | composition text layout | BEHAVIOR PORT | font metrics, i18n | P1 | Fixture strings in PT-BR/EN-US fit within width without clipping and preserve intended line count. | Generalize beyond Latin assumptions. |
| EDV-SHF-004 | shortform | Dynamic camera | Applies cut-aware zoom cycling and slow push-in motion. | `assets/shortform/src/Main.tsx` | AUSENTE | Composition adapter only | PORTAR | CompositionEngineAdapter | BEHAVIOR PORT | cut map, render engine | P1 | Motion follows configured curves, cut boundaries, and safe scale bounds in rendered tests. | Benchmark HyperFrames and alternatives. |
| EDV-SHF-005 | shortform | Hard cut zoom/flash | Adds discrete zoom or flash emphasis at selected cuts. | `assets/shortform/src/Main.tsx`; `preview_style.json` | AUSENTE | No composition implementation | PORTAR | composition effects registry | BEHAVIOR PORT | cut events, style profile | P1 | Effects occur at exact chosen frames and are individually disableable. | Respect reduced-motion/accessibility in UI. |
| EDV-SHF-006 | shortform | Split-screen layouts | Supports single, two-way, and alternate split arrangements with local clocks. | `assets/shortform/src/Main.tsx` | PARCIAL | Layout types exist; no engine | PORTAR | composition layout compiler | BEHAVIOR PORT | multiple sources, composition | P1 | Split items crop/fill independently, remain synchronized, and are editable. | Avoid EDVID-specific naming. |
| EDV-SHF-007 | shortform | Image inserts and Ken Burns | Places timed upper-zone images with scale/pan motion and entry effects. | `assets/shortform/src/Main.tsx` | PARCIAL | Asset/graphic shapes exist; no renderer | PORTAR | composition asset component | BEHAVIOR PORT | asset provider, safe areas | P1 | Image item renders at exact range, preserves subject, and exposes editable motion. | Asset becomes normal Project IR item. |
| EDV-SHF-008 | shortform | Video inserts/cards/graphics | Renders cutaways, cards, and graphic overlays from edit data. | `assets/shortform/src/Main.tsx`; `CustomGraphics.tsx` | PARCIAL | Overlay-media primitive and graphic types; no composition | MELHORAR | composition component registry | CEVRA NATIVE | Project IR, CompositionEngineAdapter | P1 | Typed components cover proven cases without arbitrary user code and pass snapshots/renders. | Registry must be capability-limited. |
| EDV-SHF-009 | shortform | Timed transitions | Uses light-beam/click transitions and entry/exit animations. | `assets/shortform/src/Main.tsx` | AUSENTE | No transition renderer | PORTAR | composition transition registry | BEHAVIOR PORT | composition engine | P1 | Transition duration and frame placement match plan with no A/V drift. | Only proven, licensed assets. |
| EDV-SHF-010 | shortform | Data-driven template render | Reads segments, track, edit data, captions, cues, and assets into a fixed Remotion composition. | `assets/shortform/src/**`; `public/*.json` | PARCIAL | Composition contract and Project IR exist; adapter absent | MELHORAR | CompositionEngineAdapter | CEVRA NATIVE | Project IR projection, engine benchmark | P1 | Renderer consumes a validated immutable projection of Project IR and reproduces all supported components. | Remotion selection requires license review. |

### N. Captions

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-CAP-001 | captions | Word-timed cues | Maps transcript word timing through cut segments into output timeline cues. | `helpers/captions_for_remotion.py` | PARCIAL | Word/caption types exist; no cue mapper | PORTAR | caption compiler | BEHAVIOR PORT | transcript, cut map | P0 | Every retained word maps to exact output time and removed words do not appear. | Share rational timeline mapping. |
| EDV-CAP-002 | captions | Karaoke style | Highlights the active word inside a timed phrase. | `assets/shortform/src/Main.tsx`; `SimpleCaptions.tsx` | AUSENTE | Style metadata only | PORTAR | composition caption component | BEHAVIOR PORT | cue compiler, renderer | P1 | Highlight changes on word boundaries and stays legible under render tests. | One of several selectable styles. |
| EDV-CAP-003 | captions | Static style | Shows non-karaoke caption blocks over their cue ranges. | `SimpleCaptions.tsx` | AUSENTE | No renderer | PORTAR | composition caption component | BEHAVIOR PORT | cue compiler | P1 | Static cues enter/exit at exact times and line-wrap safely. | Localized text layout. |
| EDV-CAP-004 | captions | Stacked emphasis style | Builds layered phrases with selected solo/emphasized/circled words, an animated pencil outline, and a minimum solo duration. | `helpers/caption_style.py`; `StackedCaptions.tsx`; `PencilOutline.tsx` | AUSENTE | No implementation | PORTAR | caption style planner/component | BEHAVIOR PORT | language heuristics, renderer | P1 | All input words remain ordered; emphasis rules, outline timing, and duration floor pass PT-BR/EN-US fixtures. | EDVID heuristics are PT-BR-centric and need localization. |
| EDV-CAP-005 | captions | Scatter and visual variants | Offers scatter, serif, classic, and related visual caption variants. | `ScatterCaptions.tsx`; `SimpleCaptions.tsx`; preview style catalog | AUSENTE | No renderer | PORTAR | caption component registry | BEHAVIOR PORT | composition benchmark | P1 | Each published style has reference renders, safe bounds, and deterministic timing. | Do not copy visual trade dress wholesale. |
| EDV-CAP-006 | captions | Caption none | Allows captions to be disabled explicitly. | `assets/preview/app.js`; `Main.tsx` | PARCIAL | Optional caption data exists | PORTAR | caption policy/UI | CEVRA NATIVE | Project IR | P0 | Explicit `none` produces no caption layer without deleting transcript data. | Preserve later re-enable. |
| EDV-CAP-007 | captions | Safe width and positioning | Measures text, constrains about 720 px safe width, and places lower-third captions away from key content. | caption components; `references/shortform.md` | AUSENTE | No layout engine | MELHORAR | composition safe-area service | CEVRA NATIVE | face/subject tracking, text metrics | P1 | Captions avoid crop/UI/face safe regions across 9:16 and horizontal fixtures. | Dynamic safe zones should supersede fixed-only placement. |
| EDV-CAP-008 | captions | Broadcast SRT | Groups transcript words into 1–6s cues, max two lines and about 42 characters per line with balanced wrapping. | `helpers/captions_srt.py` | AUSENTE | Caption data exists; no SRT exporter | PORTAR | caption export adapter | BEHAVIOR PORT | transcript/cut map | P1 | Generated SRT covers retained speech, respects line/duration rules, and round-trips timing. | Longform default is external subtitles. |

### O. Face and camera intelligence

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-FCE-001 | face/camera | Face and eye detection | Uses OpenCV Haar cascades and chooses the largest detected face. | `helpers/face_track.py` | AUSENTE | Provider/analysis contracts only | PORTAR | vision analysis adapter | BEHAVIOR PORT | local CV model | P1 | Supported footage yields bounded face/eye detections with confidence and no network requirement. | Haar may be replaced by a better compatible model. |
| EDV-FCE-002 | face/camera | Track interpolation/smoothing | Fills missing detections and smooths motion with a moving average. | `helpers/face_track.py` | AUSENTE | No tracker | MELHORAR | vision tracking service | CEVRA NATIVE | face detections | P1 | Short occlusions do not jump; long loss becomes explicit rather than fabricated. | Version the tracker/profile. |
| EDV-FCE-003 | face/camera | Subject-aware crop/reframe | Uses face center to steer vertical framing and clamp crop/zoom target. | `assets/shortform/src/Main.tsx`; `face_track.py` | AUSENTE | Crop primitive exists; no planner | PORTAR | camera planner plus Media/Composition adapter | CEVRA NATIVE | tracker, safe area | P1 | Subject stays within validated safe region throughout representative motion fixtures. | Crop operation is existing execution primitive. |
| EDV-FCE-004 | face/camera | Face-protected overlays | Positions headlines/captions/inserts to avoid the detected subject. | `references/shortform.md`; template components | AUSENTE | No composition engine | PORTAR | composition constraint solver | BEHAVIOR PORT | tracking, safe areas | P1 | Collision tests prove text/assets do not obscure protected face zones. | Fall back deterministically when no face exists. |
| EDV-FCE-005 | face/camera | Person matte | Generates an alpha matte with RVM for behind-subject composition over a requested window. | `helpers/person_matte.py`; optional `matting` dependencies | AUSENTE | No segmentation provider | PORTAR | optional vision provider | BEHAVIOR PORT | torch/model entitlement, composition | P2 | Capability-gated local matte produces aligned alpha with declared model/license/provenance. | Optional heavy dependency; no core blocker. |

### P. B-roll, inserts, and assets

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-AST-001 | assets | Pexels photo search | Searches Pexels photos, downloads selected originals, and retains photographer attribution. | `helpers/pexels_search.py` | AUSENTE | Provider contracts only | PORTAR | stock image provider | BEHAVIOR PORT | API key, network permission | P1 | Provider returns licensed metadata, download digest, attribution, and editable Project IR asset. | Pexels video is not implemented upstream. |
| EDV-AST-002 | assets | Wikimedia image search | Searches Wikimedia without a key and prints license/artist/source metadata. | `helpers/wikimedia_images.py` | AUSENTE | Provider contracts only | PORTAR | stock/public media provider | BEHAVIOR PORT | network, license metadata | P1 | Asset import preserves exact source, creator, license, and file digest. | Validate license per result. |
| EDV-AST-003 | assets | Google image search | Uses Custom Search with optional rights filter and downloads selected results. | `helpers/google_images.py` | AUSENTE | Provider contracts only | MELHORAR | discovery provider | CEVRA NATIVE | API key, rights review | P2 | Discovery never implies reuse rights; chosen asset requires verified media type and license evidence. | EDVID saves `.jpg` without robust format validation. |
| EDV-AST-004 | assets | Local/imported assets | Reads project-local images, video, music, and graphics into composition. | template `public/edit-data.json`; `SKILL.md` | PARCIAL | Project IR asset/source concepts exist; ingest/UI incomplete | PORTAR | asset library and Project IR commands | CEVRA NATIVE | ingest, timeline | P0 | Imported asset is a normal editable item with source provenance and stable URI. | Core must work without external providers. |
| EDV-AST-005 | assets | Automatic placement | Agent chooses asset timing and association with transcript/editorial beats. | `SKILL.md`; shortform template data | AUSENTE | Generative/provider contracts only | PORTAR | Editorial/Generative Director planner | CEVRA NATIVE | transcript, asset search, commands | P1 | Placement cites beat/rationale and remains editable/undoable. | Provider-neutral. |
| EDV-AST-006 | assets | Insert crop/reframe | Fills composition zones using per-item crop/position/scale behavior. | `assets/shortform/src/Main.tsx` | PARCIAL | Fit/crop primitives; no composition item compiler | MELHORAR | composition asset component | CEVRA NATIVE | CompositionEngineAdapter | P1 | Still/video insert honors focus and safe zones across supported layouts. | Do not destructively rewrite source asset. |
| EDV-AST-007 | assets | Upper-zone placement | Keeps visual inserts above caption/subject zones in vertical layouts. | `references/shortform.md`; `Main.tsx` | AUSENTE | No layout solver | PORTAR | composition constraint solver | BEHAVIOR PORT | captions, face safe zones | P1 | Layout fixtures prove insert, caption, and subject constraints do not overlap. | Generalize beyond one fixed coordinate. |
| EDV-AST-008 | assets | Generated assets | EDVID can generate simple SFX and refers to optional external creative services; no general image/video generator contract exists. | `assets/shortform/generate_sfx.py`; `SKILL.md` | PARCIAL | `packages/contracts/src/providers.ts`; no provider | MELHORAR | Generative Asset Planner/provider adapters | CEVRA NATIVE | entitlements, optional providers | P2 | Existing/local/host-covered assets are preferred; generated assets carry provider/model/license provenance. | Vids remains usable without paid generation. |

### Q. Bespoke graphics

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-GFX-001 | bespoke graphics | Data-driven built-ins | Provides timeline, script, and geometric graphic components parameterized by edit data. | `assets/shortform/src/CustomGraphics.tsx` | PARCIAL | Graphic types and composition contract; no renderer | PORTAR | typed composition component registry | BEHAVIOR PORT | CompositionEngineAdapter | P1 | Equivalent built-ins render only from validated typed properties and reference fixtures. | Candidate for original CEVRA visual design. |
| EDV-GFX-002 | bespoke graphics | Custom TSX escape hatch | Permits editing `CustomGraphics.tsx` when fixed components are insufficient. | `SKILL.md` Hard Rule 11; `CustomGraphics.tsx` | AUSENTE | Arbitrary code is prohibited by canon | MELHORAR | signed/capability-limited package system | CEVRA NATIVE | package sandbox/permissions | P2 | Equivalent extensibility uses reviewed components and explicit capabilities without arbitrary end-user code execution. | `DIVERGÊNCIA EDVID`: reject unrestricted code surface. |
| EDV-GFX-003 | bespoke graphics | Immutable base template rule | Agents may change only the custom graphics file, not the base Remotion template. | `SKILL.md` Hard Rule 11 | AUSENTE | No template runtime | MELHORAR | component/package boundary | CEVRA NATIVE | package integrity | P1 | Built-in renderer is immutable at runtime; project data and approved packages are the only inputs. | Stronger enforcement than agent instruction. |
| EDV-GFX-004 | bespoke graphics | Exact timed graphic cues | Custom graphics use frame/timeline ranges and animated properties. | `CustomGraphics.tsx`; `Main.tsx` | PARCIAL | Project IR graphics/timing types; no implementation | PORTAR | composition compiler | CEVRA NATIVE | Project IR, renderer | P1 | Graphic start/end and animation milestones match intended frames in render tests. | Store intent as data. |

### R. Longform

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-LNG-001 | longform | Horizontal composition | Uses source resolution/aspect/fps for a longform Remotion composition. | `assets/longform/src/Root.tsx`; `references/longform.md` | PARCIAL | Export/layout types; no composition adapter | PORTAR | CompositionEngineAdapter/export planner | CEVRA NATIVE | composition benchmark | P1 | Horizontal output preserves selected source/delivery profile and exact timing. | No fixed 9:16 assumption. |
| EDV-LNG-002 | longform | Retention-oriented structure | Builds cold open, section rhythm, visual resets, and a calm end-card window. | `references/longform.md` | AUSENTE | No longform playbook | PORTAR | longform Editorial Director | BEHAVIOR PORT | transcript intelligence, composition | P1 | Plan identifies hook/chapters/resets/end window and remains reviewable. | Editorial heuristic, not hard-coded render rule. |
| EDV-LNG-003 | longform | Chapter generation | Produces timestamped chapters with first at 00:00, at least three, and minimum separation. | `helpers/chapters.py` | AUSENTE | No chapter model/export | PORTAR | metadata/editorial service | BEHAVIOR PORT | transcript, timeline | P1 | Chapter list validates ordering, 00:00 start, separation, and content labels. | Could use Project IR extension after schema review. |
| EDV-LNG-004 | longform | External subtitles | Defaults to SRT rather than burned captions. | `helpers/captions_srt.py`; `references/longform.md` | AUSENTE | No SRT exporter | PORTAR | subtitle export adapter | BEHAVIOR PORT | captions, delivery | P1 | SRT aligns with edited timeline and accompanies export with correct language metadata. | User may separately request burn-in. |
| EDV-LNG-005 | longform | Lower thirds/chapter cards/callouts | Uses data-driven overlays and B-roll cutaways at restrained cadence. | `assets/longform/src/Main.tsx`; `public/edit-data.json` | PARCIAL | Graphic/layout types; no renderer | PORTAR | composition component registry | BEHAVIOR PORT | composition, assets | P1 | Components render at exact ranges and are editable in layered timeline. | Preserve longform restraint as profile. |
| EDV-LNG-006 | longform | Longform soundtrack | Supports a timed music bed with voice-safe levels. | `assets/longform/src/Main.tsx`; `references/longform.md` | PARCIAL | Audio tracks and mux primitives; no workflow | PORTAR | audio timeline/composition | CEVRA NATIVE | asset library, mastering | P1 | Music is editable, fades correctly, and final voice/music balance passes QA. | No provider required. |

### S. Music, soundtrack, and SFX

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-MUS-001 | music/SFX | Local soundtrack | Accepts a project-local audio asset as background music. | shortform/longform `Main.tsx`; edit data | PARCIAL | Project IR audio/assets and mux primitives | PORTAR | asset library/audio timeline | CEVRA NATIVE | ingest, Project IR | P1 | Local music can be placed, trimmed, faded, mixed, removed, and undone. | Core path independent of APIs. |
| EDV-MUS-002 | music/SFX | Treblo AI soundtrack | Optional helper submits a prompt, polls a remote API, and downloads instrumental MP3. | `helpers/treblo_music.py` | AUSENTE | Provider contract only | PORTAR | optional music provider adapter | BEHAVIOR PORT | BYOK, network, entitlements | P2 | Provider is explicit/optional, secrets stay in secure storage, and output includes provider/model/license provenance. | Never require it for Vids. |
| EDV-MUS-003 | music/SFX | Procedural SFX generation | Generates small sound effects for template use. | `assets/shortform/generate_sfx.py` | AUSENTE | No SFX generator | PORTAR | built-in asset tooling | DIRECT MIT | audio asset pipeline, attribution | P2 | Generated asset is deterministic from parameters and registered with provenance/license. | Reuse only after exact notice review. |
| EDV-MUS-004 | music/SFX | Packaged SFX library | Ships click, pop, whoosh, scratch, tick-tock, and related MP3 cues. | `assets/*/public/sfx/**` | AUSENTE | No SFX library | MELHORAR | licensed built-in asset package | CEVRA NATIVE | asset licensing | P1 | CEVRA ships independently licensed/original cues with manifest, attribution, and audition tests. | Do not assume EDVID media assets are reusable merely because repo is MIT without per-asset provenance review. |
| EDV-MUS-005 | music/SFX | Audio timing drift correction | Documents measuring constant Remotion drift and remuxing or retaining baked audio where appropriate. | `SKILL.md`; `references/shortform.md` | AUSENTE | Output postconditions do not test composition A/V drift | MELHORAR | composition QA | CEVRA NATIVE | chosen engine, Media Runtime | P1 | Automated sync fixtures detect frame/sample drift and the renderer produces corrected output without manual remux recipes. | Engine-specific mitigation stays behind adapter. |

### T. Agent hosts

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-AGT-001 | agent hosts | Claude Code skill | Installs EDVID as a filesystem skill and uses file/terminal/browser coordination. | `edvid_install.py`; `SKILL.md`; `install.md` | AUSENTE | `packages/agents/README.md` only | PORTAR | external Claude adapter/CEVRA Skill | CEVRA NATIVE | Agent Gateway, skill manager | P1 | Authorized CEVRA skill invokes only typed commands and survives install/update/remove safely. | No arbitrary FFmpeg/shell surface. |
| EDV-AGT-002 | agent hosts | External Codex skill | Supplies `agents/openai.yaml` metadata and installs into a Codex skill directory. | `agents/openai.yaml`; `edvid_install.py` | AUSENTE | Agent Gateway scaffold | PORTAR | external Codex adapter/CEVRA Skill | CEVRA NATIVE | Agent Gateway, skill manager | P1 | External Codex can inspect and mutate through the same typed/audited API as other hosts. | This is not Codex App Server. |
| EDV-AGT-003 | agent hosts | Gemini/Antigravity skill | Detects known local directories and installs the same skill payload. | `edvid_install.py`; `install.md` | AUSENTE | No host adapter | PORTAR | optional external host adapter | CEVRA NATIVE | Agent Gateway, skill manager | P2 | Supported host is capability-detected and isolated behind the same contract. | Confirm current host conventions before shipping. |
| EDV-AGT-004 | agent hosts | Host-specific notification | Claude can be notified by watcher output; Codex checks saved edits on a later user turn. | `helpers/watch_edits.py`; `SKILL.md` | AUSENTE | No Agent Gateway implementation | MELHORAR | host-neutral application events | CEVRA NATIVE | event API, host adapters | P1 | All hosts receive typed state-change events or deterministic polling cursors without divergent project semantics. | Avoid host behavior in core editing. |
| EDV-AGT-005 | agent hosts | Reasoning via skill instructions | A long skill prompt orchestrates tools, phase gates, and editorial heuristics. | `SKILL.md` | AUSENTE | Creative Intelligence canon only | MELHORAR | Editorial Director plus progressive skills | CEVRA NATIVE | Agent Gateway, workflows | P0 | Core workflow rules are enforceable services/contracts; selected playbooks add bounded guidance. | Do not rely solely on prompt compliance. |
| EDV-AGT-006 | agent hosts | Embedded agent | No embedded EDVID agent or App Server integration exists. | full tree; `agents/openai.yaml` | AUSENTE | Canon permits future embedded Codex; no implementation | NÃO APLICÁVEL | future Agent Gateway adapter | N/A | official/commercial host mechanism | P2 | Parity makes no claim; CEVRA may later improve through an official embedded path. | Do not attribute this capability to EDVID. |

### U. Installer and skill management

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-INS-001 | installer | Host detection | Detects Claude, Codex, Gemini, and Antigravity homes using platform/user paths. | `edvid_install.py` | AUSENTE | Product direction only | PORTAR | CEVRA skill manager | BEHAVIOR PORT | desktop permissions | P2 | Detection is read-only, explicit, tested per supported platform, and never implies consent. | CEVRA must ask before changes. |
| EDV-INS-002 | installer | Skill payload allow-list | Installs only named EDVID directories/files and rejects an incomplete payload. | `edvid_install.py`; `tests/test_installer.py` | AUSENTE | No skill manager | MELHORAR | signed/versioned skill manager | CEVRA NATIVE | manifest, updater trust | P2 | Exact CEVRA-owned inventory/hash is verified before atomic install. | Canon already requires manifest/version/hash. |
| EDV-INS-003 | installer | Install/update from archive | Downloads a GitHub tarball, copies allowed payload, and replaces an existing installation. | `edvid_install.py` | AUSENTE | Update architecture docs only | MELHORAR | skill manager/updater | CEVRA NATIVE | signed application/update | P2 | Pinned artifact is authenticated, staged, verified, atomically swapped, and rollback-capable. | Never use floating main in release. |
| EDV-INS-004 | installer | Destination symlink rejection | Refuses to install over any destination symlink. | `edvid_install.py`; `tests/test_installer.py` | AUSENTE | Media artifact symlink protection only | PORTAR | skill manager filesystem boundary | BEHAVIOR PORT | filesystem | P2 | Existing and dangling destination symlinks fail closed without touching targets. | Extend protection to all managed paths. |
| EDV-INS-005 | installer | Git checkout protection | Refuses to overwrite a Git checkout unless forced and backs up dirty content. | `edvid_install.py`; `tests/test_installer.py` | AUSENTE | Canon rule only | MELHORAR | skill manager | CEVRA NATIVE | ownership manifest | P2 | Manager modifies only CEVRA-owned managed installs; foreign checkout is never overwritten. | Explicit user action required. |
| EDV-INS-006 | installer | Secrets/config preservation | Preserves `.env`, `.venv`, and `.git` while replacing other files. | `edvid_install.py`; `tests/test_installer.py` | AUSENTE | Secure-storage direction only | MELHORAR | skill manager | CEVRA NATIVE | secure storage, atomic update | P2 | Update/reinstall does not read, copy, delete, or expose user secrets and preserves supported configuration. | Avoid keeping secrets inside skill tree. |
| EDV-INS-007 | installer | Remotion best-practices skill | Downloads a separate Remotion guidance skill from a floating upstream branch. | `edvid_install.py`; `install.md` | AUSENTE | Remotion is not incorporated | NÃO APLICÁVEL | none until engine selection | N/A | composition benchmark/license review | P2 | No Remotion skill is installed unless engine/version/license are separately approved and pinned. | EDVID behavior is not canonical for CEVRA. |
| EDV-INS-008 | installer | Cross-platform setup checks | Uses Python path conventions, uv sync, and checks FFmpeg/Node across macOS/Linux/Windows. | `edvid_install.py`; `install.md` | PARCIAL | CEVRA runtime validates macOS arm64 release; other platforms planned/test-only | MELHORAR | installer/runtime packaging | CEVRA NATIVE | platform runners/bundles | P2 | Declare a release platform only after native bundle, lifecycle, media, and integrity tests pass there. | Do not generalize macOS validation. |
| EDV-INS-009 | installer | Rollback and uninstall | No implemented rollback or uninstall path exists. | full installer and tests | AUSENTE | Product canon requires both | MELHORAR | skill manager | CEVRA NATIVE | ownership manifest, updater | P2 | Failed update rolls back atomically; uninstall removes only matching CEVRA-owned inventory. | CEVRA improvement beyond upstream. |

### V. Project and session memory

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-MEM-001 | memory | `project.md` memory | Records project facts, decisions, paths, and session guidance in a human-readable file. | `SKILL.md`; `README.md` | PARCIAL | Project IR/extensions and store exist; no editorial memory projection | MELHORAR | project metadata/context projector | CEVRA NATIVE | Project IR, Content Intelligence optional | P0 | Durable choices live in typed/project-owned state and can be projected to bounded human/agent views. | Markdown may be an export, not source of truth. |
| EDV-MEM-002 | memory | Separate session artifacts | Keeps transcripts, EDL, preview state, style, and phase renders as loose files. | `SKILL.md`; helpers; template JSON | PARCIAL | Project IR/history plus media attempt records exist | MELHORAR | application/project store | CEVRA NATIVE | Project IR, artifact store | P0 | One project revision references every derived artifact and its provenance; recovery is deterministic. | Avoid parallel state graphs. |
| EDV-MEM-003 | memory | Persisted user choices | Saves trim, deletion, style, and notes between agent turns. | `preview_edits.json`; `preview_style.json` | PARCIAL | Commands/history persist supported mutations; missing UI/style commands | MELHORAR | Project IR command API | CEVRA NATIVE | schema/commands, UI | P0 | All supported choices persist through restart and have undo/redo entries. | New schema fields require normal versioning review. |
| EDV-MEM-004 | memory | Recovery | File artifacts can be rerun manually, but no transactional recovery model is present. | helper outputs and workflow prose | EXISTENTE | ProjectHistory, project store, media retry/crash recovery | MELHORAR | existing application/history | CEVRA NATIVE | journal, snapshots | P0 | Crash at every operation boundary restores last committed Project IR and safely retries derived work. | CEVRA already stronger for media mutations. |
| EDV-MEM-005 | memory | Auditability | Commands and agent decisions are visible in files but not an immutable structured journal. | `project.md`; preview JSON; EDL | EXISTENTE | `packages/project-ir/src/history.ts`; media attempt records | MELHORAR | existing journal plus editorial records | CEVRA NATIVE | command API, provenance | P0 | Requested operation, approval, typed mutation, output, QA, failure, and retry remain linked. | Do not duplicate journal in engines. |

### W. Premiere, interchange, and alternate execution

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-PRM-001 | interchange | Premiere MCP execution | Can apply transcript-derived edits in Premiere instead of the FFmpeg/preview path. | `references/premiere-mcp.md` | AUSENTE | Stable-adapter direction only | PORTAR | future NLE adapter | BEHAVIOR PORT | approved Premiere integration | P2 | Adapter consumes the same canonical cut plan and reports actual sequence mutations. | Not required for first standalone Vids flow. |
| EDV-PRM-002 | interchange | Razor/ripple cut mapping | Razors at EDL boundaries and ripple-removes rejected video/audio ranges. | `references/premiere-mcp.md` | AUSENTE | No NLE adapter | PORTAR | future Premiere adapter | BEHAVIOR PORT | Project IR-to-NLE mapping | P2 | Fixture project round-trips cuts without A/V desync or losing source identity. | Project IR remains canonical. |
| EDV-PRM-003 | interchange | Reuse transcript/EDL | Shares analysis and edit decisions while swapping the execution engine. | `references/premiere-mcp.md` | PARCIAL | Adapter architecture and Project IR support engine independence | MELHORAR | editor/NLE adapter boundary | CEVRA NATIVE | transcription, cut plan | P2 | Same canonical project renders locally or maps to NLE with documented equivalence. | Strong fit with CEVRA architecture. |
| EDV-PRM-004 | interchange | Arbitrary ExtendScript | Allows direct `execute_extendscript` for gaps in typed Premiere MCP tools. | `references/premiere-mcp.md` | AUSENTE | Arbitrary execution prohibited | NÃO APLICÁVEL | none | N/A | security | P2 | No end-user/agent arbitrary script surface is exposed; missing operations require reviewed typed commands. | `DIVERGÊNCIA EDVID`: intentional security boundary. |
| EDV-PRM-005 | interchange | Premiere sequence QA | Verifies sequence duration, track items, and key boundaries numerically. | `references/premiere-mcp.md` | AUSENTE | QA contract only | PORTAR | future NLE QA adapter | BEHAVIOR PORT | Premiere adapter, QA Engine | P2 | Imported sequence facts reconcile against Project IR and planned cut map. | Required before claiming Premiere parity. |

### X. Tests and regression evidence

| ID | Área | Capability EDVID | Comportamento observado | Evidência EDVID | Estado atual CEVRA | Evidência CEVRA | Tratamento alvo | Destino CEVRA | Estratégia de reuse | Dependências | Prioridade | Critério de paridade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EDV-TST-001 | tests | Installer payload tests | Asserts allow-listing, incomplete-payload safety, state preservation, symlink/checkouts, and replacement behavior. | `tests/test_installer.py` | AUSENTE | No skill manager | PORTAR | future skill-manager test suite | BEHAVIOR PORT | installer implementation | P2 | Equivalent negative tests prove no foreign file/secret/target loss. | Reuse test ideas after design. |
| EDV-TST-002 | tests | Editorial helper regression tests | No automated tests exist for transcribe, render, packing, analysis, preview, captions, providers, or QA helpers. | `tests/**` contains installer tests only | AUSENTE | No corresponding features | MELHORAR | all new domain packages | CEVRA NATIVE | fixtures and golden outputs | P0 | Every P0/P1 row has non-vacuous unit/integration evidence before parity closure. | Major upstream limitation. |
| EDV-TST-003 | tests | Media lifecycle/integrity tests | EDVID has no managed worker, cancellation, release integrity, or orphan-process suite. | full tree | EXISTENTE | `engines/media-ffmpeg/test/**`; `test_python/**` | MELHORAR | existing Media Runtime tests | CEVRA NATIVE | CI/native runners | P0 | Existing guarantees remain green under all new editorial workflows. | Do not duplicate runtime helpers. |
| EDV-TST-004 | tests | Project/history consistency tests | EDVID has no canonical project journal/undo/redo test suite. | full tree | EXISTENTE | `packages/project-ir/test/**`; `packages/application/test/**`; `packages/project-store/test/**` | MELHORAR | existing Project IR/application tests | CEVRA NATIVE | new commands/workflows | P0 | Each added editing mutation proves journal, snapshot, undo, redo, recovery, and conflict behavior. | Mandatory CEVRA invariant. |

Matrix totals: **173 capabilities**. Current CEVRA state: **11 EXISTENTE**, **50 PARCIAL**, **112 AUSENTE**. Target disposition: **100 PORTAR**, **67 MELHORAR**, **6 NÃO APLICÁVEL**. Priority: **68 P0**, **78 P1**, **27 P2**.

## EDVID hard rules → CEVRA disposition

| Rule | EDVID rule | Technical/editorial reason | CEVRA disposition | Evidence and acceptance |
|---|---|---|---|---|
| HR-01 | Stop after the first strategy preview and wait for approval. | Prevents expensive or unwanted execution before editorial intent is agreed. | MELHORAR | Keep approval by default, make autonomy policy configurable, and journal approval or bypass. `SKILL.md` Hard Rule 1. |
| HR-02 | Extract per segment, then lossless concat; handle J-cuts by explicit audio overlap. | Protects timing and avoids monolithic filter complexity. | MELHORAR | Compile canonical clips to existing typed Media Runtime jobs; retain explicit J-cut semantics and let delivery capabilities decide copy/transcode. `helpers/render.py`. |
| HR-03 | Add 30 ms fades to every audio boundary. | Prevents clicks and pops at cuts. | MELHORAR | Use a versioned fade policy plus junction QA; allow measured boundary-specific values rather than an unconditional magic constant. `helpers/render.py`; `verify_cut.py`. |
| HR-04 | Never cut inside a word. | Prevents clipped speech and unnatural edits. | MANTER | Enforce against aligned word boundaries; any exceptional manual override must be explicit and QA-visible. `SKILL.md` Hard Rule 4. |
| HR-05 | Add 30–200 ms padding, more trail than lead, preferring silence. | Preserves consonants, breaths, and natural cadence. | MELHORAR | Derive padding from aligned words plus acoustic silence and profile it by format/speech; test frame/sample mapping. `SKILL.md` Hard Rule 5. |
| HR-06 | Cache transcript per source. | Avoids repeated expensive model inference. | MELHORAR | Content-address source and include model/language/alignment/schema in cache key; existence-only cache is rejected. `transcribe.py`. |
| HR-07 | Apply grade per segment, not only after concat. | Different takes/cameras may need distinct correction. | MANTER | Represent grade per canonical clip and compile through a typed color interface; no raw filter. `render.py`. |
| HR-08 | Present editorial strategy before editing. | Makes intent reviewable before mutation. | MELHORAR | Persist structured plan/evidence and approval through application workflow, with configurable autonomy. `SKILL.md` Hard Rule 8. |
| HR-09 | Put outputs in `<videos_dir>/edit`. | Keeps source and generated material organized. | MELHORAR | Use project-owned artifact storage, deterministic paths, provenance, and safe cleanup; do not make the folder canonical. `SKILL.md` Hard Rule 9. |
| HR-10 | Phase 2 is Remotion-only. | EDVID's proven composition behaviors are implemented in its Remotion templates. | MELHORAR | `DIVERGÊNCIA EDVID`: require `CompositionEngineAdapter` benchmark. HyperFrames is preferred only if equal/superior; CEVRA may select Remotion or another engine after exact-version license review. `SKILL.md`; `assets/*/package.json`. |
| HR-11 | Phase 2 is data-driven; keep base template unchanged and edit only `CustomGraphics.tsx` for bespoke work. | Limits template drift while preserving an escape hatch. | MELHORAR | Keep immutable built-ins and typed data; replace arbitrary TSX editing with reviewed capability-limited components/packages. `SKILL.md`; `CustomGraphics.tsx`. |
| HR-12 | Run numeric verification before subjective review. | Catches duration, junction, silence, frame, clipping, and balance errors objectively. | MANTER | Implement QA Engine with evidence-bearing checks and convergence tied to project attempts. `verify_cut.py`. |
| HR-13 | Do not read raw machine JSON into agent context. | Controls token volume and prevents low-signal context. | MELHORAR | Supply bounded typed Project IR projections with citations and versioned context schemas. `pack_transcripts.py`; `SKILL.md`. |

All 13 hard rules are accounted for. Three intentional differences are marked `DIVERGÊNCIA EDVID`: composition-engine selection, unrestricted custom-code execution, and arbitrary Premiere ExtendScript. The latter two are represented in capability rows rather than as standalone numbered hard rules.

## Where CEVRA should be better than EDVID

| CEVRA improvement | Observable EDVID limitation | Required outcome |
|---|---|---|
| Integrated visual editor | Preview is a separate loopback web app with loose JSON state and polling. | Native CEVRA Vids UI projects one Project IR revision and commits typed commands. |
| Project IR as sole source of truth | EDL, `project.md`, `state.json`, edit/style JSON, template data, and outputs can diverge. | Every durable audiovisual choice is canonical, versioned, validated, and recoverable. |
| History, undo, redo, and crash recovery | File replacement provides limited rollback and no command journal. | All mutations create journal/snapshot evidence and remain recoverable across process failure. |
| Typed Media Runtime | EDVID helpers spawn PATH FFmpeg with raw filter strings and fixed codec assumptions. | Existing allow-listed managed worker remains the only release execution path. |
| Deterministic cancellation/lifecycle | Helpers do not expose a persistent cancellable worker contract or orphan tests. | Existing worker cancellation, reaping, timeout, close, and crash/restart guarantees cover new workflows. |
| Layered timeline | Preview lanes and Remotion JSON are phase-specific representations. | V1–V4 and A1–A3 items are ordinary editable Project IR timeline items. |
| Agent independence | EDVID behavior depends on a capable external coding agent following a long skill. | Manual review/edit works without an agent; all embedded/external agents use the same typed gateway. |
| Host-neutral Agent Gateway | Claude and Codex use different polling/turn behavior. | Host adapters receive the same bounded context and deterministic events. |
| Provider contracts and asset planner | Network helpers embed provider-specific filesystem/secret behavior. | Optional providers return typed assets with permissions, provenance, rights, and entitlements; local paths remain complete. |
| i18n parity | Preview/help/caption heuristics contain hard-coded Portuguese and English strings. | Every user-facing string and playbook metadata has PT-BR default and EN-US parity. |
| Capability-limited extension packages | Bespoke composition executes editable TSX and Premiere mode allows arbitrary ExtendScript. | Reviewed packages/components declare permissions; arbitrary shell/code/filtergraphs are absent from end-user and agent surfaces. |
| Deterministic QA convergence | `verify_cut.py` is useful but standalone and most helpers lack regression tests. | QA evidence blocks commit/export as configured and links every correction/retry to history. |
| Desktop distribution integrity | EDVID relies on globally installed Python, FFmpeg, Node, uv, and downloaded floating skill content. | Signed application/update authenticity plus internal runtime manifest, hashes, provenance, and notices fail closed. |
| Future mobile compatibility | EDVID workflow assumes local Python/terminal/browser helpers. | Shared types, Project IR, commands, terminology, and provider boundaries avoid desktop-runtime dependency on mobile. |

## Reuse and licensing disposition

The EDVID repository at the audited revision is MIT-licensed, but each future direct reuse must retain exact commit/path provenance, copyright notice, and MIT attribution and must verify that embedded media/model/provider assets have compatible rights. Repository licensing does not remove the need to confirm the provenance of bundled MP3s, logos, screenshots, fonts, model weights, provider results, or third-party templates.

The matrix presently marks only the procedural SFX generator as a `DIRECT MIT` candidate. Even self-contained transcript packing, SRT grouping, chapter validation, and installer-test ideas are classified as `BEHAVIOR PORT` because they must adopt CEVRA types, timing, persistence, or ownership rules. Most render behavior is `BEHAVIOR PORT` or `CEVRA NATIVE` because CEVRA already has stronger canonical state, runtime, recovery, security, and adapter requirements. No EDVID branding, logos, screenshots, trade dress, secrets workflow, arbitrary TSX, arbitrary ExtendScript, or global runtime assumptions are candidates for direct reuse.

Remotion is present in EDVID Phase 2/3 and pinned in the template package manifests. It is not incorporated by CEVRA at this baseline. Any future selection requires the composition benchmark plus review of the exact proposed Remotion version's then-current license and compatibility with CEVRA's proprietary commercial distribution.

## Dependency-driven implementation sequence

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
6. Cut compiler using the existing Media Runtime primitives
   ↓
7. Numeric QA Engine and correction/retry convergence
   ↓
8. Native preview and layered timeline over Project IR/history
   ↓
9. Caption cue compiler, SRT export, and text-layout fixtures
   ↓
10. CompositionEngineAdapter benchmark with EDVID visual/function fixtures
    ↓
11. Shortform and longform typed composition components
    ↓
12. Face/camera analysis, B-roll/asset placement, music/SFX, and richer QA
    ↓
13. Optional stock/generative providers and external/embedded Agent Gateway adapters
    ↓
14. Future skill/package management and NLE interchange
```

Steps 1–7 form the automated clean-edit core. Step 8 completes the first usable vertical flow. Steps 9–12 close the strong EDVID P1 baseline. Provider, agent-host, packaging, and Premiere work must not delay a self-contained CEVRA Vids when their capabilities are optional.

## Definition of EDVID baseline parity

CEVRA Vids may claim EDVID baseline parity only when all of the following are true:

1. The pinned EDVID tree and every relevant capability remain mapped; no capability or classification is `UNKNOWN`.
2. Every P0 and P1 matrix row is resolved as `PORTADO`, `MELHORADO`, or `NÃO APLICÁVEL` with its stated objective criterion and evidence. A type, interface, stub, ADR, or visual mock is insufficient.
3. All intentional differences are labeled `DIVERGÊNCIA EDVID` with a reason and evidence that the CEVRA outcome is safer, equal, or superior.
4. The complete flow works with real media: import → local understanding/transcription → automatic clean edit → layered editable timeline → preview/review → refinement → export.
5. Word boundaries, padding, time/frame mapping, multi-source order, fades, J-cuts where supported, delivery postconditions, and output organization pass representative fixtures.
6. Shortform and longform reference renders prove caption, headline, layout, camera, insert, transition, audio, and timing behavior for every published component.
7. Numeric QA detects known duration, junction, clipped-word, dead-air, black-frame, clipping, balance, sync, and delivery defects and verifies correction convergence.
8. Every mutation is a typed command with journal, snapshot, undo/redo, crash recovery, provenance, and safe artifact cleanup. Generated files never become a second source of truth.
9. Agent-assisted and manual paths act on the same APIs; Vids remains usable without Marketplace, paid providers, Content Intelligence, or an external agent.
10. PT-BR and EN-US user surfaces are in parity, dependencies/assets have reviewed licenses/provenance, and supported release platforms have real bundle/media/lifecycle evidence.
11. Existing Media Runtime integrity, allow-list, cancellation, timeout, delivery matrix, and one-active-job-per-worker tests remain green. No duplicate FFmpeg execution path is introduced.
12. A final line-by-line closure review finds zero silent gaps and reconciles implementation, tests, user documentation, and capability reports.

## Completeness ledger

### Files reviewed

All 83 tracked files at the pinned EDVID revision were reviewed. Text source was read directly; binary assets were inspected by type, dimensions or duration and by their use from source/template references.

- Root and agent metadata (8): `.gitignore`, `LICENSE`, `README.md`, `SKILL.md`, `agents/openai.yaml`, `edvid_install.py`, `install.md`, `pyproject.toml`.
- Dependency lock (1): `uv.lock`, including pinned direct/transitive packages and optional matting groups.
- Helpers (25): `caption_style.py`, `captions_for_remotion.py`, `captions_srt.py`, `chapters.py`, `contact_sheet.py`, `detect_color.py`, `face_track.py`, `google_images.py`, `grade.py`, `ingest_url.py`, `pack_transcripts.py`, `person_matte.py`, `pexels_search.py`, `preview_server.py`, `render.py`, `speech_regions.py`, `timeline_view.py`, `transcribe.py`, `transcribe_batch.py`, `treblo_music.py`, `verify_cut.py`, `voice_levels.py`, `watch_edits.py`, `watch_video.py`, and `wikimedia_images.py`.
- Reference documents (4): `log-grade.md`, `longform.md`, `premiere-mcp.md`, `shortform.md`.
- Preview application (5): `app.css`, `app.js`, `index.html`, and both logo PNGs.
- Shortform template/source/data (28): README, package/TS/Remotion config, eight TSX/TS source files, five JSON data fixtures, the caption-style screenshot, SFX generator, and nine MP3 SFX assets.
- Longform template/source/data (11): README, package/TS/Remotion config, three TSX/TS source files, edit data, and three MP3 SFX assets.
- Tests (1): `tests/test_installer.py`.

The category subtotals sum to the immutable `git ls-tree -r --name-only` count of 83. Every path in that tree was included in the review ledger. No functional EDVID file was excluded.

<details>
<summary>Exact 83-file inventory at the audited SHA</summary>

```text
.gitignore
LICENSE
README.md
SKILL.md
agents/openai.yaml
assets/longform/README.md
assets/longform/package.json
assets/longform/public/edit-data.json
assets/longform/public/sfx/click.mp3
assets/longform/public/sfx/pop.mp3
assets/longform/public/sfx/whoosh.mp3
assets/longform/remotion.config.ts
assets/longform/src/Main.tsx
assets/longform/src/Root.tsx
assets/longform/src/index.ts
assets/longform/tsconfig.json
assets/preview/app.css
assets/preview/app.js
assets/preview/edvid-logo-white.png
assets/preview/edvid-logo.png
assets/preview/index.html
assets/shortform/README.md
assets/shortform/caption-styles/stacked.png
assets/shortform/generate_sfx.py
assets/shortform/package.json
assets/shortform/public/caption-cues.json
assets/shortform/public/captions.json
assets/shortform/public/edit-data.json
assets/shortform/public/segments.json
assets/shortform/public/sfx/caption-click.mp3
assets/shortform/public/sfx/caption-scratch.mp3
assets/shortform/public/sfx/click.mp3
assets/shortform/public/sfx/click1.mp3
assets/shortform/public/sfx/click2.mp3
assets/shortform/public/sfx/cut-click.mp3
assets/shortform/public/sfx/pop.mp3
assets/shortform/public/sfx/tictac.mp3
assets/shortform/public/sfx/whoosh.mp3
assets/shortform/public/track.json
assets/shortform/remotion.config.ts
assets/shortform/src/CustomGraphics.tsx
assets/shortform/src/Main.tsx
assets/shortform/src/PencilOutline.tsx
assets/shortform/src/Root.tsx
assets/shortform/src/ScatterCaptions.tsx
assets/shortform/src/SimpleCaptions.tsx
assets/shortform/src/StackedCaptions.tsx
assets/shortform/src/index.ts
assets/shortform/tsconfig.json
edvid_install.py
helpers/caption_style.py
helpers/captions_for_remotion.py
helpers/captions_srt.py
helpers/chapters.py
helpers/contact_sheet.py
helpers/detect_color.py
helpers/face_track.py
helpers/google_images.py
helpers/grade.py
helpers/ingest_url.py
helpers/pack_transcripts.py
helpers/person_matte.py
helpers/pexels_search.py
helpers/preview_server.py
helpers/render.py
helpers/speech_regions.py
helpers/timeline_view.py
helpers/transcribe.py
helpers/transcribe_batch.py
helpers/treblo_music.py
helpers/verify_cut.py
helpers/voice_levels.py
helpers/watch_edits.py
helpers/watch_video.py
helpers/wikimedia_images.py
install.md
pyproject.toml
references/log-grade.md
references/longform.md
references/premiere-mcp.md
references/shortform.md
tests/test_installer.py
uv.lock
```

</details>

### Hidden capabilities found outside top-level prose

- Per-run voice-level analysis and worst-run gain protection in `voice_levels.py`.
- Transcript-cued visual sampling and perceptual deduplication in `watch_video.py`.
- Apple Log/HLG/PQ/wide-gamut evidence scoring in `detect_color.py`.
- RVM person mattes with limited-window processing in `person_matte.py`.
- Atomic preview save, HTTP media ranges, waveform/thumbnail caches, detailed J-cut/insert controls, and host-specific watcher behavior.
- Frame-up duration snapping, J-cut audio-tail measurement, sample-based delay, two-pass loudnorm fallback, and explicit Rec.709 tags in `render.py`.
- Installer allow-list and preservation behavior proven by the only upstream automated test file.
- The arbitrary CustomGraphics TSX and Premiere ExtendScript escape hatches, both intentionally rejected as CEVRA execution surfaces.

### Closure checks

- Functional EDVID files not reviewed: **none**.
- Relevant EDVID capabilities without a matrix row: **none identified**.
- `UNKNOWN` classifications: **0**.
- Capabilities credited as CEVRA `EXISTENTE` solely from documentation: **0**.
- Existing Media Runtime duplicated by the target plan: **no**; it remains the execution adapter for supported media primitives.
- Historical/prose-versus-code discrepancies are recorded in “Baseline facts and important discrepancies” and in affected matrix observations.

## Pinned evidence index

- [EDVID tree at audited SHA](https://github.com/fillrochaa/edvid/tree/d8e6389db02e8de0b46ee680105c09d4250d4703)
- [MIT LICENSE](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/LICENSE)
- [SKILL.md and hard rules](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/SKILL.md)
- [Installer](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/edvid_install.py) and [installer tests](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/tests/test_installer.py)
- [Render engine](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/helpers/render.py) and [numeric QA](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/helpers/verify_cut.py)
- [Transcription](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/helpers/transcribe.py) and [packed transcript](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/helpers/pack_transcripts.py)
- [Preview server](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/helpers/preview_server.py) and [preview application](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/assets/preview/app.js)
- [Shortform composition](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/assets/shortform/src/Main.tsx), [custom graphics](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/assets/shortform/src/CustomGraphics.tsx), and [longform composition](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/assets/longform/src/Main.tsx)
