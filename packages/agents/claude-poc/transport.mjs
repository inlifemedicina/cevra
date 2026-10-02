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
const RETRY_ERRORS=new Set([...Object.keys(ASSISTANT_ERRORS),'verification_required','unknown','max_output_tokens']);
const FORBIDDEN_SYSTEM=new Set(['compact_boundary','hook_started','hook_progress','hook_response',
  'plugin_install','task_started','task_updated','task_progress','task_notification',
  'background_tasks_changed','permission_denied','memory_recall','local_command_output',
  'commands_changed','conversation_reset','elicitation_complete']);
const FORBIDDEN_TYPES=new Set(['control_request','control_response','control_cancel_request',
  'stream_event','user','tool_progress','tool_use_summary','permission_denied',
  'task_notification','task_started','task_progress','task_updated','plugin_install',
  'memory_recall','local_command_output']);
const kind=value=>value===undefined?'missing':value===null?'null':Array.isArray(value)?'array':typeof value;
const modelClass=value=>typeof value==='string'&&OPUS.test(value)?'allowed-opus':value==='<synthetic>'?'synthetic':'unproven';
const safeProtocolValue=value=>typeof value==='string'&&value.length<=64&&/^[a-z][a-z0-9_]*$/.test(value)?value:undefined;
const boundedInteger=(value,max=1_000_000)=>Number.isSafeInteger(value)&&value>=0&&value<=max;
function protocolTraceEntry(event,phase){
  const entry={phase,type:safeProtocolValue(event.type),typeKind:kind(event.type),
    subtype:safeProtocolValue(event.subtype),subtypeKind:kind(event.subtype)};
  for(const field of ['attempt','max_retries','retry_delay_ms','error_status','estimated_tokens','estimated_tokens_delta']){
    if(Object.hasOwn(event,field))entry[field]=field==='error_status'&&event[field]===null?null:
      boundedInteger(event[field],field.startsWith('estimated_')?100_000_000:1_000_000)?event[field]:undefined;
    entry[`${field}Kind`]=kind(event[field]);
  }
  if(event.type==='system'&&event.subtype==='status')entry.status=event.status===null?null:
    ['requesting','compacting'].includes(event.status)?event.status:undefined;
  if(event.type==='system'&&event.subtype==='session_state_changed')entry.state=
    ['running','idle','requires_action'].includes(event.state)?event.state:undefined;
  if(event.type==='system'&&event.subtype==='api_retry')entry.error=RETRY_ERRORS.has(event.error)?event.error:undefined;
  if(event.type==='assistant')entry.modelClass=modelClass(event.message?.model);
  if(event.type==='result')entry.isError=event.is_error===true;
  if(!entry.type&&event.type!==undefined)entry.typeHash=createHash('sha256').update(String(event.type).slice(0,128)).digest('hex');
  if(!entry.subtype&&event.subtype!==undefined)entry.subtypeHash=createHash('sha256').update(String(event.subtype).slice(0,128)).digest('hex');
  return entry;
}
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
    subtype:label(event.subtype,['init','status','session_state_changed','api_retry','thinking_tokens','success',
      'informational','notification','model_refusal_fallback','model_refusal_no_fallback','elicitation_complete',
      'error_during_execution','error_max_turns','error_max_budget_usd','error_max_structured_output_retries'])};
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
    this.primaryError=undefined; this.terminal=false;this.privateEvents=[];this.protocolTrace=[];
    this.generatedText=false;this.messageId=undefined;this.permissionMode=undefined;
  }
  markDecision(code,reason){
    const last=this.protocolTrace.at(-1);
    if(last&&last.decision===undefined){last.decision=code;if(reason)last.reason=reason;}
  }
  appendTrace(entry){
    if(this.protocolTrace.length>=24)this.protocolTrace.splice(1,1);
    this.protocolTrace.push(entry);
  }
  push(chunk) {
    if(this.primaryError)throw this.primaryError;
    this.bytes += chunk.length;
    if (this.bytes > this.limits.stdout) fail('STDOUT_LIMIT');
    let start=0;
    for (;;) {
      if(this.primaryError)throw this.primaryError;
      const end=chunk.indexOf(10,start);
      const piece=chunk.subarray(start,end===-1?chunk.length:end);
      if (this.pending.length+piece.length>this.limits.line) fail('LINE_LIMIT');
      this.pending=Buffer.concat([this.pending,piece]);
      if(end===-1) break;
      this.line(this.pending); this.pending=Buffer.alloc(0); start=end+1;
    }
  }
  line(bytes) {
    if(this.primaryError)throw this.primaryError;
    if(!bytes.length) fail('EMPTY_EVENT');
    if(++this.events>this.limits.events) fail('EVENT_LIMIT');
    let e; try {e=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));} catch {fail('INVALID_EVENT');}
    if (!e || typeof e!=='object' || Array.isArray(e)) fail('INVALID_EVENT');
    this.lastEventSummary=eventSummary(e);
    this.appendTrace(protocolTraceEntry(e,this.terminal?'after-result':this.initialized?'session':'before-init'));
    const privateSummary=privateEventSummary(e);
    if(privateSummary && this.privateEvents.length<8)this.privateEvents.push(privateSummary);
    if(this.terminal){
      if(e.type==='system'&&e.subtype==='session_state_changed'&&e.session_id===this.sessionId&&e.state==='idle')return;
      fail('LATE_EVENT');
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
      if(!Object.hasOwn(e,'plugins'))fail('CONTAINMENT','INIT_PLUGINS_MISSING');
      for(const [field,prefix] of [['plugins','INIT_PLUGINS'],['skills','INIT_SKILLS']]) {
        if((field==='plugins'||e[field]!==undefined) && !Array.isArray(e[field])) fail('CONTAINMENT',`${prefix}_WRONG_TYPE`);
        if(Array.isArray(e[field]) && e[field].length) fail('CONTAINMENT',`${prefix}_NONEMPTY`);
      }
      if(e.permissionMode==='bypassPermissions') fail('CONTAINMENT','INIT_PERMISSION_BYPASS');
      this.checkModel(e.model,'init'); this.model=e.model;this.permissionMode=e.permissionMode; this.initialized=true; return;
    }
    if(!this.initialized) fail('MISSING_INIT');
    if(e.type==='system'){
      if(e.subtype==='informational'||e.subtype==='notification')
        fail('PROTOCOL_EVENT_UNSUPPORTED','UNSUPPORTED_SYSTEM_EVENT');
      if(e.subtype==='model_refusal_fallback'||e.subtype==='model_refusal_no_fallback')
        fail('PROVIDER_MODEL_REFUSAL',e.subtype==='model_refusal_fallback'?'REFUSAL_FALLBACK_NOT_ALLOWED':'REFUSAL_NO_FALLBACK');
      if(e.subtype==='api_retry'){
        if(!boundedInteger(e.attempt,100)||e.attempt<1||!boundedInteger(e.max_retries,100)||
          e.attempt>e.max_retries||!boundedInteger(e.retry_delay_ms,3600000)||
          !(e.error_status===null||Number.isInteger(e.error_status)&&e.error_status>=100&&e.error_status<=599)||
          !RETRY_ERRORS.has(e.error)||
          e.no_response!==undefined&&(!e.no_response||typeof e.no_response!=='object'||Array.isArray(e.no_response)||
            !boundedInteger(e.no_response.waited_ms,3600000)||!boundedInteger(e.no_response.retry_wait_ms,3600000)))
          fail('PROTOCOL_EVENT_INVALID','API_RETRY_SHAPE');
        fail('PROVIDER_RETRY_NOT_ALLOWED',providerError(e.error,e.error_status).code);
      }
      if(e.subtype==='status'){
        if(e.status==='compacting')fail('CONTAINMENT','STATUS_COMPACTING');
        if(e.permissionMode==='bypassPermissions')fail('CONTAINMENT','STATUS_PERMISSION_BYPASS');
        if(!Object.hasOwn(e,'status')||e.status!==null&&e.status!=='requesting'||
          e.compact_result!==undefined||e.compact_error!==undefined||
          e.permissionMode!==undefined&&e.permissionMode!==this.permissionMode)
          fail('PROTOCOL_EVENT_INVALID','STATUS_SHAPE');
        return;
      }
      if(e.subtype==='session_state_changed'){
        if(e.state==='requires_action')fail('CONTAINMENT','SESSION_REQUIRES_ACTION');
        if(e.state!=='running'&&e.state!=='idle')fail('PROTOCOL_EVENT_INVALID','SESSION_STATE_SHAPE');
        return;
      }
      if(e.subtype==='thinking_tokens'){
        if(!boundedInteger(e.estimated_tokens,100_000_000)||
          !boundedInteger(e.estimated_tokens_delta,100_000_000)||
          e.estimated_tokens_delta>e.estimated_tokens)
          fail('PROTOCOL_EVENT_INVALID','THINKING_TOKENS_SHAPE');
        return; // Approximate operational progress, never retained as model reasoning or result.
      }
      if(FORBIDDEN_SYSTEM.has(e.subtype))fail('CONTAINMENT','FORBIDDEN_SYSTEM_EVENT');
      fail('PROTOCOL_EVENT_UNSUPPORTED','UNKNOWN_SYSTEM_SUBTYPE');
    }
    if(e.type==='rate_limit_event'){
      const info=e.rate_limit_info;
      if(!info||typeof info!=='object'||Array.isArray(info)||
        !['allowed','allowed_warning','rejected'].includes(info.status)||
        info.isUsingOverage!==undefined&&typeof info.isUsingOverage!=='boolean'||
        info.overageInUse!==undefined&&typeof info.overageInUse!=='boolean')
        fail('PROTOCOL_EVENT_INVALID','RATE_LIMIT_SHAPE');
      if(info.isUsingOverage===true||info.overageInUse===true)fail('EXTRA_USAGE');
      if(info.status==='rejected')fail('PROVIDER_RATE_LIMIT');
      return;
    }
    if(e.type==='auth_status'){
      if(typeof e.isAuthenticating!=='boolean'||!Array.isArray(e.output)||
        e.output.some(item=>typeof item!=='string')||e.error!==undefined&&typeof e.error!=='string')
        fail('PROTOCOL_EVENT_INVALID','AUTH_STATUS_SHAPE');
      fail('PROVIDER_AUTH_ERROR','AUTH_STATUS_DURING_TURN');
    }
    if(e.type==='assistant') {
      if(e.parent_tool_use_id!=null) fail('CONTAINMENT');
      if(!e.message||typeof e.message!=='object'||Array.isArray(e.message)||!Array.isArray(e.message.content))fail('INVALID_EVENT');
      for(const block of e.message.content) {
        if(!block||typeof block!=='object'||!['text','thinking','redacted_thinking'].includes(block.type)) fail('CONTAINMENT');
      }
      if(e.message.stop_reason==='tool_use')fail('CONTAINMENT');
      if(e.error!==undefined){
        if(typeof e.error!=='string')fail('INVALID_EVENT');
        fail(providerError(e.error).code);
      }
      if(e.aborted===true)fail('PARTIAL_ASSISTANT');
      this.checkModel(e.message.model,'assistant');
      if(e.message.stop_reason!==null&&!['end_turn','stop_sequence'].includes(e.message.stop_reason))fail('PARTIAL_ASSISTANT');
      if(e.message.id!==undefined){
        if(typeof e.message.id!=='string'||!e.message.id||e.message.id.length>128)fail('PROTOCOL_EVENT_INVALID','MESSAGE_ID_SHAPE');
        if(this.messageId!==undefined&&this.messageId!==e.message.id)fail('CORRELATION');
        this.messageId=e.message.id;
      }
      for(const block of e.message.content){
        if(block.type==='text'){
          if(typeof block.text!=='string')fail('PROTOCOL_EVENT_INVALID','TEXT_BLOCK_SHAPE');
          if(block.text.length)this.generatedText=true;
        }
      }
      this.generatedModel=e.message.model;
      return; // final result is authoritative; do not concatenate assistant text/deltas.
    }
    if(e.type!=='result'){
      if(FORBIDDEN_TYPES.has(e.type))fail('CONTAINMENT','FORBIDDEN_EVENT_TYPE');
      fail('PROTOCOL_EVENT_UNSUPPORTED','UNKNOWN_TYPE');
    }
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
    if(e.stop_reason!==null&&e.stop_reason!=='end_turn'&&e.stop_reason!=='stop_sequence')
      fail('PARTIAL_RESULT','RESULT_STOP_REASON');
    if(e.num_turns!==1) fail('TURN_LIMIT');
    if(!this.generatedModel||!this.generatedText)fail('MODEL_UNPROVEN','NO_GENERATED_TEXT');
    if(typeof e.result!=='string'||Buffer.byteLength(e.result)>this.limits.response) fail('RESPONSE_LIMIT');
    if(!e.modelUsage||typeof e.modelUsage!=='object'||Array.isArray(e.modelUsage)||
      Object.getPrototypeOf(e.modelUsage)!==Object.prototype)fail('MODEL_UNPROVEN','MODEL_USAGE_SHAPE');
    const models=Object.keys(e.modelUsage);
    if(!models.length)fail('MODEL_UNPROVEN','MODEL_USAGE_EMPTY');
    for(const model of models)this.checkModel(model);
    if(models.length!==1)fail('MODEL_UNPROVEN','MODEL_USAGE_MULTIPLE');
    this.usage={};
    for(const [model,usage] of Object.entries(e.modelUsage)) {
      if(!usage||typeof usage!=='object'||Array.isArray(usage)||Object.getPrototypeOf(usage)!==Object.prototype)
        fail('PROTOCOL_EVENT_INVALID','MODEL_USAGE_VALUE');
      for(const field of ['inputTokens','outputTokens','cacheReadInputTokens','cacheCreationInputTokens']) {
        if((field==='inputTokens'||field==='outputTokens'||usage[field]!==undefined)&&
          (!Number.isSafeInteger(usage[field])||usage[field]<0))fail('PROTOCOL_EVENT_INVALID','MODEL_USAGE_TOKENS');
      }
      this.usage[model]={};
      for(const field of ['inputTokens','outputTokens','cacheReadInputTokens','cacheCreationInputTokens']) {
        if(Number.isSafeInteger(usage[field])&&usage[field]>=0) this.usage[model][field]=usage[field];
      }
    }
    // Reported usage is observation, not a hard token budget, entitlement or billing proof.
    this.result=e.result;
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
const TERM_TO_KILL_MS=1000, FAILURE_SETTLEMENT_MS=2000, EXIT_DRAIN_MS=250;
export async function runClaudeProcess({binary,home,cwd,payload,signal,timeoutMs=60000,sessionId=randomUUID(),limits=LIMITS,diagnosticInit,settingsPath}, spawnProcess=spawn,
  clock={now:()=>performance.now(),setTimeout,clearTimeout}) {
  if(signal?.aborted) fail('CANCELLED');
  const started=clock.now();
  const reader=new ClaudeStreamReader(sessionId,limits,diagnosticInit);
  const child=spawnProcess(binary,childArguments(sessionId,settingsPath),{cwd,env:childEnvironment(home),shell:false,stdio:['pipe','pipe','pipe']});
  return await new Promise((resolve,reject)=>{
    let error, killTimer, failureTimer, drainTimer, stderrBytes=0, tail=Buffer.alloc(0), closed=false, exited=false, settled=false, signalFailures=0;
    let completeChild;
    const childSettlement=new Promise(resolve=>{completeChild=resolve;});
    // Cleanup grace is not additional inference time or a renewed Application deadline.
    // Only signal this spawned child. Exit is not close, nor proof of descendant reaping.
    const cancelTimers=()=>{for(const timer of [operationTimer,killTimer,failureTimer,drainTimer])clock.clearTimeout(timer);};
    const releaseListeners=()=>{
      child.stdout.off('data',stdout);child.stderr.off('data',stderr);
      // Terminal error guards remain on these owned emitters for late errors;
      // they neither retain data nor schedule work after settlement.
      child.off('exit',exit);child.off('close',close);
    };
    const signalChild=kind=>{try{if(!child.kill(kind))signalFailures++;}catch{signalFailures++;}};
    const stop=(code,reason)=>{
      error??=new ClaudePocError(code);
      if(reason && error.code===code) error.reason??=reason;
      if(!settled && !closed && failureTimer===undefined) {
        failureTimer=clock.setTimeout(()=>finish(),FAILURE_SETTLEMENT_MS);
        if(!exited){
          signalChild('SIGTERM');
          if(!closed&&!exited)killTimer=clock.setTimeout(()=>{if(!closed&&!exited)signalChild('SIGKILL');},TERM_TO_KILL_MS);
        }
        if(exited&&!closed&&drainTimer===undefined)drainTimer=clock.setTimeout(()=>finish(),EXIT_DRAIN_MS);
      }
    };
    const abort=()=>stop('CANCELLED');
    const operationTimer=clock.setTimeout(()=>stop('TIMEOUT'),timeoutMs);
    const stdout=chunk=>{if(error||settled)return;try{
      reader.push(chunk);
      // Promote a wire result error immediately, before any late event or lifecycle signal.
      if(reader.primaryError){reader.markDecision(reader.primaryError.code);stop(reader.primaryError.code);}
    }catch(e){reader.markDecision(e.code??'INVALID_EVENT',e.reason);stop(e.code??'INVALID_EVENT',e.reason);}};
    const stderr=chunk=>{
      if(settled)return;
      stderrBytes+=chunk.length;
      tail=Buffer.concat([tail,chunk.subarray(-limits.stderrTail)]).subarray(-limits.stderrTail);
      if(stderrBytes>limits.stderr) stop('STDERR_LIMIT');
    };
    const processError=()=>{if(!settled)stop('PROCESS_ERROR');};
    const stdinError=()=>{if(!settled)stop('STDIN_ERROR');};
    const exit=(code,terminationSignal)=>{
      exited=true;completeChild();clock.clearTimeout(killTimer);
      if(settled){releaseListeners();child.stdout.destroy?.();child.stderr.destroy?.();child.stdin.destroy?.();return;}
      if(code!==0||terminationSignal)error??=new ClaudePocError('PROCESS_EXIT');
      if(error&&!closed&&drainTimer===undefined)drainTimer=clock.setTimeout(()=>finish(),EXIT_DRAIN_MS);
    };
    const close=(code,terminationSignal)=>{
      closed=true;exited=true;completeChild();
      if(settled){releaseListeners();return;}
      if(code!==0||terminationSignal)error??=new ClaudePocError('PROCESS_EXIT');
      finish();
    };
    const finish=()=>{
      if(settled)return;
      settled=true;cancelTimers();signal?.removeEventListener('abort',abort);
      if(signal?.aborted) error??=new ClaudePocError('CANCELLED');
      if(clock.now()-started>=timeoutMs)error??=new ClaudePocError('TIMEOUT');
      error??=reader.primaryError;
      if(!closed)error??=new ClaudePocError('MISSING_CLOSE');
      // Success requires close. Failure may finish after bounded local grace, honestly
      // distinguishing direct-child exit from missing close/inherited open pipes.
      if(exited){releaseListeners();if(!closed){child.stdout.destroy?.();child.stderr.destroy?.();child.stdin.destroy?.();}}
      tail=Buffer.alloc(0);
      if(!error){try{reader.finish();}catch(e){error=e;}}
      if(error){error.metrics={stdoutBytes:reader.bytes,stderrBytes,events:reader.events,
        ...(error.reason?{initFailureReason:error.reason}:{}),
        lastEventSummary:reader.lastEventSummary,envelopeBytes:Buffer.byteLength(payload),
        systemPromptBytes:Buffer.byteLength(PLAYBOOK),stdinBytes:Buffer.byteLength(payload),
        latencyMs:clock.now()-started,childClosed:closed,directChildExited:exited,
        settlementIncomplete:!exited,signalFailures,descendantReaping:'NOT_PROVEN'};
        if(!exited)Object.defineProperty(error,'childSettlement',{value:childSettlement});
        if(reader.protocolTrace.at(-1)?.decision===undefined)reader.appendTrace({phase:reader.terminal?'after-result':reader.initialized?'session':'before-init',
          type:'process',typeKind:'string',subtype:closed?'close':exited?'exit-without-close':'settlement-incomplete',subtypeKind:'string',decision:error.code});
        Object.defineProperty(error,'privateDiagnostic',{value:Object.freeze([...reader.privateEvents])});
        Object.defineProperty(error,'protocolTrace',{value:Object.freeze(reader.protocolTrace.map(e=>Object.freeze({...e})))});
        reject(error);return;}
      try {
        const result=reader.result;
        const accepted={result,metrics:{model:reader.model,requestedAlias:'opus',requestedEffort:'medium',
          envelopeBytes:Buffer.byteLength(payload),systemPromptBytes:Buffer.byteLength(PLAYBOOK),stdinBytes:Buffer.byteLength(payload),
          responseBytes:Buffer.byteLength(result),stdoutBytes:reader.bytes,stderrBytes,events:reader.events,
          latencyMs:clock.now()-started,usage:reader.usage,estimatedUsd:reader.estimate,childClosed:true}};
        Object.defineProperty(accepted,'privateDiagnostic',{value:Object.freeze([...reader.privateEvents])});
        Object.defineProperty(accepted,'protocolTrace',{value:Object.freeze(reader.protocolTrace.map(e=>Object.freeze({...e})))});
        resolve(accepted);
      }catch(e){reject(e);}
    };
    child.stdout.on('data',stdout);child.stderr.on('data',stderr);
    child.stdout.on('error',processError);child.stderr.on('error',processError);
    child.on('error',processError);child.stdin.on('error',stdinError);
    child.on('exit',exit);child.on('close',close);
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
    try{if(!error)child.stdin.end(payload);else child.stdin.destroy();}catch{stop('STDIN_ERROR');}
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
    let cwd,sessionSettings,childSettlement;
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
      childSettlement=error.childSettlement;
      this.receipts.push(Object.freeze({error:error.code??'UNCLASSIFIED',...error.metrics}));
      throw error;
    } finally {
      const cleanup=async()=>{
        try{if(sessionSettings)await sessionSettings.cleanup();}
        finally{
          if(cwd) {try{await rmdir(cwd);}catch{/* Preserve unexpected client files; no recursive deletion. */}}
          this.active=false;
        }
      };
      // A finite rejection is not proof that an unresponsive child has ended. Keep
      // this adapter busy and its settings alive until actual exit/close is observed.
      if(childSettlement){
        this.pendingCleanup=childSettlement.then(cleanup);
        void this.pendingCleanup.catch(()=>{this.active=true;});
      }
      else await cleanup();
    }
  }
}
