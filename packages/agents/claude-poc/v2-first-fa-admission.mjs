// OFFLINE admission binding only. No live issuer, real ledger, provider default
// or persisted grant. An injected fixture issuer is not Product Owner approval.
import { isAbsolute, normalize } from 'node:path';
import { assertInertExperimentId, inspectInertLedger, reserveInertFirstFa,
  writeInertReceipt } from './v2-inert-ledger.mjs';
import { FIRST_FA_POLICY, describeFirstFaCandidate, validateFirstFaFixture,
  runOfflineFirstFa } from './v2-first-fa-offline.mjs';

const fail = code => { throw Object.assign(new Error(code), { code }); };
const operation = 'semantic-f-a-direct';
const defaultClock = { now: () => performance.now(), setTimeout, clearTimeout };
const defaultLedger = { inspect: inspectInertLedger, reserve: reserveInertFirstFa, receipt: writeInertReceipt };
function data(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) fail('AUTHORIZATION_SCOPE_INVALID');
  const copy = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('AUTHORIZATION_SCOPE_INVALID');
    copy[key] = descriptor.value;
  }
  return copy;
}
function captureScope(input) {
  const scope = data(input, ['candidateId', 'operation', 'root', 'experimentId', 'policy', 'fixtureAuthorization']);
  describeFirstFaCandidate(scope.candidateId); // Recognition alone never grants authority.
  if (scope.operation !== operation) fail('FIRST_FA_OPERATION_FORBIDDEN');
  if (scope.policy !== FIRST_FA_POLICY) fail('FIRST_FA_POLICY_MISMATCH');
  assertInertExperimentId(scope.experimentId); // Real/historical IDs fail before any I/O.
  if (typeof scope.root !== 'string' || !isAbsolute(scope.root) || normalize(scope.root) !== scope.root) fail('LEDGER_ROOT_UNSAFE');
  const fixture = data(scope.fixtureAuthorization, ['authorization', 'candidateId', 'provider', 'route', 'model',
    'argvClosed', 'reauthRequired', 'extraUsage', 'capabilities']);
  fixture.capabilities = data(fixture.capabilities, ['tools', 'mcp', 'plugins', 'skills', 'hooks', 'externalRoutes']);
  scope.fixtureAuthorization = validateFirstFaFixture(fixture);
  return Object.freeze(scope);
}
function sameScope(a, b) {
  return a.candidateId === b.candidateId && a.operation === b.operation && a.root === b.root &&
    a.experimentId === b.experimentId && a.policy === b.policy &&
    JSON.stringify(a.fixtureAuthorization) === JSON.stringify(b.fixtureAuthorization);
}

// The issuer must synchronously return the exact frozen scope object it was
// handed, or deny. It is a deliberately injected trust dependency, not a file,
// boolean or generic account/entitlement service. None is shipped for live use.
// Identity capabilities protect ordinary callers, not malicious in-process code
// that owns the issuer/adapter or deliberately rewrites the filesystem.
export function createFirstFaAdmissionController({ authorizationIssuer, ledgerAdapter = defaultLedger } = {}) {
  if (authorizationIssuer !== undefined && typeof authorizationIssuer !== 'function') fail('AUTHORIZATION_ISSUER_INVALID');
  const io = Object.freeze({ inspect: ledgerAdapter.inspect, reserve: ledgerAdapter.reserve, receipt: ledgerAdapter.receipt });
  if (Object.values(io).some(fn => typeof fn !== 'function')) fail('LEDGER_ADAPTER_INVALID');
  const capabilities = new WeakMap();
  function issueFirstFaCapability(input) {
    if (!authorizationIssuer) fail('LIVE_AUTHORIZATION_MISSING');
    const scope = captureScope(input);
    let approval;
    try { approval = authorizationIssuer(scope); }
    catch { fail('AUTHORIZATION_ISSUER_FAILED'); }
    if (approval !== scope) {
      // Async issuers are unsupported; observe their rejection without making
      // it authorization or letting an unhandled rejection escape.
      if (approval instanceof Promise) void approval.catch(() => {});
      fail('AUTHORIZATION_DENIED');
    }
    const capability = Object.freeze(Object.assign(Object.create(null), {
      toJSON() { fail('AUTHORIZATION_CAPABILITY_NOT_SERIALIZABLE'); }
    }));
    capabilities.set(capability, { scope, consumed: false });
    return capability;
  }
  async function runFirstFaWithAdmission(input) {
    const clockSource = input?.clock ?? defaultClock;
    const clock = Object.freeze({ now: clockSource.now.bind(clockSource),
      setTimeout: clockSource.setTimeout.bind(clockSource), clearTimeout: clockSource.clearTimeout.bind(clockSource) });
    const deadline = clock.now() + FIRST_FA_POLICY.totalDeadlineMs; // Entry, not after ledger/preparation.
    const grant = capabilities.get(input?.capability);
    if (!grant) fail('LIVE_AUTHORIZATION_MISSING');
    if (grant.consumed) fail('AUTHORIZATION_CAPABILITY_CONSUMED');
    // Consume synchronously BEFORE the first await, inspect, reserve or callback.
    // Invalid admission/reservation does not refund a capability or fabricate a slot.
    grant.consumed = true;
    const scope = captureScope(input.scope);
    if (!sameScope(scope, grant.scope)) fail('AUTHORIZATION_SCOPE_MISMATCH');
    const fakeSpawn = input.fakeSpawn, history = input.history, signal = input.signal;
    if (typeof fakeSpawn !== 'function') fail('FAKE_PROVIDER_REQUIRED');
    let request;
    try { request = structuredClone(input.request); }
    catch { fail('FIRST_FA_REQUEST_INVALID'); }
    return runOfflineFirstFa({ root: scope.root, experimentId: scope.experimentId,
      fixtureAuthorization: scope.fixtureAuthorization, history, request, fakeSpawn,
      signal, clock, admissionDeadline: deadline, ledgerAdapter: io });
  }
  return Object.freeze({ issueFirstFaCapability, runFirstFaWithAdmission,
    liveIssuer: 'TRUSTED_LIVE_AUTHORIZATION_ISSUER_NOT_WIRED', liveAuthorized: false });
}
