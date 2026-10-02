'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Buildkite,parseBuildURL,state,validate}=require('../../../robos-lib/ci/buildkite');
test('Buildkite links accept list views and reject lookalike hosts and credentials',()=>{
 assert.deepEqual(parseBuildURL('https://buildkite.com/hermetiq/cloud-native/builds/1130/list?sid=x'),{org:'hermetiq',pipeline:'cloud-native',number:1130});
 for(const u of ['https://buildkite.com.evil.test/a/b/builds/1','http://buildkite.com/a/b/builds/1','https://token@buildkite.com/a/b/builds/1','https://buildkite.com:444/a/b/builds/1'])assert.equal(parseBuildURL(u),null);
 assert.throws(()=>validate({org:'a',passPath:'../secret'}));
});
test('conditional broken jobs are skipped, failed jobs fail, blocked builds remain blocked',()=>{
 assert.equal(state('broken').conclusion,'skipped');assert.equal(state('failed').conclusion,'failure');assert.equal(state('passed').conclusion,'success');assert.equal(state('blocked').status,'blocked');
});
test('uses pass and fixed API host; handles plain text or JSON logs without disclosing token',async()=>{
 let json=false;const calls=[];const c=new Buildkite({org:'hermetiq',pipeline:'cloud-native'},{run:async(bin,args)=>{assert.equal(bin,'pass');assert.deepEqual(args,['show','buildkite-api-access-token']);return {stdout:'test-secret\n'};},fetchImpl:async(url,opts)=>{calls.push(url);assert.equal(opts.redirect,'error');assert.equal(opts.headers.Authorization,'Bearer test-secret');return {ok:true,text:async()=>json?JSON.stringify({content:'error test-secret'}):'\x1b[31merror test-secret\x1b[0m'};}});
 assert.equal(await c.log(1130,'01a0fd7e-0008-4be4-a149-f3a55d66d8ba'),'error [REDACTED]');json=true;assert.equal(await c.log(1130,'01a0fd7e-0008-4be4-a149-f3a55d66d8ba'),'error [REDACTED]');assert.ok(calls.every(u=>u.startsWith('https://api.buildkite.com/v2/organizations/hermetiq/')));
});
test('unavailable credentials and denied scopes never become success or leak subprocess errors',async()=>{
 const c=new Buildkite({org:'hermetiq'},{run:async()=>{throw Error('secret stdout');}});await assert.rejects(c.list(),e=>/Cannot read/.test(e.message)&&!e.message.includes('secret stdout'));
 const denied=new Buildkite({org:'hermetiq'},{run:async()=>({stdout:'token'}),fetchImpl:async()=>({ok:false,status:403})});await assert.rejects(denied.list(),/read scopes/);
});
test('detail reads only failed job logs, preserves permission errors and exposes artifact link',async()=>{
 const id='01a0fd7e-0008-4be4-a149-f3a55d66d8ba',c=new Buildkite({org:'hermetiq',pipeline:'cloud-native'});const requested=[];
 c.request=async suffix=>{requested.push(suffix);if(suffix.endsWith('/log'))throw Error('Access denied');return {number:1130,commit:'abc',state:'failed',web_url:'https://buildkite.com/hermetiq/cloud-native/builds/1130',jobs:[{type:'script',id,name:'Browser',state:'failed'},{type:'script',id:'skip',state:'broken'},{type:'script',id:'pass',state:'passed'}]};};
 const detail=await c.detail(1130);assert.match(detail.failedLog,/Log unavailable: Access denied/);assert.equal(requested.length,2);assert.match(detail.artifactsUrl,/1130#artifacts$/);
});
test('failure excerpt keeps the assertion rather than artifact upload noise',()=>{const {failureExcerpt}=require('../../../robos-lib/ci/buildkite');const log='setup\n'.repeat(150)+'Dragging across bars\nError: expect(locator).toBeVisible() failed\nExpected: visible\nElement not found\n'+'uploading artifact\n'.repeat(150);const excerpt=failureExcerpt(log);assert.match(excerpt,/Dragging across bars/);assert.match(excerpt,/Element not found/);assert.ok(excerpt.length<log.length/2);});
test('DevOps Buildkite references existing pass entry, and removal never deletes the users token',()=>{
 const {DevOpsIntegrationManager}=require('../../../robos-graph/lib/devops-integrations'),connections=require('../../../robos-lib/ci/connections');const original=connections.saveBuildkite;let saved;
 connections.saveBuildkite=input=>(saved=validate(input));try{const nodes=new Map(),manager=new DevOpsIntegrationManager();manager.savePassSecret=()=>{throw Error('Must not rewrite token');};manager.deletePassSecret=()=>{throw Error('Must not delete token');};const pkg={upsertNode:n=>nodes.set(n['@id'],n),saveDirtyPackages(){},getNode:id=>nodes.get(id),removeNode:id=>nodes.delete(id)};
 const result=manager.saveIntegration({providerId:'buildkite',formValues:{accountSlug:'hermetiq',orgSlug:'hermetiq',pipeline:'cloud-native',passPath:'buildkite-api-access-token'},packageManager:pkg});assert.equal(result.ok,true);assert.equal(saved.passPath,'buildkite-api-access-token');assert.equal(nodes.get(result.credentialNodes[0])['robos:externallyManaged'],true);assert.equal(manager.deleteIntegration(result.integrationNode['@id'],pkg).ok,true);
 }finally{connections.saveBuildkite=original;}
});
