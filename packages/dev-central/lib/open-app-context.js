'use strict';
const net = require('node:net');
const path = require('node:path');
const {spawn} = require('node:child_process');
async function openAppContext(action, options = {}) {
 try {
  if (action?.url) { await options.openExternal(action.url); return {ok:true}; }
  if (!action?.app) return {ok:false,error:'Choose an app to open.'};
  if (action.app === 'pr-review') {
   const env={...process.env};
   for(const key of ['ELECTRON_RUN_AS_NODE','ROBOS_LOCAL_REVIEW','ROBOS_REVIEW_URL','ROBOS_REVIEW_STAGE'])delete env[key];
   if (action.taskEvidence) {
    if (!action.taskUrl) throw Error('This task has no issue URL to match to a saved review.');
    const canonical = value => { try { const url=new URL(value); return (url.origin+url.pathname.replace(/\/$/,'')).toLowerCase(); } catch { return null; } };
    const wanted=canonical(action.taskUrl);
    if (!wanted) throw Error('This task has an invalid issue URL.');
    const records=(options.listReviews || require('../../robos-lib/saved-code-reviews').list)();
    const saved=records.find(({config})=>[config.taskUrl,config.task?.url,config.task?.taskServerUrl].some(url=>canonical(url)===wanted));
    if (!saved) throw Error('No local review is saved for this task yet. Generate its implementation and evidence first.');
    env.ROBOS_LOCAL_REVIEW=saved.manifest;
    env.ROBOS_REVIEW_STAGE='evidence';
   }
   const child=(options.spawn || spawn)(process.execPath,[path.resolve(__dirname,'../../pr-review'),'--no-sandbox','--disable-gpu'],{env,detached:true,stdio:'ignore'});
   await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
   child.unref();return {ok:true};
  }
  const socket=options.socket || process.env.ROBOS_DM_SOCKET || `/tmp/robos-dm-${process.getuid ? process.getuid() : 1000}.sock`;
  await new Promise((resolve,reject)=>{
   const client=net.createConnection(socket);
   client.once('error',reject);
   client.setTimeout(3000,()=>client.destroy(new Error('Desktop manager did not respond.')));
   client.once('connect',()=>client.end(JSON.stringify({launch:action.app})));
   client.once('finish',()=>{client.destroy();resolve();});
  });
  return {ok:true};
 } catch(error) {return {ok:false,error:'Could not open app: '+error.message};}
}
module.exports={openAppContext};
