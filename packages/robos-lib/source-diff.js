'use strict';
(()=>{
 let ready;
 function load(vs){
  if(!ready)ready=new Promise((resolve,reject)=>{
   const base=new URL(vs+'/',document.baseURI).href;
   window.MonacoEnvironment={getWorkerUrl:()=>URL.createObjectURL(new Blob([
    'self.MonacoEnvironment={baseUrl:'+JSON.stringify(new URL('../',base).href)+'};importScripts('+JSON.stringify(base+'base/worker/workerMain.js')+');'
   ],{type:'text/javascript'}))};
   const script=document.createElement('script');script.src=vs+'/loader.js';
   script.onerror=()=>{ready=null;reject(Error('Source editor could not load.'));};
   script.onload=()=>{window.require.config({paths:{vs}});window.require(['vs/editor/editor.main'],()=>resolve(window.monaco),reject);};
   document.head.append(script);
  });
  return ready;
 }
 window.RobosSourceDiff=class{
  static async create(element,vs,onLine){
   const m=await load(vs),view=new this();view.monaco=m;
   view.editor=m.editor.createDiffEditor(element,{theme:'vs-dark',readOnly:true,originalEditable:false,automaticLayout:true,renderSideBySide:true,ignoreTrimWhitespace:false,renderMarginRevertIcon:false,renderOverviewRuler:true,minimap:{enabled:false},scrollBeyondLastLine:false,hideUnchangedRegions:{enabled:true,contextLineCount:4},fontSize:13});
   for(const [side,editor] of [['LEFT',view.editor.getOriginalEditor()],['RIGHT',view.editor.getModifiedEditor()]]){
    const reviewSelection=()=>{
     const selection=editor.getSelection();
     const start=selection.startLineNumber;
     const end=Math.max(start,selection.endLineNumber-(selection.endColumn===1&&selection.endLineNumber>start?1:0));
     const rect=editor.getDomNode().getBoundingClientRect();
     const position=editor.getScrolledVisiblePosition({lineNumber:selection.positionLineNumber,column:selection.positionColumn});
     onLine(side,end,start,{x:rect.left+(position?.left||80),y:rect.top+(position?.top||0)+(position?.height||20),focus:()=>editor.focus()});
    };
    editor.onMouseUp(e=>{if(e.target.type===m.editor.MouseTargetType.GUTTER_LINE_NUMBERS&&e.target.position)reviewSelection();});
    editor.addAction({id:'robos-review-line',label:'PR comment / AI fix on selection',contextMenuGroupId:'navigation',run:reviewSelection});
   }
   return view;
  }
  async show(data,mode){
   const m=this.monaco;
   this.editor.setModel(null);this.models?.forEach(model=>model.dispose());
   this.models=[m.editor.createModel(data.original,undefined,m.Uri.parse('inmemory://original/'+data.originalPath)),m.editor.createModel(data.modified,undefined,m.Uri.parse('inmemory://modified/'+data.path))];
   this.positionListener?.dispose();
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{this.positionListener?.dispose();reject(Error('Diff calculation did not finish. Retry loading this file.'));},15000);
    this.positionListener=this.editor.onDidUpdateDiff(()=>{clearTimeout(timer);this.positionListener.dispose();this.editor.goToDiff('next');resolve();});
    this.editor.setModel({original:this.models[0],modified:this.models[1]});this.mode(mode);
   });
  }
  mode(mode){this.editor.updateOptions({renderSideBySide:mode==='split'});}
  dispose(){this.positionListener?.dispose();this.editor.dispose();this.models?.forEach(model=>model.dispose());}
 };
})();
