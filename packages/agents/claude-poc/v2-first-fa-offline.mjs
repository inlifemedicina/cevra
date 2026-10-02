// Scoped OFFLINE integration, not an executable live harness or authorization
// primitive. A supplied controlled-process seam is mandatory; there is no
// binary discovery, provider default, real root, initialization or live toggle.
import { SemanticEditorialAnalysisService } from '@cevra/application';
import { inspectInertLedger, reserveInertOperations, writeInertReceipt } from './v2-inert-ledger.mjs';
import { OFFLINE_POLICY } from './v2-offline-experiment-plan.mjs';
import { LIMITS, childArguments, runClaudeProcess } from './transport.mjs';

const frozen = value => {
  for (const child of Object.values(value)) if (child && typeof child === 'object') frozen(child);
  return Object.freeze(value);
};
const fail = code => { throw Object.assign(new Error(code), { code }); };
const closed = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join('|') === [...keys].sort().join('|');
export const FIRST_FA_POLICY = frozen({
  state: 'OFFLINE PREPARATION / LIVE NOT AUTHORIZED',
  candidateId: OFFLINE_POLICY.proposedExperimentId,
  expectedModel: 'claude-opus-5-5', requestedEffort: 'medium',
  modelEvidence: {
    source: 'https://code.claude.com/docs/en/model-config',
    minimumCli: '2.1.280', supportedFullId: 'claude-opus-5-5',
    support: 'DOCUMENTED REQUEST ID / INSTALLED HELP; NOT GENERATION OR ENTITLEMENT PROOF'
  },
  maxInvocations: 1, totalDeadlineMs: 30000, retries: 0, fallbacks: 0,
  applicationBytes: { initialEnvelope: 65536, cumulativeEnvelopes: 262144, response: 65536 },
  processBounds: { ...LIMITS },
  remoteTokens: '32000 INPUT / 4000 OUTPUT HARD ENFORCEMENT NOT DEMONSTRATED',
  usage: 'OBSERVATIONAL ONLY', httpContacts: 'UNKNOWN',
  incrementalCost: 'R$0 REQUIRED / NOT ABSOLUTELY VERIFIED'
});

// Identity recognition is pure. Inert persistence still rejects the candidate
// ID. Nothing here grants permission, initializes storage or creates a slot.
export function describeFirstFaCandidate(id) {
  if (id === OFFLINE_POLICY.historicalExperiment) fail('HISTORICAL_EXPERIMENT_CLOSED');
  if (id !== FIRST_FA_POLICY.candidateId) fail('CANDIDATE_ID_MISMATCH');
  return frozen({ candidateId: id, liveAuthorized: false, activation: 'ABSENT',
    persistence: 'NOT INITIALIZED', reservation: 'NOT CREATED',
    blocker: 'LIVE_AUTHORIZATION_PRIMITIVE_MISSING' });
}

function validateFixture(value) {
  if (!closed(value, ['authorization', 'candidateId', 'provider', 'route', 'model',
    'argvClosed', 'reauthRequired', 'extraUsage', 'capabilities'])) fail('OFFLINE_AUTHORIZATION_ABSENT');
  if (value.authorization !== 'OFFLINE_FAKE_ONLY') fail('OFFLINE_AUTHORIZATION_ABSENT');
  describeFirstFaCandidate(value.candidateId);
  if (value.provider !== 'claude-cli' || value.route !== 'first-party-subscription') fail('ROUTE_PROVIDER_MISMATCH');
  if (value.model !== FIRST_FA_POLICY.expectedModel) fail('MODEL_MISMATCH');
  if (value.argvClosed !== true) fail('MODEL_ARGV_NOT_CLOSED');
  if (value.reauthRequired !== false) fail('REAUTH_REQUIRED');
  if (value.extraUsage !== false) fail('EXTRA_USAGE');
  const names = ['tools', 'mcp', 'plugins', 'skills', 'hooks', 'externalRoutes'];
  if (!closed(value.capabilities, names) || names.some(key => value.capabilities[key] !== 0)) fail('CONTAINMENT');
}

// The test authorization describes a synthetic fixture, never a consumer login
// or future live grant. The reservation uses ONLY an already initialized
// synthetic ledger. Real IDs remain blocked by its unchanged public API.
// Receipt outcome describes completed offline Application evaluation. A receipt
// is accounting, not authority to accept a late result or authorize another call.
export async function runOfflineFirstFa({
  root, experimentId, fixtureAuthorization, history, request, fakeSpawn,
  signal, clock = { now: () => performance.now(), setTimeout, clearTimeout }
}) {
  const deadline = clock.now() + FIRST_FA_POLICY.totalDeadlineMs;
  const controller = new AbortController();
  let timedOut = false, reservation, primary, result, calls = 0, transportMetrics, adapterCall, transportFailure;
  const guard = () => {
    if (signal?.aborted) fail('CANCELLED');
    if (timedOut || clock.now() >= deadline) fail('TIMEOUT');
  };
  guard();
  validateFixture(fixtureAuthorization); // Synchronous capture before I/O.
  if (typeof fakeSpawn !== 'function') fail('FAKE_PROVIDER_REQUIRED');
  childArguments('offline-session', undefined, FIRST_FA_POLICY.expectedModel);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = clock.setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(0, deadline - clock.now()));
  const analyzer = {
    analyze(invocation, context) {
      if (adapterCall) fail('FIRST_FA_INVOCATION_LIMIT');
      adapterCall = (async () => {
      guard();
      if (calls !== 0) fail('FIRST_FA_INVOCATION_LIMIT');
      if (typeof invocation.payload !== 'string' || invocation.payloadBytes !== Buffer.byteLength(invocation.payload) ||
          invocation.payloadBytes > FIRST_FA_POLICY.applicationBytes.initialEnvelope) fail('INPUT_LIMIT');
      // Admission/validation/preparation can fail before reservation: no fictitious
      // execution. Once reserved, any cancellation, crash or failure keeps the slot.
      [reservation] = await reserveInertOperations(root, { experimentId, operations: [{
        operationId: 'first-fa-direct', operation: 'semantic-f-a-direct', purpose: 'offline-semantic-f-a'
      }] });
      guard();
      const transport = await runClaudeProcess({
        binary: '/offline-fake-only', home: '/offline-fixture-home', cwd: '/offline-fixture-cwd',
        payload: invocation.payload, signal: context.signal,
        expectedModel: FIRST_FA_POLICY.expectedModel, timeoutMs: deadline - clock.now()
      }, (binary, argv, options) => {
        guard(); calls++; // Guard inside the callback immediately before contact.
        return fakeSpawn(binary, argv, options);
      }, clock);
      transportMetrics = transport.metrics;
      guard();
      return transport.result;
      })();
      // Attach an observer immediately: Application can finish its cancellation
      // race before the adapter's bounded cleanup finishes.
      void adapterCall.catch(error => { transportFailure = error; });
      return adapterCall;
    }
  };
  try {
    guard();
    const ledger = await inspectInertLedger(root, experimentId);
    guard();
    if (ledger.unresolvedReservations.length) fail('LEDGER_UNRESOLVED');
    if (!ledger.remainingReservations) fail('LEDGER_RESERVATION_LIMIT');
    // A F-A allocation is unique within this experiment, even under a new ID.
    if (ledger.reservations.some(entry => entry.operation === 'semantic-f-a-direct')) fail('FIRST_FA_ALREADY_RESERVED');
    // The general boundary keeps its historical two-invocation contract. This
    // adapter blocks the second invocation BEFORE any reservation/fake spawn.
    const app = new SemanticEditorialAnalysisService({ history, analyzer,
      timeoutMs: FIRST_FA_POLICY.totalDeadlineMs, monotonicClock: clock.now,
      initialContextMaxBytes: FIRST_FA_POLICY.applicationBytes.initialEnvelope,
      totalEvidenceMaxBytes: FIRST_FA_POLICY.applicationBytes.cumulativeEnvelopes,
      responseMaxBytes: FIRST_FA_POLICY.applicationBytes.response });
    result = await app.analyze(request, controller.signal);
    guard();
  } catch (error) {
    primary = error;
    // The closed transport can reject before its owned process has settled.
    // A pending/unknown settlement is NEVER recorded as a successful evaluation.
  } finally {
    if (adapterCall) await adapterCall.catch(error => { transportFailure = error; });
    clock.clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    if (reservation) {
      const outcome = transportFailure?.childSettlement || transportFailure?.metrics?.settlementIncomplete ? 'crash-uncertain' :
        primary ? signal?.aborted || primary.code === 'CANCELLED' ? 'cancelled' : 'failure' :
        result?.kind === 'analysis-candidate' ? 'success' : 'failure';
      try {
        await writeInertReceipt(root, { version: 1, experimentId,
          reservationNumber: reservation.number, operationId: reservation.operationId,
          purpose: reservation.purpose, reservationDigest: reservation.reservationDigest,
          outcome, providerContact: false, live: false });
      } catch (error) {
        if (primary) primary.receiptCode = error.code;
        else primary = error;
      }
    }
  }
  if (primary && transportFailure?.code) primary.transportCode = transportFailure.code;
  if (primary) throw primary;
  const accepted = Object.freeze({ state: result.kind === 'analysis-candidate' ? 'OFFLINE_FAKE_PASS' : 'OFFLINE_PARTIAL',
    result, invocations: calls, reservation, transportMetrics,
    liveAuthorized: false, providerContact: false, deadlineMs: FIRST_FA_POLICY.totalDeadlineMs });
  guard(); // Persistence is not extra inference time; no await before return.
  return accepted;
}
