'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {stop}=require('./task-activity');
const url='https://github.com/Hermetiq/task-and-issue-tracking/issues/51';
test('stop targets the ticket worker and retains ownership during artifact export',()=>{const calls=[];stop(url,{read:()=>({workerPid:543}),platform:'linux',command:()=>['node','/robos/work-task/runner.js','plan',url],kill:(...a)=>calls.push(a),save:(...a)=>calls.push(a)});assert.deepEqual(calls[0],[543,'SIGTERM']);assert.equal(calls[1][0],url);assert.equal(calls[1][1].phase,'stopped');assert.equal(Object.hasOwn(calls[1][1],'workerPid'),false);});
test('stale PIDs cannot stop another ticket or unrelated process',()=>{for(const args of [['node','/robos/work-task/runner.js',url.replace('/51','/54')],['node','/other/app.js',url]]){assert.throws(()=>stop(url,{read:()=>({workerPid:543}),platform:'linux',command:()=>args,kill:()=>assert.fail('must not signal')}),/no longer owns/);}});
test('stopping an idle ticket does not rewrite it',()=>{stop(url,{read:()=>({}),save:()=>assert.fail('must not save'),kill:()=>assert.fail('must not signal')});});
