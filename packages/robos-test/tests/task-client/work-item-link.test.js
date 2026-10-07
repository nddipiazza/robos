'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {workItemLink,GitHubAdapter}=require('../../../robos-task-client');
test('adapter preserves canonical issue URL, including a separate tracker and enterprise host',()=>{
 const adapter=new GitHubAdapter({repos:[{org:'code',repo:'app'}]});
 const task=adapter._mapIssue({number:144,title:'Project selection',url:'https://github.company.test/tracker/issues/issues/144'});
 assert.equal(workItemLink(task).url,'https://github.company.test/tracker/issues/issues/144');
});
test('Jira links stay with their task server and bare issue numbers do not invent URLs',()=>{
 assert.equal(workItemLink({key:'WORK-12',url:'https://jira.example/browse/WORK-12'}).url,'https://jira.example/browse/WORK-12');
 assert.equal(workItemLink({number:144,repo:'Hermetiq/cloud-native'}),null);
 assert.equal(workItemLink({url:'javascript:alert(1)'}),null);
});
