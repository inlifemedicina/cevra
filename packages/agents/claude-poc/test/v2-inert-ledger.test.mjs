import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, chmod, lstat, readFile, writeFile, readdir, realpath, rm, symlink, unlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import * as ledger from '../v2-inert-ledger.mjs';
import { OFFLINE_POLICY } from '../v2-offline-experiment-plan.mjs';

const ID = 'synthetic-semantic-v2-ledger-fixture';
const CP = 'ledger-checkpoint.json', STATE = 'ledger-state.json';
const ANCHOR = '.cevra-v2-ledger-anchor.json', LOCK = '.cevra-v2-ledger.lock';
const pathFor = (root, file) => join(root, ...([ANCHOR, LOCK].includes(file) ? [file] : ['ledger', file]));
const entries = root => readdir(join(root, 'ledger'));
const { initializeInertLedger: initialize, inspectInertLedger: inspect,
  reserveInertOperations: reserve, writeInertReceipt: receipt } = ledger;
const code = expected => cause => cause?.code === expected && cause.message === expected;
const name = (prefix, number) => `${prefix}-${String(number).padStart(4, '0')}.json`;
const fa = operationId => ({ operationId, operation: 'semantic-f-a-direct', purpose: 'offline-semantic-f-a' });
const fb = () => [1, 2].map(n => ({ operationId: `fb-${n}`, operation: `semantic-f-b-invocation-${n}`, purpose: 'offline-semantic-f-b' }));
const request = operations => ({ experimentId: ID, operations });
const record = (r, outcome = 'success') => ({ version: 1, experimentId: ID, reservationNumber: r.number,
  operationId: r.operationId, purpose: r.purpose, reservationDigest: r.reservationDigest, outcome, providerContact: false, live: false });
async function fixture(t, initialized = true) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'cevra-v2-inert-ledger-'));
  await chmod(root, 0o700);
  // This exact mkdtemp-owned synthetic root is the only recursive cleanup target.
  t.after(() => rm(root, { recursive: true, force: true }));
  if (initialized) await initialize(root, { experimentId: ID });
  return root;
}
const read = async (root, file) => JSON.parse(await readFile(pathFor(root, file), 'utf8'));
const replace = (root, file, value) => writeFile(pathFor(root, file), JSON.stringify(value), { mode: 0o600 });

test('inert ledger initialize/reopen preserves checkpoint, policy and private files', async t => {
  const root = await fixture(t);
  const first = await inspect(root, ID);
  assert.equal(first.checkpoint.state, 'OFFLINE_INERT_LEDGER');
  assert.equal(first.checkpoint.maximumReservations, 4);
  assert.equal(first.checkpoint.liveAuthorized, false);
  assert.equal(first.providerAuthority, 'NONE');
  assert.equal(first.checkpoint.policyDigest, createHash('sha256').update(JSON.stringify(OFFLINE_POLICY)).digest('hex'));
  assert.deepEqual(first, await initialize(root, { experimentId: ID }));
  assert.equal(first.usedReservations, 0); assert.equal(first.remainingReservations, 4);
  for (const file of [ANCHOR, CP, STATE]) assert.equal((await lstat(pathFor(root, file))).mode & 0o777, 0o600);
  assert.equal((await lstat(root)).mode & 0o777, 0o700);
  assert.equal((await lstat(join(root, 'ledger'))).mode & 0o777, 0o700);
  assert.deepEqual((await readdir(root)).sort(), [ANCHOR, 'ledger']);
  assert.deepEqual(first.anchor, { version: 1, experimentId: ID, state: 'OFFLINE_INERT_LEDGER_ANCHOR',
    everInitialized: true, checkpointDigest: first.state.checkpointDigest, providerAuthority: false,
    liveAuthorized: false, quotaAuthority: 'NONE', grantedReservations: 0 });
  assert(Object.isFrozen(first)); assert(Object.isFrozen(first.state));
});

test('inert ledger forbids real proposed ID and V1 ID before any persistence', async t => {
  const root = await fixture(t, false);
  for (const [id, expected] of [[OFFLINE_POLICY.proposedExperimentId, 'REAL_EXPERIMENT_ID_FORBIDDEN_OFFLINE'],
    [OFFLINE_POLICY.historicalExperiment, 'HISTORICAL_EXPERIMENT_CLOSED']]) {
    await assert.rejects(initialize(root, { experimentId: id }), code(expected));
    await assert.rejects(inspect(root, id), code(expected));
    await assert.rejects(reserve(root, { experimentId: id, operations: [fa('first')] }), code(expected));
    await assert.rejects(receipt(root, { experimentId: id }), code(expected));
  }
  assert.deepEqual(await readdir(root), []);
});

test('inert ledger rejects non-synthetic IDs, relative/missing roots and symlinks', async t => {
  const root = await fixture(t, false);
  for (const id of ['', ['synthetic-semantic-v2-ledger-fixture'], 'synthetic-semantic-v2-ledger-../outside', 'private-id']) {
    await assert.rejects(initialize(root, { experimentId: id }), code('SYNTHETIC_EXPERIMENT_ID_REQUIRED'));
  }
  await assert.rejects(inspect('.', ID), code('LEDGER_ROOT_UNSAFE'));
  await assert.rejects(inspect(join(root, 'absent'), ID), code('LEDGER_INTEGRITY_BLOCKED'));
  await symlink(root, join(root, 'link'));
  await assert.rejects(inspect(join(root, 'link'), ID), code('LEDGER_ROOT_UNSAFE'));
  await chmod(root, 0o755);
  await assert.rejects(initialize(root, { experimentId: ID }), code('LEDGER_ROOT_UNSAFE'));
});

test('inert ledger reservation persists unresolved and cannot be reset by reopen', async t => {
  const root = await fixture(t);
  const before = await readFile(pathFor(root, CP), 'utf8');
  const [r] = await reserve(root, request([fa('first')]));
  assert.equal(r.number, 1); assert.equal(r.state, 'RESERVED_OFFLINE_SIMULATION');
  assert.equal((await lstat(pathFor(root, name('reservation', 1)))).mode & 0o777, 0o600);
  const reopened = await initialize(root, { experimentId: ID });
  assert.equal(reopened.usedReservations, 1); assert.equal(reopened.remainingReservations, 3);
  assert.deepEqual(reopened.unresolvedReservations, [1]);
  assert.equal(await readFile(pathFor(root, CP), 'utf8'), before);
});

test('inert ledger failure/cancel/crash receipts never refund a reservation', async t => {
  const root = await fixture(t);
  for (const [i, outcome] of ['failure', 'cancelled', 'crash-uncertain'].entries()) {
    const [r] = await reserve(root, request([fa(`operation-${i}`)]));
    await receipt(root, record(r, outcome));
    const current = await inspect(root, ID);
    assert.equal(current.usedReservations, i + 1);
    assert.equal(current.remainingReservations, 3 - i);
    assert.deepEqual(current.unresolvedReservations, []);
  }
});

test('inert ledger max4, fifth blocked before file creation; terminal closure sticky', async t => {
  const root = await fixture(t), reservations = [];
  for (let n = 1; n <= 4; n++) reservations.push(...await reserve(root, request([fa(`op-${n}`)])));
  const before = (await entries(root)).sort();
  await assert.rejects(reserve(root, request([fa('fifth')])), code('LEDGER_RESERVATION_LIMIT'));
  assert.deepEqual((await entries(root)).sort(), before);
  assert.equal((await inspect(root, ID)).state.status, 'EXHAUSTED_OFFLINE');
  for (const r of reservations) await receipt(root, record(r));
  assert.equal((await inspect(root, ID)).state.status, 'CLOSED_OFFLINE');
  assert.equal((await initialize(root, { experimentId: ID })).remainingReservations, 0);
  await assert.rejects(reserve(root, request([fa('after-close')])), code('LEDGER_CLOSED'));
});

test('inert ledger rejects duplicate operationId, unenumerated operations and extra fields', async t => {
  const root = await fixture(t);
  await reserve(root, request([fa('same')]));
  await assert.rejects(reserve(root, request([fa('same')])), code('LEDGER_DUPLICATE_OPERATION_ID'));
  await assert.rejects(reserve(root, request([{ ...fa('new'), operation: 'unlisted' }])), code('LEDGER_OPERATION_INVALID'));
  await assert.rejects(reserve(root, request([{ operationId: 'local', operation: 'local-offline-check', purpose: 'offline-preflight' }])), code('LEDGER_OPERATION_INVALID'));
  await assert.rejects(reserve(root, { ...request([fa('new')]), retries: 1 }), code('LEDGER_SCHEMA_INVALID'));
  await assert.rejects(initialize(root, { experimentId: ID, maximumReservations: 8 }), code('LEDGER_SCHEMA_INVALID'));
  assert.equal((await inspect(root, ID)).usedReservations, 1);
});

test('inert ledger F-B requires and commits two sequential slots upfront under one lock', async t => {
  const root = await fixture(t);
  await assert.rejects(reserve(root, request([fb()[0]])), code('LEDGER_F_B_UPFRONT_REQUIRED'));
  await assert.rejects(reserve(root, request(fb().reverse())), code('LEDGER_F_B_UPFRONT_REQUIRED'));
  const allocated = await reserve(root, request(fb()));
  assert.deepEqual(allocated.map(r => r.number), [1, 2]);
  assert(allocated.every(r => r.batchFirstNumber === 1 && r.batchSize === 2));
  await receipt(root, record(allocated[0], 'failure'));
  const view = await inspect(root, ID);
  assert.equal(view.usedReservations, 2); assert.equal(view.remainingReservations, 2);
  assert.deepEqual(view.unresolvedReservations, [2]);
});

test('inert ledger F-B with one slot remaining blocks without partial allocation', async t => {
  const root = await fixture(t);
  for (let n = 1; n <= 3; n++) await reserve(root, request([fa(`op-${n}`)]));
  const before = (await entries(root)).sort();
  await assert.rejects(reserve(root, request(fb())), code('LEDGER_RESERVATION_LIMIT'));
  assert.deepEqual((await entries(root)).sort(), before);
  assert.equal((await inspect(root, ID)).usedReservations, 3);
});

test('inert ledger receipts bind exactly, stay exclusive, and forbid provider/live/raw fields', async t => {
  const root = await fixture(t), [r] = await reserve(root, request([fa('first')]));
  await assert.rejects(receipt(root, { ...record(r), reservationNumber: 2 }), code('LEDGER_RECEIPT_MISMATCH'));
  for (const change of [{ reservationDigest: 'wrong' }, { operationId: 'wrong' }, { purpose: 'wrong' }, { live: true }, { providerContact: true }, { outcome: 'refund' }]) {
    await assert.rejects(receipt(root, { ...record(r), ...change }), code('LEDGER_RECEIPT_MISMATCH'));
  }
  await assert.rejects(receipt(root, { ...record(r), prompt: 'not permitted' }), code('LEDGER_SCHEMA_INVALID'));
  const accepted = await receipt(root, record(r));
  assert(Object.isFrozen(accepted));
  assert.equal((await lstat(pathFor(root, name('receipt', 1)))).mode & 0o777, 0o600);
  const before = await readFile(pathFor(root, name('receipt', 1)), 'utf8');
  await assert.rejects(receipt(root, record(r, 'failure')), code('LEDGER_RECEIPT_ALREADY_EXISTS'));
  assert.equal(await readFile(pathFor(root, name('receipt', 1)), 'utf8'), before);
});

test('inert ledger orphan receipt and persisted receipt mismatch fail on inspection', async t => {
  for (const orphan of [true, false]) await t.test(orphan ? 'orphan' : 'mismatch', async sub => {
    const root = await fixture(sub), [r] = await reserve(root, request([fa('first')]));
    await replace(root, name('receipt', orphan ? 2 : 1), { ...record(r), operationId: 'foreign-operation' });
    await assert.rejects(inspect(root, ID), code('LEDGER_RECEIPT_MISMATCH'));
  });
});

test('inert ledger missing checkpoint/state never reconstructs or initializes zero', async t => {
  for (const file of [CP, STATE]) await t.test(file, async sub => {
    const root = await fixture(sub);
    await reserve(root, request([fa('first')]));
    await unlink(pathFor(root, file));
    const before = (await entries(root)).sort();
    await assert.rejects(inspect(root, ID), code('LEDGER_INTEGRITY_BLOCKED'));
    await assert.rejects(initialize(root, { experimentId: ID }), code('LEDGER_INTEGRITY_BLOCKED'));
    assert.deepEqual((await entries(root)).sort(), before);
  });
  const empty = await fixture(t, false);
  await assert.rejects(inspect(empty, ID), code('LEDGER_ANCHOR_MISSING'));
  assert.deepEqual(await readdir(empty), []);
});

test('inert ledger total record loss cannot restore quota through initialization', async t => {
  const root = await fixture(t);
  await reserve(root, request([fa('first')]));
  // Remove all this fixture's ledger records, preserving parent and anchor.
  const beforeAnchor = await readFile(pathFor(root, ANCHOR), 'utf8');
  for (const file of await entries(root)) await unlink(pathFor(root, file));
  await assert.rejects(inspect(root, ID), code('LEDGER_TOTAL_LOSS'));
  await assert.rejects(initialize(root, { experimentId: ID }), code('LEDGER_TOTAL_LOSS'));
  await assert.rejects(reserve(root, request([fa('reset')])), code('LEDGER_TOTAL_LOSS'));
  assert.deepEqual(await entries(root), []);
  assert.equal(await readFile(pathFor(root, ANCHOR), 'utf8'), beforeAnchor);
});

test('inert ledger removed or recreated-empty directory never bootstraps while anchor survives', async t => {
  for (const recreate of [false, true]) await t.test(recreate ? 'recreated-empty' : 'removed', async sub => {
    const root = await fixture(sub);
    await reserve(root, request([fa('first')]));
    const before = await readFile(pathFor(root, ANCHOR), 'utf8');
    await rm(join(root, 'ledger'), { recursive: true }); // Exact fixture-owned child.
    if (recreate) await mkdir(join(root, 'ledger'), { mode: 0o700 });
    for (const call of [() => inspect(root, ID), () => initialize(root, { experimentId: ID }),
      () => reserve(root, request([fa('reset')]))]) await assert.rejects(call(), code('LEDGER_TOTAL_LOSS'));
    assert.equal(await readFile(pathFor(root, ANCHOR), 'utf8'), before);
    if (recreate) assert.deepEqual(await entries(root), []);
    else await assert.rejects(lstat(join(root, 'ledger')), { code: 'ENOENT' });
    assert.deepEqual((await readdir(root)).sort(), recreate ? [ANCHOR, 'ledger'] : [ANCHOR]);
  });
});

test('inert ledger missing anchor with existing records never becomes a fresh parent', async t => {
  const root = await fixture(t);
  await reserve(root, request([fa('first')]));
  await unlink(pathFor(root, ANCHOR));
  const before = await entries(root);
  for (const call of [() => inspect(root, ID), () => initialize(root, { experimentId: ID }),
    () => reserve(root, request([fa('reset')]))]) await assert.rejects(call(), code('LEDGER_ANCHOR_MISSING'));
  assert.deepEqual(await entries(root), before);
  assert.deepEqual(await readdir(root), ['ledger']);
});

test('inert ledger corrupt, foreign, digest-incompatible and quota-granting anchors fail closed', async t => {
  for (const fault of ['truncated', 'foreign', 'digest', 'grant', 'extra', 'oversized']) await t.test(fault, async sub => {
    const root = await fixture(sub), a = await read(root, ANCHOR);
    if (fault === 'truncated') await writeFile(pathFor(root, ANCHOR), '{', { mode: 0o600 });
    if (fault === 'foreign') await replace(root, ANCHOR, { ...a, experimentId: 'synthetic-semantic-v2-ledger-other' });
    if (fault === 'digest') await replace(root, ANCHOR, { ...a, checkpointDigest: 'f'.repeat(64) });
    if (fault === 'grant') await replace(root, ANCHOR, { ...a, grantedReservations: 4 });
    if (fault === 'extra') await replace(root, ANCHOR, { ...a, privateField: 'do-not-expose' });
    if (fault === 'oversized') await writeFile(pathFor(root, ANCHOR), 'x'.repeat(16385), { mode: 0o600 });
    const expected = fault === 'truncated' ? 'LEDGER_INTEGRITY_BLOCKED' : fault === 'extra' ? 'LEDGER_SCHEMA_INVALID' :
      fault === 'oversized' ? 'LEDGER_FILE_UNSAFE' : 'LEDGER_ANCHOR_MISMATCH';
    const before = await readFile(pathFor(root, ANCHOR), 'utf8');
    await assert.rejects(inspect(root, ID), code(expected));
    await assert.rejects(initialize(root, { experimentId: ID }), code(expected));
    assert.equal(await readFile(pathFor(root, ANCHOR), 'utf8'), before);
    assert.equal((await read(root, STATE)).watermark, 0);
  });
});

test('inert ledger anchor symlink or unsafe mode is preserved, never overwritten', async t => {
  const root = await fixture(t);
  await chmod(pathFor(root, ANCHOR), 0o644);
  await assert.rejects(inspect(root, ID), code('LEDGER_FILE_UNSAFE'));
  await assert.rejects(initialize(root, { experimentId: ID }), code('LEDGER_FILE_UNSAFE'));
  assert.equal((await lstat(pathFor(root, ANCHOR))).mode & 0o777, 0o644);
  await chmod(pathFor(root, ANCHOR), 0o600);
  const foreign = await fixture(t, false), target = join(foreign, 'foreign-anchor.json');
  await writeFile(target, 'private fixture: never overwrite', { mode: 0o600 });
  await unlink(pathFor(root, ANCHOR)); await symlink(target, pathFor(root, ANCHOR));
  await assert.rejects(inspect(root, ID), code('LEDGER_FILE_UNSAFE'));
  await assert.rejects(initialize(root, { experimentId: ID }), code('LEDGER_FILE_UNSAFE'));
  assert.equal(await readFile(target, 'utf8'), 'private fixture: never overwrite');
  assert((await lstat(pathFor(root, ANCHOR))).isSymbolicLink());
});

test('inert ledger rejects symlink or unsafe ledger directory without changing its target', async t => {
  const root = await fixture(t), foreign = await fixture(t, false);
  await chmod(join(root, 'ledger'), 0o755);
  await assert.rejects(inspect(root, ID), code('LEDGER_ROOT_UNSAFE'));
  await assert.rejects(initialize(root, { experimentId: ID }), code('LEDGER_ROOT_UNSAFE'));
  await rm(join(root, 'ledger'), { recursive: true });
  await symlink(foreign, join(root, 'ledger'));
  await assert.rejects(inspect(root, ID), code('LEDGER_ROOT_UNSAFE'));
  await assert.rejects(initialize(root, { experimentId: ID }), code('LEDGER_ROOT_UNSAFE'));
  assert.deepEqual(await readdir(foreign), []);
  assert((await lstat(join(root, 'ledger'))).isSymbolicLink());
});

test('inert ledger partial bootstrap keeps anchor and lock, never completes automatically', async t => {
  for (const crashAt of ['after-anchor-fsync', 'after-ledger-directory-fsync', 'after-checkpoint-fsync', 'after-state-temp-fsync']) {
    await t.test(crashAt, async sub => {
      const root = await fixture(sub, false);
      await assert.rejects(initialize(root, { experimentId: ID }, { crashAt }), code('LEDGER_SIMULATED_CRASH'));
      const before = await readFile(pathFor(root, ANCHOR), 'utf8');
      assert.equal((await lstat(pathFor(root, ANCHOR))).mode & 0o777, 0o600);
      assert.equal((await lstat(pathFor(root, LOCK))).mode & 0o777, 0o600);
      await assert.rejects(inspect(root, ID), code('LEDGER_LOCKED'));
      await assert.rejects(initialize(root, { experimentId: ID }), code('LEDGER_LOCKED'));
      // Test-only removal of this fixture's lock isolates the durable anchor
      // invariant. The implementation never reclaims even a crash lock.
      await unlink(pathFor(root, LOCK));
      const expected = ['after-anchor-fsync', 'after-ledger-directory-fsync'].includes(crashAt) ?
        'LEDGER_TOTAL_LOSS' : 'LEDGER_INITIALIZATION_INCOMPLETE';
      await assert.rejects(inspect(root, ID), code(expected));
      await assert.rejects(initialize(root, { experimentId: ID }), code(expected));
      assert.equal(await readFile(pathFor(root, ANCHOR), 'utf8'), before);
      await assert.rejects(lstat(pathFor(root, STATE)), { code: 'ENOENT' });
    });
  }
});

test('inert ledger concurrent bootstrap has one owner, one anchor and no second genesis', async t => {
  const root = await fixture(t, false);
  let entered, release;
  const acquired = new Promise(resolve => { entered = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  const first = initialize(root, { experimentId: ID }, { pauseAfterLock: async () => { entered(); await barrier; } });
  try {
    await acquired;
    assert.deepEqual(await readdir(root), [LOCK]);
    await assert.rejects(initialize(root, { experimentId: ID }), code('LEDGER_LOCKED'));
    await assert.rejects(inspect(root, ID), code('LEDGER_LOCKED'));
  } finally { release(); }
  const result = await first;
  assert.equal(result.usedReservations, 0);
  assert.equal(result.anchor.grantedReservations, 0);
  assert.deepEqual((await readdir(root)).sort(), [ANCHOR, 'ledger']);
  assert.deepEqual((await entries(root)).sort(), [CP, STATE]);
  assert.deepEqual(await initialize(root, { experimentId: ID }), result);
});

test('inert ledger truncated checkpoint/state/reservation/receipt fail closed', async t => {
  for (const file of [CP, STATE, name('reservation', 1), name('receipt', 1)]) await t.test(file, async sub => {
    const root = await fixture(sub), [r] = await reserve(root, request([fa('first')]));
    await receipt(root, record(r));
    await writeFile(pathFor(root, file), '{', { mode: 0o600 });
    await assert.rejects(inspect(root, ID), code('LEDGER_INTEGRITY_BLOCKED'));
  });
});

test('inert ledger unsafe file and foreign/symlink destinations are preserved', async t => {
  const root = await fixture(t);
  await chmod(pathFor(root, CP), 0o644);
  await assert.rejects(inspect(root, ID), code('LEDGER_FILE_UNSAFE'));
  await chmod(pathFor(root, CP), 0o600);
  const foreign = await fixture(t, false), target = join(foreign, 'foreign.json');
  await writeFile(target, 'do not overwrite', { mode: 0o600 });
  await unlink(pathFor(root, STATE)); await symlink(target, pathFor(root, STATE));
  await assert.rejects(inspect(root, ID), code('LEDGER_FILE_UNSAFE'));
  await assert.rejects(initialize(root, { experimentId: ID }), code('LEDGER_FILE_UNSAFE'));
  assert.equal(await readFile(target, 'utf8'), 'do not overwrite');
  assert((await lstat(pathFor(root, STATE))).isSymbolicLink());
});

test('inert ledger sequence gaps, file/watermark mismatches and unknown artifacts block', async t => {
  for (const fault of ['gap', 'watermark-ahead', 'file-ahead', 'unexpected', 'duplicate-receipt']) await t.test(fault, async sub => {
    const root = await fixture(sub);
    await reserve(root, request([fa('first')])); await reserve(root, request([fa('second')]));
    if (fault === 'gap') await unlink(pathFor(root, name('reservation', 1)));
    if (fault === 'watermark-ahead') await replace(root, STATE, { ...await read(root, STATE), watermark: 3 });
    if (fault === 'file-ahead') await replace(root, STATE, { ...await read(root, STATE), watermark: 1 });
    if (fault === 'unexpected') await replace(root, 'reservation-0005.json', {});
    if (fault === 'duplicate-receipt') await replace(root, 'receipt-0001-copy.json', {});
    const before = (await entries(root)).sort();
    await assert.rejects(inspect(root, ID), code('LEDGER_INTEGRITY_BLOCKED'));
    await assert.rejects(reserve(root, request([fa('third')])), code('LEDGER_INTEGRITY_BLOCKED'));
    assert.deepEqual((await entries(root)).sort(), before);
  });
});

test('inert ledger foreign experiment, policy mismatch and reservation digest corruption block', async t => {
  for (const field of ['experiment', 'policy', 'digest']) await t.test(field, async sub => {
    const root = await fixture(sub); await reserve(root, request([fa('first')]));
    if (field === 'experiment') await replace(root, CP, { ...await read(root, CP), experimentId: 'synthetic-semantic-v2-ledger-other' });
    if (field === 'policy') await replace(root, CP, { ...await read(root, CP), policyDigest: 'unapproved-policy' });
    if (field === 'digest') await replace(root, name('reservation', 1), { ...await read(root, name('reservation', 1)), reservationDigest: 'wrong' });
    await assert.rejects(inspect(root, ID), code(field === 'digest' ? 'LEDGER_INTEGRITY_BLOCKED' : 'LEDGER_CHECKPOINT_MISMATCH'));
  });
});

test('inert ledger deterministic crashes preserve locks/artifacts and never repair', async t => {
  for (const crashAt of ['after-reservation-fsync', 'after-fb-first-fsync', 'after-state-temp-fsync']) await t.test(crashAt, async sub => {
    const root = await fixture(sub);
    const operations = crashAt === 'after-fb-first-fsync' ? fb() : [fa('first')];
    await assert.rejects(reserve(root, request(operations), { crashAt }), code('LEDGER_SIMULATED_CRASH'));
    assert.equal((await read(root, STATE)).watermark, 0);
    assert((await entries(root)).includes(name('reservation', 1)));
    await assert.rejects(inspect(root, ID), code('LEDGER_LOCKED'));
    await assert.rejects(reserve(root, request([fa('retry')])), code('LEDGER_LOCKED'));
    // Test-only removal of this fixture's known lock isolates the interrupted
    // file/watermark invariant. The module never performs this recovery.
    await unlink(join(root, LOCK));
    const before = (await entries(root)).sort();
    await assert.rejects(inspect(root, ID), code('LEDGER_INTEGRITY_BLOCKED'));
    await assert.rejects(initialize(root, { experimentId: ID }), code('LEDGER_INTEGRITY_BLOCKED'));
    assert.deepEqual((await entries(root)).sort(), before);
  });
});

test('inert ledger lingering lock is never stolen, expired or deleted', async t => {
  const root = await fixture(t);
  await replace(root, LOCK, { fixture: 'ambiguous-owner' });
  const before = await readFile(join(root, LOCK), 'utf8');
  await assert.rejects(inspect(root, ID), code('LEDGER_LOCKED'));
  await assert.rejects(initialize(root, { experimentId: ID }), code('LEDGER_LOCKED'));
  assert.equal(await readFile(join(root, LOCK), 'utf8'), before);
});

test('inert ledger exclusive concurrency, snapshots caller values, permits next explicit reservation', async t => {
  const root = await fixture(t);
  let entered, release;
  const acquired = new Promise(resolve => { entered = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  const input = request([fa('first')]);
  const first = reserve(root, input, { pauseAfterLock: async () => { entered(); await barrier; } });
  try {
    await acquired;
    input.operations[0].operationId = 'changed-after-start';
    assert.equal((await lstat(join(root, LOCK))).mode & 0o777, 0o600);
    await assert.rejects(reserve(root, request([fa('second')])), code('LEDGER_LOCKED'));
    await assert.rejects(inspect(root, ID), code('LEDGER_LOCKED'));
  } finally { release(); }
  const result = await first;
  assert.equal(result[0].operationId, 'first');
  const [second] = await reserve(root, request([fa('second')]));
  assert.equal(second.number, 2);
  assert.deepEqual((await inspect(root, ID)).reservations.map(r => r.number), [1, 2]);
});

test('inert ledger never deletes a replaced lock it did not acquire', async t => {
  const root = await fixture(t);
  await assert.rejects(reserve(root, request([fa('first')]), { pauseAfterLock: async () => {
    await unlink(join(root, LOCK)); await replace(root, LOCK, { fixture: 'replacement-owner' });
  } }), code('LEDGER_LOCK_OWNERSHIP_BLOCKED'));
  assert.deepEqual(await read(root, LOCK), { fixture: 'replacement-owner' });
});

test('inert ledger policy cannot authorize live, alter tokens/cost, or expose provider capability', async () => {
  assert.deepEqual(Object.keys(ledger).sort(), ['assertInertExperimentId', 'initializeInertLedger', 'inspectInertLedger',
    'reserveInertOperations', 'reserveInertFirstFa', 'writeInertReceipt'].sort());
  assert.deepEqual(OFFLINE_POLICY.bytes, { initial: 65536, cumulative: 262144, response: 65536 });
  assert.equal(OFFLINE_POLICY.maxReservations, 4); assert.equal(OFFLINE_POLICY.maxSemanticInvocations, 2);
  assert.equal(OFFLINE_POLICY.totalDeadlineMs, 30000); assert.equal(OFFLINE_POLICY.retries, 0); assert.equal(OFFLINE_POLICY.fallbacks, 0);
  assert.equal(OFFLINE_POLICY.tokens.state, 'PROPOSED'); assert.equal(OFFLINE_POLICY.tokens.input, 32000); assert.equal(OFFLINE_POLICY.tokens.output, 4000);
  assert.equal(OFFLINE_POLICY.tokens.hardRemoteEnforcement, 'NOT DEMONSTRATED');
  assert.equal(OFFLINE_POLICY.incrementalCost, 'R$0 REQUIRED / NOT VERIFIED');
  const source = await readFile(new URL('../v2-inert-ledger.mjs', import.meta.url), 'utf8');
  assert(!/^import .*experiment-store/m.test(source));
  assert(!/node:(child_process|https?|net|tls)|DeveloperEvidence|\bfetch\(/.test(source));
});

test('inert ledger invalid inputs and failure diagnostics do not expose identifiers or paths', async t => {
  const root = await fixture(t);
  for (const operationId of ['private name', '../private-path', ['private-name'], 'x'.repeat(129)]) {
    await assert.rejects(reserve(root, request([fa(operationId)])), code('LEDGER_OPERATION_ID_INVALID'));
  }
  await assert.rejects(reserve(root, request([fa('first')]), { crashAt: 'unknown' }), code('LEDGER_TEST_CONTROL_INVALID'));
  assert.equal((await inspect(root, ID)).usedReservations, 0);
});
