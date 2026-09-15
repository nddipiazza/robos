const {test}=require('node:test');const assert=require('node:assert/strict');const {invocation,decode}=require('./backend');
test('Codex plans read-only, implements workspace-write, preserves prompt as one argument',()=>{const prompt='hello `world`';const p=invocation('codex','plan',prompt);assert(p.bin.endsWith('codex'));assert(p.args.includes('read-only'));assert.equal(p.args.at(-1),prompt);assert(invocation('codex','implement',prompt).args.includes('workspace-write'));});
test('Codex command and assistant events populate the session',()=>{assert.equal(decode({type:'item.completed',item:{type:'agent_message',text:'Plan'}}).text,'Plan');assert.match(decode({type:'item.completed',item:{type:'command_execution',command:'pwd',aggregated_output:'/src'}}).events[0].text,/\/src/);});
test('Provider failure cannot become a successful plan even on exit zero',()=>{assert.equal(decode({type:'turn.failed',error:{message:'expired'}}).error,'expired');assert.equal(decode({type:'result',is_error:true,result:'expired'}).error,'expired');});
test('workstation preference overrides an obsolete saved Claude backend',()=>{const {configuredBackend}=require('./backend');assert.equal(configuredBackend('claude',()=>({backend:'codex'})),'codex');assert.equal(configuredBackend(undefined,()=>({})),'codex');});

test('AGY native stream preserves tool events and final Markdown',()=>{
 const {decode}=require('./backend');
 assert.equal(decode({event:'init',init:{model:'gemini-test'}}).events[0].role,'system');
 const tool=decode({event:'step_update',step_update:{step_type:'tool',state:'ACTIVE',tool_name:'run_command',tool_info:{parameters:{CommandLine:'pwd'}}}});
 assert.equal(tool.events[0].name,'run_command');assert.match(tool.events[0].text,/pwd/);
 assert.equal(decode({event:'result',result:{status:'SUCCESS',response:'## Done'}}).text,'## Done');
});
test('AGY denied permissions fail even when the CLI reports success',()=>{
 const {decode}=require('./backend');
 assert.match(decode({event:'result',result:{status:'SUCCESS',response:'',denied_actions:[{action:'read_file'}]}}).error,/read_file/);
 assert.equal(decode({event:'result',result:{status:'ERROR',error:'Login expired'}}).error,'Login expired');
});
test('recoverable tool errors emit live error events without prematurely terminating the agent',()=>{
 const agy=decode({event:'step_update',step_update:{step_type:'tool',state:'ERROR',tool_name:'run_command',tool_info:{error:{message:'Permission required'}}}});
 assert.equal(agy.events[0].role,'error');assert.equal(agy.events[0].text,'Permission required');assert.equal(agy.error,null);
 const codex=decode({type:'item.completed',item:{type:'mcp_tool_call',result:{isError:true,content:[{type:'text',text:'Slack login required'}]}}});
 assert.equal(codex.events[0].role,'error');assert.match(codex.events[0].text,/Slack login required/);assert.equal(codex.error,null);
 assert.equal(decode({type:'item.completed',item:{type:'command_execution',status:'failed',aggregated_output:'Build failed'}}).events[0].role,'error');
});
