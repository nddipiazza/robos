'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {chromium}=require(process.env.ROBOS_PLAYWRIGHT_MODULE||'playwright-core');
test('Git Projects offers editable PR and Slack templates with saved destination',async()=>{
 const b=await chromium.launch({headless:true,...(process.env.ROBOS_CHROMIUM_PATH?{executablePath:process.env.ROBOS_CHROMIUM_PATH}:{})});try {const p=await b.newPage();await p.setContent('<button data-tab="review-messaging"></button><section id="tab-pr-review-settings"></section><section id="tab-review-messaging"></section>');await p.evaluate(()=>{window.saved=[];window.gp={reviewOptions:async()=>({ok:true,appName:'Slack',settings:{prTemplate:'Changes: {{description}}',messageTemplate:'Review {{title}} {{url}}',serverId:'slack',channel:'C1',reviewers:[]},servers:[{id:'slack',name:'Hermetiq Slack'}]}),reviewMembers:async()=>({ok:true,members:[{serverId:'slack',userId:'U2',name:'Tim Potter'}]}),reviewChannels:async()=>({ok:true,channels:[{id:'C1',name:'pr-review'}]}),saveReviewSettings:async data=>{window.saved.push(data);return {ok:true};}};});
 await p.addScriptTag({path:path.resolve(__dirname,'../../../robos-ui/reviewer-picker.js')});
 await p.addScriptTag({path:path.resolve(__dirname,'../../../robos-ui/robos-ui.js')});
 await p.addScriptTag({path:path.resolve(__dirname,'../../../git-projects/renderer/review-settings.js')});await p.evaluate(()=>window.mountProjectReviewSettings({url:'https://github.com/org/repo'}));
 await p.getByLabel('Search reviewers').fill('@tim');await p.getByLabel('@Tim Potter (U2)',{exact:true}).check();
 assert.equal(await p.getByLabel('Review channel').inputValue(),'C1');await p.getByLabel('Slack review notification template').fill('Please review {{title}}: {{url}}');await p.getByRole('button',{name:'Save notification settings'}).click();assert.match(await p.locator('#tab-review-messaging > [role="status"]').innerText(),/saved/);assert.equal((await p.evaluate(()=>window.saved))[0].settings.messageTemplate,'Please review {{title}}: {{url}}');
 assert.equal(await p.locator('robos-ai-textarea').count(),2);
 await p.getByLabel('PR description template').fill('Changes and validation: {{description}}');await p.getByRole('button',{name:'Save PR settings'}).click();
 const saves=await p.evaluate(()=>window.saved);assert.deepEqual(saves[0].settings.reviewers,[{serverId:'slack',userId:'U2',name:'Tim Potter'}]);assert.equal(saves[1].settings.prTemplate,'Changes and validation: {{description}}');assert.equal(saves[1].settings.messageTemplate,undefined);assert.equal(saves[1].settings.reviewers,undefined);
 }finally{await b.close();}
});
