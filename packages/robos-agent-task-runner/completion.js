'use strict';
const path=require('path');
// Verify the exported result after the process ends. A zero CLI exit or an
// already-existing PR is not evidence that the agent committed/pushed its work.
async function verify(state,{command,gh}){
 const dir=state.sandbox?.artifacts;
 if(!dir)throw Error('Cannot verify implementation: repository export is missing.');
 for(const url of state.launchConfig.repositories){
  const repo=url.split('/').slice(-2).join('/');
  const cwd=path.join(dir,'repos',repo.replace('/','--'));
  const git=(...args)=>command('git',args,{cwd});
  const dirty=(await git('status','--porcelain')).trim();
  if(dirty)throw Error('Implementation incomplete: '+repo+' has uncommitted changes. Commit/push did not finish. Repository changes and session output are preserved in '+dir+'.');
  const head=(await git('rev-parse','HEAD')).trim();
  const fix=state.reviewFix?.repo?.toLowerCase()===repo.toLowerCase()?state.reviewFix:null;
  const baseline=fix?.head||(await git('rev-parse','refs/remotes/origin/HEAD')).trim();
  if(head===baseline)continue; // Untouched repository or a legitimate no-change fix.
  const branch=(await git('symbolic-ref','--short','HEAD')).trim();
  if(fix&&branch!==fix.branch)throw Error('Implementation incomplete: fix was committed on a different branch from the reviewed PR.');
  let remote;
  try{remote=await gh(['api','repos/'+repo+'/commits/'+encodeURIComponent(branch)]);}
  catch{throw Error('Implementation incomplete: cannot verify the pushed branch for '+repo+'. Local commits are preserved in '+dir+'.');}
  if(remote.sha!==head)throw Error('Implementation incomplete: '+repo+' has commits that are not on its remote branch. Push did not finish. Local commits are preserved in '+dir+'.');
 }
}
module.exports={verify};
