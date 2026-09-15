'use strict';
let plannerMonacoReady;
function loadPlannerMonaco(){
 if(!plannerMonacoReady)plannerMonacoReady=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='../node_modules/monaco-editor/min/vs/loader.js';script.onerror=()=>reject(Error('Markdown editor could not load.'));
  script.onload=()=>{require.config({paths:{vs:'../node_modules/monaco-editor/min/vs'}});require(['vs/editor/editor.main'],()=>resolve(monaco),reject);};document.head.append(script);
 });return plannerMonacoReady;
}
class PlannerMarkdownEditor extends HTMLElement {
 constructor(){super();this._value='';this.dirty=false;}
 connectedCallback(){if(this.initialized)return;this.initialized=true;this.setAttribute('aria-label','Requirements Markdown editor');this.style.height='430px';loadPlannerMonaco().then(m=>{
  this.editor=m.editor.create(this,{value:this._value,language:'markdown',theme:'vs-dark',automaticLayout:true,wordWrap:'on',minimap:{enabled:false},scrollBeyondLastLine:false,fontSize:14,accessibilitySupport:'on'});
  this.editor.onDidChangeModelContent(()=>{this._value=this.editor.getValue();if(!this.setting){this.dirty=true;this.dispatchEvent(new Event('input',{bubbles:true}));}});
 }).catch(e=>{this.textContent=e.message;});}
 get value(){return this.editor?.getValue()??this._value;}
 set value(v){this._value=String(v||'');this.setting=true;this.editor?.setValue(this._value);this.setting=false;this.dirty=false;}
 focus(){this.editor?.focus();this.editor?.layout();}
}
customElements.define('planner-markdown-editor',PlannerMarkdownEditor);
async function revisePlannerMarkdown(){
 const source=document.getElementById('prompt-input'),initial=source.value,projectId=currentProjectId;
 const dialog=document.createElement('dialog');dialog.className='planner-ai-dialog';
 dialog.innerHTML='<h2>Revise Markdown with AI</h2><p>Describe the change. Codex will propose revised Markdown for you to review before applying.</p><robos-ai-textarea id="markdown-instructions" show-submit="false" show-commands="false" placeholder="What should change?" min-height="90"></robos-ai-textarea><p role="status"></p><article class="planner-markdown"></article><footer><button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-outline" data-propose>Propose revision</button><button class="btn btn-accent" data-apply disabled>Apply to editor</button></footer>';
 document.body.append(dialog);dialog.showModal();let proposed=null;
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
 const status=dialog.querySelector('[role=status]'),button=dialog.querySelector('[data-propose]');
 button.onclick=async()=>{const instruction=dialog.querySelector('robos-ai-textarea').value?.trim();if(!instruction){status.textContent='Describe the change first.';return;}button.disabled=true;dialog.querySelector('[data-apply]').disabled=true;status.textContent='Codex is drafting the revision…';try{const result=await window.robos.reviseMarkdown({markdown:initial,instruction});if(!result.ok)throw Error(result.error);proposed=result.text;dialog.querySelector('article').innerHTML=plannerMarkdown(proposed);dialog.querySelector('[data-apply]').disabled=false;status.textContent='Review the proposed Markdown below.';}catch(e){status.textContent=e.message;}finally{button.disabled=false;}};
 dialog.querySelector('[data-apply]').onclick=()=>{if(currentProjectId!==projectId||source.value!==initial){status.textContent='The document changed while this revision was being prepared. Close and request a new revision.';return;}source.value=proposed;source.dirty=true;setPlannerEditing(true);dialog.close();showGenerateStatus('Revision applied to the editor. Review and save it.');};
}
