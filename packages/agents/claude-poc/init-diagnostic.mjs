// Operator-only diagnostic. The returned value is private and must never enter
// normal adapter metrics, console output, CI artifacts, or tracked evidence.
import {open,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {ClaudePocError} from './transport.mjs';

const FIELDS=['name','id','path','origin','source','version','enabled','required'];
const MAX_ENTRIES=8;
const MAX_STRING=1024;
const MAX_RECEIPT_BYTES=8192;

function invalid(){throw new ClaudePocError('DIAGNOSTIC_METADATA_LIMIT');}

export function captureInitPlugins(event) {
  if(event?.type!=='system'||event.subtype!=='init')invalid();
  const value=event.plugins;
  if(!Array.isArray(value)||value.length>MAX_ENTRIES)invalid();
  const plugins=value.map(entry=>{
    if(typeof entry==='string'){
      if(entry.length>MAX_STRING)invalid();
      return {kind:'string',label:entry};
    }
    if(!entry||typeof entry!=='object'||Array.isArray(entry))invalid();
    const selected={kind:'object'};
    for(const field of FIELDS){
      if(!Object.hasOwn(entry,field))continue;
      const v=entry[field];
      if(typeof v==='string'){
        if(v.length>MAX_STRING)invalid();
        selected[field]=v;
      }else if((field==='enabled'||field==='required')&&typeof v==='boolean') selected[field]=v;
      else invalid();
    }
    selected.otherFieldCount=Object.keys(entry).filter(field=>!FIELDS.includes(field)).length;
    return selected;
  });
  const result={version:1,event:'system/init',plugins};
  if(Buffer.byteLength(JSON.stringify(result))>MAX_RECEIPT_BYTES)invalid();
  return result;
}

export async function writePrivateInitReceipt(directory,name,result) {
  if(!/^[a-z0-9-]{1,64}\.json$/.test(name))invalid();
  const stat=await lstat(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077))invalid();
  const serialized=JSON.stringify(result,null,2);
  if(Buffer.byteLength(serialized)>MAX_RECEIPT_BYTES)invalid();
  const handle=await open(join(directory,name),'wx',0o600);
  try{await handle.writeFile(serialized);await handle.sync();}
  finally{await handle.close();}
}

export function publicInitShape(result) {
  return {event:result.event,pluginCount:result.plugins.length,
    plugins:result.plugins.map((plugin,index)=>({alias:`P${index+1}`,kind:plugin.kind,
      fields:Object.keys(plugin).filter(key=>key!=='kind'&&key!=='otherFieldCount'),
      otherFieldCount:plugin.otherFieldCount??0}))};
}
