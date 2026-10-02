// NB-2: pure accounting simulation, not a ledger, permission or provider adapter.
// No clock, I/O, historical store, credentials or contact-capable implementation.
function freeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}

export const OFFLINE_POLICY = freeze({
  proposedExperimentId: 'semantic-real-agent-roundtrip-v2-poc-01',
  state: 'PROPOSED / INERT / NOT CREATED', liveAuthorized: false,
  historicalExperiment: 'semantic-claude-roundtrip-poc-v1',
  historicalState: 'CLOSED / 8 of 8 / ZERO BALANCE / NEVER REOPEN',
  maxReservations: 4, reservationBudgetState: 'PROPOSED',
  bytes: { initial: 65536, cumulative: 262144, response: 65536 },
  maxSemanticInvocations: 2, totalDeadlineMs: 30000, retries: 0, fallbacks: 0,
  tokens: { input: 32000, output: 4000, state: 'PROPOSED', hardRemoteEnforcement: 'NOT DEMONSTRATED', usage: 'OBSERVATIONAL ONLY', overhead: 'UNKNOWN' },
  incrementalCost: 'R$0 REQUIRED / NOT VERIFIED'
});

// Cost is one explicitly enumerated CEVRA operation capable of provider contact,
// not an HTTP count, concurrent process count, session or complete analysis.
export const OFFLINE_OPERATIONS = freeze({
  'local-offline-check': { reservations: 0, state: 'OFFLINE' },
  'auth-status-preflight': { reservations: 1, state: 'FUTURE OPERATION / NOT AUTHORIZED' },
  'capability-model-preflight': { reservations: 1, state: 'CONCEPTUAL / MECHANISM UNPROVEN' },
  'entitlement-billing-preflight': { reservations: 1, state: 'CONCEPTUAL / MECHANISM UNPROVEN' },
  'semantic-f-a-direct': { reservations: 1, state: 'FUTURE OPERATION / NOT AUTHORIZED' },
  'semantic-f-b-invocation-1': { reservations: 1, state: 'FUTURE OPERATION / NOT AUTHORIZED' },
  'semantic-f-b-invocation-2': { reservations: 1, state: 'FUTURE OPERATION / NOT AUTHORIZED' },
  'cancellation-observation': { reservations: 1, state: 'FUTURE OPERATION / NOT AUTHORIZED' },
  'consolidated-preflight': { reservations: 1, state: 'CONDITIONAL / NOT DEMONSTRATED' }
});

const outcomes = ['unused', 'success', 'failure', 'cancelled', 'crash-uncertain'];
const blocked = (reason, requiredReservations = 0) => freeze({
  simulationOnly: true, liveAuthorized: false, state: 'BLOCKED BEFORE CONTACT',
  reason, requiredReservations, allocatedReservations: 0, consumedReservations: 0,
  allocations: [], unusedRedistribution: 'FORBIDDEN', retries: 0, fallbacks: 0
});

export function simulateOfflinePlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) ||
      Object.keys(plan).some(key => !['experimentId', 'operations'].includes(key))) return blocked('INVALID_PLAN');
  if (plan.experimentId === OFFLINE_POLICY.historicalExperiment) return blocked('HISTORICAL_EXPERIMENT_CLOSED');
  if (plan.experimentId !== OFFLINE_POLICY.proposedExperimentId) return blocked('EXPERIMENT_ID_NOT_PROPOSED');
  if (!Array.isArray(plan.operations) || plan.operations.length > 16) return blocked('INVALID_OPERATIONS');
  const allocations = [];
  const seen = new Set();
  for (const entry of plan.operations) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        Object.keys(entry).some(key => !['operation', 'outcome'].includes(key)) ||
        typeof entry.operation !== 'string' || !Object.hasOwn(OFFLINE_OPERATIONS, entry.operation)) return blocked('OPERATION_NOT_ENUMERATED');
    if (seen.has(entry.operation)) return blocked('REPEAT_OPERATION_NOT_ALLOWED');
    if (entry.outcome !== undefined && !outcomes.includes(entry.outcome)) return blocked('INVALID_OUTCOME');
    seen.add(entry.operation);
    allocations.push({ operation: entry.operation, reservations: OFFLINE_OPERATIONS[entry.operation].reservations,
      outcome: entry.outcome ?? 'unused', conditional: entry.operation === 'consolidated-preflight' });
  }
  const first = allocations.findIndex(a => a.operation === 'semantic-f-b-invocation-1');
  const second = allocations.findIndex(a => a.operation === 'semantic-f-b-invocation-2');
  if ((first >= 0 || second >= 0) && !(first >= 0 && second > first)) return blocked('F_B_TWO_ALLOCATIONS_REQUIRED_UPFRONT');
  const required = allocations.reduce((sum, a) => sum + a.reservations, 0);
  if (required > OFFLINE_POLICY.maxReservations) return blocked('PROPOSED_BUDGET_EXCEEDED', required);
  // The whole plan is allocated before simulated outcomes. Failure/cancel/crash
  // never refunds an allocation; no prefix of an over-budget plan is allocated.
  return freeze({ simulationOnly: true, liveAuthorized: false, state: OFFLINE_POLICY.state,
    requiredReservations: required, allocatedReservations: required,
    consumedReservations: allocations.reduce((sum, a) => sum + (a.outcome === 'unused' ? 0 : a.reservations), 0),
    allocations, conditional: allocations.some(a => a.conditional),
    remainingUnallocated: OFFLINE_POLICY.maxReservations - required,
    unusedRedistribution: 'FORBIDDEN', retries: 0, fallbacks: 0 });
}

const entries = names => names.map(operation => ({ operation }));
const separate = ['auth-status-preflight', 'capability-model-preflight', 'entitlement-billing-preflight'];
const fb = ['semantic-f-b-invocation-1', 'semantic-f-b-invocation-2'];
export const OFFLINE_SCENARIOS = freeze({
  A: entries(['local-offline-check']),
  B: entries(['consolidated-preflight']),
  C: entries([...separate, 'semantic-f-a-direct']),
  D: entries(['consolidated-preflight', 'semantic-f-a-direct']),
  E: entries(['consolidated-preflight', 'semantic-f-a-direct', ...fb]),
  F: entries([...separate, ...fb]),
  G: [{ operation: 'semantic-f-a-direct', outcome: 'failure' }]
});

export const TOKEN_DECISION_OPTIONS = freeze({
  selection: 'NOT MADE / MATERIAL PRODUCT OWNER DECISION REQUIRED',
  nonProof: 'Prompt instruction, environment literal, observed usage and post-validation do not prove hard remote enforcement; no byte-to-token/currency conversion',
  strict: { state: 'BLOCK LIVE UNTIL PROOF', requirement: 'Hard remote input 32000 / output 4000 enforcement demonstrated before contact' },
  explicitAlternative: { state: 'NOT ADOPTED / FUTURE EXPLICIT APPROVAL REQUIRED',
    guarantee: 'Hard local bytes, total deadline, max two semantic invocations, no retry/fallback; NO hard token guarantee',
    usage: 'Post-receipt observation; record excess without corrective extra invocation' }
});

export const OFFLINE_PREFLIGHT_INVENTORY = freeze([
  { operation: 'local-offline-check', source: 'transport.mjs: verifyBinary', existing: 'Concrete file/hash verification only; not invoked by this package', proves: 'File pin only, not runtime/auth/model/entitlement/billing' },
  { operation: 'auth-status-preflight', existing: 'Official auth status was used historically; current harness.mjs status only inspects the CLOSED historical experiment', proves: 'No current auth status or subscription permission verified; future explicit contact authorization required' },
  { operation: 'capability-model-preflight', source: 'transport.mjs: childArguments / ClaudeStreamReader', existing: 'opus/medium arguments and post-contact model checks exist; separate pre-contact capability operation NOT DEMONSTRATED', proves: 'Requested configuration is not effective runtime/model/effort proof' },
  { operation: 'entitlement-billing-preflight', source: 'transport.mjs: rate_limit_event handling', existing: 'Overage rejection after contact exists; pre-contact R$0/entitlement mechanism NOT DEMONSTRATED', proves: 'Subscription is NOT authorization; R$0 must be clearly verified before inference; paid API fallback forbidden' },
  { operation: 'consolidated-preflight', existing: 'CONCEPTUAL / CONDITIONAL / NOT DEMONSTRATED', proves: 'No consolidated endpoint invented; must prove it is one enumerated operation before adopting its simulated cost' },
  { operation: 'semantic-f-a-direct', source: 'transport.mjs: runClaudeProcess / Application closed boundary', existing: 'Historical bounded transport and fake-only Application tests; historical harness CLOSED', proves: 'Real semantic round-trip NOT DEMONSTRATED; no current permission to spawn' }
]);

export const FUTURE_DECISION_PACKAGE = freeze({
  label: 'DECISION PACKAGE READY FOR PRODUCT OWNER — NOT YET AUTHORIZED',
  candidate: 'Official Claude CLI candidate only; not a provider selection',
  suppliedOfflineFileObservation: { source: 'SUPPLIED READ-ONLY OBSERVATION / NOT REINSPECTED',
    relativePath: 'claude-code/2.1.280/claude', size: 217254576, mode: '0700',
    sha256: '387a5c5dcdbb815085edf0baf79591f9d8894efe922bceaf3d75b1b08055229d',
    proves: 'PINNED FILE PRESENT / HASH MATCH ONLY', runtimeVersion: 'NOT VERIFIED' },
  model: { requestedAlias: 'opus', requestedEffort: 'medium', effectiveModel: 'NOT VERIFIED', effectiveEffort: 'NOT VERIFIED' },
  knownAdapterOverhead: { source: 'OFFLINE MEASUREMENT OF EXISTING PLAYBOOK CONSTANT ONLY',
    version: 'cevra.semantic-text-playbook.v1', bytesPerInvocation: 2141,
    sha256: 'd49255ef07c727200e8c55fbfe98bcca09279a723f20171694a7513136b50821',
    additionalCliProviderOverhead: 'UNKNOWN', tokens: 'UNKNOWN',
    scope: 'Application payload alone is NOT all transmitted text; no total HTTP/protocol byte claim' },
  envLiteralObservation: 'CLAUDE_CODE_MAX_OUTPUT_TOKENS literal present; input homonym not observed; neither enforcement nor impossibility proved',
  conservativeAllocation: 'R1 auth status + R2 capability/model + R3 entitlement/billing + R4 F-A = 4/4, if independently demonstrated operations',
  conditionalAllocation: 'Consolidated preflight 1 + F-A 1 = 2/4 ONLY IF one-operation mechanism demonstrated; unused slots not automatically redistributed',
  firstLiveCase: 'PROPOSED F-A PT-BR / one invocation / synthetic text only / no media / no retry',
  fB: 'FAKE-ONLY here; future live F-B needs a new explicit allocation of two reservations upfront',
  tokenDecision: TOKEN_DECISION_OPTIONS,
  liveBlockers: ['Unknown or non-enumerable contact operation', 'Unverified subscription entitlement and R$0', 'Strict token enforcement unproven or alternative not explicitly approved'],
  missingAuthorizations: ['Concrete preflight/provider contacts and subscription consumption', 'Create and activate NEW experiment ID', 'Implement operational NB-2 ledger and real reservations', 'F-A inference'],
  architecture: 'SemanticEditorialAnalyzerPort → adapter → untrusted candidate → closed validation → accepted derived result',
  mutation: 'NONE: Project IR/History, editing commands, cache/archive, Director authority unchanged',
  realLedger: 'INERT / NOT CREATED', realReservations: 'INERT / NOT CREATED', progress: '55%'
});
