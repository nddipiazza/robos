'use strict';
const assert=require('node:assert/strict');
async function evaluate(js){const r=await fetch('http://localhost:19161/eval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({js})});const data=await r.json();if(data.error)throw Error(data.error);return data.result;}
(async()=>{
 const stages=await evaluate(`(()=>{const d=document.querySelector('#app-import-wizard');return {open:d.open,statuses:[...d.querySelectorAll('nav .import-state-badge')].map(e=>e.textContent)};})()`);assert(stages.open);assert.equal(stages.statuses.length,7);assert(stages.statuses.every(s=>s.includes('Already in apps')));
 await evaluate(`(async()=>{for(let i=0;i<5;i++){document.querySelector('#app-import-next').click();await Promise.resolve();await Promise.resolve();}return true;})()`);
 const users=await evaluate(`(()=>{const d=document.querySelector('#app-import-wizard');d.querySelector('.import-prior-status details').open=true;return {active:d.querySelector('[aria-current=step]').textContent,rows:d.querySelectorAll('.import-prior-status li').length,selected:d.querySelectorAll('[data-person]:checked').length};})()`);assert(users.active.includes('Users'));assert(users.rows>0);assert.equal(users.selected,0);
 await evaluate(`document.querySelector('#app-import-next').click();true`);
 const groups=await evaluate(`(()=>{const d=document.querySelector('#app-import-wizard');return {active:d.querySelector('[aria-current=step]').textContent,rows:d.querySelectorAll('.import-prior-status li').length};})()`);assert(groups.active.includes('Groups'));assert(groups.rows>0);
 await evaluate(`(async()=>{document.querySelector('#app-import-close').click();await document.getElementById('app-import-start').onclick();return true;})()`);
 console.log('Live wizard: all seven saved-stage indicators visible; Users and Groups expose existing entries without selecting or importing them.');
})().catch(e=>{console.error(e);process.exitCode=1;});
