'use strict';
const assert=require('node:assert/strict');
const {plannerProjectTree}=require('./renderer/project-tree');
const root={id:'p',name:'Parent',workTaskUrl:'https://github.com/org/repo/issues/1'};
const child={id:'t',name:'Child',prompt:'Parent Feature: https://github.com/org/repo/issues/1'};
assert.equal(plannerProjectTree([child,root]).length,1);
assert.equal(plannerProjectTree([child,root])[0].children[0],child);
assert.equal(plannerProjectTree([child]).length,1); // Missing parents never hide saved work.
async function ev(js){const r=await fetch('http://localhost:19134/eval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({js})});const v=await r.json();if(v.error)throw Error(v.error);return v.result;}
(async()=>{
 const parent='work-task-f74126074e40e5868c6a813d',task='work-task-69d5e0ebe5531711457bbe50';
 assert(await ev(`!!document.querySelector('[data-product="MVP"] [data-id="${task}"]')`));
 assert(await ev(`projectsList.find(p=>p.id==='${task}').product.name==='MVP'`));
 assert(await ev(`!!document.querySelector('[data-id="${task}"] time').dateTime`));
 assert(await ev(`!!document.querySelector('[data-project-id="${parent}"] [data-id="${task}"]')`));
 await ev(`document.querySelector('[data-project-id="${parent}"] [data-id="${task}"]').onclick()`);
 assert.equal(await ev('routedTask.issue.number'),54);assert(await ev('getPromptValue()===routedTask.plan'));
 await ev("document.querySelector('#planner-breadcrumb button').onclick()");assert.equal(await ev('routedTask.issue.number'),53);
 await ev("document.querySelector('#planner-project-search').value='Reconcile';document.querySelector('#planner-project-search').oninput()");
 assert.equal(await ev("document.querySelectorAll('.planner-project-folder').length"),1);
 assert(await ev(`!!document.querySelector('[data-id="${task}"]')`));
 await ev("document.querySelector('#planner-project-search').value='';document.querySelector('#planner-project-search').oninput()");
 await ev("openProject(projectsList.find(p=>p.kind==='project').id)");
 assert.equal(await ev('routedTask'),null);assert.equal(await ev("document.querySelector('#planner-primary').textContent"),'Add feature');
 await ev(`document.querySelector('[data-id="${task}"]').onclick()`);
 assert.equal(await ev('routedTask.issue.number'),54);assert(await ev('getPromptValue()===routedTask.plan'));
 console.log('Project tree passed: parent grouping, missing-parent fallback, real task navigation, breadcrumb, search, local task selection, and restored task plan. No agent started or external data changed.');
})().catch(e=>{console.error(e);process.exitCode=1});
