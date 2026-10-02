'use strict';
const path=require('node:path');const {spawn}=require('node:child_process');
function validate(value){if(value?.provider!=='codex'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.sessionId||''))throw Error('No valid agent session is available yet.');return {provider:value.provider,sessionId:value.sessionId};}
function parse(argv){const sessionId=argv.find(a=>a.startsWith('--agent-session='))?.slice(16);if(!sessionId)return null;try{return validate({provider:'codex',sessionId});}catch{return null;}}
async function open(value,{launch=spawn,executable=process.execPath}={}){const target=validate(value);const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const child=launch(executable,[path.join(__dirname,'../agents-manager'),'--no-sandbox','--disable-gpu','--agent-session='+target.sessionId],{env,stdio:'ignore',detached:true,shell:false});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();return {ok:true};}
module.exports={validate,parse,open};
