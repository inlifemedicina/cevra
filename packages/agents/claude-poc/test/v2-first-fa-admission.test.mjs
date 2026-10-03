import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, realpath, chmod, rm, readdir, readFile, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFirstFaAdmissionController } from '../v2-first-fa-admission.mjs';
import { FIRST_FA_POLICY, SECOND_FA_POLICY, describeFirstFaCandidate } from '../v2-first-fa-offline.mjs';
import { initializeInertLedger, inspectInertLedger, reserveInertFirstFa,
  reserveInertOperations, writeInertReceipt } from '../v2-inert-ledger.mjs';
import { fixture } from './fixtures.mjs';

const id = 'synthetic-semantic-v2-ledger-admission';
const model = FIRST_FA_POLICY.expectedModel;
const code = expected => error => error.code === expected && error.message === expected;
const authorization = () => ({ authorization: 'OFFLINE_FAKE_ONLY', candidateId: FIRST_FA_POLICY.candidateId,
  provider: 'claude-cli', route: 'first-party-subscription', model, argvClosed: true,
  reauthRequired: false, extraUsage: false,
  capabilities: { tools: 0, mcp: 0, plugins: 0, skills: 0, hooks: 0, externalRoutes: 0 } });
const scope = root => ({ candidateId: FIRST_FA_POLICY.candidateId, operation: 'semantic-f-a-direct',
  root, experimentId: id, policy: FIRST_FA_POLICY, fixtureAuthorization: authorization() });
const fakeIssuer = value => value; // Explicit fixture dependency, never a live approval.
const ledgerIo = { inspect: inspectInertLedger, reserve: reserveInertFirstFa, receipt: writeInertReceipt };
const controller = extra => createFirstFaAdmissionController({ authorizationIssuer: fakeIssuer, ...extra });
async function ledger(t, initialize = true) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cevra-admission-test-')));
  await chmod(root, 0o700);
  t.after(() => rm(root, { recursive: true, force: true })); // Exact owned synthetic fixture only.
  if (initialize) await initializeInertLedger(root, { experimentId: id });
  return root;
}
function clockFixture() {
  let time = 0, sequence = 0; const timers = new Map();
  return { now: () => time, setTimeout(fn, delay) { const n = ++sequence; timers.set(n, { fn, at: time + delay }); return n; },
    clearTimeout: n => timers.delete(n), pending: () => timers.size,
    advance(ms) {
      const end = time + ms;
      for (;;) {
        const next = [...timers].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at; timers.delete(next[0]); next[1].fn();
      }
      time = end;
    } };
}
function fakeProcess(root, { mode = 'success', clock, abort, onContact = () => {} } = {}) {
  const calls = [], children = [];
  const spawn = (binary, argv, options) => {
    calls.push({ argv, options });
    const state = JSON.parse(readFileSync(join(root, 'ledger/ledger-state.json'), 'utf8'));
    const reservation = JSON.parse(readFileSync(join(root, 'ledger', `reservation-${String(state.watermark).padStart(4, '0')}.json`), 'utf8'));
    assert.equal(reservation.operation, 'semantic-f-a-direct');
    assert.equal(reservation.operationId, 'first-fa-direct');
    assert.equal(binary, '/offline-fake-only'); assert.equal(options.shell, false);
    assert.equal(argv[argv.indexOf('--tools') + 1], '');
    assert.equal(argv[argv.indexOf('--model') + 1], model);
    assert.equal(argv[argv.indexOf('--effort') + 1], 'medium');
    assert(!argv.includes('--fallback-model'));
    onContact();
    const child = new EventEmitter(); children.push(child);
    for (const name of ['stdin', 'stdout', 'stderr']) {
      child[name] = new EventEmitter(); child[name].destroy = () => {};
    }
    child.signals = [];
    child.kill = signal => {
      child.signals.push(signal);
      if (mode !== 'ambiguous') queueMicrotask(() => child.emit('close', null, signal));
      return true;
    };
    child.stdin.end = payload => queueMicrotask(() => {
      const envelope = JSON.parse(payload), session = argv[argv.indexOf('--session-id') + 1];
      const candidate = { version: 1, kind: 'analysis-candidate', contextId: envelope.context.contextId,
        observations: [{ id: 'o1', kind: 'idea', statement: 'Synthetic only', uncertainty: 'material',
          justification: 'Not inference', evidenceReferences: [envelope.context.evidence[0].reference] }],
        relations: [], uncertainties: [], limitations: ['Offline fixture'] };
      const events = [
        { type: 'system', subtype: 'init', session_id: session, model,
          tools: [], mcp_servers: [], skills: [], plugins: [], permissionMode: 'default' },
        { type: 'assistant', session_id: session, message: { id: 'fixture', model,
          content: [{ type: 'text', text: 'Synthetic only' }], stop_reason: 'end_turn' } },
        { type: 'result', subtype: 'success', session_id: session, is_error: false, stop_reason: 'end_turn',
          num_turns: 1, permission_denials: [], result: JSON.stringify(candidate),
          modelUsage: { [model]: { inputTokens: 1, outputTokens: 1 } } }
      ];
      if (mode === 'provider-error') events[1].error = 'authentication_failed';
      if (mode === 'plugin') events[0].plugins = ['synthetic-private'];
      if (mode === 'model') events[1].message.model = 'claude-opus-other';
      if (mode === 'citation') { candidate.observations[0].evidenceReferences = ['E999']; events[2].result = JSON.stringify(candidate); }
      if (mode === 'timeout' || mode === 'ambiguous') { clock.advance(32000); return; }
      if (mode === 'cancel') abort.abort();
      if (mode === 'needs') events[2].result = JSON.stringify({ version: 1, kind: 'needs-evidence',
        contextId: envelope.context.contextId, request: { type: 'text-context', sourceReference: 'S1',
          maxAdditionalBytes: 4096, reason: 'Synthetic request' } });
      child.stdout.emit('data', Buffer.from(events.map(e => JSON.stringify(e)).join('\n') + '\n'));
      child.emit('close', 0, null);
    });
    return child;
  };
  return { spawn, calls, children };
}
function input(root, admission, fake, extra = {}) {
  const { history, ids } = fixture();
  history.commit({ type: 'project.rename', name: 'redo fixture' }); history.undo();
  const binding = scope(root);
  return { scope: binding, capability: admission.issueFirstFaCapability(binding), history,
    request: { sourceIds: ids }, fakeSpawn: fake.spawn, ...extra };
}

test('default has no live issuer; recognition and existing ledger grant nothing', async t => {
  const root = await ledger(t), fake = fakeProcess(root), admission = createFirstFaAdmissionController();
  assert.equal(describeFirstFaCandidate(FIRST_FA_POLICY.candidateId).liveAuthorized, false);
  assert.equal(admission.liveIssuer, 'TRUSTED_LIVE_AUTHORIZATION_ISSUER_NOT_WIRED');
  assert.throws(() => admission.issueFirstFaCapability(scope(root)), code('LIVE_AUTHORIZATION_MISSING'));
  await assert.rejects(admission.runFirstFaWithAdmission({ scope: scope(root), fakeSpawn: fake.spawn }), code('LIVE_AUTHORIZATION_MISSING'));
  assert.equal(fake.calls.length, 0); assert.equal((await inspectInertLedger(root, id)).usedReservations, 0);
});
test('plain object, JSON reconstruction, inherited identity and other controller are not capabilities', async t => {
  const root = await ledger(t), fake = fakeProcess(root), admission = controller(), opts = input(root, admission, fake);
  assert.throws(() => JSON.stringify(opts.capability), code('AUTHORIZATION_CAPABILITY_NOT_SERIALIZABLE'));
  assert.throws(() => structuredClone(opts.capability));
  for (const capability of [{ approved: true }, JSON.parse('{}'), { ...opts.capability }, Object.create(opts.capability)]) {
    await assert.rejects(admission.runFirstFaWithAdmission({ ...opts, capability }), code('LIVE_AUTHORIZATION_MISSING'));
  }
  await assert.rejects(controller().runFirstFaWithAdmission(opts), code('LIVE_AUTHORIZATION_MISSING'));
  assert.equal(fake.calls.length, 0); assert.equal((await inspectInertLedger(root, id)).usedReservations, 0);
});
test('issuer denies, throws or returns asynchronous approval: no authority or leaked contents', async t => {
  const root = await ledger(t);
  for (const [issuer, expected] of [[() => true, 'AUTHORIZATION_DENIED'],
    [() => { throw new Error('synthetic private account'); }, 'AUTHORIZATION_ISSUER_FAILED'],
    [async () => { throw new Error('private async'); }, 'AUTHORIZATION_DENIED']]) {
    assert.throws(() => controller({ authorizationIssuer: issuer }).issueFirstFaCapability(scope(root)), code(expected));
  }
  await new Promise(resolve => setImmediate(resolve));
});
for (const [key, value, expected] of [
  ['candidateId', 'wrong', 'CANDIDATE_ID_MISMATCH'],
  ['candidateId', 'semantic-claude-roundtrip-poc-v1', 'HISTORICAL_EXPERIMENT_CLOSED'],
  ['experimentId', FIRST_FA_POLICY.candidateId, 'REAL_EXPERIMENT_ID_FORBIDDEN_OFFLINE'],
  ['experimentId', 'semantic-claude-roundtrip-poc-v1', 'HISTORICAL_EXPERIMENT_CLOSED'],
  ['operation', 'semantic-f-b-invocation-1', 'FIRST_FA_OPERATION_FORBIDDEN'],
  ['policy', { ...FIRST_FA_POLICY }, 'FIRST_FA_POLICY_MISMATCH'],
  ['root', '.', 'LEDGER_ROOT_UNSAFE']
]) test(`scope ${key}/${expected}: blocked before issuer and filesystem`, async t => {
  const root = await ledger(t, false); let issues = 0;
  const admission = controller({ authorizationIssuer: s => { issues++; return s; } });
  assert.throws(() => admission.issueFirstFaCapability({ ...scope(root), [key]: value }), code(expected));
  assert.equal(issues, 0); assert.deepEqual(await readdir(root), []);
});
for (const field of ['root', 'experimentId', 'fixtureAuthorization']) test(`capability cannot retarget ${field}`, async t => {
  const root = await ledger(t), other = await ledger(t), admission = controller(), fake = fakeProcess(root);
  const opts = input(root, admission, fake);
  if (field === 'root') opts.scope.root = other;
  if (field === 'experimentId') opts.scope.experimentId = 'synthetic-semantic-v2-ledger-other';
  if (field === 'fixtureAuthorization') opts.scope.fixtureAuthorization.extraUsage = true;
  await assert.rejects(admission.runFirstFaWithAdmission(opts));
  await assert.rejects(admission.runFirstFaWithAdmission(opts), code('AUTHORIZATION_CAPABILITY_CONSUMED'));
  assert.equal(fake.calls.length, 0); assert.equal((await inspectInertLedger(root, id)).usedReservations, 0);
});
for (const [field, value, expected] of [['model', 'claude-opus-other', 'MODEL_MISMATCH'],
  ['route', 'api', 'ROUTE_PROVIDER_MISMATCH'], ['argvClosed', false, 'MODEL_ARGV_NOT_CLOSED']])
  test(`local ${field} gate precedes issuer/ledger/contact`, async t => {
    const root = await ledger(t); let calls = 0;
    const admission = controller({ ledgerAdapter: { inspect() { calls++; }, reserve() { calls++; }, receipt() { calls++; } } });
    const s = scope(root); s.fixtureAuthorization[field] = value;
    assert.throws(() => admission.issueFirstFaCapability(s), code(expected)); assert.equal(calls, 0);
  });
for (const key of ['tools', 'mcp', 'plugins', 'skills', 'hooks', 'externalRoutes'])
  test(`local containment ${key} cannot grant capability`, async t => {
    const root = await ledger(t), s = scope(root); s.fixtureAuthorization.capabilities[key] = 1;
    assert.throws(() => controller().issueFirstFaCapability(s), code('CONTAINMENT'));
    assert.equal((await inspectInertLedger(root, id)).usedReservations, 0);
  });
test('opaque capability consumed synchronously: concurrent reuse cannot even inspect twice', async t => {
  const root = await ledger(t), fake = fakeProcess(root); let entered, release, reads = 0;
  const started = new Promise(r => { entered = r; }), barrier = new Promise(r => { release = r; });
  const admission = controller({ ledgerAdapter: { ...ledgerIo, async inspect(...args) {
    reads++; entered(); await barrier; return inspectInertLedger(...args);
  } } });
  const opts = input(root, admission, fake), pending = admission.runFirstFaWithAdmission(opts);
  try {
    await started;
    await assert.rejects(admission.runFirstFaWithAdmission(opts), code('AUTHORIZATION_CAPABILITY_CONSUMED'));
    assert.equal(reads, 1); assert.equal(fake.calls.length, 0);
  } finally { release(); }
  const result = await pending;
  assert.equal(result.state, 'OFFLINE_FAKE_PASS'); assert.equal(fake.calls.length, 1);
});
test('capture prevents mutable scope/adapter/request retargeting after admission starts', async t => {
  const root = await ledger(t), fake = fakeProcess(root); let entered, release;
  const started = new Promise(r => { entered = r; }), barrier = new Promise(r => { release = r; });
  const adapter = { ...ledgerIo, async inspect(...args) { entered(); await barrier; return inspectInertLedger(...args); } };
  const admission = controller({ ledgerAdapter: adapter }), opts = input(root, admission, fake);
  const pending = admission.runFirstFaWithAdmission(opts);
  try {
    await started; opts.scope.root = '/synthetic-retarget'; opts.scope.fixtureAuthorization.model = 'other';
    opts.request.sourceIds.length = 0; adapter.reserve = () => assert.fail('retargeted adapter');
    opts.fakeSpawn = () => assert.fail('retargeted callback');
  } finally { release(); }
  assert.equal((await pending).state, 'OFFLINE_FAKE_PASS'); assert.equal(fake.calls.length, 1);
});
test('real Application + projection + stream gates → correlated receipt, immutable result, untouched history/redo', async t => {
  const root = await ledger(t), fake = fakeProcess(root), admission = controller(), opts = input(root, admission, fake);
  const before = JSON.stringify(opts.history.toArchive()), result = await admission.runFirstFaWithAdmission(opts);
  assert.equal(result.invocations, 1); assert.equal(result.liveAuthorized, false); assert.equal(result.providerContact, false);
  assert.equal(result.transportMetrics.requestedModel, model); assert.equal(result.transportMetrics.childClosed, true);
  assert(Object.isFrozen(result.result.candidate)); assert(result.result.evidence.length);
  assert.equal(JSON.stringify(opts.history.toArchive()), before); assert(opts.history.canRedo);
  const current = await inspectInertLedger(root, id), receipt = current.receipts[0];
  assert.equal(current.usedReservations, 1); assert.equal(receipt.outcome, 'success');
  assert.equal(receipt.reservationDigest, result.reservation.reservationDigest);
  assert.equal(receipt.operationId, 'first-fa-direct');
  await assert.rejects(admission.runFirstFaWithAdmission(opts), code('AUTHORIZATION_CAPABILITY_CONSUMED'));
  // A new controller/capability/reopen is not a second F-A authorization.
  await initializeInertLedger(root, { experimentId: id });
  const reopened = controller();
  await assert.rejects(reopened.runFirstFaWithAdmission(input(root, reopened, fake)), code('FIRST_FA_ALREADY_RESERVED'));
  assert.equal(fake.calls.length, 1);
});
test('reserve failure consumes capability but creates no fictitious execution or callback', async t => {
  const root = await ledger(t), fake = fakeProcess(root); let attempts = 0;
  const admission = controller({ ledgerAdapter: { ...ledgerIo, async reserve() {
    attempts++; throw Object.assign(new Error('LEDGER_LOCKED'), { code: 'LEDGER_LOCKED' });
  } } });
  const opts = input(root, admission, fake);
  await assert.rejects(admission.runFirstFaWithAdmission(opts));
  await assert.rejects(admission.runFirstFaWithAdmission(opts), code('AUTHORIZATION_CAPABILITY_CONSUMED'));
  assert.equal(attempts, 1); assert.equal(fake.calls.length, 0);
  assert.equal((await inspectInertLedger(root, id)).usedReservations, 0);
});
test('durable uniqueness under lock rejects F-A despite a new caller-selected operation ID', async t => {
  const root = await ledger(t);
  await reserveInertOperations(root, { experimentId: id, operations: [
    { operationId: 'different-first-id', operation: 'semantic-f-a-direct', purpose: 'offline-semantic-f-a' }
  ] });
  await assert.rejects(reserveInertFirstFa(root, { experimentId: id, operations: [
    { operationId: 'first-fa-direct', operation: 'semantic-f-a-direct', purpose: 'offline-semantic-f-a' }
  ] }), code('LEDGER_FIRST_FA_ALREADY_RESERVED'));
  await assert.rejects(reserveInertFirstFa(root, { experimentId: id, operations: [
    { operationId: 'another-id', operation: 'semantic-f-a-direct', purpose: 'offline-semantic-f-a' }
  ] }), code('LEDGER_FIRST_FA_SCOPE_INVALID'));
  assert.equal((await inspectInertLedger(root, id)).usedReservations, 1);
});
test('two independent controllers race: at most one committed F-A and one fake process', async t => {
  const root = await ledger(t), fake = fakeProcess(root), a = controller(), b = controller();
  const results = await Promise.allSettled([a.runFirstFaWithAdmission(input(root, a, fake)), b.runFirstFaWithAdmission(input(root, b, fake))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(fake.calls.length, 1); assert.equal((await inspectInertLedger(root, id)).usedReservations, 1);
});
for (const mode of ['provider-error', 'plugin', 'model', 'citation', 'cancel', 'timeout', 'ambiguous'])
  test(`after reservation ${mode}: no PASS, refund, retry or capability reuse`, async t => {
    const root = await ledger(t), clock = clockFixture(), abort = new AbortController();
    const fake = fakeProcess(root, { mode, clock, abort }), admission = controller();
    const opts = input(root, admission, fake, { clock, signal: abort.signal });
    const before = JSON.stringify(opts.history.toArchive());
    await assert.rejects(admission.runFirstFaWithAdmission(opts));
    const current = await inspectInertLedger(root, id);
    assert.equal(current.usedReservations, 1); assert.equal(current.remainingReservations, 3);
    assert.notEqual(current.receipts[0].outcome, 'success');
    if (mode === 'ambiguous') { assert.equal(current.receipts[0].outcome, 'crash-uncertain'); fake.children[0].emit('close', null, 'SIGKILL'); }
    assert.equal(JSON.stringify(opts.history.toArchive()), before); assert(opts.history.canRedo);
    assert.equal(fake.calls.length, 1); assert.equal(clock.pending(), 0);
    await assert.rejects(admission.runFirstFaWithAdmission(opts), code('AUTHORIZATION_CAPABILITY_CONSUMED'));
  });
test('crash after durable reservation retains unresolved slot; reopen cannot replay F-A', async t => {
  const root = await ledger(t), fake = fakeProcess(root);
  const admission = controller({ ledgerAdapter: { ...ledgerIo, async reserve(...args) {
    await reserveInertFirstFa(...args); throw Object.assign(new Error('LEDGER_SIMULATED_CRASH'), { code: 'LEDGER_SIMULATED_CRASH' });
  } } });
  await assert.rejects(admission.runFirstFaWithAdmission(input(root, admission, fake)));
  const state = await initializeInertLedger(root, { experimentId: id });
  assert.equal(state.usedReservations, 1); assert.deepEqual(state.unresolvedReservations, [1]);
  const next = controller(); await assert.rejects(next.runFirstFaWithAdmission(input(root, next, fake)), code('LEDGER_UNRESOLVED'));
  assert.equal(fake.calls.length, 0);
});
test('receipt failure or mismatch is never semantic PASS; committed slot remains', async t => {
  const root = await ledger(t), fake = fakeProcess(root);
  const admission = controller({ ledgerAdapter: { ...ledgerIo, receipt(root, r) {
    return writeInertReceipt(root, { ...r, reservationDigest: 'mismatch' });
  } } });
  await assert.rejects(admission.runFirstFaWithAdmission(input(root, admission, fake)), code('LEDGER_RECEIPT_MISMATCH'));
  const state = await inspectInertLedger(root, id);
  assert.equal(state.usedReservations, 1); assert.deepEqual(state.unresolvedReservations, [1]);
});
test('entry deadline includes inspect I/O; reservation and contact remain absent after exact deadline', async t => {
  const root = await ledger(t), clock = clockFixture(), fake = fakeProcess(root);
  const admission = controller({ ledgerAdapter: { ...ledgerIo, async inspect(...args) {
    const value = await inspectInertLedger(...args); clock.advance(30000); return value;
  } } });
  await assert.rejects(admission.runFirstFaWithAdmission(input(root, admission, fake, { clock })), code('TIMEOUT'));
  assert.equal(fake.calls.length, 0); assert.equal((await inspectInertLedger(root, id)).usedReservations, 0);
});
test('reservation I/O uses remaining deadline; expired commit keeps slot but never contacts', async t => {
  const root = await ledger(t), clock = clockFixture(), fake = fakeProcess(root);
  const admission = controller({ ledgerAdapter: { ...ledgerIo, async reserve(...args) {
    const value = await reserveInertFirstFa(...args); clock.advance(30000); return value;
  } } });
  await assert.rejects(admission.runFirstFaWithAdmission(input(root, admission, fake, { clock })));
  assert.equal(fake.calls.length, 0); assert.equal((await inspectInertLedger(root, id)).usedReservations, 1);
});
test('last sub-100ms interval remains valid without extending the entry deadline', async t => {
  const root = await ledger(t), clock = clockFixture(), fake = fakeProcess(root);
  const admission = controller({ ledgerAdapter: { ...ledgerIo, async inspect(...args) {
    const value = await inspectInertLedger(...args); clock.advance(29950); return value;
  } } });
  assert.equal((await admission.runFirstFaWithAdmission(input(root, admission, fake, { clock }))).state, 'OFFLINE_FAKE_PASS');
  assert.equal(fake.calls.length, 1); assert.equal(clock.pending(), 0);
});
test('receipt I/O cannot extend acceptance deadline', async t => {
  const root = await ledger(t), clock = clockFixture(), fake = fakeProcess(root);
  const admission = controller({ ledgerAdapter: { ...ledgerIo, async receipt(...args) {
    const value = await writeInertReceipt(...args); clock.advance(30000); return value;
  } } });
  await assert.rejects(admission.runFirstFaWithAdmission(input(root, admission, fake, { clock })), code('TIMEOUT'));
  assert.equal(fake.calls.length, 1); assert.equal((await inspectInertLedger(root, id)).usedReservations, 1);
});
test('anchor loss blocks before reserve/contact and never recreates control', async t => {
  const root = await ledger(t), fake = fakeProcess(root), admission = controller();
  await unlink(join(root, '.cevra-v2-ledger-anchor.json'));
  await assert.rejects(admission.runFirstFaWithAdmission(input(root, admission, fake)), code('LEDGER_ANCHOR_MISSING'));
  assert.equal(fake.calls.length, 0); assert.deepEqual(await readdir(root), ['ledger']);
});
test('max4 remains global operation budget: last slot permits F-A; fifth refuses before fake contact', async t => {
  const root = await ledger(t);
  for (let n = 1; n <= 3; n++) {
    const [r] = await reserveInertOperations(root, { experimentId: id, operations: [
      { operationId: `preflight-${n}`, operation: 'consolidated-preflight', purpose: 'offline-preflight' }
    ] });
    await writeInertReceipt(root, { version: 1, experimentId: id, reservationNumber: r.number,
      operationId: r.operationId, purpose: r.purpose, reservationDigest: r.reservationDigest,
      outcome: 'success', providerContact: false, live: false });
  }
  const fake = fakeProcess(root), admission = controller();
  assert.equal((await admission.runFirstFaWithAdmission(input(root, admission, fake))).state, 'OFFLINE_FAKE_PASS');
  assert.equal((await inspectInertLedger(root, id)).remainingReservations, 0);
  await assert.rejects(admission.runFirstFaWithAdmission(input(root, admission, fake)), code('LEDGER_RESERVATION_LIMIT'));
  assert.equal(fake.calls.length, 1);
});
test('valid evidence continuation demand cannot allocate or invoke a second process', async t => {
  const root = await ledger(t), fake = fakeProcess(root, { mode: 'needs' }), admission = controller();
  const { history, ids } = fixture('pt-BR', { 0: Array.from({ length: 90 }, (_, i) => `Fragment ${i}: ` + 'context '.repeat(110)) });
  await assert.rejects(admission.runFirstFaWithAdmission(input(root, admission, fake, { history, request: { sourceIds: ids } })),
    e => e.code === 'SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE' && e.cause?.code === 'FIRST_FA_INVOCATION_LIMIT');
  assert.equal(fake.calls.length, 1); assert.equal((await inspectInertLedger(root, id)).usedReservations, 1);
});
test('bounded diagnostics never persist capability or fixture secrets', async t => {
  const root = await ledger(t), admission = controller(), fake = fakeProcess(root);
  const result = await admission.runFirstFaWithAdmission(input(root, admission, fake));
  for (const name of await readdir(join(root, 'ledger'))) {
    const record = await readFile(join(root, 'ledger', name), 'utf8');
    assert(!record.includes('toJSON')); assert(!record.includes('fixtureAuthorization'));
    assert(!record.includes(FIRST_FA_POLICY.candidateId));
  }
  assert.equal(result.liveAuthorized, false);
});

test('legacy fixture controller rejects second candidate with first policy before issuer or ledger I/O', () => {
  let issuerCalls = 0, ioCalls = 0;
  const c = createFirstFaAdmissionController({ authorizationIssuer(v) { issuerCalls++; return v; },
    ledgerAdapter: { inspect() { ioCalls++; }, reserve() { ioCalls++; }, receipt() { ioCalls++; } } });
  const mixed = { ...scope('/synthetic-no-io'), candidateId: SECOND_FA_POLICY.candidateId };
  assert.throws(() => c.issueFirstFaCapability(mixed), code('CANDIDATE_ID_MISMATCH'));
  assert.equal(issuerCalls, 0); assert.equal(ioCalls, 0);
});
