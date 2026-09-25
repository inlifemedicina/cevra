# CEVRA — inventory of PR #25/#26 reconciliation

**Date:** 2026-09-21.
**First reconciliation base:** `origin/main` `83a66d47c48d07811b9a79b2eeb217d5a0813e95`.
**Final residual reconciliation base:** merged PR #27 / `origin/main` `a8e7546332a56075aab5a6ea88081e34a29cf53f`.
**Purpose:** prove which unique documentation was incorporated, superseded, omitted or left unresolved before PR #25/#26 closure.

## PR #25 — `docs/cevra-director-decisions`

### Incorporated

- Director responsibilities and boundary with editorial model, application/engines and Project IR/ProjectHistory.
- Scoped EditorialContext → evidence loop → structured/versioned plan → validation → Change Set → approval/autonomy → typed execution → review.
- Multi-source automatic, explicit-order and hybrid narrative modes.
- Progressive evidence/context and efficient use of AI for semantic work rather than deterministic mechanics.
- Provider-neutral access strategy; consumer subscription is not an entitlement/API promise.
- Skill is procedure, not authentication/transport; real return path must be proved.
- stale-state, idempotency, cancellation, privacy, capability/budget and fail-closed behavior.
- Bidirectional Director impact check, fix-now/defer gate and early real round-trip.
- Explicit Product Owner pause before unresolved material decisions.

### Superseded or normalized

- Historical `main`, PR #24 and PR #25 branch-state paragraphs were replaced by current state in the Master Context.
- “Integrate this later” handoff language was removed because this branch performs the reconciliation.
- Repeated process rules were reduced to AGENTS rules 34–39; detailed behavior remains in the Director record.

### Intentionally omitted

- Any implication that the Director/provider integration is implemented.
- Blanket promise of reusable consumer subscriptions, embedded Claude or universal write-back.
- A requirement for separate Context Compiler/Router/Validator processes or a new framework.

### Unresolved unique material

- Exact Agent Protocol schemas, adapters, provider mechanisms and Product Owner-approved architecture changes remain future work.

## PR #26 — `docs/editorial-decisions-1-8`

### Incorporated decision families

- Editorial D1–D13: import/start distinction, progressive evidence, take assessment/selection, meaning preservation, duration, pacing, junctions, strategy, color, conventional audio, QA and watched-version review.
- Visual D14–D18: adjustable presets, transcript-linked captions, legible grouping, progressive placement/safe-zones/QA, six EDVID caption styles and post-V1 personalization boundary.
- Composition D19–D23: two split variants, contextual asset selection, external asset incorporation, full-frame B-roll and registered first-party component boundary.
- Integration I1–I19: Agent Protocol; OpenAI/Claude/local adapters; disclosure; image ingest; search/lifecycle; generative assets; audio/SFX; specialized engines; composition; staging/playbook; P2P/mobile; 3D; external-editor handoff; account/entitlement; distribution/update/crash; export/publishing and Bridge/Creator Skills.
- Creation Modes: Faceless, Slideshow, conditional Music-to-video, Brand Kit, provider-neutral TTS boundary.
- Skill portfolio: Vids first; Bridge supports Vids; Creator is a later standalone product surface with shared Lite/Full core.
- Fable evidence: ProjectHistory correctness blocker, Windows/runtime/export defects, metadata/preview/render/disk findings and K1–K5.
- Product Owner acceptance cases: deduplicated, stable IDs retained where useful, missing D19–D23 and K1/K3/K4 coverage added, future cases remain honest.
- Update/licensing/security/product/orbit directions were retained inside the consolidated integration record where they have one clear owner.

### Superseded or normalized

- Repeated historical SHAs, per-commit PR handoffs and “CEVRA 3” chat-state instructions were replaced by current factual state and the canonical organogram.
- The old “Media Runtime immediately after current chat” sequence was refined by later Fable evidence: ProjectHistory blocker and small correctness prerequisites now precede the coordinated runtime gate.
- D18 personalization is explicitly post-V1; six EDVID styles + Nenhum remain V1.
- Early general export/HDR language was refined by approved K1–K5.
- Twenty provider-specific integration files were consolidated into one provider-neutral decision record; provider snapshots remain implementation-time gates rather than durable promises.
- Composition decisions 19–23 were consolidated into one composition record.
- Two repeated integration/test blocks in the acceptance catalog were removed.

### Intentionally omitted

- Deletion of `CEVRA_ORGANOGRAMA.md` from PR #26; it resulted from the stale branch base and conflicts with newer current-main authority.
- Wholesale PR #26 modifications to `ARCHITECTURE_V1.md`, `PRODUCT_SPEC.md`, `INTEGRATIONS.md`, `LICENSING.md`, `SECURITY.md` and `ORBIT.md`. Their still-valid unique product directions were consolidated without rewriting accepted foundations or creating duplicate truth. `UPDATE_STRATEGY.md` was the exception resolved by the final residual reconciliation below.
- Historical provider prices, plan matrices, policy/allowlist status and URLs as permanent capabilities.
- Unverified claims that a provider, model, filter, codec, engine or dependency is available, commercially eligible or implemented.
- Proposed operation/type names and internal layouts not approved by architecture review.
- Duplicate acceptance variants and stale “next decision”/handoff prose.
- Suggested deletion of stubs/branches; no cleanup is part of this task.

### Unresolved unique material

- Exact current provider mechanisms, entitlements, pricing, retention, licensing and commercial conditions.
- ProjectHistory remediation design and migration implications.
- Exact Media Runtime operations/contracts, tone-mapping dependency and Windows fallback if `h264_mf` fails.
- Preview V1 ADR, resolved render-plan contract and final Composition Engine.
- Model/runtime/font/SFX/provider artifacts and their exact versions/licenses.
- Account/billing/distribution provider selection and go-live parameters.
- Which post-V1 integration/Creator/3D features enter each release.

## Final residual reconciliation

The first reconciliation merged in PR #27 but correctly stopped PR/branch cleanup after a fresh comparison found that the approved `CEVRA Update Strategy v3` remained uniquely detailed in PR #26.

The final residual reconciliation restores `docs/UPDATE_STRATEGY.md` as the dedicated canonical owner for:

- one CEVRA Update Controller and the eight managed/external component classes;
- V1 simplification, managed-component/model manifests, upstream review flow, Compatibility Matrix and capability negotiation;
- transactional staging/promotion/healthcheck/rollback, model lifecycle and `componentId + version/schema` compatibility;
- skills/playbooks, remote provider metadata/advisories, project migration, channels and class-specific validation/rollback;
- supply chain, bandwidth/storage, user-facing UX and upstream-breakage policy;
- Core Runtime Closure, signed direct distribution/Tauri updater, signing-key lifecycle, safe restart/forced-update limits, diagnostics and resilience.

Additional residual material came from the update-adjacent parts of Integration I18 and the PR #26 `SECURITY.md`/`PRODUCT_SPEC.md` changes: local inspectable diagnostics bundles, offline signing-key backup/rotation, no restart during critical work, no generic remote kill switch and update independence from analytics/crash services. These now live in `UPDATE_STRATEGY.md`; they do not create duplicate foundation authorities.

### Final artifact classification

- `AGENTS.md`: process rules incorporated by PR #27; historical handoff text superseded.
- `ARCHITECTURE_V1.md`, `PRODUCT_SPEC.md`, `INTEGRATIONS.md`, `LICENSING.md`, `SECURITY.md`, `ORBIT.md`: durable product/architecture direction is represented by current canonical records plus Update Strategy; provider/commercial snapshots and repeated prose are intentionally omitted.
- `CEVRA_EDITORIAL_DECISIONS.md`, `CEVRA_VISUAL_DECISIONS.md`, composition decisions D19–D23 and their separate D21–D23 files: incorporated into the dedicated Editorial, Visual and Composition records; split/repeated artifacts superseded.
- external integration overview and I2–I19 files: incorporated into the provider-neutral Integration record, Product Owner acceptance catalog and Update Strategy; volatile provider mechanisms/prices/terms remain implementation-time gates.
- `CEVRA_CREATION_MODES_V1_DIRECTION.md` and `CEVRA_SKILL_PRODUCT_DECISION.md`: incorporated into Integration/Composition records and Master Context; separate handoff artifacts superseded.
- Fable audit/targeted audit: incorporated as canonical evidence with ProjectHistory blocker and K1–K5 preserved.
- PR #26 Master Context and acceptance catalog: current-main reconciled versions supersede stale state, duplicate cases and handoff prose while retaining approved decisions and stable acceptance coverage.
- `UPDATE_STRATEGY.md`: still-valid unique v3 architecture incorporated by this final residual reconciliation.

### Final omissions and unresolved implementation choices

Historical prices, plan matrices, provider allowlists/status/URLs, named provider candidates not expressly kept by newer canonical direction, speculative internal types and stale sequencing remain intentionally omitted. Exact providers, commercial terms, runtime/model artifacts, ProjectHistory remediation, Media Runtime contracts, Windows/HDR fallback details, Preview ADR and final Composition Engine remain unresolved implementation/product gates rather than missing documentation decisions.

## Closure candidacy

After this final residual reconciliation is reviewed and merged, a final comparison should find no still-valid approved unique material remaining only in PR #25 or PR #26. At that point both PRs and their branches are safe supersession/cleanup candidates. No cleanup occurs before merge and final verification.
