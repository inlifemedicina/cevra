// Operator-only receipt for bounded wire metadata. Never publish this file or
// substitute it for the reader's closed public metrics.
import {open,lstat} from 'node:fs/promises';
import {join} from 'node:path';

const KEYS=new Set(['type','model','modelKind','modelHash','error','errorKind','errorHash',
  'apiErrorStatus','stopReason','terminalReason','usageModelCount','isError','errorTextPresent','errorTextHash',
  'authExplanationCategory','authExplanationEvidence','authStatusPresent']);
const AUTH_CATEGORIES=new Set(['NO_CREDENTIAL_AVAILABLE','LOGIN_EXPIRED_OR_REVOKED','CREDENTIAL_STORE_ACCESS',
  'ORGANIZATION_ACCESS_RESTRICTION','UNSUPPORTED_AUTH_ROUTE','AUTH_REJECTED_UNSPECIFIED','UNKNOWN']);
const AUTH_EVIDENCE=new Set(['NO_CLASSIFIABLE_AUTH_EVIDENCE','EXPLICIT_AUTH_ERROR_ONLY','ERROR_TEXT_PATTERN']);
const TRACE_KEYS=new Set(['phase','type','typeKind','typeHash','subtype','subtypeKind','subtypeHash',
  'attempt','attemptKind','max_retries','max_retriesKind','retry_delay_ms','retry_delay_msKind',
  'error_status','error_statusKind','status','state','error','modelClass','isError','decision','reason']);
function invalid(){const error=new Error('INVALID_EVENT_DIAGNOSTIC');error.code='INVALID_EVENT_DIAGNOSTIC';throw error;}

export async function writePrivateEventReceipt(directory,name,input){
  if(!/^(canary-[56]|pt-[5-8]|en-[5-8]|cancel-[5-8])-private\.json$/.test(name))invalid();
  const stat=await lstat(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o077))invalid();
  const events=Array.isArray(input)?input:input?.events;
  const trace=Array.isArray(input)?[]:input?.trace;
  if(!Array.isArray(events)||events.length>8)invalid();
  if(!Array.isArray(trace)||trace.length>24)invalid();
  for(const event of events){
    if(!event||!['assistant','result'].includes(event.type)||Object.keys(event).some(key=>!KEYS.has(key)))invalid();
    for(const [key,value] of Object.entries(event)){
      if(value===undefined)continue;
      if(['isError','errorTextPresent','authStatusPresent'].includes(key)){if(typeof value!=='boolean')invalid();continue;}
      if(key==='apiErrorStatus'){if(!Number.isInteger(value)||value<100||value>599)invalid();continue;}
      if(key==='usageModelCount'){if(!Number.isInteger(value)||value<0||value>32)invalid();continue;}
      if(typeof value!=='string'||value.length>128||/[\x00-\x1f\x7f]/.test(value))invalid();
      if(key==='authExplanationCategory'&&!AUTH_CATEGORIES.has(value))invalid();
      if(key==='authExplanationEvidence'&&!AUTH_EVIDENCE.has(value))invalid();
      if(key.endsWith('Hash')&&!/^[a-f0-9]{64}$/.test(value))invalid();
    }
  }
  for(const entry of trace){
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).some(key=>!TRACE_KEYS.has(key)))invalid();
    if(!['before-init','session','after-result'].includes(entry.phase))invalid();
    for(const [key,value] of Object.entries(entry)){
      if(value===undefined||key==='phase')continue;
      if(value===null){if(!['error_status','status'].includes(key))invalid();continue;}
      if(key==='isError'){if(typeof value!=='boolean')invalid();continue;}
      if(['attempt','max_retries','retry_delay_ms','error_status'].includes(key)){
        if(!Number.isSafeInteger(value)||value<0||value>3600000)invalid();continue;
      }
      if(typeof value!=='string'||value.length>128||/[\x00-\x1f\x7f]/.test(value))invalid();
      if(key.endsWith('Hash')){if(!/^[a-f0-9]{64}$/.test(value))invalid();continue;}
      if(['type','subtype'].includes(key)&&!/^[a-z][a-z0-9_]{0,63}$/.test(value))invalid();
      if(['decision','reason'].includes(key)&&!/^[A-Z][A-Z0-9_]{0,63}$/.test(value))invalid();
      if(key==='error'&&!/^[a-z][a-z0-9_]{0,63}$/.test(value))invalid();
    }
  }
  const serialized=JSON.stringify({version:2,events,trace});
  if(Buffer.byteLength(serialized)>16*1024)invalid();
  const handle=await open(join(directory,name),'wx',0o600);
  try{await handle.writeFile(serialized);await handle.sync();}
  finally{await handle.close();}
}
