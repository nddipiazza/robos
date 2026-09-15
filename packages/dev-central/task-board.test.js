const {test}=require('node:test');const assert=require('node:assert/strict');const {buildBoard}=require('./task-board');
const url=n=>`https://github.com/org/repo/issues/${n}`;
const issue=(n,body='',state='OPEN')=>({number:n,url:url(n),title:'Issue '+n,body,state,assignees:[{login:'me'}]});
test('orders a feature DAG and offers every unblocked leaf, preserving multiple assignments',()=>{
 const b=buildBoard([issue(1),issue(4,`Parent Feature: ${url(1)}\nDepends on: ${url(2)}, ${url(3)}`),issue(3,`Parent Feature: ${url(1)}`),issue(2,`Parent Feature: ${url(1)}`),issue(5)],'me');
 assert.equal(b.filter(f=>f.assigned).length,2);assert.deepEqual(b[0].tasks.map(t=>t.number),[2,3,4]);assert.deepEqual(b[0].tasks.filter(t=>t.workable).map(t=>t.number),[2,3]);
});
test('closed dependencies unblock; unresolved external dependencies remain blocked',()=>{
 const b=buildBoard([issue(1),issue(2,`Parent Feature: ${url(1)}`,'CLOSED'),issue(3,`Parent Feature: ${url(1)}\nDepends on: #2`),issue(4,`Parent Feature: ${url(1)}\nDepends on: #99`)],'me');
 assert(b[0].tasks.find(t=>t.number===3).workable);assert(!b[0].tasks.find(t=>t.number===4).workable);
});
test('cycles are not offered as workable tasks',()=>{const b=buildBoard([issue(1),issue(2,'Parent Feature: #1\nDepends on: #3'),issue(3,'Parent Feature: #1\nDepends on: #2')],'me');assert(b[0].tasks.every(t=>!t.workable));});
