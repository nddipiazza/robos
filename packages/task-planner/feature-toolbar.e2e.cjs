'use strict';
const assert=require('node:assert/strict');
const base=process.env.ROBOS_PLANNER_DEBUG||'http://localhost:19134';
async function evaluate(js){const response=await fetch(base+'/eval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({js})});const data=await response.json();if(data.error)throw Error(data.error);return data.result;}
(async()=>{
 const result=await evaluate(`(()=>{
 const menu=document.getElementById('planner-more');menu.open=true;document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));const escape=!menu.open;
 menu.open=true;document.getElementById('planner-title').dispatchEvent(new Event('pointerdown',{bubbles:true}));const outside=!menu.open;
 const field=document.getElementById('prompt-input');setPlannerEditing(true);
 return {escape,outside,editors:field.querySelectorAll('.monaco-editor').length,language:field.editor.getModel().getLanguageId(),value:field.value.length,toolbar:document.getElementById('feature-toolbar').contains(document.getElementById('planner-edit')),newProjectHidden:document.getElementById('btn-new-project').hidden};})()`);
 assert(result.escape&&result.outside&&result.toolbar&&result.newProjectHidden);assert.equal(result.editors,1);assert.equal(result.language,'markdown');assert(result.value>0);
 const membership=await evaluate(`setPlannerView('details');({text:document.getElementById('planner-membership').textContent,oldMetadataHidden:document.getElementById('project-metadata-card').hidden})`);assert(membership.text);assert(membership.oldMetadataHidden);
 await evaluate(`setPlannerView('plan');setPlannerEditing(false)`);
 console.log('PASS: Escape/outside dismissal, unified toolbar, sidebar, real Monaco, project membership');
})().catch(error=>{console.error(error);process.exitCode=1;});
