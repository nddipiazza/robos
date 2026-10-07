'use strict';
(() => {
 const list=document.getElementById('task-list'),status=document.getElementById('picker-status'),search=document.getElementById('task-search'),refresh=document.getElementById('refresh-tasks');
 let rows=[],busy=false;
 const el=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
 function render(){
  list.replaceChildren();const query=search.value.trim().toLowerCase();
  const visible=rows.filter(row=>[row.title,row.url,row.repo].join(' ').toLowerCase().includes(query));
  if(!visible.length)list.append(el('p',query?'No matching tasks.':'No saved task reviews yet. Implement a task and generate its evidence first.'));
  for(const row of visible){
   const article=el('article','');article.className='task-row';const copy=el('div','');
   copy.append(el('h2',row.title),el('p',[row.url,row.repo].filter(Boolean).join(' · ')),el('p',row.available?'Changes, evidence, and walkthrough':'Saved checkout is missing'));
   const button=el('button','Open review');button.disabled=busy||!row.available;
   button.onclick=async()=>{busy=true;render();status.textContent='Opening '+row.title+'…';try{const result=await window.api.openReviewTask(row.id);if(!result.ok)throw Error(result.error);status.textContent='Opened '+row.title;}catch(error){status.textContent=error.message;}finally{busy=false;render();}};
   article.append(copy,button);list.append(article);
  }
 }
 async function load(){refresh.disabled=true;try{const result=await window.api.listReviewTasks();if(!result.ok)throw Error(result.error);rows=result.tasks;render();status.textContent=rows.length+' saved task reviews';}catch(error){status.textContent=error.message;}finally{refresh.disabled=false;}}
 search.oninput=render;refresh.onclick=load;load();
})();
