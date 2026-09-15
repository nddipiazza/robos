'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),net=require('net'),cp=require('child_process'),{randomUUID}=require('crypto');
const {claimNotification}=require('../robos-lib/notification-gate');
const [title,body,category,tier,action,silent,eventKey]=process.argv.slice(2);
const dir=process.env.ROBOS_NOTIFICATION_CONFIG_DIR||path.join(os.homedir(),'.config/robos'),file=path.join(dir,'notifications.json');
const entry={id:randomUUID(),title,body,category,tier,action:action||null,eventKey:eventKey||null,source:'robos-notify',icon:'info',ts:new Date().toISOString(),read:false};
if(!claimNotification(path.join(dir,'notification-cli-ledger.json'),entry)){console.log('Duplicate notification suppressed.');process.exit(0);}
let history=[];try{history=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
history.unshift(entry);fs.writeFileSync(file,JSON.stringify(history.slice(0,500),null,2));
let prefs={};try{prefs=JSON.parse(fs.readFileSync(path.join(dir,'notification-prefs.json'),'utf8'));}catch{}
if(silent!=='true'&&!(prefs.dnd&&tier!=='critical')){
 const socket=process.env.ROBOS_DM_SOCKET||path.join(process.env.XDG_RUNTIME_DIR||`/run/user/${process.getuid()}`,'robos-dm.sock');
 if(fs.existsSync(socket)){
  const client=net.connect(socket,()=>{client.end(JSON.stringify({notify:entry}));});client.on('error',()=>{});client.setTimeout(2000,()=>client.destroy());
 }else{const child=cp.spawn('notify-send',['-a','RobOS','-t','6000',title,body],{stdio:'ignore'});child.on('error',()=>{});child.unref();}
}
console.log(`Notification sent: [${category}/${tier}] ${title}`);
