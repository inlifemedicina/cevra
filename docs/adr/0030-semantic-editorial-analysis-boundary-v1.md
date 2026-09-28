# ADR 0030 — Semantic Editorial Analysis Boundary V1

**Status:** ACCEPTED DIRECTION / IN DEVELOPMENT
**Date:** 2026-09-28

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

1. captures and validates a closed request once;
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

The default initial message is at most 64 KiB; accumulated evidence/context is
at most 256 KiB. Analyzer output is byte-bounded before JSON parsing. Lists,
references and strings have explicit limits. At most two analyzer invocations
occur per execution: the initial request and one authorized text continuation.

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

Cancellation and one total timeout reject late responses. One execution may be
active per service instance. If an adapter ignores cancellation, the result is
never accepted and the instance remains busy until the external promise
settles; the service does not claim the external work was stopped. There are no
automatic retries or analyzer switches.

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

Until that gate and independent review complete, this ADR remains
**ACCEPTED DIRECTION / IN DEVELOPMENT** and Semantic Editorial Analysis V1 as a
whole remains **NOT DELIVERED**.
