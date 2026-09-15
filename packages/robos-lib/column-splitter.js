/* Shared, persisted pane resizing for RobOS desktop apps. */
(() => {
  'use strict';
  const app = document.currentScript.dataset.app;
  const configurations = {
    'task-planner': [['#body-layout','#projects-sidebar','#main-wrapper']],
    'task-servers': [['#app','#sidebar','#main']],
    'task-implementer': [['.main-layout','.task-panel','.workspace-panel']],
    'dev-central': [['.review-split-grid']],
    'pr-review': [['.diff-viewer-layout','.diff-file-sidebar','.diff-content-area'],['.actions-grid'],['.stage-grid-2col'],['.ide-bridge-grid'],['.debug-inspection-grid'],['.rest-details-grid']],
  };
  const style = document.createElement('style');
  style.textContent = `.robos-column-separator{position:absolute;width:9px;top:0;bottom:0;padding:0;border:0;border-radius:0;background:transparent;z-index:15;cursor:col-resize;touch-action:none;transform:translateX(-50%)}.robos-column-separator:hover,.robos-column-separator:focus-visible,.robos-column-separator.dragging{background:#58a6ff66;outline:1px solid #58a6ff}.robos-column-dragging,.robos-column-dragging *{cursor:col-resize!important;user-select:none!important}`;
  document.head.append(style);
  function install(parent, paneSelector, otherSelector, index) {
    if(parent.querySelector(':scope > .robos-column-separator'))return;
    const pane=paneSelector?parent.querySelector(paneSelector):parent.children[0];
    const other=otherSelector?parent.querySelector(otherSelector):parent.children[1];
    if(!pane || !other)return;
    const grid=!paneSelector;
    const key=`robos:columns:${app}:${index}`;
    let preferred;try{preferred=Number(localStorage.getItem(key)) || null;}catch{}
    const initial=pane.getBoundingClientRect().width;
    if(getComputedStyle(parent).position==='static')parent.style.position='relative';
    const handle=document.createElement('div');handle.className='robos-column-separator';handle.tabIndex=0;
    handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');
    handle.setAttribute('aria-label','Resize columns');handle.title='Drag to resize columns. Arrow keys adjust; double-click resets.';
    parent.append(handle);
    let dragging=false,origin=0,start=0,direction=1;
    function geometry(){
      const a=pane.getBoundingClientRect(),b=other.getBoundingClientRect();
      const total=a.width+b.width;
      return {a,b,total,min:Math.min(200,total*.3),max:Math.max(total*.7,total-280)};
    }
    function apply(width,persist=false){
      const {total,min,max}=geometry();if(total<=0)return;
      const value=Math.round(Math.max(min,Math.min(max,width)));
      pane.style.minWidth='0';other.style.minWidth='0';pane.style.maxWidth='none';
      if(grid)parent.style.gridTemplateColumns=`${value}px minmax(0,1fr)`;
      else {pane.style.width=`${value}px`;pane.style.flex=`0 0 ${value}px`;}
      if(persist){preferred=value;try{localStorage.setItem(key,String(value));}catch{}}
      position();window.dispatchEvent(new Event('resize'));
    }
    function position(){
      const {a,b,min,max}=geometry();const p=parent.getBoundingClientRect();
      const sideBySide=a.width>0 && b.width>0 && (a.right<=b.left+2 || b.right<=a.left+2);
      handle.hidden=!sideBySide;if(!sideBySide)return;
      direction=a.left<b.left?1:-1;
      handle.style.left=((direction===1?(a.right+b.left)/2:(b.right+a.left)/2)-p.left+parent.scrollLeft)+'px';
      handle.setAttribute('aria-valuemin',Math.round(min));handle.setAttribute('aria-valuemax',Math.round(max));handle.setAttribute('aria-valuenow',Math.round(a.width));
    }
    handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();dragging=true;origin=e.clientX;start=pane.getBoundingClientRect().width;handle.setPointerCapture(e.pointerId);handle.classList.add('dragging');document.body.classList.add('robos-column-dragging');});
    handle.addEventListener('pointermove',e=>{if(dragging)apply(start+(e.clientX-origin)*direction,true);});
    const stop=()=>{dragging=false;handle.classList.remove('dragging');document.body.classList.remove('robos-column-dragging');};
    handle.addEventListener('pointerup',stop);handle.addEventListener('pointercancel',stop);handle.addEventListener('lostpointercapture',stop);
    handle.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const g=geometry();apply(e.key==='Home'?g.min:e.key==='End'?g.max:g.a.width+(e.key==='ArrowRight'?1:-1)*direction*(e.shiftKey?50:10),true);});
    handle.addEventListener('dblclick',()=>{preferred=null;try{localStorage.removeItem(key);}catch{};apply(initial || geometry().total*.4);});
    new ResizeObserver(()=>{if(preferred && !dragging)apply(preferred);else position();}).observe(parent);
    if(preferred)apply(preferred);position();
  }
  function scan(){(configurations[app] || []).forEach(([selector,pane,other],n)=>document.querySelectorAll(selector).forEach((p,i)=>install(p,pane,other,`${n}:${i}`)));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);else scan();
  let scheduled=false;
  new MutationObserver(()=>{if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;scan();});}}).observe(document.body,{childList:true,subtree:true});
})();
