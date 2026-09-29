# Semantic Editorial Analysis Boundary V1 — Evidence

**Status:** SLICE A IMPLEMENTED / CLOSED — REAL-AGENT GATE ACTIVE, BLOCKED BEFORE INFERENCE

**Date:** 2026-09-29

**Canonical base:** `394d959c43c1591b74aa5c1755ec2757a4dee045`

**Branch:** `feat/semantic-editorial-analysis-boundary-v1`

**Code checkpoint:** `30dc2e502a7d64849a5bd12d82e563f5d13b4c8f`

**Payload-characterization test checkpoint:** `f43f100f33c0b054772133c7a853415918518c40`

**Reviewed head:** `05462c442f40414299dc6d7c78a2fce53ad948ff`

**Remediation code/test checkpoint:** `cc61dc3e205a88a08f2700f6d82ab5cd9d2ba74a`

**Approved feature head:** `0e3d9fa10db076f920d084b6582faf576aa50687`

**Feature PR:** #53

**Feature merge:** `0cde0d29cfe3f3d417955e20e5ad672b3e02ceba`

Independent review of the reviewed head returned **CHANGES REQUIRED BEFORE PR**
for F-1 through F-6. The checkpoint above is the consolidated remediation;
focused independent re-review concluded **APPROVE WITH NON-BLOCKING NOTES —
ANALYSIS BOUNDARY ONLY** on the approved feature head. This preserves the
review history instead of retroactively treating the first reviewed head as
approved.

## Remote integration evidence

| Stage | Workflow | Run | Event | SHA | Result |
|---|---|---:|---|---|---|
| approved feature | CI | `36514742518` | `push` | `0e3d9fa10db076f920d084b6582faf576aa50687` | 5/5 SUCCESS |
| feature PR | CI | `36575808711` | `pull_request` | `0e3d9fa10db076f920d084b6582faf576aa50687` | 5/5 SUCCESS |
| feature PR | Audio Sequence Exact Runtime | `36575808713` | `pull_request` | `0e3d9fa10db076f920d084b6582faf576aa50687` | SUCCESS |
| post-merge | CI | `36576763557` | `push` | `0cde0d29cfe3f3d417955e20e5ad672b3e02ceba` | 5/5 SUCCESS |
| post-merge | Audio Sequence Exact Runtime | `36576763666` | `push` | `0cde0d29cfe3f3d417955e20e5ad672b3e02ceba` | SUCCESS |

PR #53 merged the frozen approved head normally at `2026-09-29T13:39:51Z`.
The Exact Runtime runs are regression evidence for affected Application paths;
they are not execution of a real semantic analyzer.

## Delivered boundary

- closed, versioned `SemanticEditorialAnalyzerPort` under
  `@cevra/application`;
- compact `AnalysisContextV1` built from the closed Editorial Transcript
  Projection V1 rather than regrouped transcript data;
- execution-local `S…`/`E…` aliases with an internal canonical manifest;
- actual compact UTF-8 JSON byte measurement, 64 KiB initial message, a 256
  KiB cap on the sum of all complete envelopes delivered (including resends),
  and at most two analyzer invocations;
- closed `analysis-candidate | needs-evidence` response validation;
- canonical citation resolution, distinct relation sides and exact optional
  quote verification;
- one scoped text continuation; explicit visual/acoustic unsupported result;
- project revision/snapshot/journal/transcript stale guards;
- cancellation, total timeout and late-response rejection;
- immutable in-memory result and zero canonical mutation.

The remediation additionally proves:

- non-coercive closed enum parsing in both the public parser and service;
- one closed 128-character ASCII identifier rule for request, generated and
  parsed execution/context identifiers;
- one monotonic deadline from operation entry through final synchronous
  acceptance, including post-work guards;
- deterministic breadth-first initial disclosure across sources, followed by
  bounded per-source on-demand projection;
- a later authorized source remains reachable without exhausting an earlier
  source, and a source blocked by one indivisible unit does not suppress a
  smaller source;
- prepared-but-unsent evidence is never reported as supplied and a budget
  barrier returns partial `context-limit`, not false `NO_PROGRESS`;
- analyzer absence is detected before transcript projection.

No production analyzer, provider transport, media read, model, embedding,
filesystem capability or mutation surface was added.

## Directed evidence

The new Application test catalog uses real `ProjectHistory`, real
`SourceTranscript` aggregates and the real projection. Its analyzers are named
scripted fixtures and live only in test code.

Covered scenarios include:

- equivalent PT-BR and EN-US two-source editorial fixtures;
- one-source and multi-source flows;
- transcript unavailable and no-speech distinctions;
- closed request capture, one-read getters, optional `undefined`, unknown keys
  and thrown getters;
- malformed/oversized/extra-field output and bounded collections;
- wrong-context, unsupplied, duplicate and fabricated-quote references;
- unique fragment references when one reasoning unit spans pages;
- partial coverage that cannot be upgraded by analyzer declaration;
- authorized text continuation, out-of-scope/repeated requests, invocation and
  context limits;
- explicit visual/acoustic `needs-evidence` without Media Runtime;
- mutation during await, transcript replacement and commit→undo ABA;
- cancellation, timeout, late responses and single-active-execution behavior;
- hostile transcript instructions remaining inert evidence;
- ProjectHistory, journal, snapshots and redo unchanged on success/error;
- deep immutability and caller/output alias isolation.

The original reviewed-head directed result was **16/16 PASS**, which is retained
as historical evidence and did not cover the independently reported findings.
The remediated directed catalog passes **26/26**. The compact PT-BR two-source fixture delivered
seven fragments in one 2,322-byte request and received an 828-byte response.
The equivalent EN-US one-source fixture delivered four fragments in one
1,648-byte request and received a 356-byte response. These are exact compact
UTF-8 JSON measurements from the scripted fixture run, not token, latency,
quality or provider-cost estimates.

Transmission characterization from the remediated tests:

| Scenario | Request bytes delivered | Sum | Total ceiling | Unique delivered/final context evidence |
|---|---:|---:|---:|---:|
| successful two-call continuation | 3,987 + 8,939 | 12,926 | 262,144 | 7,911 bytes in final cumulative context |
| Unicode/JSON escaping, second call blocked | 65,509 | 65,509 | 131,072 | 63,458 bytes delivered |

The blocked second call is absent from both the analyzer call count and
provenance. These are in-process JSON envelope bytes, not tokens, money or a
claim about the wire bytes of a future provider protocol.

Bounded scale characterization used the real closed projection:

| Fixture | Projection calls | Fragments prepared | Fragments sent | Request bytes | Local measured operation time |
|---|---:|---:|---:|---:|---:|
| one approximately 30-minute source | 1 | 36 | 18 | 4,020 | 54.53 ms |
| three approximately 30-minute sources | 3 | 279 | 86 | 16,335 | 227.83 ms |
| one approximately 30-minute source + two short sources | 3 | 96 | 64 | 12,185 | 77.60 ms |
| 120,000-word source + later short source | 3 | not materialized in full | 20 | 3,943 + 6,415 | 2,942.23 ms after fixture setup |

For the mixed long/two-short fixture, preparation was 57.83 ms, the scripted
analyzer 0.04 ms and post-response validation 19.74 ms. Observable heap deltas
were GC-sensitive (including negative deltas); the extreme 120,000-word source
showed about 138 MB positive heap delta in this run. This is honest local
characterization, not a portable benchmark or unlimited-project certification.
The extreme also confirms the remaining bounded cost: an individual closed
projector call may still be linear in a very large source, but the semantic
boundary no longer eagerly exhausts every source or blocks later-source access.

The complete remediated Application suite passed **210/210**. The monorepo
Node/TypeScript build passed. Its regression run passed all non-Desktop-Host
package suites; the first Desktop Host run
used the macOS system Python 3.9 and correctly classified two managed-runtime
fixtures as `runtime-invalid`. Re-running that affected package with the
available explicit Python 3.12.14 test environment passed **74/74**, followed by
Desktop **45/45** in the broad run. The complete production build passed. No
native FFmpeg catalog, ML model download or real semantic analyzer was run.
Historical CI `36495858520` applies only to reviewed head
`05462c442f40414299dc6d7c78a2fce53ad948ff`; it is not evidence for the
approved remediation. The remote table above records the final feature and
post-merge runs. This document intentionally does not use a self-referential
final documentation SHA.

## Honest scope

These tests prove serialization, budgets, lifecycle, stale detection and
evidence authority. They do **not** prove that a real model understands themes,
false starts, caveats, contradiction or visual references. EDT-001, EDT-004 and
EDT-005 therefore remain unimplemented product capabilities. TXI-001, TXI-002
and TXI-005 remain closed by the preceding projection work and are not reopened.

The objective contract evidence relates to D2-T1/D2-T3, D3-T2, D4-T2,
D5-T1/D5-T2 and I1/I5, but it does not mark those editorial or provider
acceptance cases executed. The real-agent round-trip remains the next required
gate.

Two provider-specific attempts are tracked without changing this closed Slice A
evidence. The preserved Codex App Server branch at
`788e9c0dd5b3f66a4b531ce70853a82ff5f0cfd1` is **BLOCKED — CONTAINMENT**
with zero threads and zero turns. The Claude CLI candidate's historical
**BLOCKED — VERSION** state was resolved by authorized local installation of
official macOS arm64 Claude Code 2.1.280, with signed-manifest/hash and native
signature/notarization verification. Its current status is **BLOCKED — AUTH**:
official status reports no login. Containment and inference have not run;
zero of eight real harness executions were used. Neither attempt proves
semantic quality or changes the boundary.
See
[Claude attempt evidence](CEVRA_SEMANTIC_CLAUDE_ROUNDTRIP_POC_V1_EVIDENCE.md).

## Future real-agent evaluation rubric — NOT EXECUTED

For each prepared PT-BR/EN-US fixture, record separately:

1. **Fidelity:** observations remain supported by the supplied transcript;
2. **Caveats:** conditions and exceptions remain explicit;
3. **Relationships:** equivalence, complement and possible contradiction are
   distinguished without silently resolving ambiguity;
4. **Uncertainty:** unsupported visual/acoustic claims are declined and
   uncertainty is stated categorically;
5. **Citations:** every material claim maps to the correct supplied fragment;
6. **Operations:** input/output bytes, data disclosed, latency, provider/model
   identity when known, reported usage/cost when actually available, and typed
   failure behavior.

No token or cost estimate may be inferred from bytes when the future adapter
does not report it.

## Closeout notes retained

- **Extreme scale:** the implementer measurements above retain their stated
  environment and origin. Independent reviewer measurements are separate
  evidence and do not establish universal performance. Re-evaluate if future
  representative real-agent fixtures show material latency or timeout.
- **Disclosure distribution:** the first pass attempts one fragment per source
  when it fits, then may favor earlier sources. It is deterministic disclosure,
  not quantitative balancing, semantic selection or ranking.
- **Incidental behavior:** operational-ID consumption before a busy result and
  the existing `AbortError` classification remain non-blocking notes.
- **Future adapter requirement:** receipt/transport must be bounded before a
  `Promise<string>` is materialized. The current Application bound begins after
  receipt and is not an optional substitute for that adapter guarantee.
