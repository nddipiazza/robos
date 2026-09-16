'use strict';
const catalog=require('../robos-agent-client/providers');
function args(provider,mode,model){
 if(provider==='agy')return ['--output-format','stream-json','--mode',mode==='plan'?'plan':'accept-edits','--sandbox','--print-timeout','60m',...(model?['--model',model]:[])];
 return ['exec','--json','--skip-git-repo-check','--sandbox',mode==='plan'?'read-only':'workspace-write','-c','sandbox_workspace_write.network_access=true',...(mode==='implement'?['--add-dir','/home/agent/repos','--add-dir','/home/agent/evidence']:[]),'-c','mcp_servers.robos_chat.command="node"','-c','mcp_servers.robos_chat.args=["/home/agent/robos-chat.js","--mcp"]',...(model?['-m',model]:[]),'-'];
}
function agySettings(mode){return {permissions:{allow:['read_file(/home/agent)','command(*)','mcp(robos_chat/*)',...(mode==='implement'?['write_file(/home/agent/repos)','write_file(/home/agent/evidence)']:[])]},trustedWorkspaces:['/home/agent/repos']};}
module.exports={...catalog,args,agySettings};
