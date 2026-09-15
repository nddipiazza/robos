const {test}=require('node:test'),assert=require('node:assert/strict');const {start}=require('./agent-bridge');
test('sandbox bridge authenticates requests and closes with its session',async()=>{
 const bridge=await start({host:'127.0.0.1',call:async(op,args)=>({op,args})});try{
  assert.equal((await fetch(bridge.url,{method:'POST',body:'{}'})).status,401);
  const r=await fetch(bridge.url,{method:'POST',headers:{Authorization:'Bearer '+bridge.token},body:JSON.stringify({operation:'status',arguments:{serverId:'test'}})});assert.deepEqual(await r.json(),{ok:true,result:{op:'status',args:{serverId:'test'}}});
 }finally{await bridge.close();}
 await assert.rejects(fetch(bridge.url));
});
test('sandbox MCP client handles initialization, discovery and errors without exposing capability',async()=>{
 const vm=require('node:vm'),{PassThrough}=require('node:stream'),{client}=require('./agent-bridge');
 const bridge=await start({host:'127.0.0.1',call:async(op)=>{if(op==='status')throw Error('Slack login required.');return {servers:[]};}});
 const stdin=new PassThrough(),responses=[],pending=new Map();
 try{
  vm.runInNewContext(client,{require:name=>name==='fs'?{readFileSync:()=>JSON.stringify({url:bridge.url,token:bridge.token})}:require(name),fetch,AbortSignal,console,process:{argv:['node','client','--mcp'],stdin,stdout:{write:line=>{const value=JSON.parse(line);responses.push(value);pending.get(value.id)?.(value);}}}});
  const rpc=(id,method,params={})=>new Promise(resolve=>{pending.set(id,resolve);stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  assert.equal((await rpc(1,'initialize',{protocolVersion:'2024-11-05'})).result.protocolVersion,'2024-11-05');
  assert.equal((await rpc(2,'tools/list')).result.tools.length,6);
  assert.equal((await rpc(3,'tools/call',{name:'robos_chat_servers'})).result.isError,false);
  const failure=await rpc(4,'tools/call',{name:'robos_chat_status',arguments:{serverId:'test'}});
  assert.equal(failure.result.isError,true);assert.match(failure.result.content[0].text,/login required/);
  assert.equal((await rpc(5,'bogus')).error.code,-32601);
  assert.ok(!JSON.stringify(responses).includes(bridge.token));
 }finally{stdin.end();await bridge.close();}
});
