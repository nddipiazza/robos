'use strict';
const fs=require('node:fs');
const core=require('../robos-agent-client/work-task/core');
const {progress}=require('../dev-central/work-progress');
function activity(urls){const result={};for(const url of (urls||[]).slice(0,200)){if(!/^https:\/\/github\.com\//.test(url))continue;core.identity(url);const state=core.read(url);result[url]={...progress(state),planApproved:require('../robos-agent-client/work-task/plan-approval').approved(state)};}return result;}
function stop(url,{read=core.read,save=core.save,kill=process.kill,platform=process.platform,command=pid=>fs.readFileSync('/proc/'+pid+'/cmdline','utf8').split('\0')}={}){
 core.identity(url);const state=read(url);if(!state.workerPid)return;
 if(platform==='linux'){const args=command(state.workerPid);if(!args.includes(url)||!args.some(arg=>arg.endsWith('/work-task/runner.js')))throw Error('This task no longer owns the recorded agent process. Refresh the task list.');}
 kill(state.workerPid,'SIGTERM');
 // Keep the worker registered until it finishes exporting, preventing a second launch.
 save(url,{phase:'stopped',error:'Stopping agent and preserving repository changes'});
}
module.exports={activity,stop};
