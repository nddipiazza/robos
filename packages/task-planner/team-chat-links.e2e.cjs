'use strict';
const assert=require('node:assert/strict');
async function evaluate(js){const r=await fetch('http://localhost:19134/eval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({js})});const data=await r.json();if(data.error)throw Error(data.error);return data.result;}
(async()=>{
 const state=await evaluate(`(async()=>{const record=selectedPlannerRecord(),section=document.querySelector('.planner-chat-links'),root=section.querySelector('robos-kgraph-selector').value;const saved=await window.robos.chatLinks({id:record.id,graphRoot:root});const local=await window.robos.loadProject(record.id);return {saved,description:local.project.prompt,rows:section.querySelectorAll('.chat-link-row').length,graphName:section.querySelector('robos-kgraph-selector').selectedName};})()`);
 assert(state.saved.ok);assert(state.saved.saved);assert(state.saved.links.length>0);assert.equal(state.rows,state.saved.links.length);assert(state.graphName);assert(state.description.includes('## Team chat'));assert(state.description.includes(state.saved.links[0].url));
 const draft=await evaluate(`(async()=>{const s=document.querySelector('.planner-chat-links');[...s.querySelectorAll('.chat-link-row button')].find(b=>b.textContent==='Edit').click();const editTitle=s.querySelector('[name=title]').value;s.querySelector('[data-cancel]').click();return {editTitle,cancelled:s.querySelector('[name=title]').value===''};})()`);
 assert.equal(draft.editTitle,state.saved.links[0].title);assert(draft.cancelled);
 console.log('Live Task Planner: saved chat links reload from KGraph, match the description, display the server, and support editing/cancel. No chat messages sent.');
})().catch(e=>{console.error(e);process.exitCode=1;});
