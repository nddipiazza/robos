'use strict';
const assert=require('node:assert/strict');
async function ev(js){const response=await fetch('http://localhost:19133/eval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({js})});const data=await response.json();if(data.error)throw Error(data.error);return data.result;}
(async()=>{
 const original=await ev("({query:appState.notifSearchQuery,category:appState.notifCategoryFilters,tier:appState.notifTierFilters,date:appState.notifDateFilter})");
 try{
  await ev("window.switchTab('notifications');window.switchNotifView('list');appState.notifSearchQuery='';appState.notifDateFilter='';Object.keys(appState.notifCategoryFilters).forEach(k=>appState.notifCategoryFilters[k]=true);Object.keys(appState.notifTierFilters).forEach(k=>appState.notifTierFilters[k]=true);window.robos.notifications.getNotifications().then(renderNotifications)");
  assert(await ev('appState.allNotifications.length>0'));
  assert.equal(await ev("document.querySelectorAll('#notif-list .notif-card').length"),await ev('appState.allNotifications.length'));
  assert.equal(await ev("getComputedStyle(document.querySelector('#notif-empty-state')).display"),'none');
  await ev("appState.notifSearchQuery='nonexistent-notification-check-xyz';renderNotifications(appState.allNotifications)");
  assert.notEqual(await ev("getComputedStyle(document.querySelector('#notif-empty-state')).display"),'none');
  assert.equal(await ev("document.querySelector('#notif-empty-state .empty-msg').textContent"),'No matching notifications');
  await ev('renderNotifications([])');
  assert.equal(await ev("document.querySelector('#notif-empty-state .empty-msg').textContent"),'No notifications');
  console.log('PASS: populated list hides empty state; filtered list explains no matches; empty history shows No notifications. Stored notifications unchanged.');
 }finally{
  await ev(`appState.notifSearchQuery=${JSON.stringify(original.query)};appState.notifCategoryFilters=${JSON.stringify(original.category)};appState.notifTierFilters=${JSON.stringify(original.tier)};appState.notifDateFilter=${JSON.stringify(original.date)};window.robos.notifications.getNotifications().then(renderNotifications)`);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
