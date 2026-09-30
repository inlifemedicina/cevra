import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdtemp, rmdir } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { userInfo } from 'node:os';
import { PLAYBOOK } from './playbook.mjs';
import {createSessionPluginSettings} from './session-plugin-override.mjs';
import {classifyAuthExplanation} from './auth-diagnostic.mjs';

export const CLAUDE_VERSION = '2.1.280';
export const CLAUDE_SHA256 = '387a5c5dcdbb815085edf0baf79591f9d8894efe922bceaf3d75b1b08055229d';
export const LIMITS = Object.freeze({ line: 1024*1024, stdout: 8*1024*1024, stderr: 256*1024, stderrTail: 64*1024, events: 1024, response: 64*1024 });
export class ClaudePocError extends Error {
  constructor(code) { super(code); this.name = 'ClaudePocError'; this.code = code; }
}
const fail = (code, reason) => { const error=new ClaudePocError(code); if(reason)error.reason=reason; throw error; };
const OPUS=/^claude-opus-[a-z0-9.-]+$/;
const ASSISTANT_ERRORS=Object.freeze({authentication_failed:'PROVIDER_AUTH_ERROR',oauth_org_not_allowed:'PROVIDER_AUTH_ERROR',
  cloud_credential_error:'PROVIDER_AUTH_ERROR',billing_error:'PROVIDER_BILLING_ERROR',
  rate_limit:'PROVIDER_RATE_LIMIT',invalid_request:'PROVIDER_INVALID_REQUEST',server_error:'PROVIDER_SERVER_ERROR',
  model_not_found:'PROVIDER_MODEL_ERROR',overloaded:'PROVIDER_SERVER_ERROR',account_on_hold:'PROVIDER_BILLING_ERROR'});
const TERMINAL_REASONS=['completed','api_error','model_error','max_turns','aborted_streaming','aborted_tools'];
const STOP_REASONS=['end_turn','stop_sequence','tool_use','max_tokens','pause_turn','refusal'];
const kind=value=>value===undefined?'missing':value===null?'null':Array.isArray(value)?'array':typeof value;
const modelClass=value=>typeof value==='string'&&OPUS.test(value)?'allowed-opus':value==='<synthetic>'?'synthetic':'unproven';
function providerError(value,status) {
  const code=typeof value==='string'&&Object.hasOwn(ASSISTANT_ERRORS,value)?ASSISTANT_ERRORS[value]:
    status===401||status===403?'PROVIDER_AUTH_ERROR':status===402?'PROVIDER_BILLING_ERROR':
    status===429?'PROVIDER_RATE_LIMIT':status===400?'PROVIDER_INVALID_REQUEST':
    Number.isInteger(status)&&status>=500&&status<=599?'PROVIDER_SERVER_ERROR':'PROVIDER_ERROR_UNKNOWN';
  return new ClaudePocError(code);
}
// Non-content diagnostic vocabulary: never retain arbitrary event fields/text.
function eventSummary(event) {
  const label=(value,allowed)=>allowed.includes(value)?value:'other';
  const summary={type:label(event.type,['system','assistant','result','rate_limit_event']),
    subtype:label(event.subtype,['init','success','error_max_turns'])};
  for(const field of ['tools','mcp_servers','plugins','skills']) {
    const present=Object.hasOwn(event,field);
    const value=event[field];
    const kind=!present?'missing':Array.isArray(value)?'array':value===null?'null':typeof value;
    summary[field]=Object.freeze({present,kind,count:Array.isArray(value)?value.length:null});
  }
  const location=event.type==='assistant'?'message.model':event.type==='result'?'modelUsage':'model';
  const model=event.type==='assistant'?event.message?.model:event.type==='result'?event.modelUsage:event.model;
  summary.model=Object.freeze({location,present:model!==undefined,kind:kind(model),
    class:event.type==='result'&&model&&typeof model==='object'&&!Array.isArray(model)?
      Object.keys(model).length===1?modelClass(Object.keys(model)[0]):'unproven':modelClass(model)});
  if(event.type==='assistant'){
    const blocks=event.message?.content;
    summary.assistant=Object.freeze({errorCategory:event.error===undefined?'none':providerError(event.error).code,
      errorKind:kind(event.error),aborted:event.aborted===true,stopReason:label(event.message?.stop_reason,STOP_REASONS),
      blocksKind:kind(blocks),blockCount:Array.isArray(blocks)?blocks.length:null,
      textBlocks:Array.isArray(blocks)?blocks.filter(b=>b?.type==='text').length:null,
      prohibitedBlocks:Array.isArray(blocks)?blocks.filter(b=>!['text','thinking','redacted_thinking'].includes(b?.type)).length:null});
  }
  if(event.type==='result') summary.result=Object.freeze({isError:event.is_error===true,isErrorKind:kind(event.is_error),
    apiErrorStatus:Number.isInteger(event.api_error_status)&&event.api_error_status>=100&&event.api_error_status<=599?event.api_error_status:null,
    stopReason:label(event.stop_reason,STOP_REASONS),terminalReason:label(event.terminal_reason,TERMINAL_REASONS),
    errorCount:Array.isArray(event.errors)?event.errors.length:null});
  summary.permissionMode=Object.freeze({present:Object.hasOwn(event,'permissionMode'),
    kind:!Object.hasOwn(event,'permissionMode')?'missing':event.permissionMode===null?'null':typeof event.permissionMode});
  summary.permissionsBypassed=event.permissionMode==='bypassPermissions';
  return Object.freeze(summary);
}
function privateEventSummary(event){
  if(!['assistant','result'].includes(event.type))return undefined;
  const usageModels=event.type==='result'&&event.modelUsage&&typeof event.modelUsage==='object'&&!Array.isArray(event.modelUsage)?
    Object.keys(event.modelUsage):[];
  const model=event.type==='assistant'?event.message?.model:usageModels.length===1?usageModels[0]:undefined;
  const safeModel=typeof model==='string'&&model.length<=128&&(/^[a-z0-9.-]*claude-[a-z0-9.-]+$/.test(model)||model==='<synthetic>')?model:undefined;
  const errorText=event.type==='assistant'&&event.error!==undefined&&Array.isArray(event.message?.content)?
    event.message.content.filter(b=>b?.type==='text'&&typeof b.text==='string').map(b=>b.text).join('\n'):
    event.type==='result'&&event.is_error===true?
      [Array.isArray(event.errors)?event.errors.filter(x=>typeof x==='string').join('\n'):undefined,
        typeof event.result==='string'?event.result:undefined].filter(Boolean).join('\n'):undefined;
  const auth=event.type==='assistant'&&event.error!==undefined||event.type==='result'&&event.is_error===true?
    classifyAuthExplanation({errorCode:event.error,status:event.api_error_status,text:errorText}):undefined;
  return Object.freeze({type:event.type,model:safeModel,modelKind:kind(model),modelHash:model!==undefined&&safeModel===undefined?
    createHash('sha256').update(String(model).slice(0,128)).digest('hex'):undefined,
    error:typeof event.error==='string'&&
      (Object.hasOwn(ASSISTANT_ERRORS,event.error)||['unknown','max_output_tokens','oauth_org_not_allowed','cloud_credential_error'].includes(event.error))?event.error:undefined,
    errorKind:kind(event.error),errorHash:typeof event.error==='string'&&
      !Object.hasOwn(ASSISTANT_ERRORS,event.error)?createHash('sha256').update(event.error.slice(0,256)).digest('hex'):undefined,
    apiErrorStatus:Number.isInteger(event.api_error_status)&&event.api_error_status>=100&&event.api_error_status<=599?event.api_error_status:undefined,
    stopReason:STOP_REASONS.includes(event.type==='assistant'?event.message?.stop_reason:event.stop_reason)?
      event.type==='assistant'?event.message.stop_reason:event.stop_reason:undefined,
    terminalReason:TERMINAL_REASONS.includes(event.terminal_reason)?event.terminal_reason:undefined,
    usageModelCount:usageModels.length,isError:event.is_error===true,errorTextPresent:errorText!==undefined&&errorText.length>0,
    errorTextHash:errorText?createHash('sha256').update(errorText).digest('hex'):undefined,
    authExplanationCategory:auth?.category,authExplanationEvidence:auth?.evidence,
    authStatusPresent:auth?.statusPresent});
}
export function childEnvironment(home) {
  if (!isAbsolute(home)) fail('INVALID_HOME');
  const username=userInfo().username;
  if(typeof username!=='string'||!username||/[\x00-\x1f\x7f]/.test(username))fail('INVALID_USER_IDENTITY');
  return { HOME: home, USER: username, LOGNAME: username,
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'en_US.UTF-8', DISABLE_AUTOUPDATER: '1' };
}
export function childArguments(sessionId,settingsPath) {
  if(settingsPath!==undefined && !isAbsolute(settingsPath))fail('INVALID_SESSION_SETTINGS');
  return ['--print', '--restricted', '--safe-mode', '--tools', '',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--disallowedTools', 'mcp__*', '--permission-prompts', 'none',
    '--setting-sources', '', '--disable-slash-commands', '--no-chrome',
    '--no-session-persistence', '--max-turns', '1', '--model', 'opus',
    '--effort', 'medium', '--output-format', 'stream-json', '--verbose',
    ...(settingsPath===undefined?[]:['--settings',settingsPath]),
    '--session-id', sessionId, '--system-prompt', PLAYBOOK];
}
export async function verifyBinary(path) {
  if (!isAbsolute(path)) fail('BINARY_PATH');
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o022)) fail('BINARY_PATH');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  if (hash.digest('hex') !== CLAUDE_SHA256) fail('VERSION_DRIFT');
}

// Closed transport reader: never retains thinking blocks or raw event logs.
export class ClaudeStreamReader {
  constructor(sessionId, limits = LIMITS, diagnosticInit) {
    this.sessionId=sessionId; this.limits=limits; this.pending=Buffer.alloc(0);
    this.diagnosticInit=diagnosticInit;
    this.bytes=0; this.events=0; this.initialized=false; this.result=undefined;
    this.model=undefined; this.generatedModel=undefined; this.usage=undefined; this.estimate=undefined;
    this.primaryError=undefined; this.terminal=false;this.privateEvents=[];
  }
  push(chunk) {
    this.bytes += chunk.length;
    if (this.bytes > this.limits.stdout) fail('STDOUT_LIMIT');
    let start=0;
    for (;;) {
      const end=chunk.indexOf(10,start);
      const piece=chunk.subarray(start,end===-1?chunk.length:end);
      if (this.pending.length+piece.length>this.limits.line) fail('LINE_LIMIT');
      this.pending=Buffer.concat([this.pending,piece]);
      if(end===-1) break;
      this.line(this.pending); this.pending=Buffer.alloc(0); start=end+1;
    }
  }
  line(bytes) {
    if(!bytes.length) fail('EMPTY_EVENT');
    if(++this.events>this.limits.events) fail('EVENT_LIMIT');
    let e; try {e=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));} catch {fail('INVALID_EVENT');}
    if (!e || typeof e!=='object' || Array.isArray(e)) fail('INVALID_EVENT');
    this.lastEventSummary=eventSummary(e);
    const privateSummary=privateEventSummary(e);
    if(privateSummary && this.privateEvents.length<8)this.privateEvents.push(privateSummary);
    if(this.terminal) fail('LATE_EVENT');
    if(e.type==='rate_limit_event') {
      // Provider advisory only; never turns a refused/error result into success.
      if(e.session_id!==this.sessionId || !e.rate_limit_info) fail('CORRELATION');
      if(e.rate_limit_info.isUsingOverage===true) fail('EXTRA_USAGE');
      return;
    }
    if(e.session_id!==this.sessionId) fail('CORRELATION');
    if(e.type==='system' && e.subtype==='init') {
      if(this.initialized) fail('DUPLICATE_INIT');
      for(const [field,prefix] of [['tools','INIT_TOOLS'],['mcp_servers','INIT_MCP']]) {
        if(!Object.hasOwn(e,field)) fail('CONTAINMENT',`${prefix}_MISSING`);
        if(!Array.isArray(e[field])) fail('CONTAINMENT',`${prefix}_WRONG_TYPE`);
        if(e[field].length) fail('CONTAINMENT',`${prefix}_NONEMPTY`);
      }
      if(this.diagnosticInit){
        if(e.skills!==undefined && !Array.isArray(e.skills))fail('CONTAINMENT','INIT_SKILLS_WRONG_TYPE');
        if(Array.isArray(e.skills)&&e.skills.length)fail('CONTAINMENT','INIT_SKILLS_NONEMPTY');
        if(e.permissionMode==='bypassPermissions')fail('CONTAINMENT','INIT_PERMISSION_BYPASS');
        this.checkModel(e.model,'init');
        this.diagnosticInit(e);
        fail('DIAGNOSTIC_STOP'); // Capture only after the other init gates; never accept analysis.
      }
      for(const [field,prefix] of [['plugins','INIT_PLUGINS'],['skills','INIT_SKILLS']]) {
        if(e[field]!==undefined && !Array.isArray(e[field])) fail('CONTAINMENT',`${prefix}_WRONG_TYPE`);
        if(Array.isArray(e[field]) && e[field].length) fail('CONTAINMENT',`${prefix}_NONEMPTY`);
      }
      if(e.permissionMode==='bypassPermissions') fail('CONTAINMENT','INIT_PERMISSION_BYPASS');
      this.checkModel(e.model,'init'); this.model=e.model; this.initialized=true; return;
    }
    if(!this.initialized) fail('MISSING_INIT');
    if(e.type==='assistant') {
      if(e.parent_tool_use_id!=null) fail('CONTAINMENT');
      if(!e.message||typeof e.message!=='object'||Array.isArray(e.message)||!Array.isArray(e.message.content))fail('INVALID_EVENT');
      for(const block of e.message.content) {
        if(!block||typeof block!=='object'||!['text','thinking','redacted_thinking'].includes(block.type)) fail('CONTAINMENT');
      }
      if(e.message.stop_reason==='tool_use')fail('CONTAINMENT');
      if(e.error!==undefined){
        if(typeof e.error!=='string')fail('INVALID_EVENT');
        this.primaryError??=providerError(e.error);return;
      }
      if(e.aborted===true){this.primaryError??=new ClaudePocError('PARTIAL_ASSISTANT');return;}
      this.checkModel(e.message.model,'assistant');
      if(!['end_turn','stop_sequence'].includes(e.message.stop_reason))fail('PARTIAL_ASSISTANT');
      if(!e.message.content.some(block=>block.type==='text'&&typeof block.text==='string'&&block.text.length))fail('MODEL_UNPROVEN','NO_GENERATED_TEXT');
      this.generatedModel=e.message.model;
      return; // final result is authoritative; do not concatenate assistant text/deltas.
    }
    if(e.type!=='result') fail('CONTAINMENT');
    if(!Array.isArray(e.permission_denials)||e.permission_denials.length) fail('CONTAINMENT');
    if(e.deferred_tool_use!=null)fail('CONTAINMENT');
    if(e.stop_reason==='tool_use')fail('CONTAINMENT');
    if(e.origin!=null && e.origin.kind!=='human')fail('CORRELATION');
    if(e.errors!=null&&!Array.isArray(e.errors))fail('INVALID_EVENT');
    this.terminal=true;
    if(e.subtype!=='success'||e.is_error!==false||e.api_error_status!=null||Array.isArray(e.errors)&&e.errors.length||
      e.terminal_reason!==undefined&&e.terminal_reason!==null&&e.terminal_reason!=='completed'){
      this.primaryError??=providerError(undefined,e.api_error_status);return;
    }
    if(this.primaryError)return; // An apparently successful result cannot erase a prior assistant error.
    if(e.num_turns!==1) fail('TURN_LIMIT');
    if(!this.generatedModel)fail('MODEL_UNPROVEN','NO_GENERATED_ASSISTANT');
    if(typeof e.result!=='string'||Buffer.byteLength(e.result)>this.limits.response) fail('RESPONSE_LIMIT');
    if(!e.modelUsage || !Object.keys(e.modelUsage).length) fail('MODEL_UNPROVEN');
    for(const model of Object.keys(e.modelUsage)) this.checkModel(model);
    this.result=e.result;
    this.usage={};
    for(const [model,usage] of Object.entries(e.modelUsage)) {
      this.usage[model]={};
      for(const field of ['inputTokens','outputTokens','cacheReadInputTokens','cacheCreationInputTokens']) {
        if(Number.isSafeInteger(usage[field])&&usage[field]>=0) this.usage[model][field]=usage[field];
      }
    }
    if(Number.isFinite(e.total_cost_usd)&&e.total_cost_usd>=0) this.estimate=e.total_cost_usd;
  }
  checkModel(model,origin) {
    if(typeof model!=='string'||!OPUS.test(model)) fail('MODEL_UNAVAILABLE',origin==='init'?'INIT_MODEL_INVALID':
      origin==='assistant'&&model==='<synthetic>'?'ASSISTANT_SYNTHETIC_UNPROVEN':'MODEL_INVALID');
    if(this.model && this.model!==model) fail('MODEL_DRIFT',origin==='init'?'INIT_MODEL_DRIFT':'MODEL_MISMATCH');
  }
  finish() {
    if(this.primaryError)throw this.primaryError;
    if(this.pending.length) fail('PARTIAL_EOF');
    if(this.result===undefined) fail('MISSING_RESULT');
    return this.result;
  }
}

// Internal process seam is only for deterministic tests; no caller/request callback.
export async function runClaudeProcess({binary,home,cwd,payload,signal,timeoutMs=60000,sessionId=randomUUID(),limits=LIMITS,diagnosticInit,settingsPath}, spawnProcess=spawn) {
  if(signal?.aborted) fail('CANCELLED');
  const started=performance.now();
  const reader=new ClaudeStreamReader(sessionId,limits,diagnosticInit);
  const child=spawnProcess(binary,childArguments(sessionId,settingsPath),{cwd,env:childEnvironment(home),shell:false,stdio:['pipe','pipe','pipe']});
  return await new Promise((resolve,reject)=>{
    let error, killTimer, stderrBytes=0, tail=Buffer.alloc(0), closed=false;
    const stop=(code,reason)=>{
      error??=new ClaudePocError(code);
      if(reason && error.code===code) error.reason??=reason;
      if(!closed && killTimer===undefined) {
        child.kill('SIGTERM');
        killTimer=setTimeout(()=>{if(!closed)child.kill('SIGKILL');},1000);
      }
    };
    const abort=()=>stop('CANCELLED');
    const timer=setTimeout(()=>stop('TIMEOUT'),timeoutMs);
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
    child.stdout.on('data',chunk=>{if(error)return;try{reader.push(chunk);}catch(e){stop(e.code??'INVALID_EVENT',e.reason);}});
    child.stderr.on('data',chunk=>{
      stderrBytes+=chunk.length;
      tail=Buffer.concat([tail,chunk.subarray(-limits.stderrTail)]).subarray(-limits.stderrTail);
      if(stderrBytes>limits.stderr) stop('STDERR_LIMIT');
    });
    child.on('error',()=>stop('PROCESS_ERROR'));
    child.stdin.on('error',()=>stop('STDIN_ERROR'));
    child.on('close',(code,terminationSignal)=>{
      closed=true; clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',abort);
      if(signal?.aborted) error??=new ClaudePocError('CANCELLED');
      if(performance.now()-started>=timeoutMs)error??=new ClaudePocError('TIMEOUT');
      error??=reader.primaryError;
      if(code!==0||terminationSignal)error??=new ClaudePocError('PROCESS_EXIT');
      // Never return before process close/reap. No transcript/stderr in errors.
      tail=Buffer.alloc(0);
      if(!error){try{reader.finish();}catch(e){error=e;}}
      if(error){error.metrics={stdoutBytes:reader.bytes,stderrBytes,events:reader.events,
        ...(error.reason?{initFailureReason:error.reason}:{}),
        lastEventSummary:reader.lastEventSummary,envelopeBytes:Buffer.byteLength(payload),
        systemPromptBytes:Buffer.byteLength(PLAYBOOK),stdinBytes:Buffer.byteLength(payload),
        latencyMs:performance.now()-started,childClosed:true};
        Object.defineProperty(error,'privateDiagnostic',{value:Object.freeze([...reader.privateEvents])});
        reject(error);return;}
      try {
        const result=reader.result;
        const accepted={result,metrics:{model:reader.model,requestedAlias:'opus',requestedEffort:'medium',
          envelopeBytes:Buffer.byteLength(payload),systemPromptBytes:Buffer.byteLength(PLAYBOOK),stdinBytes:Buffer.byteLength(payload),
          responseBytes:Buffer.byteLength(result),stdoutBytes:reader.bytes,stderrBytes,events:reader.events,
          latencyMs:performance.now()-started,usage:reader.usage,estimatedUsd:reader.estimate,childClosed:true}};
        Object.defineProperty(accepted,'privateDiagnostic',{value:Object.freeze([...reader.privateEvents])});
        resolve(accepted);
      }catch(e){reject(e);}
    });
    if(!error)child.stdin.end(payload);else child.stdin.destroy();
  });
}

/** @implements {import('@cevra/application').SemanticEditorialAnalyzerPort} */
export class ClaudePocAnalyzer {
  constructor({binary,home,pluginOverrideReceipt}, dependencies={verifyBinary,runProcess:runClaudeProcess}) {
    this.binary=binary;this.home=home;this.pluginOverrideReceipt=pluginOverrideReceipt;
    this.receipts=[];this.active=false;this.dependencies=dependencies;
  }
  async analyze(invocation,context) {
    if(this.active)fail('BUSY');
    this.active=true;
    let cwd,sessionSettings;
    try {
      if(context.signal?.aborted)fail('CANCELLED');
      if(invocation.payloadBytes!==Buffer.byteLength(invocation.payload)||invocation.payloadBytes>256*1024)fail('INPUT_LIMIT');
      await this.dependencies.verifyBinary(this.binary);
      cwd=await mkdtemp('/tmp/cevra-claude-poc-');
      if(this.pluginOverrideReceipt)sessionSettings=await createSessionPluginSettings(cwd,this.pluginOverrideReceipt);
      const result=await this.dependencies.runProcess({binary:this.binary,home:this.home,cwd,payload:invocation.payload,signal:context.signal,
        ...(sessionSettings?{settingsPath:sessionSettings.path}:{})});
      await this.dependencies.verifyBinary(this.binary);
      this.receipts.push(Object.freeze(result.metrics));
      if(context.signal?.aborted)fail('CANCELLED');
      return result.result;
    } catch(error) {
      this.receipts.push(Object.freeze({error:error.code??'UNCLASSIFIED',...error.metrics}));
      throw error;
    } finally {
      try{if(sessionSettings)await sessionSettings.cleanup();}
      finally{
        if(cwd) {try{await rmdir(cwd);}catch{/* Preserve unexpected client files; no recursive deletion. */}}
        this.active=false;
      }
    }
  }
}
