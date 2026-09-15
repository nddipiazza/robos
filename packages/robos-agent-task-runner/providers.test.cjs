'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {args,agySettings}=require('./providers');const {validate}=require('./sandbox');
test('AGY uses its own model and supported headless arguments',()=>{
 const options=args('agy','implement','gemini-test');
 assert.ok(options.includes('accept-edits'));assert.ok(options.includes('gemini-test'));assert.ok(options.includes('stream-json'));
 for(const flag of ['--mcp','--resume','--dangerously-skip-permissions'])assert.ok(!options.includes(flag));
 assert.ok(args('agy','plan','').includes('plan'));
 assert.equal(validate({provider:'agy',model:'gemini-test',memoryGb:4,cpus:2,repositories:['https://github.com/Hermetiq/MVP']}).provider,'agy');
});
test('sandbox permissions include the repository root and keep planning file writes unapproved',()=>{
 assert.ok(agySettings('plan').permissions.allow.includes('read_file(/home/agent)'));
 assert.ok(agySettings('plan').permissions.allow.includes('mcp(robos_chat/*)'));
 assert.ok(!agySettings('plan').permissions.allow.includes('mcp(*)'));
 assert.ok(!agySettings('plan').permissions.allow.some(rule=>rule.startsWith('write_file')));
 assert.ok(agySettings('implement').permissions.allow.includes('write_file(/home/agent/repos)'));
});
test('Codex planning exposes chat through MCP while retaining read-only shell sandbox',()=>{
 const options=args('codex','plan','');
 assert.equal(options[options.indexOf('--sandbox')+1],'read-only');
 assert.ok(options.includes('mcp_servers.robos_chat.command="node"'));
 assert.ok(options.includes('mcp_servers.robos_chat.args=["/home/agent/robos-chat.js","--mcp"]'));
});
