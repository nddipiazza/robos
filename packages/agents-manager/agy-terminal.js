'use strict';
const fs=require('node:fs'),os=require('node:os');
function invocation(binary,id,extraArgs=[],cwd){
 const allowed=new Set(['--model','--effort','--mode','--sandbox','--agent','--project','--add-dir']);
 const args=[binary];
 for(let i=0;i<extraArgs.length;i++){
  const flag=extraArgs[i];if(!allowed.has(flag))throw Error('Unsupported AGY launch flag: '+flag);
  args.push(flag);if(flag==='--sandbox')continue;
  const value=extraArgs[++i];if(typeof value!=='string'||!value.trim()||value.startsWith('--'))throw Error('Missing value for '+flag);args.push(value);
 }
 if(id&&id!=='new')args.push('--conversation',String(id));
 const target=typeof cwd==='string'&&cwd.trim()?cwd.trim():os.homedir();if(!fs.statSync(target).isDirectory())throw Error('Working directory is not a directory.');
 return {cwd:target,args,script:'"$@"; result=$?; if [ "$result" -ne 0 ]; then printf "\\nAGY exited %s.\\n" "$result"; fi; read -r -p "Press Enter to close..."'};
}
module.exports={invocation};
