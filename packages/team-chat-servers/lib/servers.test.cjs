'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const service=require('./servers');const {GraphWorkspace,validateDocument}=require('../../robos-graph/lib/graph-workspace');
function fixture(){return fs.mkdtempSync(path.join(os.tmpdir(),'robos-chat-test-'));}
function save(root,input){return service.save(root,{revision:service.list(root).revision,...input});}
test('server/channel CRUD survives graph reload and preserves unrelated properties',()=>{
 const root=fixture(),server=save(root,{name:'QA Zulip',provider:'zulip',url:'https://chat.example.test',credentialRef:'pass:chat/zulip'});
 const channel=save(root,{kind:'channel',name:'Engineering',channelId:'engineering',serverId:server['@id']});
 assert.equal(service.list(root).channels[0]['robos:chatServer']['@id'],server['@id']);
 assert.throws(()=>service.remove(root,{id:server['@id'],revision:service.list(root).revision}),/channel entries first/);
 const ws=new GraphWorkspace(root),p=ws.propose({mode:'refine',edits:[{op:'update',id:server['@id'],set:{'robos:workspaceId':'kept'}}]});ws.apply(p,{expectedProposalId:p.id});
 const updated=save(root,{...{name:'QA Zulip revised',provider:'zulip',url:'https://chat.example.test',workspaceId:'kept'},id:server['@id']});assert.equal(updated['robos:workspaceId'],'kept');
 service.remove(root,{id:channel['@id'],revision:service.list(root).revision});service.remove(root,{id:server['@id'],revision:service.list(root).revision});assert.equal(service.list(root).servers.length,0);
});
test('invalid providers, credentials, links, orphan channels and stale edits are rejected',()=>{
 const root=fixture(),input={name:'Test',provider:'slack',url:'https://example.test'};const rev=service.list(root).revision;
 for(const patch of [{provider:'unknown'},{credentialRef:'xoxb-not-a-reference'},{url:'https://secret:token@example.test'},{url:'javascript:alert(1)'}])assert.throws(()=>save(root,{...input,...patch}));
 assert.throws(()=>save(root,{kind:'channel',name:'orphan',channelId:'1',serverId:'urn:missing'}),/existing chat server/);
 save(root,input);assert.throws(()=>service.save(root,{...input,revision:rev}),/KGraph changed/);
});
test('chat shapes reject incomplete server and channel graph imports',()=>{
 const ws=new GraphWorkspace(fixture());for(const type of ['TeamChatServer','TeamChatChannel']){
 const p=ws.propose({mode:'refine',edits:[{op:'add',node:{'@id':'urn:example:chat:incomplete','@type':['robos:'+type],'dcterms:title':'Incomplete','robos:package':'organization'}}]});assert.equal(p.validation.conforms,false);
 }
});
test('Slack check uses pass reference, fixed API host, and verifies workspace identity',async()=>{
 const root=fixture(),s=save(root,{name:'Slack',provider:'slack',url:'https://example.slack.com/',credentialRef:'pass:slack-user-oauth-token'});
 const result=await service.testConnection(root,{id:s['@id']},ref=>{assert.equal(ref,'slack-user-oauth-token');return 'test-only-token\n';},async(url,options)=>{assert.equal(url,'https://slack.com/api/auth.test');assert.equal(options.headers.Authorization,'Bearer test-only-token');assert.equal(options.redirect,'error');return {ok:true,json:async()=>({ok:true,url:'https://example.slack.com/',team:'Example',team_id:'T1',user:'tester'})};});
 assert.deepEqual(result,{workspace:'Example',workspaceId:'T1',user:'tester'});
 await assert.rejects(service.testConnection(root,{id:s['@id']},()=> 'test-only-token',async()=>({ok:true,json:async()=>({ok:true,url:'https://other.slack.com/'})})),/different Slack workspace/);
 await assert.rejects(service.testConnection(root,{id:s['@id']},()=>{throw Error('private failure')},()=>{}),e=>!e.message.includes('private failure'));
});
test('workspace links support Teams parameters and Matrix fragments without inline credentials',()=>{
 assert.equal(service.endpoint('https://teams.microsoft.com/l/team/example?groupId=group&tenantId=tenant'),'https://teams.microsoft.com/l/team/example?groupId=group&tenantId=tenant');
 assert.equal(service.endpoint('https://matrix.to/#/#engineering:example.org'),'https://matrix.to/#/#engineering:example.org');
 assert.throws(()=>service.endpoint('https://example.test/?access_token=secret'),/credentials/);
 assert.throws(()=>service.list(''),/Select a KGraph/);
});
