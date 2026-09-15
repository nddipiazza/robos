'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
async function ev(js){const r=await fetch('http://localhost:19134/eval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({js})});const v=await r.json();if(v.error)throw Error(v.error);return v.result;}
async function until(js){for(let i=0;i<60;i++){const v=await ev(js);if(v)return v;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+js);}
(async()=>{
 const name='Planner creation verification '+Date.now(),ids=[];
 const manifest=path.join(os.homedir(),'.hermetiq/proof/robos-desktop-onboarding/planner-create-records.json');
 function remember(id){ids.push(id);fs.writeFileSync(manifest,JSON.stringify(ids,null,2));}
 await ev("document.querySelector('#btn-new-project').click();document.querySelector('#btn-project-confirm').click()");
 assert.match(await ev("document.querySelector('#project-create-error').textContent"),/Enter/);
 await ev(`document.querySelector('#project-name-input').value=${JSON.stringify(name)};document.querySelector('#btn-project-confirm').click()`);
 remember(await until(`currentProjectName===${JSON.stringify(name)} && currentProjectId`));
 assert(await ev(`!!document.querySelector('[data-product="${name}"]')`));
 assert.equal(await ev('selectedPlannerRecord().kind'),'project');assert.equal(await ev("document.querySelector('#planner-primary').textContent"),'Add feature');
 await ev("document.querySelector('#planner-primary').click()");await until("document.querySelector('#save-modal-overlay').style.display==='flex'");
 assert.match(await ev("document.querySelector('#save-modal-overlay .modal-title').textContent"),new RegExp(name));
 await ev("document.querySelector('#save-modal-input').value='Verify creation flow';document.querySelector('#save-modal-ok').click()");
 remember(await until("currentProjectName==='Verify creation flow' && currentProjectId"));
 assert.equal(await ev('selectedPlannerRecord().product.name'),name);
 await ev("document.querySelector('#planner-add-task').click()");await until("document.querySelector('#save-modal-overlay').style.display==='flex'");
 await ev("document.querySelector('#save-modal-input').value='Verify task parent';document.querySelector('#save-modal-ok').click()");
 remember(await until("currentProjectName==='Verify task parent' && currentProjectId"));
 assert.equal(await ev('selectedPlannerRecord().parentPlanId'),ids[1]);
 await ev(`openProject('${ids[0]}')`);assert.equal(await ev("document.querySelector('#planner-tab-tasks').textContent"),'Work (2)');assert.equal(await ev('selectedPlannerRecord().name'),name);
 await ev(`document.querySelector('#btn-new-project').click();document.querySelector('#project-name-input').value=${JSON.stringify(name)};document.querySelector('#btn-project-confirm').click()`);
 assert.match(await until("document.querySelector('#project-create-error').textContent"),/already exists/);
 await ev("document.querySelector('#btn-project-cancel').click()");assert.equal(await ev("document.querySelector('#project-create-error').textContent"),'');
 assert.equal(new Set(ids).size,3);
 console.log('PASS: empty-name validation, project creation, visible product root, contextual feature and task creation, unique IDs, persisted parent links, reopen, duplicate protection.');
 console.log('Temporary records for explicit cleanup: '+JSON.stringify(ids));
})().catch(e=>{console.error(e);process.exitCode=1});
