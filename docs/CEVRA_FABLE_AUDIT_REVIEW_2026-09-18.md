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