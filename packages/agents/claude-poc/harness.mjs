// Operator-only, synthetic, real-client harness. NEVER invoked by CI.
import {readFile,writeFile,open,lstat} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {spawn} from 'node:child_process';
import {SemanticEditorialAnalysisService} from '@cevra/application';
import {ClaudePocAnalyzer,verifyBinary,runClaudeProcess} from './transport.mjs';
import {captureInitPlugins,publicInitShape,writePrivateInitReceipt} from './init-diagnostic.mjs';
import {fixture,PHRASES} from './test/fixtures.mjs';
import {PLAYBOOK_VERSION} from './playbook.mjs';

const [name,directory]=process.argv.slice(2);
if(!['canary','diagnostic','canary-4','pt','en','cancel'].includes(name)||!directory||!isAbsolute(directory))throw Error('CASE_AND_PRIVATE_DIRECTORY_REQUIRED');
const stat=await lstat(directory);
if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077))throw Error('PRIVATE_DIRECTORY_REQUIRED');
const lock=await open(join(directory,'execution.lock'),'wx',0o600);
const binary=join(process.env.HOME,'Library/Application Support/CEVRA/DeveloperTools/claude-code/2.1.280/claude');
const ledgerPath=join(directory,'ledger.json');
let ledger;
try{ledger=JSON.parse(await readFile(ledgerPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;ledger={version:1,attempts:[]};}
if(ledger.version!==1||!Array.isArray(ledger.attempts))throw Error('INVALID_LEDGER');
const secondCanary=name==='canary'&&ledger.attempts.length===1&&ledger.attempts[0].number===1&&ledger.attempts[0].case==='canary';
const diagnostic=name==='diagnostic';
const correctiveCanary=name==='canary-4';
if(diagnostic&&!(ledger.attempts.length===2&&ledger.attempts.every((a,i)=>a.number===i+1&&a.case==='canary')))throw Error('DIAGNOSTIC_LEDGER_GATE');
if(correctiveCanary&&!(ledger.attempts.length===3&&ledger.attempts.every((a,i)=>a.number===i+1&&a.case===(i<2?'canary':'diagnostic'))))throw Error('CORRECTIVE_CANARY_LEDGER_GATE');
if(ledger.attempts.some(a=>a.case===name)&&!secondCanary)throw Error('CASE_ALREADY_ATTEMPTED');
if(secondCanary){
 const first=JSON.parse(await readFile(join(directory,'canary.json'),'utf8'));
 if(first.status!=='rejected'||first.responses?.[0]?.error!=='CONTAINMENT')throw Error('FIRST_CANARY_MISMATCH');
}
const receiptPath=join(directory,secondCanary?'canary-2.json':diagnostic?'diagnostic-3.json':`${name}.json`);
try{await lstat(receiptPath);throw Error('CASE_RECEIPT_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
if(diagnostic){
 for(const prior of ['canary.json','canary-2.json']){
  const receipt=JSON.parse(await readFile(join(directory,prior),'utf8'));
  if(receipt.status!=='rejected'||receipt.responses?.[0]?.error!=='CONTAINMENT')throw Error('PRIOR_CANARY_MISMATCH');
 }
 try{await lstat(join(directory,'diagnostic-3-private.json'));throw Error('PRIVATE_RECEIPT_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
}
if(correctiveCanary){
 const diagnosticReceipt=JSON.parse(await readFile(join(directory,'diagnostic-3.json'),'utf8'));
 if(diagnosticReceipt.responses?.[0]?.error!=='DIAGNOSTIC_STOP')throw Error('DIAGNOSTIC_GATE');
}
if(!['canary','diagnostic','canary-4'].includes(name)){
 const canary=JSON.parse(await readFile(join(directory,'canary-4.json'),'utf8'));
 if(canary.status!=='accepted'||canary.result.kind!=='analysis-candidate'||!canary.historyUnchanged||!canary.redoPreserved)throw Error('CANARY_GATE');
 if(name==='pt'&&ledger.attempts.length!==4)throw Error('MATRIX_ORDER');
 if(name==='en'&&!(ledger.attempts.length===5&&ledger.attempts.at(-1).case==='pt'&&ledger.attempts.filter(a=>a.case==='pt').length===1))throw Error('MATRIX_ORDER');
 if(name==='cancel'&&!(ledger.attempts.length===6&&ledger.attempts.at(-1).case==='en'))throw Error('MATRIX_ORDER');
}
const locale=name==='en'?'en-US':'pt-BR';
const extra={};
if(name==='canary'||diagnostic||correctiveCanary)PHRASES[locale][0]=['A caixa tem uma etiqueta de rastreamento.'];
const {history,ids}=fixture(locale,extra);
history.commit({type:'project.rename',name:'synthetic redo checkpoint'});history.undo();
const before=JSON.stringify(history.toArchive());
const controller=new AbortController();let cancelTimer;
const responses=[];
let callsThisRun=0;
let privateInit;
const overrideReceipt=join(directory,'diagnostic-3-private.json');
const adapter=new ClaudePocAnalyzer({binary,home:process.env.HOME,...(correctiveCanary||['pt','en','cancel'].includes(name)?{pluginOverrideReceipt:overrideReceipt}:{})},{verifyBinary,runProcess:async options=>{
 if((name==='canary'||diagnostic||correctiveCanary)&&callsThisRun!==0)throw Error('CANARY_SINGLE_EXECUTION');
 if(ledger.attempts.length>=7)throw Error('REAL_EXECUTION_QUOTA'); // #8 is reserved, not automatically authorized.
 if(['pt','en'].includes(name)&&ledger.attempts.length+2>7)throw Error('CONTINUATION_SLOT_REQUIRED');
 callsThisRun++;
 const attempt={number:ledger.attempts.length+1,case:name,attemptId:diagnostic?'init-metadata-3':correctiveCanary?'session-override-4':undefined,startedAt:new Date().toISOString()};
 ledger.attempts.push(attempt);await writeFile(ledgerPath,JSON.stringify(ledger,null,2),{mode:0o600});
 try{
  const result=await runClaudeProcess({...options,...(diagnostic?{diagnosticInit:event=>{privateInit=captureInitPlugins(event);}}:{})},(bin,args,opts)=>{
   const child=spawn(bin,args,opts);
   if(name==='cancel')child.once('spawn',()=>{cancelTimer=setTimeout(()=>controller.abort(),1500);});
   return child;
  });
  responses.push({attempt:attempt.number,...(name==='canary'||correctiveCanary?{}:{finalText:result.result}),metrics:result.metrics});return result;
 }catch(e){
  if(diagnostic&&privateInit)await writePrivateInitReceipt(directory,'diagnostic-3-private.json',privateInit);
  responses.push({attempt:attempt.number,error:e.code??'UNCLASSIFIED',metrics:e.metrics});throw e;
 }
 finally{clearTimeout(cancelTimer);}
}});
let brief='Identifique as ideias e relações sustentadas pelo texto, preservando condições e incertezas. Não escolha takes nem cortes. Analise o que for textual e registre limites do que dependeria de imagem.';
if(name==='en')brief='Identify ideas and relations supported by the text, preserving conditions and uncertainty. Do not select takes or cuts. Analyze textual evidence and record the limits of any image-dependent passage.';
if(name==='canary'||diagnostic||correctiveCanary)brief='Devolva uma observação textual mínima citada, no contrato fornecido, sem ferramentas.';
const app=new SemanticEditorialAnalysisService({history,analyzer:adapter,timeoutMs:120000});
const started=performance.now();const record={version:1,case:name,playbook:PLAYBOOK_VERSION,requestedModel:'opus',requestedEffort:'medium'};
try{
 const result=await app.analyze({sourceIds:name==='canary'||diagnostic||correctiveCanary?[ids[0]]:ids,locale,brief},controller.signal);
 record.result=name==='canary'||correctiveCanary?{kind:result.kind,observationCount:result.kind==='analysis-candidate'?result.candidate.observations.length:0,
   evidenceCount:result.evidence?.length??0}:result;
 record.status='accepted';
}
catch(e){record.status='rejected';record.error=e.code??'UNCLASSIFIED';}
finally{
 clearTimeout(cancelTimer);
 // Wait for transport settlement after Application's cancellation race.
 while(adapter.active)await new Promise(resolve=>setTimeout(resolve,25));
 record.latencyMs=performance.now()-started;record.responses=responses;record.receipts=adapter.receipts;
 record.historyUnchanged=JSON.stringify(history.toArchive())===before;record.redoPreserved=history.canRedo;
 await verifyBinary(binary);
 await writeFile(receiptPath,JSON.stringify(record,null,2),{flag:'wx',mode:0o600});
 await lock.close();
 const {unlink}=await import('node:fs/promises');await unlink(join(directory,'execution.lock'));
}
console.log(JSON.stringify({case:name,status:record.status,error:record.error,kind:record.result?.kind,reason:record.result?.reason,calls:responses.length,totalCalls:ledger.attempts.length,historyUnchanged:record.historyUnchanged,redoPreserved:record.redoPreserved,receipts:record.receipts,...(diagnostic&&privateInit?{privateInitShape:publicInitShape(privateInit)}:{})},null,2));
