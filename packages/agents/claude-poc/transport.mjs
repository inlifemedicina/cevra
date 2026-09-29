import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdtemp, rmdir } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { PLAYBOOK } from './playbook.mjs';

export const CLAUDE_VERSION = '2.1.280';
export const CLAUDE_SHA256 = '387a5c5dcdbb815085edf0baf79591f9d8894efe922bceaf3d75b1b08055229d';
export const LIMITS = Object.freeze({ line: 1024*1024, stdout: 8*1024*1024, stderr: 256*1024, stderrTail: 64*1024, events: 1024, response: 64*1024 });
export class ClaudePocError extends Error {
  constructor(code) { super(code); this.name = 'ClaudePocError'; this.code = code; }
}
const fail = code => { throw new ClaudePocError(code); };
// Non-content diagnostic vocabulary: never retain arbitrary event fields/text.
function eventSummary(event) {
  const label=value=>typeof value==='string'&&/^[a-z_]{1,48}$/.test(value)?value:'other';
  const summary={type:label(event.type),subtype:label(event.subtype)};
  for(const field of ['tools','mcp_servers','plugins','skills']) {
    summary[`${field}Count`]=Array.isArray(event[field])?event[field].length:null;
  }
  summary.permissionsBypassed=event.permissionMode==='bypassPermissions';
  return Object.freeze(summary);
}
export function childEnvironment(home) {
  if (!isAbsolute(home)) fail('INVALID_HOME');
  return { HOME: home, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'en_US.UTF-8', DISABLE_AUTOUPDATER: '1' };
}
export function childArguments(sessionId) {
  return ['--print', '--restricted', '--safe-mode', '--tools', '',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--disallowedTools', 'mcp__*', '--permission-prompts', 'none',
    '--setting-sources', '', '--disable-slash-commands', '--no-chrome',
    '--no-session-persistence', '--max-turns', '1', '--model', 'opus',
    '--effort', 'medium', '--output-format', 'stream-json', '--verbose',
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
  constructor(sessionId, limits = LIMITS) {
    this.sessionId=sessionId; this.limits=limits; this.pending=Buffer.alloc(0);
    this.bytes=0; this.events=0; this.initialized=false; this.result=undefined;
    this.model=undefined; this.usage=undefined; this.estimate=undefined;
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
    if(this.result!==undefined) fail('LATE_EVENT');
    if(e.type==='rate_limit_event') {
      // Provider advisory only; never turns a refused/error result into success.
      if(e.session_id!==this.sessionId || !e.rate_limit_info) fail('CORRELATION');
      if(e.rate_limit_info.isUsingOverage===true) fail('EXTRA_USAGE');
      return;
    }
    if(e.session_id!==this.sessionId) fail('CORRELATION');
    if(e.type==='system' && e.subtype==='init') {
      if(this.initialized) fail('DUPLICATE_INIT');
      for(const field of ['tools','mcp_servers']) if(!Array.isArray(e[field])||e[field].length) fail('CONTAINMENT');
      for(const field of ['plugins','skills']) if(e[field]!==undefined && (!Array.isArray(e[field])||e[field].length)) fail('CONTAINMENT');
      if(e.permissionMode==='bypassPermissions') fail('CONTAINMENT');
      this.checkModel(e.model); this.model=e.model; this.initialized=true; return;
    }
    if(!this.initialized) fail('MISSING_INIT');
    if(e.type==='assistant') {
      if(e.parent_tool_use_id!=null) fail('CONTAINMENT');
      this.checkModel(e.message?.model);
      if(!Array.isArray(e.message?.content)) fail('INVALID_EVENT');
      for(const block of e.message.content) {
        if(!['text','thinking','redacted_thinking'].includes(block.type)) fail('CONTAINMENT');
      }
      return; // final result is authoritative; do not concatenate assistant text/deltas.
    }
    if(e.type!=='result') fail('CONTAINMENT');
    if(e.subtype!=='success'||e.is_error!==false) fail('PROVIDER_RESULT_ERROR');
    if(e.num_turns!==1) fail('TURN_LIMIT');
    if(!Array.isArray(e.permission_denials)||e.permission_denials.length) fail('CONTAINMENT');
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
  checkModel(model) {
    if(typeof model!=='string'||!/^claude-opus-[a-z0-9.-]+$/.test(model)) fail('MODEL_UNAVAILABLE');
    if(this.model && this.model!==model) fail('MODEL_DRIFT');
  }
  finish() {
    if(this.pending.length) fail('PARTIAL_EOF');
    if(this.result===undefined) fail('MISSING_RESULT');
    return this.result;
  }
}

// Internal process seam is only for deterministic tests; no caller/request callback.
export async function runClaudeProcess({binary,home,cwd,payload,signal,timeoutMs=60000,sessionId=randomUUID(),limits=LIMITS}, spawnProcess=spawn) {
  if(signal?.aborted) fail('CANCELLED');
  const started=performance.now();
  const reader=new ClaudeStreamReader(sessionId,limits);
  const child=spawnProcess(binary,childArguments(sessionId),{cwd,env:childEnvironment(home),shell:false,stdio:['pipe','pipe','pipe']});
  return await new Promise((resolve,reject)=>{
    let error, killTimer, stderrBytes=0, tail=Buffer.alloc(0), closed=false;
    const stop=(code)=>{
      error??=new ClaudePocError(code);
      if(!closed && killTimer===undefined) {
        child.kill('SIGTERM');
        killTimer=setTimeout(()=>{if(!closed)child.kill('SIGKILL');},1000);
      }
    };
    const abort=()=>stop('CANCELLED');
    const timer=setTimeout(()=>stop('TIMEOUT'),timeoutMs);
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
    child.stdout.on('data',chunk=>{if(error)return;try{reader.push(chunk);}catch(e){stop(e.code??'INVALID_EVENT');}});
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
      if(code!==0||terminationSignal)error??=new ClaudePocError('PROCESS_EXIT');
      // Never return before process close/reap. No transcript/stderr in errors.
      tail=Buffer.alloc(0);
      if(error){error.metrics={stdoutBytes:reader.bytes,stderrBytes,events:reader.events,
        lastEventSummary:reader.lastEventSummary,envelopeBytes:Buffer.byteLength(payload),
        systemPromptBytes:Buffer.byteLength(PLAYBOOK),stdinBytes:Buffer.byteLength(payload),
        latencyMs:performance.now()-started,childClosed:true};reject(error);return;}
      try {
        const result=reader.finish();
        resolve({result,metrics:{model:reader.model,requestedAlias:'opus',requestedEffort:'medium',
          envelopeBytes:Buffer.byteLength(payload),systemPromptBytes:Buffer.byteLength(PLAYBOOK),stdinBytes:Buffer.byteLength(payload),
          responseBytes:Buffer.byteLength(result),stdoutBytes:reader.bytes,stderrBytes,events:reader.events,
          latencyMs:performance.now()-started,usage:reader.usage,estimatedUsd:reader.estimate,childClosed:true}});
      }catch(e){reject(e);}
    });
    if(!error)child.stdin.end(payload);else child.stdin.destroy();
  });
}

/** @implements {import('@cevra/application').SemanticEditorialAnalyzerPort} */
export class ClaudePocAnalyzer {
  constructor({binary,home}, dependencies={verifyBinary,runProcess:runClaudeProcess}) {
    this.binary=binary;this.home=home;this.receipts=[];this.active=false;this.dependencies=dependencies;
  }
  async analyze(invocation,context) {
    if(this.active)fail('BUSY');
    this.active=true;
    let cwd;
    try {
      if(context.signal?.aborted)fail('CANCELLED');
      if(invocation.payloadBytes!==Buffer.byteLength(invocation.payload)||invocation.payloadBytes>256*1024)fail('INPUT_LIMIT');
      await this.dependencies.verifyBinary(this.binary);
      cwd=await mkdtemp('/tmp/cevra-claude-poc-');
      const result=await this.dependencies.runProcess({binary:this.binary,home:this.home,cwd,payload:invocation.payload,signal:context.signal});
      await this.dependencies.verifyBinary(this.binary);
      this.receipts.push(Object.freeze(result.metrics));
      if(context.signal?.aborted)fail('CANCELLED');
      return result.result;
    } catch(error) {
      this.receipts.push(Object.freeze({error:error.code??'UNCLASSIFIED',...error.metrics}));
      throw error;
    } finally {
      if(cwd) {try{await rmdir(cwd);}catch{/* Preserve unexpected client files; no recursive deletion. */}}
      this.active=false;
    }
  }
}
