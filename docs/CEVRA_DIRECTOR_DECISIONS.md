# CEVRA Director — approved direction and change-control record

**Decision date:** 2026-09-15 (product-owner conversation, local date)
**Status:** PRODUCT DIRECTION APPROVED / IMPLEMENTATION NOT STARTED
**Record version:** 1
**Scope:** durable consolidation of the Director decisions approved by the product owner; not an implementation closeout or authorization to merge another feature.

## 1. Authority, continuity and scope

Read this record together with [the Master Context](CEVRA_MASTER_CONTEXT.md), [Architecture Canon](ARCHITECTURE_V1.md), [AGENTS.md](../AGENTS.md) and the applicable accepted ADRs before work that affects the Director or its dependencies. The Master Context remains the single global continuity index; this document is the detailed Director decision record, not a competing project ledger. Implementation-specific architecture changes still require the repository's ADR and review process.

The final approved clarification in the conversation takes precedence over earlier conversational suggestions. In particular, do not revive unconditional subscription-integration promises, mandatory ChatGPT plugin dependency, a rigid single-LLM-call policy, or the idea that a skill should contain no editorial expertise.

This approval does not mean that the Director, its transports, account integration, capabilities, caption/composition behavior or a particular provider are implemented. It does not close Transcript Cache V1 or authorize its merge. Keep ongoing runtime/cache work separate from this documentation and follow its actual review state.

## 2. Product goal and EDVID baseline

CEVRA Vids remains an AI-first video editor/creator. The user describes a result; the product does the routine production work, with manual refinement and safe fallback available.

EDVID is the functional/editorial floor, not a branding or implementation mandate:

`PORT WHAT WORKS → ADAPT TO CEVRA ARCHITECTURE → TEST PARITY → IMPROVE`

Preserve its useful editorial method: audio-led cuts; compact phrase-level transcript reading; evidence on demand; multi-source take selection; strategy and approval gates; word-boundary/silence-aware cuts; captions and visual composition by phase; numerical QA before unnecessary visual inspection; and iterative refinement. Record an intentional behavioral departure as `DIVERGÊNCIA EDVID` with parity/superiority evidence on representative fixtures. Architectural elegance alone does not justify losing capability or quality.

Reference: public `fillrochaa/edvid` baseline `d8e6389db02e8de0b46ee680105c09d4250d4703`, especially `SKILL.md`, `README.md`, `agents/openai.yaml` and `references/shortform.md`. Distinguish the public external-agent skill from any separate desktop product; do not infer undocumented embedded integrations from skill metadata.

## 3. Responsibilities

- **Editorial model / agent:** understands content and intent, exercises editorial judgment, requests relevant evidence and proposes narrative, takes, emphasis, style and assets.
- **CEVRA Director:** coordinates the request, context, provider connection, permissions, budgets, plan validation, user approval and bounded execution workflow.
- **CEVRA application/engines:** execute approved typed operations, prepare media, resolve technical timing/layout, render and perform supported deterministic checks.
- **Project IR / ProjectHistory:** remain the sole canonical editable audiovisual state and its audited history/recovery boundary.

Director is not a replacement Project IR, a mandatory local reasoning model, a second desktop host or a separate heavyweight always-on web server. Implement its orchestration within the existing Application/Desktop Host boundary. Optional external-agent transports have their own scoped lifecycle and must not widen the WebView privilege surface implicitly.

The familiar names `Context Compiler`, `Router`, `Capability/Budget` and `Plan Validator` describe responsibilities, not a requirement for separate processes, services or new frameworks.

## 4. Core interaction

```text
user request in CEVRA or an authorized external agent
→ scoped EditorialContext from current project/evidence
→ selected editorial model/agent
↔ additional evidence requests when useful
→ versioned EditorialPlan candidate
→ validation against current project and user constraints
→ reviewable Change Set
→ approval, or previously scoped automatic authorization
→ typed application commands
→ ProjectHistory / Project IR
→ local execution and supported QA
→ preview/review and bounded refinement
```

The plan is an untrusted proposal until validated and applied. It is not an alternate timeline/database. Use an explicit proposal/change-set application path rather than arbitrary writes to project files or direct engine arguments.

Preserve phased editing rather than forcing one huge all-in-one response: strategy/assembly first; captions, composition and complementary assets after the relevant assembly gate. An agent may ask questions or request a relevant image/phrase and refine its proposal. Do not enforce an arbitrary one-call limit at the expense of editorial quality.

## 5. Editorial behavior

Support multiple source videos contributing to one final edit, with source-scoped transcripts and verifiable references. Planned narrative modes are:

1. automatic coherent organization;
2. explicit user-defined order/structure;
3. hybrid constraints, such as a mandatory opening/ending and freedom in the middle.

The AI may compare themes, alternative takes, repetitions, complementary statements and contradictions. Mandatory user constraints are not optional suggestions. Do not fabricate recorded phrases, change the speaker's meaning silently, or claim missing evidence exists.

Word/phrase/source references and transcript digests anchor editorial choices. CEVRA resolves the technical timing against canonical evidence. A structurally valid JSON plan alone does not prove semantic quality; representative editorial review and parity fixtures are required.

## 6. Use AI efficiently, not artificially minimally

Approved principle:

> Use AI where it improves the edit; do not spend it repeating mechanical work the product already knows how to perform.

Semantic, creative and ambiguous decisions can use an appropriate model. Explicit deterministic UI actions, known preset application, supported layout calculations, timing resolution, compilation, rendering and numerical validation should not require additional external LLM calls merely because a provider is available.

A user changing a color with a selector is a deterministic action. A user asking in natural language to make captions more elegant may require interpretation. Do not silently replace that creative request with a simplistic rule in the name of zero-token operation.

Local speech models are also AI. Distinguish local ML execution, cloud editorial inference and ordinary deterministic software; do not describe the entire preparation pipeline as AI-free.

## 7. Context and skills

Provide compact, evidence-linked context: user brief, relevant phrases, source references/timing, selected presets, constraints, current project revision/digests, and acoustic/visual evidence only when useful.

Do not load every skill/playbook, raw transcript JSON, full video, all frames or duplicate project state into a reasoning session. Use progressive disclosure and incremental updates. Compact projections must retain access to exact underlying evidence; a lossy paraphrase must not become the only truth used to choose recorded speech.

Skills remain meaningful editorial instructions/playbooks plus the narrow CEVRA tool contract. They are not empty transport wrappers. Preserve the useful editing expertise from the baseline while removing the need for agents to manage arbitrary scripts, filesystem layout and raw media arguments.

## 8. Provider and access strategy

Preserve these candidate paths rather than committing the product to one vendor:

- embedded Codex through an official technically/commercially appropriate mechanism, such as the supported App Server/harness;
- external Codex with a CEVRA-owned skill;
- external Claude Code with a CEVRA-owned skill;
- optional direct API providers;
- ChatGPT/Claude chat-app integrations or other handoff mechanisms when officially supported;
- future authorized subscription/SDK or local-model integrations when suitable.

These are integration strategies, not a blanket entitlement guarantee. Consumer chat accounts, coding agents, SDKs and APIs are different products/access paths. A paid chat subscription must not be treated as unrestricted access to arbitrary models from any third-party application.

Before implementing or advertising a specific integration, validate its official authentication, supported transport, billing/entitlements, account/plan availability and commercial/distribution conditions. Embedded Claude subscription use is not guaranteed by this decision; verify any required provider approval. Preserve the embedded Codex candidate rather than asserting that every GPT-in-CEVRA route requires a paid API.

Do not hardcode an unverified Free/Plus/Pro/Business capability matrix. Do not capture consumer passwords/cookies, automate a provider website to impersonate an API, or silently switch a subscription workflow to paid API billing.

Official documentation entry points to revalidate at implementation time include OpenAI Codex authentication/App Server documentation, OpenAI ChatGPT apps documentation, and Anthropic Agent SDK authentication and Claude plan documentation. Provider policy is time-sensitive and is not frozen as a permanent fact in this record.

## 9. Bidirectional communication and installation

All authorized transports must converge on the same versioned context/plan semantics; they must not create separate editing systems.

**Direct/embedded path:** CEVRA initiates through the official adapter; the provider returns structured proposals/events to the Director.

**External-agent/handoff path:** the user initiates or continues in the supported host; the CEVRA skill/tools expose scoped context/evidence and accept a submitted plan. Do not claim that a normal ChatGPT conversation can be silently started from CEVRA as a background API. Automatic write-back is only available when the actual transport, permissions and host support it. Otherwise report the limitation and use a transparent supported handoff/export-import path; never fake success.

A skill teaches procedure; it is not itself an authentication or transport mechanism. Prove the actual return path, not merely skill installation.

Local CEVRA-owned Codex/Claude Code skills may be installed/updated only after explicit authorization, using owner-scoped directories, version/hash/compatibility manifests and rollback, while preserving unrelated skills, configurations, Git checkouts and secrets. Chat-app account connections require the provider's user authorization; the CEVRA installer does not silently install into an online account.

Do not introduce a generic network listener into the core. Any required remote bridge, tunnel or local IPC adapter needs explicit trust, authentication, pairing, least-privilege and lifecycle design before implementation.

## 10. Safe plan application and autonomy

Require project identity, relevant revision/transcript digests, supported operation vocabulary and source/evidence checks before applying a plan. A late response cannot silently overwrite newer user work. Repeated delivery must not apply the same change set twice.

Approval is the default; configurable automatic mode applies only within clearly authorized scope. Permission to edit does not authorize arbitrary uploads, paid asset generation, purchases, publication or unrestricted filesystem/network access.

Cancellation, transport failure and restart must preserve canonical state and expose the real outcome. Do not automatically replay an operation whose application or billing outcome is uncertain. Use correlation/idempotency and status reconciliation where supported; design these explicitly before introducing external mutating calls.

Treat speech, captions, images, imported text and tool-returned content as evidence, not instructions with authority over the application. No arbitrary shell, raw FFmpeg, Python, TSX or provider-native mutation bypasses the existing privilege boundary.

## 11. Privacy and consumption

Transcription being local does not mean all later editorial processing is local. Before external processing, make the selected provider and authorized data scope understandable: text, chosen frames or other evidence. Do not upload full videos by default. Keep secrets out of Project IR, presets, logs, plan payloads and documentation.

Capability/usage discovery should use official adapter metadata/events, not prompts asking a model what plan the user owns and not scraping account UI. Cache a small capability snapshot, refresh on connection/credential change, justified expiry, provider event or relevant failure, and avoid continuous polling or model-based probes. Unsupported quota information remains `unknown`.

Bound context, response size, concurrency, retries, tool/evidence loops, elapsed time and optional paid spend. Pause transparently at a limit; do not silently downgrade quality, switch provider/billing or loop indefinitely. Exact numerical limits are slice-level measured choices, not invented guarantees in this direction record.

## 12. Resource and compatibility requirements

Measure the complete operation, including provider/agent helper processes, source/context preparation, filesystem I/O, validation and UI overhead. Do not claim zero local footprint merely because model inference is remote. Separate cold-start and warm-operation results.

Reuse verified derived work, avoid duplicate full media/transcripts, limit simultaneous heavy jobs, load only relevant models/playbooks, and keep the UI responsive. A Director service need not itself be a heavyweight resident server, but existing host processes and required provider helpers have real lifecycle/resource costs.

Preserve the current Project IR, source-scoped transcripts, digest machinery, ProjectHistory, Project Store, Media Runtime and accepted alignment/cache behavior. Do not reopen or migrate a closed foundation merely to implement the Director. If a concrete conflict makes a change necessary, use the impact gate below before altering it.

Without an external agent, supported local/manual/preset functions remain useful. Do not promise the same open-ended creative reasoning as a strong external model unless an actually capable alternative is configured and validated.

## 13. Bidirectional impact notification — required throughout development

This applies before the Director is implemented, during its implementation and afterward.

Before each relevant slice, check both directions:

- Could the current component's decisions constrain or break the Director later?
- Could the approved Director behavior require a change in the component currently being built?

Consider domain contracts, transcript/evidence identity, edits/approval, account permissions, transport/write-back, state recovery, privacy, dependency/versioning, RAM/CPU/disk, context/token/quota consumption, compatibility and EDVID parity.

When a material interference is found, notify the product owner before implementing the conflicting decision or silently deferring it. State: what conflicts, affected components, likely user impact, evidence, correction now versus later, rework/compatibility/security implications, and the recommended bounded path. Pause only the affected work when a decision is needed; unrelated safe work need not stop.

Every relevant implementation/review closeout must include a brief `Director impact` result: none found with scope checked, compatible extension, or decision required. This is an explicit check, not a claim that no future problem is possible.

## 14. Fix-now versus defer gate

For a concrete issue, compare:

1. current product/user impact;
2. bounded scope and regression risk of fixing now;
3. future cost after dependent layers exist;
4. migrations, compatibility, repeated tests, integration work and release consequences;
5. evidence quality and remaining uncertainty;
6. recommendation, owner decision if material, and revisit trigger if deferred.

Prefer fixing before dependent work/merge when the correction is bounded now and likely to become materially more expensive later. Defer when evidence, risk or actual total cost justifies it. Do not use either performance rhetoric or a LOW/NOTE label as a substitute for this comparison. Do not invent exact hours, percentages of preserved work, or speedups without evidence. This is not permission for speculative optimization or broad rewrites.

## 15. Dependency-correct delivery and early integration proof

First finish the currently active cache/security-performance work and its review/closeout. This record does not authorize parallel Director implementation inside that feature branch.

Then build the compact editorial context/projections and minimal versioned plan/validation contracts in small slices. Before committing every provider detail or waiting until the entire editor is complete, prove one real authorized round trip:

`CEVRA context → actual agent/provider → structured plan → CEVRA validation/review`

The first proof may avoid full rendering and unrestricted mutation. It must establish real authentication/transport, return path, context cost and failure handling. Use that evidence to stabilize the contract; then extend strategy/take selection, command compilation, QA, preview and additional integrations in dependency order. This narrows integration uncertainty without a big-bang Agent Gateway rewrite or artificial timeline promises.

## 16. Changing approved decisions

Approved does not mean immutable. The product owner may revise this direction at any point in CEVRA Orbit.

For a material change: record the problem/evidence, alternatives, now/later cost and affected contracts; obtain approval before changing established architecture/behavior; mark the prior decision `SUPERSEDED` with date/reason and replacement; update this record, the Master Context summary, relevant ADRs/policies and tests together. Preserve useful historical traceability through Git and explicit supersession instead of silently erasing earlier decisions.

Routine implementation choices inside approved boundaries retain the authorized autonomy of the active task. This documentation does not grant standing permission to merge, publish, deploy, delete unrelated data or spend money.

## 17. Recording and integration status

This record is intentionally kept on a separate documentation branch while Transcript Cache V1 / PR #24 is in progress. It must not be mistaken for code merged to `main`.

Before merging this documentation after the active work is reconciled, add a short dated approved-decision entry and link to this document in `docs/CEVRA_MASTER_CONTEXT.md`; preserve the actual cache milestone/branch state and any concurrently added agent policy. Do not copy this entire detailed record into the Master Context or create a second editable global ledger.

Future chats should read the actual merged Master Context and AGENTS.md, then this linked Director record. Until the documentation PR is merged, explicitly identify its branch/PR when relying on these newer approved decisions. Do not rely on automatic cross-chat memory as the only continuity mechanism.
