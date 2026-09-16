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
    let hunk,oldLine,newLine;
    for(const line of lines) {
      if(line.startsWith('@@')){const match=/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);if(!match){hunk=null;continue;}oldLine=Number(match[1]);newLine=Number(match[2]);hunk={header:line,lines:[]};file.hunks.push(hunk);}
      else if(hunk && /^[ +\-]/.test(line)){const type=line[0]==='+'?'add':line[0]==='-'?'del':'ctx';hunk.lines.push({type,text:line.slice(1),oldLine:type==='add'?null:oldLine++,newLine:type==='del'?null:newLine++});}
    }
  }
  return result;
}
function createTheater({context=review.context,merge=review.approveAndMerge,command=core.command,policy=require('../robos-agent-client/work-task/review-policy').get}={}) {
  const sessions=new Map();
  async function load({repo,number}) {
    const url=`https://github.com/${repo}/pull/${number}`;review.prIdentity(url);
    const ctx=await context(url),pr=ctx.pr;
    const id=`${url}@${pr.headRefOid}`;sessions.set(id,{...ctx,passed:false});
    return {ok:true,real:true,savedSummary:await require('./review-lesson').freshness(require('./review-lesson').cached(ctx),pr,command),reviewId:id,reviewPolicy:policy(repo),pr:{...pr,repo,headBranch:pr.headRefName,baseBranch:pr.baseRefName},targetApp:{title:repo},
      elearning:{course:{'@id':id,'dcterms:title':pr.title,'dcterms:description':`${pr.body || 'No PR description provided.'}\n\nBase: ${pr.baseRefName}\nHead: ${pr.headRefName}\nCommit: ${pr.headRefOid}\nFiles: ${(pr.files||[]).map(f=>f.path).join(', ')}`,'robos:estimatedDuration':'Review at your own pace','robos:topic':'Proposed change','robos:modules':[]},quiz:ctx.questions.map((q,i)=>({id:'q'+i,question:q.label,options:q.options,explanation:''}))},
      documentation:{markdown:pr.body||'No documentation or evidence supplied in this PR description.',mermaidText:'No verified diagram supplied.',dualReality:{blastRadius:[]}},
      fileDiffs:parseDiff(ctx.diff,pr.files),validationGates:{elearningPassed:false,docsReviewed:false,diffsInspected:false,ciPassed:review.checksReady(pr.statusCheckRollup)},checks:pr.statusCheckRollup||[]};
  }
  function quiz({courseId,answers,gates}) {
    const ctx=sessions.get(courseId);if(!ctx)throw Error('Reload the PR before taking its knowledge check.');
    if(!gates?.docsReviewed || !gates?.diffsInspected || !gates?.evidenceReviewed)throw Error('Review the documentation, diff, and evidence before taking the knowledge check.');
    const correct=ctx.questions.filter((q,i)=>q.options[answers?.['q'+i]]===q.answer).length;
    const score=100*correct/ctx.questions.length;ctx.passed=score>=80;
    return {ok:true,passed:ctx.passed,score,fileDiffs:ctx.passed?parseDiff(ctx.diff,ctx.pr.files):[],certificate:ctx.passed?{'robos:verificationHash':crypto.createHash('sha256').update(courseId+JSON.stringify(answers)).digest('hex')}:null};
  }
  async function submit({repo,number,reviewId,action,body,gates}) {
    const url=`https://github.com/${repo}/pull/${number}`;review.prIdentity(url);
    const ctx=sessions.get(reviewId);
    if(!ctx || ctx.pr.url!==url)throw Error('Load this PR before submitting its review.');
    if(action==='approve') {
      if(!gates?.docsReviewed || !gates?.diffsInspected || !gates?.evidenceReviewed)throw Error('Review the documentation, diff, and evidence before approving.');
      if(policy(repo).requireCompletionCertificate && !ctx.passed)throw Error('This organization requires a passed knowledge check before merging.');
      await require('./review-workspaces').assertMergeOrder(url);
      const merged=await merge(url,ctx.pr.headRefOid,body);
      core.recordMergedPR(url,merged);
      return {ok:true,merged:true,...merged,message:`Merged reviewed commit ${ctx.pr.headRefOid} into ${ctx.pr.baseRefName}.`};
    }
    if(!['request-changes','comment'].includes(action))throw Error('Unknown review action');
    await command('gh',['pr','review',url,action==='comment'?'--comment':'--request-changes','--body',body||'Reviewed in RobOS PR Review Theater.']);
    return {ok:true,merged:false,message:'Review submitted to GitHub.'};
  }
  async function lesson({reviewId,launchConfig,refinement}){const ctx=sessions.get(reviewId);if(!ctx)throw Error('Reload this PR before generating its summary.');return {ok:true,markdown:await require('./review-lesson').generate(ctx,launchConfig,refinement)};}
  async function lessonOptions({reviewId}){const ctx=sessions.get(reviewId);if(!ctx)throw Error('Reload this PR.');const providers=await require('../robos-agent-client/providers').options();return {ok:true,textOnly:true,appLabel:'ROBOS PR REVIEW THEATER',title:'Generate summary & training',purpose:'Explain this PR and teach its relevant concepts from the supplied diff. No code changes or repository cloning. Existing summaries are reused when the commit, provider and model match.',actionLabel:'Generate',available:true,providers,provider:providers.find(p=>p.available)?.id,repositories:[],issue:{number:ctx.pr.number,title:ctx.pr.title}};}
  async function inlineTarget({reviewId,path,line,side}) {
    const ctx=sessions.get(reviewId);if(!ctx)throw Error('Reload this PR before commenting or requesting a fix.');
    const file=parseDiff(ctx.diff,ctx.pr.files).find(f=>f.filePath===path);
    const row=file?.hunks.flatMap(h=>h.lines).find(r=>Number.isInteger(line)&&line>0&&(side==='LEFT'?r.oldLine===line:side==='RIGHT'&&r.newLine===line));
    if(!row)throw Error('Select a line in the reviewed diff.');
    const {repo,number}=review.prIdentity(ctx.pr.url);
    const live=JSON.parse(await command('gh',['api',`repos/${repo}/pulls/${number}`]));
    if(live.state!=='open'||live.head.sha!==ctx.pr.headRefOid)throw Error('The PR changed or closed. Refresh it before continuing.');
    return {prUrl:ctx.pr.url,repo,number,head:live.head.sha,branch:live.head.ref,headRepo:live.head.repo?.full_name,path,line,side,text:row.text};
  }
  async function inlineComment(input){
    if(typeof input.body!=='string'||!input.body.trim()||input.body.length>60000)throw Error('Enter a comment (up to 60,000 characters).');
    const target=await inlineTarget(input);
    const comment=JSON.parse(await command('gh',['api',`repos/${target.repo}/pulls/${target.number}/comments`,'--method','POST','-f',`body=${input.body.trim()}`,'-f',`commit_id=${target.head}`,'-f',`path=${target.path}`,'-F',`line=${target.line}`,'-f',`side=${target.side}`]));
    return {ok:true,comment};
  }
  async function source({reviewId,path}){
    const ctx=sessions.get(reviewId);if(!ctx)throw Error('Reload this PR.');
    if(!ctx.sourceLoader)ctx.sourceLoader=require('./review-source').createSourceLoader(ctx,command);
    return {ok:true,...await ctx.sourceLoader(path)};
  }
  async function inlineComments({reviewId}){const ctx=sessions.get(reviewId);if(!ctx)throw Error('Reload this PR.');const {repo,number}=review.prIdentity(ctx.pr.url);const pages=JSON.parse(await command('gh',['api',`repos/${repo}/pulls/${number}/comments`,'--paginate','--slurp']));return {ok:true,comments:pages.flat()};}
  return {source,load,quiz,submit,lesson,lessonOptions,inlineTarget,inlineComment,inlineComments};
}
module.exports={createTheater,parseDiff};
