'use strict';
class ReviewMarkdownEditor extends HTMLElement {
  constructor(){super();this._value='';this._disabled=false;}
  connectedCallback(){
    if(this.editor)return;
    this.editor=new toastui.Editor({el:this,height:'440px',initialEditType:'wysiwyg',hideModeSwitch:true,previewStyle:'vertical',initialValue:this._value,theme:'dark',usageStatistics:false,autofocus:false,
      customHTMLSanitizer:html=>DOMPurify.sanitize(html,{ALLOWED_URI_REGEXP:/^(?:(?:https?|mailto|tel|data):|robos-evidence:\/\/screenshot\/[a-f0-9]{16}$|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i}),
      toolbarItems:[['heading','bold','italic','strike'],['hr','quote'],['ul','ol','task'],['table','image','link'],['code','codeblock'],['scrollSync']],
      events:{change:()=>{this._value=this.editor.getMarkdown();if(!this.setting)this.dispatchEvent(new Event('input',{bubbles:true}));}},
      hooks:{addImageBlobHook:()=>{this.dispatchEvent(new CustomEvent('editor-warning',{bubbles:true,detail:'Use a shared screenshot URL in the image dialog. Local images must be uploaded before they can appear in a GitHub PR.'}));return false;}}
    });
    for(const el of this.querySelectorAll('[contenteditable=true]')){el.setAttribute('role','textbox');el.setAttribute('aria-label',el.closest('.toastui-editor-ww-container')?'Description':'Description Markdown');el.setAttribute('aria-multiline','true');}
    const modes=document.createElement('div');modes.className='review-editor-modes';modes.setAttribute('role','group');modes.setAttribute('aria-label','Description editor mode');
    for(const [mode,label] of [['wysiwyg','WYSIWYG'],['markdown','Markdown'],['split','Markdown + Preview']]){
      const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.mode=mode;button.onclick=()=>this.setMode(mode);modes.append(button);
    }
    this.prepend(modes);
    const divider=this.querySelector('.toastui-editor-md-splitter');
    divider.setAttribute('role','separator');divider.setAttribute('aria-label','Resize Markdown and preview');divider.setAttribute('aria-orientation','vertical');divider.tabIndex=0;divider.setAttribute('aria-valuemin','20');divider.setAttribute('aria-valuemax','80');
    const move=event=>{const bounds=this.querySelector('.toastui-editor-md-container').getBoundingClientRect();if(bounds.width)this.setSplit((event.clientX-bounds.left)/bounds.width*100);};
    divider.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();divider.setPointerCapture(event.pointerId);move(event);};
    divider.onpointermove=event=>{if(divider.hasPointerCapture(event.pointerId))move(event);};
    divider.onpointerup=event=>{if(divider.hasPointerCapture(event.pointerId))divider.releasePointerCapture(event.pointerId);};
    divider.ondblclick=()=>this.setSplit(50);
    divider.onkeydown=event=>{const next=({ArrowLeft:this._split-2,ArrowRight:this._split+2,Home:20,End:80})[event.key];if(next!==undefined){event.preventDefault();this.setSplit(next);}};
    this.setSplit(this._split||50);this.setMode(this._mode||'wysiwyg');
    this.inert=this._disabled;
  }
  setMode(mode){this._mode=mode;this.dataset.editMode=mode;this.editor.changeMode(mode==='wysiwyg'?'wysiwyg':'markdown',false);for(const button of this.querySelectorAll('.review-editor-modes button'))button.setAttribute('aria-pressed',String(button.dataset.mode===mode));}
  setSplit(value){this._split=Math.min(80,Math.max(20,value));this.style.setProperty('--markdown-width',this._split+'%');this.querySelector('.toastui-editor-md-splitter')?.setAttribute('aria-valuenow',String(Math.round(this._split)));}
  disconnectedCallback(){if(this.editor){this._value=this.editor.getMarkdown();this.editor.destroy();this.querySelector('.review-editor-modes')?.remove();this.editor=null;}}
  get value(){return this.editor?this.editor.getMarkdown():this._value;}
  set value(value){this._value=String(value||'');this.setting=true;this.editor?.setMarkdown(this._value,false);this.setting=false;}
  get disabled(){return this._disabled;}
  set disabled(value){this._disabled=!!value;this.inert=this._disabled;}
  focus(){this.editor?.focus();}
}
customElements.define('review-markdown-editor',ReviewMarkdownEditor);
