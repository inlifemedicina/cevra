# CEVRA — Fable Targeted Technical Audit Review — Media Runtime, ProjectHistory, Preview & Export

**Date:** 2026-09-18.
**Status:** REVIEWED / INCORPORATED AS TECHNICAL EVIDENCE.
**Source:** second Claude/Fable targeted audit supplied by Product Owner.
**Effect:** measurements and code findings below change gate priority, but do not automatically approve implementation alternatives or Product Owner decisions.

## 1. Confirmed blockers

### 1.1 ProjectHistory hard failure
- Measured targeted audit reports full Project IR snapshots per commit plus whole-archive JSON cloning/serialization.
- Realistic 3×30 min word-level transcript project failed around 367 commits with `RangeError: Invalid string length`.
- This is treated as a correctness blocker, not merely a performance concern.
- Required before edit-command volume grows materially: remove repeated transcript payload from every snapshot or equivalent bounded strategy, preserve journal/undo/redo/recovery semantics, and remeasure.
- Preferred first candidate: content-addressed transcript storage/reference by existing canonical transcript digest, because transcript dominated measured snapshot size. Periodic snapshots/journal replay and incremental checkpointing remain follow-on candidates only if still necessary.

### 1.2 Windows runtime path defects
- Targeted audit found POSIX `python/bin/python3` assumptions in desktop host/supervisor paths while Windows runtime artifact uses `python.exe` layout.
- Treat as implementation defects to correct before Windows validation; not a Product Owner architecture decision.

### 1.3 Windows/video export capability gap
- Current release profile does not yet guarantee H.264 export on Windows or software fallback.
- Treat as V1 commercial blocker for Windows support.
- Hardware encoder validation and software fallback strategy require explicit evidence/licensing review before adoption.

### 1.4 Cut/J-cut execution gap
- Existing primitives cannot express stream offsets/mixing required for J-cut and current concat path may introduce avoidable recoding.
- Gate 2 must close two technical capabilities: loss-minimized/stream-copy-compatible concat where valid, and resolved per-stream temporal placement/mix.
- Do not pre-approve a single `execute-cut-plan` operation name or contract; benchmark incremental-preview versus one-pass-final-export strategies.

## 2. High-value confirmed findings

### 2.1 Media probe metadata loss
- Worker already exposes richer rotation/color/frame-rate metadata than current TypeScript contracts/adapter preserve.
- Extend contracts/adapter/ingest to preserve orientation, color metadata, bit depth/pixel format and avg/r frame-rate semantics before relying on mobile/iPhone sources.

### 2.2 Persistence amplification
- Current checkpoint path repeatedly serializes/deserializes the full history archive and rewrites large payloads.
- ProjectHistory remediation must include checkpoint/persistence cost measurement and removal of redundant work where integrity guarantees remain equivalent.

### 2.3 Composition contract is under-specified
- Existing composition contract is file-oriented and receives the entire Project IR.
- Before Composition Engine benchmark, define a resolved render-plan boundary sufficient for preview, snapshot/frame rendering, deterministic seeking and final export without making the engine reinterpret canonical Project IR independently.

### 2.4 HDR→SDR unavailable in current sealed path
- Current approved bundle/path does not yet provide validated deterministic tone mapping.
- V1 must at minimum identify HDR/VFR/rotation correctly and fail safely rather than silently produce incorrect output when a required conversion is unavailable.
- Any zimg/libplacebo/other dependency remains a benchmark/audit candidate, not an approved dependency.

### 2.5 Production render timeout gap
- Review indicates production render timeout defaults can effectively be unlimited.
- Add bounded timeout/watchdog policy where appropriate without breaking explicit user cancellation/recovery.

### 2.6 Disk/cache/temp policy remains incomplete
- Transcript cache has bounded policy, but proxies, thumbnails/evidence frames, PCM crash leftovers, composition cache and render staging still need ownership/cleanup/quota rules.

## 3. Preview direction to evaluate

First candidate architecture:
- WebView/native `<video>` playback for source/proxy media;
- shared live visual components in DOM/Canvas/WebGL where the selected Composition Engine permits;
- managed proxies only when source decode is unsuitable;
- bounded snapshot/partial-render fallback for effects not interactive in real time.

Do not build a general frame server/mini-NLE unless evidence proves necessary.

Composition benchmark must additionally evaluate:
1. can visual components run interactively in the application WebView;
2. can the engine consume original/source media without forcing lossy intermediates.

## 4. Final render/export direction to evaluate

Preferred conceptual ownership for benchmark:
```text
Project IR
→ application Render Planner / resolved render plan
   ├─ visual plan → Composition Engine
   └─ audio/temporal plan → Media Runtime
→ final encode/mux under a single quality contract
→ output file
```

Key invariant: preview and export consume the same resolved editorial plan; only quality/proxy/fidelity parameters may differ.

Do not yet freeze whether Composition Engine emits frames, an intermediate stream or a file. Benchmark I/O, generation count, quality and engine capability first. Avoid guaranteed extra generations.

## 5. Product Owner decisions now supported by evidence

These are pending approval, not auto-approved:

### K1 — Windows/export encoder strategy
- validate approved hardware paths on real Windows first;
- then decide whether a software H.264 fallback is required and commercially acceptable;
- do not substitute AV1/VP9 for universal H.264 delivery automatically.

### K2 — HDR→SDR V1 behavior
- safe minimum: detect HDR accurately and fail explicitly if a required SDR conversion cannot be performed correctly;
- benchmark a validated tone-mapping path for inclusion if justified.

### K3 — final render ownership
- prefer a single resolved render plan and avoid a mandatory extra encode between composition and final mux;
- exact frame/stream/file boundary requires benchmark before freeze.

### K4 — Composition benchmark criteria
- add live-WebView-preview compatibility;
- add original-media decode/intermediate-generation impact.

### K5 — V1 platform targets
- targeted audit recommends macOS + Windows first and deferring Linux unless separately justified/validated.

## 6. Findings that remain implementation details, not Product Owner decisions

- fix platform-specific Python executable resolution;
- preserve probe metadata already emitted by worker;
- add/verify production timeout/watchdog;
- `.gitignore` hygiene for Python cache files;
- remove redundant checkpoint validation if equivalent integrity is preserved;
- exact internal file layout for content-addressed transcript blobs.

## 7. Revised action order after current principal-chat work closes

0. Finish all work already underway in the principal development chat, including its real branch/PR/review/CI closeout.

1. Gate 0 — documentation/coherence cleanup.
- deduplicate acceptance catalog;
- reconcile stale records;
- register this targeted audit as evidence;
- do not delete stubs/branches without provenance/reference checks.

2. Gate 1A — ProjectHistory blocker remediation before high-volume edit commands.
- implement a bounded strategy preserving semantics;
- first candidate: transcript payload stored once/addressed by digest instead of duplicated in every snapshot;
- remeasure scenarios A/B/C;
- include checkpoint/persistence CPU, heap, serialization and I/O;
- do not move on if realistic projects can become unsaveable.

3. Gate 1B — small cross-platform correctness fixes.
- platform-aware private Python executable resolution;
- richer MediaProbeResult/ingest metadata;
- bounded render timeout/watchdog;
- Windows smoke prerequisites.

4. Gate 1C — evidence for pending Product Owner decisions K1–K5.
- Windows hardware encoder validation;
- H.264 software fallback licensing/compatibility study if needed;
- HDR→SDR tone-mapping benchmark/audit;
- render ownership I/O/generation benchmark;
- confirm V1 platform scope.

5. Gate 2 — coordinated Media Runtime pause.
- reconcile MR-A01–A06, MR-V01/V02, MR-Q01;
- close concat/loss and per-stream temporal-placement/J-cut gaps;
- measure preview-incremental versus one-pass-final strategies;
- keep application as editorial decision owner and MR as deterministic executor.

6. Gate 3 — Transcript Cache V1, aligned with new transcript-storage/history strategy.

7. Gate 4 — Preview/Playback + Render Compiler + disk/cache/temp + Windows architecture.

8. Gate 5 — Composition Engine benchmark with added live-preview and original-media criteria.

9. Gate 6 — first complete editable/exportable vertical.

10. Gate 7 — Agent Protocol PoC.

11. Gate 8 — clean-machine release closure.

## 8. Non-negotiable preserved decisions

- Project IR/ProjectHistory remain canonical audiovisual authority.
- PRESERVE → EXTEND → VERIFY → MIGRATE ONLY IF NECESSARY.
- no second Media Runtime/timeline/state.
- Creator/Bridge distinction unchanged.
- Creator Full standalone requirement unchanged.
- local export remains independent.
- publishing/performance analytics remain post-V1.
- no arbitrary shell/raw FFmpeg/filtergraph from untrusted surfaces.
- no mandatory paid AI API for core editing.

## 9. Product Owner decision K1 — APPROVED

**Date:** 2026-09-18.

Windows V1 H.264 strategy:
- approve `h264_mf` / Microsoft Media Foundation as the first official Windows H.264 path after real Windows validation;
- smoke-test capability before advertising/using it;
- prefer native Media Foundation path and use hardware acceleration when available/validated;
- do not make NVENC/QSV/AMF separate V1 requirements;
- do not add OpenH264 now;
- if the native Media Foundation path proves materially inadequate in real fixtures, reopen a software fallback evaluation with licensing/patent/compatibility review;
- never silently substitute AV1/VP9 for universal H.264 delivery.

Implementation is not authorized by this documentation entry. Real Windows runner/clean-machine validation remains required before release.
