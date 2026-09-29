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
At closeout, the real-agent round-trip described above was the **NEXT REQUIRED
GATE / NOT STARTED**. Complete Semantic Editorial Analysis V1 remains **NOT
DELIVERED**; the later PoC preflight below does not change that conclusion.

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

## Authorized real-agent PoC preflight — 2026-09-29

The Product Owner authorized a separate, synthetic-data-only PoC using the
installed official Codex App Server over stdio and existing ChatGPT allowance,
limited to eight real turns. This operational feasibility attempt does not
replace the provider-neutral port, enable Desktop integration or authorize
paid API fallback. It changes no CLOSED Application contract and introduces
no new production adapter or architectural pattern requiring a separate ADR.

Status: **PoC IN DEVELOPMENT / BLOCKED — CONTAINMENT**. Read-only official
metadata discovery identified the preferred model and ChatGPT auth, but the
required pre-thread removal of all native tools and unrelated instruction
sources was not proved for the exact installed alpha build. No thread or
`turn/start` was issued; semantic quality, real continuation and real
cancellation are NOT RUN. Empty dynamic tools, read-only sandbox and denied
approvals are not accepted as a substitute for this proof. Empty environment
selection is a relevant documented protocol control, but not by itself an
attestation of the full effective tool/instruction surface.

The [PoC evidence](../CEVRA_SEMANTIC_CODEX_ROUNDTRIP_POC_V1_EVIDENCE.md)
records the reproducible metadata-only diagnostic. The next action is an
officially supported and verified containment configuration for the exact
runtime, not further scaffolding, a different provider or weakening the gate.
Slice A stays CLOSED; this ADR remains IN DEVELOPMENT. I1/I2/I5 are preserved,
and no editorial acceptance ID is claimed complete.
