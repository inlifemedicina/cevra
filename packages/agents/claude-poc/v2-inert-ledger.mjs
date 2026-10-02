// Public inert APIs remain synthetic-only. The private first-F-A facade shares
// this same persistence core and requires consumed opaque admission. No default
// root, persisted grant, provider/auth/process authority or import-time activity.
// API roots are explicit private synthetic parents: anchor + lock + ledger/.
// A surviving anchor detects ledger loss. Whole-parent loss or deliberate
// coherent owner rewrites are outside this local continuity guarantee.
import { constants } from 'node:fs';
import { open, lstat, readdir, realpath, rename, unlink, mkdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { OFFLINE_POLICY, OFFLINE_OPERATIONS } from './v2-offline-experiment-plan.mjs';
import { validateAdmittedFirstFaSession } from './v2-first-fa-session.mjs';

const CHECKPOINT = 'ledger-checkpoint.json';
const STATE = 'ledger-state.json';
const TEMP = '.ledger-state.tmp';
const ANCHOR = '.cevra-v2-ledger-anchor.json';
const LOCK = '.cevra-v2-ledger.lock';
const LEDGER = 'ledger';
const MAX_FILE_BYTES = 16384;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const POLICY_DIGEST = digest(OFFLINE_POLICY);
const error = code => Object.assign(new Error(code), { code });
const fail = code => { throw error(code); };
const crashes = new Set(['after-anchor-fsync', 'after-ledger-directory-fsync', 'after-checkpoint-fsync',
  'after-reservation-fsync', 'after-fb-first-fsync', 'after-state-temp-fsync']);
const outcomes = new Set(['success', 'failure', 'cancelled', 'crash-uncertain']);
const purposes = {
  'auth-status-preflight': 'offline-preflight',
  'capability-model-preflight': 'offline-preflight',
  'entitlement-billing-preflight': 'offline-preflight',
  'consolidated-preflight': 'offline-preflight',
  'semantic-f-a-direct': 'offline-semantic-f-a',
  'semantic-f-b-invocation-1': 'offline-semantic-f-b',
  'semantic-f-b-invocation-2': 'offline-semantic-f-b',
  'cancellation-observation': 'offline-cancellation'
};
const freeze = value => {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
};
function closed(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) fail('LEDGER_SCHEMA_INVALID');
}
function experiment(id) {
  if (id === OFFLINE_POLICY.proposedExperimentId) fail('REAL_EXPERIMENT_ID_FORBIDDEN_OFFLINE');
  if (id === OFFLINE_POLICY.historicalExperiment) fail('HISTORICAL_EXPERIMENT_CLOSED');
  if (typeof id !== 'string' || !/^synthetic-semantic-v2-ledger-[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id)) fail('SYNTHETIC_EXPERIMENT_ID_REQUIRED');
}
// Pure identity check; it never initializes storage or grants authority.
export const assertInertExperimentId = experiment;
function identifier(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) fail('LEDGER_OPERATION_ID_INVALID');
}
function owned(stat) {
  return typeof process.getuid !== 'function' || stat.uid === process.getuid();
}
function privateFile(stat) {
  return stat.isFile() && !stat.isSymbolicLink() && owned(stat) && (stat.mode & 0o777) === 0o600 && stat.size <= MAX_FILE_BYTES;
}
async function rootSafety(root) {
  if (typeof root !== 'string' || !isAbsolute(root)) fail('LEDGER_ROOT_UNSAFE');
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !owned(stat) || (stat.mode & 0o777) !== 0o700 || await realpath(root) !== root) fail('LEDGER_ROOT_UNSAFE');
}
async function directorySync(root) {
  let handle;
  try { handle = await open(root, constants.O_RDONLY); await handle.sync(); }
  catch (cause) {
    // Some platforms do not implement directory fsync. Other errors fail closed.
    if (!['EINVAL', 'ENOTSUP', 'EOPNOTSUPP'].includes(cause.code) && !(process.platform === 'win32' && cause.code === 'EPERM')) throw cause;
  } finally { await handle?.close(); }
}
async function readRecord(root, name) {
  const path = join(root, name);
  const before = await lstat(path);
  if (!privateFile(before)) fail('LEDGER_FILE_UNSAFE');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    if (!privateFile(stat) || stat.ino !== before.ino || stat.dev !== before.dev) fail('LEDGER_FILE_UNSAFE');
    const text = await handle.readFile('utf8');
    if (Buffer.byteLength(text, 'utf8') > MAX_FILE_BYTES) fail('LEDGER_INTEGRITY_BLOCKED');
    return JSON.parse(text);
  } finally { await handle.close(); }
}
async function exclusiveRecord(root, name, value) {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text, 'utf8') > MAX_FILE_BYTES) fail('LEDGER_SCHEMA_INVALID');
  const handle = await open(join(root, name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try { await handle.writeFile(text, 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
  await directorySync(root);
}
function testControl(control) {
  if (control === undefined) return {};
  if (!control || typeof control !== 'object' || Object.keys(control).some(k => !['crashAt', 'pauseAfterLock'].includes(k)) ||
      control.crashAt !== undefined && !crashes.has(control.crashAt) ||
      control.pauseAfterLock !== undefined && typeof control.pauseAfterLock !== 'function') fail('LEDGER_TEST_CONTROL_INVALID');
  return control;
}
function crash(control, point) {
  if (control.crashAt === point) throw Object.assign(error('LEDGER_SIMULATED_CRASH'), { preserveLock: true });
}
async function writeState(root, state, control, initializing = false) {
  await exclusiveRecord(root, TEMP, state);
  crash(control, 'after-state-temp-fsync');
  // Only replace our already validated regular state (or create it at init).
  try { if (!privateFile(await lstat(join(root, STATE)))) fail('LEDGER_FILE_UNSAFE'); }
  catch (cause) { if (cause.code !== 'ENOENT' || !initializing) throw cause; }
  await rename(join(root, TEMP), join(root, STATE));
  await directorySync(root);
}
function normalize(cause) {
  if (typeof cause?.code === 'string' && /^(LEDGER_|REAL_EXPERIMENT_|HISTORICAL_EXPERIMENT_|SYNTHETIC_EXPERIMENT_)/.test(cause.code)) return cause;
  // Never expose filesystem paths, arbitrary messages, record contents or IDs.
  return error('LEDGER_INTEGRITY_BLOCKED');
}
function identity(id, profile) {
  if (!profile) return experiment(id);
  if (id === OFFLINE_POLICY.historicalExperiment) fail('HISTORICAL_EXPERIMENT_CLOSED');
  if (id !== profile.experimentId) fail('LEDGER_ADMISSION_MISMATCH');
}
async function withLock(root, id, control, work, profile) {
  identity(id, profile);
  control = testControl(control);
  let handle, lockStat, primary, result;
  try {
    await rootSafety(root);
    try { handle = await open(join(root, LOCK), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600); }
    catch (cause) { if (cause.code === 'EEXIST') fail('LEDGER_LOCKED'); throw cause; }
    lockStat = await handle.stat();
    await handle.writeFile(JSON.stringify({ version: 1, experimentId: id, state: profile ? 'FIRST_FA_OPERATIONAL_LOCK' : 'OFFLINE_INERT_LOCK' }), 'utf8');
    await handle.sync(); await directorySync(root);
    await control.pauseAfterLock?.();
    result = await work(control, lockStat);
  } catch (cause) { primary = normalize(cause); }
  finally {
    if (handle) {
      try {
        await handle.close();
        if (!primary?.preserveLock) {
          const current = await lstat(join(root, LOCK));
          if (!privateFile(current) || current.ino !== lockStat.ino || current.dev !== lockStat.dev) fail('LEDGER_LOCK_OWNERSHIP_BLOCKED');
          await unlink(join(root, LOCK)); await directorySync(root);
        }
      } catch (cause) {
        if (primary) primary.cleanupCode = normalize(cause).code;
        else primary = normalize(cause);
      }
    }
  }
  if (primary) throw primary;
  return result;
}
function checkpoint(id, profile) {
  return { version: 1, experimentId: id, state: profile ? 'FIRST_FA_OPERATIONAL_LEDGER' : 'OFFLINE_INERT_LEDGER', liveAuthorized: false,
    providerAuthority: 'NONE', maximumReservations: OFFLINE_POLICY.maxReservations, policyDigest: POLICY_DIGEST };
}
function anchor(id, profile) {
  // Never a quota grant: the offline checkpoint alone bounds simulations.
  return { version: 1, experimentId: id, state: profile ? 'FIRST_FA_OPERATIONAL_ANCHOR' : 'OFFLINE_INERT_LEDGER_ANCHOR', everInitialized: true,
    checkpointDigest: digest(checkpoint(id, profile)), providerAuthority: false, liveAuthorized: false,
    quotaAuthority: 'NONE', grantedReservations: 0 };
}
const recordName = (prefix, number) => `${prefix}-${String(number).padStart(4, '0')}.json`;
const bindingDigests = profile => ({ request: profile.requestDigest, history: profile.historyDigest, runtime: digest(profile.runtime) });
function validateBindingDigests(value) {
  closed(value, ['request', 'history', 'runtime']);
  if (Object.values(value).some(v => typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v))) fail('LEDGER_RECEIPT_MISMATCH');
}
function operation(entry, profile) {
  closed(entry, ['operationId', 'operation', 'purpose']); identifier(entry.operationId);
  if (typeof entry.operation !== 'string' || !Object.hasOwn(OFFLINE_OPERATIONS, entry.operation) ||
      OFFLINE_OPERATIONS[entry.operation].reservations !== 1 || entry.purpose !== (profile && entry.operation === 'semantic-f-a-direct' ? 'semantic-f-a' : purposes[entry.operation])) fail('LEDGER_OPERATION_INVALID');
}
function reservationBody(id, number, entry, first, size, profile) {
  return { version: 1, experimentId: id, number, operationId: entry.operationId, operation: entry.operation, purpose: entry.purpose,
    state: profile ? 'RESERVED_FIRST_FA_OPERATION' : 'RESERVED_OFFLINE_SIMULATION', batchFirstNumber: first, batchSize: size,
    ...(profile ? { scopeDigest: profile.scopeDigest, bindingDigests: profile.bindingDigests ?? bindingDigests(profile) } : {}) };
}
async function inspect(root, id, ownedLock, profile) {
  identity(id, profile); await rootSafety(root);
  const names = (await readdir(root)).sort();
  if (names.includes(LOCK) && !ownedLock) fail('LEDGER_LOCKED');
  if (ownedLock) {
    const stat = await lstat(join(root, LOCK));
    if (!privateFile(stat) || stat.ino !== ownedLock.ino || stat.dev !== ownedLock.dev) fail('LEDGER_LOCK_OWNERSHIP_BLOCKED');
  }
  if (!names.includes(ANCHOR)) fail('LEDGER_ANCHOR_MISSING');
  if (names.some(name => ![ANCHOR, LOCK, LEDGER].includes(name))) fail('LEDGER_INTEGRITY_BLOCKED');
  const observedAnchor = await readRecord(root, ANCHOR);
  closed(observedAnchor, Object.keys(anchor(id, profile)));
  if (JSON.stringify(observedAnchor) !== JSON.stringify(anchor(id, profile))) fail('LEDGER_ANCHOR_MISMATCH');
  const ledgerRoot = join(root, LEDGER);
  try { await rootSafety(ledgerRoot); }
  catch (cause) { if (cause.code === 'ENOENT') fail('LEDGER_TOTAL_LOSS'); throw cause; }
  const files = (await readdir(ledgerRoot)).sort();
  if (!files.length) fail('LEDGER_TOTAL_LOSS');
  if ((!files.includes(CHECKPOINT) || !files.includes(STATE)) &&
      files.every(name => [CHECKPOINT, STATE, TEMP].includes(name))) fail('LEDGER_INITIALIZATION_INCOMPLETE');
  const allowed = /^(ledger-checkpoint\.json|ledger-state\.json|reservation-000[1-4]\.json|receipt-000[1-4]\.json)$/;
  if (files.some(name => !allowed.test(name))) fail('LEDGER_INTEGRITY_BLOCKED');
  const cp = await readRecord(ledgerRoot, CHECKPOINT);
  closed(cp, Object.keys(checkpoint(id, profile)));
  if (JSON.stringify(cp) !== JSON.stringify(checkpoint(id, profile))) fail('LEDGER_CHECKPOINT_MISMATCH');
  if (observedAnchor.checkpointDigest !== digest(cp)) fail('LEDGER_ANCHOR_MISMATCH');
  const state = await readRecord(ledgerRoot, STATE);
  closed(state, ['version', 'experimentId', 'checkpointDigest', 'watermark', 'status']);
  if (state.version !== 1 || state.experimentId !== id || state.checkpointDigest !== digest(cp) ||
      !Number.isInteger(state.watermark) || state.watermark < 0 || state.watermark > OFFLINE_POLICY.maxReservations) fail('LEDGER_INTEGRITY_BLOCKED');
  const reservations = [], receipts = [], seen = new Set();
  if (files.filter(n => n.startsWith('reservation-')).length !== state.watermark) fail('LEDGER_INTEGRITY_BLOCKED');
  for (let number = 1; number <= state.watermark; number++) {
    const r = await readRecord(ledgerRoot, recordName('reservation', number));
    closed(r, ['version', 'experimentId', 'number', 'operationId', 'operation', 'purpose', 'state', 'batchFirstNumber', 'batchSize', 'reservationDigest', ...(profile ? ['scopeDigest', 'bindingDigests'] : [])]);
    operation({ operationId: r.operationId, operation: r.operation, purpose: r.purpose }, profile);
    if (profile && (typeof r.scopeDigest !== 'string' || !/^[a-f0-9]{64}$/.test(r.scopeDigest))) fail('LEDGER_INTEGRITY_BLOCKED');
    if (profile) validateBindingDigests(r.bindingDigests);
    const body = reservationBody(id, number, r, r.batchFirstNumber, r.batchSize, profile && { ...profile, scopeDigest: r.scopeDigest, bindingDigests: r.bindingDigests });
    if (r.version !== 1 || r.experimentId !== id || r.number !== number || r.state !== body.state || r.reservationDigest !== digest(body) ||
        !Number.isInteger(r.batchFirstNumber) || ![1, 2].includes(r.batchSize) || seen.has(r.operationId)) fail('LEDGER_INTEGRITY_BLOCKED');
    seen.add(r.operationId); reservations.push(r);
  }
  for (const r of reservations) {
    if (r.batchSize === 1) {
      if (r.batchFirstNumber !== r.number || r.operation.startsWith('semantic-f-b-')) fail('LEDGER_INTEGRITY_BLOCKED');
    } else {
      const [first, second] = reservations.slice(r.batchFirstNumber - 1, r.batchFirstNumber + 1);
      if (!first || !second || first.operation !== 'semantic-f-b-invocation-1' || second.operation !== 'semantic-f-b-invocation-2' ||
          first.batchFirstNumber !== r.batchFirstNumber || second.batchFirstNumber !== r.batchFirstNumber || first.batchSize !== 2 || second.batchSize !== 2 ||
          ![first.number, second.number].includes(r.number)) fail('LEDGER_INTEGRITY_BLOCKED');
    }
  }
  for (const name of files.filter(n => n.startsWith('receipt-'))) {
    const number = Number(name.slice(8, 12)), receipt = await readRecord(ledgerRoot, name), r = reservations[number - 1];
    validateReceipt(receipt, id, r, profile);
    if (receipt.reservationNumber !== number) fail('LEDGER_INTEGRITY_BLOCKED');
    receipts.push(receipt);
  }
  const expectedStatus = state.watermark < 4 ? 'OPEN_OFFLINE' : receipts.length === 4 ? 'CLOSED_OFFLINE' : 'EXHAUSTED_OFFLINE';
  if (state.status !== expectedStatus) fail('LEDGER_INTEGRITY_BLOCKED');
  // Readers never accept a mixed snapshot across a concurrent commit.
  if (JSON.stringify(await readRecord(ledgerRoot, STATE)) !== JSON.stringify(state) ||
      JSON.stringify(await readRecord(root, ANCHOR)) !== JSON.stringify(observedAnchor) ||
      JSON.stringify((await readdir(ledgerRoot)).sort()) !== JSON.stringify(files) ||
      JSON.stringify((await readdir(root)).sort()) !== JSON.stringify(names)) fail('LEDGER_INTEGRITY_BLOCKED');
  return freeze({ anchor: observedAnchor, checkpoint: cp, state, reservations, receipts, liveAuthorized: false, providerAuthority: 'NONE',
    usedReservations: state.watermark, remainingReservations: OFFLINE_POLICY.maxReservations - state.watermark,
    unresolvedReservations: reservations.filter(r => !receipts.some(c => c.reservationNumber === r.number)).map(r => r.number) });
}
function validateReceipt(receipt, id, reservation, profile) {
  closed(receipt, ['version', 'experimentId', 'reservationNumber', 'operationId', 'purpose', 'reservationDigest', 'outcome', 'providerContact', 'live',
    ...(profile ? ['scopeDigest', 'bindingDigests', 'transportObservation', 'executionMode', 'processStarted', 'childClosed', 'resultKind', 'responseDigest'] : [])]);
  if (!reservation || receipt.version !== 1 || receipt.experimentId !== id || receipt.reservationNumber !== reservation.number ||
      receipt.operationId !== reservation.operationId || receipt.purpose !== reservation.purpose || receipt.reservationDigest !== reservation.reservationDigest ||
      !outcomes.has(receipt.outcome)) fail('LEDGER_RECEIPT_MISMATCH');
  if (!profile) {
    if (receipt.providerContact !== false || receipt.live !== false) fail('LEDGER_RECEIPT_MISMATCH');
  } else if (receipt.scopeDigest !== reservation.scopeDigest || !['CONTROLLED_FAKE', 'OWNED_CLI_ATTEMPT'].includes(receipt.executionMode) ||
      typeof receipt.processStarted !== 'boolean' || typeof receipt.childClosed !== 'boolean' ||
      !['analysis-candidate', 'needs-evidence', 'none'].includes(receipt.resultKind) ||
      receipt.responseDigest !== null && (typeof receipt.responseDigest !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.responseDigest)) ||
      receipt.providerContact !== (receipt.executionMode === 'CONTROLLED_FAKE' ? false : 'UNKNOWN') ||
      receipt.live !== (receipt.executionMode === 'OWNED_CLI_ATTEMPT' && receipt.processStarted) ||
      receipt.outcome === 'success' && (!receipt.processStarted || !receipt.childClosed || receipt.resultKind !== 'analysis-candidate' || !receipt.responseDigest)) fail('LEDGER_RECEIPT_MISMATCH');
  if (profile) {
    validateBindingDigests(receipt.bindingDigests);
    if (JSON.stringify(receipt.bindingDigests) !== JSON.stringify(reservation.bindingDigests)) fail('LEDGER_RECEIPT_MISMATCH');
    const o = receipt.transportObservation;
    closed(o, ['requestBytes', 'responseBytes', 'contextId', 'requestedModel', 'observedModel', 'requestedEffort',
      'stdoutBytes', 'stderrBytes', 'events', 'latencyMs', 'inputTokens', 'outputTokens', 'errorCode']);
    for (const key of ['requestBytes', 'responseBytes', 'stdoutBytes', 'stderrBytes', 'events', 'inputTokens', 'outputTokens']) {
      if (o[key] !== null && (!Number.isSafeInteger(o[key]) || o[key] < 0)) fail('LEDGER_RECEIPT_MISMATCH');
    }
    if (o.requestBytes !== null && o.requestBytes > 65536 || o.responseBytes !== null && o.responseBytes > 65536 ||
        o.latencyMs !== null && (!Number.isFinite(o.latencyMs) || o.latencyMs < 0) ||
        o.requestedModel !== 'claude-opus-5-5' || o.observedModel !== null && o.observedModel !== o.requestedModel ||
        o.requestedEffort !== 'medium' || o.contextId !== null && (typeof o.contextId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(o.contextId)) ||
        o.errorCode !== null && (typeof o.errorCode !== 'string' || !/^[A-Z][A-Z_]{0,79}$/.test(o.errorCode))) fail('LEDGER_RECEIPT_MISMATCH');
  }
}

export async function initializeInertLedger(root, options, control) {
  closed(options, ['experimentId']); experiment(options.experimentId);
  return initializeLedger(root, options.experimentId, control);
}
async function initializeLedger(root, id, control, profile) {
  return withLock(root, id, control, async (test, lock) => {
    const names = (await readdir(root)).filter(n => n !== LOCK);
    if (names.length) return inspect(root, id, lock, profile); // Reopen, never reconstruct.
    const cp = checkpoint(id, profile);
    await exclusiveRecord(root, ANCHOR, anchor(id, profile));
    crash(test, 'after-anchor-fsync');
    const ledgerRoot = join(root, LEDGER);
    await mkdir(ledgerRoot, { mode: 0o700 }); // Exclusive; no recursive repair.
    await directorySync(ledgerRoot); await directorySync(root);
    crash(test, 'after-ledger-directory-fsync');
    await exclusiveRecord(ledgerRoot, CHECKPOINT, cp);
    crash(test, 'after-checkpoint-fsync');
    await writeState(ledgerRoot, { version: 1, experimentId: id, checkpointDigest: digest(cp), watermark: 0, status: 'OPEN_OFFLINE' }, test, true);
    return inspect(root, id, lock, profile);
  }, profile);
}
export async function inspectInertLedger(root, experimentId) {
  try { return await inspect(root, experimentId); }
  catch (cause) { throw normalize(cause); }
}
export async function reserveInertOperations(root, request, control) {
  return reserveOperations(root, request, control, false);
}
// Admission's durable F-A key is the operation, not a caller-selected ID.
// Keep the general synthetic API unchanged; only this narrow entry point adds
// the one-F-A-per-ledger invariant under the existing exclusive writer lock.
export async function reserveInertFirstFa(root, request, control) {
  return reserveOperations(root, request, control, true);
}
async function reserveOperations(root, request, control, firstFaOnly, profile) {
  closed(request, ['experimentId', 'operations']); identity(request.experimentId, profile);
  if (!Array.isArray(request.operations) || ![1, 2].includes(request.operations.length)) fail('LEDGER_OPERATIONS_INVALID');
  // Capture closed caller values before the first await; no aliasing during I/O.
  const operations = request.operations.map(entry => { operation(entry, profile); return { operationId: entry.operationId, operation: entry.operation, purpose: entry.purpose }; });
  if (firstFaOnly && (operations.length !== 1 || operations[0].operation !== 'semantic-f-a-direct' ||
      operations[0].operationId !== 'first-fa-direct')) fail('LEDGER_FIRST_FA_SCOPE_INVALID');
  if (new Set(operations.map(e => e.operationId)).size !== operations.length) fail('LEDGER_DUPLICATE_OPERATION_ID');
  const fb = operations.some(e => e.operation.startsWith('semantic-f-b-'));
  if (operations.length === 2 && !fb || fb && !(operations.length === 2 && operations[0].operation === 'semantic-f-b-invocation-1' && operations[1].operation === 'semantic-f-b-invocation-2')) fail('LEDGER_F_B_UPFRONT_REQUIRED');
  const id = request.experimentId;
  return withLock(root, id, control, async (test, lock) => {
    const current = await inspect(root, id, lock, profile);
    if (current.state.status === 'CLOSED_OFFLINE') fail('LEDGER_CLOSED');
    if (current.usedReservations + operations.length > OFFLINE_POLICY.maxReservations) fail('LEDGER_RESERVATION_LIMIT');
    if (firstFaOnly && current.reservations.some(r => r.operation === 'semantic-f-a-direct')) fail('LEDGER_FIRST_FA_ALREADY_RESERVED');
    if (operations.some(e => current.reservations.some(r => r.operationId === e.operationId))) fail('LEDGER_DUPLICATE_OPERATION_ID');
    const first = current.usedReservations + 1, created = [];
    for (const [offset, entry] of operations.entries()) {
      const body = reservationBody(id, first + offset, entry, first, operations.length, profile);
      const reservation = { ...body, reservationDigest: digest(body) };
      await exclusiveRecord(join(root, LEDGER), recordName('reservation', reservation.number), reservation);
      created.push(reservation);
      crash(test, 'after-reservation-fsync');
      if (fb && offset === 0) crash(test, 'after-fb-first-fsync');
    }
    const watermark = current.usedReservations + operations.length;
    await writeState(join(root, LEDGER), { ...current.state, watermark, status: watermark === 4 ? 'EXHAUSTED_OFFLINE' : 'OPEN_OFFLINE' }, test);
    return freeze(created);
  }, profile);
}
export async function writeInertReceipt(root, receipt, control) {
  experiment(receipt?.experimentId);
  return writeReceipt(root, receipt, control);
}
async function writeReceipt(root, receipt, control, profile) {
  closed(receipt, ['version', 'experimentId', 'reservationNumber', 'operationId', 'purpose', 'reservationDigest', 'outcome', 'providerContact', 'live',
    ...(profile ? ['scopeDigest', 'bindingDigests', 'transportObservation', 'executionMode', 'processStarted', 'childClosed', 'resultKind', 'responseDigest'] : [])]);
  let captured;
  try { captured = profile ? freeze(structuredClone(receipt)) : { ...receipt }; }
  catch { fail('LEDGER_RECEIPT_MISMATCH'); }
  return withLock(root, captured.experimentId, control, async (test, lock) => {
    const current = await inspect(root, captured.experimentId, lock, profile);
    validateReceipt(captured, captured.experimentId, current.reservations[captured.reservationNumber - 1], profile);
    if (current.receipts.some(r => r.reservationNumber === captured.reservationNumber)) fail('LEDGER_RECEIPT_ALREADY_EXISTS');
    await exclusiveRecord(join(root, LEDGER), recordName('receipt', captured.reservationNumber), captured);
    if (current.usedReservations === 4 && current.receipts.length === 3) await writeState(join(root, LEDGER), { ...current.state, status: 'CLOSED_OFFLINE' }, test);
    return freeze(captured);
  }, profile);
}

// Private harness infrastructure seam. The closure must be owned by admission,
// not supplied by a semantic request. Every method obtains the same opaque,
// consumed admission's captured binding before I/O. Files/IDs/digests grant
// nothing. As with injected transport, malicious same-process code is not a
// security boundary. Public inert APIs above still reject real IDs before I/O.
export function createFirstFaLedgerFacade(assertAdmission, controls = {}) {
  if (typeof assertAdmission !== 'function') fail('LEDGER_ADMISSION_REQUIRED');
  if (Object.keys(controls).some(k => !['initialize', 'reserve', 'receipt'].includes(k))) fail('LEDGER_TEST_CONTROL_INVALID');
  const binding = () => {
    const scope = assertAdmission();
    validateAdmittedFirstFaSession(scope);
    if (Object.keys(controls).length && scope.experimentId === OFFLINE_POLICY.proposedExperimentId) fail('LEDGER_TEST_CONTROL_INVALID');
    if (!scope || !Object.isFrozen(scope) || typeof scope.scopeDigest !== 'string' || !/^[a-f0-9]{64}$/.test(scope.scopeDigest)) fail('LEDGER_ADMISSION_REQUIRED');
    if (scope.experimentId !== OFFLINE_POLICY.proposedExperimentId) experiment(scope.experimentId);
    if (scope.candidateId !== OFFLINE_POLICY.proposedExperimentId) fail('LEDGER_ADMISSION_MISMATCH');
    return scope;
  };
  const invoke = (root, id, work) => {
    const scope = binding();
    if (scope.root !== root || scope.experimentId !== id) fail('LEDGER_ADMISSION_MISMATCH');
    return work(scope);
  };
  return Object.freeze({
    initialize: (root, id) => invoke(root, id, p => initializeLedger(root, id, controls.initialize, p)),
    inspect: (root, id) => invoke(root, id, async p => { try { return await inspect(root, id, undefined, p); } catch (e) { throw normalize(e); } }),
    reserve: (root, request) => invoke(root, request?.experimentId, p => reserveOperations(root, request, controls.reserve, true, p)),
    receipt: (root, receipt) => invoke(root, receipt?.experimentId, p => {
      if (receipt.scopeDigest !== p.scopeDigest) fail('LEDGER_ADMISSION_MISMATCH');
      return writeReceipt(root, receipt, controls.receipt, p);
    })
  });
}
