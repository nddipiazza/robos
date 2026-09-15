'use strict';
const {spawn}=require('node:child_process');
function openChrome(value,{platform=process.platform,launch=spawn}={}){
 let url;try{url=new URL(value);}catch{throw Error('This link is not a valid web address.');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Only HTTP and HTTPS links can open in Chrome.');
 const bin=platform==='darwin'?'open':'google-chrome';
 const args=platform==='darwin'?['-a','Google Chrome',url.href]:[url.href];
 return new Promise((resolve,reject)=>{const child=launch(bin,args,{detached:true,stdio:'ignore'});child.once('error',()=>reject(Error('Could not open Google Chrome. Check that Chrome is installed.')));child.once('spawn',()=>{child.unref();resolve({ok:true});});});
}
module.exports={openChrome};
