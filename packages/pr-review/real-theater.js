'use strict';
const crypto=require('node:crypto');
const review=require('../robos-agent-client/work-task/review');
const core=require('../robos-agent-client/work-task/core');
function parseDiff(diff,files=[]) {
  const result=files.map(f=>({filePath:f.path,additions:f.additions,deletions:f.deletions,hunks:[]}));
  for(const block of diff.split(/^diff --git /m).slice(1)) {
    const lines=block.split('\n');
    const destination=lines.find(l=>l.startsWith('+++ b/'))?.slice(6);
    const source=lines.find(l=>l.startsWith('--- a/'))?.slice(6);
    const filePath=destination||source;
    const file=result.find(f=>f.filePath===filePath);
    if(!file)continue;
    let hunk;
    for(const line of lines) {
      if(line.startsWith('@@')){hunk={header:line,lines:[]};file.hunks.push(hunk);}
      else if(hunk && /^[ +\-]/.test(line))hunk.lines.push({type:line[0]==='+'?'add':line[0]==='-'?'del':'ctx',text:line.slice(1)});
    }
  }
  return result;
}
function createTheater({context=review.context,merge=review.approveAndMerge,command=core.command}={}) {
  const sessions=new Map();
  async function load({repo,number}) {
    const url=`https://github.com/${repo}/pull/${number}`;review.prIdentity(url);
    const ctx=await context(url),pr=ctx.pr;
    const id=`${url}@${pr.headRefOid}`;sessions.set(id,{...ctx,passed:false});
    return {ok:true,real:true,reviewId:id,pr:{...pr,repo,headBranch:pr.headRefName,baseBranch:pr.baseRefName},targetApp:{title:repo},
      elearning:{course:{'@id':id,'dcterms:title':pr.title,'dcterms:description':`${pr.body || 'No PR description provided.'}\n\nBase: ${pr.baseRefName}\nHead: ${pr.headRefName}\nCommit: ${pr.headRefOid}\nFiles: ${(pr.files||[]).map(f=>f.path).join(', ')}`,'robos:estimatedDuration':'Review at your own pace','robos:topic':'Proposed change','robos:modules':[]},quiz:ctx.questions.map((q,i)=>({id:'q'+i,question:q.label,options:q.options,explanation:''}))},
      documentation:{markdown:pr.body||'No documentation or evidence supplied in this PR description.',mermaidText:'No verified diagram supplied.',dualReality:{blastRadius:[]}},
      fileDiffs:[],validationGates:{elearningPassed:false,docsReviewed:false,diffsInspected:false,ciPassed:review.checksReady(pr.statusCheckRollup)},checks:pr.statusCheckRollup||[]};
  }
  function quiz({courseId,answers}) {
    const ctx=sessions.get(courseId);if(!ctx)throw Error('Reload the PR before taking its knowledge check.');
    const correct=ctx.questions.filter((q,i)=>q.options[answers?.['q'+i]]===q.answer).length;
    const score=100*correct/ctx.questions.length;ctx.passed=score>=80;
    return {ok:true,passed:ctx.passed,score,fileDiffs:ctx.passed?parseDiff(ctx.diff,ctx.pr.files):[],certificate:ctx.passed?{'robos:verificationHash':crypto.createHash('sha256').update(courseId+JSON.stringify(answers)).digest('hex')}:null};
  }
  async function submit({repo,number,reviewId,action,body,gates}) {
    const url=`https://github.com/${repo}/pull/${number}`;review.prIdentity(url);
    const ctx=sessions.get(reviewId);
    if(!ctx || ctx.pr.url!==url)throw Error('Load this PR before submitting its review.');
    if(action==='approve') {
      if(!ctx.passed || !gates?.docsReviewed || !gates?.diffsInspected || !gates?.evidenceReviewed)throw Error('Complete the knowledge check and review the documentation, diff, and evidence before approving.');
      const merged=await merge(url,ctx.pr.headRefOid,body);
      core.recordMergedPR(url,merged);
      return {ok:true,merged:true,...merged,message:`Merged reviewed commit ${ctx.pr.headRefOid} into ${ctx.pr.baseRefName}.`};
    }
    if(!['request-changes','comment'].includes(action))throw Error('Unknown review action');
    await command('gh',['pr','review',url,action==='comment'?'--comment':'--request-changes','--body',body||'Reviewed in RobOS PR Review Theater.']);
    return {ok:true,merged:false,message:'Review submitted to GitHub.'};
  }
  return {load,quiz,submit};
}
module.exports={createTheater,parseDiff};
