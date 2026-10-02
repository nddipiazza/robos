'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {LiveBuildkiteService}=require('../../../ci-monitor-mcp/live-buildkite');
const {createCIMonitorMCPServer}=require('../../../ci-monitor-mcp/index');
test('CI MCP maps actual build identity and never manufactures a successful retry',async()=>{
 const calls=[],service=new LiveBuildkiteService({config:()=>({org:'hermetiq',pipeline:'cloud-native'}),client:()=>({list:async()=>[{id:1130,repo:'hermetiq/cloud-native',branch:'feature',conclusion:'failure'}],detail:async n=>{calls.push(n);return {number:n,head:'abc',jobs:[{name:'Browser',conclusion:'failure'}],failedLog:'Actual assertion',failureExcerpt:'Actual assertion'};}})});
 const {server}=createCIMonitorMCPServer({liveService:service});
 const call=(name,args={})=>server.handleJsonRpc({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}});
 const list=await call('robos_ci_list_runs');assert.match(list.result.content[0].text,/buildkite:hermetiq:cloud-native:1130/);
 const log=await call('robos_ci_get_logs',{runId:'buildkite:hermetiq:cloud-native:1130'});assert.match(log.result.content[0].text,/Actual assertion/);assert.deepEqual(calls,[1130]);
 const retry=await call('robos_ci_retry_run',{runId:'buildkite:hermetiq:cloud-native:1130'});assert.equal(retry.result.isError,true);
 assert.equal(await service.getStatus('main'),null);await assert.rejects(service.getLogs('buildkite:other:cloud-native:1130'),/run ID/);
});
test('unconfigured CI tools fail instead of loading sample runs',async()=>{const s=new LiveBuildkiteService({config:()=>null});await assert.rejects(s.listRuns(),/Configure Buildkite/);});
