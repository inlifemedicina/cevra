import assert from 'node:assert/strict';
import test from 'node:test';
import * as plan from '../v2-offline-experiment-plan.mjs';

const simulate = operations => plan.simulateOfflinePlan({ experimentId: plan.OFFLINE_POLICY.proposedExperimentId, operations });

test('NB-2 exports only inert immutable policy, factual inventory and pure simulation', () => {
  assert.deepEqual(Object.keys(plan).sort(), ['FUTURE_DECISION_PACKAGE', 'OFFLINE_OPERATIONS', 'OFFLINE_POLICY', 'OFFLINE_PREFLIGHT_INVENTORY', 'OFFLINE_SCENARIOS', 'TOKEN_DECISION_OPTIONS', 'simulateOfflinePlan'].sort());
  assert.equal(plan.OFFLINE_POLICY.state, 'PROPOSED / INERT / NOT CREATED');
  assert.equal(plan.OFFLINE_POLICY.liveAuthorized, false);
  assert.equal(plan.OFFLINE_POLICY.maxReservations, 4);
  assert.deepEqual(plan.OFFLINE_POLICY.bytes, { initial: 65536, cumulative: 262144, response: 65536 });
  assert.equal(plan.OFFLINE_POLICY.totalDeadlineMs, 30000);
  assert.equal(plan.OFFLINE_POLICY.maxSemanticInvocations, 2);
  assert.throws(() => plan.OFFLINE_POLICY.tokens.input = 1, TypeError);
  assert.throws(() => plan.FUTURE_DECISION_PACKAGE.missingAuthorizations.push('permission'), TypeError);
  assert.equal(plan.FUTURE_DECISION_PACKAGE.realLedger, 'INERT / NOT CREATED');
});

test('NB-2 scenarios A-G account for operations, not analyses or HTTP requests', () => {
  const expected = { A: 0, B: 1, C: 4, D: 2, E: 4, F: 5, G: 1 };
  for (const [name, operations] of Object.entries(plan.OFFLINE_SCENARIOS)) {
    const before = structuredClone(operations);
    const result = simulate(operations);
    assert.equal(result.requiredReservations, expected[name]);
    assert.equal(result.liveAuthorized, false);
    assert.equal(result.simulationOnly, true);
    assert.deepEqual(operations, before);
    assert.deepEqual(result, simulate(operations));
    assert(Object.isFrozen(result)); assert(Object.isFrozen(result.allocations));
    if (name === 'F') { assert.equal(result.reason, 'PROPOSED_BUDGET_EXCEEDED'); assert.equal(result.allocatedReservations, 0); }
    else { assert.equal(result.allocatedReservations, expected[name]); assert.equal(result.conditional, ['B', 'D', 'E'].includes(name)); }
  }
  assert.equal(simulate(plan.OFFLINE_SCENARIOS.G).consumedReservations, 1);
  assert.equal(plan.OFFLINE_OPERATIONS['consolidated-preflight'].state, 'CONDITIONAL / NOT DEMONSTRATED');
});

test('NB-2 failures, cancellation and crash uncertainty consume; no refund/retry/fallback or redistribution', () => {
  for (const outcome of ['success', 'failure', 'cancelled', 'crash-uncertain']) {
    const result = simulate([{ operation: 'semantic-f-a-direct', outcome }]);
    assert.equal(result.consumedReservations, 1); assert.equal(result.allocatedReservations, 1);
    assert.equal(result.unusedRedistribution, 'FORBIDDEN');
    assert.equal(result.retries, 0); assert.equal(result.fallbacks, 0);
  }
  for (const outcome of ['refunded', 'retry', 'fallback']) assert.equal(simulate([{ operation: 'semantic-f-a-direct', outcome }]).reason, 'INVALID_OUTCOME');
  assert.equal(simulate([{ operation: 'semantic-f-a-direct' }, { operation: 'semantic-f-a-direct' }]).reason, 'REPEAT_OPERATION_NOT_ALLOWED');
});

test('NB-2 F-B requires both allocations upfront, in invocation order', () => {
  for (const operations of [[{ operation: 'semantic-f-b-invocation-1' }], [{ operation: 'semantic-f-b-invocation-2' }], [{ operation: 'semantic-f-b-invocation-2' }, { operation: 'semantic-f-b-invocation-1' }]]) {
    assert.equal(simulate(operations).reason, 'F_B_TWO_ALLOCATIONS_REQUIRED_UPFRONT');
  }
  const result = simulate([{ operation: 'semantic-f-b-invocation-1', outcome: 'failure' }, { operation: 'semantic-f-b-invocation-2' }]);
  assert.equal(result.allocatedReservations, 2); assert.equal(result.consumedReservations, 1);
  assert.equal(result.unusedRedistribution, 'FORBIDDEN');
});

test('NB-2 old experiment, unknown contacts, extra budget and historical store are rejected', () => {
  assert.equal(plan.simulateOfflinePlan({ experimentId: 'semantic-claude-roundtrip-poc-v1', operations: [] }).reason, 'HISTORICAL_EXPERIMENT_CLOSED');
  assert.equal(plan.simulateOfflinePlan({ experimentId: 'attempt-9', operations: [] }).reason, 'EXPERIMENT_ID_NOT_PROPOSED');
  assert.equal(simulate([{ operation: 'undeclared-contact' }]).reason, 'OPERATION_NOT_ENUMERATED');
  assert.equal(simulate([{ operation: ['local-offline-check'] }]).reason, 'OPERATION_NOT_ENUMERATED');
  for (const key of ['historicalStore', 'refund', 'retries', 'fallback', 'maxReservations']) {
    const input = { experimentId: plan.OFFLINE_POLICY.proposedExperimentId, operations: [], [key]: 100 };
    assert.equal(plan.simulateOfflinePlan(input).reason, 'INVALID_PLAN');
  }
  assert.equal(simulate([...plan.OFFLINE_SCENARIOS.C, { operation: 'cancellation-observation' }]).reason, 'PROPOSED_BUDGET_EXCEEDED');
});

test('NB-2 token controls and R$0 remain explicit unresolved live gates, not estimates or permission', () => {
  assert.equal(plan.OFFLINE_POLICY.tokens.input, 32000); assert.equal(plan.OFFLINE_POLICY.tokens.output, 4000);
  assert.equal(plan.OFFLINE_POLICY.tokens.hardRemoteEnforcement, 'NOT DEMONSTRATED');
  assert.equal(plan.OFFLINE_POLICY.tokens.usage, 'OBSERVATIONAL ONLY');
  assert.equal(plan.OFFLINE_POLICY.tokens.overhead, 'UNKNOWN');
  assert.equal(plan.TOKEN_DECISION_OPTIONS.strict.state, 'BLOCK LIVE UNTIL PROOF');
  assert.match(plan.TOKEN_DECISION_OPTIONS.explicitAlternative.state, /APPROVED FOR FIRST F-A PREPARATION ONLY/);
  assert.match(plan.TOKEN_DECISION_OPTIONS.selection, /LIVE CONSUMPTION NOT AUTHORIZED/);
  assert.match(plan.TOKEN_DECISION_OPTIONS.explicitAlternative.guarantee, /NO hard token guarantee/);
  assert.equal(plan.OFFLINE_POLICY.incrementalCost, 'R$0 REQUIRED / NOT VERIFIED');
  // A supplied assertion cannot turn this inert package into a preflight pass.
  assert.equal(plan.simulateOfflinePlan({ experimentId: plan.OFFLINE_POLICY.proposedExperimentId,
    operations: [], incrementalCostVerified: true }).reason, 'INVALID_PLAN');
  assert.equal(simulate(plan.OFFLINE_SCENARIOS.C).liveAuthorized, false);
  assert(plan.FUTURE_DECISION_PACKAGE.liveBlockers.some(b => /R\$0/.test(b)));
  assert.match(plan.FUTURE_DECISION_PACKAGE.envLiteralObservation, /neither enforcement nor impossibility/);
  assert(plan.OFFLINE_PREFLIGHT_INVENTORY.some(item => item.operation === 'consolidated-preflight' && /NOT DEMONSTRATED/.test(item.existing)));
  assert.equal(plan.FUTURE_DECISION_PACKAGE.model.effectiveModel, 'NOT VERIFIED');
  assert.equal(plan.FUTURE_DECISION_PACKAGE.knownAdapterOverhead.bytesPerInvocation, 2141);
  assert.equal(plan.FUTURE_DECISION_PACKAGE.knownAdapterOverhead.additionalCliProviderOverhead, 'UNKNOWN');
  assert.equal(plan.FUTURE_DECISION_PACKAGE.knownAdapterOverhead.tokens, 'UNKNOWN');
});
