'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFile}=require('node:child_process');const {promisify}=require('node:util');
const fields='number,url,title,body,state,isDraft,author,headRefName,headRefOid,baseRefName';
class ReviewPRState {
 constructor(review,manifest,run=async(bin,args,opts)=>(await promisify(execFile)(bin,args,{...opts,maxBuffer:4*1024*1024})).stdout){this.review=review;this.manifest=manifest;this.run=run;this.pending=null;}
 async options(){const opts={cwd:this.review.workspace,env:{...process.env}};if(this.review.githubAccount)opts.env.GH_TOKEN=(await this.run('gh',['auth','token','--user',this.review.githubAccount],opts)).trim();return opts;}
 async refresh(){
  if(!this.review.pullRequest)return this.review.pr;
  const opts=await this.options();const pr=JSON.parse(await this.run('gh',['pr','view',this.review.pullRequest.url,'--json',fields],opts));
  const login=JSON.parse(await this.run('gh',['api','user'],opts)).login;
  if(!['OPEN','CLOSED','MERGED'].includes(pr.state)||typeof pr.isDraft!=='boolean'||!pr.author?.login||!login||pr.url!==this.review.pullRequest.url)throw Error('Could not verify the PR state and author.');
  Object.assign(this.review.pr,{published:true,number:pr.number,url:pr.url,title:pr.title,body:pr.body,state:pr.state,isDraft:pr.isDraft,author:pr.author.login,isAuthor:pr.author.login.toLowerCase()===login.toLowerCase(),headBranch:pr.headRefName,headRefOid:pr.headRefOid,baseBranch:pr.baseRefName});
  if(this.review.base){this.review.diffPatch=await this.run('git',['diff',this.review.base,'HEAD','--'],opts);this.review.changedFiles=(await this.run('git',['diff','--name-only',this.review.base,'HEAD','--'],opts)).trim().split('\n').filter(Boolean);this.review.pr.changedFiles=this.review.changedFiles;}
  this.review.pullRequest=pr;
  const config=JSON.parse(fs.readFileSync(this.manifest,'utf8'));config.pullRequest=pr;fs.writeFileSync(this.manifest+'.tmp',JSON.stringify(config,null,2)+'\n',{mode:0o600});fs.renameSync(this.manifest+'.tmp',this.manifest);
  return this.review.pr;
 }
 async assertAuthor(){const pr=await this.refresh();if(!pr.published||!pr.isAuthor||pr.state!=='OPEN')throw Error('Only the author of an open PR can make adjustments.');return pr;}
 async update(input){
  if(this.pending)throw Error('A PR update is already in progress.');
  this.pending=this.save(input);try{return await this.pending;}finally{this.pending=null;}
 }
 async save({title,body,expectedBody,expectedTitle}){
  if(typeof title!=='string'||!title.trim()||title.length>256||typeof body!=='string'||body.length>65000)throw Error('Provide a PR title and description.');
  const pr=await this.assertAuthor();
  if(pr.body!==expectedBody||pr.title!==expectedTitle)throw Error('The PR description changed on GitHub. Reload it before applying your edits.');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'robos-pr-update-')),file=path.join(dir,'body.md');fs.writeFileSync(file,body,{mode:0o600});
  await this.run('gh',['pr','edit',pr.url,'--title',title.trim(),'--body-file',file],await this.options());
  const result=await this.refresh();if(result.body!==body||result.title!==title.trim())throw Error('GitHub did not confirm the updated description. Reload before retrying.');return result;
 }
 async push(){
  const pr=await this.assertAuthor(),opts=await this.options();const git=async args=>(await this.run('git',args,opts)).trim();
  if(await git(['branch','--show-current'])!==pr.headBranch)throw Error('The checkout is not on the PR branch.');
  const remote=await git(['remote','get-url','origin']);if(remote.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1]?.toLowerCase()!==this.review.repo.toLowerCase())throw Error('The checkout origin does not match the PR repository.');
  if(await git(['status','--porcelain']))throw Error('Commit the walkthrough adjustments before pushing.');
  await git(['push','origin','HEAD:refs/heads/'+pr.headBranch]);return this.refresh();
 }
}
module.exports={ReviewPRState};
