'use strict';
class ReviewMarkdownEditor extends HTMLElement {
  constructor(){super();this._value='';this._disabled=false;}
  connectedCallback(){
    if(this.editor)return;
    this.editor=new toastui.Editor({el:this,height:'440px',initialEditType:'wysiwyg',previewStyle:'vertical',initialValue:this._value,theme:'dark',usageStatistics:false,autofocus:false,
      customHTMLSanitizer:html=>DOMPurify.sanitize(html),
      toolbarItems:[['heading','bold','italic','strike'],['hr','quote'],['ul','ol','task'],['table','image','link'],['code','codeblock'],['scrollSync']],
      events:{change:()=>{this._value=this.editor.getMarkdown();if(!this.setting)this.dispatchEvent(new Event('input',{bubbles:true}));}},
      hooks:{addImageBlobHook:()=>{this.dispatchEvent(new CustomEvent('editor-warning',{bubbles:true,detail:'Use a shared screenshot URL in the image dialog. Local images must be uploaded before they can appear in a GitHub PR.'}));return false;}}
    });
    for(const el of this.querySelectorAll('[contenteditable=true]')){el.setAttribute('role','textbox');el.setAttribute('aria-label',el.closest('.toastui-editor-ww-container')?'Description':'Description Markdown');el.setAttribute('aria-multiline','true');}
    this.inert=this._disabled;
  }
  disconnectedCallback(){if(this.editor){this._value=this.editor.getMarkdown();this.editor.destroy();this.editor=null;}}
  get value(){return this.editor?this.editor.getMarkdown():this._value;}
  set value(value){this._value=String(value||'');this.setting=true;this.editor?.setMarkdown(this._value,false);this.setting=false;}
  get disabled(){return this._disabled;}
  set disabled(value){this._disabled=!!value;this.inert=this._disabled;}
  focus(){this.editor?.focus();}
}
customElements.define('review-markdown-editor',ReviewMarkdownEditor);
