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
 send(init);
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
 let result={type:'result',subtype:'success',is_error:false,num_turns:1,permission_denials:[],session_id,result:mode==='json'?'not json':JSON.stringify(candidate),modelUsage:{[model]:{inputTokens:1,outputTokens:2}},total_cost_usd:0};
 if(mode==='model')result.modelUsage={'claude-sonnet-fixture':{}};
 if(mode==='correlation')result.session_id='wrong';
 if(mode==='error')result.subtype='error_max_turns';
 if(mode==='response')result.result='x'.repeat(65537);
 if(mode==='partial'){process.stdout.write('{"type":');}
 else if(mode==='utf8'){
  const bytes=Buffer.from(JSON.stringify(result)+'\n');
  for(const byte of bytes)process.stdout.write(Buffer.from([byte]));
 }else{send(result);if(mode==='duplicate')send(result);}
 if(mode==='late-close'){process.on('SIGTERM',()=>{});setTimeout(()=>process.exit(0),10000);}
}
