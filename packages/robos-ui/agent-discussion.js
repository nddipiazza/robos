'use strict';
// Shared chat surface. Callers provide the conversation and submit handler.
class RobosAgentDiscussion extends HTMLElement {
 connectedCallback(){if(this.ready)return;this.ready=true;
  this.innerHTML='<div class="agent-discussion-log" role="log" aria-label="Agent conversation"></div><p class="agent-discussion-status" role="status"></p><robos-ai-textarea min-height="64" max-chars="16000" show-agent="false" placeholder="Ask a question or suggest a change…"></robos-ai-textarea>';
  this.log=this.querySelector('[role=log]');this.status=this.querySelector('[role=status]');this.input=this.querySelector('robos-ai-textarea');
  this.follow=true;try{this.follow=localStorage.getItem('robos-agent-follow-latest')!=='false';}catch{}const label=document.createElement('label'),follow=document.createElement('input');follow.type='checkbox';follow.checked=this.follow;label.append(follow,' Follow latest');this.prepend(label);follow.onchange=()=>{this.follow=follow.checked;try{localStorage.setItem('robos-agent-follow-latest',String(this.follow));}catch{}if(this.follow)this.log.scrollTop=this.log.scrollHeight;};
  this.input.addEventListener('robos-submit',async e=>{const text=e.detail.value.trim();if(!text||this.busy)return;this.dispatchEvent(new CustomEvent('agent-submit',{detail:{text}}));});
 }
 set value(value){this.connectedCallback();this.busy=!!value.busy;this.status.textContent=value.activity|| (this.busy?'Agent is working…':'');
  const previous=this.log.scrollTop;const anchor=[...this.log.children].find(e=>e.getBoundingClientRect().bottom>this.log.getBoundingClientRect().top);const anchorId=anchor?.dataset.messageId,offset=anchor?anchor.getBoundingClientRect().top-this.log.getBoundingClientRect().top:0;
  this.log.replaceChildren();for(const message of value.messages||[]){const bubble=document.createElement('div');bubble.className='walkthrough-bubble '+message.role;bubble.dataset.messageId=message.id||String(message.timestamp||'');const label=document.createElement('strong');label.textContent=message.role==='user'?'You':message.role==='system'?'Status':message.agentName||value.agentName||'Agent';const header=document.createElement('div');header.className='walkthrough-bubble-header';header.append(label);if(message.timestamp){const time=document.createElement('time');time.textContent=new Date(message.timestamp).toLocaleTimeString();header.append(time);}const text=document.createElement('p');text.textContent=message.text;bubble.append(header,text);this.log.append(bubble);}
  if(this.follow)this.log.scrollTop=this.log.scrollHeight;else{this.log.scrollTop=previous;const retained=[...this.log.children].find(e=>e.dataset.messageId===anchorId);if(retained)this.log.scrollTop+=retained.getBoundingClientRect().top-this.log.getBoundingClientRect().top-offset;}
  const submit=this.input.querySelector('.robos-submit-btn');if(submit){submit.disabled=this.busy;submit.textContent=this.busy?'Working…':'Send';}
 }
 clearInput(){if(this.input){this.input.value='';const editable=this.input.querySelector('.robos-ai-inner');if(editable)editable.textContent='';}}
}
customElements.define('robos-agent-discussion',RobosAgentDiscussion);
