'use strict';
const settings=require('../../robos-lib/project-review-settings');
async function pingReview(input,prState,notification,activity){
 if(!input?.github&&!input?.message)throw Error('Select GitHub reviews or a team message.');
 if(!/^[a-f0-9-]{36}$/.test(input.requestId||''))throw Error('A ping request ID is required.');
 const pr=await prState.assertAuthor();if(pr.isDraft)throw Error('Move the PR to Ready before requesting review.');
 const selected=input.github?settings.validateGitHubReviewers(input.reviewers||[]).filter(r=>r.toLowerCase()!==pr.author.toLowerCase()):[];
 if(input.github&&!selected.length)throw Error('Choose at least one GitHub reviewer.');
 const results=[];
 for(const kind of ['github','message']){
  if(!input[kind])continue;
  const previous=activity.read().history.find(h=>h.kind===kind&&h.requestId===input.requestId);
  if(previous){results.push(previous.status==='sent'?`${kind==='github'?'GitHub requests':'Team notification'} already sent.`:'Previous delivery was not confirmed. Check before sending a new ping.');continue;}
  activity.record({kind,status:'pending',requestId:input.requestId});
  try{
   let details={reviewers:selected};
   if(kind==='github')await prState.run('gh',['pr','edit',pr.url,'--add-reviewer',selected.join(',')],await prState.options());
   else{const n=await notification.send({...input.message,occasion:'ping',requestId:input.requestId});details={serverId:n.serverId,channel:n.channel,reviewers:n.reviewers};}
   activity.finish(input.requestId,kind,{status:'sent',...details});results.push(kind==='github'?'GitHub reviews requested.':'Team review notification sent.');
  }catch(e){activity.finish(input.requestId,kind,{status:'unconfirmed',error:e.message});results.push((kind==='github'?'GitHub requests':'Team notification')+' not confirmed: '+e.message);}
 }
 return {results,...activity.read()};
}
module.exports={pingReview};
