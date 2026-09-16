'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {choicesFor,selectIDE}=require('./project-ides');
const options={availability:['webstorm','goland','idea'].map(id=>({id,available:true})),defaultIDE:null};
test('one IDE shared by repositories and roots opens without choosing',()=>{
 const result=choicesFor([{name:'UI',ideId:'webstorm',projectRoots:[{relativePath:'e2e',ideId:'webstorm'}]},{name:'App',ideId:'webstorm'}],options);
 assert.equal(result.choices.length,1);assert.equal(selectIDE(result).id,'webstorm');assert.deepEqual(result.choices[0].projects,['UI','UI / e2e','App']);
});
test('all session repositories and nested roots contribute choices',()=>{
 const result=choicesFor([{name:'UI',ideId:'webstorm'},{name:'Backend',ideId:'goland',projectRoots:[{relativePath:'infra',ideId:'idea'}]}],options);
 assert.deepEqual(result.choices.map(i=>i.id),['goland','idea','webstorm']);assert.throws(()=>selectIDE(result),/Choose an IDE/);assert.equal(selectIDE(result,'idea').id,'idea');assert.throws(()=>selectIDE(result,'code'),/not associated/);
});
test('missing association or unavailable IDE never silently chooses another',()=>{
 assert.throws(()=>selectIDE(choicesFor([{name:'unknown'}],options)),/Assign an IDE/);
 assert.throws(()=>selectIDE(choicesFor([{name:'Python',ideId:'pycharm'}],options)),/not installed/);
});
