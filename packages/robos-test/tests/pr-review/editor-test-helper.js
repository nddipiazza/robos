'use strict';
const path=require('node:path');
module.exports=async function loadEditor(page){
 for(const file of ['vendor/markdown-editor.js','markdown-editor.js'])await page.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer',file)});
 for(const file of ['../node_modules/@toast-ui/editor/dist/toastui-editor.css','../node_modules/@toast-ui/editor/dist/theme/toastui-editor-dark.css','markdown-editor.css'])await page.addStyleTag({path:path.resolve(__dirname,'../../../pr-review/renderer',file)});
};
