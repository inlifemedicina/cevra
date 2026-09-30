// Operator-only synthetic experiment. CI never invokes this file.
import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {SemanticEditorialAnalysisService} from '@cevra/application';
import {ClaudePocAnalyzer,childEnvironment,verifyBinary,runClaudeProcess} from './transport.mjs';
import {captureInitPlugins,publicInitShape,writePrivateInitReceipt} from './init-diagnostic.mjs';
import {writePrivateEventReceipt} from './event-diagnostic.mjs';
import {loadPluginDisableSettings} from './session-plugin-override.mjs';
import {ensureEvidenceDirectory,evidencePath,inspectExperiment,readCheckpoint,recoverExperiment,
  reserveAttempt,withExperimentLock,writeAttemptReceipt} from './experiment-store.mjs';
import {fixture,PHRASES} from './test/fixtures.mjs';
import {PLAYBOOK_VERSION} from './playbook.mjs';

const execFileAsync=promisify(execFile);
const mode=process.argv[2];
if(!['recover','status','diagnostic','pt','en'].includes(mode))throw Error('EXPERIMENT_MODE_REQUIRED');
const home=process.env.HOME;
const directory=mode==='recover'?await ensureEvidenceDirectory(home):evidencePath(home);
const binary=join(home,'Library/Application Support/CEVRA/DeveloperTools/claude-code/2.1.280/claude');

async function privateJson(path){
  const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const s=await h.stat();if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>256*1024)
    throw Error('PRIVATE_EVIDENCE_INVALID');return JSON.parse(await h.readFile('utf8'));}
  finally{await h.close();}
}
async function privateWrite(path,value){
  const h=await open(path,'wx',0o600);
  try{await h.writeFile(JSON.stringify(value,null,2));await h.sync();}finally{await h.close();}
}
if(mode==='recover'){
  await recoverExperiment(directory);
  const state=await inspectExperiment(directory);
  console.log(JSON.stringify({origin:state.checkpoint.origin,historicalDebited:5,
    originalReceipts:'unavailable',used:state.used,remaining:state.remaining},null,2));
}else if(mode==='status'){
  const state=await inspectExperiment(directory);
  console.log(JSON.stringify({historicalDebited:5,used:state.used,remaining:state.remaining,
    reservations:state.reservations.map(r=>({number:r.number,purpose:r.purpose}))},null,2));
}else{
  await withExperimentLock(directory,async()=>{
    await readCheckpoint(directory);
    const state=await inspectExperiment(directory);
    if(mode==='diagnostic'&&state.used!==5||mode==='pt'&&state.used!==6||mode==='en'&&state.used!==7)
      throw Error('EXPERIMENT_SEQUENCE');
    if(state.remaining<1)throw Error('EXPERIMENT_BUDGET_EXHAUSTED');
    await verifyBinary(binary);
    const {stdout}=await execFileAsync(binary,['auth','status','--json'],{
      env:childEnvironment(home),timeout:15000,maxBuffer:16384});
    let auth;try{auth=JSON.parse(stdout);}catch{throw Error('AUTH_STATUS_INVALID');}
    if(auth.loggedIn!==true||auth.authMethod!=='claude.ai'||auth.apiProvider!=='firstParty')
      throw Error('AUTH_STATUS_NOT_SUBSCRIPTION');
    let overrideReceipt;
    if(mode!=='diagnostic'){
      overrideReceipt=join(directory,'plugin-metadata-6.json');
      await loadPluginDisableSettings(overrideReceipt);
      const prior=await privateJson(join(directory,'attempt-6-receipt.json'));
      if(prior.error!=='DIAGNOSTIC_STOP')throw Error('PLUGIN_DIAGNOSTIC_NOT_ACCEPTED');
    }
    if(mode==='en'){
      const prior=await privateJson(join(directory,'analysis-pt.json'));
      if(prior.status!=='accepted'||prior.result?.kind!=='analysis-candidate'||!prior.historyUnchanged||!prior.redoPreserved)
        throw Error('PT_GATE_NOT_ACCEPTED');
    }
    const locale=mode==='en'?'en-US':'pt-BR';
    if(mode==='diagnostic')PHRASES[locale][0]=['A caixa tem uma etiqueta de rastreamento.'];
    else PHRASES[locale][1]=PHRASES[locale][1].slice(0,2); // No deliberately visual-only passage in this proof.
    const {history,ids}=fixture(locale);
    history.commit({type:'project.rename',name:'synthetic redo checkpoint'});history.undo();
    const before=JSON.stringify(history.toArchive());
    const responses=[];let privateInit;let budgetExhausted=false;
    const analyzer=new ClaudePocAnalyzer({binary,home,pluginOverrideReceipt:overrideReceipt},{verifyBinary,
      runProcess:async options=>{
        if(mode==='diagnostic'&&responses.length)throw Error('DIAGNOSTIC_SINGLE_PROCESS');
        let reservation;
        try{reservation=await reserveAttempt(directory,mode==='diagnostic'?'plugin-diagnostic':
          mode==='pt'?'pt-analysis':'en-analysis');}
        catch(e){if(e.code==='EXPERIMENT_BUDGET_EXHAUSTED')budgetExhausted=true;throw e;}
        try{
          const result=await runClaudeProcess({...options,...(mode==='diagnostic'?{
            diagnosticInit:event=>{privateInit=captureInitPlugins(event);}}:{})});
          if(mode!=='diagnostic')await writePrivateEventReceipt(directory,`${mode}-${reservation.number}-private.json`,result.privateDiagnostic);
          const receipt={status:'transport-complete',metrics:result.metrics};
          responses.push({number:reservation.number,...receipt});
          await writeAttemptReceipt(directory,reservation,receipt);
          return result;
        }catch(e){
          if(mode==='diagnostic'&&privateInit){
            // Validate before persisting, then keep exact current IDs private.
            const {pluginDisableSettings}=await import('./session-plugin-override.mjs');
            pluginDisableSettings(privateInit);
            await writePrivateInitReceipt(directory,'plugin-metadata-6.json',privateInit);
          }
          if(mode!=='diagnostic'&&e.privateDiagnostic)
            await writePrivateEventReceipt(directory,`${mode}-${reservation.number}-private.json`,e.privateDiagnostic);
          const receipt={status:'rejected',error:e.code??'UNCLASSIFIED',metrics:e.metrics};
          responses.push({number:reservation.number,...receipt});
          await writeAttemptReceipt(directory,reservation,receipt);
          throw e;
        }
      }});
    const brief=mode==='diagnostic'?'Devolva uma observação textual mínima citada, no contrato fornecido, sem ferramentas.':
      mode==='pt'?'Identifique ideias e relações textuais, preservando condições e incertezas. Não escolha takes ou cortes.':
        'Identify textual ideas and relations, preserving conditions and uncertainty. Do not select takes or cuts.';
    // Review rubric fixed before inference and not sent to the model:
    // condition = payment approved + stock; dispatch != arrival; after-noon complements before-noon;
    // citations must be relevant; no take selection/cuts; no visual claim.
    const app=new SemanticEditorialAnalysisService({history,analyzer,timeoutMs:120000});
    const started=performance.now();
    const summary={version:1,mode,locale,playbook:PLAYBOOK_VERSION,requestedModel:'opus',requestedEffort:'medium'};
    try{
      const result=await app.analyze({sourceIds:mode==='diagnostic'?[ids[0]]:ids,locale,brief});
      summary.status='accepted';summary.result=result;
    }catch(e){summary.status=budgetExhausted?'needs-evidence-experiment-budget-exhausted':'rejected';
      summary.error=e.code??'UNCLASSIFIED';}
    finally{
      while(analyzer.active)await new Promise(resolve=>setTimeout(resolve,25));
      summary.latencyMs=performance.now()-started;summary.responses=responses;
      summary.historyUnchanged=JSON.stringify(history.toArchive())===before;
      summary.redoPreserved=history.canRedo;
      await verifyBinary(binary);
      await privateWrite(join(directory,mode==='diagnostic'?'diagnostic-6-summary.json':`analysis-${mode}.json`),summary);
    }
    const final=await inspectExperiment(directory);
    console.log(JSON.stringify({mode,status:summary.status,error:summary.error,kind:summary.result?.kind,
      attempts:responses.map(r=>({number:r.number,status:r.status,error:r.error,model:r.metrics?.model,
        initFailureReason:r.metrics?.initFailureReason,childClosed:r.metrics?.childClosed,
        envelopeBytes:r.metrics?.envelopeBytes,latencyMs:r.metrics?.latencyMs,usage:r.metrics?.usage})),
      used:final.used,remaining:final.remaining,historyUnchanged:summary.historyUnchanged,
      redoPreserved:summary.redoPreserved,...(privateInit?{privateInitShape:publicInitShape(privateInit)}:{})},null,2));
  });
}
