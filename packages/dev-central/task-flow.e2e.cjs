'use strict';
const assert=require('node:assert/strict');
async function evaluate(port,js){const r=await fetch(`http://localhost:${port}/eval`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({js}),signal:AbortSignal.timeout(30000)});return (await r.json()).result;}
(async()=>{
 const board=await evaluate(19133,'window.robos.getFeatures()');assert(board.ok,board.error);
 const feature=board.data.find(f=>f.number===53);assert(feature.assigned);
 assert.deepEqual(feature.tasks.map(t=>t.number),[54,55,56]);
 assert(feature.tasks[0].assigned);assert(feature.tasks[0].workable);
 assert(!feature.tasks[1].workable);assert(!feature.tasks[2].workable);
 const state=await evaluate(19135,'window.workTask.state()');assert(state.ok,state.error);
 assert.equal(state.data.issue.number,54);assert.equal(state.data.backend,'codex');
 assert(state.data.events.some(e=>e.role==='assistant'),'Real Codex assistant output expected');
 const ui=await evaluate(19135,"({messages:document.querySelectorAll('.session-message').length,title:document.querySelector('#ws-task-title').textContent})");assert(ui.messages>0);assert(ui.title.includes('Reconcile MVP Bazel'));
 console.log('Live workflow verified: feature #53 + task #54 assigned; #54 workable; #55/#56 blocked; existing Task Implementer displays real Codex events.');
})();
