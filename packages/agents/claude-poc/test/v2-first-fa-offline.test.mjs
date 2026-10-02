import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, chmod, realpath, rm, unlink, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FIRST_FA_POLICY, describeFirstFaCandidate, runOfflineFirstFa } from '../v2-first-fa-offline.mjs';
import { initializeInertLedger, inspectInertLedger, reserveInertOperations, writeInertReceipt } from '../v2-inert-ledger.mjs';
import { childArguments, ClaudeStreamReader, LIMITS } from '../transport.mjs';
import { fixture } from './fixtures.mjs';

const id = 'synthetic-semantic-v2-ledger-first-fa';
const model = FIRST_FA_POLICY.expectedModel;
const authorization = () => ({
  authorization: 'OFFLINE_FAKE_ONLY', candidateId: FIRST_FA_POLICY.candidateId,
  provider: 'claude-cli', route: 'first-party-subscription', model,
  argvClosed: true, reauthRequired: false, extraUsage: false,
  capabilities: { tools: 0, mcp: 0, plugins: 0, skills: 0, hooks: 0, externalRoutes: 0 }
});
async function ledger(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cevra-first-fa-test-')));
  await chmod(root, 0o700);
  t.after(() => rm(root, { recursive: true, force: true })); // Exact owned test root only.
  await initializeInertLedger(root, { experimentId: id });
  return root;
}
const receipt = (r, outcome = 'success') => ({
  version: 1, experimentId: id, reservationNumber: r.number,
  operationId: r.operationId, purpose: r.purpose, reservationDigest: r.reservationDigest,
  outcome, providerContact: false, live: false
});
function fakeClock() {
  let time = 0, sequence = 0; const timers = new Map();
  return { now: () => time, setTimeout: (fn, delay) => {
    const key = ++sequence; timers.set(key, { fn, at: time + delay }); return key;
  }, clearTimeout: key => timers.delete(key), pending: () => timers.size,
  advance(ms) {
    const end = time + ms;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      time = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    time = end;
  } };
}
function wire(session, envelope) {
  const candidate = {
    version: 1, kind: 'analysis-candidate', contextId: envelope.context.contextId,
    observations: [{ id: 'o1', kind: 'idea', statement: 'Synthetic fixture only',
      uncertainty: 'material', justification: 'Offline test, not AI',
      evidenceReferences: [envelope.context.evidence[0].reference] }],
    relations: [], uncertainties: [], limitations: ['No semantic generation demonstrated']
  };
  return [
    { type: 'system', subtype: 'init', session_id: session, model,
      tools: [], mcp_servers: [], plugins: [], skills: [], permissionMode: 'default' },
    { type: 'assistant', session_id: session, message: { id: 'fixture-message', model,
      content: [{ type: 'text', text: 'Fixture, not inference' }], stop_reason: 'end_turn' } },
    { type: 'result', subtype: 'success', session_id: session, is_error: false, stop_reason: 'end_turn',
      num_turns: 1, permission_denials: [], result: JSON.stringify(candidate),
      modelUsage: { [model]: { inputTokens: 1, outputTokens: 2 } } }
  ];
}
function controlled(root, { mode = 'success', controller, clock, onContact = () => {} } = {}) {
  const calls = [], children = [];
  const spawn = (binary, args, options) => {
    calls.push({ args, options });
    const number = JSON.parse(readFileSync(join(root, 'ledger/ledger-state.json'), 'utf8')).watermark;
    const reservation = JSON.parse(readFileSync(join(root, 'ledger', `reservation-${String(number).padStart(4, '0')}.json`), 'utf8'));
    assert.equal(reservation.operation, 'semantic-f-a-direct');
    assert.equal(reservation.operationId, 'first-fa-direct');
    assert.equal(JSON.parse(readFileSync(join(root, 'ledger/ledger-state.json'), 'utf8')).watermark, reservation.number);
    assert.equal(binary, '/offline-fake-only');
    assert.equal(options.shell, false);
    assert.equal(args[args.indexOf('--tools') + 1], '');
    assert.equal(args[args.indexOf('--model') + 1], model);
    assert.equal(args[args.indexOf('--effort') + 1], 'medium');
    assert.equal(args[args.indexOf('--max-turns') + 1], '1');
    assert(!args.includes('--fallback-model'));
    const child = new EventEmitter(); children.push(child);
    for (const stream of ['stdin', 'stdout', 'stderr']) {
      child[stream] = new EventEmitter(); child[stream].destroy = () => {};
    }
    child.signals = [];
    child.kill = signal => {
      child.signals.push(signal);
      if (mode !== 'ambiguous') queueMicrotask(() => child.emit('close', null, signal));
      return true;
    };
    child.stdin.end = payload => queueMicrotask(() => {
      const envelope = JSON.parse(payload), events = wire(args[args.indexOf('--session-id') + 1], envelope);
      assert(Buffer.byteLength(payload) <= FIRST_FA_POLICY.applicationBytes.initialEnvelope);
      if (mode === 'init-model') events[0].model = 'claude-opus-other';
      if (mode === 'assistant-model') events[1].message.model = 'claude-opus-other';
      if (mode === 'usage-model') events[2].modelUsage = { 'claude-opus-other': { inputTokens: 1, outputTokens: 2 } };
      if (mode === 'usage-invalid') events[2].modelUsage[model].inputTokens = -1;
      if (mode === 'plugins') events[0].plugins = ['private-fixture'];
      if (mode === 'tool') events[1].message.content = [{ type: 'tool_use' }];
      if (mode === 'retry') events.splice(1, 0, { type: 'system', subtype: 'api_retry',
        session_id: events[0].session_id, attempt: 1, max_retries: 3, retry_delay_ms: 10, error: 'rate_limit', error_status: 429 });
      if (mode === 'extra-usage') events.splice(1, 0, { type: 'rate_limit_event',
        session_id: events[0].session_id, rate_limit_info: { status: 'allowed', isUsingOverage: true } });
      if (mode === 'citation') {
        const value = JSON.parse(events[2].result); value.observations[0].evidenceReferences = ['E999'];
        events[2].result = JSON.stringify(value);
      }
      if (mode === 'schema') events[2].result = '{}';
      if (mode === 'response') events[2].result = 'x'.repeat(LIMITS.response + 1);
      if (mode === 'line') { child.stdout.emit('data', Buffer.alloc(LIMITS.line + 1)); return; }
      if (mode === 'stdout') { child.stdout.emit('data', Buffer.alloc(LIMITS.stdout + 1)); return; }
      if (mode === 'stderr') { child.stderr.emit('data', Buffer.alloc(LIMITS.stderr + 1)); return; }
      if (mode === 'timeout' || mode === 'ambiguous') { clock.advance(32000); return; }
      if (mode === 'late') clock.advance(30000);
      if (mode === 'cancel') controller.abort();
      if (mode === 'stale') onContact();
      if (mode === 'needs') events[2].result = JSON.stringify({ version: 1, kind: 'needs-evidence',
        contextId: envelope.context.contextId, request: { type: 'text-context', sourceReference: 'S1',
          maxAdditionalBytes: 4096, reason: 'Synthetic extra context request' } });
      child.stdout.emit('data', Buffer.from(events.map(event => JSON.stringify(event)).join('\n') + '\n'));
      child.emit('close', 0, null);
    });
    return child;
  };
  return { spawn, calls, children };
}
function options(root, fake, extra = {}) {
  const { history, ids } = fixture();
  history.commit({ type: 'project.rename', name: 'redo preserved' }); history.undo();
  return { root, experimentId: id, fixtureAuthorization: authorization(), history,
    request: { sourceIds: ids }, fakeSpawn: fake.spawn, ...extra };
}

test('candidate recognition is dormant and cannot initialize any real ledger', async t => {
  const root = await ledger(t), before = await inspectInertLedger(root, id);
  assert.deepEqual(describeFirstFaCandidate(FIRST_FA_POLICY.candidateId), {
    candidateId: FIRST_FA_POLICY.candidateId, liveAuthorized: false, activation: 'ABSENT',
    persistence: 'NOT INITIALIZED', reservation: 'NOT CREATED', blocker: 'LIVE_AUTHORIZATION_PRIMITIVE_MISSING'
  });
  assert.throws(() => describeFirstFaCandidate('semantic-claude-roundtrip-poc-v1'), e => e.code === 'HISTORICAL_EXPERIMENT_CLOSED');
  await assert.rejects(initializeInertLedger(root, { experimentId: FIRST_FA_POLICY.candidateId }),
    e => e.code === 'REAL_EXPERIMENT_ID_FORBIDDEN_OFFLINE');
  assert.deepEqual(await inspectInertLedger(root, id), before);
});
test('first-F-A policy maps real counters, one invocation, total 30s, no remote guarantees', () => {
  assert.equal(FIRST_FA_POLICY.maxInvocations, 1); assert.equal(FIRST_FA_POLICY.totalDeadlineMs, 30000);
  assert.equal(FIRST_FA_POLICY.retries, 0); assert.equal(FIRST_FA_POLICY.fallbacks, 0);
  assert.deepEqual(FIRST_FA_POLICY.processBounds, LIMITS);
  assert.deepEqual(FIRST_FA_POLICY.applicationBytes, { initialEnvelope: 65536, cumulativeEnvelopes: 262144, response: 65536 });
  assert.match(FIRST_FA_POLICY.remoteTokens, /NOT DEMONSTRATED/);
  assert.equal(FIRST_FA_POLICY.httpContacts, 'UNKNOWN');
  assert.match(FIRST_FA_POLICY.incrementalCost, /NOT ABSOLUTELY VERIFIED/);
  assert(Object.isFrozen(FIRST_FA_POLICY.modelEvidence));
});
test('Application/projection → persisted reservation → fake transport → validation → correlated receipt', async t => {
  const root = await ledger(t), fake = controlled(root), opts = options(root, fake);
  const before = JSON.stringify(opts.history.toArchive());
  const result = await runOfflineFirstFa(opts);
  assert.equal(result.state, 'OFFLINE_FAKE_PASS'); assert.equal(result.invocations, 1);
  assert.equal(result.providerContact, false); assert.equal(result.liveAuthorized, false);
  assert(Object.isFrozen(result.result.candidate)); assert(result.result.evidence.length);
  assert.equal(JSON.stringify(opts.history.toArchive()), before); assert(opts.history.canRedo);
  const current = await inspectInertLedger(root, id);
  assert.equal(current.usedReservations, 1); assert.equal(current.receipts[0].outcome, 'success');
  assert.equal(current.receipts[0].reservationDigest, result.reservation.reservationDigest);
  assert.equal(result.transportMetrics.requestedModel, model); assert.equal(result.transportMetrics.childClosed, true);
  await assert.rejects(runOfflineFirstFa(opts), e => e.code === 'FIRST_FA_ALREADY_RESERVED');
  assert.equal(fake.calls.length, 1);
});
for (const [field, value, code] of [
  ['authorization', undefined, 'OFFLINE_AUTHORIZATION_ABSENT'],
  ['candidateId', 'unknown', 'CANDIDATE_ID_MISMATCH'],
  ['provider', 'unknown', 'ROUTE_PROVIDER_MISMATCH'], ['route', 'api', 'ROUTE_PROVIDER_MISMATCH'],
  ['model', 'claude-opus-other', 'MODEL_MISMATCH'], ['argvClosed', false, 'MODEL_ARGV_NOT_CLOSED'],
  ['reauthRequired', true, 'REAUTH_REQUIRED'], ['extraUsage', true, 'EXTRA_USAGE'],
]) test(`before fake callback: ${field} fails closed`, async t => {
  const root = await ledger(t), fake = controlled(root), opts = options(root, fake);
  opts.fixtureAuthorization[field] = value;
  await assert.rejects(runOfflineFirstFa(opts), e => e.code === code);
  assert.equal(fake.calls.length, 0); assert.equal((await inspectInertLedger(root, id)).usedReservations, 0);
});
for (const key of ['tools', 'mcp', 'plugins', 'skills', 'hooks', 'externalRoutes']) test(`preflight ${key} rejects`, async t => {
  const root = await ledger(t), fake = controlled(root), opts = options(root, fake);
  opts.fixtureAuthorization.capabilities[key] = 1;
  await assert.rejects(runOfflineFirstFa(opts), e => e.code === 'CONTAINMENT'); assert.equal(fake.calls.length, 0);
});
test('absent authorization/default fake seam, invalid input and corrupt anchor: zero callbacks/reservations', async t => {
  const root = await ledger(t), fake = controlled(root), opts = options(root, fake);
  await assert.rejects(runOfflineFirstFa({ ...opts, fixtureAuthorization: undefined }), e => e.code === 'OFFLINE_AUTHORIZATION_ABSENT');
  await assert.rejects(runOfflineFirstFa({ ...opts, fakeSpawn: undefined }), e => e.code === 'FAKE_PROVIDER_REQUIRED');
  await assert.rejects(runOfflineFirstFa({ ...opts, request: { ...opts.request, brief: 'ç'.repeat(4097) } }),
    e => e.code === 'SEMANTIC_ANALYSIS_INVALID_REQUEST');
  assert.equal((await inspectInertLedger(root, id)).usedReservations, 0);
  await unlink(join(root, '.cevra-v2-ledger-anchor.json'));
  await assert.rejects(runOfflineFirstFa(opts), e => e.code === 'LEDGER_ANCHOR_MISSING');
  assert.equal(fake.calls.length, 0);
});
for (const mode of ['init-model', 'assistant-model', 'usage-model', 'usage-invalid', 'plugins', 'tool', 'retry',
  'extra-usage', 'schema', 'citation', 'response', 'line', 'stdout', 'stderr', 'timeout', 'late', 'cancel', 'stale', 'ambiguous'])
  test(`after reservation: ${mode} cannot PASS, retry or refund`, async t => {
    const root = await ledger(t), clock = fakeClock(), controller = new AbortController();
    let opts;
    const fake = controlled(root, { mode, clock, controller, onContact: () => {
      opts.history.commit({ type: 'project.rename', name: 'changed' }); opts.history.undo();
    } });
    opts = options(root, fake, { clock, signal: controller.signal });
    if (mode === 'stale') opts.history.redo(); // No pre-existing redo branch replacement.
    const before = JSON.stringify(opts.history.toArchive());
    await assert.rejects(runOfflineFirstFa(opts));
    const state = await inspectInertLedger(root, id);
    assert.equal(state.usedReservations, 1); assert.equal(state.remainingReservations, 3);
    assert.equal(state.receipts.length, 1); assert.notEqual(state.receipts[0].outcome, 'success');
    if (mode === 'ambiguous') {
      assert.equal(state.receipts[0].outcome, 'crash-uncertain');
      fake.children[0].emit('close', null, 'SIGKILL');
    }
    if (mode !== 'stale') assert.equal(JSON.stringify(opts.history.toArchive()), before);
    assert(opts.history.canRedo); assert.equal(fake.calls.length, 1); assert.equal(clock.pending(), 0);
  });
test('deadline starts before preparation; expired input stages make zero callback', async t => {
  const root = await ledger(t), clock = fakeClock(), fake = controlled(root), opts = options(root, fake, { clock });
  const history = opts.history;
  opts.history = Object.create(history);
  Object.defineProperty(opts.history, 'current', { get() { clock.advance(30000); return history.current; } });
  await assert.rejects(runOfflineFirstFa(opts));
  assert.equal(fake.calls.length, 0); assert.equal((await inspectInertLedger(root, id)).usedReservations, 0);
});
test('max4 is preserved: three receipted offline operations + one F-A, no fifth', async t => {
  const root = await ledger(t);
  for (const [i, operation] of ['auth-status-preflight', 'capability-model-preflight', 'entitlement-billing-preflight'].entries()) {
    const [r] = await reserveInertOperations(root, { experimentId: id, operations: [
      { operationId: `synthetic-${i}`, operation, purpose: 'offline-preflight' }
    ] });
    await writeInertReceipt(root, receipt(r));
  }
  const fake = controlled(root); assert.equal((await runOfflineFirstFa(options(root, fake))).state, 'OFFLINE_FAKE_PASS');
  assert.equal((await inspectInertLedger(root, id)).remainingReservations, 0);
  await assert.rejects(runOfflineFirstFa(options(root, fake)), e => e.code === 'LEDGER_RESERVATION_LIMIT');
  assert.equal(fake.calls.length, 1);
});
test('one invocation: evidence request never reserves or invokes a second process', async t => {
  const root = await ledger(t), fake = controlled(root, { mode: 'needs' }), opts = options(root, fake);
  // All fixture text is present; Application honestly rejects no-progress, rather
  // than turning an evidence request into a fabricated complete analysis.
  await assert.rejects(runOfflineFirstFa(opts), e => e.code === 'SEMANTIC_ANALYSIS_NO_PROGRESS');
  assert.equal(fake.calls.length, 1); assert.equal((await inspectInertLedger(root, id)).usedReservations, 1);
});
test('valid continuation demand still cannot perform a second invocation or reservation', async t => {
  const root = await ledger(t), fake = controlled(root, { mode: 'needs' });
  const { history, ids } = fixture('pt-BR', { 0: Array.from({ length: 90 }, (_, i) => `Fragment ${i}: ` + 'context '.repeat(110)) });
  await assert.rejects(runOfflineFirstFa({ ...options(root, fake), history, request: { sourceIds: ids } }),
    e => e.code === 'SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE' && e.cause?.code === 'FIRST_FA_INVOCATION_LIMIT');
  const state = await inspectInertLedger(root, id);
  assert.equal(fake.calls.length, 1); assert.equal(state.usedReservations, 1); assert.equal(state.receipts[0].outcome, 'failure');
});
test('concurrent fake F-A attempts never allocate two first-F-A slots', async t => {
  const root = await ledger(t), fake = controlled(root);
  const outcomes = await Promise.allSettled([
    runOfflineFirstFa(options(root, fake)), runOfflineFirstFa(options(root, fake))
  ]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(fake.calls.length, 1);
  assert.equal((await inspectInertLedger(root, id)).usedReservations, 1);
});
test('candidate exact gate applies at init, assistant and usage without changing historical default', () => {
  const args = childArguments('fixture', undefined, model);
  assert.equal(args[args.indexOf('--model') + 1], model);
  assert.equal(childArguments('fixture')[childArguments('fixture').indexOf('--model') + 1], 'opus');
  assert.throws(() => childArguments('fixture', undefined, 'opus'), e => e.code === 'MODEL_ARGV_NOT_CLOSED');
  for (const phase of ['init', 'assistant', 'usage']) {
    const reader = new ClaudeStreamReader('fixture', LIMITS, undefined, model);
    const events = wire('fixture', { context: { contextId: 'test', evidence: [{ reference: 'E1' }] } });
    if (phase === 'init') events[0].model = 'claude-opus-other';
    if (phase === 'assistant') events[1].message.model = 'claude-opus-other';
    if (phase === 'usage') events[2].modelUsage = { 'claude-opus-other': { inputTokens: 1, outputTokens: 2 } };
    assert.throws(() => reader.push(Buffer.from(events.map(e => JSON.stringify(e)).join('\n') + '\n')),
      e => e.code === 'MODEL_DRIFT' && e.reason === 'EXPECTED_MODEL_MISMATCH');
  }
});
