'use strict';
(() => {
 const row=document.createElement('div');row.className='review-activity';row.hidden=true;
 const timer=document.createElement('span');timer.className='review-wait-timer';
 const ping=document.createElement('button');ping.textContent='Ping for review';
 const history=document.createElement('details'),summary=document.createElement('summary'),list=document.createElement('ol');summary.textContent='Review pings';history.append(summary,list);row.append(timer,ping,history);
 document.querySelector('#pr-ready-button').parentElement.append(row);
 let state,refreshing=false,available=false;
 const when=value=>new Date(value).toLocaleString();
 function tick(){timer.hidden=!available||!state?.waiting;if(!available||!state?.waiting)return;const seconds=Math.max(0,Math.floor((Date.now()-Date.parse(state.waiting.since))/1000));timer.textContent=`Awaiting review · ${Math.floor(seconds/3600)}h ${String(Math.floor(seconds/60)%60).padStart(2,'0')}m ${String(seconds%60).padStart(2,'0')}s`;timer.title='Passing CI in review, tracked since '+when(state.waiting.since);}
 function render(){row.hidden=false;ping.hidden=!(state.pr?.isAuthor&&state.pr.state==='OPEN'&&!state.pr.isDraft);list.replaceChildren();for(const item of [...state.history].reverse()){const li=document.createElement('li');li.textContent=`${when(item.at)} · ${item.kind==='github'?'GitHub review request':'Team message'+(item.channel?' · '+item.channel:'')} · ${item.status}`;if(item.error)li.title=item.error;list.append(li);}summary.textContent=`Review pings (${state.history.length})`;history.hidden=!state.history.length;tick();}
 async function refresh(){if(refreshing)return;refreshing=true;try{const r=await window.api.reviewActivity();if(r.ok){available=true;state=r;render();}else{available=false;timer.hidden=true;timer.title=r.error;}}finally{refreshing=false;}}
 ping.onclick=async()=>{
  const dialog=document.createElement('dialog');dialog.className='pr-ready-dialog';dialog.setAttribute('aria-label','Ping for review');
  const heading=document.createElement('h2');heading.textContent='Ping for review';
  const intro=document.createElement('p');intro.className='pr-ready-intro';intro.textContent='Request GitHub reviews, notify the team, or do both.';
  const field=document.createElement('div');field.className='pr-ready-field';const label=document.createElement('label');label.className='pr-assign-reviewers';const github=document.createElement('input');github.type='checkbox';github.checked=true;label.append(github,' Request GitHub reviews');const reviewers=document.createElement('input');reviewers.setAttribute('aria-label','GitHub reviewers');reviewers.placeholder='username, organization/team';field.append(label,reviewers);github.onchange=()=>reviewers.disabled=!github.checked;
  const host=document.createElement('div'),title=document.createElement('input'),body=document.createElement('textarea');title.value=state.pr.title;body.value=state.pr.body;
  const options=window.mountReviewMessageOptions(host,state.pr,title,body,{}, {occasion:'ping'});
  const last=document.createElement('p');last.className='pr-ready-intro';const previous=[...state.history].reverse().find(h=>h.kind==='message'&&h.status==='sent');last.textContent=previous?'You last pinged the team '+when(previous.at)+'.':'No team review ping recorded yet.';
  const status=document.createElement('p');status.className='pr-ready-feedback';status.role='status';
  const footer=document.createElement('footer');footer.className='pr-ready-actions';const cancel=document.createElement('button');cancel.className='pr-ready-cancel';cancel.textContent='Cancel';cancel.onclick=()=>dialog.close();const send=document.createElement('button');send.className='pr-ready-button';send.textContent='Ping for review';send.disabled=true;footer.append(cancel,send);dialog.append(heading,intro,field,host,last,status,footer);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
  try{const defaults=await window.api.reviewGitHubReviewers();if(!defaults.ok)throw Error(defaults.error);reviewers.value=defaults.reviewers.join(', ');await options.ready;}catch(e){status.textContent=e.message;}finally{send.disabled=false;}
  const requestId=crypto.randomUUID();
  send.onclick=async()=>{send.disabled=true;cancel.disabled=true;try{
   const message=options.selection();if(!github.checked&&!message)throw Error('Select GitHub reviews or a team message.');
   status.textContent='Sending review requests…';const result=await window.api.pingReview({github:github.checked,reviewers:reviewers.value.split(/[\s,]+/).filter(Boolean),message,requestId});if(!result.ok)throw Error(result.error);
   state={...state,...result};render();status.textContent=result.results.join(' ');send.hidden=true;cancel.textContent='Done';
  }catch(e){status.textContent=e.message;send.disabled=false;}finally{cancel.disabled=false;}};
 };
 refresh().catch(()=>{});const poll=setInterval(()=>{if(!document.hidden)refresh().catch(()=>{});},15000),clock=setInterval(tick,1000);
 window.addEventListener('beforeunload',()=>{clearInterval(poll);clearInterval(clock);},{once:true});
})();
