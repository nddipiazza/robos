'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {promptFor}=require('./review-lesson');
test('lesson teaches from bounded PR evidence without inventing validation',()=>{
 const prompt=promptFor({pr:{title:'Remove counts',body:'Navigation stays.',files:[{path:'src/Explorer.tsx'}]},diff:'x'.repeat(100001)});
 assert.match(prompt,/short teaching lesson/);assert.match(prompt,/Separate author-reported validation/);assert.match(prompt,/src\/Explorer.tsx/);assert.match(prompt,/\[Diff truncated\]/);assert.ok(prompt.length<103000);
});
