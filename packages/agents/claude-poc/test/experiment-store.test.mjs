import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rmdir,unlink,symlink,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {EXPERIMENT_POLICY,ensureEvidenceDirectory,evidencePath,recoverExperiment,inspectExperiment,
  reserveAttempt,withExperimentLock,writeAttemptReceipt} from '../experiment-store.mjs';

// Synthetic historical records only; never read or write the operator's DeveloperEvidence.
const checkpoint={version:1,experiment:'semantic-claude-roundtrip-poc-v1',origin:'authorized-recovery',
  historicalDebited:5,maximum:8,originalReceipts:'unavailable',
  canonicalBase:'a58ca419c2a0db2c416db83d84c432fcae23d830',priorHead:'4d220faadcdbc17aeae51c8be695aaf4a8ca21c4',
  reason:'temporary-evidence-disappeared; cause unknown',createdAt:'2026-09-30T00:00:00Z'};
const reservation=number=>({version:1,number,purpose:'pt-analysis',attemptId:`fixture_${number}`,reservedAt:'2026-09-30T00:00:00Z'});
const write=(dir,name,value)=>writeFile(join(dir,name),JSON.stringify(value),{flag:'wx',mode:0o600});
async function sandbox(work){
  const dir=await mkdtemp(join(tmpdir(),'cevra-experiment-store-test-'));
  try{return await work(dir);}finally{
    for(const name of await readdir(dir))await unlink(join(dir,name));
    await rmdir(dir);
  }
}
async function closed(dir){
  for(const action of [()=>recoverExperiment(dir),()=>reserveAttempt(dir,'pt-analysis'),
    ()=>ensureEvidenceDirectory(dir),()=>writeAttemptReceipt(dir,reservation(6),{}),
    ()=>withExperimentLock(dir,()=>assert.fail('closed callback ran'))])
    await assert.rejects(action,e=>e.code==='EXPERIMENT_CLOSED');
}
test('terminal policy refuses recovery/reservation for present, absent or checkpoint-less directories',()=>sandbox(async dir=>{
  assert.deepEqual(EXPERIMENT_POLICY,{experiment:checkpoint.experiment,status:'closed',used:8,remaining:0});
  await closed(join(dir,'absent'));await closed(dir);
  assert.deepEqual(await readdir(dir),[]);
  await write(dir,'recovery-checkpoint.json',checkpoint);
  const before=await readFile(join(dir,'recovery-checkpoint.json'),'utf8');
  await closed(dir);await closed(dir);
  assert.equal(await readFile(join(dir,'recovery-checkpoint.json'),'utf8'),before);
  assert.deepEqual(await readdir(dir),['recovery-checkpoint.json']);
}));
test('inspection separates closed policy from partial historical records; missing receipt consumes its reservation',()=>sandbox(async dir=>{
  await write(dir,'recovery-checkpoint.json',checkpoint);await write(dir,'attempt-6-reservation.json',reservation(6));
  const state=await inspectExperiment(dir);
  assert.equal(state.status,'closed');assert.equal(state.used,8);assert.equal(state.remaining,0);
  assert.equal(state.recordedUsed,6);assert.deepEqual(state.unresolvedReservations,[6]);
  assert.equal(state.checkpoint.originalReceipts,'unavailable');
  await closed(dir);
}));
test('deleted reservation with its receipt is inconsistent and never reopens quota',()=>sandbox(async dir=>{
  await write(dir,'recovery-checkpoint.json',checkpoint);
  await write(dir,'attempt-6-reservation.json',reservation(6));
  await write(dir,'attempt-6-receipt.json',{...reservation(6),status:'rejected'});
  await write(dir,'attempt-7-reservation.json',reservation(7));
  assert.equal((await inspectExperiment(dir)).receipts.length,1);
  await unlink(join(dir,'attempt-6-reservation.json'));
  await assert.rejects(inspectExperiment(dir),e=>e.code==='RECEIPT_WITHOUT_RESERVATION');
  await closed(dir);assert.equal(EXPERIMENT_POLICY.remaining,0);
  assert.equal(JSON.parse(await readFile(join(dir,'attempt-6-receipt.json'),'utf8')).status,'rejected');
}));
test('reservation gap and receipt number/attemptId/purpose mismatch fail historical integrity',()=>sandbox(async dir=>{
  await write(dir,'recovery-checkpoint.json',checkpoint);
  await write(dir,'attempt-7-reservation.json',reservation(7));
  await assert.rejects(inspectExperiment(dir),e=>e.code==='RESERVATION_SEQUENCE_INVALID');
  await unlink(join(dir,'attempt-7-reservation.json'));
  await write(dir,'attempt-6-reservation.json',reservation(6));
  for(const mutation of [{number:7},{attemptId:'foreign_6'},{purpose:'en-analysis'}]){
    await write(dir,'attempt-6-receipt.json',{...reservation(6),...mutation});
    await assert.rejects(inspectExperiment(dir),e=>e.code==='RECEIPT_RESERVATION_MISMATCH');
    await unlink(join(dir,'attempt-6-receipt.json'));
  }
}));
test('missing/corrupt checkpoint and symlinks remain unverified without changing closed policy',()=>sandbox(async dir=>{
  await assert.rejects(inspectExperiment(dir),e=>e.code==='RECOVERY_CHECKPOINT_REQUIRED');
  await write(dir,'recovery-checkpoint.json',{...checkpoint,maximum:80});
  await assert.rejects(inspectExperiment(dir),e=>e.code==='RECOVERY_CHECKPOINT_INVALID');
  await closed(dir);
  await unlink(join(dir,'recovery-checkpoint.json'));await write(dir,'recovery-checkpoint.json',checkpoint);
  await symlink(join(dir,'recovery-checkpoint.json'),join(dir,'attempt-6-reservation.json'));
  await assert.rejects(inspectExperiment(dir));await closed(dir);
}));
test('all operational harness modes reject before invoking any binary or creating evidence',()=>sandbox(async dir=>{
  const harness=fileURLToPath(new URL('../harness.mjs',import.meta.url));
  for(const mode of ['recover','diagnostic','pt','en','pt-final','canary','unrecognized']){
    const child=spawn(process.execPath,[harness,mode],{env:{HOME:dir},stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);
    const code=await new Promise(resolve=>child.on('close',resolve));
    assert.notEqual(code,0);assert.match(stderr,/EXPERIMENT_CLOSED/);assert.equal(stdout,'');
    assert.deepEqual(await readdir(dir),[]);
  }
  // No transport/child-process import remains in the operational entry point.
  const source=await readFile(harness,'utf8');
  assert(!/child_process|transport\.mjs|auth.*status|execFile|spawn\(/.test(source.replace(/\/\/.*$/gm,'')));
}));
test('stable evidence path does not grant a new experiment or budget',()=>{
  assert.match(evidencePath('/fixture-home'),/DeveloperEvidence\/semantic-claude-roundtrip-poc-v1$/);
  assert(Object.isFrozen(EXPERIMENT_POLICY));
});
