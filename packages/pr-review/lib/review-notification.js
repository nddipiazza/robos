'use strict';
const fs=require('node:fs');const {randomUUID}=require('node:crypto');
const settings=require('../../robos-lib/project-review-settings');
class ReviewNotification {
  constructor(review, manifest, call=settings.service()) {this.review=review;this.manifest=manifest;this.call=call;this.pending=null;}
  send(input) {if(this.pending)return this.pending;this.pending=this.deliver(input).finally(()=>this.pending=null);return this.pending;}
  async deliver({serverId,channel}) {
    const pr=this.review.pullRequest;
    if(!pr?.url)throw Error('Create the PR before sending its notification.');
    if(!this.call)throw Error('Configure Team Chat Servers first.');
    const config=JSON.parse(fs.readFileSync(this.manifest,'utf8'));
    const save=()=>{fs.writeFileSync(this.manifest+'.tmp',JSON.stringify(config,null,2)+'\n',{mode:0o600});fs.renameSync(this.manifest+'.tmp',this.manifest);};
    if(config.reviewNotification?.prUrl===pr.url){
      if(config.reviewNotification.status==='sent')return config.reviewNotification;
      throw Error('Notification delivery is uncertain. Check the channel before sending another message.');
    }
    const {servers}=await this.call('servers');if(!servers.some(s=>s.id===serverId))throw Error('Choose a configured messaging workspace.');
    if(!(await settings.channels(serverId,this.call)).some(c=>c.id===channel))throw Error('Choose an available review channel.');
    const template=settings.read(this.review.repo).messageTemplate;
    const text=settings.format(template,{...pr,repo:this.review.repo,branch:this.review.pr.headBranch,description:this.review.pr.body});
    if(!text.trim()||text.length>4000)throw Error('Notification must be between 1 and 4000 characters. Update the project template.');
    const record={prUrl:pr.url,serverId,channel,text,requestId:randomUUID(),status:'pending'};
    config.reviewNotification=record;save();
    try {const result=await this.call('send',record);if(!result.sent)throw Error('Message delivery was not confirmed.');record.status='sent';record.ts=result.ts;save();return record;}
    catch(e){record.status='uncertain';save();throw e;}
  }
}
module.exports={ReviewNotification};
