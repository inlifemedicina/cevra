# ADR 0030 — Semantic Editorial Analysis Boundary V1

**Status:** ACCEPTED DIRECTION / IN DEVELOPMENT
**Date:** 2026-09-29

## Context

Editorial Transcript Projection V1 provides a closed, read-only and paginated
view of canonical source-scoped transcripts. The next editorial stage needs to
exchange bounded transcript evidence with a semantic analyzer without granting
that analyzer filesystem, engine, command or ProjectHistory authority. A valid
JSON response alone is not sufficient: references must belong to the exact
context supplied, coverage must remain Application-calculated and the project
binding must still be current when a result is accepted.

This slice establishes that boundary. It does not select a provider, deliver a
Director/Agent Gateway, prove semantic quality, choose takes or create an edit
plan.

## Decision

Add a provider-neutral `SemanticEditorialAnalyzerPort` and an Application
service with profile `cevra.semantic-editorial-analysis.v1`. The port receives
only a compact serialized JSON envelope plus ordinary execution lifecycle
state. It never receives ProjectHistory, source paths, media, engines,
credentials or a command callback. Future provider adapters may implement this
port through the approved provider lifecycle; this ADR does not create a
parallel provider authority.

The Application service:

1. captures and validates a closed request once, using one non-coercive rule
   for execution/context identifiers and closed enum values;
2. derives evidence exclusively through `EditorialTranscriptProjectionService`;
3. replaces native source/evidence identities with execution-local aliases;
4. measures the complete UTF-8 JSON payload actually delivered;
5. treats the analyzer response as untrusted JSON;
6. validates its closed schema, context binding, supplied references, quotes,
   coverage and current project/transcript state;
7. returns a deeply immutable, in-memory derived result with canonical
   evidence resolved by Application.

An accepted result means the transport contract and evidence binding are
valid. It does not prove the analyzer's interpretation true.

## Context and output contract

The initial context is text-only and contains source aliases, bounded reasoning
fragments, time intervals, timing basis, coverage and explicit limitations. It
does not expose source URI, display name, checksum, technical descriptor,
engine provenance or provider-native IDs. A fragment reference identifies the
exact page fragment supplied, so continuations of the same projection unit do
not collide.

The output is a closed V1 union:

- `analysis-candidate`: cited themes, ideas, caveats, possible false starts or
  repetitions, possible equivalence/complement/contradiction, uncertainties
  and limitations;
- `needs-evidence`: a bounded request for more authorized transcript context,
  or an explicit unsupported visual/acoustic need.

Every material observation needs supplied evidence and every relation needs
distinct evidence on both sides. The contract has no best-take score, mandatory
ranking, cut range, edit command, code, shell or filtergraph.

## Bounded evidence exchange

The default initial message is at most 64 KiB. The 256 KiB total is a hard cap
on the sum of complete UTF-8 JSON envelopes actually delivered to the analyzer,
including task metadata, brief, coverage, references and any context resent in
the second invocation. Prepared but unsent fragments are not considered
supplied. Analyzer output is byte-bounded by Application before JSON parsing.
Lists, references and strings have explicit limits. At most two analyzer
invocations occur per execution: the initial request and one authorized text
continuation. A future provider adapter must additionally bound transport
receipt before constructing the `Promise<string>` response; this in-process
limit does not claim to bound bytes already received by such a transport.

Initial disclosure is deterministic and breadth-first across requested sources:
when the budget permits, one projection fragment from each available source is
offered before progressive filling from an earlier source. Projection remains
the only text grouping authority. Each source retains an ephemeral cursor, so
an authorized request for `S2` can collect `S2` without exhausting `S1`.
Sources not yet collected remain pending evidence; they are not relabelled as
no-speech or unavailable. An indivisible oversized unit in one source does not
prevent considering another source. Budget/collection barriers return explicit
partial `context-limit`; `NO_PROGRESS` is reserved for requests that can add no
new evidence.

The analyzer may request more text only from selected source aliases and may
anchor the request only to evidence already supplied for that source. It cannot
request a path, URL, tool or arbitrary operation. Repeated requests without new
evidence terminate as no progress. Visual/acoustic requests return explicit
unsupported evidence; no Media Runtime call is invented. Reaching the evidence
or invocation limit preserves partial coverage instead of silently claiming a
complete analysis.

Bytes are not tokens. This slice does not estimate token use, provider cost or
arbitrarily large project analysis, and does not implement map/reduce,
embeddings or a vector database.

## Concurrency and lifecycle

The service binds project ID, revision, snapshot, selected sources, canonical
transcript digests, projection/analysis profiles and journal entry count before
the first analyzer call. It revalidates before additional evidence, after every
response and immediately before publishing a result. Journal count detects
commit→undo even when the visible snapshot returns to the prior value.

Cancellation and one monotonic deadline, measured from entry to `analyze()`,
reject expired preparation, continuation, parsing and late responses. Explicit
guards run before and after projection/analyzer work and synchronously before
returning any accepted result; the deadline is never restarted between stages.
Cooperative event-loop yields between projection pages allow timers and aborts
to run. JavaScript already executing synchronously is not preemptible, but work
that finishes after the deadline cannot authorize a subsequent call or result.
Cancellation has precedence when cancellation and timeout are both observable.
One execution may be active per service instance. If an adapter ignores
cancellation, the result is never accepted and the instance remains busy until
the external promise settles; the service does not claim the external work was
stopped. There are no automatic retries or analyzer switches.

## Authority and persistence

The result is derived, immutable and process-local. This slice writes nothing
to Project IR, ProjectHistory, Project Store, Media Execution Archive or
Transcript Cache, and adds no schema migration, command, database, dependency,
transport, entitlement or billing path. Transcript text remains untrusted
evidence separated from the task instructions. Even a prompt-influenced
response cannot execute commands or access files through this boundary.

Director impact is a **compatible extension**: Director may later coordinate
scope, authorization and provider choice; the analyzer interprets; Application
validates; typed commands and ProjectHistory remain the only mutation boundary.

## Evidence and next gate

The production package contains no fixture analyzer and has no fallback that
fabricates analysis. Scripted analyzers exist only in tests and prove the
boundary, not general semantic understanding or editorial quality.

Before dependent UX or a claim that Semantic Editorial Analysis V1 is
functional, the next required gate is a real CEVRA-context → officially
supported analyzer → structured response → Application validation round-trip.
That gate must measure fidelity, caveat preservation, relationships,
uncertainty, citations, data disclosure, latency, cost and failure behavior.
Provider selection and integration are outside this slice.

Until that gate completes, this ADR remains
**ACCEPTED DIRECTION / IN DEVELOPMENT** and Semantic Editorial Analysis V1 as a
whole remains **NOT DELIVERED**.

## Review remediation — 2026-09-28

Independent review of reviewed head
`05462c442f40414299dc6d7c78a2fce53ad948ff` returned **CHANGES REQUIRED BEFORE
PR**. The bounded remediation at code/test checkpoint
`cc61dc3e205a88a08f2700f6d82ab5cd9d2ba74a` addresses F-1 through F-6 without
changing the provider-neutral architecture: exact runtime enum validation, one
identifier rule, an entry-to-return deadline, per-source on-demand collection,
breadth-first initial disclosure, cumulative transmitted-envelope accounting
and analyzer-availability checks before transcript projection. Focused
independent re-review concluded **APPROVE WITH NON-BLOCKING NOTES — ANALYSIS
BOUNDARY ONLY** at approved feature head
`0e3d9fa10db076f920d084b6582faf576aa50687`.

## Slice A implementation closeout — 2026-09-29

**Semantic Editorial Analysis Boundary V1 — Slice A is IMPLEMENTED / CLOSED**
for the technical boundary defined by this ADR. PR #53 merged the approved head
by normal merge commit `0cde0d29cfe3f3d417955e20e5ad672b3e02ceba` with no
post-approval code change. Pull-request CI `36575808711` passed all five jobs
and Exact Runtime `36575808713` passed. On the merge SHA, CI `36576763557`
passed all five jobs and Exact Runtime `36576763666` passed.

This closeout does not close the ADR as a whole. No real analyzer/provider,
transport, upload, entitlement, billing or semantic-quality evaluation ran.
The real-agent round-trip described above is the **NEXT REQUIRED GATE / NOT
STARTED**, and complete Semantic Editorial Analysis V1 remains **NOT
DELIVERED**.

## Real-agent gate attempts — 2026-09-29

The first official-provider attempts do not alter the accepted boundary:

- the preserved Codex App Server diagnostic at
  `788e9c0dd5b3f66a4b531ce70853a82ff5f0cfd1` remains **BLOCKED —
  CONTAINMENT**, with zero threads and zero turns. It is not a demonstrated
  escape or a universal rejection of Codex;
- Claude Code CLI is the next bounded private proof candidate; its initial
  preflight was **BLOCKED — VERSION** before authentication or inference. Claude
  Desktop exposed only an internal Linux/aarch64 payload labelled 2.1.270 on
  this macOS host; no host-executable `claude` command existed to verify help,
  auth, model/effort, containment or stream transport;
- the explicitly authorized continuation installed official **2.1.280 /
  darwin-arm64** outside the repo. Signed manifest, exact SHA-256, native
  publisher signature/notarization and version/help passed, without global
  configuration changes. The executable prerequisite is resolved;
- the historical AUTH blocker was resolved by official human subscription login;
  sanitized status reports Claude.ai / first-party / Pro. Documentation/configuration
  preflight and absent local managed policy permitted the bounded adapter and
  deterministic tests, then one minimal real canary;
- the first canary failed the `system/init` containment gate without a retained
  failing field. A focused closed diagnostic, tested before the one authorized
  follow-up canary, identified `INIT_PLUGINS_NONEMPTY`: the second init reports
  two plugins, zero tools/MCP/skills and no permission bypass. Both owned children
  closed; 2/8 attempts used, no final response accepted. This is a reported
  capability that keeps containment blocked; neither actual tool execution nor
  an escape is proven. Determine the 2.1.280 init-field semantics before another
  run. No flag, prompt, model, effort or acceptance rule was relaxed.
- later, operator-only diagnostic attempt #3 identified two distinct virtual
  `@builtin` source labels, with no evidence of plugin execution. A specifically
  authorized restrictive session override set those two exact private IDs to
  `false` in a temporary `--settings` file for corrective canary #4. The
  original gate accepted that `system/init`, but the following assistant event
  failed `MODEL_UNAVAILABLE`; no final semantic response was accepted. The
  precise assistant model-field value was not retained. Ledger was 4/8 at that checkpoint; no
  PT-BR, EN-US or real cancellation matrix was run. This is an observed
  version-specific init result, not universal isolation or real-agent success.
- official Agent SDK contracts and the pinned public Python parser distinguish
  an `assistant.error` from `assistant.message.model`; final `result` subtype
  `success` is not acceptance when `is_error=true`. The focused reader now
  preserves this distinction while requiring actual allowed-Opus generation,
  unchanged capability checks and Application validation. Canary #5 passed the
  same init gate, then explicitly declared `authentication_failed` with a
  synthetic message model; its final result reported `is_error=true` and
  `terminal_reason=api_error`. The transport returned `PROVIDER_AUTH_ERROR`,
  and Application accepted no analysis. #4's provider cause remains unproven.
  Ledger is 5/8; the editorial/cancellation matrix remains NOT RUN. An
  official-client authentication investigation/decision is the next bounded
  gate, not a retry, billing change or parser exception.
- official read-only `auth status` subsequently identified a local environment
  mismatch: the former child omitted `USER`/`LOGNAME` and appeared logged out,
  while the login-equivalent environment and the child with only the effective
  OS username restored both report Claude.ai/Pro under the same config
  directory. That correction is not proof of model-call acceptance. Closed
  error-explanation categories were added without raw-text retention or a
  containment change. Canary #6 was NOT RUN because the original private
  five-attempt ledger and diagnostic #3 override receipt had disappeared from
  the recorded temporary location; they were not reconstructed. Historical
  count remains 5/8. Recovery of those exact receipts or a separate explicit
  evidence-control decision is required before any further real attempt.

The 2026-09-30 Product Owner authorization supplied that evidence-control
decision: a persistent, private experiment checkpoint counts the five original
attempts as debited and their receipts as unavailable, without reconstructing
them. New attempts reserve and sync a unique slot before spawning the client;
an incomplete reservation is not refunded. Diagnostic #6 stopped at the first
init after recapturing the two current virtual builtin identifiers, outside
Git. Small synthetic PT-BR attempt #7 applied the session-only restrictive
override and passed the unchanged init gate, but the next `system` event had a
subtype not retained by the closed public summary and failed `CONTAINMENT`.
There was no accepted model answer or Application result, and history/redo
remained unchanged. The ledger is **7/8 used**; the final slot and EN-US,
continuation and cancellation were not run after this material failure.
Exact post-init event semantics require a focused decision before any further
real process. This changes neither the accepted Slice A boundary nor the ADR's
IN DEVELOPMENT status; the real-agent gate remains unproved.

Subsequent version-matched review used official TypeScript Agent SDK
`v0.3.280` (declared Claude Code 2.1.280 parity) and a closed no-tools event
policy. Real attempt #8 used pre-correction code `793d634`: the original init
gate passed, then a documented `system/thinking_tokens` progress event was
rejected as `CONTAINMENT / FORBIDDEN_SYSTEM_EVENT`, before any assistant/result.
The SDK defines this event as approximate progress during redacted thinking,
not a tool, hook or semantic answer. The later reader correction validates
its bounded numeric shape and grants no result authority; it is tested offline
but has **not** had a subsequent real run. The durable ledger is **8/8 used**,
zero slots remain; #7's subtype is still unknown. This PoC therefore still
has no accepted Application round-trip. Any additional inference requires a
separate Product Owner decision, not an automatic retry. Slice A remains
CLOSED and this ADR remains ACCEPTED DIRECTION / IN DEVELOPMENT.

The private adapter is deterministically tested; the eight historically debited
processes have not yielded an accepted transport/Application round-trip. Synthetic canary envelopes were written to the CLI; remote inference
or consumption before termination is unknown. No API key, extra usage, retry/
fallback, Project IR/History mutation or product integration was introduced.
Effective model/effort and editorial quality remain unproven.
Claude is a candidate for this proof, not a replacement
for the historical Codex preference or an approval for commercial use. The
[attempt evidence](../CEVRA_SEMANTIC_CLAUDE_ROUNDTRIP_POC_V1_EVIDENCE.md)
records the official mechanism, installed-state facts and exact prerequisite.
Complete Semantic Editorial Analysis remains **NOT DELIVERED** and progress
remains **55%**.

The subsequent 2026-09-30 Claude PoC F-1–F-5 remediation is **offline only**,
at code/test checkpoint `0fd4fba8e4b0f595c3abfadbb9743aeb7e2de13e`.
Its historical experiment is terminal in code (8/8, zero balance), independently
of local-record availability; operational harness modes cannot invoke Claude
or auth, and historical inspection detects orphan/mismatched receipts without
refunding reservations. Result terminal reasons, primary provider-error
preservation, explicit empty-plugin init and system-event classifications were
corrected with 115/115 PoC, 26/26 semantic Application, 210/210 full Application
tests and a passing Node/TS build. No Application/History/projection contract,
private ledger or provider authority changed. Independent review subsequently
approved `de0aee79b0ed66b16b5434efad953da855ce0df0` with non-blocking notes.
Only its N-1 follow-up (`1aa4324d9bcb4e404919d0af17c3b4d072abdbd5`, preserving
recognized provider error before a same-chunk oversized tail) awaits focused
verification; new offline PoC 119/119 and semantic Application 26/26 pass.
The existing evidence record retains reviewer/implementer separation and
deferred N-2–N-4. There is still no accepted semantic round-trip. A new real proof requires
explicit authorization of a new ID, budget and scope. This is a compatible
Director correction and does not close this ADR or deliver complete analysis.

Non-blocking limits retained by the closeout are:

- at extreme transcript scale, `history.current` materialization or an
  individual projector call may dominate elapsed time; re-evaluate on material
  latency or timeout in representative future real-integration fixtures;
- initial disclosure first attempts one fragment per source when it fits, then
  may favor earlier sources; it is neither quantitatively balanced nor a
  ranking policy;
- consuming an operational ID before a busy result and the current
  `AbortError` classification do not justify a code change in this closeout;
- the future real adapter must bound transport receipt before constructing its
  `Promise<string>` response. The Application pre-parse limit does not replace
  that mandatory adapter boundary.
