'use strict';
// Opt-in real agent/browser integration. Leave the theater paused for the human.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.ROBOS_PLAYWRIGHT_MODULE || 'playwright-core');
test('live walkthrough pauses for Explain/chat and advances only on Next', {skip:!process.env.ROBOS_WALKTHROUGH_CDP,timeout:1800000},async()=>{
 const browser=await chromium.connectOverCDP(process.env.ROBOS_WALKTHROUGH_CDP);
 try {
  const page=browser.contexts()[0].pages()[0];
  await page.getByRole('button',{name:'Start',exact:true}).click();
  const paused=async n=>page.waitForFunction(n=>document.querySelector('.walkthrough-status')?.textContent.startsWith(`Paused · ${n}/`),n,{timeout:600000});
  await paused(1);
  let replies = await page.locator('.walkthrough-bubble.assistant').count();
  const newReply = async () => page.waitForFunction(n => document.querySelectorAll('.walkthrough-bubble.assistant').length > n, replies, {timeout:600000});
  await page.getByRole('button',{name:'Explain',exact:true}).click();await newReply();await paused(1);
  await page.getByRole('textbox',{name:'Message the demo agent'}).fill('Move only the demo callout to the top right, clear of app controls. Do not change product code or advance the checkpoint.');
  replies = await page.locator('.walkthrough-bubble.assistant').count();
  await page.getByRole('button',{name:'Send',exact:true}).click();await newReply();await paused(1);
  await page.getByRole('button',{name:'Next checkpoint →',exact:true}).click();await paused(2);
  assert.ok(await page.locator('.walkthrough-bubble.assistant').count()>=4);
  assert.equal(await page.locator('#step-btn-7').isVisible(),false);
 } finally {await browser.close();}
});
