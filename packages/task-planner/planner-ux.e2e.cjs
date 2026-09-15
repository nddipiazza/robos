'use strict';
const assert=require('node:assert/strict');
async function ev(js){const r=await fetch('http://localhost:19134/eval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({js}),signal:AbortSignal.timeout(30000)});const result=await r.json();if(result.error)throw Error(result.error);return result.result;}
(async()=>{
 await ev("openProject('work-task-69d5e0ebe5531711457bbe50')");
 const initial=await ev("({number:routedTask.issue.number,primary:document.querySelector('#planner-primary').textContent,headings:document.querySelectorAll('#plan-reading-view h1').length,templates:document.querySelector('#templates-banner').hidden,exact:getPromptValue()===routedTask.plan})");
 assert.equal(initial.number,54);assert.equal(initial.primary,'Open PR review');assert(initial.templates);assert(initial.headings>0);assert(initial.exact);
 await ev("document.querySelector('#planner-edit').click()");assert(await ev("!document.querySelector('#prompt-input').hidden"));
 await ev("document.querySelector('#planner-edit').click()");assert(await ev('getPromptValue()===routedTask.plan'));
 for(const view of ['tasks','details','plan']){await ev(`document.querySelector('[data-planner-tab="${view}"]').click()`);assert(await ev(`!document.querySelector('#planner-panel-${view}').hidden`));assert.equal(await ev("[...document.querySelectorAll('[data-planner-panel]')].filter(e=>!e.hidden).length"),1);}
 await ev("setPlannerView('tasks')");assert(await ev("document.querySelectorAll('.planner-task-details').length===tasks.length && [...document.querySelectorAll('.planner-task-details')].every(e=>!e.open)"));
 await ev("document.querySelector('.planner-task-details summary').click()");assert(await ev("document.querySelector('.planner-task-details').open"));
 await ev("document.querySelector('#planner-templates').click()");assert(await ev("getComputedStyle(document.querySelector('#template-browser-overlay')).display!=='none'"));await ev("document.querySelector('#btn-close-browser').click()");
 await ev("openProject('work-task-f74126074e40e5868c6a813d')");assert.equal(await ev('routedTask.issue.number'),53);assert(await ev("document.querySelectorAll('#plan-reading-view h2').length>0"));
 await ev("openProject('work-task-69d5e0ebe5531711457bbe50')");
 await ev("setPlannerView('plan')");
 console.log('Planner UX: formatted preview, exact read/edit round-trip, three isolated views, template access, and matching ticket context passed. No agent launched or plan saved.');
})().catch(e=>{console.error(e);process.exitCode=1;});
