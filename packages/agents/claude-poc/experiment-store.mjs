// Operator-only continuity for one bounded experiment. This is not product persistence.
import {constants} from 'node:fs';
import {open,lstat,mkdir,readdir,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {dirname,isAbsolute,join} from 'node:path';

const EXPERIMENT='semantic-claude-roundtrip-poc-v1';
const BASE='a58ca419c2a0db2c416db83d84c432fcae23d830';
const PRIOR='4d220faadcdbc17aeae51c8be695aaf4a8ca21c4';
const PURPOSES=new Set(['plugin-diagnostic','pt-analysis','en-analysis']);
const CHECKPOINT='recovery-checkpoint.json';
const error=code=>Object.assign(new Error(code),{code});

async function directory(path, privateMode=true){
  const s=await lstat(path);
  if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||privateMode&&(s.mode&0o077))throw error('EVIDENCE_DIRECTORY_UNSAFE');
}
async function file(path,max=16384){
  const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const s=await h.stat();
    if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>max)throw error('EVIDENCE_FILE_UNSAFE');
    return JSON.parse(await h.readFile('utf8'));
  }finally{await h.close();}
}
async function exclusive(path,value){
  const h=await open(path,'wx',0o600);
  try{await h.writeFile(JSON.stringify(value,null,2));await h.sync();}
  finally{await h.close();}
  // The file is durable before any child spawn. macOS supports directory fsync.
  const d=await open(dirname(path),'r');
  try{await d.sync();}finally{await d.close();}
}
export function evidencePath(home){
  if(!isAbsolute(home))throw error('EVIDENCE_HOME_INVALID');
  return join(home,'Library','Application Support','CEVRA','DeveloperEvidence',EXPERIMENT);
}
export async function ensureEvidenceDirectory(home){
  if(!isAbsolute(home))throw error('EVIDENCE_HOME_INVALID');
  await directory(home,false);
  const library=join(home,'Library'),support=join(library,'Application Support');
  await directory(library,false);await directory(support,false);
  let parent=support;
  for(const part of ['CEVRA','DeveloperEvidence',EXPERIMENT]){
    parent=join(parent,part);
    try{await mkdir(parent,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
    await directory(parent);
  }
  return parent;
}
export async function withExperimentLock(dir,work){
  await directory(dir);
  const path=join(dir,'execution.lock');
  let h;
  try{h=await open(path,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw error('EXPERIMENT_LOCKED');throw e;}
  const identity=await h.stat();
  try{
    await h.writeFile(JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}));await h.sync();
    return await work();
  }finally{
    await h.close();
    const current=await lstat(path);
    if(current.dev!==identity.dev||current.ino!==identity.ino||current.uid!==process.getuid()||!current.isFile())throw error('EXPERIMENT_LOCK_CHANGED');
    await unlink(path);
  }
}
function validCheckpoint(c){
  return c?.version===1&&c.experiment===EXPERIMENT&&c.origin==='authorized-recovery'&&c.historicalDebited===5&&
    c.maximum===8&&c.originalReceipts==='unavailable'&&c.canonicalBase===BASE&&c.priorHead===PRIOR&&
    c.reason==='temporary-evidence-disappeared; cause unknown'&&typeof c.createdAt==='string'&&
    !Number.isNaN(Date.parse(c.createdAt));
}
export async function readCheckpoint(dir){
  await directory(dir);
  let c;try{c=await file(join(dir,CHECKPOINT));}catch(e){if(e.code==='ENOENT')throw error('RECOVERY_CHECKPOINT_REQUIRED');throw e;}
  if(!validCheckpoint(c))throw error('RECOVERY_CHECKPOINT_INVALID');
  return c;
}
export async function recoverExperiment(dir){
  return withExperimentLock(dir,async()=>{
    let existing;
    try{existing=await file(join(dir,CHECKPOINT));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(existing){if(!validCheckpoint(existing))throw error('RECOVERY_CHECKPOINT_INVALID');return existing;}
    if((await readdir(dir)).some(name=>name!=='execution.lock'))throw error('RECOVERY_DESTINATION_NOT_EMPTY');
    const c={version:1,experiment:EXPERIMENT,origin:'authorized-recovery',historicalDebited:5,maximum:8,
      originalReceipts:'unavailable',canonicalBase:BASE,priorHead:PRIOR,
      evidenceDocument:'docs/CEVRA_SEMANTIC_CLAUDE_ROUNDTRIP_POC_V1_EVIDENCE.md',
      reason:'temporary-evidence-disappeared; cause unknown',createdAt:new Date().toISOString()};
    await exclusive(join(dir,CHECKPOINT),c);return c;
  });
}
export async function inspectExperiment(dir){
  const checkpoint=await readCheckpoint(dir);
  const names=await readdir(dir);
  const reservations=[];
  for(const name of names){
    if(!/^attempt-[6-8]-reservation\.json$/.test(name))continue;
    const r=await file(join(dir,name));
    const number=Number(name.match(/attempt-(\d)/)[1]);
    if(r?.version!==1||r.number!==number||!PURPOSES.has(r.purpose)||
      typeof r.attemptId!=='string'||!/_/.test(r.attemptId)||typeof r.reservedAt!=='string')throw error('RESERVATION_INVALID');
    reservations.push(r);
  }
  reservations.sort((a,b)=>a.number-b.number);
  for(let i=0;i<reservations.length;i++)if(reservations[i].number!==checkpoint.historicalDebited+i+1)throw error('RESERVATION_SEQUENCE_INVALID');
  return {checkpoint,reservations,used:checkpoint.historicalDebited+reservations.length,
    remaining:checkpoint.maximum-checkpoint.historicalDebited-reservations.length};
}
export async function reserveAttempt(dir,purpose){
  if(!PURPOSES.has(purpose))throw error('PURPOSE_NOT_AUTHORIZED');
  const state=await inspectExperiment(dir);
  if(state.remaining<1)throw error('EXPERIMENT_BUDGET_EXHAUSTED');
  const number=state.used+1;
  const reservation={version:1,number,purpose,attemptId:`attempt_${number}_${randomUUID()}`,reservedAt:new Date().toISOString()};
  await exclusive(join(dir,`attempt-${number}-reservation.json`),reservation);
  return reservation;
}
export async function writeAttemptReceipt(dir,reservation,result){
  const known=await file(join(dir,`attempt-${reservation.number}-reservation.json`));
  if(known.attemptId!==reservation.attemptId)throw error('RESERVATION_MISMATCH');
  await exclusive(join(dir,`attempt-${reservation.number}-receipt.json`),{
    version:1,number:reservation.number,attemptId:reservation.attemptId,purpose:reservation.purpose,
    completedAt:new Date().toISOString(),...result});
}
