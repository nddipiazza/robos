'use strict';
window.mountProjectReviewSettings = async function(project) {
  const prHost=document.getElementById('tab-pr-review-settings');
  const messageHost=document.getElementById('tab-review-messaging');
  const selected=project.url;
  for(const host of [prHost,messageHost]){host.replaceChildren();host.dataset.repo=selected;}
  const status=(host)=>{const p=document.createElement('p');p.setAttribute('role','status');host.append(p);return p;};
  const prStatus=status(prHost),messageStatus=status(messageHost);
  try{
    const result=await gp.reviewOptions(selected);if(prHost.dataset.repo!==selected)return;if(!result.ok)throw Error(result.error);
    document.querySelector('[data-tab="review-messaging"]').textContent=result.appName==='messaging app'?'Team messaging':result.appName;
    const editor=(host,label,value,description)=>{
      const heading=document.createElement('h3');heading.textContent=label;
      const intro=document.createElement('p');intro.textContent=description;
      const input=document.createElement('robos-ai-textarea');input.className='review-template-editor';input.setAttribute('min-height','260');input.setAttribute('show-submit','false');input.setAttribute('show-agent','false');input.setAttribute('show-commands','false');input.setAttribute('placeholder','Write your review template…');
      host.append(heading,intro,input);input.value=value;
      const editable=input.querySelector('[contenteditable]');editable?.setAttribute('role','textbox');editable?.setAttribute('aria-label',label);editable?.setAttribute('aria-multiline','true');
      const hint=document.createElement('p');hint.className='review-template-hint';hint.textContent='Available fields: {{title}}, {{url}}, {{repo}}, {{branch}}, {{description}}';host.append(hint);
      return input;
    };
    const githubLabel=document.createElement('label');githubLabel.textContent='Default GitHub PR reviewers';
    const githubReviewers=document.createElement('input');githubReviewers.type='text';githubReviewers.value=(result.settings.githubReviewers||[]).join(', ');githubReviewers.placeholder='username, organization/team';githubLabel.append(githubReviewers);prHost.append(githubLabel);
    const githubHint=document.createElement('p');githubHint.textContent='Review requests when moving a draft PR to ready. Separate usernames or teams with commas; you can change them for each PR.';prHost.append(githubHint);
    const prEditor=editor(prHost,'PR description template',result.settings.prTemplate,'Start each pull request with a clear description of the change and how it was verified.');
    const messageEditor=editor(messageHost,result.appName+' review notification template',result.settings.messageTemplate,'Invite your team to review the PR. Include {{url}} so they can open it directly.');
    const server=document.createElement('select'),channel=document.createElement('select');
    const destinations=document.createElement('div');destinations.className='review-template-destinations';messageHost.append(destinations);
    const label=(text,el)=>{const l=document.createElement('label');l.textContent=text;l.append(el);destinations.append(l);};
    label(result.appName+' workspace',server);label('Review channel',channel);
    server.add(new Option('Choose workspace',''));for(const s of result.servers)server.add(new Option(s.name,s.id));
    server.value=result.settings.serverId||(result.servers.length===1?result.servers[0].id:'');
    const reviewers=window.mountReviewerPicker(messageHost,id=>gp.reviewMembers(id));
    let generation=0;
    const load=async()=>{const mine=++generation;channel.replaceChildren(new Option('Choose channel',''));await reviewers.load(server.value,result.settings.reviewers || []);if(mine!==generation||prHost.dataset.repo!==selected)return;if(!server.value)return;messageStatus.textContent='Loading channels…';const r=await gp.reviewChannels(server.value);if(mine!==generation||prHost.dataset.repo!==selected)return;if(!r.ok){messageStatus.textContent=r.error;return;}for(const c of r.channels)channel.add(new Option('#'+c.name,c.id));channel.value=result.settings.channel;messageStatus.textContent='';};
    server.onchange=()=>load().catch(e=>messageStatus.textContent=e.message);
    const saveButton=(host,text,status,changes)=>{const save=document.createElement('button');save.className='btn btn-primary';save.textContent=text;save.onclick=async()=>{save.disabled=true;try{const next={...result.settings,...changes()};const r=await gp.saveReviewSettings({repo:selected,settings:next});status.textContent=r.ok?'Review settings saved.':r.error;if(r.ok)Object.assign(result.settings,next);}catch(e){status.textContent=e.message;}finally{save.disabled=false;}};host.append(save);};
    saveButton(prHost,'Save PR settings',prStatus,()=>({prTemplate:prEditor.value,githubReviewers:githubReviewers.value.split(/[\s,]+/).filter(Boolean)}));
    saveButton(messageHost,'Save notification settings',messageStatus,()=>({messageTemplate:messageEditor.value,serverId:server.value,channel:channel.value,reviewers:[...(result.settings.reviewers || []).filter(r=>r.serverId!==server.value),...reviewers.configured()]}));
    await load();if(prHost.dataset.repo!==selected)return;
    if(!result.servers.length)messageStatus.textContent='Configure a workspace in Team Chat Servers to enable notifications.';
  }catch(e){prStatus.textContent=messageStatus.textContent=e.message;}
};
