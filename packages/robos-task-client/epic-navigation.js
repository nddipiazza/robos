'use strict';
const {runGitHub}=require('./github-command');
async function epicNavigation(taskUrl,run=runGitHub){
 let url;try{url=new URL(taskUrl);}catch{return null;}
 const match=url.pathname.match(/^\/([^/]+\/[^/]+)\/issues\/(\d+)\/?$/);
 if(!match||url.hostname!=='github.com')return null;
 const [,repo,number]=match;
 const api=async endpoint=>JSON.parse(await run(['api',endpoint],{repo}));
 let parent;
 try{parent=await api(`repos/${repo}/issues/${number}/parent`);}catch(error){if(/\b404\b/.test(error.message))return null;throw error;}
 if(!parent?.number||!(parent.labels||[]).some(l=>/^epic$/i.test(typeof l==='string'?l:l.name)))return null;
 const pages=JSON.parse(await run(['api',`repos/${repo}/issues/${parent.number}/sub_issues?per_page=100`,'--paginate','--slurp'],{repo}));
 const tasks=pages.flat().filter(t=>!t.pull_request);
 const index=tasks.findIndex(t=>String(t.number)===number);
 if(index<0)return null;
 const item=t=>t?{url:t.html_url,title:t.title,key:'#'+t.number}:null;
 return {epic:{url:parent.html_url,title:parent.title},previous:item(tasks[index-1]),next:item(tasks[index+1])};
}
module.exports={epicNavigation};
