'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');const {execFileSync}=require('node:child_process');const {createHash}=require('node:crypto');
function prepareLocalReview(workspace,task={},root=path.join(os.homedir(),'.robos','local-reviews')) {
  const git=args=>execFileSync('git',['-C',workspace,...args],{encoding:'utf8'}).trim();
  const branch=git(['branch','--show-current']);if(!branch||['main','master'].includes(branch))throw new Error('Select the feature-branch checkout produced by Task Implementer.');
  const origin=git(['remote','get-url','origin']);const match=origin.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);if(!match)throw new Error('This review requires a GitHub origin.');
  const repo=match[1];let baseRef;try{baseRef=git(['symbolic-ref','--short','refs/remotes/origin/HEAD']);}catch{baseRef='origin/main';}git(['rev-parse','--verify',baseRef]);
  const id=createHash('sha256').update(workspace+'\n'+branch).digest('hex').slice(0,16);const dir=path.join(root,id);fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,'review.json');
  if(fs.existsSync(file)){require('../../robos-lib/saved-code-reviews').register(file);return file;}
  const processFile=path.join(dir,'demo.json');
  fs.writeFileSync(processFile,JSON.stringify({instructions:`Demonstrate the actual local changes for ${task.title||branch}. Inspect the repository's dev instructions, start its sandbox in dev mode, and use Chrome DevTools MCP. Preserve source edits. Use real observations and stop at each checkpoint. Never create a PR automatically.`,checkpoints:[{title:'Understand the change',given:'The implementation branch is checked out.',when:'Inspect the diff and task acceptance criteria. Explain the behavior to demonstrate and prepare the local app.',then:'The reviewer can see the app and understands the first behavior to try.'},{title:'Try the changed behavior',given:'The local app is ready.',when:'Demonstrate the changed behavior and verify the relevant acceptance criteria in the app.',then:'Describe what passed, what remains unverified, and pause for the reviewer.'}]},null,2),{mode:0o600});
  const candidates=[process.env.ROBOS_CODEX_BIN,'/usr/lib/chatgpt/resources/codex',...(process.env.PATH||'').split(path.delimiter).map(p=>path.join(p,'codex'))].filter(Boolean);
  const command=candidates.find(p=>{try{fs.accessSync(p,fs.constants.X_OK);return true;}catch{return false;}});
  const config={taskUrl:task.url||task.taskServerUrl||task.issueUrl,taskTitle:task.title,workspace,repo,title:task.title||branch,baseRef,summary:task.body||'',demoProcess:processFile};
  if(command)config.demoAgent={command,args:['exec','--json'],timeoutMs:600000};
  fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n',{mode:0o600});require('../../robos-lib/saved-code-reviews').register(file);return file;
}
module.exports={prepareLocalReview};
