'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ROBOS_PLAYWRIGHT_MODULE||'playwright-core');
test('Markdown is source-only; split preview resizes by mouse and keyboard without losing edits',async()=>{
 const b=await chromium.launch({headless:true});try{const p=await b.newPage({viewport:{width:1200,height:800}});await p.setContent('<main style="width:1000px"><review-markdown-editor></review-markdown-editor></main>');await require('./editor-test-helper')(p);await p.evaluate(()=>document.querySelector('review-markdown-editor').value='# Heading\n\nOriginal content');
 await p.getByRole('button',{name:'Markdown',exact:true}).click();assert.equal(await p.locator('.toastui-editor-md-preview').isVisible(),false);assert.equal(await p.getByRole('separator').isVisible(),false);
 await p.getByRole('textbox',{name:'Description Markdown',exact:true}).fill('# Heading\n\nEdited content');const value=await p.locator('review-markdown-editor').evaluate(e=>e.value);
 await p.getByRole('button',{name:'Markdown + Preview',exact:true}).click();await p.locator('.toastui-editor-md-preview').waitFor({state:'visible'});const divider=p.getByRole('separator'),bounds=await divider.boundingBox();await p.mouse.move(bounds.x+4,bounds.y+50);await p.mouse.down();await p.mouse.move(bounds.x+160,bounds.y+50);await p.mouse.up();assert.ok(Number(await divider.getAttribute('aria-valuenow'))>60);
 await divider.focus();await p.keyboard.press('Home');assert.equal(await divider.getAttribute('aria-valuenow'),'20');await p.keyboard.press('End');assert.equal(await divider.getAttribute('aria-valuenow'),'80');
 await p.getByRole('button',{name:'WYSIWYG',exact:true}).click();await p.getByRole('button',{name:'Markdown',exact:true}).click();assert.equal(await p.locator('review-markdown-editor').evaluate(e=>e.value),value);assert.equal(await p.locator('.toastui-editor-md-preview').isVisible(),false);
 }finally{await b.close();}
});
