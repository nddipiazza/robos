'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createService,notify}=require('./agent-chat');
const server={'@id':'urn:test:slack','dcterms:title':'Test Slack','robos:provider':'slack','robos:url':'https://example.slack.com/','robos:credentialRef':'pass:test-slack'};
const catalog=()=>[{root:'/unused',server}];const identity={ok:true,url:'https://example.slack.com/',team:'Example',team_id:'T1',user:'tester'};
const response=data=>({ok:true,status:200,json:async()=>data});const dir=()=>fs.mkdtempSync(path.join(os.tmpdir(),'robos-agent-chat-'));
test('read operations retain Slack and human-readable timestamps without exposing tokens',async()=>{
 const service=createService({catalog,readSecret:async()=> 'secret-test-token',request:async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer secret-test-token');assert.equal(options.redirect,'error');return response(url.endsWith('auth.test')?identity:{ok:true,messages:[{ts:'1000.123456',user:'U1',text:'hello'}]});}});
 const result=await service('history',{serverId:server['@id'],channel:'C1'});assert.equal(result.messages[0].timestamp,'1970-01-01T00:16:40.123Z');assert.ok(!JSON.stringify(result).includes('secret-test-token'));
});
test('expired credentials create only one actionable notification until login is recovered',async()=>{
 const config=dir();let credential='first';const service=createService({catalog,readSecret:async()=>credential,request:async()=>response({ok:false,error:'token_revoked'}),alert:(...args)=>notify(...args,config,false)});
 for(let i=0;i<3;i++)await assert.rejects(service('status',{serverId:server['@id']}),/login required/);
 notify(server,'invalid_auth',require('node:crypto').createHash('sha256').update(credential).digest('hex'),config,false);
 let rows=JSON.parse(fs.readFileSync(path.join(config,'notifications.json')));assert.equal(rows.length,1);assert.equal(rows[0].action.kind,'slack');assert.equal(rows[0].action.serverId,server['@id']);
 credential='replacement';await assert.rejects(service('status',{serverId:server['@id']}));rows=JSON.parse(fs.readFileSync(path.join(config,'notifications.json')));assert.equal(rows.length,1);
});
test('missing scopes are not described as expired login and network failures do not alert',async()=>{
 const alerts=[];const service=createService({catalog,readSecret:async()=> 'test',request:async()=>response({ok:false,error:'missing_scope'}),alert:(s,code)=>alerts.push(code)});await assert.rejects(service('channels',{serverId:server['@id']}),/permissions/);assert.deepEqual(alerts,['missing_scope']);
 const offline=createService({catalog,readSecret:async()=> 'test',request:async()=>{throw Error('network')},alert:()=>{throw Error('must not notify')}});await assert.rejects(offline('status',{serverId:server['@id']}),/network/);
});
test('confirmed sends are idempotent and changed content cannot reuse the same request ID',async()=>{
 let sends=0;const service=createService({catalog,sendDir:dir(),readSecret:async()=> 'test',request:async url=>{if(url.endsWith('auth.test'))return response(identity);sends++;return response({ok:true,channel:'C1',ts:'1000.1'});}});
 const args={serverId:server['@id'],channel:'C1',text:'Authorized test fixture only',requestId:'12345678-1234-1234-1234-123456789012'};
 assert.equal((await service('send',args)).sent,true);assert.equal((await service('send',args)).sent,true);assert.equal(sends,1);await assert.rejects(service('send',{...args,text:'different'}),/different message/);
});
test('uncertain sends are not automatically retried',async()=>{
 let sends=0;const service=createService({catalog,sendDir:dir(),readSecret:async()=> 'test',request:async url=>{if(url.endsWith('auth.test'))return response(identity);sends++;throw Error('timeout');}});
 const args={serverId:server['@id'],channel:'C1',text:'fixture',requestId:'12345678-1234-1234-1234-123456789012'};await assert.rejects(service('send',args),/network/);await assert.rejects(service('send',args),/uncertain/);assert.equal(sends,1);
});
test('workspace mismatch blocks Slack content requests',async()=>{
 let calls=0;const service=createService({catalog,readSecret:async()=> 'test',alert:()=>{},request:async()=>{calls++;return response({...identity,url:'https://other.slack.com/'});}});await assert.rejects(service('history',{serverId:server['@id'],channel:'C1'}),/different Slack workspace/);assert.equal(calls,1);
});
