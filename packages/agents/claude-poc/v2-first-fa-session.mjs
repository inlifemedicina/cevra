// Private host harness, inert on import. No Desktop/UI command or auto-run.
// Concrete local consent, operational ledger and closed runtime are composed
// here; tests replace only human I/O, file verification and child process seams.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { lstat, realpath, mkdtemp, rmdir } from 'node:fs/promises';
import { isAbsolute, normalize, join } from 'node:path';
import { createFirstFaSessionAdmissionController } from './v2-first-fa-admission.mjs';
import { createFirstFaLedgerFacade, assertInertExperimentId } from './v2-inert-ledger.mjs';
import { FIRST_FA_POLICY, describeFirstFaCandidate, evaluateFirstFa } from './v2-first-fa-offline.mjs';
import { CLAUDE_VERSION, CLAUDE_SHA256, childArguments, verifyBinary } from './transport.mjs';
import { createSessionPluginSettings } from './session-plugin-override.mjs';

const fail = code => { throw Object.assign(new Error(code), { code }); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clockDefault = { now: () => performance.now(), setTimeout, clearTimeout };
const sessions = new WeakMap();
const freeze = value => {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
};
function record(value, keys, code = 'FIRST_FA_SCOPE_INVALID') {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) fail(code);
  const copy = {};
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !Object.hasOwn(d, 'value')) fail(code);
    copy[key] = d.value;
  }
  return copy;
}
function path(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value) ||
      !isAbsolute(value) || normalize(value) !== value) fail('FIRST_FA_PATH_INVALID');
  return value;
}
function copyRequest(value, depth = 0) {
  if (depth > 12) fail('FIRST_FA_REQUEST_INVALID');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || ![Object.prototype, Array.prototype].includes(Object.getPrototypeOf(value))) fail('FIRST_FA_REQUEST_INVALID');
  const out = Array.isArray(value) ? [] : {};
  for (const key of Object.keys(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') fail('FIRST_FA_REQUEST_INVALID');
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !Object.hasOwn(d, 'value')) fail('FIRST_FA_REQUEST_INVALID');
    // Known undefined optionals remain absent, consistent with Application.
    if (d.value !== undefined) out[key] = copyRequest(d.value, depth + 1);
  }
  return out;
}
async function directory(pathValue, exactPrivate = false) {
  const stat = await lstat(pathValue);
  if (!stat.isDirectory() || stat.isSymbolicLink() || typeof process.getuid === 'function' && stat.uid !== process.getuid() ||
      exactPrivate && (stat.mode & 0o777) !== 0o700 || await realpath(pathValue) !== pathValue) fail('FIRST_FA_PATH_INVALID');
}

// Only the named explicit scope is shown, locally, not in provider input or
// public diagnostics. No --yes/env/file/piped grant is accepted. EOF/close,
// abort and all non-exact answers deny. The ephemeral closure grants once and
// is expired by the entrypoint even on initialization/transport failure.
export async function acquireLocalFirstFaConsent(scope, { input = process.stdin, output = process.stdout } = {}, signal) {
  validateCapturedFirstFaSession(scope);
  if (input?.isTTY !== true || output?.isTTY !== true) fail('LOCAL_CONSENT_TTY_REQUIRED');
  if (signal?.aborted) fail('CANCELLED');
  let terminal;
  try {
    terminal = createInterface({ input, output, terminal: false });
    let cleanup;
    const answer = await new Promise((resolve, reject) => {
      const denied = () => reject(Object.assign(new Error('LOCAL_CONSENT_DENIED'), { code: 'LOCAL_CONSENT_DENIED' }));
      const aborted = () => reject(Object.assign(new Error('CANCELLED'), { code: 'CANCELLED' }));
      cleanup = () => { terminal.off('close', denied); input.off('error', denied); signal?.removeEventListener('abort', aborted); };
      terminal.once('close', denied); input.once('error', denied); signal?.addEventListener('abort', aborted, { once: true });
      terminal.once('line', resolve);
      // Digest is binding/audit only, never authority. Human must affirm this
      // immutable request, not a reusable account credential or ledger grant.
      const portuguese = sessions.get(scope).locale === 'pt-BR';
      const title = portuguese ? 'CEVRA: somente a primeira F-A privada' : 'CEVRA private first F-A only';
      const warning = portuguese ? 'Garantias remotas de tokens/custo NÃO COMPROVADAS; sem repetição/fallback.' :
        'Remote token/cost guarantees NOT PROVEN; no retry/fallback.';
      const instruction = portuguese ? 'Digite exatamente' : 'Type exactly';
      output.write(`${title}\n${JSON.stringify(scope)}\n${warning}\n${instruction} CONFIRM ${scope.scopeDigest}: `);
      if (signal?.aborted) aborted();
    }).finally(() => cleanup?.());
    if (answer !== `CONFIRM ${scope.scopeDigest}`) fail('LOCAL_CONSENT_DENIED');
  } catch (e) {
    if (['LOCAL_CONSENT_DENIED', 'CANCELLED'].includes(e?.code)) throw e;
    fail('LOCAL_CONSENT_FAILED');
  } finally { terminal?.close(); }
  let active = true;
  return Object.freeze({ issue(value) { if (!active || value !== scope) return undefined; active = false; return scope; },
    close() { active = false; } });
}

// This capture runs synchronously BEFORE consent/await. WeakMap associates
// immutable scope with host-owned history/request/dependencies, not a file or
// a model-supplied context. Plain reconstructions cannot enter admission.
function capture(input, dependencies) {
  const v = record(input, ['candidateId', 'operation', 'experimentId', 'root', 'policy', 'runtime', 'history', 'request', 'signal']);
  describeFirstFaCandidate(v.candidateId);
  if (v.operation !== 'semantic-f-a-direct') fail('FIRST_FA_OPERATION_FORBIDDEN');
  if (v.policy !== FIRST_FA_POLICY) fail('FIRST_FA_POLICY_MISMATCH');
  const mode = dependencies.fakeSpawn ? 'CONTROLLED_FAKE' : 'OWNED_CLI_ATTEMPT';
  if (mode === 'CONTROLLED_FAKE') assertInertExperimentId(v.experimentId);
  else if (v.experimentId !== FIRST_FA_POLICY.candidateId) fail('CANDIDATE_ID_MISMATCH');
  if (mode === 'OWNED_CLI_ATTEMPT' && (process.platform !== 'darwin' || process.arch !== 'arm64')) fail('PLATFORM_UNSUPPORTED');
  const runtime = record(v.runtime, ['binary', 'home', 'scratchParent', 'pluginOverrideReceipt', 'version', 'sha256', 'provider', 'route', 'model', 'effort']);
  for (const key of ['binary', 'home', 'scratchParent', 'pluginOverrideReceipt']) runtime[key] = path(runtime[key]);
  if (runtime.version !== CLAUDE_VERSION || runtime.sha256 !== CLAUDE_SHA256) fail('VERSION_DRIFT');
  if (runtime.provider !== 'claude-cli' || runtime.route !== 'first-party-subscription') fail('ROUTE_PROVIDER_MISMATCH');
  if (runtime.model !== FIRST_FA_POLICY.expectedModel || runtime.effort !== FIRST_FA_POLICY.requestedEffort) fail('MODEL_MISMATCH');
  const request = freeze(copyRequest(v.request));
  if (Buffer.byteLength(JSON.stringify(request)) > FIRST_FA_POLICY.applicationBytes.initialEnvelope) fail('INPUT_LIMIT');
  if (!v.history || typeof v.history.toArchive !== 'function') fail('FIRST_FA_HISTORY_INVALID');
  const archive = v.history.toArchive();
  const locale = request.locale ?? archive.snapshots.find(s => s.id === archive.cursorSnapshotId)?.project.project.defaultLocale;
  if (locale !== 'pt-BR' && locale !== 'en-US') fail('FIRST_FA_REQUEST_INVALID');
  const binding = { candidateId: v.candidateId, operation: v.operation, experimentId: v.experimentId,
    root: path(v.root), policy: FIRST_FA_POLICY, runtime: freeze(runtime), mode,
    requestDigest: digest(request), historyDigest: digest(archive) };
  // A scoped human disclosure attestation, not an automatic content classifier
  // or account entitlement. Future review must approve these exact fixture
  // digests. Neither this declaration nor its serialized copy grants authority.
  binding.fixtureAuthorization = freeze({ disclosure: 'DECLARED_SYNTHETIC_TEXT_ONLY', mediaUpload: false,
    requestDigest: binding.requestDigest, historyDigest: binding.historyDigest });
  const scope = freeze({ ...binding, scopeDigest: digest(binding) });
  sessions.set(scope, { history: v.history, request, locale, sourceRequest: v.request, sourceInput: input, signal: v.signal, dependencies });
  return scope;
}
export function validateCapturedFirstFaSession(scope) {
  if (!sessions.has(scope)) fail('AUTHORIZATION_SCOPE_INVALID');
  return scope;
}
export function validateAdmittedFirstFaSession(scope) {
  const state = sessions.get(scope);
  if (!state?.assertAdmission || state.assertAdmission() !== scope) fail('LEDGER_ADMISSION_REQUIRED');
  return scope;
}

function checkBinding(scope) {
  const state = sessions.get(validateCapturedFirstFaSession(scope));
  const current = record(state.sourceInput, ['candidateId', 'operation', 'experimentId', 'root', 'policy', 'runtime', 'history', 'request', 'signal']);
  if (current.candidateId !== scope.candidateId || current.operation !== scope.operation || current.experimentId !== scope.experimentId ||
      current.root !== scope.root || current.policy !== scope.policy || current.history !== state.history ||
      current.request !== state.sourceRequest || current.signal !== state.signal ||
      digest(record(current.runtime, Object.keys(scope.runtime))) !== digest(scope.runtime)) fail('FIRST_FA_BINDING_STALE');
  if (digest(copyRequest(state.sourceRequest)) !== scope.requestDigest ||
      digest(state.history.toArchive()) !== scope.historyDigest) fail('FIRST_FA_BINDING_STALE');
}

export async function evaluateCapturedFirstFaSession(scope, { deadline, clock, assertAdmission }) {
  validateCapturedFirstFaSession(scope);
  if (assertAdmission() !== scope) fail('LIVE_AUTHORIZATION_MISSING');
  const state = sessions.get(scope), { dependencies } = state;
  state.assertAdmission = assertAdmission;
  const runtime = scope.runtime;
  // Accounting a failed/stale attempt does not require current History to
  // equal its entry binding; it still requires the consumed opaque admission.
  // Acceptance/pre-contact guards below retain the strict current-state check.
  const ledger = createFirstFaLedgerFacade(() => { assertAdmission(); return scope; }, dependencies.ledgerControl);
  let cwd, settings;
  const verifyFile = dependencies.verifyBinary ?? verifyBinary;
  const verify = async binary => {
    try { await verifyFile(binary); }
    catch (e) { fail(['VERSION_DRIFT', 'BINARY_PATH'].includes(e?.code) ? e.code : 'FIRST_FA_RUNTIME_UNAVAILABLE'); }
  };
  const execution = {
    mode: scope.mode, scopeDigest: scope.scopeDigest,
    bindingDigests: Object.freeze({ request: scope.requestDigest, history: scope.historyDigest, runtime: digest(scope.runtime) }),
    checkBinding: () => checkBinding(scope),
    spawn: dependencies.fakeSpawn ?? spawn,
    async prepare(guard) {
      // Local pin verification is not help/auth/inference. All runtime I/O is
      // after consumed admission and under the same entry-to-accept deadline.
      try {
        await directory(scope.root, true); guard();
        await directory(runtime.home); guard();
        await directory(runtime.scratchParent, true); guard();
        await verify(runtime.binary); guard();
        cwd = await mkdtemp(join(runtime.scratchParent, 'cevra-first-fa-')); guard();
        settings = await createSessionPluginSettings(cwd, runtime.pluginOverrideReceipt); guard();
        childArguments('validation-only', settings.path, runtime.model); guard();
      } catch (e) {
        const allowed = ['FIRST_FA_PATH_INVALID', 'VERSION_DRIFT', 'BINARY_PATH', 'FIRST_FA_RUNTIME_UNAVAILABLE',
          'INVALID_PRIVATE_PLUGIN_RECEIPT', 'FIRST_FA_BINDING_STALE', 'TIMEOUT', 'CANCELLED'];
        fail(allowed.includes(e?.code) ? e.code : 'FIRST_FA_RUNTIME_UNAVAILABLE');
      }
    },
    verify: () => verify(runtime.binary),
    transportOptions: () => ({ binary: runtime.binary, home: runtime.home, cwd,
      settingsPath: settings.path }),
    async cleanup() {
      try { if (settings) await settings.cleanup(); }
      finally { if (cwd) await rmdir(cwd); } // No recursive deletion of client files.
    }
  };
  return evaluateFirstFa({ root: scope.root, experimentId: scope.experimentId, history: state.history,
    request: state.request, signal: state.signal, clock, admissionDeadline: deadline, ledgerAdapter: ledger, execution });
}

// Actual private entrypoint. No executable auto-run, default root, discovery,
// grant loading, --yes or inherited billing environment. Ordinary callers
// need exact local human consent per invocation. Tests use synthetic IDs only.
export async function runPrivateFirstFa(input, dependencies = {}) {
  if (Object.keys(dependencies).some(k => !['consentIO', 'fakeSpawn', 'verifyBinary', 'clock', 'ledgerControl'].includes(k)) ||
      dependencies.fakeSpawn !== undefined && typeof dependencies.fakeSpawn !== 'function' ||
      dependencies.verifyBinary !== undefined && typeof dependencies.verifyBinary !== 'function') fail('FIRST_FA_DEPENDENCIES_INVALID');
  if (dependencies.ledgerControl !== undefined && !dependencies.fakeSpawn) fail('FIRST_FA_DEPENDENCIES_INVALID');
  const sourceClock = dependencies.clock ?? clockDefault;
  const deps = Object.freeze({ ...dependencies, clock: Object.freeze({ now: sourceClock.now.bind(sourceClock),
    setTimeout: sourceClock.setTimeout.bind(sourceClock), clearTimeout: sourceClock.clearTimeout.bind(sourceClock) }) });
  const scope = capture(input, deps);
  // Canonical root check is read-only. Denial still performs zero ledger writes.
  try { await directory(scope.root, true); } catch { fail('FIRST_FA_PATH_INVALID'); }
  checkBinding(scope);
  const consent = await acquireLocalFirstFaConsent(scope, deps.consentIO, input.signal);
  const admissionDeadline = deps.clock.now() + FIRST_FA_POLICY.totalDeadlineMs;
  try {
    checkBinding(scope);
    const controller = createFirstFaSessionAdmissionController({ authorizationIssuer: consent.issue });
    const capability = controller.issueFirstFaCapability(scope);
    const result = await controller.runFirstFaWithAdmission({ scope, capability, clock: deps.clock, admissionDeadline });
    checkBinding(scope);
    if (input.signal?.aborted) fail('CANCELLED');
    if (deps.clock.now() >= admissionDeadline) fail('TIMEOUT');
    return result; // No await between last guard and return.
  } finally { consent.close(); }
}
