'use strict';
// File navigation owns presentation only; diff selection remains with the theater.
window.RobosChangedFiles=class {
 constructor(host,onSelect){
  this.host=host;this.onSelect=onSelect;this.files=[];this.selected=0;this.closed=new Set();this.mode='list';
  try{this.mode=localStorage.getItem('robos.prReview.fileView')==='tree'?'tree':'list';}catch{}
  host.replaceChildren();const toolbar=document.createElement('div');toolbar.className='changed-files-toolbar';
  toolbar.innerHTML='<div class="changed-files-views" role="group" aria-label="Changed files view"><button type="button" data-view="list" title="Flat list with full file paths">List</button><button type="button" data-view="tree" title="Group changed files by directory">Tree</button></div><input type="search" aria-label="Filter changed files" placeholder="Filter files…"><div data-tree-actions><button type="button" data-expand title="Expand all folders">Expand all</button><button type="button" data-collapse title="Collapse all folders">Collapse all</button></div>';
  this.list=document.createElement('div');this.list.className='changed-files-entries';host.append(toolbar,this.list);this.toolbar=toolbar;
  toolbar.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{this.mode=button.dataset.view;try{localStorage.setItem('robos.prReview.fileView',this.mode);}catch{}this.render();});
  toolbar.querySelector('input').oninput=()=>this.render();
  toolbar.querySelector('[data-expand]').onclick=()=>{this.closed.clear();this.render();};
  toolbar.querySelector('[data-collapse]').onclick=()=>{for(const f of this.files){const parts=f.filePath.split('/');parts.pop();while(parts.length){this.closed.add(parts.join('/'));parts.pop();}}this.render();};
 }
 update(files,selected,scope){if(scope!==this.scope){this.closed.clear();this.toolbar.querySelector('input').value='';this.scope=scope;}this.files=files;this.selected=selected;this.render();}
 select(index){this.selected=index;this.list.querySelectorAll('[data-file-index]').forEach(button=>{const active=Number(button.dataset.fileIndex)===index;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});}
 file(file,index,tree){const button=document.createElement('button');button.type='button';button.className='diff-file-item';button.dataset.fileIndex=index;button.title=file.filePath;const label=document.createElement('span');label.className='diff-file-path';label.textContent=tree?file.filePath.split('/').pop():file.filePath;const stats=document.createElement('span');stats.className='diff-file-stats';for(const [className,text] of [['stat-add','+'+file.additions],['stat-del','−'+file.deletions]]){const span=document.createElement('span');span.className=className;span.textContent=text;stats.append(span);}button.append(label,stats);button.onclick=()=>{this.select(index);this.onSelect(index);};return button;}
 render(){
  const query=this.toolbar.querySelector('input').value.trim().toLowerCase(),matches=this.files.map((f,i)=>({f,i})).filter(({f})=>f.filePath.toLowerCase().includes(query));
  this.toolbar.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===this.mode)));this.toolbar.querySelector('[data-tree-actions]').hidden=this.mode!=='tree';this.toolbar.querySelector('[data-collapse]').disabled=!!query;
  const count=document.getElementById('diff-file-count');if(count)count.textContent=query?matches.length+'/'+this.files.length:String(this.files.length);
  this.list.replaceChildren();if(!matches.length){const empty=document.createElement('p');empty.className='changed-files-empty';empty.textContent=query?'No matching files.':'No changed files.';this.list.append(empty);}
  if(this.mode==='list'){for(const {f,i} of matches)this.list.append(this.file(f,i,false));}
  else{const root={dirs:new Map(),files:[]};for(const entry of matches){const parts=entry.f.filePath.split('/');parts.pop();let node=root;for(const part of parts){if(!node.dirs.has(part))node.dirs.set(part,{dirs:new Map(),files:[]});node=node.dirs.get(part);}node.files.push(entry);}
   const append=(node,parent,prefix='')=>{for(const [name,child] of [...node.dirs].sort(([a],[b])=>a.localeCompare(b))){const path=prefix?prefix+'/'+name:name,details=document.createElement('details'),summary=document.createElement('summary'),children=document.createElement('div');summary.textContent=name;summary.title=path;children.className='changed-files-children';details.open=!!query||!this.closed.has(path);details.append(summary,children);details.ontoggle=()=>{if(!details.isConnected||query)return;if(details.open)this.closed.delete(path);else this.closed.add(path);};append(child,children,path);parent.append(details);}for(const {f,i} of node.files.sort((a,b)=>a.f.filePath.localeCompare(b.f.filePath)))parent.append(this.file(f,i,true));};append(root,this.list);
  }
  this.select(this.selected);
 }
};
