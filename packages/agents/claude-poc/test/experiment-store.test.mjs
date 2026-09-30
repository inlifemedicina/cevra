import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,rmdir,unlink,symlink,writeFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ensureEvidenceDirectory,evidencePath,recoverExperiment,inspectExperiment,reserveAttempt,withExperimentLock,
  writeAttemptReceipt} from '../experiment-store.mjs';

async function sandbox(work){
  const dir=await mkdtemp(join(tmpdir(),'cevra-experiment-store-test-'));
  try{return await work(dir);}finally{
    // Test-owned files only, never the operator evidence directory.
    for(const name of await readdir(dir))await unlink(join(dir,name));
    await rmdir(dir);
  }
}
test('normal operation fails closed with no checkpoint; authorized recovery is idempotent and invents no old receipts',()=>sandbox(async dir=>{
  await assert.rejects(inspectExperiment(dir),e=>e.code==='RECOVERY_CHECKPOINT_REQUIRED');
  const first=await recoverExperiment(dir),second=await recoverExperiment(dir);
  assert.deepEqual(second,first);
  assert.equal(first.historicalDebited,5);assert.equal(first.maximum,8);
  assert.equal(first.originalReceipts,'unavailable');
  assert.deepEqual((await readdir(dir)).sort(),['recovery-checkpoint.json']);
  const state=await inspectExperiment(dir);assert.equal(state.used,5);assert.equal(state.remaining,3);
}));
test('reservation is durable before callback/spawn; missing receipt still spends the slot across reopen',()=>sandbox(async dir=>{
  await recoverExperiment(dir);
  let spawned=0;
  await withExperimentLock(dir,async()=>{
    const reservation=await reserveAttempt(dir,'plugin-diagnostic');
    assert.equal(reservation.number,6);
    assert.equal((await readFile(join(dir,'attempt-6-reservation.json'),'utf8')).includes(reservation.attemptId),true);
    spawned++;
  });
  assert.equal(spawned,1);
  assert.equal((await inspectExperiment(dir)).used,6);
  const next=await withExperimentLock(dir,()=>reserveAttempt(dir,'pt-analysis'));
  assert.equal(next.number,7);
  await writeAttemptReceipt(dir,next,{status:'rejected',error:'FIXTURE'});
  await assert.rejects(writeAttemptReceipt(dir,next,{status:'accepted'}),e=>e.code==='EEXIST');
  assert.equal((await inspectExperiment(dir)).remaining,1);
  const last=await withExperimentLock(dir,()=>reserveAttempt(dir,'en-analysis'));
  assert.equal(last.number,8);
  await assert.rejects(withExperimentLock(dir,()=>reserveAttempt(dir,'en-analysis')),
    e=>e.code==='EXPERIMENT_BUDGET_EXHAUSTED');
}));
test('exclusive lock prevents concurrent numbers and does not reclaim ambiguous active owner',()=>sandbox(async dir=>{
  await recoverExperiment(dir);
  let release;const held=withExperimentLock(dir,async()=>{
    const r=await reserveAttempt(dir,'plugin-diagnostic');
    await new Promise(resolve=>{release=resolve;});return r;
  });
  for(let i=0;i<100&&!release;i++)await new Promise(resolve=>setTimeout(resolve,1));
  await assert.rejects(withExperimentLock(dir,()=>reserveAttempt(dir,'pt-analysis')),e=>e.code==='EXPERIMENT_LOCKED');
  assert.equal((await inspectExperiment(dir)).used,6);
  release();await held;
  assert.equal((await inspectExperiment(dir)).used,6);
}));
test('corrupt checkpoint, symlink, foreign receipt and incompatible repeat fail without a reserve',()=>sandbox(async dir=>{
  await recoverExperiment(dir);
  const checkpoint=join(dir,'recovery-checkpoint.json');
  const old=await readFile(checkpoint,'utf8');
  await writeFile(checkpoint,JSON.stringify({...JSON.parse(old),maximum:80}));
  await assert.rejects(recoverExperiment(dir),e=>e.code==='RECOVERY_CHECKPOINT_INVALID');
  await writeFile(checkpoint,old);
  await symlink(checkpoint,join(dir,'attempt-6-reservation.json'));
  await assert.rejects(inspectExperiment(dir));
  await unlink(join(dir,'attempt-6-reservation.json'));
  await symlink(checkpoint,join(dir,'attempt-6-receipt.json'));
  const r=await reserveAttempt(dir,'plugin-diagnostic');
  await assert.rejects(writeAttemptReceipt(dir,r,{status:'accepted'}),e=>e.code==='EEXIST');
}));
test('path is stable outside tmp and purposes are closed',()=>sandbox(async dir=>{
  assert.match(evidencePath('/fixture-home'),/DeveloperEvidence\/semantic-claude-roundtrip-poc-v1$/);
  await recoverExperiment(dir);
  await assert.rejects(reserveAttempt(dir,'retry'),e=>e.code==='PURPOSE_NOT_AUTHORIZED');
}));
test('persistent directory is private and refuses a symlinked CEVRA component',async()=>{
 const home=await mkdtemp(join(tmpdir(),'cevra-evidence-home-test-'));
 try{
  await mkdir(join(home,'Library','Application Support'),{recursive:true});
  const dir=await ensureEvidenceDirectory(home);
  for(const path of [join(home,'Library','Application Support','CEVRA'),
    join(home,'Library','Application Support','CEVRA','DeveloperEvidence'),dir])
    assert.equal((await lstat(path)).mode&0o777,0o700);
  await assert.rejects(ensureEvidenceDirectory(join(home,'relative')));
  await rmdir(dir);
  await rmdir(join(home,'Library','Application Support','CEVRA','DeveloperEvidence'));
  await rmdir(join(home,'Library','Application Support','CEVRA'));
  await symlink(home,join(home,'Library','Application Support','CEVRA'));
  await assert.rejects(ensureEvidenceDirectory(home),e=>e.code==='EVIDENCE_DIRECTORY_UNSAFE');
  await unlink(join(home,'Library','Application Support','CEVRA'));
  await rmdir(join(home,'Library','Application Support'));
  await rmdir(join(home,'Library'));
 }finally{await rmdir(home);}
});
