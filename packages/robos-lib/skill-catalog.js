'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function listSkills(){
 const builtin=require('../skills-manager/skills-data').BUILTIN_SKILLS;
 let custom=[];try{custom=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/robos/skills.json'),'utf8')).custom||[];}catch(e){if(e.code!=='ENOENT')throw Error('Could not read installed RobOS skills.');}
 const installed=[];const root=path.resolve(__dirname,'../../.agents/skills');
 if(fs.existsSync(root))for(const entry of fs.readdirSync(root,{withFileTypes:true})){const file=path.join(root,entry.name,'SKILL.md');if(!entry.isDirectory()||!fs.existsSync(file))continue;const text=fs.readFileSync(file,'utf8');const front=text.match(/^---\r?\n([\s\S]*?)\r?\n---/);const description=front?.[1].match(/^description:\s*([\s\S]*?)(?=\n[a-zA-Z_-]+:|$)/m)?.[1].replace(/^[>|]\s*/,'').replace(/\s+/g,' ').trim()||'';const name=front?.[1].match(/^name:\s*(.+)$/m)?.[1]?.trim()||entry.name;installed.push({id:'robos:'+entry.name,name,description,category:'RobOS workflows',source:'Installed SKILL.md',prompt:text});}
 return [...new Map([...builtin,...installed,...custom].filter(s=>s.id&&s.name).map(s=>[s.id,{id:s.id,name:s.name,description:s.description||'',category:s.category||'Other',source:s.source||'Installed',instructions:s.prompt||s.content||s.command||'',tags:s.tags||[]}])).values()].sort((a,b)=>a.name.localeCompare(b.name));
}
module.exports={listSkills};
