# Semantic Editorial Analysis Boundary V1 — Evidence

**Status:** IMPLEMENTED ON FEATURE BRANCH / FOCUSED REVIEW PENDING  
**Date:** 2026-09-28  
**Canonical base:** `394d959c43c1591b74aa5c1755ec2757a4dee045`  
**Branch:** `feat/semantic-editorial-analysis-boundary-v1`  
**Code checkpoint:** `30dc2e502a7d64849a5bd12d82e563f5d13b4c8f`

## Delivered boundary

- closed, versioned `SemanticEditorialAnalyzerPort` under
  `@cevra/application`;
- compact `AnalysisContextV1` built from the closed Editorial Transcript
  Projection V1 rather than regrouped transcript data;
- execution-local `S…`/`E…` aliases with an internal canonical manifest;
- actual compact UTF-8 JSON byte measurement, 64 KiB initial context, 256 KiB
  accumulated context and at most two analyzer invocations;
- closed `analysis-candidate | needs-evidence` response validation;
- canonical citation resolution, distinct relation sides and exact optional
  quote verification;
- one scoped text continuation; explicit visual/acoustic unsupported result;
- project revision/snapshot/journal/transcript stale guards;
- cancellation, total timeout and late-response rejection;
- immutable in-memory result and zero canonical mutation.

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

Initial directed result: **16/16 PASS**. The complete Application and repository
regressions plus remote CI are recorded in the final implementation handoff;
this document intentionally does not use a self-referential commit SHA.

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
