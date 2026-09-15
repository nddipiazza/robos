'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),{execFile}=require('child_process'),{promisify}=require('util');
const {claimNotification}=require('./notification-gate');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'robos-notification-proof-'));
const event={source:'test',title:'PR updated',body:'Review changed',category:'pr_review',tier:'info',action:{url:'https://github.com/org/repo/pull/1'},revision:'v1'};
test('replay stays suppressed across time and restart, independently of notification history',()=>{
 const file=path.join(dir,'replay.json');assert(claimNotification(file,event,{now:1000}));
 delete require.cache[require.resolve('./notification-gate')];assert.equal(require('./notification-gate').claimNotification(file,event,{now:86400000}),false);
});
test('churn is throttled and a suppressed event never replays after cooldown',()=>{
 const file=path.join(dir,'cooldown.json');assert(claimNotification(file,event,{now:1000}));
 assert.equal(claimNotification(file,{...event,revision:'v2'},{now:2000}),false);
 assert.equal(claimNotification(file,{...event,revision:'v2'},{now:600000}),false);
 assert(claimNotification(file,{...event,revision:'v3'},{now:600000}));
 assert(claimNotification(file,{...event,tier:'critical',revision:'failure'},{now:600001}));
 assert(claimNotification(file,{...event,action:{url:'other PR'}},{now:600001}));
});
test('CLI concurrent duplicate sends persist one notification without desktop delivery',async()=>{
 const run=promisify(execFile),config=path.join(dir,'cli');const cli=path.resolve(__dirname,'../robos-cli/robos-notify');
 const outputs=await Promise.all(Array.from({length:12},()=>run('bash',[cli,'--silent','--title','Repeated test','same message'],{env:{...process.env,ROBOS_NOTIFICATION_CONFIG_DIR:config}})));
 assert.equal(JSON.parse(fs.readFileSync(path.join(config,'notifications.json'))).length,1);
 assert.equal(outputs.filter(o=>o.stdout.includes('Notification sent')).length,1);
 fs.writeFileSync(path.join(config,'notifications.json'),'[]');await run('bash',[cli,'--silent','--title','Repeated test','same message'],{env:{...process.env,ROBOS_NOTIFICATION_CONFIG_DIR:config}});
 assert.equal(JSON.parse(fs.readFileSync(path.join(config,'notifications.json'))).length,0);
});
