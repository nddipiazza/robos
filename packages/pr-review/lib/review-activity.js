'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
class ReviewActivity {
 constructor(url,file){this.url=url;this.file=file||path.join(os.homedir(),'.robos','pr-review','activity',createHash('sha256').update(url).digest('hex')+'.json');}
 read(){try{return JSON.parse(fs.readFileSync(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {url:this.url,waiting:null,history:[]};}}
 write(data){fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});fs.writeFileSync(this.file+'.tmp',JSON.stringify(data,null,2)+'\n',{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);return data;}
 importNotifications(config,servers=[]){
  const data=this.read();let changed=false;
  for(const value of Object.values(config)){
   if(!value||value.prUrl!==this.url||value.status!=='sent'||!value.requestId)continue;
   const conversationUrl=value.conversationUrl||require('../../robos-lib/team-conversation-link').conversationLink(servers.find(s=>s.id===value.serverId),value);
   const existing=data.history.find(h=>h.requestId===value.requestId);
   if(existing){if(conversationUrl&&!existing.conversationUrl){Object.assign(existing,{conversationUrl,ts:value.ts});changed=true;}continue;}
   const at=value.sentAt||(Number.isFinite(Number(value.ts))?new Date(Number(value.ts)*1000).toISOString():null);if(!at)continue;
   data.history.push({kind:'message',status:'sent',at,requestId:value.requestId,serverId:value.serverId,channel:value.channel,ts:value.ts,conversationUrl,reviewers:value.reviewers});changed=true;
  }
  for(const item of data.history){if(item.kind==='message'&&!item.conversationUrl&&item.ts){const url=require('../../robos-lib/team-conversation-link').conversationLink(servers.find(s=>s.id===item.serverId),item);if(url){item.conversationUrl=url;changed=true;}}}
  if(changed){data.history.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));this.write(data);}return data;
 }
 observe(pr,now=new Date().toISOString()){const data=this.read();if(pr.state==='OPEN'&&!pr.isDraft&&pr.ciPassing){if(!data.waiting||data.waiting.head!==pr.headRefOid)data.waiting={head:pr.headRefOid,since:now};}else data.waiting=null;return this.write(data);}
 finish(id,kind,update){const data=this.read();const item=data.history.find(h=>h.requestId===id&&h.kind===kind);if(item)Object.assign(item,update,{at:new Date().toISOString()});return this.write(data);}
 record(entry){const data=this.read();data.history.push({at:new Date().toISOString(),...entry});return this.write(data);}
}
module.exports={ReviewActivity};
