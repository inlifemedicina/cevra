// Operator-only continuity for one bounded experiment. This is not product persistence.
import {constants} from 'node:fs';
import {open,lstat,readdir} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';

const EXPERIMENT='semantic-claude-roundtrip-poc-v1';
const BASE='a58ca419c2a0db2c416db83d84c432fcae23d830';
const PRIOR='4d220faadcdbc17aeae51c8be695aaf4a8ca21c4';
const PURPOSES=new Set(['plugin-diagnostic','pt-analysis','en-analysis']);
const CHECKPOINT='recovery-checkpoint.json';
const error=code=>Object.assign(new Error(code),{code});
// This historical experiment is terminal by code policy, even if every local file disappears.
export const EXPERIMENT_POLICY=Object.freeze({experiment:EXPERIMENT,status:'closed',used:8,remaining:0});
export function assertExperimentOpen(){throw error('EXPERIMENT_CLOSED');}

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
export function evidencePath(home){
  if(!isAbsolute(home))throw error('EVIDENCE_HOME_INVALID');
  return join(home,'Library','Application Support','CEVRA','DeveloperEvidence',EXPERIMENT);
}
export async function ensureEvidenceDirectory(home){
  assertExperimentOpen();
}
export async function withExperimentLock(dir,work){
  assertExperimentOpen();
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
  assertExperimentOpen();
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
  const receipts=[];
  for(const name of names){
    if(!/^attempt-[6-8]-receipt\.json$/.test(name))continue;
    const receipt=await file(join(dir,name));
    const number=Number(name.match(/attempt-(\d)/)[1]);
    const reservation=reservations.find(r=>r.number===number);
    if(!reservation)throw error('RECEIPT_WITHOUT_RESERVATION');
    if(receipt?.version!==1||receipt.number!==number||receipt.attemptId!==reservation.attemptId||
      receipt.purpose!==reservation.purpose)throw error('RECEIPT_RESERVATION_MISMATCH');
    receipts.push(receipt);
  }
  for(let i=0;i<reservations.length;i++)if(reservations[i].number!==checkpoint.historicalDebited+i+1)throw error('RESERVATION_SEQUENCE_INVALID');
  return {checkpoint,reservations,receipts,...EXPERIMENT_POLICY,
    recordedUsed:checkpoint.historicalDebited+reservations.length,
    unresolvedReservations:reservations.filter(r=>!receipts.some(receipt=>receipt.number===r.number)).map(r=>r.number)};
}
export async function reserveAttempt(dir,purpose){
  assertExperimentOpen();
}
export async function writeAttemptReceipt(dir,reservation,result){
  assertExperimentOpen();
}
