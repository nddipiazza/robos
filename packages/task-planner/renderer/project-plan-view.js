(function(root) {
  'use strict';
  const el = (tag, text, cls) => { const node=document.createElement(tag); if(text!==undefined) node.textContent=text; if(cls) node.className=cls; return node; };
  const link = (text,url) => { const node=el('a',text); if(/^https:\/\/[^\s<>]+$/.test(url||'')) { node.href=url; node.target='_blank'; node.rel='noopener noreferrer'; } return node; };
  function render(container, plan, selected, liveIssue) {
    container.replaceChildren();
    const header=el('header',undefined,'plan-heading');
    header.append(el('p',`PROJECT PLAN · ${plan.status.toUpperCase()}`,'plan-eyebrow'),el('h1',plan.name),el('p',plan.summary));
    header.append(el('p',`Owners: ${plan.owners.join(', ')}${plan.window?' · '+plan.window:''}`));
    container.append(header);
    if(plan.status==='review-required') container.append(el('p','Design review required before implementation.','plan-notice'));
    container.append(el('p','Issue states below are saved snapshots; select “Read current task” to read GitHub. Viewing does not update the plan.','plan-muted'));
    if(liveIssue) {
      const live=el('section',undefined,'plan-card');
      live.append(el('h2',`Current GitHub task #${liveIssue.number}: ${liveIssue.state}`),link(liveIssue.title,liveIssue.url),el('p',`Updated ${liveIssue.updatedAt}`));
      const detail=el('details'); detail.append(el('summary','Current task scope and acceptance criteria'),el('pre',liveIssue.body,'plan-prose')); live.append(detail); container.append(live);
    }
    for(const [key,title] of [['design','Design and sequence'],['verification','Verification'],['risks','Risks and decisions']]) if(plan[key]) { const section=el('section',undefined,'plan-card'); section.append(el('h2',title),el('p',plan[key],'plan-prose')); container.append(section); }
    const roadmap=el('section',undefined,'plan-roadmap');roadmap.append(el('h2','Epics and tasks'));
    for(const item of plan.items) {
      const card=el('article',undefined,'plan-card'+(item.parent?' plan-child':'')+(item.url===selected?' plan-selected':''));card.dataset.issueUrl=item.url;
      card.append(el('p',`${item.type} · ${item.issue?.state||'unknown'}${item.issue?.updatedAt?' · snapshot '+item.issue.updatedAt:''}`,'plan-eyebrow'),el('h3'));
      card.lastChild.append(link(`#${item.url.split('/').pop()} ${item.issue?.title||item.title||''}`,item.url));
      card.append(el('p',item.delivery,'plan-prose'));
      if(item.parent) { const parent=el('p','Parent: ');parent.append(link('#'+item.parent.split('/').pop(),item.parent));card.append(parent); }
      if(item.dependsOn?.length) { const deps=el('p','Depends on: ');for(const url of item.dependsOn)deps.append(link('#'+url.split('/').pop()+' ',url));card.append(deps); }
      const details=el('details');details.append(el('summary','Saved scope and acceptance criteria'),el('pre',item.issue?.body||'No issue snapshot','plan-prose'));card.append(details);
      const read=el('button','Read current task','btn btn-secondary');read.type='button';read.addEventListener('click',()=>container.dispatchEvent(new CustomEvent('plan-read-task',{detail:item.url})));card.append(read);
      roadmap.append(card);
    }
    container.append(roadmap);
    if(plan.references?.length){const refs=el('section',undefined,'plan-card');refs.append(el('h2','References'));for(const url of plan.references) { const p=el('p');p.append(link(url,url));refs.append(p); }container.append(refs);}
  }
  async function mount(container, api, selector) {
    container.replaceChildren(el('p','Loading project plans…'));
    const response=await api.list();
    if(!response.ok){container.replaceChildren(el('p',response.error));return;}
    const all=response.plans;
    const matching=all.filter(p=>!selector||p.id===selector||p.graphId===selector||p.items.some(i=>i.url===selector));
    const available=matching.length?matching:all;
    container.replaceChildren();
    if(!available.length){container.append(el('p','No saved project plans in this graph. Create one in Task Planner.'));return;}
    const toolbar=el('div',undefined,'plan-toolbar'), select=el('select');select.setAttribute('aria-label','Project plan');
    for(const p of available){const option=el('option',p.name);option.value=p.id;select.append(option);}
    const body=el('div');body.className='project-plan-body';
    const status=el('p',undefined,'plan-notice');status.setAttribute('role','status');
    toolbar.append(select);container.append(toolbar,status,body);
    let generation=0;
    const show=()=>{generation++;status.textContent='';render(body,available.find(p=>p.id===select.value),selector);};
    select.addEventListener('change',show);
    body.addEventListener('plan-read-task',async e=>{
      const ticket=++generation; status.textContent='Reading current task from GitHub…';
      const result=await api.view({selector:e.detail});
      if(ticket!==generation)return;
      if(!result.ok){status.textContent=result.error;return;}
      status.textContent='Current task read from GitHub. Saved plan unchanged.';
      render(body,available.find(p=>p.id===select.value),e.detail,result.issue);
    });
    show();
  }
  root.RobosProjectPlan={render,mount};
})(globalThis);
