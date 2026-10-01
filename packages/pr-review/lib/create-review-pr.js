'use strict';
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {execFile}=require('node:child_process');const {promisify}=require('node:util');
const exec=promisify(execFile);
class ReviewPRPublisher {
  constructor(review, manifestPath, run=async (bin,args,opts)=> (await exec(bin,args,{...opts,maxBuffer:1024*1024})).stdout) { this.review=review;this.manifestPath=manifestPath;this.run=run;this.pending=null; }
  create(input) { if(this.pending)return this.pending;this.pending=this.publish(input).finally(()=>{this.pending=null;});return this.pending; }
  async publish({title,body,draft=false}={}) {
    if(typeof title!=='string'||!title.trim()||title.length>256||typeof body!=='string'||body.length>65000)throw new Error('Provide a PR title and description.');
    if(!/^[\w.-]+\/[\w.-]+$/.test(this.review.repo||''))throw new Error('Configure the GitHub repository for this review.');
    const opts={cwd:this.review.workspace,env:{...process.env}};
    if(this.review.githubAccount)opts.env.GH_TOKEN=(await this.run('gh',['auth','token','--user',this.review.githubAccount],opts)).trim();
    const git=async args=>(await this.run('git',args,opts)).trim();
    const origin=await git(['remote','get-url','origin']);
    const originRepo=origin.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1];
    if(originRepo?.toLowerCase()!==this.review.repo.toLowerCase())throw new Error('The checkout origin does not match the review repository.');
    const branch=await git(['branch','--show-current']);
    const base=(this.review.baseBranch || this.review.baseRef).replace(/^origin\//,'');
    if (/^[a-f0-9]{7,40}$/i.test(base)) throw new Error('Configure baseBranch with the PR target branch; baseRef is a pinned diff commit.');
    if(!branch || branch===base || ['main','master'].includes(branch))throw new Error('Create PR requires a feature branch.');
    const existing=JSON.parse(await this.run('gh',['pr','list','--repo',this.review.repo,'--head',branch,'--state','open','--json','number,url,title'],opts));
    if(existing.length>1)throw new Error('More than one open PR matches this branch. Select the intended PR.');
    let pr=existing[0];
    if(!pr) {
      if(await git(['status','--porcelain']))throw new Error('Commit your local review changes before creating the PR.');
      const head=await git(['rev-parse','HEAD']);
      const remote=(await git(['ls-remote','origin',`refs/heads/${branch}`])).split(/\s/)[0];
      if(remote!==head)throw new Error('Push the latest branch commits before creating the PR.');
      const dir=fs.mkdtempSync(path.join(os.tmpdir(),'robos-pr-'));const file=path.join(dir,'body.md');fs.writeFileSync(file,body,{mode:0o600});
      const args=['pr','create','--repo',this.review.repo,'--head',branch,'--base',base,'--title',title.trim(),'--body-file',file];if(draft)args.push('--draft');
      const url=(await this.run('gh',args,opts)).trim();
      pr=JSON.parse(await this.run('gh',['pr','view',url,'--repo',this.review.repo,'--json','number,url,title'],opts));
    }
    if(!Number.isInteger(pr.number)||!pr.url?.startsWith(`https://github.com/${this.review.repo}/pull/`))throw new Error('GitHub returned an unexpected PR identity.');
    this.review.pullRequest=pr;Object.assign(this.review.pr,{number:pr.number,url:pr.url,title:pr.title,published:true});
    const config=JSON.parse(fs.readFileSync(this.manifestPath,'utf8'));config.pullRequest=pr;
    const temp=this.manifestPath+'.tmp';fs.writeFileSync(temp,JSON.stringify(config,null,2)+'\n',{mode:0o600});fs.renameSync(temp,this.manifestPath);
    return this.review.pr;
  }
}
module.exports={ReviewPRPublisher};
