import {parse} from 'diff2html';
import {Diff2HtmlUI} from 'diff2html/lib/ui/js/diff2html-ui';
import 'diff2html/bundles/css/diff2html.min.css';
import 'highlight.js/styles/github-dark.css';
import './changes-view.css';
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const icon=kind=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 16 16');svg.setAttribute('width','16');svg.setAttribute('height','16');svg.setAttribute('aria-hidden','true');svg.classList.add(kind==='folder'?'tree-folder-icon':'tree-file-icon');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',kind==='folder'?'M1.5 3.5h5l1.5 2h6.5v8h-13z':'M3 1.5h6l4 4v9H3z M9 1.5v4h4 M5 8h6 M5 11h4');p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','1.2');svg.append(p);return svg;};
const comparePaths=(a,b)=>{const x=a.split('/'),y=b.split('/');for(let n=0;n<Math.min(x.length,y.length);n++){if(x[n]!==y[n]){const folderX=n<x.length-1,folderY=n<y.length-1;if(folderX!==folderY)return folderX?-1:1;return x[n].localeCompare(y[n]);}}return x.length-y.length;};
const name=file=>file.newName==='/dev/null'?file.oldName:file.newName;
const status=file=>file.isNew?'A':file.isDeleted?'D':file.isRename?'R':file.isCopy?'C':'M';
const button=(label,fn)=>{const node=el('button',label);node.type='button';node.onclick=fn;return node;};
window.mountChanges=async function(root,raw,{identity='review',onRefresh=()=>{},onSuggest=()=>window.reviewAgent?.open('changes')}={}){
 const files=parse(raw,{diffMaxChanges:5000}).sort((a,b)=>comparePaths(name(a),name(b)));
 const signature=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const key='robos-viewed:'+identity+':'+signature;let viewed=new Set();try{viewed=new Set(JSON.parse(localStorage.getItem(key)||'[]'));}catch{}
 let selected=0,mode='line-by-line',wrap=false,collapsed=new Set(),query='',hideViewed=false;
 const lock=root.querySelector('#diff-anti-rubber-stamp-lock');root.replaceChildren();root.classList.add('changes-view');
 const toolbar=el('header',undefined,'changes-toolbar'),heading=el('strong','Changes'),count=el('span',`${files.length} files`),unified=button('Unified',()=>{mode='line-by-line';drawFile();}),split=button('Split',()=>{mode='side-by-side';drawFile();}),wrapButton=button('Wrap lines',()=>{wrap=!wrap;drawFile();}),suggest=button('Suggest changes',onSuggest);
 toolbar.append(heading,count,button('Refresh',onRefresh),unified,split,wrapButton,suggest);
 const layout=el('div',undefined,'changes-layout'),sidebar=el('aside',undefined,'changes-sidebar'),search=el('input');search.type='search';search.placeholder='Filter changed files…';search.setAttribute('aria-label','Filter changed files');
 const treeControls=el('div',undefined,'changes-tree-controls'),collapse=button('Collapse all',()=>{for(const f of files){const parts=name(f).split('/');for(let n=1;n<parts.length;n++)collapsed.add(parts.slice(0,n).join('/'));}drawTree();}),expand=button('Expand all',()=>{collapsed.clear();drawTree();});
 const hideLabel=el('label'),hide=el('input');hide.type='checkbox';hideLabel.append(hide,' Hide viewed');treeControls.append(collapse,expand,hideLabel);
 const tree=el('ul',undefined,'changes-tree');tree.setAttribute('role','tree');tree.setAttribute('aria-label','Changed files');const feedback=el('p');feedback.setAttribute('role','status');sidebar.append(search,treeControls,tree,feedback);
 const divider=el('div',undefined,'changes-divider');divider.tabIndex=0;divider.setAttribute('role','separator');divider.setAttribute('aria-label','Resize file tree');divider.setAttribute('aria-orientation','vertical');
 const content=el('section',undefined,'changes-content'),filebar=el('div',undefined,'changes-filebar'),pathLabel=el('strong'),meta=el('span'),previous=button('←',()=>navigate(-1)),next=button('→',()=>navigate(1)),copy=button('Copy path',async()=>{try{await navigator.clipboard.writeText(name(files[selected]));feedback.textContent='Path copied.';}catch{feedback.textContent='Could not copy the path.';}}),viewLabel=el('label'),view=el('input');previous.setAttribute('aria-label','Previous file');next.setAttribute('aria-label','Next file');view.type='checkbox';viewLabel.append(view,' Viewed');filebar.append(pathLabel,meta,previous,next,copy,viewLabel);
 const diff=el('div',undefined,'changes-diff');diff.setAttribute('aria-label','File diff');content.append(filebar,diff);if(lock)content.append(lock);layout.append(sidebar,divider,content);root.append(toolbar,layout);
 const visible=()=>files.map((f,i)=>({f,i})).filter(({f})=>(name(f)+' '+f.oldName).toLowerCase().includes(query)&&(!hideViewed||!viewed.has(name(f))));
 function navigate(direction){const items=visible();const position=items.findIndex(x=>x.i===selected),target=items[position+direction];if(target){selected=target.i;drawTree();drawFile();}}
 function drawTree(){
  tree.replaceChildren();const items=visible(),folders=new Map([['',tree]]);feedback.textContent=items.length?`${viewed.size} of ${files.length} viewed`:files.length?'No files match this filter.':'No changed files.';
  for(const {f,i} of items){const parts=name(f).split('/');let prefix='',parent=tree;
   parts.slice(0,-1).forEach((part,level)=>{prefix=prefix?prefix+'/'+part:part;const folderPath=prefix;if(!folders.has(prefix)){const li=el('li'),row=button('',()=>{collapsed.has(folderPath)?collapsed.delete(folderPath):collapsed.add(folderPath);drawTree();tree.querySelector(`[data-folder="${CSS.escape(folderPath)}"]`)?.focus();});li.setAttribute('role','none');row.dataset.folder=prefix;row.dataset.treeNode='folder';row.setAttribute('role','treeitem');row.setAttribute('aria-level',String(level+1));row.setAttribute('aria-expanded',String(!collapsed.has(prefix)||!!query));row.title=prefix;row.append(el('span',collapsed.has(prefix)&&!query?'▸':'▾','tree-chevron'),icon('folder'),el('span',part));const group=el('ul');group.setAttribute('role','group');group.hidden=collapsed.has(prefix)&&!query;li.append(row,group);parent.append(li);folders.set(prefix,group);}parent=folders.get(prefix);});
   const li=el('li'),row=button('',()=>{selected=i;drawTree();drawFile();tree.querySelector('[aria-selected="true"]')?.focus();});li.setAttribute('role','none');row.dataset.treeNode='file';row.dataset.filePath=name(f);row.setAttribute('role','treeitem');row.setAttribute('aria-level',String(parts.length));row.setAttribute('aria-selected',String(i===selected));row.title=name(f)+(f.isRename?' (from '+f.oldName+')':'');row.className=i===selected?'selected':'';
   const ext=parts.at(-1).split('.').pop().toLowerCase();row.dataset.fileType=ext;const fileIcon=icon('file');const label=el('span',parts.at(-1),'tree-filename'),badge=el('span',viewed.has(name(f))?'✓':status(f),'tree-file-status');badge.dataset.status=status(f);row.append(fileIcon,label,badge);li.append(row);parent.append(li);
  }
  const rows=[...tree.querySelectorAll('[data-tree-node]')].filter(n=>!n.closest('[hidden]'));rows.forEach(n=>n.tabIndex=-1);const current=rows.find(n=>n.getAttribute('aria-selected')==='true')||rows[0];if(current)current.tabIndex=0;
 }
 function drawFile(){
  unified.setAttribute('aria-pressed',String(mode==='line-by-line'));split.setAttribute('aria-pressed',String(mode==='side-by-side'));wrapButton.setAttribute('aria-pressed',String(wrap));diff.classList.toggle('wrap-lines',wrap);
  const f=files[selected];filebar.hidden=!f;if(!f){diff.textContent='No changes to display.';return;}
  pathLabel.textContent=name(f);pathLabel.title=name(f);meta.textContent=`${status(f)} · +${f.addedLines} −${f.deletedLines}`+(f.isRename?' · from '+f.oldName:'');view.checked=viewed.has(name(f));
  const items=visible(),position=items.findIndex(x=>x.i===selected);previous.disabled=position<=0;next.disabled=position<0||position===items.length-1;
  new Diff2HtmlUI(diff,[f],{drawFileList:false,outputFormat:mode,matching:'lines',diffStyle:'word',colorScheme:'dark',highlight:true,fileContentToggle:false,stickyFileHeaders:false,synchronisedScroll:true,renderNothingWhenEmpty:false}).draw();
  if(f.isTooBig){const load=button('Load this large diff',()=>{const full=parse(raw).find(x=>name(x)===name(f));files[selected]=full;drawFile();});diff.prepend(load);}
  diff.scrollTop=0;
 }
 search.oninput=()=>{query=search.value.toLowerCase();drawTree();};hide.onchange=()=>{hideViewed=hide.checked;drawTree();};view.onchange=()=>{const path=name(files[selected]);view.checked?viewed.add(path):viewed.delete(path);try{localStorage.setItem(key,JSON.stringify([...viewed]));}catch{feedback.textContent='Viewed state could not be saved.';}drawTree();};
 tree.onkeydown=event=>{const row=event.target.closest('[data-tree-node]');if(!row)return;const rows=[...tree.querySelectorAll('[data-tree-node]')].filter(n=>!n.closest('[hidden]'));let target;const index=rows.indexOf(row);
  if(event.key==='ArrowDown')target=rows[index+1];if(event.key==='ArrowUp')target=rows[index-1];if(event.key==='Home')target=rows[0];if(event.key==='End')target=rows.at(-1);
  if(event.key==='ArrowRight'){if(row.dataset.folder&&row.getAttribute('aria-expanded')==='false')row.click();else target=rows[index+1];}
  if(event.key==='ArrowLeft'){if(row.dataset.folder&&row.getAttribute('aria-expanded')==='true')row.click();else target=row.parentElement.parentElement.closest('li')?.querySelector('[data-tree-node]');}
  if(target){rows.forEach(n=>n.tabIndex=-1);target.tabIndex=0;target.focus();}if(['ArrowDown','ArrowUp','Home','End','ArrowLeft','ArrowRight'].includes(event.key))event.preventDefault();};
 const resize=value=>sidebar.style.width=Math.max(160,Math.min(layout.clientWidth*.5,value))+'px';divider.onpointerdown=e=>{divider.setPointerCapture(e.pointerId);divider.onpointermove=move=>resize(move.clientX-layout.getBoundingClientRect().left);divider.onpointerup=()=>divider.onpointermove=null;};divider.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();resize(sidebar.getBoundingClientRect().width+(e.key==='ArrowLeft'?-20:20));}};
 drawTree();drawFile();
};
