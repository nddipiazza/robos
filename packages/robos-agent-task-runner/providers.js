'use strict';
const catalog=require('../robos-agent-client/providers');
function args(provider,mode,model){
 if(provider==='agy')return ['--output-format','stream-json','--mode',mode==='plan'?'plan':'accept-edits','--sandbox','--print-timeout','60m',...(model?['--model',model]:[])];
 return ['exec','--json','--skip-git-repo-check','--sandbox',mode==='plan'?'read-only':'workspace-write','-c','sandbox_workspace_write.network_access=true',...(model?['-m',model]:[]),'-'];
}
function agySettings(mode){return {permissions:{allow:['read_file(/home/agent)','command(*)',...(mode==='implement'?['write_file(/home/agent/repos)']:[])]},trustedWorkspaces:['/home/agent/repos']};}
module.exports={...catalog,args,agySettings};
