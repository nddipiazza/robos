/* Shared, local-only controls for compact RobOS lists. */
(()=>{
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function dateValue(value){const n=typeof value==='number'?value:/^\d{11,}$/.test(value||'')?Number(value):Date.parse(value);return Number.isFinite(n)?n:0;}
 function compare(a,b,order='updated-desc'){
  if(order==='title')return String(a.title||a.name||'').localeCompare(String(b.title||b.name||''),undefined,{numeric:true});
  if(order==='original')return 0;
  const av=dateValue(a.updatedAt||a.updated||a.modifiedAt),bv=dateValue(b.updatedAt||b.updated||b.modifiedAt);
  if(!av||!bv)return Number(!!bv)-Number(!!av);
  return order==='updated-asc'?av-bv:bv-av;
 }
 if(typeof module!=='undefined')module.exports={compare,dateValue};
 if(typeof window==='undefined')return;
 class Copy extends HTMLElement{
  connectedCallback(){if(this.shadowRoot)return;const root=this.attachShadow({mode:'open'});root.innerHTML=`<style>:host{display:inline-flex;vertical-align:middle;flex:0 0 auto;margin-left:4px}button{display:inline-flex;align-items:center;justify-content:center;width:23px;height:23px;padding:3px;border:0;border-radius:4px;background:transparent;color:#91a5b7;cursor:pointer}button:hover{background:#334353;color:#e5eff7}button:focus-visible{outline:2px solid #00bcd4}svg{width:13px;height:13px}</style><button type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg></button>`;const b=root.querySelector('button');b.title=b.ariaLabel=this.getAttribute('label')||'Copy full text';
   this.addEventListener('click',e=>{e.stopPropagation();e.preventDefault();});
   b.onclick=async e=>{e.stopPropagation();e.preventDefault();try{await navigator.clipboard.writeText(this.getAttribute('text')||'');b.title=b.ariaLabel='Copied';b.style.color='#63d6a0';}catch{b.title=b.ariaLabel='Could not copy. Try again.';}setTimeout(()=>{b.title=b.ariaLabel=this.getAttribute('label')||'Copy full text';b.style.color='';},1800);};
   this.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')e.stopPropagation();});
  }
 }
 class Time extends HTMLElement{
  static get observedAttributes(){return ['value'];}
  connectedCallback(){this.render();}
  attributeChangedCallback(){this.render();}
  render(){const value=this.getAttribute('value'),n=dateValue(value),label=this.getAttribute('label')||'Updated';if(!n){this.innerHTML='<span title="No timestamp was recorded">Update time unavailable</span>';return;}const date=new Date(n);this.innerHTML=`<time datetime="${date.toISOString()}" title="${esc(label+' '+date.toLocaleString(undefined,{dateStyle:'full',timeStyle:'long'}))}">${esc(label+' '+date.toLocaleDateString(undefined,{month:'short',day:'numeric',...(date.getFullYear()!==new Date().getFullYear()?{year:'numeric'}:{})})+' · '+date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}))}</time>`;}
 }
 class Sort extends HTMLElement{
  connectedCallback(){if(this.shadowRoot)return;const root=this.attachShadow({mode:'open'});root.innerHTML=`<style>:host{display:inline-flex;margin:6px 0;font:12px system-ui;color:#9aafbf}label{display:flex;align-items:center;gap:6px}select{max-width:180px;background:#14212c;color:#cbd9e3;border:1px solid #354657;border-radius:4px;padding:5px;font:inherit}</style><label>Sort<select aria-label="Sort ${esc(this.getAttribute('label')||'list')}">${this.hasAttribute('original')?`<option value="original">${esc(this.getAttribute('original')||'Default order')}</option>`:''}<option value="updated-desc">Recently updated</option><option value="updated-asc">Oldest updated</option><option value="title">Title A–Z</option></select></label>`;
   const select=root.querySelector('select');this.key='robos-list-sort:'+location.pathname+':'+(this.id||this.getAttribute('for')||this.getAttribute('label'));
   const stored=localStorage.getItem(this.key);if([...select.options].some(o=>o.value===stored))select.value=stored;
   select.onchange=()=>{localStorage.setItem(this.key,select.value);this.apply();this.dispatchEvent(new CustomEvent('sort-change',{bubbles:true,detail:{value:select.value}}));};
   const bind=()=>{const target=document.getElementById(this.getAttribute('for'));if(target){this.target=target;this.observer=new MutationObserver(()=>this.apply());this.observer.observe(target,{childList:true});this.apply();}};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
  }
  get value(){return this.shadowRoot?.querySelector('select').value||'updated-desc';}
  disconnectedCallback(){this.observer?.disconnect();}
  apply(){if(!this.target)return;this.observer.disconnect();const rows=[...this.target.children];const items=rows.filter(e=>e.matches(this.getAttribute('rows')||'*'));items.forEach((el,i)=>{if(!el.dataset.listOriginal)el.dataset.listOriginal=String(i+1);});
   const data=el=>({title:el.dataset.listTitle||el.querySelector('[data-list-title],.item-title,.server-item-name,.pr-title')?.textContent||el.textContent,updatedAt:el.dataset.listUpdated||el.querySelector('robos-list-time')?.getAttribute('value')||el.querySelector('time[datetime]')?.dateTime});
   const sorted=[...items].sort((a,b)=>this.value==='original'?Number(a.dataset.listOriginal)-Number(b.dataset.listOriginal):compare(data(a),data(b),this.value));
   if(sorted.some((e,i)=>e!==items[i])){const scrolls=[];for(let parent=this.target;parent;parent=parent.parentElement)scrolls.push([parent,parent.scrollTop]);const markers=items.map(e=>{const m=document.createComment('row');e.before(m);return m;});markers.forEach((m,i)=>m.replaceWith(sorted[i]));scrolls.forEach(([el,top])=>el.scrollTop=top);}
   this.observer.observe(this.target,{childList:true});
  }
 }
 customElements.define('robos-copy',Copy);customElements.define('robos-list-time',Time);customElements.define('robos-list-sort',Sort);
 window.robosList={compare,time:(value,label='Updated')=>`<robos-list-time value="${esc(value||'')}" label="${esc(label)}"></robos-list-time>`,copy:(text,label='Copy full text')=>`<robos-copy text="${esc(text)}" label="${esc(label)}"></robos-copy>`};
 const selectors={
  'robos-graph':['.node-title','.node-meta'],
  'task-implementer':['#ws-task-title','#task-description'],
  'task-planner':['#planner-title','.planner-row-name','.feature-task-link','.task-title','.task-card-title','.task-title-input','.task-body-preview','#planner-breadcrumb button','.pm-row strong','.pm-row p'],
  'dev-central':['[data-open]','.item-title','.notif-title','.notification-title','.notif-body','#feature-options label > span'],
  'task-servers':[],
  'pr-review':['.pr-title','#theater-pr-title'],
  'ci-pipeline-servers':['#servers td:first-child','#files li'],
  'workflow-studio':['#issue-title','#issue-body','.type-card-label'],
  'ci-monitor':['.run-name','.run-workflow'],
 };
 function enhance(){const app=document.currentScript?.dataset.app||scriptApp;for(const selector of selectors[app]||[]){document.querySelectorAll(selector).forEach(el=>{
   if(el.closest('robos-copy,.planner-tree-heading')||el.matches('textarea'))return;
   const text=el.dataset.copyText||(el.matches('input')?el.value:el.textContent);if(!text?.trim())return;
   const anchor=el.id==='task-description'?document.getElementById('desc-toggle'):el;
   let copy=el.tagName==='TD'?el.querySelector(':scope > robos-copy'):anchor.nextElementSibling;if(copy?.tagName!=='ROBOS-COPY'){copy=document.createElement('robos-copy');copy.setAttribute('label','Copy full '+(/description|body|\.pm-row p/.test(selector)?'description':'title'));if(el.tagName==='TD'){el.append(copy);}else{const wrap=document.createElement('span');wrap.className='robos-copy-line';anchor.before(wrap);wrap.append(anchor,copy);}}
   if(copy.getAttribute('text')!==text)copy.setAttribute('text',text);
  });}
 }
 const scriptApp=document.currentScript?.dataset.app;
 document.addEventListener('input',e=>{if(e.target.matches?.('.task-title-input'))enhance();});
 document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='robos-list-time{font:11px/1.5 system-ui;color:#8fa4b5;white-space:nowrap}robos-list-sort{flex-shrink:0}.robos-copy-line{display:flex;align-items:center;min-width:0}.robos-copy-line> :first-child{min-width:0;flex:1}';document.head.append(style);let pending=false;new MutationObserver(records=>{if(records.every(r=>r.target.closest?.('robos-copy,robos-list-time,robos-list-sort')))return;if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;enhance();});}}).observe(document.body,{childList:true,subtree:true,characterData:true});enhance();});
})();
