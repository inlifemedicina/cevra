import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { mkdtemp, mkdir, chmod, realpath, writeFile, readFile, readdir, rm, unlink, symlink } from 'node:fs/promises';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPrivateFirstFa, validateCapturedFirstFaSession, validateAdmittedFirstFaSession } from '../v2-first-fa-session.mjs';
import { createFirstFaSessionAdmissionController } from '../v2-first-fa-admission.mjs';
import { createFirstFaLedgerFacade, initializeInertLedger, inspectInertLedger } from '../v2-inert-ledger.mjs';
import { FIRST_FA_POLICY } from '../v2-first-fa-offline.mjs';
import { CLAUDE_VERSION, CLAUDE_SHA256, LIMITS } from '../transport.mjs';
import { captureTransportDiagnostic, validateTransportDiagnostic } from '../transport-diagnostic.mjs';
import { fixture } from './fixtures.mjs';

const id = 'synthetic-semantic-v2-ledger-session';
const model = FIRST_FA_POLICY.expectedModel;
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const writeFileSyncFixture = path => writeFileSync(path, JSON.stringify({ foreign: true }), { flag: 'wx', mode: 0o600 });
const code = expected => e => e.code === expected;
async function setup(t) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'cevra-fa-session-test-')));
  await chmod(parent, 0o700); t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, 'operation'), home = join(parent, 'home'), scratchParent = join(parent, 'scratch');
  for (const d of [root, home, scratchParent]) await mkdir(d, { mode: 0o700 });
  const pluginOverrideReceipt = join(parent, 'synthetic-plugin-receipt.json');
  await writeFile(pluginOverrideReceipt, JSON.stringify({ version: 1, event: 'system/init', plugins: [
    { kind: 'object', name: 'fixture-one', source: 'fixture-one@builtin', path: 'builtin' },
    { kind: 'object', name: 'fixture-two', source: 'fixture-two@builtin', path: 'builtin' }
  ] }), { mode: 0o600 });
  const runtime = { binary: join(parent, 'synthetic-cli'), home, scratchParent, pluginOverrideReceipt,
    version: CLAUDE_VERSION, sha256: CLAUDE_SHA256, provider: 'claude-cli',
    route: 'first-party-subscription', model, effort: 'medium' };
  const { history, ids } = fixture();
  history.commit({ type: 'project.rename', name: 'redo preserved' }); history.undo();
  const input = { candidateId: FIRST_FA_POLICY.candidateId, operation: 'semantic-f-a-direct',
    experimentId: id, root, policy: FIRST_FA_POLICY, runtime, history, request: { sourceIds: ids }, signal: undefined };
  return { parent, root, runtime, input, before: JSON.stringify(history.toArchive()) };
}
function clockFixture() {
  let n = 0, now = 0; const timers = new Map();
  return { now: () => now, setTimeout(fn, delay) { const id = ++n; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id), pending: () => timers.size,
    advance(ms) { const end = now + ms; for (;;) {
      const next = [...timers].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break; now = next[1].at; timers.delete(next[0]); next[1].fn();
    } now = end; } };
}
// Explicit fake human I/O only; never connected to real stdin/TTY/provider.
function human(t, { answer = 'confirm', mutate = () => {}, tty = true, observe = () => {} } = {}) {
  const input = new PassThrough(); input.isTTY = tty; let text = '';
  const output = new Writable({ write(chunk, _, done) {
    text += chunk.toString(); done();
    if (/CONFIRM [a-f0-9]{64}:/.test(text)) setImmediate(() => {
      observe(text);
      mutate();
      if (answer === 'eof') input.end();
      else input.write(answer === 'confirm' ? `CONFIRM ${text.match(/CONFIRM ([a-f0-9]{64}):/)[1]}\n` : `${answer}\n`);
    });
  } }); output.isTTY = tty;
  t.after(() => { input.destroy(); output.destroy(); });
  return { input, output };
}
for (const [locale, title, warning, instruction] of [
  ['pt-BR', 'CEVRA: somente a primeira F-A privada', 'NÃO COMPROVADAS', 'Digite exatamente CONFIRM'],
  ['en-US', 'CEVRA private first F-A only', 'NOT PROVEN', 'Type exactly CONFIRM']
]) test(`local consent uses ${locale} request locale with identical scoped confirmation`, async t => {
  const s = await setup(t), fake = childFixture(s); let observed;
  // pt-BR exercises the ProjectHistory default; en-US overrides it explicitly.
  if (locale === 'en-US') s.input.request.locale = locale;
  const result = await runPrivateFirstFa(s.input, deps(t, fake, {
    consentIO: human(t, { observe: text => { observed = text; } })
  }));
  assert(observed.includes(title)); assert(observed.includes(warning)); assert(observed.includes(instruction));
  assert.equal(result.state, 'OFFLINE_FAKE_PASS'); assert.equal(fake.calls.length, 1);
  assert.equal(JSON.stringify(s.input.history.toArchive()), s.before);
});
function wire(session, envelope) {
  const candidate = { version: 1, kind: 'analysis-candidate', contextId: envelope.context.contextId,
    observations: [{ id: 'o1', kind: 'idea', statement: 'Controlled synthetic response', uncertainty: 'material',
      justification: 'Deterministic test, not live generation', evidenceReferences: [envelope.context.evidence[0].reference] }],
    relations: [], uncertainties: [], limitations: ['Offline only'] };
  return [
    { type: 'system', subtype: 'init', session_id: session, model, tools: [], mcp_servers: [], plugins: [], skills: [], permissionMode: 'default' },
    { type: 'assistant', session_id: session, message: { id: 'fixture-message', model,
      content: [{ type: 'text', text: 'Synthetic, not model generation' }], stop_reason: 'end_turn' } },
    { type: 'result', subtype: 'success', session_id: session, is_error: false, stop_reason: 'end_turn', num_turns: 1,
      permission_denials: [], result: JSON.stringify(candidate), modelUsage: { [model]: { inputTokens: 1, outputTokens: 2 } } }
  ];
}
function childFixture(s, { mode = 'success', clock, abort, contact = () => {}, closeDeferred = false, mutateEvents = () => {} } = {}) {
  const children = [], calls = [], settingsPaths = [];
  const fakeSpawn = (binary, argv, options) => {
    const reservation = JSON.parse(readFileSync(join(s.root, 'ledger/reservation-0001.json'), 'utf8'));
    const cp = JSON.parse(readFileSync(join(s.root, 'ledger/ledger-checkpoint.json'), 'utf8'));
    assert.equal(cp.state, 'FIRST_FA_OPERATIONAL_LEDGER');
    assert.equal(reservation.state, 'RESERVED_FIRST_FA_OPERATION');
    assert.equal(reservation.operationId, 'first-fa-direct'); assert.equal(reservation.purpose, 'semantic-f-a');
    assert.equal(JSON.parse(readFileSync(join(s.root, 'ledger/ledger-state.json'), 'utf8')).watermark, 1);
    assert.equal(binary, s.runtime.binary); assert.equal(options.cwd.startsWith(s.runtime.scratchParent), true);
    assert.equal(options.env.HOME, s.runtime.home); assert(options.env.USER && options.env.LOGNAME);
    assert.equal(options.shell, false); assert.equal(argv[argv.indexOf('--tools') + 1], '');
    assert.equal(argv[argv.indexOf('--model') + 1], model); assert.equal(argv[argv.indexOf('--effort') + 1], 'medium');
    assert.equal(argv[argv.indexOf('--max-turns') + 1], '1'); assert(!argv.includes('--fallback-model'));
    const settings = argv[argv.indexOf('--settings') + 1]; settingsPaths.push(settings);
    assert.deepEqual(JSON.parse(readFileSync(settings, 'utf8')), { enabledPlugins: { 'fixture-one@builtin': false, 'fixture-two@builtin': false } });
    assert.equal(readFileSync(settings, 'utf8').includes('true'), false);
    calls.push({ binary, argv, options }); contact();
    const child = new EventEmitter(); children.push(child); child.signals = [];
    for (const name of ['stdin', 'stdout', 'stderr']) { child[name] = new EventEmitter(); child[name].destroy = () => {}; }
    child.kill = signal => {
      child.signals.push(signal);
      if (mode === 'timeout') child.emit('close', null, signal);
      else if (!closeDeferred && mode !== 'ambiguous') queueMicrotask(() => child.emit('close', null, signal));
      return true;
    };
    child.stdin.end = payload => queueMicrotask(() => {
      assert(Buffer.byteLength(payload) <= 65536);
      assert(!payload.includes('fixture-one@builtin')); assert(!payload.includes(s.runtime.home));
      const envelope = JSON.parse(payload), events = wire(argv[argv.indexOf('--session-id') + 1], envelope);
      if (mode === 'plugins') events[0].plugins = ['fixture-secret'];
      if (mode === 'model') events[1].message.model = 'claude-opus-other';
      if (mode === 'provider') events[1].error = 'authentication_failed';
      if (mode === 'citation') { const c = JSON.parse(events[2].result); c.observations[0].evidenceReferences = ['E999']; events[2].result = JSON.stringify(c); }
      if (mode === 'response') events[2].result = 'x'.repeat(LIMITS.response + 1);
      if (mode === 'needs') events[2].result = JSON.stringify({ version: 1, kind: 'needs-evidence', contextId: envelope.context.contextId,
        request: { type: 'text-context', sourceReference: 'S1', maxAdditionalBytes: 4096, reason: 'Fixture context' } });
      if (mode === 'timeout' || mode === 'ambiguous') { clock.advance(34000); return; }
      if (mode === 'cancel') { abort.abort(); return; }
      mutateEvents(events);
      child.stdout.emit('data', Buffer.from(events.map(e => JSON.stringify(e)).join('\n') + '\n'));
      if (!closeDeferred) child.emit('close', 0, null);
    });
    return child;
  };
  return { fakeSpawn, children, calls, settingsPaths };
}
function deps(t, fake, extra = {}) {
  return { consentIO: human(t), fakeSpawn: fake.fakeSpawn, verifyBinary: async () => {}, ...extra };
}

test('shared private entrypoint: fake human→issuer→cap→init→reservation→closed process→Application→receipt', async t => {
  const s = await setup(t), fake = childFixture(s), verifies = [];
  const result = await runPrivateFirstFa(s.input, deps(t, fake, { verifyBinary: async path => { verifies.push(path); } }));
  assert.equal(fake.calls.length, 1); assert.equal(verifies.length, 2); assert.equal(result.state, 'OFFLINE_FAKE_PASS');
  assert.equal(result.liveAuthorized, false); assert.equal(result.result.kind, 'analysis-candidate');
  assert(Object.isFrozen(result.result.candidate)); assert(result.result.evidence.length);
  assert.equal(JSON.stringify(s.input.history.toArchive()), s.before); assert(s.input.history.canRedo);
  const r = await read(join(s.root, 'ledger/receipt-0001.json'));
  assert.equal(r.scopeDigest, result.reservation.scopeDigest); assert.equal(r.reservationDigest, result.reservation.reservationDigest);
  assert.equal(r.executionMode, 'CONTROLLED_FAKE'); assert.equal(r.providerContact, false); assert.equal(r.live, false);
  assert.equal(r.processStarted, true); assert.equal(r.childClosed, true); assert.equal(r.resultKind, 'analysis-candidate');
  assert.match(r.responseDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(r.bindingDigests, result.reservation.bindingDigests);
  assert.equal(r.transportObservation.inputTokens, 1); assert.equal(r.transportObservation.outputTokens, 2);
  assert.equal(r.transportObservation.observedModel, model); assert(r.transportObservation.requestBytes <= 65536);
  assert.equal(Object.hasOwn(r.transportObservation, 'diagnostic'), false);
  assert.deepEqual(await readdir(s.runtime.scratchParent), []);
  assert(fake.settingsPaths.every(p => !existsSync(p)));
  // The generic inert API cannot treat an operational profile as offline.
  await assert.rejects(inspectInertLedger(s.root, id), code('LEDGER_ANCHOR_MISMATCH'));
});
test('spawn failure keeps committed slot and correlated failed receipt, not a started process', async t => {
  const s = await setup(t); let callbacks = 0;
  await assert.rejects(runPrivateFirstFa(s.input, {
    consentIO: human(t), verifyBinary: async () => {},
    fakeSpawn() { callbacks++; throw Object.assign(new Error('synthetic spawn failure'), { code: 'ENOENT' }); }
  }));
  const r = await read(join(s.root, 'ledger/receipt-0001.json'));
  assert.equal(callbacks, 1); assert.equal(r.outcome, 'failure'); assert.equal(r.processStarted, false);
  assert.equal(r.live, false); assert.equal(r.providerContact, false);
  assert.equal(JSON.stringify(s.input.history.toArchive()), s.before);
  assert.deepEqual(await readdir(s.runtime.scratchParent), []);
});
for (const answer of ['no', 'yes', 'eof']) test(`local consent ${answer} denies before verification/ledger/contact`, async t => {
  const s = await setup(t), fake = childFixture(s); let verifies = 0;
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake, { consentIO: human(t, { answer }), verifyBinary: async () => { verifies++; } })), code('LOCAL_CONSENT_DENIED'));
  assert.equal(verifies, 0); assert.equal(fake.calls.length, 0); assert.deepEqual(await readdir(s.root), []);
});
test('noninteractive input and missing default consent fail closed without provider/filesystem writes', async t => {
  const s = await setup(t), fake = childFixture(s);
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake, { consentIO: human(t, { tty: false }) })), code('LOCAL_CONSENT_TTY_REQUIRED'));
  // Deliberately non-TTY fake I/O; never attempt actual terminal acquisition in CI.
  assert.deepEqual(await readdir(s.root), []); assert.equal(fake.calls.length, 0);
  const controller = createFirstFaSessionAdmissionController();
  assert.throws(() => controller.issueFirstFaCapability({}), code('LIVE_AUTHORIZATION_MISSING'));
});
for (const field of ['request', 'history', 'root', 'model', 'route']) test(`mutation of ${field} during consent blocks before ledger`, async t => {
  const s = await setup(t), fake = childFixture(s);
  const mutate = () => {
    if (field === 'request') s.input.request.sourceIds.push('foreign');
    if (field === 'history') s.input.history.commit({ type: 'project.rename', name: 'changed' });
    if (field === 'root') s.input.root = s.parent;
    if (field === 'model' || field === 'route') s.runtime[field] = 'foreign';
  };
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake, { consentIO: human(t, { mutate }) })), code('FIRST_FA_BINDING_STALE'));
  assert.deepEqual(await readdir(s.root), []); assert.equal(fake.calls.length, 0);
});
for (const [field, value, expected] of [['version', 'other', 'VERSION_DRIFT'], ['sha256', '0'.repeat(64), 'VERSION_DRIFT'],
  ['model', 'claude-sonnet-other', 'MODEL_MISMATCH'], ['effort', 'high', 'MODEL_MISMATCH'], ['route', 'api', 'ROUTE_PROVIDER_MISMATCH'],
  ['binary', '../binary', 'FIRST_FA_PATH_INVALID']]) test(`runtime ${field} fails locally`, async t => {
  const s = await setup(t), fake = childFixture(s); s.runtime[field] = value;
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake)), code(expected));
  assert.deepEqual(await readdir(s.root), []); assert.equal(fake.calls.length, 0);
});
test('fake infrastructure cannot persist proposed real ID or historical V1', async t => {
  const s = await setup(t), fake = childFixture(s);
  for (const [realId, expected] of [[FIRST_FA_POLICY.candidateId, 'REAL_EXPERIMENT_ID_FORBIDDEN_OFFLINE'],
    ['semantic-claude-roundtrip-poc-v1', 'HISTORICAL_EXPERIMENT_CLOSED']]) {
    await assert.rejects(runPrivateFirstFa({ ...s.input, experimentId: realId }, deps(t, fake)), code(expected));
    await assert.rejects(initializeInertLedger(s.root, { experimentId: realId }), code(expected));
  }
  assert.deepEqual(await readdir(s.root), []); assert.equal(fake.calls.length, 0);
});
test('plain/reconstructed objects and real ID do not authorize session or operational facade', async t => {
  const s = await setup(t), plain = Object.freeze({ root: s.root, candidateId: FIRST_FA_POLICY.candidateId,
    experimentId: FIRST_FA_POLICY.candidateId, scopeDigest: 'a'.repeat(64) });
  assert.throws(() => validateCapturedFirstFaSession(plain), code('AUTHORIZATION_SCOPE_INVALID'));
  assert.throws(() => validateAdmittedFirstFaSession(plain), code('LEDGER_ADMISSION_REQUIRED'));
  assert.throws(() => createFirstFaLedgerFacade(plain), code('LEDGER_ADMISSION_REQUIRED'));
  const facade = createFirstFaLedgerFacade(() => plain);
  assert.throws(() => facade.initialize(s.root, plain.experimentId), code('LEDGER_ADMISSION_REQUIRED'));
  assert.deepEqual(await readdir(s.root), []);
});
test('invalid/accessor request fails before human I/O, without getter execution', async t => {
  const s = await setup(t), fake = childFixture(s); let gets = 0;
  Object.defineProperty(s.input.request, 'sourceIds', { enumerable: true, get() { gets++; return []; } });
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake)), code('FIRST_FA_REQUEST_INVALID'));
  assert.equal(gets, 0); assert.deepEqual(await readdir(s.root), []);
});
test('pin verification failure creates neither ledger nor slot; session cleanup is bounded', async t => {
  const s = await setup(t), fake = childFixture(s);
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake, { verifyBinary: async () => { throw Object.assign(new Error('VERSION_DRIFT'), { code: 'VERSION_DRIFT' }); } })), code('VERSION_DRIFT'));
  assert.equal(fake.calls.length, 0); assert.deepEqual(await readdir(s.root), []); assert.deepEqual(await readdir(s.runtime.scratchParent), []);
});
test('foreign initialization content and symlink roots block without repair/contact', async t => {
  const s = await setup(t), fake = childFixture(s);
  await writeFile(join(s.root, 'foreign'), 'fixture', { mode: 0o600 });
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake)), code('LEDGER_ANCHOR_MISSING'));
  assert.deepEqual(await readdir(s.root), ['foreign']); assert.equal(fake.calls.length, 0);
  const link = join(s.parent, 'link'); await symlink(s.root, link);
  await assert.rejects(runPrivateFirstFa({ ...s.input, root: link }, deps(t, fake)), code('FIRST_FA_PATH_INVALID'));
});
for (const [mode, expected] of [['plugins', 'SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE'], ['model', 'SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE'],
  ['provider', 'SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE'], ['citation', 'SEMANTIC_ANALYSIS_INVALID_EVIDENCE'],
  ['response', 'SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE'], ['cancel', 'SEMANTIC_ANALYSIS_CANCELLED'], ['timeout', 'TIMEOUT']]) {
  test(`${mode}: original gates, no retry/refund; history preserved`, async t => {
    const s = await setup(t), clock = clockFixture(), abort = new AbortController(); s.input.signal = abort.signal;
    const fake = childFixture(s, { mode, clock, abort });
    await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake, { clock })), code(expected));
    assert.equal(fake.calls.length, 1); assert.equal(JSON.stringify(s.input.history.toArchive()), s.before); assert(s.input.history.canRedo);
    const receipt = await read(join(s.root, 'ledger/receipt-0001.json'));
    assert.notEqual(receipt.outcome, 'success'); assert.equal(receipt.processStarted, true); assert.equal(receipt.childClosed, true);
    const second = childFixture(s);
    s.input.signal = undefined;
    await assert.rejects(runPrivateFirstFa(s.input, deps(t, second)), code('FIRST_FA_ALREADY_RESERVED'));
    assert.equal(second.calls.length, 0); assert.equal((await read(join(s.root, 'ledger/ledger-state.json'))).watermark, 1);
  });
}
test('two separately consented controllers cannot allocate/contact F-A twice', async t => {
  const s = await setup(t), a = childFixture(s), b = childFixture(s);
  const results = await Promise.allSettled([runPrivateFirstFa(s.input, deps(t, a)), runPrivateFirstFa(s.input, deps(t, b))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(a.calls.length + b.calls.length, 1);
  assert.equal((await read(join(s.root, 'ledger/ledger-state.json'))).watermark, 1);
});
test('deadline includes preparation and stops before ledger at exact 30s', async t => {
  const s = await setup(t), clock = clockFixture(), fake = childFixture(s);
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake, { clock, verifyBinary: async () => clock.advance(30000) })), code('TIMEOUT'));
  assert.equal(fake.calls.length, 0); assert.deepEqual(await readdir(s.root), []); assert.equal(clock.pending(), 0);
});
test('needs-evidence cannot start second invocation, reservation or retry', async t => {
  const s = await setup(t), fake = childFixture(s, { mode: 'needs' });
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake)), code('SEMANTIC_ANALYSIS_NO_PROGRESS'));
  assert.equal(fake.calls.length, 1); assert.equal((await read(join(s.root, 'ledger/ledger-state.json'))).watermark, 1);
});
test('settings live until actual child settlement; receipt never calls unknown settlement success', async t => {
  const s = await setup(t), clock = clockFixture(), fake = childFixture(s, { mode: 'ambiguous', clock });
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake, { clock })), code('TIMEOUT'));
  const receipt = await read(join(s.root, 'ledger/receipt-0001.json'));
  assert.equal(receipt.outcome, 'crash-uncertain'); assert.equal(receipt.childClosed, false);
  assert(existsSync(fake.settingsPaths[0]));
  fake.children[0].emit('close', null, 'SIGKILL');
  for (let i = 0; i < 30 && existsSync(fake.settingsPaths[0]); i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert(!existsSync(fake.settingsPaths[0]));
});
test('lost anchor/receipt corruption and unresolved reservation never reconstruct or replay', async t => {
  const s = await setup(t), fake = childFixture(s);
  await runPrivateFirstFa(s.input, deps(t, fake));
  await unlink(join(s.root, 'ledger/receipt-0001.json'));
  const second = childFixture(s);
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, second)), code('LEDGER_UNRESOLVED'));
  assert.equal(second.calls.length, 0); assert.equal((await read(join(s.root, 'ledger/ledger-state.json'))).watermark, 1);
  await unlink(join(s.root, '.cevra-v2-ledger-anchor.json'));
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, second)), code('LEDGER_ANCHOR_MISSING'));
  assert.equal(second.calls.length, 0);
});
test('diagnostics and receipts contain no private plugin names, paths, grant or request text', async t => {
  const s = await setup(t), fake = childFixture(s, { mode: 'provider' }); let error;
  try { await runPrivateFirstFa(s.input, deps(t, fake)); } catch (e) { error = e; }
  const text = JSON.stringify({ error, receipt: await read(join(s.root, 'ledger/receipt-0001.json')) });
  for (const privateText of ['fixture-one', 'fixture-two', s.runtime.home, 'CONFIRM', 'Synthetic metadata']) assert(!text.includes(privateText));
});

const initFailures = [
  ...[['tools', 'TOOLS'], ['mcp_servers', 'MCP'], ['plugins', 'PLUGINS']].flatMap(([field, name]) => [
    [e => { delete e[field]; }, `INIT_${name}_MISSING`, field, 'missing', null],
    [e => { e[field] = 'fixture-private-identity'; }, `INIT_${name}_WRONG_TYPE`, field, 'string', null],
    [e => { e[field] = ['fixture-private-identity']; }, `INIT_${name}_NONEMPTY`, field, 'array', 1]
  ]),
  [e => { e.skills = { name: 'fixture-private-identity' }; }, 'INIT_SKILLS_WRONG_TYPE', 'skills', 'object', null],
  [e => { e.skills = ['fixture-private-identity']; }, 'INIT_SKILLS_NONEMPTY', 'skills', 'array', 1],
  [e => { e.permissionMode = 'bypassPermissions'; }, 'INIT_PERMISSION_BYPASS']
];
for (const [mutate, reason, field, kind, count] of initFailures) test(`operational fake receipt retains ${reason}, without private content or refund`, async t => {
  const s = await setup(t), fake = childFixture(s, { mutateEvents: events => mutate(events[0]) });
  let error;
  try { await runPrivateFirstFa(s.input, deps(t, fake)); } catch (e) { error = e; }
  assert.equal(error?.code, 'SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE');
  assert.equal(error.transportCode, 'CONTAINMENT'); assert.equal(error.cause?.code, 'CONTAINMENT');
  const r = await read(join(s.root, 'ledger/receipt-0001.json')), d = r.transportObservation.diagnostic;
  assert.deepEqual(error.transportDiagnostic, d); assert.equal(r.transportObservation.errorCode, error.code);
  assert.equal(d.transportCode, 'CONTAINMENT'); assert.equal(d.reason, reason);
  assert.equal(d.event.type, 'system'); assert.equal(d.event.subtype, 'init');
  if (field) assert.deepEqual(d.event[field], { present: kind !== 'missing', kind, count });
  else assert.equal(d.event.permissionsBypassed, true);
  assert(Object.isFrozen(error.transportDiagnostic)); assert(Object.isFrozen(error.transportDiagnostic.event));
  assert.equal(validateTransportDiagnostic(d), d);
  const text = JSON.stringify({ error, receipt: r });
  for (const secret of ['fixture-private-identity', 'fixture-one', 'fixture-two', s.runtime.home, 'CONFIRM', 'Synthetic metadata']) assert(!text.includes(secret));
  assert.equal(fake.calls.length, 1); assert.equal(r.childClosed, true); assert.equal(r.outcome, 'failure');
  assert.equal(JSON.stringify(s.input.history.toArchive()), s.before); assert(s.input.history.canRedo);
  assert.deepEqual(await readdir(s.runtime.scratchParent), []);
  const second = childFixture(s);
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, second)), code('FIRST_FA_ALREADY_RESERVED'));
  assert.equal(second.calls.length, 0); assert.equal((await read(join(s.root, 'ledger/ledger-state.json'))).watermark, 1);
});
for (const [event, reason] of [
  [{ type: 'system', subtype: 'status', status: 'compacting' }, 'STATUS_COMPACTING'],
  [{ type: 'system', subtype: 'status', status: null, permissionMode: 'bypassPermissions' }, 'STATUS_PERMISSION_BYPASS'],
  [{ type: 'system', subtype: 'session_state_changed', state: 'requires_action' }, 'SESSION_REQUIRES_ACTION'],
  [{ type: 'system', subtype: 'hook_started', private: 'fixture-private-content' }, 'FORBIDDEN_SYSTEM_EVENT'],
  [{ type: 'control_request', private: 'fixture-private-content' }, 'FORBIDDEN_EVENT_TYPE']
]) test(`post-init containment diagnostic retains ${reason}`, async t => {
  const s = await setup(t), fake = childFixture(s, { mutateEvents: events => events.splice(1, 0, { ...event, session_id: events[0].session_id }) });
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake)), e => {
    assert.equal(e.code, 'SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE'); assert.equal(e.transportDiagnostic.reason, reason);
    return e.transportCode === 'CONTAINMENT';
  });
  const r = await read(join(s.root, 'ledger/receipt-0001.json'));
  assert.equal(r.transportObservation.diagnostic.reason, reason); assert.equal(fake.calls.length, 1);
  assert(!JSON.stringify(r).includes('fixture-private-content'));
});
test('diagnostic failure cannot replace the primary error when receipt persistence also fails', async t => {
  const s = await setup(t), fake = childFixture(s, { mode: 'plugins' });
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake, { ledgerControl: {
    receipt: { pauseAfterLock() { throw new Error('fixture-private-storage-failure'); } }
  } })), e => e.code === 'SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE' && e.transportCode === 'CONTAINMENT' &&
    e.transportDiagnostic.reason === 'INIT_PLUGINS_NONEMPTY' && typeof e.receiptCode === 'string' &&
    !JSON.stringify(e).includes('fixture-private-storage-failure'));
  assert.equal(fake.calls.length, 1); assert.equal((await read(join(s.root, 'ledger/ledger-state.json'))).watermark, 1);
});
test('failure diagnostic is optional for historical operational receipts; no rewrite or replay', async t => {
  const s = await setup(t), fake = childFixture(s, { mode: 'plugins' });
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake)));
  const path = join(s.root, 'ledger/receipt-0001.json'), r = await read(path);
  delete r.transportObservation.diagnostic;
  await writeFile(path, JSON.stringify(r)); // Synthetic backward-compatibility fixture only.
  const before = await readFile(path, 'utf8'), second = childFixture(s);
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, second)), code('FIRST_FA_ALREADY_RESERVED'));
  assert.equal(await readFile(path, 'utf8'), before); assert.equal(second.calls.length, 0);
});
test('unknown diagnostic strings are omitted; malformed summaries never become primary errors', () => {
  const d = captureTransportDiagnostic({ code: 'PRIVATE_SECRET_CODE', reason: 'PRIVATE_SECRET_REASON',
    metrics: { lastEventSummary: { type: 'private-event', payload: 'private-text' } } });
  assert.deepEqual(d, { transportCode: null, reason: null, event: null });
  assert.equal(validateTransportDiagnostic(d), d);
  assert.deepEqual(captureTransportDiagnostic({ code: 'CONTAINMENT', reason: 'INIT_PLUGINS_NONEMPTY',
    metrics: { lastEventSummary: {} } }), { transportCode: 'CONTAINMENT', reason: 'INIT_PLUGINS_NONEMPTY', event: null });
});
test('throwing diagnostic metadata cannot throw over the original failure', () => {
  for (const key of ['code', 'reason', 'metrics']) {
    const error = { code: 'CONTAINMENT', reason: 'INIT_PLUGINS_NONEMPTY' };
    Object.defineProperty(error, key, { get() { throw new Error('fixture-private-metadata'); } });
    let diagnostic;
    assert.doesNotThrow(() => { diagnostic = captureTransportDiagnostic(error); });
    validateTransportDiagnostic(diagnostic);
    assert(!JSON.stringify(diagnostic).includes('fixture-private-metadata'));
  }
});
for (const [name, mutate] of [
  ['unknown code', d => { d.transportCode = 'PRIVATE_SECRET_CODE'; }],
  ['unknown reason', d => { d.reason = 'PRIVATE_SECRET_REASON'; }],
  ['raw event', d => { d.event.raw = 'private-text'; }],
  ['plugin identity', d => { d.event.plugins.identity = 'private-plugin'; }],
  ['unknown subtype', d => { d.event.subtype = 'private-subtype'; }],
  ['negative count', d => { d.event.plugins.count = -1; }],
  ['oversized count', d => { d.event.plugins.count = 1_000_001; }],
  ['inconsistent presence', d => { d.event.plugins.present = false; }]
]) test(`strict operational receipt rejects diagnostic ${name} before another fake process`, async t => {
  const s = await setup(t), fake = childFixture(s, { mode: 'plugins' });
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake)));
  const path = join(s.root, 'ledger/receipt-0001.json'), r = await read(path);
  mutate(r.transportObservation.diagnostic);
  assert.throws(() => validateTransportDiagnostic(r.transportObservation.diagnostic), code('TRANSPORT_DIAGNOSTIC_INVALID'));
  await writeFile(path, JSON.stringify(r)); // Exact synthetic corruption fixture only.
  const second = childFixture(s);
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, second)), code('LEDGER_RECEIPT_MISMATCH'));
  assert.equal(second.calls.length, 0); assert.equal((await read(join(s.root, 'ledger/ledger-state.json'))).watermark, 1);
});

for (const [stage, point] of [['initialize', 'after-anchor-fsync'], ['reserve', 'after-reservation-fsync']]) {
  test(`${stage} simulated crash uses same core; zero process, no repair/refund/replay`, async t => {
    const s = await setup(t), fake = childFixture(s);
    const io = deps(t, fake, { ledgerControl: { [stage]: { crashAt: point } } });
    await assert.rejects(runPrivateFirstFa(s.input, io));
    assert.equal(fake.calls.length, 0); assert(existsSync(join(s.root, '.cevra-v2-ledger.lock')));
    assert.equal(existsSync(join(s.root, 'ledger/reservation-0001.json')), stage === 'reserve');
    await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake)), code('LEDGER_LOCKED'));
    assert.equal(fake.calls.length, 0);
  });
}
test('failure before reservation creates no slot; consumed capability does not fabricate quota', async t => {
  const s = await setup(t), fake = childFixture(s);
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake, { ledgerControl: {
    reserve: { pauseAfterLock: async () => { throw new Error('synthetic storage failure'); } }
  } })), code('SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE'));
  assert.equal(fake.calls.length, 0); assert.equal((await read(join(s.root, 'ledger/ledger-state.json'))).watermark, 0);
  assert.deepEqual((await readdir(join(s.root, 'ledger'))).sort(), ['ledger-checkpoint.json', 'ledger-state.json']);
});
test('expired durable reservation keeps slot but blocks process callback', async t => {
  const s = await setup(t), clock = clockFixture(), fake = childFixture(s);
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake, { clock, ledgerControl: {
    reserve: { pauseAfterLock: async () => clock.advance(30000) }
  } })), code('TIMEOUT'));
  assert.equal(fake.calls.length, 0); assert.equal((await read(join(s.root, 'ledger/ledger-state.json'))).watermark, 1);
  const r = await read(join(s.root, 'ledger/receipt-0001.json'));
  assert.equal(r.processStarted, false); assert.equal(r.outcome, 'failure');
});
for (const mode of ['deadline', 'abort']) test(`B-1 ${mode} during final pre-spawn binding: zero spawn and no refund`, async t => {
  const s = await setup(t), clock = clockFixture(), abort = new AbortController(), fake = childFixture(s);
  s.input.signal = abort.signal;
  const archive = s.input.history.toArchive.bind(s.input.history);
  let readsAfterReservation = 0;
  s.input.history.toArchive = () => {
    const value = archive();
    if (existsSync(join(s.root, 'ledger/reservation-0001.json')) && ++readsAfterReservation === 2) {
      // First binding read is after durable reservation; the second is inside
      // the transport callback, immediately before its owned spawn seam.
      if (mode === 'deadline') clock.advance(30000);
      else abort.abort();
    }
    return value;
  };
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake, { clock })),
    code(mode === 'deadline' ? 'TIMEOUT' : 'SEMANTIC_ANALYSIS_CANCELLED'));
  assert(readsAfterReservation >= 2); assert.equal(fake.calls.length, 0);
  const reservation = await read(join(s.root, 'ledger/reservation-0001.json'));
  const receipt = await read(join(s.root, 'ledger/receipt-0001.json'));
  assert.equal((await read(join(s.root, 'ledger/ledger-state.json'))).watermark, 1);
  assert.equal(receipt.reservationDigest, reservation.reservationDigest);
  assert.equal(receipt.processStarted, false); assert.equal(receipt.childClosed, false);
  assert.equal(receipt.outcome, mode === 'deadline' ? 'failure' : 'cancelled');
  assert.equal(receipt.responseDigest, null); assert.equal(clock.pending(), 0);
  assert.equal(JSON.stringify(archive()), s.before); assert(s.input.history.canRedo);
  assert.deepEqual(await readdir(s.runtime.scratchParent), []);
  s.input.signal = undefined;
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake, { clock })), code('FIRST_FA_ALREADY_RESERVED'));
  assert.equal(fake.calls.length, 0);
  assert.equal((await read(join(s.root, 'ledger/ledger-state.json'))).watermark, 1);
});
test('receipt duration cannot extend acceptance; accounting is not authority', async t => {
  const s = await setup(t), clock = clockFixture(), fake = childFixture(s);
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake, { clock, ledgerControl: {
    receipt: { pauseAfterLock: async () => clock.advance(30000) }
  } })), code('TIMEOUT'));
  assert.equal(fake.calls.length, 1); assert.equal((await read(join(s.root, 'ledger/ledger-state.json'))).watermark, 1);
  assert.equal(JSON.stringify(s.input.history.toArchive()), s.before);
});
test('post-process pin verification drift refuses candidate and retains failed receipt', async t => {
  const s = await setup(t), fake = childFixture(s); let count = 0;
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake, { verifyBinary: async () => {
    if (++count === 2) throw Object.assign(new Error('VERSION_DRIFT'), { code: 'VERSION_DRIFT' });
  } })), code('SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE'));
  assert.equal(fake.calls.length, 1); assert.equal((await read(join(s.root, 'ledger/receipt-0001.json'))).outcome, 'failure');
});
test('receipt mismatch is not PASS; foreign artifact remains and slot is not refunded', async t => {
  const s = await setup(t), fake = childFixture(s, { contact() {
    // Exact synthetic test file; never overwrite an existing receipt.
    writeFileSyncFixture(join(s.root, 'ledger/receipt-0001.json'));
  } });
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake)), code('LEDGER_SCHEMA_INVALID'));
  assert.equal(fake.calls.length, 1); assert.deepEqual(await read(join(s.root, 'ledger/receipt-0001.json')), { foreign: true });
  assert.equal((await read(join(s.root, 'ledger/ledger-state.json'))).watermark, 1);
});
test('stale history during child execution fails but still accounts reserved attempt', async t => {
  const s = await setup(t), fake = childFixture(s, { contact() {
    s.input.history.commit({ type: 'project.rename', name: 'stale' }); s.input.history.undo();
  } });
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake)));
  assert.equal(fake.calls.length, 1); assert.equal((await read(join(s.root, 'ledger/receipt-0001.json'))).outcome, 'failure');
});
test('runtime filesystem failure and cleanup failure do not leak paths or delete unexpected files', async t => {
  const s = await setup(t), fake = childFixture(s);
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, fake, { verifyBinary: async () => {
    throw Object.assign(new Error(`private ${s.runtime.binary}`), { code: 'ENOENT' });
  } })), e => e.code === 'FIRST_FA_RUNTIME_UNAVAILABLE' && !JSON.stringify(e).includes(s.parent));
  const foreign = childFixture(s, { contact() { writeFileSyncFixture(join(foreign.calls[0].options.cwd, 'foreign.json')); } });
  await assert.rejects(runPrivateFirstFa(s.input, deps(t, foreign)), code('FIRST_FA_CLEANUP_FAILED'));
  assert(existsSync(join(foreign.calls[0].options.cwd, 'foreign.json')));
  assert(!existsSync(foreign.settingsPaths[0]));
});
