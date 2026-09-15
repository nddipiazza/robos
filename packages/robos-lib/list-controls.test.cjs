'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {compare,dateValue}=require('./list-controls');
test('date sorting preserves unknown dates at the bottom in either direction',()=>{const items=[{name:'Unknown'},{name:'Early',updated:'2026-09-01T10:00:00Z'},{name:'Late',updatedAt:'2026-09-15T10:00:00Z'}];assert.deepEqual([...items].sort(compare).map(i=>i.name),['Late','Early','Unknown']);assert.deepEqual([...items].sort((a,b)=>compare(a,b,'updated-asc')).map(i=>i.name),['Early','Late','Unknown']);});
test('title ordering is numeric and timestamps accept notification epoch values',()=>{assert(compare({title:'Task 2'},{title:'Task 10'},'title')<0);assert.equal(dateValue('1789484400000'),1789484400000);assert.equal(dateValue('invalid'),0);});
