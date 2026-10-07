'use strict';
(() => {
 const content=document.querySelector('.theater-stage-content');if(!content)return;
 const split=document.createElement('div');split.className='review-split';content.before(split);split.append(content);
 const divider=document.createElement('div');divider.className='review-agent-divider';divider.tabIndex=0;divider.setAttribute('role','separator');divider.setAttribute('aria-orientation','vertical');divider.setAttribute('aria-label','Resize agent discussion');
 const pane=document.createElement('aside');pane.className='review-agent-pane';pane.hidden=true;divider.hidden=true;
 const header=document.createElement('header'),label=document.createElement('strong'),select=document.createElement('select'),close=document.createElement('button');select.setAttribute('aria-label','Agent discussion context');close.textContent='×';close.setAttribute('aria-label','Close agent discussion');label.textContent='Agent discussion';header.append(label,select,close);
 const controls=document.createElement('div');controls.className='review-agent-controls';
 const chat=document.createElement('robos-agent-discussion');pane.append(header,controls,chat);split.append(divider,pane);
 const contexts=new Map();let active=null;
 const render=()=>{const c=contexts.get(active);if(!c)return;select.value=active;controls.replaceChildren();if(c.controls)controls.append(c.controls);chat.value=c;};
 const save=c=>{if(c.persist)try{localStorage.setItem('robos-agent-chat:'+c.persist,JSON.stringify(c.messages.slice(-120)));}catch{}};
 const api=window.reviewAgent={
  register(id,config){const old=contexts.get(id);const c={messages:[],...old,...config};if(config.persist&&!old)try{c.messages=JSON.parse(localStorage.getItem('robos-agent-chat:'+config.persist)||'[]');}catch{}contexts.set(id,c);select.replaceChildren(...[...contexts].map(([id,c])=>{const o=document.createElement('option');o.value=id;o.textContent=c.title;return o;}));if(active===id)render();},
  open(id){if(!contexts.has(id))return;active=id;pane.hidden=false;divider.hidden=false;render();},
  close(){pane.hidden=true;divider.hidden=true;},
  update(id,values){const c=contexts.get(id);if(!c)return;Object.assign(c,values);save(c);if(active===id)render();},
  append(id,role,text){const c=contexts.get(id);if(!c)return;c.messages.push({role,text,timestamp:Date.now()});save(c);if(active===id)render();},
  async send(id,text){const c=contexts.get(id);if(!c||c.busy)return;if(api.busy()){api.open(id);api.append(id,'system','Wait for the current agent to finish.');return;}api.open(id);api.append(id,'user',text);api.update(id,{busy:true});try{const result=await c.send(text);if(result!==false)chat.clearInput();}catch(e){api.append(id,'system',e.message);}finally{api.update(id,{busy:false,activity:''});}},
  busy(){return [...contexts.values()].some(c=>c.busy);}
 };
 chat.addEventListener('agent-submit',e=>api.send(active,e.detail.text));select.onchange=()=>api.open(select.value);close.onclick=()=>api.close();
 const button=document.createElement('button');button.className='btn-theater-action';button.textContent='Suggest changes';button.onclick=()=>api.open('changes');document.querySelector('.theater-actions')?.append(button);
 function width(value){pane.style.width=Math.max(300,Math.min(split.clientWidth-300,value))+'px';}
 divider.onpointerdown=e=>{divider.setPointerCapture(e.pointerId);divider.onpointermove=move=>width(split.getBoundingClientRect().right-move.clientX);divider.onpointerup=()=>divider.onpointermove=null;};
 divider.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();width(pane.getBoundingClientRect().width+(e.key==='ArrowLeft'?30:-30));}};
 api.register('changes',{title:'Code changes',send:async text=>{const r=await window.api.demoAction({action:'suggest',text});if(!r.ok)throw Error(r.error);}});
 api.register('recovery',{title:'Uncommitted changes',send:async text=>{const r=await window.api.demoAction({action:'remediate',text});if(!r.ok)throw Error(r.error);}});
 api.register('walkthrough',{title:'Walkthrough',send:async text=>{const r=await window.api.demoAction({action:'message',text});if(!r.ok)throw Error(r.error);}});
 window.api.onDemoState?.(state=>{const id=state.discussionPurpose==='changes'?'changes':state.remediating?'recovery':'walkthrough';api.update(id,{messages:state.messages,busy:state.status==='running',agentName:state.agentName,activity:state.activitySummary?.text});if(state.status==='running')api.open(id);});
 window.api.getDemoState?.().then(state=>{if(state){const id=state.discussionPurpose==='changes'?'changes':state.remediating?'recovery':'walkthrough';api.update(id,{messages:state.messages,busy:state.status==='running',agentName:state.agentName});}});
})();
