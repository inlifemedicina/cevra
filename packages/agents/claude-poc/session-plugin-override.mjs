// Operator-only, session-scoped restriction. Private plugin IDs never enter
// argv, diagnostics, tracked files, or the semantic analyzer payload.
import {constants} from 'node:fs';
import {open,lstat,unlink} from 'node:fs/promises';
import {dirname,isAbsolute,join} from 'node:path';

const MAX_RECEIPT_BYTES=8192;
const SOURCE=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}@[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function invalid(){const error=new Error('INVALID_PRIVATE_PLUGIN_RECEIPT');error.code='INVALID_PRIVATE_PLUGIN_RECEIPT';throw error;}
async function privateDirectory(path){
  const stat=await lstat(path);
  if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o077))invalid();
}

export function pluginDisableSettings(receipt){
  if(receipt?.version!==1||receipt.event!=='system/init'||!Array.isArray(receipt.plugins)||receipt.plugins.length!==2)invalid();
  const sources=[];
  for(const plugin of receipt.plugins){
    if(plugin?.kind!=='object'||typeof plugin.name!=='string'||typeof plugin.source!=='string'||plugin.path!=='builtin'||
      !SOURCE.test(plugin.source)||plugin.source!==`${plugin.name}@builtin`||plugin.name.includes('*')||plugin.source.includes('*'))invalid();
    sources.push(plugin.source);
  }
  if(new Set(sources).size!==2)invalid();
  return {enabledPlugins:Object.fromEntries(sources.map(source=>[source,false]))};
}

export async function loadPluginDisableSettings(receiptPath){
  if(!isAbsolute(receiptPath))invalid();
  let handle;
  try{
    await privateDirectory(dirname(receiptPath));
    handle=await open(receiptPath,constants.O_RDONLY|constants.O_NOFOLLOW);
    const stat=await handle.stat();
    if(!stat.isFile()||stat.uid!==process.getuid()||(stat.mode&0o077)||stat.size>MAX_RECEIPT_BYTES)invalid();
    return pluginDisableSettings(JSON.parse(await handle.readFile('utf8')));
  }catch{invalid();}finally{if(handle)await handle.close();}
}

export async function createSessionPluginSettings(cwd,receiptPath){
  await privateDirectory(cwd);
  const settings=await loadPluginDisableSettings(receiptPath);
  const path=join(cwd,'session-settings.json');
  const handle=await open(path,'wx',0o600);
  let identity;
  const cleanup=async()=>{
    const current=await lstat(path);
    if(!current.isFile()||current.isSymbolicLink()||current.dev!==identity.dev||current.ino!==identity.ino||current.uid!==process.getuid())invalid();
    await unlink(path);
  };
  try{identity=await handle.stat();await handle.writeFile(JSON.stringify(settings));await handle.sync();}
  catch(error){
    await handle.close();
    if(identity)await cleanup();
    throw error;
  }
  await handle.close();
  return {path,cleanup};
}
