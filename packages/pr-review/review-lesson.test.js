'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {promptFor}=require('./review-lesson');
test('lesson teaches from bounded PR evidence without inventing validation',()=>{
 const prompt=promptFor({pr:{title:'Remove counts',body:'Navigation stays.',files:[{path:'src/Explorer.tsx'}]},diff:'x'.repeat(100001)});
 assert.match(prompt,/short teaching lesson/);assert.match(prompt,/Separate author-reported validation/);assert.match(prompt,/src\/Explorer.tsx/);assert.match(prompt,/\[Diff truncated\]/);assert.ok(prompt.length<103000);
});
test('summary execution uses the explicitly selected provider and model',()=>{
 const {argumentsFor,location}=require('./review-lesson');
 assert.deepEqual(argumentsFor({provider:'codex',model:'chosen-model'},'out','prompt').slice(-3),['-m','chosen-model','-']);
 const agy=argumentsFor({provider:'agy',model:'agy-model'},'out','prompt');assert.ok(agy.includes('--model'));assert.ok(agy.includes('agy-model'));assert.ok(agy.includes('--print=prompt'));
 assert.throws(()=>argumentsFor({},'',''),/Choose/);
 const ctx={pr:{title:'Example'},diff:'diff'};assert.notEqual(location(ctx,{provider:'codex',model:'a'}).file,location(ctx,{provider:'codex',model:'b'}).file);
});
