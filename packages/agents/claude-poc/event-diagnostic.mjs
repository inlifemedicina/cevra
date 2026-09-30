// Operator-only receipt for bounded wire metadata. Never publish this file or
// substitute it for the reader's closed public metrics.
import {open,lstat} from 'node:fs/promises';
import {join} from 'node:path';

const KEYS=new Set(['type','model','modelKind','modelHash','error','errorKind','errorHash',
  'apiErrorStatus','stopReason','terminalReason','usageModelCount','isError','errorTextPresent','errorTextHash']);
function invalid(){const error=new Error('INVALID_EVENT_DIAGNOSTIC');error.code='INVALID_EVENT_DIAGNOSTIC';throw error;}

export async function writePrivateEventReceipt(directory,name,events){
  if(!/^(canary-5|pt-[5-8]|en-[5-8]|cancel-[5-8])-private\.json$/.test(name))invalid();
  const stat=await lstat(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o077))invalid();
  if(!Array.isArray(events)||events.length>8)invalid();
  for(const event of events){
    if(!event||!['assistant','result'].includes(event.type)||Object.keys(event).some(key=>!KEYS.has(key)))invalid();
    for(const [key,value] of Object.entries(event)){
      if(value===undefined)continue;
      if(['isError','errorTextPresent'].includes(key)){if(typeof value!=='boolean')invalid();continue;}
      if(key==='apiErrorStatus'){if(!Number.isInteger(value)||value<100||value>599)invalid();continue;}
      if(key==='usageModelCount'){if(!Number.isInteger(value)||value<0||value>32)invalid();continue;}
      if(typeof value!=='string'||value.length>128||/[\x00-\x1f\x7f]/.test(value))invalid();
      if(key.endsWith('Hash')&&!/^[a-f0-9]{64}$/.test(value))invalid();
    }
  }
  const serialized=JSON.stringify({version:1,events});
  if(Buffer.byteLength(serialized)>16*1024)invalid();
  const handle=await open(join(directory,name),'wx',0o600);
  try{await handle.writeFile(serialized);await handle.sync();}
  finally{await handle.close();}
}
