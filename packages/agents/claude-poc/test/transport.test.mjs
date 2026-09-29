import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rmdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {childArguments,childEnvironment,ClaudeStreamReader,runClaudeProcess,ClaudePocAnalyzer,LIMITS} from '../transport.mjs';
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
