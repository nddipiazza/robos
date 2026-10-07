'use strict';
const path=require('node:path');
module.exports=async p=>{
 if(await p.evaluate(()=>!!window.reviewAgent))return;
 await p.evaluate(()=>{const host=document.createElement('div');host.className='theater-stage-content';document.body.append(host);});
 for(const file of ['robos-ui/robos-ui.js','robos-ui/agent-discussion.js','pr-review/renderer/review-agent-pane.js'])await p.addScriptTag({path:path.resolve(__dirname,'../../..',file)});
 await p.addStyleTag({path:path.resolve(__dirname,'../../../pr-review/renderer/review-agent-pane.css')});
};
