# Semantic Real-Agent Round-trip V2 — Phase A

**2026-10-01 — OFFLINE PREPARATION / IN DEVELOPMENT — DOCUMENTARY PROPOSAL.**
Only Phase A preparation is authorized. Live Phase B is **NOT AUTHORIZED / NOT
RUN**. No provider is selected, no operative experiment is created, and this
document changes no product contract or runtime. Progress remains **55%**.

## 1. Baseline, authority and separation from V1

Exact preparation base: `aea53160b8f5af5124e461b0bcb44d60987454f3`.
PR #61 is CLOSED / MERGED; post-merge push CI
[36854827180](https://github.com/inlifemedicina/cevra/actions/runs/36854827180)
is COMPLETED / SUCCESS, 5/5 on that SHA. Its parents are
`9fa9101ffe1c43431b2701a0c8243b586f1f283e` and
`38cdebf4d1603bb030a053dc4a5e899f3dff0a4e`.
Exact Runtime was NOT TRIGGERED by the documentary path filter, not PASS.
PR #60's Media Worker stdin/lifecycle correction remains IMPLEMENTED / CLOSED.

Authorities, not new sources of acceptance:

- [Master Context](CEVRA_MASTER_CONTEXT.md), especially §§20.1, 24 and 28;
- [ADR 0030](adr/0030-semantic-editorial-analysis-boundary-v1.md) and
  [Slice A evidence](CEVRA_SEMANTIC_EDITORIAL_ANALYSIS_BOUNDARY_V1_EVIDENCE.md);
- [Integration decisions](CEVRA_INTEGRATION_DECISIONS.md), I1/I2/I3/I5 and
  INT-CLOUD-01/02; [issue #55](https://github.com/inlifemedicina/cevra/issues/55)
  is dated research, not current entitlement or commercial approval;
- [closed Claude evidence](CEVRA_SEMANTIC_CLAUDE_ROUNDTRIP_POC_V1_EVIDENCE.md)
  and [existing offline reproduction guide](../packages/agents/claude-poc/README.md);
- [Product Owner acceptance catalog](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md):
  I1-T1–I1-T6, I2-T1/I2-T2/I2-T4, I3-T1/I3-T3/I3-T4 and X-T8 where applicable.
  This analysis-only gate does not complete I1-T1's later plan/Change Set or
  I1-T6's two-adapter convergence. I3-T3 is checked as a billing boundary, not
  authorization to use BYOK. No acceptance ID is marked delivered here.

Future experiment ID: `semantic-real-agent-roundtrip-v2-poc-01` — **PROPOSED /
INERT / NOT CREATED / NOT AUTHORIZED FOR EXECUTION**. No directory, active
ledger, quota, reservation or receipt is created in Phase A.

`semantic-claude-roundtrip-poc-v1` stays **CLOSED / 8 of 8 / ZERO BALANCE**,
independent of local files. No attempt #9, migration, refund, reopening or reuse
of its ledger is allowed. Five original receipts remain unavailable; historical
records are not newly audited or reconstructed. The closed bounded offline PoC
does not establish a successful real semantic round-trip.

## 2. Unchanged boundary and concrete limits

```text
ProjectHistory fixture → CLOSED transcript projection → Application
→ SemanticEditorialAnalyzerPort → provider-specific adapter
→ untrusted textual candidate → closed Application validation
→ immutable in-memory analysis (no editing operation)
```

The port receives only the serialized bounded JSON envelope and execution
lifecycle. Profile: `cevra.semantic-editorial-analysis.v1`. Provider state,
session/auth/billing information stays in the adapter, not Project IR.
No history access, source paths, media, filesystem, Media Runtime, credentials
in the envelope, command callbacks, shell or FFmpeg authority is supplied.
Each invocation is independent; continuation uses only Application's cumulative
context, never a programmer conversation or hidden provider history.

Read-only checks of the current
[contract](../packages/application/src/semantic-editorial-analysis-contract.ts)
and [service](../packages/application/src/semantic-editorial-analysis.ts) confirm:

| Limit | Existing baseline / proposed use |
|---|---|
| Analyzer invocations per semantic execution | At most 2: initial + one authorized textual continuation; no third |
| Initial JSON envelope | 64 KiB / 65,536 UTF-8 bytes by default |
| Sum of transmitted JSON envelopes | 256 KiB / 262,144 bytes, including resends, task, coverage and metadata |
| Semantic response per invocation | 64 KiB / 65,536 bytes by default |
| Deadline | One monotonic 30,000 ms default from `analyze()` entry through final acceptance; no restart |
| Automatic CEVRA retries / provider or silent model fallback | 0; an observed runtime retry terminates the proof, not an invented count of HTTP requests |
| Aggregate semantic responses | 128 KiB is the arithmetic upper bound of two default responses; derived planning bound, not a new contract |

Keep stale/revision/snapshot/journal/digest, cancellation, late/duplicate guards,
verified quotes and Application-computed coverage. Coverage supplied is not
proof of correct interpretation. Prepared but unsent evidence is not supplied.
Abort has precedence when cancellation and timeout are both observable, as in
the existing service. Synchronous work cannot be preempted instantly; expired
work must not authorize another invocation or accepted result.

Application's bound before JSON parsing starts after `Promise<string>` is
allocated. A future adapter must also bound JSONL lines, stdout/stderr, event
count and final text incrementally, drain streams concurrently, and require
terminal result plus coherent EOF/close before acceptance. Adapter/playbook
overhead is measured separately, not silently charged to or excluded from an
alleged total network budget. Bytes are not tokens or money.

## 3. Candidates — historical evidence only, no winner

No new provider, price, capability or eligibility research was performed in
Phase A. All current auth, model, entitlement and access remain NOT VERIFIED.
The programming configuration requested for this task is not proof that a
future analyzer supports that model or effort; this document claims no prompt-
induced configuration change or observed analyzer generation.

| CANDIDATE | EXISTING CEVRA EVIDENCE | KNOWN BLOCKER/LIMIT | CURRENT STATUS | OWNER DECISION REQUIRED |
|---|---|---|---|---|
| Official Claude Code CLI textual transport | Bounded offline reader reviewed/merged; historical CLI 2.1.280; session-only restrictive plugin override made init pass | No accepted real semantic result; current executable/auth/model/entitlement/capabilities not reverified; version-specific compatibility and N-4 remain unproved | CANDIDATE / NOT SELECTED; old V1 CLOSED | Approve exact mechanism, model, effort, containment, subscription consumption and new live scope after preflight |
| Official Codex/OpenAI route: App Server, or Responses/official transport only where eligible | Preserved Codex diagnosis `788e9c0dd5b3f66a4b531ce70853a82ff5f0cfd1`: BLOCKED — CONTAINMENT, zero threads/turns; issue #55 dated official-route planning | Containment was not established in that investigation; current eligibility, entitlement, mechanism and billing NOT VERIFIED; consumer subscription does not establish commercial permission | CANDIDATE / BLOCKED OR UNPROVEN, not a universal impossibility | Approve eligibility research and exact official mechanism before any endpoint contact or inference; no silent paid API fallback |

Model status: **UNSELECTED / NOT VERIFIED**. No provider ID, context window or
effort is frozen. No candidate is commercially approved. Login/identity,
subscriber entitlement, commercial eligibility, inference, agent execution,
upload/storage, transcription, render and mobile/cloud runner are distinct.
I15 / INT-CLOUD-04 paired Desktop companion and all approved mobile direction
remain unchanged. Computer-off execution is a later decision, not this proof.

Historical Claude notes remain DEFERRED in their original record:

- N-2: unexpected attempt-9 files in old inspection. Do not change V1; any
  future new-ledger implementation must detect out-of-budget/orphan records
  before contact, without claiming that N-2 was fixed here.
- N-3: inappropriate `conversation_reset` grouping, still rejected. It may
  remain deferred if the future profile still rejects it; event-map change
  requires focused offline tests/review before live use.
- N-4: inherited stdout can delay close; real `num_turns`, `modelUsage` and
  auxiliary model compatibility are unproved. Before live contact, demonstrate
  bounded owned-process settlement and fail-closed identity/turn checks offline.
  The future run may characterize compatibility, but cannot waive those gates,
  accept an auxiliary model silently or accept before close.

Media follow-ups NB-A/NB-2/NB-4/NB-5 also stay DEFERRED / NON-BLOCKING.
Windows native remains NOT RUN for the stdin correction. No new Director
authority, architecture pattern, dependency, UI enablement or Take work.

## 4. Future authorization envelope — proposed, not activated

Every figure below is **PROPOSED / SUBJECT TO PRODUCT OWNER APPROVAL**:

- Maximum **4 live reservations**, across all purposes, not four analyses each
  with two free calls. The reservation unit is the explicitly enumerated CEVRA
  operation defined below, not each technical event inside that operation.
- Reserve irreversibly before any operation capable of starting a provider
  process, remote session/request, remote auth/capability/model endpoint or
  subscription/billing contact. Pure local offline reading/testing consumes none.
- Auth failure, unavailable model, containment error, timeout/cancel, malformed
  output, provider error, interruption or missing response never refund a slot.
  Reservation uncertainty after crash stays consumed. No automatic retry.
- Token candidate ceiling: **32k input aggregate / 4k output aggregate per
  reservation**, including provider-known playbook/overhead where measurable.
  There is no provider-neutral tokenizer; byte limits do not certify this cap.
  Ability to enforce/measure tokens, usage and model/fallback is NOT VERIFIED.
  If the approved limits cannot be enforced or meaningfully accounted for,
  STOP BEFORE INFERENCE and return the gap to the owner.
- Proposed incremental cost **R$0**, not zero subscription consumption.
  Included allowance and billing safeguards are NOT VERIFIED. Paid API,
  extra usage, unknown billing or fallback is not authorized. If cost is
  required, stop before inference and present mechanism, confirmed cost,
  reason and a simpler authorized alternative to the owner.

### Reservation unit — PROPOSED

One live reservation authorizes **one explicitly enumerated CEVRA operation
capable of provider contact**, subject to later owner approval. Each
`SemanticEditorialAnalyzerPort` invocation capable of contact needs its own
reservation. A second invocation/continuation needs another reservation,
already reserved before starting the two-invocation sequence.

Separately CEVRA-initiated remote preflight operations — auth/status,
capability/model or entitlement/billing — each require their own reservation.
Process start, session establishment and internal transport steps that are
inseparable parts of the SAME enumerated operation do not multiply reservations
merely because they are technical events. Any later independent CEVRA operation,
new invocation, preflight, session-contact, retry or fallback receives no free
coverage from an earlier reservation. Reusing a process/session does not
authorize an extra operation. Retry/fallback remain forbidden unless explicitly
authorized later; no implicit reservations or additional contact are permitted.

This unit is not an estimate of raw provider/client-internal HTTP calls. Record
observed internal fan-out/retries without inventing counts. If that behavior
prevents the approved accounting or enforcement, STOP BEFORE CONTACT/INFERENCE
at the point determinable and return the gap to the owner. Reservation remains
irreversible before the operation; failures, interruption and crash uncertainty
do not refund it, and no automatic retry is introduced.

### Candidate live matrix and accounting feasibility

| Purpose | Candidate evidence | Slots potentially required / gate |
|---|---|---|
| R1 preflight | Exact official access, model/capability/billing and containment | 1 ONLY if approved remote checks form one enumerated operation under the selected transport; each separately CEVRA-initiated check needs its own reservation. 0 only if entirely local/offline |
| R2 PT-BR direct | F-A, initial context contains both short sources | 1 covers only the initial direct invocation; needs-evidence without a second reservation is PARTIAL / experiment-budget-limited, with no automatic continuation |
| R3 textual continuation | F-B, partial initial context then authorized text | 2 available and reserved before starting invocations 1/2; no third invocation. Extra CEVRA operations outside those invocations require prior allocation approval |
| R4 cancellation | Own in-flight execution, terminal settlement and no acceptance | 1 ONLY if execution/cancellation/observation fit within one approved CEVRA operation; separate provider-contact cancellation needs an additional reservation |

These rows are candidate priorities, NOT a promise that all fit in four slots.
If R1 requires separate auth/status, capability/model or entitlement/billing
operations, R1=1 is invalid: return the allocation to the owner BEFORE uncovered
contact, without extra contact. Only under the table's one-operation R1
assumption does live R1 + R2 + two-call R3 = 1 + 1 + 2 = 4, leaving R4 NOT RUN.
An entirely offline R1 could make R2 + R3 + R4 fit four only under R4's
one-operation assumption. Reallocation (including possible EN-US) requires
explicit owner decision, never automatic redistribution. No four-slot whole-gate
completion is promised. No two-call sequence starts with only one authorized
slot. A one-call case may use the last slot; needs-evidence then remains
PARTIAL / experiment-budget-limited, not provider failure, full semantic success
or simulated success. No fifth reservation is permitted by this proposal.

## 5. Offline fixture specifications and fixed rubric

All examples are newly authored synthetic, non-medical text. No patient,
personal information, real media, repository or programmer chat is future input.
These are specifications INSIDE this document, not executable fixtures or live
evidence. Source aliases/fragments must be produced by the CLOSED projection;
do not manufacture IDs, truncate text or send the grading key to the analyzer.

### F-A — PT-BR / direct analysis

Source A: “A oficina monta caixas sob encomenda. A entrega no dia seguinte só
vale quando o material está disponível. O prazo não é uma promessa sem essa
condição.”

Source B: “Com o material disponível, podemos entregar no dia seguinte.
Além disso, cada caixa recebe uma etiqueta para acompanhamento. Não sabemos
se haverá material para pedidos futuros.”

Requested task: identify themes, caveats and textual relations using only
supplied evidence, without editing, ranking, take selection or cuts. Expected
dimensions: common theme, complement (tracking), possible repetition, essential
availability caveat and explicit uncertainty. Projection aliases may be S1/S2;
E1/E2 below are a documentary example only if actually delivered. Illustrative
closed candidate, not a captured response, never a prompt answer key:

```json
{
  "version": 1,
  "kind": "analysis-candidate",
  "contextId": "fixture-context",
  "observations": [{
    "id": "availability",
    "kind": "caveat",
    "statement": "A entrega no dia seguinte depende da disponibilidade de material.",
    "uncertainty": "low",
    "justification": "A condição está explícita nas duas fontes.",
    "evidenceReferences": ["E1", "E2"]
  }],
  "relations": [],
  "uncertainties": [{
    "statement": "Disponibilidade futura não está comprovada.",
    "reason": "Não há confirmação para pedidos futuros.",
    "evidenceReferences": ["E2"]
  }],
  "limitations": ["Análise somente textual; nenhuma percepção audiovisual."]
}
```

Future fixture code must bind `contextId` and citations to the actual delivered
envelope; this static example alone cannot pass a real execution. A full rubric
also checks complement/repetition even though this small schema example omits
them; a valid but insufficient candidate is editorial PARTIAL/FAIL.

### F-B — scoped continuation

Same synthetic subject, additional source text not initially supplied; coverage
partial with remaining evidence. Invocation 1 returns the closed
`needs-evidence` form with current context ID and `request.type=text-context`,
authorized `sourceReference`, bounded `maxAdditionalBytes` and reason.
Application alone projects/provides additional text if authorized and within
deadline/budget. Invocation 2 returns a candidate citing only supplied fragments
in its cumulative context. Never a third call, hidden history, visual request
or fabricated intermediate response. A directed protocol test must not be
reported as spontaneous semantic discovery.

### F-C — rejection controls, FAKE ONLY

Candidate with nonexistent evidence reference; wrong context ID; extra command/
path/cut field; oversized response; commit→undo stale state. Each fails closed,
with no accepted analysis or mutation. No provider calls to generate bad JSON.

### F-D — lifecycle controls, FAKE ONLY

Controlled delayed response; observable abort before timeout/channel failure;
late response after cancellation; timeout without accepted result; duplicate
result. Preserve primary/terminal error, settlement/busy state and zero mutation.
No global process kill. Local stop cannot promise reversal of remote consumption.

### F-E — EN-US prepared offline / NOT LIVE VALIDATED

Source A: “The workshop builds boxes to order. Next-day delivery applies only
when materials are available. That condition is essential.”

Source B: “If materials are available, next-day delivery is possible. Each box
also receives a tracking label. Future material availability is unknown.”

Use the same schema, scope and rubric; do not declare EN-US parity from this
document or a PT-BR result.

Rubric fixed before any future response: fidelity/no invention; preservation
of the essential condition; complement versus possible repetition; no
unqualified contradiction; appropriate uncertainty; citations actually support
each statement; no false audio/visual perception; no unrequested editing.
Rate each applicable dimension PASS / PARTIAL / FAIL with response evidence;
NOT RUN is never PASS. JSON validity is not semantic truth or human homologation.

### Existing offline matrix to reuse — not newly executed here

| Family | Existing reference / future expectation |
|---|---|
| Valid direct PT-BR/EN-US | [Application semantic tests](../packages/application/test/semantic-editorial-analysis.test.mjs), scripted fixture cases; real History/projection, immutable result |
| Text continuation | Same suite: one bounded continuation and later-source collection; only new delivered evidence becomes citable |
| Malformed/scope | Same suite: closed enums/IDs, extra fields, wrong-context/unsupplied refs and fabricated quotes reject |
| Stale | Same suite: commit→undo, remove-add and transcript replacement reject |
| Cancel/timeout/late | Same suite: one entry deadline, exact boundary, ignoring adapter, busy until settlement |
| Byte budgets | Same suite: cumulative resends and UTF-8 escaping, initial distribution and blocked second message |
| Provider lifecycle | [Claude offline tests](../packages/agents/claude-poc/test/transport.test.mjs): closed init, model identity, stream bounds, error precedence and close-before-acceptance |

These are historical deterministic coverage references, not new PASS claims,
native loader certification or real inference. No duplicate test suite or new
harness is implemented in Phase A. Live R1–R4 remain NOT RUN.

## 6. Documentary ledger/receipt design — PROPOSED / NOT CREATED

Separate experiment identity, authorization and storage from V1. Proposed
states: proposed/inert → authorized → reserved → contact-started → terminal
receipt → closed; inconsistency → blocked. Only a later owner authorization
and implementation can make any state operative.

Proposed fields (no record or values initialized here): `experimentId`,
`status`, `maximumReservations`, `usedReservations`, `remainingReservations`,
`reservationNumber`, `reservationId`, `purpose`, `transportCandidate`,
`modelCandidate`, `reservedAt`, `providerContactStarted`,
`analyzerInvocationCount`, `requestBytes[]`, `responseBytes[]`,
`reportedInputTokens`, `reportedOutputTokens`, `reportedCost`, `terminalReason`,
`acceptedByApplication`, `mutationObserved`, `receiptIntegrity`.

Future continuity requirements: private persistent operator-owned root outside
repo/scratch; immutable authorization checkpoint; exclusive lock; fsynced
exclusive numbered reservation before contact; nondecreasing committed usage
watermark; receipt uniquely bound to reservation/purpose/model/transport.
Validate ranges, sequence, totals and integrity on reopen; missing reservation,
orphan/duplicate receipt, incompatible checkpoint, symlink/foreign ownership or
ambiguous lock fails closed. Reservation with no receipt after crash remains
consumed. Missing files never initialize quota to zero; total loss blocks use
and requires an explicit evidence-control decision, never automatic refund.
Terminal closure is sticky, and the old ID cannot be authorized as this ID.
Deletion detection and concurrent/crash tests are mandatory in a later offline
implementation; hashes/local files are not antifraud against their deliberate
rewriting by the machine owner. This is harness control, not product persistence
or billing truth. No actual ledger, reservation or DeveloperEvidence access here.

Receipts would record exact approved code/config/fixture identity, ordered
bounded protocol metadata, provider/model/session, one/two invocation counts,
request/response bytes and adapter overhead separately, reported usage/cost
with unknowns explicit, terminal/close evidence, Application decision and
before/after History/IR/digest/redo proof. No credentials, private identifiers,
raw events, thinking or duplicated transcript. Retain only authorized final
synthetic response and necessary metadata in private protected storage.

## 7. Future PASS, FAIL and BLOCKED gates

### Scenario result → permitted claim

| Scenario result | Permitted claim | Claims NOT established |
|---|---|---|
| R1 PASS | Observed preflight mechanism/configuration checks only | Semantic round-trip, quality, generic commercial eligibility or universal compatibility |
| R1 BLOCKED/FAIL | Observed blocker in that mechanism/configuration/environment | Universal impossibility for the provider, model or entitlement |
| R2 PASS | Direct PT-BR semantic round-trip for the specific scenario and controls actually exercised | Continuation, live cancellation/timeout, EN-US, commercial readiness, complete analysis delivery or whole-gate completion |
| R2 needs-evidence without second reservation | PARTIAL / experiment-budget-limited | Provider failure or full semantic success; no automatic continuation |
| R3 PASS | Bounded textual continuation for the specific scenario, at most two authorized invocations and supplied-evidence citations | Live cancellation/timeout, EN-US, commercial readiness or whole-gate completion |
| R4 PASS | Observed live cancel/abort settlement, cancelled/late response not accepted and receipt-covered behavior | Accepted semantic candidate or semantic quality; neither is required for this cancellation scenario |
| R4 NOT RUN | LIVE CANCELLATION NOT VALIDATED | Implicit cancellation PASS |

**SCENARIO PASS != WHOLE REAL-AGENT GATE COMPLETE.** A bounded successful real
exchange is scenario evidence only. Do not declare REAL-AGENT GATE COMPLETE,
Semantic Editorial Analysis V1 functional/DELIVERED or a dependent UX gate
satisfied while authority-required proof is missing. R2/R3 semantic success
does not close the whole gate. R4 NOT RUN means LIVE CANCELLATION NOT VALIDATED;
timeout remains NOT LIVE VALIDATED unless actually exercised. Other required
scenarios not exercised remain explicitly NOT RUN.

Integration decision I1 requires proof before dependent UX of authentication,
transport, structure, evidence-loop, latency/usage/cost, data disclosure,
malformed output, stale/duplicate behavior, cancellation, timeout and containment.
ADR 0030 additionally requires measured fidelity, caveat preservation, relations,
uncertainty, citations, data disclosure, latency, cost and failure behavior.
Aggregate gate completion requires all proof necessary for that claim, not the
sum of convenient scenario PASS labels. If four reservations are insufficient,
return to the owner for a separate allocation/authorization decision: no R5,
quota expansion or implicit extra execution is authorized here.

Future scenario PASS requires ALL applicable proof below, evaluated against
the scenario actually exercised, not just clean init or valid JSON. Semantic
candidate/result requirements apply to semantic success scenarios; cancellation
or failure/lifecycle scenarios do not fail merely because their expected outcome
is no accepted candidate. They must instead prove the prescribed terminal
behavior, settlement, non-acceptance and integrity:

1. Official mechanism explicitly approved for this experiment.
2. Exact transport version/configuration identified.
3. Authorized exact generated model and session correlated; no silent fallback.
4. Compatible auth/entitlement and eligible access demonstrated.
5. Containment configuration approved and verified for this run.
6. Zero unauthorized tools, MCP, plugins, skills, external context or subagents.
7. Exactly the authorized invocation(s), each reserved before contact.
8. Bounded request envelopes and adapter overhead recorded.
9. Successful terminal result, coherent EOF/close and process settlement.
10. Incrementally bounded response and closed structured output.
11. Application validation PASS under unchanged schema.
12. References/quotes drawn only from supplied canonical projection evidence.
13. Nonempty relevant semantic content, caveats and uncertainty meeting the rubric.
14. Single monotonic deadline and byte/slot limits respected.
15. Zero Project IR mutation; current revision/digests still match.
16. Zero ProjectHistory/journal/snapshot/redo mutation and zero typed command.
17. Complete integrity-consistent reservation/receipt with honest usage/cost.
18. No stale, duplicate, cancelled or late response accepted.

Unproved eligibility/transport/model/entitlement, incompatible auth/policy,
unauthorized capability/context, silent model or paid fallback, unknown/excess
cost, unbounded output or unverified accounting are BLOCKED before inference
where knowable. Malformed terminal/output, containment breach, timeout, stale,
mutation or attempted contact beyond the approved budget is terminal FAIL/BLOCKED
with exact cause. A valid needs-evidence result with no authorized continuation
remains PARTIAL / experiment-budget-limited as specified above, not full success.
Provider errors stay provider errors, not automatic escape accusations. Earlier
error cannot be erased by a later result. Stop/reap only owned processes; no
repair, retry, best-of, extra reservation, model substitution or new permission.
Poor semantics is recorded as editorial failure, not validator relaxation.

## 8. Product Owner decision checklist — none granted by this document

- [ ] A — Create/activate the NEW proposed ID, distinct from closed V1.
- [ ] B — Approve maximum four irreversible live reservations and feasible allocation.
- [ ] C — Approve the 30-second total semantic deadline; no per-call reset.
- [ ] D — Approve 32k/4k candidate token caps only after enforcement/accounting proof.
- [ ] E — Approve R$0 incremental policy; no unknown-cost/paid fallback.
- [ ] F — Select exact official transport after eligibility/capability preflight.
- [ ] G — Select exact model/effort only after availability and identity verification.
- [ ] H — Authorize auth/status/capability contact explicitly; it may contact provider.
- [ ] I — Authorize included subscription consumption explicitly; allowance not verified.
- [ ] J — Authorize live inference, precise fixture and receipt scope separately.
- [ ] K — Confirm NO MEDIA UPLOAD; synthetic text disclosure only in this proposal.
- [ ] L — Complete adversarial/documentary and any necessary offline implementation review before live proof.

No checklist item authorizes execution now. Installation, login/OAuth/tokens,
provider contact, payment/enrollment, upload or material scope change needs
separate approval. No operational command is provided by Phase A.

**Conditional future review recommendation, NOT AUTHORIZED:** Claude Code —
Claude Opus 5.5 — High, **if available and approved**. This is a human-readable
proposal for independent review, not a proven provider model ID/capability,
selected analyzer winner, authorized invocation or observed configuration.

Director impact: **no change of authority**. Slice A and projection remain
CLOSED; bounded offline Claude PoC remains CLOSED; real semantic round-trip
remains NOT DEMONSTRATED; live V2 remains PAUSED. ADR 0030 stays ACCEPTED
DIRECTION / IN DEVELOPMENT; complete Semantic Editorial Analysis is NOT
DELIVERED. INT-CLOUD-01–05 remain planning/conditional gates. Strategy, take
selection and cut planning remain NOT STARTED / NOT AUTHORIZED IMPLICITLY.
Progress is unchanged at **55%**.
