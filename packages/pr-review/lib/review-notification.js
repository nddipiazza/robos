'use strict';
const fs=require('node:fs');const {randomUUID}=require('node:crypto');
const settings=require('../../robos-lib/project-review-settings');
class ReviewNotification {
  constructor(review, manifest, call=settings.service()) {this.review=review;this.manifest=manifest;this.call=call;this.pending=null;}
  send(input) {if(this.pending)return this.pending;this.pending=this.deliver(input).finally(()=>this.pending=null);return this.pending;}
  async deliver({serverId,channel,reviewers,occasion}) {
    const pr=this.review.pullRequest;
    if(!pr?.url)throw Error('Create the PR before sending its notification.');
    if(!this.call)throw Error('Configure Team Chat Servers first.');
    if(occasion==='ready' && (pr.isDraft || pr.state!=='OPEN'))throw Error('The PR must be ready before sending this message.');
    const notificationKey=occasion==='ready'?'readyNotification':'reviewNotification';
    const config=JSON.parse(fs.readFileSync(this.manifest,'utf8'));
    const save=()=>{fs.writeFileSync(this.manifest+'.tmp',JSON.stringify(config,null,2)+'\n',{mode:0o600});fs.renameSync(this.manifest+'.tmp',this.manifest);};
    if(config[notificationKey]?.prUrl===pr.url){
      if(config[notificationKey].status==='sent')return config[notificationKey];
      throw Error('Notification delivery is uncertain. Check the channel before sending another message.');
    }
    const {servers}=await this.call('servers');if(!servers.some(s=>s.id===serverId))throw Error('Choose a configured messaging workspace.');
    if(!(await settings.channels(serverId,this.call)).some(c=>c.id===channel))throw Error('Choose an available review channel.');
    const project=settings.read(this.review.repo);
    const recipients=await settings.resolveReviewers(serverId,reviewers ?? project.reviewers.filter(r=>r.serverId===serverId),this.call);
    const template=project.messageTemplate;
    const text=recipients.map(r=>'<@'+r.userId+'>').join(' ')+'\n'+settings.format(template,{...pr,repo:this.review.repo,branch:this.review.pr.headBranch,description:this.review.pr.body});
    if(!text.trim()||text.length>4000)throw Error('Notification must be between 1 and 4000 characters. Update the project template.');
    const record={reviewers:recipients,prUrl:pr.url,serverId,channel,text,requestId:randomUUID(),status:'pending'};
    config[notificationKey]=record;save();
    try {const result=await this.call('send',record);if(!result.sent || typeof result.text !== 'string' || recipients.some(r=>!result.text.includes('<@'+r.userId+'>')))throw Error('Message delivery with reviewer mentions was not confirmed.');record.status='sent';record.ts=result.ts;save();return record;}
    catch(e){record.status='uncertain';save();throw e;}
  }
}
module.exports={ReviewNotification};
