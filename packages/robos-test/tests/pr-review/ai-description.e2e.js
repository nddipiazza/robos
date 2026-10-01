'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {chromium}=require(process.env.ROBOS_PLAYWRIGHT_MODULE||'playwright-core');
test('visual editor formats Markdown and AI description is generated explicitly, remains editable and restores prior text',async()=>{
 const b=await chromium.launch({headless:true});try{const p=await b.newPage();await p.setContent('<input id="title" value="Filters"><div id="ai"></div><review-markdown-editor></review-markdown-editor>');await require('./editor-test-helper')(p);
 await p.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer/ai-description.js')});await p.evaluate(()=>{window.api={generatePRDescription:async()=>({ok:true,markdown:'## Changes\n\n**Compact filters**\n\n- Verified filtering',warnings:['Screenshot upload needed.']})};const body=document.querySelector('review-markdown-editor');body.value='Original description';window.ai=window.mountAIDescription(document.getElementById('ai'),{pr:{},title:document.getElementById('title'),body,saved:{},save:()=>{}});});
 assert.equal(await p.getByRole('checkbox').count(),0);await p.evaluate(()=>window.preparePRDescription());assert.equal(await p.locator('review-markdown-editor').evaluate(el=>el.value),'Original description');assert.equal(await p.evaluate(()=>window.ai.ensureReady()),true);await p.getByRole('button',{name:'Generate description',exact:true}).click();await p.getByRole('status').filter({hasText:'AI description ready'}).waitFor();
 assert.equal(await p.locator('.toastui-editor-ww-container h2').innerText(),'Changes');assert.equal(await p.locator('.toastui-editor-ww-container strong').innerText(),'Compact filters');
 assert.match(await p.locator('review-markdown-editor').evaluate(el=>el.value),/\*\*Compact filters\*\*/);
 await p.getByRole('button',{name:'Restore previous description'}).click();assert.equal(await p.locator('review-markdown-editor').evaluate(el=>el.value),'Original description');assert.equal(await p.getByRole('checkbox').count(),0);
 await p.getByRole('textbox',{name:'Description',exact:true}).press('ControlOrMeta+A');await p.getByRole('button',{name:'Bold',exact:true}).click();assert.equal(await p.locator('review-markdown-editor').evaluate(el=>el.value),'**Original description**');
 await p.evaluate(()=>{window.api.generatePRDescription=()=>new Promise(resolve=>window.resolveDescription=resolve);});await p.getByRole('button',{name:'Regenerate description',exact:true}).click();await p.getByRole('textbox',{name:'Description',exact:true}).fill('Human edit while generating');await p.evaluate(()=>window.resolveDescription({ok:true,markdown:'Stale AI text',warnings:[]}));await p.getByRole('status').filter({hasText:'Your edits were kept'}).waitFor();assert.equal(await p.locator('review-markdown-editor').evaluate(el=>el.value),'**Human edit while generating**');
 }finally{await b.close();}
});
test('inline evidence remains an image in the visual description and survives Markdown editing',async()=>{
 const b=await chromium.launch({headless:true});try{const p=await b.newPage();await p.setContent('<review-markdown-editor></review-markdown-editor>');await require('./editor-test-helper')(p);
 const markdown='## Filters\n\nExpanded controls and matching results.\n\n![Failed builds](robos-evidence://screenshot/0123456789abcdef)';
 await p.locator('review-markdown-editor').evaluate((el,value)=>el.value=value,markdown);
 assert.equal(await p.locator('.toastui-editor-ww-container img[src]').getAttribute('src'),'robos-evidence://screenshot/0123456789abcdef');
 assert.match(await p.locator('review-markdown-editor').evaluate(el=>{el.editor.changeMode('markdown');return el.value;}),/!\[Failed builds\]\(robos-evidence:\/\/screenshot\/0123456789abcdef\)/);
 await p.locator('review-markdown-editor').evaluate(el=>el.editor.changeMode('wysiwyg'));
 assert.equal(await p.locator('.toastui-editor-ww-container img[src]').count(),1);
 }finally{await b.close();}
});
