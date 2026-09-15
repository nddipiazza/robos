'use strict';
const assert=require('node:assert/strict');
async function ev(js){const r=await fetch('http://localhost:19133/eval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({js})});const d=await r.json();if(d.error)throw Error(d.error);return d.result;}
(async()=>{
 await ev("window.switchTab('feature')");assert.equal(await ev("!!document.querySelector('#kpi-ribbon')"),false);
 assert.equal(await ev("/sprint/i.test(document.body.innerText)"),false);
 assert.deepEqual(await ev("[...document.querySelectorAll('#dashboard > section')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.id)"),['feature-card']);
 assert.equal(await ev("getComputedStyle(document.querySelector('#activity-card')).display"),'none');
 assert.equal(await ev("!!document.querySelector('#feature-selector')"),false);
 assert.equal(await ev("document.querySelectorAll('[data-unassign]').length"),await ev('appState.allFeatures.filter(f=>f.assigned).length'));
 await ev('openFeaturePicker()');assert(await ev("document.querySelector('#feature-picker').open"));
 await ev("[...document.querySelectorAll('#feature-options input:not(:disabled)')].slice(0,2).forEach(b=>b.click())");assert.equal(await ev("document.querySelector('#feature-picker-save').textContent"),'Assign selected (2)');
 await ev("document.querySelector('#feature-search').value='no-such-feature-xyz';document.querySelector('#feature-search').oninput()");assert.equal(await ev("document.querySelector('#feature-options').textContent"),'No matching open features.');
 await ev("document.querySelector('#feature-picker-cancel').click()");
 const unassigned=await ev('appState.allFeatures.find(f=>!f.assigned&&!f.closed).id');
 const result=await ev(`window.robos.unassignFeature(${JSON.stringify(unassigned)})`);assert(result.ok);
 console.log('PASS: tab fills workspace, no KPI/Sprint/audit trail, assigned cards have unassign, real feature picker search and multi-select, idempotent unassign endpoint. No assignments changed.');
})().catch(e=>{console.error(e);process.exitCode=1});
