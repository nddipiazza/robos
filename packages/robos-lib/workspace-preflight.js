'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8',maxBuffer:4*1024*1024});
function inspect(workspace,revision,expectedBranch){
 const status=git(workspace,['status','--porcelain=v1','-z']);const fields=status.split('\0'),changes=[];
 for(let i=0;i<fields.length;i++){const item=fields[i];if(!item)continue;const entry={status:item.slice(0,2),path:item.slice(3)};if(/[RC]/.test(entry.status)){entry.from=fields[++i];}changes.push(entry);}
 const head=git(workspace,['rev-parse','HEAD']).trim();
 const branch=git(workspace,['branch','--show-current']).trim();
 return {workspace,head,branch,revision,changes,needsIsolation:!!changes.length||head!==revision||!!expectedBranch&&branch!==expectedBranch,reason:changes.length?'Your working copy has local edits.':head!==revision?'Your working copy differs from the failed PR revision.':expectedBranch&&branch!==expectedBranch?'Your working copy is on another branch.':''};
}
function prepare(workspace,revision,{root=path.join(os.homedir(),'.robos','agent-workspaces'),expectedBranch}={}){
 if(!/^[a-f0-9]{40,64}$/i.test(revision||''))throw Error('A verified Git revision is required.');
 const info=inspect(workspace,revision,expectedBranch);if(!info.needsIsolation)return {...info,isolated:false};
 // A detached worktree keeps the user's branch, index and untracked files intact.
 git(workspace,['cat-file','-e',revision+'^{commit}']);fs.mkdirSync(root,{recursive:true,mode:0o700});
 const destination=path.join(root,'ci-repair-'+randomUUID());
 git(workspace,['worktree','add','--detach',destination,revision]);
 const record={version:1,originalWorkspace:workspace,workspace:destination,revision,createdAt:new Date().toISOString(),isolated:true};
 fs.writeFileSync(destination+'.json',JSON.stringify(record,null,2),{mode:0o600});return {...record,changes:info.changes};
}
module.exports={inspect,prepare};
