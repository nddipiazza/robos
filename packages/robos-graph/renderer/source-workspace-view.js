'use strict';
window.renderSourceWorkspace = function(info) {
  const styles = document.createElement('style');
  styles.textContent = `
    #source-workspace { color:#c9d1d9; background:#0d1117; font:14px/1.5 system-ui,sans-serif; }
    #source-workspace h1 { font-size:24px; margin:0 0 6px; color:#f0f6fc; }
    #source-workspace h2 { font-size:18px; margin:0 0 12px; color:#f0f6fc; }
    #source-workspace h3 { font-size:14px; margin:22px 0 8px; color:#58d5e2; }
    #source-workspace p { margin:8px 0; overflow-wrap:anywhere; }
    #source-workspace code { color:#8b949e; font-size:12px; overflow-wrap:anywhere; }
    #source-workspace small { display:block; color:#8b949e; font:12px/1.6 ui-monospace,monospace; overflow-wrap:anywhere; }
    #source-workspace input { background:#161b22; color:#f0f6fc; border:1px solid #30363d; border-radius:6px; }
    #source-workspace button { background:#161b22; color:#c9d1d9; border:1px solid #30363d; border-radius:6px; cursor:pointer; }
    #source-workspace button:hover, #source-workspace button[aria-pressed=true] { border-color:#00bcd4; background:#15313a; color:#fff; }
    #source-config-details { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:20px; min-width:0; }
    #source-config-details button { margin-left:10px; padding:3px 8px; }
    #source-config-count { color:#8b949e; }
  `;
  document.head.append(styles);
  const existing = document.getElementById('app');
  existing.hidden = true; existing.style.display = 'none';
  const view = document.createElement('main'); view.id = 'source-workspace';
  view.style.cssText = 'padding:24px; height:100vh; overflow:auto; box-sizing:border-box';
  const add = (tag, text, parent = view) => { const e = document.createElement(tag); e.textContent = text; parent.append(e); return e; };
  add('h1', (info.appName || 'RobOS') + ' — Source declarations');
  add('h2', info.title);
  add('p', 'Declared configuration and relationships. Deployment status and live health are unknown.');
  add('code', info.root);
  const input = add('input',''); input.id = 'source-config-search'; input.placeholder = 'Filter configuration, environment or source path';
  input.style.cssText = 'display:block;width:95%;margin:16px 0;padding:10px';
  const count = add('p',''); count.id = 'source-config-count';
  const layout = add('div',''); layout.style.cssText = 'display:grid;grid-template-columns:minmax(260px,1fr) 2fr;gap:20px';
  const list = add('div','',layout); list.id='source-config-list';
  const details = add('section','Select a configuration to inspect its evidence and links.',layout);details.id='source-config-details';
  const select = node => {
    list.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.nodeId===node['@id'])));
    details.replaceChildren(); add('h2',node['dcterms:title'],details);
    add('code',node['@id'],details);add('p',node['dcterms:description'] || '',details);
    add('h3','Source evidence',details);
    for(const e of node['robos:evidence'] || []) add('p',e.repository + '/' + e.path + ':' + e.line,details);
    add('h3','Relationships and conditions',details);
    for(const [predicate,values] of Object.entries(node)) {
      if(predicate.startsWith('@') || ['robos:evidence','robos:relationshipEvidence','robos:classification'].includes(predicate)) continue;
      for(const value of [].concat(values || [])) {
        const id = typeof value === 'object' ? value?.['@id'] : typeof value === 'string' && value.startsWith('urn:') ? value : null;
        if(!id) continue;
        const row=add('p',predicate + ' → ' + (info.labels[id] || id),details);
        const target=info.nodes.find(n=>n['@id']===id);
        if(target){const button=add('button','Inspect',row);button.addEventListener('click',()=>select(target));}
        for(const e of node['robos:relationshipEvidence'] || []) if(e.predicate===predicate && (typeof e.target==='string'?e.target:e.target?.['@id'])===id){
          if(e.condition || e.note) add('p',e.condition || e.note,details);
          for(const source of e.evidence || [])add('small',source.repository+'/'+source.path+':'+source.line+' ',details);
        }
      }
    }
  };
  const render = () => {
    const query=input.value.toLowerCase();const matches=info.nodes.filter(n=>JSON.stringify(n).toLowerCase().includes(query));
    count.textContent=matches.length+' of '+info.nodes.length+' source declarations';list.replaceChildren();
    for(const n of matches){const button=add('button',n['dcterms:title'],list);button.dataset.nodeId=n['@id'];button.style.cssText='display:block;width:100%;text-align:left;margin:4px 0;padding:8px';button.addEventListener('click',()=>select(n));}
  };
  input.addEventListener('input',render);document.body.append(view);render();
};
