'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
function open(serverId=''){
 let bundled;try{bundled=require('../../robos-graph/node_modules/electron');}catch{}
 const executable=[process.versions.electron&&process.execPath,bundled,'/usr/bin/electron'].find(p=>typeof p==='string'&&fs.existsSync(p));
 if(!executable)throw Error('Open Team Chat Servers from the RobOS app launcher.');
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const p=cp.spawn(executable,[path.resolve(__dirname,'..'),...(serverId?['--reconnect='+serverId]:[]),'--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],{env,detached:true,stdio:'ignore'});p.on('error',()=>{});p.unref();return true;
}
module.exports={open};
