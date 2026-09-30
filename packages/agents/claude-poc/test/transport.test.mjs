import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rmdir,readFile,lstat,symlink,unlink,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {childArguments,childEnvironment,ClaudeStreamReader,runClaudeProcess,ClaudePocAnalyzer,LIMITS} from '../transport.mjs';
import {captureInitPlugins,publicInitShape,writePrivateInitReceipt} from '../init-diagnostic.mjs';
import {pluginDisableSettings,loadPluginDisableSettings,createSessionPluginSettings} from '../session-plugin-override.mjs';
const fake=fileURLToPath(new URL('./fake-cli.mjs',import.meta.url));
const payload=JSON.stringify({context:{contextId:'test',evidence:[{reference:'E1',text:'Café'}]}});
const runner=mode=>(bin,args,opts)=>spawn(process.execPath,[fake,mode,...args],opts);
async function run(mode,options={}){
 const cwd=await mkdtemp('/tmp/cevra-transport-test-');
 try{return await runClaudeProcess({binary:'/fixture-only',home:'/fixture-home',cwd,payload,timeoutMs:3000,...options},runner(mode));}finally{await rmdir(cwd);}
}
test('closed argv: true empty tools; no payload, shell, resume, fallback or permissions bypass',()=>{
 const args=childArguments('fixture-session');
 assert.equal(args[args.indexOf('--tools')+1],'');
 assert.equal(args[args.indexOf('--model')+1],'opus');
 assert.equal(args[args.indexOf('--effort')+1],'medium');
 assert.equal(args[args.indexOf('--setting-sources')+1],'');
 for(const value of ['--bare','--resume','--continue','--fallback-model','--dangerously-skip-permissions',payload])assert(!args.includes(value));
});
const syntheticPlugins={version:1,event:'system/init',plugins:[
 {kind:'object',name:'fixture-one',source:'fixture-one@builtin',path:'builtin'},
 {kind:'object',name:'fixture-two',source:'fixture-two@builtin',path:'builtin'}]};
test('session override has only two exact false keys; argv carries path but no private identifiers',()=>{
 const settings=pluginDisableSettings(syntheticPlugins);
 assert.deepEqual(settings,{enabledPlugins:{'fixture-one@builtin':false,'fixture-two@builtin':false}});
 const args=childArguments('fixture-session','/tmp/private/session-settings.json');
 assert.equal(args[args.indexOf('--tools')+1],'');
 assert.equal(args[args.indexOf('--settings')+1],'/tmp/private/session-settings.json');
 assert(!JSON.stringify(args).includes('fixture-one'));
 assert.throws(()=>childArguments('fixture-session','relative.json'),e=>e.code==='INVALID_SESSION_SETTINGS');
});
test('private builtin receipt validation rejects malformed, duplicate, wildcard and incoherent IDs',()=>{
 const changed=mutate=>{const value=structuredClone(syntheticPlugins);mutate(value);return value;};
 for(const candidate of [
  changed(x=>{x.plugins.pop();}),changed(x=>{x.plugins[1].source=x.plugins[0].source;x.plugins[1].name=x.plugins[0].name;}),
  changed(x=>{x.plugins[0].source='fixture-*@builtin';}),changed(x=>{x.plugins[0].source='fixture-one@other';}),
  changed(x=>{x.plugins[0].path='/private/path';}),changed(x=>{x.plugins[0].name='bad\nname';}),
 ])assert.throws(()=>pluginDisableSettings(candidate),e=>e.code==='INVALID_PRIVATE_PLUGIN_RECEIPT');
});
test('session settings are private, exclusive, owner-scoped and retained until explicit cleanup',async()=>{
 const dir=await mkdtemp('/tmp/cevra-plugin-settings-test-');
 const receipt=`${dir}/receipt.json`;
 try{
  await writeFile(receipt,JSON.stringify(syntheticPlugins),{flag:'wx',mode:0o600});
  const settings=await createSessionPluginSettings(dir,receipt);
  assert.equal((await lstat(settings.path)).mode&0o777,0o600);
  assert.deepEqual(JSON.parse(await readFile(settings.path,'utf8')),pluginDisableSettings(syntheticPlugins));
  await assert.rejects(createSessionPluginSettings(dir,receipt),e=>e.code==='EEXIST');
  assert.deepEqual(await loadPluginDisableSettings(receipt),pluginDisableSettings(syntheticPlugins));
  await settings.cleanup();
  await assert.rejects(lstat(settings.path),e=>e.code==='ENOENT');
  await symlink(receipt,settings.path);
  await assert.rejects(createSessionPluginSettings(dir,receipt),e=>e.code==='EEXIST');
  await unlink(settings.path);
  await symlink(receipt,`${dir}/linked-receipt.json`);
  await assert.rejects(loadPluginDisableSettings(`${dir}/linked-receipt.json`),e=>e.code==='INVALID_PRIVATE_PLUGIN_RECEIPT');
  await unlink(`${dir}/linked-receipt.json`);
 }finally{await unlink(receipt);await rmdir(dir);}
});
test('minimal environment excludes inherited credentials/endpoints',()=>{
 const env=childEnvironment('/fixture-home');
 assert.deepEqual(Object.keys(env).sort(),['DISABLE_AUTOUPDATER','HOME','LANG','PATH']);
 assert.equal(env.DISABLE_AUTOUPDATER,'1');
});
test('real child uses pipes/stdin/external temp cwd and no shell; Unicode survives fragmented stream',async()=>{
 const result=await run('utf8');assert.match(result.result,/Café — ação 🎬/);assert.equal(result.metrics.childClosed,true);
 assert.equal(result.metrics.stdinBytes,Buffer.byteLength(payload));
});
for(const [mode,code] of [['auth','PROCESS_EXIT'],['tools','CONTAINMENT'],['tool','CONTAINMENT'],['permission','CONTAINMENT'],['stderr','STDERR_LIMIT'],['line','LINE_LIMIT'],['events','EVENT_LIMIT'],['duplicate','LATE_EVENT'],['partial','PARTIAL_EOF'],['model','MODEL_UNAVAILABLE'],['correlation','CORRELATION'],['error','PROVIDER_RESULT_ERROR'],['response','RESPONSE_LIMIT']]){
 test(`reject ${mode}; no retry`,async()=>{await assert.rejects(run(mode),e=>e.code===code);});
}
test('bounded timeout reaps child that ignores TERM',async()=>{
 const start=performance.now();await assert.rejects(run('ignore-term',{timeoutMs:200}),e=>e.code==='TIMEOUT'&&e.metrics.childClosed);assert(performance.now()-start<4000);
});
test('cancel active child and discard late/absent result',async()=>{
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),150);
 try{await assert.rejects(run('slow',{signal:controller.signal}),e=>e.code==='CANCELLED'&&e.metrics.childClosed);}finally{clearTimeout(timer);}
});
test('already aborted does not spawn',async()=>{const c=new AbortController();c.abort();let calls=0;await assert.rejects(runClaudeProcess({signal:c.signal},()=>calls++),e=>e.code==='CANCELLED');assert.equal(calls,0);});
test('stdout hard cap precedes parse; invalid UTF8; partial EOF; missing init',()=>{
 assert.throws(()=>new ClaudeStreamReader('x',{...LIMITS,stdout:2}).push(Buffer.from('abc')),e=>e.code==='STDOUT_LIMIT');
 assert.throws(()=>new ClaudeStreamReader('x').push(Buffer.from([255,10])),e=>e.code==='INVALID_EVENT');
 assert.throws(()=>new ClaudeStreamReader('x').push(Buffer.from('{"type":"result","session_id":"x"}\n')),e=>e.code==='MISSING_INIT');
});
test('invalid semantic JSON is not repaired by transport',async()=>{assert.equal((await run('json')).result,'not json');});
test('complete-looking result is not accepted before child settlement/cancellation',async()=>{
 const c=new AbortController();const timer=setTimeout(()=>c.abort(),200);
 try{await assert.rejects(run('late-close',{signal:c.signal}),e=>e.code==='CANCELLED'&&e.metrics.childClosed);}finally{clearTimeout(timer);}
});
test('process death fails without retry',async()=>{await assert.rejects(run('death'),e=>e.code==='PROCESS_EXIT');});
test('rejected initialization retains only non-content shape diagnostics',async()=>{
 await assert.rejects(run('tools'),e=>{
  assert.equal(e.metrics.initFailureReason,'INIT_TOOLS_NONEMPTY');
  assert.deepEqual(e.metrics.lastEventSummary.tools,{present:true,kind:'array',count:1});
  assert.deepEqual(e.metrics.lastEventSummary.mcp_servers,{present:true,kind:'array',count:0});
  assert(!JSON.stringify(e.metrics).includes('Café'));assert.equal(e.metrics.stdinBytes,Buffer.byteLength(payload));return e.code==='CONTAINMENT';
 });
});
test('operator-only init capture stops and reaps before any answer; normal gate still rejects plugins',async()=>{
 let captured;
 await assert.rejects(run('diagnostic-plugins',{diagnosticInit:e=>{captured=captureInitPlugins(e);}}),e=>{
  assert.equal(e.code,'DIAGNOSTIC_STOP');assert.equal(e.metrics.childClosed,true);
  assert(!JSON.stringify(e.metrics).includes('private-one'));return true;
 });
 assert.equal(captured.plugins.length,2);
 assert.equal(captured.plugins[0].id,'private-one@fixture');
 assert.equal(captured.plugins[0].otherFieldCount,1);
 assert(!JSON.stringify(captured).includes('DO NOT COPY'));
 assert(!JSON.stringify(publicInitShape(captured)).includes('private-one'));
 await assert.rejects(run('diagnostic-plugins'),e=>e.code==='CONTAINMENT'&&e.reason==='INIT_PLUGINS_NONEMPTY');
 let clean;
 await assert.rejects(run('utf8',{diagnosticInit:e=>{clean=captureInitPlugins(e);}}),e=>e.code==='DIAGNOSTIC_STOP');
 assert.equal(clean.plugins.length,0);
});
test('private receipt is exclusive, mode-restricted and rejects symlink; metadata bounds are closed',async()=>{
 const dir=await mkdtemp('/tmp/cevra-init-diagnostic-test-');
 try{
  const result=captureInitPlugins({type:'system',subtype:'init',plugins:[{name:'private',unknown:'hidden'}]});
  await writePrivateInitReceipt(dir,'diagnostic.json',result);
  assert.equal((await lstat(`${dir}/diagnostic.json`)).mode&0o777,0o600);
  assert.deepEqual(JSON.parse(await readFile(`${dir}/diagnostic.json`,'utf8')),result);
  await assert.rejects(writePrivateInitReceipt(dir,'diagnostic.json',result),e=>e.code==='EEXIST');
  await symlink(`${dir}/diagnostic.json`,`${dir}/symlink.json`);
  await assert.rejects(writePrivateInitReceipt(dir,'symlink.json',result),e=>e.code==='EEXIST');
  assert.throws(()=>captureInitPlugins({type:'system',subtype:'init',plugins:Array(9).fill('x')}),e=>e.code==='DIAGNOSTIC_METADATA_LIMIT');
  assert.throws(()=>captureInitPlugins({type:'system',subtype:'init',plugins:[{path:'x'.repeat(1025)}]}),e=>e.code==='DIAGNOSTIC_METADATA_LIMIT');
  await unlink(`${dir}/symlink.json`);await unlink(`${dir}/diagnostic.json`);
 }finally{await rmdir(dir);}
});
test('every init field reports a closed reason without changing pass/fail semantics',()=>{
 const base={type:'system',subtype:'init',session_id:'fixture-session',
  tools:[],mcp_servers:[],plugins:[],skills:[],permissionMode:'default',model:'claude-opus-fixture'};
 const reader=event=>{const r=new ClaudeStreamReader('fixture-session');
  try{r.push(Buffer.from(JSON.stringify(event)+'\n'));return {reader:r};}
  catch(error){return {reader:r,error};}
 };
 const mutation=(field,change)=>{const e=structuredClone(base);change(e);const {reader:r,error}=reader(e);
  return {r,error,summary:r.lastEventSummary?.[field]};};
 const privateName='PRIVATE_TOKEN_SHOULD_NEVER_LEAK';
 for(const [field,prefix] of [['tools','INIT_TOOLS'],['mcp_servers','INIT_MCP']]){
  let result=mutation(field,e=>{delete e[field];});
  assert.equal(result.error?.code,'CONTAINMENT');assert.equal(result.error?.reason,`${prefix}_MISSING`);
  assert.deepEqual(result.summary,{present:false,kind:'missing',count:null});
  result=mutation(field,e=>{e[field]={secret:privateName};});
  assert.equal(result.error?.reason,`${prefix}_WRONG_TYPE`);
  assert.deepEqual(result.summary,{present:true,kind:'object',count:null});
  result=mutation(field,e=>{e[field]=[privateName];});
  assert.equal(result.error?.reason,`${prefix}_NONEMPTY`);
  assert.deepEqual(result.summary,{present:true,kind:'array',count:1});
  assert(!JSON.stringify({error:result.error.message,reason:result.error.reason,metrics:result.r.lastEventSummary}).includes(privateName));
  result=mutation(field,e=>{e[field]=[];});
  assert.equal(result.error,undefined);assert.equal(result.r.initialized,true);
 }
 for(const [field,prefix] of [['plugins','INIT_PLUGINS'],['skills','INIT_SKILLS']]){
  let result=mutation(field,e=>{delete e[field];});
  assert.equal(result.error,undefined);assert.deepEqual(result.summary,{present:false,kind:'missing',count:null});
  result=mutation(field,e=>{e[field]=[];});
  assert.equal(result.error,undefined);assert.deepEqual(result.summary,{present:true,kind:'array',count:0});
  result=mutation(field,e=>{e[field]={secret:privateName};});
  assert.equal(result.error?.reason,`${prefix}_WRONG_TYPE`);
  assert.deepEqual(result.summary,{present:true,kind:'object',count:null});
  result=mutation(field,e=>{e[field]=[privateName];});
  assert.equal(result.error?.reason,`${prefix}_NONEMPTY`);
  assert.deepEqual(result.summary,{present:true,kind:'array',count:1});
  assert(!JSON.stringify({error:result.error.message,reason:result.error.reason,metrics:result.r.lastEventSummary}).includes(privateName));
 }
 let result=mutation('permissionMode',e=>{e.permissionMode='default';});
 assert.equal(result.error,undefined);assert.equal(result.r.lastEventSummary.permissionsBypassed,false);
 result=mutation('permissionMode',e=>{e.permissionMode='bypassPermissions';});
 assert.equal(result.error?.reason,'INIT_PERMISSION_BYPASS');assert.equal(result.r.lastEventSummary.permissionsBypassed,true);
 result=mutation('model',e=>{e.model='claude-opus-fixture';});
 assert.equal(result.error,undefined);assert.equal(result.r.lastEventSummary.model.class,'allowed-opus');
 result=mutation('model',e=>{e.model=privateName;});
 assert.equal(result.error?.code,'MODEL_UNAVAILABLE');assert.equal(result.error?.reason,'INIT_MODEL_INVALID');
 assert.equal(result.r.lastEventSummary.model.class,'unproven');
 assert(!JSON.stringify(result.r.lastEventSummary).includes(privateName));
 const driftReader=new ClaudeStreamReader('fixture-session');driftReader.model='claude-opus-previous';
 assert.throws(()=>driftReader.push(Buffer.from(JSON.stringify(base)+'\n')),
  e=>e.code==='MODEL_DRIFT'&&e.reason==='INIT_MODEL_DRIFT');
});
test('large stdin uses stream buffering/backpressure without truncating input',async()=>{
 const large=JSON.stringify({context:{contextId:'test',evidence:[{reference:'E1',text:'ç'.repeat(60000)}]}});
 const result=await run('utf8',{payload:large});assert.equal(result.metrics.stdinBytes,Buffer.byteLength(large));
});

import {SemanticEditorialAnalysisService} from '@cevra/application';
import {fixture} from './fixtures.mjs';
function service(mode,history,onSpawn=()=>{}){
 let calls=0;
 const adapter=new ClaudePocAnalyzer({binary:'/fixture-only',home:'/fixture-home'},{verifyBinary:async()=>{},runProcess:opts=>runClaudeProcess(opts,(bin,args,options)=>{
  calls++;assert(options.cwd.startsWith('/tmp/cevra-claude-poc-'));assert.equal(options.shell,false);onSpawn();return runner(mode)(bin,args,options);
 })});
 return {app:new SemanticEditorialAnalysisService({history,analyzer:adapter}),adapter,calls:()=>calls};
}
test('real Application/history/projection round-trip is immutable and preserves history/redo',async()=>{
 const {history,ids}=fixture();history.commit({type:'project.rename',name:'redo retained'});history.undo();
 const before=JSON.stringify(history.toArchive());const {app,calls}=service('utf8',history);
 const result=await app.analyze({sourceIds:ids});assert.equal(result.kind,'analysis-candidate');assert(result.evidence.length);assert(Object.isFrozen(result.candidate));
 assert.equal(JSON.stringify(history.toArchive()),before);assert(history.canRedo);assert.equal(calls(),1);
});
test('Application uses session-only override through child settlement; normal init gate remains unchanged',async()=>{
 const privateDir=await mkdtemp('/tmp/cevra-plugin-adapter-test-');
 const receipt=`${privateDir}/receipt.json`;
 try{
  await writeFile(receipt,JSON.stringify(syntheticPlugins),{flag:'wx',mode:0o600});
  const {history,ids}=fixture();history.commit({type:'project.rename',name:'redo retained'});history.undo();
  const before=JSON.stringify(history.toArchive());let calls=0,seenCwd;
  const adapter=new ClaudePocAnalyzer({binary:'/fixture-only',home:'/fixture-home',pluginOverrideReceipt:receipt},
   {verifyBinary:async()=>{},runProcess:async opts=>{
    calls++;seenCwd=opts.cwd;
    assert.equal(opts.settingsPath,`${opts.cwd}/session-settings.json`);
    assert.deepEqual(JSON.parse(await readFile(opts.settingsPath,'utf8')),pluginDisableSettings(syntheticPlugins));
    return runClaudeProcess(opts,runner('utf8'));
   }});
  const app=new SemanticEditorialAnalysisService({history,analyzer:adapter});
  assert.equal((await app.analyze({sourceIds:ids})).kind,'analysis-candidate');
  assert.equal(calls,1);assert.equal(JSON.stringify(history.toArchive()),before);assert(history.canRedo);
  await assert.rejects(lstat(seenCwd),e=>e.code==='ENOENT');
  const blocked=new ClaudePocAnalyzer({binary:'/fixture-only',home:'/fixture-home',pluginOverrideReceipt:receipt},
   {verifyBinary:async()=>{},runProcess:opts=>runClaudeProcess(opts,runner('diagnostic-plugins'))});
  const blockedApp=new SemanticEditorialAnalysisService({history,analyzer:blocked});
  await assert.rejects(blockedApp.analyze({sourceIds:ids}),e=>e.code==='SEMANTIC_ANALYSIS_ANALYZER_UNAVAILABLE');
  assert.equal(blocked.receipts[0].initFailureReason,'INIT_PLUGINS_NONEMPTY');
  assert(!JSON.stringify(blocked.receipts).includes('fixture-one'));
  assert.equal(JSON.stringify(history.toArchive()),before);
 }finally{await unlink(receipt);await rmdir(privateDir);}
});
for(const [mode,code] of [['citation','SEMANTIC_ANALYSIS_INVALID_EVIDENCE'],['json','SEMANTIC_ANALYSIS_INVALID_OUTPUT']])test(`Application rejects ${mode} without mutation`,async()=>{
 const {history,ids}=fixture();const before=JSON.stringify(history.toArchive());const {app}=service(mode,history);
 await assert.rejects(app.analyze({sourceIds:ids}),e=>e.code===code);assert.equal(JSON.stringify(history.toArchive()),before);
});
test('history commit-undo while adapter awaits is STALE, not accepted',async()=>{
 const {history,ids}=fixture();const {app}=service('utf8',history,()=>{history.commit({type:'project.rename',name:'changed'});history.undo();});
 await assert.rejects(app.analyze({sourceIds:ids}),e=>e.code==='SEMANTIC_ANALYSIS_STALE');
});
test('EN-US uses real Application boundary without modifying history',async()=>{
 const {history,ids}=fixture('en-US');const before=JSON.stringify(history.toArchive());const {app}=service('utf8',history);
 assert.equal((await app.analyze({sourceIds:ids,locale:'en-US'})).kind,'analysis-candidate');assert.equal(JSON.stringify(history.toArchive()),before);
});
test('real Application continuation opens two independent children, no third invocation',async()=>{
 const {history,ids}=fixture('pt-BR',{0:Array.from({length:30},(_,i)=>`Contexto ${i}: `+'embalagem '.repeat(45))});
 const adapter=new ClaudePocAnalyzer({binary:'/fixture-only',home:'/fixture-home'},{verifyBinary:async()=>{},runProcess:opts=>runClaudeProcess(opts,runner('needs'))});
 const app=new SemanticEditorialAnalysisService({history,analyzer:adapter,initialContextMaxBytes:4096});
 const before=JSON.stringify(history.toArchive());const result=await app.analyze({sourceIds:ids});
 assert.equal(result.reason,'invocation-limit');assert.equal(adapter.receipts.length,2);assert.equal(result.provenance.invocationCount,2);
 assert(result.provenance.requestBytes.reduce((a,b)=>a+b,0)<=262144);assert.equal(JSON.stringify(history.toArchive()),before);
});
