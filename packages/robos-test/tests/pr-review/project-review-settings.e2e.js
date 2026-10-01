'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {chromium}=require(process.env.ROBOS_PLAYWRIGHT_MODULE||'playwright-core');
test('Git Projects offers editable PR and Slack templates with saved destination',async()=>{
 const b=await chromium.launch({headless:true});try {const p=await b.newPage();await p.setContent('<section id="tab-edit"></section>');await p.evaluate(()=>{window.saved=[];window.gp={reviewOptions:async()=>({ok:true,appName:'Slack',settings:{prTemplate:'Changes: {{description}}',messageTemplate:'Review {{title}} {{url}}',serverId:'slack',channel:'C1'},servers:[{id:'slack',name:'Hermetiq Slack'}]}),reviewChannels:async()=>({ok:true,channels:[{id:'C1',name:'pr-review'}]}),saveReviewSettings:async data=>{window.saved.push(data);return {ok:true};}};});
 await p.addScriptTag({path:path.resolve(__dirname,'../../../git-projects/renderer/review-settings.js')});await p.evaluate(()=>window.mountProjectReviewSettings({url:'https://github.com/org/repo'}));
 assert.equal(await p.getByLabel('Review channel').inputValue(),'C1');await p.getByLabel('Slack review notification template').fill('Please review {{title}}: {{url}}');await p.getByRole('button',{name:'Save review settings'}).click();assert.match(await p.getByRole('status').innerText(),/saved/);assert.equal((await p.evaluate(()=>window.saved))[0].settings.messageTemplate,'Please review {{title}}: {{url}}');
 }finally{await b.close();}
});
