'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {write,read}=require('../../../robos-lib/agent-job-state');
const id='12345678-1234-1234-1234-123456789abc';
test('live jobs report running; completion and failure stop the running state',()=>{const directory=fs.mkdtempSync(path.join(os.tmpdir(),'agent-job-test-'));for(const status of ['running','paused','error']){write({provider:'codex',sessionId:id,status,childPid:process.pid},{directory});assert.equal(read(id,{directory}).status,status);}});
test('dead or replaced agent processes are interrupted, not indefinitely running',()=>{const directory=fs.mkdtempSync(path.join(os.tmpdir(),'agent-job-test-'));write({provider:'codex',sessionId:id,status:'running',childPid:process.pid},{directory});assert.equal(read(id,{directory,identity:()=>null}).status,'interrupted');assert.equal(read(id,{directory,identity:()=> 'different-process'}).status,'interrupted');});
test('unknown sessions have no invented running state',()=>{assert.equal(read('invalid'),null);});
