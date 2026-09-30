// Deterministic transport fixture, NOT an AI analyzer.
const mode=process.argv[2];
const args=process.argv.slice(3);
const session_id=args[args.indexOf('--session-id')+1];
const model='claude-opus-fixture';
let input=''; for await(const c of process.stdin)input+=c.toString();
const send=e=>process.stdout.write(JSON.stringify(e)+'\n');
if(mode==='auth'){process.stderr.write('Authentication required');process.exit(1);}
if(mode==='death'){process.kill(process.pid,'SIGKILL');}
if(mode==='slow'||mode==='ignore-term'){
 if(mode==='ignore-term')process.on('SIGTERM',()=>{});
 setTimeout(()=>process.exit(0),10000);
}else{
 const init={type:'system',subtype:'init',session_id,tools:[],mcp_servers:[],plugins:[],skills:[],model};
 if(mode==='tools')init.tools=['Read'];
 if(mode==='plugins-missing')delete init.plugins;
 if(mode==='plugins-invalid')init.plugins={};
 if(mode==='plugins-nonempty')init.plugins=['fixture-plugin'];
 if(mode==='diagnostic-plugins')init.plugins=[{id:'private-one@fixture',path:'/private/one',version:'1.0',secretInstructions:'DO NOT COPY'},'private-two@fixture'];
 send(init);
 if(mode==='status'||mode==='status-after-result'){
  send({type:'system',subtype:'session_state_changed',session_id,state:'running'});
  send({type:'system',subtype:'status',session_id,status:'requesting'});
  send({type:'system',subtype:'status',session_id,status:null});
 }
 if(mode==='status-compacting')send({type:'system',subtype:'status',session_id,status:'compacting'});
 if(mode==='status-invalid')send({type:'system',subtype:'status',session_id,status:'unverified'});
 if(mode==='requires-action')send({type:'system',subtype:'session_state_changed',session_id,state:'requires_action'});
 if(mode==='auth-status')send({type:'auth_status',session_id,isAuthenticating:true,output:['PRIVATE LOGIN LINK']});
 if(mode==='thinking-tokens')send({type:'system',subtype:'thinking_tokens',session_id,estimated_tokens:7,estimated_tokens_delta:3});
 if(mode==='thinking-tokens-invalid')send({type:'system',subtype:'thinking_tokens',session_id,estimated_tokens:'7',estimated_tokens_delta:3});
 if(mode==='hook-event')send({type:'system',subtype:'hook_started',session_id,hook_id:'fixture',hook_name:'private',hook_event:'PreToolUse'});
 if(mode==='plugin-install')send({type:'system',subtype:'plugin_install',session_id,status:'started',name:'private'});
 if(mode==='unknown-system')send({type:'system',subtype:'surprise_subtype',session_id,content:'PRIVATE DO NOT LOG'});
 if(mode==='malicious-system')send({type:'system',subtype:'private\nsecret',session_id,content:'Bearer private-token'});
 if(['informational','notification','model_refusal_fallback','model_refusal_no_fallback','elicitation_complete'].includes(mode))
  send({type:'system',subtype:mode,session_id});
 if(mode.startsWith('api-retry-')&&mode!=='api-retry-invalid'){
  const status=mode.slice('api-retry-'.length);
  send({type:'system',subtype:'api_retry',session_id,attempt:1,max_retries:3,retry_delay_ms:100,
    error_status:status==='null'?null:Number(status),error:status==='401'?'authentication_failed':
      status==='429'?'rate_limit':status==='529'?'overloaded':'unknown'});
 }
 if(mode==='api-retry-invalid')send({type:'system',subtype:'api_retry',session_id,attempt:'1',max_retries:3,retry_delay_ms:100,error_status:429,error:'rate_limit'});
 const assistantError=mode.startsWith('assistant-error-')?mode.slice('assistant-error-'.length):undefined;
 const authDetail=mode==='assistant-error-auth-expired'?'Login expired. Please run /login':
  mode==='assistant-error-auth-keychain'?'Keychain access denied for credential store':
  mode==='assistant-error-auth-no-credential'?'No credential available; please log in':
  mode==='assistant-error-auth-organization'?'Organization access denied':
  mode==='assistant-error-auth-unsupported'?'Unsupported authentication route':
  mode==='assistant-error-auth-sensitive'?'Authentication failed for user@example.com with Bearer private-token-123456789':undefined;
 const assistant={type:'assistant',session_id,message:{model:assistantError||mode==='synthetic' ? '<synthetic>' : model,
  content:[{type:'text',text:authDetail??(assistantError?'synthetic provider error detail':'fixture response')}],stop_reason:'end_turn'}};
 if(assistantError)assistant.error=authDetail?'authentication_failed':assistantError;
 if(mode==='assistant-missing-model')delete assistant.message.model;
 if(mode==='assistant-other-model')assistant.message.model='claude-sonnet-fixture';
 if(mode==='assistant-top-model'){assistant.model=model;delete assistant.message.model;}
 if(mode==='assistant-tool-error'){assistant.error='authentication_failed';assistant.message.content.push({type:'tool_use',name:'Read'});}
 if(mode==='assistant-error-then-success')assistant.error='rate_limit';
 if(mode==='assistant-error-then-exit')assistant.error='rate_limit';
 if(mode==='assistant-aborted')assistant.aborted=true;
 if(mode==='blocks'){
  send({...assistant,message:{id:'msg-fixture',model,content:[{type:'thinking',thinking:'PRIVATE THOUGHT'}],stop_reason:null}});
  assistant.message={id:'msg-fixture',model,content:[{type:'text',text:'fixture response'}],stop_reason:null};
 }
 if(mode==='assistant-error-then-success')assistant.message.model='<synthetic>';
 if(mode!=='no-assistant')send(assistant);
 if(mode==='tool')send({type:'assistant',session_id,message:{model,content:[{type:'tool_use',name:'Read'}]}});
 if(mode==='permission')send({type:'control_request',session_id,request:{subtype:'can_use_tool'}});
 if(mode==='stderr')process.stderr.write('x'.repeat(300*1024));
 if(mode==='line')process.stdout.write('x'.repeat(1024*1024+1));
 if(mode==='events')for(let i=0;i<1050;i++)send({type:'rate_limit_event',session_id,rate_limit_info:{status:'allowed'}});
 let envelope;try{envelope=JSON.parse(input);}catch{envelope={context:{contextId:'test',evidence:[]}};}
 const ref=envelope.context.evidence[0]?.reference??'E1';
 let candidate={version:1,kind:'analysis-candidate',contextId:envelope.context.contextId,observations:[{id:'o1',kind:'idea',statement:'Café — ação 🎬',uncertainty:'material',justification:'Fixture only',evidenceReferences:[ref]}],relations:[],uncertainties:[],limitations:['Scripted fixture, not AI.']};
 if(mode==='citation')candidate.observations[0].evidenceReferences=['E999'];
 if(mode==='needs')candidate={version:1,kind:'needs-evidence',contextId:envelope.context.contextId,request:{type:'text-context',sourceReference:'S1',maxAdditionalBytes:4096,reason:'Fixture continuation'}};
 let result={type:'result',subtype:'success',is_error:false,stop_reason:null,num_turns:1,permission_denials:[],session_id,result:mode==='json'?'not json':JSON.stringify(candidate),modelUsage:{[model]:{inputTokens:1,outputTokens:2}},total_cost_usd:0};
 if(mode.startsWith('result-stop-')){
  const stop=mode.slice('result-stop-'.length);
  if(stop==='missing')delete result.stop_reason;
  else result.stop_reason=stop==='array'?['end_turn']:stop;
 }
 if(mode==='opus-drift')result.modelUsage={[model]:{},'claude-opus-other-fixture':{}};
 if(mode.startsWith('result-error-')){result.is_error=true;result.api_error_status=429;}
 if(mode==='model')result.modelUsage={'claude-sonnet-fixture':{}};
 if(mode==='correlation')result.session_id='wrong';
 if(mode==='error')result.subtype='error_max_turns';
 if(mode==='result-is-error')result.is_error=true;
 if(mode==='result-auth-expired'){result.is_error=true;result.api_error_status=401;result.errors=['Login expired. Please run /login'];}
 if(mode==='assistant-error-then-success')result.is_error=false;
 if(mode==='result-status-429'){result.is_error=true;result.api_error_status=429;}
 if(mode==='result-terminal-aborted')result.terminal_reason='aborted_streaming';
 if(mode==='result-origin-other')result.origin={kind:'task-notification'};
 if(mode==='response')result.result='x'.repeat(65537);
 if(mode==='partial'){process.stdout.write('{"type":');}
 else if(mode==='utf8'){
  const bytes=Buffer.from(JSON.stringify(result)+'\n');
  for(const byte of bytes)process.stdout.write(Buffer.from([byte]));
 }else{send(result);if(mode==='duplicate')send(result);}
 if(mode==='result-error-late')send({type:'system',subtype:'surprise_subtype',session_id});
 if(mode==='result-error-timeout'||mode==='result-error-cancel'){
  process.on('SIGTERM',()=>{});setTimeout(()=>process.exit(0),10000);
 }
 if(mode==='status-after-result')send({type:'system',subtype:'session_state_changed',session_id,state:'idle'});
 if(mode==='assistant-error-then-exit')process.exitCode=1;
 if(mode==='late-close'){process.on('SIGTERM',()=>{});setTimeout(()=>process.exit(0),10000);}
}
