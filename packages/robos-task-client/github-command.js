'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createAdapter}=require('./index');
function resolveServer(settings,repo){
 const servers=(settings.task_servers||[]).filter(s=>s.type==='github');
 const matches=s=>(s.repos||[]).some(r=>`${r.org}/${r.repo}`.toLowerCase()===repo?.toLowerCase())||`${s.gh_org}/${s.gh_repo}`.toLowerCase()===repo?.toLowerCase();
 const server=servers.find(matches)||servers.find(s=>s.id===settings.active_task_server);
 if(!server)throw Error('Configure a GitHub task server in RobOS Task Servers.');
 return server;
}
async function runGitHub(args,options={}){
 if(!Array.isArray(args)||args.some(a=>typeof a!=='string'))throw Error('GitHub command requires string arguments.');
 const settings=options.settings||JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/robos/settings.json'),'utf8'));
 const pos=args.indexOf('--repo');
 const url=args.find(a=>/^https:\/\/[^/]+\/[^/]+\/[^/]+\/pull\//.test(a));
 const repo=pos>=0?args[pos+1]:url?new URL(url).pathname.split('/').slice(1,3).join('/'):options.repo;
 const server=resolveServer(settings,repo);
 return createAdapter(server).runGitHubCommand(args,options.execute,options.credentialEnv);
}
module.exports={resolveServer,runGitHub};
