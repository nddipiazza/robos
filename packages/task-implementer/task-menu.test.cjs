'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {taskMenu}=require('./task-menu');
test('menu routes the clicked task and copies useful issue formats',()=>{
 const actions=[],copies=[],task={key:'#51',title:'Verify [editor]',body:'Acceptance criteria',url:'https://github.com/Hermetiq/task-and-issue-tracking/issues/51'};
 const menu=taskMenu(task,{action:a=>actions.push(a),copy:t=>copies.push(t)});
 menu.find(m=>m.label==='Run Task…').click();menu.find(m=>m.label==='Open in Task Planner').click();assert.deepEqual(actions,['run','plan']);
 menu.find(m=>m.label==='Copy text').click();assert.equal(copies[0],'#51 Verify [editor]\n\nAcceptance criteria\n\n'+task.url);
 menu.find(m=>m.label==='Copy Markdown link').click();assert.equal(copies[1],'[#51 Verify \\[editor\\]]('+task.url+')');
 assert.equal(menu.filter(m=>m.label?.startsWith('Copy')).length,4);
});
