'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {args,validate}=require('./reasoning-effort');
test('effort goes to Codex CLI in both sandbox and summary execution',()=>{
 const expected='model_reasoning_effort="high"';
 assert.ok(require('../robos-agent-task-runner/providers').args('codex','implement','model','high').includes(expected));
 assert.ok(require('../pr-review/review-lesson').argumentsFor({provider:'codex',model:'model',effort:'high'},'/tmp/result','prompt').includes(expected));
 assert.deepEqual(args('codex',''),[]);assert.throws(()=>args('agy','high'),/does not expose/);assert.throws(()=>args('codex','high"; bad'),/Invalid/);
});
test('model capabilities govern accepted effort',async()=>{
 const catalog=async()=>({models:[{id:'model',reasoningEfforts:[{id:'low'},{id:'high'}]}]});
 await validate({provider:'codex',model:'model',effort:'high'},catalog);
 await assert.rejects(validate({provider:'codex',model:'model',effort:'ultra'},catalog),/does not list/);
 await assert.rejects(validate({provider:'codex',effort:'high'},catalog),/Choose a model/);
});
test('different efforts cannot reuse the same generated summary cache entry',()=>{
 const {location}=require('../pr-review/review-lesson'),ctx={pr:{title:'test'},diff:'diff'};
 assert.notEqual(location(ctx,{provider:'codex',model:'model',effort:'low'}).key,location(ctx,{provider:'codex',model:'model',effort:'high'}).key);
});
