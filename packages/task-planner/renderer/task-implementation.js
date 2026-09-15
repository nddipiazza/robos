'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const button=document.getElementById('btn-implement-task');
 function chooseTask(){
  const record=selectedPlannerRecord();
  if(record?.kind==='task'&&record.workTaskUrl)return Promise.resolve(record.workTaskUrl);
  const selected=typeof plannerSelectedTask==='number'?tasks[plannerSelectedTask]:null;
  if(selected?.ticketUrl)return Promise.resolve(selected.ticketUrl);
  const linked=tasks.filter(t=>t.ticketUrl);
  if(!linked.length)throw Error('Sync this task to the server before opening Task Implementer.');
  if(linked.length===1)return Promise.resolve(linked[0].ticketUrl);
  return new Promise(resolve=>{
   const dialog=document.createElement('dialog');dialog.className='implement-task-picker';dialog.setAttribute('aria-label','Choose a task to implement');
   const title=document.createElement('h2');title.textContent='Choose a task to implement';dialog.append(title);
   const list=document.createElement('div');list.className='implement-task-options';dialog.append(list);
   let chosen=null;
   linked.forEach(t=>{const option=document.createElement('button');option.type='button';option.textContent=[t.ticketKey,t.title].filter(Boolean).join(' · ');option.onclick=()=>{chosen=t.ticketUrl;dialog.close();};list.append(option);});
   const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.className='btn btn-outline';cancel.onclick=()=>dialog.close();dialog.append(cancel);
   dialog.onclose=()=>{dialog.remove();resolve(chosen);};document.body.append(dialog);dialog.showModal();
  });
 }
 button.onclick=async()=>{
  if(button.disabled)return;button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Opening Task Implementer…';
  try{const url=await chooseTask();if(!url)return;await taskCall('select',{issueUrl:url});await taskCall('open-implementer');showCreateStatus('Task Implementer opened. Review the approved plan and launch settings there.');}
  catch(e){showCreateStatus(e.message,true);}
  finally{button.disabled=false;button.removeAttribute('aria-busy');button.textContent='Implement Task';}
 };
});
