# CEVRA — Fable Adversarial Audit Review — 2026-09-18

**Status:** REVIEWED / INCORPORATED AS TECHNICAL EVIDENCE.
**Source:** independent Claude/Fable adversarial review supplied by Product Owner.
**Effect:** does not supersede approved product decisions by itself; accepted findings become validation items/gates below.

## 1. Accepted findings

1. **Composition is V1-critical.** A real composition path is required for captions/headlines/layouts; benchmark timing is raised in priority.
2. **Installer/runtime size risk is real.** Current PT alignment model is ~1.26 GB and multiple runtime stacks exist. Core Runtime Closure remains canonical, but actual clean-machine size must be measured before deciding whether any mandatory signed bootstrap exception is justified.
3. **Alignment runtime deserves optimization benchmark.** Evaluate ONNX/smaller PT model/safetensors against current PyTorch path, but do not switch unless timing/accuracy/security/package-size evidence is acceptable.
4. **Software export fallback requires review.** Current release FFmpeg build is intentionally restrictive; commercial export cannot silently depend on suitable hardware/driver availability. Exact encoder strategy requires licensing/patent/compatibility review.
5. **ProjectHistory scalability risk is real.** Current implementation stores full Project IR snapshots per commit and persistence serializes the archive; benchmark before edit-command/timeline volume grows materially.
6. **Agent commercial/official path remains unproven.** Run supported-mechanism PoCs before depending on external/embedded agents in commercial UX; deterministic/manual editor flow remains independent.
7. **Development switches must not survive as exploitable stable-release bypasses.** Prefer build-time exclusion/locked release behavior plus CI verification.
8. **Documentation duplication/drift needs reconciliation.** Acceptance catalog duplicate sections and stale/misplaced records must be cleaned before implementation prompts depend on them.
9. **Technical foundation gaps must be explicitly reviewed:** preview/playback architecture, final render/export/mux ownership, HDR/VFR/tone mapping, fonts, disk/cache/temp lifecycle, and Windows clean-machine validation.
10. **Media Runtime ownership needs sharper boundaries.** Candidate directions to validate include one-pass cut-plan execution, batched frame extraction, application-owned editorial decisions, Media Runtime-owned deterministic media execution, and Composition Engine-owned visual layers.

## 2. Findings accepted only as benchmarks / not yet decisions

- ONNX replacing PyTorch alignment: benchmark candidate only.
- smaller PT-BR alignment model: benchmark candidate only.
- mandatory first-run signed model bootstrap: not approved; consider only after measured installer size/cost proves bundle disproportionate.
- specific software encoders (SVT-AV1/libvpx/OpenH264): shortlist ideas only; H.264 delivery compatibility/patent/licensing must be assessed before selection.
- operation names such as `execute-cut-plan`, `analyze-audio` and `extract-frames`: useful design candidates, not pre-approved contracts.
- HyperFrames versus FFmpeg/libass-only benchmark: FFmpeg/libass may be a useful baseline for simple captions, but the canonical composition benchmark remains broader because CEVRA requires motion/layout/composition beyond subtitles.
- reusing the existing headless desktop host under Creator: strong implementation candidate, not a change to D19.

## 3. Findings not adopted as decision changes

- Do not erase or arbitrarily relabel approved D1–D19 simply because implementation is not immediate. Preserve V1/post-V1 classifications already approved and refine only with evidence.
- Do not change Recovery Mode to watermark/reduced export. Current approved rule remains: no new usable final audiovisual output after entitlement expiry/grace; legal/commercial review may revisit later with explicit Product Owner approval.
- Do not redefine Creator Full as merely a Bridge or remote Desktop shell. D19 remains: Creator Full is standalone, has its own visual Workspace, and must deliver final video without CEVRA Desktop.
- Do not reject a temporary/versioned Creator Project Profile in advance. First preference is shared Project IR; a convertible subset remains allowed if host constraints genuinely require it.
- Do not choose or reject Remotion based only on this audit. Exact current commercial licensing and benchmark evidence must be revalidated before selection.
- Do not automatically remove Search Gateway/Pexels or other approved providers from the architecture. V1 inclusion depends on later scope/cost/security evaluation.
- Do not adopt the auditor's five-gate sequence literally where it conflicts with later Product Owner sequencing. Use accepted findings inside the canonical CEVRA gate order.

## 4. Creator/Bridge clarification

Canonical distinction remains:

```text
CEVRA Bridge Skill
→ supports external AI used by CEVRA Vids
→ returns/consumes typed Agent Protocol
→ execution remains in CEVRA Vids

CEVRA Creator Skill Lite/Full
→ agent-native standalone editor/creator
→ own visual Creator Workspace
→ reuses CEVRA core/runtime/UI as much as practical
→ Full must edit + review + QA + render final video without Desktop
```

The audit proposal to reuse one headless CEVRA core is valuable and should be evaluated when Creator implementation begins. It is a reuse strategy, not a redefinition of Creator as Bridge.

## 5. Canonical action order after current in-progress main-chat work

Do not interrupt current implementation/review work already underway in the principal development chat.

After that work is objectively closed:

### Gate 0 — documentation and global coherence closeout
- reconcile actual main/active PR state;
- integrate the reviewed Fable findings;
- remove acceptance-test duplication;
- correct stale/misplaced documentation;
- verify V1/post-V1 labels without reopening approved product decisions;
- verify obsolete branches/stubs before any deletion.

### Gate 1 — technical foundation risk validation (analysis/benchmark)
- ProjectHistory growth/persistence benchmark with realistic transcript + edit volumes;
- clean-machine installer/runtime inventory and measured sizes;
- current alignment runtime versus ONNX/smaller-model alternatives;
- export encoder/driver/software fallback feasibility;
- release/dev-switch audit.

These validations may inform scope but do not silently change runtime/model/architecture.

### Gate 2 — coordinated Media Runtime gate
- announce required PAUSA DE AVANÇO;
- reconcile MR-A01–MR-A06, MR-V01, MR-V02 and MR-Q01 with all later decisions and Fable findings;
- classify existing/integration/extension/new-operation/non-MR;
- explicitly evaluate one-pass cut-plan and batched-frame primitives;
- freeze a bounded dependency-correct implementation plan;
- implement/test the approved slices before the next functional milestone.

### Gate 3 — Transcript Cache V1
- resolve schema/key/invalidation/model/source identity/storage/corruption/cleanup;
- preserve source-scoped transcript semantics and ProjectHistory guards.

### Gate 4 — technical foundation gap decisions
- preview/playback architecture;
- final render/export compiler and mux ownership;
- HDR/VFR/iPhone media policy;
- font packaging/licensing;
- disk/proxy/cache/temp quotas and cleanup;
- Windows validation matrix.

Some subitems may move earlier if they are direct prerequisites of Gate 2; do not duplicate systems.

### Gate 5 — Composition Engine benchmark/selection
- benchmark canonical CEVRA/EDVID matrix;
- include HyperFrames and any credible alternatives/baselines;
- measure visual parity, timing, deterministic seek, performance, bundle/runtime cost, security and commercial licensing;
- select only after evidence.

### Gate 6 — first complete editable/exportable vertical
- typed cut/edit commands;
- application compiler/orchestration;
- deterministic execution;
- undo/redo/recovery;
- preview/review;
- final export;
- macOS + Windows validation where supported.

### Gate 7 — Agent Protocol PoC
- only after there is a useful deterministic vertical for an agent to operate;
- verify official supported mechanism, containment, capability negotiation and no paid/API fallback surprises.

### Gate 8 — release closure
- clean-machine install;
- measured installer/packs;
- code signing/notarization;
- updater signing;
- development bypass absent;
- previous-known-good/rollback;
- core capability smoke.

## 6. Sequencing principle

Current unfinished work always closes first. Documentation/audit work may prepare the next gate but must not bypass active review/merge/frozen-base rules.

After the current slice, the coordinated Media Runtime remains the mandatory next implementation gate before advancing to another feature milestone. Fable-derived validations are inserted before/inside that gate as analysis, not as an unrelated feature detour.

## 7. Product Owner disposition after reviewed audit — 2026-09-18

The Product Owner reviewed the numbered findings and approved the following refinements. These are product/technical directions and sequencing decisions; they do not authorize source implementation, dependency installation, model download, provider spending or merge by themselves.

### 7.1 Composition Engine

No change to the approved architecture. Composition remains V1-critical and the existing ADR 0012 / Integration Decision 13 benchmark remains the gate. Do not reduce the benchmark to FFmpeg/libass-only; HyperFrames stays the priority candidate and the benchmark remains broad enough for captions, layouts, B-roll, motion graphics, alpha, audio/timing, preview/export and both orientations.

### 7.2 Core Runtime Closure

Proceed with the measured closure work. Before selecting bundle versus mandatory bootstrap versus runtime/model optimization:
- measure clean-machine package/runtime/model size per supported platform;
- benchmark current alignment runtime against approved optimization candidates;
- do not adopt ONNX, a smaller model, safetensors conversion, PyAV removal or mandatory first-run model download merely because the audit suggested it;
- a mandatory signed bootstrap still requires measured evidence and Product Owner approval under AGENTS rule 33.

### 7.3 ProjectHistory scalability — compatible adjustment approved in principle

The scalability concern is accepted. The Product Owner approved correcting the internal history/persistence strategy if the benchmark confirms material growth, provided compatibility is preserved.

Required sequence:
1. benchmark realistic transcript/project sizes and edit counts;
2. preserve journal semantics, undo/redo, recovery, snapshots/version identity and existing project compatibility;
3. prefer an internal compatible optimization such as periodic/keyframe snapshots, journal replay, content/digest deduplication and/or incremental checkpointing only after evidence;
4. do not create a second history system or remove recoverability.

If the correction remains an internal compatible persistence/history refinement, no new Product Owner behavior decision is required. A schema/package migration with material user/recovery consequences returns for approval.

### 7.4 Final render ownership

No new product decision is required. ADR 0013 remains canonical:
- intermediates such as a cut/preview render are disposable derivatives;
- final-quality export rereads original sources/assets when technically applicable;
- the implementation/compiler must reproduce approved timing, J-cut, color, audio and composition from canonical state without making the intermediate a master.

### 7.5 Compatibility-first export and HDR policy — approved refinement

For V1, optimize for broad delivery compatibility without making export depend solely on a working hardware encoder.

Direction:
- common/social delivery profiles should target broadly interoperable output, with MP4/H.264 as the principal compatibility target when the destination/profile calls for it;
- validated hardware encoding may be preferred for speed;
- before claiming a supported release target, CEVRA must have an acceptable fallback path when the preferred hardware encoder/driver is unavailable; the exact software encoder/library is selected only after licensing, patent, packaging, quality and platform review;
- do not substitute AV1/another codec merely because it is easier to bundle if that reduces destination compatibility;
- MR-V01 must explicitly detect/report HDR-relevant transfer/primaries/range/bit depth plus VFR/timing facts needed by policy;
- preserve HDR when the chosen output/profile supports and requests it;
- when the target is SDR, perform a deterministic validated HDR→SDR conversion rather than silently exporting washed-out/mistagged media;
- exact tone-mapping implementation/filter/dependency remains an implementation choice subject to bundle capability and commercial review.

This is a compatibility requirement, not approval of OpenH264, SVT-AV1, libvpx, zimg or any other specific dependency.

### 7.6 Agent round-trip

No direction change. Keep the already approved provider-neutral protocol and Codex/App Server proof path. The real round-trip remains an early proof gate before agent-dependent UX is treated as commercially available. Do not invent a new automatic editing mode merely to satisfy the audit; local/manual/preset capabilities remain the no-agent baseline.

### 7.7 Project IR — what must be reviewed immediately

Do **not** pre-design a large speculative “Project IR v3 editorial” now.

Before dependent implementation, create one coordinated IR delta review that classifies every requested concept as:
- canonical durable edit state;
- derived/rebuildable execution state;
- UI/transient state;
- provider/engine-specific state that must stay outside the canonical model.

The immediate requirement inventory must at least review:
- graphic add/update/remove and durable graphic/component instances;
- layout add/update/remove where layout is truly user/project state;
- caption linkage needed for D15 (source/occurrence/version/word references) without duplicating the canonical transcript;
- caption placement overrides by interval where they are durable user/edit state;
- audio envelope/fades/gain state needed by MR-A03/MR-A05/MR-A06;
- versioned registered component reference + validated parameters for D23;
- clip operations needed by the real editing compiler.

Rules:
- generic `extensions` must not become an unvalidated second timeline or carry hidden canonical media/time state;
- do not add one domain type/command per visual effect;
- finalize the minimum visual representation after the Composition Engine benchmark exposes the actual durable requirements;
- direct MR-A06 requirements may be resolved earlier when necessary for the coordinated runtime gate.

### 7.8 HEIC/HEIF and AVIF — V1 requirement confirmed

JPEG/JPG, PNG, WebP, **HEIC/HEIF and AVIF** remain required V1 image-ingest targets. This is already present in Integration Decision 6 and acceptance test I6-T1 and is now reconfirmed by the Product Owner.

Implementation policy remains:
1. try the existing probe/application classification path first;
2. prove real decode/metadata/ingest with fixtures on supported platforms;
3. if the current stack cannot safely support HEIC/HEIF or AVIF, add the smallest bounded decoder/adapter/runtime extension required;
4. preserve the original and generate a managed compatible derivative only when preview/composition requires it;
5. do not silently drop these formats from V1 merely to avoid the dependency work.

### 7.9 Preview V1 — compatibility-first direction approved

Preview V1 will be designed to remain engine-neutral and compatible with final composition rather than becoming another source of truth.

Preferred direction to formalize in the Preview V1 ADR:
- playback uses the original when the desktop/WebView path can decode it reliably; otherwise use a managed disposable proxy generated by the approved media path;
- timeline/project revision remains canonical; preview/proxy files are derived;
- captions/graphics/layout overlays should reuse the same first-party component definitions/parameters as final composition whenever technically practical, avoiding independent styling logic;
- heavy effects that cannot be reproduced interactively may use representative snapshots or bounded preview renders instead of forcing full-quality render on every interaction;
- final export still follows ADR 0013 from originals/assets;
- reviewed-version identity uses at least canonical project revision + `headSnapshotId` (and any additional digest required by implementation);
- preview/export equivalence must be acceptance-tested; UNKNOWN is not silently treated as equivalent.

The exact player/proxy/cache implementation is deferred to the Preview V1 ADR and benchmark; this direction does not select a new framework.

### 7.10 Matting / behind-the-subject

No change. Keep PP-Matting/PP-MattingV2 as the preferred commercial candidate and RVM as the EDVID quality reference, with short CEVRA acceptance validation. N4/behind-subject remains non-blocking for basic V1.

For caption placement, N1 remains default. N2 may use lightweight face/person tracking and does **not** require the heavy Vision Pack by definition. N3/N4 may depend on optional/heavier subject-mask/matting capability according to measured packaging cost.

### 7.11 Motion graphics catalog

Keep D23. Before implementing the first-party component catalog:
- inventory the actual recurring graphics/behaviors used by the pinned EDVID reference and representative fixtures;
- derive the smallest useful CEVRA catalog from that evidence;
- maximize parameterization (text, value, color, position, timing, easing, media ref) rather than multiplying component types;
- unsupported bespoke effects use a safe fallback or remain unavailable instead of accepting arbitrary agent code.

### 7.12 V1 font pack — direction approved now

Use a small bundled first-party font set sufficient to reproduce the six EDVID caption families without relying on proprietary/system fonts:

- **Poppins** — karaoke/simple/stacked sans roles;
- **Playfair Display** — stacked serif/display role;
- **Lora** — scatter/dispersed serif role;
- **Libre Baskerville** — serif static role;
- **Inter** — classic subtitle role.

Packaging requirements:
- pin exact font files/revisions and weights actually used;
- retain required OFL notices/license material;
- use the exact same bundled files and font metrics in preview and final export;
- verify PT-BR Latin/Latin-ext glyph coverage;
- do not fall back to Helvetica/system fonts in a way that changes grouping/layout silently;
- do not add a larger font library to V1 merely for optional customization.

Any later Brand Kit/custom-font feature remains a separate decision.

### 7.13 Search Gateway

No change. The later integration decisions already narrow Gateway use to cases with a real shared-secret/quota/billing need and explicitly defer building it. Open/public/direct providers and BYOK remain direct when appropriate.

### 7.14 Windows

No change. Windows support cannot be claimed from pins alone. Before a Windows release claim, require a real runner/clean-machine path covering Media Runtime, Python workers, encoder availability/fallback, WebView2/preview, packaging, filesystem/app-data behavior, cancellation/recovery and representative media smoke.

### 7.15 Documentation/stub cleanup — immediate Gate 0 work

The audit finding is confirmed:
- the cumulative acceptance catalog currently contains duplicated integration/test blocks and must be deduplicated while preserving stable IDs and the newest approved expectation;
- `EDVID_PARITY.md` still carries an obsolete CEVRA baseline marker and should be reconciled with current status;
- `packages/history/model.ts` and `packages/plugin-sdk/contracts.ts` appear to be legacy/unwired stubs: they are not part of the current root build/test package list and repository code search found no current imports/usages.

Action:
- perform the acceptance-catalog/stale-doc reconciliation in Gate 0;
- before deleting either stub, run the final repository/branch/reference/provenance check required by AGENTS 31;
- delete only if confirmed to contain no unique contract/history obligation or useful historical content; otherwise archive/replace references deliberately.
No opportunistic deletion inside unrelated implementation work.

### 7.16 D8 / EDVID hard rule 2 — prudent interpretation approved

Preserve EDVID's **behavioral guarantees**, not its agent-era command topology.

A typed, allow-listed CEVRA compiler may generate a validated coordinated multi-input media graph for junctions/J-cuts if it:
- preserves words, sync, bounded overlap, fades/normalization and the approved Project IR plan;
- remains internal/deterministic rather than agent-supplied raw filtergraph;
- proves equal or better output and acceptable cost against the EDVID reference.

Per-segment extraction/concat remains a valid reference/fallback/preview strategy where useful, not a permanent architectural prohibition on an internal typed graph.

When implemented behavior materially departs from EDVID hard rule 2, record `DIVERGÊNCIA EDVID` with evidence.

### 7.17 SFX pack — first-party provenance path approved

Do **not** copy or redistribute EDVID click/scratch/whoosh assets merely because the behavior is part of the reference.

CEVRA V1 will use a small native SFX pack (initially the effects actually needed by delivered styles/transitions, such as click/pop/whoosh and any validated scratch/tick variant) with one of these sources:
1. CEVRA-created/commissioned first-party audio with documented rights; preferred;
2. individually audited CC0/permissive assets when first-party production is not justified.

Every distributed SFX must have:
- stable asset ID/version;
- origin/author/source record;
- license/rights record;
- checksum;
- redistribution status;
- inclusion in NOTICE/THIRD_PARTY_LICENSES when applicable.

Acceptance test I11-T2 remains mandatory. No third-party sound library is copied wholesale.

### 7.18 Remotion

No change. Remotion remains reference/fallback candidate only; exact commercial terms/cost and version must be revalidated if it becomes a real selection. Do not accept or reject it based only on the Fable audit.

### 7.19 Development/release switches

No product change. Existing development-only switches must be audited before release. Stable/release behavior must fail closed:
- development-only GPL/test bypasses must not become a user-enableable release capability;
- prefer build-time exclusion/locked release mode when practical;
- CI/release verification must prove the stable artifact cannot activate prohibited development paths.

## 8. Immediate versus later work after this disposition

### Immediate in Gate 0 / Gate 1 analysis
- deduplicate/reconcile documentation and legacy stubs safely;
- benchmark ProjectHistory growth;
- measure clean-machine runtime/model closure;
- review alignment optimization candidates;
- audit export encoder/fallback feasibility;
- audit release development switches;
- prepare the coordinated Project IR requirement delta list;
- freeze the small V1 font-pack direction and SFX provenance policy.

### Must enter/reconcile before closing the coordinated Media Runtime plan
- VFR/HDR/color metadata requirements;
- HDR→SDR execution requirement for SDR targets;
- software/cross-platform export fallback requirement;
- evaluate batched-frame primitive only if measured call pattern justifies it;
- HEIC/HEIF/AVIF support path only to the extent a real runtime/decoder gap is proven;
- direct MR-A06 state/command prerequisites.

### Before caption/composition implementation
- Preview V1 ADR;
- minimum Project IR extension after benchmark evidence;
- exact font artifacts/weights packaged;
- Composition Engine benchmark/selection;
- image-ingest fixtures including HEIC/HEIF/AVIF;
- EDVID-derived minimum motion-graphics catalog.

### Before release claims
- Windows clean-machine validation where Windows is advertised;
- full closure/packaging measurements;
- release-switch fail-closed verification;
- licenses/provenance for fonts/SFX/engines/models/encoders;
- final preview/export parity and delivery compatibility tests.

This disposition does not reopen decisions 1–23 and does not authorize implementation ahead of the current canonical gate sequence.
