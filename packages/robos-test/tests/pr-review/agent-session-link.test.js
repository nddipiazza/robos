'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');const {parse,open}=require('../../../robos-lib/agent-session-link');
const id='12345678-1234-1234-1234-123456789abc';
test('deep link accepts only a provider session ID',()=>{assert.deepEqual(parse(['app','--agent-session='+id]),{provider:'codex',sessionId:id});assert.equal(parse(['--agent-session=../../bad']),null);});
test('opens Agents with exact session as an argument without launching a new agent',async()=>{let args;const result=await open({provider:'codex',sessionId:id},{launch:(bin,argv,options)=>{args=argv;assert.equal(options.shell,false);const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;}});assert.equal(result.ok,true);assert.ok(args[0].endsWith('/agents-manager'));assert.equal(args.at(-1),'--agent-session='+id);});
test('invalid session never spawns a process',async()=>{await assert.rejects(()=>open({provider:'codex',sessionId:'bad'},{launch:()=>{throw Error('should not spawn')}}),/valid agent session/);});
